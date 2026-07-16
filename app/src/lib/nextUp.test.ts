import { describe, expect, test } from "bun:test";

import { nextUp, NEXT_UP_WINDOW_MS } from "./nextUp";

const NOW = new Date("2026-07-16T12:00:00Z");
const items = [{ id: "a" }, { id: "b" }, { id: "c" }, { id: "d" }];

function minutesAgo(m: number): Date {
  return new Date(NOW.getTime() - m * 60_000);
}

describe("nextUp", () => {
  test("picks the next never-logged item after the current one, wrapping", () => {
    expect(nextUp(items, "b", new Map(), NOW)?.id).toBe("c");
    expect(nextUp(items, "d", new Map(), NOW)?.id).toBe("a");
  });

  test("skips items logged within the last 10 minutes", () => {
    const lastLogged = new Map([
      ["c", minutesAgo(5)],
      ["d", minutesAgo(11)],
    ]);
    expect(nextUp(items, "b", lastLogged, NOW)?.id).toBe("d");
  });

  test("exactly 10 minutes ago counts as needing logging again", () => {
    const lastLogged = new Map([
      ["a", new Date(NOW.getTime() - NEXT_UP_WINDOW_MS)],
      ["b", minutesAgo(1)],
      ["c", minutesAgo(1)],
      ["d", minutesAgo(1)],
    ]);
    expect(nextUp(items, "b", lastLogged, NOW)?.id).toBe("a");
  });

  test("returns undefined when everything else is freshly logged", () => {
    const lastLogged = new Map([
      ["a", minutesAgo(1)],
      ["b", minutesAgo(9)],
      ["c", minutesAgo(2)],
      ["d", minutesAgo(0)],
    ]);
    expect(nextUp(items, "b", lastLogged, NOW)).toBeUndefined();
  });

  test("never returns the current item, even if it needs logging", () => {
    const lastLogged = new Map([
      ["a", minutesAgo(1)],
      ["c", minutesAgo(1)],
      ["d", minutesAgo(1)],
    ]);
    expect(nextUp(items, "b", lastLogged, NOW)).toBeUndefined();
  });

  test("a current item not in the list scans from the start", () => {
    expect(nextUp(items, "not-enabled", new Map(), NOW)?.id).toBe("a");
  });

  test("empty list yields undefined", () => {
    expect(nextUp([], "a", new Map(), NOW)).toBeUndefined();
  });
});
