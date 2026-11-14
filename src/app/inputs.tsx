import { useId, useState, type KeyboardEvent, type ReactNode, type Ref } from "react";
import { Equal, History } from "lucide-react";
import { ENTRY_TYPES, evaluateAmount, isExpression, money, type Ledger, type TitleSuggestion } from "../lib/ledger";

/** Sotto il campo importo: il risultato quando scrivi un'operazione (es. "12,50+8"). */
export function AmountPreview({ text }: { text: string }) {
  if (!isExpression(text)) return null;
  const result = evaluateAmount(text);
  return <span className={result !== null && result > 0 ? "amount-preview" : "amount-preview is-invalid"} aria-live="polite">
    <Equal size={13} />{result !== null && result > 0 ? money(result) : "operazione non valida"}
  </span>;
}

function describe(ledger: Ledger, item: TitleSuggestion) {
  const { value } = item;
  const accounts = new Map(ledger.accounts.map((account) => [account.id, account.value.name]));
  const labels = new Map(ledger.labels.map((label) => [label.id, label.value.name]));
  const parts = value.type === "transfer"
    ? [`${accounts.get(value.accountId) ?? "?"} → ${accounts.get(value.toAccountId) ?? "?"}`]
    : [value.type === "repayment" ? ENTRY_TYPES.repayment : labels.get(value.labelId) ?? "", value.type === "expense" ? value.subcategory : "", value.accountId ? accounts.get(value.accountId) ?? "" : ""];
  if (item.amount !== null) parts.push(money(item.amount));
  return parts.filter(Boolean).join(" · ");
}

/**
 * Campo descrizione con i suggerimenti presi dai movimenti passati.
 * Frecce su/giù per scegliere, Invio per confermare, Esc per chiudere.
 */
export function TitleField({ label, ledger, value, onChange, suggestions, onPick, inputRef, placeholder, required, name }: {
  label: ReactNode; ledger: Ledger; value: string; onChange: (value: string) => void; suggestions: TitleSuggestion[];
  onPick: (item: TitleSuggestion) => void; inputRef?: Ref<HTMLInputElement>; placeholder?: string; required?: boolean; name?: string;
}) {
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const listId = useId();
  const shown = open ? suggestions : [];

  function pick(item: TitleSuggestion) {
    onPick(item);
    setOpen(false);
    setActive(-1);
  }

  function keyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (!shown.length) return;
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      const step = event.key === "ArrowDown" ? 1 : -1;
      // -1 = nessuna voce evidenziata (resta il testo scritto).
      setActive((current) => {
        const next = current + step;
        if (next < -1) return shown.length - 1;
        return next >= shown.length ? -1 : next;
      });
    } else if (event.key === "Enter" && active >= 0) {
      event.preventDefault();
      pick(shown[active]);
    } else if (event.key === "Escape") {
      event.stopPropagation();
      setOpen(false);
    }
  }

  return <label className="title-field">{label}
    <input ref={inputRef} name={name} value={value} placeholder={placeholder} maxLength={160} required={required} autoComplete="off"
      role="combobox" aria-expanded={shown.length > 0} aria-controls={listId} aria-autocomplete="list"
      aria-activedescendant={active >= 0 && shown[active] ? `${listId}-${active}` : undefined}
      onChange={(event) => { onChange(event.target.value); setOpen(true); setActive(-1); }}
      onFocus={() => setOpen(true)} onBlur={() => setOpen(false)} onKeyDown={keyDown} />
    {shown.length > 0 && <ul className="suggestions" id={listId} role="listbox" aria-label="Movimenti simili">
      {shown.map((item, index) => <li key={item.title} id={`${listId}-${index}`} role="option" aria-selected={index === active}
        className={index === active ? "is-active" : undefined}
        // mousedown invece di click: il campo non perde il fuoco prima della scelta.
        onMouseDown={(event) => { event.preventDefault(); pick(item); }}>
        <History size={14} />
        <span><strong>{item.title}</strong><small>{describe(ledger, item)}</small></span>
        {item.count > 1 && <em>{item.count}×</em>}
      </li>)}
    </ul>}
  </label>;
}
