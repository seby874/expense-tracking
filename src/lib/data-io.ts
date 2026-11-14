import {
  ENTRY_TYPES, INTEREST_LABEL, deriveLedger, isDefaultId, newId, parseMoney, recordSchema, sameName, subcategoryList,
  type Account, type Balance, type Label, type Ledger, type LedgerRecord, type Movement, type Mutation,
} from "./ledger";

// ---------------------------------------------------------------- Esportazione

export const MOVEMENT_HEADER = ["Data", "Tipo", "Descrizione", "Importo EUR", "Categoria o fonte", "Sottocategoria", "Conto", "Conto di destinazione", "Metodo di pagamento", "Note", "Tag"];
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
        csvCell(value.accountId ? accounts.get(value.accountId) ?? "" : ""), csvCell(""), csvCell(""), csvCell(value.notes), csvCell((value.tags ?? []).join(", ")),
      ];
    }
    // Spesa divisa: nel CSV resta una riga, le parti finiscono nelle note (il backup .json le conserva tutte).
    const parts = value.type === "expense" && value.parts
      ? ` [Divisa: ${value.parts.map((part) => `${part.creditId ? `credito ${accounts.get(part.creditId) ?? ""}` : labels.get(part.labelId ?? "") ?? ""} ${csvNumber(part.amount)}`).join(" · ")}]`
      : "";
    return [
      value.date, csvCell(ENTRY_TYPES[value.type]), csvCell(value.title),
      csvNumber(value.type === "expense" ? -value.amount : value.amount),
      csvCell(value.type !== "transfer" ? labels.get(value.labelId) ?? "" : ""),
      csvCell(value.type === "expense" ? value.subcategory : ""),
      csvCell(value.accountId ? accounts.get(value.accountId) ?? "" : ""),
      csvCell(value.type === "transfer" ? accounts.get(value.toAccountId) ?? "" : ""),
      csvCell(value.type === "expense" ? value.method : ""), csvCell((value.notes + parts).trim()), csvCell((value.tags ?? []).join(", ")),
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

// ---------------------------------------------------------------- Ripristino del backup

export type RestorePlan = {
  mutations: Mutation[];
  restored: number;
  unchanged: number;
  invalid: number;
  error: string;
};

/** JSON con le chiavi in ordine alfabetico, per confrontare voci uguali scritte in ordine diverso. */
function stableJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.keys(value).filter((key) => (value as Record<string, unknown>)[key] !== undefined).sort()
      .map((key) => `${JSON.stringify(key)}:${stableJson((value as Record<string, unknown>)[key])}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

/** Legge un backup .json e prepara le scritture senza eseguirle: nulla viene cancellato. */
export function planRestore(text: string, records: LedgerRecord[]): RestorePlan {
  const plan: RestorePlan = { mutations: [], restored: 0, unchanged: 0, invalid: 0, error: "" };
  let data: unknown;
  try { data = JSON.parse(text); } catch { plan.error = "Il file non è un JSON leggibile."; return plan; }
  const list = typeof data === "object" && data !== null && (data as { format?: unknown }).format === BACKUP_FORMAT
    ? (data as { records?: unknown }).records : null;
  if (!Array.isArray(list)) { plan.error = "Il file non è un backup di Expense Tracking."; return plan; }
  const current = new Map(records.map((record) => [`${record.kind}:${record.id}`, record]));
  for (const item of list) {
    const parsed = recordSchema.safeParse(item);
    if (!parsed.success) { plan.invalid++; continue; }
    const record = parsed.data;
    const existing = current.get(`${record.kind}:${record.id}`);
    if (existing && stableJson(existing.value) === stableJson(record.value)) { plan.unchanged++; continue; }
    plan.restored++;
    plan.mutations.push({ op: "save", record: { ...record, version: existing?.version ?? null } });
  }
  return plan;
}

export function isDefaultRecord(record: Account | Label) {
  return isDefaultId(record.kind, record.id);
}
