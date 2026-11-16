import { monthlyRate } from "./debts";
import { occurrence } from "./recurring";
import type { LoanDetails } from "./ledger";
import type { ParamsValue } from "./params";

/*
 * Simulatore di estinzione anticipata e modifiche del finanziamento (piano alla francese).
 *
 * Penali (parametri modificabili): mutui immobiliari di persone fisiche nessuna penale (art. 120-ter TUB);
 * credito ai consumatori indennizzo fino all'1% (0,5% con meno di un anno residuo), di norma nullo sotto
 * una soglia di importo rimborsato (art. 125-sexies TUB). Altri finanziamenti: penale inserita a mano.
 * La scelta tra riduzione della rata e della durata dipende dal contratto: si simulano tutte.
 */

export type ScenarioKind =
  | "base" | "reduce-duration" | "reduce-installment" | "set-installment" | "set-duration"
  | "raise-installment" | "extend" | "recurring-extra" | "payoff" | "subrogation" | "variable";

export type SimInput = {
  residual: number;        // debito residuo oggi (centesimi)
  tan: number;             // tasso annuo nominale %
  installment: number;     // rata attuale (spese per rata comprese)
  fee: number;             // spese fisse per rata
  remaining: number;       // rate residue
  date: string;            // data del versamento / della simulazione
  firstNext: string;       // prossima scadenza
};

export type SimOptions = {
  extra: number;                     // versamento extra una tantum
  monthlyExtra: number;              // versamento extra ogni mese
  newInstallment: number | null;     // rata scelta
  newDuration: number | null;        // durata scelta (rate)
  newTan: number | null;             // surroga
  rateDelta: number;                 // scenario di tasso variabile (punti percentuali)
  penaltyPercent: number;            // penale % sull'importo rimborsato in anticipo
};

export type Scenario = {
  kind: ScenarioKind;
  name: string;
  installment: number;
  months: number | null;
  end: string | null;
  interest: number;
  fees: number;
  penalty: number;
  saved: number | null;          // interessi risparmiati rispetto al piano attuale (penale esclusa)
  monthsSaved: number | null;
  residuals: number[];           // residuo dopo ogni rata (per il grafico)
  yearlyInterest: Map<number, number>;
  note?: string;
};

const MAX_MONTHS = 600;

/** Rata (senza spese) per estinguere `principal` in `months` rate al tasso mensile `i`. */
export function annuity(principal: number, i: number, months: number) {
  if (months <= 0) return principal;
  if (i === 0) return Math.ceil(principal / months);
  return Math.round(principal * i / (1 - Math.pow(1 + i, -months)));
}

/** Numero di rate per estinguere `principal` con la rata (senza spese) `payment`; null se non basta mai. */
export function monthsFor(principal: number, i: number, payment: number): number | null {
  if (principal <= 0) return 0;
  if (payment <= 0) return null;
  if (i === 0) return Math.ceil(principal / payment);
  if (payment <= principal * i) return null;
  return Math.ceil(-Math.log(1 - principal * i / payment) / Math.log(1 + i));
}

/**
 * Piano rata per rata. `payment` è la quota capitale+interessi (senza spese); `extraMonthly` si aggiunge al capitale.
 * `closeAt`: con una durata fissata, l'ultima rata chiude il debito (assorbe i centesimi degli arrotondamenti).
 */
function run(principal: number, i: number, payment: number, fee: number, firstNext: string, extraMonthly = 0, closeAt?: number, maxMonths = MAX_MONTHS) {
  let residual = principal;
  let interest = 0;
  let fees = 0;
  const residuals: number[] = [];
  const yearlyInterest = new Map<number, number>();
  let n = 0;
  let end: string | null = null;
  while (residual > 0 && n < maxMonths) {
    const date = occurrence({ frequency: "monthly", every: 1, start: firstNext }, n) ?? firstNext;
    const due = Math.round(residual * i);
    const capital = closeAt !== undefined && n === closeAt - 1 ? residual : Math.min(residual, payment - due + extraMonthly);
    if (capital <= 0) return { months: null, interest, fees, residuals, yearlyInterest, end: null };
    residual -= capital;
    interest += due;
    fees += fee;
    const year = Number(date.slice(0, 4));
    yearlyInterest.set(year, (yearlyInterest.get(year) ?? 0) + due);
    residuals.push(residual);
    end = date;
    n++;
  }
  return { months: residual > 0 ? null : n, interest, fees, residuals, yearlyInterest, end };
}

function scenario(kind: ScenarioKind, name: string, installment: number, result: ReturnType<typeof run>, penalty: number, base: ReturnType<typeof run> | null, note?: string): Scenario {
  return {
    kind, name, installment, months: result.months, end: result.end, interest: result.interest, fees: result.fees, penalty,
    saved: base ? base.interest - result.interest : null,
    monthsSaved: base && base.months !== null && result.months !== null ? base.months - result.months : null,
    residuals: result.residuals, yearlyInterest: result.yearlyInterest, note,
  };
}

/** Penale per un rimborso anticipato di `amount` secondo il tipo di finanziamento e i parametri dell'anno. */
export function prepaymentPenalty(details: Pick<LoanDetails, "home" | "consumer">, amount: number, remainingMonths: number, params: ParamsValue, manualPercent: number) {
  if (details.home) return 0;
  if (details.consumer) {
    if (amount <= params.consumerPenaltyMin) return 0;
    return Math.round(amount * (remainingMonths > 12 ? params.consumerPenalty : params.consumerPenaltyShort) / 100);
  }
  return Math.round(amount * manualPercent / 100);
}

