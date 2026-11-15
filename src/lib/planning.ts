import {
  accountBalances, expenseParts, hasTag, monthEnd, netWorth, periodMovements, periodOf, shiftMonth, totals,
  type Account, type Budget, type Goal, type Ledger, type Movement,
} from "./ledger";
import { occurrence, occurrenceMovement } from "./recurring";
import { contributed } from "./investments";

const DAY = 86_400_000;

function addDays(date: string, days: number) {
  return new Date(Date.parse(date) + days * DAY).toISOString().slice(0, 10);
}

/** Effetto di un movimento sui conti di liquidità (+ entra, − esce). */
function effects(value: Movement["value"]): [string, number][] {
  switch (value.type) {
    case "income": return value.accountId ? [[value.accountId, value.amount]] : [];
    case "expense": case "repayment": return value.accountId ? [[value.accountId, -value.amount]] : [];
    case "transfer": return [[value.accountId, -value.amount], [value.toAccountId, value.amount]];
  }
}

// ---------------------------------------------------------------- Previsione

export type ForecastEvent = { date: string; title: string; accountId: string; amount: number; planned: boolean };
export type AccountForecast = {
  account: Account; today: number; end: number; min: number; minDate: string; events: ForecastEvent[]; points: number[];
};

/**
 * Saldo dei conti di liquidità nei prossimi `days` giorni: parte dal saldo di oggi e aggiunge i movimenti
 * già registrati con data futura, i ricorrenti (scadenze arretrate comprese, come se cadessero oggi) e le rate.
 */
export function forecast(ledger: Ledger, today: string, days = 30): AccountForecast[] {
  const horizon = addDays(today, days);
  const month = today.slice(0, 7);
  const cash = accountBalances(ledger, month).filter(({ account, amount }) =>
    (account.value.type === "cash" || account.value.type === "asset") && !account.value.archived && amount !== null);
  if (!cash.length) return [];
  const ids = new Set(cash.map(({ account }) => account.id));
  const events: ForecastEvent[] = [];
  const start = new Map(cash.map(({ account, amount }) => [account.id, amount ?? 0]));

  for (const { value } of ledger.movements) {
    if (value.date <= today) continue;
    for (const [accountId, amount] of effects(value)) {
      if (!ids.has(accountId)) continue;
      // Il saldo del mese corrente (registrato a fine mese o calcolato) comprende già i movimenti futuri
      // di questo mese: si tolgono per avere il saldo di oggi, poi rientrano nel giorno in cui cadono.
      if (value.date.slice(0, 7) === month) start.set(accountId, (start.get(accountId) ?? 0) - amount);
      if (value.date <= horizon) events.push({ date: value.date, title: value.title, accountId, amount, planned: false });
    }
  }

  for (const recurring of ledger.recurring) {
    if (recurring.value.paused) continue;
    const { schedule } = recurring.value;
    for (let n = schedule.done; n < schedule.done + 400; n++) {
      const date = occurrence(schedule, n);
      if (!date || date > horizon || (schedule.end && date > schedule.end)) break;
      const value = occurrenceMovement(recurring, date, ledger);
      for (const [accountId, amount] of effects(value)) {
        if (ids.has(accountId)) events.push({ date: date < today ? today : date, title: value.title, accountId, amount, planned: true });
      }
    }
  }

  events.sort((a, b) => a.date.localeCompare(b.date));
  return cash.map(({ account }) => {
    const own = events.filter((event) => event.accountId === account.id);
    const todayAmount = start.get(account.id) ?? 0;
    let running = todayAmount;
    let min = todayAmount;
    let minDate = today;
    const points: number[] = [];
    for (let day = 0; day <= days; day++) {
      const date = addDays(today, day);
      for (const event of own) if (event.date === date) running += event.amount;
      if (running < min) { min = running; minDate = date; }
      points.push(running);
    }
    return { account, today: todayAmount, end: running, min, minDate, events: own, points };
  });
}

// ---------------------------------------------------------------- Patrimonio nel tempo

export type WorthPoint = { month: string; net: number | null; cash: number | null; invest: number | null; debt: number | null; credit: number | null };

export function worthSeries(ledger: Ledger, months: string[]): WorthPoint[] {
  return months.map((month) => {
    const list = accountBalances(ledger, month);
    const sum = (types: string[]) => {
      const known = list.filter(({ account, amount }) => types.includes(account.value.type) && amount !== null);
      return known.length ? known.reduce((total, { amount }) => total + (amount ?? 0), 0) : null;
    };
    return { month, net: netWorth(list), cash: sum(["cash", "asset"]), invest: sum(["investment"]), debt: sum(["debt"]), credit: sum(["receivable"]) };
  });
}

/** Mesi dal primo saldo registrato a `last` (al massimo `limit`). */
export function monthsUntil(ledger: Ledger, last: string, count: number | "all", limit = 120) {
  const first = ledger.balances.map(({ value }) => value.month).sort()[0] ?? last;
  const months: string[] = [];
  let month = last;
  const wanted = count === "all" ? limit : count;
  while (months.length < wanted && (count !== "all" || month >= first)) { months.unshift(month); month = shiftMonth(month, -1); }
  return months;
}

