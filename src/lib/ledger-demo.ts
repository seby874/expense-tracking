import {
  DEFAULT_LABELS, balanceId, deriveLedger, monthEnd, shiftMonth, todayInRome,
  type Account, type Deadline, type Label, type LedgerRecord, type Movement, type Person, type Recurring,
} from "./ledger";
import { defaultParams } from "./params";
import { validTaxCode } from "./people";
import { archiveActions } from "./archive";
import { occurrenceId } from "./recurring";

/*
 * Dati di esempio: 10 anni di storico fittizio, sempre uguale (generatore con seme fisso) e relativo all'anno
 * corrente, per vedere tutte le funzioni all'opera. Restano solo in memoria: niente Firestore.
 * Contengono anche qualche "problema" voluto per il controllo di salute (un doppione, una scadenza superata).
 */

function random(seed: number) {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Codice fiscale fittizio ma formalmente valido: si cerca il carattere di controllo giusto. */
function fakeTaxCode(base15: string) {
  for (let code = 65; code <= 90; code++) {
    const candidate = base15 + String.fromCharCode(code);
    if (validTaxCode(candidate)) return candidate;
  }
  return "";
}

const pad = (value: number) => String(value).padStart(2, "0");

export function sampleLedger(today = todayInRome()): LedgerRecord[] {
  const rand = random(20_160_101);
  const vary = (amount: number, spread = 0.15) => Math.max(100, Math.round(amount * (1 - spread + rand() * spread * 2)));
  const current = Number(today.slice(0, 4));
  const first = current - 9;
  const records: LedgerRecord[] = [];
  const movements: Movement[] = [];
  let counter = 0;
  const id = (prefix: string) => `demo-${prefix}-${++counter}`;
  const add = (value: Movement["value"], fixedId?: string) => {
    if (value.date > today) return;
    movements.push({ kind: "movement", id: fixedId ?? id("m"), version: null, value });
  };
  const nowMonth = today.slice(0, 7);

  // ---------------------------------------------------------------- Conti, categorie, familiari, impostazioni
  const accounts: Account[] = [
    { kind: "account", id: "fineco", version: null, value: { name: "Fineco", type: "cash", liquidity: { availability: "now" } } },
    { kind: "account", id: "revolut", version: null, value: { name: "Revolut", type: "cash" } },
    { kind: "account", id: "demo-deposit", version: null, value: {
      name: "Conto deposito", type: "cash", liquidity: { availability: "days", emergency: true },
      deposit: {
        kind: "free", bank: "Banca Deposito", credit: "quarterly",
        rates: [{ rate: 4, until: `${current - 3}-06-30` }, { rate: 2.5, until: "" }],
        lines: [{ id: "line1", amount: 1_000_000, start: `${shiftMonth(nowMonth, -4)}-01`, end: `${shiftMonth(nowMonth, 8)}-01`,
          rates: [{ rate: 3.2, until: "" }], credit: "maturity", early: "lose-interest" }],
      },
    } },
    { kind: "account", id: "demo-etf", version: null, value: { name: "ETF mondo (PAC)", type: "investment", invest: { assetClass: "equity", contributedBefore: 0 } } },
    { kind: "account", id: "demo-pension", version: null, value: { name: "Fondo pensione", type: "investment", invest: { assetClass: "pension", contributedBefore: 0 } } },
    { kind: "account", id: "demo-marco", version: null, value: { name: "Marco", type: "receivable", credit: { start: `${current - 1}-03-01`, note: "Anticipi per cene e viaggi" } } },
    { kind: "account", id: "demo-car-loan", version: null, value: { name: "Prestito auto", type: "debt", archived: true, debt: {
      kind: "loan", principal: 1_500_000, tan: 6, taeg: 7.1, months: 48, firstDate: `${first}-04-10`, installment: 35_227, fee: 0, paidBefore: 0,
      accountId: "fineco", interestLabelId: "interest", consumer: true } } },
    { kind: "account", id: "demo-mortgage", version: null, value: { name: "Mutuo casa", type: "debt", debt: {
      kind: "loan", principal: 18_000_000, tan: 4.5, taeg: 4.8, months: 300, firstDate: `${first + 2}-03-15`, installment: 90_000, fee: 0, paidBefore: 0,
      accountId: "fineco", interestLabelId: "interest", home: true, variable: true } } },
  ];
  const essentials = new Set(["housing", "groceries", "health", "transport"]);
  const labels: Label[] = DEFAULT_LABELS.map((label) => ({
    ...label, value: {
      ...label.value,
      ...(essentials.has(label.id) ? { essential: true } : {}),
      ...(label.id === "health" ? { deduction: "sanitarie", subDeductions: { Farmacia: "farmaci" } } : {}),
      ...(label.id === "leisure" ? { subDeductions: { Sport: "sport-ragazzi" } } : {}),
    },
  }));
  const people: Person[] = [
    { kind: "person", id: "demo-laura", version: null, value: { firstName: "Laura", lastName: "Bianchi", taxCode: fakeTaxCode(`BNCLRA${pad((first - 6) % 100)}M41H501`),
      relation: "spouse", birthDate: "", dependent: [{ year: first, share: 100 }, { year: first + 1, share: 100 }], order: 0 } },
    { kind: "person", id: "demo-luca", version: null, value: { firstName: "Luca", lastName: "Rossi", taxCode: fakeTaxCode(`RSSLCU${pad((first + 3) % 100)}B12H501`),
      relation: "child", birthDate: "", dependent: Array.from({ length: current - first - 2 }, (_, index) => ({ year: first + 3 + index, share: 50 })), order: 1 } },
  ];
  records.push(...accounts, ...labels, ...people);
  records.push({ kind: "setting", id: "general", version: null, value: {
    periodStart: 1, modules: { tax: true }, deductions: ["sanitarie", "farmaci", "mutuo", "sport-ragazzi", "asilo-nido"],
  } });
  const inflation = [-0.1, 1.2, 1.1, 0.6, -0.2, 1.9, 8.1, 5.7, 1.0, 1.7];
  for (let index = 0; index < 10; index++) {
    const year = first + index;
    records.push({ kind: "param", id: String(year), version: null, value: { ...defaultParams(year), income: 2_800_000 + index * 180_000, inflation: inflation[index], confirmed: year < current } });
  }

  // ---------------------------------------------------------------- Saldi di partenza
  const startMonth = `${first - 1}-12`;
  const start = (accountId: string, month: string, amount: number) =>
    records.push({ kind: "balance", id: balanceId(accountId, month), version: null, value: { accountId, month, amount } });
  start("fineco", startMonth, 850_000);
  start("revolut", startMonth, 60_000);
  start("demo-deposit", startMonth, 500_000);
  start("demo-etf", startMonth, 0);
  start("demo-pension", startMonth, 0);
  start("demo-marco", `${current - 1}-02`, 0);
  start("demo-car-loan", `${first}-03`, 1_500_000);
  start("demo-mortgage", `${first + 2}-02`, 18_000_000);

  // ---------------------------------------------------------------- Finanziamenti
  // Prestito auto (credito ai consumatori), concluso.
  {
    let residual = 1_500_000;
    for (let n = 0; n < 48 && residual > 0; n++) {
      const date = `${shiftMonth(`${first}-04`, n)}-10`;
      const interest = Math.round(residual * 6 / 1200);
      const principal = Math.min(residual, 35_227 - interest);
      residual -= principal;
      add({ type: "repayment", date, title: "Rata Prestito auto", amount: principal + interest, principal, interest, debtId: "demo-car-loan", accountId: "fineco", labelId: "interest", notes: "" });
    }
  }
  // Mutuo prima casa a tasso variabile (sale nel quinto anno), con un'estinzione parziale.
  const mortgageRecurring = "demo-rec-mortgage";
  let mortgageDone = 0;
  {
    let residual = 18_000_000;
    let tan = 2.1;
    const annuity = (months: number) => Math.round(residual * (tan / 1200) / (1 - Math.pow(1 + tan / 1200, -months)));
    let installment = annuity(300);
    for (let n = 0; n < 300 && residual > 0; n++) {
      const date = `${shiftMonth(`${first + 2}-03`, n)}-15`;
      if (date > today) break;
      if (date >= `${first + 6}-01-01` && tan === 2.1) { tan = 4.5; installment = annuity(300 - n); }
      const interest = Math.round(residual * tan / 1200);
      const principal = Math.min(residual, installment - interest);
      residual -= principal;
      add({ type: "repayment", date, title: "Rata Mutuo casa", amount: principal + interest, principal, interest, debtId: "demo-mortgage", accountId: "fineco", labelId: "interest", notes: "" },
        occurrenceId({ id: mortgageRecurring }, date, () => id("m")));
      mortgageDone++;
      if (date.slice(0, 7) === `${first + 7}-06`) {
        residual -= 2_000_000;
        add({ type: "repayment", date: `${first + 7}-06-20`, title: "Estinzione parziale Mutuo casa", amount: 2_000_000, principal: 2_000_000, interest: 0,
          debtId: "demo-mortgage", accountId: "fineco", labelId: "interest", notes: "Versamento extra" });
      }
    }
  }

  // ---------------------------------------------------------------- Ricorrenti (abbonamenti, bollette)
  const recurring: Recurring[] = [{ kind: "recurring", id: mortgageRecurring, version: null, value: {
    template: { type: "repayment", date: `${first + 2}-03-15`, title: "Rata Mutuo casa", amount: 90_000, principal: 90_000, interest: 0, debtId: "demo-mortgage", accountId: "fineco", labelId: "interest", notes: "" },
    schedule: { frequency: "monthly", every: 1, start: `${first + 2}-03-15`, end: "", done: mortgageDone },
    fixed: { kind: "fixed", status: "active" },
  } }];
  const monthly = (key: string, title: string, amount: number, day: number, fixed: NonNullable<Recurring["value"]["fixed"]>, since: number, label = "leisure", sub = "Abbonamenti") => {
    const recurringId = `demo-rec-${key}`;
    const begin = `${since}-01-${pad(day)}`;
    let done = 0;
    for (let month = begin.slice(0, 7); `${month}-${pad(day)}` <= today; month = shiftMonth(month, 1)) {
      const date = `${month}-${pad(day)}`;
      done++;
      if (fixed.suspendedMonths?.includes(Number(month.slice(5)))) continue;
      const price = [...(fixed.prices ?? [])].filter((item) => item.from <= date).at(-1)?.amount ?? amount;
      add({ type: "expense", date, title, amount: price, labelId: label, subcategory: sub, method: "Carta", accountId: "revolut", notes: "" },
        occurrenceId({ id: recurringId }, date, () => id("m")));
    }
    recurring.push({ kind: "recurring", id: recurringId, version: null, value: {
      template: { type: "expense", date: begin, title, amount: fixed.prices?.at(-1)?.amount ?? amount, labelId: label, subcategory: sub, method: "Carta", accountId: "revolut", notes: "" },
      schedule: { frequency: "monthly", every: 1, start: begin, end: "", done }, fixed,
    } });
  };
  monthly("netflix", "Netflix", 999, 3, { kind: "subscription", status: "active", prices: [
    { from: `${first}-01-01`, amount: 999 }, { from: `${first + 4}-02-01`, amount: 1_299 }, { from: `${shiftMonth(nowMonth, -1)}-01`, amount: 1_399 }] }, first);
  monthly("spotify", "Spotify", 1_099, 8, { kind: "subscription", status: "active", share: 50 }, first + 3);
  monthly("gym", "Palestra", 4_500, 12, { kind: "subscription", status: "active", suspendedMonths: [7, 8] }, first + 5, "leisure", "Sport");
  monthly("news", "Quotidiano digitale", 899, 20, { kind: "subscription", status: "trial", trialEnd: `${nowMonth}-28` }, current);
  monthly("cloud", "Archivio cloud", 299, 25, { kind: "subscription", status: "cancelling", cancelBy: `${nowMonth}-26`, noticeDays: 15 }, first + 6);
  monthly("internet", "Internet casa", 2_490, 5, { kind: "fixed", status: "active", prices: [{ from: `${first}-01-01`, amount: 2_490 }, { from: `${first + 5}-01-01`, amount: 2_790 }] }, first, "housing", "Internet");
  {
    // Bolletta luce bimestrale con periodo di competenza: d'inverno costa di più.
    const recurringId = "demo-rec-power";
    let done = 0;
    for (let month = `${first}-03`; `${month}-10` <= today; month = shiftMonth(month, 2)) {
      const winter = ["01", "03", "11"].includes(month.slice(5));
      const amount = vary(winter ? 14_000 : 9_500, 0.12) + (Number(month.slice(0, 4)) >= first + 6 ? 4_000 : 0);
      add({ type: "expense", date: `${month}-10`, title: "Bolletta luce", amount, labelId: "housing", subcategory: "Bollette", method: "Addebito diretto", accountId: "fineco", notes: "",
        extra: { competence: { from: `${shiftMonth(month, -2)}-01`, to: monthEnd(shiftMonth(month, -1)) } } }, occurrenceId({ id: recurringId }, `${month}-10`, () => id("m")));
      done++;
    }
    recurring.push({ kind: "recurring", id: recurringId, version: null, value: {
      template: { type: "expense", date: `${first}-03-10`, title: "Bolletta luce", amount: 12_000, labelId: "housing", subcategory: "Bollette", method: "Addebito diretto", accountId: "fineco", notes: "" },
      schedule: { frequency: "monthly", every: 2, start: `${first}-03-10`, end: "", done }, fixed: { kind: "bill", status: "active" },
    } });
  }

  // ---------------------------------------------------------------- Mese per mese
  const growth = [0.06, 0.09, -0.11, 0.12, 0.07, 0.15, -0.04, 0.1, 0.08, 0.05];
  for (let index = 0; index < 10; index++) {
    const year = first + index;
    const salary = 160_000 + index * 9_000 + (index >= 5 ? 25_000 : 0);
    for (let m = 1; m <= 12; m++) {
      const month = `${year}-${pad(m)}`;
      if (`${month}-01` > today) break;
      add({ type: "income", date: `${month}-27`, title: index >= 5 ? "Stipendio (nuovo lavoro)" : "Stipendio", amount: salary, labelId: "work", accountId: "fineco", notes: "" });
      if (m === 12) add({ type: "income", date: `${month}-18`, title: "Tredicesima", amount: salary, labelId: "work", accountId: "fineco", notes: "" });
      if (index < 2) add({ type: "expense", date: `${month}-02`, title: "Affitto", amount: 65_000, labelId: "housing", subcategory: "Affitto", method: "Bonifico", accountId: "fineco", notes: "" });
      for (const day of [4, 11, 18, 25]) {
        add({ type: "expense", date: `${month}-${pad(day)}`, title: day === 25 ? "Mercato" : "Supermercato", amount: vary(6_500 + index * 250), labelId: "groceries",
          subcategory: day === 25 ? "Mercato" : "Supermercato", method: "Carta", accountId: "revolut", notes: "" });
      }
      add({ type: "transfer", date: `${month}-03`, title: "Ricarica Revolut", amount: 45_000, accountId: "fineco", toAccountId: "revolut", notes: "" });
      add({ type: "expense", date: `${month}-14`, title: "Carburante", amount: vary(6_000), labelId: "transport", subcategory: "Carburante", method: "Carta", accountId: "revolut", notes: "" });
      if (rand() < 0.7) add({ type: "expense", date: `${month}-16`, title: rand() < 0.5 ? "Cena fuori" : "Pizzeria", amount: vary(4_500, 0.4), labelId: "out", subcategory: "Ristorante", method: "Carta", accountId: "revolut", notes: "" });
      if (rand() < 0.5) add({ type: "expense", date: `${month}-21`, title: "Farmacia", amount: vary(1_800, 0.5), labelId: "health", subcategory: "Farmacia", method: rand() < 0.4 ? "Contanti" : "Carta", accountId: "revolut", notes: "" });
      if (m % 4 === 0) {
        const refund = year >= current - 1 && m === 8 ? { refund: { amount: 6_000, from: "Fondo sanitario", received: year < current ? `${year}-10-15` : "" } } : null;
        add({ type: "expense", date: `${month}-09`, title: "Visita specialistica", amount: vary(12_000, 0.3), labelId: "health", subcategory: "Visite",
          method: rand() < 0.25 ? "Contanti" : "Carta", accountId: "fineco", notes: "", ...(refund ? { extra: refund } : {}) });
      }
      if (m === 3 || m === 10) add({ type: "expense", date: `${month}-07`, title: "Abbigliamento", amount: vary(15_000, 0.4), labelId: "clothing", subcategory: "Vestiti", method: "Carta", accountId: "revolut", notes: "" });
      if (index >= 3 && m === 9) add({ type: "expense", date: `${month}-15`, title: "Iscrizione calcio Luca", amount: 25_000, labelId: "leisure", subcategory: "Sport", method: "Bonifico",
        accountId: "fineco", notes: "", extra: { person: "demo-luca" } });
      if (index >= 1) add({ type: "transfer", date: `${month}-28`, title: "PAC ETF", amount: index >= 5 ? 30_000 : 20_000, accountId: "fineco", toAccountId: "demo-etf", notes: "" });
      if (index >= 2) add({ type: "transfer", date: `${month}-28`, title: "Fondo pensione", amount: 10_000, accountId: "fineco", toAccountId: "demo-pension", notes: "" });
      if (m % 3 === 0) add({ type: "income", date: monthEnd(month), title: "Interessi Conto deposito", amount: vary(year >= current - 3 ? 4_500 : 1_200), labelId: "other-income", accountId: "demo-deposit", notes: "" });
      if (m === 6 && index !== 4) add({ type: "transfer", date: `${month}-29`, title: "Accantonamento fondo", amount: 150_000, accountId: "fineco", toAccountId: "demo-deposit", notes: "" });
      if (index === 4 && m === 11) add({ type: "transfer", date: `${month}-05`, title: "Prelievo dal fondo", amount: 250_000, accountId: "demo-deposit", toAccountId: "fineco", notes: "Riparazione caldaia" });
    }
    const trip = [`viaggio-${year}`];
    const tripMonth = `${year}-${pad((index % 3) + 6)}`;
    if (`${tripMonth}-20` <= today) {
      add({ type: "expense", date: `${tripMonth}-12`, title: "Volo", amount: vary(32_000), labelId: "travel", subcategory: "Biglietti", method: "Carta", accountId: "revolut", notes: "", tags: trip });
      add({ type: "expense", date: `${tripMonth}-13`, title: "Hotel", amount: vary(68_000), labelId: "travel", subcategory: "Alloggio", method: "Carta", accountId: "revolut", notes: "", tags: trip });
    }
    // Valore degli investimenti a fine anno (con anni negativi).
    if (year < current) {
      const paidTo = (accountId: string) => movements.filter((item) => item.value.type === "transfer" && item.value.toAccountId === accountId && item.value.date <= `${year}-12-31`)
        .reduce((sum, item) => sum + item.value.amount, 0);
      const cumulative = growth.slice(0, index + 1).reduce((factor, rate) => factor * (1 + rate / 2), 1);
      start("demo-etf", `${year}-12`, Math.round(paidTo("demo-etf") * cumulative));
      start("demo-pension", `${year}-12`, Math.round(paidTo("demo-pension") * (1 + 0.015 * (index + 1))));
    }
  }
  // Spesa divisa con una parte anticipata per Marco, poi la sua restituzione parziale.
  add({ type: "expense", date: `${current - 1}-03-05`, title: "Cena di gruppo", amount: 12_000, labelId: "out", subcategory: "Ristorante", method: "Carta", accountId: "revolut", notes: "",
    parts: [{ amount: 6_000, labelId: "out", subcategory: "Ristorante" }, { amount: 6_000, creditId: "demo-marco" }] });
  add({ type: "transfer", date: `${current - 1}-04-02`, title: "Restituzione da Marco", amount: 4_000, accountId: "demo-marco", toAccountId: "revolut", notes: "" });
  // Un doppione voluto (lo segnala il controllo di salute).
  const dup = movements.find((item) => item.value.date.startsWith(shiftMonth(nowMonth, -1)) && item.value.title === "Supermercato");
  if (dup) movements.push({ ...dup, id: id("dup") });

  // ---------------------------------------------------------------- Scadenze, obiettivi, budget, preferiti
  const deadlines: Deadline[] = [
    { kind: "deadline", id: "demo-dl-revision", version: null, value: { title: "Revisione auto", type: "vehicle", date: `${nowMonth}-28`, repeatMonths: 24, noticeDays: 30, notes: "Officina sotto casa" } },
    { kind: "deadline", id: "demo-dl-tax", version: null, value: { title: "Bollo auto", type: "vehicle", date: `${shiftMonth(nowMonth, -1)}-15`, repeatMonths: 12, noticeDays: 20, notes: "" } },
    { kind: "deadline", id: "demo-dl-id", version: null, value: { title: "Carta d’identità di Luca", type: "document", date: `${current + 1}-05-14`, repeatMonths: 0, noticeDays: 90, person: "demo-luca", notes: "" } },
    { kind: "deadline", id: "demo-dl-warranty", version: null, value: { title: "Garanzia lavatrice", type: "warranty", date: `${current + 1}-02-01`, repeatMonths: 0, noticeDays: 30, notes: "Scontrino nella cartella documenti" } },
    { kind: "deadline", id: "demo-dl-home", version: null, value: { title: "Assicurazione casa", type: "contract", date: `${current}-12-31`, repeatMonths: 12, noticeDays: 60, notes: "Disdetta con 60 giorni di preavviso" } },
  ];
  records.push(...deadlines, ...recurring,
    { kind: "goal", id: "demo-goal-car", version: null, value: { name: "Auto nuova", target: 1_500_000, deadline: `${current + 2}-06-30`, accountId: null, saved: 620_000, icon: "car", color: "blue", order: 0 } },
    { kind: "goal", id: "demo-goal-fund", version: null, value: { name: "Fondo emergenza", target: 2_000_000, deadline: "", accountId: "demo-deposit", saved: 0, icon: "piggy-bank", color: "teal", order: 1 } },
    { kind: "budget", id: "demo-budget-groceries", version: null, value: { target: "label", ref: "groceries", amount: 32_000, period: "month", order: 0 } },
    { kind: "budget", id: "demo-budget-out", version: null, value: { target: "label", ref: "out", amount: 8_000, period: "month", order: 1 } },
    { kind: "budget", id: "demo-budget-trip", version: null, value: { target: "tag", ref: `viaggio-${current - 1}`, amount: 120_000, period: "total", order: 2 } },
    { kind: "template", id: "demo-coffee", version: null, value: { name: "Caffè", type: "expense", title: "Caffè al bar", amount: 120, labelId: "out", subcategory: "Ristorante", accountId: "revolut", toAccountId: null, method: "Carta", order: 0 } },
  );

  // ---------------------------------------------------------------- I due anni più vecchi sono archiviati
  let result: LedgerRecord[] = [...records, ...movements];
  for (const year of [first, first + 1]) {
    const byKey = new Map(result.map((record) => [`${record.kind}:${record.id}`, record]));
    for (const action of archiveActions(deriveLedger(result), year)) {
      if (action.op === "save") byKey.set(`${action.record.kind}:${action.record.id}`, action.record);
      else byKey.delete(`${action.kind}:${action.id}`);
    }
    result = [...byKey.values()];
  }
  return result;
}
