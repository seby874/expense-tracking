import { balanceId, newId, type LedgerRecord, type Movement } from "./ledger";

export function sampleLedger(): LedgerRecord[] {
  const snapshots: LedgerRecord[] = [
    { kind: "balance", id: balanceId("fineco", "2026-12"), version: newId(), value: { accountId: "fineco", month: "2026-12", amount: 171000 } },
    { kind: "balance", id: balanceId("revolut", "2026-12"), version: newId(), value: { accountId: "revolut", month: "2026-12", amount: 42500 } },
    { kind: "balance", id: balanceId("other", "2026-12"), version: newId(), value: { accountId: "other", month: "2026-12", amount: 92000 } },
  ];
  const movements: Movement[] = [];
  function add(value: Movement["value"]) {
    movements.push({ kind: "movement", id: newId(), version: newId(), value });
  }
  for (let i = 1; i <= 6; i++) {
    const month = "2027-0" + i;
    add({ type: "income", date: month + "-03", title: "Compenso mensile", amount: 92000 + i * 2500, labelId: "work", accountId: "fineco", notes: "" });
    if (i === 2 || i === 5) add({ type: "income", date: month + "-15", title: "Acconto borsa di studio", amount: 28000, labelId: "scholarship", accountId: "fineco", notes: "" });
    const rows = [
      [4, "Affitto", 32000, "housing", "Affitto", "fineco", "Bonifico"],
      [7, "Spesa settimanale", 7200 + (i % 3) * 1100, "groceries", "Supermercato", "revolut", "Carta"],
      [11, "Abbonamento autobus", 2300, "transport", "Mezzi pubblici", "revolut", "Carta"],
      [19, "Cena fuori", 3000 + i * 650, "out", "Ristorante", "revolut", "Carta"],
      [21, "Palestra", 2900, "leisure", "Sport", "revolut", "Carta"],
      [23, "Visita medica", i === 4 ? 6500 : 2400, "health", "Visite", "fineco", "Carta"],
      [27, "Spesa alimentare", 5200 + i * 900, "groceries", "Mercato", "revolut", "Carta"],
    ] as const;
    for (const [day, title, amount, labelId, subcategory, accountId, method] of rows) {
      add({ type: "expense", date: month + "-" + String(day).padStart(2, "0"), title, amount, labelId, subcategory, accountId, method, notes: "" });
    }
    add({ type: "transfer", date: month + "-06", title: "Ricarica Revolut", amount: 19000, accountId: "fineco", toAccountId: "revolut", notes: "" });
  }
  return [...snapshots, ...movements];
}
