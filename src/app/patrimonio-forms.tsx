import { useMemo, useState, type FormEvent } from "react";
import { Archive, ArchiveRestore, Calculator, HandCoins, Trash2, Users } from "lucide-react";
import {
  ASSET_CLASSES, INTEREST_LABEL, activeLabels, balanceId, money, newId, parseMoney, sameName, shortDate,
  type Account, type DebtDetails, type Ledger, type LoanDetails, type Mutation,
} from "../lib/ledger";
import { amortization, initialSnapshot, linkedRecurring, loanInstallment, monthlyRate } from "../lib/debts";
import { occurrence } from "../lib/recurring";
import { FormError, Submit, field } from "./ledger-forms";

function amountInput(amount: number | undefined | null) {
  return amount === undefined || amount === null ? "" : (amount / 100).toFixed(2).replace(".", ",");
}

function parsePercent(raw: string) {
  const text = raw.trim().replace("%", "").replace(",", ".");
  if (!text) return null;
  const value = Number(text);
  return Number.isFinite(value) && value >= 0 && value <= 100 ? Math.round(value * 1000) / 1000 : NaN;
}

function percentText(value: number | null | undefined) {
  return value === null || value === undefined ? "" : String(value).replace(".", ",");
}

function ManageButtons({ account, busy, onArchive, onRemove }: {
  account?: Account; busy: boolean; onArchive: (account: Account) => void; onRemove: (account: Account) => void;
}) {
  if (!account) return null;
  return <div className="manage-actions">
    <button type="button" className="button danger-quiet" disabled={busy} onClick={() => onRemove(account)}><Trash2 size={16} /> Elimina</button>
    <button type="button" className="button secondary" disabled={busy} onClick={() => onArchive(account)}>
      {account.value.archived ? <><ArchiveRestore size={16} /> Ripristina</> : <><Archive size={16} /> Archivia</>}
    </button>
  </div>;
}

// ------------------------------------------------------------------ Investimento

export function InvestmentEditor({ ledger, id, initial, month, busy, error, onCommit, onArchive, onRemove }: {
  ledger: Ledger; id: string; initial?: Account; month: string; busy: boolean; error: string;
  onCommit: (actions: Mutation[], message: string) => void; onArchive: (account: Account) => void; onRemove: (account: Account) => void;
}) {
  const [validation, setValidation] = useState("");

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const name = field(data, "name");
    const before = parseMoney(field(data, "before") || "0");
    const current = field(data, "value") ? parseMoney(field(data, "value")) : null;
    if (ledger.accounts.some((account) => account.id !== id && sameName(account.value.name, name))) return setValidation("Esiste già un conto o investimento con questo nome.");
    if (before === null || before < 0) return setValidation("Il versato iniziale deve essere un importo valido.");
    if (field(data, "value") && (current === null || current < 0)) return setValidation("Il valore attuale deve essere un importo valido.");
    setValidation("");
    const record: Account = {
      kind: "account", id, version: initial?.version ?? null,
      value: { ...initial?.value, name, type: "investment", invest: { assetClass: field(data, "class") as keyof typeof ASSET_CLASSES, contributedBefore: before } },
    };
    const actions: Mutation[] = [{ op: "save", record }];
    if (!initial && current !== null) {
      actions.push({ op: "save", record: { kind: "balance", id: balanceId(id, month), version: null, value: { accountId: id, month, amount: current } } });
    }
    onCommit(actions, initial ? "Investimento aggiornato." : "Investimento creato.");
  }

  return <form className="editor" onSubmit={submit}>
    <label>Nome<input name="name" defaultValue={initial?.value.name ?? ""} placeholder="Es. ETF MSCI World" maxLength={100} required /></label>
    <label>Tipo
      <select name="class" defaultValue={initial?.value.invest?.assetClass ?? "equity"}>
        {Object.entries(ASSET_CLASSES).map(([value, title]) => <option key={value} value={value}>{title}</option>)}
      </select>
    </label>
    <div className="form-grid">
      <label>Già versato <span className="optional">facoltativo</span>
        <input name="before" inputMode="decimal" placeholder="0,00" defaultValue={amountInput(initial?.value.invest?.contributedBefore ?? 0)} />
        <span className="field-note">Quanto avevi messo prima di registrare i versamenti qui.</span></label>
      {!initial && <label>Valore attuale <span className="optional">facoltativo</span>
        <input name="value" inputMode="decimal" placeholder="0,00" />
        <span className="field-note">Il valore di oggi, dall’estratto o dall’app della banca.</span></label>}
    </div>
    <p className="form-help">I versamenti successivi si registrano come <strong>trasferimenti</strong> da un conto verso questo investimento (pulsante «Versa»). Il valore lo aggiorni con «Aggiorna valore».</p>
    <FormError message={validation || error} />
    <div className="modal-actions">
      <ManageButtons account={initial} busy={busy} onArchive={onArchive} onRemove={onRemove} />
      <Submit busy={busy} />
    </div>
  </form>;
}

