import { accountBalances, netWorth, shiftMonth, totals, type Ledger } from "./ledger";
import { debtStatus } from "./debts";
import { goalStatus } from "./planning";
import { fundStatus, monthsToTarget } from "./fund";
import { DEFAULT_PROJECTION, type ProjectionSettings } from "./params";

/*
 * Proiezione a lungo termine del patrimonio.
 * Ipotesi (modificabili): risparmio mensile = media degli ultimi 24 mesi; rendimento solo sulla parte investita
 * (in proporzione agli investimenti di oggi); crescita annua del risparmio; inflazione per i valori a prezzi di oggi.
 * Fasce: pessimista (rendimento −2 punti, risparmio −20%) e ottimista (+2 punti, +20%).
 */

export type ProjectionPoint = { year: number; value: number; real: number; low: number; high: number };

export type Milestone = { date: string; text: string };

export type Projection = {
  start: number; monthlySaving: number; investedShare: number; settings: ProjectionSettings;
  points: ProjectionPoint[]; milestones: Milestone[];
};

/** Risparmio mensile medio degli ultimi `months` mesi completi (entrate − spese). */
export function averageSaving(ledger: Ledger, today: string, months = 24) {
  const last = shiftMonth(today.slice(0, 7), -1);
  const first = shiftMonth(last, -(months - 1));
  const items = ledger.movements.filter(({ value }) => value.date.slice(0, 7) >= first && value.date.slice(0, 7) <= last);
  const active = new Set(items.map(({ value }) => value.date.slice(0, 7))).size;
  return active ? Math.round(totals(items).saving / active) : 0;
}

function grow(start: number, monthly: number, years: number, returns: number, investedShare: number, growth: number) {
  const monthlyRate = Math.pow(1 + returns / 100, 1 / 12) - 1;
  let invested = start * investedShare;
  let other = start - invested;
  let saving = monthly;
  const values: number[] = [];
  for (let year = 1; year <= years; year++) {
    for (let month = 0; month < 12; month++) {
      invested = invested * (1 + monthlyRate) + saving * investedShare;
      other += saving * (1 - investedShare);
    }
    saving *= 1 + growth / 100;
    values.push(Math.round(invested + other));
  }
  return values;
}

export function projection(ledger: Ledger, today: string, years: number, settings: ProjectionSettings = ledger.settings.projection ?? DEFAULT_PROJECTION): Projection {
  const balances = accountBalances(ledger, today.slice(0, 7));
  const start = netWorth(balances) ?? 0;
  const invested = balances.filter(({ account }) => account.value.type === "investment").reduce((sum, { amount }) => sum + Math.max(0, amount ?? 0), 0);
  const positive = balances.filter(({ account }) => account.value.type !== "debt").reduce((sum, { amount }) => sum + Math.max(0, amount ?? 0), 0);
  const investedShare = positive > 0 ? Math.min(1, invested / positive) : 0;
  const monthlySaving = averageSaving(ledger, today);
  const base = grow(start, monthlySaving, years, settings.returns, investedShare, settings.incomeGrowth);
  const low = grow(start, monthlySaving * 0.8, years, settings.returns - 2, investedShare, settings.incomeGrowth);
  const high = grow(start, monthlySaving * 1.2, years, settings.returns + 2, investedShare, settings.incomeGrowth);
  const year0 = Number(today.slice(0, 4));
  const points = base.map((value, index) => ({
    year: year0 + index + 1, value, real: Math.round(value / Math.pow(1 + settings.inflation / 100, index + 1)), low: low[index], high: high[index],
  }));

  const milestones: Milestone[] = [];
  for (const debt of ledger.accounts.filter((account) => account.value.type === "debt" && !account.value.archived)) {
    const status = debtStatus(ledger, debt, today.slice(0, 7));
    if (status.endDate && status.endDate > today && (status.residual ?? 0) > 0) milestones.push({ date: status.endDate, text: `${debt.value.name} estinto` });
  }
  const fund = fundStatus(ledger, today);
  const fundMonths = monthsToTarget(fund.missing, monthlySaving);
  if (fund.missing > 0 && fundMonths !== null) milestones.push({ date: shiftMonth(today.slice(0, 7), fundMonths) + "-01", text: `Fondo di emergenza a ${fund.settings.targetMonths} mesi` });
  for (const goal of ledger.goals.filter((item) => !item.value.done)) {
    const status = goalStatus(ledger, goal, today);
    const missing = goal.value.target - status.current;
    const months = monthsToTarget(missing, monthlySaving);
    if (missing > 0 && months !== null && months <= years * 12) milestones.push({ date: shiftMonth(today.slice(0, 7), months) + "-01", text: `Obiettivo «${goal.value.name}»` });
  }
  milestones.sort((a, b) => a.date.localeCompare(b.date));
  return { start, monthlySaving, investedShare, settings, points, milestones };
}

/** Risparmio mensile necessario per arrivare a `target` in `years` anni (stesse ipotesi, senza crescita del risparmio). */
export function requiredSaving(start: number, target: number, years: number, returns: number, investedShare: number) {
  const months = years * 12;
  const rate = (Math.pow(1 + returns / 100, 1 / 12) - 1) * investedShare;
  const future = start * Math.pow(1 + rate, months);
  if (future >= target) return 0;
  if (rate === 0) return Math.ceil((target - future) / months);
  return Math.ceil((target - future) * rate / (Math.pow(1 + rate, months) - 1));
}
