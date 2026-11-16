import { monthEnd, type Ledger } from "./ledger";
import { occurrence, occurrenceMovement } from "./recurring";
import { activeLines, nextCredit, CREDIT_LABELS } from "./deposit";
import { addMonths } from "./deadlines";
import { freeOccurrence } from "./fixed";

/*
 * Calendario finanziario di un mese: movimenti con data futura, scadenze ricorrenti (rate comprese),
 * accrediti degli interessi, vincoli in scadenza, prove gratuite e disdette, scadenze non economiche.
 */

export type CalendarEvent = {
  date: string;
  title: string;
  amount: number | null;
  tone: "in" | "out" | "info";
  kind: "movement" | "recurring" | "credit" | "line" | "fixed" | "deadline";
};

export function calendarEvents(ledger: Ledger, month: string, today: string): CalendarEvent[] {
  const from = `${month}-01`;
  const to = monthEnd(month);
  const events: CalendarEvent[] = [];
  const inMonth = (date: string | null | undefined): date is string => !!date && date >= from && date <= to;

  for (const { value } of ledger.movements) {
    if (!inMonth(value.date) || value.date < today) continue;
    events.push({ date: value.date, title: value.title, amount: value.amount, tone: value.type === "income" ? "in" : value.type === "transfer" ? "info" : "out", kind: "movement" });
  }
  for (const recurring of ledger.recurring) {
    if (recurring.value.paused || recurring.value.fixed?.status === "cancelled") continue;
    const { schedule } = recurring.value;
    for (let n = schedule.done; n < schedule.done + 400; n++) {
      const date = occurrence(schedule, n);
      if (!date || date > to || (schedule.end && date > schedule.end)) break;
      if (date < from || freeOccurrence(recurring, date)) continue;
      const value = occurrenceMovement(recurring, date, ledger);
      events.push({ date, title: value.title, amount: value.amount, tone: value.type === "income" ? "in" : value.type === "transfer" ? "info" : "out", kind: "recurring" });
    }
    const fixed = recurring.value.fixed;
    if (inMonth(fixed?.trialEnd)) events.push({ date: fixed!.trialEnd!, title: `Fine prova: ${recurring.value.template.title}`, amount: null, tone: "info", kind: "fixed" });
    if (inMonth(fixed?.cancelBy)) events.push({ date: fixed!.cancelBy!, title: `Disdire entro oggi: ${recurring.value.template.title}`, amount: null, tone: "info", kind: "fixed" });
  }
  for (const account of ledger.accounts) {
    const deposit = account.value.deposit;
    if (!deposit || account.value.archived) continue;
    const credit = nextCredit(deposit.credit, from);
    if (inMonth(credit) && deposit.credit !== "daily") events.push({ date: credit, title: `Interessi ${account.value.name} (${CREDIT_LABELS[deposit.credit].toLowerCase()})`, amount: null, tone: "in", kind: "credit" });
    for (const line of activeLines(deposit, from).concat((deposit.lines ?? []).filter((line) => !line.closed && inMonth(line.end)))) {
      if (inMonth(line.end)) events.push({ date: line.end, title: `Scade il vincolo di ${account.value.name}`, amount: line.amount, tone: "info", kind: "line" });
    }
  }
  for (const deadline of ledger.deadlines) {
    if (deadline.value.done) continue;
    let date = deadline.value.date;
    if (deadline.value.repeatMonths) while (date < from) date = addMonths(date, deadline.value.repeatMonths);
    if (inMonth(date)) events.push({ date, title: deadline.value.title, amount: null, tone: "info", kind: "deadline" });
  }
  // Un vincolo può comparire due volte (attivo e in scadenza): si tiene una sola voce per data e titolo.
  const seen = new Set<string>();
  return events.filter((event) => {
    const key = `${event.date}|${event.title}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  }).sort((a, b) => a.date.localeCompare(b.date));
}
