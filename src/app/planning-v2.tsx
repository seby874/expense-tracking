import { useMemo, useState } from "react";
import {
  CalendarDays, CheckCircle2, ChevronLeft, ChevronRight, CircleAlert, CopyX, DatabaseBackup, FileText, Gauge, HandCoins, Landmark, HeartHandshake, LifeBuoy, Pencil, Plus, ReceiptText,
  Printer, Repeat, Scale, Telescope, Timer, Trash2, Users, WalletCards, type LucideIcon,
} from "lucide-react";
import {
  DEADLINE_TYPES, MONTHS, NO_VERSION, accountBalances, isDiscreet, money, monthLabel, newId, rate, shiftMonth, shortDate,
  type Deadline, type Ledger, type Mutation,
} from "../lib/ledger";
import { allYears, categoryDeltas, inflationFactor, monthlyExpenses, tagDeltas, yearKpi, type YearKpi } from "../lib/yoy";
import { projection, requiredSaving } from "../lib/projection";
import { DEFAULT_PROJECTION } from "../lib/params";
import { calendarEvents } from "../lib/calendar";
import { DEADLINE_LABELS, completeDeadline, daysUntil, deadlineState } from "../lib/deadlines";
import { annualReport, reportYears } from "../lib/report";
import { fixedOverview } from "../lib/fixed";
import { maskTaxCode, personName } from "../lib/people";
import { debtStatus } from "../lib/debts";
import type { HealthCheck } from "../lib/health";
import { Empty, PanelTitle } from "./ledger-views";
import { PanelHead } from "./settings-extra";
import { getAppearance } from "../lib/theme-runtime";

type Commit = (actions: Mutation[], message: string) => void;

function pct(now: number, before: number) {
  return before ? `${now >= before ? "+" : "−"}${Math.abs(Math.round((now / before - 1) * 100))}%` : "—";
}

function signed(value: number) {
  return `${value >= 0 ? "+" : "−"}${money(Math.abs(value))}`;
}

// ---------------------------------------------------------------- Anno su anno

const KPI_ROWS: [keyof YearKpi, string, boolean][] = [
  ["income", "Entrate", true], ["expense", "Spese", false], ["saving", "Risparmio", true], ["interest", "Interessi pagati", false],
  ["repaid", "Capitale rimborsato", true], ["invested", "Versato negli investimenti", true], ["worthEnd", "Patrimonio a fine periodo", true],
];

