import { useId, type ReactNode } from "react";
import {
  Archive, CalendarClock, ChartNoAxesCombined, CircleHelp, HandCoins, Landmark, PencilLine, Pencil, Plus, RefreshCw,
  TrendingUp, Users, WalletCards,
} from "lucide-react";
import {
  ACCOUNT_TYPES, ASSET_CLASSES, accountBalances, lastRecordedMonth, money, monthLabel, monthName, netWorth, rate, shortDate, yearMonths,
  type Account, type Ledger,
} from "../lib/ledger";
import { debtStatus, type DebtStatus } from "../lib/debts";
import { investmentHistory, investmentSummary } from "../lib/investments";
import { AccountGlyph, Empty, HistoryChart, PanelTitle, axisMoney } from "./ledger-views";

export type PatrimonioTab = "accounts" | "investments" | "debts";

const CLASS_COLORS: Record<string, string> = {
  equity: "#1d9e75", bond: "#378add", pension: "#7f77dd", crypto: "#ef9f27", deposit: "#5e8f3c", other: "#888780",
};

type Handlers = {
  onAccount: (account?: Account) => void;
  onBalance: (account: Account) => void;
  onInvestment: (account?: Account) => void;
  onDebt: (account?: Account) => void;
  onRepay: (debt: Account) => void;
  onContribute: (investment: Account) => void;
};

export function Patrimonio({ ledger, year, month, monthChange, tab, onTab, ...handlers }: Handlers & {
  ledger: Ledger; year: number; month: string; monthChange: (month: string) => void;
  tab: PatrimonioTab; onTab: (tab: PatrimonioTab) => void;
}) {
  const values = accountBalances(ledger, month);
  const sum = netWorth(values);
  const part = (types: string[]) => values.filter(({ account }) => types.includes(account.value.type))
    .reduce((total, { amount }) => total + (amount ?? 0), 0);
  const tabs: [PatrimonioTab, string, typeof WalletCards][] = [["accounts", "Conti", WalletCards], ["investments", "Investimenti", TrendingUp], ["debts", "Debiti", HandCoins]];
  return <>
    <section className="net-hero">
      <div><span className="net-kicker"><Landmark size={17} /> PATRIMONIO NETTO</span><strong>{money(sum)}</strong>
        <p className="net-split">
          <span>Liquidità e beni {money(part(["cash", "asset"]))}</span>
          <span>Investimenti {money(part(["investment"]))}</span>
          <span>Debiti −{money(part(["debt"]))}</span>
        </p>
        <p>{monthLabel(month)} · {values.filter(({ amount }) => amount !== null).length} di {values.length} valori disponibili</p></div>
      <span className="net-decoration" aria-hidden="true"><ChartNoAxesCombined size={126} strokeWidth={1} /></span>
    </section>
    <div className="segmented patrimonio-tabs" role="tablist" aria-label="Sezioni del patrimonio">
      {tabs.map(([key, title, Icon]) => <button type="button" role="tab" key={key} aria-selected={tab === key} aria-pressed={tab === key}
        onClick={() => onTab(key)}><Icon size={16} />{title}</button>)}
    </div>
    {tab === "accounts" && <AccountsTab {...{ ledger, year, month, monthChange }} {...handlers} />}
    {tab === "investments" && <InvestmentsTab {...{ ledger, year, month }} {...handlers} />}
    {tab === "debts" && <DebtsTab {...{ ledger, year, month }} {...handlers} />}
  </>;
}

// ------------------------------------------------------------------ Conti

