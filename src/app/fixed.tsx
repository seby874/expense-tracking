import { useMemo, useState } from "react";
import { AlertTriangle, Plus, Repeat, Settings2, TrendingDown, TrendingUp, X } from "lucide-react";
import { MONTHS, isDiscreet, money, parseMoney, shortDate, yearMonths, type Fixed, type Ledger, type Movement, type Mutation, type Recurring } from "../lib/ledger";
import {
  FIXED_KIND_LABELS, FIXED_STATUS_LABELS, competenceByMonth, fixedOverview, nextBillEstimate, occurrencesOf, recurringCandidates, type FixedItem,
} from "../lib/fixed";
import { Empty, PanelTitle } from "./ledger-views";

type Commit = (actions: Mutation[], message: string) => void;

const DISMISS_KEY = "et-fixed-dismissed";

function readDismissed(): Set<string> {
  try { return new Set(JSON.parse(window.localStorage.getItem(DISMISS_KEY) ?? "[]") as string[]); } catch { return new Set(); }
}

function saveDismissed(list: Set<string>) {
  try { window.localStorage.setItem(DISMISS_KEY, JSON.stringify([...list].slice(-200))); } catch { /* preferenza facoltativa */ }
}

function euro(cents: number | undefined) {
  return cents ? (cents / 100).toFixed(2).replace(".", ",") : "";
}

// ---------------------------------------------------------------- Editor della spesa fissa

function FixedEditor({ item, today, busy, onCommit, onClose }: { item: FixedItem; today: string; busy: boolean; onCommit: Commit; onClose: () => void }) {
  const current = item.fixed;
  const [kind, setKind] = useState<Fixed["kind"]>(current?.kind ?? "subscription");
  const [status, setStatus] = useState<Fixed["status"]>(current?.status ?? "active");
  const [trialEnd, setTrialEnd] = useState(current?.trialEnd ?? "");
  const [cancelBy, setCancelBy] = useState(current?.cancelBy ?? "");
  const [noticeDays, setNoticeDays] = useState(current?.noticeDays ? String(current.noticeDays) : "");
  const [share, setShare] = useState(current?.share ? String(current.share) : "100");
  const [suspended, setSuspended] = useState<number[]>(current?.suspendedMonths ?? []);
  const [priceFrom, setPriceFrom] = useState(today);
  const [priceAmount, setPriceAmount] = useState("");
  const [error, setError] = useState("");

  function save() {
    const shareValue = Number(share.replace(",", "."));
    if (!Number.isFinite(shareValue) || shareValue < 1 || shareValue > 100) { setError("La tua quota deve essere tra 1 e 100%."); return; }
    let prices = [...(current?.prices ?? [])];
    let template = item.recurring.value.template;
    if (priceAmount.trim()) {
      const amount = parseMoney(priceAmount);
      if (amount === null || amount <= 0 || !priceFrom) { setError("Controlla il nuovo prezzo e la data."); return; }
      // Il prezzo di partenza entra nello storico, così la variazione si vede.
      if (!prices.length) prices = [{ from: item.recurring.value.schedule.start, amount: template.amount }];
      prices = [...prices.filter((entry) => entry.from !== priceFrom), { from: priceFrom, amount }].sort((a, b) => a.from.localeCompare(b.from)).slice(-60);
      if (priceFrom <= today) template = { ...template, amount } as typeof template;
    }
    const fixed: Fixed = {
      kind, status,
      ...(trialEnd ? { trialEnd } : {}), ...(cancelBy ? { cancelBy } : {}), ...(noticeDays ? { noticeDays: Number(noticeDays) } : {}),
      ...(suspended.length ? { suspendedMonths: [...suspended].sort((a, b) => a - b) } : {}), ...(prices.length ? { prices } : {}),
      ...(shareValue !== 100 ? { share: shareValue } : {}), ...(current?.since ? { since: current.since } : {}),
    };
    const value = { ...item.recurring.value, template, fixed };
    // Disdetto: le scadenze non vengono più proposte.
    if (status === "cancelled") value.paused = true;
    onCommit([{ op: "save", record: { ...item.recurring, value } }], "Spesa fissa aggiornata.");
    onClose();
  }

  return <div className="editor inline-editor">
    <div className="form-grid">
      <label>Tipo<select value={kind} onChange={(event) => setKind(event.target.value as Fixed["kind"])}>
        {Object.entries(FIXED_KIND_LABELS).map(([key, name]) => <option key={key} value={key}>{name}</option>)}</select></label>
      <label>Stato<select value={status} onChange={(event) => setStatus(event.target.value as Fixed["status"])}>
        {Object.entries(FIXED_STATUS_LABELS).map(([key, name]) => <option key={key} value={key}>{name}</option>)}</select></label>
      <label>Nuovo prezzo € <span className="optional">facoltativo</span><input inputMode="decimal" placeholder={isDiscreet() ? "" : euro(item.price)} value={priceAmount} onChange={(event) => setPriceAmount(event.target.value)} /></label>
      <label>…in vigore dal<input type="date" value={priceFrom} onChange={(event) => setPriceFrom(event.target.value)} /></label>
    </div>
    <details className="extra-options" open={!!(trialEnd || cancelBy || suspended.length || share !== "100")}><summary><Settings2 size={14} /> Opzioni avanzate</summary>
      <div className="form-grid">
        <label>Fine della prova gratuita<input type="date" value={trialEnd} onChange={(event) => setTrialEnd(event.target.value)} /></label>
        <label>Disdire entro il<input type="date" value={cancelBy} onChange={(event) => setCancelBy(event.target.value)} /></label>
        <label>Preavviso di disdetta (giorni)<input inputMode="numeric" value={noticeDays} onChange={(event) => setNoticeDays(event.target.value.replace(/\D/g, "").slice(0, 3))} /></label>
        <label>La tua quota % <span className="optional">se condiviso</span><input inputMode="decimal" value={share} onChange={(event) => setShare(event.target.value)} /></label>
      </div>
      <p className="field-note">Mesi di sospensione (nessun addebito, es. palestra d’estate):</p>
      <div className="favorite-bar wrap">{MONTHS.map((name, index) => <label key={name} className="check-row compact">
        <input type="checkbox" checked={suspended.includes(index + 1)}
          onChange={(event) => setSuspended((list) => event.target.checked ? [...list, index + 1] : list.filter((value) => value !== index + 1))} />
        <span><strong>{name.slice(0, 3)}</strong></span></label>)}</div>
    </details>
    {error && <p className="form-error" role="alert">{error}</p>}
    <div className="modal-actions">
      <button type="button" className="button secondary" onClick={onClose}>Annulla</button>
      <button type="button" className="button primary" disabled={busy} onClick={save}>Salva</button>
    </div>
  </div>;
}