export type Growth = { change: number; saving: number; returns: number | null; other: number };

/**
 * Da dove viene la variazione del patrimonio in un mese di calendario:
 * risparmio (entrate − spese), rendimento degli investimenti (valore − versamenti) e il resto (scarti, movimenti mancanti).
 */
export function growth(ledger: Ledger, month: string): Growth | null {
  const previous = shiftMonth(month, -1);
  const now = netWorth(accountBalances(ledger, month));
  const before = netWorth(accountBalances(ledger, previous));
  if (now === null || before === null) return null;
  const saving = totals(ledger.movements.filter(({ value }) => value.date.slice(0, 7) === month)).saving;
  let returns: number | null = null;
  const valueNow = accountBalances(ledger, month);
  const valueBefore = accountBalances(ledger, previous);
  for (const account of ledger.accounts.filter(({ value }) => value.type === "investment")) {
    const a = valueNow.find((entry) => entry.account.id === account.id)?.amount;
    const b = valueBefore.find((entry) => entry.account.id === account.id)?.amount;
    if (a == null || b == null) continue;
    returns = (returns ?? 0) + (a - b) - (contributed(ledger, account, month) - contributed(ledger, account, previous));
  }
  const change = now - before;
  return { change, saving, returns, other: change - saving - (returns ?? 0) };
}

// ---------------------------------------------------------------- Budget

export type BudgetStatus = { budget: Budget; name: string; spent: number; limit: number; share: number; level: "ok" | "warn" | "over" };

function spending(value: Movement["value"], filter: (labelId: string) => boolean) {
  if (value.type === "expense") return expenseParts(value).filter((part) => part.labelId && filter(part.labelId)).reduce((sum, part) => sum + part.amount, 0);
  if (value.type === "repayment" && filter(value.labelId)) return value.interest;
  return 0;
}

export function budgetStatus(ledger: Ledger, budget: Budget, period: string): BudgetStatus {
  const { target, ref, amount } = budget.value;
  const months = period.length === 4 ? 12 : 1;
  const pool = budget.value.period === "total" ? ledger.movements : periodMovements(ledger, period);
  const label = ledger.labels.find((item) => item.id === ref);
  const name = target === "all" ? "Tutte le spese" : target === "label" ? label?.value.name ?? "Categoria eliminata" : `#${ref}`;
  let spent = 0;
  for (const { value } of pool) {
    if (target === "tag" && !hasTag(value, ref)) continue;
    spent += spending(value, target === "label" ? (labelId) => labelId === ref : () => true);
  }
  const limit = budget.value.period === "total" ? amount : amount * months;
  const share = spent / limit;
  return { budget, name, spent, limit, share, level: share >= 1 ? "over" : share >= 0.8 ? "warn" : "ok" };
}

// ---------------------------------------------------------------- Obiettivi

export type GoalStatus = { goal: Goal; current: number; share: number; monthly: number | null; monthsLeft: number | null; late: boolean };

export function goalStatus(ledger: Ledger, goal: Goal, today: string): GoalStatus {
  const { accountId, saved, target, deadline } = goal.value;
  const balance = accountId ? accountBalances(ledger, today.slice(0, 7)).find(({ account }) => account.id === accountId)?.amount ?? null : null;
  const current = Math.max(0, accountId ? balance ?? 0 : saved);
  const missing = Math.max(0, target - current);
  let monthsLeft: number | null = null;
  if (deadline) {
    const [y1, m1] = today.split("-").map(Number);
    const [y2, m2] = deadline.split("-").map(Number);
    monthsLeft = Math.max(0, (y2 - y1) * 12 + (m2 - m1));
  }
  const monthly = monthsLeft === null ? null : monthsLeft === 0 ? missing : Math.ceil(missing / monthsLeft);
  return { goal, current, share: Math.min(1, current / target), monthly, monthsLeft, late: !!deadline && deadline < today && missing > 0 };
}

// ---------------------------------------------------------------- Segnalazioni e riepilogo

export type Insight = { tone: "up" | "down" | "info"; text: string };

function expenseByLabel(movements: Movement[]) {
  const map = new Map<string, number>();
  for (const { value } of movements) {
    if (value.type === "expense") for (const part of expenseParts(value)) if (part.labelId) map.set(part.labelId, (map.get(part.labelId) ?? 0) + part.amount);
    if (value.type === "repayment" && value.interest) map.set(value.labelId, (map.get(value.labelId) ?? 0) + value.interest);
  }
  return map;
}

/** Mesi precedenti a `month` con almeno un movimento (al massimo `count`). */
function previousActive(ledger: Ledger, month: string, count: number) {
  const active = new Set(ledger.movements.map(({ value }) => periodOf(value.date)));
  const list: string[] = [];
  let cursor = shiftMonth(month, -1);
  for (let step = 0; step < 36 && list.length < count; step++, cursor = shiftMonth(cursor, -1)) if (active.has(cursor)) list.push(cursor);
  return list;
}

