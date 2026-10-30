import { describe, expect, test } from "bun:test";

import { startupEvent } from "./startup";

const MARKS = {
  bundleStart: 1000,
  entry: 1012.4,
  modulesLoaded: 1100.6,
  storePrimed: 1120,
  firstLayout: 1300,
};

describe("startupEvent", () => {
  test("splits a launch into rounded phases", () => {
    expect(startupEvent(MARKS)).toEqual({
      name: "app_startup",
      polyfills_ms: 12,
      modules_ms: 88,
      store_ms: 19,
      mount_ms: 180,
      js_total_ms: 300,
    });
  });

  test("leaves out phases with a missing mark", () => {
    const { bundleStart: _, ...marks } = MARKS;
    const event = startupEvent(marks);
    expect(event.polyfills_ms).toBeUndefined();
    // No fallback start: the total always means bundle start → layout.
    expect(event.js_total_ms).toBeUndefined();
    expect(event.store_ms).toBe(19);
  });

  test("drops negative and implausibly long spans", () => {
    const event = startupEvent({
      ...MARKS,
      storePrimed: 1050, // before modulesLoaded
      firstLayout: 1050 + 61_000,
    });
    expect(event.store_ms).toBeUndefined();
    expect(event.mount_ms).toBeUndefined();
    expect(event.js_total_ms).toBeUndefined();
    expect(event.modules_ms).toBe(88);
  });
});
