import { useEffect, useRef, useState, type FormEvent, type ReactNode } from "react";
import { ArrowDownLeft, ArrowLeftRight, ArrowUpRight, Repeat, Trash2, X } from "lucide-react";
import {
  ENTRY_TYPES, METHOD_LABELS, activeLabels, balanceId, parseMoney, sameName, subcategoryList,
  type Account, type Balance, type Ledger, type LedgerRecord, type Movement, type MovementType, type Schedule,
} from "../lib/ledger";

export const TYPE_ICONS = { income: ArrowDownLeft, expense: ArrowUpRight, transfer: ArrowLeftRight };

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

function amountInput(amount: number | undefined) {
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
};

const NEW_SUBCATEGORY = "__new__";
const FREQUENCIES = { weekly: "Settimane", monthly: "Mesi", yearly: "Anni" } as const;

/**
 * Modulo unico per: movimento normale, registrazione di una scadenza ricorrente
 * ("occurrence") e modifica di un movimento ricorrente ("recurring").
 */
export function MovementForm({ busy, error, ledger, prefill, date, mode, schedule, paused = false, canRemove, onSubmit, onRemove }: {
  busy: boolean; error: string; ledger: Ledger; prefill?: Movement["value"]; date: string;
  mode: "movement" | "occurrence" | "recurring"; schedule?: Schedule; paused?: boolean;
  canRemove: boolean; onSubmit: (result: MovementResult) => void; onRemove?: () => void;
}) {
  const value = prefill;
  const [type, setType] = useState<MovementType>(value?.type ?? "expense");
  const [labelId, setLabelId] = useState(value && value.type !== "transfer" ? value.labelId : "");
  const [subcategory, setSubcategory] = useState(value?.type === "expense" ? value.subcategory : "");
  const [newName, setNewName] = useState("");
  const [repeat, setRepeat] = useState(mode === "recurring");
  const [validation, setValidation] = useState("");
  const keepLabel = value && value.type !== "transfer" ? value.labelId : null;
  const choices = activeLabels(ledger, type === "income" ? "income" : "expense", keepLabel);
  const keepAccounts = [value?.accountId ?? null, value?.type === "transfer" ? value.toAccountId : null];
  const accounts = ledger.accounts.filter((account) => account.value.type !== "debt" && (!account.value.archived || keepAccounts.includes(account.id)));
  const list = type === "expense" && labelId ? subcategoryList(ledger, labelId) : [];
  if (subcategory && subcategory !== NEW_SUBCATEGORY && !list.some((item) => sameName(item, subcategory))) list.push(subcategory);

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const amount = parseMoney(field(data, "amount"));
    if (amount === null || amount <= 0) {
      setValidation("Inserisci un importo maggiore di zero, con al massimo due decimali.");
      return;
    }
    const common = {
      date: field(data, "date"),
      title: field(data, "title"),
      notes: field(data, "notes"),
      accountId: field(data, "account") || null,
      amount,
    };
    let movement: Movement["value"];
    let added: string | null = null;
    if (type === "transfer") {
      const toAccountId = field(data, "to-account");
      if (!common.accountId || !toAccountId || common.accountId === toAccountId) {
        setValidation("Scegli due conti diversi.");
        return;
      }
      movement = { ...common, type, accountId: common.accountId, toAccountId };
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
    if (repeat) {
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
    setValidation("");
    onSubmit({ movement, newSubcategory: added, schedule: plan, paused: data.get("paused") === "on" });
  }

  return (
    <form className="editor" onSubmit={submit}>
      <div className="segmented" aria-label="Tipo di movimento">
        {(["expense", "income", "transfer"] as const).map((entryType) => {
          const Icon = TYPE_ICONS[entryType];
          return <button key={entryType} type="button" aria-pressed={type === entryType}
            onClick={() => {
              if (type === entryType) return;
              setType(entryType); setLabelId(""); setSubcategory(""); setNewName(""); setValidation("");
            }}
            disabled={busy}>
            <Icon size={16} />{ENTRY_TYPES[entryType]}
          </button>;
        })}
      </div>
      <label>Descrizione<input name="title" placeholder={type === "transfer" ? "Es. Giroconto" : "Es. Spesa settimanale"}
        defaultValue={value?.title ?? ""} maxLength={160} required /></label>
      <div className="form-grid">
        <label>Importo in euro<input name="amount" inputMode="decimal" placeholder="0,00"
          defaultValue={amountInput(value?.amount)} maxLength={22} required /></label>
        <label>{mode === "recurring" ? (schedule && schedule.done > 0 ? "Prossima scadenza" : "Prima scadenza") : "Data"}
          <input name="date" type="date" min="1900-01-01" max="2100-12-31"
          defaultValue={value?.date ?? date} required /></label>
      </div>
      {type !== "transfer" && <div className={type === "expense" ? "form-grid" : undefined}>
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
        <label>{type === "transfer" ? "Dal conto" : "Conto"} {type !== "transfer" && <span className="optional">facoltativo</span>}
          <select name="account" defaultValue={value?.accountId ?? ""} required={type === "transfer"}>
            <option value="">{type === "transfer" ? "Scegli un conto" : "Nessun conto"}</option>
            {accounts.map((account) => <option value={account.id} key={account.id}>{account.value.name}</option>)}
          </select>
        </label>
        {type === "transfer" && <label>Al conto
          <select name="to-account" defaultValue={value?.type === "transfer" ? value.toAccountId : ""} required>
            <option value="">Scegli un conto</option>
            {accounts.map((account) => <option value={account.id} key={account.id}>{account.value.name}</option>)}
          </select>
        </label>}
        {type === "expense" && <label>Metodo di pagamento <span className="optional">facoltativo</span>
          <input name="method" list="payment-methods" placeholder="Scegli o scrivi" maxLength={60}
            defaultValue={value?.type === "expense" ? value.method : ""} />
          <datalist id="payment-methods">{METHOD_LABELS.map((method) => <option value={method} key={method} />)}</datalist>
        </label>}
      </div>
      <label>Note <span className="optional">facoltative</span>
        <textarea name="notes" rows={2} maxLength={1200} placeholder="Aggiungi un dettaglio" defaultValue={value?.notes ?? ""} />
      </label>
      {mode === "movement" && !value && <label className="check-row">
        <input type="checkbox" checked={repeat} onChange={(event) => setRepeat(event.target.checked)} />
        <span><strong>Ripeti questo movimento</strong><small>Le prossime scadenze ti verranno proposte da confermare.</small></span>
      </label>}
      {repeat && <fieldset className="schedule-fields">
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
      <FormError message={validation || error} />
      <div className="modal-actions">
        {canRemove && onRemove && <button type="button" className="button danger-quiet" disabled={busy}
          onClick={onRemove}><Trash2 size={16} /> Elimina</button>}
        <Submit busy={busy}>{mode === "recurring" ? "Salva ricorrente" : mode === "occurrence" ? "Registra movimento" : "Salva movimento"}</Submit>
      </div>
    </form>
  );
}

export function BalanceForm({ busy, error, onSave, account, initialMonth, ledger, onRemove }: Omit<SaveProps, "id"> & {
  account: Account; initialMonth: string; ledger: Ledger; onRemove: (record: Balance) => void;
}) {
  const [month, setMonth] = useState(initialMonth);
  const [validation, setValidation] = useState("");
  const id = balanceId(account.id, month);
  const snapshot = ledger.balances.find((balance) => balance.id === id);
  const debt = account.value.type === "debt";

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const amount = parseMoney(field(new FormData(event.currentTarget), "amount"));
    if (amount === null || (debt && amount < 0)) {
      setValidation(debt ? "Inserisci un debito residuo positivo o pari a zero." : "Inserisci un saldo valido, con al massimo due decimali.");
      return;
    }
    setValidation("");
    onSave({ kind: "balance", id, version: snapshot?.version ?? null, value: { accountId: account.id, month, amount } });
  }

  return <form className="editor" onSubmit={submit}>
    <label>Mese di riferimento
      <input type="month" value={month} min="1900-01" max="2100-12" required
        onChange={(event) => { setMonth(event.target.value); setValidation(""); }} />
    </label>
    <label>{debt ? "Debito residuo in euro" : "Saldo a fine mese in euro"}
      <input key={month} name="amount" inputMode="decimal" placeholder="0,00" required maxLength={22}
        defaultValue={amountInput(snapshot?.value.amount)} />
    </label>
    <p className="form-help">{debt
      ? "Il debito residuo viene sottratto dal patrimonio netto."
      : "Da questo saldo partono i movimenti collegati dei mesi successivi. Per un saldo di partenza, usa il mese precedente al primo movimento."}</p>
    <FormError message={validation || error} />
    <div className="modal-actions">
      {snapshot?.version && <button type="button" className="button danger-quiet" disabled={busy}
        onClick={() => onRemove(snapshot)}><Trash2 size={16} /> Elimina</button>}
      <Submit busy={busy}>Salva saldo</Submit>
    </div>
  </form>;
}
