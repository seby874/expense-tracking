import { useEffect, useState } from "react";
import {
  Archive, ArchiveRestore, BarChart3, Blocks, CalendarDays, DatabaseBackup, FolderOpen, Gauge, HandCoins, HeartPulse, KeyRound, Landmark, LifeBuoy, Plus,
  ReceiptText, Repeat, Telescope, Timer, Trash2, Users,
} from "lucide-react";
import { chooseFolder, folderPermission, folderSupported, forgetFolder, savedFolder } from "../lib/backup/folder";
import { FREQUENCY_LABELS, passwordMissing, readBackupPrefs, saveBackupPrefs, type BackupFrequency } from "../lib/backup/schedule";
import {
  MODULES, NO_VERSION, isDiscreet, newId, parseMoney, subcategoryList,
  type Label, type Ledger, type ModuleKey, type Mutation, type Params, type Person,
} from "../lib/ledger";
import { archivableYears, estimateReads, FREE_DAILY_READS, KEEP_OPEN_YEARS, leftovers } from "../lib/archive";
import { DEDUCTIONS, MODULE_INFO, allModules, moduleOn, paramsFor } from "../lib/params";
import { dependentShare, maskTaxCode, normalizeTaxCode, personName, taxCodeInfo, validTaxCode } from "../lib/people";
import { SUGGESTED_DEDUCTIONS } from "../lib/tax";
import { euroInput, percentInput } from "../lib/input-format";
import { PanelHead } from "./settings-extra";

// Pannelli delle Impostazioni aggiunti con la versione 2.0.

const OPENS_PER_DAY = [2, 5, 10, 20] as const;

function percent(share: number) {
  return `${Math.round(share * 100)}%`;
}

// ---------------------------------------------------------------- Archivio annuale

export function ArchivePanel({ ledger, today, documents, busy, demo, onArchive, onReopen }: {
  ledger: Ledger; today: string; documents: number; busy: boolean; demo: boolean;
  onArchive: (year: number) => void; onReopen: (year: number) => void;
}) {
  const [opens, setOpens] = useState<number>(5);
  const [confirm, setConfirm] = useState<number | null>(null);
  const candidates = archivableYears(ledger, today);
  const archived = [...ledger.archivedYears].sort((a, b) => a - b);
  const reads = estimateReads(documents, opens);
  const saving = candidates.reduce((sum, item) => sum + item.count, 0);
  const level = reads.share >= 0.8 ? "over" : reads.share >= 0.5 ? "warn" : "ok";

  return <section className="panel settings-extra">
    <PanelHead icon={<Archive size={18} />} title="Archivio annuale"
      subtitle={`Gli anni chiusi da più di ${KEEP_OPEN_YEARS} anni diventano pochi documenti: l'app legge meno da Firestore. Restano visibili ovunque, in sola lettura.`} />
    <ul className="security-list"><li>
      <span className="security-icon"><Gauge size={18} /></span>
      <div><strong>{demo ? "Letture stimate (con i dati di esempio non si legge nulla)" : `${documents.toLocaleString("it-IT")} ${documents === 1 ? "documento letto" : "documenti letti"} a ogni apertura`}</strong>
        <p>Con {opens} aperture al giorno: circa <b className={`budget-left level-${level}`}>{reads.perDay.toLocaleString("it-IT")} letture</b> su {FREE_DAILY_READS.toLocaleString("it-IT")} gratuite ({percent(reads.share)}).
          {saving > 0 && ` Archiviando gli anni proposti scenderesti di circa ${saving.toLocaleString("it-IT")} documenti (dopo 60 giorni, quando spariscono le voci eliminate).`}</p></div>
      <select aria-label="Aperture al giorno" value={opens} onChange={(event) => setOpens(Number(event.target.value))}>
        {OPENS_PER_DAY.map((value) => <option key={value} value={value}>{value} aperture/giorno</option>)}
      </select>
    </li></ul>
    {candidates.length > 0 && <ul className="rule-list">{candidates.map(({ year, count }) => <li key={year}>
      <div><strong>{year}</strong><small>{count.toLocaleString("it-IT")} movimenti e saldi</small></div>
      <span className="archived-actions">{confirm === year
        ? <><button type="button" className="button secondary small" onClick={() => setConfirm(null)}>Annulla</button>
          <button type="button" className="button primary small" disabled={busy} onClick={() => { setConfirm(null); onArchive(year); }}>Archivia {year}</button></>
        : <button type="button" className="text-button" disabled={busy} onClick={() => setConfirm(year)}><Archive size={14} /> Archivia</button>}</span>
    </li>)}</ul>}
    {archived.length > 0 && <>
      <p className="panel-note">Anni archiviati (sola lettura):</p>
      <ul className="rule-list">{archived.map((year) => <li key={year}>
        <div><strong>{year}</strong><small>{(() => { const count = ledger.archives.filter((item) => item.value.year === year).length; return `${count} ${count === 1 ? "documento" : "documenti"}`; })()}
          {leftovers(ledger, year).length > 0 && ` · archiviazione interrotta: ${leftovers(ledger, year).length} voci da completare`}</small></div>
        <span className="archived-actions">
          {leftovers(ledger, year).length > 0 && <button type="button" className="text-button" disabled={busy} onClick={() => onArchive(year)}><Archive size={14} /> Completa</button>}
          <button type="button" className="text-button" disabled={busy} onClick={() => onReopen(year)}><ArchiveRestore size={14} /> Riapri</button>
        </span>
      </li>)}</ul>
    </>}
    {!candidates.length && !archived.length && <p className="panel-note">Nessun anno da archiviare: si possono archiviare gli anni fino al {Number(today.slice(0, 4)) - KEEP_OPEN_YEARS - 1}.</p>}
  </section>;
}

