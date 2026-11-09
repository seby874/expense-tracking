import { z } from "zod";

export const INITIAL_YEAR = 2027;
export const MONTHS = ["Gennaio", "Febbraio", "Marzo", "Aprile", "Maggio", "Giugno", "Luglio", "Agosto", "Settembre", "Ottobre", "Novembre", "Dicembre"];
export const METHOD_LABELS = ["Carta", "Contanti", "Bonifico", "Addebito diretto", "PayPal", "Altro"];
export const ACCOUNT_TYPES = { cash: "Liquidità", asset: "Altre attività", debt: "Debito" } as const;
export const ENTRY_TYPES = { expense: "Spesa", income: "Entrata", transfer: "Trasferimento" } as const;
export const COLORS = ["#0b8277", "#4a6da5", "#d48351", "#7d65ae", "#c45e78", "#3e8da1", "#a07243", "#667fa6", "#c37c3a", "#77799b", "#608b73", "#c9a23a", "#5e8f3c", "#b05a9a", "#3f9e9a", "#8a6b52"];
export const MAX_CENTS = 99_999_999_999;

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
const movementFields = {
  date: dateSchema,
  title: z.string().trim().min(1).max(160),
  amount: cents.positive(),
  notes: z.string().trim().max(1200),
  accountId: id.nullable(),
};

const movementValue = z.discriminatedUnion("type", [
  z.object({ ...movementFields, type: z.literal("expense"), labelId: id, subcategory: z.string().trim().max(80), method: z.string().trim().max(60) }),
  z.object({ ...movementFields, type: z.literal("income"), labelId: id }),
  z.object({ ...movementFields, type: z.literal("transfer"), accountId: id, toAccountId: id }),
]);

export const scheduleSchema = z.object({
  frequency: z.enum(["weekly", "monthly", "yearly"]),
  every: z.number().int().min(1).max(12),
  start: dateSchema,
  end: z.union([dateSchema, z.literal("")]),
  // Numero di scadenze già gestite (registrate o saltate) a partire da `start`.
  done: z.number().int().min(0).max(100_000),
});

// `archived`: nascosto dai menu ma con lo storico intatto.
// `removed`: segna come eliminata una voce predefinita (che altrimenti tornerebbe dal codice).
const flags = { archived: z.boolean().optional(), removed: z.boolean().optional() };

export const recordSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("movement"), id, version, value: movementValue }),
  z.object({
    kind: z.literal("balance"), id: z.string().regex(/^[a-zA-Z0-9_-]{1,64}@\d{4}-\d{2}$/), version,
    value: z.object({ accountId: id, month: monthSchema, amount: cents }),
  }),
  z.object({
    kind: z.literal("account"), id, version,
    value: z.object({ name, type: z.enum(["cash", "asset", "debt"]), ...flags }),
  }),
  z.object({
    kind: z.literal("label"), id, version,
    value: z.object({ name, type: z.enum(["expense", "income"]), ...flags, subcategories: z.array(subcategoryName).max(MAX_SUBCATEGORIES).optional() }),
  }),
  z.object({
    kind: z.literal("recurring"), id, version,
    value: z.object({ template: movementValue, schedule: scheduleSchema, paused: z.boolean().optional() }),
  }),
]);

export const mutationSchema = z.discriminatedUnion("op", [
  z.object({ op: z.literal("save"), record: recordSchema }),
  z.object({
    op: z.literal("delete"),
    kind: z.enum(["movement", "balance", "account", "label", "recurring"]),
    id: z.string().min(1).max(73),
    version: z.string().uuid(),
  }),
]);

export type LedgerRecord = z.infer<typeof recordSchema>;
export type Movement = Extract<LedgerRecord, { kind: "movement" }>;
export type Balance = Extract<LedgerRecord, { kind: "balance" }>;
export type Account = Extract<LedgerRecord, { kind: "account" }>;
export type Label = Extract<LedgerRecord, { kind: "label" }>;
export type Recurring = Extract<LedgerRecord, { kind: "recurring" }>;
export type Schedule = Recurring["value"]["schedule"];
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
  const removed: (Account | Label)[] = [];

  for (const record of records) {
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
    }
  }

  movements.sort((a, b) => b.value.date.localeCompare(a.value.date));
  balances.sort((a, b) => b.value.month.localeCompare(a.value.month));
  recurring.sort((a, b) => a.value.template.title.localeCompare(b.value.template.title, "it"));
  return { accounts: [...accounts.values()], labels: [...labels.values()], movements, balances, recurring, removed };
}

