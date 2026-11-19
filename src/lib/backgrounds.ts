// Sfondi dell'app disegnati nel codice: tinte, sfumature, motivi e scene illustrate (nessuna immagine esterna).
import type { Appearance } from "./appearance";
import { hexToHsl, hslToHex, mixHex } from "./palettes";

type Background = Appearance["background"];
type Colors = [string, string, string];

export const PATTERN_NAMES: Record<Background["pattern"], string> = {
  dots: "Puntini", lines: "Righe", grid: "Griglia", paper: "Carta", waves: "Onde",
};

export const SCENE_NAMES: Record<Background["scene"], string> = {
  mountains: "Montagne", sea: "Mare", dunes: "Dune", hills: "Colline", forest: "Bosco", aurora: "Aurora", waves: "Onde",
  topo: "Mappa", bokeh: "Luci", geometric: "Cristalli", stars: "Cielo stellato", sunset: "Tramonto",
};

/** Colori pronti per gli sfondi (presi dal tema scelto o da combinazioni classiche). */
export const BACKGROUND_SWATCHES: [string, string, string][] = [
  ["#e5f3eb", "#cfe7d9", "#f5f7f6"], ["#dbeafe", "#e0e7ff", "#f8fafc"], ["#fde2e4", "#fad2e1", "#fff1e6"],
  ["#ffecd2", "#fcb69f", "#fff7ed"], ["#d4fc79", "#96e6a1", "#f0fdf4"], ["#a1c4fd", "#c2e9fb", "#eef6ff"],
  ["#0f2027", "#203a43", "#2c5364"], ["#141e30", "#243b55", "#0d1613"], ["#232526", "#414345", "#121212"],
  ["#2b1055", "#7597de", "#1a1033"], ["#3a1c71", "#d76d77", "#ffaf7b"], ["#134e5e", "#71b280", "#0b2b26"],
];

const svgUrl = (svg: string) => `url("data:image/svg+xml,${encodeURIComponent(svg)}")`;

/** Generatore pseudo-casuale fisso: le scene sono sempre uguali. */
function seeded(seed: number) {
  let state = seed;
  return () => {
    state = (state * 1_103_515_245 + 12_345) % 2_147_483_648;
    return state / 2_147_483_648;
  };
}

const shade = (color: string, change: number) => {
  const [hue, sat, light] = hexToHsl(color);
  return hslToHex(hue, sat, Math.max(2, Math.min(98, light + change)));
};

// ---------------------------------------------------------------- Motivi

function pattern(kind: Background["pattern"], color: string, strength: number): string {
  const opacity = Number(strength.toFixed(2));
  const ink = `fill="${color}" fill-opacity="${opacity}"`;
  const stroke = `stroke="${color}" stroke-opacity="${opacity}" fill="none"`;
  const tiles: Record<Background["pattern"], string> = {
    dots: `<svg xmlns="http://www.w3.org/2000/svg" width="22" height="22"><circle cx="2" cy="2" r="1.6" ${ink}/></svg>`,
    lines: `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16"><path d="M-4 20 20 -4M-4 4 4 -4M12 20 20 12" ${stroke} stroke-width="1.2"/></svg>`,
    grid: `<svg xmlns="http://www.w3.org/2000/svg" width="28" height="28"><path d="M28 0H0V28" ${stroke} stroke-width="1"/></svg>`,
    paper: `<svg xmlns="http://www.w3.org/2000/svg" width="120" height="120"><filter id="n"><feTurbulence type="fractalNoise" baseFrequency=".9" numOctaves="2" stitchTiles="stitch"/><feColorMatrix values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 ${opacity * 1.6} 0"/></filter><rect width="120" height="120" filter="url(#n)"/></svg>`,
    waves: `<svg xmlns="http://www.w3.org/2000/svg" width="60" height="24"><path d="M0 12c10-8 20-8 30 0s20 8 30 0" ${stroke} stroke-width="1.3"/></svg>`,
  };
  return svgUrl(tiles[kind]);
}

// ---------------------------------------------------------------- Scene