// ---------------------------------------------------------------- Backup

const MIN_BACKUP_PASSWORD = 10;

export function BackupPanel({ busy, demo, onBackupNow }: { busy: boolean; demo: boolean; onBackupNow: () => void }) {
  const [prefs, setPrefs] = useState(readBackupPrefs);
  const [folder, setFolder] = useState<{ name: string; state: PermissionState } | null>(null);
  const [message, setMessage] = useState("");
  const [editing, setEditing] = useState(false);
  const [password, setPassword] = useState("");
  const [repeat, setRepeat] = useState("");
  const supported = folderSupported();
  // Sul telefono «Drive per desktop» non esiste: il testo cambia.
  const touch = typeof window.matchMedia === "function" && window.matchMedia("(pointer: coarse)").matches;

  async function refreshFolder(ask = false) {
    const handle = await savedFolder();
    setFolder(handle ? { name: handle.name, state: await folderPermission(handle, ask) } : null);
  }
  useEffect(() => { void refreshFolder(); }, []);

  function update(next: typeof prefs, clearEncryption = false) {
    setPrefs(next);
    saveBackupPrefs(next, clearEncryption);
  }

  async function pick() {
    setMessage("");
    try {
      await chooseFolder();
      await refreshFolder(true);
      if (prefs.frequency === "weekly" && !prefs.last) update({ ...prefs, frequency: "daily" });
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") return;
      setMessage(error instanceof Error ? error.message : "Cartella non disponibile.");
    }
  }

  function savePassword() {
    if (password.length < MIN_BACKUP_PASSWORD) { setMessage(`La password deve avere almeno ${MIN_BACKUP_PASSWORD} caratteri.`); return; }
    if (password !== repeat) { setMessage("Le due password non coincidono."); return; }
    update({ ...prefs, password });
    setEditing(false); setPassword(""); setRepeat("");
    setMessage("Password salvata: i prossimi backup saranno cifrati (.etbackup). Conservala in un gestore di password.");
  }

  return <section className="panel settings-extra">
    <PanelHead icon={<DatabaseBackup size={18} />} title="Backup automatico"
      subtitle="Un unico file con tutti i dati: si ripristina nell'app e si apre con Excel, Google Sheets o un database (vedi LEGGIMI.md nel file)." />
    {demo ? <p className="panel-note">Con i dati di esempio il backup automatico è disattivato.</p> : <>
      <ul className="security-list">
        <li>
          <span className="security-icon"><FolderOpen size={18} /></span>
          <div><strong>{folder ? `Cartella: ${folder.name}` : "Nessuna cartella"}</strong>
            <p>{!supported
              ? "Su questo browser i backup si scaricano nella cartella Download. Per salvarli in automatico in una cartella (e su Google Drive) usa Chrome o Edge su PC."
              : folder?.state === "granted"
                ? "I backup si salvano qui da soli e si tengono gli ultimi 7 giorni, 4 settimane e 12 mesi (gli altri file «expense-tracking-backup-…» della cartella si cancellano: tieni le copie a mano altrove). Se è una cartella di Google Drive (Drive per desktop) arrivano anche su Drive."
                : folder
                  ? "Il browser chiede di nuovo il permesso per questa cartella."
                  : touch
                    ? "Scegli una cartella del telefono: i backup si salveranno lì da soli. Per averli anche su Google Drive caricali dall’app Drive, oppure scegli la cartella dal PC con Drive per desktop."
                    : "Scegli una cartella dentro «Google Drive» (installa Drive per desktop): i backup arriveranno su Drive in automatico."}</p></div>
          {supported && (folder?.state === "prompt"
            ? <button type="button" className="button secondary small" onClick={() => void refreshFolder(true)}>Riautorizza</button>
            : <span className="archived-actions">
              <button type="button" className="button secondary small" onClick={() => void pick()}>{folder ? "Cambia" : "Scegli cartella"}</button>
              {folder && <button type="button" className="text-button" onClick={() => { void forgetFolder().then(() => setFolder(null)); }}>Rimuovi</button>}
            </span>)}
        </li>
        <li>
          <span className="security-icon"><DatabaseBackup size={18} /></span>
          <div><strong>Frequenza</strong><p>Il backup parte all'apertura dell'app quando è il momento. Ultimo: {prefs.last ? prefs.last.split("-").reverse().join("/") : "mai"}.
            Non consuma letture Firestore.</p></div>
          <select aria-label="Frequenza del backup" value={prefs.frequency} onChange={(event) => update({ ...prefs, frequency: event.target.value as BackupFrequency })}>
            {(Object.keys(FREQUENCY_LABELS) as BackupFrequency[]).map((key) => <option key={key} value={key}>{FREQUENCY_LABELS[key]}</option>)}
          </select>
        </li>
        <li>
          <span className="security-icon"><KeyRound size={18} /></span>
          <div><strong>{prefs.password ? "Backup cifrati con password" : passwordMissing(prefs) ? "Password dei backup mancante: i backup sono fermi" : "Backup non cifrati"}</strong>
            <p>{prefs.password
              ? "Senza la password i backup non si aprono in alcun modo. I backup vecchi restano apribili con la password con cui sono stati creati."
              : "Con una password il file diventa .etbackup (AES-256): utile se la cartella è sincronizzata su Drive. La password resta solo in questo browser."}</p>
            {editing && <div className="inline-form">
              <input type="password" autoComplete="new-password" placeholder="Nuova password" value={password} onChange={(event) => setPassword(event.target.value)} />
              <input type="password" autoComplete="new-password" placeholder="Ripeti la password" value={repeat} onChange={(event) => setRepeat(event.target.value)} />
              <button type="button" className="button primary small" onClick={savePassword}>Salva</button>
              <button type="button" className="button secondary small" onClick={() => { setEditing(false); setPassword(""); setRepeat(""); }}>Annulla</button>
            </div>}</div>
          {!editing && <span className="archived-actions">
            <button type="button" className="button secondary small" onClick={() => { setEditing(true); setMessage(""); }}>{prefs.password ? "Cambia" : "Imposta"}</button>
            {(prefs.password || passwordMissing(prefs)) && <button type="button" className="text-button" onClick={() => { update({ ...prefs, password: "" }, true); setMessage("Password rimossa: i prossimi backup non saranno cifrati."); }}>{prefs.password ? "Rimuovi" : "Non cifrare più"}</button>}
          </span>}
        </li>
      </ul>
      {message && <p className="panel-note" role="status">{message}</p>}
      <button type="button" className="button secondary" disabled={busy} onClick={onBackupNow}><DatabaseBackup size={16} /> Fai il backup ora</button>
    </>}
  </section>;
}

