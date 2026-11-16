import * as z from "zod";
import { ENTRY_TYPES, recordSchema, type Ledger, type LedgerRecord, type Movement } from "../ledger";
import { csvCell, csvDocument, csvNumber } from "../data-io";
import { createZip, textEntry, type ZipEntry } from "./zip";
import { readmeText } from "./readme";

/*
 * Backup portatile: un archivio .zip con i dati completi (JSON), fogli CSV, un file SQL e la guida.
 * Formato versionato: le versioni future dell'app sanno leggere quelli vecchi.
 */

export const BACKUP_FORMAT = "expense-tracking-backup";
export const BACKUP_VERSION = 2;
export const BACKUP_PREFIX = "expense-tracking-backup-";

export function backupJson(records: LedgerRecord[], exportedAt = new Date().toISOString()) {
  return JSON.stringify({ format: BACKUP_FORMAT, version: BACKUP_VERSION, app: "2.0", exportedAt, records });
}

function schemaJson() {
  try {
    return JSON.stringify(z.toJSONSchema(recordSchema, { unrepresentable: "any" }), null, 1);
  } catch {
    return JSON.stringify({ note: "Schema non disponibile: vedi LEGGIMI.md" });
  }
}

// ---------------------------------------------------------------- Fogli CSV

const FREQUENCY = { weekly: "settimanale", monthly: "mensile", yearly: "annuale" } as const;
const RELATION = { spouse: "coniuge", child: "figlio/a", other: "altro" } as const;

function yesNo(value: boolean | undefined) {
  return value ? "sì" : "";
}

function movementTable(ledger: Ledger, movements: Movement[]) {
  const labels = new Map(ledger.labels.map((label) => [label.id, label.value.name]));
  const accounts = new Map(ledger.accounts.map((account) => [account.id, account.value.name]));
  const people = new Map(ledger.people.map((person) => [person.id, `${person.value.firstName} ${person.value.lastName}`]));
  const header = ["Data", "Tipo", "Descrizione", "Importo EUR", "Categoria", "Sottocategoria", "Conto", "Conto destinazione / debito",
    "Capitale EUR", "Interessi EUR", "Metodo", "Note", "Tag", "Per", "Detraibile", "Rimborso atteso EUR", "Rimborso da", "Rimborso ricevuto il",
    "Competenza dal", "Competenza al", "ID"];
  const rows = movements.map(({ id, value }) => {
    const extra = value.extra;
    const sign = value.type === "expense" || value.type === "repayment" ? -1 : 1;
    return [
      value.date, csvCell(ENTRY_TYPES[value.type]), csvCell(value.title), csvNumber(sign * value.amount),
      csvCell(value.type === "transfer" ? "" : labels.get(value.labelId) ?? ""),
      csvCell(value.type === "expense" ? value.subcategory : ""),
      csvCell(value.accountId ? accounts.get(value.accountId) ?? "" : ""),
      csvCell(value.type === "transfer" ? accounts.get(value.toAccountId) ?? "" : value.type === "repayment" ? accounts.get(value.debtId) ?? "" : ""),
      value.type === "repayment" ? csvNumber(value.principal) : "", value.type === "repayment" ? csvNumber(value.interest) : "",
      csvCell(value.type === "expense" ? value.method : ""), csvCell(value.notes), csvCell((value.tags ?? []).join(", ")),
      csvCell(extra?.person ? people.get(extra.person) ?? "" : ""), csvCell(extra?.deduct === "yes" ? "sì" : extra?.deduct === "no" ? "no" : ""),
      extra?.refund ? csvNumber(extra.refund.amount) : "", csvCell(extra?.refund?.from ?? ""), extra?.refund?.received ?? "",
      extra?.competence?.from ?? "", extra?.competence?.to ?? "", csvCell(id),
    ];
  });
  return csvDocument(header, rows);
}

