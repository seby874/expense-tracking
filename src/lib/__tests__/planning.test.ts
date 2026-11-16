import { afterEach, describe, expect, it } from "vitest";
import { forecast, goalStatus, growth, insights } from "../planning";
import { setDiscreet, type Goal } from "../ledger";
import { balance, expense, ledgerOf } from "./fixtures";

const TODAY = "2027-03-10";

function fineco(list: ReturnType<typeof forecast>) {
  const item = list.find(({ account }) => account.id === "fineco");
  if (!item) throw new Error("fineco missing from forecast");
  return item;
}

describe("forecast", () => {
  it("removes this month's future movements from a computed balance to get today's balance", () => {
    // Saldo di febbraio + spesa futura di marzo: il saldo calcolato di marzo la include già.
    const ledger = ledgerOf(balance("fineco", "2027-02", 100_000), expense("2027-03-20", 10_000));
    const item = fineco(forecast(ledger, TODAY));
    expect(item.today).toBe(100_000);
    expect(item.end).toBe(90_000);
  });

  it("treats a balance recorded for the current month as today's balance (no double count)", () => {
    const ledger = ledgerOf(balance("fineco", "2027-03", 100_000), expense("2027-03-20", 10_000));
    const item = fineco(forecast(ledger, TODAY));
    expect(item.today).toBe(100_000);
    expect(item.end).toBe(90_000);
  });
});

describe("goalStatus", () => {
  const goal: Goal = {
    kind: "goal", id: "g1", version: null,
    value: { name: "Vacanze", target: 200_000, deadline: "", accountId: "fineco", saved: 0, order: 0 },
  };

  it("does not count money from future-dated movements of the current month", () => {
    const ledger = ledgerOf(balance("fineco", "2027-02", 100_000), expense("2027-03-20", 10_000));
    expect(goalStatus(ledger, goal, TODAY).current).toBe(100_000);
  });

  it("uses a balance recorded for the current month as it is", () => {
    const ledger = ledgerOf(balance("fineco", "2027-03", 80_000), expense("2027-03-20", 10_000));
    expect(goalStatus(ledger, goal, TODAY).current).toBe(80_000);
  });
});

describe("growth", () => {
  it("splits the net worth change into saving and other", () => {
    const ledger = ledgerOf(balance("fineco", "2027-01", 100_000), expense("2027-02-05", 20_000));
    expect(growth(ledger, "2027-02")).toEqual({ change: -20_000, saving: -20_000, returns: null, other: 0 });
  });
});

describe("insights", () => {
  afterEach(() => setDiscreet(false));

  const ledger = ledgerOf(
    expense("2027-01-10", 10_000), expense("2027-02-10", 10_000), expense("2027-03-10", 30_000),
  );

  it("reports spending above the usual average", () => {
    const list = insights(ledger, "2027-03", "2027-04-10");
    expect(list.some((item) => item.tone === "up" && item.text.includes("300"))).toBe(true);
  });

  it("hides amounts in discreet mode", () => {
    setDiscreet(true);
    const list = insights(ledger, "2027-03", "2027-04-10");
    expect(list.length).toBeGreaterThan(0);
    for (const item of list) expect(item.text).not.toMatch(/\d+\s?€/);
    expect(list.some((item) => item.text.includes("••• €"))).toBe(true);
  });
});