// ------------------------------------------------------------------ Debito

type LoanDraft = { principal: string; tan: string; taeg: string; months: string; firstDate: string; installment: string; fee: string; paidBefore: string };

function readLoan(draft: LoanDraft) {
  const principal = parseMoney(draft.principal);
  const tan = parsePercent(draft.tan);
  const taeg = parsePercent(draft.taeg);
  const months = Number(draft.months);
  const fee = parseMoney(draft.fee || "0");
  const paidBefore = Number(draft.paidBefore || "0");
  const validDate = /^\d{4}-\d{2}-\d{2}$/.test(draft.firstDate);
  const ok = principal !== null && principal > 0 && tan !== null && !Number.isNaN(tan) && Number.isInteger(months) && months >= 1 && months <= 600 && fee !== null && fee >= 0 && validDate;
  const computed = ok ? loanInstallment(principal, tan, months) + fee : null;
  const typed = draft.installment.trim() ? parseMoney(draft.installment) : null;
  return { principal, tan, taeg, months, fee, paidBefore, ok, computed, installment: typed ?? computed, typed };
}

function LoanExplainer({ draft }: { draft: LoanDraft }) {
  const loan = readLoan(draft);
  const plan = useMemo(() => (loan.ok && loan.installment
    ? amortization({ principal: loan.principal!, tan: loan.tan!, months: loan.months, installment: loan.installment, fee: loan.fee!, firstDate: draft.firstDate })
    : []), [loan.ok, loan.principal, loan.tan, loan.months, loan.installment, loan.fee, draft.firstDate]);
  const costs = plan.reduce((total, row) => total + row.interest + row.fee, 0);
  const i = loan.tan !== null && !Number.isNaN(loan.tan) ? monthlyRate(loan.tan) : null;
  const shown = plan.length > 5 ? [...plan.slice(0, 3), null, plan[plan.length - 1]] : plan;
  const diff = loan.typed !== null && loan.computed !== null ? loan.typed - loan.computed : 0;
  return <div className="loan-explainer">
    <p className="explainer-title"><Calculator size={15} /> Come si divide la rata</p>
    <p>La rata è costante (piano <em>alla francese</em>): <code>rata = C × i ÷ (1 − (1 + i)<sup>−n</sup>)</code>, con <code>i = TAN ÷ 12</code>.
      Ogni mese <strong>interessi = debito residuo × i</strong> e <strong>capitale = rata − interessi − spese</strong>: all’inizio paghi più interessi, verso la fine quasi solo capitale.
      Solo il capitale riduce il debito; interessi e spese contano come spesa.</p>
    <p className="field-note"><strong>TAN</strong>: il tasso con cui si calcolano gli interessi. <strong>TAEG</strong>: comprende anche spese di istruttoria, incasso rata e assicurazioni. Serve a confrontare le offerte, non entra nel calcolo della rata. Con tasso zero (TAN 0%) la rata è tutta capitale.</p>
    {loan.ok && plan.length > 0 ? <>
      <ul className="calc-lines">
        <li><span>Tasso mensile i</span><b>{i === null ? "—" : `${(i * 100).toLocaleString("it-IT", { maximumFractionDigits: 4 })}%`}</b></li>
        <li><span>Rata calcolata</span><b>{money(loan.computed)}{loan.fee ? ` (di cui ${money(loan.fee)} spese)` : ""}</b></li>
        <li><span>1ª rata</span><b>{money(plan[0].interest)} interessi{plan[0].fee ? ` + ${money(plan[0].fee)} spese` : ""} + {money(plan[0].capital)} capitale</b></li>
        <li><span>Totale interessi e spese</span><b>{money(costs)}</b></li>
        <li><span>Totale da rimborsare</span><b>{money(loan.principal! + costs)}</b></li>
      </ul>
      <div className="table-scroll"><table className="data-table compact-table plan-table">
        <thead><tr><th scope="col">Rata</th><th scope="col">Data</th><th scope="col" className="number">{loan.fee ? "Interessi + spese" : "Interessi"}</th><th scope="col" className="number">Capitale</th><th scope="col" className="number">Residuo</th></tr></thead>
        <tbody>{shown.map((row, index) => row ? <tr key={row.n}><td>{row.n}</td><td className="table-muted">{row.date ? shortDate(row.date) : ""}</td>
          <td className="number">{money(row.interest + row.fee)}</td><td className="number">{money(row.capital)}</td><td className="number">{money(row.residual)}</td></tr>
          : <tr key={`gap-${index}`}><td colSpan={5} className="table-muted">…</td></tr>)}</tbody>
      </table></div>
      {Math.abs(diff) > 100 && <p className="form-error">La rata del contratto ({money(loan.typed)}) è diversa da quella calcolata ({money(loan.computed)}). Controlla TAN, numero di rate e spese per rata: altrimenti la divisione sarà approssimata e conviene correggere il residuo con l’estratto conto.</p>}
    </> : <p className="field-note">Inserisci importo, TAN, numero di rate e data della prima rata per vedere i calcoli.</p>}
  </div>;
}

