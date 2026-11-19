// Sfondo, caratteri, forme e spazi.
import type { CSSProperties } from "react";
import { FONT_IDS, PATTERNS, SCENES, resetSection, type Appearance, type FontId } from "../../lib/appearance";
import { BACKGROUND_SWATCHES, PATTERN_NAMES, SCENE_NAMES, backgroundPreview } from "../../lib/backgrounds";
import { FONTS, registerFont } from "../../lib/fonts";
import { Choice, ColorField, Group, Row, Slider, Toggle, patch, type Update } from "./controls";

type Background = Appearance["background"];

export function BackgroundPanel({ appearance, update, dark }: { appearance: Appearance; update: Update; dark: boolean }) {
  const background = appearance.background;
  const themeBg = dark ? appearance.theme.dark.bg : appearance.theme.light.bg;
  const set = (change: Partial<Background>) => patch(update, "background", change);
  const preview = (change: Partial<Background>) => ({ background: backgroundPreview({ ...background, ...change }, themeBg) } as CSSProperties);
  const custom = background.kind !== "theme";
  return <Group title="Sfondo" hint="Tinta unita, sfumature, motivi o una scena illustrata. Uguale su tutti i dispositivi."
    onReset={() => update((current) => resetSection(current, "background"))}>
    <Row label="Tipo">
      <Choice label="Tipo di sfondo" value={background.kind} onChange={(kind) => set({ kind })}
        options={[["theme", "Del tema"], ["solid", "Tinta unita"], ["gradient", "Sfumatura"], ["mesh", "Morbido"], ["pattern", "Motivo"], ["scene", "Scena"]]} />
    </Row>
    {custom && <>
      <Row label="Colori" hint={background.kind === "solid" ? "Il primo colore." : background.kind === "pattern" ? "Colore del motivo e colore di fondo." : "Fino a tre colori."}>
        <span className="look-color-list">
          {[0, 1, 2].slice(0, background.kind === "solid" ? 1 : background.kind === "pattern" ? 2 : 3).map((index) =>
            <ColorField key={index} label={`Colore ${index + 1}`} value={background.colors[index] ?? background.colors[0]}
              onChange={(value) => { const colors = [...background.colors]; colors[index] = value; set({ colors: colors.filter(Boolean) }); }} />)}
        </span>
      </Row>
      <Row label="Combinazioni pronte">
        <div className="bg-presets">{BACKGROUND_SWATCHES.map((colors) => <button type="button" key={colors.join()} className="bg-preset" aria-label={`Colori ${colors.join(", ")}`}
          style={preview({ colors })} onClick={() => set({ colors })} />)}
          <button type="button" className="bg-preset bg-from-theme" onClick={() => {
            const palette = dark ? appearance.theme.dark : appearance.theme.light;
            set({ colors: [palette["accent-pale"], palette.bg, palette.subtle] });
          }}>Dal tema</button></div>
      </Row>
    </>}
    {background.kind === "gradient" && <Row label="Direzione">
      <span className="look-inline"><Choice label="Forma" value={background.radial ? "radial" : "linear"} onChange={(value) => set({ radial: value === "radial" })}
        options={[["linear", "Lineare"], ["radial", "Circolare"]]} />
        {!background.radial && <Slider label="Angolo" min={0} max={360} step={15} value={background.angle} onChange={(angle) => set({ angle })} format={(value) => `${value}°`} />}</span>
    </Row>}
    {background.kind === "pattern" && <>
      <Row label="Motivo"><div className="bg-tiles">{PATTERNS.map((key) => <button type="button" key={key} className="bg-tile" aria-pressed={background.pattern === key}
        style={preview({ pattern: key, kind: "pattern" })} onClick={() => set({ pattern: key })}><span>{PATTERN_NAMES[key]}</span></button>)}</div></Row>
      <Row label="Intensità"><Slider label="Intensità del motivo" min={5} max={100} step={5} value={background.intensity} onChange={(intensity) => set({ intensity })} format={(value) => `${value}%`} /></Row>
    </>}
    {background.kind === "scene" && <Row label="Scena" hint="Illustrazioni disegnate dall’app con i tuoi colori.">
      <div className="bg-tiles scenes">{SCENES.map((key) => <button type="button" key={key} className="bg-tile" aria-pressed={background.scene === key}
        style={preview({ scene: key, kind: "scene" })} onClick={() => set({ scene: key })}><span>{SCENE_NAMES[key]}</span></button>)}</div>
    </Row>}
    {custom && <>
      <Row label="Oscura lo sfondo" hint="Avvicina lo sfondo al colore del tema: i testi si leggono meglio.">
        <Slider label="Oscura lo sfondo" min={0} max={85} step={5} value={background.dim} onChange={(dim) => set({ dim })} format={(value) => `${value}%`} /></Row>
      <Row label="Sfocatura"><Slider label="Sfocatura" min={0} max={24} value={background.blur} onChange={(blur) => set({ blur })} format={(value) => `${value} px`} /></Row>
      <Row label="Riquadri trasparenti" hint="100% = riquadri pieni.">
        <Slider label="Opacità dei riquadri" min={55} max={100} step={5} value={background.panelOpacity} onChange={(panelOpacity) => set({ panelOpacity })} format={(value) => `${value}%`} /></Row>
      <Row label="Effetto vetro" hint="Sfoca quello che c’è dietro ai riquadri (più lento sui telefoni datati).">
        <Toggle label="Effetto vetro" checked={background.glass} onChange={(glass) => set({ glass })} /></Row>
    </>}
  </Group>;
}

