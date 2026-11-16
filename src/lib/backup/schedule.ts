import type { Ledger, LedgerRecord } from "../ledger";
import { backupFileName, buildBackupZip } from "./export";
import { encryptBackup } from "./crypto";
import { folderSupported } from "./folder";

/*
 * Preferenze dei backup automatici, per questo dispositivo (non sincronizzate).
 * Il backup automatico parte all'apertura dell'app quando è "scaduto": l'app chiusa non può fare nulla.
 * La password resta solo in questo browser: serve a cifrare i backup automatici.
 */

export type BackupFrequency = "daily" | "weekly" | "monthly" | "off";
export type BackupPrefs = { frequency: BackupFrequency; password: string; last: string | null };

const KEY = "et-backup-prefs";
const LEGACY_LAST = "et-last-backup";
// Segnale separato: se la password sparisce (dati del browser rovinati), i backup non partono in chiaro.
const ENCRYPTED_KEY = "et-backup-encrypted";
const DAYS: Record<Exclude<BackupFrequency, "off">, number> = { daily: 1, weekly: 7, monthly: 30 };

export const FREQUENCY_LABELS: Record<BackupFrequency, string> = { daily: "Ogni giorno", weekly: "Ogni settimana", monthly: "Ogni mese", off: "Disattivato" };

function storage() {
  try { return window.localStorage; } catch { return null; }
}

/** Predefinito: giornaliero dove la cartella permette di cancellare i vecchi backup (PC), settimanale altrove. */
export function defaultFrequency(): BackupFrequency {
  return folderSupported() ? "daily" : "weekly";
}

export function readBackupPrefs(): BackupPrefs {
  const store = storage();
  try {
    const saved = JSON.parse(store?.getItem(KEY) ?? "{}") as Partial<BackupPrefs>;
    const frequency = saved.frequency && saved.frequency in FREQUENCY_LABELS ? saved.frequency : defaultFrequency();
    return {
      frequency,
      password: typeof saved.password === "string" ? saved.password : "",
      last: typeof saved.last === "string" ? saved.last : store?.getItem(LEGACY_LAST) ?? null,
    };
  } catch {
    return { frequency: defaultFrequency(), password: "", last: null };
  }
}

/** `clearEncryption`: solo quando scegli esplicitamente di non cifrare più. */
export function saveBackupPrefs(prefs: BackupPrefs, clearEncryption = false) {
  try {
    if (prefs.password) storage()?.setItem(ENCRYPTED_KEY, "1");
    else if (clearEncryption) storage()?.removeItem(ENCRYPTED_KEY);
    storage()?.setItem(KEY, JSON.stringify(prefs));
    if (prefs.last) storage()?.setItem(LEGACY_LAST, prefs.last);
  } catch { /* preferenza facoltativa */ }
}

export function markBackupDone(today: string) {
  saveBackupPrefs({ ...readBackupPrefs(), last: today });
}

export function backupDue(prefs: BackupPrefs, today: string) {
  if (prefs.frequency === "off") return false;
  if (!prefs.last) return true;
  const days = (Date.parse(today) - Date.parse(prefs.last)) / 86_400_000;
  return days >= DAYS[prefs.frequency];
}

/** true se i backup dovrebbero essere cifrati ma la password non c'è più. */
export function passwordMissing(prefs: BackupPrefs) {
  try { return !prefs.password && storage()?.getItem(ENCRYPTED_KEY) === "1"; } catch { return false; }
}

/** Crea il file di backup (cifrato se c'è una password). */
export async function makeBackup(records: LedgerRecord[], ledger: Ledger, password: string, today: string) {
  if (passwordMissing({ frequency: "off", password, last: null })) {
    throw new Error("i backup erano cifrati ma la password non c’è più: reimpostala in Impostazioni → Backup (o rimuovi la cifratura).");
  }
  const zip = buildBackupZip(records, ledger);
  const encrypted = !!password;
  const data = encrypted ? await encryptBackup(zip, password) : zip;
  return { name: backupFileName(today, encrypted), data, encrypted };
}
