// Colori del tema: le variabili CSS, il tema «Bosco» (l'aspetto originale) e i temi ricavati da un colore base.

export const COLOR_TOKENS = [
  "bg", "surface", "subtle", "ink", "muted", "soft", "label", "line", "line-strong",
  "accent", "accent-hover", "accent-pale", "accent-solid", "on-accent",
  "good", "good-pale", "good-border", "warn", "warn-pale", "warn-border", "warn-solid",
  "danger", "danger-pale", "danger-solid", "repay", "repay-pale", "repay-border", "due-bg", "due-border",
  "income", "income-pale", "expense", "expense-pale", "transfer", "transfer-pale",
  "chart-income", "chart-expense", "chart-repaid", "chart-transfer",
  "sidebar", "sidebar-ink", "sidebar-muted", "sidebar-accent", "hero", "hero-ink", "shadow-color",
] as const;

export type ColorToken = (typeof COLOR_TOKENS)[number];
export type Palette = Record<ColorToken, string>;

/** Aspetto originale dell'app (2.0–2.1), chiaro. */
export const BOSCO_LIGHT: Palette = {
  bg: "#f5f7f6", surface: "#ffffff", subtle: "#f7faf8", ink: "#172b25", muted: "#5e7069", soft: "#627469", label: "#35564a",
  line: "#e0e8e3", "line-strong": "#d3dfd8", accent: "#106a56", "accent-hover": "#0c5646", "accent-pale": "#e5f3eb",
  "accent-solid": "#106a56", "on-accent": "#ffffff", good: "#146850", "good-pale": "#e6f4ec", "good-border": "#cfe7d9",
  warn: "#9a5a17", "warn-pale": "#fdf3e6", "warn-border": "#f0dcc0", "warn-solid": "#d98c2b", danger: "#c8463d",
  "danger-pale": "#fdf1f1", "danger-solid": "#aa383d", repay: "#6c5293", "repay-pale": "#f3effa", "repay-border": "#e2d9f2",
  "due-bg": "#fffcf6", "due-border": "#f0e2c8", income: "#146850", "income-pale": "#e2f3e9", expense: "#a14530",
  "expense-pale": "#fbede5", transfer: "#4b6585", "transfer-pale": "#e9eff8", "chart-income": "#228b75",
  "chart-expense": "#df9677", "chart-repaid": "#8d7fc2", "chart-transfer": "#7f93c0", sidebar: "#122a25",
  "sidebar-ink": "#e9f1ed", "sidebar-muted": "#9fb9af", "sidebar-accent": "#a7e8c7", hero: "#153e33", "hero-ink": "#ecf9f1",
  "shadow-color": "#132a24",
};

/** Aspetto originale dell'app, scuro. */
export const BOSCO_DARK: Palette = {
  bg: "#0d1613", surface: "#14201c", subtle: "#111c18", ink: "#e4eee9", muted: "#9fb3aa", soft: "#8ea39a", label: "#b6cbc1",
  line: "#22322c", "line-strong": "#2f433a", accent: "#5cd0a8", "accent-hover": "#86e0c0", "accent-pale": "#173a2f",
  "accent-solid": "#1b7d62", "on-accent": "#ffffff", good: "#6fd3ad", "good-pale": "#133429", "good-border": "#24503f",
  warn: "#f0b47a", "warn-pale": "#33251a", "warn-border": "#4d3824", "warn-solid": "#d98c2b", danger: "#f2a9a3",
  "danger-pale": "#2e1919", "danger-solid": "#b8474c", repay: "#c9b0f0", "repay-pale": "#221c33", "repay-border": "#382d52",
  "due-bg": "#1a1c15", "due-border": "#3d3622", income: "#6fd3ad", "income-pale": "#163a2e", expense: "#f0a283",
  "expense-pale": "#3b2419", transfer: "#a3bfe6", "transfer-pale": "#1c2a3d", "chart-income": "#228b75",
  "chart-expense": "#df9677", "chart-repaid": "#8d7fc2", "chart-transfer": "#7f93c0", sidebar: "#122a25",
  "sidebar-ink": "#e9f1ed", "sidebar-muted": "#9fb9af", "sidebar-accent": "#a7e8c7", hero: "#12342b", "hero-ink": "#ecf9f1",
  "shadow-color": "#000000",
};

