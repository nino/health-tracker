// Startup milestones for the opt-in `app_startup` report, on the
// performance.now() clock. Imports nothing at runtime (a type-only import is
// erased), so marking costs nothing at startup.

import type { StartupMarks } from "../telemetry/startup";

export type StartupMark = keyof StartupMarks;

// Metro's bundle prelude records when the bundle started executing. It uses
// the same clock as performance.now() only where nativePerformanceNow exists
// (React Native); on web it falls back to Date.now(), so it's left out there.
declare const __BUNDLE_START_TIME__: number | undefined;
const nativeClock =
  typeof (globalThis as { nativePerformanceNow?: unknown })
    .nativePerformanceNow === "function";

export const startupMarks: StartupMarks = {
  bundleStart:
    nativeClock && typeof __BUNDLE_START_TIME__ === "number"
      ? __BUNDLE_START_TIME__
      : undefined,
};

/** Records a milestone the first time it's reached; later calls are no-ops. */
export function markStartup(mark: StartupMark): void {
  startupMarks[mark] ??= performance.now();
}