// ---------------------------------------------------------------- Helper comuni

type Commit = (actions: Mutation[], message: string) => void;

/** Scrittura delle impostazioni comuni (documento "setting:general"). */
export function settingsAction(ledger: Ledger, change: Partial<Ledger["settings"]>): Mutation {
  return { op: "save", record: { kind: "setting", id: "general", version: ledger.settingsRecord?.version ?? null, value: { ...ledger.settings, ...change } } };
}

const euroText = euroInput;

function numberValue(text: string) {
  const value = Number(text.replace(",", ".").trim());
  return text.trim() && Number.isFinite(value) ? value : null;
}

// ---------------------------------------------------------------- Moduli

const MODULE_ICONS: Record<ModuleKey, typeof Blocks> = {
  tax: ReceiptText, fund: LifeBuoy, fixed: Repeat, calendar: CalendarDays, deadlines: Timer, projection: Telescope,
  yoy: BarChart3, health: HeartPulse, refunds: HandCoins, people: Users,
};

export function ModulesPanel({ ledger, busy, demo, onCommit }: { ledger: Ledger; busy: boolean; demo: boolean; onCommit: Commit }) {
  const modules = allModules(ledger.settings);

  function toggle(key: ModuleKey, on: boolean) {
    const actions: Mutation[] = [];
    let change: Partial<Ledger["settings"]> = { modules: { ...modules, [key]: on } };
    // Prima attivazione della Dichiarazione: voci sanitarie attive e abbinamento della categoria Salute.
    if (key === "tax" && on && !ledger.settings.deductions) {
      change = { ...change, deductions: ["sanitarie", "farmaci"] };
      for (const [labelId, suggestion] of Object.entries(SUGGESTED_DEDUCTIONS)) {
        const label = ledger.labels.find((item) => item.id === labelId);
        if (!label || label.value.deduction || label.value.subDeductions) continue;
        actions.push({ op: "save", record: { ...label, value: {
          ...label.value, ...(suggestion.label ? { deduction: suggestion.label } : {}), ...(suggestion.subs ? { subDeductions: suggestion.subs } : {}),
        } } });
      }
    }
    onCommit([settingsAction(ledger, change), ...actions], `${MODULE_INFO[key].name}: ${on ? "attivato" : "disattivato"}.`);
  }

  return <section className="panel settings-extra">
    <PanelHead icon={<Blocks size={18} />} title="Funzioni" subtitle="Accendi solo ciò che ti serve: quelle spente spariscono dai menu. I dati restano." />
    <ul className="security-list">{MODULES.map((key) => { const Icon = MODULE_ICONS[key]; return <li key={key}>
      <span className="security-icon"><Icon size={18} /></span>
      <div><strong>{MODULE_INFO[key].name}</strong><p>{MODULE_INFO[key].hint}</p></div>
      <label className="switch"><input type="checkbox" checked={modules[key]} disabled={busy || demo} onChange={(event) => toggle(key, event.target.checked)} />
        <span aria-hidden="true" /><span className="sr-only">{MODULE_INFO[key].name}</span></label>
    </li>; })}</ul>
  </section>;
}

