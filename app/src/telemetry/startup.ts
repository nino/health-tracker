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

export type StartupEvent = {
  name: "app_startup";
  /** bundle start → entry file (bundle prelude, React Native polyfills) */
  polyfills_ms?: number;
  /** entry file → the app's modules evaluated */
  modules_ms?: number;
  /** open the database, migrate, read the main screen's data */
  store_ms?: number;
  /** → the main screen's first layout: surface start, the first render and
   * its commit (Fabric emits layout events before the native mount, so the
   * mount and the paint after it are not included) */
  mount_ms?: number;
  /** bundle start → the main screen's first layout */
  js_total_ms?: number;
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

export function startupEvent(marks: StartupMarks): StartupEvent {
  const event: StartupEvent = { name: "app_startup" };
  const set = (key: Exclude<keyof StartupEvent, "name">, ms?: number) => {
    if (ms !== undefined) event[key] = ms;
  };
  set("polyfills_ms", span(marks.bundleStart, marks.entry));
  set("modules_ms", span(marks.entry, marks.modulesLoaded));
  set("store_ms", span(marks.modulesLoaded, marks.storePrimed));
  set("mount_ms", span(marks.storePrimed, marks.firstLayout));
  set("js_total_ms", span(marks.bundleStart, marks.firstLayout));
  return event;
}
