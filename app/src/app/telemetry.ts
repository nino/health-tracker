import Constants from "expo-constants";
import { randomUUID } from "expo-crypto";
import { Platform } from "react-native";

import {
  discardPendingCrashReport,
  getErrorReportingId,
  savePendingCrashReport,
  peekPendingCrashReport,
} from "../store/settings";
import { createTelemetry, telemetryConfig } from "../telemetry/client";
import { type ErrorContext } from "../telemetry/events";
import { createRateLimiter } from "../telemetry/rateLimit";
import { LaunchTiming } from "../../modules/launch-timing";
import { startupEvent } from "../telemetry/startup";
import { appDb } from "./appDb";
import { markStartup, startupMarks } from "./startupMarks";

// Opt-in error reports (Settings → "Send error reports") to PostHog. The
// key and host are app config (`expo.extra.posthog` in app.json; a phc_ key
// is public by design). Without them, this is a no-op. Everything that
// decides what is sent lives in src/telemetry/ and is unit-tested.

const MAX_EVENTS_PER_CONTEXT = 10; // an hour, within the overall 30

const OS_NAMES: Partial<Record<typeof Platform.OS, string>> = {
  ios: "iOS",
  android: "Android",
  web: "Web",
};

const posthogExtra = Constants.expoConfig?.extra?.posthog as
  { apiKey?: string; host?: string } | undefined;

const config = telemetryConfig(posthogExtra?.apiKey, posthogExtra?.host);

// Sends fail silently in release builds; in development, say why, so a
// missing config (Metro started before app.json changed) or a rejected
// request shows up in the console.
if (__DEV__ && !config) {
  console.warn("Error reports are off: no PostHog key/host in expo.extra");
}

export const telemetry = createTelemetry({
  config,
  distinctId: () => getErrorReportingId(appDb),
  common: {
    // One PostHog project serves several apps; this tells them apart.
    $app_name: "health-tracker",
    $app_version: Constants.expoConfig?.version ?? "unknown",
    $os: OS_NAMES[Platform.OS] ?? Platform.OS,
    $os_version: String(Platform.Version),
  },
  send: async (url, body) => {
    try {
      const response = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body,
      });
      // A rejected event must not count as sent (a kept crash report would
      // be discarded).
      if (!response.ok) throw new Error(`PostHog: HTTP ${response.status}`);
      if (__DEV__) console.warn("Error report sent");
    } catch (error) {
      if (__DEV__) console.warn("Error report not sent:", error);
      throw error;
    }
  },
  limiter: createRateLimiter(),
  contextLimiter: () => createRateLimiter(MAX_EVENTS_PER_CONTEXT),
  now: () => new Date(),
  newId: randomUUID,
  pending: {
    save: (body) => savePendingCrashReport(appDb, body),
    peek: () => peekPendingCrashReport(appDb),
    discard: (body) => discardPendingCrashReport(appDb, body),
  },
});

type HermesRejectionTracker = {
  enablePromiseRejectionTracker?: (options: {
    allRejections: boolean;
    onUnhandled: (id: number, rejection: unknown) => void;
    onHandled: (id: number) => void;
  }) => void;
};

/** Report uncaught errors and unhandled promise rejections. Call once, at
 * startup; it reads no settings until an error actually happens. */
export function installErrorHandlers(): void {
  if (typeof ErrorUtils !== "undefined") {
    const previous = ErrorUtils.getGlobalHandler();
    ErrorUtils.setGlobalHandler((error, isFatal) => {
      telemetry.captureError(error, "uncaught", {
        handled: false,
        fatal: isFatal === true,
      });
      previous(error, isFatal);
    });
  }
  // React Native installs its own tracker (the LogBox warning) in dev
  // builds only, and enabling another would replace it; release builds
  // have none.
  const hermes = (globalThis as { HermesInternal?: HermesRejectionTracker })
    .HermesInternal;
  if (!__DEV__ && hermes?.enablePromiseRejectionTracker) {
    hermes.enablePromiseRejectionTracker({
      allRejections: true,
      onUnhandled: (_id, rejection) =>
        telemetry.captureError(rejection, "unhandled-rejection", {
          handled: false,
        }),
      onHandled: () => {},
    });
  }
}

export function reportError(error: unknown, context: ErrorContext): void {
  telemetry.captureError(error, context);
}

let startupReported = false;

/** Called on the main screen's first layout: marks it and sends the launch's
 * timing (`app_startup`, opt-in like everything else). Once per JS runtime,
 * i.e. per cold start, and never from development builds, whose launches
 * (an unoptimized bundle from Metro) would only skew the numbers. */
export function reportStartupOnFirstLayout(): void {
  if (startupReported || __DEV__) return;
  startupReported = true;
  markStartup("firstLayout");
  // Sent a moment later, so its settings read and request stay out of the
  // first frames.
  // By then iOS has also recorded when the first content appeared.
  setTimeout(() => {
    try {
      const launch = LaunchTiming?.launch() ?? null;
      const native = launch && {
        launch,
        epochOffset: Date.now() - performance.now(),
      };
      telemetry.capture(startupEvent(startupMarks, native ?? undefined));
    } catch {
      // Telemetry must never become the app's problem.
    }
  }, 1000);
}
