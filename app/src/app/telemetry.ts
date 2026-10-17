import Constants from "expo-constants";
import { randomUUID } from "expo-crypto";
import { Platform } from "react-native";

import {
  discardPendingCrashReport,
  getErrorReportingId,
  savePendingCrashReport,
  takePendingCrashReport,
} from "../store/settings";
import { createTelemetry, telemetryConfig } from "../telemetry/client";
import { type ErrorContext } from "../telemetry/events";
import { createRateLimiter } from "../telemetry/rateLimit";
import { appDb } from "./appDb";

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

export const telemetry = createTelemetry({
  config: telemetryConfig(posthogExtra?.apiKey, posthogExtra?.host),
  distinctId: () => getErrorReportingId(appDb),
  common: {
    // One PostHog project serves several apps; this tells them apart.
    $app_name: "health-tracker",
    $app_version: Constants.expoConfig?.version ?? "unknown",
    $os: OS_NAMES[Platform.OS] ?? Platform.OS,
    $os_version: String(Platform.Version),
  },
  send: async (url, body) => {
    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body,
    });
    // A rejected event must not count as sent (a kept crash report would
    // be discarded).
    if (!response.ok) throw new Error(`PostHog: HTTP ${response.status}`);
  },
  limiter: createRateLimiter(),
  contextLimiter: () => createRateLimiter(MAX_EVENTS_PER_CONTEXT),
  now: () => new Date(),
  newId: randomUUID,
  pending: {
    save: (body) => savePendingCrashReport(appDb, body),
    take: () => takePendingCrashReport(appDb),
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
