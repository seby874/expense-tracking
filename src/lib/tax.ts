import { debtDetails } from "./debts";
import { expenseParts, type Ledger, type Movement } from "./ledger";
import { DEDUCTIONS, deductionInfo, paramsFor, type ParamsValue } from "./params";
import { dependentShare, findPerson, personName } from "./people";

/*
 * Stima delle detrazioni della dichiarazione dei redditi (modulo facoltativo "Dichiarazione").
 *
 * Le spese contano per anno solare e data di pagamento (principio di cassa). Ogni voce ha
 * percentuale, franchigia, tetto e obbligo di pagamento tracciabile presi dai parametri dell'anno.
 * È una stima: va confrontata con la precompilata o con il CAF.
 */

/** Metodi di pagamento non tracciabili. */
const CASH = /contant/i;
/** Soglia oltre la quale le detrazioni al 19% si riducono (art. 15 c. 3-bis TUIR), e il reddito che le azzera. */
const REDUCTION_FROM = 12_000_000;
const REDUCTION_TO = 24_000_000;
/** Reddito oltre cui si applica un tetto complessivo ad alcune detrazioni (dal 2025). */
const OVERALL_CAP_FROM = 7_500_000;

export type TaxItemStatus = "ok" | "cash" | "not-dependent" | "refunded" | "manual-no";

export type TaxItem = {
  movement: Movement;
  /** Importo che entra nella voce (dopo eventuali rimborsi). */
  amount: number;
  status: TaxItemStatus;
  person: string | null;
};

export type TaxLine = {
  key: string;
  name: string;
  rate: number;
  threshold: number;
  cap: number | null;
  /** Spese considerate (stato "ok"). */
  total: number;
  excluded: number;
  deductible: number;
  /** Detrazione stimata (o importo deducibile per le deduzioni). */
  benefit: number;
  deduction: boolean;
  items: TaxItem[];
  byPerson: { person: string; total: number }[];
};

export type TaxSummary = {
  year: number;
  params: ParamsValue;
  inherited: boolean;
  lines: TaxLine[];
  detraction: number;
  deductible: number;
  warnings: string[];
};

/** Voce di detrazione di una parte di spesa: correzione a mano, poi sottocategoria, poi categoria. */
export function deductionKey(ledger: Ledger, labelId: string, subcategory: string): string | null {
  const label = ledger.labels.find((item) => item.id === labelId);
  if (!label) return null;
  const sub = subcategory ? label.value.subDeductions?.[subcategory] : undefined;
  if (sub !== undefined) return sub || null;
  return label.value.deduction ?? null;
}

type Raw = { key: string; movement: Movement; amount: number; status: TaxItemStatus; person: string | null };

function collect(ledger: Ledger, year: number, enabled: Set<string>, params: ParamsValue): Raw[] {
  const prefix = String(year);
  const out: Raw[] = [];
  for (const movement of ledger.movements) {
    const { value } = movement;
    if (!value.date.startsWith(prefix)) continue;
    const extra = value.extra;
    const person = findPerson(ledger, extra?.person);
    const personLabel = person ? personName(person) : null;
    const dependentOk = !person || dependentShare(person, year) > 0;

    if (value.type === "repayment") {
      const debt = ledger.accounts.find((account) => account.id === value.debtId);
      const details = debtDetails(debt);
      if (!enabled.has("mutuo") || details?.kind !== "loan" || !details.home || !value.interest) continue;
      out.push({ key: "mutuo", movement, amount: value.interest, status: extra?.deduct === "no" ? "manual-no" : "ok", person: personLabel });
      continue;
    }
    if (value.type !== "expense") continue;
    const parts = expenseParts(value);
    const partsTotal = parts.reduce((sum, part) => sum + part.amount, 0);
    // Un rimborso (ricevuto o atteso) riduce la spesa detraibile in proporzione.
    const refund = Math.min(extra?.refund?.amount ?? 0, partsTotal);
    for (const part of parts) {
      const key = deductionKey(ledger, part.labelId, part.subcategory);
      if (!key || !enabled.has(key) || extra?.deduct === "no") {
        if (key && enabled.has(key) && extra?.deduct === "no") out.push({ key, movement, amount: part.amount, status: "manual-no", person: personLabel });
        continue;
      }
      const share = partsTotal ? part.amount / partsTotal : 0;
      const amount = Math.round(part.amount - refund * share);
      const rule = params.deductions[key] ?? deductionInfo(key)?.rule;
      let status: TaxItemStatus = "ok";
      if (!dependentOk) status = "not-dependent";
      else if (amount <= 0) status = "refunded";
      else if (rule?.traceable !== false && CASH.test(value.method) && extra?.deduct !== "yes") status = "cash";
      out.push({ key, movement, amount: Math.max(0, amount), status, person: personLabel });
    }
  }
  return out;
}

