// Impostazioni → Aspetto: editor a sottosezioni con anteprima dal vivo (le modifiche valgono subito in tutta l'app).
import { useState } from "react";
import {
  Accessibility, BarChart3, Brush, Hash, Image, LayoutPanelLeft, Palette, Save, Shapes, Sparkles, Type, type LucideIcon,
} from "lucide-react";
import { useAppearance } from "./controls";
import { ColorsPanel, ThemesPanel } from "./colors";
import { BackgroundPanel, ShapePanel, TypePanel } from "./style-panels";
import { ChartsPanel, NumbersPanel, StructurePanel } from "./layout-panels";
import { AccessPanel, BehaviorPanel, BrandPanel, ManagePanel } from "./extra-panels";

type Part = "themes" | "colors" | "background" | "type" | "shape" | "structure" | "numbers" | "charts" | "access" | "brand" | "manage";

const PARTS: [Part, string, LucideIcon][] = [
  ["themes", "Temi", Sparkles], ["colors", "Colori", Palette], ["background", "Sfondo", Image], ["type", "Caratteri", Type],
  ["shape", "Forme", Shapes], ["structure", "Struttura", LayoutPanelLeft], ["numbers", "Numeri e date", Hash], ["charts", "Grafici", BarChart3],
  ["access", "Accessibilità", Accessibility], ["brand", "Nome e logo", Brush], ["manage", "Salva e ripristina", Save],
];

/** Piccolo campione dell'app: si aggiorna mentre modifichi. */
function Preview() {
  return <aside className="look-preview" aria-label="Anteprima">
    <div className="look-preview-head"><span className="brand-mark look-preview-mark" /><strong>Anteprima</strong></div>
    <div className="stat look-preview-stat">
      <div className="stat-heading"><span>Spese del mese</span></div>
      <strong className="stat-value">1.234,56 €</strong>
      <span className="stat-caption">32 spese registrate</span>
    </div>
    <ul className="look-preview-rows">
      <li><span>Stipendio</span><b className="entry-amount amount-income">+1.850,00 €</b></li>
      <li><span>Supermercato</span><b className="entry-amount amount-expense">−95,88 €</b></li>
      <li><span>Ricarica carta</span><b className="entry-amount amount-transfer">300,00 €</b></li>
    </ul>
    <div className="look-preview-actions">
      <button type="button" className="button primary small" tabIndex={-1}>Salva</button>
      <button type="button" className="button secondary small" tabIndex={-1}>Annulla</button>
      <span className="tag amount-tag">Budget 80%</span>
    </div>
  </aside>;
}

export function AppearanceEditor() {
  const [appearance, update] = useAppearance();
  const [part, setPart] = useState<Part>("themes");
  const dark = document.documentElement.classList.contains("dark");
  const props = { appearance, update, dark };
  return <div className="look-editor">
    <nav className="look-parts" aria-label="Parti dell’aspetto">
      {PARTS.map(([key, title, Icon]) => <button type="button" key={key} aria-current={part === key ? "true" : undefined} onClick={() => setPart(key)}>
        <Icon size={16} /> {title}</button>)}
    </nav>
    <div className="look-body">
      <section className="panel look-panel">
        {part === "themes" && <ThemesPanel {...props} />}
        {part === "colors" && <ColorsPanel {...props} />}
        {part === "background" && <BackgroundPanel {...props} />}
        {part === "type" && <TypePanel {...props} />}
        {part === "shape" && <ShapePanel {...props} />}
        {part === "structure" && <><StructurePanel {...props} /><BehaviorPanel {...props} /></>}
        {part === "numbers" && <NumbersPanel {...props} />}
        {part === "charts" && <ChartsPanel {...props} />}
        {part === "access" && <AccessPanel {...props} />}
        {part === "brand" && <BrandPanel {...props} />}
        {part === "manage" && <ManagePanel {...props} />}
      </section>
      <Preview />
    </div>
  </div>;
}