const W = 1600;
const H = 1000;
const scene = (defs: string, body: string) => svgUrl(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" preserveAspectRatio="xMidYMid slice"><defs>${defs}</defs>${body}</svg>`);
const sky = (top: string, bottom: string) => `<linearGradient id="s" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${top}"/><stop offset="1" stop-color="${bottom}"/></linearGradient>`;

/** Linea di creste: punti casuali tra due quote, chiusa in basso. */
function ridge(rand: () => number, base: number, height: number, steps: number, color: string, smooth = false) {
  const points = Array.from({ length: steps + 1 }, (_, index) => [index * W / steps, base - rand() * height]);
  const path = smooth
    ? points.map(([x, y], index) => (index === 0 ? `M${x} ${y}` : `Q${x - W / steps / 2} ${y - 60 * rand()} ${x} ${y}`)).join(" ")
    : points.map(([x, y], index) => `${index === 0 ? "M" : "L"}${x.toFixed(0)} ${y.toFixed(0)}`).join(" ");
  return `<path d="${path} L${W} ${H} L0 ${H}Z" fill="${color}"/>`;
}

const SCENES: Record<Background["scene"], (colors: Colors) => string> = {
  mountains: ([a, b, c]) => {
    const rand = seeded(7);
    return scene(sky(shade(c, 8), shade(a, 18)), `<rect width="${W}" height="${H}" fill="url(#s)"/>${ridge(rand, 520, 260, 9, shade(b, 10))}${ridge(rand, 700, 230, 7, b)}${ridge(rand, 860, 160, 6, shade(b, -14))}`);
  },
  sea: ([a, b, c]) => scene(sky(shade(c, 10), shade(a, 22)),
    `<rect width="${W}" height="${H}" fill="url(#s)"/><circle cx="1150" cy="430" r="90" fill="${shade(a, 32)}" opacity=".9"/><rect y="560" width="${W}" height="440" fill="${b}"/>`
    + Array.from({ length: 9 }, (_, index) => `<rect x="${(index * 173) % 1400}" y="${600 + index * 42}" width="${180 + (index * 37) % 120}" height="4" rx="2" fill="${shade(b, 18)}" opacity=".55"/>`).join("")),
  dunes: ([a, b, c]) => scene(sky(shade(c, 12), shade(a, 26)),
    `<rect width="${W}" height="${H}" fill="url(#s)"/><path d="M0 640 C400 520 700 700 1000 600 S1450 520 1600 580 V1000H0Z" fill="${shade(b, 12)}"/><path d="M0 780 C300 680 650 860 1050 740 S1450 700 1600 760 V1000H0Z" fill="${b}"/><path d="M0 900 C350 840 800 960 1200 880 S1500 870 1600 900 V1000H0Z" fill="${shade(b, -12)}"/>`),
  hills: ([a, b, c]) => scene(sky(shade(c, 10), shade(a, 20)),
    `<rect width="${W}" height="${H}" fill="url(#s)"/><ellipse cx="300" cy="900" rx="700" ry="330" fill="${shade(b, 14)}"/><ellipse cx="1300" cy="950" rx="800" ry="360" fill="${b}"/><ellipse cx="700" cy="1080" rx="900" ry="300" fill="${shade(b, -12)}"/>`),
  forest: ([a, b, c]) => {
    const rand = seeded(11);
    const trees = (y: number, size: number, color: string, count: number) => Array.from({ length: count }, (_, index) => {
      const x = index * W / count + rand() * 40;
      const h = size * (0.7 + rand() * 0.6);
      return `<path d="M${x} ${y - h} L${x - h * 0.32} ${y} L${x + h * 0.32} ${y}Z" fill="${color}"/>`;
    }).join("");
    return scene(sky(shade(c, 8), shade(a, 22)), `<rect width="${W}" height="${H}" fill="url(#s)"/>${trees(700, 260, shade(b, 14), 22)}${trees(850, 300, b, 18)}<rect y="840" width="${W}" height="160" fill="${shade(b, -16)}"/>${trees(1000, 340, shade(b, -16), 14)}`);
  },
  aurora: ([a, b, c]) => scene(`${sky(shade(c, -6), shade(c, -16))}<filter id="b"><feGaussianBlur stdDeviation="60"/></filter>`,
    `<rect width="${W}" height="${H}" fill="url(#s)"/><g filter="url(#b)" opacity=".85"><path d="M-100 380 C300 160 600 520 900 300 S1400 120 1700 320 L1700 470 C1300 300 1000 640 650 470 S100 420 -100 560Z" fill="${a}"/><path d="M-100 560 C350 420 700 700 1100 520 S1500 460 1700 560 L1700 640 C1300 600 1000 760 600 660 S100 620 -100 700Z" fill="${b}"/></g>`),
  waves: ([a, b, c]) => scene(sky(shade(c, 6), shade(c, -4)),
    `<rect width="${W}" height="${H}" fill="url(#s)"/>` + [0, 1, 2, 3].map((index) => {
      const y = 520 + index * 120;
      const color = mixHex(a, b, 1 - index / 3);
      return `<path d="M0 ${y} C300 ${y - 90} 500 ${y + 90} 800 ${y} S1300 ${y - 90} 1600 ${y} V1000H0Z" fill="${color}" opacity="${0.55 + index * 0.15}"/>`;
    }).join("")),
  topo: ([a, b, c]) => scene("", `<rect width="${W}" height="${H}" fill="${c}"/>` + Array.from({ length: 16 }, (_, index) => {
    const r = 60 + index * 55;
    return `<ellipse cx="${520 + index * 6}" cy="${430 + index * 3}" rx="${r * 1.35}" ry="${r}" fill="none" stroke="${index % 4 ? a : b}" stroke-opacity=".35" stroke-width="2"/>`;
  }).join("") + Array.from({ length: 10 }, (_, index) => `<circle cx="1300" cy="780" r="${50 + index * 45}" fill="none" stroke="${a}" stroke-opacity=".25" stroke-width="2"/>`).join("")),
  bokeh: ([a, b, c]) => {
    const rand = seeded(5);
    return scene(`${sky(shade(c, 4), shade(c, -10))}<filter id="b"><feGaussianBlur stdDeviation="8"/></filter>`, `<rect width="${W}" height="${H}" fill="url(#s)"/><g filter="url(#b)">`
      + Array.from({ length: 34 }, (_, index) => `<circle cx="${(rand() * W).toFixed(0)}" cy="${(rand() * H).toFixed(0)}" r="${(20 + rand() * 90).toFixed(0)}" fill="${index % 2 ? a : b}" opacity="${(0.15 + rand() * 0.35).toFixed(2)}"/>`).join("") + "</g>");
  },
  geometric: ([a, b, c]) => {
    const rand = seeded(3);
    const cols = 8;
    const rows = 6;
    const cw = W / cols;
    const rh = H / rows;
    let body = "";
    for (let row = 0; row < rows; row++) for (let col = 0; col < cols; col++) {
      const x = col * cw;
      const y = row * rh;
      const t = (row / rows + col / cols) / 2;
      body += `<path d="M${x} ${y}H${x + cw}V${y + rh}Z" fill="${mixHex(a, c, 1 - t + rand() * 0.15)}"/><path d="M${x} ${y}V${y + rh}H${x + cw}Z" fill="${mixHex(b, c, 1 - t + rand() * 0.15)}"/>`;
    }
    return scene("", body);
  },
  stars: ([a, b, c]) => {
    const rand = seeded(9);
    return scene(sky(shade(c, -10), shade(b, -8)), `<rect width="${W}" height="${H}" fill="url(#s)"/>`
      + Array.from({ length: 160 }, () => `<circle cx="${(rand() * W).toFixed(0)}" cy="${(rand() * H * 0.85).toFixed(0)}" r="${(0.6 + rand() * 1.8).toFixed(1)}" fill="${shade(a, 40)}" opacity="${(0.4 + rand() * 0.6).toFixed(2)}"/>`).join("")
      + `<circle cx="1250" cy="230" r="60" fill="${shade(a, 42)}" opacity=".9"/>`);
  },
  sunset: ([a, b, c]) => scene(sky(shade(c, -4), shade(a, 14)),
    `<rect width="${W}" height="${H}" fill="url(#s)"/><circle cx="800" cy="640" r="220" fill="${shade(a, 26)}"/>`
    + [0, 1, 2, 3, 4].map((index) => `<rect y="${600 + index * 26}" width="${W}" height="${6 + index * 3}" fill="${shade(c, -4)}" opacity=".7"/>`).join("")
    + `<rect y="740" width="${W}" height="260" fill="${shade(b, -10)}"/>`),
};

/** Sfumatura «morbida» con macchie di colore, come gli sfondi dei telefoni. */
function mesh([a, b, c]: Colors, base: string) {
  return [
    `radial-gradient(at 12% 18%, ${a} 0, transparent 55%)`, `radial-gradient(at 88% 12%, ${b} 0, transparent 50%)`,
    `radial-gradient(at 70% 90%, ${c} 0, transparent 55%)`, `radial-gradient(at 20% 85%, ${mixHex(a, b, 0.5)} 0, transparent 45%)`, base,
  ].join(", ");
}

/** Valore CSS «background» per lo sfondo scelto; null = sfondo normale del tema. */
export function backgroundCss(background: Background, themeBg: string): string | null {
  const colors = [0, 1, 2].map((index) => background.colors[index] ?? background.colors[background.colors.length - 1]) as Colors;
  switch (background.kind) {
    case "theme": return null;
    case "solid": return colors[0];
    case "gradient": {
      const used = background.colors.length > 1 ? background.colors : [colors[0], themeBg];
      return background.radial ? `radial-gradient(circle at 50% 30%, ${used.join(", ")})` : `linear-gradient(${background.angle}deg, ${used.join(", ")})`;
    }
    case "mesh": return mesh(colors, themeBg);
    case "pattern": return `${pattern(background.pattern, colors[0], Math.max(0.04, background.intensity / 100 * 0.5))} repeat, ${background.colors[1] ?? themeBg}`;
    case "scene": return `${SCENES[background.scene](colors)} center / cover no-repeat, ${colors[2]}`;
  }
}

/** Anteprima piccola di una scena o di un motivo (per i pulsanti di scelta). */
export function backgroundPreview(background: Background, themeBg: string): string {
  return backgroundCss(background, themeBg) ?? themeBg;
}