export function YoyView({ ledger, today }: { ledger: Ledger; today: string }) {
  const current = Number(today.slice(0, 4));
  const years = useMemo(() => [...new Set([current, ...ledger.movements.map(({ value }) => Number(value.date.slice(0, 4)))])].sort((a, b) => b - a), [ledger, current]);
  const [b, setB] = useState(current);
  const [a, setA] = useState(current - 1);
  const [samePeriod, setSamePeriod] = useState(true);
  const [real, setReal] = useState(false);
  const cutoff = samePeriod && b === current ? today.slice(5) : null;
  const factor = real ? inflationFactor(ledger, a, b) : 1;
  const kpiA = useMemo(() => yearKpi(ledger, a, cutoff), [ledger, a, cutoff]);
  const kpiB = useMemo(() => yearKpi(ledger, b, cutoff), [ledger, b, cutoff]);
  const categories = useMemo(() => categoryDeltas(ledger, a, b, cutoff), [ledger, a, b, cutoff]);
  const monthsA = useMemo(() => monthlyExpenses(ledger, a, cutoff), [ledger, a, cutoff]);
  const monthsB = useMemo(() => monthlyExpenses(ledger, b, cutoff), [ledger, b, cutoff]);
  const tags = useMemo(() => tagDeltas(ledger, a, b, cutoff), [ledger, a, b, cutoff]);
  const trend = useMemo(() => allYears(ledger), [ledger]);
  const peak = Math.max(1, ...monthsA, ...monthsB);
  const trendPeak = Math.max(1, ...trend.map((row) => Math.max(row.income, row.expense)));
  const adj = (value: number) => Math.round(value * factor);

  return <>
    <section className="panel">
      <PanelTitle title="Anno su anno" subtitle={`${cutoff ? `Dal 1° gennaio al ${cutoff.split("-").reverse().join("/")} di entrambi gli anni` : "Anni interi"} · anno solare, anche con l’inizio del mese personalizzato`}
        action={<span className="archived-actions">
          <select aria-label="Primo anno" value={a} onChange={(event) => setA(Number(event.target.value))}>{years.map((year) => <option key={year} value={year}>{year}</option>)}</select>
          <span>contro</span>
          <select aria-label="Secondo anno" value={b} onChange={(event) => setB(Number(event.target.value))}>{years.map((year) => <option key={year} value={year}>{year}</option>)}</select>
        </span>} />
      <div className="favorite-bar wrap">
        <label className="check-row compact"><input type="checkbox" checked={samePeriod} onChange={(event) => setSamePeriod(event.target.checked)} />
          <span><strong>A parità di periodo</strong><small>Per l’anno in corso.</small></span></label>
        <label className="check-row compact"><input type="checkbox" checked={real} onChange={(event) => setReal(event.target.checked)} />
          <span><strong>Valori del {a} a prezzi del {b}</strong><small>Con l’inflazione inserita nei parametri di ogni anno.</small></span></label>
      </div>
      <div className="table-scroll" tabIndex={0}><table className="data-table compact-table">
        <thead><tr><th scope="col"><span className="sr-only">Voce</span></th><th scope="col" className="number">{a}</th><th scope="col" className="number">{b}</th><th scope="col" className="number">Differenza</th><th scope="col" className="number">%</th></tr></thead>
        <tbody>
          {KPI_ROWS.map(([key, name, goodUp]) => {
            const x = kpiA[key] as number | null;
            const y = kpiB[key] as number | null;
            if (x === null || y === null) return <tr key={key}><td>{name}</td><td className="number">{money(x)}</td><td className="number">{money(y)}</td><td /><td /></tr>;
            const diff = y - adj(x);
            return <tr key={key}><td>{name}</td><td className="number">{money(adj(x))}</td><td className="number">{money(y)}</td>
              <td className={`number delta ${diff === 0 ? "" : (diff > 0) === goodUp ? "good-up" : "bad-down"}`}>{signed(diff)}</td><td className="number">{pct(y, adj(x))}</td></tr>;
          })}
          <tr><td>Tasso di risparmio</td><td className="number">{rate(kpiA.rate)}</td><td className="number">{rate(kpiB.rate)}</td>
            <td className="number">{kpiA.rate !== null && kpiB.rate !== null ? `${((kpiB.rate - kpiA.rate) * 100).toLocaleString("it-IT", { maximumFractionDigits: 1 })} pt` : "—"}</td><td /></tr>
        </tbody>
      </table></div>
    </section>
    <section className="panel">
      <PanelTitle title="Spese mese per mese" subtitle={`${a} (chiaro) e ${b} (scuro)`} />
      <div className="mini-bars" aria-hidden="true">{MONTHS.map((name, index) => <span key={name} className="mini-pair">
        <span style={{ height: `${monthsA[index] / peak * 100}%` }} />
        <span className="current" style={{ height: `${monthsB[index] / peak * 100}%` }} /></span>)}</div>
      <div className="table-scroll" tabIndex={0}><table className="data-table compact-table">
        <thead><tr><th scope="col">Mese</th><th scope="col" className="number">{a}</th><th scope="col" className="number">{b}</th><th scope="col" className="number">Differenza</th></tr></thead>
        <tbody>{MONTHS.map((name, index) => (monthsA[index] || monthsB[index]) ? <tr key={name}><td>{name}</td><td className="number">{money(adj(monthsA[index]))}</td>
          <td className="number">{money(monthsB[index])}</td><td className="number">{signed(monthsB[index] - adj(monthsA[index]))}</td></tr> : null)}</tbody>
      </table></div>
    </section>
    <section className="panel">
      <PanelTitle title="Categorie" subtitle="Ordinate per variazione: apri per vedere le sottocategorie." />
      {categories.length ? <ul className="breakdown-list">{categories.map((item) => <li key={item.id}><details><summary>
        <span>{item.name}</span><strong>{money(adj(item.a))} → {money(item.b)} <small className={`delta ${item.delta > 0 ? "up" : "down"}`}>{signed(item.b - adj(item.a))} ({pct(item.b, adj(item.a))})</small></strong>
      </summary><ul className="subcategories">{item.subs.map((sub) => <li key={sub.name}><span>{sub.name}</span><b>{money(adj(sub.a))} → {money(sub.b)} ({signed(sub.b - adj(sub.a))})</b></li>)}</ul>
      </details></li>)}</ul> : <Empty icon={<FileText size={22} />} title="Nessuna spesa da confrontare">Scegli due anni con dei movimenti.</Empty>}
    </section>
    {tags.length > 0 && <section className="panel">
      <PanelTitle title="Tag" subtitle="Spese con tag nei due anni." />
      <ul className="rule-list">{tags.slice(0, 20).map((item) => <li key={item.tag}><div><strong>#{item.tag}</strong></div>
        <span>{money(adj(item.a))} → {money(item.b)}</span></li>)}</ul>
    </section>}
    {trend.length > 1 && <section className="panel">
      <PanelTitle title="Tutti gli anni" subtitle="Tendenza di lungo periodo." />
      <div className="table-scroll" tabIndex={0}><table className="data-table compact-table">
        <thead><tr><th scope="col">Anno</th><th scope="col" className="number">Entrate</th><th scope="col" className="number">Spese</th><th scope="col" className="number">Risparmio</th><th scope="col" className="number">Tasso</th><th scope="col" className="number">Patrimonio a fine anno</th><th scope="col">Spese</th></tr></thead>
        <tbody>{trend.map((row) => <tr key={row.year}><td>{row.year}</td><td className="number">{money(row.income)}</td><td className="number">{money(row.expense)}</td>
          <td className="number">{money(row.saving)}</td><td className="number">{rate(row.rate)}</td><td className="number">{money(row.worthEnd)}</td>
          <td><div className="meter"><i style={{ width: `${row.expense / trendPeak * 100}%` }} /></div></td></tr>)}</tbody>
      </table></div>
    </section>}
  </>;
}

