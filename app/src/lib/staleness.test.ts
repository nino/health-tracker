import { describe, expect, test } from "bun:test";

import { relativeAge, staleness } from "./staleness";

const NOW = new Date("2026-07-16T12:00:00Z");

function hoursAgo(h: number): Date {
  return new Date(NOW.getTime() - h * 3_600_000);
}

describe("staleness", () => {
  test("buckets match the Swift color thresholds", () => {
    expect(staleness(null, NOW)).toBe("red");
    expect(staleness(hoursAgo(1), NOW)).toBe("fresh");
    expect(staleness(hoursAgo(2), NOW)).toBe("green");
    expect(staleness(hoursAgo(3.9), NOW)).toBe("green");
    expect(staleness(hoursAgo(4), NOW)).toBe("yellow");
    expect(staleness(hoursAgo(8), NOW)).toBe("orange");
    expect(staleness(hoursAgo(24), NOW)).toBe("red");
    expect(staleness(hoursAgo(100), NOW)).toBe("red");
  });
});

describe("relativeAge", () => {
  test("formats like the Swift app", () => {
    expect(relativeAge(null, NOW)).toBe("never");
    expect(relativeAge(hoursAgo(0), NOW)).toBe("0m");
    expect(relativeAge(hoursAgo(0.5), NOW)).toBe("30m");
    expect(relativeAge(hoursAgo(5), NOW)).toBe("5h");
    expect(relativeAge(hoursAgo(23), NOW)).toBe("23h");
    expect(relativeAge(hoursAgo(24), NOW)).toBe("1d");
    expect(relativeAge(hoursAgo(72), NOW)).toBe("3d");
  });

  test("clock skew never yields negative ages", () => {
    expect(relativeAge(hoursAgo(-1), NOW)).toBe("0m");
  });
});
