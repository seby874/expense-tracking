import { describe, expect, it } from "vitest";
import { healthChecks, type HealthInput } from "../health";
import type { Deadline } from "../ledger";
import { balance, expense, ledgerOf } from "./fixtures";

const input: HealthInput = { documents: 500, invalid: 0, trash: { count: 0, oldestDays: null }, backup: { frequency: "weekly", password: "", last: "2026-11-14" } };

function level(checks: ReturnType<typeof healthChecks>, id: string) {
  return checks.find((check) => check.id === id)?.level;
}

describe("health checks", () => {
  it("is green for a tidy archive", () => {
    const ledger = ledgerOf(balance("fineco", "2026-10", 100_000), balance("revolut", "2026-10", 50_000), balance("other", "2026-10", 0));
    const checks = healthChecks(ledger, "2026-11-16", input);
    expect(level(checks, "backup")).toBe("ok");
    expect(level(checks, "reads")).toBe("ok");
    expect(level(checks, "invalid")).toBe("ok");
    expect(level(checks, "duplicates")).toBe("ok");
  });

  it("flags late backups, high reads and invalid entries, most serious first", () => {
    const checks = healthChecks(ledgerOf(), "2026-11-16", { ...input, documents: 9_000, invalid: 2, backup: { frequency: "daily", password: "", last: null } });
    expect(level(checks, "backup")).toBe("bad");
    expect(level(checks, "reads")).toBe("bad");
    expect(level(checks, "invalid")).toBe("bad");
    expect(checks[0].level).toBe("bad");
    expect(checks.at(-1)?.level).toBe("ok");
  });

  it("finds possible duplicates and overdue deadlines", () => {
    const deadline: Deadline = { kind: "deadline", id: "d", version: null, value: { title: "Revisione", type: "vehicle", date: "2026-11-01", repeatMonths: 0, noticeDays: 10, notes: "" } };
    const checks = healthChecks(ledgerOf(expense("2026-11-02", 1_000), expense("2026-11-02", 1_000), deadline), "2026-11-16", input);
    expect(level(checks, "duplicates")).toBe("warn");
    expect(level(checks, "deadlines")).toBe("bad");
  });

  it("asks to confirm the yearly parameters", () => {
    expect(level(healthChecks(ledgerOf(), "2026-11-16", input), "params")).toBe("warn");
  });
});
