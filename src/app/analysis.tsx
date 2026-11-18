import { useMemo, useState, type ReactNode } from "react";
import { AlertTriangle, ArrowDownToLine, HandCoins, ReceiptText, Undo2 } from "lucide-react";
import { money, shortDate, type Ledger, type Mutation } from "../lib/ledger";
import { moduleOn } from "../lib/params";
import { taxSummary, type TaxItemStatus, type TaxLine } from "../lib/tax";
import { pendingRefunds, receiveRefund, REFUND_LATE_DAYS } from "../lib/refunds";
import { csvCell, csvDocument, csvNumber, downloadFile } from "../lib/data-io";
import { Empty, PanelTitle } from "./ledger-views";

/*
 * Analisi: schede aggiuntive della versione 2.0 (Dichiarazione, Anno su anno, Spese fisse, Report annuali).
 * La scheda "Periodo" è la vista di analisi di sempre.
 */

export type AnalysisTab = "period" | "yoy" | "fixed" | "tax" | "reports";

export function AnalysisTabs({ ledger, tab, onTab, views }: {
  ledger: Ledger; tab: AnalysisTab; onTab: (tab: AnalysisTab) => void; views: Partial<Record<AnalysisTab, ReactNode>>;
}) {
  const settings = ledger.settings;
  const tabs: [AnalysisTab, string, boolean][] = [
    ["period", "Periodo", true],
    ["yoy", "Anno su anno", moduleOn(settings, "yoy")],
    ["fixed", "Spese fisse", moduleOn(settings, "fixed")],
    ["tax", "Dichiarazione", moduleOn(settings, "tax")],
    ["reports", "Report annuali", true],
  ];
  const visible = tabs.filter(([key, , on]) => on && views[key]);
  const current = visible.some(([key]) => key === tab) ? tab : "period";
  return <>
    {visible.length > 1 && <div className="segmented analysis-tabs" role="tablist" aria-label="Viste di analisi">
      {visible.map(([key, name]) => <button key={key} type="button" role="tab" aria-selected={current === key} aria-pressed={current === key}
        onClick={() => onTab(key)}>{name}</button>)}
    </div>}
    {views[current]}
  </>;
}

// ---------------------------------------------------------------- Dichiarazione

const STATUS_TEXT: Record<TaxItemStatus, string> = {
  ok: "", cash: "contanti: esclusa", "not-dependent": "familiare non a carico: esclusa", refunded: "rimborsata: esclusa", "manual-no": "esclusa a mano",
};

function TaxLineCard({ line }: { line: TaxLine }) {
  const [open, setOpen] = useState(false);
  return <li className="tax-line">
    <button type="button" className="tax-line-head" aria-expanded={open} onClick={() => setOpen((value) => !value)}>
      <span><strong>{line.name}</strong>
        <small>{line.deduction
          ? `Versati ${money(line.total)} → deducibili ${money(line.deductible)} dal reddito`
          : `${money(line.total)}${line.threshold ? ` − franchigia ${money(line.threshold)}` : ""}${line.cap !== null ? ` (tetto ${money(line.cap)})` : ""} = ${money(line.deductible)} × ${line.rate}%`}
          {line.excluded > 0 && ` · escluse ${money(line.excluded)}`}</small></span>
      <b>{line.deduction ? money(line.benefit) : `${money(line.benefit)}`}</b>
    </button>
    {open && <>
      {line.byPerson.length > 1 && <p className="field-note">Per persona: {line.byPerson.map((item) => `${item.person} ${money(item.total)}`).join(" · ")}</p>}
      <div className="table-scroll"><table className="data-table compact-table">
        <thead><tr><th scope="col">Data</th><th scope="col">Descrizione</th><th scope="col">Per</th><th scope="col">Pagamento</th><th scope="col" className="number">Importo</th><th scope="col">Note</th></tr></thead>
        <tbody>{line.items.map((item, index) => <tr key={`${item.movement.id}-${index}`} className={item.status === "ok" ? undefined : "muted-row"}>
          <td>{shortDate(item.movement.value.date)}</td><td>{item.movement.value.title}</td><td>{item.person ?? "Te"}</td>
          <td>{item.movement.value.type === "expense" ? item.movement.value.method || "—" : "Rata"}</td>
          <td className="number">{money(item.amount)}</td><td>{STATUS_TEXT[item.status]}</td>
        </tr>)}</tbody>
      </table></div>
    </>}
  </li>;
}