function tables(ledger: Ledger): Record<string, string> {
  const accounts = new Map(ledger.accounts.map((account) => [account.id, account]));
  return {
    "movimenti.csv": movementTable(ledger, ledger.movements),
    "saldi.csv": csvDocument(["Mese", "Conto", "Saldo EUR", "ID conto"], ledger.balances.map(({ value }) => {
      const account = accounts.get(value.accountId);
      return [value.month, csvCell(account?.value.name ?? ""), csvNumber(value.amount), csvCell(value.accountId)];
    })),
    "conti.csv": csvDocument(["ID", "Nome", "Tipo", "Archiviato", "Quota %", "Disponibilità", "Banca"], ledger.accounts.map(({ id, value }) => [
      csvCell(id), csvCell(value.name), value.type, yesNo(value.archived), String(value.share ?? 100), value.liquidity?.availability ?? "",
      csvCell(value.deposit?.bank ?? ""),
    ])),
    "categorie.csv": csvDocument(["ID", "Nome", "Tipo", "Sottocategorie", "Essenziale", "Detrazione", "Archiviata"], ledger.labels.map(({ id, value }) => [
      csvCell(id), csvCell(value.name), value.type === "expense" ? "spesa" : "entrata", csvCell((value.subcategories ?? []).join(", ")),
      yesNo(value.essential), csvCell(value.deduction ?? ""), yesNo(value.archived),
    ])),
    "ricorrenti.csv": csvDocument(["ID", "Descrizione", "Tipo", "Importo EUR", "Frequenza", "Ogni", "Inizio", "Fine", "Scadenze gestite", "In pausa", "Spesa fissa", "Stato"],
      ledger.recurring.map(({ id, value }) => [
        csvCell(id), csvCell(value.template.title), csvCell(ENTRY_TYPES[value.template.type]), csvNumber(value.template.amount),
        FREQUENCY[value.schedule.frequency], String(value.schedule.every), value.schedule.start, value.schedule.end, String(value.schedule.done),
        yesNo(value.paused), value.fixed?.kind ?? "", value.fixed?.status ?? "",
      ])),
    "budget.csv": csvDocument(["Riferimento", "Tipo", "Importo EUR", "Periodo"], ledger.budgets.map(({ value }) => [
      csvCell(value.ref), value.target, csvNumber(value.amount), value.period,
    ])),
    "obiettivi.csv": csvDocument(["Nome", "Obiettivo EUR", "Scadenza", "Conto", "Risparmiato EUR", "Completato"], ledger.goals.map(({ value }) => [
      csvCell(value.name), csvNumber(value.target), value.deadline, csvCell(value.accountId ? accounts.get(value.accountId)?.value.name ?? "" : ""),
      csvNumber(value.saved), yesNo(value.done),
    ])),
    // Senza codice fiscale: resta solo nel backup completo.
    "familiari.csv": csvDocument(["ID", "Nome", "Cognome", "Relazione", "Data di nascita", "A carico (anno:%)"], ledger.people.map(({ id, value }) => [
      csvCell(id), csvCell(value.firstName), csvCell(value.lastName), RELATION[value.relation], value.birthDate,
      csvCell(value.dependent.map((item) => `${item.year}:${item.share}`).join(", ")),
    ])),
    "scadenze.csv": csvDocument(["Descrizione", "Tipo", "Data", "Ripeti ogni (mesi)", "Preavviso (giorni)", "Note", "Fatta"], ledger.deadlines.map(({ value }) => [
      csvCell(value.title), value.type, value.date, String(value.repeatMonths), String(value.noticeDays), csvCell(value.notes), yesNo(value.done),
    ])),
    "parametri.csv": csvDocument(["Anno", "Parametro", "Valore"], ledger.params.flatMap(({ value }) => [
      ...(["withholding", "depositStamp", "currentStamp", "currentStampThreshold", "depositGuarantee", "consumerPenalty", "consumerPenaltyShort",
        "consumerPenaltyMin", "pensionDeductionCap", "income"] as const).map((key) => [String(value.year), key, String(value[key] ?? "")]),
      ...Object.entries(value.deductions).map(([key, rule]) => [String(value.year), `detrazione.${key}`, csvCell(JSON.stringify(rule))]),
    ])),
  };
}

// ---------------------------------------------------------------- SQL

function sqlText(value: string | null | undefined) {
  return value === null || value === undefined ? "NULL" : `'${value.replace(/'/g, "''")}'`;
}

function sqlNumber(value: number | null | undefined) {
  return value === null || value === undefined || !Number.isFinite(value) ? "NULL" : String(value);
}

