import { describe, expect, it } from "vitest";
import { euroInput, percentInput } from "../input-format";
import { parseMoney } from "../ledger";

describe("euroInput", () => {
  it("writes cents with a comma and dots between thousands", () => {
    expect(euroInput(10_000_000)).toBe("100.000,00");
    expect(euroInput(500_000)).toBe("5.000,00");
    expect(euroInput(516_457)).toBe("5.164,57");
    expect(euroInput(3_420)).toBe("34,20");
  });

  it("returns an empty field for missing values", () => {
    expect(euroInput(null)).toBe("");
    expect(euroInput(undefined)).toBe("");
  });

  it("produces text that parseMoney reads back to the same cents", () => {
    for (const cents of [0, 5, 3_420, 500_000, 516_457, 10_000_000, 123_456_789]) {
      expect(parseMoney(euroInput(cents))).toBe(cents);
    }
  });
});

describe("percentInput", () => {
  it("uses the decimal comma", () => {
    expect(percentInput(0.2)).toBe("0,2");
    expect(percentInput(0.5)).toBe("0,5");
    expect(percentInput(26)).toBe("26");
  });
});
