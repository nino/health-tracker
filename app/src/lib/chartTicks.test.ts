import { describe, expect, test } from "bun:test";

import { timeTicks } from "./chartTicks";

// Ticks are aligned to the *local* calendar, so build ranges with the local
// Date constructor and read them back the same way.
const local = (...args: [number, number, number, number?]) =>
  new Date(...args).getTime();

describe("timeTicks", () => {
  test("empty range has no ticks; a single instant has one", () => {
    expect(timeTicks({ tMin: 0, tMax: 0 }, 5)).toEqual([]);
    const t = local(2026, 8, 3);
    expect(timeTicks({ tMin: t, tMax: t }, 5)).toHaveLength(1);
  });

  test("a week shows one tick per day at local midnight", () => {
    const ticks = timeTicks(
      { tMin: local(2026, 8, 1, 9), tMax: local(2026, 8, 8, 9) },
      8,
    );
    expect(ticks.map((t) => t.date.getDate())).toEqual([2, 3, 4, 5, 6, 7, 8]);
    for (const tick of ticks) expect(tick.date.getHours()).toBe(0);
  });

  test("fewer allowed ticks pick a coarser step", () => {
    const ticks = timeTicks(
      { tMin: local(2026, 8, 1, 9), tMax: local(2026, 8, 8, 9) },
      4,
    );
    expect(ticks.map((t) => t.date.getDate())).toEqual([3, 5, 7]);
  });

  test("weekly ticks land on Mondays", () => {
    const ticks = timeTicks(
      { tMin: local(2026, 7, 1), tMax: local(2026, 8, 30) },
      10,
    );
    expect(ticks.length).toBeGreaterThan(3);
    for (const tick of ticks) expect(tick.date.getDay()).toBe(1);
  });

  test("months land on the 1st and January is labeled with the year", () => {
    const ticks = timeTicks(
      { tMin: local(2025, 10, 15), tMax: local(2026, 3, 15) },
      6,
    );
    expect(ticks.map((t) => t.date.getMonth())).toEqual([11, 0, 1, 2, 3]);
    for (const tick of ticks) expect(tick.date.getDate()).toBe(1);
    expect(ticks[1].label).toBe("2026");
  });

  test("multi-year ranges step in whole years", () => {
    const ticks = timeTicks(
      { tMin: local(2015, 5, 1), tMax: local(2026, 5, 1) },
      6,
    );
    expect(ticks.map((t) => t.label)).toEqual([
      "2016",
      "2018",
      "2020",
      "2022",
      "2024",
      "2026",
    ]);
  });

  test("an hour-level zoom labels midnight with the date", () => {
    const ticks = timeTicks(
      { tMin: local(2026, 8, 3, 18), tMax: local(2026, 8, 4, 6) },
      4,
    );
    expect(ticks.map((t) => t.date.getHours())).toEqual([18, 21, 0, 3, 6]);
    const midnight = ticks.find((t) => t.date.getHours() === 0)!;
    expect(midnight.label).toBe(
      midnight.date.toLocaleDateString([], { month: "short", day: "numeric" }),
    );
    expect(ticks[0].label).not.toBe(midnight.label);
  });

  test("never exceeds maxTicks", () => {
    for (const days of [0.5, 1, 3, 10, 40, 200, 800, 5000]) {
      for (const max of [2, 4, 6, 12]) {
        const ticks = timeTicks(
          { tMin: local(2026, 0, 1), tMax: local(2026, 0, 1) + days * 864e5 },
          max,
        );
        expect(ticks.length).toBeLessThanOrEqual(max + 1);
      }
    }
  });
});
