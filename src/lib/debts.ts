import {
  INTEREST_LABEL, accountBalances, todayInRome,
  type Account, type Ledger, type LoanDetails, type Movement, type Recurring,
} from "./ledger";
import { nextDate, occurrence } from "./recurring";

// Calcoli dei finanziamenti con piano "alla francese" (rata costante).
// Importi in centesimi, tassi in percentuale (6,9 = 6,9%).

export function monthlyRate(tan: number) {
  return tan / 1200;
}

/** Rata costante: C × i ÷ (1 − (1 + i)^−n). Con tasso zero è semplicemente C ÷ n. */
export function loanInstallment(principal: number, tan: number, months: number) {
  if (months <= 0 || principal <= 0) return 0;
  const i = monthlyRate(tan);
  if (i === 0) return Math.ceil(principal / months);
  return Math.round((principal * i) / (1 - Math.pow(1 + i, -months)));
}

export type PlanRow = { n: number; date: string | null; interest: number; capital: number; fee: number; payment: number; residual: number };

/** Piano di ammortamento completo. L'ultima rata chiude esattamente il debito. */
export function amortization(details: Pick<LoanDetails, "principal" | "tan" | "months" | "installment" | "fee" | "firstDate">): PlanRow[] {
  const i = monthlyRate(details.tan);
  const rows: PlanRow[] = [];
  let residual = details.principal;
  for (let n = 1; n <= details.months && residual > 0; n++) {
    const interest = Math.round(residual * i);
    const capital = n === details.months ? residual : Math.max(0, Math.min(details.installment - details.fee - interest, residual));
    residual -= capital;
    rows.push({
      n, interest, capital, fee: details.fee, payment: capital + interest + details.fee, residual,
      date: occurrence({ frequency: "monthly", every: 1, start: details.firstDate }, n - 1),
    });
  }
  return rows;
}

export function debtDetails(account: Account | undefined) {
  return account?.value.type === "debt" ? account.value.debt : undefined;
}

function previousMonth(month: string) {
  const [year, value] = month.split("-").map(Number);
  return value === 1 ? `${year - 1}-12` : `${year}-${String(value - 1).padStart(2, "0")}`;
}

/** Residuo prima di una rata del giorno `date`: ultimo residuo registrato prima di quel mese meno il capitale già rimborsato. */
export function residualBefore(ledger: Ledger, debtId: string, date: string, excludeId?: string): number | null {
  const month = date.slice(0, 7);
  const snapshot = ledger.balances.find(({ value }) => value.accountId === debtId && value.month < month);
  if (!snapshot) return null;
  let residual = snapshot.value.amount;
  for (const movement of ledger.movements) {
    const value = movement.value;
    if (movement.id === excludeId || value.type !== "repayment" || value.debtId !== debtId) continue;
    if (value.date.slice(0, 7) > snapshot.value.month && value.date < date) residual -= value.principal;
  }
  return residual;
}

/** Residuo teorico prima della rata del giorno `date`, secondo il piano. */
function plannedResidual(details: LoanDetails, date: string) {
  const plan = amortization(details);
  const before = plan.filter((row) => row.date !== null && row.date < date);
  return before.length ? before[before.length - 1].residual : details.principal;
}

/**
 * Divide una rata tra capitale e interessi (più le spese fisse per rata).
 * Debito flessibile o tasso zero: tutto capitale.
 */
export function splitRepayment(ledger: Ledger, debt: Account | undefined, date: string, amount: number, excludeId?: string) {
  const details = debtDetails(debt);
  if (!debt || !details || details.kind !== "loan") return { principal: amount, interest: 0, residual: debt ? residualBefore(ledger, debt.id, date, excludeId) : null, estimated: false };
  // Senza un residuo registrato prima di quella data si usa il piano di ammortamento.
  const recorded = residualBefore(ledger, debt.id, date, excludeId);
  const residual = recorded ?? plannedResidual(details, date);
  const interest = Math.min(amount, Math.max(0, Math.round(Math.max(residual, 0) * monthlyRate(details.tan))) + details.fee);
  return { principal: amount - interest, interest, residual, estimated: recorded === null };
}

/** Movimento "Rata" pronto, con la divisione calcolata alla data indicata. */
export function repaymentFor(ledger: Ledger, debt: Account, date: string, amount?: number, accountId?: string | null): Movement["value"] {
  const details = debtDetails(debt);
  const total = amount ?? (details?.kind === "loan" ? details.installment : 0);
  const split = splitRepayment(ledger, debt, date, total);
  return {
    type: "repayment", date, title: `${details?.kind === "flexible" ? "Rimborso" : "Rata"} ${debt.value.name}`.slice(0, 160),
    amount: total, principal: split.principal, interest: split.interest, debtId: debt.id,
    accountId: accountId !== undefined ? accountId : details?.accountId ?? null,
    labelId: details?.kind === "loan" ? details.interestLabelId : INTEREST_LABEL, notes: "",
  };
}

export function linkedRecurring(ledger: Ledger, debtId: string): Recurring | undefined {
  return ledger.recurring.find(({ value }) => value.template.type === "repayment" && value.template.debtId === debtId);
}

export type DebtStatus = ReturnType<typeof debtStatus>;

/** Situazione del debito alla fine del mese `month` (di solito il periodo selezionato). */
export function debtStatus(ledger: Ledger, debt: Account, month = todayInRome().slice(0, 7)) {
  const details = debtDetails(debt);
  const year = month.slice(0, 4);
  const residual = accountBalances(ledger, month).find((item) => item.account.id === debt.id)?.amount ?? null;
  const payments = ledger.movements.filter(({ value }) => value.type === "repayment" && value.debtId === debt.id && value.date.slice(0, 7) <= month);
  let repaid = 0;
  let interestYear = 0;
  let interestTotal = 0;
  for (const { value } of payments) {
    if (value.type !== "repayment") continue;
    repaid += value.principal;
    interestTotal += value.interest;
    if (value.date.startsWith(year)) interestYear += value.interest;
  }
  const principal = details?.principal ?? null;
  const progress = principal && residual !== null ? Math.min(1, Math.max(0, 1 - residual / principal)) : null;
  const recurring = linkedRecurring(ledger, debt.id);
  const next = recurring && !recurring.value.paused ? nextDate(recurring.value.schedule) : null;
  let paidCount: number | null = null;
  let endDate: string | null = null;
  if (details?.kind === "loan") {
    paidCount = Math.min(details.months, details.paidBefore + payments.length);
    endDate = occurrence({ frequency: "monthly", every: 1, start: details.firstDate }, details.months - 1);
  }
  const nextSplit = next ? splitRepayment(ledger, debt, next, details?.kind === "loan" ? details.installment : recurring?.value.template.amount ?? 0) : null;
  return {
    details, residual, repaid, interestYear, interestTotal, progress, recurring, next, nextSplit, paidCount, endDate,
    lastPayment: payments[0]?.value ?? null, payments: payments.length,
  };
}

/** Mese in cui registrare il residuo iniziale di un debito nuovo. */
export function initialSnapshot(details: LoanDetails | { kind: "flexible"; principal: number; start: string }) {
  if (details.kind === "flexible") return { month: previousMonth(details.start.slice(0, 7)), amount: details.principal };
  if (details.paidBefore <= 0) return { month: previousMonth(details.firstDate.slice(0, 7)), amount: details.principal };
  const plan = amortization(details);
  const row = plan[Math.min(details.paidBefore, plan.length) - 1];
  return { month: (row.date ?? details.firstDate).slice(0, 7), amount: row.residual };
}
