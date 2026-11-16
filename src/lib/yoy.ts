import { accountBalances, expenseParts, netWorth, totals, type Ledger, type Movement } from "./ledger";
import { contributed } from "./investments";

/*
 * Confronto anno su anno.
 * "A parità di periodo": per l'anno in corso si confronta dal 1° gennaio a oggi con lo stesso intervallo dell'anno prima,
 * altrimenti l'anno in corso sembrerebbe sempre "più basso". Valori reali (facoltativi) con l'inflazione inserita a mano.
 */

export type YearKpi = {
  income: number; expense: number; saving: number; rate: number | null; interest: number; repaid: number;
  invested: number; worthEnd: number | null;
};

export type CategoryDelta = { id: string; name: string; a: number; b: number; delta: number; subs: { name: string; a: number; b: number; delta: number }[] };

function inYear(movements: Movement[], year: number, cutoff: string | null) {
  const prefix = String(year);
  return movements.filter(({ value }) => value.date.startsWith(prefix) && (!cutoff || value.date.slice(5) <= cutoff));
}

function investedNet(ledger: Ledger, year: number, cutoff: string | null) {
  const investments = new Set(ledger.accounts.filter((account) => account.value.type === "investment").map((account) => account.id));
  let total = 0;
  for (const { value } of inYear(ledger.movements, year, cutoff)) {
    if (value.type !== "transfer") continue;
    if (investments.has(value.toAccountId)) total += value.amount;
    if (value.accountId && investments.has(value.accountId)) total -= value.amount;
  }
  return total;
}

export function yearKpi(ledger: Ledger, year: number, cutoff: string | null = null): YearKpi {
  const items = inYear(ledger.movements, year, cutoff);
  const sums = totals(items);
  const endMonth = cutoff ? `${year}-${cutoff.slice(0, 2)}` : `${year}-12`;
  return {
    income: sums.income, expense: sums.expense, saving: sums.saving, rate: sums.rate, interest: sums.interest, repaid: sums.repaid,
    invested: investedNet(ledger, year, cutoff), worthEnd: netWorth(accountBalances(ledger, endMonth)),
  };
}

function byLabel(movements: Movement[]) {
  const map = new Map<string, { total: number; subs: Map<string, number> }>();
  for (const { value } of movements) {
    const add = (labelId: string, sub: string, amount: number) => {
      const entry = map.get(labelId) ?? { total: 0, subs: new Map() };
      entry.total += amount;
      entry.subs.set(sub, (entry.subs.get(sub) ?? 0) + amount);
      map.set(labelId, entry);
    };
    if (value.type === "expense") for (const part of expenseParts(value)) add(part.labelId, part.subcategory || "Senza sottocategoria", part.amount);
    if (value.type === "repayment" && value.interest) add(value.labelId, "Interessi delle rate", value.interest);
  }
  return map;
}

export function categoryDeltas(ledger: Ledger, yearA: number, yearB: number, cutoff: string | null): CategoryDelta[] {
  const a = byLabel(inYear(ledger.movements, yearA, cutoff));
  const b = byLabel(inYear(ledger.movements, yearB, cutoff));
  const names = new Map(ledger.labels.map((label) => [label.id, label.value.name]));
  return [...new Set([...a.keys(), ...b.keys()])].map((id) => {
    const left = a.get(id);
    const right = b.get(id);
    const subs = [...new Set([...(left?.subs.keys() ?? []), ...(right?.subs.keys() ?? [])])].map((name) => {
      const x = left?.subs.get(name) ?? 0;
      const y = right?.subs.get(name) ?? 0;
      return { name, a: x, b: y, delta: y - x };
    }).sort((p, q) => Math.abs(q.delta) - Math.abs(p.delta));
    const x = left?.total ?? 0;
    const y = right?.total ?? 0;
    return { id, name: names.get(id) ?? "Altro", a: x, b: y, delta: y - x, subs };
  }).sort((p, q) => Math.abs(q.delta) - Math.abs(p.delta));
}

export function monthlyExpenses(ledger: Ledger, year: number, cutoff: string | null) {
  const months = Array.from({ length: 12 }, () => 0);
  for (const movement of inYear(ledger.movements, year, cutoff)) {
    const month = Number(movement.value.date.slice(5, 7)) - 1;
    months[month] += totals([movement]).expense;
  }
  return months;
}

export function tagDeltas(ledger: Ledger, yearA: number, yearB: number, cutoff: string | null) {
  const sum = (year: number) => {
    const map = new Map<string, number>();
    for (const movement of inYear(ledger.movements, year, cutoff)) {
      for (const tag of movement.value.tags ?? []) map.set(tag, (map.get(tag) ?? 0) + totals([movement]).expense);
    }
    return map;
  };
  const a = sum(yearA);
  const b = sum(yearB);
  return [...new Set([...a.keys(), ...b.keys()])].map((tag) => ({ tag, a: a.get(tag) ?? 0, b: b.get(tag) ?? 0 }))
    .filter((item) => item.a || item.b).sort((p, q) => Math.abs(q.b - q.a) - Math.abs(p.b - p.a));
}

/** Tutti gli anni con movimenti, per la tendenza di lungo periodo. */
export function allYears(ledger: Ledger) {
  const years = [...new Set(ledger.movements.map(({ value }) => Number(value.date.slice(0, 4))))].sort((a, b) => a - b);
  return years.map((year) => ({ year, ...yearKpi(ledger, year) }));
}

/** Fattore per portare un importo dell'anno `year` ai prezzi dell'anno `to` (inflazione inserita a mano per anno). */
export function inflationFactor(ledger: Ledger, year: number, to: number) {
  let factor = 1;
  for (let y = year + 1; y <= to; y++) {
    const rate = ledger.params.find((item) => item.value.year === y)?.value.inflation;
    if (typeof rate === "number") factor *= 1 + rate / 100;
  }
  return factor;
}

/** Rendimento degli investimenti in un anno: variazione del valore meno i versamenti netti. */
export function investmentReturn(ledger: Ledger, year: number) {
  const start = accountBalances(ledger, `${year - 1}-12`);
  const end = accountBalances(ledger, `${year}-12`);
  let total: number | null = null;
  for (const account of ledger.accounts.filter((item) => item.value.type === "investment")) {
    const a = start.find((item) => item.account.id === account.id)?.amount;
    const b = end.find((item) => item.account.id === account.id)?.amount;
    if (a == null || b == null) continue;
    total = (total ?? 0) + (b - a) - (contributed(ledger, account, `${year}-12`) - contributed(ledger, account, `${year - 1}-12`));
  }
  return total;
}
