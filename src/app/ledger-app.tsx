import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  BarChart3, CalendarDays, ChevronDown, ChevronRight, CircleAlert, CircleCheck, CloudCheck, CloudOff,
  FlaskConical, LayoutDashboard, List, LogOut, Plus, RefreshCw, Settings2, WalletCards,
} from "lucide-react";
import {
  INITIAL_YEAR, MONTHS, deriveLedger, lastRecordedMonth, monthLabel, recordSchema, subcategoryList,
  newId, todayInRome, type Account, type Balance, type Label, type LedgerRecord, type Movement, type Mutation, type Recurring,
} from "../lib/ledger";
import { readLedger, subscribePending, writeLedger, writeMany } from "../lib/local-ledger";
import { offlineEnabled } from "../lib/firebase";
import { sampleLedger } from "../lib/ledger-demo";
import { BALANCE_HEADER, MOVEMENT_HEADER, backupDocument, balanceRows, csvDocument, downloadFile, movementRows } from "../lib/data-io";
import { dueDates, dueItems, nextDate, occurrenceMovement, type DueItem } from "../lib/recurring";
import { BalanceForm, FormError, Modal, MovementForm, type MovementResult } from "./ledger-forms";
import { Accounts, Movements, Overview, Reports, Settings, type SessionInfo } from "./ledger-views";
import { AccountEditor, ArchiveDialog, LabelEditor, RemoveDialog } from "./manage";
import { DuePanel, RecurringPanel } from "./recurring";
import { ImportDialog } from "./import-dialog";
import { APP_NAME } from "../lib/config";
import { BrandName, Mark } from "./brand";

const SECTIONS = {
  overview: { title: "Panoramica", icon: LayoutDashboard },
  movements: { title: "Movimenti", icon: List },
  accounts: { title: "Conti e patrimonio", icon: WalletCards },
  reports: { title: "Analisi", icon: BarChart3 },
  settings: { title: "Impostazioni", icon: Settings2 },
} as const;

const SECTION_COPY = {
  overview: "Entrate, spese e patrimonio in un unico riepilogo.",
  movements: "Registra, cerca e aggiorna entrate, spese e trasferimenti.",
  accounts: "Aggiorna i saldi e segui il patrimonio nel tempo.",
  reports: "Scopri come si distribuiscono entrate e spese e confronta i mesi.",
  settings: "Categorie, sicurezza della sessione e copia dei tuoi dati.",
};

// Il periodo scelto resta salvato solo per la sessione della scheda:
// a ogni nuova apertura l'app riparte dal mese corrente.
const PERIOD_KEY = "et-period";
const TODAY = todayInRome();
const CURRENT_YEAR = Number(TODAY.slice(0, 4));
const DEFAULT_PERIOD = TODAY.slice(0, 7);
const FILE_PREFIX = APP_NAME.toLowerCase().replace(/[^a-z0-9]+/g, "-");

type Section = keyof typeof SECTIONS;
type EditForm =
  | { type: "movement"; id: string; initial?: Movement }
  | { type: "occurrence"; item: DueItem }
  | { type: "recurring"; id: string; initial?: Recurring }
  | { type: "balance"; account: Account }
  | { type: "account"; id: string; initial?: Account }
  | { type: "label"; id: string; labelType: "expense" | "income"; initial?: Label }
  | { type: "import" };
type Form =
  | EditForm
  | { type: "delete"; record: Movement | Balance | Recurring; back: EditForm }
  | { type: "archive"; target: Account | Label; back: EditForm }
  | { type: "remove"; target: Account | Label; back: EditForm };

const NO_VERSION = "00000000-0000-4000-8000-000000000000";

function applyActions(records: LedgerRecord[], actions: Mutation[], saved: LedgerRecord[]) {
  const removed = new Set(actions.flatMap((action) => (action.op === "delete" ? [`${action.kind}:${action.id}`] : [])));
  const replaced = new Map(saved.map((record) => [`${record.kind}:${record.id}`, record]));
  return [
    ...records.filter((record) => !removed.has(`${record.kind}:${record.id}`) && !replaced.has(`${record.kind}:${record.id}`)),
    ...replaced.values(),
  ];
}

