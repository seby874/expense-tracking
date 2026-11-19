// Impostazioni divise in schede (2.1): prima erano una ventina di pannelli in un'unica colonna.
import { useState, type CSSProperties, type ReactNode } from "react";
import {
  Archive, ArrowDown, ArrowDownToLine, ArrowUp, ArrowUpDown, Blocks, ChevronRight, CircleHelp, DatabaseBackup, FileUp, FolderCog, KeyRound,
  Palette, Pencil, Plus, ShieldCheck, SlidersHorizontal, Timer, type LucideIcon,
} from "lucide-react";
import { categoryColor, subcategoryList, subcategoryUsage, type Account, type Label, type Ledger, type Mutation, type Template } from "../lib/ledger";
import type { TrashItem } from "../lib/ledger-sync";
import { IDLE_OPTIONS } from "../lib/config";
import { idleLabel } from "../lib/session";
import { PanelTitle, type SessionInfo } from "./ledger-views";
import {
  FavoritesPanel, OrganizePanel, PanelHead, PeriodPanel, ResetPanel, TagsPanel, TrashPanel, reorderActions,
} from "./settings-extra";
import { StyleIcon, toneClass } from "./style";
import { AppearanceEditor } from "./appearance/editor";

export type SettingsTab = "general" | "look" | "features" | "data" | "security";

const TABS: [SettingsTab, string, LucideIcon][] = [
  ["general", "Generali", SlidersHorizontal],
  ["look", "Aspetto", Palette],
  ["features", "Funzioni", Blocks],
  ["data", "Dati e backup", FolderCog],
  ["security", "Sicurezza", ShieldCheck],
];

/** Pannelli costruiti da LedgerApp (hanno bisogno del suo stato) e messi nella scheda giusta. */
export interface SettingsPanels {
  health?: ReactNode;
  modules: ReactNode;
  people: ReactNode;
  fund?: ReactNode;
  params: ReactNode;
  deductions: ReactNode;
  backup: ReactNode;
  dossier: ReactNode;
  archive: ReactNode;
}

interface SettingsProps {
  ledger: Ledger; session: SessionInfo; busy: boolean; demo: boolean; trash: TrashItem[];
  tab: SettingsTab; onTab: (tab: SettingsTab) => void; panels: SettingsPanels;
  onLabel: (type: "expense" | "income", label?: Label) => void; onStyle: (record: Account | Label) => void; onReset: () => void;
  onExport: () => void; onBalancesExport: () => void; onBackup: () => void; onRestore: () => void; onDemo: () => void;
  onCommit: (actions: Mutation[], message: string) => void; onTemplate: (template?: Template) => void;
  onRestoreTrash: (items: TrashItem[]) => void; onPurgeTrash: (items: TrashItem[]) => void;
}

function SecurityPanel({ session }: { session: SessionInfo }) {
  const [status, setStatus] = useState<"idle" | "sending" | "sent" | "error">("idle");

  async function sendPasswordEmail() {
    setStatus("sending");
    try {
      await session.onPasswordEmail();
      setStatus("sent");
    } catch {
      setStatus("error");
    }
  }

  const passwordText = status === "sent" ? `Email inviata a ${session.email}. Apri il link per scegliere la nuova password.`
    : status === "error" ? "Invio non riuscito. Riprova tra qualche minuto."
    : `Ricevi su ${session.email || "la tua email"} un link per sceglierne una nuova.`;

  return <section className="panel security-panel">
    <PanelHead icon={<ShieldCheck size={18} />} title="Sicurezza e sessione" subtitle="La disconnessione automatica vale per questo browser e dispositivo." />
    <ul className="security-list">
      <li>
        <span className="security-icon"><Timer size={18} /></span>
        <div><strong>Disconnessione per inattività</strong>
          <p>{session.idleMinutes
            ? "Se non usi l’app per il tempo scelto esci in automatico. Poco prima compare un avviso."
            : "Disattivata: la sessione resta aperta finché non premi Esci. Sconsigliato su dispositivi condivisi."}</p></div>
        <label><span className="sr-only">Disconnetti dopo</span>
          <select value={session.idleMinutes} onChange={(event) => session.onIdleChange(Number(event.target.value))}>
            {IDLE_OPTIONS.map((minutes) => <option key={minutes} value={minutes}>{minutes ? `Dopo ${idleLabel(minutes)}` : "Disattivata"}</option>)}
          </select></label>
      </li>
      <li>
        <span className="security-icon"><KeyRound size={18} /></span>
        <div><strong>Password</strong><p role={status === "idle" ? undefined : "status"}>{passwordText}</p></div>
        <button type="button" className="button secondary" onClick={() => void sendPasswordEmail()}
          disabled={!session.email || status === "sending" || status === "sent"}>
          {status === "sending" ? "Invio…" : status === "sent" ? "Email inviata" : "Cambia password"}
        </button>
      </li>
    </ul>
  </section>;
}

