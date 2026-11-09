import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { ArrowDownLeft, ArrowUpRight, Check, SlidersHorizontal } from "lucide-react";
import {
  activeLabels, allTags, money, newId, parseMoney, subcategoryList,
  type Ledger, type Movement, type Mutation,
} from "../lib/ledger";
import { FormError } from "./ledger-forms";
import { TagInput } from "./tags";

type Choice = { labelId: string; subcategory: string };

function choiceKey(choice: Choice) {
  return `${choice.labelId}|${choice.subcategory}`;
}

/** Le combinazioni categoria/sottocategoria usate più spesso negli ultimi mesi. */
function frequentChoices(ledger: Ledger, type: "expense" | "income", today: string) {
  const since = new Date(Date.parse(today + "T12:00:00Z") - 120 * 86_400_000).toISOString().slice(0, 10);
  const active = new Set(activeLabels(ledger, type).map((label) => label.id));
  const counts = new Map<string, { choice: Choice; count: number; last: string }>();
  for (const { value } of ledger.movements) {
    if (value.type !== type || value.date < since || !active.has(value.labelId)) continue;
    const choice = { labelId: value.labelId, subcategory: value.type === "expense" && !value.parts ? value.subcategory : "" };
    const item = counts.get(choiceKey(choice)) ?? { choice, count: 0, last: "" };
    item.count++;
    if (value.date > item.last) item.last = value.date;
    counts.set(choiceKey(choice), item);
  }
  return [...counts.values()].sort((a, b) => b.count - a.count || b.last.localeCompare(a.last)).slice(0, 8).map((item) => item.choice);
}

/** Il conto usato più spesso di recente per questo tipo di movimento. */
function usualAccount(ledger: Ledger, type: "expense" | "income") {
  const accounts = ledger.accounts.filter((account) => (account.value.type === "cash" || account.value.type === "asset") && !account.value.archived);
  const counts = new Map<string, number>();
  for (const { value } of ledger.movements.slice(0, 60)) {
    if (value.type === type && value.accountId) counts.set(value.accountId, (counts.get(value.accountId) ?? 0) + 1);
  }
  const best = [...counts.entries()].filter(([id]) => accounts.some((account) => account.id === id)).sort((a, b) => b[1] - a[1])[0]?.[0];
  return { accounts, best: best ?? accounts[0]?.id ?? "" };
}

/**
 * Inserimento veloce, pensato per il telefono: importo, una categoria con un tocco, salva.
 * Il resto (conto, data, descrizione, tag) ha già un valore sensato.
 */
