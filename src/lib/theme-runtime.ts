// Aspetto attivo: lo applica alla pagina, lo tiene in copia sul dispositivo (prima apertura veloce)
// e lo passa a chi lo salva su Firestore (LedgerApp), così è uguale su tutti i dispositivi.
import { DEFAULT_APPEARANCE, fromLegacy, normalizeAppearance, resolveDark, type Appearance } from "./appearance";
import { registerFont } from "./fonts";
import { setDisplayFormat } from "./ledger";
import { withAccent } from "./palettes";
import { THEME_CLASS_PREFIXES, themeClasses, themeCss } from "./theme-css";

const CACHE_KEY = "et-appearance";
const RESET_PARAM = "aspetto";
const STYLE_ID = "et-theme";

type Listener = (appearance: Appearance) => void;

let current: Appearance = DEFAULT_APPEARANCE;
let pendingReset = false;
/** C'è una modifica di questo dispositivo non ancora salvata: finché c'è, l'aspetto online non la sovrascrive. */
let dirty = false;
const listeners = new Set<Listener>();
const formatters = new Set<Listener>();
let syncHandler: (() => void) | null = null;
let syncTimer: ReturnType<typeof setTimeout> | null = null;
let clockTimer: ReturnType<typeof setInterval> | null = null;
let mediaListener: (() => void) | null = null;

function storage() {
  try { return window.localStorage; } catch { return null; }
}

function readJson(key: string): unknown {
  try { return JSON.parse(storage()?.getItem(key) ?? "null"); } catch { return null; }
}

/** Aspetto all'avvio: copia del dispositivo, altrimenti le vecchie preferenze per dispositivo (2.1), altrimenti il predefinito. */
function initial(): Appearance {
  const cached = readJson(CACHE_KEY);
  if (cached) return normalizeAppearance(cached);
  const look = readJson("et-look") as Record<string, unknown> | null;
  const theme = storage()?.getItem("et-theme") ?? null;
  if (!look && !theme) return DEFAULT_APPEARANCE;
  return fromLegacy({ look, theme, widgets: readJson("et-overview") }, withAccent);
}

function cache(appearance: Appearance) {
  try { storage()?.setItem(CACHE_KEY, JSON.stringify(appearance)); } catch { /* facoltativo */ }
}

function applyDark(appearance: Appearance) {
  const media = window.matchMedia?.("(prefers-color-scheme: dark)");
  const update = () => {
    const dark = resolveDark(appearance.mode, !!media?.matches, new Date());
    const root = document.documentElement;
    if (root.classList.contains("dark") === dark && root.classList.contains("light") === !dark) return;
    root.classList.toggle("dark", dark);
    root.classList.toggle("light", !dark);
    root.style.colorScheme = dark ? "dark" : "light";
  };
  if (mediaListener) media?.removeEventListener("change", mediaListener);
  if (clockTimer) clearInterval(clockTimer);
  mediaListener = appearance.mode.kind === "auto" ? update : null;
  if (mediaListener) media?.addEventListener("change", mediaListener);
  // Con gli orari si ricontrolla ogni minuto.
  clockTimer = appearance.mode.kind === "schedule" ? setInterval(update, 60_000) : null;
  update();
}

/** Applica l'aspetto alla pagina: foglio di stile, classi, chiaro/scuro, font. */
function apply(appearance: Appearance) {
  let style = document.getElementById(STYLE_ID);
  if (!style) {
    style = document.createElement("style");
    style.id = STYLE_ID;
    document.head.appendChild(style);
  }
  style.textContent = themeCss(appearance);
  const root = document.documentElement;
  for (const name of [...root.classList]) if (THEME_CLASS_PREFIXES.some((prefix) => name.startsWith(prefix))) root.classList.remove(name);
  root.classList.add(...themeClasses(appearance));
  for (const id of new Set([appearance.fonts.body, appearance.fonts.heading, appearance.fonts.numbers])) registerFont(id);
  applyDark(appearance);
  setDisplayFormat(appearance);
  for (const formatter of formatters) formatter(appearance);
}

/** Da chiamare una volta all'avvio, prima di disegnare l'app. */
export function startAppearance(): Appearance {
  const params = new URLSearchParams(window.location.search);
  if (params.has(RESET_PARAM)) {
    // ?aspetto=reset: via d'uscita se l'app è diventata illeggibile.
    pendingReset = true;
    params.delete(RESET_PARAM);
    const query = params.toString();
    window.history.replaceState(null, "", window.location.pathname + (query ? `?${query}` : "") + window.location.hash);
    current = DEFAULT_APPEARANCE;
    cache(current);
  } else {
    current = initial();
  }
  apply(current);
  return current;
}

export function getAppearance(): Appearance {
  return current;
}

/** Cambia l'aspetto: si vede subito, resta sul dispositivo e si salva online dopo una breve pausa. */
export function updateAppearance(change: Appearance | ((appearance: Appearance) => Appearance)) {
  current = normalizeAppearance(typeof change === "function" ? change(current) : change);
  apply(current);
  cache(current);
  for (const listener of listeners) listener(current);
  dirty = true;
  if (syncTimer) clearTimeout(syncTimer);
  syncTimer = setTimeout(() => { syncTimer = null; syncHandler?.(); }, 900);
}

/** Il salvataggio online è riuscito: da ora l'aspetto online torna a valere. */
export function appearanceSaved() {
  dirty = false;
}

/** Aspetto arrivato da Firestore (altro dispositivo o prima lettura). */
export function receiveAppearance(raw: unknown | null) {
  if (pendingReset) {
    // ?aspetto=reset: l'aspetto originale va scritto online subito, prima che torni quello vecchio.
    pendingReset = false;
    dirty = true;
    syncHandler?.();
    return;
  }
  // Nessun aspetto online ancora: si pubblica quello di questo dispositivo (anche quello portato dalla 2.1).
  if (raw === null) {
    if (JSON.stringify(current) !== JSON.stringify(DEFAULT_APPEARANCE)) { dirty = true; syncHandler?.(); }
    return;
  }
  // Una modifica di questo dispositivo deve ancora essere salvata: vince quella.
  if (dirty || syncTimer) return;
  const next = normalizeAppearance(raw);
  if (JSON.stringify(next) === JSON.stringify(current)) return;
  current = next;
  apply(current);
  cache(current);
  for (const listener of listeners) listener(current);
}

export function setAppearanceSync(handler: (() => void) | null) {
  syncHandler = handler;
}

export function subscribeAppearance(listener: Listener): () => void {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}

/** Funzioni che leggono l'aspetto quando cambia (formati di numeri e date, colori dei grafici). */
export function onAppearanceApplied(formatter: Listener) {
  formatters.add(formatter);
  formatter(current);
}

/** "Ricomincia da zero" su questo dispositivo: torna l'aspetto predefinito. */
export function resetAppearance() {
  updateAppearance(DEFAULT_APPEARANCE);
}
