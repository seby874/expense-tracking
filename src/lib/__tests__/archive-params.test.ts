import { describe, expect, it } from "vitest";
import { archivableYears, archiveActions, archivedYearOf, reopenActions, splitParts } from "../archive";
import { defaultParams, paramsFor } from "../params";
import { deriveLedger, type LedgerRecord, type Mutation } from "../ledger";
import { balance, expense, ledgerOf } from "./fixtures";

/** Applica le scritture come farebbe Firestore (lapide = voce sparita). */
function apply(records: LedgerRecord[], actions: Mutation[]) {
  const map = new Map(records.map((record) => [`${record.kind}:${record.id}`, record]));
  for (const action of actions) {
    if (action.op === "save") map.set(`${action.record.kind}:${action.record.id}`, action.record);
    else map.delete(`${action.kind}:${action.id}`);
  }
  return [...map.values()];
}

describe("archive", () => {
  const records: LedgerRecord[] = [
    expense("2020-03-10", 1_000), expense("2020-07-01", 2_000), balance("fineco", "2020-12", 50_000),
    expense("2025-01-05", 3_000),
  ];

  it("proposes only years closed for long enough", () => {
    expect(archivableYears(ledgerOf(...records), "2026-11-16")).toEqual([{ year: 2020, count: 3 }]);
  });

  it("keeps every movement visible after archiving, and makes the year read-only", () => {
    const before = ledgerOf(...records);
    const after = deriveLedger(apply(records, archiveActions(before, 2020)));
    expect(after.archivedYears.has(2020)).toBe(true);
    expect(after.movements.map((item) => item.id).sort()).toEqual(before.movements.map((item) => item.id).sort());
    expect(after.balances).toHaveLength(1);
    const edit: Mutation = { op: "save", record: { ...after.movements.find((item) => item.value.date.startsWith("2020"))! } };
    expect(archivedYearOf(after, [edit])).toBe(2020);
  });

  it("reopens a year with the same movements, editable again", () => {
    const archived = apply(records, archiveActions(ledgerOf(...records), 2020));
    const reopened = deriveLedger(apply(archived, reopenActions(deriveLedger(archived), 2020)));
    expect(reopened.archivedYears.size).toBe(0);
    expect(reopened.movements).toHaveLength(3);
    expect(reopened.archives).toHaveLength(0);
  });

  it("splits large years into several documents under the size limit", () => {
    const many = Array.from({ length: 50 }, (_, index) => expense("2019-05-01", 100 + index));
    const parts = splitParts(many, 2_000);
    expect(parts.length).toBeGreaterThan(1);
    expect(parts.flat()).toHaveLength(50);
  });
});

describe("params", () => {
  it("uses the defaults when nothing is saved, marked as to be confirmed", () => {
    const result = paramsFor(ledgerOf(), 2026);
    expect(result.inherited).toBe(true);
    expect(result.value.deductions.sanitarie).toEqual({ rate: 19, threshold: 12_911, cap: null, traceable: true });
  });

  it("inherits the closest earlier year without its income", () => {
    const saved = { ...defaultParams(2025), withholding: 27, income: 3_000_000, confirmed: true };
    const ledger = ledgerOf({ kind: "param", id: "2025", version: null, value: saved });
    const result = paramsFor(ledger, 2027);
    expect(result.value.withholding).toBe(27);
    expect(result.value.year).toBe(2027);
    expect(result.value.income).toBeNull();
    expect(result.value.confirmed).toBe(false);
  });
});

describe("review fixes", () => {
  it("completes an interrupted archiving and reopens without conflicts", async () => {
    const { planWrite } = await import("../ledger-sync");
    const records: LedgerRecord[] = [expense("2020-03-10", 1_000), expense("2020-07-01", 2_000)];
    const actions = archiveActions(ledgerOf(...records), 2020);
    // Interrotta: archivio salvato, eliminazioni mai arrivate.
    const interrupted = apply(records, actions.filter((action) => action.op === "save"));
    const ledger = deriveLedger(interrupted);
    expect(ledger.archivedYears.has(2020)).toBe(true);
    const finish = archiveActions(ledger, 2020);
    expect(finish.every((action) => action.op === "delete")).toBe(true);
    expect(finish).toHaveLength(2);
    // Riapertura: le voci ancora vive mantengono la versione, quindi nessun conflitto.
    const byKey = new Map(interrupted.map((record) => [`${record.kind}:${record.id}`, record]));
    for (const action of reopenActions(ledger, 2020)) {
      if (action.op !== "save") continue;
      const stored = byKey.get(`${action.record.kind}:${action.record.id}`) ?? null;
      expect(() => planWrite(action, stored as unknown as Record<string, unknown> | null)).not.toThrow();
    }
  });

  it("skips archived years when restoring an older backup", async () => {
    const { planRestore } = await import("../data-io");
    const { backupJson } = await import("../backup/export");
    const old = expense("2020-03-10", 1_000);
    const archived = apply([old], archiveActions(ledgerOf(old), 2020));
    const plan = planRestore(backupJson([old, expense("2026-01-01", 500)]), archived);
    expect(plan.skippedYears).toEqual([2020]);
    expect(plan.restored).toBe(1);
  });

  it("does not count other assets as money available now", async () => {
    const { fundStatus } = await import("../fund");
    const status = fundStatus(ledgerOf(balance("other", "2026-10", 1_000_000), expense("2026-10-02", 10_000)), "2026-11-16");
    expect(status.rows.find((row) => row.account.id === "other")?.bucket).toBe("long");
  });
});
