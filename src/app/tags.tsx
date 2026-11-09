import { useId, useState, type KeyboardEvent } from "react";
import { Tag, X } from "lucide-react";
import { MAX_TAGS, sameName } from "../lib/ledger";

export function cleanTag(text: string) {
  return text.replace(/^#/, "").replace(/\s+/g, " ").trim().slice(0, 40);
}

/** Campo per i tag liberi: Invio o virgola aggiungono, × toglie. */
export function TagInput({ value, onChange, suggestions, compact = false }: {
  value: string[]; onChange: (tags: string[]) => void; suggestions: string[]; compact?: boolean;
}) {
  const [text, setText] = useState("");
  const listId = useId();

  function add(raw: string) {
    const next = [...value];
    for (const part of raw.split(",")) {
      const tag = cleanTag(part);
      if (tag && !next.some((item) => sameName(item, tag)) && next.length < MAX_TAGS) next.push(suggestions.find((item) => sameName(item, tag)) ?? tag);
    }
    if (next.length !== value.length) onChange(next);
    setText("");
  }

  function keyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === "Enter" || event.key === ",") {
      event.preventDefault();
      add(text);
    } else if (event.key === "Backspace" && !text && value.length) {
      onChange(value.slice(0, -1));
    }
  }

  return <div className={compact ? "tag-input compact" : "tag-input"}>
    {value.map((tag) => <span className="tag-chip" key={tag}>#{tag}
      <button type="button" aria-label={`Togli il tag ${tag}`} onClick={() => onChange(value.filter((item) => item !== tag))}><X size={12} /></button>
    </span>)}
    {value.length < MAX_TAGS && <input list={listId} value={text} onChange={(event) => {
      if (event.target.value.endsWith(",")) add(event.target.value); else setText(event.target.value);
    }} onKeyDown={keyDown} onBlur={() => text && add(text)} placeholder={value.length ? "" : compact ? "tag" : "Aggiungi un tag (es. viaggio a Roma)"} maxLength={41} aria-label="Nuovo tag" />}
    <datalist id={listId}>{suggestions.filter((item) => !value.some((tag) => sameName(tag, item))).slice(0, 30).map((item) => <option value={item} key={item} />)}</datalist>
  </div>;
}

export function TagChips({ tags, onClick }: { tags?: string[]; onClick?: (tag: string) => void }) {
  if (!tags?.length) return null;
  return <span className="tag-list">{tags.map((tag) => onClick
    ? <button type="button" className="tag-chip small" key={tag} onClick={(event) => { event.stopPropagation(); onClick(tag); }}><Tag size={10} />{tag}</button>
    : <span className="tag-chip small" key={tag}><Tag size={10} />{tag}</span>)}</span>;
}