// ---------------------------------------------------------------- Proiezione

export function ProjectionTab({ ledger, today, busy, onCommit, settingsAction }: {
  ledger: Ledger; today: string; busy: boolean; onCommit: Commit; settingsAction: (change: Partial<Ledger["settings"]>) => Mutation;
}) {
  const saved = ledger.settings.projection ?? DEFAULT_PROJECTION;
  const [years, setYears] = useState(10);
  const [returns, setReturns] = useState(String(saved.returns));
  const [inflation, setInflation] = useState(String(saved.inflation));
  const [growth, setGrowth] = useState(String(saved.incomeGrowth));
  const [target, setTarget] = useState("");
  const parse = (text: string, fallback: number) => { const value = Number(text.replace(",", ".")); return Number.isFinite(value) && text.trim() ? value : fallback; };
  const settings = { returns: parse(returns, saved.returns), inflation: parse(inflation, saved.inflation), incomeGrowth: parse(growth, saved.incomeGrowth) };
  const result = useMemo(() => projection(ledger, today, years, settings),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [ledger, today, years, settings.returns, settings.inflation, settings.incomeGrowth]);
  const last = result.points.at(-1);
  const top = Math.max(1, ...result.points.map((point) => point.high));
  const goal = target.trim() ? Math.round(parse(target, 0) * 100) : null;
  const needed = goal ? requiredSaving(result.start, goal, years, settings.returns, result.investedShare) : null;
  const point = (value: number, index: number) => `${(index + 1) / result.points.length * 300},${120 - Math.max(0, value) / top * 115}`;

  return <section className="panel">
    <PanelTitle title="Proiezione del patrimonio" subtitle={`Parte da oggi (${money(result.start)}) e dal tuo risparmio medio (${money(result.monthlySaving)} al mese, ultimi 24 mesi).`}
      action={<select aria-label="Orizzonte" value={years} onChange={(event) => setYears(Number(event.target.value))}>
        {[1, 5, 10, 20, 30].map((value) => <option key={value} value={value}>{value} {value === 1 ? "anno" : "anni"}</option>)}</select>} />
    <div className="sim-grid">
      <label>Rendimento investimenti % annuo<input inputMode="decimal" value={returns} onChange={(event) => setReturns(event.target.value)} /></label>
      <label>Inflazione % annua<input inputMode="decimal" value={inflation} onChange={(event) => setInflation(event.target.value)} /></label>
      <label>Crescita del risparmio % annua<input inputMode="decimal" value={growth} onChange={(event) => setGrowth(event.target.value)} /></label>
      <label>Obiettivo (€) <span className="optional">domanda inversa</span><input inputMode="decimal" value={target} onChange={(event) => setTarget(event.target.value)} placeholder="es. 150000" /></label>
    </div>
    <button type="button" className="text-button" disabled={busy} onClick={() => onCommit([settingsAction({ projection: settings })], "Ipotesi salvate.")}>Salva queste ipotesi</button>
    {last && <div className="kpi-grid">
      <div className="kpi"><small>Nel {last.year}</small><strong>{money(last.value)}</strong><span className="delta">a prezzi di oggi {money(last.real)}</span></div>
      <div className="kpi"><small>Fascia</small><strong>{money(last.low)} – {money(last.high)}</strong><span className="delta">pessimista – ottimista</span></div>
      {needed !== null && <div className="kpi"><small>Per arrivare a {money(goal)} nel {last.year}</small><strong>{money(needed)}/mese</strong><span className="delta">di risparmio</span></div>}
    </div>}
    {result.points.length > 0 && <div className="chart-box" aria-hidden="true"><svg viewBox="0 0 300 120" preserveAspectRatio="none">
      <polygon className="chart-band" fill="var(--accent)" points={[...result.points.map((p, i) => point(p.high, i)), ...[...result.points].reverse().map((p, i) => point(p.low, result.points.length - 1 - i))].join(" ")} />
      <polyline className="chart-line" stroke="var(--accent)" points={result.points.map((p, i) => point(p.value, i)).join(" ")} />
      <polyline className="chart-line" stroke="var(--muted)" strokeDasharray="4 3" points={result.points.map((p, i) => point(p.real, i)).join(" ")} />
    </svg></div>}
    {result.milestones.length > 0 && <ul className="status-list">{result.milestones.map((item) => <li key={item.date + item.text}>
      <Telescope size={15} /><div><strong>{item.text}</strong><small>{monthLabel(item.date.slice(0, 7))}</small></div></li>)}</ul>}
    <p className="panel-note">Sono ipotesi, non previsioni: il rendimento si applica solo alla parte investita ({Math.round(result.investedShare * 100)}% del patrimonio).</p>
  </section>;
}

