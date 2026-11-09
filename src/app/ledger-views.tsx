import { useId, useMemo, useState, type CSSProperties, type ReactNode } from "react";
import {
  Archive, ArrowDownLeft, ArrowDownToLine, ArrowRight, ArrowUpRight, BarChart3, ChartNoAxesCombined, ChevronRight,
  CircleDollarSign, CircleHelp, ClipboardList, CloudOff, DatabaseBackup, FileUp, KeyRound, Landmark, Layers3, Monitor, Moon,
  Pencil, Plus, RotateCw, Search, Sun, Timer, TrendingUp, Wallet, WalletCards,
} from "lucide-react";
import {
  ACCOUNT_TYPES, ENTRY_TYPES, MONTHS, accountBalances, activeAccounts, lastRecordedMonth, mix, money, monthLabel,
  monthName, netWorth, periodMovements, rate, shortDate, subcategoryList, subcategoryUsage, totals, yearlyFlow, yearMonths,
  type Account, type Label, type Ledger, type Movement, type MovementType,
} from "../lib/ledger";
import { TYPE_ICONS } from "./ledger-forms";
import { IDLE_OPTIONS } from "../lib/config";
import { idleLabel } from "../lib/session";
import { readOffline, readTheme, saveOffline, saveTheme, type ThemeMode } from "../lib/preferences";
import { offlineEnabled } from "../lib/firebase";

export type SessionInfo = {
  email: string;
  idleMinutes: number;
  onIdleChange: (minutes: number) => void;
  onLogout: () => void;
  onPasswordEmail: () => Promise<void>;
};

export function PanelTitle({ title, subtitle, action }: { title: string; subtitle?: string; action?: ReactNode }) {
  return <div className="panel-heading"><div><h2>{title}</h2>{subtitle && <p>{subtitle}</p>}</div>{action}</div>;
}

export function Empty({ icon, title, children, action }: {
  icon: ReactNode; title: string; children?: ReactNode; action?: ReactNode;
}) {
  return <div className="empty">
    <span className="empty-icon">{icon}</span><strong>{title}</strong>{children && <p>{children}</p>}{action}
  </div>;
}

type PeriodProps = {
  ledger: Ledger; year: number; period: string; month: string; monthChange: (month: string) => void;
};

function flowWord(number: number, single: string, plural: string) {
  return `${number} ${number === 1 ? single : plural}`;
}

export function Stat({ title, value, caption, color, icon }: {
  title: string; value: string; caption: string; color: string; icon: ReactNode;
}) {
  return <article className="stat">
    <div className="stat-heading"><span>{title}</span><span className={`stat-icon tone-${color}`}>{icon}</span></div>
    <strong className="stat-value">{value}</strong>
    <span className="stat-caption">{caption}</span>
  </article>;
}

function AxisGrid({ ticks, format }: { ticks: number[]; format: (value: number) => string }) {
  return <div className="axis-grid" aria-hidden="true">
    {ticks.map((tick, index) => <div key={tick} className="axis-tick" style={{ top: `${index / (ticks.length - 1) * 100}%` }}>
      <span>{format(tick)}</span><i />
    </div>)}
  </div>;
}

export function axisMoney(cents: number) {
  const value = cents / 100;
  if (Math.abs(value) >= 1000) {
    return new Intl.NumberFormat("it-IT", { maximumFractionDigits: 1 }).format(value / 1000) + "k €";
  }
  return new Intl.NumberFormat("it-IT", { maximumFractionDigits: 2 }).format(value) + " €";
}

function chartTop(peak: number) {
  if (!peak) return 100000;
  const unit = 10 ** Math.floor(Math.log10(peak));
  return Math.ceil(peak / unit * 2) * unit / 2;
}

function Legend({ items }: { items: { name: string; color: string }[] }) {
  return <div className="legend">
    {items.map(({ name, color }) => <span key={name + color}><i style={{ background: color }} />{name}</span>)}
  </div>;
}