// ---------------------------------------------------------------- Familiari

const RELATIONS: Record<Person["value"]["relation"], string> = { spouse: "Coniuge", child: "Figlio/a", other: "Altro familiare" };

function PersonEditor({ ledger, initial, today, busy, onCommit, onClose }: {
  ledger: Ledger; initial?: Person; today: string; busy: boolean; onCommit: Commit; onClose: () => void;
}) {
  const year = Number(today.slice(0, 4));
  const [firstName, setFirstName] = useState(initial?.value.firstName ?? "");
  const [lastName, setLastName] = useState(initial?.value.lastName ?? "");
  const [taxCode, setTaxCode] = useState(initial?.value.taxCode ?? "");
  const [relation, setRelation] = useState<Person["value"]["relation"]>(initial?.value.relation ?? "child");
  const [birthDate, setBirthDate] = useState(initial?.value.birthDate ?? "");
  const [dependent, setDependent] = useState(initial?.value.dependent ?? [{ year, share: 100 }]);
  const [notes, setNotes] = useState(initial?.value.notes ?? "");
  const [error, setError] = useState("");
  const info = taxCode ? taxCodeInfo(taxCode, today) : null;

  function save() {
    const code = normalizeTaxCode(taxCode);
    if (!firstName.trim() || !lastName.trim()) { setError("Nome e cognome sono obbligatori."); return; }
    if (code && !validTaxCode(code)) { setError("Il codice fiscale non è valido (controlla il carattere finale)."); return; }
    const value: Person["value"] = {
      firstName: firstName.trim(), lastName: lastName.trim(), taxCode: code, relation,
      birthDate: birthDate || info?.birthDate || "", dependent: [...dependent].sort((a, b) => a.year - b.year),
      ...(notes.trim() ? { notes: notes.trim().slice(0, 300) } : {}),
      order: initial?.value.order ?? ledger.people.reduce((max, item) => Math.max(max, item.value.order + 1), 0),
    };
    onCommit([{ op: "save", record: { kind: "person", id: initial?.id ?? newId(), version: initial?.version ?? null, value } }], initial ? "Familiare aggiornato." : "Familiare aggiunto.");
    onClose();
  }

  const setShare = (target: number, share: number | null) => setDependent((list) => share === null
    ? list.filter((item) => item.year !== target)
    : [...list.filter((item) => item.year !== target), { year: target, share }]);
  const years = [year - 1, year, year + 1];

  return <div className="editor inline-editor">
    <div className="form-grid">
      <label>Nome<input value={firstName} maxLength={60} onChange={(event) => setFirstName(event.target.value)} /></label>
      <label>Cognome<input value={lastName} maxLength={60} onChange={(event) => setLastName(event.target.value)} /></label>
      <label>Codice fiscale <span className="optional">facoltativo</span>
        <input value={taxCode} maxLength={16} autoComplete="off" spellCheck={false} onChange={(event) => setTaxCode(event.target.value.toUpperCase())} />
        {taxCode.length === 16 && <span className="field-note">{info ? `Valido · nato/a il ${info.birthDate.split("-").reverse().join("/")}` : "Non valido"}</span>}</label>
      <label>Relazione<select value={relation} onChange={(event) => setRelation(event.target.value as Person["value"]["relation"])}>
        {Object.entries(RELATIONS).map(([key, name]) => <option key={key} value={key}>{name}</option>)}</select></label>
      <label>Data di nascita <span className="optional">dal codice fiscale se vuota</span>
        <input type="date" min="1900-01-01" max="2100-12-31" value={birthDate} onChange={(event) => setBirthDate(event.target.value)} /></label>
      <label>Note <span className="optional">facoltative</span><input value={notes} maxLength={300} onChange={(event) => setNotes(event.target.value)} /></label>
    </div>
    <fieldset className="schedule-fields"><legend>A carico</legend>
      <div className="form-grid">{years.map((item) => {
        const current = dependent.find((entry) => entry.year === item)?.share;
        return <label key={item}>{item}<select value={current === undefined ? "" : String(current)}
          onChange={(event) => setShare(item, event.target.value === "" ? null : Number(event.target.value))}>
          <option value="">Non a carico</option><option value="100">A carico 100%</option><option value="50">A carico 50%</option>
        </select></label>;
      })}</div>
      <p className="field-note">Gli altri anni restano come salvati ({dependent.filter((item) => !years.includes(item.year)).map((item) => `${item.year}: ${item.share}%`).join(", ") || "nessuno"}).</p>
    </fieldset>
    {error && <p className="form-error" role="alert">{error}</p>}
    <div className="modal-actions">
      <button type="button" className="button secondary" onClick={onClose}>Annulla</button>
      <button type="button" className="button primary" disabled={busy} onClick={save}>Salva</button>
    </div>
  </div>;
}

