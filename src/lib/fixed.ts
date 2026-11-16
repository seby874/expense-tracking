import { expenseParts, shiftMonth, type Fixed, type Ledger, type Movement, type Recurring } from "./ledger";
import { nextDate } from "./recurring";

/*
 * Spese fisse, abbonamenti e bollette.
 *
 * - Costo mensile/annuo di ogni ricorrente, qualunque sia la frequenza, con la tua quota se condiviso
 *   e senza i mesi di sospensione.
 * - Bollette "per competenza": una bolletta che copre più mesi si distribuisce sui mesi del periodo
 *   in proporzione ai giorni (niente media su 12 mesi). La prossima si stima dallo stesso periodo dell'anno prima.
 * - Aumenti di prezzo dallo storico dei prezzi o dagli importi registrati; prove gratuite e disdette in scadenza.
 */

const DAY = 86_400_000;

export const FIXED_KIND_LABELS: Record<Fixed["kind"], string> = { subscription: "Abbonamento", fixed: "Spesa fissa", bill: "Bolletta" };
export const FIXED_STATUS_LABELS: Record<Fixed["status"], string> = {
  active: "Attivo", trial: "In prova", cancelling: "In disdetta", suspended: "Sospeso", cancelled: "Disdetto",
};

/**
 * true se una scadenza del ricorrente non comporta un addebito: prova gratuita non ancora finita
 * o mese di sospensione (es. palestra d'estate).
 */
export function freeOccurrence(recurring: Recurring, date: string) {
  const fixed = recurring.value.fixed;
  if (!fixed) return false;
  if (fixed.status === "trial" && fixed.trialEnd && date <= fixed.trialEnd) return true;
  return !!fixed.suspendedMonths?.includes(Number(date.slice(5, 7)));
}

/** Quante volte al mese capita, in media. */
export function perMonth(schedule: Recurring["value"]["schedule"]) {
  if (schedule.frequency === "weekly") return 52 / 12 / schedule.every;
  if (schedule.frequency === "monthly") return 1 / schedule.every;
  return 1 / (12 * schedule.every);
}

/** Prezzo in vigore a una data: storico dei prezzi, altrimenti l'importo del modello. */
export function priceAt(recurring: Recurring, date: string) {
  const prices = [...(recurring.value.fixed?.prices ?? [])].sort((a, b) => a.from.localeCompare(b.from));
  let price = recurring.value.template.amount;
  for (const item of prices) if (item.from <= date) price = item.amount;
  return price;
}

/** Movimenti registrati da un ricorrente (ID fisso "<ricorrente>-AAAAMMGG"). */
export function occurrencesOf(ledger: Ledger, recurring: Recurring): Movement[] {
  const prefix = `${recurring.id}-`;
  return ledger.movements.filter((movement) => movement.id.startsWith(prefix)).sort((a, b) => a.value.date.localeCompare(b.value.date));
}

export type FixedItem = {
  recurring: Recurring;
  fixed: Fixed | null;
  kind: Fixed["kind"] | null;
  price: number;
  monthly: number;
  yearly: number;
  next: string | null;
  change: { from: number; to: number; date: string } | null;
  alert: string | null;
  totalPaid: number;
};

function daysBetween(from: string, to: string) {
  return Math.round((Date.parse(to) - Date.parse(from)) / DAY);
}

export function fixedItem(ledger: Ledger, recurring: Recurring, today: string): FixedItem {
  const fixed = recurring.value.fixed ?? null;
  const price = priceAt(recurring, today);
  const share = (fixed?.share ?? 100) / 100;
  const active = !recurring.value.paused && fixed?.status !== "cancelled";
  const suspended = fixed?.suspendedMonths?.length ?? 0;
  const occurrences = occurrencesOf(ledger, recurring);
  // Per le bollette: media mensile per competenza degli ultimi 12 mesi, se ci sono bollette registrate.
  let monthly = active ? price * perMonth(recurring.value.schedule) * share * (12 - suspended) / 12 : 0;
  if (active && fixed?.kind === "bill" && occurrences.length) {
    const end = today.slice(0, 7);
    const months = Array.from({ length: 12 }, (_, index) => shiftMonth(end, -index - 1));
    const byMonth = competenceByMonth(occurrences, months);
    const total = months.reduce((sum, month) => sum + (byMonth.get(month) ?? 0), 0);
    const covered = months.filter((month) => byMonth.has(month)).length;
    if (covered) monthly = total / covered * share;
  }
  // Variazione di prezzo: ultimi due prezzi dello storico, oppure ultimi due importi pagati.
  let change: FixedItem["change"] = null;
  const prices = [...(fixed?.prices ?? [])].sort((a, b) => a.from.localeCompare(b.from));
  if (prices.length >= 2) {
    const [before, after] = prices.slice(-2);
    if (before.amount !== after.amount) change = { from: before.amount, to: after.amount, date: after.from };
  } else if (fixed?.kind !== "bill" && occurrences.length >= 2) {
    const [before, after] = occurrences.slice(-2);
    if (before.value.amount !== after.value.amount) change = { from: before.value.amount, to: after.value.amount, date: after.value.date };
  }
  let alert: string | null = null;
  if (fixed?.status === "trial" && fixed.trialEnd && daysBetween(today, fixed.trialEnd) <= 7 && fixed.trialEnd >= today) {
    alert = `La prova gratuita finisce il ${fixed.trialEnd.split("-").reverse().join("/")}: poi parte il rinnovo.`;
  } else if (fixed?.cancelBy && fixed.status !== "cancelled" && fixed.cancelBy >= today && daysBetween(today, fixed.cancelBy) <= Math.max(7, fixed.noticeDays ?? 0)) {
    alert = `Per disdire c’è tempo fino al ${fixed.cancelBy.split("-").reverse().join("/")}.`;
  } else if (change && change.to > change.from && daysBetween(change.date, today) <= 60) {
    alert = `Prezzo aumentato del ${Math.round((change.to / change.from - 1) * 100)}%.`;
  }
  return {
    recurring, fixed, kind: fixed?.kind ?? null, price, monthly: Math.round(monthly), yearly: Math.round(monthly * 12),
    next: active ? nextDate(recurring.value.schedule) : null, change, alert,
    totalPaid: occurrences.reduce((sum, movement) => sum + movement.value.amount, 0),
  };
}

