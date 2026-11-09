// Dalle righe degli estratti conto alle proposte di movimenti:
// regole imparate, abbinamento dei trasferimenti, rimborsi, rate, doppioni e saldi di fine mese.

import {
  INTEREST_LABEL, activeLabels, balanceId, expenseParts, newId, sameName, subcategoryList, todayInRome,
  type Account, type Ledger, type Movement, type Mutation, type Rule,
} from "../ledger";
import { amortization, debtDetails, linkedRecurring, splitRepayment } from "../debts";
import { nextDate } from "../recurring";
import { describe, merchantKey, safeText, sameTokens, similarKeys, tokens, type Described } from "./text";
import type { BankProduct, BankRow, BankStatement } from "./statements";

export type ProposalType = "expense" | "income" | "transfer" | "repayment" | "skip";
export type Confidence = "rule" | "paired" | "auto" | "guess" | "skip";

export type Proposal = {
  id: string;
  productKey: string;
  file: string;
  row: BankRow;
  accountId: string;
  date: string;
  amount: number;           // valore assoluto in centesimi (dopo un eventuale rimborso)
  original: number;         // importo della riga, prima dei rimborsi
  incoming: boolean;
  title: string;
  key: string;
  text: string;
  ref: string;
  type: ProposalType;
  labelId: string;
  subcategory: string;
  otherAccountId: string;
  debtId: string;
  tags: string[];
  confidence: Confidence;
  note: string;
  include: boolean;
  edited?: boolean;
  /** Rimborso che riduce una spesa già nell'archivio. */
  reduces?: { movementId: string; amount: number };
  principal?: number;
  interest?: number;
};

export type ClassifyInput = {
  statements: BankStatement[];
  mapping: Record<string, string>;     // prodotto → conto
  ledger: Ledger;                      // con i conti nuovi (bozze) già inclusi
  cashAccountId: string;
};

// ---------------------------------------------------------------- utilità

/** Hash breve e stabile (FNV-1a 32 bit, due passate) per id di regole e impronte. */
export function shortHash(text: string) {
  let a = 0x811c9dc5;
  let b = 0x01000193 ^ 0x5bd1e995;
  for (let i = 0; i < text.length; i++) {
    const code = text.charCodeAt(i);
    a = Math.imul(a ^ code, 0x01000193) >>> 0;
    b = Math.imul(b ^ code, 0x5bd1e995) >>> 0;
  }
  return a.toString(36).padStart(7, "0") + b.toString(36).padStart(7, "0");
}

export function ruleId(mode: "key" | "contains", match: string) {
  return `r-${mode === "key" ? "k" : "c"}-${shortHash(match)}`;
}

function plain(text: string) {
  return text.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
}

function days(a: string, b: string) {
  return Math.abs(Date.parse(a + "T12:00:00Z") - Date.parse(b + "T12:00:00Z")) / 86_400_000;
}

function previousMonth(month: string) {
  const [year, value] = month.split("-").map(Number);
  return value === 1 ? `${year - 1}-12` : `${year}-${String(value - 1).padStart(2, "0")}`;
}

function nextMonth(month: string) {
  const [year, value] = month.split("-").map(Number);
  return value === 12 ? `${year + 1}-01` : `${year}-${String(value + 1).padStart(2, "0")}`;
}

// ---------------------------------------------------------------- categorie suggerite

