import {
  ENTRY_TYPES, INTEREST_LABEL, deriveLedger, isDefaultId, newId, parseMoney, recordSchema, sameName, subcategoryList,
  type Account, type Balance, type Label, type Ledger, type LedgerRecord, type Movement, type Mutation,
} from "./ledger";

// ---------------------------------------------------------------- Esportazione

export const MOVEMENT_HEADER = ["Data", "Tipo", "Descrizione", "Importo EUR", "Categoria o fonte", "Sottocategoria", "Conto", "Conto di destinazione", "Metodo di pagamento", "Note"];
export const BALANCE_HEADER = ["Mese", "Conto", "Saldo netto EUR"];
const BACKUP_FORMAT = "expense-tracking-backup";

/** Le celle che iniziano con = + - @ vengono precedute da ' per non diventare formule nei fogli di calcolo. */
export function csvCell(value: string) {
  const safe = /^[\s]*[=+\-@\t\r]/.test(value) ? "'" + value : value;
  return '"' + safe.replace(/"/g, '""') + '"';
}

export function csvNumber(cents: number) {
  return (cents / 100).toFixed(2).replace(".", ",");
}

export function downloadFile(filename: string, content: string, type: string) {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function csvDocument(header: string[], rows: string[][]) {
  return "﻿" + [header.join(";"), ...rows.map((row) => row.join(";"))].join("\r\n");
}

export function movementRows(ledger: Ledger, items: Movement[]) {
  const labels = new Map(ledger.labels.map((label) => [label.id, label.value.name]));
  const accounts = new Map(ledger.accounts.map((account) => [account.id, account.value.name]));
  return items.map(({ value }) => {
    if (value.type === "repayment") {
      // Rata: Categoria = debito, Sottocategoria = divisione capitale/interessi (rilette in importazione).
      return [
        value.date, csvCell(ENTRY_TYPES.repayment), csvCell(value.title), csvNumber(-value.amount),
        csvCell(accounts.get(value.debtId) ?? ""), csvCell(`Capitale ${csvNumber(value.principal)} · Interessi ${csvNumber(value.interest)}`),
        csvCell(value.accountId ? accounts.get(value.accountId) ?? "" : ""), csvCell(""), csvCell(""), csvCell(value.notes),
      ];
    }
    return [
      value.date, csvCell(ENTRY_TYPES[value.type]), csvCell(value.title),
      csvNumber(value.type === "expense" ? -value.amount : value.amount),
      csvCell(value.type !== "transfer" ? labels.get(value.labelId) ?? "" : ""),
      csvCell(value.type === "expense" ? value.subcategory : ""),
      csvCell(value.accountId ? accounts.get(value.accountId) ?? "" : ""),
      csvCell(value.type === "transfer" ? accounts.get(value.toAccountId) ?? "" : ""),
      csvCell(value.type === "expense" ? value.method : ""), csvCell(value.notes),
    ];
  });
}

export function balanceRows(ledger: Ledger) {
  const accounts = new Map(ledger.accounts.map((account) => [account.id, account]));
  return ledger.balances.map(({ value }) => {
    const account = accounts.get(value.accountId);
    return [value.month, csvCell(account?.value.name ?? ""), csvNumber(account?.value.type === "debt" ? -value.amount : value.amount)];
  });
}

export function backupDocument(records: LedgerRecord[]) {
  return JSON.stringify({ format: BACKUP_FORMAT, version: 1, exportedAt: new Date().toISOString(), records }, null, 1);
}

// ---------------------------------------------------------------- Lettura CSV

/** Parser CSV con campi tra virgolette, "" come virgoletta, ; o , come separatore. */
export function parseCsv(text: string): string[][] {
  const source = text.replace(/^﻿/, "");
  const firstLine = source.slice(0, source.search(/\r?\n|$/));
  const delimiter = (firstLine.match(/;/g)?.length ?? 0) >= (firstLine.match(/,/g)?.length ?? 0) ? ";" : ",";
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;
  for (let i = 0; i < source.length; i++) {
    const char = source[i];
    if (quoted) {
      if (char === '"') {
        if (source[i + 1] === '"') { cell += '"'; i++; } else quoted = false;
      } else cell += char;
    } else if (char === '"') {
      quoted = true;
    } else if (char === delimiter) {
      row.push(cell); cell = "";
    } else if (char === "\n" || char === "\r") {
      if (char === "\r" && source[i + 1] === "\n") i++;
      row.push(cell); rows.push(row); row = []; cell = "";
    } else cell += char;
  }
  if (cell !== "" || row.length) { row.push(cell); rows.push(row); }
  return rows.filter((items) => items.some((item) => item.trim() !== ""));
}

/** Toglie l'apostrofo aggiunto in esportazione davanti a = + - @. */
function cleanCell(value: string | undefined) {
  const text = (value ?? "").trim();
  return /^'[\s]*[=+\-@\t\r]/.test(text) ? text.slice(1) : text;
}

function normalizeDate(value: string) {
  const iso = value.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  const italian = value.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  const result = iso ? value : italian ? `${italian[3]}-${italian[2].padStart(2, "0")}-${italian[1].padStart(2, "0")}` : "";
  if (!result) return null;
  const date = new Date(result + "T12:00:00Z");
  return !Number.isNaN(date.valueOf()) && date.toISOString().slice(0, 10) === result && result >= "1900-01-01" && result <= "2100-12-31" ? result : null;
}

function normalizeType(value: string): Movement["value"]["type"] | null {
  const key = value.trim().toLocaleLowerCase("it");
  if (key === "spesa" || key === "expense" || key === "uscita") return "expense";
  if (key === "entrata" || key === "income") return "income";
  if (key === "trasferimento" || key === "transfer" || key === "giroconto") return "transfer";
  if (key === "rata" || key === "rimborso" || key === "rimborso debito" || key === "repayment") return "repayment";
  return null;
}

function key(text: string) {
  return text.trim().toLocaleLowerCase("it").replace(/\s+/g, " ");
}

/** Impronta usata per riconoscere i movimenti già presenti (stessa data, tipo, importo, descrizione e voci). */
export function fingerprint(value: Movement["value"]) {
  const target = value.type === "transfer" ? `${value.accountId}>${value.toAccountId}`
    : value.type === "repayment" ? `${value.debtId}|${value.accountId ?? ""}` : `${value.labelId}|${value.accountId ?? ""}`;
  return [value.date, value.type, value.amount, key(value.title), target].join("|");
}

// ---------------------------------------------------------------- Piano d'importazione

export type ImportIssue = { line: number; reason: string };

export type ImportPlan = {
  kind: "csv-movements" | "csv-balances" | "backup";
  mutations: Mutation[];
  newMovements: number;
  duplicates: number;
  newBalances: number;
  updatedBalances: number;
  sameBalances: number;
  newAccounts: string[];
  newLabels: string[];
  newSubcategories: number;
  restored: number;
  unchanged: number;
  issues: ImportIssue[];
};

function emptyPlan(kind: ImportPlan["kind"]): ImportPlan {
  return {
    kind, mutations: [], newMovements: 0, duplicates: 0, newBalances: 0, updatedBalances: 0, sameBalances: 0,
    newAccounts: [], newLabels: [], newSubcategories: 0, restored: 0, unchanged: 0, issues: [],
  };
}

/** Raccoglie i conti e le categorie da creare durante l'importazione. */
class Lookup {
  private accounts: Account[];
  private labels: Label[];
  createdAccounts: Account[] = [];
  createdLabels: Label[] = [];
  private subcategoryLists = new Map<string, string[]>();
  private subcategoryAdded = new Set<string>();

  constructor(private ledger: Ledger) {
    this.accounts = [...ledger.accounts];
    this.labels = [...ledger.labels];
  }

  account(name: string, debt = false): string {
    const found = this.accounts.find((item) => sameName(item.value.name, name));
    if (found) return found.id;
    const created: Account = { kind: "account", id: newId(), version: null, value: { name: name.slice(0, 100), type: debt ? "debt" : "cash" } };
    this.accounts.push(created);
    this.createdAccounts.push(created);
    return created.id;
  }

  label(name: string, type: "expense" | "income"): string {
    const found = this.labels.find((item) => item.value.type === type && sameName(item.value.name, name));
    if (found) return found.id;
    const created: Label = { kind: "label", id: newId(), version: null, value: { name: name.slice(0, 100), type } };
    this.labels.push(created);
    this.createdLabels.push(created);
    return created.id;
  }

  /** Restituisce il nome della sottocategoria come è scritto nell'elenco (aggiungendolo se manca). */
  subcategory(labelId: string, name: string): string {
    let list = this.subcategoryLists.get(labelId);
    if (!list) {
      list = subcategoryList(this.ledger, labelId);
      this.subcategoryLists.set(labelId, list);
    }
    const found = list.find((item) => sameName(item, name));
    if (found) return found;
    const clean = name.slice(0, 80);
    list.push(clean);
    this.subcategoryAdded.add(labelId);
    return clean;
  }

  /** Scritture per conti, categorie e sottocategorie nuove. */
  mutations(): Mutation[] {
    const result: Mutation[] = [];
    for (const account of this.createdAccounts) result.push({ op: "save", record: account });
    for (const label of this.createdLabels) {
      const list = this.subcategoryLists.get(label.id);
      result.push({ op: "save", record: list && label.value.type === "expense" ? { ...label, value: { ...label.value, subcategories: list.slice(0, 60) } } : label });
    }
    for (const labelId of this.subcategoryAdded) {
      if (this.createdLabels.some((label) => label.id === labelId)) continue;
      const label = this.labels.find((item) => item.id === labelId);
      const list = this.subcategoryLists.get(labelId);
      if (label && list) result.push({ op: "save", record: { ...label, value: { ...label.value, subcategories: list.slice(0, 60) } } });
    }
    return result;
  }

  get newSubcategoryCount() {
    let count = 0;
    for (const labelId of this.subcategoryAdded) {
      const before = this.createdLabels.some((label) => label.id === labelId) ? 0 : subcategoryList(this.ledger, labelId).length;
      count += (this.subcategoryLists.get(labelId)?.length ?? 0) - before;
    }
    return count;
  }
}

function headerIndex(header: string[], names: string[]) {
  const cleaned = header.map((cell) => key(cleanCell(cell)));
  return names.map((name) => cleaned.indexOf(key(name)));
}

function planMovements(rows: string[][], ledger: Ledger): ImportPlan {
  const plan = emptyPlan("csv-movements");
  const [date, type, title, amount, label, subcategory, account, toAccount, method, notes] = headerIndex(rows[0], MOVEMENT_HEADER);
  const lookup = new Lookup(ledger);
  const existing = new Map<string, number>();
  for (const { value } of ledger.movements) existing.set(fingerprint(value), (existing.get(fingerprint(value)) ?? 0) + 1);
  const movements: Movement[] = [];

  rows.slice(1).forEach((row, index) => {
    const line = index + 2;
    const cell = (position: number) => (position >= 0 ? cleanCell(row[position]) : "");
    const entryType = normalizeType(cell(type));
    const entryDate = normalizeDate(cell(date));
    const cents = parseMoney(cell(amount));
    const entryTitle = cell(title).slice(0, 160);
    if (!entryType) return plan.issues.push({ line, reason: `tipo «${cell(type)}» non riconosciuto` });
    if (!entryDate) return plan.issues.push({ line, reason: `data «${cell(date)}» non valida` });
    if (cents === null || cents === 0) return plan.issues.push({ line, reason: `importo «${cell(amount)}» non valido` });
    if (!entryTitle) return plan.issues.push({ line, reason: "descrizione mancante" });
    const fromName = cell(account);
    const common = { date: entryDate, title: entryTitle, amount: Math.abs(cents), notes: cell(notes).slice(0, 1200) };
    let value: Movement["value"];
    if (entryType === "repayment") {
      const debtName = cell(label);
      if (!debtName) return plan.issues.push({ line, reason: "rata senza il nome del debito" });
      const split = cell(subcategory).match(/capitale\s+([\d.,-]+).*interessi\s+([\d.,-]+)/i);
      const principal = split ? parseMoney(split[1]) : null;
      const interest = split ? parseMoney(split[2]) : null;
      const valid = principal !== null && interest !== null && principal >= 0 && interest >= 0 && principal + interest === common.amount;
      value = {
        ...common, type: "repayment", debtId: lookup.account(debtName, true), accountId: fromName ? lookup.account(fromName) : null,
        principal: valid ? principal : common.amount, interest: valid ? interest : 0, labelId: INTEREST_LABEL,
      };
    } else if (entryType === "transfer") {
      const toName = cell(toAccount);
      if (!fromName || !toName || sameName(fromName, toName)) return plan.issues.push({ line, reason: "trasferimento senza due conti diversi" });
      value = { ...common, type: "transfer", accountId: lookup.account(fromName), toAccountId: lookup.account(toName) };
    } else {
      const labelName = cell(label) || (entryType === "expense" ? "Altre spese" : "Altre entrate");
      const labelId = lookup.label(labelName, entryType);
      const accountId = fromName ? lookup.account(fromName) : null;
      value = entryType === "expense"
        ? { ...common, type: "expense", labelId, accountId, subcategory: cell(subcategory) ? lookup.subcategory(labelId, cell(subcategory)) : "", method: cell(method).slice(0, 60) }
        : { ...common, type: "income", labelId, accountId };
    }
    const record: Movement = { kind: "movement", id: newId(), version: null, value };
    if (!recordSchema.safeParse(record).success) return plan.issues.push({ line, reason: "riga non valida" });
    const print = fingerprint(value);
    const left = existing.get(print) ?? 0;
    if (left > 0) {
      existing.set(print, left - 1);
      plan.duplicates++;
      return;
    }
    movements.push(record);
  });

  plan.newMovements = movements.length;
  plan.newAccounts = lookup.createdAccounts.map((item) => item.value.name);
  plan.newLabels = lookup.createdLabels.map((item) => item.value.name);
  plan.newSubcategories = lookup.newSubcategoryCount;
  plan.mutations = movements.length ? [...lookup.mutations(), ...movements.map((record) => ({ op: "save" as const, record }))] : [];
  return plan;
}

function planBalances(rows: string[][], ledger: Ledger): ImportPlan {
  const plan = emptyPlan("csv-balances");
  const [month, account, amount] = headerIndex(rows[0], BALANCE_HEADER);
  const lookup = new Lookup(ledger);
  const balances = new Map<string, Balance>();
  rows.slice(1).forEach((row, index) => {
    const line = index + 2;
    const cell = (position: number) => (position >= 0 ? cleanCell(row[position]) : "");
    const entryMonth = cell(month);
    const cents = parseMoney(cell(amount));
    const name = cell(account);
    if (!/^(19\d{2}|20\d{2}|2100)-(0[1-9]|1[0-2])$/.test(entryMonth)) return plan.issues.push({ line, reason: `mese «${entryMonth}» non valido` });
    if (cents === null) return plan.issues.push({ line, reason: `saldo «${cell(amount)}» non valido` });
    if (!name) return plan.issues.push({ line, reason: "conto mancante" });
    const accountId = lookup.account(name, cents < 0);
    const known = ledger.accounts.find((item) => item.id === accountId) ?? lookup.createdAccounts.find((item) => item.id === accountId);
    // In esportazione i debiti sono negativi: nell'archivio si salvano come debito residuo positivo.
    const value = known?.value.type === "debt" ? Math.abs(cents) : cents;
    const id = `${accountId}@${entryMonth}`;
    if (id.length > 73 || !/^[a-zA-Z0-9_-]{1,64}@/.test(id)) return plan.issues.push({ line, reason: "conto non valido" });
    balances.set(id, { kind: "balance", id, version: null, value: { accountId, month: entryMonth, amount: value } });
  });
  const writes: Mutation[] = [];
  for (const balance of balances.values()) {
    const current = ledger.balances.find((item) => item.id === balance.id);
    if (current && current.value.amount === balance.value.amount) { plan.sameBalances++; continue; }
    if (current) plan.updatedBalances++; else plan.newBalances++;
    writes.push({ op: "save", record: balance });
  }
  plan.newAccounts = lookup.createdAccounts.map((item) => item.value.name);
  plan.mutations = writes.length ? [...lookup.mutations(), ...writes] : [];
  return plan;
}

/** JSON con le chiavi in ordine alfabetico, per confrontare voci uguali scritte in ordine diverso. */
function stableJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.keys(value).filter((key) => (value as Record<string, unknown>)[key] !== undefined).sort()
      .map((key) => `${JSON.stringify(key)}:${stableJson((value as Record<string, unknown>)[key])}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

function planBackup(data: unknown, records: LedgerRecord[]): ImportPlan {
  const plan = emptyPlan("backup");
  const list = typeof data === "object" && data !== null && (data as { format?: unknown }).format === BACKUP_FORMAT
    ? (data as { records?: unknown }).records : null;
  if (!Array.isArray(list)) {
    plan.issues.push({ line: 0, reason: "il file non è un backup di Expense Tracking" });
    return plan;
  }
  const current = new Map(records.map((record) => [`${record.kind}:${record.id}`, record]));
  list.forEach((item, index) => {
    const parsed = recordSchema.safeParse(item);
    if (!parsed.success) return plan.issues.push({ line: index + 1, reason: "voce non valida" });
    const record = parsed.data;
    const existing = current.get(`${record.kind}:${record.id}`);
    const strip = (value: LedgerRecord) => stableJson(value.value);
    if (existing && strip(existing) === strip(record)) { plan.unchanged++; return; }
    plan.restored++;
    plan.mutations.push({ op: "save", record: { ...record, version: existing?.version ?? null } });
  });
  return plan;
}

/** Legge un file scelto dall'utente e prepara l'importazione senza scrivere nulla. */
export function planImport(fileName: string, text: string, records: LedgerRecord[]): ImportPlan {
  const ledger = deriveLedger(records);
  if (/\.json$/i.test(fileName) || text.trimStart().startsWith("{")) {
    try {
      return planBackup(JSON.parse(text), records);
    } catch {
      const plan = emptyPlan("backup");
      plan.issues.push({ line: 0, reason: "il file JSON non è leggibile" });
      return plan;
    }
  }
  const rows = parseCsv(text);
  const header = (rows[0] ?? []).map((cell) => key(cleanCell(cell)));
  if (header.includes("data") && header.includes("tipo") && header.includes(key("Importo EUR"))) return planMovements(rows, ledger);
  if (header.includes("mese") && header.includes("conto") && header.includes(key("Saldo netto EUR"))) return planBalances(rows, ledger);
  const plan = emptyPlan("csv-movements");
  plan.issues.push({ line: 1, reason: "intestazione non riconosciuta: usa un CSV esportato da Expense Tracking (movimenti o saldi)" });
  return plan;
}

export function isDefaultRecord(record: Account | Label) {
  return isDefaultId(record.kind, record.id);
}
