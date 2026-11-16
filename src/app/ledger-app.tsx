import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  BarChart3, CalendarDays, ChevronDown, ChevronRight, CircleAlert, CircleCheck, CloudCheck, CloudOff, Eye, EyeOff,
  FlaskConical, LayoutDashboard, List, LogOut, Plus, Settings2, Undo2, WalletCards,
} from "lucide-react";
import {
  NO_VERSION, INITIAL_YEAR, MONTHS, adjustmentMovement, deriveLedger, lastRecordedMonth, monthLabel, periodOf, recordSchema, setDiscreet, setPeriodStart, subcategoryList, templateFrom, templateMovement,
  money, newId, todayInRome, type Account, type Balance, type Budget, type Gap, type Goal, type Label, type LedgerRecord, type Movement, type Mutation, type Recurring, type Template,
} from "../lib/ledger";
import type { TrashItem } from "../lib/ledger-sync";
import { markBackup, readLook, resetDevicePrefs } from "../lib/preferences";
import { BudgetEditor, BudgetList, ForecastPanel, GoalCards, GoalEditor, InsightsPanel, SummaryDialog } from "./planning";
import { ResetDialog, StyleDialog } from "./settings-extra";
import { TRANSACTION_LIMIT, readLedger, writeLedger } from "../lib/local-ledger";
import { sampleLedger } from "../lib/ledger-demo";
import { BALANCE_HEADER, MOVEMENT_HEADER, backupDocument, balanceRows, csvDocument, downloadFile, movementRows } from "../lib/data-io";
import { dueDates, dueItems, nextDate, occurrenceId, occurrenceMovement, type DueItem } from "../lib/recurring";
import { BalanceForm, FormError, Modal, MovementForm, type MovementResult } from "./ledger-forms";
import { Movements, Overview, PanelTitle, Reports, Settings, type SessionInfo } from "./ledger-views";
import { Patrimonio, type PatrimonioTab } from "./patrimonio";
import { CreditEditor, DebtEditor, InvestmentEditor } from "./patrimonio-forms";
import { linkedRecurring, repaymentFor } from "../lib/debts";
import { AccountEditor, ArchiveDialog, LabelEditor, RemoveDialog } from "./manage";
import { DuePanel, RecurringPanel } from "./recurring";
import { RestoreDialog, TRASH_DAYS, visibleTrash } from "./settings-extra";
import { QuickEntry } from "./quick-entry";
import { Reminders } from "./reminders";
import { APP_NAME } from "../lib/config";
import { BrandName, Mark } from "./brand";

const SECTIONS = {
  overview: { title: "Panoramica", icon: LayoutDashboard },
  movements: { title: "Movimenti", icon: List },
  accounts: { title: "Patrimonio", icon: WalletCards },
  reports: { title: "Analisi", icon: BarChart3 },
  settings: { title: "Impostazioni", icon: Settings2 },
} as const;

const SECTION_COPY = {
  overview: "Entrate, spese e patrimonio in un unico riepilogo.",
  movements: "Registra, cerca e aggiorna entrate, spese e trasferimenti.",
  accounts: "Conti, investimenti, crediti e debiti: quanto possiedi e quanto devi.",
  reports: "Scopri come si distribuiscono entrate e spese e confronta i mesi.",
  settings: "Categorie, sicurezza della sessione e copia dei tuoi dati.",
};

// Il periodo scelto resta salvato solo per la sessione della scheda:
// a ogni nuova apertura l'app riparte dal mese corrente.
const PERIOD_KEY = "et-period";
const TODAY = todayInRome();
const CURRENT_YEAR = Number(TODAY.slice(0, 4));
const DEFAULT_PERIOD = TODAY.slice(0, 7);
const REFRESH_INTERVAL_MS = 60_000;
const FILE_PREFIX = APP_NAME.toLowerCase().replace(/[^a-z0-9]+/g, "-");

type Section = keyof typeof SECTIONS;
type EditForm =
  | { type: "movement"; id: string; initial?: Movement; preset?: Movement["value"]; heading?: string; hint?: string }
  | { type: "investment"; id: string; initial?: Account }
  | { type: "debt"; id: string; initial?: Account }
  | { type: "occurrence"; item: DueItem }
  | { type: "recurring"; id: string; initial?: Recurring }
  | { type: "balance"; account: Account; month?: string }
  | { type: "account"; id: string; initial?: Account }
  | { type: "label"; id: string; labelType: "expense" | "income"; initial?: Label }
  | { type: "restore" }
  | { type: "budget"; id: string; initial?: Budget }
  | { type: "goal"; id: string; initial?: Goal }
  | { type: "summary"; period: string }
  | { type: "style"; id: string; record: Account | Label }
  | { type: "reset" }
  | { type: "template"; id: string; initial?: Template }
  | { type: "credit"; id: string; initial?: Account }
  | { type: "quick"; kind: "expense" | "income" };
type Form =
  | EditForm
  | { type: "delete"; record: Movement | Balance | Recurring; back: EditForm }
  | { type: "archive"; target: Account | Label; back: EditForm }
  | { type: "remove"; target: Account | Label; back: EditForm };


function applyActions(records: LedgerRecord[], actions: Mutation[], saved: LedgerRecord[]) {
  const removed = new Set(actions.flatMap((action) => (action.op === "delete" ? [`${action.kind}:${action.id}`] : [])));
  const replaced = new Map(saved.map((record) => [`${record.kind}:${record.id}`, record]));
  return [
    ...records.filter((record) => !removed.has(`${record.kind}:${record.id}`) && !replaced.has(`${record.kind}:${record.id}`)),
    ...replaced.values(),
  ];
}

