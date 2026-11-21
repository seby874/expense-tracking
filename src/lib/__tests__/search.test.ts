import { describe, expect, it } from "vitest";
import { searchLedger } from "../search";
import type { Deadline, LedgerRecord, Movement, Person } from "../ledger";
import { expense, ledgerOf } from "./fixtures";

function movement(title: string, amount: number, extra: Partial<Movement["value"]> = {}): Movement {
  const base = expense("2026-11-10", amount);
  return { ...base, value: { ...base.value, title, ...extra } as Movement["value"] };
}

const deadline: Deadline = { kind: "deadline", id: "d1", version: null, value: { title: "Revisione Panda", type: "vehicle", date: "2026-12-01", repeatMonths: 24, noticeDays: 30, notes: "officina" } };
const person: Person = { kind: "person", id: "p1", version: null, value: { firstName: "Giulia", lastName: "Rossi", relation: "child", taxCode: "", dependent: [], order: 0 } } as unknown as Person;

const data = (records: LedgerRecord[]) => ledgerOf(...records);

describe("searchLedger", () => {
  it("finds movements by title, notes and amount, ignoring case and accents", () => {
    const ledger = data([movement("Caffè al bar", 120), movement("Pizzeria", 1250, { notes: "cena con amici" }), movement("Benzina", 6000)]);
    expect(searchLedger(ledger, "caffe").map((item) => item.title)).toEqual(["Caffè al bar"]);
    expect(searchLedger(ledger, "AMICI")[0]).toMatchObject({ kind: "movement", title: "Pizzeria" });
    expect(searchLedger(ledger, "12,50")[0]).toMatchObject({ kind: "movement", title: "Pizzeria" });
  });

  it("finds accounts, categories, deadlines and family members", () => {
    const ledger = data([deadline, person]);
    expect(searchLedger(ledger, "fineco")[0]).toMatchObject({ kind: "account" });
    expect(searchLedger(ledger, "spesa alim")[0]).toMatchObject({ kind: "label" });
    expect(searchLedger(ledger, "officina")[0]).toMatchObject({ kind: "deadline", title: "Revisione Panda" });
    expect(searchLedger(ledger, "giulia")[0]).toMatchObject({ kind: "person" });
  });

  it("puts titles that start with the query first", () => {
    const ledger = data([movement("Una pizza", 900), movement("Pizza margherita", 800)]);
    expect(searchLedger(ledger, "pizza").map((item) => item.title)).toEqual(["Pizza margherita", "Una pizza"]);
  });

  it("needs at least two characters and limits the results", () => {
    const ledger = data(Array.from({ length: 80 }, (_, index) => movement(`Spesa ${index}`, 100 + index)));
    expect(searchLedger(ledger, "s")).toEqual([]);
    expect(searchLedger(ledger, "spesa").length).toBeLessThanOrEqual(30);
  });
});