function useSyncState() {
  const [online, setOnline] = useState(() => navigator.onLine);
  const [pending, setPending] = useState(0);
  useEffect(() => {
    const update = () => setOnline(navigator.onLine);
    window.addEventListener("online", update);
    window.addEventListener("offline", update);
    const unsubscribe = subscribePending(setPending);
    return () => {
      window.removeEventListener("online", update);
      window.removeEventListener("offline", update);
      unsubscribe();
    };
  }, []);
  return { online, pending };
}

function periodMonth(period: string, last: string | null) {
  if (period.length === 7) return period;
  const end = period + "-12";
  const previousDecember = (Number(period) - 1) + "-12";
  if (!last || last < previousDecember) return end;
  return last < end ? last : end;
}

function makeDate(period: string) {
  const today = todayInRome();
  if (today.startsWith(period)) return today;
  return period.length === 4 ? period + "-01-01" : period + "-01";
}

function PeriodPicker({ period, years, onChange }: { period: string; years: number[]; onChange: (period: string) => void }) {
  const year = period.slice(0, 4);
  const month = period.slice(5);
  return <div className="period-picker">
    <CalendarDays className="period-icon" size={17} />
    <label className="period-month"><span className="sr-only">Mese</span>
      <select value={month} onChange={(event) => onChange(event.target.value ? year + "-" + event.target.value : year)}>
        <option value="">Anno intero</option>
        {MONTHS.map((name, index) => <option key={name} value={String(index + 1).padStart(2, "0")}>{name}</option>)}
      </select><ChevronDown size={14} /></label>
    <label className="period-year"><span className="sr-only">Anno</span>
      <select value={year} onChange={(event) => onChange(event.target.value + (month ? "-" + month : ""))}>
        {years.map((value) => <option key={value} value={value}>{value}</option>)}
      </select><ChevronDown size={14} /></label>
  </div>;
}

