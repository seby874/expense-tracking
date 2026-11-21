/// <reference types="node" />
import { readFileSync } from "node:fs";
import { afterEach, describe, expect, it } from "vitest";
import { DEFAULT_APPEARANCE, applyPreset, fromLegacy, normalizeAppearance, resolveDark, setColor } from "../appearance";
import { categoryColor, money, setDisplayFormat, shortDate } from "../ledger";
import { BOSCO_DARK, BOSCO_LIGHT, COLOR_TOKENS, THEME_PRESETS, contrast, contrastIssues, withAccent } from "../palettes";
import { themeClasses, themeCss } from "../theme-css";
import { backgroundCss } from "../backgrounds";
import { boardSegments } from "../../app/board";

describe("normalizeAppearance", () => {
  it("returns the original look for missing or broken data", () => {
    expect(normalizeAppearance(null)).toEqual(DEFAULT_APPEARANCE);
    expect(normalizeAppearance({ text: { scale: 9999 }, fonts: "nope" })).toEqual(DEFAULT_APPEARANCE);
  });

  it("keeps valid sections and repairs only the broken ones", () => {
    const result = normalizeAppearance({ text: { scale: 120 }, shape: { round: -5 } });
    expect(result.text.scale).toBe(120);
    expect(result.shape).toEqual(DEFAULT_APPEARANCE.shape);
  });

  it("adds sections and overview panels introduced later, without duplicates", () => {
    const result = normalizeAppearance({ layout: { ...DEFAULT_APPEARANCE.layout, order: ["reports", "reports"] }, behavior: { ...DEFAULT_APPEARANCE.behavior, widgets: [{ key: "flow", on: false }] } });
    expect(result.layout.order[0]).toBe("reports");
    expect(new Set(result.layout.order).size).toBe(result.layout.order.length);
    expect(result.layout.order).toHaveLength(7);
    expect(result.behavior.widgets[0]).toEqual({ key: "flow", on: false });
    expect(result.behavior.widgets).toHaveLength(10);
  });

  it("never hides Panoramica or Impostazioni", () => {
    expect(normalizeAppearance({ layout: { ...DEFAULT_APPEARANCE.layout, hidden: ["overview", "settings", "calendar"] } }).layout.hidden).toEqual(["calendar"]);
  });
});

