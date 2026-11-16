import { describe, expect, it } from "vitest";
import { competenceSplit, fixedItem, perMonth, recurringCandidates } from "../fixed";
import type { Movement, Recurring } from "../ledger";
import { expense, ledgerOf } from "./fixtures";

function recurring(id: string, amount: number, schedule: Partial<Recurring["value"]["schedule"]>, fixed?: Recurring["value"]["fixed"]): Recurring {
  const template = expense("2026-01-01", amount).value;
  return {
    kind: "recurring", id, version: null,
    value: { template, schedule: { frequency: "monthly", every: 1, start: "2026-01-05", end: "", done: 0, ...schedule }, ...(fixed ? { fixed } : {}) },
  };
}

function bill(id: string, date: string, amount: number, from: string, to: string): Movement {
  const base = expense(date, amount);
  return { ...base, id, value: { ...base.value, extra: { competence: { from, to } } } as Movement["value"] };
}

function titled(date: string, amount: number, title: string): Movement {
  const base = expense(date, amount);
  return { ...base, value: { ...base.value, title } as Movement["value"] };
}

describe("monthly cost", () => {
  it("converts any frequency to a monthly cost", () => {
    expect(perMonth({ frequency: "monthly", every: 1, start: "", end: "", done: 0 })).toBe(1);
    expect(perMonth({ frequency: "monthly", every: 2, start: "", end: "", done: 0 })).toBe(0.5);
    expect(perMonth({ frequency: "yearly", every: 1, start: "", end: "", done: 0 })).toBeCloseTo(1 / 12);
  });

  it("applies your share and the suspended months", () => {
    const gym = recurring("gym", 6_000, {}, { kind: "subscription", status: "active", share: 50, suspendedMonths: [7, 8] });
    expect(fixedItem(ledgerOf(gym), gym, "2026-11-16").monthly).toBe(Math.round(6_000 * 0.5 * 10 / 12));
  });

  it("is zero once cancelled", () => {
    const old = recurring("old", 1_000, {}, { kind: "subscription", status: "cancelled" });
    expect(fixedItem(ledgerOf(old), old, "2026-11-16").monthly).toBe(0);
  });

  it("reports a price increase from the price history", () => {
    const tv = recurring("tv", 1_399, {}, { kind: "subscription", status: "active", prices: [{ from: "2025-01-01", amount: 1_299 }, { from: "2026-10-01", amount: 1_399 }] });
    const item = fixedItem(ledgerOf(tv), tv, "2026-11-16");
    expect(item.change).toEqual({ from: 1_299, to: 1_399, date: "2026-10-01" });
    expect(item.alert).toContain("aumentato");
  });
});

describe("bills by competence", () => {
  it("spreads a bimonthly bill over the months it covers, keeping the total", () => {
    const split = competenceSplit(bill("b1", "2026-03-10", 12_000, "2026-01-01", "2026-02-28"));
    expect([...split.keys()]).toEqual(["2026-01", "2026-02"]);
    expect(split.get("2026-01")! + split.get("2026-02")!).toBe(12_000);
    expect(split.get("2026-01")).toBe(Math.round(12_000 * 31 / 59));
  });

  it("uses the competence average for the monthly cost of a bill", () => {
    const power = recurring("power", 12_000, { every: 2 }, { kind: "bill", status: "active" });
    const ledger = ledgerOf(power,
      bill("power-20260310", "2026-03-10", 12_000, "2026-01-01", "2026-02-28"),
      bill("power-20260510", "2026-05-10", 6_000, "2026-03-01", "2026-04-30"));
    expect(fixedItem(ledger, power, "2026-05-20").monthly).toBe(Math.round(18_000 / 4));
  });
});

describe("recurring candidates", () => {
  it("suggests a similar expense repeated for three months in a row", () => {
    const ledger = ledgerOf(
      titled("2026-08-03", 1_099, "Spotify"), titled("2026-09-03", 1_099, "Spotify"), titled("2026-10-03", 1_099, "Spotify"),
      titled("2026-10-05", 5_000, "Cena"),
    );
    expect(recurringCandidates(ledger, "2026-11-16").map((item) => item.title)).toEqual(["Spotify"]);
    expect(recurringCandidates(ledger, "2026-11-16", new Set(["spotify"]))).toEqual([]);
  });
});

describe("free trial", () => {
  it("does not forecast charges before the trial ends, nor in suspended months", async () => {
    const { freeOccurrence } = await import("../fixed");
    const { forecast } = await import("../planning");
    const { balance } = await import("./fixtures");
    const trial = recurring("news", 899, { start: "2026-11-20" }, { kind: "subscription", status: "trial", trialEnd: "2026-11-28" });
    expect(freeOccurrence(trial, "2026-11-20")).toBe(true);
    expect(freeOccurrence(trial, "2026-12-20")).toBe(false);
    const ledger = ledgerOf(trial, balance("revolut", "2026-10", 50_000));
    const revolut = forecast(ledger, "2026-11-16").find((item) => item.account.id === "revolut")!;
    expect(revolut.events.map((event) => event.date)).toEqual(["2026-12-20"].filter((date) => date <= "2026-12-16"));
    const gym = recurring("gym", 4_500, {}, { kind: "subscription", status: "active", suspendedMonths: [8] });
    expect(freeOccurrence(gym, "2026-08-05")).toBe(true);
  });
});

describe("auto skip", () => {
  it("marks trial and suspended occurrences as handled, stopping at the first real charge", async () => {
    const { autoSkipActions } = await import("../fixed");
    const trial = recurring("news", 899, { start: "2026-09-20" }, { kind: "subscription", status: "trial", trialEnd: "2026-10-28" });
    const [action] = autoSkipActions(ledgerOf(trial), "2026-11-25");
    expect(action.op === "save" && action.record.kind === "recurring" ? action.record.value.schedule.done : -1).toBe(2);
    const plain = recurring("plain", 899, { start: "2026-09-20" });
    expect(autoSkipActions(ledgerOf(plain), "2026-11-25")).toEqual([]);
  });
});
