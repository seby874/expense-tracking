import { CalendarClock, CheckCheck, Pause, Pencil, Plus, Repeat, SkipForward } from "lucide-react";
import { money, shortDate, type Ledger, type Recurring } from "../lib/ledger";
import { nextDate, scheduleLabel, type DueItem } from "../lib/recurring";
import { TYPE_ICONS } from "./ledger-forms";
import { Empty, PanelTitle } from "./ledger-views";

function amountText(recurring: Recurring) {
  const { type, amount } = recurring.value.template;
  return `${type === "expense" ? "−" : type === "income" ? "+" : ""}${money(amount)}`;
}

/** Scadenze arrivate: si confermano, si modificano prima di registrarle o si saltano. */
export function DuePanel({ items, today, busy, onRegister, onEdit, onSkip, onRegisterAll }: {
  items: DueItem[]; today: string; busy: boolean;
  onRegister: (item: DueItem) => void; onEdit: (item: DueItem) => void; onSkip: (item: DueItem) => void; onRegisterAll: () => void;
}) {
  if (!items.length) return null;
  const total = items.reduce((sum, item) => sum + 1 + item.backlog, 0);
  return <section className="panel due-panel" aria-label="Movimenti ricorrenti in scadenza">
    <PanelTitle title="Ricorrenti da registrare" subtitle={`${total} ${total === 1 ? "scadenza arrivata" : "scadenze arrivate"}: confermale, modificale o saltale.`}
      action={total > 1 ? <button type="button" className="button secondary" disabled={busy} onClick={onRegisterAll}><CheckCheck size={16} /> Registra tutte</button> : undefined} />
    <ul className="due-list">
      {items.map((item) => {
        const template = item.recurring.value.template;
        const Icon = TYPE_ICONS[template.type];
        return <li key={item.recurring.id}>
          <span className={`entry-icon entry-${template.type}`}><Icon size={16} /></span>
          <div className="due-main">
            <strong>{template.title}</strong>
            <small>{item.date === today ? "Scade oggi" : `Scaduto il ${shortDate(item.date)}`}
              {item.backlog > 0 && <span className="due-backlog">+{item.backlog} {item.backlog === 1 ? "arretrata" : "arretrate"}</span>}</small>
          </div>
          <b className={`entry-amount amount-${template.type}`}>{amountText(item.recurring)}</b>
          <div className="due-actions">
            <button type="button" className="button primary small" disabled={busy} onClick={() => onRegister(item)}>Registra</button>
            <button type="button" className="icon-button quiet" disabled={busy} aria-label={`Modifica e registra ${template.title}`} title="Modifica e registra" onClick={() => onEdit(item)}><Pencil size={15} /></button>
            <button type="button" className="icon-button quiet" disabled={busy} aria-label={`Salta ${template.title}`} title="Salta questa scadenza" onClick={() => onSkip(item)}><SkipForward size={15} /></button>
          </div>
        </li>;
      })}
    </ul>
  </section>;
}

/** Elenco dei movimenti ricorrenti nella sezione Movimenti. */
export function RecurringPanel({ ledger, onNew, onEdit }: {
  ledger: Ledger; onNew: () => void; onEdit: (recurring: Recurring) => void;
}) {
  const labels = new Map(ledger.labels.map((label) => [label.id, label.value.name]));
  return <section className="panel recurring-panel">
    <PanelTitle title="Movimenti ricorrenti" subtitle="Affitto, abbonamenti, stipendio: ti vengono proposti a ogni scadenza."
      action={<button type="button" className="button secondary" onClick={onNew}><Plus size={16} /> Nuovo ricorrente</button>} />
    {ledger.recurring.length ? <ul className="recurring-list">
      {ledger.recurring.map((recurring) => {
        const { template, schedule, paused } = recurring.value;
        const Icon = TYPE_ICONS[template.type];
        const next = nextDate(schedule);
        const category = template.type === "transfer" ? "Trasferimento" : labels.get(template.labelId) ?? "";
        return <li key={recurring.id} className={paused || !next ? "is-muted" : undefined}>
          <span className={`entry-icon entry-${template.type}`}><Icon size={16} /></span>
          <div className="recurring-main">
            <strong>{template.title}</strong>
            <small><Repeat size={12} /> {scheduleLabel(schedule)}{category && ` · ${category}`}</small>
          </div>
          <div className="recurring-next">
            <b className={`entry-amount amount-${template.type}`}>{amountText(recurring)}</b>
            <small>{paused ? <><Pause size={12} /> In pausa</> : next ? <><CalendarClock size={12} /> {shortDate(next)}</> : "Concluso"}</small>
          </div>
          <button type="button" className="icon-button quiet" aria-label={`Modifica ${template.title}`} onClick={() => onEdit(recurring)}><Pencil size={16} /></button>
        </li>;
      })}
    </ul> : <Empty icon={<Repeat size={21} />} title="Nessun movimento ricorrente"
      action={<button type="button" className="text-button" onClick={onNew}><Plus size={16} /> Crea il primo</button>}>
      Puoi crearne uno anche spuntando «Ripeti questo movimento» quando registri un movimento.
    </Empty>}
  </section>;
}
