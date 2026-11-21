// Accessibilità, marchio, comportamento all'apertura e gestione del tema (file, ripristino).
import { useRef, useState, type ChangeEvent } from "react";
import { Download, FileUp, RotateCcw } from "lucide-react";
import { BRAND_ICONS, DEFAULT_APPEARANCE, normalizeAppearance, resetSection, type Appearance } from "../../lib/appearance";
import { downloadFile } from "../../lib/data-io";
import { disableNotifications, enableNotifications, notificationsOn, notificationsSupported } from "../../lib/notify";
import { BrandGlyph } from "../brand";
import { ColorField, Choice, Group, Row, Toggle, patch, type Update } from "./controls";

const FILE_TYPE = "expense-tracking-aspetto";

export function AccessPanel({ appearance, update }: { appearance: Appearance; update: Update }) {
  const { access } = appearance;
  return <Group title="Accessibilità e movimento" onReset={() => update((current) => resetSection(current, "access"))}>
    <Row label="Animazioni"><Choice label="Animazioni" value={access.motion} onChange={(motion) => patch(update, "access", { motion })}
      options={[["full", "Tutte"], ["reduced", "Rapide"], ["none", "Nessuna"]]} /></Row>
    <Row label="Pulsanti più grandi" hint="Più facili da toccare.">
      <Toggle label="Pulsanti più grandi" checked={access.targets === "large"} onChange={(on) => patch(update, "access", { targets: on ? "large" : "normal" })} /></Row>
    <Row label="Contorno ben visibile" hint="Sull’elemento selezionato con la tastiera.">
      <Toggle label="Contorno ben visibile" checked={access.focus === "strong"} onChange={(on) => patch(update, "access", { focus: on ? "strong" : "normal" })} /></Row>
    <Row label="Collegamenti sottolineati"><Toggle label="Collegamenti sottolineati" checked={access.underline} onChange={(underline) => patch(update, "access", { underline })} /></Row>
    <Row label="Simboli su entrate e spese" hint="▲ entrate, ▼ spese: non serve distinguere i colori.">
      <Toggle label="Simboli su entrate e spese" checked={access.symbols} onChange={(symbols) => patch(update, "access", { symbols })} /></Row>
  </Group>;
}

export function BrandPanel({ appearance, update }: { appearance: Appearance; update: Update }) {
  const { brand } = appearance;
  const [name, setName] = useState(brand.name);
  const sidebarAccent = appearance.theme.light["sidebar-accent"];
  return <Group title="Nome e logo" hint="Come si chiama l’app e il suo simbolo (nel menu e nella scheda del browser)."
    onReset={() => { setName(DEFAULT_APPEARANCE.brand.name); update((current) => resetSection(current, "brand")); }}>
    <Row label="Nome dell’app">
      <input value={name} maxLength={30} onChange={(event) => setName(event.target.value)}
        onBlur={() => patch(update, "brand", { name: name.trim() || DEFAULT_APPEARANCE.brand.name })} /></Row>
    <Row label="Simbolo"><div className="brand-icons" role="group" aria-label="Simbolo dell’app">
      {BRAND_ICONS.map((icon) => <button type="button" key={icon} className="icon-choice" aria-pressed={brand.icon === icon} aria-label={icon}
        onClick={() => patch(update, "brand", { icon })}><BrandGlyph icon={icon} /></button>)}</div></Row>
    <Row label="Colore del logo" hint={brand.color ? undefined : "Segue il tema."}>
      <span className="look-inline"><ColorField label="Colore del logo" value={brand.color ?? sidebarAccent} onChange={(color) => patch(update, "brand", { color })} />
        {brand.color && <button type="button" className="text-button" onClick={() => patch(update, "brand", { color: null })}>Come il tema</button>}</span></Row>
  </Group>;
}

