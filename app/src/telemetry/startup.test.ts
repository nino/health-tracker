import { describe, expect, test } from "bun:test";

import { startupEvent } from "./startup";

const MARKS = {
  bundleStart: 1000,
  entry: 1012.4,
  storePrimed: 1120,
  firstLayout: 1300,
};

describe("startupEvent", () => {
  test("splits a launch into rounded phases", () => {
    expect(startupEvent(MARKS)).toEqual({
      name: "app_startup",
      schema: 2,
      polyfills_ms: 12,
      store_ms: 108,
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
    expect(event.store_ms).toBe(108);
  });

  test("drops negative and implausibly long spans", () => {
    const event = startupEvent({
      ...MARKS,
      storePrimed: 1010, // before entry
      firstLayout: 1010 + 61_000,
    });
    expect(event.store_ms).toBeUndefined();
    expect(event.mount_ms).toBeUndefined();
    expect(event.js_total_ms).toBeUndefined();
    expect(event.polyfills_ms).toBe(12);
  });

  test("adds the native side, lined up through the epoch offset", () => {
    const epochOffset = 1_700_000_000_000;
    const event = startupEvent(MARKS, {
      epochOffset,
      launch: {
        processStart: epochOffset + 700,
        mainStart: epochOffset + 760,
        prewarmed: false,
        contentAppeared: epochOffset + 1330,
      },
    });
    expect(event).toMatchObject({
      prewarmed: false,
      premain_ms: 60,
      native_ms: 240, // main → bundle start
      js_to_content_ms: 330,
      total_ms: 630, // process start → content
      js_total_ms: 300,
    });
  });

  test("counts a prewarmed launch from main, not from process start", () => {
    const epochOffset = 1_700_000_000_000;
    const event = startupEvent(MARKS, {
      epochOffset,
      launch: {
        processStart: epochOffset - 3_600_000, // an hour earlier
        mainStart: epochOffset + 760,
        prewarmed: true,
        contentAppeared: epochOffset + 1330,
      },
    });
    expect(event.prewarmed).toBe(true);
    expect(event.premain_ms).toBeUndefined();
    expect(event.total_ms).toBe(570);
  });

  test("treats a process started long before main as prewarmed", () => {
    const epochOffset = 1_700_000_000_000;
    const event = startupEvent(MARKS, {
      epochOffset,
      launch: {
        processStart: epochOffset - 20_000,
        mainStart: epochOffset + 760,
        prewarmed: false, // iOS didn't say so
        contentAppeared: epochOffset + 1330,
      },
    });
    expect(event.prewarmed).toBe(true);
    expect(event.premain_ms).toBeUndefined();
    expect(event.total_ms).toBe(570);
  });

  test("leaves out the content phases until content has appeared", () => {
    const epochOffset = 1_700_000_000_000;
    const event = startupEvent(MARKS, {
      epochOffset,
      launch: {
        processStart: epochOffset + 700,
        mainStart: epochOffset + 760,
        prewarmed: false,
      },
    });
    expect(event.native_ms).toBe(240);
    expect(event.js_to_content_ms).toBeUndefined();
    expect(event.total_ms).toBeUndefined();
  });
});
