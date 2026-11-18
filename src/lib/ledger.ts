import { z } from "zod";

// Niente codice generato al volo: la Content Security Policy della pagina vieta eval (Zod usa la convalida normale).
z.config({ jitless: true });

export const MONTHS = ["Gennaio", "Febbraio", "Marzo", "Aprile", "Maggio", "Giugno", "Luglio", "Agosto", "Settembre", "Ottobre", "Novembre", "Dicembre"];
export const METHOD_LABELS = ["Carta", "Contanti", "Bonifico", "Addebito diretto", "PayPal", "Altro"];
export const ACCOUNT_TYPES = { cash: "Liquidità", asset: "Altre attività", investment: "Investimento", debt: "Debito", receivable: "Credito" } as const;
export const ASSET_CLASSES = { equity: "Azionario", bond: "Obbligazionario", pension: "Previdenza", crypto: "Crypto", deposit: "Conto deposito", other: "Altro" } as const;
export const ENTRY_TYPES = { expense: "Spesa", income: "Entrata", transfer: "Trasferimento", repayment: "Rata" } as const;
export const INTEREST_LABEL = "interest";
export const COLORS = ["#0b8277", "#4a6da5", "#d48351", "#7d65ae", "#c45e78", "#3e8da1", "#a07243", "#667fa6", "#c37c3a", "#77799b", "#608b73", "#c9a23a", "#5e8f3c", "#b05a9a", "#3f9e9a", "#8a6b52"];
export const MAX_CENTS = 99_999_999_999;
/** Versione segnaposto per eliminare una voce mai salvata sul cloud (versione null). */
export const NO_VERSION = "00000000-0000-4000-8000-000000000000";

const id = z.string().regex(/^[a-zA-Z0-9_-]{1,64}$/);
const name = z.string().trim().min(1).max(100);
const cents = z.number().int().min(-MAX_CENTS).max(MAX_CENTS);
const monthSchema = z.string().regex(/^(19[0-9]{2}|20[0-9]{2}|2100)-(0[1-9]|1[0-2])$/);
const dateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine((value) => {
  if (!monthSchema.safeParse(value.slice(0, 7)).success) return false;
  const date = new Date(value + "T12:00:00Z");
  return !Number.isNaN(date.valueOf()) && date.toISOString().slice(0, 10) === value;
});

const version = z.string().uuid().nullable();
export const subcategoryName = z.string().trim().min(1).max(80);
export const MAX_SUBCATEGORIES = 60;
export const MAX_TAGS = 10;
export const tagName = z.string().trim().min(1).max(40);

/** Provenienza di un movimento importato da un estratto conto. */
export const originSchema = z.object({
  batch: id,                          // importazione (voce "import"), per annullarla
  key: z.string().max(120),           // controparte normalizzata: è la chiave delle regole
  ref: z.string().max(80),            // impronta della riga della banca: riconosce i doppioni
  text: z.string().max(300),          // descrizione originale, senza IBAN
});

/** Parte di una spesa divisa: va a una categoria oppure a un credito (soldi anticipati per altri). */
export const partSchema = z.object({
  amount: cents.positive(),
  labelId: id.optional(),
  subcategory: z.string().trim().max(80).optional(),
  creditId: id.optional(),
}).refine((part) => !!part.labelId !== !!part.creditId, { message: "Ogni parte va a una categoria oppure a un credito." });

/**
 * Dati facoltativi di un movimento (versione 2.0): per chi è la spesa, detrazione, rimborso atteso,
 * periodo di competenza (bollette). Tutti in un unico campo per restare entro i limiti delle regole Firestore.
 */
export const movementExtraSchema = z.object({
  // Familiare per cui è stata sostenuta la spesa (assente = te stesso).
  person: id.optional(),
  // Detrazione forzata a mano: "yes" = detraibile, "no" = esclusa (assente = in base alla categoria).
  deduct: z.enum(["yes", "no"]).optional(),
  // Rimborso atteso (fondo sanitario, assicurazione, nota spese).
  refund: z.object({
    amount: cents.positive(),
    from: z.string().trim().max(80),
    received: z.union([dateSchema, z.literal("")]),
  }).optional(),
  // Periodo coperto (bollette): la spesa si distribuisce sui mesi del periodo.
  competence: z.object({ from: dateSchema, to: dateSchema }).optional(),
  // Conguaglio di una bolletta.
  adjustment: z.boolean().optional(),
});

const movementFields = {
  date: dateSchema,
  title: z.string().trim().min(1).max(160),
  amount: cents.positive(),
  notes: z.string().trim().max(1200),
  accountId: id.nullable(),
  tags: z.array(tagName).max(MAX_TAGS).optional(),
  origin: originSchema.optional(),
  extra: movementExtraSchema.optional(),
};

const movementValue = z.discriminatedUnion("type", [
  z.object({
    ...movementFields, type: z.literal("expense"), labelId: id, subcategory: z.string().trim().max(80), method: z.string().trim().max(60),
    parts: z.array(partSchema).min(2).max(10).optional(),
  }).refine((value) => !value.parts || (
    value.parts.reduce((sum, part) => sum + part.amount, 0) === value.amount
    && value.parts.some((part) => part.labelId)
    && value.parts.find((part) => part.labelId)?.labelId === value.labelId
  ), { message: "Le parti devono sommare l'importo e includere almeno una categoria." }),
  z.object({ ...movementFields, type: z.literal("income"), labelId: id }),
  z.object({ ...movementFields, type: z.literal("transfer"), accountId: id, toAccountId: id }),
  // Rata o rimborso di un debito: il capitale riduce il debito, interessi e spese (`interest`) sono una spesa
  // della categoria `labelId`. Dal conto di addebito esce l'importo intero.
  z.object({ ...movementFields, type: z.literal("repayment"), debtId: id, principal: cents.min(0), interest: cents.min(0), labelId: id })
    .refine((value) => value.principal + value.interest === value.amount, { message: "Capitale e interessi devono dare l'importo della rata." }),
]);

const percentSchema = z.number().min(0).max(100);

/** Finanziamento a rate costanti (piano alla francese) oppure debito flessibile (amici, parenti). */
export const debtDetailsSchema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("loan"),
    principal: cents.positive(),
    tan: percentSchema,
    taeg: percentSchema.nullable(),
    months: z.number().int().min(1).max(600),
    firstDate: dateSchema,
    installment: cents.positive(),
    fee: cents.min(0),
    paidBefore: z.number().int().min(0).max(600),
    accountId: id.nullable(),
    interestLabelId: id,
    // Mutuo per l'abitazione principale: niente penali di estinzione, interessi detraibili (se il modulo è attivo).
    home: z.boolean().optional(),
    // Credito ai consumatori (prestito personale, auto…): penale di estinzione dai parametri di legge.
    consumer: z.boolean().optional(),
    // Tasso variabile: il simulatore propone scenari di tasso.
    variable: z.boolean().optional(),
  }),
  z.object({
    kind: z.literal("flexible"),
    principal: cents.positive(),
    start: dateSchema,
    accountId: id.nullable(),
    note: z.string().trim().max(200),
  }),
]);

