import { useMemo, useState, type CSSProperties, type FormEvent } from "react";
import {
  AlertTriangle, ArrowDownRight, ArrowUpRight, CalendarClock, CheckCircle2, Info, Lightbulb, Pencil, PiggyBank, Plus, Printer, Target, Trash2, TrendingUp,
} from "lucide-react";
import {
  NO_VERSION, TONE_HEX, activeLabels, allTags, evaluateAmount, isDiscreet, money, monthLabel, monthName, newId, periodRange, rate, shortDate,
  type Budget, type Goal, type Ledger, type Mutation, type Tone,
} from "../lib/ledger";
import {
  budgetStatus, forecast, goalStatus, growth, insights, monthsUntil, periodSummary, worthSeries, type WorthPoint,
} from "../lib/planning";
import { Empty, PanelTitle, axisMoney } from "./ledger-views";
import { FormError, Submit, amountInput } from "./ledger-forms";
import { AmountPreview } from "./inputs";
import { StyleIcon, StylePicker, isTone, toneClass } from "./style";


function periodTitle(period: string) {
  return period.length === 4 ? `Anno ${period}` : monthLabel(period);
}

function Bar({ share, level }: { share: number; level: "ok" | "warn" | "over" }) {
  return <span className={`meter meter-${level}`} role="presentation"><i style={{ width: `${Math.min(100, Math.max(2, share * 100))}%` }} /></span>;
}

// ---------------------------------------------------------------- Budget

export function BudgetList({ ledger, period, onEdit, limit }: { ledger: Ledger; period: string; onEdit: (budget?: Budget) => void; limit?: number }) {
  const list = ledger.budgets.map((budget) => budgetStatus(ledger, budget, period)).sort((a, b) => b.share - a.share);
  if (!list.length) return <Empty icon={<PiggyBank size={21} />} title="Nessun budget"
    action={<button type="button" className="text-button" onClick={() => onEdit()}><Plus size={15} /> Crea un budget</button>}>
    Un tetto di spesa per categoria, per tag o per tutte le spese.
  </Empty>;
  return <ul className="budget-list">{list.slice(0, limit).map((item) => {
    const left = item.limit - item.spent;
    return <li key={item.budget.id}>
      <button type="button" className="budget-row" onClick={() => onEdit(item.budget)} aria-label={`Modifica budget ${item.name}`}>
        <span className="budget-head"><strong>{item.name}</strong>
          <small>{item.budget.value.period === "total" ? "in totale" : period.length === 4 ? "nell’anno" : "al mese"}</small>
          <b className={`budget-left level-${item.level}`}>{left >= 0 ? `Restano ${money(left)}` : `Superato di ${money(-left)}`}</b></span>
        <Bar share={item.share} level={item.level} />
        <span className="budget-foot">{money(item.spent)} di {money(item.limit)} · {Math.round(item.share * 100)}%</span>
      </button>
    </li>;
  })}</ul>;
}

export function BudgetPanel({ ledger, period, onEdit }: { ledger: Ledger; period: string; onEdit: (budget?: Budget) => void }) {
  return <section className="panel budget-panel">
    <PanelTitle title="Budget" subtitle={`${periodTitle(period)} · avviso all’80%`}
      action={<button type="button" className="button secondary" onClick={() => onEdit()}><Plus size={16} /> Nuovo</button>} />
    <BudgetList ledger={ledger} period={period} onEdit={onEdit} />
  </section>;
}

