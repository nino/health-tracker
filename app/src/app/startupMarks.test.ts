import { expect, test } from "bun:test";

import { markStartup, startupMarks } from "./startupMarks";

test("a milestone keeps its first time", () => {
  markStartup("firstLayout");
  const first = startupMarks.firstLayout;
  expect(first).toBeNumber();
  markStartup("firstLayout");
  expect(startupMarks.firstLayout).toBe(first!);
});

test("bundle start is left out off the performance clock", () => {
  // bun has no nativePerformanceNow, like the web build
  expect(startupMarks.bundleStart).toBeUndefined();
});
