import type { Ledger, Movement, Recurring, Schedule } from "./ledger";
import { splitRepayment } from "./debts";

// Tutti i calcoli lavorano su date "YYYY-MM-DD" in UTC, senza fusi orari.

function daysInMonth(year: number, monthIndex: number) {
  return new Date(Date.UTC(year, monthIndex + 1, 0)).getUTCDate();
}

function format(year: number, monthIndex: number, day: number) {
  return `${String(year).padStart(4, "0")}-${String(monthIndex + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

/** Data dell'n-esima scadenza (n = 0 è la prima). Il giorno resta ancorato a quello di partenza: il 31 diventa l'ultimo del mese. */
export function occurrence(schedule: Pick<Schedule, "frequency" | "every" | "start">, n: number): string | null {
  const [year, month, day] = schedule.start.split("-").map(Number);
  let result: string;
  if (schedule.frequency === "weekly") {
    const date = new Date(Date.UTC(year, month - 1, day + 7 * schedule.every * n));
    result = date.toISOString().slice(0, 10);
  } else {
    const steps = schedule.frequency === "monthly" ? schedule.every * n : 12 * schedule.every * n;
    const total = month - 1 + steps;
    const targetYear = year + Math.floor(total / 12);
    const targetMonth = total % 12;
    result = format(targetYear, targetMonth, Math.min(day, daysInMonth(targetYear, targetMonth)));
  }
  return result > "2100-12-31" ? null : result;
}

/** Prossima scadenza ancora da gestire, oppure null se il ricorrente è concluso. */
export function nextDate(schedule: Schedule): string | null {
  const next = occurrence(schedule, schedule.done);
  if (!next || (schedule.end && next > schedule.end)) return null;
  return next;
}

/** Scadenze arrivate (fino a oggi compreso) e non ancora gestite. */
export function dueDates(schedule: Schedule, today: string, limit = 60): string[] {
  const dates: string[] = [];
  for (let n = schedule.done; dates.length < limit; n++) {
    const date = occurrence(schedule, n);
    if (!date || date > today || (schedule.end && date > schedule.end)) break;
    dates.push(date);
  }
  return dates;
}

export type DueItem = { recurring: Recurring; date: string; backlog: number };

export function dueItems(ledger: Ledger, today: string): DueItem[] {
  return ledger.recurring.flatMap((recurring) => {
    if (recurring.value.paused) return [];
    const dates = dueDates(recurring.value.schedule, today);
    return dates.length ? [{ recurring, date: dates[0], backlog: dates.length - 1 }] : [];
  }).sort((a, b) => a.date.localeCompare(b.date));
}

/** Movimento di una scadenza. Per le rate la divisione capitale/interessi si calcola alla data della scadenza. */
export function occurrenceMovement(recurring: Recurring, date: string, ledger?: Ledger): Movement["value"] {
  const template = recurring.value.template;
  if (template.type === "repayment" && ledger) {
    const debt = ledger.accounts.find((account) => account.id === template.debtId);
    const split = splitRepayment(ledger, debt, date, template.amount);
    return { ...template, date, principal: split.principal, interest: split.interest };
  }
  return { ...template, date };
}

export function scheduleLabel(schedule: Pick<Schedule, "frequency" | "every" | "start">) {
  const { frequency, every } = schedule;
  const unit = frequency === "weekly"
    ? (every === 1 ? "Ogni settimana" : `Ogni ${every} settimane`)
    : frequency === "monthly"
      ? (every === 1 ? "Ogni mese" : `Ogni ${every} mesi`)
      : (every === 1 ? "Ogni anno" : `Ogni ${every} anni`);
  const day = Number(schedule.start.slice(8, 10));
  if (frequency === "monthly") return `${unit}, il giorno ${day}`;
  if (frequency === "weekly") {
    const weekday = new Intl.DateTimeFormat("it-IT", { weekday: "long", timeZone: "UTC" }).format(new Date(schedule.start + "T12:00:00Z"));
    return `${unit}, di ${weekday}`;
  }
  const month = new Intl.DateTimeFormat("it-IT", { month: "long", timeZone: "UTC" }).format(new Date(schedule.start + "T12:00:00Z"));
  return `${unit}, il ${day} ${month}`;
}
