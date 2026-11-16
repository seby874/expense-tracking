import { describe, expect, it } from "vitest";
import { CONFLICT_MESSAGE, EXISTS_MESSAGE, LedgerMirror, planWrite } from "../ledger-sync";
import type { Mutation } from "../ledger";

const V1 = "11111111-1111-4111-8111-111111111111";
const V2 = "22222222-2222-4222-8222-222222222222";

const movementValue = { type: "expense", date: "2027-03-05", title: "Affitto", amount: 50_000, notes: "", accountId: "fineco", labelId: "housing", subcategory: "", method: "" } as const;

function save(version: string | null): Mutation {
  return { op: "save", record: { kind: "movement", id: "rec-20270305", version, value: { ...movementValue } } };
}

function stamp(msAgo: number) {
  const seconds = Math.floor((Date.now() - msAgo) / 1000);
  return { seconds, nanoseconds: 0 };
}

describe("planWrite", () => {
  it("saves a new entry when the document does not exist", () => {
    expect(planWrite(save(null), null)).toEqual({ op: "save" });
  });

  it("rejects a new entry when another device already saved the same id (no duplicate occurrence)", () => {
    const stored = { kind: "movement", id: "rec-20270305", version: V1, value: movementValue };
    expect(() => planWrite(save(null), stored)).toThrow(EXISTS_MESSAGE);
  });

  it("rejects an edit based on an outdated version", () => {
    const stored = { kind: "movement", id: "rec-20270305", version: V2, value: movementValue };
    expect(() => planWrite(save(V1), stored)).toThrow(CONFLICT_MESSAGE);
  });

  it("accepts an edit based on the current version", () => {
    const stored = { kind: "movement", id: "rec-20270305", version: V1, value: movementValue };
    expect(planWrite(save(V1), stored)).toEqual({ op: "save" });
  });

  it("treats a tombstone as missing, so a deleted entry can be restored", () => {
    const stored = { kind: "movement", id: "rec-20270305", version: V1, value: {}, deleted: true };
    expect(planWrite(save(null), stored)).toEqual({ op: "save" });
  });

  it("keeps the stored content in the tombstone when deleting", () => {
    const stored = { kind: "movement", id: "x", version: V1, value: { title: "Affitto" } };
    const plan = planWrite({ op: "delete", kind: "movement", id: "x", version: V1 }, stored);
    expect(plan).toEqual({ op: "tombstone", value: { title: "Affitto" } });
  });

  it("empties a tombstone without checking the version", () => {
    const stored = { kind: "movement", id: "x", version: V2, value: { title: "Affitto" }, deleted: true };
    const plan = planWrite({ op: "delete", kind: "movement", id: "x", version: V1, trash: {} }, stored);
    expect(plan).toEqual({ op: "tombstone", value: {} });
  });
});

describe("LedgerMirror tombstones", () => {
  const DAY = 86_400_000;

  it("lists only emptied tombstones older than the cutoff", () => {
    const mirror = new LedgerMirror();
    mirror.apply([
      { id: "movement:old", data: { kind: "movement", id: "old", version: V1, value: {}, deleted: true, updatedAt: stamp(90 * DAY) } },
      { id: "movement:recent", data: { kind: "movement", id: "recent", version: V1, value: {}, deleted: true, updatedAt: stamp(10 * DAY) } },
      { id: "movement:trash", data: { kind: "movement", id: "trash", version: V1, value: { ...movementValue }, deleted: true, updatedAt: stamp(90 * DAY) } },
    ]);
    expect(mirror.staleTombstones(Date.now() - 60 * DAY)).toEqual(["movement:old"]);
    expect(mirror.trashed().map((item) => item.record.id)).toEqual(["trash"]);
  });

  it("stops listing a tombstone once the entry is saved again or forgotten", () => {
    const mirror = new LedgerMirror();
    mirror.apply([
      { id: "movement:a", data: { kind: "movement", id: "a", version: V1, value: {}, deleted: true, updatedAt: stamp(90 * DAY) } },
      { id: "movement:b", data: { kind: "movement", id: "b", version: V1, value: {}, deleted: true, updatedAt: stamp(90 * DAY) } },
    ]);
    mirror.apply([{ id: "movement:a", data: { kind: "movement", id: "a", version: V2, value: { ...movementValue }, updatedAt: stamp(0) } }]);
    mirror.forget(["movement:b"]);
    expect(mirror.staleTombstones(Date.now())).toEqual([]);
    expect(mirror.records().map((record) => record.id)).toEqual(["a"]);
  });
});
