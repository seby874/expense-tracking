import { deriveLedger, type Account, type Balance, type LedgerRecord, type Movement } from "../ledger";

// Voci sintetiche per i test: importi in centesimi, date "AAAA-MM-GG".

let counter = 0;
const nextId = (prefix: string) => `${prefix}${++counter}`;

export function expense(date: string, amount: number, accountId: string | null = "fineco", labelId = "groceries"): Movement {
  return {
    kind: "movement", id: nextId("m"), version: null,
    value: { type: "expense", date, title: "Spesa", amount, notes: "", accountId, labelId, subcategory: "", method: "" },
  };
}

export function transfer(date: string, amount: number, accountId: string, toAccountId: string): Movement {
  return { kind: "movement", id: nextId("t"), version: null, value: { type: "transfer", date, title: "Giroconto", amount, notes: "", accountId, toAccountId } };
}

export function repayment(date: string, debtId: string, principal: number, interest: number): Movement {
  return {
    kind: "movement", id: nextId("r"), version: null,
    value: { type: "repayment", date, title: "Rata", amount: principal + interest, principal, interest, debtId, accountId: "fineco", labelId: "interest", notes: "" },
  };
}

export function balance(accountId: string, month: string, amount: number): Balance {
  return { kind: "balance", id: `${accountId}@${month}`, version: null, value: { accountId, month, amount } };
}

export function investment(id: string, contributedBefore: number): Account {
  return { kind: "account", id, version: null, value: { name: id, type: "investment", invest: { assetClass: "equity", contributedBefore } } };
}

export function loan(id: string, paidBefore: number): Account {
  return {
    kind: "account", id, version: null,
    value: {
      name: id, type: "debt",
      debt: {
        kind: "loan", principal: 1_200_000, tan: 6, taeg: null, months: 24, firstDate: "2026-01-15",
        installment: 53_185, fee: 0, paidBefore, accountId: "fineco", interestLabelId: "interest",
      },
    },
  };
}

export function ledgerOf(...records: LedgerRecord[]) {
  return deriveLedger(records);
}