export function PeoplePanel({ ledger, today, busy, onCommit }: { ledger: Ledger; today: string; busy: boolean; onCommit: Commit }) {
  const [editing, setEditing] = useState<Person | "new" | null>(null);
  const [showCodes, setShowCodes] = useState(false);
  const year = Number(today.slice(0, 4));
  if (!moduleOn(ledger.settings, "people")) return null;
  return <section className="panel settings-extra">
    <PanelHead icon={<Users size={18} />} title="Familiari" subtitle="Per indicare per chi è una spesa e chi è a carico. Il codice fiscale resta nel backup completo, non nei CSV."
      action={<button type="button" className="text-button" onClick={() => setEditing("new")}><Plus size={15} /> Aggiungi</button>} />
    {editing && <PersonEditor ledger={ledger} today={today} busy={busy} onCommit={onCommit} onClose={() => setEditing(null)}
      initial={editing === "new" ? undefined : editing} key={editing === "new" ? "new" : editing.id} />}
    {ledger.people.length ? <ul className="rule-list">{ledger.people.map((person) => <li key={person.id}>
      <div><strong>{personName(person)}</strong><small>{RELATIONS[person.value.relation]}
        {person.value.taxCode && ` · ${showCodes && !isDiscreet() ? person.value.taxCode : maskTaxCode(person.value.taxCode)}`}
        {` · ${dependentShare(person, year) ? `a carico ${dependentShare(person, year)}% nel ${year}` : `non a carico nel ${year}`}`}</small></div>
      <span className="archived-actions">
        <button type="button" className="text-button" onClick={() => setEditing(person)}>Modifica</button>
        <button type="button" className="icon-button quiet" aria-label={`Elimina ${personName(person)}`} disabled={busy}
          onClick={() => onCommit([{ op: "delete", kind: "person", id: person.id, version: person.version ?? NO_VERSION }], "Familiare eliminato.")}><Trash2 size={15} /></button>
      </span>
    </li>)}</ul> : !editing && <p className="panel-note">Nessun familiare.</p>}
    {ledger.people.some((person) => person.value.taxCode) && <button type="button" className="text-button" onClick={() => setShowCodes((value) => !value)}>
      {showCodes ? "Nascondi i codici fiscali" : "Mostra i codici fiscali"}</button>}
  </section>;
}

