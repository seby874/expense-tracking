import { useEffect, useState, type ChangeEvent, type ReactNode } from "react";
import {
  ArrowDown, ArrowUp, CalendarRange, CircleAlert, DatabaseBackup, EyeOff, FileUp, Keyboard, LayoutGrid, Palette, Pencil, Plus,
  RotateCcw, Star, Tag, Trash2, TriangleAlert, Type,
} from "lucide-react";
import {
  NO_VERSION, ENTRY_TYPES, allTags, hasTag, money, monthLabel, sameName, shortDate,
  todayInRome,
  type Account, type Label, type Ledger, type LedgerRecord, type Mutation, type Template,
} from "../lib/ledger";
import { OVERVIEW_WIDGETS, readWidgets, saveWidgets, type WidgetPref } from "../lib/preferences";
import { ACCENTS, StyleIcon, StylePicker, toneClass } from "./style";
import { AccountGlyph } from "./ledger-views";
import type { TrashItem } from "../lib/ledger-sync";
import { planRestore, type RestorePlan } from "../lib/data-io";
import { readLook, saveLook, type Density, type LookPrefs, type StartScreen, type TextSize } from "../lib/preferences";
import { FormError } from "./ledger-forms";
import { cleanTag } from "./tags";

function PanelHead({ icon, title, subtitle, action }: { icon: ReactNode; title: string; subtitle: string; action?: ReactNode }) {
  return <div className="panel-heading">
    <div><h2 className="heading-with-icon">{icon} {title}</h2><p>{subtitle}</p></div>
    {action}
  </div>;
}


// ---------------------------------------------------------------- Preferiti

export function templateSummary(ledger: Ledger, template: Template) {
  const value = template.value;
  const names = new Map([...ledger.accounts, ...ledger.labels].map((item) => [item.id, item.value.name]));
  const where = value.type === "transfer" ? `${names.get(value.accountId ?? "") ?? "?"} → ${names.get(value.toAccountId ?? "") ?? "?"}`
    : [names.get(value.labelId ?? ""), value.subcategory, value.accountId ? names.get(value.accountId) : ""].filter(Boolean).join(" · ");
  return `${ENTRY_TYPES[value.type]} · ${where}`;
}

export function FavoritesPanel({ ledger, busy, onEdit, onCommit }: {
  ledger: Ledger; busy: boolean; onEdit: (template?: Template) => void; onCommit: (actions: Mutation[], message: string) => void;
}) {
  const list = ledger.templates;

  /** Sposta un preferito di una posizione: si riscrivono solo quelli che cambiano posto. */
  function move(index: number, step: -1 | 1) {
    const order = [...list];
    const [item] = order.splice(index, 1);
    order.splice(index + step, 0, item);
    const actions: Mutation[] = order.flatMap((template, position) => (template.value.order === position ? []
      : [{ op: "save" as const, record: { ...template, value: { ...template.value, order: position } } }]));
    onCommit(actions, "Ordine dei preferiti aggiornato.");
  }

  return <section className="panel settings-extra">
    <PanelHead icon={<Star size={18} />} title="Preferiti" subtitle="Movimenti che registri spesso: li trovi in cima all’inserimento veloce (pulsante +)."
      action={<button type="button" className="button secondary" onClick={() => onEdit()}><Plus size={16} /> Nuovo</button>} />
    {list.length ? <ul className="rule-list">{list.map((template, index) => <li key={template.id}>
      <div><strong>{template.value.name}</strong>
        <small>{templateSummary(ledger, template)} · {template.value.amount ? money(template.value.amount) : "importo da scegliere"}</small></div>
      <span className="archived-actions">
        <button type="button" className="icon-button quiet" aria-label={`Sposta su ${template.value.name}`} disabled={busy || index === 0} onClick={() => move(index, -1)}><ArrowUp size={15} /></button>
        <button type="button" className="icon-button quiet" aria-label={`Sposta giù ${template.value.name}`} disabled={busy || index === list.length - 1} onClick={() => move(index, 1)}><ArrowDown size={15} /></button>
        <button type="button" className="icon-button quiet" aria-label={`Modifica ${template.value.name}`} onClick={() => onEdit(template)}><Pencil size={15} /></button>
        <button type="button" className="icon-button quiet" aria-label={`Elimina ${template.value.name}`} disabled={busy}
          onClick={() => onCommit([{ op: "delete", kind: "template", id: template.id, version: template.version ?? NO_VERSION }], `Preferito «${template.value.name}» eliminato.`)}><Trash2 size={15} /></button>
      </span>
    </li>)}</ul> : <p className="panel-note">Nessun preferito. Crealo qui oppure spunta «Salva anche come preferito» quando registri un movimento.</p>}
  </section>;
}

