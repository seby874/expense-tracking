import { describe, expect, it } from "vitest";
import { amortization, debtStatus, installmentsPaid, loanInstallment } from "../debts";
import { investmentSummary } from "../investments";
import { balance, investment, ledgerOf, loan, repayment, transfer } from "./fixtures";

describe("loan maths", () => {
  it("computes the French installment and closes the plan exactly", () => {
    const installment = loanInstallment(1_200_000, 6, 24);
    expect(installment).toBe(53_185);
    const plan = amortization({ principal: 1_200_000, tan: 6, months: 24, installment, fee: 0, firstDate: "2026-01-15" });
    expect(plan).toHaveLength(24);
    expect(plan.at(-1)?.residual).toBe(0);
    expect(plan.reduce((sum, row) => sum + row.capital, 0)).toBe(1_200_000);
  });
});

describe("installmentsPaid", () => {
  it("does not count an extra repayment in the same month as a second installment", () => {
    const debt = loan("car", 2);
    const ledger = ledgerOf(
      debt,
      repayment("2026-03-15", "car", 47_000, 6_184),
      repayment("2026-03-20", "car", 100_000, 0), // rimborso anticipato extra
      repayment("2026-04-15", "car", 47_500, 5_684),
    );
    expect(installmentsPaid(ledger, "car", 2)).toBe(4);
    expect(installmentsPaid(ledger, "car", 2, "2026-03")).toBe(3);
  });

  it("feeds debtStatus.paidCount", () => {
    const debt = loan("car", 2);
    const ledger = ledgerOf(
      debt, balance("car", "2026-02", 1_100_000),
      repayment("2026-03-15", "car", 47_000, 6_184),
      repayment("2026-03-20", "car", 100_000, 0),
    );
    const status = debtStatus(ledger, debt, "2026-03");
    expect(status.paidCount).toBe(3);
    expect(status.residual).toBe(1_100_000 - 147_000);
  });
});

describe("investmentSummary", () => {
  it("computes the gain only on investments with a recorded value", () => {
    const ledger = ledgerOf(
      investment("etf", 100_000), investment("pension", 50_000),
      balance("etf", "2027-03", 150_000), // "pension" non ha ancora un valore
    );
    const summary = investmentSummary(ledger, "2027-03");
    expect(summary.value).toBe(150_000);
    expect(summary.paid).toBe(150_000);
    expect(summary.paidKnown).toBe(100_000);
    expect(summary.gain).toBe(50_000);
  });

  it("counts transfers in and out as contributions", () => {
    const ledger = ledgerOf(
      investment("etf", 0), balance("fineco", "2027-01", 500_000), balance("etf", "2027-01", 0),
      transfer("2027-02-01", 30_000, "fineco", "etf"), transfer("2027-02-15", 5_000, "etf", "fineco"),
    );
    expect(investmentSummary(ledger, "2027-02").paid).toBe(25_000);
  });
});