/** Tutte le ricorrenti di spesa (classificate e no), con i totali. */
export function fixedOverview(ledger: Ledger, today: string) {
  const items = ledger.recurring.filter(({ value }) => value.template.type === "expense" || value.template.type === "repayment")
    .map((recurring) => fixedItem(ledger, recurring, today));
  const monthly = items.reduce((sum, item) => sum + item.monthly, 0);
  const lastYear = ledger.movements.filter(({ value }) => value.type === "income" && value.date > shiftMonth(today.slice(0, 7), -12) && value.date <= today);
  const income = lastYear.reduce((sum, { value }) => sum + value.amount, 0) / 12;
  return { items, monthly, yearly: monthly * 12, incomeShare: income > 0 ? monthly / income : null };
}

// ---------------------------------------------------------------- Competenza

/** Quota di una spesa per ciascun mese del periodo di competenza (in proporzione ai giorni). */
export function competenceSplit(movement: Movement): Map<string, number> {
  const { value } = movement;
  const amount = value.type === "expense" ? expenseParts(value).reduce((sum, part) => sum + part.amount, 0) : value.amount;
  const competence = value.extra?.competence;
  const result = new Map<string, number>();
  if (!competence || competence.to < competence.from) { result.set(value.date.slice(0, 7), amount); return result; }
  const from = Date.parse(competence.from);
  const to = Date.parse(competence.to);
  const days = Math.max(1, Math.round((to - from) / DAY) + 1);
  let assigned = 0;
  let last = "";
  for (let time = from; time <= to; time += DAY) {
    const month = new Date(time).toISOString().slice(0, 7);
    result.set(month, (result.get(month) ?? 0) + amount / days);
    last = month;
  }
  // Arrotondamento ai centesimi: il resto va all'ultimo mese, così il totale torna.
  for (const [month, value] of result) { const rounded = Math.round(value); result.set(month, rounded); assigned += rounded; }
  result.set(last, (result.get(last) ?? 0) + amount - assigned);
  return result;
}

export function competenceByMonth(movements: Movement[], months: string[]) {
  const wanted = new Set(months);
  const totals = new Map<string, number>();
  for (const movement of movements) {
    for (const [month, amount] of competenceSplit(movement)) if (wanted.has(month)) totals.set(month, (totals.get(month) ?? 0) + amount);
  }
  return totals;
}

/** Stima della prossima bolletta: stesso periodo dell'anno prima, altrimenti l'ultima. */
export function nextBillEstimate(ledger: Ledger, recurring: Recurring, today: string): number | null {
  const occurrences = occurrencesOf(ledger, recurring);
  const next = nextDate(recurring.value.schedule);
  if (!occurrences.length || !next) return null;
  const lastYear = `${Number(next.slice(0, 4)) - 1}${next.slice(4, 7)}`;
  const same = occurrences.find(({ value }) => value.date.slice(0, 7) === lastYear);
  return (same ?? occurrences[occurrences.length - 1]).value.amount;
}

// ---------------------------------------------------------------- Possibili ricorrenti

function normal(title: string) {
  return title.trim().toLocaleLowerCase("it").replace(/\d+/g, "").replace(/\s+/g, " ");
}

/** Spese con lo stesso titolo e importo simile in almeno 3 mesi di fila, non ancora ricorrenti. */
export function recurringCandidates(ledger: Ledger, today: string, dismissed: Set<string> = new Set()) {
  const known = new Set(ledger.recurring.map(({ value }) => normal(value.template.title)));
  const start = shiftMonth(today.slice(0, 7), -6);
  const groups = new Map<string, Movement[]>();
  for (const movement of ledger.movements) {
    const { value } = movement;
    if (value.type !== "expense" || value.date.slice(0, 7) < start || /^[0-9a-f-]{36}-\d{8}$/.test(movement.id)) continue;
    const key = normal(value.title);
    if (!key || known.has(key) || dismissed.has(key)) continue;
    groups.set(key, [...(groups.get(key) ?? []), movement]);
  }
  const out: { key: string; title: string; amount: number; months: number; last: Movement }[] = [];
  for (const [key, list] of groups) {
    const months = [...new Set(list.map(({ value }) => value.date.slice(0, 7)))].sort();
    let run = 1;
    let best = 1;
    for (let i = 1; i < months.length; i++) { run = shiftMonth(months[i - 1], 1) === months[i] ? run + 1 : 1; best = Math.max(best, run); }
    if (best < 3) continue;
    const amounts = list.map(({ value }) => value.amount);
    const average = amounts.reduce((sum, value) => sum + value, 0) / amounts.length;
    if (amounts.some((value) => Math.abs(value - average) > average * 0.15)) continue;
    const last = [...list].sort((a, b) => b.value.date.localeCompare(a.value.date))[0];
    out.push({ key, title: last.value.title, amount: Math.round(average), months: best, last });
  }
  return out.sort((a, b) => b.months - a.months);
}