function FlowChart({ ledger, year, period, monthChange, demoAction }: PeriodProps & { demoAction?: ReactNode }) {
  const flows = yearlyFlow(ledger, year);
  const peak = Math.max(...flows.flatMap(({ income, expense, repaid }) => [income, expense, repaid]));
  const top = chartTop(peak);
  const hasRepaid = flows.some(({ repaid }) => repaid > 0);
  return <section className="panel flow-panel">
    <PanelTitle title="Flusso di cassa" subtitle={`Entrate e spese per mese · ${year}`}
      action={<span className="tag year-tag">{year}</span>} />
    <div className="plot-scroll">
      <div className="plot">
        <AxisGrid ticks={peak ? [top, top * .75, top * .5, top * .25, 0] : [1000, 750, 500, 250, 0]}
          format={(value) => peak || value === 0 ? axisMoney(value) : ""} />
        <div className="plot-columns">
          {flows.map(({ month, income, expense, repaid }) => <button type="button" key={month} className="plot-month"
            aria-pressed={period === month} onClick={() => monthChange(month)}
            aria-label={`${monthLabel(month)}, entrate ${money(income)}, spese ${money(expense)}${repaid ? `, capitale rimborsato ${money(repaid)}` : ""}`}
            title={`${monthLabel(month)} · Entrate ${money(income)} · Spese ${money(expense)}${repaid ? ` · Rimborsi ${money(repaid)}` : ""}`}>
            <span className="bar-pair">
              <i className="bar bar-income" style={{ height: `${income / top * 100}%` }} />
              <i className="bar bar-expense" style={{ height: `${expense / top * 100}%` }} />
              {hasRepaid && <i className="bar bar-repaid" style={{ height: `${repaid / top * 100}%` }} />}
            </span>
            <span className="plot-label">{monthName(month).slice(0, 3)}</span>
          </button>)}
        </div>
        {!peak && <div className="plot-placeholder">
          <ChartNoAxesCombined size={19} /><span>Il grafico si popola con i tuoi movimenti</span>
        </div>}
      </div>
    </div>
    <div className="flow-footer">
      <Legend items={[{ name: "Entrate", color: "#228b75" }, { name: "Spese", color: "#df9677" }, ...(hasRepaid ? [{ name: "Rimborsi debiti", color: "#8d7fc2" }] : [])]} />
      {demoAction}
    </div>
  </section>;
}

function Ring({ groups, total }: { groups: ReturnType<typeof mix>; total: number }) {
  let used = 0;
  const slices = groups.filter(({ amount }) => amount > 0).map(({ amount, color }) => {
    const start = used;
    used += amount / total * 100;
    return `${color} ${start}% ${used}%`;
  });
  return <div className="ring" style={{ background: total ? `conic-gradient(${slices.join(", ")})` : undefined }}
    aria-label={`Totale ${money(total)}`}>
    <div className="ring-center"><span>Totale spese</span><strong>{money(total)}</strong></div>
  </div>;
}

function SpendingCard({ ledger, items, periodName, onOpen }: {
  ledger: Ledger; items: Movement[]; periodName: string; onOpen: () => void;
}) {
  const groups = mix(items, ledger.labels, "expense", ledger.accounts).filter(({ amount }) => amount > 0).sort((a, b) => b.amount - a.amount);
  const total = groups.reduce((sum, group) => sum + group.amount, 0);
  const topGroups = groups.length > 4
    ? [...groups.slice(0, 3), { name: "Altre categorie", id: "remaining", color: "#a9bbb6", amount: groups.slice(3).reduce((sum, group) => sum + group.amount, 0), detail: [] }]
    : groups;
  return <section className="panel spending-panel">
    <PanelTitle title="Spese per categoria" subtitle={periodName}
      action={<button className="icon-button quiet" type="button" aria-label="Vai all’analisi" onClick={onOpen}><ArrowUpRight size={18} /></button>} />
    <Ring groups={topGroups} total={total} />
    {total ? <ul className="ring-list">{topGroups.map((group) => <li key={group.id}>
      <span><i style={{ background: group.color }} />{group.name}</span>
      <strong>{rate(group.amount / total)}</strong>
    </li>)}</ul> : <p className="ring-empty">Le categorie compariranno qui quando registri una spesa.</p>}
  </section>;
}