export function BudgetEditor({ ledger, initial, busy, error, onCommit }: {
  ledger: Ledger; initial?: Budget; busy: boolean; error: string; onCommit: (actions: Mutation[], message: string) => void;
}) {
  const [target, setTarget] = useState(initial?.value.target ?? "label");
  const [ref, setRef] = useState(initial?.value.ref ?? "");
  const [amountText, setAmountText] = useState(amountInput(initial?.value.amount));
  const [period, setPeriod] = useState(initial?.value.period ?? "month");
  const [validation, setValidation] = useState("");
  const labels = activeLabels(ledger, "expense");
  const tags = allTags(ledger);

  function submit(event: FormEvent) {
    event.preventDefault();
    const amount = evaluateAmount(amountText);
    const cleanRef = target === "all" ? "" : target === "tag" ? ref.trim().replace(/^#/, "").toLocaleLowerCase("it") : ref;
    if (target !== "all" && !cleanRef) { setValidation(target === "tag" ? "Scrivi il tag." : "Scegli la categoria."); return; }
    if (amount === null || amount <= 0) { setValidation("Inserisci un importo maggiore di zero."); return; }
    setValidation("");
    const order = initial?.value.order ?? ledger.budgets.reduce((max, item) => Math.max(max, item.value.order + 1), 0);
    onCommit([{ op: "save", record: { kind: "budget", id: initial?.id ?? newId(), version: initial?.version ?? null,
      value: { target, ref: cleanRef, amount, period, order } } }], initial ? "Budget aggiornato." : "Budget creato.");
  }

  return <form className="editor" onSubmit={submit}>
    <div className="segmented" role="group" aria-label="Su cosa">
      {([["label", "Categoria"], ["tag", "Tag"], ["all", "Tutte le spese"]] as const).map(([value, title]) =>
        <button type="button" key={value} aria-pressed={target === value} onClick={() => { setTarget(value); setRef(""); }}>{title}</button>)}
    </div>
    {target === "label" && <label>Categoria
      <select value={ref} onChange={(event) => setRef(event.target.value)} required>
        <option value="">Scegli una categoria</option>
        {labels.map((label) => <option key={label.id} value={label.id}>{label.value.name}</option>)}
      </select></label>}
    {target === "tag" && <label>Tag<input value={ref} onChange={(event) => setRef(event.target.value)} list="budget-tags" placeholder="Es. viaggio-palermo" maxLength={40} required />
      <datalist id="budget-tags">{tags.map((tag) => <option key={tag.name} value={tag.name} />)}</datalist></label>}
    <div className="form-grid">
      <label>Importo in euro<input inputMode="text" value={amountText} onChange={(event) => setAmountText(event.target.value)} placeholder="0,00" maxLength={40} required />
        <AmountPreview text={amountText} /></label>
      <label>Periodo<select value={period} onChange={(event) => setPeriod(event.target.value as "month" | "total")}>
        <option value="month">Ogni mese</option><option value="total">In totale (es. un viaggio)</option>
      </select></label>
    </div>
    <p className="form-help">Il budget conta le spese (e gli interessi delle rate) della categoria o del tag. All’80% diventa arancione, oltre il 100% rosso.</p>
    <FormError message={validation || error} />
    <div className="modal-actions">
      {initial?.version && <button type="button" className="button danger-quiet" disabled={busy}
        onClick={() => onCommit([{ op: "delete", kind: "budget", id: initial.id, version: initial.version ?? NO_VERSION }], "Budget eliminato.")}><Trash2 size={16} /> Elimina</button>}
      <Submit busy={busy}>Salva budget</Submit>
    </div>
  </form>;
}

// ---------------------------------------------------------------- Obiettivi

export function GoalCards({ ledger, today, onEdit, limit, compact = false }: {
  ledger: Ledger; today: string; onEdit: (goal?: Goal) => void; limit?: number; compact?: boolean;
}) {
  const list = ledger.goals.map((goal) => goalStatus(ledger, goal, today));
  if (!list.length) return <Empty icon={<Target size={21} />} title="Nessun obiettivo"
    action={<button type="button" className="text-button" onClick={() => onEdit()}><Plus size={15} /> Crea un obiettivo</button>}>
    Fondo emergenza, macchina, vacanza: quanto ti manca e quanto mettere da parte al mese.
  </Empty>;
  return <ul className={compact ? "goal-grid compact" : "goal-grid"}>{list.slice(0, limit).map((item) => {
    const { goal } = item;
    const color = isTone(goal.value.color) ? TONE_HEX[goal.value.color as Tone] : undefined;
    const reached = item.current >= goal.value.target;
    return <li key={goal.id} className={`goal-card${goal.value.done ? " is-done" : ""}`} style={color ? { "--goal": color } as CSSProperties : undefined}>
      <div className="goal-top">
        <span className={`account-symbol${toneClass(goal.value.color)}`}><StyleIcon icon={goal.value.icon} fallback={<Target size={17} />} /></span>
        <span className="goal-name"><strong>{goal.value.name}</strong>
          <small>{goal.value.deadline ? `Entro il ${shortDate(goal.value.deadline)}` : "Senza scadenza"}{goal.value.accountId ? ` · ${ledger.accounts.find((a) => a.id === goal.value.accountId)?.value.name ?? ""}` : ""}</small></span>
        <button type="button" className="icon-button quiet" aria-label={`Modifica ${goal.value.name}`} onClick={() => onEdit(goal)}><Pencil size={15} /></button>
      </div>
      <Bar share={item.share} level={reached ? "ok" : item.late ? "over" : "ok"} />
      <div className="goal-numbers"><b>{money(item.current)}</b><span>di {money(goal.value.target)} · {Math.round(item.share * 100)}%</span></div>
      {!compact && <p className="goal-hint">{goal.value.done || reached ? <><CheckCircle2 size={14} /> Obiettivo raggiunto</>
        : item.late ? <><AlertTriangle size={14} /> Scadenza passata: mancano {money(goal.value.target - item.current)}</>
        : item.monthly !== null ? <><CalendarClock size={14} /> Metti da parte {money(item.monthly)} al mese{item.monthsLeft ? ` per ${item.monthsLeft} mesi` : ""}</>
        : <>Mancano {money(goal.value.target - item.current)}</>}</p>}
    </li>;
  })}</ul>;
}

export function GoalsTab({ ledger, today, onEdit }: { ledger: Ledger; today: string; onEdit: (goal?: Goal) => void }) {
  return <section className="panel goals-panel">
    <PanelTitle title="Obiettivi di risparmio" subtitle="Collegati al saldo di un conto oppure aggiornati a mano."
      action={<button type="button" className="button secondary" onClick={() => onEdit()}><Plus size={16} /> Nuovo obiettivo</button>} />
    <GoalCards ledger={ledger} today={today} onEdit={onEdit} />
  </section>;
}

export function GoalEditor({ ledger, initial, busy, error, onCommit }: {
  ledger: Ledger; initial?: Goal; busy: boolean; error: string; onCommit: (actions: Mutation[], message: string) => void;
}) {
  const value = initial?.value;
  const [name, setName] = useState(value?.name ?? "");
  const [targetText, setTargetText] = useState(amountInput(value?.target));
  const [savedText, setSavedText] = useState(amountInput(value?.saved));
  const [deadline, setDeadline] = useState(value?.deadline ?? "");
  const [accountId, setAccountId] = useState(value?.accountId ?? "");
  const [style, setStyle] = useState<{ color?: string; icon?: string }>({ color: value?.color, icon: value?.icon });
  const [done, setDone] = useState(!!value?.done);
  const [validation, setValidation] = useState("");
  const accounts = ledger.accounts.filter((account) => ["cash", "asset", "investment"].includes(account.value.type) && !account.value.archived);

  function submit(event: FormEvent) {
    event.preventDefault();
    const target = evaluateAmount(targetText);
    const saved = accountId ? 0 : savedText.trim() ? evaluateAmount(savedText) : 0;
    if (!name.trim()) { setValidation("Dai un nome all’obiettivo."); return; }
    if (target === null || target <= 0) { setValidation("Inserisci la cifra da raggiungere."); return; }
    if (saved === null || saved < 0) { setValidation("Inserisci quanto hai già messo da parte (o lascia vuoto)."); return; }
    setValidation("");
    const order = value?.order ?? ledger.goals.reduce((max, item) => Math.max(max, item.value.order + 1), 0);
    onCommit([{ op: "save", record: { kind: "goal", id: initial?.id ?? newId(), version: initial?.version ?? null, value: {
      name: name.trim(), target, deadline, accountId: accountId || null, saved, order,
      ...(style.color ? { color: style.color } : {}), ...(style.icon ? { icon: style.icon } : {}), ...(done ? { done } : {}),
    } } }], initial ? "Obiettivo aggiornato." : "Obiettivo creato.");
  }

  return <form className="editor" onSubmit={submit}>
    <label>Nome<input value={name} onChange={(event) => setName(event.target.value)} maxLength={60} placeholder="Es. Fondo emergenza, Macchina nuova" required /></label>
    <div className="form-grid">
      <label>Da raggiungere in euro<input inputMode="text" value={targetText} onChange={(event) => setTargetText(event.target.value)} placeholder="0,00" maxLength={40} required />
        <AmountPreview text={targetText} /></label>
      <label>Scadenza <span className="optional">facoltativa</span><input type="date" value={deadline} min="2000-01-01" max="2100-12-31" onChange={(event) => setDeadline(event.target.value)} /></label>
    </div>
    <label>Progresso
      <select value={accountId} onChange={(event) => setAccountId(event.target.value)}>
        <option value="">Lo aggiorno a mano</option>
        {accounts.map((account) => <option key={account.id} value={account.id}>Saldo di {account.value.name}</option>)}
      </select></label>
    {!accountId && <label>Già messo da parte in euro<input inputMode="text" value={savedText} onChange={(event) => setSavedText(event.target.value)} placeholder="0,00" maxLength={40} />
      <AmountPreview text={savedText} /></label>}
    <details className="style-details"><summary>Colore e icona</summary>
      <StylePicker color={style.color} icon={style.icon} onChange={setStyle} /></details>
    {initial && <label className="check-row compact"><input type="checkbox" checked={done} onChange={(event) => setDone(event.target.checked)} />
      <span><strong>Obiettivo concluso</strong><small>Resta in fondo all’elenco come promemoria.</small></span></label>}
    <FormError message={validation || error} />
    <div className="modal-actions">
      {initial?.version && <button type="button" className="button danger-quiet" disabled={busy}
        onClick={() => onCommit([{ op: "delete", kind: "goal", id: initial.id, version: initial.version ?? NO_VERSION }], "Obiettivo eliminato.")}><Trash2 size={16} /> Elimina</button>}
      <Submit busy={busy}>Salva obiettivo</Submit>
    </div>
  </form>;
}

// ---------------------------------------------------------------- Previsione

function Spark({ points }: { points: number[] }) {
  if (points.length < 2) return null;
  const min = Math.min(0, ...points);
  const max = Math.max(...points, min + 1);
  const y = (value: number) => 38 - 34 * (value - min) / (max - min);
  const path = points.map((value, index) => `${index ? "L" : "M"}${(index / (points.length - 1)) * 200},${y(value).toFixed(1)}`).join(" ");
  return <svg className="spark" viewBox="0 0 200 40" preserveAspectRatio="none" aria-hidden="true">
    {min < 0 && <line x1="0" x2="200" y1={y(0)} y2={y(0)} className="spark-zero" />}
    <path d={path} />
  </svg>;
}

export function ForecastPanel({ ledger, today }: { ledger: Ledger; today: string }) {
  const list = useMemo(() => forecast(ledger, today), [ledger, today]);
  const events = list.flatMap(({ account, events }) => events.map((event) => ({ ...event, account: account.value.name })))
    .sort((a, b) => a.date.localeCompare(b.date)).slice(0, 6);
  return <section className="panel forecast-panel">
    <PanelTitle title="Prossimi 30 giorni" subtitle="Saldi previsti con ricorrenti, rate e movimenti già programmati." />
    {list.length ? <>
      <ul className="forecast-list">{list.map((item) => <li key={item.account.id} className={item.min < 0 ? "is-negative" : undefined}>
        <span className="forecast-name"><strong>{item.account.value.name}</strong>
          <small>Oggi {money(item.today)} → {money(item.end)}</small></span>
        <Spark points={item.points} />
        {item.min < 0
          ? <span className="forecast-alert"><AlertTriangle size={14} /> In rosso il {shortDate(item.minDate)} ({money(item.min)})</span>
          : <span className="forecast-min">Minimo {money(item.min)}</span>}
      </li>)}</ul>
      {events.length > 0 && <ul className="forecast-events">{events.map((event, index) => <li key={index}>
        <span>{event.date.slice(8, 10)}/{event.date.slice(5, 7)}</span><strong>{event.title}</strong><small>{event.account}</small>
        <b className={event.amount < 0 ? "amount-expense" : "amount-income"}>{event.amount < 0 ? "−" : "+"}{money(Math.abs(event.amount))}</b>
      </li>)}</ul>}
      <p className="panel-note"><Info size={15} /> È una stima: parte dai saldi registrati e non conta le spese che non hai ancora inserito.</p>
    </> : <Empty icon={<CalendarClock size={21} />} title="Nessun saldo da cui partire">Registra il saldo dei tuoi conti per vedere la previsione.</Empty>}
  </section>;
}

// ---------------------------------------------------------------- Segnalazioni

export function InsightsPanel({ ledger, period, today }: { ledger: Ledger; period: string; today: string }) {
  const hidden = isDiscreet();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const list = useMemo(() => insights(ledger, period, today), [ledger, period, today, hidden]);
  return <section className="panel insights-panel">
    <PanelTitle title="Segnalazioni" subtitle={`${periodTitle(period)} rispetto alla tua media`} />
    {list.length ? <ul className="insight-list">{list.map((item, index) => <li key={index} className={`insight-${item.tone}`}>
      {item.tone === "up" ? <ArrowUpRight size={16} /> : item.tone === "down" ? <ArrowDownRight size={16} /> : <Lightbulb size={16} />}
      <span>{item.text}</span></li>)}</ul>
      : <p className="panel-note"><Info size={15} /> {period.length === 4 ? "Le segnalazioni confrontano un mese con i precedenti: scegli un mese." : "Niente di insolito, oppure servono ancora almeno due mesi di movimenti per fare un confronto."}</p>}
  </section>;
}

// ---------------------------------------------------------------- Riepilogo

function Delta({ now, before, inverse = false }: { now: number; before: number | null | undefined; inverse?: boolean }) {
  if (before === null || before === undefined || before === 0) return null;
  const change = (now - before) / Math.abs(before);
  if (Math.abs(change) < 0.005) return <small className="delta">= </small>;
  const good = inverse ? change < 0 : change > 0;
  return <small className={`delta ${good ? "delta-good" : "delta-bad"}`}>{change > 0 ? "+" : "−"}{Math.abs(Math.round(change * 100))}%</small>;
}

export function SummaryView({ ledger, period, today }: { ledger: Ledger; period: string; today: string }) {
  const summary = periodSummary(ledger, period);
  const { totals: now, before, average } = summary;
  const year = period.length === 4;
  const compare = year ? "all’anno prima" : "al mese prima";
  const [start, end] = year ? [`${period}-01-01`, `${period}-12-31`] : periodRange(period);
  const worthChange = summary.worthStart !== null && summary.worthEnd !== null ? summary.worthEnd - summary.worthStart : null;
  const notes = year ? [] : insights(ledger, period, today);
  const budgets = ledger.budgets.filter((budget) => budget.value.period === "month").map((budget) => budgetStatus(ledger, budget, period));
  return <div className="summary print-area">
    <header className="summary-head">
      <span>Expense Tracking · riepilogo</span>
      <h3>{periodTitle(period)}</h3>
      <small>Dal {shortDate(start)} al {shortDate(end)} · {summary.count} movimenti</small>
    </header>
    <div className="summary-stats">
      <div><span>Entrate</span><b className="amount-income">{money(now.income)}</b><Delta now={now.income} before={before?.income} /></div>
      <div><span>Spese</span><b className="amount-expense">{money(now.expense)}</b><Delta now={now.expense} before={before?.expense} inverse /></div>
      <div><span>Risparmio</span><b>{money(now.saving)}</b><small>{now.rate === null ? "—" : `${rate(now.rate)} delle entrate`}</small></div>
      <div><span>Patrimonio netto</span><b>{worthChange === null ? "—" : `${worthChange >= 0 ? "+" : "−"}${money(Math.abs(worthChange))}`}</b><small>{summary.worthEnd === null ? "Nessun saldo registrato" : `ora ${money(summary.worthEnd)}`}</small></div>
    </div>
    {(before || average) && <p className="summary-line">
      {before && <>Rispetto {compare}: spese {now.expense <= before.expense ? "in calo" : "in aumento"} di {money(Math.abs(now.expense - before.expense))}. </>}
      {average && <>Media degli ultimi mesi: entrate {money(average.income)}, spese {money(average.expense)}.</>}
    </p>}
    {summary.categories.length > 0 && <>
      <h4>Dove sono andati i soldi</h4>
      <table className="data-table compact-table summary-table">
        <thead><tr><th scope="col">Categoria</th><th scope="col" className="number">Spesa</th><th scope="col" className="number">Quota</th><th scope="col" className="number">{year ? "Anno prima" : "Mese prima"}</th></tr></thead>
        <tbody>{summary.categories.slice(0, 8).map((item) => <tr key={item.id}>
          <td>{item.name}</td><td className="number">{money(item.amount)}</td>
          <td className="number">{now.expense ? `${Math.round(item.amount / now.expense * 100)}%` : "—"}</td>
          <td className="number">{item.before ? money(item.before) : "—"}</td>
        </tr>)}</tbody>
      </table>
    </>}
    {summary.biggest && <p className="summary-line">Spesa più alta: <b>{summary.biggest.value.title}</b>, {money(summary.biggest.value.amount)} il {shortDate(summary.biggest.value.date)}.</p>}
    {budgets.length > 0 && <>
      <h4>Budget</h4>
      <ul className="summary-budgets">{budgets.map((item) => <li key={item.budget.id}>
        <span>{item.name}</span><Bar share={item.share} level={item.level} /><b>{money(item.spent)} / {money(item.limit)}</b></li>)}</ul>
    </>}
    {notes.length > 0 && <>
      <h4>Da notare</h4>
      <ul className="insight-list">{notes.map((item, index) => <li key={index} className={`insight-${item.tone}`}><Lightbulb size={15} /><span>{item.text}</span></li>)}</ul>
    </>}
  </div>;
}

export function SummaryDialog({ ledger, period, today, onPeriod }: { ledger: Ledger; period: string; today: string; onPeriod: (period: string) => void }) {
  const year = period.slice(0, 4);
  return <div className="editor summary-dialog">
    <div className="segmented no-print" role="group" aria-label="Periodo del riepilogo">
      <button type="button" aria-pressed={period.length === 7} onClick={() => onPeriod(period.length === 7 ? period : `${year}-${today.startsWith(year) ? today.slice(5, 7) : "12"}`)}>Mese</button>
      <button type="button" aria-pressed={period.length === 4} onClick={() => onPeriod(year)}>Anno</button>
    </div>
    <SummaryView ledger={ledger} period={period} today={today} />
    <div className="modal-actions no-print">
      <button type="button" className="button primary" onClick={() => window.print()}><Printer size={16} /> Scarica PDF</button>
    </div>
    <p className="form-help no-print">«Scarica PDF» apre la stampa: scegli «Salva come PDF» come stampante.</p>
  </div>;
}

// ---------------------------------------------------------------- Andamento del patrimonio

const SERIES = [
  { key: "net", name: "Patrimonio netto", color: "#13836e" },
  { key: "cash", name: "Liquidità e beni", color: "#3567c8" },
  { key: "invest", name: "Investimenti", color: "#8650b8" },
  { key: "debt", name: "Debiti", color: "#c8463d" },
] as const;
type SeriesKey = (typeof SERIES)[number]["key"];

function WorthChart({ points, shown, month, onMonth }: { points: WorthPoint[]; shown: SeriesKey[]; month: string; onMonth: (month: string) => void }) {
  const values = points.flatMap((point) => shown.map((key) => point[key]).filter((value): value is number => value !== null));
  if (!values.length) return null;
  const min = Math.min(0, ...values);
  const max = Math.max(...values, min + 100);
  const x = (index: number) => (index + 0.5) * 1000 / points.length;
  const y = (value: number) => 10 + 170 * (max - value) / (max - min);
  const every = Math.ceil(points.length / 12);
  return <div className="history-scroll"><div className="history-graph">
    <div className="history-scale"><span>{axisMoney(max)}</span><span>{axisMoney((max + min) / 2)}</span><span>{axisMoney(min)}</span></div>
    <svg viewBox="0 0 1000 190" className="history-svg" preserveAspectRatio="none" role="img" aria-label="Andamento del patrimonio. Valori nella tabella sottostante.">
      {[10, 95, 180].map((row) => <line key={row} x1="0" x2="1000" y1={row} y2={row} className="grid-line" />)}
      {min < 0 && <line x1="0" x2="1000" y1={y(0)} y2={y(0)} className="zero-line" />}
      {SERIES.filter(({ key }) => shown.includes(key)).map(({ key, color }) => {
        const pairs = points.flatMap((point, index) => point[key] === null ? [] : [[x(index), y(point[key] as number)]]);
        const d = pairs.map((pair, index) => (index ? "L" : "M") + pair.map((n) => n.toFixed(1)).join(",")).join(" ");
        return <path key={key} d={d} fill="none" stroke={color} strokeWidth={key === "net" ? 2.8 : 1.8} strokeDasharray={key === "net" ? undefined : "5 4"} vectorEffect="non-scaling-stroke" strokeLinejoin="round" />;
      })}
    </svg>
    <div className="history-labels" style={{ gridTemplateColumns: `repeat(${points.length}, minmax(0, 1fr))` }}>
      {points.map((point, index) => <button type="button" key={point.month} className="plot-label" aria-pressed={month === point.month}
        aria-label={`${monthLabel(point.month)} · ${money(point.net)}`} onClick={() => onMonth(point.month)}>
        {index % every === 0 ? (point.month.endsWith("-01") || index === 0 ? `${monthName(point.month).slice(0, 3)} ${point.month.slice(2, 4)}` : monthName(point.month).slice(0, 3)) : ""}
      </button>)}
    </div>
  </div></div>;
}

export function WorthPanel({ ledger, month, onMonth }: { ledger: Ledger; month: string; onMonth: (month: string) => void }) {
  const [range, setRange] = useState<12 | 24 | "all">(12);
  const [shown, setShown] = useState<SeriesKey[]>(["net"]);
  const points = useMemo(() => worthSeries(ledger, monthsUntil(ledger, month, range)), [ledger, month, range]);
  const current = points.at(-1)?.net ?? null;
  const previous = points.at(-2)?.net ?? null;
  const january = useMemo(() => worthSeries(ledger, [`${Number(month.slice(0, 4)) - 1}-12`])[0].net, [ledger, month]);
  const parts = useMemo(() => growth(ledger, month), [ledger, month]);
  const toggle = (key: SeriesKey) => setShown((list) => list.includes(key) ? list.filter((item) => item !== key) : [...list, key]);
  const signed = (value: number | null) => value === null ? "—" : `${value >= 0 ? "+" : "−"}${money(Math.abs(value))}`;
  return <section className="panel history-panel">
    <PanelTitle title="Andamento del patrimonio" subtitle={`Fino a ${monthLabel(month)} · tocca un mese per vederne il dettaglio`}
      action={<div className="segmented compact-segmented" role="group" aria-label="Intervallo">
        {([[12, "12 mesi"], [24, "24 mesi"], ["all", "Tutto"]] as const).map(([value, title]) =>
          <button type="button" key={value} aria-pressed={range === value} onClick={() => setRange(value)}>{title}</button>)}
      </div>} />
    {points.some(({ net }) => net !== null) ? <>
      <div className="worth-stats">
        <div><span>Patrimonio netto</span><b>{money(current)}</b></div>
        <div><span>Rispetto al mese prima</span><b>{signed(current !== null && previous !== null ? current - previous : null)}</b></div>
        <div><span>Da inizio anno</span><b>{signed(current !== null && january !== null ? current - january : null)}</b></div>
      </div>
      <div className="series-toggles" role="group" aria-label="Linee del grafico">
        {SERIES.map(({ key, name, color }) => <label key={key} className="series-toggle" style={{ "--series": color } as CSSProperties}>
          <input type="checkbox" checked={shown.includes(key)} disabled={key === "net" && shown.length === 1 && shown[0] === "net"} onChange={() => toggle(key)} />
          <i aria-hidden="true" />{name}</label>)}
      </div>
      <WorthChart points={points} shown={shown} month={month} onMonth={onMonth} />
      {parts && <div className="growth-box">
        <strong><TrendingUp size={15} /> Da dove viene la variazione di {monthLabel(month)}: {signed(parts.change)}</strong>
        <ul>
          <li><span>Risparmio (entrate − spese)</span><b>{signed(parts.saving)}</b></li>
          {parts.returns !== null && <li><span>Rendimento degli investimenti</span><b>{signed(parts.returns)}</b></li>}
          <li><span>Altro (saldi non riconciliati, movimenti mancanti)</span><b>{signed(parts.other)}</b></li>
        </ul>
      </div>}
      <details className="history-detail"><summary>Mostra valori mensili</summary>
        <div className="table-scroll"><table className="data-table compact-table">
          <thead><tr><th scope="col">Mese</th>{SERIES.map(({ key, name }) => <th key={key} className="number" scope="col">{name}</th>)}</tr></thead>
          <tbody>{[...points].reverse().map((point) => <tr key={point.month}><td>{monthLabel(point.month)}</td>
            {SERIES.map(({ key }) => <td key={key} className="number">{money(key === "debt" && point.debt !== null ? -point.debt : point[key])}</td>)}</tr>)}</tbody>
        </table></div>
      </details>
    </> : <Empty icon={<TrendingUp size={23} />} title="Lo storico è ancora vuoto">Registra il saldo di un conto per iniziare a tracciare il patrimonio.</Empty>}
  </section>;
}
