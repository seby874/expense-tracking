import { useMemo, useState } from "react";
import { AlertTriangle, LifeBuoy, Minus, PiggyBank, Plus, Settings2, Trash2 } from "lucide-react";
import {
  AVAILABILITY, CREDIT_FREQUENCIES, accountBalances, money, newId, parseMoney,
  type Account, type DepositDetails, type DepositLine, type Ledger, type Mutation,
} from "../lib/ledger";
import { BUCKET_LABELS, fundStatus, monthsToTarget } from "../lib/fund";
import { CREDIT_LABELS, EARLY_LABELS, activeLines, depositYear, stepsText } from "../lib/deposit";
import { paramsFor } from "../lib/params";
import { Empty, PanelTitle } from "./ledger-views";

type Commit = (actions: Mutation[], message: string) => void;

function months(value: number | null) {
  return value === null ? "—" : `${value.toLocaleString("it-IT", { maximumFractionDigits: 1 })} mesi`;
}

function euro(cents: number | undefined) {
  return cents ? (cents / 100).toFixed(2).replace(".", ",") : "";
}

function percentText(value: number | undefined) {
  return value === undefined ? "" : String(value).replace(".", ",");
}

function percentValue(text: string) {
  const value = Number(text.replace(",", ".").trim());
  return text.trim() && Number.isFinite(value) ? value : null;
}

// ---------------------------------------------------------------- Editor del conto remunerato

type StepDraft = { rate: string; until: string };
type LineDraft = { id: string; amount: string; start: string; end: string; rate: string; credit: DepositLine["credit"]; early: DepositLine["early"]; earlyRate: string; noticeDays: string; closed: boolean };

