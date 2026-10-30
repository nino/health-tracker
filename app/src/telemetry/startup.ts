// The `app_startup` event: how long a cold start took, split into phases, so
// slow launches on real devices can be explained. Only durations — nothing
// about the user's data.

/** Startup milestones on the performance.now() clock (see
 * src/app/startupMarks.ts). Any of them may be missing. */
export type StartupMarks = {
  bundleStart?: number;
  entry?: number;
  modulesLoaded?: number;
  storePrimed?: number;
  firstLayout?: number;
};

/** What iOS knows about the launch, as Unix epoch milliseconds (from
 * modules/launch-timing). `mainStart` is when the app's own code began
 * running. On a prewarmed launch iOS starts the process minutes or hours
 * before the user opens the app, so durations count from `mainStart`. */
export type NativeLaunch = {
  processStart: number;
  mainStart: number;
  prewarmed: boolean;
  /** React Native mounted its first content; the next frame shows it */
  contentAppeared?: number;
};

export type StartupEvent = {
  name: "app_startup";
  /** process start → main (dyld, static initializers); not when prewarmed */
  premain_ms?: number;
  /** main → JS bundle starts (app delegate, React Native and Expo setup) */
  native_ms?: number;
  /** bundle start → entry file (bundle prelude, React Native polyfills) */
  polyfills_ms?: number;
  /** entry file → its imports evaluated. With inline requires (see
   * metro.config.js) most modules load on first use instead, so their cost
   * lands in store_ms and mount_ms and this is close to zero. */
  modules_ms?: number;
  /** open the database, migrate, read the main screen's data */
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
  const event: StartupEvent = { name: "app_startup" };
  const set = (
    key: Exclude<keyof StartupEvent, "name" | "prewarmed">,
    ms?: number,
  ) => {
    if (ms !== undefined) event[key] = ms;
  };
  set("polyfills_ms", span(marks.bundleStart, marks.entry));
  set("modules_ms", span(marks.entry, marks.modulesLoaded));
  set("store_ms", span(marks.modulesLoaded, marks.storePrimed));
  set("mount_ms", span(marks.storePrimed, marks.firstLayout));
  set("js_total_ms", span(marks.bundleStart, marks.firstLayout));

  if (native) {
    const { launch, epochOffset } = native;
    const bundleStart =
      marks.bundleStart === undefined
        ? undefined
        : marks.bundleStart + epochOffset;
    event.prewarmed = launch.prewarmed;
    if (!launch.prewarmed) {
      set("premain_ms", span(launch.processStart, launch.mainStart));
    }
    set("native_ms", span(launch.mainStart, bundleStart));
    set("js_to_content_ms", span(bundleStart, launch.contentAppeared));
    set(
      "total_ms",
      span(
        launch.prewarmed ? launch.mainStart : launch.processStart,
        launch.contentAppeared,
      ),
    );
  }
  return event;
}