// ---------------------------------------------------------------- Cestino

export const TRASH_DAYS = 30;
const TRASH_KINDS = new Set(["movement", "balance", "account", "label", "recurring", "template"]);

export function visibleTrash(trash: TrashItem[], now = Date.now()) {
  return trash.filter((item) => TRASH_KINDS.has(item.record.kind) && (item.deletedAt === null || now - item.deletedAt < TRASH_DAYS * 86_400_000));
}

function trashText(ledger: Ledger, record: LedgerRecord): [string, string] {
  const name = (id: string) => ledger.accounts.find((account) => account.id === id)?.value.name ?? "conto eliminato";
  switch (record.kind) {
    case "movement": return [record.value.title, `${ENTRY_TYPES[record.value.type]} · ${money(record.value.amount)} · ${shortDate(record.value.date)}`];
    case "balance": return [`Saldo ${name(record.value.accountId)}`, `${monthLabel(record.value.month)} · ${money(record.value.amount)}`];
    case "account": return [record.value.name, "Conto"];
    case "label": return [record.value.name, record.value.type === "expense" ? "Categoria di spesa" : "Fonte di entrata"];
    case "recurring": return [record.value.template.title, "Movimento ricorrente"];
    case "template": return [record.value.name, "Preferito"];
    default: return [record.id, record.kind];
  }
}

export function TrashPanel({ ledger, trash, busy, demo, onRestore, onPurge }: {
  ledger: Ledger; trash: TrashItem[]; busy: boolean; demo: boolean;
  onRestore: (items: TrashItem[]) => void; onPurge: (items: TrashItem[]) => void;
}) {
  const items = visibleTrash(trash);
  const [confirm, setConfirm] = useState(false);
  return <section className="panel settings-extra">
    <PanelHead icon={<Trash2 size={18} />} title="Cestino" subtitle={`Le voci eliminate restano qui per ${TRASH_DAYS} giorni, poi spariscono.`}
      action={items.length > 1 ? <button type="button" className="text-button" disabled={busy} onClick={() => onRestore(items)}><RotateCcw size={15} /> Ripristina tutto</button> : undefined} />
    {demo ? <p className="panel-note">Con i dati di esempio il cestino non è disponibile.</p>
      : !items.length ? <p className="panel-note">Il cestino è vuoto.</p>
      : <>
        <ul className="rule-list trash-list">{items.slice(0, 50).map((item) => {
          const [title, detail] = trashText(ledger, item.record);
          return <li key={`${item.record.kind}:${item.record.id}`}>
            <div><strong>{title}</strong><small>{detail} · {item.deletedAt ? `eliminato il ${new Date(item.deletedAt).toLocaleDateString("it-IT")}` : "eliminazione in attesa di sincronizzazione"}</small></div>
            <span className="archived-actions">
              <button type="button" className="text-button" disabled={busy} onClick={() => onRestore([item])}><RotateCcw size={14} /> Ripristina</button>
              <button type="button" className="icon-button quiet" aria-label={`Elimina definitivamente ${title}`} disabled={busy} onClick={() => onPurge([item])}><Trash2 size={15} /></button>
            </span>
          </li>;
        })}</ul>
        {items.length > 50 && <p className="panel-note">…e altre {items.length - 50} voci.</p>}
        <div className="trash-foot">{confirm
          ? <><span>Eliminare per sempre {items.length === 1 ? "questa voce" : `queste ${items.length} voci`}?</span>
            <button type="button" className="button secondary small" onClick={() => setConfirm(false)}>Annulla</button>
            <button type="button" className="button danger small" disabled={busy} onClick={() => { setConfirm(false); onPurge(items); }}>Svuota</button></>
          : <button type="button" className="text-button danger-text" disabled={busy} onClick={() => setConfirm(true)}>Svuota il cestino</button>}</div>
      </>}
  </section>;
}

