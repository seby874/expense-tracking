import { describe, expect, it } from "vitest";
import { categoryDeltas, inflationFactor, yearKpi } from "../yoy";
import { projection, requiredSaving } from "../projection";
import { addMonths, completeDeadline, deadlineState } from "../deadlines";
import { calendarEvents } from "../calendar";
import { annualReport, reportYears } from "../report";
import { defaultParams } from "../params";
import type { Deadline, LedgerRecord, Recurring } from "../ledger";
import { balance, expense, ledgerOf } from "./fixtures";

function income(date: string, amount: number): LedgerRecord {
  return { kind: "movement", id: `i-${date}-${amount}`, version: null, value: { type: "income", date, title: "Stipendio", amount, notes: "", accountId: "fineco", labelId: "work" } };
}

describe("year over year", () => {
  const ledger = ledgerOf(expense("2025-03-01", 10_000), expense("2025-11-20", 50_000), expense("2026-03-01", 15_000), income("2025-01-10", 100_000), income("2026-01-10", 120_000));

  it("compares the same period of both years when the current year is running", () => {
    expect(yearKpi(ledger, 2025, "11-16").expense).toBe(10_000);
    expect(yearKpi(ledger, 2025).expense).toBe(60_000);
    expect(yearKpi(ledger, 2026, "11-16").income).toBe(120_000);
  });

  it("lists category changes, biggest first", () => {
    expect(categoryDeltas(ledger, 2025, 2026, "11-16")[0].delta).toBe(5_000);
  });

  it("applies the inflation entered for each year", () => {
    const withInflation = ledgerOf({ kind: "param", id: "2026", version: null, value: { ...defaultParams(2026), inflation: 2 } });
    expect(inflationFactor(withInflation, 2025, 2026)).toBeCloseTo(1.02);
    expect(inflationFactor(withInflation, 2026, 2026)).toBe(1);
  });
});

describe("projection", () => {
  it("grows with the average saving and answers the inverse question", () => {
    const records: LedgerRecord[] = [balance("fineco", "2026-10", 1_000_000)];
    for (let month = 1; month <= 10; month++) {
      const m = String(month).padStart(2, "0");
      records.push(income(`2026-${m}-05`, 200_000), expense(`2026-${m}-10`, 150_000));
    }
    const result = projection(ledgerOf(...records), "2026-11-16", 5, { returns: 4, inflation: 2, incomeGrowth: 0 });
    expect(result.monthlySaving).toBe(50_000);
    expect(result.points).toHaveLength(5);
    expect(result.points[0].value).toBe(result.start + 12 * 50_000);
    expect(result.points[4].real).toBeLessThan(result.points[4].value);
    expect(requiredSaving(0, 1_200_000, 1, 0, 0)).toBe(100_000);
  });
});

describe("deadlines", () => {
  const revision: Deadline = { kind: "deadline", id: "d1", version: null, value: {
    title: "Revisione", type: "vehicle", date: "2026-11-30", repeatMonths: 24, noticeDays: 30, notes: "",
  } };

  it("knows when a deadline is soon or overdue", () => {
    expect(deadlineState(revision, "2026-11-16")).toBe("soon");
    expect(deadlineState(revision, "2026-12-01")).toBe("overdue");
    expect(deadlineState(revision, "2026-09-01")).toBe("later");
  });

  it("moves a repeating deadline forward when done", () => {
    const action = completeDeadline(revision, "2026-11-16");
    expect(action.op === "save" && action.record.kind === "deadline" ? action.record.value.date : "").toBe("2028-11-30");
    expect(addMonths("2026-01-31", 1)).toBe("2026-02-28");
  });
});

describe("calendar", () => {
  it("lists recurring payments and deadlines of the month", () => {
    const rent: Recurring = { kind: "recurring", id: "rent", version: null, value: {
      template: { ...expense("2026-01-01", 80_000).value, title: "Affitto" } as Recurring["value"]["template"],
      schedule: { frequency: "monthly", every: 1, start: "2026-01-05", end: "", done: 0 },
    } };
    const deadline: Deadline = { kind: "deadline", id: "d2", version: null, value: { title: "Bollo auto", type: "vehicle", date: "2026-12-10", repeatMonths: 0, noticeDays: 10, notes: "" } };
    const events = calendarEvents(ledgerOf(rent, deadline), "2026-12", "2026-11-16");
    expect(events.map((event) => event.title)).toEqual(["Affitto", "Bollo auto"]);
  });
});

describe("annual report", () => {
  it("summarises a closed year with its best month", () => {
    const ledger = ledgerOf(income("2025-01-10", 100_000), expense("2025-01-20", 20_000), income("2025-02-10", 100_000), expense("2025-02-20", 90_000));
    expect(reportYears(ledger, "2026-01-05")).toEqual([2025]);
    const report = annualReport(ledger, 2025, "2026-01-05");
    expect(report.kpi.saving).toBe(90_000);
    expect(report.best?.month).toBe("2025-01");
    expect(report.biggest?.value.amount).toBe(90_000);
  });
});
