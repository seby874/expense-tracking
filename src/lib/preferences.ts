// Preferenze del singolo dispositivo/browser (non sincronizzate).

const THEME_KEY = "et-theme";
const OFFLINE_KEY = "et-offline";
const CLEAR_CACHE_KEY = "et-clear-cache";
const NOTICE_KEY = "et-auth-notice";

export type ThemeMode = "auto" | "light" | "dark";

function local() {
  try { return window.localStorage; } catch { return null; }
}

function session() {
  try { return window.sessionStorage; } catch { return null; }
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

export function readOffline() {
  return local()?.getItem(OFFLINE_KEY) === "1";
}

export function saveOffline(enabled: boolean) {
  try {
    if (enabled) local()?.setItem(OFFLINE_KEY, "1");
    else {
      local()?.removeItem(OFFLINE_KEY);
      local()?.setItem(CLEAR_CACHE_KEY, "1");
    }
  } catch {}
}

export function requestCacheClear() {
  try { local()?.setItem(CLEAR_CACHE_KEY, "1"); } catch {}
}

export function takeCacheClear() {
  const store = local();
  const pending = store?.getItem(CLEAR_CACHE_KEY) === "1";
  try { store?.removeItem(CLEAR_CACHE_KEY); } catch {}
  return pending;
}

/** Messaggio da mostrare nella schermata di accesso dopo un ricaricamento. */
export function setNoticeAfterReload(text: string) {
  try { session()?.setItem(NOTICE_KEY, text); } catch {}
}

export function takeNoticeAfterReload() {
  const store = session();
  const text = store?.getItem(NOTICE_KEY) ?? "";
  try { store?.removeItem(NOTICE_KEY); } catch {}
  return text;
}

// ---------------------------------------------------------------- Personalizzazione (per dispositivo)

export type StartScreen = "overview" | "movements" | "accounts" | "reports" | "quick";
export type Density = "comfortable" | "compact";
export type TextSize = "normal" | "large";

export type LookPrefs = { start: StartScreen; discreet: boolean; density: Density; text: TextSize; reminders: boolean };

const LOOK_KEY = "et-look";
const LAST_BACKUP_KEY = "et-last-backup";
const DISMISS_PREFIX = "et-dismiss:";

const DEFAULT_LOOK: LookPrefs = { start: "overview", discreet: false, density: "comfortable", text: "normal", reminders: true };

export function readLook(): LookPrefs {
  try {
    const saved = JSON.parse(local()?.getItem(LOOK_KEY) ?? "{}") as Partial<LookPrefs>;
    return {
      start: ["overview", "movements", "accounts", "reports", "quick"].includes(saved.start as string) ? saved.start as StartScreen : DEFAULT_LOOK.start,
      discreet: saved.discreet === true,
      density: saved.density === "compact" ? "compact" : "comfortable",
      text: saved.text === "large" ? "large" : "normal",
      reminders: saved.reminders !== false,
    };
  } catch {
    return { ...DEFAULT_LOOK };
  }
}

/** Densità e dimensione del testo diventano classi sulla pagina (vedi globals.css). */
export function applyLook(look: LookPrefs) {
  document.documentElement.classList.toggle("density-compact", look.density === "compact");
  document.documentElement.classList.toggle("text-large", look.text === "large");
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