function DepositEditor({ account, busy, onCommit, onClose }: { account: Account; busy: boolean; onCommit: Commit; onClose: () => void }) {
  const deposit = account.value.deposit;
  const liquidity = account.value.liquidity;
  const [kind, setKind] = useState<DepositDetails["kind"] | "none">(deposit?.kind ?? "none");
  const [bank, setBank] = useState(deposit?.bank ?? "");
  const [steps, setSteps] = useState<StepDraft[]>(deposit?.rates.length ? deposit.rates.map((step) => ({ rate: percentText(step.rate), until: step.until })) : [{ rate: "", until: "" }]);
  const [credit, setCredit] = useState<DepositDetails["credit"]>(deposit?.credit ?? "quarterly");
  const [dayCount, setDayCount] = useState<NonNullable<DepositDetails["dayCount"]>>(deposit?.dayCount ?? "365");
  const [stamp, setStamp] = useState<NonNullable<DepositDetails["stamp"]>>(deposit?.stamp ?? "client");
  const [stampCharge, setStampCharge] = useState<NonNullable<DepositDetails["stampCharge"]>>(deposit?.stampCharge ?? "quarterly");
  const [availability, setAvailability] = useState(liquidity?.availability ?? "now");
  const [weight, setWeight] = useState(percentText(liquidity?.weight));
  const [emergency, setEmergency] = useState(!!liquidity?.emergency);
  const [lines, setLines] = useState<LineDraft[]>((deposit?.lines ?? []).map((line) => ({
    id: line.id, amount: euro(line.amount), start: line.start, end: line.end, rate: percentText(line.rates[0]?.rate), credit: line.credit,
    early: line.early, earlyRate: percentText(line.earlyRate), noticeDays: line.noticeDays ? String(line.noticeDays) : "", closed: !!line.closed,
  })));
  const [error, setError] = useState("");

  function save() {
    setError("");
    let nextDeposit: DepositDetails | undefined;
    if (kind !== "none") {
      const rates: DepositDetails["rates"] = [];
      for (const step of steps) {
        if (!step.rate.trim() && !step.until) continue;
        const rate = percentValue(step.rate);
        if (rate === null || rate < 0 || rate > 100) { setError("Controlla i tassi (percentuale tra 0 e 100)."); return; }
        rates.push({ rate, until: step.until });
      }
      const builtLines: DepositLine[] = [];
      for (const line of lines) {
        const amount = parseMoney(line.amount);
        const rate = percentValue(line.rate);
        if (amount === null || amount <= 0 || !line.start || !line.end || line.end < line.start || rate === null) {
          setError("Ogni vincolo ha bisogno di importo, date (fine dopo l’inizio) e tasso."); return;
        }
        builtLines.push({
          id: line.id, amount, start: line.start, end: line.end, rates: [{ rate, until: "" }], credit: line.credit, early: line.early,
          ...(line.early === "reduced-rate" && percentValue(line.earlyRate) !== null ? { earlyRate: percentValue(line.earlyRate)! } : {}),
          ...(line.noticeDays ? { noticeDays: Number(line.noticeDays) } : {}), ...(line.closed ? { closed: true } : {}),
        });
      }
      nextDeposit = {
        kind, rates, credit, ...(bank.trim() ? { bank: bank.trim().slice(0, 80) } : {}),
        ...(dayCount !== "365" ? { dayCount } : {}), ...(stamp !== "client" ? { stamp } : {}), ...(stampCharge !== "quarterly" ? { stampCharge } : {}),
        ...(builtLines.length ? { lines: builtLines } : {}),
      };
    }
    const customWeight = weight.trim() ? percentValue(weight) : null;
    if (weight.trim() && (customWeight === null || customWeight < 0 || customWeight > 100)) { setError("Il peso deve essere tra 0 e 100."); return; }
    const value = { ...account.value };
    delete value.deposit;
    delete value.liquidity;
    if (nextDeposit) value.deposit = nextDeposit;
    value.liquidity = { availability, ...(customWeight !== null ? { weight: customWeight } : {}), ...(emergency ? { emergency: true } : {}) };
    onCommit([{ op: "save", record: { ...account, value } }], `«${account.value.name}» aggiornato.`);
    onClose();
  }

  const updateLine = (id: string, change: Partial<LineDraft>) => setLines((list) => list.map((line) => (line.id === id ? { ...line, ...change } : line)));

  return <div className="editor inline-editor">
    <div className="form-grid">
      <label>Tipo<select value={kind} onChange={(event) => setKind(event.target.value as typeof kind)}>
        <option value="none">Conto senza interessi</option><option value="current">Conto corrente remunerato</option>
        <option value="free">Conto deposito libero</option><option value="locked">Conto deposito vincolato</option></select></label>
      <label>Disponibilità dei soldi<select value={availability} onChange={(event) => setAvailability(event.target.value as typeof availability)}>
        {AVAILABILITY.map((key) => <option key={key} value={key}>{BUCKET_LABELS[key]}</option>)}</select></label>
      {kind !== "none" && <>
        <label>Banca <span className="optional">per la garanzia dei 100.000 €</span><input value={bank} maxLength={80} onChange={(event) => setBank(event.target.value)} /></label>
        <label>Tasso lordo annuo %<input inputMode="decimal" value={steps[0]?.rate ?? ""} onChange={(event) => setSteps((list) => [{ ...list[0], rate: event.target.value }, ...list.slice(1)])} /></label>
        <label>Accredito interessi<select value={credit} onChange={(event) => setCredit(event.target.value as DepositDetails["credit"])}>
          {CREDIT_FREQUENCIES.filter((key) => key !== "maturity" && key !== "upfront").map((key) => <option key={key} value={key}>{CREDIT_LABELS[key]}</option>)}</select></label>
        <label>Imposta di bollo<select value={stamp} onChange={(event) => setStamp(event.target.value as typeof stamp)}>
          <option value="client">A carico tuo</option><option value="bank">Pagata dalla banca (promozione)</option></select></label>
      </>}
    </div>
    <label className="check-row compact"><input type="checkbox" checked={emergency} onChange={(event) => setEmergency(event.target.checked)} />
      <span><strong>Conto del fondo di emergenza</strong><small>Mostrato a parte come fondo dedicato.</small></span></label>
    <details className="extra-options"><summary><Settings2 size={14} /> Opzioni avanzate</summary>
      <div className="form-grid">
        <label>Peso personalizzato % <span className="optional">vuoto = quello della disponibilità</span><input inputMode="decimal" value={weight} onChange={(event) => setWeight(event.target.value)} /></label>
        {kind !== "none" && <>
          <label>Calcolo dei giorni<select value={dayCount} onChange={(event) => setDayCount(event.target.value as typeof dayCount)}>
            <option value="365">Anno di 365 giorni</option><option value="360">Anno commerciale (360)</option><option value="actual">Giorni effettivi (365/366)</option></select></label>
          <label>Addebito del bollo<select value={stampCharge} onChange={(event) => setStampCharge(event.target.value as typeof stampCharge)}>
            <option value="quarterly">Trimestrale</option><option value="annual">Annuale</option><option value="daily">In proporzione ai giorni</option></select></label>
        </>}
      </div>
      {kind !== "none" && <fieldset className="schedule-fields"><legend>Tasso a fasi (promozioni)</legend>
        {steps.map((step, index) => <div className="form-grid" key={index}>
          <label>{index ? "Poi" : "Tasso"} %<input inputMode="decimal" value={step.rate} onChange={(event) => setSteps((list) => list.map((item, i) => (i === index ? { ...item, rate: event.target.value } : item)))} /></label>
          <label>Fino al <span className="optional">vuoto = per sempre</span><input type="date" value={step.until} onChange={(event) => setSteps((list) => list.map((item, i) => (i === index ? { ...item, until: event.target.value } : item)))} /></label>
        </div>)}
        {steps.length < 6 && <button type="button" className="text-button" onClick={() => setSteps((list) => [...list, { rate: "", until: "" }])}><Plus size={14} /> Aggiungi fase</button>}
      </fieldset>}
      {kind !== "none" && kind !== "current" && <fieldset className="schedule-fields"><legend>Vincoli (linee)</legend>
        {lines.map((line) => <div key={line.id} className="inline-editor">
          <div className="form-grid">
            <label>Importo €<input inputMode="decimal" value={line.amount} onChange={(event) => updateLine(line.id, { amount: event.target.value })} /></label>
            <label>Tasso %<input inputMode="decimal" value={line.rate} onChange={(event) => updateLine(line.id, { rate: event.target.value })} /></label>
            <label>Dal<input type="date" value={line.start} onChange={(event) => updateLine(line.id, { start: event.target.value })} /></label>
            <label>Al<input type="date" value={line.end} onChange={(event) => updateLine(line.id, { end: event.target.value })} /></label>
            <label>Accredito<select value={line.credit} onChange={(event) => updateLine(line.id, { credit: event.target.value as DepositLine["credit"] })}>
              {CREDIT_FREQUENCIES.map((key) => <option key={key} value={key}>{CREDIT_LABELS[key]}</option>)}</select></label>
            <label>Svincolo anticipato<select value={line.early} onChange={(event) => updateLine(line.id, { early: event.target.value as DepositLine["early"] })}>
              {Object.entries(EARLY_LABELS).map(([key, name]) => <option key={key} value={key}>{name}</option>)}</select></label>
            {line.early === "reduced-rate" && <label>Tasso ridotto %<input inputMode="decimal" value={line.earlyRate} onChange={(event) => updateLine(line.id, { earlyRate: event.target.value })} /></label>}
            <label>Preavviso (giorni)<input inputMode="numeric" value={line.noticeDays} onChange={(event) => updateLine(line.id, { noticeDays: event.target.value.replace(/\D/g, "").slice(0, 3) })} /></label>
          </div>
          <span className="archived-actions">
            <label className="check-row compact"><input type="checkbox" checked={line.closed} onChange={(event) => updateLine(line.id, { closed: event.target.checked })} /><span><strong>Chiuso</strong></span></label>
            <button type="button" className="icon-button quiet" aria-label="Togli il vincolo" onClick={() => setLines((list) => list.filter((item) => item.id !== line.id))}><Trash2 size={15} /></button>
          </span>
        </div>)}
        {lines.length < 20 && <button type="button" className="text-button" onClick={() => setLines((list) => [...list, {
          id: newId().slice(0, 12), amount: "", start: "", end: "", rate: "", credit: "maturity", early: "lose-interest", earlyRate: "", noticeDays: "", closed: false,
        }])}><Plus size={14} /> Aggiungi vincolo</button>}
        <p className="field-note">I vincoli fanno parte del saldo del conto: il fondo li conta con il peso del loro svincolo.</p>
      </fieldset>}
    </details>
    {error && <p className="form-error" role="alert">{error}</p>}
    <div className="modal-actions">
      <button type="button" className="button secondary" onClick={onClose}>Annulla</button>
      <button type="button" className="button primary" disabled={busy} onClick={save}>Salva</button>
    </div>
  </div>;
}

