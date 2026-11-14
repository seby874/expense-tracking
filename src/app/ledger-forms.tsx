import { useEffect, useRef, useState, type FormEvent, type ReactNode } from "react";
import { ArrowDownLeft, ArrowLeftRight, ArrowUpRight, Calculator, Copy, HandCoins, Plus, Repeat, Scale, Split, Star, Trash2, X } from "lucide-react";
import {
  ENTRY_TYPES, INTEREST_LABEL, METHOD_LABELS, activeLabels, adjustmentMovement, allTags, balanceId, evaluateAmount, expectedBalance, money, monthEnd, monthLabel, parseMoney, sameName, subcategoryList, titleSuggestions,
  type Account, type Balance, type Ledger, type LedgerRecord, type Movement, type MovementType, type Part, type Schedule, type TitleSuggestion,
} from "../lib/ledger";
import { debtDetails, linkedRecurring, splitRepayment } from "../lib/debts";
import { TagInput } from "./tags";
import { AmountPreview, TitleField } from "./inputs";

type PartDraft = { key: number; target: string; subcategory: string; amount: string };
let partKey = 0;

export const TYPE_ICONS = { income: ArrowDownLeft, expense: ArrowUpRight, transfer: ArrowLeftRight, repayment: HandCoins };

export function Modal({ title, hint, busy, onClose, children }: {
  title: string; hint?: string; busy: boolean; onClose: () => void; children: ReactNode;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    dialog.showModal();
    return () => dialog.close();
  }, []);
  return (
    <dialog ref={ref} className="modal" aria-labelledby="dialog-title"
      onCancel={(event) => { event.preventDefault(); if (!busy) onClose(); }}>
      <div className="modal-header">
        <div><h2 id="dialog-title">{title}</h2>{hint && <p>{hint}</p>}</div>
        <button className="icon-button" type="button" aria-label="Chiudi" onClick={onClose} disabled={busy}><X size={20} /></button>
      </div>
      {children}
    </dialog>
  );
}

export function FormError({ message }: { message: string }) {
  return message ? <p className="form-error" role="alert">{message}</p> : null;
}

type SaveProps = {
  id: string; busy: boolean; error: string; onSave: (record: LedgerRecord) => void;
};

export function field(data: FormData, key: string) {
  return String(data.get(key) ?? "").trim();
}

export function amountInput(amount: number | undefined) {
  return amount === undefined ? "" : (amount / 100).toFixed(2).replace(".", ",");
}

export function Submit({ busy, children = "Salva" }: { busy: boolean; children?: ReactNode }) {
  return <button type="submit" className="button primary" disabled={busy}>{busy ? "Salvataggio…" : children}</button>;
}

export type MovementResult = {
  movement: Movement["value"];
  newSubcategory: string | null;
  schedule: Pick<Schedule, "frequency" | "every" | "end"> | null;
  paused: boolean;
  /** Da salvare (anche) come preferito: nome e se l'importo è fisso. */
  favorite: { name: string; fixedAmount: boolean } | null;
};

const NEW_SUBCATEGORY = "__new__";
const FREQUENCIES = { weekly: "Settimane", monthly: "Mesi", yearly: "Anni" } as const;

/**
 * Modulo unico per: movimento normale, registrazione di una scadenza ricorrente
 * ("occurrence") e modifica di un movimento ricorrente ("recurring").
 */