// ---------------------------------------------------------------- Calendario

const WEEKDAYS = ["Lun", "Mar", "Mer", "Gio", "Ven", "Sab", "Dom"];

export function CalendarView({ ledger, today }: { ledger: Ledger; today: string }) {
  const [month, setMonth] = useState(today.slice(0, 7));
  const [list, setList] = useState(false);
  const events = useMemo(() => calendarEvents(ledger, month, today), [ledger, month, today]);
  const first = new Date(`${month}-01T12:00:00Z`);
  // Primo giorno della settimana scelto in Impostazioni → Aspetto → Numeri e date.
  const sunday = getAppearance().numbers.weekStart === "sunday";
  const weekdays = sunday ? ["Dom", ...WEEKDAYS.slice(0, 6)] : WEEKDAYS;
  const offset = sunday ? first.getUTCDay() : (first.getUTCDay() + 6) % 7;
  const days = new Date(Date.UTC(first.getUTCFullYear(), first.getUTCMonth() + 1, 0)).getUTCDate();
  const cells = Array.from({ length: Math.ceil((offset + days) / 7) * 7 }, (_, index) => index - offset + 1);
  const totalOut = events.filter((event) => event.tone === "out").reduce((sum, event) => sum + (event.amount ?? 0), 0);
  const totalIn = events.filter((event) => event.tone === "in").reduce((sum, event) => sum + (event.amount ?? 0), 0);
  return <section className="panel">
    <PanelTitle title={monthLabel(month)} subtitle={`Previsti: uscite ${money(totalOut)} · entrate ${money(totalIn)}`}
      action={<span className="archived-actions">
        <button type="button" className="icon-button quiet" aria-label="Mese precedente" onClick={() => setMonth(shiftMonth(month, -1))}><ChevronLeft size={16} /></button>
        <button type="button" className="text-button" onClick={() => setMonth(today.slice(0, 7))}>Oggi</button>
        <button type="button" className="icon-button quiet" aria-label="Mese successivo" onClick={() => setMonth(shiftMonth(month, 1))}><ChevronRight size={16} /></button>
        <div className="segmented small-text" role="group" aria-label="Vista"><button type="button" aria-pressed={!list} onClick={() => setList(false)}>Mese</button>
          <button type="button" aria-pressed={list} onClick={() => setList(true)}>Elenco</button></div>
      </span>} />
    {list ? (events.length ? <ul className="status-list">{events.map((event, index) => <li key={index}>
      <CalendarDays size={15} /><div><strong>{shortDate(event.date)} · {event.title}</strong>
        {event.amount !== null && <small className={event.tone === "in" ? "status-ok" : event.tone === "out" ? "status-warn" : undefined}>{event.tone === "in" ? "+" : event.tone === "out" ? "−" : ""}{money(event.amount)}</small>}</div></li>)}</ul>
      : <Empty icon={<CalendarDays size={22} />} title="Niente in programma">Nessuna scadenza in questo mese.</Empty>)
    : <div className="calendar-grid">
      {weekdays.map((day) => <span key={day} className="weekday">{day}</span>)}
      {cells.map((day, index) => {
        const date = day >= 1 && day <= days ? `${month}-${String(day).padStart(2, "0")}` : null;
        const own = date ? events.filter((event) => event.date === date) : [];
        return <div key={index} className={`calendar-day${date ? "" : " other"}${date === today ? " today" : ""}${own.length ? " has-events" : ""}${(sunday ? [0, 6] : [5, 6]).includes(index % 7) ? " weekend" : ""}`}>
          {date && <b>{day}</b>}
          {own.slice(0, 3).map((event, n) => <i key={n} className={event.tone} title={`${event.title}${event.amount !== null ? ` · ${money(event.amount)}` : ""}`}>
            <span>{event.title}</span>{event.amount !== null && <em>{event.tone === "out" ? "−" : event.tone === "in" ? "+" : ""}{money(event.amount)}</em>}</i>)}
          {own.length > 3 && <i>+{own.length - 3}</i>}
        </div>;
      })}
    </div>}
  </section>;
}