// ---------------------------------------------------------------- Calcoli sui colori

export function hexToRgb(hex: string): [number, number, number] {
  const value = hex.replace("#", "");
  const full = value.length === 3 ? value.split("").map((char) => char + char).join("") : value.slice(0, 6);
  return [0, 2, 4].map((start) => parseInt(full.slice(start, start + 2), 16)) as [number, number, number];
}

export function rgbToHex([r, g, b]: [number, number, number]): string {
  return "#" + [r, g, b].map((value) => Math.max(0, Math.min(255, Math.round(value))).toString(16).padStart(2, "0")).join("");
}

/** Miscela due colori: share = quota del primo (0–1). */
export function mixHex(first: string, second: string, share: number): string {
  const a = hexToRgb(first);
  const b = hexToRgb(second);
  return rgbToHex([0, 1, 2].map((index) => a[index] * share + b[index] * (1 - share)) as [number, number, number]);
}

export function hexToHsl(hex: string): [number, number, number] {
  const [r, g, b] = hexToRgb(hex).map((value) => value / 255);
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const light = (max + min) / 2;
  if (max === min) return [0, 0, light * 100];
  const delta = max - min;
  const sat = light > 0.5 ? delta / (2 - max - min) : delta / (max + min);
  const hue = max === r ? (g - b) / delta + (g < b ? 6 : 0) : max === g ? (b - r) / delta + 2 : (r - g) / delta + 4;
  return [hue * 60, sat * 100, light * 100];
}

export function hslToHex(hue: number, sat: number, light: number): string {
  const s = Math.max(0, Math.min(100, sat)) / 100;
  const l = Math.max(0, Math.min(100, light)) / 100;
  const k = (n: number) => (n + hue / 30) % 12;
  const a = s * Math.min(l, 1 - l);
  const f = (n: number) => l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
  return rgbToHex([f(0) * 255, f(8) * 255, f(4) * 255]);
}