export function MovementForm({ busy, error, ledger, prefill, date, mode, schedule, paused = false, canRemove, onSubmit, onRemove, editingId, fresh = false, onDuplicate, templateName }: {
  busy: boolean; error: string; ledger: Ledger; prefill?: Movement["value"]; date: string;
  /** "template": modifica di un preferito (niente data, importo facoltativo). */
  mode: "movement" | "occurrence" | "recurring" | "template"; schedule?: Schedule; paused?: boolean;
  /** Apre un movimento nuovo con gli stessi dati (solo in modifica). */ onDuplicate?: () => void;
  /** Nome del preferito in modifica. */ templateName?: string;
  canRemove: boolean; onSubmit: (result: MovementResult) => void; onRemove?: () => void;
  /** Id del movimento in modifica (escluso dal calcolo del residuo). */ editingId?: string;
  /** `prefill` è solo una proposta per un movimento nuovo (es. "Registra rata"). */ fresh?: boolean;
}) {
  const value = prefill;
  const [type, setType] = useState<MovementType>(value?.type ?? "expense");
  const [amountText, setAmountText] = useState(value?.amount ? amountInput(value.amount) : "");
  const [titleText, setTitleText] = useState(value?.title ?? "");
  const [favorite, setFavorite] = useState(false);
  const [favoriteName, setFavoriteName] = useState(templateName ?? "");
  const [rememberAmount, setRememberAmount] = useState(true);
  const template = mode === "template";
  const [dateText, setDateText] = useState(value?.date ?? date);
  const [debtId, setDebtId] = useState(value?.type === "repayment" ? value.debtId : "");
  // Una rata già salvata con una divisione diversa da quella calcolata resta "a mano".
  const [manualSplit, setManualSplit] = useState(() => {
    if (fresh || value?.type !== "repayment") return false;
    const saved = ledger.accounts.find((account) => account.id === value.debtId);
    return debtDetails(saved)?.kind === "loan" && splitRepayment(ledger, saved, value.date, value.amount, editingId).interest !== value.interest;
  });
  const [interestText, setInterestText] = useState(value?.type === "repayment" ? amountInput(value.interest) : "");
  const titleRef = useRef<HTMLInputElement>(null);
  const accountRef = useRef<HTMLSelectElement>(null);
  const toAccountRef = useRef<HTMLSelectElement>(null);
  const methodRef = useRef<HTMLInputElement>(null);
  const debts = ledger.accounts.filter((account) => account.value.type === "debt" && (!account.value.archived || account.id === debtId));
  const debt = debts.find((account) => account.id === debtId);
  const amountValue = evaluateAmount(amountText);
  const autoSplit = type === "repayment" && debt && amountValue !== null && amountValue > 0 && /^\d{4}-\d{2}-\d{2}$/.test(dateText)
    ? splitRepayment(ledger, debt, dateText, amountValue, editingId) : null;
  const [labelId, setLabelId] = useState(value && value.type !== "transfer" ? value.labelId : "");
  const [subcategory, setSubcategory] = useState(value?.type === "expense" ? value.subcategory : "");
  const [newName, setNewName] = useState("");
  const [repeat, setRepeat] = useState(mode === "recurring");
  const [validation, setValidation] = useState("");
  const [tags, setTags] = useState<string[]>(value?.tags ?? []);
  // Spesa divisa: ogni parte va a una categoria («label:id») o a un credito («credit:id»).
  const [parts, setParts] = useState<PartDraft[] | null>(() => (value?.type === "expense" && value.parts
    ? value.parts.map((part) => ({ key: partKey++, target: part.creditId ? `credit:${part.creditId}` : `label:${part.labelId}`, subcategory: part.subcategory ?? "", amount: amountInput(part.amount) }))
    : null));
  const receivables = ledger.accounts.filter((account) => account.value.type === "receivable" && (!account.value.archived || (value?.type === "expense" && value.parts?.some((part) => part.creditId === account.id))));
  const keepLabel = value && value.type !== "transfer" ? value.labelId : null;
  const choices = activeLabels(ledger, type === "income" ? "income" : "expense", keepLabel);
  // (per le rate la categoria degli interessi arriva dal debito)
  const keepAccounts = [value?.accountId ?? null, value?.type === "transfer" ? value.toAccountId : null];
  // I crediti (soldi che ti devono) si muovono solo con i trasferimenti.
  const accounts = ledger.accounts.filter((account) => account.value.type !== "debt" && (type === "transfer" || account.value.type !== "receivable")
    && (!account.value.archived || keepAccounts.includes(account.id)));

  function chooseDebt(id: string) {
    setDebtId(id);
    const chosen = ledger.accounts.find((account) => account.id === id);
    const details = debtDetails(chosen);
    if (!chosen) return;
    if (!titleText.trim()) setTitleText(`${details?.kind === "flexible" ? "Rimborso" : "Rata"} ${chosen.value.name}`.slice(0, 160));
    if (details?.kind === "loan" && !amountText.trim()) setAmountText(amountInput(details.installment));
    if (details?.accountId && accountRef.current && !accountRef.current.value) accountRef.current.value = details.accountId;
  }
  const suggestions = mode === "recurring" ? [] : titleSuggestions(ledger, type, titleText);

  /** Un movimento simile scelto dai suggerimenti compila solo i campi ancora vuoti. */
  function pickSuggestion(item: TitleSuggestion) {
    const past = item.value;
    setTitleText(item.title);
    if (past.type !== "transfer" && past.type !== "repayment" && !labelId && choices.some((label) => label.id === past.labelId)) {
      setLabelId(past.labelId);
      if (past.type === "expense" && !subcategory) setSubcategory(past.subcategory);
    }
    if (past.type === "expense" && labelId === past.labelId && !subcategory) setSubcategory(past.subcategory);
    if (past.type === "repayment" && !debtId) chooseDebt(past.debtId);
    const known = (id: string | null) => !!id && accounts.some((account) => account.id === id);
    if (accountRef.current && !accountRef.current.value && known(past.accountId)) accountRef.current.value = past.accountId!;
    if (past.type === "transfer" && toAccountRef.current && !toAccountRef.current.value && known(past.toAccountId)) toAccountRef.current.value = past.toAccountId;
    if (past.type === "expense" && methodRef.current && !methodRef.current.value && past.method) methodRef.current.value = past.method;
    if (!tags.length && past.tags?.length) setTags(past.tags);
    if (!amountText.trim() && item.amount !== null) setAmountText(amountInput(item.amount));
  }

  const list = type === "expense" && labelId ? subcategoryList(ledger, labelId) : [];
  if (subcategory && subcategory !== NEW_SUBCATEGORY && !list.some((item) => sameName(item, subcategory))) list.push(subcategory);

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const typedAmount = field(data, "amount");
    // In un preferito l'importo è facoltativo: senza, lo scegli ogni volta che lo usi.
    const amount = template && !typedAmount ? 1 : evaluateAmount(typedAmount);
    if (amount === null || amount <= 0) {
      setValidation("Inserisci un importo maggiore di zero (anche come operazione, es. 12,50+8).");
      return;
    }
    if (template && !field(data, "template-name")) {
      setValidation("Dai un nome al preferito.");
      return;
    }
    const common = {
      date: field(data, "date"),
      title: field(data, "title"),
      notes: field(data, "notes"),
      accountId: field(data, "account") || null,
      amount,
      ...(tags.length ? { tags } : {}),
      // Un movimento importato resta collegato alla sua importazione (per annullarla e per le regole).
      ...(value?.origin && !fresh && mode === "movement" ? { origin: value.origin } : {}),
    };
    let movement: Movement["value"];
    let added: string | null = null;
    if (type === "repayment") {
      if (!debt) {
        setValidation("Scegli il debito da rimborsare.");
        return;
      }
      let interest = 0;
      if (mode !== "recurring") {
        if (manualSplit) {
          const typed = parseMoney(interestText || "0");
          if (typed === null || typed < 0 || typed > amount) {
            setValidation("Gli interessi devono essere tra zero e l’importo della rata.");
            return;
          }
          interest = typed;
        } else {
          interest = splitRepayment(ledger, debt, common.date, amount, editingId).interest;
        }
      }
      const details = debtDetails(debt);
      const wanted = details?.kind === "loan" ? details.interestLabelId : INTEREST_LABEL;
      const labelId = ledger.labels.some((label) => label.id === wanted) ? wanted
        : ledger.labels.find((label) => label.value.type === "expense")?.id ?? INTEREST_LABEL;
      movement = { ...common, type, debtId: debt.id, principal: amount - interest, interest, labelId };
    } else if (type === "transfer") {
      const toAccountId = field(data, "to-account");
      if (!common.accountId || !toAccountId || common.accountId === toAccountId) {
        setValidation("Scegli due conti diversi.");
        return;
      }
      movement = { ...common, type, accountId: common.accountId, toAccountId };
    } else if (type === "expense" && parts) {
      const built: Part[] = [];
      for (const draft of parts) {
        const cents = parseMoney(draft.amount);
        if (!draft.target || cents === null || cents <= 0) {
          setValidation("Ogni parte ha bisogno di una categoria (o un credito) e di un importo maggiore di zero.");
          return;
        }
        const [kind, targetId] = draft.target.split(":");
        built.push(kind === "credit" ? { amount: cents, creditId: targetId } : { amount: cents, labelId: targetId, ...(draft.subcategory ? { subcategory: draft.subcategory } : {}) });
      }
      const total = built.reduce((sum, part) => sum + part.amount, 0);
      if (built.length < 2) { setValidation("Una spesa divisa ha almeno due parti."); return; }
      if (total !== amount) { setValidation(`Le parti sommano ${money(total)}: devono fare ${money(amount)}.`); return; }
      const first = built.find((part) => part.labelId);
      if (!first?.labelId) { setValidation("Almeno una parte deve andare a una categoria di spesa: il resto può andare a un credito."); return; }
      movement = { ...common, type, labelId: first.labelId, subcategory: first.subcategory ?? "", method: field(data, "method"), parts: built };
    } else if (type === "expense") {
      let chosen = subcategory;
      if (subcategory === NEW_SUBCATEGORY) {
        const typed = newName.trim().slice(0, 80);
        if (!typed) {
          setValidation("Scrivi il nome della nuova sottocategoria oppure scegline una dall’elenco.");
          return;
        }
        const existing = subcategoryList(ledger, labelId).find((item) => sameName(item, typed));
        chosen = existing ?? typed;
        if (!existing) added = typed;
      }
      movement = { ...common, type, labelId, subcategory: chosen, method: field(data, "method") };
    } else {
      movement = { ...common, type, labelId };
    }
    let plan: MovementResult["schedule"] = null;
    const alreadyRepeating = mode === "movement" && type === "repayment" && !!debt && !!linkedRecurring(ledger, debt.id);
    if (repeat && !alreadyRepeating) {
      const every = Number(field(data, "every"));
      const end = field(data, "end");
      if (!Number.isInteger(every) || every < 1 || every > 12) {
        setValidation("La ripetizione deve essere tra 1 e 12.");
        return;
      }
      if (end && end < common.date) {
        setValidation("La data di fine non può essere precedente alla prima scadenza.");
        return;
      }
      plan = { frequency: field(data, "frequency") as Schedule["frequency"], every, end };
    }
    const canFavorite = type !== "repayment" && !(type === "expense" && parts);
    const favoriteChoice = template ? { name: field(data, "template-name"), fixedAmount: !!typedAmount }
      : favorite && canFavorite ? { name: favoriteName.trim() || common.title, fixedAmount: rememberAmount } : null;
    setValidation("");
    onSubmit({ movement, newSubcategory: added, schedule: plan, paused: data.get("paused") === "on", favorite: favoriteChoice });
  }

  return (
    <form className="editor" onSubmit={submit}>
      {template && <label>Nome del preferito<input name="template-name" defaultValue={templateName ?? ""} maxLength={60} placeholder="Es. Benzina, Caffè, Ricarica Revolut" required /></label>}
      <div className="segmented type-switch" aria-label="Tipo di movimento">
        {(template ? ["expense", "income", "transfer"] as const : ["expense", "income", "transfer", "repayment"] as const).map((entryType) => {
          const Icon = TYPE_ICONS[entryType];
          return <button key={entryType} type="button" aria-pressed={type === entryType}
            onClick={() => {
              if (type === entryType) return;
              setType(entryType); setLabelId(""); setSubcategory(""); setNewName(""); setValidation(""); setDebtId(""); setManualSplit(false); setParts(null);
            }}
            disabled={busy}>
            <Icon size={16} />{ENTRY_TYPES[entryType]}
          </button>;
        })}
      </div>
      {type === "repayment" && <label>Debito
        <select value={debtId} onChange={(event) => chooseDebt(event.target.value)} required>
          <option value="">{debts.length ? "Scegli il debito" : "Nessun debito: crealo in Patrimonio → Debiti"}</option>
          {debts.map((item) => <option key={item.id} value={item.id}>{item.value.name}</option>)}
        </select>
      </label>}
      <TitleField label="Descrizione" ledger={ledger} name="title" inputRef={titleRef} value={titleText} onChange={setTitleText}
        suggestions={suggestions} onPick={pickSuggestion} required
        placeholder={type === "transfer" ? "Es. Giroconto" : type === "repayment" ? "Es. Rata finanziamento" : "Es. Spesa settimanale"} />
      <div className={template ? undefined : "form-grid"}>
        <label>{type === "repayment" ? "Importo pagato in euro" : "Importo in euro"} {template && <span className="optional">facoltativo: senza, lo scegli ogni volta</span>}
          <input name="amount" inputMode="text" placeholder="0,00 o 12,50+8" title="Puoi scrivere anche un’operazione: + − × ÷"
          value={amountText} onChange={(event) => setAmountText(event.target.value)} maxLength={40} required={!template} />
          <AmountPreview text={amountText} /></label>
        {template ? <input type="hidden" name="date" value={dateText} /> : <label>{mode === "recurring" ? (schedule && schedule.done > 0 ? "Prossima scadenza" : "Prima scadenza") : "Data"}
          <input name="date" type="date" min="1900-01-01" max="2100-12-31"
          value={dateText} onChange={(event) => setDateText(event.target.value)} required /></label>}
      </div>
      {type === "repayment" && mode === "recurring" && <p className="field-note">La divisione tra capitale e interessi si calcola a ogni scadenza, sul debito residuo di quel momento.</p>}
      {type === "repayment" && mode !== "recurring" && debt && <div className="split-box" aria-live="polite">
        <div className="split-head"><Calculator size={15} />
          <strong>{debtDetails(debt)?.kind === "loan" ? "Divisione della rata" : "Rimborso"}</strong>
          {debtDetails(debt)?.kind === "loan" && <label className="split-toggle"><input type="checkbox" checked={manualSplit}
            onChange={(event) => { setManualSplit(event.target.checked); if (event.target.checked && autoSplit) setInterestText(amountInput(autoSplit.interest)); }} /> Modifica a mano</label>}
        </div>
        {manualSplit ? <div className="form-grid">
          <label>Interessi e spese<input inputMode="decimal" value={interestText} onChange={(event) => setInterestText(event.target.value)} placeholder="0,00" /></label>
          <label>Capitale<input value={amountValue !== null && parseMoney(interestText || "0") !== null ? amountInput(Math.max(0, amountValue - (parseMoney(interestText || "0") ?? 0))) : ""} readOnly tabIndex={-1} /></label>
        </div> : autoSplit ? <p>
          {debtDetails(debt)?.kind === "loan" ? <>
            <span><b>{money(autoSplit.principal)}</b> capitale, scala il debito</span>
            <span><b>{money(autoSplit.interest)}</b> interessi e spese, conta come spesa</span>
          </> : <span><b>{money(autoSplit.principal)}</b> scala tutto dal debito, senza interessi</span>}
          {autoSplit.residual !== null && <small>{autoSplit.estimated ? "Residuo stimato dal piano" : "Residuo"} prima di questo pagamento: {money(autoSplit.residual)} · dopo: {money(autoSplit.residual - autoSplit.principal)}</small>}
        </p> : <p><small>Inserisci importo e data per vedere la divisione.</small></p>}
      </div>}
      {type === "expense" && parts && <fieldset className="split-parts">
        <legend><Split size={15} /> Spesa divisa</legend>
        {parts.map((part, index) => {
          const labelTarget = part.target.startsWith("label:") ? part.target.slice(6) : "";
          const partSubs = labelTarget ? subcategoryList(ledger, labelTarget) : [];
          const update = (change: Partial<PartDraft>) => setParts((list) => list && list.map((item) => (item.key === part.key ? { ...item, ...change } : item)));
          return <div className="split-part" key={part.key}>
            <select value={part.target} aria-label={`Parte ${index + 1}: categoria o credito`} onChange={(event) => update({ target: event.target.value, subcategory: "" })}>
              <option value="">Categoria o credito</option>
              <optgroup label="Categorie di spesa">{choices.map((label) => <option key={label.id} value={`label:${label.id}`}>{label.value.name}</option>)}</optgroup>
              {receivables.length > 0 && <optgroup label="Anticipato per altri (credito)">{receivables.map((account) => <option key={account.id} value={`credit:${account.id}`}>{account.value.name}</option>)}</optgroup>}
            </select>
            {labelTarget ? <select value={part.subcategory} aria-label={`Parte ${index + 1}: sottocategoria`} onChange={(event) => update({ subcategory: event.target.value })}>
              <option value="">Nessuna sottocategoria</option>
              {partSubs.map((item) => <option key={item} value={item}>{item}</option>)}
              {part.subcategory && !partSubs.includes(part.subcategory) && <option value={part.subcategory}>{part.subcategory}</option>}
            </select> : <span className="split-part-note">{part.target.startsWith("credit:") ? "Te li deve restituire" : ""}</span>}
            <input inputMode="decimal" placeholder="0,00" value={part.amount} aria-label={`Parte ${index + 1}: importo`} onChange={(event) => update({ amount: event.target.value })} />
            <button type="button" className="icon-button quiet" aria-label={`Togli la parte ${index + 1}`} onClick={() => setParts((list) => {
              const next = list ? list.filter((item) => item.key !== part.key) : null;
              return next && next.length >= 1 ? next : null;
            })}><X size={15} /></button>
          </div>;
        })}
        {(() => {
          const total = parts.reduce((sum, part) => sum + (parseMoney(part.amount) ?? 0), 0);
          const left = (amountValue ?? 0) - total;
          return <div className="split-foot">
            <button type="button" className="text-button" onClick={() => setParts((list) => [...(list ?? []), { key: partKey++, target: "", subcategory: "", amount: left > 0 ? amountInput(left) : "" }])} disabled={parts.length >= 10}><Plus size={14} /> Aggiungi parte</button>
            <span className={left === 0 ? "split-left ok" : "split-left"}>{left === 0 ? "Parti complete" : left > 0 ? `Da assegnare: ${money(left)}` : `In più: ${money(-left)}`}</span>
          </div>;
        })()}
        <p className="field-note">Le parti verso un credito non contano come spesa: aumentano quanto ti devono.</p>
      </fieldset>}
      {type === "expense" && !parts && labelId && mode !== "recurring" && !template && <button type="button" className="text-button split-open" onClick={() => setParts([
        { key: partKey++, target: `label:${labelId}`, subcategory: subcategory === NEW_SUBCATEGORY ? "" : subcategory, amount: amountText },
        { key: partKey++, target: "", subcategory: "", amount: "" },
      ])}><Split size={14} /> Dividi la spesa tra più categorie o anticipata per altri</button>}
      {type !== "transfer" && type !== "repayment" && !(type === "expense" && parts) && <div className={type === "expense" ? "form-grid" : undefined}>
        <label>{type === "income" ? "Fonte di entrata" : "Categoria"}
          <select value={labelId} onChange={(event) => { setLabelId(event.target.value); setSubcategory(""); setNewName(""); }} required>
            <option value="">Scegli una voce</option>
            {choices.map((label) => <option key={label.id} value={label.id}>{label.value.name}{label.value.archived ? " (archiviata)" : ""}</option>)}
          </select>
        </label>
        {type === "expense" && <label>Sottocategoria <span className="optional">facoltativa</span>
          <select value={subcategory} disabled={!labelId} onChange={(event) => { setSubcategory(event.target.value); setNewName(""); }}>
            <option value="">{labelId ? "Nessuna" : "Scegli prima la categoria"}</option>
            {list.map((item) => <option value={item} key={item}>{item}</option>)}
            {labelId && <option value={NEW_SUBCATEGORY}>+ Nuova sottocategoria…</option>}
          </select>
        </label>}
      </div>}
      {type === "expense" && subcategory === NEW_SUBCATEGORY && <label>Nome della nuova sottocategoria
        <input value={newName} onChange={(event) => setNewName(event.target.value)} maxLength={80} placeholder="Es. Condominio" autoFocus />
        <span className="field-note">Verrà aggiunta all’elenco della categoria.</span>
      </label>}
      <div className={type !== "income" ? "form-grid" : undefined}>
        <label>{type === "transfer" ? "Dal conto" : type === "repayment" ? "Conto di addebito" : "Conto"} {type !== "transfer" && <span className="optional">facoltativo</span>}
          <select ref={accountRef} name="account" defaultValue={value?.accountId ?? ""} required={type === "transfer"}>
            <option value="">{type === "transfer" ? "Scegli un conto" : "Nessun conto"}</option>
            {accounts.map((account) => <option value={account.id} key={account.id}>{account.value.name}</option>)}
          </select>
        </label>
        {type === "transfer" && <label>Al conto
          <select ref={toAccountRef} name="to-account" defaultValue={value?.type === "transfer" ? value.toAccountId : ""} required>
            <option value="">Scegli un conto</option>
            {accounts.map((account) => <option value={account.id} key={account.id}>{account.value.name}</option>)}
          </select>
        </label>}
        {type === "expense" && <label>Metodo di pagamento <span className="optional">facoltativo</span>
          <input ref={methodRef} name="method" list="payment-methods" placeholder="Scegli o scrivi" maxLength={60}
            defaultValue={value?.type === "expense" ? value.method : ""} />
          <datalist id="payment-methods">{METHOD_LABELS.map((method) => <option value={method} key={method} />)}</datalist>
        </label>}
      </div>
      {!template && <label>Note <span className="optional">facoltative</span>
        <textarea name="notes" rows={2} maxLength={1200} placeholder="Aggiungi un dettaglio" defaultValue={value?.notes ?? ""} />
      </label>}
      <div className="field-block"><span className="field-label">Tag <span className="optional">facoltativi</span></span>
        <TagInput value={tags} onChange={setTags} suggestions={allTags(ledger).map((item) => item.name)} /></div>
      {mode === "movement" && (!value || fresh) && !(type === "repayment" && debt && linkedRecurring(ledger, debt.id)) && <label className="check-row">
        <input type="checkbox" checked={repeat} onChange={(event) => setRepeat(event.target.checked)} />
        <span><strong>Ripeti questo movimento</strong><small>Le prossime scadenze ti verranno proposte da confermare.</small></span>
      </label>}
      {type === "repayment" && debt && mode === "movement" && linkedRecurring(ledger, debt.id) && <p className="field-note">Questo debito ha già le rate proposte ogni mese: se registri la rata del mese della prossima scadenza, quella scadenza risulta pagata.</p>}
      {repeat && !(mode === "movement" && type === "repayment" && debt && linkedRecurring(ledger, debt.id)) && <fieldset className="schedule-fields">
        <legend><Repeat size={15} /> Ripetizione</legend>
        <div className="form-grid">
          <label>Ogni
            <span className="inline-pair">
              <input name="every" type="number" min={1} max={12} defaultValue={schedule?.every ?? 1} required />
              <select name="frequency" defaultValue={schedule?.frequency ?? "monthly"}>
                {Object.entries(FREQUENCIES).map(([key, title]) => <option key={key} value={key}>{title}</option>)}
              </select>
            </span>
          </label>
          <label>Fine <span className="optional">facoltativa</span>
            <input name="end" type="date" min="1900-01-01" max="2100-12-31" defaultValue={schedule?.end ?? ""} />
          </label>
        </div>
        {mode === "recurring" && <label className="check-row">
          <input type="checkbox" name="paused" defaultChecked={paused} />
          <span><strong>In pausa</strong><small>Le scadenze non vengono proposte finché non la togli.</small></span>
        </label>}
      </fieldset>}
      {mode === "movement" && type !== "repayment" && !(type === "expense" && parts) && <label className="check-row">
        <input type="checkbox" checked={favorite} onChange={(event) => setFavorite(event.target.checked)} />
        <span><strong><Star size={14} /> Salva anche come preferito</strong><small>Lo ritrovi nell’inserimento veloce: un tocco e il movimento è registrato.</small></span>
      </label>}
      {favorite && mode === "movement" && <div className="form-grid favorite-fields">
        <label>Nome del preferito<input value={favoriteName} onChange={(event) => setFavoriteName(event.target.value)} maxLength={60} placeholder={titleText || "Es. Caffè"} /></label>
        <label className="check-row compact"><input type="checkbox" checked={rememberAmount} onChange={(event) => setRememberAmount(event.target.checked)} />
          <span><strong>Ricorda l’importo</strong><small>Senza, lo scegli ogni volta.</small></span></label>
      </div>}
      <FormError message={validation || error} />
      <div className="modal-actions">
        {canRemove && onRemove && <button type="button" className="button danger-quiet" disabled={busy}
          onClick={onRemove}><Trash2 size={16} /> Elimina</button>}
        {onDuplicate && <button type="button" className="button secondary" disabled={busy} onClick={onDuplicate}><Copy size={16} /> Duplica</button>}
        <Submit busy={busy}>{template ? "Salva preferito" : mode === "recurring" ? "Salva ricorrente" : mode === "occurrence" ? "Registra movimento" : "Salva movimento"}</Submit>
      </div>
    </form>
  );
}