function AccountsTab({ ledger, year, month, monthChange, onAccount, onBalance }: Handlers & {
  ledger: Ledger; year: number; month: string; monthChange: (month: string) => void;
}) {
  const values = accountBalances(ledger, month).filter(({ account }) => account.value.type === "cash" || account.value.type === "asset");
  const active = values.filter(({ account }) => !account.value.archived);
  const archived = values.filter(({ account }) => account.value.archived);
  const latest = lastRecordedMonth(ledger);
  const history = [`${year - 1}-12`, ...yearMonths(year)].map((key) => ({
    month: key,
    amount: latest && key <= latest ? netWorth(accountBalances(ledger, key)) : null,
  }));
  return <>
    <section className="panel account-list">
      <PanelTitle title="I tuoi conti" subtitle="Liquidità e altre attività."
        action={<button type="button" className="button secondary" onClick={() => onAccount()}><Plus size={17} /> Nuovo conto</button>} />
      <div className="account-grid">
        {active.map(({ account, amount, exact, snapshot }) => <article className="account-card" key={account.id}>
          <div className="account-card-top"><span className={`account-symbol account-${account.id}`}><AccountGlyph account={account} /></span>
            <div><h3>{account.value.name}</h3><span>{ACCOUNT_TYPES[account.value.type]}</span></div>
            <button className="icon-button quiet" type="button" aria-label={`Modifica ${account.value.name}`} title="Modifica, archivia o elimina" onClick={() => onAccount(account)}><Pencil size={16} /></button>
          </div>
          <strong>{money(amount)}</strong>
          <span className="account-detail">{exact ? "Saldo registrato" : snapshot ? `Da ${monthLabel(snapshot.value.month)} + movimenti collegati` : "Saldo iniziale da registrare"}</span>
          <button type="button" className="button secondary" onClick={() => onBalance(account)}>{exact ? "Modifica saldo" : "Registra saldo"}</button>
        </article>)}
      </div>
      {archived.length > 0 && <details className="archived-block">
        <summary><Archive size={15} /> Conti archiviati ({archived.length})</summary>
        <ul className="archived-list">{archived.map(({ account, amount }) => <li key={account.id}>
          <span>{account.value.name}<small>{ACCOUNT_TYPES[account.value.type]}{amount !== null && amount !== 0 ? ` · ancora nel patrimonio: ${money(amount)}` : ""}</small></span>
          <button type="button" className="text-button" onClick={() => onAccount(account)}>Gestisci</button>
        </li>)}</ul>
      </details>}
      <p className="panel-note"><CircleHelp size={16} /> Il saldo registrato a fine mese comprende già i movimenti di quel mese. L’app applica quelli collegati dei mesi successivi.</p>
    </section>
    <section className="panel history-panel">
      <PanelTitle title="Storico del patrimonio" subtitle={`Patrimonio netto da dicembre ${year - 1} a dicembre ${year}`} />
      {history.some(({ amount }) => amount !== null) ? <>
        <HistoryChart points={history} month={month} onMonth={monthChange} />
        <details className="history-detail"><summary>Mostra valori mensili</summary>
          <div className="table-scroll"><table className="data-table compact-table">
            <thead><tr><th scope="col">Mese</th><th className="number" scope="col">Patrimonio netto</th></tr></thead>
            <tbody>{history.map((point) => <tr key={point.month}><td>{monthLabel(point.month)}</td><td className="number">{money(point.amount)}</td></tr>)}</tbody>
          </table></div>
        </details>
      </> : <Empty icon={<ChartNoAxesCombined size={23} />} title="Lo storico è ancora vuoto">Registra il saldo di un conto per iniziare a tracciare il patrimonio.</Empty>}
    </section>
  </>;
}

// ------------------------------------------------------------------ Investimenti

function Metric({ label, value, caption, tone }: { label: string; value: string; caption?: string; tone?: "good" | "bad" | "warn" }) {
  return <div className={`metric${tone ? ` metric-${tone}` : ""}`}><span>{label}</span><strong>{value}</strong>{caption && <small>{caption}</small>}</div>;
}

function TwoLineChart({ points }: { points: { month: string; value: number | null; paid: number | null }[] }) {
  const id = useId();
  const numbers = points.flatMap(({ value, paid }) => [value, paid].filter((item): item is number => item !== null));
  if (!numbers.length) return null;
  const min = Math.min(...numbers);
  const max = Math.max(...numbers);
  const pad = Math.max(1, (max - min) * 0.12);
  const low = Math.max(0, min - pad);
  const high = max + pad;
  const x = (index: number) => (index + 0.5) * 1000 / points.length;
  const y = (amount: number) => 10 + 150 * (high - amount) / (high - low);
  const line = (key: "value" | "paid") => points.flatMap((point, index) => point[key] === null ? [] : [[x(index), y(point[key] as number)]])
    .map((pair, index) => (index ? "L" : "M") + pair.join(",")).join(" ");
  return <div className="history-scroll"><div className="history-graph two-line">
    <div className="history-scale"><span>{axisMoney(high)}</span><span>{axisMoney((high + low) / 2)}</span><span>{axisMoney(low)}</span></div>
    <svg viewBox="0 0 1000 170" className="history-svg" preserveAspectRatio="none" role="img" aria-labelledby={id}>
      <title id={id}>Valore e versato mese per mese</title>
      {[10, 85, 160].map((row) => <line key={row} x1="0" x2="1000" y1={row} y2={row} stroke="#dfe8e4" strokeDasharray="4 4" />)}
      <path className="line-paid" d={line("paid")} fill="none" stroke="#8a9b94" strokeWidth="2" strokeDasharray="6 5" vectorEffect="non-scaling-stroke" />
      <path d={line("value")} fill="none" stroke="#13836e" strokeWidth="2.5" vectorEffect="non-scaling-stroke" />
    </svg>
    <div className="history-labels" style={{ gridTemplateColumns: `repeat(${points.length}, minmax(0, 1fr))` }}>
      {points.map((point) => <span key={point.month} className="plot-label">{monthName(point.month).slice(0, 3)}</span>)}
    </div>
  </div></div>;
}

