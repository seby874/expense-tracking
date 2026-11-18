import { describe, expect, it } from "vitest";
import { boardSegments, type BoardItem } from "../../app/board";

const item = (key: string, weight = 2, full = false): BoardItem => ({ key, node: null, weight, full });
const keys = (list: BoardItem[]) => list.map((entry) => entry.key);

describe("boardSegments", () => {
  it("puts each panel in the shorter column so short panels do not leave gaps", () => {
    const [segment] = boardSegments([item("flow", 3), item("insights", 1), item("budget", 1), item("recent", 3)]);
    expect("columns" in segment && segment.columns.map(keys)).toEqual([["flow"], ["insights", "budget", "recent"]]);
  });

  it("keeps full-width panels as separators between groups", () => {
    const segments = boardSegments([item("stats", 1, true), item("a"), item("b"), item("c")]);
    expect(segments).toHaveLength(2);
    expect("full" in segments[0] && segments[0].full.key).toBe("stats");
    expect("columns" in segments[1] && segments[1].columns.map(keys)).toEqual([["a", "c"], ["b"]]);
  });

  it("returns nothing for an empty board", () => {
    expect(boardSegments([])).toEqual([]);
  });
});