describe("themes", () => {
  it("every preset defines every color in both modes", () => {
    for (const preset of THEME_PRESETS) {
      for (const palette of [preset.light, preset.dark]) {
        for (const token of COLOR_TOKENS) expect(palette[token], `${preset.id} ${token}`).toMatch(/^#[0-9a-f]{6}$/);
      }
    }
  });

  it("main text stays readable in every preset", () => {
    for (const preset of THEME_PRESETS) {
      for (const palette of [preset.light, preset.dark]) {
        expect(contrast(palette.ink, palette.surface), preset.id).toBeGreaterThanOrEqual(4.5);
        expect(contrast(palette["sidebar-ink"], palette.sidebar), preset.id).toBeGreaterThanOrEqual(4.5);
      }
    }
  });

  it("every preset passes the contrast check in both modes", () => {
    for (const preset of THEME_PRESETS) {
      expect(contrastIssues(preset.light), `${preset.id} chiaro`).toEqual([]);
      expect(contrastIssues(preset.dark), `${preset.id} scuro`).toEqual([]);
    }
  });

  it("flags unreadable custom colors", () => {
    const unreadable = setColor(DEFAULT_APPEARANCE, false, "ink", "#f0f0f0");
    expect(contrastIssues(unreadable.theme.light).map((issue) => issue.pair)).toContain("Testo nei riquadri");
    expect(unreadable.theme.id).toBe("custom");
  });

  it("dark-only presets switch the mode", () => {
    expect(applyPreset(DEFAULT_APPEARANCE, "amoled").mode.kind).toBe("dark");
    expect(applyPreset(DEFAULT_APPEARANCE, "oceano").mode.kind).toBe("auto");
  });

  it("an accent change keeps the button text readable", () => {
    const palette = withAccent(BOSCO_LIGHT, "#ffd400", false);
    expect(contrast(palette["on-accent"], palette["accent-solid"])).toBeGreaterThanOrEqual(3);
  });

  it("the stylesheet defaults are the Bosco palettes", () => {
    const themeStylesheet = readFileSync(new URL("../../app/theme.css", import.meta.url), "utf8");
    for (const token of COLOR_TOKENS) {
      expect(themeStylesheet, token).toContain(`--${token}: ${BOSCO_LIGHT[token]};`);
      expect(themeStylesheet, token).toContain(`--${token}: ${BOSCO_DARK[token]};`);
    }
  });
});

describe("theme stylesheet and classes", () => {
  it("writes light and dark colors and the shared variables", () => {
    const css = themeCss(applyPreset(DEFAULT_APPEARANCE, "oceano"));
    expect(css).toMatch(/^html:root \{ color-scheme: light; --bg: #/);
    expect(css).toContain("html.dark:root { color-scheme: dark;");
    expect(css).toContain("--text-scale: 1;");
    expect(css).not.toContain("--app-bg");
  });

  it("adds a background only when one is chosen", () => {
    const appearance = { ...DEFAULT_APPEARANCE, background: { ...DEFAULT_APPEARANCE.background, kind: "scene" as const } };
    expect(themeCss(appearance)).toContain("--app-bg: url(\"data:image/svg+xml,");
    expect(themeClasses(appearance)).toContain("bg-custom");
  });

  it("builds every background kind", () => {
    for (const kind of ["solid", "gradient", "mesh", "pattern", "scene"] as const) {
      expect(backgroundCss({ ...DEFAULT_APPEARANCE.background, kind }, "#ffffff"), kind).toBeTruthy();
    }
  });

  it("maps structure choices to page classes", () => {
    const appearance = normalizeAppearance({ layout: { ...DEFAULT_APPEARANCE.layout, nav: "top", titles: "compact" }, access: { ...DEFAULT_APPEARANCE.access, motion: "none" } });
    expect(themeClasses(appearance)).toEqual(expect.arrayContaining(["nav-top", "titles-compact", "reduce-motion"]));
  });
});

describe("dark mode", () => {
  const at = (time: string) => new Date(`2026-11-18T${time}:00`);
  it("follows the schedule, also across midnight", () => {
    const mode = { kind: "schedule" as const, light: "07:00", dark: "20:00" };
    expect(resolveDark(mode, false, at("12:00"))).toBe(false);
    expect(resolveDark(mode, false, at("21:30"))).toBe(true);
    expect(resolveDark(mode, false, at("03:00"))).toBe(true);
  });

  it("follows the system in automatic mode", () => {
    expect(resolveDark({ kind: "auto", light: "07:00", dark: "20:00" }, true, at("12:00"))).toBe(true);
  });
});

describe("legacy preferences", () => {
  it("turns the 2.1 device choices into the first synced appearance", () => {
    const result = fromLegacy({ theme: "dark", look: { accent: "blue", density: "compact", text: "large", calm: true, start: "reports" } }, withAccent);
    expect(result.mode.kind).toBe("dark");
    expect(result.theme.id).toBe("custom");
    expect(result.theme.light.accent).toBe("#2f5fb8");
    expect(result.shape.density).toBe("compact");
    expect(result.text.scale).toBe(112);
    expect(result.access.motion).toBe("reduced");
    expect(result.behavior.start).toBe("reports");
  });
});

describe("display formats", () => {
  afterEach(() => setDisplayFormat(DEFAULT_APPEARANCE));

  it("writes amounts with or without cents and negatives in parentheses", () => {
    expect(money(-123_456).replace(/\s/g, " ")).toBe("−1.234,56 €");
    setDisplayFormat(normalizeAppearance({ numbers: { ...DEFAULT_APPEARANCE.numbers, cents: false, negative: "parens" } }));
    expect(money(-123_456).replace(/\s/g, " ")).toBe("(1.235 €)");
    expect(money(5_000).replace(/\s/g, " ")).toBe("50 €");
  });

  it("keeps the minus sign when negatives are shown in red", () => {
    const appearance = normalizeAppearance({ numbers: { ...DEFAULT_APPEARANCE.numbers, negative: "red" } });
    setDisplayFormat(appearance);
    expect(money(-1_250).replace(/\s/g, " ")).toBe("−12,50 €");
    expect(themeClasses(appearance)).toContain("negative-red");
  });

  it("writes dates in the chosen format", () => {
    expect(shortDate("2026-11-18")).toBe("18/11/2026");
    setDisplayFormat(normalizeAppearance({ numbers: { ...DEFAULT_APPEARANCE.numbers, date: "short" } }));
    expect(shortDate("2026-11-18")).toBe("18 nov 2026");
    setDisplayFormat(normalizeAppearance({ numbers: { ...DEFAULT_APPEARANCE.numbers, date: "iso" } }));
    expect(shortDate("2026-11-18")).toBe("2026-11-18");
  });

  it("changes the category colors with the chart palette", () => {
    const classic = categoryColor(0);
    setDisplayFormat(normalizeAppearance({ charts: { ...DEFAULT_APPEARANCE.charts, palette: "colorblind" } }));
    expect(categoryColor(0)).not.toBe(classic);
  });
});

describe("board with more columns", () => {
  it("spreads panels over three columns", () => {
    const items = ["a", "b", "c", "d"].map((key) => ({ key, node: null, weight: 2 }));
    const [segment] = boardSegments(items, 3);
    expect("columns" in segment && segment.columns.map((column) => column.map((item) => item.key))).toEqual([["a", "d"], ["b"], ["c"]]);
  });

  it("puts everything in one column, wide panels included", () => {
    const items = [{ key: "stats", node: null, full: true }, { key: "flow", node: null }];
    expect(boardSegments(items, 1)).toHaveLength(1);
  });
});
