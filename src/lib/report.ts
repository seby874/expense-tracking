import { totals, type Ledger, type Movement } from "./ledger";
import { periodSummary } from "./planning";
import { yearKpi, investmentReturn } from "./yoy";
import { fixedOverview } from "./fixed";
import { debtStatus } from "./debts";
import { investmentSummary } from "./investments";
import { moduleOn } from "./params";
import { taxSummary } from "./tax";

/*
 * Report annuale: un riepilogo stampabile dell'anno chiuso (proposto a gennaio).
 * Si calcola dai dati, quindi resta disponibile per tutti gli anni, anche quelli archiviati.
 */

export function reportYears(ledger: Ledger, today: string) {
  const current = Number(today.slice(0, 4));
  return [...new Set(ledger.movements.map(({ value }) => Number(value.date.slice(0, 4))))].filter((year) => year < current).sort((a, b) => b - a);
}

export function annualReport(ledger: Ledger, year: number, today: string) {
  const summary = periodSummary(ledger, String(year));
  const kpi = yearKpi(ledger, year);
  const previous = yearKpi(ledger, year - 1);
  const items = ledger.movements.filter(({ value }) => value.date.startsWith(String(year)));
  const months = Array.from({ length: 12 }, (_, index) => {
    const month = `${year}-${String(index + 1).padStart(2, "0")}`;
    return { month, ...totals(items.filter(({ value }) => value.date.startsWith(month))) };
  }).filter((row) => row.income || row.expense);
  const best = months.reduce<(typeof months)[number] | null>((top, row) => (!top || row.saving > top.saving ? row : top), null);
  const worst = months.reduce<(typeof months)[number] | null>((low, row) => (!low || row.saving < low.saving ? row : low), null);
  const biggest = items.filter(({ value }) => value.type === "expense").reduce<Movement | null>((top, item) => (!top || item.value.amount > top.value.amount ? item : top), null);
  const debts = ledger.accounts.filter((account) => account.value.type === "debt").map((debt) => {
    const status = debtStatus(ledger, debt, `${year}-12`);
    return { name: debt.value.name, residual: status.residual, interestYear: status.interestYear };
  }).filter((item) => item.residual !== null || item.interestYear);
  const invest = investmentSummary(ledger, `${year}-12`);
  return {
    year, summary, kpi, previous, best, worst, biggest, debts,
    investments: { value: invest.value, paid: invest.paid, gain: invest.gain, yearReturn: investmentReturn(ledger, year) },
    fixed: moduleOn(ledger.settings, "fixed") ? fixedOverview(ledger, `${year}-12-31`) : null,
    tax: moduleOn(ledger.settings, "tax") ? taxSummary(ledger, year) : null,
    generated: today,
  };
}

export type AnnualReport = ReturnType<typeof annualReport>;