export function sqlDump(ledger: Ledger, records: LedgerRecord[]) {
  const lines = [
    "-- Expense Tracking: dati esportati. Importi in centesimi, date AAAA-MM-GG.",
    "-- Compatibile con PostgreSQL, MySQL/MariaDB e SQLite.",
    "CREATE TABLE voci (tipo VARCHAR(20) NOT NULL, id VARCHAR(80) NOT NULL, versione VARCHAR(40), dati TEXT NOT NULL, PRIMARY KEY (tipo, id));",
    "CREATE TABLE conti (id VARCHAR(80) PRIMARY KEY, nome VARCHAR(120) NOT NULL, tipo VARCHAR(20) NOT NULL, archiviato INTEGER NOT NULL);",
    "CREATE TABLE categorie (id VARCHAR(80) PRIMARY KEY, nome VARCHAR(120) NOT NULL, tipo VARCHAR(20) NOT NULL);",
    "CREATE TABLE saldi (conto_id VARCHAR(80) NOT NULL, mese CHAR(7) NOT NULL, saldo_centesimi BIGINT NOT NULL, PRIMARY KEY (conto_id, mese));",
    "CREATE TABLE movimenti (id VARCHAR(80) PRIMARY KEY, data CHAR(10) NOT NULL, tipo VARCHAR(20) NOT NULL, descrizione VARCHAR(200) NOT NULL,"
      + " importo_centesimi BIGINT NOT NULL, categoria_id VARCHAR(80), sottocategoria VARCHAR(100), conto_id VARCHAR(80), conto_destinazione_id VARCHAR(80),"
      + " debito_id VARCHAR(80), capitale_centesimi BIGINT, interessi_centesimi BIGINT, note TEXT, tag TEXT);",
  ];
  for (const record of records) {
    lines.push(`INSERT INTO voci VALUES (${sqlText(record.kind)}, ${sqlText(record.id)}, ${sqlText(record.version)}, ${sqlText(JSON.stringify(record.value))});`);
  }
  for (const { id, value } of ledger.accounts) {
    lines.push(`INSERT INTO conti VALUES (${sqlText(id)}, ${sqlText(value.name)}, ${sqlText(value.type)}, ${value.archived ? 1 : 0});`);
  }
  for (const { id, value } of ledger.labels) {
    lines.push(`INSERT INTO categorie VALUES (${sqlText(id)}, ${sqlText(value.name)}, ${sqlText(value.type)});`);
  }
  for (const { value } of ledger.balances) {
    lines.push(`INSERT INTO saldi VALUES (${sqlText(value.accountId)}, ${sqlText(value.month)}, ${sqlNumber(value.amount)});`);
  }
  for (const { id, value } of ledger.movements) {
    lines.push(`INSERT INTO movimenti VALUES (${[
      sqlText(id), sqlText(value.date), sqlText(value.type), sqlText(value.title), sqlNumber(value.amount),
      sqlText(value.type === "transfer" ? null : value.labelId), sqlText(value.type === "expense" ? value.subcategory : null),
      sqlText(value.accountId), sqlText(value.type === "transfer" ? value.toAccountId : null), sqlText(value.type === "repayment" ? value.debtId : null),
      sqlNumber(value.type === "repayment" ? value.principal : null), sqlNumber(value.type === "repayment" ? value.interest : null),
      sqlText(value.notes), sqlText((value.tags ?? []).join(", ")),
    ].join(", ")});`);
  }
  return lines.join("\n") + "\n";
}

// ---------------------------------------------------------------- Archivio completo

export function backupFileName(date: string, encrypted: boolean) {
  return `${BACKUP_PREFIX}${date}${encrypted ? ".etbackup" : ".zip"}`;
}

/**
 * L'archivio .zip completo. `records` sono le voci salvate (anche gli anni archiviati, che restano in "archive");
 * `ledger` serve per i fogli leggibili (con gli anni archiviati già espansi).
 */
export function buildBackupZip(records: LedgerRecord[], ledger: Ledger, now = new Date()): Uint8Array {
  const exportedAt = now.toISOString();
  const counts = {
    Movimenti: ledger.movements.length, Saldi: ledger.balances.length, Conti: ledger.accounts.length, Categorie: ledger.labels.length,
    Ricorrenti: ledger.recurring.length, Familiari: ledger.people.length, Scadenze: ledger.deadlines.length, "Voci totali": records.length,
  };
  const entries: ZipEntry[] = [
    textEntry("LEGGIMI.md", readmeText(exportedAt.slice(0, 10), counts)),
    textEntry("dati/backup.json", backupJson(records, exportedAt)),
    textEntry("dati/schema.json", schemaJson()),
    ...Object.entries(tables(ledger)).map(([name, text]) => textEntry(`fogli/${name}`, text)),
    textEntry("database/dati.sql", sqlDump(ledger, records)),
  ];
  return createZip(entries, now);
}
