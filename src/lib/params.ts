import { MODULES, type Ledger, type ModuleKey, type Params, type Settings } from "./ledger";

/*
 * Parametri di legge e bancari, anno per anno.
 *
 * I valori cambiano spesso (leggi di bilancio): non sono regole fisse nel codice ma dati
 * modificabili in Impostazioni → Parametri di legge e bancari. Qui ci sono solo i valori di
 * partenza, noti per le dichiarazioni 2024-2025: vanno confermati ogni anno.
 */

export type ParamsValue = Params["value"];
export type DeductionRule = ParamsValue["deductions"][string];

/** Voci di detrazione conosciute dall'app. `pool` = condivide la franchigia con un'altra voce. */
export type DeductionInfo = {
  key: string;
  name: string;
  hint: string;
  rule: DeductionRule;
  /** Il tetto vale per ogni persona (es. per figlio). */
  perPerson?: boolean;
  /** Voce che somma le spese a quelle di un'altra (stessa franchigia), es. farmaci → sanitarie. */
  pool?: string;
  /** Deduzione dal reddito invece che detrazione d'imposta. */
  deduction?: boolean;
};

const EUR = 100;

export const DEDUCTIONS: DeductionInfo[] = [
  { key: "sanitarie", name: "Spese sanitarie", hint: "Visite, analisi, ticket, dispositivi medici. Pagamento tracciabile salvo strutture pubbliche/accreditate SSN.",
    rule: { rate: 19, threshold: 12_911, cap: null, traceable: true } },
  { key: "farmaci", name: "Farmaci", hint: "Farmaci e dispositivi medici: anche in contanti. Stessa franchigia delle spese sanitarie.",
    rule: { rate: 19, threshold: 0, cap: null, traceable: false }, pool: "sanitarie" },
  { key: "veterinarie", name: "Spese veterinarie", hint: "Animali da compagnia, oltre la franchigia e fino al tetto.",
    rule: { rate: 19, threshold: 12_911, cap: 550 * EUR, traceable: true } },
  { key: "mutuo", name: "Interessi del mutuo prima casa", hint: "Interessi e oneri del mutuo per l'abitazione principale.",
    rule: { rate: 19, threshold: 0, cap: 4_000 * EUR, traceable: false } },
  { key: "universita", name: "Università", hint: "Statali per intero; non statali entro i limiti ministeriali (imposta il tetto).",
    rule: { rate: 19, threshold: 0, cap: null, traceable: true } },
  { key: "trasporti", name: "Abbonamento trasporto pubblico", hint: "Abbonamenti a bus, treni, metro.",
    rule: { rate: 19, threshold: 0, cap: 250 * EUR, traceable: true } },
  { key: "affitto-studenti", name: "Affitto studenti fuori sede", hint: "Canone per studenti universitari fuori sede.",
    rule: { rate: 19, threshold: 0, cap: 2_633 * EUR, traceable: true } },
  { key: "sport-ragazzi", name: "Sport ragazzi 5-18 anni", hint: "Iscrizione ad attività sportive, per ogni ragazzo.",
    rule: { rate: 19, threshold: 0, cap: 210 * EUR, traceable: true }, perPerson: true },
  { key: "asilo-nido", name: "Asilo nido", hint: "Rette dell'asilo nido, per ogni figlio.",
    rule: { rate: 19, threshold: 0, cap: 632 * EUR, traceable: true }, perPerson: true },
  { key: "assicurazioni", name: "Assicurazioni vita e infortuni", hint: "Premi per rischio morte o invalidità.",
    rule: { rate: 19, threshold: 0, cap: 530 * EUR, traceable: true } },
  { key: "funebri", name: "Spese funebri", hint: "Per ogni decesso.",
    rule: { rate: 19, threshold: 0, cap: 1_550 * EUR, traceable: true } },
  { key: "donazioni", name: "Donazioni a enti del Terzo settore", hint: "Erogazioni liberali a ETS/ONLUS.",
    rule: { rate: 30, threshold: 0, cap: 30_000 * EUR, traceable: true } },
  { key: "previdenza", name: "Previdenza complementare", hint: "Versamenti al fondo pensione: si deducono dal reddito (risparmio = la tua aliquota IRPEF).",
    rule: { rate: 0, threshold: 0, cap: 516_457, traceable: true }, deduction: true },
];

export function deductionInfo(key: string): DeductionInfo | undefined {
  return DEDUCTIONS.find((item) => item.key === key);
}

