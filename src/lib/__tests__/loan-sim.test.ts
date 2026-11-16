import { describe, expect, it } from "vitest";
import { annuity, lostDeduction, monthsFor, opportunityGain, prepaymentPenalty, simulate, type SimOptions } from "../loan-sim";
import { defaultParams } from "../params";

const params = defaultParams(2026);
const input = { residual: 1_000_000, tan: 6, installment: 53_185, fee: 0, remaining: 20, date: "2026-01-10", firstNext: "2026-01-15" };
const none: SimOptions = { extra: 0, monthlyExtra: 0, newInstallment: null, newDuration: null, newTan: null, rateDelta: 0, penaltyPercent: 0 };

function find(list: ReturnType<typeof simulate>, kind: string) {
  const item = list.find((scenario) => scenario.kind === kind);
  if (!item) throw new Error(`scenario ${kind} missing`);
  return item;
}

describe("annuity maths", () => {
  it("is consistent between installment and number of months", () => {
    const i = 0.005;
    const payment = annuity(1_000_000, i, 24);
    expect(monthsFor(1_000_000, i, payment)).toBe(24);
    expect(monthsFor(1_000_000, i, 1_000_000 * i)).toBeNull();
  });
});

describe("scenarios", () => {
  it("the current plan pays the residual off with interest", () => {
    const base = find(simulate(input, none, {}, params), "base");
    expect(base.residuals.at(-1)).toBe(0);
    expect(base.interest).toBeGreaterThan(0);
  });

  it("an extra payment shortens the loan or lowers the installment, saving interest", () => {
    const list = simulate(input, { ...none, extra: 300_000 }, { home: true }, params);
    const shorter = find(list, "reduce-duration");
    const lower = find(list, "reduce-installment");
    expect(shorter.monthsSaved).toBeGreaterThan(0);
    expect(shorter.installment).toBe(input.installment);
    expect(lower.installment).toBeLessThan(input.installment);
    expect(lower.months).toBe(find(list, "base").months);
    expect(shorter.saved!).toBeGreaterThan(lower.saved!);
    expect(shorter.penalty).toBe(0);
  });

  it("extending the duration lowers the installment but costs more interest", () => {
    const extend = find(simulate(input, { ...none, newDuration: 36 }, {}, params), "extend");
    expect(extend.installment).toBeLessThan(input.installment);
    expect(extend.saved!).toBeLessThan(0);
  });

  it("a chosen installment too low to cover interest never ends", () => {
    const set = find(simulate(input, { ...none, newInstallment: 4_000 }, {}, params), "set-installment");
    expect(set.months).toBeNull();
    expect(set.note).toContain("non si estingue");
  });

  it("monthly extras, payoff, subrogation and variable rate are compared to the plan", () => {
    const list = simulate(input, { ...none, monthlyExtra: 10_000, newTan: 3, rateDelta: 1 }, {}, params);
    expect(find(list, "recurring-extra").monthsSaved).toBeGreaterThan(0);
    expect(find(list, "subrogation").saved!).toBeGreaterThan(0);
    expect(find(list, "variable").saved!).toBeLessThan(0);
    expect(find(list, "payoff").note).toContain("Servono");
  });
});

describe("penalties and trade-offs", () => {
  it("home loans have no penalty; consumer credit pays 1% (0,5% under a year) above the threshold", () => {
    expect(prepaymentPenalty({ home: true }, 2_000_000, 120, params, 2)).toBe(0);
    expect(prepaymentPenalty({ consumer: true }, 2_000_000, 24, params, 0)).toBe(20_000);
    expect(prepaymentPenalty({ consumer: true }, 2_000_000, 6, params, 0)).toBe(10_000);
    expect(prepaymentPenalty({ consumer: true }, 900_000, 24, params, 0)).toBe(0);
    expect(prepaymentPenalty({}, 100_000, 24, params, 2)).toBe(2_000);
  });

  it("counts the mortgage interest deduction lost by paying early", () => {
    const list = simulate(input, { ...none, extra: 300_000 }, { home: true }, params);
    const lost = lostDeduction(find(list, "base"), find(list, "reduce-duration"), 19, 400_000);
    expect(lost).toBe(Math.round((find(list, "base").interest - find(list, "reduce-duration").interest) * 0.19));
  });

  it("estimates the net gain of investing the same amount", () => {
    expect(opportunityGain(100_000, 3, 12, 26)).toBe(Math.round(3_000 * 0.74));
  });
});
