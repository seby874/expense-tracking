// Temi pronti, chiaro/scuro e tutti i colori modificabili uno per uno.
import { useState, type CSSProperties } from "react";
import { Check, CircleAlert } from "lucide-react";
import { applyPreset, resetSection, setColor, type Appearance } from "../../lib/appearance";
import { ACCENT_CHOICES, THEME_PRESETS, contrastIssues, withAccent, type ColorToken, type Palette } from "../../lib/palettes";
import { Choice, ColorField, Group, Row, patch, type Update } from "./controls";

const COLOR_GROUPS: [string, [ColorToken, string][]][] = [
  ["Sfondo e riquadri", [["bg", "Sfondo della pagina"], ["surface", "Riquadri"], ["subtle", "Zone tenui"], ["line", "Bordi"], ["line-strong", "Bordi marcati"]]],
  ["Testo", [["ink", "Testo"], ["label", "Etichette"], ["muted", "Testo secondario"], ["soft", "Testo tenue"]]],
  ["Colore principale", [["accent", "Collegamenti ed evidenziazioni"], ["accent-solid", "Pulsanti principali"], ["on-accent", "Testo sui pulsanti"],
    ["accent-hover", "Al passaggio del mouse"], ["accent-pale", "Sfondo evidenziato"]]],
  ["Menu", [["sidebar", "Sfondo del menu"], ["sidebar-ink", "Testo del menu"], ["sidebar-muted", "Testo tenue del menu"], ["sidebar-accent", "Voce attiva e logo"]]],
  ["Patrimonio netto", [["hero", "Sfondo del riquadro"], ["hero-ink", "Testo del riquadro"]]],
  ["Movimenti", [["income", "Entrate"], ["income-pale", "Sfondo entrate"], ["expense", "Spese"], ["expense-pale", "Sfondo spese"],
    ["transfer", "Trasferimenti"], ["transfer-pale", "Sfondo trasferimenti"], ["repay", "Rate e debiti"], ["repay-pale", "Sfondo rate"], ["repay-border", "Bordo rate"]]],
  ["Grafici", [["chart-income", "Barre delle entrate"], ["chart-expense", "Barre delle spese"], ["chart-repaid", "Rimborsi dei debiti"], ["chart-transfer", "Secondo periodo"]]],
  ["Avvisi e stati", [["good", "Positivo"], ["good-pale", "Sfondo positivo"], ["good-border", "Bordo positivo"], ["warn", "Attenzione"], ["warn-pale", "Sfondo attenzione"],
    ["warn-border", "Bordo attenzione"], ["warn-solid", "Barra di avviso"], ["danger", "Negativo ed errori"], ["danger-pale", "Sfondo errori"], ["danger-solid", "Pulsanti di eliminazione"],
    ["due-bg", "Sfondo scadenze"], ["due-border", "Bordo scadenze"]]],
  ["Ombre", [["shadow-color", "Colore delle ombre"]]],
];

function Swatches({ palette }: { palette: Palette }) {
  return <span className="theme-swatches" aria-hidden="true">
    <i style={{ background: palette.sidebar }} />
    <i style={{ background: palette.bg }}><b style={{ background: palette.surface, borderColor: palette.line } as CSSProperties} /></i>
    <i style={{ background: palette["accent-solid"] }} /><i style={{ background: palette.expense }} />
  </span>;
}