// ---------------------------------------------------------------- Scadenze

function DeadlineEditor({ initial, ledger, today, busy, onCommit, onClose }: {
  initial?: Deadline; ledger: Ledger; today: string; busy: boolean; onCommit: Commit; onClose: () => void;
}) {
  const [title, setTitle] = useState(initial?.value.title ?? "");
  const [type, setType] = useState<Deadline["value"]["type"]>(initial?.value.type ?? "vehicle");
  const [date, setDate] = useState(initial?.value.date ?? today);
  const [repeat, setRepeat] = useState(String(initial?.value.repeatMonths ?? 12));
  const [notice, setNotice] = useState(String(initial?.value.noticeDays ?? 30));
  const [person, setPerson] = useState(initial?.value.person ?? "");
  const [notes, setNotes] = useState(initial?.value.notes ?? "");
  const [error, setError] = useState("");
  function save() {
    const repeatMonths = Number(repeat);
    const noticeDays = Number(notice);
    if (!title.trim() || !date || !Number.isInteger(repeatMonths) || repeatMonths < 0 || !Number.isInteger(noticeDays) || noticeDays < 0) {
      setError("Controlla descrizione, data, ripetizione e preavviso."); return;
    }
    onCommit([{ op: "save", record: { kind: "deadline", id: initial?.id ?? newId(), version: initial?.version ?? null, value: {
      title: title.trim().slice(0, 120), type, date, repeatMonths: Math.min(240, repeatMonths), noticeDays: Math.min(400, noticeDays),
      ...(person ? { person } : {}), notes: notes.trim().slice(0, 600),
    } } }], initial ? "Scadenza aggiornata." : "Scadenza aggiunta.");
    onClose();
  }
  return <div className="editor inline-editor">
    <div className="form-grid">
      <label>Descrizione<input value={title} maxLength={120} placeholder="Es. Revisione Panda" onChange={(event) => setTitle(event.target.value)} /></label>
      <label>Tipo<select value={type} onChange={(event) => setType(event.target.value as Deadline["value"]["type"])}>
        {DEADLINE_TYPES.map((key) => <option key={key} value={key}>{DEADLINE_LABELS[key]}</option>)}</select></label>
      <label>Data<input type="date" min="1900-01-01" max="2100-12-31" value={date} onChange={(event) => setDate(event.target.value)} /></label>
      <label>Ripeti ogni (mesi) <span className="optional">0 = una volta</span><input inputMode="numeric" value={repeat} onChange={(event) => setRepeat(event.target.value.replace(/\D/g, ""))} /></label>
      <label>Avvisami (giorni prima)<input inputMode="numeric" value={notice} onChange={(event) => setNotice(event.target.value.replace(/\D/g, ""))} /></label>
      {ledger.people.length > 0 && <label>Riguarda<select value={person} onChange={(event) => setPerson(event.target.value)}>
        <option value="">Me stesso</option>{ledger.people.map((item) => <option key={item.id} value={item.id}>{personName(item)}</option>)}</select></label>}
    </div>
    <label>Note <span className="optional">facoltative</span><textarea rows={2} maxLength={600} value={notes} onChange={(event) => setNotes(event.target.value)} /></label>
    {error && <p className="form-error" role="alert">{error}</p>}
    <div className="modal-actions">
      <button type="button" className="button secondary" onClick={onClose}>Annulla</button>
      <button type="button" className="button primary" disabled={busy} onClick={save}>Salva</button>
    </div>
  </div>;
}

