import { describe, expect, test } from "bun:test";

import {
  FULL_VIEWPORT,
  MIN_VIEWPORT_MS,
  minViewportSpan,
  panViewport,
  visibleRange,
  visibleSlice,
  zoomViewport,
} from "./chartViewport";

const DAY = 24 * 60 * 60 * 1000;

describe("zoomViewport", () => {
  test("zooming in halves the span around the anchor", () => {
    const view = zoomViewport(FULL_VIEWPORT, 2, 0.5, 0.01);
    expect(view.start).toBeCloseTo(0.25);
    expect(view.end).toBeCloseTo(0.75);
  });

  test("the date under the anchor stays under the anchor", () => {
    const before = { start: 0.2, end: 0.6 };
    const anchor = 0.25;
    const after = zoomViewport(before, 3, anchor, 0.01);
    const under = (v: typeof before) => v.start + anchor * (v.end - v.start);
    expect(under(after)).toBeCloseTo(under(before));
  });

  test("never zooms out past the full range", () => {
    expect(zoomViewport({ start: 0.4, end: 0.6 }, 0.1, 0.5, 0.01)).toEqual(
      FULL_VIEWPORT,
    );
  });

  test("never zooms in past the minimum span", () => {
    const view = zoomViewport(FULL_VIEWPORT, 1000, 0.5, 0.1);
    expect(view.end - view.start).toBeCloseTo(0.1);
  });

  test("zooming at an edge keeps the window inside the range", () => {
    const view = zoomViewport(FULL_VIEWPORT, 2, 1, 0.01);
    expect(view).toEqual({ start: 0.5, end: 1 });
  });
});

describe("panViewport", () => {
  test("dragging right shows older data", () => {
    const view = panViewport({ start: 0.5, end: 0.75 }, 0.4);
    expect(view.start).toBeCloseTo(0.4);
    expect(view.end).toBeCloseTo(0.65);
  });

  test("stops at both ends", () => {
    expect(panViewport({ start: 0.5, end: 0.75 }, 5)).toEqual({
      start: 0,
      end: 0.25,
    });
    expect(panViewport({ start: 0.5, end: 0.75 }, -5)).toEqual({
      start: 0.75,
      end: 1,
    });
  });

  test("the full range can't pan", () => {
    expect(panViewport(FULL_VIEWPORT, 0.3)).toEqual(FULL_VIEWPORT);
  });
});

describe("minViewportSpan", () => {
  test("is the minimum window as a fraction of the range", () => {
    expect(minViewportSpan({ tMin: 0, tMax: 10 * MIN_VIEWPORT_MS })).toBe(0.1);
  });

  test("a short or empty range can't zoom", () => {
    expect(minViewportSpan({ tMin: 0, tMax: MIN_VIEWPORT_MS / 2 })).toBe(1);
    expect(minViewportSpan({ tMin: 0, tMax: 0 })).toBe(1);
  });
});

describe("visibleRange", () => {
  test("maps fractions back to times", () => {
    expect(
      visibleRange({ tMin: 1000, tMax: 2000 }, { start: 0.25, end: 0.5 }),
    ).toEqual({ tMin: 1250, tMax: 1500 });
  });
});

describe("visibleSlice", () => {
  const points = [0, 1, 2, 3, 4, 5].map((day) => ({
    date: new Date(day * DAY),
  }));

  test("keeps the points inside plus one neighbor each side", () => {
    const slice = visibleSlice(points, { tMin: 2.5 * DAY, tMax: 3.5 * DAY });
    expect(slice.map((p) => p.date.getTime() / DAY)).toEqual([2, 3, 4]);
  });

  test("points on the boundary count as inside", () => {
    const slice = visibleSlice(points, { tMin: 2 * DAY, tMax: 3 * DAY });
    expect(slice.map((p) => p.date.getTime() / DAY)).toEqual([1, 2, 3, 4]);
  });

  test("the full range returns everything", () => {
    expect(visibleSlice(points, { tMin: 0, tMax: 5 * DAY })).toEqual(points);
  });

  test("a window between two points keeps both neighbors", () => {
    const slice = visibleSlice(points, { tMin: 2.2 * DAY, tMax: 2.8 * DAY });
    expect(slice.map((p) => p.date.getTime() / DAY)).toEqual([2, 3]);
  });
});
