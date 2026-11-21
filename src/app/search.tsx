// Ricerca globale: un campo, risultati da tutta l'app, frecce + Invio per scegliere.
import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from "react";
import {
  ArrowRightLeft, CalendarClock, FolderTree, Repeat, Search, Star, Target, Timer, Users, WalletCards, type LucideIcon,
} from "lucide-react";
import { money, shortDate, type Ledger } from "../lib/ledger";
import { searchLedger, type SearchKind, type SearchResult } from "../lib/search";

const KIND: Record<SearchKind, [string, LucideIcon]> = {
  movement: ["Movimenti", ArrowRightLeft], account: ["Conti", WalletCards], label: ["Categorie e fonti", FolderTree], deadline: ["Scadenze", Timer],
  person: ["Familiari", Users], recurring: ["Ricorrenti", Repeat], template: ["Preferiti", Star], goal: ["Obiettivi", Target],
};

export function SearchPanel({ ledger, onPick }: { ledger: Ledger; onPick: (result: SearchResult) => void }) {
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const input = useRef<HTMLInputElement>(null);
  const results = useMemo(() => searchLedger(ledger, query), [ledger, query]);
  useEffect(() => { input.current?.focus(); }, []);
  useEffect(() => setActive(0), [query]);

  function onKey(event: KeyboardEvent<HTMLInputElement>) {
    if (!results.length) return;
    if (event.key === "ArrowDown") { event.preventDefault(); setActive((value) => (value + 1) % results.length); }
    else if (event.key === "ArrowUp") { event.preventDefault(); setActive((value) => (value - 1 + results.length) % results.length); }
    else if (event.key === "Enter") { event.preventDefault(); onPick(results[active]); }
  }

  return <div className="search-panel">
    <label className="search-field global-search"><Search size={18} /><span className="sr-only">Cerca in tutta l’app</span>
      <input ref={input} type="search" value={query} placeholder="Movimenti, conti, categorie, scadenze, familiari…" autoComplete="off"
        role="combobox" aria-expanded={results.length > 0} aria-controls="search-results" aria-activedescendant={results.length ? `search-result-${active}` : undefined}
        onChange={(event) => setQuery(event.target.value)} onKeyDown={onKey} /></label>
    {query.trim().length >= 2 && !results.length && <p className="panel-note" role="status">Nessun risultato per «{query.trim()}».</p>}
    {query.trim().length < 2 && <p className="panel-note">Scrivi almeno due lettere. Puoi cercare anche un importo, per esempio «12,50», o un tag con #.</p>}
    <ul className="search-results" id="search-results" role="listbox" aria-label="Risultati">
      {results.map((result, index) => {
        const [group, Icon] = KIND[result.kind];
        return <li key={`${result.kind}-${result.id}`} id={`search-result-${index}`} role="option" aria-selected={index === active}
          className={index === active ? "is-active" : undefined} onMouseEnter={() => setActive(index)} onClick={() => onPick(result)}>
          <span className="search-icon"><Icon size={16} /></span>
          <span className="search-main"><strong>{result.title}</strong>
            <small>{(result.kind === "movement" ? [result.date ? shortDate(result.date) : "", result.detail] : [group, result.detail, result.date ? shortDate(result.date) : ""])
              .filter(Boolean).join(" · ")}</small></span>
          {result.amount !== undefined && <b>{money(result.amount)}</b>}
          {result.kind === "deadline" && <CalendarClock size={15} aria-hidden="true" />}
        </li>;
      })}
    </ul>
  </div>;
}
