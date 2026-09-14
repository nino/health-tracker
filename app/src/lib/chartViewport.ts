import { type TimeRange } from "./chartGeometry";

// Horizontal zoom/pan state for the history charts. A viewport is the
// visible window as fractions of the chart's full time range (0 = oldest,
// 1 = newest), so it survives the data changing under it (switching the
// display mode re-buckets the dates but keeps the same span). Zoom only
// ever touches the x-axis: the y-domains are fixed by design.

export interface Viewport {
  start: number;
  end: number;
}

export const FULL_VIEWPORT: Viewport = { start: 0, end: 1 };

/** Narrowest window a user can zoom into, in ms. Raw entries can be minutes
 * apart, so an hour still separates them; anything below is just noise. */
export const MIN_VIEWPORT_MS = 60 * 60 * 1000;

/** Slides the window so what's under the finger stays under the finger:
 * `deltaFraction` is the drag distance as a fraction of the plot width
 * (positive = finger moved right = view moves toward older data). */
export function panViewport(view: Viewport, deltaFraction: number): Viewport {
  const span = view.end - view.start;
  return clampViewport(view.start - deltaFraction * span, span);
}

/** Scales the window by `factor` (>1 zooms in) about `anchorFraction`, the
 * pinch midpoint as a fraction of the plot width, so the date under the
 * pinch stays put. `minSpan` (fraction of the full range) bounds zoom-in. */
export function zoomViewport(
  view: Viewport,
  factor: number,
  anchorFraction: number,
  minSpan: number,
): Viewport {
  const span = view.end - view.start;
  const newSpan = Math.min(1, Math.max(minSpan, span / factor));
  const anchorTime = view.start + anchorFraction * span;
  return clampViewport(anchorTime - anchorFraction * newSpan, newSpan);
}

/** Keeps a window of `span` inside 0..1, preferring to keep `start`. */
function clampViewport(start: number, span: number): Viewport {
  const clamped = Math.min(1 - span, Math.max(0, start));
  return { start: clamped, end: clamped + span };
}

/** The smallest viewport span for a data range, as a fraction. A range
 * shorter than MIN_VIEWPORT_MS (or empty) can't zoom at all. */
export function minViewportSpan(full: TimeRange): number {
  const fullSpan = full.tMax - full.tMin;
  if (fullSpan <= 0) return 1;
  return Math.min(1, MIN_VIEWPORT_MS / fullSpan);
}

/** The time window a viewport shows of `full`. */
export function visibleRange(full: TimeRange, view: Viewport): TimeRange {
  const fullSpan = full.tMax - full.tMin;
  return {
    tMin: full.tMin + view.start * fullSpan,
    tMax: full.tMin + view.end * fullSpan,
  };
}

/** The points a zoomed chart needs: everything inside `range` plus one
 * neighbor on each side, so the line still runs off the edges instead of
 * stopping at the last visible dot. `points` must be sorted by date. */
export function visibleSlice<T extends { date: Date }>(
  points: T[],
  range: TimeRange,
): T[] {
  let from = 0;
  while (from < points.length && points[from].date.getTime() < range.tMin) {
    from += 1;
  }
  let to = points.length;
  while (to > 0 && points[to - 1].date.getTime() > range.tMax) {
    to -= 1;
  }
  return points.slice(Math.max(0, from - 1), Math.min(points.length, to + 1));
}
