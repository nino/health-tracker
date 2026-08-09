// Pure geometry for the history charts: maps dated values into the unit
// square (x: 0=oldest..1=newest, y: 0=domain min..1=domain max). The chart
// component scales to pixels and flips y for screen coordinates.

export interface ChartInputPoint {
  date: Date;
  value: number;
}

export interface ChartPoint {
  x: number;
  y: number;
}

export function scalePoints(
  points: ChartInputPoint[],
  yMin: number,
  yMax: number,
): ChartPoint[] {
  if (points.length === 0) return [];
  const times = points.map((p) => p.date.getTime());
  const tMin = Math.min(...times);
  const tMax = Math.max(...times);
  const tSpan = tMax - tMin;
  const ySpan = yMax - yMin;
  return points.map((p) => ({
    // A single point (or all-same-date points) centers horizontally.
    x: tSpan === 0 ? 0.5 : (p.date.getTime() - tMin) / tSpan,
    y: ySpan === 0 ? 0.5 : clamp01((p.value - yMin) / ySpan),
  }));
}

function clamp01(v: number): number {
  return Math.min(1, Math.max(0, v));
}

/** Y-domain for numeric custom items — the one chart without a fixed scale
 * (press-ups and body weight share no meaningful bounds, and anchoring
 * weight to 0 would flatten it into a line). Integer-snapped so the grid
 * labels stay readable; a flat series gets ±1 so its points sit centered
 * instead of dividing by a zero span. */
export function numericDomain(values: number[]): { min: number; max: number } {
  if (values.length === 0) return { min: 0, max: 1 };
  let min = Math.floor(Math.min(...values));
  let max = Math.ceil(Math.max(...values));
  if (min === max) {
    min -= 1;
    max += 1;
  }
  return { min, max };
}

/** Evenly thins a series to at most `max` points, always keeping the first
 * and last — years of backfilled history must not mount thousands of SVG
 * nodes per chart. */
export function downsample<T>(points: T[], max: number): T[] {
  if (max < 2 || points.length <= max) return points;
  const step = (points.length - 1) / (max - 1);
  return Array.from({ length: max }, (_, i) => points[Math.round(i * step)]);
}