export const investDetailsSchema = z.object({
  assetClass: z.enum(["equity", "bond", "pension", "crypto", "deposit", "other"]),
  // Quanto avevi già versato prima di usare l'app.
  contributedBefore: cents.min(0),
});

export const bankLinkSchema = z.object({
  // Prodotti degli estratti conto collegati a questo conto, es. "revolut:attuale".
  keys: z.array(z.string().max(60)).max(10),
  // Ultime quattro cifre delle carte del conto: riconoscono le ricariche fatte da questa carta.
  cards: z.array(z.string().regex(/^\d{4}$/)).max(10),
  holder: z.string().max(100).optional(),
});

/** Tasso a fasi: "X% fino a…", poi "Y%". `until` vuoto = per sempre. */
const rateStepSchema = z.object({ rate: z.number().min(-10).max(100), until: z.union([dateSchema, z.literal("")]) });

export const CREDIT_FREQUENCIES = ["daily", "monthly", "quarterly", "semiannual", "annual", "maturity", "upfront"] as const;

/** Linea vincolata di un conto deposito. */
export const depositLineSchema = z.object({
  id,
  amount: cents.positive(),
  start: dateSchema,
  end: dateSchema,
  rates: z.array(rateStepSchema).min(1).max(6),
  credit: z.enum(CREDIT_FREQUENCIES),
  // Svincolo anticipato: non ammesso, perdita degli interessi, tasso ridotto.
  early: z.enum(["none", "lose-interest", "reduced-rate"]),
  earlyRate: z.number().min(0).max(100).optional(),
  noticeDays: z.number().int().min(0).max(400).optional(),
  closed: z.boolean().optional(),
});

/** Conto deposito / conto corrente remunerato. Le parti avanzate sono facoltative. */
export const depositDetailsSchema = z.object({
  kind: z.enum(["current", "free", "locked"]),
  bank: z.string().trim().max(80).optional(),
  rates: z.array(rateStepSchema).max(6),
  credit: z.enum(CREDIT_FREQUENCIES),
  dayCount: z.enum(["365", "360", "actual"]).optional(),
  stamp: z.enum(["client", "bank"]).optional(),
  stampCharge: z.enum(["quarterly", "annual", "daily"]).optional(),
  lines: z.array(depositLineSchema).max(20).optional(),
});

/** Quanto rapidamente i soldi del conto sono disponibili (fondo di emergenza). */
export const AVAILABILITY = ["now", "days", "month", "long"] as const;
export const liquiditySchema = z.object({
  availability: z.enum(AVAILABILITY),
  // Peso personalizzato (0-100); assente = quello predefinito per la disponibilità.
  weight: z.number().min(0).max(100).optional(),
  emergency: z.boolean().optional(),
});

export const creditDetailsSchema = z.object({
  start: dateSchema,
  note: z.string().trim().max(200),
});

export const RULE_TYPES = ["expense", "income", "transfer", "repayment", "ignore"] as const;

/** Regola d'importazione: come classificare una controparte (imparata dalle scelte o scritta a mano). */
export const ruleValueSchema = z.object({
  match: z.string().trim().min(2).max(120),
  mode: z.enum(["key", "contains"]),
  type: z.enum(RULE_TYPES),
  labelId: id.optional(),
  subcategory: z.string().trim().max(80).optional(),
  accountId: id.optional(),   // per i trasferimenti: l'altro conto
  debtId: id.optional(),
  title: z.string().trim().max(160).optional(),
  tags: z.array(tagName).max(MAX_TAGS).optional(),
  learned: z.boolean().optional(),
});

/** Un'importazione di estratti conto: serve ad annullarla. */
export const importValueSchema = z.object({
  file: z.string().max(200),
  at: dateSchema,
  movements: z.number().int().min(0).max(100_000),
  // Saldi scritti dall'importazione con il valore che avevano prima (null = non c'era).
  balances: z.array(z.object({ id: z.string().max(73), previous: cents.nullable() })).max(600),
  // Spese ridotte da un rimborso: importo precedente.
  updates: z.array(z.object({ id, previous: cents.positive() })).max(300),
  accounts: z.array(id).max(20),
  // Righe del file lette ma non diventate movimenti (rimborsi assorbiti, doppioni, ignorate): non si ripropongono.
  seen: z.array(z.string().max(80)).max(5000).optional(),
});

/** Spesa fissa o abbonamento: ciclo di vita, prezzi, disdetta. */
export const fixedSchema = z.object({
  kind: z.enum(["subscription", "fixed", "bill"]),
  status: z.enum(["active", "trial", "cancelling", "suspended", "cancelled"]),
  trialEnd: z.union([dateSchema, z.literal("")]).optional(),
  cancelBy: z.union([dateSchema, z.literal("")]).optional(),
  noticeDays: z.number().int().min(0).max(400).optional(),
  // Mesi senza addebito (1-12), es. palestra d'estate.
  suspendedMonths: z.array(z.number().int().min(1).max(12)).max(12).optional(),
  // Storico dei prezzi (importo dalla data).
  prices: z.array(z.object({ from: dateSchema, amount: cents.positive() })).max(60).optional(),
  // Quota tua in percentuale (abbonamenti condivisi).
  share: z.number().min(1).max(100).optional(),
  since: z.union([dateSchema, z.literal("")]).optional(),
});

export const scheduleSchema = z.object({
  frequency: z.enum(["weekly", "monthly", "yearly"]),
  every: z.number().int().min(1).max(12),
  start: dateSchema,
  end: z.union([dateSchema, z.literal("")]),
  // Numero di scadenze già gestite (registrate o saltate) a partire da `start`.
  done: z.number().int().min(0).max(100_000),
});

/** Preferito: un movimento modello da registrare con un tocco (importo facoltativo). */
export const templateValueSchema = z.object({
  name: z.string().trim().min(1).max(60),
  type: z.enum(["expense", "income", "transfer"]),
  title: z.string().trim().min(1).max(160),
  amount: cents.positive().nullable(),
  labelId: id.nullable(),
  subcategory: z.string().trim().max(80),
  accountId: id.nullable(),
  toAccountId: id.nullable(),
  method: z.string().trim().max(60),
  tags: z.array(tagName).max(MAX_TAGS).optional(),
  order: z.number().int().min(0).max(10_000),
});

// `archived`: nascosto dai menu ma con lo storico intatto.
// `removed`: segna come eliminata una voce predefinita (che altrimenti tornerebbe dal codice).
// `color`, `icon`, `order`: aspetto e posizione scelti in Impostazioni.
const flags = {
  archived: z.boolean().optional(), removed: z.boolean().optional(),
  color: z.string().regex(/^[a-z]{2,12}$/).optional(), icon: z.string().regex(/^[a-z-]{2,30}$/).optional(),
  order: z.number().int().min(0).max(10_000).optional(),
};

