import { describe, expect, it } from "vitest";
import { sampleLedger } from "../ledger-demo";
import { deriveLedger, recordSchema } from "../ledger";
import { taxSummary } from "../tax";
import { fundStatus } from "../fund";
import { fixedOverview } from "../fixed";
import { healthChecks } from "../health";
import { yearKpi } from "../yoy";

const TODAY = "2026-11-16";

describe("10-year sample data", () => {
  const records = sampleLedger(TODAY);
  const ledger = deriveLedger(records);

  it("contains only valid records", () => {
    const invalid = records.filter((record) => !recordSchema.safeParse(record).success).map((record) => `${record.kind}:${record.id}`);
    expect(invalid).toEqual([]);
    expect(ledger.invalidArchived).toBe(0);
  });

  it("spans ten years, with the two oldest archived and still visible", () => {
    const years = new Set(ledger.movements.map(({ value }) => Number(value.date.slice(0, 4))));
    expect(years.size).toBe(10);
    expect([...ledger.archivedYears].sort()).toEqual([2017, 2018]);
    expect(ledger.movements.some(({ value }) => value.date.startsWith("2017"))).toBe(true);
    expect(ledger.movements.every(({ value }) => value.date <= TODAY)).toBe(true);
  });

  it("is the same every time (fixed seed)", () => {
    expect(JSON.stringify(sampleLedger(TODAY))).toBe(JSON.stringify(records));
  });

  it("feeds every feature with something to show", () => {
    expect(taxSummary(ledger, 2025).detraction).toBeGreaterThan(0);
    expect(fundStatus(ledger, TODAY).monthsCovered).toBeGreaterThan(0);
    expect(fixedOverview(ledger, TODAY).items.length).toBeGreaterThanOrEqual(8);
    expect(yearKpi(ledger, 2025).saving).toBeGreaterThan(0);
    expect(ledger.people).toHaveLength(2);
    expect(ledger.deadlines.length).toBeGreaterThan(0);
    const health = healthChecks(ledger, TODAY, { documents: records.length, invalid: 0, trash: { count: 0, oldestDays: null }, backup: { frequency: "weekly", password: "", last: TODAY } });
    expect(health.find((check) => check.id === "duplicates")?.level).toBe("warn");
  });
});
