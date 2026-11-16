import { newId, type Ledger, type Movement, type Mutation } from "./ledger";

/** Rimborsi attesi: spese con un rimborso non ancora ricevuto (fondo sanitario, assicurazione, nota spese). */

export type PendingRefund = { movement: Movement; amount: number; from: string; days: number };

export function pendingRefunds(ledger: Ledger, today: string): PendingRefund[] {
  return ledger.movements.flatMap((movement) => {
    const refund = movement.value.extra?.refund;
    if (!refund || refund.received) return [];
    const days = Math.round((Date.parse(today) - Date.parse(movement.value.date)) / 86_400_000);
    return [{ movement, amount: refund.amount, from: refund.from, days }];
  }).sort((a, b) => b.days - a.days);
}

/**
 * Segna il rimborso come ricevuto e, se richiesto, registra l'entrata sul conto della spesa
 * (fonte "Altre entrate"), così il saldo del conto torna.
 */
export function receiveRefund(ledger: Ledger, item: PendingRefund, date: string, amount: number, addIncome: boolean): Mutation[] {
  const { movement } = item;
  const extra = movement.value.extra ?? {};
  const actions: Mutation[] = [{
    op: "save",
    record: { ...movement, value: { ...movement.value, extra: { ...extra, refund: { amount, from: item.from, received: date } } } as Movement["value"] },
  }];
  if (addIncome) {
    const label = ledger.labels.find((entry) => entry.id === "other-income" && !entry.value.archived)
      ?? ledger.labels.find((entry) => entry.value.type === "income" && !entry.value.archived);
    if (label) {
      actions.push({ op: "save", record: { kind: "movement", id: newId(), version: null, value: {
        type: "income", date, title: `Rimborso: ${movement.value.title}`.slice(0, 160), amount, notes: item.from ? `Da ${item.from}` : "",
        accountId: movement.value.accountId, labelId: label.id,
      } } });
    }
  }
  return actions;
}

/** Ritardo oltre cui un rimborso è segnalato (giorni). */
export const REFUND_LATE_DAYS = 60;