export function DebtEditor({ ledger, id, initial, busy, error, onCommit, onArchive, onRemove }: {
  ledger: Ledger; id: string; initial?: Account; busy: boolean; error: string;
  onCommit: (actions: Mutation[], message: string) => void; onArchive: (account: Account) => void; onRemove: (account: Account) => void;
}) {
  const existing = initial?.value.debt;
  const [kind, setKind] = useState<DebtDetails["kind"]>(existing?.kind ?? "loan");
  const loanInit = existing?.kind === "loan" ? existing : undefined;
  const [draft, setDraft] = useState<LoanDraft>({
    principal: amountInput(existing?.principal), tan: percentText(loanInit?.tan), taeg: percentText(loanInit?.taeg),
    months: loanInit ? String(loanInit.months) : "", firstDate: loanInit?.firstDate ?? "", installment: amountInput(loanInit?.installment),
    fee: amountInput(loanInit?.fee ?? 0), paidBefore: loanInit ? String(loanInit.paidBefore) : "0",
  });
  const recurring = initial ? linkedRecurring(ledger, initial.id) : undefined;
  const [repeat, setRepeat] = useState(initial ? !!recurring : true);
  const [validation, setValidation] = useState("");
  const payAccounts = ledger.accounts.filter((account) => (account.value.type === "cash" || account.value.type === "asset") && !account.value.archived);
  const expenseLabels = activeLabels(ledger, "expense", loanInit?.interestLabelId);
  const hasBalances = initial ? ledger.balances.some((balance) => balance.value.accountId === initial.id) : false;
  const fixedKind = !!existing;
  const set = (key: keyof LoanDraft) => (event: { target: { value: string } }) => setDraft((previous) => ({ ...previous, [key]: event.target.value }));

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const name = field(data, "name");
    const accountId = field(data, "account") || null;
    if (ledger.accounts.some((account) => account.id !== id && sameName(account.value.name, name))) return setValidation("Esiste già un conto o debito con questo nome.");
    const actions: Mutation[] = [];
    let details: DebtDetails;
    if (kind === "loan") {
      const loan = readLoan(draft);
      if (!loan.ok || !loan.installment) return setValidation("Controlla importo, TAN, numero di rate e data della prima rata.");
      if (loan.taeg !== null && Number.isNaN(loan.taeg)) return setValidation("Il TAEG deve essere una percentuale tra 0 e 100.");
      if (!Number.isInteger(loan.paidBefore) || loan.paidBefore < 0 || loan.paidBefore > loan.months) return setValidation("Le rate già pagate devono essere tra 0 e il numero di rate.");
      if (loan.installment <= (loan.fee ?? 0)) return setValidation("La rata deve essere maggiore delle spese per rata.");
      details = {
        kind: "loan", principal: loan.principal!, tan: loan.tan!, taeg: loan.taeg, months: loan.months, firstDate: draft.firstDate,
        installment: loan.installment, fee: loan.fee!, paidBefore: loanInit && hasBalances ? loanInit.paidBefore : loan.paidBefore,
        accountId, interestLabelId: field(data, "interest-label") || INTEREST_LABEL,
      };
    } else {
      const principal = parseMoney(field(data, "flex-principal"));
      const start = field(data, "flex-start");
      if (principal === null || principal <= 0 || !/^\d{4}-\d{2}-\d{2}$/.test(start)) return setValidation("Inserisci l’importo ricevuto e la data.");
      details = { kind: "flexible", principal, start, accountId, note: field(data, "note") };
    }
    setValidation("");
    const { archived, removed, invest: _invest, ...base } = initial?.value ?? { name, type: "debt" as const };
    const value: Account["value"] = { ...base, name, type: "debt", debt: details };
    if (archived) value.archived = true;
    if (removed) value.removed = true;
    actions.push({ op: "save", record: { kind: "account", id, version: initial?.version ?? null, value } });

    // Residuo iniziale solo per i debiti nuovi (o vecchi senza saldi registrati).
    if (!hasBalances) {
      const snapshot = initialSnapshot(details);
      actions.push({ op: "save", record: { kind: "balance", id: balanceId(id, snapshot.month), version: null, value: { accountId: id, month: snapshot.month, amount: snapshot.amount } } });
    }

    // Rate proposte ogni mese (movimenti ricorrenti di tipo Rata).
    if (details.kind === "loan") {
      const paid = details.paidBefore + ledger.movements.filter(({ value: item }) => item.type === "repayment" && item.debtId === id).length;
      const template = {
        type: "repayment" as const, date: details.firstDate, title: `Rata ${name}`.slice(0, 160), amount: details.installment,
        principal: details.installment, interest: 0, debtId: id, accountId, labelId: details.interestLabelId, notes: "",
      };
      const end = occurrence({ frequency: "monthly", every: 1, start: details.firstDate }, details.months - 1) ?? "";
      if (repeat && recurring) {
        const same = recurring.value.schedule.start === details.firstDate;
        actions.push({ op: "save", record: { ...recurring, value: { ...recurring.value, template: { ...template, date: recurring.value.template.date },
          schedule: same ? { ...recurring.value.schedule, end } : { frequency: "monthly", every: 1, start: details.firstDate, end, done: paid } } } });
      } else if (repeat && paid < details.months) {
        actions.push({ op: "save", record: { kind: "recurring", id: newId(), version: null, value: {
          template, schedule: { frequency: "monthly", every: 1, start: details.firstDate, end, done: paid },
        } } });
      } else if (!repeat && recurring) {
        actions.push({ op: "delete", kind: "recurring", id: recurring.id, version: recurring.version ?? "00000000-0000-4000-8000-000000000000" });
      }
    }
    onCommit(actions, initial ? "Debito aggiornato." : details.kind === "loan" ? "Finanziamento creato." : "Debito creato.");
  }

  return <form className="editor" onSubmit={submit}>
    {!fixedKind && <div className="segmented" role="group" aria-label="Tipo di debito">
      <button type="button" aria-pressed={kind === "loan"} onClick={() => setKind("loan")}><HandCoins size={15} /> Finanziamento</button>
      <button type="button" aria-pressed={kind === "flexible"} onClick={() => setKind("flexible")}><Users size={15} /> Debito flessibile</button>
    </div>}
    <p className="form-help">{kind === "loan"
      ? "Rate fisse mensili: auto, smartphone, prestiti personali, anche a tasso zero. Il residuo scende da solo a ogni rata."
      : "Senza piano fisso, ad esempio verso amici o parenti: registri i rimborsi quando li fai (ogni 1, 2, 3 mesi…) e correggi il residuo quando serve."}</p>
    <label>Nome<input name="name" defaultValue={initial?.value.name ?? ""} placeholder={kind === "loan" ? "Es. Finanziamento auto" : "Es. Prestito da papà"} maxLength={100} required /></label>

    {kind === "loan" ? <>
      <div className="form-grid" key="loan-fields">
        <label>Importo finanziato<input inputMode="decimal" placeholder="0,00" value={draft.principal} onChange={set("principal")} required /></label>
        <label>Numero di rate<input type="number" min={1} max={600} placeholder="Es. 48" value={draft.months} onChange={set("months")} required /></label>
        <label>TAN %<input inputMode="decimal" placeholder="Es. 6,9 (0 se tasso zero)" value={draft.tan} onChange={set("tan")} required /></label>
        <label>TAEG % <span className="optional">facoltativo</span><input inputMode="decimal" placeholder="Es. 8,2" value={draft.taeg} onChange={set("taeg")} /></label>
        <label>Data della prima rata<input type="date" min="1900-01-01" max="2100-12-31" value={draft.firstDate} onChange={set("firstDate")} required /></label>
        <label>Spese per rata <span className="optional">facoltative</span><input inputMode="decimal" placeholder="0,00" value={draft.fee} onChange={set("fee")} /></label>
        <label>Rata del contratto <span className="optional">facoltativa</span>
          <input inputMode="decimal" placeholder={readLoan(draft).computed !== null ? amountInput(readLoan(draft).computed) : "Calcolata in automatico"} value={draft.installment} onChange={set("installment")} />
          <span className="field-note">Vuoto = usa quella calcolata.</span></label>
        {(!initial || !hasBalances) && <label>Rate già pagate<input type="number" min={0} max={600} value={draft.paidBefore} onChange={set("paidBefore")} />
          <span className="field-note">Se il finanziamento è già iniziato.</span></label>}
      </div>
      <div className="form-grid">
        <label>Conto di addebito <span className="optional">facoltativo</span>
          <select name="account" defaultValue={existing?.accountId ?? ""}>
            <option value="">Nessuno</option>
            {payAccounts.map((account) => <option key={account.id} value={account.id}>{account.value.name}</option>)}
          </select></label>
        <label>Categoria per interessi e spese
          <select name="interest-label" defaultValue={loanInit?.interestLabelId ?? INTEREST_LABEL}>
            {expenseLabels.map((label) => <option key={label.id} value={label.id}>{label.value.name}</option>)}
          </select></label>
      </div>
      <LoanExplainer draft={draft} />
      <label className="check-row">
        <input type="checkbox" checked={repeat} onChange={(event) => setRepeat(event.target.checked)} />
        <span><strong>Proponi le rate ogni mese</strong><small>Ogni scadenza compare in Panoramica: confermi e il residuo si aggiorna da solo. Puoi sempre correggerlo a mano.</small></span>
      </label>
    </> : <>
      <div className="form-grid" key="flexible-fields">
        <label>Importo ricevuto<input name="flex-principal" inputMode="decimal" placeholder="0,00" defaultValue={amountInput(existing?.principal)} required /></label>
        <label>Data<input name="flex-start" type="date" min="1900-01-01" max="2100-12-31" defaultValue={existing?.kind === "flexible" ? existing.start : ""} required /></label>
      </div>
      <label>Note <span className="optional">facoltative</span><input name="note" maxLength={200} placeholder="Es. da papà, restituisco quando posso" defaultValue={existing?.kind === "flexible" ? existing.note : ""} /></label>
      <label>Conto da cui rimborsi di solito <span className="optional">facoltativo</span>
        <select name="account" defaultValue={existing?.accountId ?? ""}>
          <option value="">Nessuno</option>
          {payAccounts.map((account) => <option key={account.id} value={account.id}>{account.value.name}</option>)}
        </select></label>
      <p className="field-note">Nessun interesse: ogni rimborso scala tutto dal debito. Se il debito cresce (un nuovo prestito) usa «Correggi residuo».</p>
    </>}
    {initial && hasBalances && <p className="field-note">Il residuo registrato non cambia: per aggiornarlo usa «Correggi residuo». Le modifiche valgono per le prossime rate.</p>}
    <FormError message={validation || error} />
    <div className="modal-actions">
      <ManageButtons account={initial} busy={busy} onArchive={onArchive} onRemove={onRemove} />
      <Submit busy={busy} />
    </div>
  </form>;
}

