import { INTEREST_LABEL, balanceId, newId, type Account, type LedgerRecord, type LoanDetails, type Movement } from "./ledger";
import { amortization, loanInstallment } from "./debts";

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
  // Investimenti: un ETF con PAC mensile e un fondo pensione.
  const etf: Account = { kind: "account", id: "demo-etf", version: newId(), value: { name: "ETF MSCI World", type: "investment", invest: { assetClass: "equity", contributedBefore: 300000 } } };
  const pension: Account = { kind: "account", id: "demo-pension", version: newId(), value: { name: "Fondo pensione", type: "investment", invest: { assetClass: "pension", contributedBefore: 180000 } } };
  const extra: LedgerRecord[] = [etf, pension,
    { kind: "balance", id: balanceId("demo-etf", "2026-12"), version: newId(), value: { accountId: "demo-etf", month: "2026-12", amount: 318000 } },
    { kind: "balance", id: balanceId("demo-etf", "2027-03"), version: newId(), value: { accountId: "demo-etf", month: "2027-03", amount: 362500 } },
    { kind: "balance", id: balanceId("demo-pension", "2026-12"), version: newId(), value: { accountId: "demo-pension", month: "2026-12", amount: 186000 } },
  ];
  for (let i = 1; i <= 6; i++) {
    add({ type: "transfer", date: `2027-0${i}-08`, title: "PAC ETF", amount: 10000, accountId: "fineco", toAccountId: "demo-etf", notes: "" });
    if (i % 3 === 0) add({ type: "transfer", date: `2027-0${i}-20`, title: "Versamento fondo pensione", amount: 5000, accountId: "fineco", toAccountId: "demo-pension", notes: "" });
  }

  // Finanziamento auto già iniziato (11 rate pagate prima del 2027) e un prestito da un familiare.
  const loan: LoanDetails = {
    kind: "loan", principal: 1000000, tan: 6.9, taeg: 8.2, months: 48, firstDate: "2026-02-15",
    installment: loanInstallment(1000000, 6.9, 48) + 200, fee: 200, paidBefore: 11, accountId: "fineco", interestLabelId: INTEREST_LABEL,
  };
  const plan = amortization(loan);
  extra.push(
    { kind: "account", id: "demo-car", version: newId(), value: { name: "Finanziamento auto", type: "debt", debt: loan } },
    { kind: "balance", id: balanceId("demo-car", "2026-12"), version: newId(), value: { accountId: "demo-car", month: "2026-12", amount: plan[10].residual } },
    { kind: "account", id: "demo-dad", version: newId(), value: { name: "Prestito da papà", type: "debt", debt: { kind: "flexible", principal: 60000, start: "2026-11-20", accountId: "revolut", note: "Restituisco quando posso" } } },
    { kind: "balance", id: balanceId("demo-dad", "2026-10"), version: newId(), value: { accountId: "demo-dad", month: "2026-10", amount: 60000 } },
  );
  for (let i = 1; i <= 6; i++) {
    const row = plan[10 + i];
    add({ type: "repayment", date: `2027-0${i}-15`, title: "Rata Finanziamento auto", amount: row.payment, principal: row.capital, interest: row.interest + row.fee,
      debtId: "demo-car", accountId: "fineco", labelId: INTEREST_LABEL, notes: "" });
  }
  add({ type: "repayment", date: "2027-02-10", title: "Rimborso Prestito da papà", amount: 20000, principal: 20000, interest: 0, debtId: "demo-dad", accountId: "revolut", labelId: INTEREST_LABEL, notes: "" });
  add({ type: "repayment", date: "2027-05-10", title: "Rimborso Prestito da papà", amount: 15000, principal: 15000, interest: 0, debtId: "demo-dad", accountId: "revolut", labelId: INTEREST_LABEL, notes: "" });
  extra.push({ kind: "recurring", id: "demo-car-rate", version: newId(), value: {
    template: { type: "repayment", date: loan.firstDate, title: "Rata Finanziamento auto", amount: loan.installment, principal: loan.installment, interest: 0, debtId: "demo-car", accountId: "fineco", labelId: INTEREST_LABEL, notes: "" },
    schedule: { frequency: "monthly", every: 1, start: loan.firstDate, end: plan[plan.length - 1].date ?? "", done: 17 },
  } });
  // Tag liberi: un viaggio con spese di categorie diverse.
  const trip = ["Viaggio a Roma"];
  add({ type: "expense", date: "2027-03-12", title: "Treno per Roma", amount: 4590, labelId: "travel", subcategory: "Biglietti", accountId: "revolut", method: "Carta", notes: "", tags: trip });
  add({ type: "expense", date: "2027-03-12", title: "B&B Trastevere", amount: 11800, labelId: "travel", subcategory: "Alloggio", accountId: "revolut", method: "Carta", notes: "", tags: trip });
  add({ type: "expense", date: "2027-03-13", title: "Pranzo al Pantheon", amount: 2400, labelId: "out", subcategory: "Ristorante", accountId: "revolut", method: "Carta", notes: "", tags: trip });
  // Crediti: una cena pagata anche per un amico (spesa divisa) e un piccolo prestito.
  extra.push(
    { kind: "account", id: "demo-marco", version: newId(), value: { name: "Marco", type: "receivable", credit: { start: "2027-02-20", note: "Cena e biglietti del concerto" } } },
    { kind: "balance", id: balanceId("demo-marco", "2027-01"), version: newId(), value: { accountId: "demo-marco", month: "2027-01", amount: 0 } },
  );
  add({ type: "expense", date: "2027-02-20", title: "Cena di compleanno", amount: 7200, labelId: "out", subcategory: "Ristorante", accountId: "revolut", method: "Carta", notes: "",
    parts: [{ amount: 3600, labelId: "out", subcategory: "Ristorante" }, { amount: 3600, creditId: "demo-marco" }] });
  add({ type: "transfer", date: "2027-03-02", title: "Prestito a Marco", amount: 5000, accountId: "revolut", toAccountId: "demo-marco", notes: "" });
  add({ type: "transfer", date: "2027-04-08", title: "Restituzione da Marco", amount: 4000, accountId: "demo-marco", toAccountId: "revolut", notes: "" });
  return [...snapshots, ...extra, ...movements];
}
