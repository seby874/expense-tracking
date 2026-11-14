import { useState } from "react";
import { BellRing, X } from "lucide-react";
import { monthLabel, type Account, type Ledger } from "../lib/ledger";
import { dismiss, isDismissed, lastBackup, readLook } from "../lib/preferences";

type Reminder = { key: string; text: string; action: string; run: () => void; snooze: number };

function daysBetween(from: string, to: string) {
  return Math.floor((Date.parse(to) - Date.parse(from)) / 86_400_000);
}

function previousMonth(today: string) {
  const [year, month] = today.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 2, 1));
  return date.toISOString().slice(0, 7);
}

/** Conti di liquidità che hanno già una storia di saldi ma non quello di fine `month`. */
function missingBalances(ledger: Ledger, month: string) {
  return ledger.accounts.filter((account) => (account.value.type === "cash" || account.value.type === "asset") && !account.value.archived
    && ledger.balances.some(({ value }) => value.accountId === account.id && value.month < month)
    && !ledger.balances.some(({ value }) => value.accountId === account.id && value.month === month));
}

/** Promemoria in Panoramica. "Più tardi" li nasconde per qualche giorno su questo dispositivo. */
export function Reminders({ ledger, today, onQuick, onBalance, onBackup }: {
  ledger: Ledger; today: string; onQuick: () => void; onBalance: (account: Account, month: string) => void; onBackup: () => void;
}) {
  const [, refresh] = useState(0);
  if (!readLook().reminders) return null;
  const items: Reminder[] = [];

  const last = ledger.movements.find(({ value }) => value.date <= today)?.value.date;
  const idle = last ? daysBetween(last, today) : 0;
  if (idle >= 4) items.push({ key: "idle", snooze: 2, text: `Non registri movimenti da ${idle} giorni.`, action: "Spesa veloce", run: onQuick });

  const month = previousMonth(today);
  const missing = Number(today.slice(8, 10)) <= 10 ? missingBalances(ledger, month) : [];
  if (missing.length) items.push({
    key: `balances-${month}`, snooze: 3,
    text: `Registra i saldi di fine ${monthLabel(month)}: ${missing.map((account) => account.value.name).join(", ")}.`,
    action: "Registra", run: () => onBalance(missing[0], month),
  });

  if (ledger.movements.length >= 20) {
    const backup = lastBackup();
    const age = backup ? daysBetween(backup, today) : null;
    if (age === null || age > 30) items.push({
      key: "backup", snooze: 14,
      text: age === null ? "Non hai ancora scaricato un backup dei tuoi dati da questo dispositivo." : `L’ultimo backup è di ${age} giorni fa.`,
      action: "Scarica backup", run: onBackup,
    });
  }

  const shown = items.filter((item) => !isDismissed(item.key, today, item.snooze));
  if (!shown.length) return null;
  return <section className="reminders" aria-label="Promemoria">
    {shown.map((item) => <div className="reminder" key={item.key}>
      <BellRing size={17} />
      <span>{item.text}</span>
      <button type="button" className="button secondary small" onClick={item.run}>{item.action}</button>
      <button type="button" className="icon-button quiet" aria-label="Ricordamelo più tardi" title="Più tardi"
        onClick={() => { dismiss(item.key, today); refresh((value) => value + 1); }}><X size={15} /></button>
    </div>)}
  </section>;
}