export function BehaviorPanel({ appearance, update }: { appearance: Appearance; update: Update }) {
  const { behavior } = appearance;
  return <Group title="All’apertura">
    <Row label="Schermata d’apertura"><select aria-label="Schermata d’apertura" value={behavior.start}
      onChange={(event) => patch(update, "behavior", { start: event.target.value as Appearance["behavior"]["start"] })}>
      {([["overview", "Panoramica"], ["movements", "Movimenti"], ["accounts", "Patrimonio"], ["reports", "Analisi"], ["quick", "Inserimento veloce"]] as const)
        .map(([value, title]) => <option key={value} value={value}>{title}</option>)}</select></Row>
    <Row label="Modalità discreta" hint="Importi nascosti (••• €) finché non premi l’occhio in alto.">
      <Toggle label="Modalità discreta all’apertura" checked={behavior.discreet} onChange={(discreet) => patch(update, "behavior", { discreet })} /></Row>
    <Row label="Promemoria in Panoramica" hint="Giorni senza movimenti e saldi di fine mese da registrare.">
      <Toggle label="Promemoria" checked={behavior.reminders} onChange={(reminders) => patch(update, "behavior", { reminders })} /></Row>
    <NotificationsRow />
  </Group>;
}

/** Notifica del giorno: vale solo per questo dispositivo, perché il permesso lo dà il telefono o il browser. */
function NotificationsRow() {
  const [on, setOn] = useState(notificationsOn);
  const [message, setMessage] = useState("");
  if (!notificationsSupported()) return <Row label="Notifiche" hint="Questo browser non le permette."><span /></Row>;
  async function toggle(next: boolean) {
    setMessage("");
    if (!next) { disableNotifications(); setOn(false); return; }
    const permission = await enableNotifications();
    setOn(permission === "granted");
    if (permission !== "granted") setMessage("Permesso negato: puoi concederlo dalle impostazioni del sito nel browser.");
  }
  return <Row label="Notifiche su questo dispositivo"
    hint={message || "Una al giorno, quando apri l’app: ricorrenti da registrare, scadenze di oggi o superate, saldi del mese. Ad app chiusa non arrivano."}>
    <Toggle label="Notifiche su questo dispositivo" checked={on} onChange={(next) => void toggle(next)} /></Row>;
}

export function ManagePanel({ appearance, update }: { appearance: Appearance; update: Update }) {
  const input = useRef<HTMLInputElement>(null);
  const [message, setMessage] = useState("");

  function exportTheme() {
    downloadFile("aspetto-expense-tracking.json", JSON.stringify({ type: FILE_TYPE, version: 1, appearance }, null, 2), "application/json");
    setMessage("File dell’aspetto scaricato.");
  }

  async function importTheme(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    try {
      if (file.size > 200_000) throw new Error("file troppo grande");
      const data = JSON.parse(await file.text()) as { type?: string; appearance?: unknown };
      if (data.type !== FILE_TYPE || !data.appearance) throw new Error("non è un file dell’aspetto di Expense Tracking");
      update(() => normalizeAppearance(data.appearance));
      setMessage("Aspetto importato e applicato su tutti i dispositivi.");
    } catch (error) {
      setMessage(`Importazione non riuscita: ${error instanceof Error ? error.message : "file non valido"}.`);
    }
  }

  return <Group title="Salva e ripristina" hint="L’aspetto è già nel backup completo. Qui puoi anche scaricarlo da solo, per esempio per riusarlo più avanti.">
    <div className="export-actions">
      <button type="button" className="button secondary" onClick={exportTheme}><Download size={16} /> Scarica l’aspetto</button>
      <button type="button" className="button secondary" onClick={() => input.current?.click()}><FileUp size={16} /> Carica un aspetto</button>
      <button type="button" className="button secondary" onClick={() => { update(() => DEFAULT_APPEARANCE); setMessage("Aspetto originale ripristinato."); }}>
        <RotateCcw size={16} /> Ripristina tutto l’aspetto</button>
      <input ref={input} type="file" accept="application/json,.json" hidden onChange={(event) => void importTheme(event)} />
    </div>
    {message && <p className="panel-note" role="status">{message}</p>}
    <p className="panel-note">Se l’app diventasse illeggibile, apri l’indirizzo dell’app aggiungendo <code>?aspetto=reset</code> alla fine: torna l’aspetto originale.</p>
  </Group>;
}