/** Budget: un tetto di spesa per tutte le spese, una categoria o un tag; mensile o complessivo (es. un viaggio). */
export const budgetValueSchema = z.object({
  target: z.enum(["all", "label", "tag"]),
  ref: z.string().max(80),
  amount: cents.positive(),
  period: z.enum(["month", "total"]),
  order: z.number().int().min(0).max(10_000),
});

/** Obiettivo di risparmio: progresso dal saldo di un conto oppure aggiornato a mano. */
export const goalValueSchema = z.object({
  name: z.string().trim().min(1).max(60),
  target: cents.positive(),
  deadline: z.union([dateSchema, z.literal("")]),
  accountId: id.nullable(),
  saved: cents.min(0),
  icon: z.string().regex(/^[a-z-]{2,30}$/).optional(),
  color: z.string().regex(/^[a-z]{2,12}$/).optional(),
  done: z.boolean().optional(),
  order: z.number().int().min(0).max(10_000),
});

/** Impostazioni comuni a tutti i dispositivi (un solo documento, id "general"). */
export const MODULES = ["tax", "fund", "fixed", "calendar", "deadlines", "projection", "yoy", "health", "refunds", "people"] as const;
export type ModuleKey = (typeof MODULES)[number];

export const settingsValueSchema = z.object({
  // Giorno in cui inizia il "mese" per entrate, spese e budget (1 = mese di calendario).
  periodStart: z.number().int().min(1).max(28),
  // Moduli attivi (assente = predefinito, vedi DEFAULT_MODULES).
  modules: z.partialRecord(z.enum(MODULES), z.boolean()).optional(),
  // Fondo di emergenza: pesi per disponibilità, obiettivo in mesi, inclusione degli investimenti.
  fund: z.object({
    weights: z.object({ now: z.number().min(0).max(100), days: z.number().min(0).max(100), month: z.number().min(0).max(100), long: z.number().min(0).max(100), investment: z.number().min(0).max(100) }),
    targetMonths: z.number().min(1).max(36),
    includeInvestments: z.boolean(),
  }).optional(),
  // Voci di detrazione attive (modulo Dichiarazione).
  deductions: z.array(z.string().regex(/^[a-z-]{2,30}$/)).max(30).optional(),
  // Ipotesi della proiezione a lungo termine (percentuali).
  projection: z.object({ returns: z.number().min(-20).max(30), inflation: z.number().min(-5).max(30), incomeGrowth: z.number().min(-20).max(30) }).optional(),
});

/** Familiare (per spese sostenute per altri e familiari a carico). */
export const personValueSchema = z.object({
  firstName: z.string().trim().min(1).max(60),
  lastName: z.string().trim().min(1).max(60),
  taxCode: z.string().trim().toUpperCase().regex(/^([A-Z0-9]{16})?$/),
  relation: z.enum(["spouse", "child", "other"]),
  birthDate: z.union([dateSchema, z.literal("")]),
  // Anni in cui è a carico, con la percentuale (100 o 50).
  dependent: z.array(z.object({ year: z.number().int().min(1900).max(2100), share: z.number().int().min(0).max(100) })).max(120),
  notes: z.string().trim().max(300).optional(),
  order: z.number().int().min(0).max(10_000),
});

export const DEADLINE_TYPES = ["vehicle", "document", "warranty", "contract", "health", "other"] as const;

/** Scadenza non economica (revisione, documenti, garanzie…). */
export const deadlineValueSchema = z.object({
  title: z.string().trim().min(1).max(120),
  type: z.enum(DEADLINE_TYPES),
  date: dateSchema,
  // Ripetizione in mesi (0 = una volta).
  repeatMonths: z.number().int().min(0).max(240),
  // Data di partenza delle ripetizioni: il giorno resta quello (il 31 torna 31 dopo febbraio).
  anchor: dateSchema.optional(),
  noticeDays: z.number().int().min(0).max(400),
  person: id.optional(),
  movement: id.optional(),
  notes: z.string().trim().max(600),
  done: z.boolean().optional(),
});

/** Parametri di legge e bancari di un anno (detrazioni, ritenuta, bollo, penali…). */
export const deductionRuleSchema = z.object({
  rate: z.number().min(0).max(100),
  threshold: cents.min(0),           // franchigia
  cap: cents.min(0).nullable(),      // tetto della spesa (null = nessuno)
  traceable: z.boolean(),            // richiede pagamento tracciabile
});
export const paramsValueSchema = z.object({
  year: z.number().int().min(1900).max(2100),
  withholding: z.number().min(0).max(100),          // ritenuta sugli interessi (26%)
  depositStamp: z.number().min(0).max(5),           // bollo conti deposito (% annuo)
  currentStamp: cents.min(0),                       // bollo fisso conti correnti
  currentStampThreshold: cents.min(0),              // giacenza media oltre cui si paga
  depositGuarantee: cents.min(0),                   // garanzia per banca (FITD)
  consumerPenalty: z.number().min(0).max(10),       // indennizzo estinzione credito al consumo
  consumerPenaltyShort: z.number().min(0).max(10),  // con meno di un anno residuo
  consumerPenaltyMin: cents.min(0),                 // sotto questo importo rimborsato: niente indennizzo
  pensionDeductionCap: cents.min(0),                // deduzione previdenza complementare
  deductions: z.record(z.string().regex(/^[a-z-]{2,30}$/), deductionRuleSchema),
  income: cents.min(0).nullable(),                  // reddito complessivo dichiarato (facoltativo)
  inflation: z.number().min(-20).max(100).nullable().optional(), // inflazione ISTAT dell'anno (%), per i valori reali
  confirmed: z.boolean().optional(),
});

/** Anno archiviato: movimenti e saldi in un unico documento (o più parti), per leggere poco da Firestore. */
export const archiveValueSchema = z.object({
  year: z.number().int().min(1900).max(2100),
  part: z.number().int().min(0).max(50),
  parts: z.number().int().min(1).max(51),
  records: z.array(z.unknown()).max(20_000),
});