export function simulate(input: SimInput, options: SimOptions, details: Pick<LoanDetails, "home" | "consumer">, params: ParamsValue): Scenario[] {
  const i = monthlyRate(input.tan);
  const payment = Math.max(0, input.installment - input.fee);
  const base = run(input.residual, i, payment, input.fee, input.firstNext);
  const list: Scenario[] = [scenario("base", "Piano attuale", input.installment, base, 0, null)];
  const extra = Math.min(options.extra, input.residual);
  const penalty = prepaymentPenalty(details, extra, input.remaining, params, options.penaltyPercent);
  const after = input.residual - extra;
  const remaining = Math.max(1, input.remaining);

  if (extra > 0) {
    list.push(scenario("reduce-duration", "Versamento extra · riduci la durata", input.installment, run(after, i, payment, input.fee, input.firstNext), penalty, base));
    const lower = annuity(after, i, remaining);
    list.push(scenario("reduce-installment", "Versamento extra · riduci la rata", lower + input.fee, run(after, i, lower, input.fee, input.firstNext, 0, remaining), penalty, base));
  }
  if (options.newInstallment !== null && options.newInstallment > input.fee) {
    const chosen = options.newInstallment - input.fee;
    const months = monthsFor(after, i, chosen);
    list.push(scenario("set-installment", `${extra ? "Versamento extra · " : ""}rata scelta`, options.newInstallment, run(after, i, chosen, input.fee, input.firstNext), extra ? penalty : 0, base,
      months === null ? "Con questa rata il debito non si estingue mai: la rata non copre gli interessi." : undefined));
  }
  if (options.newDuration !== null && options.newDuration > 0) {
    const chosen = annuity(after, i, options.newDuration);
    const kind: ScenarioKind = options.newDuration > remaining && !extra ? "extend" : "set-duration";
    list.push(scenario(kind, kind === "extend" ? "Allunga la durata (rinegoziazione)" : `${extra ? "Versamento extra · " : ""}durata scelta`, chosen + input.fee,
      run(after, i, chosen, input.fee, input.firstNext, 0, options.newDuration), extra ? penalty : 0, base,
      options.newDuration > remaining ? "Rata più bassa ma più interessi in totale." : undefined));
  }
  if (options.monthlyExtra > 0) {
    list.push(scenario("recurring-extra", `Ogni mese ${(options.monthlyExtra / 100).toLocaleString("it-IT", { style: "currency", currency: "EUR" })} in più`, input.installment + options.monthlyExtra,
      run(input.residual, i, payment, input.fee, input.firstNext, options.monthlyExtra), 0, base, "Verifica nel contratto se i versamenti extra periodici sono ammessi e senza costi."));
  }
  // Estinzione totale oggi: residuo + interessi maturati dall'ultima rata (stima) + penale.
  const daysSince = Math.max(0, Math.min(31, 30 - Math.round((Date.parse(input.firstNext) - Date.parse(input.date)) / 86_400_000)));
  const accrued = Math.round(input.residual * i * daysSince / 30);
  const payoffPenalty = prepaymentPenalty(details, input.residual, input.remaining, params, options.penaltyPercent);
  list.push({
    kind: "payoff", name: "Estinzione totale oggi", installment: 0, months: 0, end: input.date, interest: accrued, fees: 0, penalty: payoffPenalty,
    saved: base.interest - accrued, monthsSaved: base.months, residuals: [0], yearlyInterest: new Map([[Number(input.date.slice(0, 4)), accrued]]),
    note: `Servono ${((input.residual + accrued + payoffPenalty) / 100).toLocaleString("it-IT", { style: "currency", currency: "EUR" })} (residuo + interessi maturati + penale).`,
  });
  if (options.newTan !== null && options.newTan >= 0) {
    const j = monthlyRate(options.newTan);
    const chosen = annuity(input.residual, j, remaining);
    list.push(scenario("subrogation", `Surroga al ${options.newTan.toLocaleString("it-IT")}% (stessa durata)`, chosen + input.fee,
      run(input.residual, j, chosen, input.fee, input.firstNext, 0, remaining), 0, base, "La surroga è gratuita per legge (portabilità del mutuo)."));
  }
  if (options.rateDelta !== 0) {
    const j = monthlyRate(Math.max(0, input.tan + options.rateDelta));
    const chosen = annuity(input.residual, j, remaining);
    list.push(scenario("variable", `Tasso ${options.rateDelta > 0 ? "+" : ""}${options.rateDelta.toLocaleString("it-IT")} punti`, chosen + input.fee,
      run(input.residual, j, chosen, input.fee, input.firstNext, 0, remaining), 0, base, "Scenario di tasso variabile: la rata si ricalcola sulla durata residua."));
  }
  return list;
}

/** Detrazione persa (mutuo prima casa): interessi detraibili in meno, anno per anno, entro il tetto. */
export function lostDeduction(base: Scenario, other: Scenario, rate: number, cap: number | null) {
  let lost = 0;
  for (const [year, interest] of base.yearlyInterest) {
    const capped = (value: number) => (cap === null ? value : Math.min(value, cap));
    lost += (capped(interest) - capped(other.yearlyInterest.get(year) ?? 0)) * rate / 100;
  }
  return Math.max(0, Math.round(lost));
}

/** Guadagno netto investendo la stessa cifra al `percent` annuo lordo, con la ritenuta sui guadagni. */
export function opportunityGain(amount: number, percent: number, months: number, withholding: number) {
  const gross = amount * (Math.pow(1 + percent / 100, months / 12) - 1);
  return Math.round(gross * (1 - withholding / 100));
}