export function BalanceForm({ busy, error, onSave, account, initialMonth, ledger, onRemove }: {
  busy: boolean; error: string; account: Account; initialMonth: string; ledger: Ledger; onRemove: (record: Balance) => void;
  /** `adjustment`: rettifica facoltativa che chiude lo scarto con i movimenti. */
  onSave: (record: LedgerRecord, adjustment: Movement["value"] | null) => void;
}) {
  const [month, setMonth] = useState(initialMonth);
  const [validation, setValidation] = useState("");
  const id = balanceId(account.id, month);
  const snapshot = ledger.balances.find((balance) => balance.id === id);
  const [amountText, setAmountText] = useState(amountInput(snapshot?.value.amount));
  const [adjust, setAdjust] = useState(false);
  const debt = account.value.type === "debt";
  const investment = account.value.type === "investment";
  const canAdjust = account.value.type === "cash" || account.value.type === "asset";
  const expected = expectedBalance(ledger, account.id, month);
  const recorded = evaluateAmount(amountText);
  const gap = expected && recorded !== null ? recorded - expected.amount : null;

  function changeMonth(next: string) {
    setMonth(next);
    setValidation("");
    setAdjust(false);
    setAmountText(amountInput(ledger.balances.find((balance) => balance.id === balanceId(account.id, next))?.value.amount));
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const amount = evaluateAmount(amountText);
    if (amount === null || (debt && amount < 0)) {
      setValidation(debt ? "Inserisci un debito residuo positivo o pari a zero." : "Inserisci un saldo valido, con al massimo due decimali.");
      return;
    }
    setValidation("");
    onSave({ kind: "balance", id, version: snapshot?.version ?? null, value: { accountId: account.id, month, amount } },
      adjust && canAdjust && gap ? adjustmentMovement(ledger, account.id, month, gap) : null);
  }

  return <form className="editor" onSubmit={submit}>
    <label>Mese di riferimento
      <input type="month" value={month} min="1900-01" max="2100-12" required onChange={(event) => changeMonth(event.target.value)} />
    </label>
    <label>{debt ? "Debito residuo a fine mese in euro" : investment ? "Valore a fine mese in euro" : "Saldo a fine mese in euro"}
      <input name="amount" inputMode="text" placeholder="0,00" required maxLength={40} value={amountText} onChange={(event) => setAmountText(event.target.value)} />
      <AmountPreview text={amountText} />
    </label>
    {expected && <div className={`reconcile-box${gap ? " has-gap" : ""}`} aria-live="polite">
      <div className="split-head"><Scale size={15} /><strong>{investment ? "Rendimento" : "Riconciliazione"}</strong></div>
      <p>
        <span>{investment ? "Valore atteso con i soli versamenti" : debt ? "Residuo atteso dai movimenti" : "Saldo atteso dai movimenti"}: <b>{money(expected.amount)}</b></span>
        <small>Dal saldo di {monthLabel(expected.from)} più i movimenti successivi fino a {monthLabel(month)}.</small>
        {gap !== null && <span className="reconcile-gap">{gap === 0 ? "Tutto torna: nessuno scarto." : investment
          ? <>{gap > 0 ? "Guadagno" : "Perdita"} di valore: <b>{money(Math.abs(gap))}</b></>
          : <>Scarto: <b>{gap > 0 ? "+" : "−"}{money(Math.abs(gap))}</b> {debt ? "" : gap < 0 ? "(mancano soldi: spese non registrate?)" : "(ci sono più soldi: entrate non registrate?)"}</>}</span>}
      </p>
      {canAdjust && !!gap && <label className="check-row compact"><input type="checkbox" checked={adjust} onChange={(event) => setAdjust(event.target.checked)} />
        <span><strong>Registra anche una rettifica di {money(Math.abs(gap))}</strong>
          <small>{gap < 0 ? "Una spesa «Spese non registrate»" : "Un’entrata «Entrate non registrate»"} al {monthEnd(month).split("-").reverse().join("/")}: i conti tornano.</small></span></label>}
    </div>}
    <p className="form-help">{debt
      ? "Usa la cifra dell’estratto conto o quella concordata. Comprende le rate di quel mese; le rate dei mesi successivi la riducono in automatico."
      : investment
        ? "Il valore di mercato a fine mese (dall’app della banca o del broker). Versamenti e prelievi dei mesi successivi si sommano a questo valore."
        : "Da questo saldo partono i movimenti collegati dei mesi successivi. Per un saldo di partenza, usa il mese precedente al primo movimento."}</p>
    <FormError message={validation || error} />
    <div className="modal-actions">
      {snapshot?.version && <button type="button" className="button danger-quiet" disabled={busy}
        onClick={() => onRemove(snapshot)}><Trash2 size={16} /> Elimina</button>}
      <Submit busy={busy}>Salva saldo</Submit>
    </div>
  </form>;
}