export const recordSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("movement"), id, version, value: movementValue }),
  z.object({
    kind: z.literal("balance"), id: z.string().regex(/^[a-zA-Z0-9_-]{1,64}@\d{4}-\d{2}$/), version,
    value: z.object({ accountId: id, month: monthSchema, amount: cents }),
  }),
  z.object({
    kind: z.literal("account"), id, version,
    value: z.object({
      name, type: z.enum(["cash", "asset", "investment", "debt", "receivable"]), ...flags,
      debt: debtDetailsSchema.optional(), invest: investDetailsSchema.optional(),
      credit: creditDetailsSchema.optional(), bank: bankLinkSchema.optional(),
      deposit: depositDetailsSchema.optional(), liquidity: liquiditySchema.optional(),
      // Quota di proprietà per i conti cointestati (100 = tutto tuo).
      share: z.number().min(1).max(100).optional(),
    }),
  }),
  z.object({
    kind: z.literal("label"), id, version,
    value: z.object({
      name, type: z.enum(["expense", "income"]), ...flags, subcategories: z.array(subcategoryName).max(MAX_SUBCATEGORIES).optional(),
      // Spesa essenziale (fondo di emergenza).
      essential: z.boolean().optional(),
      // Tipo di detrazione della categoria e, facoltativo, delle singole sottocategorie.
      deduction: z.string().regex(/^[a-z-]{2,30}$/).optional(),
      subDeductions: z.record(subcategoryName, z.string().regex(/^[a-z-]{0,30}$/)).optional(),
    }),
  }),
  z.object({
    kind: z.literal("recurring"), id, version,
    value: z.object({ template: movementValue, schedule: scheduleSchema, paused: z.boolean().optional(), fixed: fixedSchema.optional() }),
  }),
  z.object({ kind: z.literal("rule"), id, version, value: ruleValueSchema }),
  z.object({ kind: z.literal("import"), id, version, value: importValueSchema }),
  z.object({ kind: z.literal("template"), id, version, value: templateValueSchema }),
  z.object({ kind: z.literal("budget"), id, version, value: budgetValueSchema }),
  z.object({ kind: z.literal("goal"), id, version, value: goalValueSchema }),
  z.object({ kind: z.literal("setting"), id: z.literal("general"), version, value: settingsValueSchema }),
  z.object({ kind: z.literal("person"), id, version, value: personValueSchema }),
  z.object({ kind: z.literal("deadline"), id, version, value: deadlineValueSchema }),
  z.object({ kind: z.literal("param"), id: z.string().regex(/^\d{4}$/), version, value: paramsValueSchema }),
  z.object({ kind: z.literal("archive"), id: z.string().regex(/^\d{4}-\d{1,2}$/), version, value: archiveValueSchema }),
]);

// "rule" e "import" restano solo per leggere i dati salvati dalle versioni con l'importazione degli estratti conto.
export const RECORD_KINDS = [
  "movement", "balance", "account", "label", "recurring", "rule", "import", "template", "budget", "goal", "setting",
  "person", "deadline", "param", "archive",
] as const;

export const mutationSchema = z.discriminatedUnion("op", [
  z.object({ op: z.literal("save"), record: recordSchema }),
  z.object({
    op: z.literal("delete"),
    kind: z.enum(RECORD_KINDS),
    id: z.string().min(1).max(73),
    version: z.string().uuid(),
    // Contenuto conservato nella lapide, per il cestino. Oggetto vuoto = eliminazione definitiva.
    trash: z.record(z.string(), z.unknown()).optional(),
  }),
]);

export type LedgerRecord = z.infer<typeof recordSchema>;
export type Movement = Extract<LedgerRecord, { kind: "movement" }>;
export type Balance = Extract<LedgerRecord, { kind: "balance" }>;
export type Account = Extract<LedgerRecord, { kind: "account" }>;
export type Label = Extract<LedgerRecord, { kind: "label" }>;
export type Recurring = Extract<LedgerRecord, { kind: "recurring" }>;
export type Rule = Extract<LedgerRecord, { kind: "rule" }>;
export type ImportBatch = Extract<LedgerRecord, { kind: "import" }>;
export type Template = Extract<LedgerRecord, { kind: "template" }>;
export type Budget = Extract<LedgerRecord, { kind: "budget" }>;
export type Goal = Extract<LedgerRecord, { kind: "goal" }>;
export type Settings = Extract<LedgerRecord, { kind: "setting" }>;
export type Person = Extract<LedgerRecord, { kind: "person" }>;
export type Deadline = Extract<LedgerRecord, { kind: "deadline" }>;
export type Params = Extract<LedgerRecord, { kind: "param" }>;
export type Archive = Extract<LedgerRecord, { kind: "archive" }>;
export type MovementExtra = z.infer<typeof movementExtraSchema>;
export type DepositDetails = z.infer<typeof depositDetailsSchema>;
export type DepositLine = z.infer<typeof depositLineSchema>;
export type Fixed = z.infer<typeof fixedSchema>;
export const DEFAULT_SETTINGS: Settings["value"] = { periodStart: 1 };
export type Part = z.infer<typeof partSchema>;
export type Schedule = Recurring["value"]["schedule"];
export type DebtDetails = z.infer<typeof debtDetailsSchema>;
export type LoanDetails = Extract<DebtDetails, { kind: "loan" }>;
export type MovementType = Movement["value"]["type"];
export type Mutation = z.infer<typeof mutationSchema>;

export const DEFAULT_ACCOUNTS: Account[] = [
  { kind: "account", id: "fineco", version: null, value: { name: "Fineco", type: "cash" } },
  { kind: "account", id: "revolut", version: null, value: { name: "Revolut", type: "cash" } },
  { kind: "account", id: "other", version: null, value: { name: "Altro", type: "asset" } },
];

const EXPENSE_OPTIONS = [
  ["housing", "Casa", ["Affitto", "Bollette", "Internet", "Manutenzione"]],
  ["health", "Salute", ["Farmacia", "Visite", "Analisi"]],
  ["groceries", "Spesa alimentare", ["Supermercato", "Mercato"]],
  ["transport", "Trasporti", ["Carburante", "Mezzi pubblici", "Auto"]],
  ["out", "Uscite", ["Bar", "Ristorante", "Da asporto"]],
  ["travel", "Viaggi", ["Alloggio", "Biglietti"]],
  ["clothing", "Abbigliamento", ["Vestiti", "Scarpe"]],
  ["leisure", "Tempo libero", ["Sport", "Abbonamenti", "Intrattenimento"]],
  ["gifts", "Regali", ["Compleanni", "Festività"]],
  ["fees", "Tasse e commissioni", ["Università", "Commissioni bancarie"]],
  [INTEREST_LABEL, "Interessi", []],
  ["other-expenses", "Altre spese", []],
] as const;

export const DEFAULT_LABELS: Label[] = [
  ...EXPENSE_OPTIONS.map(([labelId, labelName]): Label => ({
    kind: "label", id: labelId, version: null, value: { name: labelName, type: "expense" },
  })),
  { kind: "label", id: "work", version: null, value: { name: "Lavoro", type: "income" } },
  { kind: "label", id: "scholarship", version: null, value: { name: "Borsa di studio", type: "income" } },
  { kind: "label", id: "other-income", version: null, value: { name: "Altre entrate", type: "income" } },
];

export function newId() {
  if (typeof crypto.randomUUID === "function") return crypto.randomUUID();
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  bytes[6] = (bytes[6] & 15) | 64;
  bytes[8] = (bytes[8] & 63) | 128;
  const hex = Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
  return [hex.slice(0, 8), hex.slice(8, 12), hex.slice(12, 16), hex.slice(16, 20), hex.slice(20)].join("-");
}

export function balanceId(accountId: string, month: string) {
  return `${accountId}@${month}`;
}

export function isDefaultId(kind: "account" | "label", recordId: string) {
  return (kind === "account" ? DEFAULT_ACCOUNTS : DEFAULT_LABELS).some((item) => item.id === recordId);
}