// ---------------------------------------------------------------- Parametri di legge e bancari

type ParamField = { key: "withholding" | "depositStamp" | "consumerPenalty" | "consumerPenaltyShort"; name: string; unit: "%" }
  | { key: "currentStamp" | "currentStampThreshold" | "depositGuarantee" | "consumerPenaltyMin" | "pensionDeductionCap"; name: string; unit: "€" };

const PARAM_FIELDS: ParamField[] = [
  { key: "withholding", name: "Ritenuta sugli interessi", unit: "%" },
  { key: "depositStamp", name: "Imposta di bollo conti deposito (annua)", unit: "%" },
  { key: "currentStamp", name: "Imposta di bollo conto corrente (fissa)", unit: "€" },
  { key: "currentStampThreshold", name: "…dovuta oltre una giacenza media di", unit: "€" },
  { key: "depositGuarantee", name: "Garanzia dei depositi per banca (FITD)", unit: "€" },
  { key: "consumerPenalty", name: "Penale estinzione credito ai consumatori", unit: "%" },
  { key: "consumerPenaltyShort", name: "…con meno di un anno residuo", unit: "%" },
  { key: "consumerPenaltyMin", name: "…nessuna penale fino a un rimborso di", unit: "€" },
  { key: "pensionDeductionCap", name: "Deduzione massima previdenza complementare", unit: "€" },
];

