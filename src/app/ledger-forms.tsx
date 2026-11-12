import { useEffect, useRef, useState, type FormEvent, type ReactNode } from "react";
import { ArrowDownLeft, ArrowLeftRight, ArrowUpRight, Trash2, X } from "lucide-react";
import {
  ACCOUNT_TYPES, ENTRY_TYPES, METHOD_LABELS, balanceId, parseMoney, subcategories,
  type Account, type Balance, type Label, type Ledger, type LedgerRecord, type Movement, type MovementType,
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

function field(data: FormData, key: string) {
  return String(data.get(key) ?? "").trim();
}

function amountInput(amount: number | undefined) {
  return amount === undefined ? "" : (amount / 100).toFixed(2).replace(".", ",");
}

function Submit({ busy, children = "Salva" }: { busy: boolean; children?: ReactNode }) {
  return <button type="submit" className="button primary" disabled={busy}>{busy ? "Salvataggio…" : children}</button>;
}

export function MovementForm({ id, busy, error, onSave, ledger, initial, date, initialType, onRemove }: SaveProps & {
  ledger: Ledger; initial?: Movement; date: string; initialType: MovementType; onRemove: (record: Movement) => void;
}) {
  const value = initial?.value;
  const [type, setType] = useState(value?.type ?? initialType);
  const [labelId, setLabelId] = useState(value && value.type !== "transfer" ? value.labelId : "");
  const [subcategory, setSubcategory] = useState(value?.type === "expense" ? value.subcategory : "");
  const [validation, setValidation] = useState("");
  const choices = ledger.labels.filter((label) => label.value.type === type);
  const accounts = ledger.accounts.filter((account) => account.value.type !== "debt");

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
    if (type === "transfer") {
      const toAccountId = field(data, "to-account");
      if (!common.accountId || !toAccountId || common.accountId === toAccountId) {
        setValidation("Scegli due conti diversi.");
        return;
      }
      movement = { ...common, type, accountId: common.accountId, toAccountId };
    } else if (type === "expense") {
      movement = { ...common, type, labelId, subcategory, method: field(data, "method") };
    } else {
      movement = { ...common, type, labelId };
    }
    setValidation("");
    onSave({ kind: "movement", id, version: initial?.version ?? null, value: movement });
  }

  return (
    <form className="editor" onSubmit={submit}>
      <div className="segmented" aria-label="Tipo di movimento">
        {(["expense", "income", "transfer"] as const).map((entryType) => {
          const Icon = TYPE_ICONS[entryType];
          return <button key={entryType} type="button" aria-pressed={type === entryType}
            onClick={() => {
              if (type === entryType) return;
              setType(entryType); setLabelId(""); setSubcategory(""); setValidation("");
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
        <label>Data<input name="date" type="date" min="1900-01-01" max="2100-12-31"
          defaultValue={value?.date ?? date} required /></label>
      </div>
      {type !== "transfer" && <div className={type === "expense" ? "form-grid" : undefined}>
        <label>{type === "income" ? "Fonte di entrata" : "Categoria"}
          <select value={labelId} onChange={(event) => { setLabelId(event.target.value); setSubcategory(""); }} required>
            <option value="">Scegli una voce</option>
            {choices.map((label) => <option key={label.id} value={label.id}>{label.value.name}</option>)}
          </select>
        </label>
        {type === "expense" && <label>Sottocategoria <span className="optional">facoltativa</span>
          <input list="subcategories" value={subcategory} onChange={(event) => setSubcategory(event.target.value)}
            placeholder="Scegli o scrivi" maxLength={80} />
          <datalist id="subcategories">{subcategories(ledger, labelId).map((item) => <option value={item} key={item} />)}</datalist>
        </label>}
      </div>}
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
      <FormError message={validation || error} />
      <div className="modal-actions">
        {initial?.version && <button type="button" className="button danger-quiet" disabled={busy}
          onClick={() => onRemove(initial)}><Trash2 size={16} /> Elimina</button>}
        <Submit busy={busy}>Salva movimento</Submit>
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

export function NameForm({ id, busy, error, onSave, initial, kind, labelType }: SaveProps & {
  initial?: Account | Label; kind: "account" | "label"; labelType: "expense" | "income";
}) {
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const name = field(data, "name");
    if (kind === "account") {
      const type = initial?.kind === "account" ? initial.value.type : field(data, "type") as Account["value"]["type"];
      onSave({ kind, id, version: initial?.version ?? null, value: { name, type } });
    } else {
      onSave({ kind, id, version: initial?.version ?? null, value: { name, type: labelType } });
    }
  }
  return <form className="editor" onSubmit={submit}>
    <label>Nome<input name="name" defaultValue={initial?.value.name ?? ""} placeholder={kind === "account" ? "Es. Contanti" : "Nome della voce"} maxLength={100} required /></label>
    {kind === "account" && !initial && <label>Tipo di conto
      <select name="type" defaultValue="cash">
        {Object.entries(ACCOUNT_TYPES).map(([value, title]) => <option value={value} key={value}>{title}</option>)}
      </select>
    </label>}
    <FormError message={error} />
    <div className="modal-actions"><Submit busy={busy} /></div>
  </form>;
}
