// Aspetto dell'app: un unico oggetto sincronizzato tra i dispositivi (documento "setting:look").
// Ogni sezione si legge separatamente: un valore sconosciuto o rovinato ricade sul predefinito senza perdere il resto.
import { z } from "zod";
import { BOSCO_DARK, BOSCO_LIGHT, COLOR_TOKENS, THEME_PRESETS, type Palette } from "./palettes";

export const SECTION_KEYS = ["overview", "movements", "accounts", "reports", "calendar", "deadlines", "settings"] as const;
export type SectionKey = (typeof SECTION_KEYS)[number];

export const WIDGET_KEYS = ["stats", "flow", "spending", "budgets", "forecast", "insights", "recent", "accounts", "goals", "favorites"] as const;
export type WidgetKey = (typeof WIDGET_KEYS)[number];

export const FONT_IDS = [
  "inter", "system", "roboto", "open-sans", "lato", "montserrat", "poppins", "nunito", "source-sans", "arial",
  "times", "georgia", "merriweather", "lora", "playfair", "courier", "jetbrains", "atkinson",
] as const;
export type FontId = (typeof FONT_IDS)[number];

export const PATTERNS = ["dots", "lines", "grid", "paper", "waves"] as const;
export const SCENES = ["mountains", "sea", "dunes", "hills", "forest", "aurora", "waves", "topo", "bokeh", "geometric", "stars", "sunset"] as const;
export const BRAND_ICONS = ["chart", "wallet", "piggy", "coins", "leaf", "home", "star", "heart"] as const;

const hex = z.string().regex(/^#[0-9a-fA-F]{6}$/);
const time = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/);
const int = (min: number, max: number) => z.number().int().min(min).max(max);
const palette = z.object(Object.fromEntries(COLOR_TOKENS.map((token) => [token, hex])) as Record<(typeof COLOR_TOKENS)[number], typeof hex>);