export function Overview({ ledger, year, period, month, monthChange, onEdit, onNew, onView, onBalance, demoAction, due }: PeriodProps & {
  onEdit: (movement: Movement) => void;
  onNew: () => void;
  onView: (view: "movements" | "accounts" | "reports") => void;
  onBalance: (account: Account) => void;
  demoAction?: ReactNode;
  due?: ReactNode;
}) {
  const items = periodMovements(ledger, period);
  const summary = totals(items);
  const accounts = accountBalances(ledger, month);
  const visibleAccounts = accounts.filter(({ account, amount }) => (account.value.type === "cash" || account.value.type === "asset") && (!account.value.archived || (amount !== null && amount !== 0)));
  const groupTotal = (type: "investment" | "debt") => {
    const list = accounts.filter(({ account, amount }) => account.value.type === type && amount !== null);
    return list.length ? list.reduce((sum, { amount }) => sum + (amount ?? 0), 0) : null;
  };
  const invested = groupTotal("investment");
  const owed = groupTotal("debt");
  const known = accounts.filter(({ amount }) => amount !== null).length;
  const periodName = period.length === 4 ? `Anno ${year}` : monthLabel(period);
  return <>
    {due}
    <section className="stats-grid" aria-label="Riepilogo del periodo">
      <Stat title="Entrate" value={money(summary.income)} color="green" icon={<ArrowDownLeft size={20} />}
        caption={flowWord(items.filter(({ value }) => value.type === "income").length, "entrata registrata", "entrate registrate")} />
      <Stat title="Spese" value={money(summary.expense)} color="orange" icon={<ArrowUpRight size={20} />}
        caption={(() => {
          const count = items.filter(({ value }) => value.type === "expense").length;
          if (!count && summary.interest) return `Solo interessi e spese delle rate (${money(summary.interest)})`;
          return flowWord(count, "spesa registrata", "spese registrate") + (summary.interest ? ` · ${money(summary.interest)} di interessi` : "");
        })()} />
      <Stat title="Risparmio netto" value={money(summary.saving)} color="blue" icon={<Wallet size={19} />}
        caption={summary.rate === null ? "Entrate meno spese" : `${rate(summary.rate)} delle entrate`} />
      <Stat title="Patrimonio netto" value={money(netWorth(accounts))} color="purple" icon={<Landmark size={19} />}
        caption={known ? `${known} di ${accounts.length} saldi disponibili · ${monthLabel(month)}` : "Inizia registrando un saldo"} />
    </section>
    <div className="split overview-grid">
      <FlowChart {...{ ledger, year, period, month, monthChange, demoAction }} />
      <SpendingCard ledger={ledger} items={items} periodName={periodName} onOpen={() => onView("reports")} />
    </div>
    <div className="split overview-grid lower-grid">
      <section className="panel recent-panel">
        <PanelTitle title="Movimenti recenti" subtitle={periodName}
          action={<button type="button" className="text-button" onClick={() => onView("movements")}>Vedi tutti <ArrowRight size={15} /></button>} />
        {items.length ? <MovementTable items={items.slice(0, 5)} ledger={ledger} onEdit={onEdit} compact /> :
          <Empty icon={<ClipboardList size={20} />} title="Ancora nessun movimento"
            action={<button type="button" className="text-button" onClick={onNew}><Plus size={16} /> Aggiungi movimento</button>}>
            Le entrate e le spese del periodo appariranno qui.
          </Empty>}
      </section>
      <section className="panel accounts-panel">
        <PanelTitle title="Patrimonio" subtitle={monthLabel(month)}
          action={<button type="button" className="icon-button quiet" aria-label="Vai al patrimonio" onClick={() => onView("accounts")}><ArrowUpRight size={18} /></button>} />
        <ul className="account-mini">
          {invested !== null && <li><span className="account-symbol account-invest"><TrendingUp size={17} /></span>
            <span className="account-mini-name"><strong>Investimenti</strong><small>Valore stimato</small></span><b>{money(invested)}</b></li>}
          {owed !== null && <li><span className="account-symbol account-debt"><CircleDollarSign size={17} /></span>
            <span className="account-mini-name"><strong>Debiti</strong><small>Residuo da rimborsare</small></span><b className="amount-expense">−{money(owed)}</b></li>}
          {visibleAccounts.slice(0, invested !== null || owed !== null ? 3 : 4).map(({ account, amount }) => <li key={account.id}>
            <span className={`account-symbol account-${account.id}`}><AccountGlyph account={account} /></span>
            <span className="account-mini-name"><strong>{account.value.name}</strong><small>{ACCOUNT_TYPES[account.value.type]}</small></span>
            {amount === null ? <button className="text-button" type="button" onClick={() => onBalance(account)} aria-label={`Registra saldo ${account.value.name}`}>Registra</button> : <b>{money(amount)}</b>}
          </li>)}
        </ul>
      </section>
    </div>
  </>;
}

export function AccountGlyph({ account }: { account: Account }) {
  if (account.id === "fineco") return "F";
  if (account.id === "revolut") return "R";
  if (account.value.type === "investment") return <TrendingUp size={18} />;
  if (account.value.type === "asset") return <Layers3 size={18} />;
  if (account.value.type === "debt") return <CircleDollarSign size={18} />;
  return <WalletCards size={18} />;
}

function MovementTable({ items, ledger, onEdit, compact = false }: {
  items: Movement[]; ledger: Ledger; onEdit: (movement: Movement) => void; compact?: boolean;
}) {
  const labels = new Map(ledger.labels.map((label) => [label.id, label.value.name]));
  const accounts = new Map(ledger.accounts.map((account) => [account.id, account.value.name]));
  return <div className="table-scroll">
    <table className={compact ? "data-table compact-table" : "data-table"}>
      <thead><tr><th scope="col">Descrizione</th><th scope="col">Data</th>{!compact && <><th scope="col">Categoria / Fonte</th><th scope="col">Conto</th></>}<th scope="col" className="number">Importo</th><th scope="col"><span className="sr-only">Azioni</span></th></tr></thead>
      <tbody>{items.map((entry) => {
        const value = entry.value;
        const Icon = TYPE_ICONS[value.type];
        const category = value.type === "transfer" ? ENTRY_TYPES.transfer
          : value.type === "repayment" ? `${ENTRY_TYPES.repayment} · ${accounts.get(value.debtId) ?? "debito"}`
          : (labels.get(value.labelId) ?? ENTRY_TYPES[value.type]);
        const account = value.accountId ? accounts.get(value.accountId) : null;
        const subtitle = value.type === "expense" ? value.subcategory
          : value.type === "repayment" ? `Capitale ${money(value.principal)} · Interessi ${money(value.interest)}` : "";
        return <tr key={entry.id}>
          <td><div className="movement-name"><span className={`entry-icon entry-${value.type}`}><Icon size={16} /></span>
            <span><strong>{value.title}</strong>{compact && <small>{category}</small>}{!compact && value.notes && <small className="truncate" title={value.notes}>{value.notes}</small>}</span>
          </div></td>
          <td className="table-muted">{shortDate(value.date)}</td>
          {!compact && <>
            <td><span>{category}</span>{subtitle && <small className="table-subtitle">{subtitle}</small>}</td>
            <td><span>{value.type === "transfer" ? `${account ?? "—"} → ${accounts.get(value.toAccountId) ?? "—"}` : account ?? "—"}</span>
              {value.type === "expense" && value.method && <small className="table-subtitle">{value.method}</small>}</td>
          </>}
          <td className={`number entry-amount amount-${value.type}`}>{value.type === "expense" || value.type === "repayment" ? "−" : value.type === "income" ? "+" : ""}{money(value.amount)}</td>
          <td className="row-action"><button type="button" className="icon-button quiet" aria-label={`Modifica ${value.title}`} onClick={() => onEdit(entry)}><Pencil size={16} /></button></td>
        </tr>;
      })}</tbody>
    </table>
  </div>;
}

