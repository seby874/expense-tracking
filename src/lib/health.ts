import { accountBalances, balanceGaps, money, shiftMonth, type Account, type Ledger } from "./ledger";
import { dueItems } from "./recurring";
import { estimateReads, archivableYears } from "./archive";
import { fundStatus } from "./fund";
import { fixedOverview } from "./fixed";
import { moduleOn, paramsFor } from "./params";
import { dependentShare, personName } from "./people";
import { deadlineState } from "./deadlines";
import { pendingRefunds, REFUND_LATE_DAYS } from "./refunds";
import { debtStatus } from "./debts";
import { backupDue, type BackupPrefs } from "./backup/schedule";

/*
 * Controllo di salute dell'archivio (una volta al mese): backup, letture Firestore, dati non validi,
 * saldi, riconciliazione, ricorrenti, doppioni, debiti, fondo, abbonamenti, parametri, familiari, cestino.
 */

export type HealthLevel = "ok" | "warn" | "bad";
export type HealthAction = "backup" | "archive" | "balance" | "movements" | "settings" | "fund" | "fixed" | "deadlines" | "params";

export type HealthCheck = { id: string; level: HealthLevel; title: string; detail?: string; action?: HealthAction; account?: Account };

export type HealthInput = {
  documents: number;
  invalid: number;
  trash: { count: number; oldestDays: number | null };
  backup: BackupPrefs;
  opensPerDay?: number;
};

function normal(text: string) {
  return text.trim().toLocaleLowerCase("it").replace(/\s+/g, " ");
}