export function ParamsPanel({ ledger, today, busy, onCommit }: { ledger: Ledger; today: string; busy: boolean; onCommit: Commit }) {
  const current = Number(today.slice(0, 4));
  const [year, setYear] = useState(current);
  const { value, record, inherited } = paramsFor(ledger, year);
  const [draft, setDraft] = useState<Record<string, string>>({});
  const [error, setError] = useState("");
  const tax = moduleOn(ledger.settings, "tax");
  const enabled = new Set(ledger.settings.deductions ?? []);
  const years = [...new Set([current - 1, current, current + 1, ...ledger.params.map((item) => item.value.year)])].sort((a, b) => a - b);

  const text = (key: string, fallback: string) => draft[key] ?? fallback;
  const set = (key: string, next: string) => setDraft((old) => ({ ...old, [key]: next }));

  function build(): Params["value"] | null {
    const next: Params["value"] = { ...value, deductions: { ...value.deductions }, year, confirmed: true };
    for (const field of PARAM_FIELDS) {
      const raw = text(field.key, field.unit === "%" ? percentInput(value[field.key]) : euroText(value[field.key]));
      const parsed = field.unit === "%" ? numberValue(raw) : parseMoney(raw);
      if (parsed === null || parsed < 0) { setError(`Controlla «${field.name}».`); return null; }
      (next as Record<string, unknown>)[field.key] = parsed;
    }
    const income = text("income", euroText(value.income));
    if (income.trim()) {
      const parsed = parseMoney(income);
      if (parsed === null || parsed < 0) { setError("Il reddito non è valido."); return null; }
      next.income = parsed;
    } else next.income = null;
    for (const info of DEDUCTIONS) {
      const rule = value.deductions[info.key];
      const rate = numberValue(text(`${info.key}.rate`, percentInput(rule.rate)));
      const threshold = parseMoney(text(`${info.key}.threshold`, euroText(rule.threshold)) || "0");
      const capText = text(`${info.key}.cap`, euroText(rule.cap));
      const cap = capText.trim() ? parseMoney(capText) : null;
      if (rate === null || rate < 0 || rate > 100 || threshold === null || (capText.trim() && cap === null)) { setError(`Controlla la voce «${info.name}».`); return null; }
      next.deductions[info.key] = { rate, threshold, cap, traceable: rule.traceable };
    }
    return next;
  }

  function save() {
    setError("");
    const next = build();
    if (!next) return;
    onCommit([{ op: "save", record: { kind: "param", id: String(year), version: record?.version ?? null, value: next } }], `Parametri ${year} salvati.`);
    setDraft({});
  }

  function toggleDeduction(key: string, on: boolean) {
    const list = new Set(enabled);
    if (on) list.add(key); else list.delete(key);
    onCommit([settingsAction(ledger, { deductions: [...list] })], on ? "Voce di detrazione attivata." : "Voce di detrazione disattivata.");
  }

  return <section className="panel settings-extra">
    <PanelHead icon={<Landmark size={18} />} title="Parametri di legge e bancari"
      subtitle="Cambiano con le leggi di bilancio: controllali ogni anno. «Nuovo anno» copia i valori dell'anno prima."
      action={<select aria-label="Anno" value={year} onChange={(event) => { setYear(Number(event.target.value)); setDraft({}); setError(""); }}>
        {years.map((item) => <option key={item} value={item}>{item}</option>)}</select>} />
    {inherited && <p className="panel-note">{record ? "" : `Valori del ${year} non ancora salvati: sono copiati ${ledger.params.some((item) => item.value.year < year) ? "dall'anno precedente" : "dai valori di partenza"}. Controllali e premi «Conferma».`}</p>}
    <div className="params-grid">
      {PARAM_FIELDS.map((field) => <label key={field.key}>{field.name} ({field.unit})
        <input inputMode="decimal" value={text(field.key, field.unit === "%" ? percentInput(value[field.key]) : euroText(value[field.key]))}
          onChange={(event) => set(field.key, event.target.value)} /></label>)}
      {tax && <label>Reddito complessivo {year} (€) <span className="optional">dalla CU o dal 730, facoltativo</span>
        <input inputMode="decimal" value={text("income", euroText(value.income))} onChange={(event) => set("income", event.target.value)} /></label>}
    </div>
    {tax && <div className="table-scroll" tabIndex={0}><table className="data-table compact-table">
      <thead><tr><th scope="col">Voce</th><th scope="col">Attiva</th><th scope="col" className="number">%</th><th scope="col" className="number">Franchigia €</th><th scope="col" className="number">Tetto €</th></tr></thead>
      <tbody>{DEDUCTIONS.map((info) => {
        const rule = value.deductions[info.key];
        return <tr key={info.key}>
          <td><span title={info.hint}>{info.name}</span>{info.perPerson && <small> · per persona</small>}{info.deduction && <small> · deduzione dal reddito</small>}</td>
          <td><input type="checkbox" aria-label={`Attiva ${info.name}`} checked={enabled.has(info.key)} disabled={busy} onChange={(event) => toggleDeduction(info.key, event.target.checked)} /></td>
          <td className="number"><input className="cell-input" inputMode="decimal" value={text(`${info.key}.rate`, percentInput(rule.rate))} onChange={(event) => set(`${info.key}.rate`, event.target.value)} /></td>
          <td className="number"><input className="cell-input" inputMode="decimal" value={text(`${info.key}.threshold`, euroText(rule.threshold))} onChange={(event) => set(`${info.key}.threshold`, event.target.value)} /></td>
          <td className="number"><input className="cell-input" inputMode="decimal" placeholder="nessuno" value={text(`${info.key}.cap`, euroText(rule.cap))} onChange={(event) => set(`${info.key}.cap`, event.target.value)} /></td>
        </tr>;
      })}</tbody></table></div>}
    {error && <p className="form-error" role="alert">{error}</p>}
    <div className="modal-actions">
      <button type="button" className="button primary" disabled={busy} onClick={save}>{record?.value.confirmed && !Object.keys(draft).length ? "Salva" : `Conferma i valori ${year}`}</button>
    </div>
  </section>;
}