export function DeadlinesView({ ledger, today, busy, onCommit, onCreateExpense }: {
  ledger: Ledger; today: string; busy: boolean; onCommit: Commit; onCreateExpense: (deadline: Deadline) => void;
}) {
  const [editing, setEditing] = useState<Deadline | "new" | null>(null);
  const [showDone, setShowDone] = useState(false);
  const list = ledger.deadlines.filter((item) => showDone || !item.value.done);
  const people = new Map(ledger.people.map((person) => [person.id, personName(person)]));
  return <section className="panel">
    <PanelTitle title="Scadenze" subtitle="Revisione e bollo, documenti, garanzie, contratti, visite: ti avvisa in Panoramica."
      action={<button type="button" className="button secondary small" onClick={() => setEditing("new")}><Plus size={15} /> Nuova scadenza</button>} />
    {editing && <DeadlineEditor ledger={ledger} today={today} busy={busy} onCommit={onCommit} onClose={() => setEditing(null)}
      initial={editing === "new" ? undefined : editing} key={editing === "new" ? "new" : editing.id} />}
    {list.length ? <ul className="rule-list timeline-list">{list.map((item) => {
      const state = deadlineState(item, today);
      const days = daysUntil(item.value.date, today);
      return <li key={item.id} className={state}>
        <div><strong>{item.value.title}</strong>
          <small>{DEADLINE_LABELS[item.value.type]}{item.value.person && people.get(item.value.person) ? ` · ${people.get(item.value.person)}` : ""} · {shortDate(item.value.date)}
            {state === "done" ? " · fatta" : days < 0 ? ` · scaduta da ${-days} giorni` : days === 0 ? " · oggi" : ` · tra ${days} giorni`}
            {item.value.repeatMonths ? ` · ogni ${item.value.repeatMonths} mesi` : ""}</small>
          {item.value.notes && <small>{item.value.notes}</small>}</div>
        <span className="archived-actions">
          {state !== "done" && <button type="button" className="text-button" disabled={busy} onClick={() => onCommit([completeDeadline(item, today)], item.value.repeatMonths ? "Fatta: spostata alla prossima data." : "Segnata come fatta.")}><CheckCircle2 size={14} /> Fatta</button>}
          {state !== "done" && <button type="button" className="icon-button quiet" aria-label={`Registra la spesa di ${item.value.title}`} title="Registra la spesa" onClick={() => onCreateExpense(item)}><ReceiptText size={15} /></button>}
          <button type="button" className="icon-button quiet" aria-label={`Modifica ${item.value.title}`} title="Modifica" onClick={() => setEditing(item)}><Pencil size={15} /></button>
          <button type="button" className="icon-button quiet" aria-label={`Elimina ${item.value.title}`} disabled={busy}
            onClick={() => onCommit([{ op: "delete", kind: "deadline", id: item.id, version: item.version ?? NO_VERSION }], "Scadenza eliminata.")}><Trash2 size={15} /></button>
        </span>
      </li>;
    })}</ul> : !editing && <Empty icon={<Timer size={22} />} title="Nessuna scadenza">Aggiungi la revisione dell’auto, la scadenza della carta d’identità o una garanzia.</Empty>}
    {ledger.deadlines.some((item) => item.value.done) && <button type="button" className="text-button" onClick={() => setShowDone((value) => !value)}>{showDone ? "Nascondi le fatte" : "Mostra anche le fatte"}</button>}
  </section>;
}

// ---------------------------------------------------------------- Report annuale

