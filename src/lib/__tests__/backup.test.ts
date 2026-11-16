import { describe, expect, it } from "vitest";
import { createZip, entryText, readZip, textEntry } from "../backup/zip";
import { decryptBackup, encryptBackup, isEncrypted } from "../backup/crypto";
import { rotationKeep } from "../backup/folder";
import { backupDue } from "../backup/schedule";
import { buildBackupZip, sqlDump } from "../backup/export";
import { planRestore } from "../data-io";
import type { LedgerRecord } from "../ledger";
import { balance, expense, ledgerOf } from "./fixtures";

describe("zip", () => {
  it("round-trips files with UTF-8 names and content", () => {
    const zip = createZip([textEntry("LEGGIMI.md", "Ciao è"), textEntry("fogli/movimenti.csv", "a;b\r\n1;2")]);
    const entries = readZip(zip);
    expect(entries.map((entry) => entry.name)).toEqual(["LEGGIMI.md", "fogli/movimenti.csv"]);
    expect(entryText(entries, "LEGGIMI.md")).toBe("Ciao è");
  });

  it("rejects a file that is not a zip", () => {
    expect(() => readZip(new TextEncoder().encode("{}"))).toThrow();
  });
});

describe("encryption", () => {
  it("decrypts with the right password and refuses the wrong one", async () => {
    const data = new TextEncoder().encode("dati riservati");
    const sealed = await encryptBackup(data, "password-lunga-1", 1_000);
    expect(isEncrypted(sealed)).toBe(true);
    expect(new TextDecoder().decode(await decryptBackup(sealed, "password-lunga-1"))).toBe("dati riservati");
    await expect(decryptBackup(sealed, "sbagliata")).rejects.toThrow("Password errata");
  });
});

describe("rotation", () => {
  it("keeps 7 days, then one per week and one per month", () => {
    const dates: string[] = [];
    for (let day = 0; day < 400; day++) dates.push(new Date(Date.UTC(2026, 10, 16) - day * 86_400_000).toISOString().slice(0, 10));
    const keep = rotationKeep(dates);
    for (const date of dates.slice(0, 7)) expect(keep.has(date)).toBe(true);
    expect(keep.size).toBeLessThanOrEqual(7 + 4 + 12);
    expect(keep.has(dates[399])).toBe(false);
    expect([...keep].some((date) => date.startsWith("2025-12"))).toBe(true);
  });
});

describe("schedule", () => {
  it("is due when never done or after the interval", () => {
    expect(backupDue({ frequency: "daily", password: "", last: null }, "2026-11-16")).toBe(true);
    expect(backupDue({ frequency: "daily", password: "", last: "2026-11-16" }, "2026-11-16")).toBe(false);
    expect(backupDue({ frequency: "weekly", password: "", last: "2026-11-12" }, "2026-11-16")).toBe(false);
    expect(backupDue({ frequency: "weekly", password: "", last: "2026-11-09" }, "2026-11-16")).toBe(true);
    expect(backupDue({ frequency: "off", password: "", last: null }, "2026-11-16")).toBe(false);
  });
});

describe("backup content", () => {
  const records: LedgerRecord[] = [expense("2026-03-01", 1_250), balance("fineco", "2026-02", 100_000)];
  const ledger = ledgerOf(...records);

  it("contains the guide, the data, the sheets and the database", () => {
    const entries = readZip(buildBackupZip(records, ledger));
    const names = entries.map((entry) => entry.name);
    expect(names).toEqual(expect.arrayContaining(["LEGGIMI.md", "dati/backup.json", "dati/schema.json", "fogli/movimenti.csv", "fogli/familiari.csv", "database/dati.sql"]));
    expect(entryText(entries, "fogli/movimenti.csv")).toContain("-12,50");
  });

  it("can be restored by the app", () => {
    const entries = readZip(buildBackupZip(records, ledger));
    const plan = planRestore(entryText(entries, "dati/backup.json")!, []);
    expect(plan.error).toBe("");
    expect(plan.restored).toBe(2);
  });

  it("escapes quotes in SQL", () => {
    const tricky = expense("2026-03-01", 100);
    const record = { ...tricky, value: { ...tricky.value, title: "L'idraulico" } } as LedgerRecord;
    const sql = sqlDump(ledgerOf(record), [record]);
    expect(sql).toContain("'L''idraulico'");
  });
});

describe("audit fixes", () => {
  it("rejects a corrupted or truncated zip", () => {
    const zip = createZip([textEntry("dati/backup.json", "{\"a\":1}")]);
    const corrupted = zip.slice();
    corrupted[30 + "dati/backup.json".length + 2] ^= 0xff; // un byte del contenuto
    expect(() => readZip(corrupted)).toThrow("danneggiato");
  });

  it("restores the movements inside archived years of an old backup as normal entries", async () => {
    const { archiveActions } = await import("../archive");
    const old = expense("2020-03-10", 1_000);
    const archive = archiveActions(ledgerOf(old), 2020).flatMap((action) => (action.op === "save" ? [action.record] : []));
    const { backupJson } = await import("../backup/export");
    const plan = planRestore(backupJson(archive), []);
    expect(plan.mutations.map((action) => (action.op === "save" ? action.record.kind : ""))).toEqual(["movement"]);
  });

  it("refuses to make an unencrypted backup when the password disappeared", async () => {
    const { makeBackup, saveBackupPrefs, passwordMissing } = await import("../backup/schedule");
    const store = new Map<string, string>();
    const local = { getItem: (key: string) => store.get(key) ?? null, setItem: (key: string, value: string) => { store.set(key, value); }, removeItem: (key: string) => { store.delete(key); } };
    (globalThis as unknown as { window: unknown }).window = { localStorage: local };
    saveBackupPrefs({ frequency: "daily", password: "password-lunga", last: null });
    store.set("et-backup-prefs", "{rotto");
    expect(passwordMissing({ frequency: "daily", password: "", last: null })).toBe(true);
    await expect(makeBackup([], ledgerOf(), "", "2026-11-16")).rejects.toThrow("password");
    saveBackupPrefs({ frequency: "weekly", password: "", last: null });
    expect(passwordMissing({ frequency: "weekly", password: "", last: null })).toBe(true);
    saveBackupPrefs({ frequency: "weekly", password: "", last: null }, true);
    expect(passwordMissing({ frequency: "weekly", password: "", last: null })).toBe(false);
    delete (globalThis as unknown as { window?: unknown }).window;
  });
});
