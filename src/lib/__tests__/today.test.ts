import { describe, expect, it } from "vitest";
import { todayTasks } from "../today";
import type { Deadline, LedgerRecord } from "../ledger";
import { balance, expense, ledgerOf } from "./fixtures";

const TODAY = "2026-11-05";

function deadline(id: string, date: string, extra: Partial<Deadline["value"]> = {}): Deadline {
  return { kind: "deadline", id, version: null, value: { title: id, type: "vehicle", date, repeatMonths: 0, noticeDays: 30, notes: "", ...extra } };
}

const ledger = (records: LedgerRecord[]) => ledgerOf(...records);
const base = { due: [], backupScheduled: true, lastBackup: null, reportSeen: "", reminders: true };

describe("todayTasks", () => {
  it("lists overdue and near deadlines, the most urgent first, and skips the done or far ones", () => {
    const data = ledger([
      expense(TODAY, 1000),
      deadline("Bollo", "2026-10-01"), deadline("Revisione", "2026-11-20"), deadline("Lontana", "2027-06-01"),
      deadline("Fatta", "2026-10-15", { done: true }),
    ]);
    const tasks = todayTasks(data, TODAY, base);
    expect(tasks.flatMap((task) => (task.kind === "deadline" ? [task.deadline.id] : []))).toEqual(["Bollo", "Revisione"]);
    expect(tasks[0]).toMatchObject({ kind: "deadline", tone: "bad" });
  });

  it("asks for last month's balances in the first ten days of the month", () => {
    const data = ledger([expense(TODAY, 1000), balance("fineco", "2026-09", 100_000)]);
    expect(todayTasks(data, TODAY, base).find((task) => task.kind === "balances")).toMatchObject({ month: "2026-10" });
    expect(todayTasks(data, "2026-11-20", base).some((task) => task.kind === "balances")).toBe(false);
  });

  it("reminds to record movements after four quiet days, only if reminders are on", () => {
    const data = ledger([expense("2026-10-30", 1000)]);
    expect(todayTasks(data, TODAY, base).find((task) => task.kind === "idle")).toMatchObject({ days: 6 });
    expect(todayTasks(data, TODAY, { ...base, reminders: false }).some((task) => task.kind === "idle")).toBe(false);
  });

  it("proposes last year's report in January, once", () => {
    const data = ledger([expense("2025-06-10", 1000), expense("2026-01-03", 500)]);
    expect(todayTasks(data, "2026-01-05", base).find((task) => task.kind === "report")).toMatchObject({ year: 2025 });
    expect(todayTasks(data, "2026-01-05", { ...base, reportSeen: "2025" }).some((task) => task.kind === "report")).toBe(false);
  });

  it("asks for a backup only when automatic backups are off", () => {
    const data = ledger(Array.from({ length: 25 }, (_, index) => expense(TODAY, 100 + index)));
    expect(todayTasks(data, TODAY, base).some((task) => task.kind === "backup")).toBe(false);
    expect(todayTasks(data, TODAY, { ...base, backupScheduled: false }).find((task) => task.kind === "backup")).toMatchObject({ age: null });
  });

  it("is empty on a quiet day", () => {
    expect(todayTasks(ledger([expense(TODAY, 1000)]), TODAY, base)).toEqual([]);
  });
});