export function LedgerApp({ session }: { session: SessionInfo }) {
  const [section, setSection] = useState<Section>("overview");
  const [personalPeriod, setPersonalPeriod] = useState(DEFAULT_PERIOD);
  const [examplePeriod, setExamplePeriod] = useState("2027-03");
  const [records, setRecords] = useState<LedgerRecord[]>([]);
  const [example, setExample] = useState<LedgerRecord[] | null>(null);
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  const [loadError, setLoadError] = useState("");
  const [form, setForm] = useState<Form | null>(null);
  const [formError, setFormError] = useState("");
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState("");
  const [progress, setProgress] = useState("");
  const sync = useSyncState();
  const reading = useRef(0);
  const writing = useRef(false);
  const reloadAfterClose = useRef(false);

  const demo = example !== null;
  const currentRecords = example ?? records;
  const ledger = useMemo(() => deriveLedger(currentRecords), [currentRecords]);
  const today = todayInRome();
  const due = useMemo(() => dueItems(ledger, today), [ledger, today]);
  const period = demo ? examplePeriod : personalPeriod;
  const year = Number(period.slice(0, 4));
  const month = periodMonth(period, lastRecordedMonth(ledger));
  const years = useMemo(() => {
    const all = new Set<number>([year, ...Array.from({ length: 7 }, (_, i) => CURRENT_YEAR - 5 + i)]);
    if (demo) all.add(INITIAL_YEAR);
    for (const { value } of ledger.movements) all.add(Number(value.date.slice(0, 4)));
    for (const { value } of ledger.balances) all.add(Number(value.month.slice(0, 4)));
    return [...all].sort((a, b) => a - b);
  }, [ledger, year, demo]);

  useEffect(() => {
    try {
      const saved = sessionStorage.getItem(PERIOD_KEY);
      if (saved && /^(19\d{2}|20\d{2}|2100)(-(0[1-9]|1[0-2]))?$/.test(saved)) setPersonalPeriod(saved);
    } catch {
      // The selected period is optional browser-local state.
    }
  }, []);

  function setPeriod(next: string) {
    if (demo) {
      setExamplePeriod(next);
    } else {
      setPersonalPeriod(next);
      try { sessionStorage.setItem(PERIOD_KEY, next); } catch {}
    }
  }

  const load = useCallback(async () => {
    if (writing.current) return;
    const request = ++reading.current;
    try {
      const current = await readLedger();
      if (request === reading.current) {
        setRecords(current);
        setStatus("ready");
        setLoadError("");
      }
    } catch (error) {
      if (request === reading.current) {
        setStatus("error");
        setLoadError(error instanceof Error ? error.message : "Impossibile aprire l’archivio.");
      }
    }
  }, []);

  useEffect(() => { void load(); }, [load]);
  // Al ritorno della connessione si ricarica l'archivio (non al primo avvio).
  const wasOnline = useRef(sync.online);
  useEffect(() => {
    if (sync.online && !wasOnline.current && !demo && !form) void load();
    wasOnline.current = sync.online;
  }, [sync.online]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (form || demo) return;
    const refresh = () => { void load(); };
    window.addEventListener("focus", refresh);
    return () => window.removeEventListener("focus", refresh);
  }, [load, form, demo]);
  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(""), 4000);
    return () => window.clearTimeout(timer);
  }, [toast]);

  function navigate(next: Section) {
    setSection(next);
    window.scrollTo({ top: 0, behavior: "instant" });
  }

  function toggleDemo() {
    if (demo) {
      setExample(null);
      void load();
    } else {
      setExample(sampleLedger());
      setExamplePeriod("2027-03");
    }
    setToast("");
    navigate("overview");
  }

  function open(next: Form) {
    if (!demo && status !== "ready") {
      setToast("Attendi che l’archivio sia disponibile.");
      return;
    }
    reading.current++;
    setFormError("");
    setForm(next);
  }

  function close() {
    if (writing.current) return;
    setForm(null);
    setFormError("");
    if (reloadAfterClose.current) {
      reloadAfterClose.current = false;
      void load();
    }
  }

  function newMovement() { open({ type: "movement", id: newId() }); }
  function editMovement(initial: Movement) { open({ type: "movement", id: initial.id, initial }); }
  function editBalance(account: Account) { open({ type: "balance", account }); }
  function editAccount(initial?: Account) { open({ type: "account", id: initial?.id ?? newId(), initial }); }
  function editLabel(labelType: "expense" | "income", initial?: Label) {
    open({ type: "label", id: initial?.id ?? newId(), labelType, initial });
  }
  function editRecurring(initial?: Recurring) { open({ type: "recurring", id: initial?.id ?? newId(), initial }); }
  function sub(next: (back: EditForm) => Form) {
    if (!form || form.type === "delete" || form.type === "archive" || form.type === "remove") return;
    setFormError("");
    setForm(next(form));
  }
  function confirmDelete(record: Movement | Balance | Recurring) { sub((back) => ({ type: "delete", record, back })); }

  function savedNote(message: string) {
    return offlineEnabled && !navigator.onLine ? `${message} Si sincronizzerà al ritorno della rete.` : message;
  }

  /** Applica una o più scritture. Una sola scrittura usa il controllo dei conflitti tra dispositivi. */
  async function commit(actions: Mutation[], message: string, options: { closeForm?: boolean; jump?: boolean } = {}) {
    if (writing.current || !actions.length) return false;
    for (const action of actions) {
      if (action.op === "save" && !recordSchema.safeParse(action.record).success) {
        setFormError("Controlla che i campi obbligatori siano compilati correttamente.");
        return false;
      }
    }
    writing.current = true;
    reading.current++;
    setBusy(true);
    setFormError("");
    setProgress("");
    try {
      let saved: LedgerRecord[];
      if (demo) {
        saved = actions.flatMap((action) => (action.op === "save" ? [{ ...action.record, version: newId() }] : []));
      } else if (actions.length === 1) {
        const result = await writeLedger(actions[0]);
        saved = result ? [result] : [];
      } else {
        saved = await writeMany(actions, (done, total) => {
          if (total > 400) setProgress(`Salvataggio ${done.toLocaleString("it-IT")} di ${total.toLocaleString("it-IT")}…`);
        });
      }
      if (demo) setExample((previous) => applyActions(previous ?? [], actions, saved));
      else setRecords((previous) => applyActions(previous, actions, saved));

      // Dopo aver salvato un movimento o un saldo si mostra il suo mese.
      if (options.jump) {
        const movements = saved.filter((record): record is Movement => record.kind === "movement");
        const balances = saved.filter((record): record is Balance => record.kind === "balance");
        if (movements.length === 1 && !movements[0].value.date.startsWith(period)) setPeriod(movements[0].value.date.slice(0, 7));
        if (balances.length === 1 && !balances[0].value.month.startsWith(period)) setPeriod(balances[0].value.month);
      }
      if (options.closeForm !== false) setForm(null);
      setToast(savedNote(message));
      return true;
    } catch (error) {
      const text = error instanceof Error ? error.message : "Impossibile completare la richiesta.";
      if (form) setFormError(text);
      else setToast(text);
      return false;
    } finally {
      writing.current = false;
      setBusy(false);
      setProgress("");
    }
  }

  /** Aggiunge una sottocategoria nuova all'elenco della sua categoria. */
  function subcategoryAction(labelId: string, name: string | null): Mutation[] {
    if (!name) return [];
    const label = ledger.labels.find((item) => item.id === labelId);
    if (!label) return [];
    return [{ op: "save", record: { ...label, value: { ...label.value, subcategories: [...subcategoryList(ledger, labelId), name] } } }];
  }

  function saveMovementForm(target: Extract<EditForm, { type: "movement" }>, result: MovementResult) {
    const record: Movement = { kind: "movement", id: target.id, version: target.initial?.version ?? null, value: result.movement };
    const actions: Mutation[] = [...subcategoryAction(result.movement.type === "expense" ? result.movement.labelId : "", result.newSubcategory), { op: "save", record }];
    if (result.schedule) {
      actions.push({ op: "save", record: { kind: "recurring", id: newId(), version: null, value: {
        template: result.movement, schedule: { ...result.schedule, start: result.movement.date, done: 1 },
      } } });
    }
    void commit(actions, result.schedule ? "Movimento salvato e ripetizione creata." : "Movimento salvato.", { jump: true });
  }

  function registerOccurrence(item: DueItem, value = occurrenceMovement(item.recurring, item.date), extra: Mutation[] = []) {
    const { recurring } = item;
    const schedule = { ...recurring.value.schedule, done: recurring.value.schedule.done + 1 };
    return commit([
      ...extra,
      { op: "save", record: { kind: "movement", id: newId(), version: null, value } },
      { op: "save", record: { ...recurring, value: { ...recurring.value, schedule } } },
    ], `«${value.title}» registrato.`);
  }

  function skipOccurrence(item: DueItem) {
    const { recurring } = item;
    void commit([{ op: "save", record: { ...recurring, value: { ...recurring.value, schedule: { ...recurring.value.schedule, done: recurring.value.schedule.done + 1 } } } }],
      `Scadenza del ${item.date.split("-").reverse().join("/")} saltata.`);
  }

  function registerAll() {
    const actions: Mutation[] = [];
    let count = 0;
    for (const item of due) {
      const dates = dueDates(item.recurring.value.schedule, today);
      for (const date of dates) {
        actions.push({ op: "save", record: { kind: "movement", id: newId(), version: null, value: occurrenceMovement(item.recurring, date) } });
      }
      count += dates.length;
      actions.push({ op: "save", record: { ...item.recurring, value: { ...item.recurring.value, schedule: { ...item.recurring.value.schedule, done: item.recurring.value.schedule.done + dates.length } } } });
    }
    void commit(actions, `${count} ${count === 1 ? "movimento registrato" : "movimenti registrati"}.`);
  }

  function saveRecurringForm(target: Extract<EditForm, { type: "recurring" }>, result: MovementResult) {
    if (!result.schedule) return;
    const previous = target.initial?.value.schedule;
    // Se data e frequenza non cambiano si mantiene il calendario; altrimenti riparte dalla data indicata.
    const keep = previous && nextDate(previous) === result.movement.date && previous.frequency === result.schedule.frequency && previous.every === result.schedule.every;
    const schedule = keep && previous
      ? { ...previous, end: result.schedule.end }
      : { ...result.schedule, start: result.movement.date, done: 0 };
    const value: Recurring["value"] = { template: result.movement, schedule };
    if (result.paused) value.paused = true;
    void commit([
      ...subcategoryAction(result.movement.type === "expense" ? result.movement.labelId : "", result.newSubcategory),
      { op: "save", record: { kind: "recurring", id: target.id, version: target.initial?.version ?? null, value } },
    ], target.initial ? "Ricorrente aggiornato." : "Ricorrente creato.");
  }

  function save(record: LedgerRecord, message: string) {
    void commit([{ op: "save", record }], message, { jump: true });
  }

  function exportMovements(items: Movement[], all = false) {
    downloadFile(`${FILE_PREFIX}-${demo ? "esempio-" : ""}movimenti${all ? "" : "-" + period}.csv`,
      csvDocument(MOVEMENT_HEADER, movementRows(ledger, items)), "text/csv;charset=utf-8");
  }

  function exportBalances() {
    downloadFile(`${FILE_PREFIX}-${demo ? "esempio-" : ""}saldi.csv`, csvDocument(BALANCE_HEADER, balanceRows(ledger)), "text/csv;charset=utf-8");
  }

  function exportBackup() {
    downloadFile(`${FILE_PREFIX}-${demo ? "esempio-" : ""}backup-${today}.json`, backupDocument(currentRecords), "application/json");
  }

  const sectionTitle = SECTIONS[section].title;
  const formTitle = form?.type === "movement" ? (form.initial ? "Modifica movimento" : "Nuovo movimento")
    : form?.type === "occurrence" ? "Registra ricorrente"
    : form?.type === "recurring" ? (form.initial ? "Modifica ricorrente" : "Nuovo ricorrente")
    : form?.type === "balance" ? "Saldo · " + form.account.value.name
    : form?.type === "account" ? (form.initial ? "Modifica conto" : "Nuovo conto")
    : form?.type === "label" ? (form.initial ? (form.labelType === "expense" ? "Modifica categoria" : "Modifica fonte") : form.labelType === "expense" ? "Nuova categoria" : "Nuova fonte")
    : form?.type === "import" ? "Importa dati"
    : form?.type === "archive" ? (form.target.value.archived ? "Ripristina" : "Archivia") + " · " + form.target.value.name
    : form?.type === "remove" ? "Elimina · " + form.target.value.name
    : "Elimina voce";
  const canEdit = demo || status === "ready";
  const demoButton = <button className="text-button example-button" type="button" onClick={toggleDemo}><FlaskConical size={15} /> Esplora con esempi</button>;
  const sharedView = { ledger, year, period, month, monthChange: setPeriod };
  const commitProps = { busy, error: formError, onCommit: (actions: Mutation[], message: string) => { void commit(actions, message); } };

  return <div className="app-shell">
    <a className="skip-link" href="#contenuto">Vai al contenuto</a>
    <aside className="sidebar">
      <button type="button" className="brand" onClick={() => navigate("overview")} aria-label={`${APP_NAME}, panoramica`}>
        <Mark /><BrandName />
      </button>
      <div className="nav-label">IL TUO SPAZIO</div>
      <nav className="main-nav" aria-label="Menu principale">
        {(Object.keys(SECTIONS) as Section[]).map((key) => {
          const { icon: Icon, title } = SECTIONS[key];
          return <button className="nav-button" type="button" key={key} aria-current={section === key ? "page" : undefined}
            onClick={() => navigate(key)} aria-label={title}>
            <Icon size={19} strokeWidth={1.8} />
            {key === "accounts" ? <><span className="nav-wide">{title}</span><span className="nav-narrow">Conti</span></> : <span>{title}</span>}
            {section === key && <i />}
          </button>;
        })}
      </nav>
      <div className="sidebar-bottom">
        <div className="sidebar-private"><span className="sidebar-lock"><CloudCheck size={16} /></span>
          <div><strong>{offlineEnabled ? "Cloud + dispositivo" : "Archivio cloud"}</strong><small title={session.email}>{session.email || "Conti in euro · EUR"}</small></div>
        </div>
        <button type="button" className="sidebar-logout" onClick={session.onLogout}><LogOut size={17} /> Esci</button>
      </div>
    </aside>

    <div className="workspace">
      <header className="topbar">
        <div className="breadcrumbs"><span>{APP_NAME}</span><ChevronRight size={15} /><strong>{sectionTitle}</strong></div>
        <div className="topbar-end">
          <span className={`privacy-badge${!demo && (!sync.online || sync.pending) ? " is-offline" : ""}`} role="status">
            {demo ? <><i />Dati di esempio</>
              : !sync.online ? <><CloudOff size={13} />{offlineEnabled ? `Offline${sync.pending ? ` · ${sync.pending} in attesa` : ""}` : "Nessuna connessione"}</>
              : sync.pending ? <><RefreshCw size={13} className="spin" />Sincronizzazione…</>
              : <><i />Archivio sincronizzato</>}
          </span>
          <button type="button" className="icon-button quiet topbar-logout" aria-label="Esci" title="Esci" onClick={session.onLogout}><LogOut size={17} /></button>
        </div>
      </header>
      <main className="content" id="contenuto">
        <div className="page-heading">
          <div><div className="eyebrow">{section === "settings" ? "PERSONALIZZAZIONE" : "BILANCIO PERSONALE"}</div>
            <h1>{sectionTitle}</h1><p>{SECTION_COPY[section]}</p>
          </div>
          <div className="page-actions">
            {section !== "settings" && <PeriodPicker {...{ period, years, onChange: setPeriod }} />}
            <button type="button" className="button primary new-button" onClick={newMovement} disabled={!canEdit}><Plus size={19} /> Nuovo movimento</button>
          </div>
        </div>

        {demo && <div className="notice example-notice"><FlaskConical size={19} /><div><strong>Stai usando dati di esempio</strong>
          <span>Le modifiche di prova si azzerano quando esci.</span></div><button className="button secondary" type="button" onClick={toggleDemo}>Esci dalla prova</button></div>}
        {!demo && status === "loading" && <p className="loading-status" role="status">Apertura dell’archivio…</p>}
        {!demo && status === "error" && <div className="notice error-notice" role="alert"><CircleAlert size={19} /><div><strong>Archivio non disponibile</strong><span>{loadError}</span></div>
          <button type="button" className="button secondary" onClick={() => { setStatus("loading"); void load(); }}>Riprova</button></div>}

        {section === "overview" && <Overview {...sharedView} onEdit={editMovement} onNew={newMovement}
          onView={navigate} onBalance={editBalance} demoAction={!demo && !ledger.movements.length ? demoButton : undefined}
          due={canEdit && <DuePanel items={due} today={today} busy={busy}
            onRegister={(item) => { void registerOccurrence(item); }} onSkip={skipOccurrence} onRegisterAll={registerAll}
            onEdit={(item) => open({ type: "occurrence", item })} />} />}
        {section === "movements" && <>
          {canEdit && <DuePanel items={due} today={today} busy={busy}
            onRegister={(item) => { void registerOccurrence(item); }} onSkip={skipOccurrence} onRegisterAll={registerAll}
            onEdit={(item) => open({ type: "occurrence", item })} />}
          <Movements key={period} {...{ ledger, period }} onEdit={editMovement} onNew={newMovement} onExport={exportMovements} />
          <RecurringPanel ledger={ledger} onNew={() => editRecurring()} onEdit={editRecurring} />
        </>}
        {section === "accounts" && <Accounts {...sharedView} onAccount={editAccount} onBalance={editBalance} />}
        {section === "reports" && <Reports {...{ ledger, year, period }} />}
        {section === "settings" && <Settings ledger={ledger} onLabel={editLabel} onExport={() => exportMovements(ledger.movements, true)}
          onBalancesExport={exportBalances} onBackup={exportBackup} onImport={() => open({ type: "import" })} onDemo={toggleDemo} session={session} />}
        <footer className="workspace-footer"><span>{APP_NAME}</span><span>{period.length === 4 ? "Anno " + period : monthLabel(period)}</span></footer>
      </main>
    </div>
    {toast && <div className="toast" role="status"><CircleCheck size={18} />{toast}</div>}
    {form && <Modal key={form.type + ("id" in form ? form.id : "")} title={formTitle} busy={busy} onClose={close}
      hint={form.type === "movement" ? "Inserisci i dettagli del movimento."
        : form.type === "occurrence" ? "Controlla i dati prima di registrare questa scadenza."
        : form.type === "recurring" ? "Le scadenze ti verranno proposte da confermare." : undefined}>
      {form.type === "movement" && <MovementForm busy={busy} error={formError} ledger={ledger} mode="movement"
        prefill={form.initial?.value} date={makeDate(period)} canRemove={!!form.initial?.version}
        onRemove={() => form.initial && confirmDelete(form.initial)} onSubmit={(result) => saveMovementForm(form, result)} />}
      {form.type === "occurrence" && <MovementForm busy={busy} error={formError} ledger={ledger} mode="occurrence"
        prefill={occurrenceMovement(form.item.recurring, form.item.date)} date={form.item.date} canRemove={false}
        onSubmit={(result) => {
          void registerOccurrence(form.item, result.movement,
            subcategoryAction(result.movement.type === "expense" ? result.movement.labelId : "", result.newSubcategory));
        }} />}
      {form.type === "recurring" && <MovementForm busy={busy} error={formError} ledger={ledger} mode="recurring"
        prefill={form.initial ? { ...form.initial.value.template, date: nextDate(form.initial.value.schedule) ?? form.initial.value.template.date } : undefined}
        date={makeDate(period)} schedule={form.initial?.value.schedule} paused={!!form.initial?.value.paused}
        canRemove={!!form.initial?.version} onRemove={() => form.initial && confirmDelete(form.initial)}
        onSubmit={(result) => saveRecurringForm(form, result)} />}
      {form.type === "balance" && <BalanceForm busy={busy} error={formError} onSave={(record) => save(record, "Saldo salvato.")}
        account={form.account} initialMonth={month} ledger={ledger} onRemove={confirmDelete} />}
      {form.type === "account" && <AccountEditor {...commitProps} ledger={ledger} id={form.id} initial={form.initial}
        onArchive={(target) => sub((back) => ({ type: "archive", target, back }))}
        onRemove={(target) => sub((back) => ({ type: "remove", target, back }))} />}
      {form.type === "label" && <LabelEditor {...commitProps} ledger={ledger} id={form.id} labelType={form.labelType} initial={form.initial}
        onArchive={(target) => sub((back) => ({ type: "archive", target, back }))}
        onRemove={(target) => sub((back) => ({ type: "remove", target, back }))} />}
      {form.type === "import" && <ImportDialog {...commitProps} records={currentRecords} progress={progress} onCancel={close} />}
      {form.type === "archive" && <ArchiveDialog {...commitProps} ledger={ledger} target={form.target} month={month}
        onCancel={() => { setFormError(""); setForm(form.back); }} />}
      {form.type === "remove" && <RemoveDialog {...commitProps} ledger={ledger} target={form.target}
        onCancel={() => { setFormError(""); setForm(form.back); }} />}
      {form.type === "delete" && <div className="editor">
        <p className="form-help">{form.record.kind === "movement"
          ? `Eliminare «${form.record.value.title}» dal registro?`
          : form.record.kind === "recurring"
            ? `Eliminare il ricorrente «${form.record.value.template.title}»? I movimenti già registrati restano.`
            : `Eliminare il saldo di ${monthLabel(form.record.value.month)}?`}</p>
        <FormError message={formError} />
        <div className="modal-actions">
          <button type="button" className="button secondary" disabled={busy} onClick={() => { setFormError(""); setForm(form.back); }}>Annulla</button>
          <button type="button" className="button danger" disabled={busy} onClick={() => {
            const { id, kind, version } = form.record;
            void commit([{ op: "delete", id, kind, version: version ?? NO_VERSION }], "Voce eliminata.");
          }}>{busy ? "Eliminazione…" : "Elimina"}</button>
        </div>
      </div>}
    </Modal>}
  </div>;
}
