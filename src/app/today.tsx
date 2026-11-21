// Panoramica → «Da fare oggi»: ricorrenti, scadenze, saldi, report e promemoria in un solo riquadro.
import { useState } from "react";
import { BellRing, CalendarClock, CheckCheck, CheckCircle2, DatabaseBackup, FileText, Pencil, SkipForward, Timer, WalletCards, X, type LucideIcon } from "lucide-react";
import { monthLabel, shortDate, type Account, type Deadline, type Ledger } from "../lib/ledger";
import type { DueItem } from "../lib/recurring";
import { todayTasks, type TodayTask } from "../lib/today";
import { dismiss, isDismissed, lastBackup, readLook } from "../lib/preferences";
import { PanelTitle } from "./ledger-views";
import { amountText } from "./recurring";

const REPORT_SEEN_KEY = "et-report-seen";
/** Giorni per cui «Più tardi» nasconde una voce. */
const SNOOZE: Partial<Record<TodayTask["kind"], number>> = { balances: 3, idle: 2, backup: 14, deadline: 1 };

const ICONS: Record<TodayTask["kind"], LucideIcon> = {
  recurring: CalendarClock, deadline: Timer, balances: WalletCards, report: FileText, idle: BellRing, backup: DatabaseBackup,
};

function readSeen() {
  try { return window.localStorage.getItem(REPORT_SEEN_KEY) ?? ""; } catch { return ""; }
}

export interface TodayHandlers {
  onRegister: (item: DueItem) => void; onEditDue: (item: DueItem) => void; onSkip: (item: DueItem) => void; onRegisterAll: () => void;
  onCompleteDeadline: (deadline: Deadline) => void; onOpenDeadlines: () => void;
  onBalance: (account: Account, month: string) => void; onQuick: () => void; onBackup: () => void; onOpenReport: (year: number) => void;
}

function describe(task: TodayTask, today: string): [string, string] {
  switch (task.kind) {
    case "recurring": {
      const { item } = task;
      const when = item.date < today ? `scaduto il ${shortDate(item.date)}` : "scade oggi";
      return [item.recurring.value.template.title, `${amountText(item.recurring)} · ${when}${item.backlog ? ` · +${item.backlog} ${item.backlog === 1 ? "arretrata" : "arretrate"}` : ""}`];
    }
    case "deadline":
      return [task.deadline.value.title, task.days < 0 ? `scaduta da ${-task.days} ${task.days === -1 ? "giorno" : "giorni"}` : task.days === 0 ? "oggi" : `tra ${task.days} ${task.days === 1 ? "giorno" : "giorni"} (${shortDate(task.deadline.value.date)})`];
    case "balances":
      return [`Saldi di fine ${monthLabel(task.month)}`, task.accounts.map((account) => account.value.name).join(", ")];
    case "report":
      return [`Il tuo ${task.year} è pronto`, "Riepilogo dell’anno da conservare con il backup."];
    case "idle":
      return [`Nessun movimento da ${task.days} giorni`, "Registra le ultime spese finché le ricordi."];
    case "backup":
      return [task.age === null ? "Nessun backup scaricato da questo dispositivo" : `Ultimo backup ${task.age} giorni fa`, "Il backup automatico è spento."];
  }
}

export function TodayPanel({ ledger, today, due, busy, backupScheduled, handlers }: {
  ledger: Ledger; today: string; due: DueItem[]; busy: boolean; backupScheduled: boolean; handlers: TodayHandlers;
}) {
  const [, refresh] = useState(0);
  const [seen, setSeen] = useState(readSeen);
  const tasks = todayTasks(ledger, today, { due, backupScheduled, lastBackup: lastBackup(), reportSeen: seen, reminders: readLook().reminders })
    .filter((task) => !SNOOZE[task.kind] || !isDismissed(task.key, today, SNOOZE[task.kind]));
  const dueCount = due.reduce((sum, item) => sum + 1 + item.backlog, 0);

  const later = (task: TodayTask) => {
    if (task.kind === "report") {
      try { window.localStorage.setItem(REPORT_SEEN_KEY, String(task.year)); } catch { /* facoltativo */ }
      setSeen(String(task.year));
      return;
    }
    dismiss(task.key, today);
    refresh((value) => value + 1);
  };

  function actions(task: TodayTask) {
    const { onRegister, onEditDue, onSkip, onCompleteDeadline, onOpenDeadlines, onBalance, onQuick, onBackup, onOpenReport } = handlers;
    switch (task.kind) {
      case "recurring": return <>
        <button type="button" className="button primary small" disabled={busy} onClick={() => onRegister(task.item)}>Registra</button>
        <button type="button" className="icon-button quiet" disabled={busy} aria-label={`Modifica e registra ${task.item.recurring.value.template.title}`} title="Modifica e registra" onClick={() => onEditDue(task.item)}><Pencil size={15} /></button>
        <button type="button" className="icon-button quiet" disabled={busy} aria-label={`Salta ${task.item.recurring.value.template.title}`} title="Salta questa scadenza" onClick={() => onSkip(task.item)}><SkipForward size={15} /></button>
      </>;
      case "deadline": return <>
        <button type="button" className="button secondary small" disabled={busy} onClick={() => onCompleteDeadline(task.deadline)}><CheckCircle2 size={14} /> Fatta</button>
        <button type="button" className="text-button" onClick={onOpenDeadlines}>Vedi</button>
      </>;
      case "balances": return <button type="button" className="button secondary small" onClick={() => onBalance(task.accounts[0], task.month)}>Registra</button>;
      case "report": return <button type="button" className="button secondary small" onClick={() => { onOpenReport(task.year); later(task); }}>Apri</button>;
      case "idle": return <button type="button" className="button secondary small" onClick={onQuick}>Spesa veloce</button>;
      case "backup": return <button type="button" className="button secondary small" onClick={onBackup}>Scarica</button>;
    }
  }

  return <section className="panel today-panel" aria-label="Da fare oggi">
    <PanelTitle title="Da fare oggi" subtitle={tasks.length ? `${tasks.length} ${tasks.length === 1 ? "cosa" : "cose"} da sistemare` : "Niente in sospeso: tutto in ordine."}
      action={dueCount > 1 ? <button type="button" className="button secondary small" disabled={busy} onClick={handlers.onRegisterAll}><CheckCheck size={15} /> Registra tutti i ricorrenti</button> : undefined} />
    {tasks.length > 0 && <ul className="today-list">{tasks.map((task) => {
      const Icon = ICONS[task.kind];
      const [title, detail] = describe(task, today);
      return <li key={task.key} className={`today-${task.tone}`}>
        <span className="today-icon"><Icon size={17} /></span>
        <div className="today-main"><strong>{title}</strong><small>{detail}</small></div>
        <div className="today-actions">{actions(task)}
          {(SNOOZE[task.kind] || task.kind === "report") && <button type="button" className="icon-button quiet" aria-label={`Più tardi: ${title}`} title="Più tardi"
            onClick={() => later(task)}><X size={15} /></button>}
        </div>
      </li>;
    })}</ul>}
  </section>;
}
