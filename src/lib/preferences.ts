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