function FontSelect({ value, onChange, label }: { value: FontId; onChange: (value: FontId) => void; label: string }) {
  const groups: [string, FontId[]][] = [
    ["Senza grazie", FONT_IDS.filter((id) => FONTS[id].kind === "sans")],
    ["Con grazie", FONT_IDS.filter((id) => FONTS[id].kind === "serif")],
    ["A spaziatura fissa", FONT_IDS.filter((id) => FONTS[id].kind === "mono")],
  ];
  return <select aria-label={label} value={value} style={{ fontFamily: FONTS[value].stack }}
    onChange={(event) => { const id = event.target.value as FontId; registerFont(id); onChange(id); }}>
    {groups.map(([title, ids]) => <optgroup key={title} label={title}>{ids.map((id) => <option key={id} value={id}>{FONTS[id].name}</option>)}</optgroup>)}
  </select>;
}

export function TypePanel({ appearance, update }: { appearance: Appearance; update: Update }) {
  const { fonts, text } = appearance;
  const note = (id: FontId) => FONTS[id].note;
  return <Group title="Caratteri" hint="Ogni font si scarica solo quando lo scegli."
    onReset={() => update((current) => resetSection(resetSection(current, "fonts"), "text"))}>
    <Row label="Testo" hint={note(fonts.body)}><FontSelect label="Font del testo" value={fonts.body} onChange={(body) => patch(update, "fonts", { body })} /></Row>
    <Row label="Titoli" hint={note(fonts.heading)}><FontSelect label="Font dei titoli" value={fonts.heading} onChange={(heading) => patch(update, "fonts", { heading })} /></Row>
    <Row label="Numeri e importi" hint={note(fonts.numbers)}><FontSelect label="Font dei numeri" value={fonts.numbers} onChange={(numbers) => patch(update, "fonts", { numbers })} /></Row>
    <Row label="Dimensione del testo"><Slider label="Dimensione del testo" min={80} max={150} step={5} value={text.scale} onChange={(scale) => patch(update, "text", { scale })} format={(value) => `${value}%`} /></Row>
    <Row label="Peso del testo"><Slider label="Peso del testo" min={300} max={600} step={50} value={text.weight} onChange={(weight) => patch(update, "text", { weight })}
      format={(value) => (value <= 300 ? "Sottile" : value < 400 ? "Leggero" : value === 400 ? "Normale" : value <= 500 ? "Medio" : "Grassetto")} /></Row>
    <Row label="Peso dei titoli"><Slider label="Peso dei titoli" min={-300} max={150} step={50} value={text.headingWeight} onChange={(headingWeight) => patch(update, "text", { headingWeight })}
      format={(value) => (value === 0 ? "Normale" : value < 0 ? "Più leggeri" : "Più marcati")} /></Row>
    <Row label="Interlinea"><Slider label="Interlinea" min={125} max={190} step={5} value={text.lineHeight} onChange={(lineHeight) => patch(update, "text", { lineHeight })}
      format={(value) => (value / 100).toLocaleString("it-IT")} /></Row>
    <Row label="Spaziatura tra le lettere"><Slider label="Spaziatura tra le lettere" min={-30} max={80} step={10} value={text.tracking} onChange={(tracking) => patch(update, "text", { tracking })}
      format={(value) => (value === 0 ? "Normale" : value > 0 ? "Più larga" : "Più stretta")} /></Row>
  </Group>;
}

export function ShapePanel({ appearance, update }: { appearance: Appearance; update: Update }) {
  const { shape } = appearance;
  return <Group title="Forme e spazi" onReset={() => update((current) => resetSection(current, "shape"))}>
    <Row label="Angoli"><Slider label="Angoli arrotondati" min={0} max={200} step={10} value={shape.round} onChange={(round) => patch(update, "shape", { round })}
      format={(value) => (value === 0 ? "Squadrati" : value < 100 ? "Poco tondi" : value === 100 ? "Normali" : "Molto tondi")} /></Row>
    <Row label="Ombre"><Choice label="Ombre" value={shape.shadow} onChange={(shadow) => patch(update, "shape", { shadow })} options={[["flat", "Nessuna"], ["soft", "Leggere"], ["strong", "Marcate"]]} /></Row>
    <Row label="Bordi dei riquadri"><Toggle label="Bordi dei riquadri" checked={shape.borders} onChange={(borders) => patch(update, "shape", { borders })} /></Row>
    <Row label="Densità" hint="Quanto spazio c’è dentro e tra i riquadri.">
      <Choice label="Densità" value={shape.density} onChange={(density) => patch(update, "shape", { density })}
        options={[["airy", "Ariosa"], ["comfortable", "Comoda"], ["compact", "Compatta"], ["dense", "Fitta"]]} /></Row>
    <Row label="Larghezza su PC" hint="Quanto si allarga il contenuto sugli schermi grandi.">
      <Choice label="Larghezza" value={shape.width} onChange={(width) => patch(update, "shape", { width })}
        options={[["narrow", "Stretta"], ["normal", "Normale"], ["wide", "Larga"], ["full", "Tutto lo schermo"]]} /></Row>
    <Row label="Spessore delle icone"><Slider label="Spessore delle icone" min={100} max={275} step={25} value={shape.icons} onChange={(icons) => patch(update, "shape", { icons })}
      format={(value) => (value <= 125 ? "Sottili" : value < 200 ? "Leggere" : value === 200 ? "Normali" : "Spesse")} /></Row>
  </Group>;
}