export function AnnualReportView({ ledger, today, year: initialYear }: { ledger: Ledger; today: string; year?: number }) {
  const years = reportYears(ledger, today);
  const [year, setYear] = useState(initialYear ?? years[0] ?? Number(today.slice(0, 4)) - 1);
  const report = useMemo(() => annualReport(ledger, year, today), [ledger, year, today]);
  const { kpi, previous } = report;
  if (!years.length) return <section className="panel"><Empty icon={<FileText size={22} />} title="Nessun anno chiuso">Il report di un anno è disponibile da gennaio dell’anno dopo.</Empty></section>;
  return <section className="panel print-area annual-report">
    <PanelTitle title={`Il tuo ${year}`} subtitle="Riepilogo dell’anno solare (1° gennaio – 31 dicembre) da stampare o salvare in PDF e conservare con il backup."
      action={<span className="archived-actions">
        <select aria-label="Anno" value={year} onChange={(event) => setYear(Number(event.target.value))}>{years.map((item) => <option key={item} value={item}>{item}</option>)}</select>
        <button type="button" className="button secondary small" onClick={() => window.print()}><Printer size={15} /> Stampa / PDF</button></span>} />
    <div className="kpi-grid">
      <div className="kpi"><small>Entrate</small><strong>{money(kpi.income)}</strong><span className="delta">{pct(kpi.income, previous.income)} sul {year - 1}</span></div>
      <div className="kpi"><small>Spese</small><strong>{money(kpi.expense)}</strong><span className="delta">{pct(kpi.expense, previous.expense)} sul {year - 1}</span></div>
      <div className="kpi"><small>Risparmio</small><strong>{money(kpi.saving)}</strong><span className="delta">tasso {rate(kpi.rate)}</span></div>
      <div className="kpi"><small>Patrimonio a fine anno</small><strong>{money(kpi.worthEnd)}</strong>
        <span className="delta">{report.summary.worthStart !== null && kpi.worthEnd !== null ? signed(kpi.worthEnd - report.summary.worthStart) : ""}</span></div>
    </div>
    <h3 className="group-title">Dove sono andati i soldi</h3>
    <ul className="rule-list">{report.summary.categories.slice(0, 8).map((item) => <li key={item.id}><div><strong>{item.name}</strong>
      <small>{item.before ? `${pct(item.amount, item.before)} rispetto al ${year - 1}` : "nuova voce"}</small></div><b>{money(item.amount)}</b></li>)}</ul>
    <h3 className="group-title">Momenti dell’anno</h3>
    <ul className="status-list">
      {report.best && <li><CheckCircle2 size={15} /><div><strong>Mese migliore: {MONTHS[Number(report.best.month.slice(5)) - 1]}</strong><small>risparmio {money(report.best.saving)}</small></div></li>}
      {report.worst && report.worst !== report.best && <li><Timer size={15} /><div><strong>Mese più difficile: {MONTHS[Number(report.worst.month.slice(5)) - 1]}</strong><small>risparmio {money(report.worst.saving)}</small></div></li>}
      {report.biggest && <li><FileText size={15} /><div><strong>Spesa più grande: {report.biggest.value.title}</strong><small>{money(report.biggest.value.amount)} il {shortDate(report.biggest.value.date)}</small></div></li>}
    </ul>
    {report.fixed && report.fixed.items.length > 0 && <><h3 className="group-title">Spese fisse e abbonamenti</h3>
      <p>{money(report.fixed.yearly)} all’anno ({money(report.fixed.monthly)} al mese).</p></>}
    {report.debts.length > 0 && <><h3 className="group-title">Debiti</h3><ul className="rule-list">{report.debts.map((item) => <li key={item.name}>
      <div><strong>{item.name}</strong><small>interessi pagati nell’anno {money(item.interestYear)}</small></div><b>residuo {money(item.residual)}</b></li>)}</ul></>}
    {report.investments.value !== null && <><h3 className="group-title">Investimenti</h3>
      <p>Valore {money(report.investments.value)} · versato {money(report.investments.paid)}{report.investments.yearReturn !== null ? ` · rendimento dell’anno ${signed(report.investments.yearReturn)}` : ""}.</p></>}
    {report.tax && report.tax.lines.length > 0 && <><h3 className="group-title">Dichiarazione (stima)</h3>
      <p>Detrazione stimata {money(report.tax.detraction)}{report.tax.deductible ? ` · deducibile ${money(report.tax.deductible)}` : ""}.</p></>}
    <p className="panel-note">Creato il {shortDate(report.generated)} da Expense Tracking.</p>
  </section>;
}

// ---------------------------------------------------------------- Dossier per i familiari

export function DossierPanel({ ledger, today }: { ledger: Ledger; today: string }) {
  const [open, setOpen] = useState(false);
  const [codes, setCodes] = useState(false);
  const balances = accountBalances(ledger, today.slice(0, 7));
  const fixed = fixedOverview(ledger, today);
  return <section className="panel settings-extra">
    <PanelHead icon={<HeartHandshake size={18} />} title="Dossier per i familiari" subtitle="«Se mi succede qualcosa»: conti, debiti, abbonamenti, scadenze e dove sono i backup. Solo su richiesta: contiene dati molto sensibili."
      action={<button type="button" className="button secondary small" onClick={() => setOpen((value) => !value)}>{open ? "Chiudi" : "Prepara il dossier"}</button>} />
    {open && <div className="print-area dossier">
      <label className="check-row compact"><input type="checkbox" checked={codes} onChange={(event) => setCodes(event.target.checked)} />
        <span><strong>Includi i codici fiscali completi</strong></span></label>
      <h3 className="group-title">Conti e investimenti</h3>
      <ul className="rule-list">{balances.filter(({ account }) => !account.value.archived && account.value.type !== "debt").map(({ account, amount }) => <li key={account.id}>
        <div><strong>{account.value.name}</strong><small>{account.value.deposit?.bank ? `${account.value.deposit.bank} · ` : ""}{account.value.type}</small></div><b>{money(amount)}</b></li>)}</ul>
      <h3 className="group-title">Debiti</h3>
      <ul className="rule-list">{ledger.accounts.filter((account) => account.value.type === "debt" && !account.value.archived).map((debt) => {
        const status = debtStatus(ledger, debt, today.slice(0, 7));
        return <li key={debt.id}><div><strong>{debt.value.name}</strong><small>{status.endDate ? `fine prevista ${monthLabel(status.endDate.slice(0, 7))}` : "debito flessibile"}</small></div><b>{money(status.residual)}</b></li>;
      })}</ul>
      <h3 className="group-title">Abbonamenti e spese fisse da disdire o volturare</h3>
      <ul className="rule-list">{fixed.items.filter((item) => item.monthly > 0).map((item) => <li key={item.recurring.id}><div><strong>{item.recurring.value.template.title}</strong></div><b>{money(item.monthly)}/mese</b></li>)}</ul>
      <h3 className="group-title">Scadenze</h3>
      <ul className="rule-list">{ledger.deadlines.filter((item) => !item.value.done).map((item) => <li key={item.id}><div><strong>{item.value.title}</strong><small>{item.value.notes}</small></div><b>{shortDate(item.value.date)}</b></li>)}</ul>
      {ledger.people.length > 0 && <><h3 className="group-title">Familiari</h3>
        <ul className="rule-list">{ledger.people.map((person) => <li key={person.id}><div><strong>{personName(person)}</strong>
          <small>{person.value.taxCode ? (codes && !isDiscreet() ? person.value.taxCode : maskTaxCode(person.value.taxCode)) : ""}</small></div></li>)}</ul></>}
      <h3 className="group-title">Backup dei dati</h3>
      <p>I backup automatici sono file «expense-tracking-backup-AAAA-MM-GG» (.zip, o .etbackup se cifrati) nella cartella scelta in Impostazioni → Dati e backup (di solito su Google Drive).
        Dentro c’è LEGGIMI.md con le istruzioni per aprirli con Excel o Google Sheets. Per i file cifrati serve la password del backup.</p>
      <button type="button" className="button secondary" onClick={() => window.print()}><Printer size={15} /> Stampa / salva in PDF</button>
    </div>}
  </section>;
}