export function deriveLedger(records: LedgerRecord[]) {
  const accounts = new Map(DEFAULT_ACCOUNTS.map((account) => [account.id, account]));
  const labels = new Map(DEFAULT_LABELS.map((label) => [label.id, label]));
  const movements: Movement[] = [];
  const balances: Balance[] = [];
  const recurring: Recurring[] = [];
  const rules: Rule[] = [];
  const imports: ImportBatch[] = [];
  const templates: Template[] = [];
  const budgets: Budget[] = [];
  const goals: Goal[] = [];
  const people: Person[] = [];
  const deadlines: Deadline[] = [];
  const params: Params[] = [];
  let settings: Settings | null = null;
  const removed: (Account | Label)[] = [];
  const { live, archivedYears, archives, invalidArchived, fromArchive } = expandArchives(records);

  for (const record of live) {
    switch (record.kind) {
      case "account":
        if (record.value.removed) { accounts.delete(record.id); removed.push(record); } else accounts.set(record.id, record);
        break;
      case "label":
        if (record.value.removed) { labels.delete(record.id); removed.push(record); } else labels.set(record.id, record);
        break;
      case "movement": movements.push(record); break;
      case "balance": balances.push(record); break;
      case "recurring": recurring.push(record); break;
      case "rule": rules.push(record); break;
      case "import": imports.push(record); break;
      case "template": templates.push(record); break;
      case "budget": budgets.push(record); break;
      case "goal": goals.push(record); break;
      case "setting": settings = record; break;
      case "person": people.push(record); break;
      case "deadline": deadlines.push(record); break;
      case "param": params.push(record); break;
      case "archive": break;
    }
  }

  movements.sort((a, b) => b.value.date.localeCompare(a.value.date));
  balances.sort((a, b) => b.value.month.localeCompare(a.value.month));
  recurring.sort((a, b) => a.value.template.title.localeCompare(b.value.template.title, "it"));
  imports.sort((a, b) => b.value.at.localeCompare(a.value.at) || b.id.localeCompare(a.id));
  templates.sort((a, b) => a.value.order - b.value.order || a.value.name.localeCompare(b.value.name, "it"));
  budgets.sort((a, b) => a.value.order - b.value.order);
  goals.sort((a, b) => Number(!!a.value.done) - Number(!!b.value.done) || a.value.order - b.value.order);
  people.sort((a, b) => a.value.order - b.value.order || a.value.firstName.localeCompare(b.value.firstName, "it"));
  deadlines.sort((a, b) => a.value.date.localeCompare(b.value.date));
  params.sort((a, b) => a.value.year - b.value.year);
  // Ordine scelto dall'utente; senza, quello predefinito (prima le voci di base, poi le altre).
  const ordered = <T extends Account | Label>(items: T[]) => items.map((item, index) => ({ item, key: item.value.order ?? 1000 + index }))
    .sort((a, b) => a.key - b.key).map(({ item }) => item);
  return {
    accounts: ordered([...accounts.values()]), labels: ordered([...labels.values()]), movements, balances, recurring, rules, imports, templates,
    budgets, goals, settings: (settings as Settings | null)?.value ?? DEFAULT_SETTINGS, settingsRecord: settings as Settings | null, removed,
    people, deadlines, params, archives, archivedYears, invalidArchived, fromArchive,
  };
}

/**
 * Gli anni archiviati arrivano come documenti "archive" con dentro movimenti e saldi:
 * qui tornano voci normali (in sola lettura). Una voce viva con lo stesso ID prevale.
 */
function expandArchives(records: LedgerRecord[]) {
  const archives = records.filter((record): record is Archive => record.kind === "archive");
  if (!archives.length) return { live: records, archivedYears: new Set<number>(), archives, invalidArchived: 0, fromArchive: new Set<string>() };
  const seen = new Set(records.map((record) => `${record.kind}:${record.id}`));
  const live = [...records];
  const archivedYears = new Set<number>();
  // Voci che esistono solo dentro un archivio (le altre sono anche documenti vivi, es. archiviazione interrotta).
  const fromArchive = new Set<string>();
  let invalidArchived = 0;
  for (const archive of archives) {
    archivedYears.add(archive.value.year);
    for (const item of archive.value.records) {
      const parsed = recordSchema.safeParse(item);
      if (!parsed.success || (parsed.data.kind !== "movement" && parsed.data.kind !== "balance")) { invalidArchived++; continue; }
      const key = `${parsed.data.kind}:${parsed.data.id}`;
      if (seen.has(key)) continue;
      seen.add(key);
      fromArchive.add(key);
      live.push(parsed.data);
    }
  }
  return { live, archivedYears, archives, invalidArchived, fromArchive };
}

/** Anno di una voce archiviabile (movimento o saldo). */
export function recordYear(record: LedgerRecord): number | null {
  if (record.kind === "movement") return Number(record.value.date.slice(0, 4));
  if (record.kind === "balance") return Number(record.value.month.slice(0, 4));
  return null;
}

/** true se la voce appartiene a un anno archiviato (sola lettura). */
export function isArchived(ledger: Pick<Ledger, "archivedYears">, record: LedgerRecord) {
  const year = recordYear(record);
  return year !== null && ledger.archivedYears.has(year);
}

export function activeAccounts(ledger: Ledger, keep?: string | null) {
  return ledger.accounts.filter((account) => !account.value.archived || account.id === keep);
}

export function activeLabels(ledger: Ledger, type: "expense" | "income", keep?: string | null) {
  return ledger.labels.filter((label) => label.value.type === type && (!label.value.archived || label.id === keep));
}

/** Quante voci usano un conto o una categoria: serve a decidere se si può eliminare. */
export function usage(ledger: Ledger, kind: "account" | "label", recordId: string) {
  const uses = (value: Movement["value"]) => kind === "account"
    ? value.accountId === recordId || (value.type === "transfer" && value.toAccountId === recordId) || (value.type === "repayment" && value.debtId === recordId)
      || (value.type === "expense" && !!value.parts?.some((part) => part.creditId === recordId))
    : value.type !== "transfer" && (value.labelId === recordId || (value.type === "expense" && !!value.parts?.some((part) => part.labelId === recordId)));
  const movements = ledger.movements.filter(({ value }) => uses(value));
  const recurring = ledger.recurring.filter(({ value: { template } }) => uses(template));
  const balances = kind === "account" ? ledger.balances.filter(({ value }) => value.accountId === recordId) : [];
  return { movements, recurring, balances };
}

export type Ledger = ReturnType<typeof deriveLedger>;

export function sameName(a: string, b: string) {
  return a.trim().toLocaleLowerCase("it") === b.trim().toLocaleLowerCase("it");
}

/**
 * Elenco delle sottocategorie di una categoria di spesa. Finché l'elenco non è
 * stato personalizzato, nasce dai suggerimenti predefiniti più i nomi già usati.
 */
