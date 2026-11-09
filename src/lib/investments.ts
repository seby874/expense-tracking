import { accountBalances, lastRecordedMonth, type Account, type Ledger } from "./ledger";

export function isInvestment(account: Account) {
  return account.value.type === "investment";
}

/** Versato netto in un investimento fino a `month` compreso: versato iniziale + trasferimenti in entrata − in uscita. */
export function contributed(ledger: Ledger, account: Account, month: string) {
  let total = account.value.invest?.contributedBefore ?? 0;
  for (const { value } of ledger.movements) {
    if (value.type !== "transfer" || value.date.slice(0, 7) > month) continue;
    if (value.toAccountId === account.id) total += value.amount;
    if (value.accountId === account.id) total -= value.amount;
  }
  return total;
}

export function investmentSummary(ledger: Ledger, month: string) {
  const investments = ledger.accounts.filter(isInvestment);
  const balances = accountBalances(ledger, month);
  const rows = investments.map((account) => {
    const item = balances.find((entry) => entry.account.id === account.id);
    const value = item?.amount ?? null;
    const paid = contributed(ledger, account, month);
    return { account, value, paid, gain: value === null ? null : value - paid, snapshot: item?.snapshot ?? null };
  });
  const known = rows.filter((row) => row.value !== null);
  const value = known.length ? known.reduce((sum, row) => sum + (row.value ?? 0), 0) : null;
  const paid = rows.reduce((sum, row) => sum + row.paid, 0);
  return { rows, value, paid, gain: value === null ? null : value - paid };
}

/** Valore e versato mese per mese (per il grafico). */
export function investmentHistory(ledger: Ledger, months: string[]) {
  const latest = lastRecordedMonth(ledger);
  return months.map((month) => {
    const summary = investmentSummary(ledger, month);
    const future = !latest || month > latest;
    return { month, value: future ? null : summary.value, paid: future ? null : summary.paid };
  });
}
