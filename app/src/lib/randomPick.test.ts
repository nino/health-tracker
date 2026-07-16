import { describe, expect, test } from "bun:test";

import { weightedRandomByRecency } from "./randomPick";

const items = [{ id: "a" }, { id: "b" }, { id: "c" }];

describe("weightedRandomByRecency", () => {
  test("empty and single-item lists short-circuit", () => {
    expect(weightedRandomByRecency([], new Map())).toBeUndefined();
    expect(weightedRandomByRecency([items[0]], new Map())?.id).toBe("a");
  });

  test("random=0 always picks the least recently logged", () => {
    const lastLogged = new Map([
      ["a", new Date("2026-07-16T10:00:00Z")],
      ["b", new Date("2026-07-10T10:00:00Z")],
      ["c", new Date("2026-07-14T10:00:00Z")],
    ]);
    expect(weightedRandomByRecency(items, lastLogged, () => 0)?.id).toBe("b");
  });

  test("never-logged counts as oldest", () => {
    const lastLogged = new Map([
      ["a", new Date("2026-07-16T10:00:00Z")],
      ["b", new Date("2026-07-10T10:00:00Z")],
    ]);
    expect(weightedRandomByRecency(items, lastLogged, () => 0)?.id).toBe("c");
  });

  test("random→1 picks the most recently logged (weights 3:2:1)", () => {
    const lastLogged = new Map([
      ["a", new Date("2026-07-16T10:00:00Z")],
      ["b", new Date("2026-07-10T10:00:00Z")],
      ["c", new Date("2026-07-14T10:00:00Z")],
    ]);
    expect(weightedRandomByRecency(items, lastLogged, () => 0.999999)?.id).toBe(
      "a",
    );
    // Total weight is 6; the oldest (b, weight 3) owns [0, 0.5) of the range.
    expect(weightedRandomByRecency(items, lastLogged, () => 0.49)?.id).toBe(
      "b",
    );
    expect(weightedRandomByRecency(items, lastLogged, () => 0.51)?.id).toBe(
      "c",
    );
  });
});