export function subcategoryList(ledger: Ledger, labelId: string): string[] {
  const label = ledger.labels.find((item) => item.id === labelId);
  if (label?.value.subcategories) return [...label.value.subcategories];
  const suggestions: readonly string[] = EXPENSE_OPTIONS.find(([key]) => key === labelId)?.[2] ?? [];
  const list = [...suggestions];
  const used = ledger.movements.flatMap(({ value }) => expenseParts(value).flatMap((part) => (
    part.labelId === labelId && part.subcategory ? [part.subcategory] : []
  ))).sort((a, b) => a.localeCompare(b, "it"));
  for (const name of used) if (!list.some((item) => sameName(item, name))) list.push(name);
  return list;
}

export function subcategoryUsage(ledger: Ledger, labelId: string, name: string) {
  return ledger.movements.filter(({ value }) => expenseParts(value).some((part) => part.labelId === labelId && sameName(part.subcategory ?? "", name)));
}

/**
 * Le voci di spesa di un movimento: una sola (categoria e sottocategoria) oppure le parti di una spesa divisa.
 * Le parti verso un credito non sono spese.
 */
export function expenseParts(value: Movement["value"]): { labelId: string; subcategory: string; amount: number }[] {
  if (value.type !== "expense") return [];
  if (!value.parts) return [{ labelId: value.labelId, subcategory: value.subcategory, amount: value.amount }];
  return value.parts.flatMap((part) => (part.labelId ? [{ labelId: part.labelId, subcategory: part.subcategory ?? "", amount: part.amount }] : []));
}

/** Tutti i tag usati, dal più frequente. */
export function allTags(ledger: Ledger) {
  const counts = new Map<string, { name: string; count: number }>();
  for (const { value } of ledger.movements) {
    for (const tag of value.tags ?? []) {
      const key = tag.toLocaleLowerCase("it");
      const item = counts.get(key) ?? { name: tag, count: 0 };
      item.count++;
      counts.set(key, item);
    }
  }
  return [...counts.values()].sort((a, b) => b.count - a.count || a.name.localeCompare(b.name, "it"));
}

export function hasTag(value: Movement["value"], tag: string) {
  return !!value.tags?.some((item) => sameName(item, tag));
}

export function yearMonths(year: number) {
  return MONTHS.map((_, i) => `${year}-${String(i + 1).padStart(2, "0")}`);
}

export function monthName(month: string) {
  return MONTHS[Number(month.slice(5)) - 1] ?? "";
}

export function monthLabel(month: string) {
  return `${monthName(month)} ${month.slice(0, 4)}`;
}

export function todayInRome() {
  return new Intl.DateTimeFormat("sv-SE", {
    timeZone: "Europe/Rome", year: "numeric", month: "2-digit", day: "2-digit",
  }).format(new Date());
}

const euros = new Intl.NumberFormat("it-IT", { style: "currency", currency: "EUR", useGrouping: "always" });
const percent = new Intl.NumberFormat("it-IT", { style: "percent", maximumFractionDigits: 1 });

// Modalità discreta: gli importi diventano "••• €" finché non li mostri.
let discreet = false;
export function setDiscreet(hidden: boolean) { discreet = hidden; }
export function isDiscreet() { return discreet; }

export function money(value: number | null) {
  if (value === null) return "—";
  return discreet ? "••• €" : minus(euros.format(value / 100));
}

/** Segno meno tipografico (−) al posto del trattino, uguale in tutta l'app. */
function minus(text: string) {
  return text.replace(/^-/, "−");
}

const wholeEuros = new Intl.NumberFormat("it-IT", { style: "currency", currency: "EUR", maximumFractionDigits: 0 });

/** Come money(), arrotondato all'euro (per i testi riassuntivi). */
export function wholeMoney(value: number) {
  return discreet ? "••• €" : minus(wholeEuros.format(Math.round(value / 100)));
}

export function rate(value: number | null) {
  return value === null ? "—" : percent.format(value);
}

export function shortDate(date: string) {
  return `${date.slice(8, 10)}/${date.slice(5, 7)}/${date.slice(0, 4)}`;
}

export function parseMoney(raw: string) {
  let value = raw.trim().replace(/[\s\u00a0\u202f€]/g, "").replace("−", "-");
  if (/^-?\d{1,3}(\.\d{3})+(,\d{1,2})?$/.test(value)) {
    value = value.replace(/\./g, "").replace(",", ".");
  } else if (/^-?\d{1,3}(,\d{3})+\.\d{1,2}$/.test(value)) {
    value = value.replace(/,/g, "");
  } else {
    value = value.replace(",", ".");
  }
  if (!/^-?(\d+(\.\d{1,2})?|\.\d{1,2})$/.test(value)) return null;
  const amount = Math.round(Number(value) * 100);
  return Number.isSafeInteger(amount) && Math.abs(amount) <= MAX_CENTS ? amount : null;
}

/** Le rate contano come spesa solo per interessi e spese; il capitale rimborsato va a parte (`repaid`). */
export function totals(movements: Movement[]) {
  let income = 0;
  let expense = 0;
  let interest = 0;
  let repaid = 0;
  for (const { value } of movements) {
    if (value.type === "income") income += value.amount;
    if (value.type === "expense") expense += expenseParts(value).reduce((sum, part) => sum + part.amount, 0);
    if (value.type === "repayment") { interest += value.interest; repaid += value.principal; }
  }
  expense += interest;
  const saving = income - expense;
  return { income, expense, interest, repaid, saving, rate: income > 0 ? saving / income : null };
}

export function yearlyFlow(ledger: Ledger, year: number) {
  const monthGroups = new Map(yearMonths(year).map((month) => [month, [] as Movement[]]));
  for (const movement of ledger.movements) {
    monthGroups.get(periodOf(movement.value.date))?.push(movement);
  }
  return [...monthGroups.entries()].map(([month, movements]) => ({ month, ...totals(movements) }));
}

export function mix(movements: Movement[], labels: Label[], type: "expense" | "income", accounts: Account[] = []) {
  const values = new Map<string, { amount: number; detail: Map<string, number> }>();
  const debtNames = new Map(accounts.map((account) => [account.id, `Interessi · ${account.value.name}`]));
  for (const { value } of movements) {
    if (value.type === "repayment") {
      // Gli interessi delle rate entrano tra le spese della loro categoria.
      if (type !== "expense" || !value.interest) continue;
      const group = values.get(value.labelId) ?? { amount: 0, detail: new Map() };
      group.amount += value.interest;
      const detail = debtNames.get(value.debtId) ?? "Rate";
      group.detail.set(detail, (group.detail.get(detail) ?? 0) + value.interest);
      values.set(value.labelId, group);
      continue;
    }
    if (value.type !== type) continue;
    if (value.type === "expense") {
      for (const part of expenseParts(value)) {
        const group = values.get(part.labelId) ?? { amount: 0, detail: new Map() };
        group.amount += part.amount;
        const detail = part.subcategory || "Senza sottocategoria";
        group.detail.set(detail, (group.detail.get(detail) ?? 0) + part.amount);
        values.set(part.labelId, group);
      }
      continue;
    }
    const group = values.get(value.labelId) ?? { amount: 0, detail: new Map() };
    group.amount += value.amount;
    values.set(value.labelId, group);
  }
  return labels.filter((label) => label.value.type === type).map((label, index) => ({
    id: label.id,
    name: label.value.name,
    amount: values.get(label.id)?.amount ?? 0,
    detail: [...(values.get(label.id)?.detail ?? [])].sort((a, b) => b[1] - a[1]),
    color: label.value.color && label.value.color in TONE_HEX ? TONE_HEX[label.value.color as Tone] : COLORS[index % COLORS.length],
  }));
}