/**
 * Categorie di spesa o fonti di entrata: nome, sottocategorie, aspetto e ordine nello stesso pannello
 * (prima ordine e aspetto stavano in un pannello a parte con le stesse voci).
 */
function CategoryTree({ ledger, type, busy, onLabel, onStyle, onCommit }: {
  ledger: Ledger; type: "expense" | "income"; busy: boolean;
  onLabel: (type: "expense" | "income", label?: Label) => void; onStyle: (record: Label) => void;
  onCommit: (actions: Mutation[], message: string) => void;
}) {
  const [sorting, setSorting] = useState(false);
  const labels = ledger.labels.filter((label) => label.value.type === type);
  const active = labels.filter((label) => !label.value.archived);
  const archived = labels.filter((label) => label.value.archived);
  const expense = type === "expense";
  const move = (index: number, step: -1 | 1) => onCommit(reorderActions(active, index, step), "Ordine aggiornato.");

  // Senza colore scelto, il pallino usa lo stesso colore dei grafici (posizione nell'elenco), non più un grigio uguale per tutte.
  const chartTone = (label: Label) => (toneClass(label.value.color) ? undefined : { "--tone": categoryColor(labels.indexOf(label)) } as CSSProperties);
  const mark = (label: Label) => <span className={`label-mark${toneClass(label.value.color)}`} style={chartTone(label)} aria-hidden="true"><StyleIcon icon={label.value.icon} size={13} /></span>;
  const sortRow = (label: Label, index: number) => <li key={label.id} className="tree-leaf">
    <span>{mark(label)}{label.value.name}</span>
    <span className="archived-actions">
      <button type="button" className="icon-button quiet" aria-label={`Sposta su ${label.value.name}`} disabled={busy || index === 0} onClick={() => move(index, -1)}><ArrowUp size={15} /></button>
      <button type="button" className="icon-button quiet" aria-label={`Sposta giù ${label.value.name}`} disabled={busy || index === active.length - 1} onClick={() => move(index, 1)}><ArrowDown size={15} /></button>
    </span>
  </li>;
  const row = (label: Label) => {
    const subs = expense ? subcategoryList(ledger, label.id) : [];
    const look = <button type="button" className="icon-button quiet" aria-label={`Colore e icona di ${label.value.name}`} title="Colore e icona"
      onClick={(event) => { event.preventDefault(); onStyle(label); }}><Palette size={16} /></button>;
    const edit = <button type="button" className="icon-button quiet" aria-label={`Modifica ${label.value.name}`}
      title={expense ? "Modifica nome e sottocategorie" : "Modifica"} onClick={(event) => { event.preventDefault(); onLabel(type, label); }}><Pencil size={16} /></button>;
    if (!expense) return <li key={label.id} className="tree-leaf"><span>{mark(label)}{label.value.name}</span><span className="archived-actions">{look}{edit}</span></li>;
    return <li key={label.id}>
      <details className="tree-node">
        <summary><ChevronRight size={15} className="tree-chevron" /><span>{mark(label)}{label.value.name}</span>
          <span className="tree-count" title="Sottocategorie">{subs.length}</span>{look}{edit}</summary>
        {subs.length ? <ul className="tree-children">{subs.map((name) => {
          const used = subcategoryUsage(ledger, label.id, name).length;
          return <li key={name}><span>{name}</span>{used > 0 && <small>{used} {used === 1 ? "movimento" : "movimenti"}</small>}</li>;
        })}</ul> : <p className="tree-empty">Nessuna sottocategoria.</p>}
        <button type="button" className="text-button tree-manage" onClick={() => onLabel(type, label)}><Pencil size={14} /> Gestisci sottocategorie</button>
      </details>
    </li>;
  };
  return <section className="panel label-panel">
    <PanelTitle title={expense ? "Categorie di spesa" : "Fonti di entrata"}
      subtitle={sorting ? "Usa le frecce per cambiare l’ordine: vale su tutti i dispositivi."
        : expense ? "Tocca una categoria per le sottocategorie." : "Come raggruppare le tue entrate."}
      action={<span className="archived-actions">
        {active.length > 1 && <button type="button" className="button secondary small" aria-pressed={sorting} onClick={() => setSorting((value) => !value)}>
          <ArrowUpDown size={15} /> {sorting ? "Fatto" : "Ordina"}</button>}
        {!sorting && <button type="button" className="button secondary small" onClick={() => onLabel(type)}><Plus size={15} /> Aggiungi</button>}
      </span>} />
    <ul className={expense && !sorting ? "label-list category-tree" : "label-list"}>{sorting ? active.map(sortRow) : active.map(row)}</ul>
    {archived.length > 0 && !sorting && <details className="archived-block">
      <summary><Archive size={15} /> Archiviate ({archived.length})</summary>
      <ul className="archived-list">{archived.map((label) => <li key={label.id}><span>{label.value.name}</span>
        <button type="button" className="text-button" onClick={() => onLabel(type, label)}>Gestisci</button></li>)}</ul>
    </details>}
  </section>;
}