function InvestmentsTab({ ledger, year, month, onInvestment, onBalance, onContribute }: Handlers & { ledger: Ledger; year: number; month: string }) {
  const summary = investmentSummary(ledger, month);
  const active = summary.rows.filter(({ account }) => !account.value.archived);
  const archived = summary.rows.filter(({ account }) => account.value.archived);
  const history = investmentHistory(ledger, [`${year - 1}-12`, ...yearMonths(year)]);
  const byClass = new Map<string, number>();
  for (const row of active) {
    const key = row.account.value.invest?.assetClass ?? "other";
    byClass.set(key, (byClass.get(key) ?? 0) + Math.max(0, row.value ?? 0));
  }
  const allocation = [...byClass.entries()].filter(([, amount]) => amount > 0).sort((a, b) => b[1] - a[1]);
  const allocated = allocation.reduce((total, [, amount]) => total + amount, 0);
  const gainRate = summary.gain !== null && summary.paid > 0 ? summary.gain / summary.paid : null;

  if (!summary.rows.length) {
    return <section className="panel"><Empty icon={<TrendingUp size={22} />} title="Nessun investimento"
      action={<button type="button" className="button secondary" onClick={() => onInvestment()}><Plus size={17} /> Nuovo investimento</button>}>
      Aggiungi un ETF, un fondo pensione, dei buoni o un conto deposito: segui valore, versato e rendimento.
    </Empty></section>;
  }

  return <>
    <section className="panel">
      <PanelTitle title="Investimenti" subtitle={`Valori a ${monthLabel(month)}`}
        action={<button type="button" className="button secondary" onClick={() => onInvestment()}><Plus size={17} /> Nuovo investimento</button>} />
      <div className="metric-grid">
        <Metric label="Valore attuale" value={money(summary.value)} caption="Ultimi valori aggiornati + versamenti successivi" />
        <Metric label="Totale versato" value={money(summary.paid)} caption="Versamenti meno prelievi" />
        <Metric label="Rendimento" value={summary.gain === null ? "—" : `${summary.gain >= 0 ? "+" : "−"}${money(Math.abs(summary.gain))}`}
          caption={gainRate === null ? "Aggiorna i valori per calcolarlo" : `${gainRate >= 0 ? "+" : ""}${rate(gainRate)} sul versato`}
          tone={summary.gain === null ? undefined : summary.gain >= 0 ? "good" : "bad"} />
      </div>
      {history.some(({ value }) => value !== null) && <>
        <div className="chart-legend"><span><i className="legend-line" /> Valore</span><span><i className="legend-line dashed" /> Versato</span></div>
        <TwoLineChart points={history} />
      </>}
      {allocated > 0 && <div className="allocation">
        <span className="allocation-title">Composizione</span>
        <div className="allocation-bar">{allocation.map(([key, amount]) => <i key={key} title={`${ASSET_CLASSES[key as keyof typeof ASSET_CLASSES]} ${rate(amount / allocated)}`}
          style={{ width: `${amount / allocated * 100}%`, background: CLASS_COLORS[key] }} />)}</div>
        <div className="legend">{allocation.map(([key, amount]) => <span key={key}><i style={{ background: CLASS_COLORS[key] }} />{ASSET_CLASSES[key as keyof typeof ASSET_CLASSES]} {rate(amount / allocated)}</span>)}</div>
      </div>}
    </section>
    <section className="panel holdings-panel">
      <ul className="holding-list">
        {active.map(({ account, value, paid, gain, snapshot }) => <li key={account.id}>
          <div className="holding-main">
            <strong>{account.value.name}</strong>
            <small>{ASSET_CLASSES[account.value.invest?.assetClass ?? "other"]}{snapshot ? ` · valore aggiornato a ${monthLabel(snapshot.value.month)}` : " · valore da registrare"}</small>
          </div>
          <dl className="holding-figures">
            <div><dt>Valore</dt><dd>{money(value)}</dd></div>
            <div><dt>Versato</dt><dd>{money(paid)}</dd></div>
            <div><dt>Rendimento</dt><dd className={gain === null ? "" : gain >= 0 ? "gain" : "loss"}>{gain === null ? "—" : `${gain >= 0 ? "+" : "−"}${money(Math.abs(gain))}`}{gain !== null && paid > 0 && <small>{gain >= 0 ? "+" : ""}{rate(gain / paid)}</small>}</dd></div>
          </dl>
          <div className="holding-actions">
            <button type="button" className="button secondary small" onClick={() => onBalance(account)}><RefreshCw size={14} /> Aggiorna valore</button>
            <button type="button" className="button secondary small" onClick={() => onContribute(account)}><Plus size={14} /> Versa</button>
            <button type="button" className="icon-button quiet" aria-label={`Modifica ${account.value.name}`} onClick={() => onInvestment(account)}><Pencil size={15} /></button>
          </div>
        </li>)}
      </ul>
      {archived.length > 0 && <details className="archived-block">
        <summary><Archive size={15} /> Investimenti archiviati ({archived.length})</summary>
        <ul className="archived-list">{archived.map(({ account }) => <li key={account.id}><span>{account.value.name}</span>
          <button type="button" className="text-button" onClick={() => onInvestment(account)}>Gestisci</button></li>)}</ul>
      </details>}
      <p className="panel-note"><CircleHelp size={16} /> I versamenti sono trasferimenti da un conto all’investimento (non contano come spese). Per un PAC crea un ricorrente di tipo Trasferimento. Il valore lo aggiorni tu, ad esempio a fine mese.</p>
    </section>
  </>;
}