function reduction(income: number | null) {
  if (income === null || income <= REDUCTION_FROM) return 1;
  return Math.max(0, (REDUCTION_TO - income) / (REDUCTION_TO - REDUCTION_FROM));
}

/** Riepilogo della dichiarazione per un anno, con le sole voci attive. */
export function taxSummary(ledger: Ledger, year: number): TaxSummary {
  const { value: params, inherited } = paramsFor(ledger, year);
  const enabled = new Set(ledger.settings.deductions ?? []);
  const raw = collect(ledger, year, enabled, params);
  const warnings: string[] = [];
  const factor = reduction(params.income);
  const lines: TaxLine[] = [];

  // Le voci "pool" (es. farmaci) si sommano alla voce principale prima della franchigia.
  const groups = DEDUCTIONS.filter((info) => !info.pool && (enabled.has(info.key) || DEDUCTIONS.some((item) => item.pool === info.key && enabled.has(item.key))));
  for (const info of groups) {
    const keys = [info.key, ...DEDUCTIONS.filter((item) => item.pool === info.key).map((item) => item.key)];
    const items = raw.filter((item) => keys.includes(item.key));
    const rule = params.deductions[info.key] ?? info.rule;
    const ok = items.filter((item) => item.status === "ok");
    const total = ok.reduce((sum, item) => sum + item.amount, 0);
    const excluded = items.filter((item) => item.status !== "ok").reduce((sum, item) => sum + item.amount, 0);
    const byPersonMap = new Map<string, number>();
    for (const item of ok) byPersonMap.set(item.person ?? "Te", (byPersonMap.get(item.person ?? "Te") ?? 0) + item.amount);
    let deductible: number;
    if (info.perPerson && rule.cap !== null) {
      deductible = [...byPersonMap.values()].reduce((sum, amount) => sum + Math.min(Math.max(0, amount - rule.threshold), rule.cap!), 0);
    } else {
      deductible = Math.max(0, total - rule.threshold);
      if (rule.cap !== null) deductible = Math.min(deductible, rule.cap);
    }
    if (info.deduction) deductible = Math.min(total, params.pensionDeductionCap);
    // Sanitarie e interessi del mutuo non si riducono con il reddito alto.
    const exempt = info.key === "sanitarie" || info.key === "mutuo" || info.deduction;
    const benefit = info.deduction ? deductible : Math.round(deductible * rule.rate / 100 * (exempt ? 1 : factor));
    if (!items.length && !enabled.has(info.key)) continue;
    lines.push({
      key: info.key, name: info.name, rate: rule.rate, threshold: rule.threshold, cap: rule.cap, total, excluded, deductible, benefit,
      deduction: !!info.deduction, items, byPerson: [...byPersonMap].map(([person, amount]) => ({ person, total: amount })),
    });
  }

  const cash = raw.filter((item) => item.status === "cash");
  if (cash.length) warnings.push(`${cash.length} ${cash.length === 1 ? "spesa pagata" : "spese pagate"} in contanti escluse: per la detrazione serve un pagamento tracciabile (carta, bonifico…).`);
  const notDependent = raw.filter((item) => item.status === "not-dependent");
  if (notDependent.length) warnings.push(`${notDependent.length} ${notDependent.length === 1 ? "spesa" : "spese"} per familiari non indicati a carico nel ${year}: escluse.`);
  if (params.income === null) warnings.push("Reddito non indicato: con redditi oltre 75.000 € alcune detrazioni hanno un tetto, oltre 120.000 € si riducono.");
  else if (params.income > OVERALL_CAP_FROM) warnings.push("Con un reddito oltre 75.000 € si applica un tetto complessivo ad alcune detrazioni: verifica con il CAF.");
  if (factor < 1) warnings.push(`Reddito oltre 120.000 €: le detrazioni al 19% (escluse sanitarie e mutuo) sono ridotte al ${Math.round(factor * 100)}%.`);
  if (inherited) warnings.push(`Parametri del ${year} non ancora confermati: controllali in Impostazioni → Funzioni → Parametri di legge e bancari.`);

  return {
    year, params, inherited, lines,
    detraction: lines.filter((line) => !line.deduction).reduce((sum, line) => sum + line.benefit, 0),
    deductible: lines.filter((line) => line.deduction).reduce((sum, line) => sum + line.benefit, 0),
    warnings,
  };
}

/** Voce di detrazione proposta per una categoria predefinita (al primo avvio del modulo). */
export const SUGGESTED_DEDUCTIONS: Record<string, { label?: string; subs?: Record<string, string> }> = {
  health: { label: "sanitarie", subs: { Farmacia: "farmaci" } },
  fees: { subs: { "Università": "universita" } },
};
