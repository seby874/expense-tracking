import type { Account, DepositDetails, DepositLine } from "./ledger";
import type { ParamsValue } from "./params";

/*
 * Conti deposito e conti remunerati: stima degli interessi.
 * Gli interessi maturano giorno per giorno sul saldo (o sull'importo della linea vincolata) al tasso
 * in vigore quel giorno; l'accredito avviene con la frequenza scelta. Ritenuta e bollo dai parametri dell'anno.
 * È una stima: la cifra vera è quella dell'estratto conto.
 */

const DAY = 86_400_000;
type Steps = DepositDetails["rates"];

/** Tasso in vigore in una data (percentuale annua). Senza fasi: 0. */
export function rateAt(steps: Steps, date: string): number {
  for (const step of steps) if (!step.until || date <= step.until) return step.rate;
  return steps.at(-1)?.rate ?? 0;
}

function addDays(date: string, days: number) {
  return new Date(Date.parse(date + "T00:00:00Z") + days * DAY).toISOString().slice(0, 10);
}

function base(dayCount: DepositDetails["dayCount"], year: number) {
  if (dayCount === "360") return 360;
  if (dayCount === "actual") return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0 ? 366 : 365;
  return 365;
}

/** Interessi lordi (centesimi, non arrotondati) su un importo costante tra `from` (incluso) e `to` (escluso). */
export function grossInterest(amount: number, steps: Steps, from: string, to: string, dayCount: DepositDetails["dayCount"] = "365") {
  let total = 0;
  for (let day = from; day < to; day = addDays(day, 1)) {
    total += amount * rateAt(steps, day) / 100 / base(dayCount, Number(day.slice(0, 4)));
  }
  return total;
}

/** Prossima data di accredito dopo `today` (incluso) per la frequenza; null se alla scadenza senza scadenza nota. */
export function nextCredit(frequency: DepositDetails["credit"], today: string, line?: Pick<DepositLine, "start" | "end">): string | null {
  const [year, month] = today.split("-").map(Number);
  const endOf = (y: number, m: number) => new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10);
  switch (frequency) {
    case "daily": return today;
    case "monthly": return endOf(year, month);
    case "quarterly": return endOf(year, Math.ceil(month / 3) * 3);
    case "semiannual": return endOf(year, month <= 6 ? 6 : 12);
    case "annual": return `${year}-12-31`;
    case "maturity": return line && line.end >= today ? line.end : null;
    case "upfront": return line && line.start >= today ? line.start : null;
  }
}

export type DepositYear = {
  gross: number; withholding: number; stamp: number; net: number;
  lines: { line: DepositLine; gross: number; available: string }[];
  nextCredit: string | null;
};

/** Linee vincolate attive (non chiuse) a una data. */
export function activeLines(details: DepositDetails | undefined, date: string) {
  return (details?.lines ?? []).filter((line) => !line.closed && line.start <= date && line.end >= date);
}

/**
 * Stima dell'anno per un conto: `freeBalance` è la parte libera (saldo meno le linee vincolate attive).
 * Bollo: conto deposito = percentuale annua del saldo; conto corrente = importo fisso se la giacenza supera la soglia.
 */
export function depositYear(account: Account, freeBalance: number, year: number, params: ParamsValue, today: string): DepositYear | null {
  const details = account.value.deposit;
  if (!details) return null;
  const from = `${year}-01-01`;
  const to = `${year + 1}-01-01`;
  const freeGross = details.kind === "locked" ? 0 : grossInterest(Math.max(0, freeBalance), details.rates, from, to, details.dayCount);
  const lines = (details.lines ?? []).filter((line) => !line.closed && line.start < to && line.end >= from).map((line) => {
    const start = line.start > from ? line.start : from;
    const end = addDays(line.end, 0) < to ? line.end : to;
    return { line, gross: grossInterest(line.amount, line.rates, start, end, details.dayCount), available: line.end };
  });
  const gross = Math.round(freeGross + lines.reduce((sum, item) => sum + item.gross, 0));
  const withholding = Math.round(gross * params.withholding / 100);
  const lineTotal = lines.reduce((sum, item) => sum + item.line.amount, 0);
  const capital = Math.max(0, freeBalance) + lineTotal;
  let stamp = 0;
  if (details.stamp !== "bank") {
    stamp = details.kind === "current"
      ? (capital > params.currentStampThreshold ? params.currentStamp : 0)
      : Math.round(capital * params.depositStamp / 100);
  }
  const credits = [nextCredit(details.credit, today), ...lines.map((item) => nextCredit(item.line.credit, today, item.line))]
    .filter((date): date is string => !!date).sort();
  return { gross, withholding, stamp, net: gross - withholding - stamp, lines, nextCredit: credits[0] ?? null };
}

/** Testo leggibile delle fasi del tasso. */
export function stepsText(steps: Steps) {
  if (!steps.length) return "0%";
  return steps.map((step) => `${String(step.rate).replace(".", ",")}%${step.until ? ` fino al ${step.until.split("-").reverse().join("/")}` : ""}`).join(", poi ");
}

export const CREDIT_LABELS: Record<DepositDetails["credit"], string> = {
  daily: "Giornaliero", monthly: "Mensile", quarterly: "Trimestrale", semiannual: "Semestrale", annual: "Annuale", maturity: "Alla scadenza", upfront: "Anticipato",
};

export const EARLY_LABELS: Record<DepositLine["early"], string> = {
  none: "Non svincolabile", "lose-interest": "Svincolabile perdendo gli interessi", "reduced-rate": "Svincolabile a tasso ridotto",
};
