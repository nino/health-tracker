import { describe, expect, test } from "bun:test";

import { scalePoints } from "./chartGeometry";

describe("scalePoints", () => {
  test("empty input stays empty", () => {
    expect(scalePoints([], 0, 10)).toEqual([]);
  });

  test("single point centers on x and scales y within the domain", () => {
    const [p] = scalePoints(
      [{ date: new Date("2026-07-01T00:00:00Z"), value: 5 }],
      0,
      10,
    );
    expect(p.x).toBe(0.5);
    expect(p.y).toBe(0.5);
  });

  test("x spreads oldest→0, newest→1, linear in time", () => {
    const points = scalePoints(
      [
        { date: new Date("2026-07-01T00:00:00Z"), value: 0 },
        { date: new Date("2026-07-02T00:00:00Z"), value: 0 },
        { date: new Date("2026-07-05T00:00:00Z"), value: 0 },
      ],
      0,
      10,
    );
    expect(points.map((p) => p.x)).toEqual([0, 0.25, 1]);
  });

  test("y respects a fixed domain and clamps out-of-domain values", () => {
    const points = scalePoints(
      [
        { date: new Date("2026-07-01T00:00:00Z"), value: 1 },
        { date: new Date("2026-07-02T00:00:00Z"), value: 10 },
        { date: new Date("2026-07-03T00:00:00Z"), value: 42 },
      ],
      1,
      10,
    );
    expect(points[0].y).toBe(0);
    expect(points[1].y).toBe(1);
    expect(points[2].y).toBe(1);
  });
});
