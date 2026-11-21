// Inserimento veloce: categoria abituale per il giorno della settimana e lettura di una frase dettata.
import type { Ledger } from "./ledger";

const WEEKDAYS = ["domenica", "lunedì", "martedì", "mercoledì", "giovedì", "venerdì", "sabato"];
const HABIT_DAYS = 120;
const MIN_TIMES = 3;
const MIN_SHARE = 0.6;

export interface WeekdaySuggestion { labelId: string; subcategory: string; weekday: string; times: number }

const weekdayOf = (date: string) => new Date(`${date}T12:00:00Z`).getUTCDay();

/** Categoria usata di solito nello stesso giorno della settimana (almeno 3 volte e 6 volte su 10, ultimi 4 mesi). */
export function weekdaySuggestion(ledger: Ledger, type: "expense" | "income", today: string): WeekdaySuggestion | null {
  const since = new Date(Date.parse(`${today}T12:00:00Z`) - HABIT_DAYS * 86_400_000).toISOString().slice(0, 10);
  const day = weekdayOf(today);
  const counts = new Map<string, { labelId: string; subcategory: string; times: number }>();
  let total = 0;
  for (const { value } of ledger.movements) {
    if (value.type !== type || value.date < since || value.date > today || weekdayOf(value.date) !== day) continue;
    const subcategory = value.type === "expense" && !value.parts ? value.subcategory : "";
    const key = `${value.labelId}|${subcategory}`;
    const item = counts.get(key) ?? { labelId: value.labelId, subcategory, times: 0 };
    item.times++;
    counts.set(key, item);
    total++;
  }
  const best = [...counts.values()].sort((a, b) => b.times - a.times)[0];
  if (!best || best.times < MIN_TIMES || best.times / total < MIN_SHARE) return null;
  return { ...best, weekday: WEEKDAYS[day] };
}

/** «caffè 1,20», «benzina 50 euro», «pizza 12 euro e 50», «€8,90 cinema» → descrizione e importo in centesimi. */
export function parseSpoken(text: string): { title: string; amount: number | null } {
  let rest = text.replace(/€/g, " ").replace(/\s+/g, " ").trim();
  let amount: number | null = null;
  const withCents = /(\d+)\s*euro\s*e\s*(\d{1,2})(\s*centesimi)?/i.exec(rest);
  const plain = /(\d+(?:[.,]\d{1,2})?)(\s*euro)?/i.exec(rest);
  if (withCents) {
    amount = Number(withCents[1]) * 100 + Number(withCents[2].padEnd(2, "0"));
    rest = rest.replace(withCents[0], " ");
  } else if (plain) {
    amount = Math.round(Number(plain[1].replace(",", ".")) * 100);
    rest = rest.replace(plain[0], " ");
  }
  const words = rest.replace(/\beuro\b/gi, " ").replace(/\s+/g, " ").trim();
  return { title: words ? words[0].toUpperCase() + words.slice(1) : "", amount };
}