// ---------------------------------------------------------------- Scheda Fondo

export function FundTab({ ledger, today, busy, onCommit, onMove, onInterest, onSettings }: {
  ledger: Ledger; today: string; busy: boolean; onCommit: Commit;
  onMove: (account: Account, direction: "in" | "out") => void;
  onInterest: (account: Account, amount: number) => void;
  onSettings: () => void;
}) {
  const status = useMemo(() => fundStatus(ledger, today), [ledger, today]);
  const [editing, setEditing] = useState<string | null>(null);
  const year = Number(today.slice(0, 4));
  const params = paramsFor(ledger, year).value;
  const balances = useMemo(() => new Map(accountBalances(ledger, today.slice(0, 7)).map((item) => [item.account.id, item.amount])), [ledger, today]);
  const cashAccounts = ledger.accounts.filter((account) => (account.value.type === "cash" || account.value.type === "asset") && !account.value.archived);
  const share = status.target ? Math.min(1, status.weighted / status.target) : 0;
  const saving = (() => {
    const last = ledger.movements.filter(({ value }) => value.date >= `${year - 1}${today.slice(4)}` && value.date <= today);
    const income = last.reduce((sum, { value }) => sum + (value.type === "income" ? value.amount : 0), 0);
    const out = last.reduce((sum, { value }) => sum + (value.type === "expense" ? value.amount : value.type === "repayment" ? value.interest : 0), 0);
    return Math.round((income - out) / 12);
  })();
  const toTarget = monthsToTarget(status.missing, saving);

  return <>
    <section className="panel fund-panel">
      <PanelTitle title="Fondo di emergenza" subtitle={`Spese essenziali medie: ${money(status.essential)} al mese${status.estimatedEssentials ? " (tutte le spese: segna le categorie essenziali)" : ""}`}
        action={<button type="button" className="button secondary small" onClick={onSettings}><Settings2 size={15} /> Pesi e obiettivo</button>} />
      {status.essential > 0 ? <>
        <div className="kpi-grid">
          <div className="kpi"><small>Mesi coperti</small><strong>{months(status.monthsCovered)}</strong><span className="delta">liquidità pesata {money(status.weighted)}</span></div>
          <div className="kpi"><small>Coperti subito</small><strong>{months(status.monthsNow)}</strong><span className="delta">solo soldi disponibili oggi</span></div>
          <div className="kpi"><small>Obiettivo {status.settings.targetMonths} mesi</small><strong>{money(status.target)}</strong>
            <span className={`delta ${status.missing ? "bad-down" : "good-up"}`}>{status.missing ? `mancano ${money(status.missing)}` : "raggiunto"}</span></div>
          {status.dedicated > 0 && <div className="kpi"><small>Fondo dedicato</small><strong>{money(status.dedicated)}</strong></div>}
        </div>
        <div className="meter" aria-label={`Obiettivo raggiunto al ${Math.round(share * 100)}%`}><i style={{ width: `${share * 100}%` }} /></div>
        {status.missing > 0 && <p className="panel-note">{toTarget !== null
          ? `Al ritmo di risparmio dell’ultimo anno (${money(saving)} al mese) arrivi all’obiettivo in circa ${toTarget} ${toTarget === 1 ? "mese" : "mesi"}.`
          : "Nell’ultimo anno il risparmio è stato nullo o negativo: l’obiettivo non si avvicina."}</p>}
        {status.monthsCovered !== null && status.monthsNow !== null && status.monthsNow < status.monthsCovered / 2 && <p className="tax-warnings"><AlertTriangle size={15} /> Più di metà del fondo è vincolata: in un’emergenza i soldi disponibili subito coprono solo {months(status.monthsNow)}.</p>}
        <div className="table-scroll"><table className="data-table compact-table">
          <thead><tr><th scope="col">Dove</th><th scope="col">Disponibilità</th><th scope="col" className="number">Importo</th><th scope="col" className="number">Peso</th><th scope="col" className="number">Conta</th></tr></thead>
          <tbody>{status.rows.map((row, index) => <tr key={`${row.account.id}-${index}`}>
            <td>{row.label}</td><td>{BUCKET_LABELS[row.bucket]}</td><td className="number">{money(row.amount)}</td>
            <td className="number">{row.weight}%</td><td className="number">{money(row.weighted)}</td></tr>)}</tbody>
        </table></div>
      </> : <Empty icon={<LifeBuoy size={22} />} title="Servono le spese degli ultimi mesi">Registra qualche mese di spese e i saldi dei conti per calcolare i mesi coperti.</Empty>}
      {status.banks.filter((bank) => bank.over).map((bank) => <p key={bank.bank} className="tax-warnings"><AlertTriangle size={15} />
        Presso «{bank.bank}» hai {money(bank.amount)}: oltre {money(params.depositGuarantee)} i depositi non sono garantiti dal Fondo Interbancario. Valuta di dividerli tra più banche.</p>)}
    </section>

    <section className="panel">
      <PanelTitle title="Conti e conti deposito" subtitle="Tasso, accredito degli interessi, bollo, vincoli e disponibilità dei soldi." />
      <ul className="rule-list">{cashAccounts.map((account) => {
        const deposit = account.value.deposit;
        const balance = balances.get(account.id) ?? 0;
        const locked = activeLines(deposit, today).reduce((sum, line) => sum + line.amount, 0);
        const estimate = deposit ? depositYear(account, (balance ?? 0) - locked, year, params, today) : null;
        return <li key={account.id} className="deduction-row">
          <div><strong>{account.value.name}{account.value.liquidity?.emergency ? " · fondo di emergenza" : ""}</strong>
            <small>{money(balance)} · {BUCKET_LABELS[account.value.liquidity?.availability ?? (deposit?.kind === "locked" ? "long" : "now")]}
              {deposit && ` · ${stepsText(deposit.rates)} · accredito ${CREDIT_LABELS[deposit.credit].toLowerCase()}${deposit.stamp === "bank" ? " · bollo pagato dalla banca" : ""}`}</small>
            {estimate && <small>Interessi {year} stimati: lordi {money(estimate.gross)} − ritenuta {money(estimate.withholding)} − bollo {money(estimate.stamp)} = <b>netti {money(estimate.net)}</b>
              {estimate.nextCredit && ` · prossimo accredito ${estimate.nextCredit.split("-").reverse().join("/")}`}</small>}
            {estimate?.lines.map(({ line, gross }) => <small key={line.id}>Vincolo {money(line.amount)} al {line.rates[0]?.rate}% fino al {line.end.split("-").reverse().join("/")} · {EARLY_LABELS[line.early]} · lordi {money(Math.round(gross))}</small>)}
            {editing === account.id && <DepositEditor account={account} busy={busy} onCommit={onCommit} onClose={() => setEditing(null)} />}</div>
          {editing !== account.id && <span className="archived-actions">
            <button type="button" className="text-button" disabled={busy} onClick={() => onMove(account, "in")}><Plus size={14} /> Deposita</button>
            <button type="button" className="text-button" disabled={busy} onClick={() => onMove(account, "out")}><Minus size={14} /> Preleva</button>
            {estimate && estimate.net > 0 && <button type="button" className="text-button" disabled={busy} onClick={() => onInterest(account, Math.round(estimate.net / (deposit?.credit === "monthly" ? 12 : deposit?.credit === "quarterly" ? 4 : deposit?.credit === "semiannual" ? 2 : 1)))}><PiggyBank size={14} /> Registra interessi</button>}
            <button type="button" className="text-button" onClick={() => setEditing(account.id)}><Settings2 size={14} /> Configura</button>
          </span>}
        </li>;
      })}</ul>
    </section>
  </>;
}

