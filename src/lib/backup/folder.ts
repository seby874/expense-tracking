import { BACKUP_PREFIX } from "./export";

/*
 * Salvataggio automatico in una cartella del PC (Chrome/Edge desktop: File System Access API).
 * Scegliendo una cartella dentro "Google Drive" (Drive per desktop) il backup arriva anche su Drive.
 * La cartella scelta si ricorda in IndexedDB; il browser può chiedere di nuovo il permesso.
 * Rotazione: ultimi 7 giorni + 4 settimane + 12 mesi; gli altri backup dell'app nella cartella si cancellano.
 */

type PermissionMode = { mode: "readwrite" };
type DirectoryHandle = FileSystemDirectoryHandle & {
  queryPermission(options: PermissionMode): Promise<PermissionState>;
  requestPermission(options: PermissionMode): Promise<PermissionState>;
  values(): AsyncIterableIterator<FileSystemHandle>;
};
type PickerWindow = Window & { showDirectoryPicker?: (options?: { id?: string; mode?: "readwrite" }) => Promise<DirectoryHandle> };

const DB_NAME = "et-backup";
const STORE = "handles";
const KEY = "folder";

export function folderSupported() {
  return typeof window !== "undefined" && typeof (window as PickerWindow).showDirectoryPicker === "function";
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => request.result.createObjectStore(STORE);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function withStore<T>(mode: IDBTransactionMode, run: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const db = await openDb();
  try {
    return await new Promise<T>((resolve, reject) => {
      const request = run(db.transaction(STORE, mode).objectStore(STORE));
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  } finally {
    db.close();
  }
}

export async function savedFolder(): Promise<DirectoryHandle | null> {
  if (!folderSupported()) return null;
  try { return (await withStore<DirectoryHandle | undefined>("readonly", (store) => store.get(KEY))) ?? null; } catch { return null; }
}

/** Chiede all'utente la cartella (serve un clic). */
export async function chooseFolder(): Promise<DirectoryHandle> {
  const picker = (window as PickerWindow).showDirectoryPicker;
  if (!picker) throw new Error("Questo browser non permette di scegliere una cartella: usa Chrome o Edge su PC.");
  const handle = await picker({ id: "et-backup", mode: "readwrite" });
  await withStore("readwrite", (store) => store.put(handle, KEY));
  return handle;
}

export async function forgetFolder() {
  try { await withStore("readwrite", (store) => store.delete(KEY)); } catch { /* niente da dimenticare */ }
}

/** "granted" se si può scrivere senza chiedere; "prompt" se serve un clic per riautorizzare. */
export async function folderPermission(handle: DirectoryHandle, ask = false): Promise<PermissionState> {
  const options: PermissionMode = { mode: "readwrite" };
  const state = await handle.queryPermission(options);
  if (state === "granted" || !ask) return state;
  return handle.requestPermission(options);
}

const NAME_PATTERN = new RegExp(`^${BACKUP_PREFIX}(\\d{4}-\\d{2}-\\d{2})\\.(zip|etbackup)$`);

function isoWeek(date: string) {
  const day = new Date(date + "T12:00:00Z");
  const weekday = (day.getUTCDay() + 6) % 7;
  day.setUTCDate(day.getUTCDate() - weekday + 3);
  const firstThursday = new Date(Date.UTC(day.getUTCFullYear(), 0, 4));
  const week = 1 + Math.round(((day.getTime() - firstThursday.getTime()) / 86_400_000 - 3 + ((firstThursday.getUTCDay() + 6) % 7)) / 7);
  return `${day.getUTCFullYear()}-W${week}`;
}

/** Quali backup tenere: unione di ultimi `days` giorni, ultime `weeks` settimane e ultimi `months` mesi (il più recente di ciascuno). */
export function rotationKeep(dates: string[], days = 7, weeks = 4, months = 12): Set<string> {
  const sorted = [...new Set(dates)].sort().reverse();
  const keep = new Set(sorted.slice(0, days));
  const pick = (key: (date: string) => string, count: number) => {
    const seen = new Set<string>();
    for (const date of sorted) {
      const group = key(date);
      if (seen.has(group)) continue;
      seen.add(group);
      if (seen.size > count) break;
      keep.add(date);
    }
  };
  pick(isoWeek, weeks);
  pick((date) => date.slice(0, 7), months);
  return keep;
}

/** Scrive il backup nella cartella e applica la rotazione. Restituisce i file eliminati. */
export async function writeToFolder(handle: DirectoryHandle, name: string, data: Uint8Array): Promise<number> {
  const file = await handle.getFileHandle(name, { create: true });
  const writable = await file.createWritable();
  await writable.write(data as BufferSource);
  await writable.close();

  const found: { name: string; date: string }[] = [];
  for await (const entry of handle.values()) {
    const match = entry.kind === "file" ? NAME_PATTERN.exec(entry.name) : null;
    if (match) found.push({ name: entry.name, date: match[1] });
  }
  const keep = rotationKeep(found.map((item) => item.date));
  let removed = 0;
  for (const item of found) {
    if (keep.has(item.date) || item.name === name) continue;
    try { await handle.removeEntry(item.name); removed++; } catch { /* un file bloccato non ferma gli altri */ }
  }
  return removed;
}
