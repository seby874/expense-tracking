import { describe, expect, it } from "vitest";
import { depositYear, grossInterest, nextCredit, rateAt } from "../deposit";
import { essentialMonthly, fundStatus } from "../fund";
import { defaultParams } from "../params";
import { DEFAULT_LABELS, type Account, type Label, type LedgerRecord } from "../ledger";
import { balance, expense, ledgerOf, repayment } from "./fixtures";

const params = defaultParams(2026);

function deposit(id: string, value: Partial<Account["value"]>): Account {
  return { kind: "account", id, version: null, value: { name: id, type: "cash", ...value } };
}

describe("deposit interest", () => {
  const steps = [{ rate: 4, until: "2026-06-30" }, { rate: 2, until: "" }];

  it("uses the promotional rate until its end date, then the standard one", () => {
    expect(rateAt(steps, "2026-03-01")).toBe(4);
    expect(rateAt(steps, "2026-07-01")).toBe(2);
  });

  it("accrues daily on a 365-day year", () => {
    expect(Math.round(grossInterest(1_000_000, [{ rate: 3.65, until: "" }], "2026-01-01", "2026-01-11"))).toBe(1_000);
  });

  it("computes the next credit date for each frequency", () => {
    expect(nextCredit("monthly", "2026-02-10")).toBe("2026-02-28");
    expect(nextCredit("quarterly", "2026-05-10")).toBe("2026-06-30");
    expect(nextCredit("annual", "2026-05-10")).toBe("2026-12-31");
    expect(nextCredit("maturity", "2026-05-10", { start: "2026-01-01", end: "2026-12-15" })).toBe("2026-12-15");
  });

  it("applies withholding and stamp duty, unless the bank pays the stamp", () => {
    const client = deposit("d1", { deposit: { kind: "free", rates: [{ rate: 3, until: "" }], credit: "annual" } });
    const year = depositYear(client, 1_000_000, 2026, params, "2026-01-01")!;
    expect(year.gross).toBe(30_000);
    expect(year.withholding).toBe(7_800);
    expect(year.stamp).toBe(2_000);
    expect(year.net).toBe(20_200);
    const bank = deposit("d2", { deposit: { kind: "free", rates: [{ rate: 3, until: "" }], credit: "annual", stamp: "bank" } });
    expect(depositYear(bank, 1_000_000, 2026, params, "2026-01-01")!.stamp).toBe(0);
  });

  it("charges the fixed current-account stamp only above the average balance threshold", () => {
    const current = deposit("cc", { deposit: { kind: "current", rates: [], credit: "annual" } });
    expect(depositYear(current, 400_000, 2026, params, "2026-01-01")!.stamp).toBe(0);
    expect(depositYear(current, 600_000, 2026, params, "2026-01-01")!.stamp).toBe(3_420);
  });
});

const groceries = DEFAULT_LABELS.find((label) => label.id === "groceries")!;
const essentialLabel: Label = { ...groceries, value: { ...groceries.value, essential: true } };

describe("emergency fund", () => {
  it("averages essential expenses and loan installments over the last 12 months", () => {
    const records: LedgerRecord[] = [essentialLabel, expense("2026-09-10", 60_000), expense("2026-10-10", 60_000, "fineco", "out"), repayment("2026-10-15", "car", 30_000, 5_000)];
    const result = essentialMonthly(ledgerOf(...records), "2026-11-16");
    expect(result.estimated).toBe(false);
    expect(result.amount).toBe(Math.round((60_000 + 35_000) / 2));
  });

  it("weights money by availability, including locked lines", () => {
    const savings = deposit("savings", {
      deposit: { kind: "free", rates: [{ rate: 2, until: "" }], credit: "quarterly", bank: "Banca X",
        lines: [{ id: "l1", amount: 500_000, start: "2026-01-01", end: "2027-01-01", rates: [{ rate: 3, until: "" }], credit: "maturity", early: "none" }] },
    });
    const records: LedgerRecord[] = [
      essentialLabel, savings, balance("savings", "2026-10", 1_000_000), balance("fineco", "2026-10", 200_000),
      expense("2026-10-05", 100_000),
    ];
    const status = fundStatus(ledgerOf(...records), "2026-11-16");
    // La spesa di ottobre è già compresa nel saldo di fine ottobre: Fineco vale 200.000.
    expect(status.rows.find((row) => row.label === "Fineco")?.weighted).toBe(200_000);
    expect(status.rows.find((row) => row.label === "savings")?.amount).toBe(500_000);
    expect(status.rows.find((row) => row.label.startsWith("savings ·"))?.weighted).toBe(0);
    expect(status.weighted).toBe(700_000);
    expect(status.monthsCovered).toBe(7);
    expect(status.monthsNow).toBe(7);
  });

  it("warns when a bank holds more than the deposit guarantee", () => {
    const big = deposit("big", { deposit: { kind: "free", rates: [], credit: "annual", bank: "Banca Y" } });
    const status = fundStatus(ledgerOf(big, balance("big", "2026-10", 15_000_000)), "2026-11-16");
    expect(status.banks.find((bank) => bank.bank === "Banca Y")?.over).toBe(true);
  });
});
