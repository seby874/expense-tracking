// Font dell'app: inclusi nel pacchetto (la sicurezza della pagina vieta i font esterni) e scaricati solo quando servono.
// Il browser scarica un file solo quando una pagina usa davvero quel font: registrarli tutti non costa nulla.
import type { FontId } from "./appearance";
import roboto from "@fontsource-variable/roboto/files/roboto-latin-wght-normal.woff2?url";
import openSans from "@fontsource-variable/open-sans/files/open-sans-latin-wght-normal.woff2?url";
import montserrat from "@fontsource-variable/montserrat/files/montserrat-latin-wght-normal.woff2?url";
import nunito from "@fontsource-variable/nunito/files/nunito-latin-wght-normal.woff2?url";
import sourceSans from "@fontsource-variable/source-sans-3/files/source-sans-3-latin-wght-normal.woff2?url";
import arimo from "@fontsource-variable/arimo/files/arimo-latin-wght-normal.woff2?url";
import gelasio from "@fontsource-variable/gelasio/files/gelasio-latin-wght-normal.woff2?url";
import merriweather from "@fontsource-variable/merriweather/files/merriweather-latin-wght-normal.woff2?url";
import lora from "@fontsource-variable/lora/files/lora-latin-wght-normal.woff2?url";
import playfair from "@fontsource-variable/playfair-display/files/playfair-display-latin-wght-normal.woff2?url";
import jetbrains from "@fontsource-variable/jetbrains-mono/files/jetbrains-mono-latin-wght-normal.woff2?url";
import lato400 from "@fontsource/lato/files/lato-latin-400-normal.woff2?url";
import lato700 from "@fontsource/lato/files/lato-latin-700-normal.woff2?url";
import poppins400 from "@fontsource/poppins/files/poppins-latin-400-normal.woff2?url";
import poppins600 from "@fontsource/poppins/files/poppins-latin-600-normal.woff2?url";
import poppins700 from "@fontsource/poppins/files/poppins-latin-700-normal.woff2?url";
import tinos400 from "@fontsource/tinos/files/tinos-latin-400-normal.woff2?url";
import tinos700 from "@fontsource/tinos/files/tinos-latin-700-normal.woff2?url";
import cousine400 from "@fontsource/cousine/files/cousine-latin-400-normal.woff2?url";
import cousine700 from "@fontsource/cousine/files/cousine-latin-700-normal.woff2?url";
import atkinson400 from "@fontsource/atkinson-hyperlegible/files/atkinson-hyperlegible-latin-400-normal.woff2?url";
import atkinson700 from "@fontsource/atkinson-hyperlegible/files/atkinson-hyperlegible-latin-700-normal.woff2?url";

/** Solo i caratteri latini (italiano, €, −): gli altri alfabeti non servono. */
const LATIN = "U+0000-00FF, U+0131, U+0152-0153, U+02BB-02BC, U+02C6, U+02DA, U+02DC, U+0304, U+0308, U+0329, U+2000-206F, U+20AC, U+2122, U+2191, U+2193, U+2212, U+2215, U+FEFF, U+FFFD";

interface FontInfo {
  name: string;
  /** Famiglia CSS completa, con i ripieghi. */
  stack: string;
  kind: "sans" | "serif" | "mono";
  /** File inclusi: [url, peso] (peso "100 900" per i font variabili). */
  files?: [string, string][];
  note?: string;
}

const SANS = "ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, \"Segoe UI\", sans-serif";
const SERIF = "ui-serif, Georgia, \"Times New Roman\", serif";
const MONO = "ui-monospace, SFMono-Regular, Menlo, Consolas, monospace";