function useOnline() {
  const [online, setOnline] = useState(() => navigator.onLine);
  useEffect(() => {
    const update = () => setOnline(navigator.onLine);
    window.addEventListener("online", update);
    window.addEventListener("offline", update);
    return () => {
      window.removeEventListener("online", update);
      window.removeEventListener("offline", update);
    };
  }, []);
  return online;
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
  if (periodOf(today).startsWith(period)) return today;
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

const LOOK = readLook();
const DAY_MS = 86_400_000;

type Toast = { text: string; undo?: Mutation[] };
type CommitOptions = { closeForm?: boolean; jump?: boolean; undoable?: boolean; noUndo?: boolean };

export function LedgerApp({ session }: { session: SessionInfo }) {
  const [section, setSection] = useState<Section>(LOOK.start === "quick" ? "overview" : LOOK.start);
  const [hidden, setHidden] = useState(LOOK.discreet);
  const [trash, setTrash] = useState<TrashItem[]>([]);
  // Modalità discreta: money() la legge mentre la pagina si disegna.
  setDiscreet(hidden);
  const [personalPeriod, setPersonalPeriod] = useState(DEFAULT_PERIOD);
  const [examplePeriod, setExamplePeriod] = useState("2027-03");
  const [records, setRecords] = useState<LedgerRecord[]>([]);
  const [example, setExample] = useState<LedgerRecord[] | null>(null);
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  const [loadError, setLoadError] = useState("");
  const [form, setForm] = useState<Form | null>(null);
  const [formError, setFormError] = useState("");
  const [busy, setBusy] = useState(false);
  const [toast, setToastState] = useState<Toast | null>(null);
  const [progress, setProgress] = useState("");
  const [patrimonioTab, setPatrimonioTab] = useState<PatrimonioTab>("accounts");
  const online = useOnline();
  const reading = useRef(0);
  const lastLoad = useRef(0);
  const writing = useRef(false);
  const reloadAfterClose = useRef(false);

  const demo = example !== null;
  const currentRecords = example ?? records;
  const ledger = useMemo(() => deriveLedger(currentRecords), [currentRecords]);
  // Inizio del mese personalizzato: periodOf() lo legge mentre la pagina si disegna.
  setPeriodStart(ledger.settings.periodStart);
  const startDay = ledger.settings.periodStart;
  const firstStart = useRef(startDay);
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

  // Cambiato l'inizio del mese (o arrivato dal cloud): si torna al periodo di oggi.
  useEffect(() => {
    if (firstStart.current === startDay) return;
    firstStart.current = startDay;
    setPeriod(periodOf(todayInRome()));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [startDay]);

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
    lastLoad.current = Date.now();
    const request = ++reading.current;
    try {
      const current = await readLedger();
      if (request === reading.current) {
        setRecords(current.records);
        setTrash(current.trash);
        setStatus("ready");
        setLoadError("");
      }
      // Le voci nel cestino da più di 30 giorni vengono svuotate (una scrittura ciascuna, una volta sola).
      const expired = current.trash.filter((item) => item.deletedAt !== null && Date.now() - item.deletedAt > TRASH_DAYS * DAY_MS);
      if (expired.length && navigator.onLine) {
        void writeLedger(expired.map((item) => ({ op: "delete" as const, kind: item.record.kind, id: item.record.id, version: item.record.version ?? NO_VERSION, trash: {} })))
          .catch(() => { /* si riproverà alla prossima apertura */ });
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
  const wasOnline = useRef(online);
  useEffect(() => {
    if (online && !wasOnline.current && !demo && !form) void load();
    wasOnline.current = online;
  }, [online]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (form || demo) return;
    // Al ritorno sull'app si controllano le modifiche fatte da altri dispositivi,
    // al massimo una volta al minuto (focus e visibilitychange arrivano spesso insieme).
    const refresh = () => {
      if (document.visibilityState !== "visible") return;
      if (Date.now() - lastLoad.current < REFRESH_INTERVAL_MS) return;
      void load();
    };
    window.addEventListener("focus", refresh);
    document.addEventListener("visibilitychange", refresh);
    return () => {
      window.removeEventListener("focus", refresh);
      document.removeEventListener("visibilitychange", refresh);
    };
  }, [load, form, demo]);
  // Scorciatoie dell'icona sul telefono: ?nuovo=spesa / ?nuovo=entrata aprono l'inserimento veloce.
  const shortcutDone = useRef(false);
  useEffect(() => {
    if (shortcutDone.current || status !== "ready") return;
    shortcutDone.current = true;
    const params = new URLSearchParams(window.location.search);
    const wanted = params.get("nuovo");
    if (wanted !== "spesa" && wanted !== "entrata") {
      // Schermata d'apertura scelta in Impostazioni → Personalizzazione.
      if (LOOK.start === "quick") { setFormError(""); setForm({ type: "quick", kind: "expense" }); }
      return;
    }
    params.delete("nuovo");
    const rest = params.toString();
    window.history.replaceState(null, "", window.location.pathname + (rest ? `?${rest}` : "") + window.location.hash);
    setFormError("");
    setForm({ type: "quick", kind: wanted === "entrata" ? "income" : "expense" });
  }, [status]);
  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToastState(null), toast.undo ? 7000 : 4000);
    return () => window.clearTimeout(timer);
  }, [toast]);

  /** Messaggio in basso; con `undo` compare il pulsante «Annulla». */
  function setToast(text: string, undo?: Mutation[]) {
    setToastState(text ? { text, undo } : null);
  }

  function navigate(next: Section) {
    setSection(next);
    window.scrollTo({ top: 0, behavior: "instant" });
  }

  // Scorciatoie da tastiera (fuori dai campi di testo e senza finestre aperte).
  // Il gestore aggiornato sta in un ref: l'ascoltatore si registra una volta sola.
  const keyHandler = useRef<(event: KeyboardEvent) => void>(() => undefined);
  useEffect(() => {
    keyHandler.current = function onKey(event: KeyboardEvent) {
      if (event.ctrlKey || event.metaKey || event.altKey || form || event.defaultPrevented) return;
      const target = event.target as HTMLElement | null;
      if (target?.closest("input, textarea, select, [contenteditable='true']")) return;
      const key = event.key.toLowerCase();
      const order = Object.keys(SECTIONS) as Section[];
      if (key === "n" && canEdit) { event.preventDefault(); newMovement(); }
      else if (key === "v" && canEdit) { event.preventDefault(); quick("expense"); }
      else if (key === "/") {
        event.preventDefault();
        navigate("movements");
        window.setTimeout(() => document.getElementById("movement-search")?.focus(), 60);
      } else if (key === "d") setHidden((value) => !value);
      else if (/^[1-5]$/.test(key)) navigate(order[Number(key) - 1]);
    };
  });
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => keyHandler.current(event);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

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
  function editBalance(account: Account, balanceMonth?: string) { open({ type: "balance", account, month: balanceMonth }); }
  function editTemplate(initial?: Template) { open({ type: "template", id: initial?.id ?? newId(), initial }); }
  function editBudget(initial?: Budget) { open({ type: "budget", id: initial?.id ?? newId(), initial }); }
  function editGoal(initial?: Goal) { open({ type: "goal", id: initial?.id ?? newId(), initial }); }
  function editStyle(record: Account | Label) { open({ type: "style", id: record.id, record }); }

  /** Preferito dalla Panoramica: con l'importo fisso si registra subito, altrimenti si apre il modulo. */
  function applyFavorite(template: Template) {
    if (template.value.amount && template.value.type !== "transfer") {
      void commit([{ op: "save", record: { kind: "movement", id: newId(), version: null, value: templateMovement(template.value, today) } }],
        `«${template.value.name}» registrato: ${money(template.value.amount)}.`, { closeForm: false, undoable: true });
      return;
    }
    setFormError("");
    setForm({ type: "movement", id: newId(), preset: templateMovement(template.value, today), heading: template.value.name, hint: "Scegli l’importo e salva." });
  }

  /** Gesti sul registro: verso destra duplica, verso sinistra elimina (con «Annulla»). */
  function swipe(movement: Movement, direction: "left" | "right") {
    if (direction === "right") { duplicate(movement); return; }
    void commit([{ op: "delete", kind: "movement", id: movement.id, version: movement.version ?? NO_VERSION }], `«${movement.value.title}» eliminato.`, { closeForm: false });
  }

  /** Ricomincia da zero: tutte le voci nel cestino (regole e importazioni vecchie eliminate definitivamente). */
  async function resetEverything(device: boolean) {
    const actions: Mutation[] = currentRecords.map((record) => ({
      op: "delete", kind: record.kind, id: record.id, version: record.version ?? NO_VERSION,
      trash: record.kind === "rule" || record.kind === "import" ? {} : record.value as Record<string, unknown>,
    }));
    const ok = await commit(actions, "Fatto: l’app riparte da zero. Tutto quello che c’era è nel cestino.", { noUndo: true });
    if (!ok) return;
    if (device) { resetDevicePrefs(); setHidden(false); }
    setSection("overview");
    setPeriod(periodOf(todayInRome()));
  }
  function adjust(gap: Gap) {
    open({ type: "movement", id: newId(), preset: adjustmentMovement(ledger, gap.account.id, gap.month, gap.recorded - gap.expected),
      heading: `Rettifica · ${gap.account.value.name}`, hint: `Chiude lo scarto di ${monthLabel(gap.month)}: puoi cambiare categoria o descrizione se sai di cosa si tratta.` });
  }
  function duplicate(movement: Movement) {
    const { origin: _origin, ...copy } = movement.value;
    setFormError("");
    setForm({ type: "movement", id: newId(), preset: { ...copy, date: today } as Movement["value"], heading: "Copia del movimento", hint: "Stessi dati, con la data di oggi: modifica quello che serve." });
  }
  function editAccount(initial?: Account) {
    if (initial?.value.type === "investment") return editInvestment(initial);
    if (initial?.value.type === "debt") return editDebt(initial);
    if (initial?.value.type === "receivable") return editCredit(initial);
    open({ type: "account", id: initial?.id ?? newId(), initial });
  }
  function editLabel(labelType: "expense" | "income", initial?: Label) {
    open({ type: "label", id: initial?.id ?? newId(), labelType, initial });
  }
  function editRecurring(initial?: Recurring) { open({ type: "recurring", id: initial?.id ?? newId(), initial }); }
  function editInvestment(initial?: Account) { open({ type: "investment", id: initial?.id ?? newId(), initial }); }
  function editDebt(initial?: Account) { open({ type: "debt", id: initial?.id ?? newId(), initial }); }
  function repay(debt: Account) {
    // Se c'è una rata ricorrente già scaduta si propone quella data.
    const recurring = linkedRecurring(ledger, debt.id);
    const next = recurring && !recurring.value.paused ? nextDate(recurring.value.schedule) : null;
    open({ type: "movement", id: newId(), preset: repaymentFor(ledger, debt, next && next <= today ? next : today) });
  }
  function quick(kind: "expense" | "income") { open({ type: "quick", kind }); }
  function editCredit(initial?: Account) { open({ type: "credit", id: initial?.id ?? newId(), initial }); }
  function creditMove(credit: Account, direction: "lend" | "back") {
    // Il conto usato l'ultima volta con questo credito, altrimenti il primo conto di liquidità.
    const last = ledger.movements.find(({ value }) => value.type === "transfer" && (value.accountId === credit.id || value.toAccountId === credit.id));
    const lastOther = last?.value.type === "transfer" ? (last.value.accountId === credit.id ? last.value.toAccountId : last.value.accountId) : undefined;
    const cash = ledger.accounts.find((account) => account.id === lastOther && !account.value.archived)
      ?? ledger.accounts.find((account) => account.value.type === "cash" && !account.value.archived);
    open({ type: "movement", id: newId(), preset: direction === "back"
      ? { type: "transfer", date: today, title: `Restituzione da ${credit.value.name}`.slice(0, 160), amount: 0, accountId: credit.id, toAccountId: cash?.id ?? "", notes: "" }
      : { type: "transfer", date: today, title: `Prestito a ${credit.value.name}`.slice(0, 160), amount: 0, accountId: cash?.id ?? "", toAccountId: credit.id, notes: "" } });
  }
  function contribute(investment: Account) {
    const from = ledger.accounts.find((account) => account.value.type === "cash" && !account.value.archived);
    open({ type: "movement", id: newId(), preset: {
      type: "transfer", date: today, title: `Versamento ${investment.value.name}`.slice(0, 160), amount: 0,
      accountId: from?.id ?? "", toAccountId: investment.id, notes: "",
    } });
  }
  function sub(next: (back: EditForm) => Form) {
    if (!form || form.type === "delete" || form.type === "archive" || form.type === "remove") return;
    setFormError("");
    setForm(next(form));
  }
  function confirmDelete(record: Movement | Balance | Recurring) { sub((back) => ({ type: "delete", record, back })); }

  /** Applica una o più scritture. Una sola scrittura usa il controllo dei conflitti tra dispositivi. */
  async function commit(input: Mutation[], message: string, options: CommitOptions = {}) {
    if (writing.current || !input.length) return false;
    const known = new Map(currentRecords.map((record) => [`${record.kind}:${record.id}`, record]));
    // Le eliminazioni conservano il contenuto nel cestino (trash: {} = eliminazione definitiva).
    const actions: Mutation[] = input.map((action) => {
      if (action.op !== "delete" || action.trash) return action;
      const record = known.get(`${action.kind}:${action.id}`);
      return record ? { ...action, trash: record.value as Record<string, unknown> } : action;
    });
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
      } else {
        saved = await writeLedger(actions, (done, total) => {
          if (total > 400) setProgress(`Salvataggio ${done.toLocaleString("it-IT")} di ${total.toLocaleString("it-IT")}…`);
        });
      }
      if (demo) setExample((previous) => applyActions(previous ?? [], actions, saved));
      else setRecords((previous) => applyActions(previous, actions, saved));

      // Cestino e «Annulla».
      const deletes = actions.filter((action): action is Extract<Mutation, { op: "delete" }> => action.op === "delete");
      const trashed = deletes.flatMap((action) => {
        const record = known.get(`${action.kind}:${action.id}`);
        return record && action.trash && Object.keys(action.trash).length ? [{ record, deletedAt: Date.now() }] : [];
      });
      const gone = new Set([...saved.map((record) => `${record.kind}:${record.id}`), ...deletes.map((action) => `${action.kind}:${action.id}`)]);
      if (!demo) setTrash((previous) => [...trashed, ...previous.filter((item) => !gone.has(`${item.record.kind}:${item.record.id}`))]);
      let undo: Mutation[] | undefined;
      if (!options.noUndo && trashed.length && deletes.length === actions.length) {
        undo = trashed.map(({ record }) => ({ op: "save", record: { ...record, version: null } }));
      } else if (options.undoable) {
        const created = new Set(actions.flatMap((action) => (action.op === "save" && action.record.version === null && action.record.kind === "movement" ? [action.record.id] : [])));
        const fresh = saved.filter((record) => created.has(record.id));
        if (fresh.length) undo = fresh.map((record) => ({ op: "delete", kind: record.kind, id: record.id, version: record.version ?? NO_VERSION, trash: {} }));
      }

      // Dopo aver salvato un movimento o un saldo si mostra il suo mese.
      if (options.jump) {
        const movements = saved.filter((record): record is Movement => record.kind === "movement");
        const balances = saved.filter((record): record is Balance => record.kind === "balance");
        if (movements.length === 1 && !periodOf(movements[0].value.date).startsWith(period)) setPeriod(periodOf(movements[0].value.date));
        if (balances.length === 1 && !balances[0].value.month.startsWith(period)) setPeriod(balances[0].value.month);
      }
      if (options.closeForm !== false) setForm(null);
      setToast(message, undo);
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
    let note = "";
    if (result.favorite) {
      const value = templateFrom(result.movement, result.favorite.name, result.favorite.fixedAmount, nextTemplateOrder());
      if (value) { actions.push({ op: "save", record: { kind: "template", id: newId(), version: null, value } }); note = " Aggiunto ai preferiti."; }
    }
    // Una rata registrata a mano nello stesso mese della prossima scadenza la segna come pagata.
    const movement = result.movement;
    if (!target.initial && movement.type === "repayment") {
      const linked = linkedRecurring(ledger, movement.debtId);
      const next = linked ? nextDate(linked.value.schedule) : null;
      if (linked && next && next.slice(0, 7) === movement.date.slice(0, 7)) {
        actions.push({ op: "save", record: { ...linked, value: { ...linked.value, schedule: { ...linked.value.schedule, done: linked.value.schedule.done + 1 } } } });
        note = ` La scadenza del ${next.split("-").reverse().join("/")} risulta pagata.`;
      }
    }
    void commit(actions, (result.schedule ? "Movimento salvato e ripetizione creata." : "Movimento salvato.") + note, { jump: true });
  }

  /** true se la scadenza ha già il suo movimento (es. il calendario del ricorrente è ripartito da date già registrate). */
  function alreadyRegistered(recurring: Recurring, date: string) {
    const id = occurrenceId(recurring, date, () => "");
    return !!id && currentRecords.some((record) => record.kind === "movement" && record.id === id);
  }

  function registerOccurrence(item: DueItem, value = occurrenceMovement(item.recurring, item.date, ledger), extra: Mutation[] = []) {
    const { recurring } = item;
    const schedule = { ...recurring.value.schedule, done: recurring.value.schedule.done + 1 };
    const advance: Mutation = { op: "save", record: { ...recurring, value: { ...recurring.value, schedule } } };
    if (alreadyRegistered(recurring, item.date)) {
      return commit([...extra, advance], `La scadenza del ${item.date.split("-").reverse().join("/")} era già registrata: segnata come gestita.`);
    }
    return commit([
      ...extra,
      { op: "save", record: { kind: "movement", id: occurrenceId(recurring, item.date, newId), version: null, value } },
      advance,
    ], `«${value.title}» registrato.`);
  }

  function skipOccurrence(item: DueItem) {
    const { recurring } = item;
    void commit([{ op: "save", record: { ...recurring, value: { ...recurring.value, schedule: { ...recurring.value.schedule, done: recurring.value.schedule.done + 1 } } } }],
      `Scadenza del ${item.date.split("-").reverse().join("/")} saltata.`);
  }

  /** Per più rate dello stesso debito di fila, il residuo tiene conto delle rate appena aggiunte. */
  function registerValue(recurring: Recurring, date: string, pending: Mutation[]) {
    const extra = pending.flatMap((action) => (action.op === "save" && action.record.kind === "movement" ? [action.record] : []));
    const view = extra.length ? { ...ledger, movements: [...ledger.movements, ...extra] } : ledger;
    return occurrenceMovement(recurring, date, view);
  }

  /**
   * Registra tutte le scadenze arrivate in un'unica transazione (con controllo dei conflitti).
   * Se sono troppe per una transazione si registrano i primi ricorrenti: gli altri restano proposti.
   */
  function registerAll() {
    const actions: Mutation[] = [];
    let count = 0;
    let left = 0;
    for (const item of due) {
      const dates = dueDates(item.recurring.value.schedule, today);
      const group: Mutation[] = [];
      for (const date of dates) {
        if (alreadyRegistered(item.recurring, date)) continue;
        group.push({ op: "save", record: { kind: "movement", id: occurrenceId(item.recurring, date, newId), version: null, value: registerValue(item.recurring, date, [...actions, ...group]) } });
      }
      group.push({ op: "save", record: { ...item.recurring, value: { ...item.recurring.value, schedule: { ...item.recurring.value.schedule, done: item.recurring.value.schedule.done + dates.length } } } });
      if (actions.length && actions.length + group.length > TRANSACTION_LIMIT) { left += dates.length; continue; }
      actions.push(...group);
      count += group.length - 1;
    }
    const message = `${count} ${count === 1 ? "movimento registrato" : "movimenti registrati"}.`;
    void commit(actions, left ? `${message} Altre ${left} scadenze restano da registrare: premi di nuovo «Registra tutte».` : message);
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

  function nextTemplateOrder() {
    return ledger.templates.reduce((max, item) => Math.max(max, item.value.order + 1), 0);
  }

  function saveTemplateForm(target: Extract<EditForm, { type: "template" }>, result: MovementResult) {
    const favorite = result.favorite ?? { name: result.movement.title, fixedAmount: true };
    const value = templateFrom(result.movement, favorite.name, favorite.fixedAmount, target.initial?.value.order ?? nextTemplateOrder());
    if (!value) { setFormError("Un preferito può essere una spesa, un’entrata o un trasferimento."); return; }
    void commit([
      ...subcategoryAction(result.movement.type === "expense" ? result.movement.labelId : "", result.newSubcategory),
      { op: "save", record: { kind: "template", id: target.id, version: target.initial?.version ?? null, value } },
    ], target.initial ? "Preferito aggiornato." : "Preferito creato.");
  }

  function restoreTrash(items: TrashItem[]) {
    const live = new Set(currentRecords.map((record) => `${record.kind}:${record.id}`));
    const actions: Mutation[] = items.filter((item) => !live.has(`${item.record.kind}:${item.record.id}`))
      .map((item) => ({ op: "save", record: { ...item.record, version: null } }));
    if (!actions.length) { setToast("Queste voci esistono già."); return; }
    void commit(actions, actions.length === 1 ? "Voce ripristinata." : `${actions.length} voci ripristinate.`, { closeForm: false });
  }

  function purgeTrash(items: TrashItem[]) {
    void commit(items.map((item) => ({ op: "delete", kind: item.record.kind, id: item.record.id, version: item.record.version ?? NO_VERSION, trash: {} })),
      items.length === 1 ? "Voce eliminata definitivamente." : `${items.length} voci eliminate definitivamente.`, { closeForm: false, noUndo: true });
  }

  function exportMovements(items: Movement[], all = false) {
    downloadFile(`${FILE_PREFIX}-${demo ? "esempio-" : ""}movimenti${all ? "" : "-" + period}.csv`,
      csvDocument(MOVEMENT_HEADER, movementRows(ledger, items)), "text/csv;charset=utf-8");
  }

  function exportBalances() {
    downloadFile(`${FILE_PREFIX}-${demo ? "esempio-" : ""}saldi.csv`, csvDocument(BALANCE_HEADER, balanceRows(ledger)), "text/csv;charset=utf-8");
  }

  function exportBackup() {
    if (!demo) markBackup();
    downloadFile(`${FILE_PREFIX}-${demo ? "esempio-" : ""}backup-${today}.json`, backupDocument(currentRecords), "application/json");
  }

  const sectionTitle = SECTIONS[section].title;
  const presetDebt = form?.type === "movement" && form.preset?.type === "repayment" ? ledger.accounts.find((account) => account.id === (form.preset as { debtId: string }).debtId) : undefined;
  const flexiblePreset = presetDebt?.value.debt?.kind === "flexible";
  const presetTransfer = form?.type === "movement" && form.preset?.type === "transfer" ? form.preset : null;
  const presetCredit = presetTransfer ? ledger.accounts.find((account) => account.value.type === "receivable" && (account.id === presetTransfer.accountId || account.id === presetTransfer.toAccountId)) : undefined;
  const presetTransferTitle = presetCredit ? (presetTransfer?.accountId === presetCredit.id ? "Restituzione · " : "Prestito · ") + presetCredit.value.name : null;
  const formTitle = form?.type === "movement" ? (form.heading ?? (form.initial ? "Modifica movimento" : form.preset?.type === "repayment" ? (flexiblePreset ? "Registra rimborso" : "Registra rata")
    : form.preset?.type === "transfer" ? (presetTransferTitle ?? "Versamento") : "Nuovo movimento"))
    : form?.type === "investment" ? (form.initial ? "Modifica investimento" : "Nuovo investimento")
    : form?.type === "debt" ? (form.initial ? "Modifica debito" : "Nuovo debito")
    : form?.type === "occurrence" ? "Registra ricorrente"
    : form?.type === "recurring" ? (form.initial ? "Modifica ricorrente" : "Nuovo ricorrente")
    : form?.type === "balance" ? (form.account.value.type === "debt" ? "Correggi residuo · " : form.account.value.type === "investment" ? "Aggiorna valore · " : "Saldo · ") + form.account.value.name
    : form?.type === "account" ? (form.initial ? "Modifica conto" : "Nuovo conto")
    : form?.type === "label" ? (form.initial ? (form.labelType === "expense" ? "Modifica categoria" : "Modifica fonte") : form.labelType === "expense" ? "Nuova categoria" : "Nuova fonte")
    : form?.type === "restore" ? "Ripristina un backup"
    : form?.type === "template" ? (form.initial ? "Modifica preferito" : "Nuovo preferito")
    : form?.type === "budget" ? (form.initial ? "Modifica budget" : "Nuovo budget")
    : form?.type === "goal" ? (form.initial ? "Modifica obiettivo" : "Nuovo obiettivo")
    : form?.type === "summary" ? "Riepilogo"
    : form?.type === "style" ? `Aspetto · ${form.record.value.name}`
    : form?.type === "reset" ? "Ricomincia da zero"
    : form?.type === "credit" ? (form.initial ? "Modifica credito" : "Nuovo credito")
    : form?.type === "quick" ? (form.kind === "income" ? "Entrata veloce" : "Spesa veloce")
    : form?.type === "archive" ? (form.target.value.archived ? "Ripristina" : "Archivia") + " · " + form.target.value.name
    : form?.type === "remove" ? "Elimina · " + form.target.value.name
    : "Elimina voce";
  const canEdit = demo || status === "ready";
  const demoButton = <button className="text-button example-button" type="button" onClick={toggleDemo}><FlaskConical size={15} /> Esplora con esempi</button>;
  const sharedView = { ledger, year, period, month, monthChange: setPeriod };
  const commitProps = { busy, error: formError, onCommit: (actions: Mutation[], message: string) => { void commit(actions, message); } };
  const extras = {
    budgets: <section className="panel budget-panel"><PanelTitle title="Budget" subtitle={period.length === 4 ? `Anno ${period}` : monthLabel(period)}
      action={<button type="button" className="icon-button quiet" aria-label="Nuovo budget" onClick={() => editBudget()}><Plus size={17} /></button>} />
      <BudgetList ledger={ledger} period={period} onEdit={editBudget} limit={4} /></section>,
    forecast: <ForecastPanel ledger={ledger} today={today} />,
    goals: <section className="panel goals-panel"><PanelTitle title="Obiettivi" subtitle="Risparmi in corso"
      action={<button type="button" className="icon-button quiet" aria-label="Nuovo obiettivo" onClick={() => editGoal()}><Plus size={17} /></button>} />
      <GoalCards ledger={ledger} today={today} onEdit={editGoal} limit={3} compact /></section>,
    insights: <InsightsPanel ledger={ledger} period={period} today={today} />,
    ...(ledger.templates.length ? { favorites: <section className="panel"><PanelTitle title="Preferiti" subtitle="Un tocco e il movimento è registrato." />
      <div className="favorite-bar wrap">{ledger.templates.map((item) => <button type="button" key={item.id} disabled={busy || !canEdit} onClick={() => applyFavorite(item)}>
        <span>{item.value.name}</span><small>{item.value.amount ? money(item.value.amount) : "importo…"}</small></button>)}</div></section> } : {}),
  };
  const reminders = !demo && status === "ready" && <Reminders ledger={ledger} today={today} onQuick={() => quick("expense")}
    onBalance={(account, balanceMonth) => editBalance(account, balanceMonth)} onBackup={exportBackup} />;

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
          <div><strong>Archivio cloud</strong><small title={session.email}>{session.email || "Conti in euro · EUR"}</small></div>
        </div>
        <button type="button" className="sidebar-logout" onClick={session.onLogout}><LogOut size={17} /> Esci</button>
      </div>
    </aside>

    <div className="workspace">
      <header className="topbar">
        <div className="breadcrumbs"><span>{APP_NAME}</span><ChevronRight size={15} /><strong>{sectionTitle}</strong></div>
        <div className="topbar-end">
          <span className={`privacy-badge${!demo && !online ? " is-offline" : ""}`} role="status">
            {demo ? <><i />Dati di esempio</>
              : !online ? <><CloudOff size={13} />Nessuna connessione</>
              : <><i />Archivio sincronizzato</>}
          </span>
          <button type="button" className="icon-button quiet" aria-pressed={hidden} aria-label={hidden ? "Mostra gli importi" : "Nascondi gli importi"}
            title={hidden ? "Mostra gli importi" : "Nascondi gli importi (modalità discreta)"} onClick={() => setHidden((value) => !value)}>
            {hidden ? <EyeOff size={17} /> : <Eye size={17} />}</button>
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
          onView={navigate} onBalance={(account) => editBalance(account)} demoAction={!demo && !ledger.movements.length ? demoButton : undefined}
          due={canEdit && <>{reminders}<DuePanel items={due} today={today} busy={busy}
            onRegister={(item) => { void registerOccurrence(item); }} onSkip={skipOccurrence} onRegisterAll={registerAll}
            onEdit={(item) => open({ type: "occurrence", item })} /></>} extras={extras} />}
        {section === "movements" && <>
          {canEdit && <DuePanel items={due} today={today} busy={busy}
            onRegister={(item) => { void registerOccurrence(item); }} onSkip={skipOccurrence} onRegisterAll={registerAll}
            onEdit={(item) => open({ type: "occurrence", item })} />}
          <Movements key={period} {...{ ledger, period }} onEdit={editMovement} onNew={newMovement} onExport={exportMovements} busy={busy}
            onCommit={(actions, message) => { void commit(actions, message, { closeForm: false }); }} onSwipe={swipe} />
          <RecurringPanel ledger={ledger} onNew={() => editRecurring()} onEdit={editRecurring} />
        </>}
        {section === "accounts" && <Patrimonio ledger={ledger} year={year} month={month} monthChange={setPeriod}
          tab={patrimonioTab} onTab={setPatrimonioTab} onAccount={editAccount} onBalance={(account) => editBalance(account)} onAdjust={adjust} onGoal={editGoal} today={today}
          onInvestment={editInvestment} onDebt={editDebt} onRepay={repay} onContribute={contribute} onCredit={editCredit} onCreditMove={creditMove} />}
        {section === "reports" && <Reports {...{ ledger, year, period, today }} onBudget={editBudget} onSummary={() => open({ type: "summary", period })} />}
        {section === "settings" && <Settings ledger={ledger} onLabel={editLabel} onExport={() => exportMovements(ledger.movements, true)}
          onBalancesExport={exportBalances} onBackup={exportBackup} onRestore={() => open({ type: "restore" })} onDemo={toggleDemo} session={session}
          onTemplate={editTemplate} trash={trash} demo={demo} onRestoreTrash={restoreTrash} onPurgeTrash={purgeTrash}
          onStyle={editStyle} onReset={() => open({ type: "reset" })}
          busy={busy} onCommit={(actions, message) => { void commit(actions, message, { closeForm: false }); }} />}
        <footer className="workspace-footer"><span>{APP_NAME}</span><span>{period.length === 4 ? "Anno " + period : monthLabel(period)}</span></footer>
      </main>
    </div>
    {canEdit && !form && <button type="button" className="fab" aria-label="Spesa veloce" title="Spesa veloce" onClick={() => quick("expense")}><Plus size={26} /></button>}
    {toast && <div className="toast" role="status"><CircleCheck size={18} /><span>{toast.text}</span>
      {toast.undo && <button type="button" className="toast-action" disabled={busy} onClick={() => {
        const undo = toast.undo!;
        setToastState(null);
        void commit(undo, "Fatto: azione annullata.", { closeForm: false, noUndo: true });
      }}><Undo2 size={15} /> Annulla</button>}</div>}
    {form && <Modal key={form.type + ("id" in form ? form.id : "")} title={formTitle} busy={busy} onClose={close}
      hint={form.type === "movement" ? (form.hint ?? (form.preset?.type === "repayment" ? (flexiblePreset ? "Inserisci quanto hai restituito: il residuo scende di tutto l’importo." : "Controlla importo e data: la divisione si aggiorna da sola.")
          : form.preset?.type === "transfer" ? (presetCredit ? "Un trasferimento tra il tuo conto e il credito: non è né spesa né entrata." : "Un trasferimento dal conto all’investimento: non conta come spesa.") : "Inserisci i dettagli del movimento."))
        : form.type === "template" ? "Un movimento modello: lo registri con un tocco dall’inserimento veloce."
        : form.type === "occurrence" ? "Controlla i dati prima di registrare questa scadenza."
        : form.type === "recurring" ? "Le scadenze ti verranno proposte da confermare." : undefined}>
      {form.type === "movement" && <MovementForm busy={busy} error={formError} ledger={ledger} mode="movement"
        prefill={form.initial?.value ?? form.preset} fresh={!form.initial && !!form.preset} editingId={form.initial?.id}
        date={makeDate(period)} canRemove={!!form.initial?.version}
        onDuplicate={form.initial ? () => duplicate(form.initial!) : undefined}
        onRemove={() => form.initial && confirmDelete(form.initial)} onSubmit={(result) => saveMovementForm(form, result)} />}
      {form.type === "template" && <MovementForm busy={busy} error={formError} ledger={ledger} mode="template"
        prefill={form.initial ? templateMovement(form.initial.value, today) : undefined} templateName={form.initial?.value.name}
        date={today} canRemove={!!form.initial?.version}
        onRemove={() => form.initial && void commit([{ op: "delete", kind: "template", id: form.initial.id, version: form.initial.version ?? NO_VERSION }], "Preferito eliminato.")}
        onSubmit={(result) => saveTemplateForm(form, result)} />}
      {form.type === "occurrence" && <MovementForm busy={busy} error={formError} ledger={ledger} mode="occurrence"
        prefill={occurrenceMovement(form.item.recurring, form.item.date, ledger)} date={form.item.date} canRemove={false}
        onSubmit={(result) => {
          void registerOccurrence(form.item, result.movement,
            subcategoryAction(result.movement.type === "expense" ? result.movement.labelId : "", result.newSubcategory));
        }} />}
      {form.type === "recurring" && <MovementForm busy={busy} error={formError} ledger={ledger} mode="recurring"
        prefill={form.initial ? { ...form.initial.value.template, date: nextDate(form.initial.value.schedule) ?? form.initial.value.template.date } : undefined}
        date={makeDate(period)} schedule={form.initial?.value.schedule} paused={!!form.initial?.value.paused}
        canRemove={!!form.initial?.version} onRemove={() => form.initial && confirmDelete(form.initial)}
        onSubmit={(result) => saveRecurringForm(form, result)} />}
      {form.type === "balance" && <BalanceForm busy={busy} error={formError}
        onSave={(record, adjustment) => {
          if (!adjustment) { save(record, "Saldo salvato."); return; }
          void commit([{ op: "save", record }, { op: "save", record: { kind: "movement", id: newId(), version: null, value: adjustment } }], "Saldo salvato con la rettifica.", { jump: true });
        }}
        account={form.account} initialMonth={form.month ?? month} ledger={ledger} onRemove={confirmDelete} />}
      {form.type === "investment" && <InvestmentEditor {...commitProps} ledger={ledger} id={form.id} initial={form.initial} month={today.slice(0, 7)}
        onArchive={(target) => sub((back) => ({ type: "archive", target, back }))}
        onRemove={(target) => sub((back) => ({ type: "remove", target, back }))} />}
      {form.type === "debt" && <DebtEditor {...commitProps} ledger={ledger} id={form.id} initial={form.initial}
        onArchive={(target) => sub((back) => ({ type: "archive", target, back }))}
        onRemove={(target) => sub((back) => ({ type: "remove", target, back }))} />}
      {form.type === "credit" && <CreditEditor {...commitProps} ledger={ledger} id={form.id} initial={form.initial}
        onArchive={(target) => sub((back) => ({ type: "archive", target, back }))}
        onRemove={(target) => sub((back) => ({ type: "remove", target, back }))} />}
      {form.type === "account" && <AccountEditor {...commitProps} ledger={ledger} id={form.id} initial={form.initial}
        onArchive={(target) => sub((back) => ({ type: "archive", target, back }))}
        onRemove={(target) => sub((back) => ({ type: "remove", target, back }))} />}
      {form.type === "label" && <LabelEditor {...commitProps} ledger={ledger} id={form.id} labelType={form.labelType} initial={form.initial}
        onArchive={(target) => sub((back) => ({ type: "archive", target, back }))}
        onRemove={(target) => sub((back) => ({ type: "remove", target, back }))} />}
      {form.type === "budget" && <BudgetEditor {...commitProps} ledger={ledger} initial={form.initial} />}
      {form.type === "goal" && <GoalEditor {...commitProps} ledger={ledger} initial={form.initial} />}
      {form.type === "summary" && <SummaryDialog ledger={ledger} period={form.period} today={today} onPeriod={(next) => setForm({ type: "summary", period: next })} />}
      {form.type === "style" && <StyleDialog {...commitProps} record={form.record} />}
      {form.type === "reset" && <ResetDialog busy={busy} error={formError} progress={progress} count={currentRecords.length}
        onCancel={close} onConfirm={(device) => { void resetEverything(device); }} />}
      {form.type === "restore" && <RestoreDialog {...commitProps} records={currentRecords} progress={progress} onCancel={close} />}
      {form.type === "quick" && <QuickEntry ledger={ledger} kind={form.kind} today={today} busy={busy} error={formError}
        onSave={(actions, message, again) => commit(actions, message, { closeForm: !again, jump: !again, undoable: true })}
        onMore={(value) => { setFormError(""); setForm({ type: "movement", id: newId(), preset: value }); }} />}
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
