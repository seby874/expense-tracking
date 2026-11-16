import type { Deadline, Mutation } from "./ledger";

/*
 * Scadenzario non economico: revisione e bollo auto, documenti, garanzie, contratti, visite.
 * Una scadenza ripetuta, quando la segni fatta, si sposta alla prossima data; una singola resta "fatta".
 */

export const DEADLINE_LABELS: Record<Deadline["value"]["type"], string> = {
  vehicle: "Veicolo", document: "Documento", warranty: "Garanzia", contract: "Contratto", health: "Salute", other: "Altro",
};

export type DeadlineState = "overdue" | "soon" | "later" | "done";

const DAY = 86_400_000;

export function daysUntil(date: string, today: string) {
  return Math.round((Date.parse(date) - Date.parse(today)) / DAY);
}

export function deadlineState(deadline: Deadline, today: string): DeadlineState {
  if (deadline.value.done) return "done";
  const days = daysUntil(deadline.value.date, today);
  if (days < 0) return "overdue";
  return days <= deadline.value.noticeDays ? "soon" : "later";
}

/** Data spostata di `months` mesi (il giorno 31 diventa l'ultimo del mese). */
export function addMonths(date: string, months: number) {
  const [year, month, day] = date.split("-").map(Number);
  const total = month - 1 + months;
  const y = year + Math.floor(total / 12);
  const m = ((total % 12) + 12) % 12;
  const last = new Date(Date.UTC(y, m + 1, 0)).getUTCDate();
  return `${y}-${String(m + 1).padStart(2, "0")}-${String(Math.min(day, last)).padStart(2, "0")}`;
}

/**
 * Prima ripetizione dopo `after` (esclusa), calcolata sempre dalla data di partenza:
 * una scadenza al 31 torna al 31 nei mesi lunghi, il 29 febbraio torna negli anni bisestili.
 */
export function nextRepeat(anchor: string, repeatMonths: number, after: string) {
  let k = 1;
  let next = addMonths(anchor, repeatMonths);
  while (next <= after) next = addMonths(anchor, ++k * repeatMonths);
  return next;
}

/** "Fatta": la ripetuta passa alla prossima data dopo oggi (e dopo quella attuale), la singola viene chiusa. */
export function completeDeadline(deadline: Deadline, today: string): Mutation {
  const { value } = deadline;
  if (!value.repeatMonths) return { op: "save", record: { ...deadline, value: { ...value, done: true } } };
  const anchor = value.anchor ?? value.date;
  const next = nextRepeat(anchor, value.repeatMonths, value.date > today ? value.date : today);
  return { op: "save", record: { ...deadline, value: { ...value, anchor, date: next, done: false } } };
}

/** Scadenze da mostrare in evidenza: scadute o entro il preavviso. */
export function urgentDeadlines(deadlines: Deadline[], today: string) {
  return deadlines.filter((item) => ["overdue", "soon"].includes(deadlineState(item, today)));
}
