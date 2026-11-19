// Comandi comuni dell'editor dell'aspetto: righe, cursori, scelte, interruttori e colori.
import { useEffect, useId, useState, type ReactNode } from "react";
import { RotateCcw } from "lucide-react";
import type { Appearance } from "../../lib/appearance";
import { getAppearance, subscribeAppearance, updateAppearance } from "../../lib/theme-runtime";

export type Update = (change: (appearance: Appearance) => Appearance) => void;

/** Aspetto corrente, aggiornato anche quando arriva da un altro dispositivo. */
export function useAppearance(): [Appearance, Update] {
  const [value, setValue] = useState<Appearance>(getAppearance);
  useEffect(() => subscribeAppearance(setValue), []);
  return [value, updateAppearance];
}

/** Aggiorna una sola sezione dell'aspetto. */
export function patch<K extends keyof Appearance>(update: Update, section: K, change: Partial<Appearance[K]>) {
  update((appearance) => ({ ...appearance, [section]: { ...appearance[section], ...change } }));
}

export function Group({ title, hint, onReset, children }: { title: string; hint?: string; onReset?: () => void; children: ReactNode }) {
  return <section className="look-group">
    <div className="look-group-head">
      <div><h3>{title}</h3>{hint && <p>{hint}</p>}</div>
      {onReset && <button type="button" className="text-button" onClick={onReset}><RotateCcw size={14} /> Ripristina</button>}
    </div>
    {children}
  </section>;
}

export function Row({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return <div className="look-row"><div className="look-row-label"><strong>{label}</strong>{hint && <small>{hint}</small>}</div><div className="look-row-control">{children}</div></div>;
}

export function Choice<T extends string | number>({ value, options, onChange, label }: {
  value: T; options: [T, string][]; onChange: (value: T) => void; label: string;
}) {
  return <div className="segmented look-choice" role="group" aria-label={label}>
    {options.map(([key, title]) => <button type="button" key={String(key)} aria-pressed={value === key} onClick={() => onChange(key)}>{title}</button>)}
  </div>;
}

export function Slider({ value, min, max, step = 1, onChange, label, format }: {
  value: number; min: number; max: number; step?: number; onChange: (value: number) => void; label: string; format: (value: number) => string;
}) {
  return <label className="look-slider"><span className="sr-only">{label}</span>
    <input type="range" min={min} max={max} step={step} value={value} onChange={(event) => onChange(Number(event.target.value))} />
    <output>{format(value)}</output></label>;
}

export function Toggle({ checked, onChange, label }: { checked: boolean; onChange: (value: boolean) => void; label: string }) {
  return <label className="switch"><input type="checkbox" checked={checked} onChange={(event) => onChange(event.target.checked)} />
    <span aria-hidden="true" /><span className="sr-only">{label}</span></label>;
}

/** Colore con il selettore del sistema e il codice esadecimale modificabile. */
export function ColorField({ value, onChange, label }: { value: string; onChange: (value: string) => void; label: string }) {
  const id = useId();
  const [text, setText] = useState(value);
  useEffect(() => setText(value), [value]);
  return <span className="look-color">
    <input type="color" id={id} aria-label={label} value={value} onChange={(event) => onChange(event.target.value)} />
    <input type="text" aria-label={`${label}, codice`} value={text} maxLength={7} spellCheck={false}
      onChange={(event) => { setText(event.target.value); if (/^#[0-9a-fA-F]{6}$/.test(event.target.value)) onChange(event.target.value.toLowerCase()); }} />
  </span>;
}