const DICTIONARY: [RegExp, string, string][] = [
  [/\b(esselunga|lidl|ard discount|eurospin|conad|coop|ipercoop|carrefour|despar|interspar|eurospar|spar|penny|aldi|famila|deco|todis|tigre|crai|sigma|supermercato|supermercati|alimentari|market|minimarket|md discount|md|pam|iper|ortofrutta|macelleria|panificio|forno)\b/, "groceries", "Supermercato"],
  [/\b(just eat|justeat|glovo|deliveroo|uber eats)\b/, "out", "Da asporto"],
  [/\b(tabaccheria|tabaccherria|tabacchi|rivendita tabacchi)\b/, "other-expenses", "Tabacchi"],
  [/\b(bar|caffe|caffetteria|coffee|starbucks|coffeecapp|chiosco|gelato|gelateria|pasticceria|cornetteria)\b/, "out", "Bar"],
  [/\b(mcdonald'?s|mcdonalds|burger king|kfc|old wild west|roadhouse|pizzeria|pizza|sushi|kebab|ristorante|trattoria|osteria|panineria|paninoteca|rosticceria|focacceria|pub|birreria|bistrot|braceria|poke|hamburgeria|salato|magna)\b/, "out", "Ristorante"],
  [/\b(ryanair|easyjet|wizz|ita airways|volotea|vueling|aeroporto)\b/, "travel", "Biglietti"],
  [/\b(booking|airbnb|expedia|trivago|hotel|hostel|ostello|b&b|bnb|agoda)\b/, "travel", "Alloggio"],
  [/\b(trenitalia|italo|italotreno|etna trasporti|etna transporti|sais|autolinee|flixbus|itabus|marino bus|interbus|amt|atm|amts|mobilita|tper|cotral|taxi|freenow|free now|bus|metro)\b/, "transport", "Mezzi pubblici"],
  [/\b(eni|enilive|q8|tamoil|esso|api|ip|shell|totalenergies|carburante|carburanti|distributore|benzina)\b/, "transport", "Carburante"],
  [/\b(telepass|autostrade|parcheggio|easypark|mycicero|officina|gommista|revisione|carrozzeria|ricambi|autoricambi|moto|borrozzinomoto)\b/, "transport", "Auto"],
  [/\b(spotify\w*|netflix|disney|prime video|amazon prime|youtube|google one|icloud|apple com|playstation|xbox|steam|nintendo|dazn|now tv|sky|crunchyroll|google play|chatgpt|openai)\b/, "leisure", "Abbonamenti"],
  [/\b(ticketone|ticketmaster|vivaticket|eventbrite|cinema|uci|the space|teatro|museo|dice fm)\b/, "leisure", "Intrattenimento"],
  [/\b(palestra|gym|fitness|piscina|decathlon|sport)\b/, "leisure", "Sport"],
  [/\b(sisal|snai|bet365|betfair|domusbet|lottomatica|goldbet|eurobet|william hill|eplay24|planetwin|better|lotto|gratta)\b/, "leisure", "Giochi e scommesse"],
  [/\b(farmacia|parafarmacia|dentista|odontoiatr|medico|clinica|ospedale|ticket sanitario|laboratorio|analisi|ottica|ottico)\b/, "health", "Farmacia"],
  [/\b(foot locker|footlocker|scarpe|calzature|sneakers)\b/, "clothing", "Scarpe"],
  [/\b(zara|h&m|hm|bershka|pull bear|stradivarius|primark|ovs|nike|adidas|zalando|shein|uniqlo|kiabi|piazza italia|terranova|abbigliamento)\b/, "clothing", "Vestiti"],
  [/\b(parrucchiere|barbiere|barber|capelli|estetista)\b/, "other-expenses", "Cura personale"],
  [/\b(enel|plenitude|a2a|hera|iren|edison|acea|servizio elettrico|bolletta|bollette|tari|elettricita|luce|acqua)\b/, "housing", "Bollette"],
  [/\b(fastweb|tim|vodafone|windtre|wind tre|iliad|ho mobile|kena|very mobile|poste mobile|postemobile|tiscali|ricarica telefonica)\b/, "housing", "Internet"],
  [/\b(affitto|canone affitto|locazione)\b/, "housing", "Affitto"],
  [/\b(universita|unict|ersu|tasse universitarie|formez|pagopa)\b/, "fees", "Università"],
  [/\b(commissione|commissioni|canone|spese|imposta di bollo|bollo|spedizione)\b/, "fees", "Commissioni bancarie"],
  [/\b(amazon|ebay|aliexpress|temu|etsy|unieuro|mediaworld|euronics|gamivo|instant gaming)\b/, "other-expenses", "Acquisti online"],
];

const INCOME_DICTIONARY: [RegExp, string][] = [
  [/\b(stipendio|salary|retribuzione|emolumenti|cedolino|busta paga|paga)\b/, "work"],
  [/\b(borsa di studio|ersu)\b/, "scholarship"],
];

function suggestCategory(ledger: Ledger, text: string, incoming: boolean) {
  const value = plain(text);
  if (incoming) {
    for (const [pattern, labelId] of INCOME_DICTIONARY) {
      if (pattern.test(value) && ledger.labels.some((label) => label.id === labelId && !label.value.archived)) return { labelId, subcategory: "" };
    }
    return null;
  }
  for (const [pattern, labelId, subcategory] of DICTIONARY) {
    if (pattern.test(value) && ledger.labels.some((label) => label.id === labelId && !label.value.archived)) return { labelId, subcategory };
  }
  return null;
}

function fallbackLabel(ledger: Ledger, incoming: boolean) {
  const wanted = incoming ? "other-income" : "other-expenses";
  const list = activeLabels(ledger, incoming ? "income" : "expense");
  return list.find((label) => label.id === wanted)?.id ?? list[list.length - 1]?.id ?? wanted;
}

// ---------------------------------------------------------------- regole

function findRule(rules: Rule[], description: Described, raw: string) {
  const text = plain(`${raw} ${description.title}`);
  const contains = rules.filter((rule) => rule.value.mode === "contains" && text.includes(plain(rule.value.match)))
    .sort((a, b) => b.value.match.length - a.value.match.length)[0];
  if (contains) return contains;
  const exact = rules.find((rule) => rule.value.mode === "key" && rule.value.match === description.key);
  if (exact) return exact;
  // Controparte simile (es. regola su «spotify» e riga «spotify stockholm»): vince la più specifica.
  return rules.filter((rule) => rule.value.mode === "key" && similarKeys(rule.value.match, description.key))
    .sort((a, b) => b.value.match.length - a.value.match.length)[0];
}

// ---------------------------------------------------------------- motore

const DEPOSIT = /\b(deposit[io]|senza vincoli|savings|vault|salvadanai\w*)/;

const GENERIC_NAMES = new Set(["altro", "altri", "conto", "contanti", "cash", "carta", "banca"]);

type Work = Proposal & { described: Described; product: BankProduct; paired?: boolean };

function isHolder(name: string | undefined, holders: string[]) {
  return !!name && holders.some((holder) => sameTokens(holder, name));
}

function accountByName(accounts: Account[], text: string, except: string) {
  const words = tokens(text);
  return accounts.find((account) => account.id !== except && account.value.type !== "debt" && !account.value.archived
    && (() => { const name = tokens(account.value.name); return name.length > 0 && name.every((word) => words.includes(word)); })());
}

export function classify({ statements, mapping, ledger, cashAccountId }: ClassifyInput): Proposal[] {
  const accounts = ledger.accounts;
  const holders = [
    ...accounts.flatMap((account) => (account.value.bank?.holder ? [account.value.bank.holder] : [])),
    ...statements.flatMap((statement) => statement.products.flatMap((product) => (product.holder ? [product.holder] : []))),
  ];
  // Carte note: quelle salvate sui conti e quelle lette dagli estratti di questa importazione.
  const cards = new Map<string, string>();
  for (const account of accounts) for (const card of account.value.bank?.cards ?? []) cards.set(card, account.id);
  for (const statement of statements) for (const product of statement.products) {
    const accountId = mapping[product.key];
    if (accountId) for (const card of product.cards) cards.set(card, accountId);
  }
  const existingRefs = new Set([
    ...ledger.movements.flatMap(({ value }) => (value.origin ? [value.origin.ref] : [])),
    ...ledger.imports.flatMap((batch) => batch.value.seen ?? []),
  ]);
  // Storico: ultima scelta fatta per una controparte già importata.
  const history = new Map<string, Movement["value"]>();
  for (const { value } of ledger.movements) if (value.origin && !history.has(value.origin.key)) history.set(value.origin.key, value);

  const work: Work[] = [];
  for (const statement of statements) {
    for (const product of statement.products) {
      const accountId = mapping[product.key];
      if (!accountId) continue;
      const seen = new Map<string, number>();
      for (const row of product.rows) {
        const described = describe(row.raw, row.bankType);
        const base = `${product.key}|${row.date}|${row.amount}|${described.key}`;
        const count = seen.get(base) ?? 0;
        seen.set(base, count + 1);
        const ref = `${row.date}:${shortHash(`${base}|${count}`)}`;
        work.push({
          id: `${product.key}#${row.index}`, productKey: product.key, file: statement.file, row, accountId,
          date: row.date, amount: Math.abs(row.amount), original: Math.abs(row.amount), incoming: row.amount > 0,
          title: described.title, key: described.key, text: safeText(row.raw), ref,
          type: "skip", labelId: "", subcategory: "", otherAccountId: "", debtId: "", tags: [],
          confidence: "guess", note: "", include: true, described, product,
        });
        if (row.fee > 0) {
          work.push({
            id: `${product.key}#${row.index}-fee`, productKey: product.key, file: statement.file, row, accountId,
            date: row.date, amount: row.fee, original: row.fee, incoming: false, title: `Commissione · ${described.title}`.slice(0, 160),
            key: "commissione", text: safeText(row.raw), ref: `${row.date}:${shortHash(`${base}|${count}|fee`)}`,
            type: "skip", labelId: "", subcategory: "", otherAccountId: "", debtId: "", tags: [],
            confidence: "guess", note: "", include: true, described: { title: "Commissione", key: "commissione" }, product,
          });
        }
      }
    }
  }
  const open = (item: Work) => item.type === "skip" && !item.note;
  const skip = (item: Work, note: string, confidence: Confidence = "skip") => {
    item.type = "skip"; item.note = note; item.confidence = confidence; item.include = false;
  };

  // 1. Righe non contabilizzate e già importate.
  for (const item of work) {
    if (item.row.skip) skip(item, `Non importata: ${item.row.skip}.`);
    else if (existingRefs.has(item.ref)) skip(item, "Già vista in un’importazione precedente.");
  }

  // Note da aggiungere dopo la classificazione (la riga resta da classificare).
  const reducedNotes = new Map<Work, string>();

  // 2. Operazioni che si annullano (storni, canoni scontati, rimborsi totali) nello stesso conto.
  const byProduct = new Map<string, Work[]>();
  for (const item of work) if (open(item)) byProduct.set(item.productKey, [...(byProduct.get(item.productKey) ?? []), item]);
  for (const items of byProduct.values()) {
    for (const credit of items) {
      if (!open(credit) || !credit.incoming) continue;
      const cardPayment = (item: Work) => !!item.described.date || /carta|card/i.test(item.row.bankType);
      // Un accredito sulla carta (Fineco) o un bonifico da un negozio da cui hai comprato con la carta è un rimborso.
      const fromMerchant = !!credit.described.counterpart && credit.described.direction === "in" && !credit.described.self
        && !isHolder(credit.described.counterpart, holders)
        && items.some((debit) => !debit.incoming && cardPayment(debit) && days(debit.date, credit.date) <= 90 && similarKeys(debit.key, merchantKey(credit.described.counterpart!)));
      const refundLike = credit.described.refund || /^(rimborso|storno|sconto)/i.test(credit.title) || (!!credit.described.date && credit.incoming) || fromMerchant;
      const creditWords = tokens(credit.title.replace(/^(rimborso( da)?|storno|sconto|bonifico da|refund|reso)\s+/i, ""));
      const deposit = (item: Work) => DEPOSIT.test(item.described.key);
      const candidates = items.filter((debit) => open(debit) && !debit.incoming && debit !== credit && days(debit.date, credit.date) <= (refundLike ? 90 : 5)
        && (!fromMerchant || cardPayment(debit)));
      const related = (debit: Work) => {
        if (debit.key === credit.key) return true;
        // Soldi spostati nel deposito e ripresi: si annullano.
        if (deposit(debit) && deposit(credit)) return true;
        if (!refundLike) return false;
        const words = tokens(debit.title);
        const shared = words.filter((word) => creditWords.includes(word)).length;
        return shared >= 2 || (words.length > 0 && words.every((word) => creditWords.includes(word))) || (creditWords.length > 0 && shared === creditWords.length);
      };
      const exact = candidates.filter((debit) => debit.amount === credit.amount && related(debit))
        .sort((a, b) => days(a.date, credit.date) - days(b.date, credit.date))[0];
      if (exact) {
        skip(exact, `Si annulla con «${credit.title}» del ${credit.date.split("-").reverse().join("/")}.`);
        skip(credit, refundLike ? `Rimborso di «${exact.title}» del ${exact.date.split("-").reverse().join("/")}: si annullano.` : `Annulla «${exact.title}» del ${exact.date.split("-").reverse().join("/")}.`);
        continue;
      }
      if (!refundLike) continue;
      const partial = candidates.filter((debit) => debit.amount > credit.amount && related(debit))
        .sort((a, b) => days(a.date, credit.date) - days(b.date, credit.date))[0];
      if (partial) {
        partial.amount -= credit.amount;
        reducedNotes.set(partial, `Ridotta di ${(credit.amount / 100).toFixed(2).replace(".", ",")} € dal rimborso del ${credit.date.split("-").reverse().join("/")}.`);
        skip(credit, `Rimborso: riduce «${partial.title}» del ${partial.date.split("-").reverse().join("/")}.`);
      }
    }
  }

  // 3. Rimborsi di spese già nell'archivio.
  const reducedBefore = new Set<string>();
  for (const item of work) {
    if (!open(item) || !item.incoming || !(item.described.refund || /^(rimborso|storno)/i.test(item.title))) continue;
    const words = tokens(item.title.replace(/^(rimborso( da)?|storno|refund|reso)\s+/i, ""));
    const target = ledger.movements.find(({ id, value }) => value.type === "expense" && !value.parts && value.accountId === item.accountId && !reducedBefore.has(id)
      && value.amount > item.amount && days(value.date, item.date) <= 90
      && (() => { const other = tokens(value.origin?.key ?? value.title); return other.length > 0 && other.every((word) => words.includes(word)); })());
    if (target) {
      reducedBefore.add(target.id);
      skip(item, `Rimborso: riduce «${target.value.title}» del ${target.value.date.split("-").reverse().join("/")} già registrata.`, "auto");
      item.include = true;
      item.reduces = { movementId: target.id, amount: item.amount };
    }
  }

  // 4. Classificazione: regole, struttura dell'operazione, storico, dizionario.
  const rules = ledger.rules;
  const receivables = accounts.filter((account) => account.value.type === "receivable" && !account.value.archived);
  for (const item of work) {
    if (!open(item)) continue;
    const { described } = item;
    const rule = findRule(rules, described, item.row.raw);
    if (rule) {
      applyRule(item, rule, ledger);
      continue;
    }
    // Trasferimenti tra prodotti dello stesso conto Revolut (deposito, salvadanai).
    if (DEPOSIT.test(described.key) && item.product.bank === "Revolut") {
      const other = Object.entries(mapping).find(([key, accountId]) => key.startsWith("revolut:") && key !== item.productKey && accountId !== item.accountId);
      setTransfer(item, other?.[1] ?? "", "auto", "Spostamento tra i conti Revolut.");
      continue;
    }
    if (described.cash) {
      setTransfer(item, cashAccountId, "auto", "Prelievo: passa nei contanti.");
      continue;
    }
    if (described.card) {
      const owner = cards.get(described.card);
      if (owner && owner !== item.accountId) { setTransfer(item, owner, "auto", `Ricarica dalla carta *${described.card} del conto collegato.`); continue; }
    }
    if (described.self || (described.counterpart && isHolder(described.counterpart, holders))) {
      const byBank = described.bank ? accountByName(accounts, described.bank, item.accountId) : undefined;
      if (byBank) { setTransfer(item, byBank.id, "auto", `Bonifico tra conti tuoi (${item.incoming ? "da" : "verso"} ${byBank.value.name}).`); continue; }
      // Se in questa importazione c'è un solo conto di un'altra banca, è probabilmente quello.
      const others = [...new Set(statements.flatMap((statement) => statement.products)
        .filter((product) => product.bank !== item.product.bank && mapping[product.key])
        .map((product) => mapping[product.key]))];
      const guess = others.length === 1 ? accounts.find((account) => account.id === others[0]) : undefined;
      setTransfer(item, guess?.id ?? "", "guess", guess ? `Bonifico tra conti tuoi: proposto ${guess.value.name}, controlla.` : "Bonifico tra conti tuoi: scegli l’altro conto.");
      if (guess) item.confidence = "guess";
      continue;
    }
    if (!item.incoming) {
      // Pagamento con carta verso un tuo conto (es. «Revolut Dublin» su Fineco = ricarica di Revolut).
      const ownAccount = accounts.find((account) => account.id !== item.accountId && ["cash", "asset", "investment"].includes(account.value.type) && !account.value.archived
        && !GENERIC_NAMES.has(plain(account.value.name)) && tokens(account.value.name).length > 0
        && tokens(described.title).slice(0, tokens(account.value.name).length).join(" ") === tokens(account.value.name).join(" "));
      if (ownAccount) { setTransfer(item, ownAccount.id, "auto", `Ricarica di ${ownAccount.value.name}.`); continue; }
    }
    // Restituzione di un credito: arriva un pagamento da chi ti deve dei soldi.
    if (item.incoming && described.counterpart) {
      const credit = receivables.find((account) => { const name = tokens(account.value.name); return name.length > 0 && name.every((word) => tokens(described.counterpart!).includes(word)); });
      if (credit) { setTransfer(item, credit.id, "guess", `Forse ${credit.value.name} ti restituisce il prestito.`); continue; }
    }
    // Rata di un finanziamento: stesso importo e data vicina a una scadenza.
    if (!item.incoming) {
      const debt = matchInstallment(ledger, item);
      if (debt) {
        item.type = "repayment"; item.debtId = debt.id; item.confidence = "auto"; item.note = `Rata di «${debt.value.name}».`;
        continue;
      }
    }
    const past = history.get(described.key);
    if (past && past.type !== "repayment") {
      fromHistory(item, past, ledger);
      continue;
    }
    if (described.card && !item.incoming) {
      // spesa con carta: dizionario sotto
    }
    const suggestion = suggestCategory(ledger, `${described.title} ${item.row.bankType}`, item.incoming);
    item.type = item.incoming ? "income" : "expense";
    if (!item.incoming && /\b(klarna|klar|scalapay|paypal pay in|pagolight|soisy|heylight)\b/.test(plain(described.title))) {
      item.labelId = fallbackLabel(ledger, false); item.confidence = "guess";
      item.note = "Rata di un acquisto a rate: se l’hai registrato in Debiti scegli Rata, altrimenti la categoria di quello che hai comprato.";
      continue;
    }
    if (suggestion) {
      item.labelId = suggestion.labelId; item.subcategory = item.incoming ? "" : suggestion.subcategory;
      item.confidence = "auto"; item.note = "Categoria suggerita.";
    } else {
      item.labelId = fallbackLabel(ledger, item.incoming); item.confidence = "guess";
      item.note = described.card ? `Ricarica dalla carta *${described.card}: se è una tua carta scegli Trasferimento.` : "Da controllare.";
    }
  }

  for (const [item, note] of reducedNotes) item.note = item.note && item.note !== "Categoria suggerita." ? `${note} ${item.note}` : note;

  // 5. Trasferimenti: la stessa operazione vista dai due conti diventa un solo movimento.
  const transfers = work.filter((item) => item.type === "transfer" && item.include);
  for (const item of transfers) {
    if (item.paired || !item.include) continue;
    const candidates = work.filter((other) => other !== item && other.include && !other.paired && other.accountId !== item.accountId
      && other.incoming !== item.incoming && other.amount === item.amount && days(other.date, item.date) <= 4
      && (item.otherAccountId ? other.accountId === item.otherAccountId : true)
      && (other.type === "transfer" ? (!other.otherAccountId || other.otherAccountId === item.accountId) : other.confidence !== "rule" && other.type !== "repayment"))
      .sort((a, b) => days(a.date, item.date) - days(b.date, item.date));
    const other = candidates[0];
    if (!other) continue;
    item.otherAccountId = other.accountId;
    item.paired = true; other.paired = true;
    if (item.confidence === "guess") item.confidence = "paired";
    item.note = `Abbinato con il movimento di ${accounts.find((account) => account.id === other.accountId)?.value.name ?? "un altro conto"} del ${other.date.split("-").reverse().join("/")}.`;
    if (item.confidence !== "rule") item.confidence = "paired";
    skip(other, `Stesso trasferimento già proposto da ${accounts.find((account) => account.id === item.accountId)?.value.name ?? "l’altro conto"}.`, "paired");
  }
  // Trasferimenti già registrati (importati prima dall'altra banca o inseriti a mano).
  const usedExisting = new Set<string>();
  for (const item of work) {
    if (item.type !== "transfer" || !item.include || !item.otherAccountId || item.paired) continue;
    const from = item.incoming ? item.otherAccountId : item.accountId;
    const to = item.incoming ? item.accountId : item.otherAccountId;
    const found = ledger.movements.find(({ id, value }) => !usedExisting.has(id) && value.type === "transfer" && value.accountId === from && value.toAccountId === to
      && value.amount === item.amount && days(value.date, item.date) <= 4);
    if (found) { usedExisting.add(found.id); skip(item, `Già registrato come trasferimento del ${found.value.date.split("-").reverse().join("/")}.`, "paired"); }
  }

  // 6. Probabili doppioni di movimenti inseriti a mano.
  const manual = ledger.movements.filter(({ value }) => !value.origin);
  const usedManual = new Set<string>();
  for (const item of work) {
    if (item.type === "skip" || !item.include) continue;
    const match = manual.find(({ id, value }) => !usedManual.has(id) && value.amount === item.original && days(value.date, item.date) <= 3
      && (value.accountId === item.accountId || (value.type === "transfer" && value.toAccountId === item.accountId))
      && (value.type === "income" || (value.type === "transfer" && value.toAccountId === item.accountId)) === item.incoming);
    if (match) {
      usedManual.add(match.id);
      item.include = false;
      item.confidence = "guess";
      item.note = `Forse l’hai già inserito a mano: «${match.value.title}» del ${match.value.date.split("-").reverse().join("/")}. Spunta per importarlo comunque.`;
    }
  }

  // 7. Rate: divisione capitale/interessi in ordine di data, come se fossero già registrate.
  computeSplits(work, ledger);

  return work.map(({ described: _d, product: _p, paired: _x, ...proposal }) => proposal);
}

function setTransfer(item: Proposal, otherAccountId: string, confidence: Confidence, note: string) {
  item.type = "transfer"; item.otherAccountId = otherAccountId; item.confidence = otherAccountId ? confidence : "guess"; item.note = note;
}

function applyRule(item: Proposal, rule: Rule, ledger: Ledger) {
  const value = rule.value;
  item.confidence = "rule";
  item.note = value.mode === "contains" ? `Regola: contiene «${value.match}».` : "Regola imparata dalle tue scelte.";
  if (value.title) item.title = value.title;
  if (value.tags?.length) item.tags = [...value.tags];
  if (value.type === "ignore") { item.type = "skip"; item.include = false; item.note = value.mode === "contains" ? `Ignorata dalla regola «${value.match}».` : "Ignorata come le altre volte."; item.confidence = "rule"; return; }
  if (value.type === "transfer") { item.type = "transfer"; item.otherAccountId = value.accountId && ledger.accounts.some((account) => account.id === value.accountId) ? value.accountId : ""; if (!item.otherAccountId) item.confidence = "guess"; return; }
  if (value.type === "repayment" && value.debtId && ledger.accounts.some((account) => account.id === value.debtId) && !item.incoming) { item.type = "repayment"; item.debtId = value.debtId; return; }
  const incoming = item.incoming;
  // Una regola di spesa su un'entrata (o viceversa) vale solo come suggerimento.
  if ((value.type === "income") !== incoming || value.type === "repayment") {
    item.type = incoming ? "income" : "expense";
    item.labelId = fallbackLabel(ledger, incoming);
    item.confidence = "guess";
    item.note = "Di solito questa controparte è un’altra cosa: controlla.";
    return;
  }
  item.type = value.type as "income" | "expense";
  const label = ledger.labels.find((entry) => entry.id === value.labelId && entry.value.type === (incoming ? "income" : "expense"));
  item.labelId = label?.id ?? fallbackLabel(ledger, incoming);
  item.subcategory = !incoming && label ? value.subcategory ?? "" : "";
}

function fromHistory(item: Proposal, past: Movement["value"], ledger: Ledger) {
  item.confidence = "auto";
  item.note = "Come l’ultima volta.";
  if (past.type === "transfer") {
    const other = past.accountId === item.accountId ? past.toAccountId : past.accountId;
    setTransfer(item, other, "auto", "Come l’ultima volta.");
    return;
  }
  if (past.type === "repayment") return;
  if ((past.type === "income") !== item.incoming) {
    item.type = item.incoming ? "income" : "expense";
    item.labelId = fallbackLabel(ledger, item.incoming);
    item.confidence = "guess";
    item.note = "Da controllare.";
    return;
  }
  item.type = past.type;
  item.labelId = past.labelId;
  item.subcategory = past.type === "expense" ? (expenseParts(past)[0]?.subcategory ?? "") : "";
  if (past.tags?.length) item.tags = [...past.tags];
}

function matchInstallment(ledger: Ledger, item: Proposal): Account | undefined {
  return ledger.accounts.find((account) => {
    const details = debtDetails(account);
    if (!details || details.kind !== "loan" || account.value.archived) return false;
    if (details.accountId && details.accountId !== item.accountId) return false;
    if (Math.abs(details.installment - item.amount) > 1) return false;
    const recurring = linkedRecurring(ledger, account.id);
    const due = recurring ? nextDate(recurring.value.schedule) : null;
    if (due && days(due, item.date) <= 7) return true;
    return amortization(details).some((row) => row.date && days(row.date, item.date) <= 7);
  });
}

/** Calcola capitale e interessi delle rate proposte, una dopo l'altra. */
export function computeSplits(items: Proposal[], ledger: Ledger) {
  const extra: Movement[] = [];
  for (const item of [...items].sort((a, b) => a.date.localeCompare(b.date))) {
    if (item.type !== "repayment" || !item.include) continue;
    const debt = ledger.accounts.find((account) => account.id === item.debtId);
    if (!debt) continue;
    const view = extra.length ? { ...ledger, movements: [...ledger.movements, ...extra] } : ledger;
    const split = splitRepayment(view, debt, item.date, item.amount);
    item.principal = split.principal;
    item.interest = split.interest;
    extra.push({ kind: "movement", id: item.id.replace(/[^a-zA-Z0-9_-]/g, "-").slice(0, 64), version: null, value: {
      type: "repayment", date: item.date, title: item.title, amount: item.amount, principal: split.principal, interest: split.interest,
      debtId: debt.id, accountId: item.accountId, labelId: INTEREST_LABEL, notes: "",
    } });
  }
}

// ---------------------------------------------------------------- saldi di fine mese

export type MonthBalance = { accountId: string; month: string; amount: number; before: boolean };

/**
 * Saldo a fine mese per ogni mese coperto dal file: saldo finale meno i movimenti con data successiva.
 * Così è coerente con le date usate per i movimenti (anche quando la banca contabilizza giorni dopo).
 */
export function monthlyBalances(statements: BankStatement[], mapping: Record<string, string>, debtAccounts: Set<string>, today = todayInRome()): MonthBalance[] {
  const current = today.slice(0, 7);
  const result: MonthBalance[] = [];
  for (const statement of statements) {
    for (const product of statement.products) {
      const accountId = mapping[product.key];
      if (!accountId || product.finalBalance === null || debtAccounts.has(accountId)) continue;
      const rows = product.rows.filter((row) => !row.skip);
      if (!rows.length) continue;
      const months = rows.map((row) => row.date.slice(0, 7)).sort();
      const first = months[0];
      const lastDate = [...rows.map((row) => row.date), ...rows.map((row) => (row.completed ?? row.date).slice(0, 10))].sort().at(-1)!;
      const last = lastDate.slice(0, 7);
      const at = (end: string) => product.finalBalance! - rows.filter((row) => row.date.slice(0, 7) > end).reduce((sum, row) => sum + row.amount - row.fee, 0);
      // Solo i mesi già finiti: il saldo di fine mese del mese in corso cambierà ancora.
      let written = 0;
      for (let month = first; month <= last && month < current; month = nextMonth(month)) {
        result.push({ accountId, month, amount: at(month), before: false });
        written++;
      }
      // File che copre solo il mese in corso: si parte dal saldo di fine del mese prima.
      if (!written) result.push({ accountId, month: previousMonth(first), amount: at(previousMonth(first)), before: true });
    }
  }
  return result;
}

/** Saldi da scrivere davvero: nuovi o diversi da quelli già registrati. */
export function plannedBalances(statements: BankStatement[], mapping: Record<string, string>, ledger: Ledger) {
  const debts = new Set(ledger.accounts.filter((account) => account.value.type === "debt").map((account) => account.id));
  return monthlyBalances(statements, mapping, debts).flatMap((item) => {
    const id = balanceId(item.accountId, item.month);
    const existing = ledger.balances.find((balance) => balance.id === id);
    if (existing && existing.value.amount === item.amount) return [];
    // Il mese prima del file si scrive solo se manca: il file non lo conosce del tutto.
    if (item.before && (existing || ledger.balances.some((balance) => balance.value.accountId === item.accountId && balance.value.month < item.month))) return [];
    return [{ ...item, id, existing }];
  });
}

// ---------------------------------------------------------------- conti dei file

const MAIN_PRODUCT = /^(attuale|current|conto|corrente)$/i;

/** Conto proposto per ogni prodotto: già collegato, con lo stesso nome, oppure un conto nuovo. */
export function initialMapping(statements: BankStatement[], ledger: Ledger) {
  const mapping: Record<string, string> = {};
  const drafts: Account[] = [];
  for (const statement of statements) {
    for (const product of statement.products) {
      const linked = ledger.accounts.find((account) => account.value.bank?.keys.includes(product.key) && !account.value.archived);
      if (linked) { mapping[product.key] = linked.id; continue; }
      // Un deposito o salvadanaio vuoto, con movimenti che si annullano, non serve come conto a parte.
      const rows = product.rows.filter((row) => !row.skip);
      const secondary = product.key.includes(":") && product.bank === "Revolut" && !MAIN_PRODUCT.test(product.key.split(":")[1].replace(/-/g, " "));
      if (secondary && !product.finalBalance && rows.reduce((sum, row) => sum + row.amount, 0) === 0) { mapping[product.key] = ""; continue; }
      const named = ledger.accounts.find((account) => sameName(account.value.name, product.suggestedName) && account.value.type !== "debt" && !account.value.archived);
      if (named) { mapping[product.key] = named.id; continue; }
      const draft: Account = { kind: "account", id: newId(), version: null, value: { name: product.suggestedName, type: "cash" } };
      drafts.push(draft);
      mapping[product.key] = draft.id;
    }
  }
  if (!ledger.accounts.some((account) => /^(contanti|cash)$/i.test(account.value.name.trim()))) {
    drafts.push({ kind: "account", id: newId(), version: null, value: { name: "Contanti", type: "cash" } });
  }
  return { mapping, drafts };
}

// ---------------------------------------------------------------- scritture

export type CommitInput = {
  proposals: Proposal[];
  statements: BankStatement[];
  mapping: Record<string, string>;
  ledger: Ledger;                 // archivio attuale (senza bozze)
  draftAccounts: Account[];       // conti nuovi da creare se usati
  draftLabels: Ledger["labels"];  // categorie nuove create nell'anteprima
  learn: boolean;
  balances: boolean;
};

export type CommitPlan = { mutations: Mutation[]; movements: number; balances: number; rules: number; batchId: string; accounts: string[] };

export function buildCommit(input: CommitInput): CommitPlan {
  const { proposals, statements, mapping, ledger, draftAccounts, draftLabels, learn } = input;
  const batchId = newId();
  const today = todayInRome();
  const mutations: Mutation[] = [];
  const included = proposals.filter((item) => item.include && item.type !== "skip");
  const accountsAll = [...ledger.accounts, ...draftAccounts];
  const fullLedger = { ...ledger, accounts: accountsAll, labels: [...ledger.labels, ...draftLabels] };
  computeSplits(included, fullLedger);

  // Conti usati: bozze da creare e collegamenti alla banca (carte, prodotti, intestatario).
  const usedAccounts = new Set<string>();
  for (const item of included) { usedAccounts.add(item.accountId); if (item.type === "transfer") usedAccounts.add(item.otherAccountId); }
  for (const accountId of Object.values(mapping)) usedAccounts.add(accountId);
  const created: string[] = [];
  const linked = new Map<string, Account>();
  for (const statement of statements) {
    for (const product of statement.products) {
      const accountId = mapping[product.key];
      if (!accountId) continue;
      const account = linked.get(accountId) ?? accountsAll.find((item) => item.id === accountId);
      if (!account) continue;
      const bank = account.value.bank ?? { keys: [], cards: [] };
      const next: Account = { ...account, value: { ...account.value, bank: {
        keys: [...new Set([...bank.keys, product.key])].slice(0, 10),
        cards: [...new Set([...bank.cards, ...product.cards])].slice(0, 10),
        ...(product.holder || bank.holder ? { holder: product.holder ?? bank.holder } : {}),
      } } };
      linked.set(accountId, next);
    }
  }
  for (const account of draftAccounts) {
    if (!usedAccounts.has(account.id)) continue;
    created.push(account.id);
    mutations.push({ op: "save", record: linked.get(account.id) ?? account });
    linked.delete(account.id);
  }
  for (const account of linked.values()) mutations.push({ op: "save", record: account });

  // Categorie nuove e sottocategorie da aggiungere agli elenchi.
  const usedLabels = new Set(included.map((item) => item.labelId));
  for (const label of draftLabels) if (usedLabels.has(label.id)) mutations.push({ op: "save", record: label });
  const lists = new Map<string, string[]>();
  for (const item of included) {
    if (item.type !== "expense" || !item.subcategory) continue;
    const list = lists.get(item.labelId) ?? subcategoryList(fullLedger, item.labelId);
    const found = list.find((name) => sameName(name, item.subcategory));
    if (found) item.subcategory = found; else if (list.length < 60) list.push(item.subcategory);
    lists.set(item.labelId, list);
  }
  for (const [labelId, list] of lists) {
    const label = fullLedger.labels.find((item) => item.id === labelId);
    const before = subcategoryList(fullLedger, labelId);
    if (label && list.length !== before.length) {
      const draft = mutations.find((action) => action.op === "save" && action.record.kind === "label" && action.record.id === labelId);
      if (draft && draft.op === "save" && draft.record.kind === "label") draft.record = { ...draft.record, value: { ...draft.record.value, subcategories: list } };
      else mutations.push({ op: "save", record: { ...label, value: { ...label.value, subcategories: list } } });
    }
  }

  // Movimenti.
  const known = new Set([...ledger.movements.flatMap(({ value }) => (value.origin ? [value.origin.ref] : [])), ...ledger.imports.flatMap((batch) => batch.value.seen ?? [])]);
  const written = new Set<string>();
  let movementCount = 0;
  const updates: { id: string; previous: number }[] = [];
  const recurringDone = new Map<string, number>();
  for (const item of proposals) {
    if (!item.include) continue;
    if (item.reduces) {
      const target = ledger.movements.find((movement) => movement.id === item.reduces!.movementId);
      if (target && target.value.type === "expense" && target.value.amount > item.reduces.amount) {
        updates.push({ id: target.id, previous: target.value.amount });
        mutations.push({ op: "save", record: { ...target, value: { ...target.value, amount: target.value.amount - item.reduces.amount } } });
      }
      continue;
    }
    if (item.type === "skip") continue;
    const origin = { batch: batchId, key: item.key.slice(0, 120), ref: item.ref.slice(0, 80), text: item.text.slice(0, 300) };
    const common = { date: item.date, title: item.title.trim().slice(0, 160) || "Movimento", amount: item.amount, notes: "", origin, ...(item.tags.length ? { tags: item.tags.slice(0, 10) } : {}) };
    let value: Movement["value"] | null = null;
    if (item.type === "transfer") {
      if (!item.otherAccountId || item.otherAccountId === item.accountId) continue;
      value = { ...common, type: "transfer", accountId: item.incoming ? item.otherAccountId : item.accountId, toAccountId: item.incoming ? item.accountId : item.otherAccountId };
    } else if (item.type === "repayment") {
      const debt = accountsAll.find((account) => account.id === item.debtId);
      if (!debt || item.principal === undefined || item.interest === undefined) continue;
      const details = debtDetails(debt);
      value = { ...common, type: "repayment", debtId: debt.id, accountId: item.accountId, principal: item.principal, interest: item.interest,
        labelId: details?.kind === "loan" ? details.interestLabelId : INTEREST_LABEL };
      const recurring = linkedRecurring(ledger, debt.id);
      if (recurring) {
        const done = recurringDone.get(recurring.id) ?? recurring.value.schedule.done;
        const due = nextDate({ ...recurring.value.schedule, done });
        if (due && due.slice(0, 7) === item.date.slice(0, 7)) recurringDone.set(recurring.id, done + 1);
      }
    } else if (item.type === "expense") {
      value = { ...common, type: "expense", accountId: item.accountId, labelId: item.labelId, subcategory: item.subcategory, method: item.text.includes("Carta") || item.row.bankType.toLowerCase().includes("carta") ? "Carta" : "" };
    } else {
      value = { ...common, type: "income", accountId: item.accountId, labelId: item.labelId };
    }
    mutations.push({ op: "save", record: { kind: "movement", id: newId(), version: null, value } });
    written.add(item.id);
    movementCount++;
  }
  const seen = [...new Set(proposals.filter((item) => !item.row.skip && !written.has(item.id) && !known.has(item.ref)).map((item) => item.ref))];
  for (const [id, done] of recurringDone) {
    const recurring = ledger.recurring.find((item) => item.id === id);
    if (recurring) mutations.push({ op: "save", record: { ...recurring, value: { ...recurring.value, schedule: { ...recurring.value.schedule, done } } } });
  }

  // Saldi di fine mese dal file.
  const balanceChanges: { id: string; previous: number | null }[] = [];
  if (input.balances) {
    for (const item of plannedBalances(statements, mapping, fullLedger)) {
      balanceChanges.push({ id: item.id, previous: item.existing?.value.amount ?? null });
      mutations.push({ op: "save", record: { kind: "balance", id: item.id, version: item.existing?.version ?? null, value: { accountId: item.accountId, month: item.month, amount: item.amount } } });
    }
  }

  // Regole: le scelte fatte nell'anteprima valgono per le prossime importazioni.
  let ruleCount = 0;
  if (learn) {
    const byKey = new Map<string, Proposal>();
    for (const item of proposals) if (item.edited && item.key && (item.include || item.type === "skip")) byKey.set(item.key, item);
    for (const [key, item] of byKey) {
      if (key.length < 2) continue;
      const id = ruleId("key", key);
      const existing = ledger.rules.find((rule) => rule.id === id);
      const value: Rule["value"] = { match: key, mode: "key", type: item.type === "skip" ? "ignore" : item.type, learned: true };
      if (item.type === "expense" || item.type === "income") { value.labelId = item.labelId; if (item.type === "expense" && item.subcategory) value.subcategory = item.subcategory; }
      if (item.type === "transfer" && item.otherAccountId) value.accountId = item.otherAccountId;
      if (item.type === "repayment" && item.debtId) value.debtId = item.debtId;
      if (item.tags.length) value.tags = item.tags.slice(0, 10);
      mutations.push({ op: "save", record: { kind: "rule", id, version: existing?.version ?? null, value } });
      ruleCount++;
    }
  }

  const files = [...new Set(statements.map((statement) => statement.file))].join(", ").slice(0, 200);
  mutations.push({ op: "save", record: { kind: "import", id: batchId, version: null, value: {
    file: files, at: today, movements: movementCount, balances: balanceChanges.slice(0, 600), updates: updates.slice(0, 300), accounts: created.slice(0, 20),
    ...(seen.length ? { seen: seen.slice(0, 5000) } : {}),
  } } });
  return { mutations, movements: movementCount, balances: balanceChanges.length, rules: ruleCount, batchId, accounts: created };
}

/** Scritture per annullare un'importazione: toglie i movimenti, ripristina saldi e spese ridotte. */
export function undoImport(ledger: Ledger, batchId: string): Mutation[] {
  const batch = ledger.imports.find((item) => item.id === batchId);
  if (!batch) return [];
  const blank = "00000000-0000-4000-8000-000000000000";
  const mutations: Mutation[] = [];
  const removedMovements = new Set<string>();
  for (const movement of ledger.movements) {
    if (movement.value.origin?.batch !== batchId) continue;
    removedMovements.add(movement.id);
    mutations.push({ op: "delete", kind: "movement", id: movement.id, version: movement.version ?? blank });
  }
  for (const change of batch.value.balances) {
    const current = ledger.balances.find((balance) => balance.id === change.id);
    if (!current) continue;
    if (change.previous === null) mutations.push({ op: "delete", kind: "balance", id: current.id, version: current.version ?? blank });
    else mutations.push({ op: "save", record: { ...current, value: { ...current.value, amount: change.previous } } });
  }
  for (const update of batch.value.updates) {
    const current = ledger.movements.find((movement) => movement.id === update.id);
    if (current) mutations.push({ op: "save", record: { ...current, value: { ...current.value, amount: update.previous } } });
  }
  for (const accountId of batch.value.accounts) {
    const account = ledger.accounts.find((item) => item.id === accountId);
    if (!account) continue;
    const stillUsed = ledger.movements.some(({ id, value }) => !removedMovements.has(id) && (value.accountId === accountId || (value.type === "transfer" && value.toAccountId === accountId)))
      || ledger.balances.some((balance) => balance.value.accountId === accountId && !batch.value.balances.some((change) => change.id === balance.id && change.previous === null));
    if (!stillUsed) mutations.push({ op: "delete", kind: "account", id: account.id, version: account.version ?? blank });
  }
  mutations.push({ op: "delete", kind: "import", id: batch.id, version: batch.version ?? blank });
  return mutations;
}

export function keyOf(text: string) {
  return merchantKey(text);
}

/**
 * Quando correggi un movimento importato, la correzione diventa la regola per quella controparte.
 * Le spese divise restano casi singoli.
 */
export function learnFromEdit(ledger: Ledger, before: Movement["value"], after: Movement["value"]): Mutation | null {
  const key = after.origin?.key;
  if (!key || key.length < 2 || (after.type === "expense" && after.parts)) return null;
  const signature = (value: Movement["value"]) => value.type === "transfer" ? `t:${value.accountId}>${value.toAccountId}`
    : value.type === "repayment" ? `r:${value.debtId}` : `${value.type}:${value.labelId}:${value.type === "expense" ? value.subcategory : ""}`;
  if (signature(before) === signature(after) && (before.tags ?? []).join("|") === (after.tags ?? []).join("|")) return null;
  const value: Rule["value"] = { match: key, mode: "key", type: after.type, learned: true };
  if (after.type === "expense" || after.type === "income") {
    value.labelId = after.labelId;
    if (after.type === "expense" && after.subcategory) value.subcategory = after.subcategory;
  } else if (after.type === "transfer") {
    const linked = (id: string) => !!ledger.accounts.find((account) => account.id === id)?.value.bank?.keys.length;
    const counterpart = linked(after.accountId) && !linked(after.toAccountId) ? after.toAccountId
      : linked(after.toAccountId) && !linked(after.accountId) ? after.accountId : null;
    if (!counterpart) return null;
    value.accountId = counterpart;
  } else {
    value.debtId = after.debtId;
  }
  if (after.tags?.length) value.tags = after.tags.slice(0, 10);
  const id = ruleId("key", key);
  const existing = ledger.rules.find((rule) => rule.id === id);
  return { op: "save", record: { kind: "rule", id, version: existing?.version ?? null, value } };
}