/** Ogni sezione dell'aspetto: schema e valore predefinito (= l'aspetto della 2.1). */
const SECTIONS = {
  theme: {
    schema: z.object({ id: z.string().max(40), light: palette, dark: palette }),
    value: { id: "bosco", light: BOSCO_LIGHT, dark: BOSCO_DARK },
  },
  mode: {
    schema: z.object({ kind: z.enum(["auto", "light", "dark", "schedule"]), light: time, dark: time }),
    value: { kind: "auto" as const, light: "07:00", dark: "20:00" },
  },
  fonts: {
    schema: z.object({ body: z.enum(FONT_IDS), heading: z.enum(FONT_IDS), numbers: z.enum(FONT_IDS) }),
    value: { body: "inter" as FontId, heading: "inter" as FontId, numbers: "inter" as FontId },
  },
  text: {
    // scale in %, lineHeight in centesimi (150 = 1,5), tracking in millesimi di em, headingWeight = differenza dal peso normale.
    schema: z.object({ scale: int(80, 150), weight: int(300, 600), headingWeight: int(-300, 150), lineHeight: int(125, 190), tracking: int(-30, 80) }),
    value: { scale: 100, weight: 400, headingWeight: 0, lineHeight: 150, tracking: 0 },
  },
  shape: {
    schema: z.object({
      round: int(0, 200), shadow: z.enum(["flat", "soft", "strong"]), borders: z.boolean(),
      density: z.enum(["airy", "comfortable", "compact", "dense"]), width: z.enum(["narrow", "normal", "wide", "full"]), icons: int(100, 275),
    }),
    value: { round: 100, shadow: "soft" as const, borders: true, density: "comfortable" as const, width: "normal" as const, icons: 200 },
  },
  background: {
    schema: z.object({
      kind: z.enum(["theme", "solid", "gradient", "mesh", "pattern", "scene"]), colors: z.array(hex).min(1).max(3), angle: int(0, 360),
      radial: z.boolean(), pattern: z.enum(PATTERNS), scene: z.enum(SCENES), intensity: int(0, 100), dim: int(0, 85), blur: int(0, 24),
      glass: z.boolean(), panelOpacity: int(55, 100),
    }),
    value: {
      kind: "theme" as const, colors: ["#a7d8c4", "#3f8f74", "#e9f6f0"], angle: 160, radial: false, pattern: "dots" as const, scene: "mountains" as const,
      intensity: 40, dim: 0, blur: 0, glass: false, panelOpacity: 100,
    },
  },
  layout: {
    schema: z.object({
      nav: z.enum(["left", "right", "top", "icons"]), order: z.array(z.enum(SECTION_KEYS)).max(7), hidden: z.array(z.enum(SECTION_KEYS)).max(6),
      bar: z.array(z.enum(SECTION_KEYS)).max(4), titles: z.enum(["large", "compact", "hidden"]), descriptions: z.boolean(),
      columns: int(1, 3), wide: z.array(z.enum(WIDGET_KEYS)).max(10),
    }),
    value: {
      nav: "left" as const, order: [...SECTION_KEYS] as SectionKey[], hidden: [] as SectionKey[], bar: ["overview", "movements", "accounts", "reports"] as SectionKey[],
      titles: "large" as const, descriptions: true, columns: 2, wide: ["stats"] as WidgetKey[],
    },
  },
  numbers: {
    schema: z.object({
      cents: z.boolean(), negative: z.enum(["minus", "parens", "red"]), compact: z.boolean(), date: z.enum(["numeric", "short", "iso"]),
      weekStart: z.enum(["monday", "sunday"]),
    }),
    value: { cents: true, negative: "minus" as const, compact: true, date: "numeric" as const, weekStart: "monday" as const },
  },
  charts: {
    schema: z.object({ palette: z.enum(["default", "vivid", "pastel", "colorblind"]), spending: z.enum(["donut", "bars"]), grid: z.boolean(), rounded: z.boolean() }),
    value: { palette: "default" as const, spending: "donut" as const, grid: true, rounded: true },
  },
  access: {
    schema: z.object({
      motion: z.enum(["full", "reduced", "none"]), targets: z.enum(["normal", "large"]), focus: z.enum(["normal", "strong"]),
      underline: z.boolean(), symbols: z.boolean(),
    }),
    value: { motion: "full" as const, targets: "normal" as const, focus: "normal" as const, underline: false, symbols: false },
  },
  brand: {
    schema: z.object({ name: z.string().trim().min(1).max(30), color: hex.nullable(), icon: z.enum(BRAND_ICONS) }),
    value: { name: "Expense Tracking", color: null as string | null, icon: "chart" as const },
  },
  behavior: {
    schema: z.object({
      start: z.enum(["overview", "movements", "accounts", "reports", "quick"]), discreet: z.boolean(), reminders: z.boolean(),
      widgets: z.array(z.object({ key: z.enum(WIDGET_KEYS), on: z.boolean() })).max(10),
    }),
    value: {
      start: "overview" as const, discreet: false, reminders: true,
      widgets: WIDGET_KEYS.map((key) => ({ key, on: key !== "favorites" })) as { key: WidgetKey; on: boolean }[],
    },
  },
};

type SectionName = keyof typeof SECTIONS;
export type Appearance = { [K in SectionName]: z.infer<(typeof SECTIONS)[K]["schema"]> };

export const DEFAULT_APPEARANCE: Appearance = Object.fromEntries(
  Object.entries(SECTIONS).map(([name, section]) => [name, structuredClone(section.value)]),
) as Appearance;

/** Legge un aspetto salvato (anche parziale o di versioni diverse): ogni sezione non valida torna al predefinito. */
export function normalizeAppearance(raw: unknown): Appearance {
  const source = raw && typeof raw === "object" ? raw as Record<string, unknown> : {};
  const result = {} as Record<string, unknown>;
  for (const [name, section] of Object.entries(SECTIONS)) {
    const saved = source[name];
    const merged = saved && typeof saved === "object" && !Array.isArray(saved) ? { ...section.value, ...saved as object } : section.value;
    const parsed = section.schema.safeParse(merged);
    result[name] = parsed.success ? parsed.data : structuredClone(section.value);
  }
  return fixLists(result as Appearance);
}

/** Elenchi coerenti: ogni sezione e ogni riquadro una volta sola, quelli nuovi in fondo. */
function fixLists(appearance: Appearance): Appearance {
  const unique = <T,>(list: T[]) => [...new Set(list)];
  const order = unique([...appearance.layout.order, ...SECTION_KEYS]);
  const hidden: SectionKey[] = unique(appearance.layout.hidden).filter((key) => key !== "overview" && key !== "settings");
  const known = appearance.behavior.widgets.filter((item, index, list) => list.findIndex((other) => other.key === item.key) === index);
  const widgets = [...known, ...DEFAULT_APPEARANCE.behavior.widgets.filter((item) => !known.some((saved) => saved.key === item.key))];
  return {
    ...appearance,
    layout: { ...appearance.layout, order, hidden, bar: unique(appearance.layout.bar).filter((key) => !hidden.includes(key)) },
    behavior: { ...appearance.behavior, widgets },
  };
}