export function Movements({ ledger, period, onEdit, onNew, onExport }: {
  ledger: Ledger; period: string; onEdit: (movement: Movement) => void; onNew: () => void; onExport: (items: Movement[]) => void;
}) {
  const [query, setQuery] = useState("");
  const [type, setType] = useState<MovementType | "">("");
  const [label, setLabel] = useState("");
  const [limit, setLimit] = useState(25);
  const items = periodMovements(ledger, period);
  const labels = ledger.labels.filter((item) => item.value.type === type);
  const search = query.trim().toLocaleLowerCase("it");
  const filtered = items.filter(({ value }) => {
    if (type && value.type !== type) return false;
    if (label && (value.type === "transfer" || value.labelId !== label)) return false;
    const keywords = value.type === "expense" ? value.subcategory + " " + value.method : "";
    return !search || (value.title + " " + value.notes + " " + keywords).toLocaleLowerCase("it").includes(search);
  });

  return <section className="panel movements-panel">
    <PanelTitle title="Registro movimenti" subtitle={flowWord(filtered.length, "risultato", "risultati")}
      action={<button type="button" className="button secondary" disabled={!filtered.length} onClick={() => onExport(filtered)}>
        <ArrowDownToLine size={16} /> Esporta CSV
      </button>} />
    <div className="filters">
      <label className="search-field"><Search size={17} /><span className="sr-only">Cerca movimenti</span>
        <input type="search" placeholder="Cerca descrizione o note" value={query}
          onChange={(event) => { setQuery(event.target.value); setLimit(25); }} /></label>
      <label><span className="sr-only">Tipo di movimento</span>
        <select value={type} onChange={(event) => { setType(event.target.value as typeof type); setLabel(""); setLimit(25); }}>
          <option value="">Tutti i tipi</option>
          {Object.entries(ENTRY_TYPES).map(([value, title]) => <option key={value} value={value}>{title}</option>)}
        </select></label>
      {labels.length > 0 && <label><span className="sr-only">{type === "income" ? "Fonte di entrata" : "Categoria"}</span>
        <select value={label} onChange={(event) => { setLabel(event.target.value); setLimit(25); }}>
          <option value="">{type === "income" ? "Tutte le fonti" : "Tutte le categorie"}</option>
          {labels.map((item) => <option value={item.id} key={item.id}>{item.value.name}{item.value.archived ? " (archiviata)" : ""}</option>)}
        </select></label>}
    </div>
    {filtered.length
      ? <MovementTable items={filtered.slice(0, limit)} ledger={ledger} onEdit={onEdit} />
      : <Empty icon={<ClipboardList size={24} />} title={items.length ? "Nessun risultato" : "Nessun movimento nel periodo"}
        action={items.length ? undefined : <button type="button" className="button secondary" onClick={onNew}><Plus size={17} /> Aggiungi movimento</button>}>
        {items.length ? "Modifica la ricerca o i filtri." : "Aggiungi un’entrata, una spesa o un trasferimento."}
      </Empty>}
    {filtered.length > limit && <div className="pagination"><button type="button" className="button secondary" onClick={() => setLimit(limit + 25)}>Mostra altri movimenti</button></div>}
  </section>;
}