// ---------------------------------------------------------------- Controllo di salute

/** Icona di ogni controllo, scelta dal tipo (l'id può avere un suffisso, es. "balance-fineco"). */
const HEALTH_ICONS: Record<string, LucideIcon> = {
  backup: DatabaseBackup, reads: Gauge, invalid: CircleAlert, balance: WalletCards, balances: WalletCards, gaps: Scale, recurring: Repeat,
  duplicates: CopyX, debt: WalletCards, fund: LifeBuoy, bank: Landmark, line: LifeBuoy, fixed: Repeat, params: Landmark, people: Users,
  deadlines: Timer, refunds: HandCoins, trash: Trash2,
};

function healthIcon(check: HealthCheck) {
  return HEALTH_ICONS[check.id.split("-")[0]] ?? CircleAlert;
}

export function HealthPanel({ checks, onAction, onSeen, onSnooze, compact = false }: {
  checks: HealthCheck[]; onAction: (check: HealthCheck) => void; onSeen?: () => void; onSnooze?: () => void; compact?: boolean;
}) {
  const [all, setAll] = useState(!compact);
  const counts = { ok: checks.filter((item) => item.level === "ok").length, warn: checks.filter((item) => item.level === "warn").length, bad: checks.filter((item) => item.level === "bad").length };
  const shown = all ? checks : checks.filter((item) => item.level !== "ok");
  const month = new Intl.DateTimeFormat("it-IT", { month: "long", year: "numeric" }).format(new Date());
  return <section className="panel health-panel">
    <PanelTitle title={`Controllo di ${month}`} subtitle={`${counts.ok} ok · ${counts.warn} da vedere · ${counts.bad} ${counts.bad === 1 ? "importante" : "importanti"}`}
      action={compact ? <button type="button" className="text-button" onClick={() => setAll((value) => !value)}>{all ? "Solo i problemi" : "Mostra tutto"}</button> : undefined} />
    {shown.length ? <ul className="status-list">{shown.map((check) => { const Icon = check.level === "ok" ? CheckCircle2 : healthIcon(check); return <li key={check.id}>
      <Icon size={15} className={`status-${check.level}`} aria-label={check.level === "ok" ? "In ordine" : check.level === "bad" ? "Importante" : "Da vedere"} />
      <div><strong>{check.title}</strong>{check.detail && <small>{check.detail}</small>}</div>
      {check.action && check.level !== "ok" && <button type="button" className="text-button" onClick={() => onAction(check)}>Risolvi</button>}
    </li>; })}</ul> : <p className="panel-note">Tutto in ordine.</p>}
    {(onSeen || onSnooze) && <div className="modal-actions">
      {onSnooze && <button type="button" className="button secondary small" onClick={onSnooze}>Ricordamelo tra 7 giorni</button>}
      {onSeen && <button type="button" className="button primary small" onClick={onSeen}>Ho visto</button>}
    </div>}
  </section>;
}