export function QuickEntry({ ledger, kind, today, busy, error, onSave, onMore }: {
  ledger: Ledger; kind: "expense" | "income"; today: string; busy: boolean; error: string;
  onSave: (actions: Mutation[], message: string, again: boolean) => Promise<boolean>;
  onMore: (value: Movement["value"]) => void;
}) {
  const [type, setType] = useState(kind);
  const [amountText, setAmountText] = useState("");
  const [choice, setChoice] = useState<Choice | null>(null);
  const [showAll, setShowAll] = useState(false);
  const [title, setTitle] = useState("");
  const [date, setDate] = useState(today);
  const [tags, setTags] = useState<string[]>([]);
  const [validation, setValidation] = useState("");
  const [saved, setSaved] = useState(0);
  const amountRef = useRef<HTMLInputElement>(null);
  // Il dialogo sposta il fuoco sul primo pulsante quando si apre: lo riportiamo sull'importo.
  useEffect(() => {
    const timer = window.setTimeout(() => amountRef.current?.focus(), 30);
    return () => window.clearTimeout(timer);
  }, []);
  const { accounts, best } = useMemo(() => usualAccount(ledger, type), [ledger, type]);
  const [accountId, setAccountId] = useState(best);
  const frequent = useMemo(() => frequentChoices(ledger, type, today), [ledger, type, today]);
  const labels = activeLabels(ledger, type);
  const labelName = (id: string) => labels.find((label) => label.id === id)?.value.name ?? "";
  const all: Choice[] = labels.flatMap((label) => [
    { labelId: label.id, subcategory: "" },
    ...(type === "expense" && showAll ? subcategoryList(ledger, label.id).map((subcategory) => ({ labelId: label.id, subcategory })) : []),
  ]);
  const shown = showAll ? all : [...frequent, ...all.filter((item) => !frequent.some((other) => choiceKey(other) === choiceKey(item)))].slice(0, frequent.length ? 10 : 12);
  const amount = parseMoney(amountText);

  function switchType(next: "expense" | "income") {
    if (next === type) return;
    setType(next);
    setChoice(null);
    setShowAll(false);
    const usual = usualAccount(ledger, next);
    if (!usual.accounts.some((account) => account.id === accountId)) setAccountId(usual.best);
  }

  function build(): Movement["value"] | null {
    if (amount === null || amount <= 0) { setValidation("Scrivi l’importo."); amountRef.current?.focus(); return null; }
    if (!choice) { setValidation(type === "expense" ? "Tocca una categoria." : "Tocca una fonte."); return null; }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) { setValidation("La data non è valida."); return null; }
    const name = title.trim() || choice.subcategory || labelName(choice.labelId) || (type === "expense" ? "Spesa" : "Entrata");
    const common = { date, title: name.slice(0, 160), amount, notes: "", accountId: accountId || null, ...(tags.length ? { tags } : {}) };
    return type === "expense"
      ? { ...common, type: "expense", labelId: choice.labelId, subcategory: choice.subcategory, method: "" }
      : { ...common, type: "income", labelId: choice.labelId };
  }

  /** Quello che hai scritto finora, per continuare nel modulo completo. */
  function draft(): Movement["value"] {
    const common = { date: /^\d{4}-\d{2}-\d{2}$/.test(date) ? date : today, title: title.trim().slice(0, 160), amount: amount && amount > 0 ? amount : 0, notes: "",
      accountId: accountId || null, ...(tags.length ? { tags } : {}) };
    return type === "expense"
      ? { ...common, type: "expense", labelId: choice?.labelId ?? "", subcategory: choice?.subcategory ?? "", method: "" }
      : { ...common, type: "income", labelId: choice?.labelId ?? "" };
  }

  async function save(again: boolean) {
    const value = build();
    if (!value) return;
    setValidation("");
    const ok = await onSave([{ op: "save", record: { kind: "movement", id: newId(), version: null, value } }],
      `${value.type === "expense" ? "Spesa" : "Entrata"} di ${money(value.amount)} salvata.`, again);
    if (ok && again) {
      setSaved((count) => count + 1);
      setAmountText(""); setTitle(""); setChoice(null); setTags([]);
      amountRef.current?.focus();
    }
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void save(false);
  }

  return <form className="editor quick-entry" onSubmit={submit}>
    <div className="segmented quick-type" role="group" aria-label="Tipo">
      <button type="button" aria-pressed={type === "expense"} onClick={() => switchType("expense")}><ArrowUpRight size={16} /> Spesa</button>
      <button type="button" aria-pressed={type === "income"} onClick={() => switchType("income")}><ArrowDownLeft size={16} /> Entrata</button>
    </div>
    <label className="quick-amount"><span className="sr-only">Importo in euro</span>
      <input ref={amountRef} inputMode="decimal" enterKeyHint="done" placeholder="0,00" value={amountText} maxLength={14}
        onChange={(event) => setAmountText(event.target.value.replace(/[^\d.,]/g, ""))} aria-label="Importo in euro" />
      <span aria-hidden="true">€</span>
    </label>
    <div className="quick-choices" role="group" aria-label={type === "expense" ? "Categoria" : "Fonte"}>
      {shown.map((item) => {
        const selected = !!choice && choiceKey(choice) === choiceKey(item);
        return <button type="button" key={choiceKey(item)} aria-pressed={selected} onClick={() => { setChoice(item); setValidation(""); }}>
          {selected && <Check size={14} />}
          <span>{item.subcategory || labelName(item.labelId)}</span>
          {item.subcategory && <small>{labelName(item.labelId)}</small>}
        </button>;
      })}
      <button type="button" className="quick-more" onClick={() => setShowAll((value) => !value)}>
        {showAll ? "Meno voci" : type === "expense" ? "Tutte le categorie…" : "Tutte le fonti…"}
      </button>
    </div>
    <div className="form-grid quick-details">
      <label>Conto
        <select value={accountId} onChange={(event) => setAccountId(event.target.value)}>
          <option value="">Nessun conto</option>
          {accounts.map((account) => <option key={account.id} value={account.id}>{account.value.name}</option>)}
        </select></label>
      <label>Data<input type="date" min="1900-01-01" max="2100-12-31" value={date} onChange={(event) => setDate(event.target.value)} /></label>
    </div>
    <label>Descrizione <span className="optional">facoltativa</span>
      <input value={title} maxLength={160} onChange={(event) => setTitle(event.target.value)}
        placeholder={choice ? choice.subcategory || labelName(choice.labelId) : "Es. pranzo, benzina…"} /></label>
    <div className="field-block"><span className="field-label">Tag <span className="optional">facoltativi</span></span>
      <TagInput value={tags} onChange={setTags} suggestions={allTags(ledger).map((item) => item.name)} compact /></div>
    {saved > 0 && <p className="field-note" role="status">{saved === 1 ? "1 movimento salvato" : `${saved} movimenti salvati`} in questa sessione.</p>}
    <FormError message={validation || error} />
    <div className="modal-actions quick-actions">
      <button type="button" className="text-button" disabled={busy} onClick={() => onMore(draft())}>
        <SlidersHorizontal size={15} /> Altri dettagli</button>
      <span className="quick-buttons">
        <button type="button" className="button secondary" disabled={busy} onClick={() => void save(true)}>Salva e aggiungi</button>
        <button type="submit" className="button primary" disabled={busy}>{busy ? "Salvataggio…" : "Salva"}</button>
      </span>
    </div>
  </form>;
}
