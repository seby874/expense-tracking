import { describe, expect, it } from "vitest";
import { parseSpoken, weekdaySuggestion } from "../quick-assist";
import { todaySummary } from "../notify";
import type { Deadline, Movement } from "../ledger";
import type { TodayTask } from "../today";
import { expense, ledgerOf } from "./fixtures";

describe("parseSpoken", () => {
  it("reads title and amount from common dictation results", () => {
    expect(parseSpoken("caffè 1,20")).toEqual({ title: "Caffè", amount: 120 });
    expect(parseSpoken("benzina 50 euro")).toEqual({ title: "Benzina", amount: 5000 });
    expect(parseSpoken("pizza 12 euro e 50")).toEqual({ title: "Pizza", amount: 1250 });
    expect(parseSpoken("€8,90 cinema")).toEqual({ title: "Cinema", amount: 890 });
  });

  it("keeps the words when there is no amount", () => {
    expect(parseSpoken("regalo per Marco")).toEqual({ title: "Regalo per Marco", amount: null });
  });
});

function on(date: string, labelId: string): Movement {
  return expense(date, 3000, "fineco", labelId);
}

describe("weekdaySuggestion", () => {
  it("suggests the category usually used on the same weekday", () => {
    // 2026-11-07, 14, 21 e 31/10 sono sabati: spesa al supermercato; gli altri giorni altro.
    const ledger = ledgerOf(on("2026-10-31", "groceries"), on("2026-11-07", "groceries"), on("2026-11-14", "groceries"),
      on("2026-11-10", "transport"), on("2026-11-11", "transport"), on("2026-11-12", "transport"), on("2026-11-13", "transport"));
    expect(weekdaySuggestion(ledger, "expense", "2026-11-21")).toMatchObject({ labelId: "groceries", weekday: "sabato" });
  });

  it("stays silent without a clear habit", () => {
    const ledger = ledgerOf(on("2026-11-07", "groceries"), on("2026-11-14", "transport"));
    expect(weekdaySuggestion(ledger, "expense", "2026-11-21")).toBeNull();
  });
});

describe("todaySummary", () => {
  const deadline: Deadline = { kind: "deadline", id: "d", version: null, value: { title: "Bollo auto", type: "vehicle", date: "2026-11-21", repeatMonths: 0, noticeDays: 30, notes: "" } };

  it("summarises only what needs doing now", () => {
    const tasks: TodayTask[] = [
      { kind: "deadline", key: "deadline-d", tone: "bad", deadline, days: 0 },
      { kind: "idle", key: "idle", tone: "info", days: 5 },
    ];
    expect(todaySummary(tasks)).toEqual({ title: "1 cosa da fare oggi", body: "Bollo auto" });
  });

  it("returns nothing on a quiet day", () => {
    expect(todaySummary([{ kind: "idle", key: "idle", tone: "info", days: 5 }])).toBeNull();
  });
});