// ---------------------------------------------------------------- Personalizzazione

const START_SCREENS: [StartScreen, string][] = [["overview", "Panoramica"], ["movements", "Movimenti"], ["accounts", "Patrimonio"], ["reports", "Analisi"], ["quick", "Inserimento veloce"]];

export function PersonalPanel() {
  const [look, setLook] = useState<LookPrefs>(readLook);
  const update = (change: Partial<LookPrefs>) => { const next = { ...look, ...change }; setLook(next); saveLook(next); };
  return <section className="panel device-panel">
    <PanelHead icon={<LayoutGrid size={18} />} title="Personalizzazione" subtitle="Valgono solo per questo browser." />
    <ul className="security-list">
      <li>
        <span className="security-icon"><LayoutGrid size={18} /></span>
        <div><strong>Schermata d’apertura</strong><p>Cosa vedi appena apri l’app.</p></div>
        <label><span className="sr-only">Schermata d’apertura</span>
          <select value={look.start} onChange={(event) => update({ start: event.target.value as StartScreen })}>
            {START_SCREENS.map(([value, title]) => <option key={value} value={value}>{title}</option>)}
          </select></label>
      </li>
      <li>
        <span className="security-icon"><EyeOff size={18} /></span>
        <div><strong>Modalità discreta all’apertura</strong><p>Gli importi restano nascosti (••• €) finché non premi l’occhio in alto. Comoda in pubblico.</p></div>
        <label className="switch"><input type="checkbox" checked={look.discreet} onChange={(event) => update({ discreet: event.target.checked })} />
          <span aria-hidden="true" /><span className="sr-only">Modalità discreta all’apertura</span></label>
      </li>
      <li>
        <span className="security-icon"><LayoutGrid size={18} /></span>
        <div><strong>Densità</strong><p>{look.density === "compact" ? "Più informazioni nello stesso spazio." : "Spazi ampi, più leggibile."}</p></div>
        <div className="segmented" role="group" aria-label="Densità">
          {([["comfortable", "Comoda"], ["compact", "Compatta"]] as [Density, string][]).map(([value, title]) =>
            <button type="button" key={value} aria-pressed={look.density === value} onClick={() => update({ density: value })}>{title}</button>)}
        </div>
      </li>
      <li>
        <span className="security-icon"><Type size={18} /></span>
        <div><strong>Dimensione del testo</strong><p>{look.text === "large" ? "Testo e controlli più grandi." : "Dimensione standard."}</p></div>
        <div className="segmented" role="group" aria-label="Dimensione del testo">
          {([["normal", "Normale"], ["large", "Grande"]] as [TextSize, string][]).map(([value, title]) =>
            <button type="button" key={value} aria-pressed={look.text === value} onClick={() => update({ text: value })}>{title}</button>)}
        </div>
      </li>
      <li>
        <span className="security-icon"><Palette size={18} /></span>
        <div><strong>Colore principale</strong><p>Pulsanti, evidenziazioni e collegamenti.</p></div>
        <div className="swatches" role="group" aria-label="Colore principale">
          {ACCENTS.map(([key, title]) => <button type="button" key={key} className={`swatch accent-${key}`} aria-pressed={look.accent === key}
            aria-label={title} title={title} onClick={() => update({ accent: key })} />)}
        </div>
      </li>
      <li>
        <span className="security-icon"><CircleAlert size={18} /></span>
        <div><strong>Promemoria</strong><p>In Panoramica: giorni senza movimenti, saldi di fine mese da registrare, backup da scaricare.</p></div>
        <label className="switch"><input type="checkbox" checked={look.reminders} onChange={(event) => update({ reminders: event.target.checked })} />
          <span aria-hidden="true" /><span className="sr-only">Promemoria</span></label>
      </li>
      <li>
        <span className="security-icon"><Keyboard size={18} /></span>
        <div><strong>Scorciatoie da tastiera</strong>
          <p><kbd>N</kbd> nuovo movimento · <kbd>V</kbd> spesa veloce · <kbd>/</kbd> cerca · <kbd>1</kbd>–<kbd>5</kbd> sezioni · <kbd>D</kbd> modalità discreta · <kbd>Esc</kbd> chiude</p></div>
      </li>
    </ul>
  </section>;
}