// ---------------------------------------------------------------- Bollette: cassa e competenza

function BillsTable({ ledger, bills, year }: { ledger: Ledger; bills: Recurring[]; year: number }) {
  const [mode, setMode] = useState<"cash" | "competence">("competence");
  const months = yearMonths(year);
  const rows = bills.map((recurring) => {
    const occurrences = occurrencesOf(ledger, recurring);
    const values = mode === "competence"
      ? competenceByMonth(occurrences, months)
      : new Map(months.map((month) => [month, occurrences.filter(({ value }) => value.date.startsWith(month)).reduce((sum, { value }) => sum + value.amount, 0)]));
    return { recurring, values };
  });
  if (!rows.length) return null;
  return <section className="panel">
    <PanelTitle title={`Bollette ${year}`} subtitle={mode === "competence" ? "Per competenza: ogni bolletta divisa sui mesi che copre." : "Per cassa: nel mese in cui paghi."}
      action={<div className="segmented small-text" role="group" aria-label="Cassa o competenza">
        <button type="button" aria-pressed={mode === "competence"} onClick={() => setMode("competence")}>Competenza</button>
        <button type="button" aria-pressed={mode === "cash"} onClick={() => setMode("cash")}>Cassa</button></div>} />
    <div className="table-scroll"><table className="data-table compact-table">
      <thead><tr><th scope="col">Bolletta</th>{months.map((month) => <th key={month} scope="col" className="number">{MONTHS[Number(month.slice(5)) - 1].slice(0, 3)}</th>)}<th scope="col" className="number">Anno</th></tr></thead>
      <tbody>{rows.map(({ recurring, values }) => <tr key={recurring.id}>
        <td>{recurring.value.template.title}</td>
        {months.map((month) => <td key={month} className="number">{values.get(month) ? money(values.get(month)!) : "—"}</td>)}
        <td className="number">{money(months.reduce((sum, month) => sum + (values.get(month) ?? 0), 0))}</td>
      </tr>)}</tbody>
    </table></div>
    <p className="panel-note">Per la competenza indica nella bolletta il periodo coperto (Altre opzioni → Periodo di competenza).</p>
  </section>;
}

// ---------------------------------------------------------------- Vista

