import { describe, expect, test } from "bun:test";

import { aggregatePoints } from "./chartAggregate";

// Local-time constructors throughout — bucketing is by local calendar.
// 2026-07-27 is a Monday.
function pt(day: number, hour: number, value: number) {
  return { date: new Date(2026, 6, day, hour), value };
}

describe("aggregatePoints", () => {
  test("raw passes the input through untouched", () => {
    const points = [pt(1, 9, 3), pt(1, 21, 5)];
    expect(aggregatePoints(points, "raw")).toBe(points);
  });

  test("day mode averages a local day into one point at local midnight", () => {
    const result = aggregatePoints(
      [pt(1, 0, 2), pt(1, 23, 4), pt(2, 12, 9)],
      "day",
    );
    expect(result).toEqual([
      { date: new Date(2026, 6, 1), value: 3 },
      { date: new Date(2026, 6, 2), value: 9 },
    ]);
  });

  test("week mode buckets Monday..Sunday onto the Monday", () => {
    // Mon 27, Sun Aug 2 → same week; Sun 26 → the week before.
    const result = aggregatePoints(
      [pt(26, 12, 1), pt(27, 12, 2), pt(33, 12, 4)],
      "week",
    );
    expect(result).toEqual([
      { date: new Date(2026, 6, 20), value: 1 },
      { date: new Date(2026, 6, 27), value: 3 },
    ]);
    expect(result.map((p) => p.date.getDay())).toEqual([1, 1]);
  });

  test("output is sorted by date even when buckets arrive out of order", () => {
    const result = aggregatePoints(
      [pt(5, 8, 1), pt(1, 8, 2), pt(3, 8, 3)],
      "day",
    );
    expect(result.map((p) => p.date.getDate())).toEqual([1, 3, 5]);
  });

  test("empty input stays empty in every mode", () => {
    expect(aggregatePoints([], "raw")).toEqual([]);
    expect(aggregatePoints([], "day")).toEqual([]);
    expect(aggregatePoints([], "week")).toEqual([]);
  });
});