/** Luminanza relativa (WCAG). */
function luminance(hex: string): number {
  const [r, g, b] = hexToRgb(hex).map((value) => {
    const channel = value / 255;
    return channel <= 0.03928 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** Rapporto di contrasto WCAG tra due colori (1–21). */
export function contrast(first: string, second: string): number {
  const [light, dark] = [luminance(first), luminance(second)].sort((a, b) => b - a);
  return (light + 0.05) / (dark + 0.05);
}

/** Testo leggibile (nero o bianco) sopra un colore. */
export function readableOn(background: string): string {
  return contrast(background, "#ffffff") >= contrast(background, "#111111") ? "#ffffff" : "#111111";
}

export interface ContrastIssue { pair: string; ratio: number; minimum: number }

/** Coppie controllate: 4,5 per il testo normale, 3 per testi grandi, pulsanti e importi in grassetto. */
const CONTRAST_PAIRS: [ColorToken, ColorToken, string, number][] = [
  ["ink", "bg", "Testo sullo sfondo", 4.5], ["ink", "surface", "Testo nei riquadri", 4.5], ["muted", "surface", "Testo secondario", 3],
  ["accent", "surface", "Collegamenti e pulsanti testuali", 3], ["on-accent", "accent-solid", "Testo dei pulsanti principali", 3],
  ["sidebar-ink", "sidebar", "Testo del menu", 4.5], ["expense", "surface", "Importi delle spese", 3], ["income", "surface", "Importi delle entrate", 3],
];

export function contrastIssues(palette: Palette): ContrastIssue[] {
  return CONTRAST_PAIRS.flatMap(([text, background, pair, minimum]) => {
    const ratio = contrast(palette[text], palette[background]);
    return ratio < minimum ? [{ pair, ratio: Math.round(ratio * 10) / 10, minimum }] : [];
  });
}

// ---------------------------------------------------------------- Temi ricavati da un colore

/** Cambia il colore principale di una tavolozza e ricalcola le sue varianti. */
export function withAccent(palette: Palette, accent: string, dark: boolean): Palette {
  const [hue, sat, light] = hexToHsl(accent);
  // Pulsanti scuri abbastanza profondi da reggere il testo bianco (contrasto 4,5).
  const solid = dark ? hslToHex(hue, Math.min(sat, 70), 30) : accent;
  const text = dark ? hslToHex(hue, Math.min(sat + 5, 70), 62) : accent;
  return {
    ...palette, accent: text, "accent-solid": solid,
    "accent-hover": dark ? hslToHex(hue, Math.min(sat + 5, 70), 72) : hslToHex(hue, sat, Math.max(light - 7, 10)),
    "accent-pale": mixHex(text, palette.surface, dark ? 0.16 : 0.1), "on-accent": readableOn(solid),
  };
}

export interface ThemeSeed {
  /** Colore principale. */
  accent: string;
  /** Tinta dei grigi (0–360) e quanto sono colorati (0–100). */
  hue: number;
  tint: number;
  /** Colore del menu laterale. */
  sidebar: string;
}

/** Tavolozza chiara e scura completa a partire da pochi colori; stati e grafici restano quelli originali. */
export function paletteFromSeed(seed: ThemeSeed): { light: Palette; dark: Palette } {
  const { hue } = seed;
  const t = seed.tint / 100;
  const [sideHue] = hexToHsl(seed.sidebar);
  const [accentHue, accentSat] = hexToHsl(seed.accent);
  const side = {
    sidebar: seed.sidebar, "sidebar-ink": hslToHex(sideHue, 18 * t + 4, 93), "sidebar-muted": hslToHex(sideHue, 14 * t + 4, 70),
    "sidebar-accent": hslToHex(accentHue, Math.min(accentSat, 65), 80),
  };
  const light: Palette = withAccent({
    ...BOSCO_LIGHT, ...side,
    bg: hslToHex(hue, 14 * t, 96.5), surface: "#ffffff", subtle: hslToHex(hue, 22 * t, 98), ink: hslToHex(hue, 32 * t, 13),
    muted: hslToHex(hue, 10 * t, 40), soft: hslToHex(hue, 8 * t, 42), label: hslToHex(hue, 24 * t, 27),
    line: hslToHex(hue, 18 * t, 89), "line-strong": hslToHex(hue, 18 * t, 85), hero: hslToHex(accentHue, Math.min(accentSat, 55), 17),
    "hero-ink": hslToHex(accentHue, 30, 95), "shadow-color": hslToHex(hue, 30 * t, 12),
  }, seed.accent, false);
  const dark: Palette = withAccent({
    ...BOSCO_DARK, ...side,
    bg: hslToHex(hue, 26 * t, 6.5), surface: hslToHex(hue, 22 * t, 10), subtle: hslToHex(hue, 24 * t, 8.5), ink: hslToHex(hue, 20 * t, 92),
    muted: hslToHex(hue, 12 * t, 66), soft: hslToHex(hue, 10 * t, 59), label: hslToHex(hue, 16 * t, 76),
    line: hslToHex(hue, 18 * t, 16), "line-strong": hslToHex(hue, 18 * t, 22), hero: hslToHex(accentHue, Math.min(accentSat, 50), 14),
    "hero-ink": hslToHex(accentHue, 30, 95),
  }, seed.accent, true);
  return { light, dark };
}

// ---------------------------------------------------------------- Temi pronti

export interface ThemePreset { id: string; name: string; light: Palette; dark: Palette; mode?: "light" | "dark" }

const monoLight: Palette = paletteFromSeed({ accent: "#3a3f44", hue: 210, tint: 0, sidebar: "#1d2023" }).light;
const amoledDark: Palette = {
  ...paletteFromSeed({ accent: "#5cd0a8", hue: 160, tint: 0, sidebar: "#000000" }).dark,
  bg: "#000000", surface: "#0a0a0a", subtle: "#050505", line: "#1d1d1d", "line-strong": "#2a2a2a", hero: "#0d1f19", sidebar: "#000000",
};

const contrastLight: Palette = {
  ...BOSCO_LIGHT, bg: "#ffffff", surface: "#ffffff", subtle: "#f2f2f2", ink: "#000000", muted: "#1f1f1f", soft: "#2b2b2b", label: "#000000",
  line: "#6b6b6b", "line-strong": "#3d3d3d", accent: "#0040b8", "accent-hover": "#002f87", "accent-pale": "#e3ebfb", "accent-solid": "#0040b8",
  "on-accent": "#ffffff", income: "#00632f", expense: "#a30000", transfer: "#003f8a", sidebar: "#000000", "sidebar-ink": "#ffffff",
  "sidebar-muted": "#e6e6e6", "sidebar-accent": "#ffd400", hero: "#000000", "hero-ink": "#ffffff",
};
const contrastDark: Palette = {
  ...BOSCO_DARK, bg: "#000000", surface: "#000000", subtle: "#0f0f0f", ink: "#ffffff", muted: "#e6e6e6", soft: "#d4d4d4", label: "#ffffff",
  line: "#9a9a9a", "line-strong": "#c4c4c4", accent: "#ffd400", "accent-hover": "#ffe566", "accent-pale": "#2b2500", "accent-solid": "#ffd400",
  "on-accent": "#000000", income: "#7dffb0", expense: "#ff9d8a", transfer: "#9fc5ff", sidebar: "#000000", "sidebar-ink": "#ffffff",
  "sidebar-muted": "#e6e6e6", "sidebar-accent": "#ffd400", hero: "#000000", "hero-ink": "#ffffff",
};

export const THEME_PRESETS: ThemePreset[] = [
  { id: "bosco", name: "Bosco", light: BOSCO_LIGHT, dark: BOSCO_DARK },
  { id: "oceano", name: "Oceano", ...paletteFromSeed({ accent: "#1c6aa3", hue: 205, tint: 60, sidebar: "#0f2436" }) },
  { id: "sabbia", name: "Sabbia", ...paletteFromSeed({ accent: "#a3592a", hue: 35, tint: 70, sidebar: "#2e2219" }) },
  { id: "lavanda", name: "Lavanda", ...paletteFromSeed({ accent: "#6d4fb3", hue: 265, tint: 45, sidebar: "#211a33" }) },
  { id: "notte", name: "Notte", ...paletteFromSeed({ accent: "#4a55c4", hue: 230, tint: 55, sidebar: "#141a33" }), mode: "dark" },
  { id: "amoled", name: "Nero AMOLED", light: monoLight, dark: amoledDark, mode: "dark" },
  { id: "mono", name: "Monocromo", light: monoLight, dark: paletteFromSeed({ accent: "#c9ced4", hue: 210, tint: 0, sidebar: "#111214" }).dark },
  { id: "contrasto", name: "Alto contrasto", light: contrastLight, dark: contrastDark },
];

/** Colori principali rapidi (quelli della 2.0 più qualcuno). */
export const ACCENT_CHOICES: [string, string][] = [
  ["#106a56", "Verde"], ["#2f5fb8", "Blu"], ["#4a48b5", "Indaco"], ["#7a45a8", "Viola"], ["#b23d73", "Rosa"], ["#b9581f", "Arancio"],
  ["#4b6470", "Ardesia"], ["#0f7f8c", "Petrolio"], ["#a0353d", "Rosso"], ["#7a6a14", "Oliva"],
];
