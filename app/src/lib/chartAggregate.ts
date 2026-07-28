import { type ChartInputPoint } from "./chartGeometry";

// Display modes for the history charts. Averages bucket by *local* calendar
// day / week (Monday-start), matching how the user thinks about "a day" —
// the store's UTC-offset-aware dates make local the only sensible calendar.

export const CHART_MODES = [
  { id: "day", label: "Day avg" },
  { id: "week", label: "Week avg" },
  { id: "raw", label: "Raw" },
] as const;

export type ChartMode = (typeof CHART_MODES)[number]["id"];

/** Averages points into one per local day/week; the bucket's date is its
 * start (local midnight / Monday midnight). "raw" passes through. */
export function aggregatePoints(
  points: ChartInputPoint[],
  mode: ChartMode,
): ChartInputPoint[] {
  if (mode === "raw") return points;
  const buckets = new Map<number, { sum: number; count: number }>();
  for (const p of points) {
    const key = bucketStart(p.date, mode).getTime();
    const bucket = buckets.get(key) ?? { sum: 0, count: 0 };
    bucket.sum += p.value;
    bucket.count += 1;
    buckets.set(key, bucket);
  }
  return [...buckets.entries()]
    .sort(([a], [b]) => a - b)
    .map(([time, { sum, count }]) => ({
      date: new Date(time),
      value: sum / count,
    }));
}

function bucketStart(date: Date, mode: "day" | "week"): Date {
  const start = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  if (mode === "week") {
    const daysSinceMonday = (start.getDay() + 6) % 7;
    start.setDate(start.getDate() - daysSinceMonday);
  }
  return start;
}