/** Confronti con la tua media degli ultimi mesi. Per il mese in corso segnala solo gli aumenti. */
export function insights(ledger: Ledger, month: string, today: string): Insight[] {
  if (month.length !== 7) return [];
  const history = previousActive(ledger, month, 6);
  if (history.length < 2) return [];
  const running = periodOf(today) === month;
  const current = expenseByLabel(periodMovements(ledger, month));
  const averages = new Map<string, number>();
  for (const past of history) for (const [labelId, amount] of expenseByLabel(periodMovements(ledger, past))) averages.set(labelId, (averages.get(labelId) ?? 0) + amount / history.length);
  const list: (Insight & { weight: number })[] = [];
  const names = new Map(ledger.labels.map((label) => [label.id, label.value.name]));
  for (const labelId of new Set([...current.keys(), ...averages.keys()])) {
    const now = current.get(labelId) ?? 0;
    const usual = averages.get(labelId) ?? 0;
    const diff = now - usual;
    const name = names.get(labelId) ?? "Altro";
    if (usual >= 1000 && diff >= 2000 && now >= usual * 1.4) {
      list.push({ tone: "up", weight: diff, text: `${name}: ${Math.round((now / usual - 1) * 100)}% in più della tua media (${money(now)} contro ${money(usual)}).` });
    } else if (!running && usual >= 3000 && -diff >= 2000 && now <= usual * 0.6) {
      list.push({ tone: "down", weight: -diff, text: `${name}: hai speso ${money(-diff)} meno del solito.` });
    } else if (!usual && now >= 5000) {
      list.push({ tone: "info", weight: now / 2, text: `${name}: ${money(now)}, di solito qui non spendi nulla.` });
    }
  }
  const total = totals(periodMovements(ledger, month)).expense;
  const usualTotal = history.reduce((sum, past) => sum + totals(periodMovements(ledger, past)).expense, 0) / history.length;
  if (!running && usualTotal > 0 && Math.abs(total - usualTotal) >= usualTotal * 0.15) {
    list.push({ tone: total > usualTotal ? "up" : "down", weight: Math.abs(total - usualTotal) + 1e9,
      text: total > usualTotal ? `Spese totali ${money(total - usualTotal)} sopra la tua media.` : `Spese totali ${money(usualTotal - total)} sotto la tua media: ottimo.` });
  }
  return list.sort((a, b) => b.weight - a.weight).slice(0, 5).map(({ weight: _weight, ...item }) => item);
}

function money(cents: number) {
  return new Intl.NumberFormat("it-IT", { style: "currency", currency: "EUR", maximumFractionDigits: 0 }).format(Math.round(cents / 100));
}

export type PeriodSummary = {
  period: string; previous: string | null;
  totals: ReturnType<typeof totals>; before: ReturnType<typeof totals> | null; average: ReturnType<typeof totals> | null;
  categories: { id: string; name: string; amount: number; before: number }[];
  biggest: Movement | null; count: number; worthStart: number | null; worthEnd: number | null;
};

/** Riepilogo di un mese ("AAAA-MM") o di un anno ("AAAA"). */
export function periodSummary(ledger: Ledger, period: string): PeriodSummary {
  const year = period.length === 4;
  const previous = year ? String(Number(period) - 1) : shiftMonth(period, -1);
  const items = periodMovements(ledger, period);
  const before = periodMovements(ledger, previous);
  const now = expenseByLabel(items);
  const then = expenseByLabel(before);
  const names = new Map(ledger.labels.map((label) => [label.id, label.value.name]));
  const categories = [...now].map(([id, amount]) => ({ id, name: names.get(id) ?? "Altro", amount, before: then.get(id) ?? 0 }))
    .sort((a, b) => b.amount - a.amount);
  const history = year ? [] : previousActive(ledger, period, 6);
  const average = history.length >= 2 ? (() => {
    const list = history.map((month) => totals(periodMovements(ledger, month)));
    const mean = (key: "income" | "expense" | "saving" | "interest" | "repaid") => Math.round(list.reduce((sum, item) => sum + item[key], 0) / list.length);
    const income = mean("income");
    const expense = mean("expense");
    return { income, expense, interest: mean("interest"), repaid: mean("repaid"), saving: income - expense, rate: income > 0 ? (income - expense) / income : null };
  })() : null;
  const expenses = items.filter(({ value }) => value.type === "expense");
  const biggest = expenses.reduce<Movement | null>((top, item) => (!top || item.value.amount > top.value.amount ? item : top), null);
  const endMonth = year ? `${period}-12` : period;
  const startMonth = year ? `${Number(period) - 1}-12` : shiftMonth(period, -1);
  return {
    period, previous: before.length ? previous : null, totals: totals(items), before: before.length ? totals(before) : null, average,
    categories, biggest, count: items.length,
    worthStart: netWorth(accountBalances(ledger, startMonth)), worthEnd: netWorth(accountBalances(ledger, endMonth)),
  };
}

export { monthEnd };
