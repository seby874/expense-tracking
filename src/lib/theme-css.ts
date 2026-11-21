// Dall'aspetto scelto alle variabili CSS e alle classi della pagina (funzione pura, senza DOM).
import type { Appearance } from "./appearance";
import { backgroundCss } from "./backgrounds";
import { FONTS } from "./fonts";
import { COLOR_TOKENS, mixHex, type Palette } from "./palettes";

const DENSITY = { airy: 1.25, comfortable: 1, compact: 0.78, dense: 0.62 } as const;
const WIDTH = { narrow: "1100px", normal: "1550px", wide: "1900px", full: "none" } as const;

function shadow(kind: Appearance["shape"]["shadow"]) {
  if (kind === "flat") return "none";
  if (kind === "strong") return "0 8px 22px color-mix(in srgb, var(--shadow-color) 16%, transparent), 0 1px 3px color-mix(in srgb, var(--shadow-color) 12%, transparent)";
  return "0 1px 2px color-mix(in srgb, var(--shadow-color) 6%, transparent)";
}

function colorVars(palette: Palette) {
  return COLOR_TOKENS.map((token) => `--${token}: ${palette[token]};`).join(" ");
}

/** Variabili non di colore, uguali in chiaro e scuro. */
export function shapeVars(appearance: Appearance): Record<string, string> {
  const { fonts, text, shape, background, brand } = appearance;
  return {
    "--font-body": FONTS[fonts.body].stack,
    "--font-heading": FONTS[fonts.heading].stack,
    "--font-number": FONTS[fonts.numbers].stack,
    "--text-scale": String(text.scale / 100),
    "--body-weight": String(text.weight),
    "--heading-delta": String(text.headingWeight),
    "--line-height": String(text.lineHeight / 100),
    "--tracking": `${text.tracking / 1000}em`,
    "--round": String(shape.round / 100),
    "--shadow": shadow(shape.shadow),
    "--density": String(DENSITY[shape.density]),
    "--content-width": WIDTH[shape.width],
    "--icon-stroke": String(shape.icons / 100),
    "--panel-alpha": `${background.kind === "theme" ? 100 : background.panelOpacity}%`,
    "--bg-dim": `${background.dim}%`,
    "--bg-blur": `${background.blur}px`,
    ...(brand.color ? { "--brand": brand.color } : {}),
  };
}

/** Testo del foglio di stile del tema: tavolozza chiara, scura e variabili comuni. */
export function themeCss(appearance: Appearance): string {
  const { light, dark } = appearance.theme;
  const shared = Object.entries(shapeVars(appearance)).map(([name, value]) => `${name}: ${value};`).join(" ");
  const backgroundLight = backgroundCss(appearance.background, light.bg);
  const backgroundDark = backgroundCss(appearance.background, dark.bg);
  // Al buio i colori dello sfondo si scuriscono verso il fondo del tema: niente bagliori e testi sempre leggibili.
  const darkBackground = !backgroundDark ? backgroundDark : backgroundCss({
    ...appearance.background, colors: appearance.background.colors.map((color) => mixHex(color, dark.bg, 0.35)),
  }, dark.bg);
  return [
    `html:root { color-scheme: light; ${colorVars(light)} ${shared}${backgroundLight ? ` --app-bg: ${backgroundLight};` : ""} }`,
    `html.dark:root { color-scheme: dark; ${colorVars(dark)}${darkBackground ? ` --app-bg: ${darkBackground};` : ""} }`,
  ].join("\n");
}

/** Classi sulla pagina per le scelte che cambiano la struttura (vedi theme.css). */
export function themeClasses(appearance: Appearance): string[] {
  const { layout, shape, access, charts, background, numbers } = appearance;
  return [
    `nav-${layout.nav}`, `titles-${layout.titles}`, layout.descriptions ? "" : "no-descriptions",
    shape.borders ? "" : "no-borders", shape.density === "compact" || shape.density === "dense" ? "density-compact" : "", `density-${shape.density}`,
    access.motion === "reduced" ? "motion-reduced" : "", access.motion === "none" ? "reduce-motion" : "",
    access.targets === "large" ? "targets-large" : "", access.focus === "strong" ? "focus-strong" : "",
    access.underline ? "links-underline" : "", access.symbols ? "type-symbols" : "",
    charts.grid ? "" : "charts-nogrid", charts.rounded ? "" : "charts-square",
    background.kind === "theme" ? "" : "bg-custom", background.kind !== "theme" && background.glass ? "bg-glass" : "",
    numbers.negative === "parens" ? "negative-parens" : "", numbers.negative === "red" ? "negative-red" : "",
  ].filter(Boolean);
}

/** Tutte le classi che il tema può mettere (per toglierle prima di applicarne di nuove). */
export const THEME_CLASS_PREFIXES = ["nav-", "titles-", "density-", "no-descriptions", "no-borders", "reduce-motion", "motion-reduced", "targets-large",
  "focus-strong", "links-underline", "type-symbols", "charts-nogrid", "charts-square", "bg-custom", "bg-glass", "negative-parens", "negative-red"];