export function TaxView({ ledger, year }: { ledger: Ledger; year: number }) {
  const [shown, setShown] = useState(year);
  const summary = useMemo(() => taxSummary(ledger, shown), [ledger, shown]);
  const years = [...new Set([year, year - 1, year - 2, ...ledger.movements.map(({ value }) => Number(value.date.slice(0, 4)))])].sort((a, b) => b - a).slice(0, 12);

  function exportCsv() {
    const rows = summary.lines.flatMap((line) => line.items.map((item) => [
      item.movement.value.date, csvCell(line.name), csvCell(item.movement.value.title), csvCell(item.person ?? "Te"),
      csvCell(item.movement.value.type === "expense" ? item.movement.value.method : "Rata"), csvNumber(item.amount), csvCell(STATUS_TEXT[item.status] || "inclusa"),
    ]));
    downloadFile(`dichiarazione-${shown}.csv`, csvDocument(["Data", "Voce", "Descrizione", "Per", "Pagamento", "Importo EUR", "Stato"], rows), "text/csv;charset=utf-8");
  }

  return <section className="panel tax-panel print-area">
    <PanelTitle title={`Dichiarazione dei redditi · spese ${shown}`} subtitle="Stima indicativa: confrontala con la precompilata o con il CAF."
      action={<span className="archived-actions">
        <select aria-label="Anno" value={shown} onChange={(event) => setShown(Number(event.target.value))}>{years.map((item) => <option key={item} value={item}>{item}</option>)}</select>
        <button type="button" className="button secondary small" onClick={exportCsv} disabled={!summary.lines.length}><ArrowDownToLine size={15} /> CSV per il CAF</button>
        <button type="button" className="button secondary small" onClick={() => window.print()}>Stampa</button>
      </span>} />
    {summary.lines.length ? <>
      <div className="tax-totals">
        <div><small>Detrazione stimata</small><strong>{money(summary.detraction)}</strong></div>
        {summary.deductible > 0 && <div><small>Deducibile dal reddito</small><strong>{money(summary.deductible)}</strong></div>}
        <div><small>Spese considerate</small><strong>{money(summary.lines.reduce((sum, line) => sum + line.total, 0))}</strong></div>
      </div>
      <ul className="tax-lines">{summary.lines.map((line) => <TaxLineCard key={line.key} line={line} />)}</ul>
    </> : <Empty icon={<ReceiptText size={22} />} title="Nessuna voce attiva">
      Attiva le voci in Impostazioni → Funzioni → Parametri di legge e bancari e abbina le categorie in «Spese detraibili per categoria».
    </Empty>}
    {summary.warnings.length > 0 && <ul className="tax-warnings">{summary.warnings.map((text) => <li key={text}><AlertTriangle size={15} /> {text}</li>)}</ul>}
    <p className="panel-note">Le spese contano per data di pagamento (anno solare), anche con un inizio del mese personalizzato.</p>
  </section>;
}

// ---------------------------------------------------------------- Rimborsi attesi

export function RefundsPanel({ ledger, today, busy, onCommit }: {
  ledger: Ledger; today: string; busy: boolean; onCommit: (actions: Mutation[], message: string) => void;
}) {
  const items = useMemo(() => pendingRefunds(ledger, today), [ledger, today]);
  const [addIncome, setAddIncome] = useState(true);
  if (!moduleOn(ledger.settings, "refunds") || !items.length) return null;
  const total = items.reduce((sum, item) => sum + item.amount, 0);
  return <section className="panel refunds-panel">
    <PanelTitle title="Rimborsi attesi" subtitle={`${items.length} in attesa · ${money(total)}`} />
    <ul className="rule-list">{items.map((item) => <li key={item.movement.id}>
      <div><strong>{item.movement.value.title} · {money(item.amount)}</strong>
        <small>{item.from || "Rimborso"} · spesa del {shortDate(item.movement.value.date)}
          {item.days > REFUND_LATE_DAYS && <b className="budget-left level-warn"> · in attesa da {item.days} giorni</b>}</small></div>
      <button type="button" className="text-button" disabled={busy}
        onClick={() => onCommit(receiveRefund(ledger, item, today, item.amount, addIncome), "Rimborso segnato come ricevuto.")}><HandCoins size={14} /> Ricevuto</button>
    </li>)}</ul>
    <label className="check-row compact"><input type="checkbox" checked={addIncome} onChange={(event) => setAddIncome(event.target.checked)} />
      <span><strong>Registra anche l’entrata</strong><small>Quando segni «Ricevuto», l’importo entra sul conto della spesa.</small></span></label>
    <p className="field-note"><Undo2 size={12} /> Per un rimborso parziale modifica il movimento (Altre opzioni) e scrivi l’importo ricevuto.</p>
  </section>;
}