export function FixedView({ ledger, today, year, busy, onCommit, onNewRecurring, onMakeRecurring }: {
  ledger: Ledger; today: string; year: number; busy: boolean; onCommit: Commit;
  onNewRecurring: () => void; onMakeRecurring: (movement: Movement) => void;
}) {
  const overview = useMemo(() => fixedOverview(ledger, today), [ledger, today]);
  const [dismissed, setDismissed] = useState(readDismissed);
  const candidates = useMemo(() => recurringCandidates(ledger, today, dismissed), [ledger, today, dismissed]);
  const [editing, setEditing] = useState<string | null>(null);
  const groups: [string, FixedItem[]][] = [
    ["Abbonamenti", overview.items.filter((item) => item.kind === "subscription")],
    ["Spese fisse", overview.items.filter((item) => item.kind === "fixed")],
    ["Bollette", overview.items.filter((item) => item.kind === "bill")],
    ["Da classificare", overview.items.filter((item) => !item.kind)],
  ];
  const alerts = overview.items.filter((item) => item.alert);
  const bills = overview.items.filter((item) => item.kind === "bill").map((item) => item.recurring);

  function dismiss(key: string) {
    const next = new Set(dismissed);
    next.add(key);
    saveDismissed(next);
    setDismissed(next);
  }

  return <>
    <section className="panel">
      <PanelTitle title="Spese fisse e abbonamenti" subtitle="Dai movimenti ricorrenti: costo mensile e annuo, prezzi, disdette."
        action={<button type="button" className="button secondary small" onClick={onNewRecurring}><Plus size={15} /> Nuovo ricorrente</button>} />
      {overview.items.length ? <>
        <div className="kpi-grid">
          <div className="kpi"><small>Al mese</small><strong>{money(overview.monthly)}</strong></div>
          <div className="kpi"><small>All’anno</small><strong>{money(overview.yearly)}</strong></div>
          {overview.incomeShare !== null && <div className="kpi"><small>Delle entrate</small><strong>{Math.round(overview.incomeShare * 100)}%</strong></div>}
        </div>
        {alerts.length > 0 && <ul className="tax-warnings">{alerts.map((item) => <li key={item.recurring.id}><AlertTriangle size={15} /> <b>{item.recurring.value.template.title}</b>: {item.alert}</li>)}</ul>}
        {groups.filter(([, items]) => items.length).map(([name, items]) => <div key={name}>
          <h3 className="group-title">{name} · {money(items.reduce((sum, item) => sum + item.monthly, 0))}/mese</h3>
          <ul className="rule-list">{items.map((item) => {
            const { value } = item.recurring;
            const estimate = item.kind === "bill" ? nextBillEstimate(ledger, item.recurring, today) : null;
            return <li key={item.recurring.id} className="deduction-row">
              <div><strong>{value.template.title}{item.fixed && item.fixed.status !== "active" ? ` · ${FIXED_STATUS_LABELS[item.fixed.status].toLowerCase()}` : ""}</strong>
                <small>{money(item.price)} {value.schedule.frequency === "monthly" && value.schedule.every === 1 ? "al mese" : `ogni ${value.schedule.every > 1 ? value.schedule.every + " " : ""}${value.schedule.frequency === "weekly" ? "settimana" : value.schedule.frequency === "monthly" ? "mesi" : "anno"}`.replace("ogni 1 ", "ogni ")}
                  {` · ${money(item.monthly)}/mese · ${money(item.yearly)}/anno`}
                  {item.fixed?.share && item.fixed.share < 100 ? ` · tua quota ${item.fixed.share}%` : ""}
                  {item.next && ` · prossimo ${shortDate(item.next)}${estimate ? ` (stima ${money(estimate)})` : ""}`}</small>
                {item.change && <small className={item.change.to > item.change.from ? "status-warn" : "status-ok"}>
                  {item.change.to > item.change.from ? <TrendingUp size={12} /> : <TrendingDown size={12} />} {money(item.change.from)} → {money(item.change.to)} dal {shortDate(item.change.date)}</small>}
                {item.totalPaid > 0 && <small>Pagato finora: {money(item.totalPaid)}</small>}
                {editing === item.recurring.id && <FixedEditor item={item} today={today} busy={busy} onCommit={onCommit} onClose={() => setEditing(null)} />}</div>
              {editing !== item.recurring.id && <button type="button" className="text-button" onClick={() => setEditing(item.recurring.id)}><Settings2 size={14} /> {item.kind ? "Gestisci" : "Classifica"}</button>}
            </li>;
          })}</ul>
        </div>)}
      </> : <Empty icon={<Repeat size={22} />} title="Nessuna spesa ricorrente">Crea un ricorrente (affitto, bollette, abbonamenti) per vedere qui quanto ti costano.</Empty>}
    </section>
    {candidates.length > 0 && <section className="panel">
      <PanelTitle title="Possibili spese ricorrenti" subtitle="Spese simili ogni mese che non sono ancora ricorrenti." />
      <ul className="rule-list">{candidates.map((item) => <li key={item.key}>
        <div><strong>{item.title}</strong><small>circa {money(item.amount)} · {item.months} mesi di fila</small></div>
        <span className="archived-actions">
          <button type="button" className="text-button" onClick={() => onMakeRecurring(item.last)}><Repeat size={14} /> Rendi ricorrente</button>
          <button type="button" className="icon-button quiet" aria-label={`Ignora ${item.title}`} onClick={() => dismiss(item.key)}><X size={15} /></button>
        </span>
      </li>)}</ul>
    </section>}
    <BillsTable ledger={ledger} bills={bills} year={year} />
  </>;
}