// ---------------------------------------------------------------- Panoramica a scelta

export function OverviewPanel() {
  const [list, setList] = useState<WidgetPref[]>(readWidgets);
  const store = (next: WidgetPref[]) => { setList(next); saveWidgets(next); };
  const move = (index: number, step: -1 | 1) => {
    const next = [...list];
    const [item] = next.splice(index, 1);
    next.splice(index + step, 0, item);
    store(next);
  };
  return <section className="panel settings-extra">
    <PanelHead icon={<LayoutGrid size={18} />} title="Panoramica" subtitle="Scegli quali riquadri vedere e in che ordine (solo su questo dispositivo)." />
    <ul className="rule-list widget-list">{list.map((item, index) => <li key={item.key}>
      <label className="check-row compact"><input type="checkbox" checked={item.on} onChange={(event) => store(list.map((entry) => entry.key === item.key ? { ...entry, on: event.target.checked } : entry))} />
        <span><strong>{OVERVIEW_WIDGETS[item.key]}</strong></span></label>
      <span className="archived-actions">
        <button type="button" className="icon-button quiet" aria-label={`Sposta su ${OVERVIEW_WIDGETS[item.key]}`} disabled={index === 0} onClick={() => move(index, -1)}><ArrowUp size={15} /></button>
        <button type="button" className="icon-button quiet" aria-label={`Sposta giù ${OVERVIEW_WIDGETS[item.key]}`} disabled={index === list.length - 1} onClick={() => move(index, 1)}><ArrowDown size={15} /></button>
      </span>
    </li>)}</ul>
  </section>;
}

// ---------------------------------------------------------------- Conti e categorie: aspetto e ordine

type Group = "account" | "expense" | "income";

export function OrganizePanel({ ledger, busy, onCommit, onStyle }: {
  ledger: Ledger; busy: boolean; onCommit: (actions: Mutation[], message: string) => void; onStyle: (record: Account | Label) => void;
}) {
  const [group, setGroup] = useState<Group>("account");
  const items: (Account | Label)[] = group === "account"
    ? ledger.accounts.filter((account) => !account.value.archived)
    : ledger.labels.filter((label) => label.value.type === group && !label.value.archived);

  /** Riscrive la posizione di tutto il gruppo (solo le voci che cambiano davvero). */
  function move(index: number, step: -1 | 1) {
    const next = [...items];
    const [item] = next.splice(index, 1);
    next.splice(index + step, 0, item);
    const actions = next.flatMap((record, order) => record.value.order === order ? []
      : [{ op: "save" as const, record: { ...record, value: { ...record.value, order } } as LedgerRecord }]);
    onCommit(actions, "Ordine aggiornato.");
  }

  return <section className="panel settings-extra">
    <PanelHead icon={<Palette size={18} />} title="Conti e categorie" subtitle="Ordine, colori e icone: valgono su tutti i dispositivi." />
    <div className="segmented" role="group" aria-label="Cosa organizzare">
      {([["account", "Conti"], ["expense", "Categorie di spesa"], ["income", "Fonti di entrata"]] as [Group, string][]).map(([value, title]) =>
        <button type="button" key={value} aria-pressed={group === value} onClick={() => setGroup(value)}>{title}</button>)}
    </div>
    <ul className="rule-list organize-list">{items.map((item, index) => <li key={item.id}>
      <div className="organize-name">
        {item.kind === "account"
          ? <span className={`account-symbol account-${item.id}${toneClass(item.value.color)}`}><AccountGlyph account={item} /></span>
          : <span className={`label-mark big${toneClass(item.value.color)}`}><StyleIcon icon={item.value.icon} size={15} /></span>}
        <strong>{item.value.name}</strong>
      </div>
      <span className="archived-actions">
        <button type="button" className="text-button" onClick={() => onStyle(item)}><Palette size={14} /> Aspetto</button>
        <button type="button" className="icon-button quiet" aria-label={`Sposta su ${item.value.name}`} disabled={busy || index === 0} onClick={() => move(index, -1)}><ArrowUp size={15} /></button>
        <button type="button" className="icon-button quiet" aria-label={`Sposta giù ${item.value.name}`} disabled={busy || index === items.length - 1} onClick={() => move(index, 1)}><ArrowDown size={15} /></button>
      </span>
    </li>)}</ul>
  </section>;
}