// ------------------------------------------------------------------ Debiti

function DebtCard({ ledger, debt, status, year, onDebt, onRepay, onBalance }: Pick<Handlers, "onDebt" | "onRepay" | "onBalance"> & { ledger: Ledger; debt: Account; status: DebtStatus; year: number }) {
  const details = status.details;
  const loan = details?.kind === "loan" ? details : null;
  const flexible = details?.kind === "flexible" ? details : null;
  const accountName = (id: string | null | undefined) => (id ? ledger.accounts.find((account) => account.id === id)?.value.name : undefined);
  let meta: ReactNode = "Dettagli non completati: aggiornamento solo manuale";
  if (loan) meta = <>TAN {loan.tan.toLocaleString("it-IT")}%{loan.taeg !== null && <> · TAEG {loan.taeg.toLocaleString("it-IT")}%</>} · rata {money(loan.installment)}{accountName(loan.accountId) && <> · addebito su {accountName(loan.accountId)}</>}</>;
  if (flexible) meta = <>{flexible.note || "Debito flessibile"} · dal {shortDate(flexible.start)}</>;
  const Icon = flexible ? Users : HandCoins;
  return <article className="debt-card">
    <div className="debt-top">
      <span className="debt-icon"><Icon size={18} /></span>
      <div className="debt-title"><h3>{debt.value.name}</h3><small>{meta}</small></div>
      <div className="debt-residual"><strong>{money(status.residual)}</strong><small>residuo</small></div>
      <button type="button" className="icon-button quiet" aria-label={`Modifica ${debt.value.name}`} onClick={() => onDebt(debt)}><Pencil size={15} /></button>
    </div>
    {status.progress !== null && <>
      <div className="progress" role="progressbar" aria-valuenow={Math.round(status.progress * 100)} aria-valuemin={0} aria-valuemax={100} aria-label="Quota rimborsata">
        <i style={{ width: `${status.progress * 100}%` }} /></div>
      <div className="debt-progress-text">
        <span>Rimborsato {rate(status.progress)}{loan && status.paidCount !== null && ` · ${status.paidCount} rate su ${loan.months}`}{flexible && ` · ${money(details!.principal - (status.residual ?? 0))} su ${money(details!.principal)}`}</span>
        {loan && status.endDate && <span>Fine prevista: {monthLabel(status.endDate.slice(0, 7))}</span>}
        {flexible && status.lastPayment && <span>Ultimo rimborso: {shortDate(status.lastPayment.date)} · {money(status.lastPayment.amount)}</span>}
      </div>
    </>}
    {status.next && status.nextSplit && <div className="debt-next">
      <div><CalendarClock size={15} /> Prossima rata {shortDate(status.next)}
        <small>{status.nextSplit.interest
          ? <>{money(status.nextSplit.principal)} capitale (scala il debito) + {money(status.nextSplit.interest)} interessi e spese (spesa)</>
          : <>{money(status.nextSplit.principal)}, tutto capitale: scala il debito</>}</small></div>
      <span className="pill pill-good"><RefreshCw size={12} /> Automatico</span>
    </div>}
    {!status.next && (loan || flexible) && (status.residual ?? 0) > 0 && <div className="debt-next manual">
      <div><PencilLine size={15} /> {flexible ? "Aggiorni tu: registra i rimborsi quando li fai o correggi il residuo." : "Nessuna rata ricorrente attiva: registrale a mano o attivale dalla matita."}</div>
      <span className="pill">Manuale</span>
    </div>}
    {(status.interestTotal > 0) && <p className="debt-interest">Interessi e spese pagati: {money(status.interestYear)} nel {year} · {money(status.interestTotal)} in totale</p>}
    <div className="debt-actions">
      <button type="button" className="button secondary small" onClick={() => onRepay(debt)}><HandCoins size={14} /> {flexible ? "Registra rimborso" : "Registra rata"}</button>
      <button type="button" className="button secondary small" onClick={() => onBalance(debt)}><PencilLine size={14} /> Correggi residuo</button>
      {!details && <button type="button" className="text-button" onClick={() => onDebt(debt)}>Completa i dettagli</button>}
    </div>
  </article>;
}

