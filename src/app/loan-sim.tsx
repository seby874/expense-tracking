import { useMemo, useState } from "react";
import { AlertTriangle, Calculator, Check } from "lucide-react";
import { money, monthLabel, parseMoney, type Account, type Ledger } from "../lib/ledger";
import { debtDetails, debtStatus } from "../lib/debts";
import { lostDeduction, opportunityGain, simulate, type Scenario, type SimOptions } from "../lib/loan-sim";
import { moduleOn, paramsFor } from "../lib/params";
import { fundStatus } from "../lib/fund";
import { occurrence } from "../lib/recurring";

const COLORS = ["#5d7480", "#13836e", "#3567c8", "#8650b8", "#d9713a", "#c2457f", "#c99a1e", "#0f8a9a", "#6f8a2e", "#c8463d"];

function num(text: string) {
  const value = Number(text.replace(",", ".").replace("−", "-").trim());
  return text.trim() && Number.isFinite(value) ? value : null;
}

function ResidualChart({ scenarios }: { scenarios: Scenario[] }) {
  const series = scenarios.filter((item) => item.residuals.length > 1);
  const longest = Math.max(1, ...series.map((item) => item.residuals.length));
  const top = Math.max(1, ...series.map((item) => item.residuals[0] ?? 0));
  return <div className="chart-box" aria-hidden="true"><svg viewBox="0 0 300 120" preserveAspectRatio="none">
    {series.map((item, index) => <polyline key={item.kind + index} className="chart-line" stroke={COLORS[scenarios.indexOf(item) % COLORS.length]}
      points={item.residuals.map((value, n) => `${(n / longest) * 300},${120 - (value / top) * 115}`).join(" ")} />)}
  </svg></div>;
}