/** Colore e icona di un conto o di una categoria. */
export function StyleDialog({ record, busy, error, onCommit }: {
  record: Account | Label; busy: boolean; error: string; onCommit: (actions: Mutation[], message: string) => void;
}) {
  const [style, setStyle] = useState<{ color?: string; icon?: string }>({ color: record.value.color, icon: record.value.icon });
  function save() {
    const { color: _color, icon: _icon, ...rest } = record.value;
    const value = { ...rest, ...(style.color ? { color: style.color } : {}), ...(style.icon ? { icon: style.icon } : {}) };
    onCommit([{ op: "save", record: { ...record, value } as LedgerRecord }], "Aspetto aggiornato.");
  }
  return <div className="editor">
    <div className="style-preview">
      {record.kind === "account"
        ? <span className={`account-symbol account-${record.id}${toneClass(style.color)}`}><AccountGlyph account={{ ...record, value: { ...record.value, ...style } }} /></span>
        : <span className={`label-mark big${toneClass(style.color)}`}><StyleIcon icon={style.icon} size={15} /></span>}
      <strong>{record.value.name}</strong>
    </div>
    <StylePicker color={style.color} icon={style.icon} onChange={setStyle} />
    <FormError message={error} />
    <div className="modal-actions"><button type="button" className="button primary" disabled={busy} onClick={save}>{busy ? "Salvataggio…" : "Salva"}</button></div>
  </div>;
}

// ---------------------------------------------------------------- Inizio del mese

export function PeriodPanel({ ledger, busy, demo, onCommit }: {
  ledger: Ledger; busy: boolean; demo: boolean; onCommit: (actions: Mutation[], message: string) => void;
}) {
  const [day, setDay] = useState(ledger.settings.periodStart);
  useEffect(() => setDay(ledger.settings.periodStart), [ledger.settings.periodStart]);
  const today = todayInRome();
  const preview = describePeriod(day, today);
  return <section className="panel settings-extra">
    <PanelHead icon={<CalendarRange size={18} />} title="Inizio del mese" subtitle="Per entrate, spese, budget e analisi. I saldi restano a fine mese di calendario." />
    <div className="period-setting">
      <label>Il mese inizia il giorno
        <select value={day} onChange={(event) => setDay(Number(event.target.value))}>
          {Array.from({ length: 28 }, (_, index) => index + 1).map((value) => <option key={value} value={value}>{value === 1 ? "1 (mese di calendario)" : value}</option>)}
        </select></label>
      <p className="form-help">{preview}</p>
      <button type="button" className="button secondary" disabled={busy || demo || day === ledger.settings.periodStart}
        onClick={() => onCommit([{ op: "save", record: { kind: "setting", id: "general", version: ledger.settingsRecord?.version ?? null, value: { ...ledger.settings, periodStart: day } } }],
          day === 1 ? "Ora il mese è quello di calendario." : `Ora il mese inizia il giorno ${day}.`)}>Salva</button>
    </div>
  </section>;
}

function describePeriod(day: number, today: string) {
  if (day === 1) return "Ogni mese va dal giorno 1 all’ultimo giorno del mese.";
  const months = ["gennaio", "febbraio", "marzo", "aprile", "maggio", "giugno", "luglio", "agosto", "settembre", "ottobre", "novembre", "dicembre"];
  const month = Number(today.slice(5, 7));
  const name = months[month - 1];
  const prev = months[(month + 10) % 12];
  const next = months[month % 12];
  return day <= 15
    ? `Esempio: «${name}» va dal ${day} ${name} al ${day - 1} ${next}. Utile se ricevi le entrate all’inizio del mese.`
    : `Esempio: «${name}» va dal ${day} ${prev} al ${day - 1} ${name}. Utile se lo stipendio arriva il ${day}: le spese contano nel mese di quello stipendio.`;
}

