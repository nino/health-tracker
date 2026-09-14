import { type TimeRange } from "./chartGeometry";

// X-axis ticks for a zoomable time axis: picks the coarsest calendar step
// that still fits `maxTicks` labels into the range, aligned to local
// calendar boundaries (midnight, Monday, the 1st, Jan 1) so labels read as
// dates the user recognizes rather than arbitrary offsets from the oldest
// entry. Labels get denser in detail as the step gets finer: years show
// "2026", months "Sep", days "Sep 3", hours "14:00" (midnight shows the
// date instead, so a day's worth of hourly ticks is still anchored).

export interface Tick {
  date: Date;
  label: string;
}

type Unit = "hour" | "day" | "week" | "month" | "year";

interface Step {
  unit: Unit;
  count: number;
  ms: number; // approximate, for choosing the step
}

const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;

const STEPS: Step[] = [
  ...[1, 2, 3, 6, 12].map((count) => ({
    unit: "hour" as const,
    count,
    ms: count * HOUR,
  })),
  { unit: "day", count: 1, ms: DAY },
  { unit: "day", count: 2, ms: 2 * DAY },
  { unit: "week", count: 1, ms: 7 * DAY },
  { unit: "week", count: 2, ms: 14 * DAY },
  ...[1, 2, 3, 6].map((count) => ({
    unit: "month" as const,
    count,
    ms: count * 30.44 * DAY,
  })),
];

export function timeTicks(range: TimeRange, maxTicks: number): Tick[] {
  if (maxTicks < 1) return [];
  const span = range.tMax - range.tMin;
  if (span <= 0) {
    return range.tMin === 0
      ? []
      : [{ date: new Date(range.tMin), label: dayLabel(new Date(range.tMin)) }];
  }
  const step = chooseStep(span, maxTicks);
  const ticks: Tick[] = [];
  for (
    let date = floorTo(new Date(range.tMin), step);
    date.getTime() <= range.tMax;
    date = advance(date, step)
  ) {
    if (date.getTime() >= range.tMin) {
      ticks.push({ date, label: label(date, step.unit) });
    }
  }
  return ticks;
}

function chooseStep(span: number, maxTicks: number): Step {
  for (const step of STEPS) {
    if (span / step.ms <= maxTicks) return step;
  }
  // Years: 1, 2, 5, 10, 20, 50, ...
  const yearMs = 365.25 * DAY;
  let count = 1;
  for (let magnitude = 1; ; magnitude *= 10) {
    for (const multiple of [1, 2, 5]) {
      count = multiple * magnitude;
      if (span / (count * yearMs) <= maxTicks) {
        return { unit: "year", count, ms: count * yearMs };
      }
    }
  }
}

/** The latest step boundary at or before `date`, in local time. Multi-unit
 * steps align to multiples counted from the containing coarser unit
 * (every 3 hours from midnight, every 3 months from January), except days
 * and weeks, which have no natural parent and align to the day / Monday. */
function floorTo(date: Date, step: Step): Date {
  const y = date.getFullYear();
  const m = date.getMonth();
  const d = date.getDate();
  switch (step.unit) {
    case "hour": {
      const hour = date.getHours() - (date.getHours() % step.count);
      return new Date(y, m, d, hour);
    }
    case "day":
      return new Date(y, m, d);
    case "week": {
      const daysSinceMonday = (date.getDay() + 6) % 7;
      return new Date(y, m, d - daysSinceMonday);
    }
    case "month":
      return new Date(y, m - (m % step.count), 1);
    case "year":
      return new Date(y - (y % step.count), 0, 1);
  }
}

/** One step later, by calendar arithmetic so ticks stay on boundaries
 * across DST and month lengths. */
function advance(date: Date, step: Step): Date {
  const y = date.getFullYear();
  const m = date.getMonth();
  const d = date.getDate();
  switch (step.unit) {
    case "hour":
      return new Date(y, m, d, date.getHours() + step.count);
    case "day":
      return new Date(y, m, d + step.count);
    case "week":
      return new Date(y, m, d + 7 * step.count);
    case "month":
      return new Date(y, m + step.count, 1);
    case "year":
      return new Date(y + step.count, 0, 1);
  }
}

function label(date: Date, unit: Unit): string {
  switch (unit) {
    case "hour":
      return date.getHours() === 0 && date.getMinutes() === 0
        ? dayLabel(date)
        : date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
    case "day":
    case "week":
      return dayLabel(date);
    case "month":
      return date.getMonth() === 0
        ? String(date.getFullYear())
        : date.toLocaleDateString([], { month: "short" });
    case "year":
      return String(date.getFullYear());
  }
}

function dayLabel(date: Date): string {
  return date.toLocaleDateString([], { month: "short", day: "numeric" });
}
