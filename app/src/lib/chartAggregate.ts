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

/** Weeks shown per event chart (2 years). One backdated or imported old
 * entry must not explode the bar count into sub-pixel bars (LineChart
 * downsamples for the same reason). */
export const MAX_COUNT_WEEKS = 104;

/** Occurrences per local week (Monday-start) for event items, from the
 * first entry's week through `now`'s week — capped to the most recent
 * MAX_COUNT_WEEKS. Empty weeks are filled with 0 — for "flossed", the gap
 * weeks are the interesting ones. Entries dated after `now` (importable;
 * the UI can't create them) still extend the range instead of vanishing.
 * Stepping by calendar days (not fixed 7×24h) keeps week starts aligned
 * across DST. */
export function weeklyCounts(dates: Date[], now: Date): ChartInputPoint[] {
  if (dates.length === 0) return [];
  const counts = new Map<number, number>();
  for (const date of dates) {
    const key = bucketStart(date, "week").getTime();
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  const first = new Date(Math.min(...counts.keys()));
  const last = Math.max(bucketStart(now, "week").getTime(), ...counts.keys());
  const points: ChartInputPoint[] = [];
  for (
    const week = new Date(first);
    week.getTime() <= last;
    week.setDate(week.getDate() + 7)
  ) {
    points.push({
      date: new Date(week),
      value: counts.get(week.getTime()) ?? 0,
    });
  }
  return points.slice(-MAX_COUNT_WEEKS);
}