// ---------------------------------------------------------------- Impostazioni del fondo

export function FundSettingsPanel({ ledger, busy, onCommit, settingsAction }: {
  ledger: Ledger; busy: boolean; onCommit: Commit; settingsAction: (change: Partial<Ledger["settings"]>) => Mutation;
}) {
  const current = ledger.settings.fund ?? { weights: { now: 100, days: 95, month: 70, long: 0, investment: 50 }, targetMonths: 6, includeInvestments: false };
  const [weights, setWeights] = useState<Record<string, string>>(Object.fromEntries(Object.entries(current.weights).map(([key, value]) => [key, String(value)])));
  const [target, setTarget] = useState(String(current.targetMonths));
  const [investments, setInvestments] = useState(current.includeInvestments);
  const [error, setError] = useState("");
  const labels = ledger.labels.filter((label) => label.value.type === "expense" && !label.value.archived);

  function save() {
    const parsed: Record<string, number> = {};
    for (const [key, text] of Object.entries(weights)) {
      const value = percentValue(text);
      if (value === null || value < 0 || value > 100) { setError("I pesi devono essere tra 0 e 100."); return; }
      parsed[key] = value;
    }
    const months = percentValue(target);
    if (months === null || months < 1 || months > 36) { setError("L’obiettivo deve essere tra 1 e 36 mesi."); return; }
    setError("");
    onCommit([settingsAction({ fund: { weights: parsed as typeof current.weights, targetMonths: months, includeInvestments: investments } })], "Impostazioni del fondo salvate.");
  }

  return <section className="panel settings-extra">
    <PanelTitle title="Fondo di emergenza" subtitle="Quanto conta ogni tipo di liquidità nei mesi coperti, l’obiettivo e le spese essenziali." />
    <div className="params-grid">
      {(Object.keys(current.weights) as (keyof typeof current.weights)[]).map((key) => <label key={key}>{BUCKET_LABELS[key]} (%)
        <input inputMode="decimal" value={weights[key]} onChange={(event) => setWeights((old) => ({ ...old, [key]: event.target.value }))} /></label>)}
      <label>Obiettivo (mesi)<input inputMode="decimal" value={target} onChange={(event) => setTarget(event.target.value)} /></label>
    </div>
    <label className="check-row compact"><input type="checkbox" checked={investments} onChange={(event) => setInvestments(event.target.checked)} />
      <span><strong>Conta anche gli investimenti</strong><small>Con il loro peso: il valore può scendere proprio quando servono.</small></span></label>
    {error && <p className="form-error" role="alert">{error}</p>}
    <button type="button" className="button secondary" disabled={busy} onClick={save}>Salva</button>
    <p className="panel-note">Categorie essenziali (contano per le spese mensili da coprire; le rate dei debiti contano sempre):</p>
    <div className="favorite-bar wrap">{labels.map((label) => <label key={label.id} className="check-row compact">
      <input type="checkbox" checked={!!label.value.essential} disabled={busy}
        onChange={(event) => onCommit([{ op: "save", record: { ...label, value: { ...label.value, essential: event.target.checked || undefined } } }], "Categoria aggiornata.")} />
      <span><strong>{label.value.name}</strong></span></label>)}</div>
  </section>;
}