export function HistoryChart({ points, month, onMonth }: {
  points: { month: string; amount: number | null }[]; month: string; onMonth: (month: string) => void;
}) {
  const gradient = useId();
  const values = points.flatMap(({ amount }) => amount === null ? [] : [amount]);
  const minimum = Math.min(0, ...values);
  const maximum = Math.max(0, ...values) || (minimum === 0 ? 100 : 0);
  const span = maximum - minimum;
  const x = (index: number) => (index + .5) * 1000 / points.length;
  const y = (amount: number) => 12 + 170 * (maximum - amount) / span;
  const known = points.flatMap(({ amount }, i) => amount === null ? [] : [[x(i), y(amount)]]);
  const line = known.map((pair, i) => (i === 0 ? "M" : "L") + pair.join(",")).join(" ");
  const area = line + (known.length ? ` L${known.at(-1)?.[0]},188 L${known[0][0]},188 Z` : "");
  return <div className="history-scroll">
    <div className="history-graph">
      <div className="history-scale"><span>{axisMoney(maximum)}</span><span>{axisMoney((maximum + minimum) / 2)}</span><span>{axisMoney(minimum)}</span></div>
      <svg viewBox="0 0 1000 188" className="history-svg" preserveAspectRatio="none" role="img" aria-label="Patrimonio netto mese per mese. Valori nella tabella sottostante.">
        <defs><linearGradient id={gradient} x1="0" x2="0" y1="0" y2="1"><stop stopColor="#a1d5c1" stopOpacity=".65" /><stop offset="100%" stopColor="#e4f4eb" stopOpacity=".22" /></linearGradient></defs>
        {[12, 97, 182].map((row) => <line key={row} x1="0" x2="1000" y1={row} y2={row} stroke="#dfe8e4" strokeDasharray="4 4" />)}
        <path d={area} fill={`url(#${gradient})`} />
        <path d={line} fill="none" stroke="#13836e" strokeWidth="2.5" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
        {known.map(([cx, cy]) => <circle key={cx} cx={cx} cy={cy} r="4" fill="#13836e" stroke="#fff" strokeWidth="1.5" />)}
      </svg>
      <div className="history-labels" style={{ gridTemplateColumns: `repeat(${points.length}, minmax(0, 1fr))` }}>
        {points.map((point) => <button type="button" key={point.month} className="plot-label" aria-pressed={month === point.month}
          aria-label={`${monthLabel(point.month)} · ${money(point.amount)}`}
          onClick={() => onMonth(point.month)}>{monthName(point.month).slice(0, 3)}</button>)}
      </div>
    </div>
  </div>;
}

function StackedChart({ ledger, year, type }: { ledger: Ledger; year: number; type: "expense" | "income" }) {
  const [mode, setMode] = useState<"euros" | "share">("euros");
  const grouped = useMemo(() => yearMonths(year).map((month) => {
    const parts = mix(periodMovements(ledger, month), ledger.labels, type, ledger.accounts);
    return { month, parts, amount: parts.reduce((sum, group) => sum + group.amount, 0) };
  }), [ledger, year, type]);
  const peak = Math.max(...grouped.map(({ amount }) => amount));
  const top = chartTop(peak);
  const all = mix(periodMovements(ledger, String(year)), ledger.labels, type, ledger.accounts).filter(({ amount }) => amount > 0);
  return <section className="panel stacked-panel">
    <PanelTitle title={type === "expense" ? "Storico delle spese" : "Storico delle entrate"}
      subtitle={`Composizione per mese · ${year}`}
      action={<div className="segmented small" aria-label="Unità del grafico">
        <button type="button" aria-pressed={mode === "euros"} onClick={() => setMode("euros")}>€</button>
        <button type="button" aria-pressed={mode === "share"} onClick={() => setMode("share")}>%</button>
      </div>} />
    {peak ? <>
      <div className="plot-scroll"><div className="plot">
        <AxisGrid ticks={mode === "euros" ? [top, top * .75, top * .5, top * .25, 0] : [1, .75, .5, .25, 0]}
          format={mode === "euros" ? axisMoney : rate} />
        <div className="plot-columns">
          {grouped.map(({ month, parts, amount }) => <div className="plot-month" key={month} title={`${monthLabel(month)} · ${money(amount)}`}>
            <div className="stack-pile">
              {parts.filter((part) => part.amount > 0).map((part) => <span key={part.id}
                title={`${monthName(month)} · ${part.name} · ${money(part.amount)} · ${rate(part.amount / amount)}`}
                style={{ background: part.color, height: `${part.amount / (mode === "euros" ? top : amount) * 100}%` }} />)}
            </div>
            <span className="plot-label">{monthName(month).slice(0, 3)}</span>
          </div>)}
        </div>
      </div></div>
      <Legend items={all} />
    </> : <Empty icon={<BarChart3 size={22} />} title="Nessun dato per questo anno">
      {type === "expense" ? "Registra una spesa per vedere la composizione mensile." : "Registra un’entrata per vedere le fonti mese per mese."}
    </Empty>}
  </section>;
}