export function healthChecks(ledger: Ledger, today: string, input: HealthInput): HealthCheck[] {
  const checks: HealthCheck[] = [];
  const month = today.slice(0, 7);
  const year = Number(today.slice(0, 4));
  const add = (check: HealthCheck) => checks.push(check);

  // Backup
  add(backupDue(input.backup, today)
    ? { id: "backup", level: input.backup.last ? "warn" : "bad", title: input.backup.last ? `Backup in ritardo: l’ultimo è del ${input.backup.last.split("-").reverse().join("/")}` : "Nessun backup ancora fatto", action: "backup" }
    : { id: "backup", level: "ok", title: `Backup: ultimo il ${input.backup.last?.split("-").reverse().join("/") ?? "—"}` });

  // Letture Firestore
  const reads = estimateReads(input.documents, input.opensPerDay ?? 5);
  const archivable = archivableYears(ledger, today);
  add({
    id: "reads", level: reads.share >= 0.8 ? "bad" : reads.share >= 0.5 ? "warn" : "ok",
    title: `Letture Firestore: ${input.documents.toLocaleString("it-IT")} documenti, ~${reads.perDay.toLocaleString("it-IT")} letture al giorno (${Math.round(reads.share * 100)}% del gratuito)`,
    detail: reads.share >= 0.5 && archivable.length ? `Archivia ${archivable.map((item) => item.year).join(", ")} per leggere meno.` : undefined,
    action: reads.share >= 0.5 ? "archive" : undefined,
  });

  // Voci non valide
  const invalid = input.invalid + ledger.invalidArchived;
  add(invalid
    ? { id: "invalid", level: "bad", title: `${invalid} ${invalid === 1 ? "voce non valida è ignorata" : "voci non valide sono ignorate"} dall’app`, detail: "Di solito sono state modificate a mano nella console Firebase. Ripristina un backup recente o correggile nella console." }
    : { id: "invalid", level: "ok", title: "Tutte le voci sono valide" });

  // Saldi non aggiornati
  const stale = accountBalances(ledger, month).filter(({ account, snapshot }) =>
    (account.value.type === "cash" || account.value.type === "asset") && !account.value.archived
    && (!snapshot || snapshot.value.month < shiftMonth(month, -3)));
  for (const { account, snapshot } of stale.slice(0, 3)) {
    add({ id: `balance-${account.id}`, level: "warn", title: `${account.value.name}: ${snapshot ? `nessun saldo da ${snapshot.value.month.split("-").reverse().join("/")}` : "nessun saldo registrato"}`, action: "balance", account });
  }
  if (!stale.length) add({ id: "balances", level: "ok", title: "Saldi dei conti aggiornati" });

  // Riconciliazione
  const gaps = balanceGaps(ledger, 3).filter((gap) => gap.month >= shiftMonth(month, -3));
  add(gaps.length
    ? { id: "gaps", level: "warn", title: `${gaps.length} ${gaps.length === 1 ? "saldo non torna" : "saldi non tornano"} con i movimenti degli ultimi 3 mesi`, action: "movements" }
    : { id: "gaps", level: "ok", title: "Riconciliazione: nessuno scarto negli ultimi 3 mesi" });

  // Ricorrenti arretrati
  const late = dueItems(ledger, today).filter((item) => item.date < shiftMonth(month, -1) + "-01" || item.backlog > 0);
  add(late.length
    ? { id: "recurring", level: "warn", title: `${late.length} ${late.length === 1 ? "ricorrente ha" : "ricorrenti hanno"} scadenze arretrate`, action: "movements" }
    : { id: "recurring", level: "ok", title: "Ricorrenti: nessuna scadenza arretrata" });

  // Possibili doppioni (stessa data, importo e descrizione)
  const seen = new Map<string, number>();
  for (const { value } of ledger.movements) {
    if (value.date < shiftMonth(month, -3)) continue;
    const key = `${value.date}|${value.amount}|${normal(value.title)}|${value.type}`;
    seen.set(key, (seen.get(key) ?? 0) + 1);
  }
  const duplicates = [...seen.values()].filter((count) => count > 1).length;
  add(duplicates
    ? { id: "duplicates", level: "warn", title: `${duplicates} ${duplicates === 1 ? "possibile doppione" : "possibili doppioni"} negli ultimi 3 mesi (stessa data, importo e descrizione)`, action: "movements" }
    : { id: "duplicates", level: "ok", title: "Possibili doppioni: nessuno" });

  // Debiti: fine prevista passata ma residuo ancora positivo
  for (const debt of ledger.accounts.filter((account) => account.value.type === "debt" && !account.value.archived)) {
    const status = debtStatus(ledger, debt, month);
    if (status.endDate && status.endDate < today && (status.residual ?? 0) > 0) {
      add({ id: `debt-${debt.id}`, level: "warn", title: `${debt.value.name}: la fine prevista è passata ma il residuo è ${money(status.residual)}`, detail: "Correggi il residuo o il piano del finanziamento.", account: debt, action: "balance" });
    }
  }

  // Fondo di emergenza
  if (moduleOn(ledger.settings, "fund")) {
    const fund = fundStatus(ledger, today);
    if (fund.monthsCovered !== null) {
      add({ id: "fund", level: fund.monthsCovered >= fund.settings.targetMonths ? "ok" : fund.monthsCovered >= fund.settings.targetMonths / 2 ? "warn" : "bad",
        title: `Fondo di emergenza: ${fund.monthsCovered.toLocaleString("it-IT", { maximumFractionDigits: 1 })} mesi (obiettivo ${fund.settings.targetMonths})`, action: "fund" });
    }
    for (const bank of fund.banks.filter((item) => item.over)) add({ id: `bank-${bank.bank}`, level: "warn", title: `Oltre la garanzia dei depositi presso «${bank.bank}»`, action: "fund" });
    for (const account of ledger.accounts) {
      for (const line of account.value.deposit?.lines ?? []) {
        const days = (Date.parse(line.end) - Date.parse(today)) / 86_400_000;
        if (!line.closed && days >= 0 && days <= 30) add({ id: `line-${line.id}`, level: "warn", title: `${account.value.name}: un vincolo scade il ${line.end.split("-").reverse().join("/")}`, detail: "Decidi se rinnovarlo o lasciarlo libero.", action: "fund" });
      }
    }
  }

  // Abbonamenti
  if (moduleOn(ledger.settings, "fixed")) {
    const alerts = fixedOverview(ledger, today).items.filter((item) => item.alert);
    add(alerts.length
      ? { id: "fixed", level: "warn", title: `Abbonamenti: ${alerts.map((item) => `${item.recurring.value.template.title} (${(item.alert ?? "").replace(/\.$/, "").replace(/^\w/, (letter) => letter.toLowerCase())})`).join("; ")}`, action: "fixed" }
      : { id: "fixed", level: "ok", title: "Abbonamenti: nessun aumento di prezzo né disdetta in scadenza" });
  }

  // Parametri e familiari dell'anno
  const params = paramsFor(ledger, year);
  if (!params.record?.value.confirmed) add({ id: "params", level: "warn", title: `Parametri di legge e bancari ${year} da confermare`, detail: "Ritenuta, bollo, detrazioni: controllali e premi «Conferma».", action: "params" });
  else add({ id: "params", level: "ok", title: `Parametri ${year} confermati` });
  if (moduleOn(ledger.settings, "tax") && moduleOn(ledger.settings, "people")) {
    const missing = ledger.people.filter((person) => !person.value.dependent.some((item) => item.year === year) && dependentShare(person, year - 1) > 0);
    if (missing.length) add({ id: "people", level: "warn", title: `Familiari a carico ${year} da confermare: ${missing.map(personName).join(", ")}`, action: "settings" });
  }

  // Scadenze e rimborsi
  const overdue = ledger.deadlines.filter((item) => deadlineState(item, today) === "overdue");
  if (overdue.length) add({ id: "deadlines", level: "bad", title: `${overdue.length} ${overdue.length === 1 ? "scadenza superata" : "scadenze superate"}: ${overdue.map((item) => item.value.title).slice(0, 3).join(", ")}`, action: "deadlines" });
  const lateRefunds = pendingRefunds(ledger, today).filter((item) => item.days > REFUND_LATE_DAYS);
  if (lateRefunds.length) add({ id: "refunds", level: "warn", title: `${lateRefunds.length} ${lateRefunds.length === 1 ? "rimborso atteso" : "rimborsi attesi"} da più di ${REFUND_LATE_DAYS} giorni`, action: "movements" });

  // Cestino
  add({ id: "trash", level: "ok", title: input.trash.count
    ? `Cestino: ${input.trash.count} ${input.trash.count === 1 ? "voce" : "voci"}${input.trash.oldestDays !== null ? `, la più vecchia sparisce tra ${input.trash.oldestDays} giorni` : ""}`
    : "Cestino vuoto" });

  const order: Record<HealthLevel, number> = { bad: 0, warn: 1, ok: 2 };
  return checks.sort((a, b) => order[a.level] - order[b.level]);
}

// ---------------------------------------------------------------- Quando mostrarlo

const SEEN_KEY = "et-health-seen";
const SNOOZE_KEY = "et-health-snooze";

/** Da mostrare in Panoramica alla prima apertura del mese (salvo "ricordamelo tra 7 giorni"). */
export function healthDue(today: string) {
  try {
    const store = window.localStorage;
    if (store.getItem(SEEN_KEY) === today.slice(0, 7)) return false;
    const snooze = store.getItem(SNOOZE_KEY);
    return !snooze || snooze <= today;
  } catch {
    return false;
  }
}

export function markHealthSeen(today: string) {
  try { window.localStorage.setItem(SEEN_KEY, today.slice(0, 7)); window.localStorage.removeItem(SNOOZE_KEY); } catch { /* facoltativo */ }
}

export function snoozeHealth(today: string, days = 7) {
  try { window.localStorage.setItem(SNOOZE_KEY, new Date(Date.parse(today) + days * 86_400_000).toISOString().slice(0, 10)); } catch { /* facoltativo */ }
}