export function accountBalances(ledger: Ledger, month: string) {
  const snapshots = new Map<string, Balance>();
  for (const balance of ledger.balances) {
    if (balance.value.month <= month && !snapshots.has(balance.value.accountId)) {
      snapshots.set(balance.value.accountId, balance);
    }
  }
  const changes = new Map<string, number>();
  function change(accountId: string | null, date: string, amount: number) {
    if (!accountId) return;
    const snapshot = snapshots.get(accountId);
    if (snapshot && date.slice(0, 7) > snapshot.value.month) {
      changes.set(accountId, (changes.get(accountId) ?? 0) + amount);
    }
  }
  for (const { value } of ledger.movements) {
    if (value.date.slice(0, 7) > month) continue;
    if (value.type === "repayment") {
      // Dal conto esce la rata intera, il debito scende solo del capitale.
      change(value.accountId, value.date, -value.amount);
      change(value.debtId, value.date, -value.principal);
      continue;
    }
    change(value.accountId, value.date, value.type === "income" ? value.amount : -value.amount);
    if (value.type === "transfer") change(value.toAccountId, value.date, value.amount);
    // Una parte anticipata per altri fa crescere il credito verso di loro.
    if (value.type === "expense" && value.parts) for (const part of value.parts) if (part.creditId) change(part.creditId, value.date, part.amount);
  }
  return ledger.accounts.map((account) => {
    const snapshot = snapshots.get(account.id);
    const amount = snapshot ? snapshot.value.amount + (changes.get(account.id) ?? 0) : null;
    return { account, amount, snapshot, exact: snapshot?.value.month === month };
  });
}

export function netWorth(balances: ReturnType<typeof accountBalances>) {
  const known = balances.filter(({ amount }) => amount !== null);
  return known.length ? known.reduce((sum, { account, amount }) => sum + (account.value.type === "debt" ? -(amount ?? 0) : (amount ?? 0)), 0) : null;
}

// ---------------------------------------------------------------- Inizio del mese personalizzato

let periodStart = 1;
/** Impostato all'apertura dall'impostazione comune (vedi Impostazioni → Periodo). */
export function setPeriodStart(day: number) { periodStart = Math.min(28, Math.max(1, Math.round(day) || 1)); }
export function getPeriodStart() { return periodStart; }

function shiftMonth(month: string, step: number) {
  const [year, number] = month.split("-").map(Number);
  const date = new Date(Date.UTC(year, number - 1 + step, 1));
  return date.toISOString().slice(0, 7);
}

/**
 * Il "mese" a cui appartiene una data. Con inizio al giorno 1 è il mese di calendario.
 * Con un altro giorno il periodo prende il nome del mese in cui cade la maggior parte dei suoi giorni:
 * inizio il 5 → "novembre" va dal 5 novembre al 4 dicembre; inizio il 27 → "novembre" va dal 27 ottobre al 26 novembre.
 */
export function periodOf(date: string) {
  const month = date.slice(0, 7);
  if (periodStart === 1) return month;
  const day = Number(date.slice(8, 10));
  if (periodStart <= 15) return day >= periodStart ? month : shiftMonth(month, -1);
  return day >= periodStart ? shiftMonth(month, 1) : month;
}

/** Primo e ultimo giorno del periodo "AAAA-MM". */
export function periodRange(month: string): [string, string] {
  if (periodStart === 1) return [`${month}-01`, monthEnd(month)];
  const startMonth = periodStart <= 15 ? month : shiftMonth(month, -1);
  const start = `${startMonth}-${String(periodStart).padStart(2, "0")}`;
  const endMonth = shiftMonth(startMonth, 1);
  const end = new Date(Date.UTC(Number(endMonth.slice(0, 4)), Number(endMonth.slice(5, 7)) - 1, periodStart - 1)).toISOString().slice(0, 10);
  return [start, end];
}

export { shiftMonth };

export function periodMovements(ledger: Ledger, period: string) {
  return ledger.movements.filter(({ value }) => periodOf(value.date).startsWith(period));
}

export function lastRecordedMonth(ledger: Ledger) {
  return [ledger.movements[0]?.value.date.slice(0, 7), ledger.balances[0]?.value.month]
    .filter((month): month is string => !!month).sort().at(-1) ?? null;
}

// ---------------------------------------------------------------- Calcolatrice nel campo importo

/**
 * Importo scritto come numero o come espressione: "12,50+8", "45/3", "2x7,5", "(10+5)*2".
 * Restituisce i centesimi arrotondati, oppure null se l'espressione non è valida.
 * Niente eval: un piccolo interprete (le regole di sicurezza della pagina lo vietano comunque).
 */
export function evaluateAmount(raw: string): number | null {
  const text = raw.trim().replace(/[\s\u00a0\u202f€]/g, "").replace(/[×xX]/g, "*").replace(/[÷:]/g, "/").replace(/−/g, "-");
  if (!/[+*/()]|\d-/.test(text)) return parseMoney(raw);
  const tokens = text.match(/\d[\d.,]*|[-+*/()]/g);
  if (!tokens || tokens.join("") !== text) return null;
  let index = 0;
  // Valori in centesimi come numeri decimali: si arrotonda solo alla fine.
  function number(): number | null {
    const token = tokens![index];
    if (token === "(") {
      index++;
      const value = sum();
      if (tokens![index] !== ")") return null;
      index++;
      return value;
    }
    if (token === "-") { index++; const value = number(); return value === null ? null : -value; }
    if (!token || !/^\d/.test(token)) return null;
    index++;
    return parseMoney(token);
  }
  function product(): number | null {
    let value = number();
    while (value !== null && (tokens![index] === "*" || tokens![index] === "/")) {
      const operator = tokens![index++];
      const right = number();
      if (right === null) return null;
      if (operator === "*") value = value * right / 100;
      else { if (right === 0) return null; value = value / right * 100; }
    }
    return value;
  }
  function sum(): number | null {
    let value = product();
    while (value !== null && (tokens![index] === "+" || tokens![index] === "-")) {
      const operator = tokens![index++];
      const right = product();
      if (right === null) return null;
      value = operator === "+" ? value + right : value - right;
    }
    return value;
  }
  const result = sum();
  if (result === null || index !== tokens.length || !Number.isFinite(result)) return null;
  const rounded = Math.round(result);
  return Math.abs(rounded) <= MAX_CENTS ? rounded : null;
}