function Compare({ ledger, year, period, type }: Omit<PeriodProps, "month" | "monthChange"> & { type: "expense" | "income" }) {
  const [first, setFirst] = useState(period.length === 7 ? period.slice(5) : "01");
  const [second, setSecond] = useState("average");
  // Gli interessi delle rate contano tra le spese.
  const yearly = periodMovements(ledger, String(year)).filter(({ value }) => value.type === type || (type === "expense" && value.type === "repayment" && value.interest > 0));
  const activeMonths = new Set(yearly.map(({ value }) => value.date.slice(0, 7))).size;
  const months = yearMonths(year);

  function values(selection: string) {
    const entries = /^\d{2}$/.test(selection) ? periodMovements(ledger, `${year}-${selection}`) : yearly;
    const divisor = selection === "average" ? Math.max(1, activeMonths) : 1;
    return mix(entries, ledger.labels, type, ledger.accounts).map((group) => ({ ...group, amount: group.amount / divisor }));
  }

  const a = values(first);
  const b = values(second);
  const archivedIds = new Set(ledger.labels.filter((label) => label.value.archived).map((label) => label.id));
  const biggest = Math.max(1, ...a.map((group) => group.amount), ...b.map((group) => group.amount));
  const total = (groups: typeof a) => groups.reduce((sum, group) => sum + group.amount, 0);
  const options = <>
    {months.map((month) => <option value={month.slice(5)} key={month}>{monthName(month)}</option>)}
    <option value="average">Media mensile</option><option value="total">Totale anno</option>
  </>;

  return <section className="panel comparison-panel">
    <PanelTitle title="Confronta i periodi" subtitle="Importi per voce e totale." />
    <div className="comparison-selects">
      <label><span><i className="dot compare-a" /> Periodo A</span><select value={first} onChange={(event) => setFirst(event.target.value)}>{options}</select></label>
      <label><span><i className="dot compare-b" /> Periodo B</span><select value={second} onChange={(event) => setSecond(event.target.value)}>{options}</select></label>
    </div>
    <div className="table-scroll"><table className="data-table comparison-table">
      <thead><tr><th scope="col">{type === "expense" ? "Categoria" : "Fonte"}</th><th scope="col" className="number">Periodo A</th><th scope="col" className="number">Periodo B</th></tr></thead>
      <tbody>{a.map((group, index) => (archivedIds.has(group.id) && !group.amount && !b[index].amount) ? null : <tr key={group.id}>
        <td><strong>{group.name}</strong><div className="compare-bars" aria-hidden="true">
          <i className="compare-a" style={{ width: `${group.amount / biggest * 100}%` }} />
          <i className="compare-b" style={{ width: `${b[index].amount / biggest * 100}%` }} />
        </div></td>
        <td className="number">{money(group.amount)}</td><td className="number">{money(b[index].amount)}</td>
      </tr>)}</tbody>
      <tfoot><tr><th scope="row">Totale</th><td className="number">{money(total(a))}</td><td className="number">{money(total(b))}</td></tr></tfoot>
    </table></div>
    {(first === "average" || second === "average") && <p className="panel-note">Media sui mesi con {type === "expense" ? "spese" : "entrate"} registrate ({activeMonths}).</p>}
  </section>;
}

export function Reports({ ledger, year, period }: Pick<PeriodProps, "ledger" | "year" | "period">) {
  const [type, setType] = useState<"expense" | "income">("expense");
  const groups = mix(periodMovements(ledger, period), ledger.labels, type, ledger.accounts).sort((a, b) => b.amount - a.amount);
  const total = groups.reduce((sum, item) => sum + item.amount, 0);
  const flows = yearlyFlow(ledger, year);
  const yearTotal = totals(periodMovements(ledger, String(year)));
  return <>
    <div className="report-tabs segmented" aria-label="Tipo di analisi">
      <button type="button" aria-pressed={type === "expense"} onClick={() => setType("expense")}><ArrowUpRight size={17} /> Spese</button>
      <button type="button" aria-pressed={type === "income"} onClick={() => setType("income")}><ArrowDownLeft size={17} /> Entrate</button>
    </div>
    <div className="split report-grid">
      <StackedChart ledger={ledger} year={year} type={type} />
      <section className="panel breakdown-panel">
        <PanelTitle title={type === "expense" ? "Dettaglio per categoria" : "Dettaglio per fonte"}
          subtitle={period.length === 4 ? `Anno ${year}` : monthLabel(period)} action={<span className="tag amount-tag">{money(total)}</span>} />
        {total ? <ul className="breakdown-list">{groups.filter(({ amount }) => amount > 0).map((group) => (
          <li key={group.id} style={{ "--category-color": group.color, "--category-share": `${group.amount / total * 100}%` } as CSSProperties}>
            {group.detail.length ? <details><summary>
              <span>{group.name}</span><strong>{money(group.amount)}</strong>
            </summary><div className="breakdown-track"><i /></div>
            <ul className="subcategories">{group.detail.map(([name, amount]) => <li key={name}><span>{name}</span><b>{money(amount)}</b></li>)}</ul>
            </details> : <><div className="breakdown-row"><span>{group.name}</span><strong>{money(group.amount)}</strong></div>
              <div className="breakdown-track"><i /></div></>}
          </li>
        ))}</ul> : <Empty icon={<Layers3 size={22} />} title="Nessuna voce nel periodo">Scegli un altro mese o aggiungi un movimento.</Empty>}
      </section>
    </div>
    <div className="split report-grid lower-grid">
      <Compare key={period + type} {...{ ledger, year, period, type }} />
      <section className="panel annual-panel">
        <PanelTitle title={`Riepilogo ${year}`} subtitle="Flussi e risparmio per mese." />
        <div className="table-scroll"><table className="data-table">
          <thead><tr><th scope="col">Mese</th><th scope="col" className="number">Entrate</th><th scope="col" className="number">Spese</th><th scope="col" className="number">Risparmio</th><th scope="col" className="number">%</th></tr></thead>
          <tbody>{flows.map((row) => <tr key={row.month}>
            <td>{monthName(row.month)}</td><td className="number">{money(row.income)}</td><td className="number">{money(row.expense)}</td>
            <td className="number">{money(row.saving)}</td><td className="number">{rate(row.rate)}</td>
          </tr>)}</tbody>
          <tfoot><tr><th scope="row">Totale</th><td className="number">{money(yearTotal.income)}</td><td className="number">{money(yearTotal.expense)}</td>
            <td className="number">{money(yearTotal.saving)}</td><td className="number">{rate(yearTotal.rate)}</td></tr></tfoot>
        </table></div>
      </section>
    </div>
  </>;
}