function DataPanel({ ledger, onExport, onBalancesExport, onBackup, onRestore, onDemo }: Pick<SettingsProps, "ledger" | "onExport" | "onBalancesExport" | "onBackup" | "onRestore" | "onDemo">) {
  return <section className="panel export-panel">
    <PanelHead icon={<DatabaseBackup size={18} />} title="I tuoi dati" subtitle="Esporta in CSV, scarica un backup completo o ripristinalo." />
    <div className="export-actions">
      <button type="button" className="button secondary" onClick={onBackup}><DatabaseBackup size={17} /> Backup completo</button>
      <button type="button" className="button secondary" onClick={onRestore}><FileUp size={17} /> Ripristina backup</button>
      <button type="button" className="button secondary" onClick={onExport} disabled={!ledger.movements.length}
        title={ledger.movements.length ? undefined : "Nessun movimento da esportare"}><ArrowDownToLine size={17} /> Esporta movimenti</button>
      <button type="button" className="button secondary" onClick={onBalancesExport} disabled={!ledger.balances.length}
        title={ledger.balances.length ? undefined : "Nessun saldo da esportare"}><ArrowDownToLine size={17} /> Esporta saldi</button>
      <button type="button" className="button secondary" onClick={onDemo}>Prova con dati di esempio</button>
    </div>
    <p className="panel-note"><CircleHelp size={16} /> Il backup completo (.zip, oppure .etbackup se cifrato con password) contiene tutto: movimenti, saldi, conti, categorie, ricorrenti e preferiti. È il file giusto per spostare tutto su un altro account; i CSV servono per i fogli di calcolo.</p>
  </section>;
}

export function Settings(props: SettingsProps) {
  const { ledger, session, busy, demo, trash, tab, onTab, panels, onLabel, onStyle, onCommit } = props;
  return <>
    <div className="settings-tabs" role="tablist" aria-label="Sezioni delle impostazioni">
      {TABS.map(([key, title, Icon], index) => <button type="button" role="tab" key={key} id={`settings-tab-${key}`} aria-selected={tab === key}
        aria-controls="settings-panel" tabIndex={tab === key ? 0 : -1} onClick={() => onTab(key)}
        onKeyDown={(event) => {
          // Schede accessibili da tastiera: frecce, Home e Fine spostano la scheda e il fuoco.
          const last = TABS.length - 1;
          const next = event.key === "ArrowRight" ? (index === last ? 0 : index + 1) : event.key === "ArrowLeft" ? (index === 0 ? last : index - 1)
            : event.key === "Home" ? 0 : event.key === "End" ? last : null;
          if (next === null) return;
          event.preventDefault();
          onTab(TABS[next][0]);
          document.getElementById(`settings-tab-${TABS[next][0]}`)?.focus();
        }}><Icon size={16} /> {title}</button>)}
    </div>
    <div id="settings-panel" role="tabpanel" aria-labelledby={`settings-tab-${tab}`} className="settings-stack">
      {tab === "general" && <>
        <div className="split settings-grid">
          <CategoryTree ledger={ledger} type="expense" busy={busy} onLabel={onLabel} onStyle={onStyle} onCommit={onCommit} />
          <CategoryTree ledger={ledger} type="income" busy={busy} onLabel={onLabel} onStyle={onStyle} onCommit={onCommit} />
        </div>
        <OrganizePanel ledger={ledger} busy={busy} onCommit={onCommit} onStyle={onStyle} />
        <FavoritesPanel ledger={ledger} busy={busy} onEdit={props.onTemplate} onCommit={onCommit} />
        <PeriodPanel ledger={ledger} busy={busy} demo={demo} onCommit={onCommit} />
        <TagsPanel ledger={ledger} onCommit={onCommit} busy={busy} />
      </>}
      {tab === "look" && <AppearanceEditor />}
      {tab === "features" && <>
        {panels.modules}
        {panels.people}
        {panels.fund}
        {panels.params}
        {panels.deductions}
      </>}
      {tab === "data" && <>
        {panels.health}
        <DataPanel {...props} />
        {panels.backup}
        {panels.archive}
        <TrashPanel ledger={ledger} trash={trash} busy={busy} demo={demo} onRestore={props.onRestoreTrash} onPurge={props.onPurgeTrash} />
        {panels.dossier}
        <ResetPanel demo={demo} onReset={props.onReset} />
      </>}
      {tab === "security" && <SecurityPanel session={session} />}
    </div>
  </>;
}