function DebtsTab({ ledger, year, month, onDebt, onRepay, onBalance }: Handlers & { ledger: Ledger; year: number; month: string }) {
  const debts = ledger.accounts.filter((account) => account.value.type === "debt");
  const active = debts.filter((account) => !account.value.archived);
  const archived = debts.filter((account) => account.value.archived);
  const statuses = active.map((debt) => debtStatus(ledger, debt, month));
  // Anche un debito archiviato con residuo resta nel patrimonio, come nel riquadro in alto.
  const values = accountBalances(ledger, month);
  const residualOf = (debt: Account) => values.find((item) => item.account.id === debt.id)?.amount ?? null;
  const residual = debts.reduce((total, debt) => total + (residualOf(debt) ?? 0), 0);
  const monthly = statuses.reduce((total, status) => total + (status.details?.kind === "loan" && (status.residual ?? 0) > 0 ? status.details.installment : 0), 0);
  const interest = statuses.reduce((total, status) => total + status.interestYear, 0);

  if (!debts.length) {
    return <section className="panel"><Empty icon={<HandCoins size={22} />} title="Nessun debito"
      action={<button type="button" className="button secondary" onClick={() => onDebt()}><Plus size={17} /> Nuovo debito</button>}>
      Aggiungi un finanziamento (anche a tasso zero) o un debito flessibile verso amici e parenti.
    </Empty></section>;
  }

  return <>
    <section className="panel">
      <PanelTitle title="Debiti" subtitle={`Residui a ${monthLabel(month)}: si aggiornano con le rate registrate e puoi correggerli quando vuoi.`}
        action={<button type="button" className="button secondary" onClick={() => onDebt()}><Plus size={17} /> Nuovo debito</button>} />
      <div className="metric-grid">
        <Metric label="Debito residuo" value={money(residual)} caption="Sottratto dal patrimonio" />
        <Metric label="Rate al mese" value={money(monthly)} caption={(() => { const count = statuses.filter((status) => status.details?.kind === "loan" && (status.residual ?? 0) > 0).length; return count === 1 ? "1 finanziamento attivo" : `${count} finanziamenti attivi`; })()} />
        <Metric label={`Interessi e spese ${year}`} value={money(interest)} caption="Contano tra le spese" tone="warn" />
      </div>
    </section>
    <div className="debt-list">
      {active.map((debt, index) => <DebtCard key={debt.id} {...{ ledger, debt, year, onDebt, onRepay, onBalance }} status={statuses[index]} />)}
    </div>
    {archived.length > 0 && <section className="panel"><details className="archived-block flush">
      <summary><Archive size={15} /> Debiti estinti o archiviati ({archived.length})</summary>
      <ul className="archived-list">{archived.map((debt) => {
        const left = residualOf(debt);
        return <li key={debt.id}><span>{debt.value.name}{left ? <small className="archived-warning">Residuo {money(left)} ancora sottratto dal patrimonio</small> : left === 0 ? <small>Estinto</small> : null}</span>
          <span className="archived-actions">{!!left && <button type="button" className="text-button" onClick={() => onBalance(debt)}>Correggi residuo</button>}
            <button type="button" className="text-button" onClick={() => onDebt(debt)}>Gestisci</button></span></li>;
      })}</ul>
    </details></section>}
  </>;
}
