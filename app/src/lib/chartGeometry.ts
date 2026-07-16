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
