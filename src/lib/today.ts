// «Da fare oggi»: tutto ciò che chiede un'azione, in un unico elenco (ricorrenti, scadenze, saldi, report, promemoria).
import type { Account, Deadline, Ledger } from "./ledger";
import { daysUntil, deadlineState } from "./deadlines";
import type { DueItem } from "./recurring";

export type TodayTone = "bad" | "warn" | "info";

export type TodayTask =
  | { kind: "recurring"; key: string; tone: TodayTone; item: DueItem }
  | { kind: "deadline"; key: string; tone: TodayTone; deadline: Deadline; days: number }
  | { kind: "balances"; key: string; tone: TodayTone; month: string; accounts: Account[] }
  | { kind: "report"; key: string; tone: TodayTone; year: number }
  | { kind: "idle"; key: string; tone: TodayTone; days: number }
  | { kind: "backup"; key: string; tone: TodayTone; age: number | null };

export interface TodayOptions {
  /** Ricorrenti arrivati a scadenza (lib/recurring → dueItems). */
  due: DueItem[];
  /** Backup automatico attivo: il suo avviso basta, niente promemoria qui. */
  backupScheduled: boolean;
  /** Ultimo backup scaricato da questo dispositivo (AAAA-MM-GG). */
  lastBackup: string | null;
  /** Anno del report già visto ("" = nessuno). */
  reportSeen: string;
  /** Promemoria accesi in Impostazioni → Aspetto. */
  reminders: boolean;
}

const QUIET_DAYS = 4;
const BALANCE_DAYS = 10;
const BACKUP_DAYS = 30;
const MIN_MOVEMENTS_FOR_BACKUP = 20;

function daysBetween(from: string, to: string) {
  return Math.floor((Date.parse(to) - Date.parse(from)) / 86_400_000);
}

function previousMonth(today: string) {
  const [year, month] = today.split("-").map(Number);
  return new Date(Date.UTC(year, month - 2, 1)).toISOString().slice(0, 7);
}

/** Conti di liquidità che hanno già una storia di saldi ma non quello di fine `month`. */
export function missingBalances(ledger: Ledger, month: string) {
  return ledger.accounts.filter((account) => (account.value.type === "cash" || account.value.type === "asset") && !account.value.archived
    && ledger.balances.some(({ value }) => value.accountId === account.id && value.month < month)
    && !ledger.balances.some(({ value }) => value.accountId === account.id && value.month === month));
}

export function todayTasks(ledger: Ledger, today: string, options: TodayOptions): TodayTask[] {
  const tasks: TodayTask[] = [];

  for (const item of options.due) {
    tasks.push({ kind: "recurring", key: `recurring-${item.recurring.id}`, tone: item.date < today ? "bad" : "warn", item });
  }

  for (const deadline of ledger.deadlines) {
    const state = deadlineState(deadline, today);
    if (state !== "overdue" && state !== "soon") continue;
    const days = daysUntil(deadline.value.date, today);
    tasks.push({ kind: "deadline", key: `deadline-${deadline.id}`, tone: days <= 0 ? "bad" : days <= 7 ? "warn" : "info", deadline, days });
  }

  const lastYear = Number(today.slice(0, 4)) - 1;
  if (today.slice(5, 7) === "01" && options.reportSeen !== String(lastYear) && ledger.movements.some(({ value }) => value.date.startsWith(String(lastYear)))) {
    tasks.push({ kind: "report", key: `report-${lastYear}`, tone: "info", year: lastYear });
  }

  if (options.reminders) {
    const month = previousMonth(today);
    const missing = Number(today.slice(8, 10)) <= BALANCE_DAYS ? missingBalances(ledger, month) : [];
    if (missing.length) tasks.push({ kind: "balances", key: `balances-${month}`, tone: "warn", month, accounts: missing });

    const last = ledger.movements.find(({ value }) => value.date <= today)?.value.date;
    const quiet = last ? daysBetween(last, today) : 0;
    if (quiet >= QUIET_DAYS) tasks.push({ kind: "idle", key: "idle", tone: "info", days: quiet });

    if (!options.backupScheduled && ledger.movements.length >= MIN_MOVEMENTS_FOR_BACKUP) {
      const age = options.lastBackup ? daysBetween(options.lastBackup, today) : null;
      if (age === null || age > BACKUP_DAYS) tasks.push({ kind: "backup", key: "backup", tone: "info", age });
    }
  }

  // Prima le cose superate, poi quelle di oggi, poi il resto; a parità, l'ordine sopra.
  const rank: Record<TodayTone, number> = { bad: 0, warn: 1, info: 2 };
  return tasks.map((task, index) => ({ task, index })).sort((a, b) => rank[a.task.tone] - rank[b.task.tone] || a.index - b.index).map(({ task }) => task);
}