// ---------------------------------------------------------------- Ricomincia da zero

export function ResetPanel({ demo, onReset }: { demo: boolean; onReset: () => void }) {
  return <section className="panel settings-extra danger-panel">
    <PanelHead icon={<TriangleAlert size={18} />} title="Ricomincia da zero" subtitle="Svuota l’archivio: l’app torna come appena installata, con conti e categorie iniziali." />
    <p className="panel-note">Tutto finisce nel cestino: per {TRASH_DAYS} giorni puoi ripristinarlo, oppure svuotare il cestino per eliminarlo definitivamente.</p>
    <button type="button" className="button danger-quiet" disabled={demo} onClick={onReset}><Trash2 size={16} /> Ricomincia da zero…</button>
    {demo && <p className="panel-note">Non disponibile con i dati di esempio.</p>}
  </section>;
}

export const RESET_WORD = "RICOMINCIA";

export function ResetDialog({ count, busy, error, progress, onConfirm, onCancel }: {
  count: number; busy: boolean; error: string; progress: string; onConfirm: (device: boolean) => void; onCancel: () => void;
}) {
  const [word, setWord] = useState("");
  const [device, setDevice] = useState(false);
  return <div className="editor">
    <div className="notice warning-notice"><TriangleAlert size={18} /><div>
      <strong>{count.toLocaleString("it-IT")} voci andranno nel cestino</strong>
      <p>Movimenti, saldi, ricorrenti, preferiti, budget, obiettivi, conti e categorie personalizzati, impostazioni comuni. L’app riparte vuota, con Fineco, Revolut, Contanti e le categorie iniziali. Le scritture su Firestore sono {count.toLocaleString("it-IT")}.</p>
    </div></div>
    <label className="check-row compact"><input type="checkbox" checked={device} onChange={(event) => setDevice(event.target.checked)} />
      <span><strong>Azzera anche questo dispositivo</strong><small>Personalizzazione, riquadri della Panoramica, filtri salvati e promemoria. Il tema resta.</small></span></label>
    <label>Per confermare scrivi <b>{RESET_WORD}</b>
      <input value={word} onChange={(event) => setWord(event.target.value)} autoComplete="off" autoCapitalize="characters" spellCheck={false} /></label>
    {progress && <p className="form-help" role="status">{progress}</p>}
    <FormError message={error} />
    <div className="modal-actions">
      <button type="button" className="button secondary" disabled={busy} onClick={onCancel}>Annulla</button>
      <button type="button" className="button danger" disabled={busy || word.trim().toUpperCase() !== RESET_WORD || !count} onClick={() => onConfirm(device)}>
        <Trash2 size={16} /> {busy ? "Svuotamento…" : "Ricomincia da zero"}</button>
    </div>
  </div>;
}

// ---------------------------------------------------------------- Ripristino del backup

const MAX_FILE_BYTES = 15 * 1024 * 1024;

