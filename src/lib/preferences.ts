// Preferenze del singolo dispositivo/browser (non sincronizzate).

const THEME_KEY = "et-theme";
const OFFLINE_KEY = "et-offline";
const CLEAR_CACHE_KEY = "et-clear-cache";

export type ThemeMode = "auto" | "light" | "dark";

function local() {
  try { return window.localStorage; } catch { return null; }
}

export function readTheme(): ThemeMode {
  const value = local()?.getItem(THEME_KEY);
  return value === "light" || value === "dark" ? value : "auto";
}

let mediaListener: (() => void) | null = null;

/** Applica il tema alla pagina e, in modalità automatica, segue le impostazioni del sistema. */
export function applyTheme(mode: ThemeMode) {
  const media = window.matchMedia?.("(prefers-color-scheme: dark)");
  const update = () => {
    const dark = mode === "dark" || (mode === "auto" && !!media?.matches);
    document.documentElement.classList.toggle("dark", dark);
    document.documentElement.classList.toggle("light", !dark);
    document.documentElement.style.colorScheme = dark ? "dark" : "light";
  };
  if (mediaListener) media?.removeEventListener("change", mediaListener);
  mediaListener = mode === "auto" ? update : null;
  if (mediaListener) media?.addEventListener("change", mediaListener);
  update();
}

export function saveTheme(mode: ThemeMode) {
  try { local()?.setItem(THEME_KEY, mode); } catch {}
  applyTheme(mode);
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

// ---------------------------------------------------------------- Personalizzazione (per dispositivo)

export type StartScreen = "overview" | "movements" | "accounts" | "reports" | "quick";
export type Density = "comfortable" | "compact";
export type TextSize = "normal" | "large";

export type LookPrefs = { start: StartScreen; discreet: boolean; density: Density; text: TextSize; reminders: boolean; accent: string; calm: boolean };

const LOOK_KEY = "et-look";
const LAST_BACKUP_KEY = "et-last-backup";
const DISMISS_PREFIX = "et-dismiss:";

const DEFAULT_LOOK: LookPrefs = { start: "overview", discreet: false, density: "comfortable", text: "normal", reminders: true, accent: "green", calm: false };
const ACCENT_KEYS = ["green", "blue", "indigo", "purple", "pink", "orange", "slate"];

export function readLook(): LookPrefs {
  try {
    const saved = JSON.parse(local()?.getItem(LOOK_KEY) ?? "{}") as Partial<LookPrefs>;
    return {
      start: ["overview", "movements", "accounts", "reports", "quick"].includes(saved.start as string) ? saved.start as StartScreen : DEFAULT_LOOK.start,
      discreet: saved.discreet === true,
      density: saved.density === "compact" ? "compact" : "comfortable",
      text: saved.text === "large" ? "large" : "normal",
      reminders: saved.reminders !== false,
      accent: ACCENT_KEYS.includes(saved.accent as string) ? saved.accent as string : "green",
      calm: saved.calm === true,
    };
  } catch {
    return { ...DEFAULT_LOOK };
  }
}

/** Densità e dimensione del testo diventano classi sulla pagina (vedi globals.css). */
export function applyLook(look: LookPrefs) {
  document.documentElement.classList.toggle("density-compact", look.density === "compact");
  document.documentElement.classList.toggle("text-large", look.text === "large");
  document.documentElement.classList.toggle("reduce-motion", look.calm);
  if (look.accent === "green") delete document.documentElement.dataset.accent;
  else document.documentElement.dataset.accent = look.accent;
}

export function saveLook(look: LookPrefs) {
  try { local()?.setItem(LOOK_KEY, JSON.stringify(look)); } catch {}
  applyLook(look);
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

export const OVERVIEW_WIDGETS = {
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
} as const;
export type WidgetKey = keyof typeof OVERVIEW_WIDGETS;
export type WidgetPref = { key: WidgetKey; on: boolean };

const OVERVIEW_KEY = "et-overview";
const DEFAULT_WIDGETS: WidgetPref[] = (["stats", "flow", "spending", "budgets", "forecast", "insights", "recent", "accounts", "goals", "favorites"] as WidgetKey[])
  .map((key) => ({ key, on: !["favorites"].includes(key) }));

export function readWidgets(): WidgetPref[] {
  try {
    const saved = JSON.parse(local()?.getItem(OVERVIEW_KEY) ?? "[]") as WidgetPref[];
    const known = saved.filter((item) => item && item.key in OVERVIEW_WIDGETS);
    // I riquadri nuovi (di versioni successive) si aggiungono in fondo, accesi.
    const missing = DEFAULT_WIDGETS.filter((item) => !known.some((saved) => saved.key === item.key));
    return known.length ? [...known.map(({ key, on }) => ({ key, on: on !== false })), ...missing] : DEFAULT_WIDGETS.map((item) => ({ ...item }));
  } catch {
    return DEFAULT_WIDGETS.map((item) => ({ ...item }));
  }
}

export function saveWidgets(list: WidgetPref[]) {
  try { local()?.setItem(OVERVIEW_KEY, JSON.stringify(list)); } catch {}
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

/** "Ricomincia da zero": azzera personalizzazione, Panoramica, filtri e promemoria di questo dispositivo. */
export function resetDevicePrefs() {
  const store = local();
  if (!store) return;
  for (const key of Object.keys(store)) {
    if ([LOOK_KEY, LAST_BACKUP_KEY, OVERVIEW_KEY, FILTERS_KEY].includes(key) || key.startsWith(DISMISS_PREFIX)) store.removeItem(key);
  }
  applyLook(readLook());
}