export function LoanSimulator({ ledger, debt, today, onRegisterExtra, onApplyPlan }: {
  ledger: Ledger; debt: Account; today: string;
  onRegisterExtra: (amount: number) => void;
  onApplyPlan: (installment: number, remaining: number) => void;
}) {
  const details = debtDetails(debt);
  const loan = details?.kind === "loan" ? details : null;
  const status = useMemo(() => debtStatus(ledger, debt, today.slice(0, 7)), [ledger, debt, today]);
  const params = paramsFor(ledger, Number(today.slice(0, 4))).value;
  const [extra, setExtra] = useState("");
  const [monthly, setMonthly] = useState("");
  const [installment, setInstallment] = useState("");
  const [duration, setDuration] = useState("");
  const [newTan, setNewTan] = useState("");
  const [delta, setDelta] = useState(loan?.variable ? "1" : "");
  const [penalty, setPenalty] = useState("0");
  const [invest, setInvest] = useState("3");

  const inputs = loan && status.residual !== null ? {
    residual: Math.max(0, status.residual), tan: loan.tan, installment: loan.installment, fee: loan.fee,
    remaining: Math.max(1, loan.months - (status.paidCount ?? loan.paidBefore)), date: today,
    firstNext: status.next ?? occurrence({ frequency: "monthly", every: 1, start: loan.firstDate }, Math.min(loan.months - 1, status.paidCount ?? 0)) ?? today,
  } : null;
  const options: SimOptions = {
    extra: parseMoney(extra || "0") ?? 0, monthlyExtra: parseMoney(monthly || "0") ?? 0,
    newInstallment: installment.trim() ? parseMoney(installment) : null, newDuration: duration.trim() ? Math.round(num(duration) ?? 0) || null : null,
    newTan: newTan.trim() ? num(newTan) : null, rateDelta: num(delta) ?? 0, penaltyPercent: num(penalty) ?? 0,
  };
  const inputKey = JSON.stringify(inputs);
  const optionKey = JSON.stringify(options);
  const scenarios = useMemo(() => (inputs && loan ? simulate(inputs, options, loan, params) : []),
    // Le chiavi in testo bastano: gli oggetti si ricreano a ogni disegno.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [inputKey, optionKey, loan, params]);

  if (!loan || !inputs) {
    return <p className="form-help">Il simulatore funziona con i finanziamenti a rate (piano alla francese) che hanno un residuo registrato. Completa i dettagli del debito.</p>;
  }

  const base = scenarios[0];
  const fund = fundStatus(ledger, today);
  const taxOn = moduleOn(ledger.settings, "tax") && (ledger.settings.deductions ?? []).includes("mutuo") && !!loan.home;
  const rule = params.deductions.mutuo;
  const investRate = num(invest) ?? 0;
  const best = scenarios.find((item) => item.kind === "reduce-duration");

  return <div className="editor loan-sim">
    <p className="form-help">Residuo oggi <b>{money(inputs.residual)}</b> · rata {money(inputs.installment)} · {inputs.remaining} rate residue · TAN {loan.tan.toLocaleString("it-IT")}%
      {loan.home ? " · mutuo prima casa: nessuna penale" : loan.consumer ? " · credito ai consumatori" : ""}</p>
    <div className="sim-grid">
      <label>Versamento extra €<input inputMode="decimal" value={extra} onChange={(event) => setExtra(event.target.value)} placeholder="0,00" /></label>
      <label>In più ogni mese €<input inputMode="decimal" value={monthly} onChange={(event) => setMonthly(event.target.value)} placeholder="0,00" /></label>
      <label>Rata scelta € <span className="optional">facoltativa</span><input inputMode="decimal" value={installment} onChange={(event) => setInstallment(event.target.value)} /></label>
      <label>Durata scelta (rate) <span className="optional">facoltativa</span><input inputMode="numeric" value={duration} onChange={(event) => setDuration(event.target.value.replace(/\D/g, "").slice(0, 3))} /></label>
      <label>Surroga: nuovo TAN % <span className="optional">facoltativo</span><input inputMode="decimal" value={newTan} onChange={(event) => setNewTan(event.target.value)} /></label>
      <label>Tasso variabile: variazione in punti<input inputMode="decimal" value={delta} onChange={(event) => setDelta(event.target.value)} placeholder="es. 1 o -0,5" /></label>
      {!loan.home && !loan.consumer && <label>Penale % (dal contratto)<input inputMode="decimal" value={penalty} onChange={(event) => setPenalty(event.target.value)} /></label>}
      <label>Confronto: rendimento investimento %<input inputMode="decimal" value={invest} onChange={(event) => setInvest(event.target.value)} /></label>
    </div>

    <div className="table-scroll"><table className="data-table compact-table">
      <thead><tr><th scope="col">Scenario</th><th scope="col" className="number">Rata</th><th scope="col">Fine</th><th scope="col" className="number">Interessi</th>
        <th scope="col" className="number">Risparmio</th><th scope="col" className="number">Penale</th><th scope="col" className="number">Mesi in meno</th><th scope="col"><span className="sr-only">Azioni</span></th></tr></thead>
      <tbody>{scenarios.map((item, index) => <tr key={item.kind + index}>
        <td><span className="dot" style={{ background: COLORS[index % COLORS.length] }} /> {item.name}{item.note && <small className="field-note"> {item.note}</small>}</td>
        <td className="number">{item.installment ? money(item.installment) : "—"}</td>
        <td>{item.end ? monthLabel(item.end.slice(0, 7)) : item.months === null ? "mai" : "—"}</td>
        <td className="number">{money(item.interest)}</td>
        <td className={`number ${item.saved !== null && item.saved < 0 ? "status-bad" : ""}`}>{item.saved === null ? "—" : money(item.saved)}</td>
        <td className="number">{item.penalty ? money(item.penalty) : "—"}</td>
        <td className="number">{item.monthsSaved ?? "—"}</td>
        <td>{item.kind !== "base" && item.kind !== "payoff" && item.months !== null && item.months > 0 && item.installment > 0 &&
          <button type="button" className="text-button" title="Aggiorna rata e durata del finanziamento con questo scenario"
            onClick={() => onApplyPlan(item.installment, item.months!)}><Check size={14} /> Applica</button>}</td>
      </tr>)}</tbody>
    </table></div>
    <ResidualChart scenarios={scenarios} />

    {options.extra > 0 && best && base && (() => {
      const net = (best.saved ?? 0) - best.penalty;
      const lost = taxOn ? lostDeduction(base, best, rule.rate, rule.cap) : 0;
      const gain = opportunityGain(options.extra, investRate, base.months ?? inputs.remaining, params.withholding);
      const monthsLeft = fund.essential ? (fund.weighted - options.extra) / fund.essential : null;
      return <ul className="tax-warnings">
        <li><Calculator size={15} /> Risparmio netto riducendo la durata: {money(net)}{lost ? ` − detrazione persa ${money(lost)} = ${money(net - lost)}` : ""}.</li>
        <li><Calculator size={15} /> Investendo {money(options.extra)} al {investRate.toLocaleString("it-IT")}% (ritenuta {params.withholding}%) per lo stesso periodo: circa {money(gain)}.
          {" "}{net - lost > gain ? "L’estinzione rende di più." : "Investire renderebbe di più (ma con rischio)."}</li>
        {monthsLeft !== null && monthsLeft < fund.settings.targetMonths && <li><AlertTriangle size={15} />
          Dopo il versamento il fondo di emergenza scenderebbe a {monthsLeft.toLocaleString("it-IT", { maximumFractionDigits: 1 })} mesi (obiettivo {fund.settings.targetMonths}): estinguere usando il fondo è quasi sempre un errore.</li>}
      </ul>;
    })()}
    {scenarios.some((item) => item.kind === "extend") && <p className="tax-warnings"><AlertTriangle size={15} /> Allungare la durata abbassa la rata ma fa pagare più interessi in totale.</p>}
    <div className="modal-actions">
      {options.extra > 0 && <button type="button" className="button primary" onClick={() => onRegisterExtra(options.extra)}>Registra il versamento di {money(options.extra)}</button>}
    </div>
  </div>;
}
