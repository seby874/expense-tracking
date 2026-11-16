import { describe, expect, it } from "vitest";
import { dueDates, occurrence, occurrenceId } from "../recurring";

describe("occurrenceId", () => {
  const fallback = () => "random-id";

  it("is the same for the same recurring and date, on every device", () => {
    const recurring = { id: "0b8f7c2e-5a1d-4f3e-9c6b-2d4e8a1f7b3c" };
    expect(occurrenceId(recurring, "2027-03-05", fallback)).toBe("0b8f7c2e-5a1d-4f3e-9c6b-2d4e8a1f7b3c-20270305");
    expect(occurrenceId(recurring, "2027-03-05", fallback)).toBe(occurrenceId(recurring, "2027-03-05", fallback));
  });

  it("differs between dates", () => {
    expect(occurrenceId({ id: "r" }, "2027-03-05", fallback)).not.toBe(occurrenceId({ id: "r" }, "2027-04-05", fallback));
  });

  it("stays within the 64-character id limit, falling back for very long ids", () => {
    const longId = "x".repeat(60);
    expect(occurrenceId({ id: longId }, "2027-03-05", fallback)).toBe("random-id");
    expect(/^[a-zA-Z0-9_-]{1,64}$/.test(occurrenceId({ id: "r" }, "2027-03-05", fallback))).toBe(true);
  });
});

describe("schedule", () => {
  it("anchors monthly dates to the last day of shorter months", () => {
    const schedule = { frequency: "monthly" as const, every: 1, start: "2027-01-31" };
    expect(occurrence(schedule, 1)).toBe("2027-02-28");
    expect(occurrence(schedule, 2)).toBe("2027-03-31");
  });

  it("lists due dates up to today, skipping those already handled", () => {
    const schedule = { frequency: "weekly" as const, every: 1, start: "2027-03-01", end: "", done: 1 };
    expect(dueDates(schedule, "2027-03-20")).toEqual(["2027-03-08", "2027-03-15"]);
  });
});
