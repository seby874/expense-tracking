import type { Ledger, Person } from "./ledger";

/*
 * Familiari e codice fiscale.
 * Il codice fiscale si controlla con il carattere finale di controllo (algoritmo ufficiale, omocodia compresa)
 * e da lì si ricavano data di nascita e sesso.
 */

const ODD: Record<string, number> = {
  0: 1, 1: 0, 2: 5, 3: 7, 4: 9, 5: 13, 6: 15, 7: 17, 8: 19, 9: 21,
  A: 1, B: 0, C: 5, D: 7, E: 9, F: 13, G: 15, H: 17, I: 19, J: 21, K: 2, L: 4, M: 18, N: 20, O: 11, P: 3, Q: 6, R: 8, S: 12,
  T: 14, U: 16, V: 10, W: 22, X: 25, Y: 24, Z: 23,
};
const MONTHS = "ABCDEHLMPRST";
// Omocodia: le cifre possono essere sostituite da queste lettere (0 = L … 9 = V).
const OMOCODE = "LMNPQRSTUV";
const OMOCODE_POSITIONS = [6, 7, 9, 10, 12, 13, 14];
const SHAPE = /^[A-Z]{6}[0-9LMNPQRSTUV]{2}[A-EHLMPRST][0-9LMNPQRSTUV]{2}[A-Z][0-9LMNPQRSTUV]{3}[A-Z]$/;

function evenValue(char: string) {
  return /\d/.test(char) ? Number(char) : char.charCodeAt(0) - 65;
}

export function normalizeTaxCode(code: string) {
  return code.replace(/\s+/g, "").toUpperCase();
}

/** true se il codice fiscale (16 caratteri) ha forma e carattere di controllo corretti. */
export function validTaxCode(raw: string): boolean {
  const code = normalizeTaxCode(raw);
  if (!SHAPE.test(code)) return false;
  let sum = 0;
  for (let i = 0; i < 15; i++) sum += i % 2 === 0 ? ODD[code[i]] : evenValue(code[i]);
  return String.fromCharCode(65 + (sum % 26)) === code[15];
}

/** Data di nascita (AAAA-MM-GG) e sesso dal codice fiscale; `today` decide il secolo. */
export function taxCodeInfo(raw: string, today: string): { birthDate: string; sex: "M" | "F" } | null {
  const code = normalizeTaxCode(raw);
  if (!validTaxCode(code)) return null;
  const chars = code.split("");
  for (const position of OMOCODE_POSITIONS) {
    const index = OMOCODE.indexOf(chars[position]);
    if (index >= 0) chars[position] = String(index);
  }
  const year2 = Number(chars[6] + chars[7]);
  const month = MONTHS.indexOf(chars[8]) + 1;
  let day = Number(chars[9] + chars[10]);
  const sex = day > 40 ? "F" : "M";
  if (day > 40) day -= 40;
  const currentYear = Number(today.slice(0, 4));
  let year = 2000 + year2;
  if (year > currentYear) year -= 100;
  const date = `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
  const check = new Date(date + "T12:00:00Z");
  if (Number.isNaN(check.valueOf()) || check.toISOString().slice(0, 10) !== date) return null;
  return { birthDate: date, sex };
}

/** Codice fiscale nascosto (per la modalità discreta): solo le ultime 4 lettere. */
export function maskTaxCode(code: string) {
  return code ? `••••••••••••${code.slice(-4)}` : "";
}

export function personName(person: Person) {
  return `${person.value.firstName} ${person.value.lastName}`;
}

/** Percentuale a carico in un anno (0 = non a carico). */
export function dependentShare(person: Person, year: number) {
  return person.value.dependent.find((item) => item.year === year)?.share ?? 0;
}

/** Età compiuta a una data. */
export function ageAt(birthDate: string, date: string) {
  if (!birthDate) return null;
  const years = Number(date.slice(0, 4)) - Number(birthDate.slice(0, 4));
  return date.slice(5) < birthDate.slice(5) ? years - 1 : years;
}

export function findPerson(ledger: Pick<Ledger, "people">, id: string | undefined) {
  return id ? ledger.people.find((person) => person.id === id) : undefined;
}