/** true se il testo è un'espressione (da mostrare con il risultato accanto). */
export function isExpression(raw: string) {
  return /\d\s*[-+*/×xX÷:]\s*[\d(]/.test(raw.trim());
}

// ---------------------------------------------------------------- Suggerimenti dal titolo

export type TitleSuggestion = {
  title: string;
  count: number;
  value: Movement["value"];
  /** L'importo, se è stato sempre lo stesso. */
  amount: number | null;
};

function normalTitle(title: string) {
  return title.trim().toLocaleLowerCase("it").replace(/\s+/g, " ");
}

/** Movimenti passati con un titolo simile a quello che stai scrivendo, dal più usato. */
export function titleSuggestions(ledger: Ledger, type: MovementType, text: string, limit = 6): TitleSuggestion[] {
  const query = normalTitle(text);
  if (query.length < 2) return [];
  const groups = new Map<string, TitleSuggestion & { amounts: Set<number>; starts: boolean }>();
  for (const movement of ledger.movements) {
    const { value } = movement;
    if (value.type !== type) continue;
    const key = normalTitle(value.title);
    if (!key.includes(query) || key === query) continue;
    const group = groups.get(key);
    if (group) { group.count++; group.amounts.add(value.amount); continue; }
    // ledger.movements è già dal più recente: il primo trovato è il modello.
    groups.set(key, { title: value.title, count: 1, value, amount: null, amounts: new Set([value.amount]), starts: key.startsWith(query) });
  }
  return [...groups.values()]
    .sort((a, b) => Number(b.starts) - Number(a.starts) || b.count - a.count)
    .slice(0, limit)
    .map(({ amounts, starts: _starts, ...item }) => ({ ...item, amount: amounts.size === 1 ? [...amounts][0] : null }));
}

// ---------------------------------------------------------------- Riconciliazione

/**
 * Saldo che il conto dovrebbe avere a fine `month` secondo i movimenti, partendo
 * dal saldo registrato più recente prima di quel mese. null se non c'è un punto di partenza.
 */
export function expectedBalance(ledger: Ledger, accountId: string, month: string) {
  const balances = ledger.balances.filter(({ value }) => value.accountId !== accountId || value.month < month);
  const entry = accountBalances({ ...ledger, balances }, month).find(({ account }) => account.id === accountId);
  if (!entry?.snapshot) return null;
  return { amount: entry.amount ?? 0, from: entry.snapshot.value.month };
}

export type Gap = { account: Account; month: string; recorded: number; expected: number; from: string };

/** Scarti tra saldi registrati e saldi attesi, dal mese più recente. */
export function balanceGaps(ledger: Ledger, months = 12): Gap[] {
  const gaps: Gap[] = [];
  const recent = new Set(ledger.balances.map(({ value }) => value.month).sort().reverse().slice(0, 400));
  for (const balance of ledger.balances) {
    const account = ledger.accounts.find((item) => item.id === balance.value.accountId);
    if (!account || account.value.type === "investment" || !recent.has(balance.value.month)) continue;
    const expected = expectedBalance(ledger, account.id, balance.value.month);
    if (!expected || expected.amount === balance.value.amount) continue;
    gaps.push({ account, month: balance.value.month, recorded: balance.value.amount, expected: expected.amount, from: expected.from });
  }
  const latest = [...new Set(gaps.map((gap) => gap.month))].sort().reverse().slice(0, months);
  return gaps.filter((gap) => latest.includes(gap.month)).sort((a, b) => b.month.localeCompare(a.month) || a.account.value.name.localeCompare(b.account.value.name, "it"));
}

/** Ultimo giorno del mese "AAAA-MM". */
export function monthEnd(month: string) {
  const [year, monthNumber] = month.split("-").map(Number);
  return `${month}-${String(new Date(Date.UTC(year, monthNumber, 0)).getUTCDate()).padStart(2, "0")}`;
}

// ---------------------------------------------------------------- Preferiti

/** Il movimento che nasce da un preferito (`amount` serve se il preferito non ha un importo fisso). */
export function templateMovement(template: Template["value"], date: string, amount = template.amount ?? 0): Movement["value"] {
  const common = { date, title: template.title, amount, notes: "", accountId: template.accountId, ...(template.tags?.length ? { tags: template.tags } : {}) };
  if (template.type === "transfer") return { ...common, type: "transfer", accountId: template.accountId ?? "", toAccountId: template.toAccountId ?? "" };
  if (template.type === "income") return { ...common, type: "income", labelId: template.labelId ?? "" };
  return { ...common, type: "expense", labelId: template.labelId ?? "", subcategory: template.subcategory, method: template.method };
}

/** Il preferito che nasce da un movimento. */
export function templateFrom(value: Movement["value"], name: string, fixedAmount: boolean, order: number): Template["value"] | null {
  if (value.type === "repayment" || (value.type === "expense" && value.parts)) return null;
  return {
    name: name.trim().slice(0, 60) || value.title.slice(0, 60),
    type: value.type,
    title: value.title,
    amount: fixedAmount ? value.amount : null,
    labelId: value.type === "transfer" ? null : value.labelId,
    subcategory: value.type === "expense" ? value.subcategory : "",
    accountId: value.accountId,
    toAccountId: value.type === "transfer" ? value.toAccountId : null,
    method: value.type === "expense" ? value.method : "",
    ...(value.tags?.length ? { tags: value.tags } : {}),
    order,
  };
}

/**
 * Movimento che chiude lo scarto di un saldo: spesa se mancano soldi, entrata se ce ne sono di più.
 * È datato all'ultimo giorno del mese, quindi non sposta il saldo registrato ma solo il calcolo atteso.
 */
export function adjustmentMovement(ledger: Ledger, accountId: string, month: string, gap: number): Movement["value"] {
  const missing = gap < 0;
  const wanted = missing ? "other-expenses" : "other-income";
  const labels = activeLabels(ledger, missing ? "expense" : "income");
  const labelId = labels.find((label) => label.id === wanted)?.id ?? labels[0]?.id ?? wanted;
  const common = { date: monthEnd(month), amount: Math.abs(gap), accountId, notes: `Rettifica del saldo di ${monthLabel(month)}` };
  return missing
    ? { ...common, type: "expense", title: "Spese non registrate", labelId, subcategory: "", method: "" }
    : { ...common, type: "income", title: "Entrate non registrate", labelId };
}

// ---------------------------------------------------------------- Colori disponibili

/** Tinte per conti, categorie e obiettivi (i valori sono in globals.css e app/style.tsx). */
export const TONES = ["green", "teal", "blue", "indigo", "purple", "pink", "red", "orange", "amber", "olive", "slate"] as const;
export type Tone = (typeof TONES)[number];
export const TONE_HEX: Record<Tone, string> = {
  green: "#13836e", teal: "#0f8a9a", blue: "#3567c8", indigo: "#5654c4", purple: "#8650b8", pink: "#c2457f",
  red: "#c8463d", orange: "#d9713a", amber: "#c99a1e", olive: "#6f8a2e", slate: "#5d7480",
};