export type { LoanDetails };

// ------------------------------------------------------------------ Credito

export function CreditEditor({ ledger, id, initial, busy, error, onCommit, onArchive, onRemove }: {
  ledger: Ledger; id: string; initial?: Account; busy: boolean; error: string;
  onCommit: (actions: Mutation[], message: string) => void; onArchive: (account: Account) => void; onRemove: (account: Account) => void;
}) {
  const [validation, setValidation] = useState("");
  const today = new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/Rome" }).format(new Date());
  const payAccounts = ledger.accounts.filter((account) => (account.value.type === "cash" || account.value.type === "asset") && !account.value.archived);

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const name = field(data, "name");
    const start = field(data, "start") || today;
    if (ledger.accounts.some((account) => account.id !== id && sameName(account.value.name, name))) return setValidation("Esiste già un conto o credito con questo nome.");
    if (!/^\d{4}-\d{2}-\d{2}$/.test(start)) return setValidation("La data non è valida.");
    const record: Account = {
      kind: "account", id, version: initial?.version ?? null,
      value: { ...initial?.value, name, type: "receivable", credit: { start, note: field(data, "note").slice(0, 200) } },
    };
    const actions: Mutation[] = [{ op: "save", record }];
    if (!initial) {
      const amount = field(data, "amount") ? parseMoney(field(data, "amount")) : 0;
      if (amount === null || amount < 0) return setValidation("L’importo non è valido.");
      const from = field(data, "from");
      // Si parte da zero il mese prima: il prestito è un trasferimento dal conto (o un saldo iniziale).
      const month = start.slice(0, 7);
      const [year, value] = month.split("-").map(Number);
      const before = value === 1 ? `${year - 1}-12` : `${year}-${String(value - 1).padStart(2, "0")}`;
      actions.push({ op: "save", record: { kind: "balance", id: balanceId(id, before), version: null, value: { accountId: id, month: before, amount: from ? 0 : amount } } });
      if (from && amount > 0) {
        actions.push({ op: "save", record: { kind: "movement", id: newId(), version: null, value: {
          type: "transfer", date: start, title: `Prestito a ${name}`.slice(0, 160), amount, accountId: from, toAccountId: id, notes: "",
        } } });
      }
    }
    setValidation("");
    onCommit(actions, initial ? "Credito aggiornato." : "Credito creato.");
  }

  return <form className="editor" onSubmit={submit}>
    <p className="form-help">Soldi che hai prestato o anticipato per qualcuno. Restano nel tuo patrimonio finché non te li restituisce: non sono una spesa.</p>
    <label>Chi ti deve i soldi<input name="name" defaultValue={initial?.value.name ?? ""} placeholder="Es. Marco" maxLength={100} required /></label>
    <label>Note <span className="optional">facoltative</span><input name="note" maxLength={200} defaultValue={initial?.value.credit?.note ?? ""} placeholder="Es. biglietti del concerto" /></label>
    <div className="form-grid">
      <label>Dal<input name="start" type="date" min="1900-01-01" max="2100-12-31" defaultValue={initial?.value.credit?.start ?? today} required /></label>
      {!initial && <label>Importo prestato <span className="optional">facoltativo</span><input name="amount" inputMode="decimal" placeholder="0,00" /></label>}
    </div>
    {!initial && <label>Uscito dal conto <span className="optional">facoltativo</span>
      <select name="from" defaultValue={payAccounts[0]?.id ?? ""}>
        <option value="">Nessuno (era già prestato)</option>
        {payAccounts.map((account) => <option key={account.id} value={account.id}>{account.value.name}</option>)}
      </select>
      <span className="field-note">Con un conto viene registrato un trasferimento: il conto scende, il credito sale.</span></label>}
    <FormError message={validation || error} />
    <div className="modal-actions">
      <ManageButtons account={initial} busy={busy} onArchive={onArchive} onRemove={onRemove} />
      <Submit busy={busy} />
    </div>
  </form>;
}