function SecurityPanel({ session }: { session: SessionInfo }) {
  const [status, setStatus] = useState<"idle" | "sending" | "sent" | "error">("idle");

  async function sendPasswordEmail() {
    setStatus("sending");
    try {
      await session.onPasswordEmail();
      setStatus("sent");
    } catch {
      setStatus("error");
    }
  }

  const passwordText = status === "sent" ? `Email inviata a ${session.email}. Apri il link per scegliere la nuova password.`
    : status === "error" ? "Invio non riuscito. Riprova tra qualche minuto."
    : `Ricevi su ${session.email || "la tua email"} un link per sceglierne una nuova.`;

  return <section className="panel security-panel">
    <PanelTitle title="Sicurezza e sessione" subtitle="La disconnessione automatica vale per questo browser e dispositivo." />
    <ul className="security-list">
      <li>
        <span className="security-icon"><Timer size={18} /></span>
        <div><strong>Disconnessione per inattività</strong>
          <p>{session.idleMinutes
            ? "Se non usi l’app per il tempo scelto esci in automatico. Poco prima compare un avviso."
            : "Disattivata: la sessione resta aperta finché non premi Esci. Sconsigliato su dispositivi condivisi."}</p></div>
        <label><span className="sr-only">Disconnetti dopo</span>
          <select value={session.idleMinutes} onChange={(event) => session.onIdleChange(Number(event.target.value))}>
            {IDLE_OPTIONS.map((minutes) => <option key={minutes} value={minutes}>{minutes ? `Dopo ${idleLabel(minutes)}` : "Disattivata"}</option>)}
          </select></label>
      </li>
      <li>
        <span className="security-icon"><KeyRound size={18} /></span>
        <div><strong>Password</strong><p role={status === "idle" ? undefined : "status"}>{passwordText}</p></div>
        <button type="button" className="button secondary" onClick={() => void sendPasswordEmail()}
          disabled={!session.email || status === "sending" || status === "sent"}>
          {status === "sending" ? "Invio…" : status === "sent" ? "Email inviata" : "Cambia password"}
        </button>
      </li>
    </ul>
  </section>;
}

function CategoryTree({ ledger, type, onLabel }: {
  ledger: Ledger; type: "expense" | "income"; onLabel: (type: "expense" | "income", label?: Label) => void;
}) {
  const labels = ledger.labels.filter((label) => label.value.type === type);
  const active = labels.filter((label) => !label.value.archived);
  const archived = labels.filter((label) => label.value.archived);
  const expense = type === "expense";
  const row = (label: Label) => {
    const subs = expense ? subcategoryList(ledger, label.id) : [];
    const edit = <button type="button" className="icon-button quiet" aria-label={`Modifica ${label.value.name}`}
      title={expense ? "Modifica nome e sottocategorie" : "Modifica"} onClick={(event) => { event.preventDefault(); onLabel(type, label); }}><Pencil size={16} /></button>;
    if (!expense) return <li key={label.id} className="tree-leaf"><span>{label.value.name}</span>{edit}</li>;
    return <li key={label.id}>
      <details className="tree-node">
        <summary><ChevronRight size={15} className="tree-chevron" /><span>{label.value.name}</span>
          <span className="tree-count">{subs.length}</span>{edit}</summary>
        {subs.length ? <ul className="tree-children">{subs.map((name) => {
          const used = subcategoryUsage(ledger, label.id, name).length;
          return <li key={name}><span>{name}</span>{used > 0 && <small>{used} {used === 1 ? "movimento" : "movimenti"}</small>}</li>;
        })}</ul> : <p className="tree-empty">Nessuna sottocategoria.</p>}
        <button type="button" className="text-button tree-manage" onClick={() => onLabel(type, label)}><Pencil size={14} /> Gestisci sottocategorie</button>
      </details>
    </li>;
  };
  return <section className="panel label-panel">
    <PanelTitle title={expense ? "Categorie di spesa" : "Fonti di entrata"}
      subtitle={expense ? "Apri una categoria per vedere le sottocategorie; la matita le modifica." : "Scegli come raggruppare le tue entrate."}
      action={<button type="button" className="button secondary" onClick={() => onLabel(type)}><Plus size={16} /> Aggiungi</button>} />
    <ul className={expense ? "label-list category-tree" : "label-list"}>{active.map(row)}</ul>
    {archived.length > 0 && <details className="archived-block">
      <summary><Archive size={15} /> Archiviate ({archived.length})</summary>
      <ul className="archived-list">{archived.map((label) => <li key={label.id}><span>{label.value.name}</span>
        <button type="button" className="text-button" onClick={() => onLabel(type, label)}>Gestisci</button></li>)}</ul>
    </details>}
  </section>;
}

