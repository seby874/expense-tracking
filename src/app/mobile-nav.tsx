// Menu in basso per il telefono: le prime sezioni sempre a portata di pollice, le altre in «Altro».
import { useEffect, useRef, useState } from "react";
import { Ellipsis, type LucideIcon } from "lucide-react";

export interface NavItem<K extends string> {
  key: K;
  title: string;
  icon: LucideIcon;
}

interface MobileNavProps<K extends string> {
  items: NavItem<K>[];
  current: K;
  onNavigate: (key: K) => void;
}

/** Quante sezioni restano sempre visibili: con «Altro» fanno cinque pulsanti. */
const VISIBLE = 4;

export function MobileNav<K extends string>({ items, current, onNavigate }: MobileNavProps<K>) {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLElement>(null);
  const toggle = useRef<HTMLButtonElement>(null);
  const fits = items.length <= VISIBLE + 1;
  const main = fits ? items : items.slice(0, VISIBLE);
  const more = fits ? [] : items.slice(VISIBLE);
  const moreActive = more.some((item) => item.key === current);

  // Il menu «Altro» si chiude toccando fuori o con Esc.
  useEffect(() => {
    if (!open) return undefined;
    const outside = (event: PointerEvent) => { if (!root.current?.contains(event.target as Node)) setOpen(false); };
    // Con Esc il fuoco torna su «Altro» (altrimenti resterebbe sul menu appena chiuso).
    const escape = (event: KeyboardEvent) => { if (event.key === "Escape") { setOpen(false); toggle.current?.focus(); } };
    document.addEventListener("pointerdown", outside);
    document.addEventListener("keydown", escape);
    return () => { document.removeEventListener("pointerdown", outside); document.removeEventListener("keydown", escape); };
  }, [open]);

  const go = (key: K) => { setOpen(false); onNavigate(key); };

  return <nav className="bottom-nav" aria-label="Menu principale" ref={root}>
    {open && <ul className="bottom-more" id="bottom-more">{more.map(({ key, title, icon: Icon }) => <li key={key}>
      <button type="button" aria-current={current === key ? "page" : undefined} onClick={() => go(key)}><Icon size={18} /> {title}</button>
    </li>)}</ul>}
    {main.map(({ key, title, icon: Icon }) => <button type="button" key={key} className="bottom-button"
      aria-current={current === key ? "page" : undefined} onClick={() => go(key)}>
      <Icon size={20} strokeWidth={1.8} /><span>{title}</span></button>)}
    {more.length > 0 && <button type="button" ref={toggle} className="bottom-button" aria-expanded={open} aria-controls="bottom-more"
      aria-current={moreActive ? "page" : undefined} onClick={() => setOpen((value) => !value)}>
      <Ellipsis size={20} strokeWidth={1.8} /><span>Altro</span></button>}
  </nav>;
}