export function presetById(id: string) {
  return THEME_PRESETS.find((preset) => preset.id === id);
}

/** Applica un tema pronto: copia le sue tavolozze; se il tema è pensato per il buio cambia anche la modalità. */
export function applyPreset(appearance: Appearance, id: string): Appearance {
  const preset = presetById(id);
  if (!preset) return appearance;
  return {
    ...appearance,
    theme: { id: preset.id, light: { ...preset.light }, dark: { ...preset.dark } },
    mode: preset.mode ? { ...appearance.mode, kind: preset.mode } : appearance.mode,
  };
}

/** Cambia un colore di una delle due tavolozze: il tema diventa «personalizzato». */
export function setColor(appearance: Appearance, dark: boolean, token: keyof Palette, value: string): Appearance {
  const side = dark ? "dark" : "light";
  return { ...appearance, theme: { ...appearance.theme, id: "custom", [side]: { ...appearance.theme[side], [token]: value } } };
}

/** Ripristina una sola sezione al valore predefinito. */
export function resetSection<K extends SectionName>(appearance: Appearance, name: K): Appearance {
  return { ...appearance, [name]: structuredClone(DEFAULT_APPEARANCE[name]) };
}

/** Modo chiaro/scuro effettivo in un certo momento. */
export function resolveDark(mode: Appearance["mode"], systemDark: boolean, now: Date): boolean {
  if (mode.kind === "dark") return true;
  if (mode.kind === "light") return false;
  if (mode.kind === "auto") return systemDark;
  const minutes = now.getHours() * 60 + now.getMinutes();
  const [lightAt, darkAt] = [mode.light, mode.dark].map((value) => Number(value.slice(0, 2)) * 60 + Number(value.slice(3)));
  // Scuro dall'ora «dark» all'ora «light» (anche a cavallo della mezzanotte).
  return lightAt < darkAt ? minutes >= darkAt || minutes < lightAt : minutes >= darkAt && minutes < lightAt;
}

// ---------------------------------------------------------------- Dalle preferenze per dispositivo della 2.x

const OLD_ACCENTS: Record<string, string> = {
  blue: "#2f5fb8", indigo: "#4a48b5", purple: "#7a45a8", pink: "#b23d73", orange: "#b9581f", slate: "#4b6470",
};

export interface LegacyPrefs {
  theme?: string | null;
  look?: Record<string, unknown> | null;
  widgets?: unknown;
}

/** Prima apertura con la 2.2: le scelte salvate sul dispositivo diventano il primo aspetto sincronizzato. */
export function fromLegacy(legacy: LegacyPrefs, accentPalette: (palette: Palette, accent: string, dark: boolean) => Palette): Appearance {
  const look = legacy.look ?? {};
  let appearance = structuredClone(DEFAULT_APPEARANCE);
  if (legacy.theme === "light" || legacy.theme === "dark") appearance.mode = { ...appearance.mode, kind: legacy.theme };
  const accent = OLD_ACCENTS[String(look.accent)];
  if (accent) {
    appearance = { ...appearance, theme: { id: "custom", light: accentPalette(BOSCO_LIGHT, accent, false), dark: accentPalette(BOSCO_DARK, accent, true) } };
  }
  if (look.density === "compact") appearance.shape = { ...appearance.shape, density: "compact" };
  if (look.text === "large") appearance.text = { ...appearance.text, scale: 112 };
  if (look.calm === true) appearance.access = { ...appearance.access, motion: "reduced" };
  appearance.behavior = {
    ...appearance.behavior,
    start: ["overview", "movements", "accounts", "reports", "quick"].includes(String(look.start)) ? look.start as Appearance["behavior"]["start"] : "overview",
    discreet: look.discreet === true, reminders: look.reminders !== false,
    widgets: Array.isArray(legacy.widgets) ? legacy.widgets as Appearance["behavior"]["widgets"] : appearance.behavior.widgets,
  };
  return normalizeAppearance(appearance);
}
