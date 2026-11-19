// Preferenze del singolo dispositivo/browser (non sincronizzate) e accesso all'aspetto sincronizzato.
import type { WidgetKey } from "./appearance";
import { getAppearance, resetAppearance, updateAppearance } from "./theme-runtime";

const OFFLINE_KEY = "et-offline";
const CLEAR_CACHE_KEY = "et-clear-cache";

function local() {
  try { return window.localStorage; } catch { return null; }
}

/** Chiavi delle funzioni rimosse (uso offline, sblocco con impronta, sincronizzazione completa). */
const LEGACY_KEYS = [OFFLINE_KEY, CLEAR_CACHE_KEY, "et-lock"];
const LEGACY_PREFIXES = ["et-full-sync:"];

/** true se questo browser ha ancora una copia locale dell'archivio (versioni con "Uso offline") da cancellare. */
export function legacyCachePending() {
  const store = local();
  return store?.getItem(OFFLINE_KEY) === "1" || store?.getItem(CLEAR_CACHE_KEY) === "1";
}

/**
 * Toglie le preferenze delle funzioni rimosse. Con `cacheCleared` false restano i segnali
 * della copia locale, così la cancellazione si riprova alla prossima apertura.
 */
export function removeLegacyPrefs(cacheCleared: boolean) {
  const store = local();
  if (!store) return;
  const keep = cacheCleared ? [] : [OFFLINE_KEY, CLEAR_CACHE_KEY];
  try {
    for (const key of Object.keys(store)) {
      if (keep.includes(key)) continue;
      if (LEGACY_KEYS.includes(key) || LEGACY_PREFIXES.some((prefix) => key.startsWith(prefix))) store.removeItem(key);
    }
  } catch {}
}

// ---------------------------------------------------------------- Personalizzazione (dalla 2.2 è nell'aspetto sincronizzato)

export type StartScreen = "overview" | "movements" | "accounts" | "reports" | "quick";
export type LookPrefs = { start: StartScreen; discreet: boolean; reminders: boolean };

const LAST_BACKUP_KEY = "et-last-backup";
const DISMISS_PREFIX = "et-dismiss:";

export function readLook(): LookPrefs {
  const { start, discreet, reminders } = getAppearance().behavior;
  return { start, discreet, reminders };
}

export function markBackup() {
  try { local()?.setItem(LAST_BACKUP_KEY, new Date().toISOString().slice(0, 10)); } catch {}
}

export function lastBackup() {
  return local()?.getItem(LAST_BACKUP_KEY) ?? null;
}

/** Un promemoria nascosto con "Più tardi" ricompare dopo `days` giorni. */
export function isDismissed(key: string, today: string, days = 7) {
  const when = local()?.getItem(DISMISS_PREFIX + key);
  if (!when) return false;
  return (Date.parse(today) - Date.parse(when)) / 86_400_000 < days;
}

export function dismiss(key: string, today: string) {
  try { local()?.setItem(DISMISS_PREFIX + key, today); } catch {}
}

// ---------------------------------------------------------------- Panoramica a scelta

export const OVERVIEW_WIDGETS: Record<WidgetKey, string> = {
  stats: "Riepilogo del periodo",
  flow: "Flusso di cassa",
  spending: "Spese per categoria",
  recent: "Movimenti recenti",
  accounts: "Patrimonio",
  budgets: "Budget",
  forecast: "Prossimi 30 giorni",
  goals: "Obiettivi",
  insights: "Segnalazioni",
  favorites: "Preferiti",
};
export type { WidgetKey };
export type WidgetPref = { key: WidgetKey; on: boolean };

export function readWidgets(): WidgetPref[] {
  return getAppearance().behavior.widgets.map((item) => ({ ...item }));
}

export function saveWidgets(list: WidgetPref[]) {
  updateAppearance((appearance) => ({ ...appearance, behavior: { ...appearance.behavior, widgets: list } }));
}

// ---------------------------------------------------------------- Filtri salvati del registro

export type SavedFilter = {
  name: string; query: string; type: string; label: string; tag: string; account: string;
  min: string; max: string; from: string; to: string; everywhere: boolean;
};
const FILTERS_KEY = "et-filters";

export function readFilters(): SavedFilter[] {
  try {
    const list = JSON.parse(local()?.getItem(FILTERS_KEY) ?? "[]");
    return Array.isArray(list) ? list.filter((item) => item && typeof item.name === "string").slice(0, 20) : [];
  } catch {
    return [];
  }
}

export function saveFilters(list: SavedFilter[]) {
  try { local()?.setItem(FILTERS_KEY, JSON.stringify(list.slice(0, 20))); } catch {}
}

/** "Ricomincia da zero": azzera aspetto, filtri e promemoria di questo dispositivo. */
export function resetDevicePrefs() {
  const store = local();
  if (!store) return;
  for (const key of Object.keys(store)) {
    if (["et-look", "et-overview", "et-theme", LAST_BACKUP_KEY, FILTERS_KEY].includes(key) || key.startsWith(DISMISS_PREFIX)) store.removeItem(key);
  }
  resetAppearance();
}