export function RestoreDialog({ records, busy, error, progress, onCommit, onCancel }: {
  records: LedgerRecord[]; busy: boolean; error: string; progress: string;
  onCommit: (actions: Mutation[], message: string) => void; onCancel: () => void;
}) {
  const [plan, setPlan] = useState<RestorePlan | null>(null);
  const [fileName, setFileName] = useState("");
  const [readError, setReadError] = useState("");

  async function choose(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    setPlan(null);
    setReadError("");
    if (!file) return;
    if (file.size > MAX_FILE_BYTES) { setReadError("Il file è troppo grande (massimo 15 MB)."); return; }
    setFileName(file.name);
    try {
      const next = planRestore(await file.text(), records);
      if (next.error) setReadError(next.error); else setPlan(next);
    } catch {
      setReadError("Impossibile leggere il file.");
    }
  }

  const writes = plan?.mutations.length ?? 0;
  return <div className="editor import-dialog">
    <p className="form-help">Scegli un backup completo (.json) scaricato da Impostazioni → I tuoi dati. Le voci del backup vengono aggiunte o riportate come nel file; nulla viene cancellato. Il file viene letto qui, nel browser.</p>
    <label className="file-picker">
      <FileUp size={19} />
      <span>{fileName || "Scegli il file di backup…"}</span>
      <input type="file" accept=".json,application/json" onChange={(event) => void choose(event)} disabled={busy} />
    </label>
    <FormError message={readError} />
    {plan && <div className="import-summary" role="status"><ul>
      <li>{plan.restored.toLocaleString("it-IT")} {plan.restored === 1 ? "voce da ripristinare" : "voci da ripristinare"}</li>
      {plan.unchanged > 0 && <li>{plan.unchanged.toLocaleString("it-IT")} già identiche (saltate)</li>}
      {plan.invalid > 0 && <li>{plan.invalid.toLocaleString("it-IT")} non valide (ignorate)</li>}
    </ul>{!writes && <p className="form-help">Non c’è nulla di nuovo da ripristinare.</p>}</div>}
    {progress && <p className="form-help" role="status">{progress}</p>}
    <FormError message={error} />
    <div className="modal-actions">
      <button type="button" className="button secondary" disabled={busy} onClick={onCancel}>Annulla</button>
      <button type="button" className="button primary" disabled={busy || !writes} onClick={() => plan && onCommit(plan.mutations, "Backup ripristinato.")}>
        <DatabaseBackup size={16} /> {busy ? "Ripristino…" : writes ? `Ripristina (${writes.toLocaleString("it-IT")})` : "Ripristina"}
      </button>
    </div>
  </div>;
}

// ---------------------------------------------------------------- Tag

export function TagsPanel({ ledger, onCommit, busy }: { ledger: Ledger; busy: boolean; onCommit: (actions: Mutation[], message: string) => void }) {
  const tags = allTags(ledger);
  const [editing, setEditing] = useState<string | null>(null);
  const [text, setText] = useState("");
  if (!tags.length) return null;

  function rename(from: string, to: string | null) {
    const target = to === null ? null : cleanTag(to);
    if (target === "") return;
    const actions: Mutation[] = [];
    for (const movement of ledger.movements) {
      if (!hasTag(movement.value, from)) continue;
      const rest = (movement.value.tags ?? []).filter((tag) => !sameName(tag, from));
      const next = target && !rest.some((tag) => sameName(tag, target)) ? [...rest, target] : rest;
      const { tags: _old, ...value } = movement.value;
      actions.push({ op: "save", record: { ...movement, value: next.length ? { ...value, tags: next } : value } as typeof movement });
    }
    setEditing(null);
    onCommit(actions, target ? `Tag rinominato in «${target}».` : `Tag «${from}» tolto da ${actions.length} movimenti.`);
  }

  return <section className="panel settings-extra">
    <PanelHead icon={<Tag size={18} />} title="Tag" subtitle="Etichette libere che valgono tra categorie diverse (es. un viaggio, un evento)." />
    <ul className="rule-list">{tags.map((tag) => <li key={tag.name}>
      {editing === tag.name ? <form className="inline-new" onSubmit={(event) => { event.preventDefault(); rename(tag.name, text); }}>
        <input autoFocus value={text} maxLength={40} onChange={(event) => setText(event.target.value)} aria-label="Nuovo nome del tag" />
        <button type="submit" className="button secondary small" disabled={busy}>Rinomina</button>
        <button type="button" className="text-button" onClick={() => setEditing(null)}>Annulla</button>
      </form> : <>
        <div><strong>#{tag.name}</strong><small>{tag.count.toLocaleString("it-IT")} movimenti</small></div>
        <span className="archived-actions">
          <button type="button" className="text-button" onClick={() => { setEditing(tag.name); setText(tag.name); }}>Rinomina</button>
          <button type="button" className="text-button danger-text" disabled={busy} onClick={() => rename(tag.name, null)}>Togli</button>
        </span>
      </>}
    </li>)}</ul>
  </section>;
}
