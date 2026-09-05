import { describe, expect, test } from "bun:test";

import {
  downsample,
  numericDomain,
  scalePoints,
  scaleTime,
  timeRange,
} from "./chartGeometry";

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

  test("downsample keeps endpoints, order, and the cap", () => {
    const points = Array.from({ length: 5000 }, (_, i) => i);
    const thinned = downsample(points, 400);
    expect(thinned.length).toBe(400);
    expect(thinned[0]).toBe(0);
    expect(thinned[399]).toBe(4999);
    expect([...thinned].sort((a, b) => a - b)).toEqual(thinned);
    // Under the cap: untouched.
    expect(downsample([1, 2, 3], 400)).toEqual([1, 2, 3]);
  });

  test("numericDomain snaps to integers and never collapses to zero span", () => {
    expect(numericDomain([])).toEqual({ min: 0, max: 1 });
    expect(numericDomain([72.4, 71.8, 73.1])).toEqual({ min: 71, max: 74 });
    // A flat series (every log "15 press-ups") pads ±1 to stay plottable.
    expect(numericDomain([15, 15, 15])).toEqual({ min: 14, max: 16 });
    // No forced zero baseline: weight around 72 must not flatline at the top.
    expect(numericDomain([-2.5, 3])).toEqual({ min: -3, max: 3 });
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

describe("timeRange / scaleTime", () => {
  test("a range covering line points and markers aligns both on one x-scale", () => {
    const d0 = new Date(2026, 0, 1);
    const d1 = new Date(2026, 0, 2);
    const d2 = new Date(2026, 0, 3);
    const range = timeRange([d1, d2, d0]);
    expect(range).toEqual({ tMin: d0.getTime(), tMax: d2.getTime() });
    // Line points scaled within the wider range no longer span the full width.
    expect(scalePoints([{ date: d1, value: 0 }], 0, 1, range)[0].x).toBe(0.5);
    expect(scaleTime(d0, range)).toBe(0);
    expect(scaleTime(d2, range)).toBe(1);
  });

  test("empty and single-date ranges center", () => {
    expect(timeRange([])).toEqual({ tMin: 0, tMax: 0 });
    const d = new Date(2026, 0, 1);
    expect(scaleTime(d, timeRange([d]))).toBe(0.5);
  });
});