// ---------------------------------------------------------------- Abbinamento categorie → detrazioni

export function DeductionMapPanel({ ledger, busy, onCommit }: { ledger: Ledger; busy: boolean; onCommit: Commit }) {
  if (!moduleOn(ledger.settings, "tax")) return null;
  const active = DEDUCTIONS.filter((info) => (ledger.settings.deductions ?? []).includes(info.key));
  const labels = ledger.labels.filter((label) => label.value.type === "expense" && !label.value.archived);

  function saveLabel(label: Label, change: Partial<Label["value"]>) {
    const value = { ...label.value, ...change };
    if (!value.deduction) delete value.deduction;
    if (value.subDeductions && !Object.keys(value.subDeductions).length) delete value.subDeductions;
    onCommit([{ op: "save", record: { ...label, value } }], "Abbinamento salvato.");
  }

  const options = <>{active.map((info) => <option key={info.key} value={info.key}>{info.name}</option>)}</>;
  return <section className="panel settings-extra">
    <PanelHead icon={<ReceiptText size={18} />} title="Spese detraibili per categoria"
      subtitle="Ogni categoria (o sottocategoria) può finire in una voce della dichiarazione. Su un singolo movimento puoi sempre correggere a mano." />
    {!active.length ? <p className="panel-note">Attiva almeno una voce in «Parametri di legge e bancari».</p>
      : <ul className="rule-list">{labels.map((label) => <li key={label.id} className="deduction-row">
        <div><strong>{label.value.name}</strong>
          {subcategoryList(ledger, label.id).length > 0 && <details><summary>Sottocategorie</summary>
            <ul className="subcategories">{subcategoryList(ledger, label.id).map((sub) => <li key={sub}><span>{sub}</span>
              <select aria-label={`Detrazione per ${sub}`} disabled={busy} value={label.value.subDeductions?.[sub] ?? "__inherit"}
                onChange={(event) => {
                  const subs = { ...(label.value.subDeductions ?? {}) };
                  if (event.target.value === "__inherit") delete subs[sub]; else subs[sub] = event.target.value;
                  saveLabel(label, { subDeductions: subs });
                }}>
                <option value="__inherit">Come la categoria</option><option value="">Non detraibile</option>{options}
              </select></li>)}</ul></details>}</div>
        <select aria-label={`Detrazione per ${label.value.name}`} disabled={busy} value={label.value.deduction ?? ""}
          onChange={(event) => saveLabel(label, { deduction: event.target.value || undefined })}>
          <option value="">Non detraibile</option>{options}
        </select>
      </li>)}</ul>}
  </section>;
}
