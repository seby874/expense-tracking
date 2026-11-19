// Struttura (menu, sezioni, titoli, Panoramica), numeri e date, grafici.
import { ArrowDown, ArrowUp, Eye, EyeOff, Smartphone } from "lucide-react";
import { DEFAULT_APPEARANCE, resetSection, type Appearance, type SectionKey, type WidgetKey } from "../../lib/appearance";
import { OVERVIEW_WIDGETS } from "../../lib/preferences";
import { Choice, Group, Row, Toggle, patch, type Update } from "./controls";

export const SECTION_TITLES: Record<SectionKey, string> = {
  overview: "Panoramica", movements: "Movimenti", accounts: "Patrimonio", reports: "Analisi", calendar: "Calendario", deadlines: "Scadenze", settings: "Impostazioni",
};

function move<T>(list: T[], index: number, step: -1 | 1): T[] {
  const next = [...list];
  const [item] = next.splice(index, 1);
  next.splice(index + step, 0, item);
  return next;
}

export function StructurePanel({ appearance, update }: { appearance: Appearance; update: Update }) {
  const { layout } = appearance;
  const widgets = appearance.behavior.widgets;
  const setWidgets = (list: typeof widgets) => patch(update, "behavior", { widgets: list });
  const toggleBar = (key: SectionKey) => {
    const bar = layout.bar.includes(key) ? layout.bar.filter((item) => item !== key) : [...layout.bar, key].slice(-4);
    patch(update, "layout", { bar: layout.order.filter((item) => bar.includes(item)) });
  };
  return <>
    <Group title="Menu" onReset={() => update((current) => resetSection(current, "layout"))}>
      <Row label="Posizione su PC" hint="Sul telefono il menu resta in basso.">
        <Choice label="Posizione del menu" value={layout.nav} onChange={(nav) => patch(update, "layout", { nav })}
          options={[["left", "A sinistra"], ["right", "A destra"], ["top", "In alto"], ["icons", "Solo icone"]]} /></Row>
      <Row label="Sezioni" hint="Ordine, sezioni nascoste e le 4 sempre visibili nella barra in basso del telefono.">
        <ul className="rule-list look-sections">{layout.order.map((key, index) => {
          const hidden = layout.hidden.includes(key);
          const fixed = key === "overview" || key === "settings";
          return <li key={key} className={hidden ? "is-muted" : undefined}>
            <strong>{SECTION_TITLES[key]}</strong>
            <span className="archived-actions">
              <button type="button" className="icon-button quiet" aria-pressed={layout.bar.includes(key)} disabled={hidden}
                aria-label={`${SECTION_TITLES[key]} nella barra del telefono`} title="Nella barra in basso del telefono" onClick={() => toggleBar(key)}><Smartphone size={15} /></button>
              <button type="button" className="icon-button quiet" disabled={fixed} aria-label={`${hidden ? "Mostra" : "Nascondi"} ${SECTION_TITLES[key]}`}
                title={fixed ? "Sempre visibile" : hidden ? "Mostra" : "Nascondi"}
                onClick={() => patch(update, "layout", { hidden: hidden ? layout.hidden.filter((item) => item !== key) : [...layout.hidden, key] })}>
                {hidden ? <EyeOff size={15} /> : <Eye size={15} />}</button>
              <button type="button" className="icon-button quiet" aria-label={`Sposta su ${SECTION_TITLES[key]}`} disabled={index === 0}
                onClick={() => patch(update, "layout", { order: move(layout.order, index, -1) })}><ArrowUp size={15} /></button>
              <button type="button" className="icon-button quiet" aria-label={`Sposta giù ${SECTION_TITLES[key]}`} disabled={index === layout.order.length - 1}
                onClick={() => patch(update, "layout", { order: move(layout.order, index, 1) })}><ArrowDown size={15} /></button>
            </span>
          </li>;
        })}</ul>
      </Row>
      <Row label="Titoli delle pagine"><Choice label="Titoli delle pagine" value={layout.titles} onChange={(titles) => patch(update, "layout", { titles })}
        options={[["large", "Grandi"], ["compact", "Compatti"], ["hidden", "Nascosti"]]} /></Row>
      <Row label="Descrizioni sotto i titoli"><Toggle label="Descrizioni sotto i titoli" checked={layout.descriptions} onChange={(descriptions) => patch(update, "layout", { descriptions })} /></Row>
    </Group>
    <Group title="Panoramica" hint="Quali riquadri vedere, in che ordine e quanto sono larghi."
      onReset={() => update((current) => ({
        ...current, behavior: { ...current.behavior, widgets: DEFAULT_APPEARANCE.behavior.widgets }, layout: { ...current.layout, columns: 2, wide: ["stats"] },
      }))}>
      <Row label="Colonne su PC"><Choice label="Colonne" value={layout.columns} onChange={(columns) => patch(update, "layout", { columns })} options={[[1, "Una"], [2, "Due"], [3, "Tre"]]} /></Row>
      <ul className="rule-list widget-list">{widgets.map((item, index) => {
        const wide = layout.wide.includes(item.key);
        const name = OVERVIEW_WIDGETS[item.key as WidgetKey];
        return <li key={item.key}>
          <label className="check-row compact"><input type="checkbox" checked={item.on}
            onChange={(event) => setWidgets(widgets.map((entry) => (entry.key === item.key ? { ...entry, on: event.target.checked } : entry)))} />
            <span><strong>{name}</strong></span></label>
          <span className="archived-actions">
            <button type="button" className="button secondary small" aria-pressed={wide} disabled={layout.columns === 1}
              onClick={() => patch(update, "layout", { wide: wide ? layout.wide.filter((key) => key !== item.key) : [...layout.wide, item.key] })}>{wide ? "Larga" : "Normale"}</button>
            <button type="button" className="icon-button quiet" aria-label={`Sposta su ${name}`} disabled={index === 0} onClick={() => setWidgets(move(widgets, index, -1))}><ArrowUp size={15} /></button>
            <button type="button" className="icon-button quiet" aria-label={`Sposta giù ${name}`} disabled={index === widgets.length - 1} onClick={() => setWidgets(move(widgets, index, 1))}><ArrowDown size={15} /></button>
          </span>
        </li>;
      })}</ul>
    </Group>
  </>;
}