export function ThemesPanel({ appearance, update, dark }: { appearance: Appearance; update: Update; dark: boolean }) {
  const { mode } = appearance;
  return <>
    <Group title="Temi pronti" hint="Un tocco cambia tutti i colori, in chiaro e in scuro. Poi puoi ritoccare ogni colore qui sotto.">
      <div className="theme-grid">
        {THEME_PRESETS.map((preset) => <button type="button" key={preset.id} className="theme-card" aria-pressed={appearance.theme.id === preset.id}
          onClick={() => update((current) => applyPreset(current, preset.id))}>
          <Swatches palette={dark ? preset.dark : preset.light} />
          <span>{preset.name}{appearance.theme.id === preset.id && <Check size={15} />}</span>
        </button>)}
        {appearance.theme.id === "custom" && <span className="theme-card is-custom" aria-current="true">
          <Swatches palette={dark ? appearance.theme.dark : appearance.theme.light} /><span>Personalizzato <Check size={15} /></span></span>}
      </div>
    </Group>
    <Group title="Chiaro o scuro" onReset={() => update((current) => resetSection(current, "mode"))}>
      <Row label="Modalità" hint={mode.kind === "auto" ? "Segue il telefono o il computer." : mode.kind === "schedule" ? "Chiaro di giorno, scuro di sera, agli orari scelti." : undefined}>
        <Choice label="Modalità" value={mode.kind} onChange={(kind) => patch(update, "mode", { kind })}
          options={[["auto", "Automatico"], ["light", "Chiaro"], ["dark", "Scuro"], ["schedule", "Con l’orario"]]} />
      </Row>
      {mode.kind === "schedule" && <Row label="Orari" hint="Dall’ora del chiaro a quella dello scuro.">
        <span className="look-times">
          <label>Chiaro dalle <input type="time" value={mode.light} onChange={(event) => event.target.value && patch(update, "mode", { light: event.target.value })} /></label>
          <label>Scuro dalle <input type="time" value={mode.dark} onChange={(event) => event.target.value && patch(update, "mode", { dark: event.target.value })} /></label>
        </span>
      </Row>}
    </Group>
  </>;
}

export function ColorsPanel({ appearance, update, dark: currentDark }: { appearance: Appearance; update: Update; dark: boolean }) {
  const [dark, setDark] = useState(currentDark);
  const palette = dark ? appearance.theme.dark : appearance.theme.light;
  const issues = contrastIssues(palette);
  const setAccent = (accent: string) => update((current) => ({
    ...current, theme: { id: "custom", light: withAccent(current.theme.light, accent, false), dark: withAccent(current.theme.dark, accent, true) },
  }));
  return <>
    <Group title="Colore principale" hint="Pulsanti, collegamenti, voce attiva: le sfumature si calcolano da sole, in chiaro e in scuro.">
      <div className="swatches look-accents" role="group" aria-label="Colore principale">
        {ACCENT_CHOICES.map(([color, name]) => <button type="button" key={color} className="swatch" title={name} aria-label={name}
          aria-pressed={appearance.theme.light.accent === color} style={{ "--swatch": color } as CSSProperties} onClick={() => setAccent(color)} />)}
        <label className="swatch swatch-custom" title="Un altro colore"><span className="sr-only">Un altro colore</span>
          <input type="color" value={appearance.theme.light["accent-solid"]} onChange={(event) => setAccent(event.target.value)} /></label>
      </div>
    </Group>
    <Group title="Tutti i colori" hint="Ogni colore dell’app, per il tema chiaro e per quello scuro."
      onReset={() => update((current) => applyPreset(current, "bosco"))}>
      <Row label="Stai modificando"><Choice label="Tavolozza" value={dark ? "dark" : "light"} onChange={(value) => setDark(value === "dark")}
        options={[["light", "Tema chiaro"], ["dark", "Tema scuro"]]} /></Row>
      {issues.length > 0 && <div className="notice warning-notice look-contrast" role="status"><CircleAlert size={18} /><div>
        <strong>Alcuni testi potrebbero leggersi male</strong>
        <span>{issues.map((issue) => `${issue.pair} (contrasto ${issue.ratio.toLocaleString("it-IT")}, servirebbe almeno ${issue.minimum.toLocaleString("it-IT")})`).join(" · ")}</span>
      </div></div>}
      {COLOR_GROUPS.map(([title, tokens]) => <details key={title} className="look-colors" open={title === "Sfondo e riquadri"}>
        <summary>{title}<span className="look-dots" aria-hidden="true">{tokens.slice(0, 5).map(([token]) => <i key={token} style={{ background: palette[token] }} />)}</span></summary>
        {tokens.map(([token, label]) => <Row key={token} label={label}>
          <ColorField label={label} value={palette[token]} onChange={(value) => update((current) => setColor(current, dark, token, value))} />
        </Row>)}
      </details>)}
    </Group>
  </>;
}