export function activeAccounts(ledger: Ledger, keep?: string | null) {
  return ledger.accounts.filter((account) => !account.value.archived || account.id === keep);
}

export function activeLabels(ledger: Ledger, type: "expense" | "income", keep?: string | null) {
  return ledger.labels.filter((label) => label.value.type === type && (!label.value.archived || label.id === keep));
}

/** Quante voci usano un conto o una categoria: serve a decidere se si può eliminare. */
export function usage(ledger: Ledger, kind: "account" | "label", recordId: string) {
  const movements = ledger.movements.filter(({ value }) => kind === "account"
    ? value.accountId === recordId || (value.type === "transfer" && value.toAccountId === recordId)
    : value.type !== "transfer" && value.labelId === recordId);
  const recurring = ledger.recurring.filter(({ value: { template } }) => kind === "account"
    ? template.accountId === recordId || (template.type === "transfer" && template.toAccountId === recordId)
    : template.type !== "transfer" && template.labelId === recordId);
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
  const used = ledger.movements.flatMap(({ value }) => (
    value.type === "expense" && value.labelId === labelId && value.subcategory ? [value.subcategory] : []
  )).sort((a, b) => a.localeCompare(b, "it"));
  for (const name of used) if (!list.some((item) => sameName(item, name))) list.push(name);
  return list;
}

export function subcategoryUsage(ledger: Ledger, labelId: string, name: string) {
  return ledger.movements.filter(({ value }) => value.type === "expense" && value.labelId === labelId && sameName(value.subcategory, name));
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

export function money(value: number | null) {
  return value === null ? "—" : euros.format(value / 100);
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

export function totals(movements: Movement[]) {
  let income = 0;
  let expense = 0;
  for (const { value } of movements) {
    if (value.type === "income") income += value.amount;
    if (value.type === "expense") expense += value.amount;
  }
  const saving = income - expense;
  return { income, expense, saving, rate: income > 0 ? saving / income : null };
}

export function yearlyFlow(ledger: Ledger, year: number) {
  const monthGroups = new Map(yearMonths(year).map((month) => [month, [] as Movement[]]));
  for (const movement of ledger.movements) {
    monthGroups.get(movement.value.date.slice(0, 7))?.push(movement);
  }
  return [...monthGroups.entries()].map(([month, movements]) => ({ month, ...totals(movements) }));
}

export function mix(movements: Movement[], labels: Label[], type: "expense" | "income") {
  const values = new Map<string, { amount: number; detail: Map<string, number> }>();
  for (const { value } of movements) {
    if (value.type !== type) continue;
    const group = values.get(value.labelId) ?? { amount: 0, detail: new Map() };
    group.amount += value.amount;
    if (value.type === "expense") {
      const detail = value.subcategory || "Senza sottocategoria";
      group.detail.set(detail, (group.detail.get(detail) ?? 0) + value.amount);
    }
    values.set(value.labelId, group);
  }
  return labels.filter((label) => label.value.type === type).map((label, index) => ({
    id: label.id,
    name: label.value.name,
    amount: values.get(label.id)?.amount ?? 0,
    detail: [...(values.get(label.id)?.detail ?? [])].sort((a, b) => b[1] - a[1]),
    color: COLORS[index % COLORS.length],
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
    change(value.accountId, value.date, value.type === "income" ? value.amount : -value.amount);
    if (value.type === "transfer") change(value.toAccountId, value.date, value.amount);
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

export function periodMovements(ledger: Ledger, period: string) {
  return ledger.movements.filter(({ value }) => value.date.startsWith(period));
}

export function lastRecordedMonth(ledger: Ledger) {
  return [ledger.movements[0]?.value.date.slice(0, 7), ledger.balances[0]?.value.month]
    .filter((month): month is string => !!month).sort().at(-1) ?? null;
}