export function NumbersPanel({ appearance, update }: { appearance: Appearance; update: Update }) {
  const { numbers } = appearance;
  return <Group title="Numeri e date" onReset={() => update((current) => resetSection(current, "numbers"))}>
    <Row label="Centesimi" hint={numbers.cents ? "1.234,56 €" : "1.235 € (arrotondati)"}>
      <Toggle label="Mostra i centesimi" checked={numbers.cents} onChange={(cents) => patch(update, "numbers", { cents })} /></Row>
    <Row label="Importi negativi"><Choice label="Importi negativi" value={numbers.negative} onChange={(negative) => patch(update, "numbers", { negative })}
      options={[["minus", "−12,50 €"], ["parens", "(12,50 €)"]]} /></Row>
    <Row label="Cifre abbreviate nei grafici" hint={numbers.compact ? "1,2k €" : "1.200 €"}>
      <Toggle label="Cifre abbreviate nei grafici" checked={numbers.compact} onChange={(compact) => patch(update, "numbers", { compact })} /></Row>
    <Row label="Formato delle date"><Choice label="Formato delle date" value={numbers.date} onChange={(date) => patch(update, "numbers", { date })}
      options={[["numeric", "18/11/2026"], ["short", "18 nov 2026"], ["iso", "2026-11-18"]]} /></Row>
    <Row label="La settimana inizia"><Choice label="Primo giorno della settimana" value={numbers.weekStart} onChange={(weekStart) => patch(update, "numbers", { weekStart })}
      options={[["monday", "Lunedì"], ["sunday", "Domenica"]]} /></Row>
  </Group>;
}

export function ChartsPanel({ appearance, update }: { appearance: Appearance; update: Update }) {
  const { charts } = appearance;
  return <Group title="Grafici" onReset={() => update((current) => resetSection(current, "charts"))}>
    <Row label="Colori delle categorie" hint="Per le categorie senza un colore scelto.">
      <Choice label="Tavolozza delle categorie" value={charts.palette} onChange={(palette) => patch(update, "charts", { palette })}
        options={[["default", "Classici"], ["vivid", "Vivaci"], ["pastel", "Pastello"], ["colorblind", "Per daltonici"]]} /></Row>
    <Row label="Spese per categoria"><Choice label="Spese per categoria" value={charts.spending} onChange={(spending) => patch(update, "charts", { spending })}
      options={[["donut", "Ciambella"], ["bars", "Barre"]]} /></Row>
    <Row label="Griglia"><Toggle label="Griglia nei grafici" checked={charts.grid} onChange={(grid) => patch(update, "charts", { grid })} /></Row>
    <Row label="Barre arrotondate"><Toggle label="Barre arrotondate" checked={charts.rounded} onChange={(rounded) => patch(update, "charts", { rounded })} /></Row>
  </Group>;
}