export const FONTS: Record<FontId, FontInfo> = {
  inter: { name: "Inter", stack: `"Inter Variable", Inter, ${SANS}`, kind: "sans", note: "Il carattere originale dell'app" },
  system: { name: "Font di sistema", stack: SANS, kind: "sans", note: "Quello del telefono o del computer" },
  roboto: { name: "Roboto", stack: `"ET Roboto", Roboto, ${SANS}`, kind: "sans", files: [[roboto, "100 900"]] },
  "open-sans": { name: "Open Sans", stack: `"ET Open Sans", "Open Sans", ${SANS}`, kind: "sans", files: [[openSans, "300 800"]] },
  lato: { name: "Lato", stack: `"ET Lato", Lato, ${SANS}`, kind: "sans", files: [[lato400, "400"], [lato700, "700"]] },
  montserrat: { name: "Montserrat", stack: `"ET Montserrat", Montserrat, ${SANS}`, kind: "sans", files: [[montserrat, "100 900"]] },
  poppins: { name: "Poppins", stack: `"ET Poppins", Poppins, ${SANS}`, kind: "sans", files: [[poppins400, "400"], [poppins600, "600"], [poppins700, "700"]] },
  nunito: { name: "Nunito", stack: `"ET Nunito", Nunito, ${SANS}`, kind: "sans", files: [[nunito, "200 1000"]] },
  "source-sans": { name: "Source Sans", stack: `"ET Source Sans", "Source Sans 3", ${SANS}`, kind: "sans", files: [[sourceSans, "200 900"]] },
  arial: { name: "Arial", stack: `Arial, "ET Arimo", Arimo, ${SANS}`, kind: "sans", files: [[arimo, "400 700"]], note: "Su Android usa Arimo, identico" },
  times: { name: "Times New Roman", stack: `"Times New Roman", "ET Tinos", Tinos, Times, serif`, kind: "serif", files: [[tinos400, "400"], [tinos700, "700"]], note: "Su Android usa Tinos, identico" },
  georgia: { name: "Georgia", stack: `Georgia, "ET Gelasio", Gelasio, serif`, kind: "serif", files: [[gelasio, "400 700"]], note: "Su Android usa Gelasio, identico" },
  merriweather: { name: "Merriweather", stack: `"ET Merriweather", Merriweather, ${SERIF}`, kind: "serif", files: [[merriweather, "300 900"]] },
  lora: { name: "Lora", stack: `"ET Lora", Lora, ${SERIF}`, kind: "serif", files: [[lora, "400 700"]] },
  playfair: { name: "Playfair Display", stack: `"ET Playfair", "Playfair Display", ${SERIF}`, kind: "serif", files: [[playfair, "400 900"]] },
  courier: { name: "Courier New", stack: `"Courier New", "ET Cousine", Cousine, ${MONO}`, kind: "mono", files: [[cousine400, "400"], [cousine700, "700"]], note: "Su Android usa Cousine, identico" },
  jetbrains: { name: "JetBrains Mono", stack: `"ET JetBrains Mono", "JetBrains Mono", ${MONO}`, kind: "mono", files: [[jetbrains, "100 800"]] },
  atkinson: { name: "Atkinson Hyperlegible", stack: `"ET Atkinson", "Atkinson Hyperlegible", ${SANS}`, kind: "sans", files: [[atkinson400, "400"], [atkinson700, "700"]], note: "Pensato per la massima leggibilità" },
};

/** Nome della famiglia registrata dall'app (il primo nome «ET …» della pila). */
function registeredFamily(stack: string) {
  return /"(ET [^"]+)"/.exec(stack)?.[1] ?? null;
}

const registered = new Set<FontId>();

/** Registra i file del font: il browser li scarica solo se servono davvero. */
export function registerFont(id: FontId) {
  const info = FONTS[id];
  const family = registeredFamily(info.stack);
  if (registered.has(id) || !family || !info.files || typeof FontFace === "undefined" || !document.fonts) return;
  registered.add(id);
  for (const [url, weight] of info.files) {
    try {
      document.fonts.add(new FontFace(family, `url(${url}) format("woff2")`, { weight, style: "normal", display: "swap", unicodeRange: LATIN }));
    } catch {
      // Font non disponibile: resta il ripiego della pila.
    }
  }
}