/** Valori di partenza per un anno (da confermare). */
export function defaultParams(year: number): ParamsValue {
  return {
    year,
    withholding: 26,
    depositStamp: 0.2,
    currentStamp: 3_420,
    currentStampThreshold: 5_000 * EUR,
    depositGuarantee: 100_000 * EUR,
    consumerPenalty: 1,
    consumerPenaltyShort: 0.5,
    consumerPenaltyMin: 10_000 * EUR,
    pensionDeductionCap: 516_457,
    deductions: Object.fromEntries(DEDUCTIONS.map((item) => [item.key, { ...item.rule }])),
    income: null,
  };
}

/**
 * Parametri validi per un anno: quelli salvati per quell'anno, altrimenti quelli dell'anno
 * precedente più vicino (da confermare), altrimenti i valori di partenza.
 */
export function paramsFor(ledger: Pick<Ledger, "params">, year: number): { value: ParamsValue; record: Params | null; inherited: boolean } {
  const exact = ledger.params.find((item) => item.value.year === year);
  if (exact) return { value: withDefaults(exact.value), record: exact, inherited: false };
  const earlier = [...ledger.params].filter((item) => item.value.year < year).sort((a, b) => b.value.year - a.value.year)[0];
  if (earlier) return { value: { ...withDefaults(earlier.value), year, income: null, confirmed: false }, record: null, inherited: true };
  return { value: defaultParams(year), record: null, inherited: true };
}

/** Aggiunge le voci di detrazione arrivate con versioni successive dell'app. */
function withDefaults(value: ParamsValue): ParamsValue {
  const deductions = { ...value.deductions };
  for (const item of DEDUCTIONS) if (!deductions[item.key]) deductions[item.key] = { ...item.rule };
  return { ...value, deductions };
}

// ---------------------------------------------------------------- Moduli e fondo di emergenza

/** Moduli attivi di default: la Dichiarazione si accende solo se serve. */
export const DEFAULT_MODULES: Record<ModuleKey, boolean> = {
  tax: false, fund: true, fixed: true, calendar: true, deadlines: true, projection: true, yoy: true, health: true, refunds: true, people: true,
};

export const MODULE_INFO: Record<ModuleKey, { name: string; hint: string }> = {
  tax: { name: "Dichiarazione dei redditi", hint: "Spese detraibili, familiari a carico, stima delle detrazioni." },
  fund: { name: "Fondo di emergenza", hint: "Mesi di spese coperti dalla liquidità, conti deposito e vincoli." },
  fixed: { name: "Spese fisse e abbonamenti", hint: "Costo annuo, aumenti di prezzo, disdette, bollette per competenza." },
  calendar: { name: "Calendario", hint: "Rate, ricorrenti, accrediti, vincoli e scadenze in un'unica vista." },
  deadlines: { name: "Scadenze", hint: "Revisione, documenti, garanzie, contratti: promemoria non economici." },
  projection: { name: "Proiezione", hint: "Patrimonio previsto negli anni, con ipotesi modificabili." },
  yoy: { name: "Anno su anno", hint: "Confronto dettagliato tra anni e tendenza di lungo periodo." },
  health: { name: "Controllo di salute", hint: "Una volta al mese: backup, letture, saldi, scadenze, dati da correggere." },
  refunds: { name: "Rimborsi attesi", hint: "Spese che ti verranno rimborsate (fondo sanitario, assicurazione, lavoro)." },
  people: { name: "Familiari", hint: "Spese sostenute per altri e familiari a carico." },
};

export function moduleOn(settings: Settings["value"], key: ModuleKey) {
  return settings.modules?.[key] ?? DEFAULT_MODULES[key];
}

export function allModules(settings: Settings["value"]): Record<ModuleKey, boolean> {
  return Object.fromEntries(MODULES.map((key) => [key, moduleOn(settings, key)])) as Record<ModuleKey, boolean>;
}

export type FundSettings = NonNullable<Settings["value"]["fund"]>;

/** Pesi predefiniti della liquidità (modificabili in Impostazioni). */
export const DEFAULT_FUND: FundSettings = {
  weights: { now: 100, days: 95, month: 70, long: 0, investment: 50 },
  targetMonths: 6,
  includeInvestments: false,
};

export function fundSettings(settings: Settings["value"]): FundSettings {
  return settings.fund ?? DEFAULT_FUND;
}

export type ProjectionSettings = NonNullable<Settings["value"]["projection"]>;
export const DEFAULT_PROJECTION: ProjectionSettings = { returns: 4, inflation: 2, incomeGrowth: 1.5 };