function DevicePanel() {
  const [theme, setTheme] = useState<ThemeMode>(readTheme);
  const [offline, setOffline] = useState(readOffline);
  const changed = offline !== offlineEnabled;
  const themes: [ThemeMode, string, typeof Sun][] = [["auto", "Automatico", Monitor], ["light", "Chiaro", Sun], ["dark", "Scuro", Moon]];
  return <section className="panel device-panel">
    <PanelTitle title="Aspetto e dispositivo" subtitle="Queste scelte valgono solo per questo browser." />
    <ul className="security-list">
      <li>
        <span className="security-icon">{theme === "dark" ? <Moon size={18} /> : theme === "light" ? <Sun size={18} /> : <Monitor size={18} />}</span>
        <div><strong>Tema</strong><p>{theme === "auto" ? "Segue l’impostazione chiaro/scuro del sistema." : theme === "dark" ? "Sempre scuro." : "Sempre chiaro."}</p></div>
        <div className="segmented" role="group" aria-label="Tema">
          {themes.map(([value, title, Icon]) => <button type="button" key={value} aria-pressed={theme === value}
            onClick={() => { setTheme(value); saveTheme(value); }}><Icon size={15} />{title}</button>)}
        </div>
      </li>
      <li>
        <span className="security-icon"><CloudOff size={18} /></span>
        <div><strong>Uso offline</strong><p>{offline
          ? "I dati restano anche su questo dispositivo: puoi consultarli e registrare movimenti senza rete, si sincronizzano al ritorno della connessione. All’uscita la copia locale viene cancellata."
          : "I dati restano solo sul cloud. Attivalo sui tuoi dispositivi personali, non su PC condivisi."}</p></div>
        <label className="switch"><input type="checkbox" checked={offline} onChange={(event) => { setOffline(event.target.checked); saveOffline(event.target.checked); }} />
          <span aria-hidden="true" /><span className="sr-only">Uso offline</span></label>
      </li>
    </ul>
    {changed && <div className="notice reload-notice"><RotateCw size={18} /><div><strong>Ricarica per applicare</strong>
      <span>{offline ? "Dopo il ricaricamento l’app salverà una copia dei dati su questo dispositivo." : "Dopo il ricaricamento la copia locale verrà cancellata."}</span></div>
      <button type="button" className="button secondary" onClick={() => window.location.reload()}>Ricarica ora</button></div>}
  </section>;
}

export function Settings({ ledger, onLabel, onExport, onBalancesExport, onBackup, onImport, onDemo, session }: {
  ledger: Ledger; onLabel: (type: "expense" | "income", label?: Label) => void;
  onExport: () => void; onBalancesExport: () => void; onBackup: () => void; onImport: () => void; onDemo: () => void; session: SessionInfo;
}) {
  return <>
    <div className="split settings-grid">
      <CategoryTree ledger={ledger} type="expense" onLabel={onLabel} />
      <CategoryTree ledger={ledger} type="income" onLabel={onLabel} />
    </div>
    <SecurityPanel session={session} />
    <DevicePanel />
    <section className="panel export-panel">
      <PanelTitle title="I tuoi dati" subtitle="Esporta in CSV, scarica un backup completo o importa da un file." />
      <div className="export-actions">
        <button type="button" className="button secondary" onClick={onExport} disabled={!ledger.movements.length}><ArrowDownToLine size={17} /> Esporta movimenti</button>
        <button type="button" className="button secondary" onClick={onBalancesExport} disabled={!ledger.balances.length}><ArrowDownToLine size={17} /> Esporta saldi</button>
        <button type="button" className="button secondary" onClick={onBackup}><DatabaseBackup size={17} /> Backup completo</button>
        <button type="button" className="button secondary" onClick={onImport}><FileUp size={17} /> Importa</button>
        <button type="button" className="button secondary" onClick={onDemo}>Dati di esempio</button>
      </div>
      <p className="panel-note"><CircleHelp size={16} /> Il backup completo (.json) contiene anche conti, categorie, sottocategorie e ricorrenti: è il file giusto per spostare tutto su un altro account.</p>
    </section>
  </>;
}
