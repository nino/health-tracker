// The `app_startup` event: how long a cold start took, split into phases, so
// slow launches on real devices can be explained. Durations plus whether iOS
// prewarmed the launch — nothing about the user's data.

import type { NativeLaunchTimes } from "../../modules/launch-timing";

/** Startup milestones on the performance.now() clock (see
 * src/app/startupMarks.ts). Any of them may be missing. */
export type StartupMarks = {
  bundleStart?: number;
  entry?: number;
  storePrimed?: number;
  firstLayout?: number;
};

/** What iOS knows about the launch (modules/launch-timing): Unix epoch
 * milliseconds for process start, main start and first content, and
 * whether iOS prewarmed the process. */
export type NativeLaunch = NativeLaunchTimes;

export type StartupEvent = {
  name: "app_startup";
  /** 2: store_ms counts from the entry file (inline requires); native
   * phases. Builds before it sent modules_ms and a shorter store_ms. */
  schema: 2;
  /** process start → main (dyld, static initializers); not when prewarmed */
  premain_ms?: number;
  /** main → JS bundle starts (app delegate, React Native and Expo setup) */
  native_ms?: number;
  /** bundle start → entry file (bundle prelude, React Native polyfills) */
  polyfills_ms?: number;
  /** entry file → the main screen's data read: the entry file's imports,
   * opening the database, migrating, the reads. With inline requires (see
   * metro.config.js) modules load on first use, so most of the app's module
   * evaluation lands here and in mount_ms. */
  store_ms?: number;
  /** → the main screen's first layout, as seen by the JS handler: surface
   * start, the first render and its commit, plus whatever else ran on the JS
   * thread before the layout event was handled. The paint is not included. */
  mount_ms?: number;
  /** bundle start → the main screen's first layout */
  js_total_ms?: number;
  /** bundle start → first content mounted on screen */
  js_to_content_ms?: number;
  /** launch (process start, or main when prewarmed) → first content */
  total_ms?: number;
  prewarmed?: boolean;
};

// Anything longer is not a launch the user waited through (the app was
// started in the background, say) and would only skew the numbers.
const MAX_SPAN_MS = 60_000;
// Pre-main work (dyld, static initializers) takes well under a second.
const PREWARM_GAP_MS = 5_000;

function span(from: number | undefined, to: number | undefined) {
  if (from === undefined || to === undefined) return undefined;
  const ms = to - from;
  if (!Number.isFinite(ms) || ms < 0 || ms > MAX_SPAN_MS) return undefined;
  return Math.round(ms);
}

/** `epochOffset` (Date.now() − performance.now(), sampled once) converts the
 * marks to epoch time, to line them up with `native`. */
export function startupEvent(
  marks: StartupMarks,
  native?: { launch: NativeLaunch; epochOffset: number },
): StartupEvent {
  const event: StartupEvent = { name: "app_startup", schema: 2 };
  const set = (
    key: Exclude<keyof StartupEvent, "name" | "schema" | "prewarmed">,
    ms?: number,
  ) => {
    if (ms !== undefined) event[key] = ms;
  };
  set("polyfills_ms", span(marks.bundleStart, marks.entry));
  set("store_ms", span(marks.entry, marks.storePrimed));
  set("mount_ms", span(marks.storePrimed, marks.firstLayout));
  set("js_total_ms", span(marks.bundleStart, marks.firstLayout));

  if (native) {
    const { launch, epochOffset } = native;
    const bundleStart =
      marks.bundleStart === undefined
        ? undefined
        : marks.bundleStart + epochOffset;
    // iOS's flag is undocumented; a process started seconds before main
    // was prewarmed too, whatever the flag says.
    const prewarmed =
      launch.prewarmed ||
      launch.mainStart - launch.processStart > PREWARM_GAP_MS;
    event.prewarmed = prewarmed;
    if (!prewarmed) {
      set("premain_ms", span(launch.processStart, launch.mainStart));
    }
    set("native_ms", span(launch.mainStart, bundleStart));
    set("js_to_content_ms", span(bundleStart, launch.contentAppeared));
    set(
      "total_ms",
      span(
        prewarmed ? launch.mainStart : launch.processStart,
        launch.contentAppeared,
      ),
    );
  }
  return event;
}
