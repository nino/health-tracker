import Constants from "expo-constants";
import { randomUUID } from "expo-crypto";
import { Platform } from "react-native";

import {
  getErrorReportingId,
  savePendingCrashReport,
  takePendingCrashReport,
} from "../store/settings";
import { createTelemetry, telemetryConfig } from "../telemetry/client";
import { type ErrorContext } from "../telemetry/events";
import { createRateLimiter } from "../telemetry/rateLimit";
import { appDb } from "./appDb";

// Opt-in error reports (Settings → "Send error reports") to PostHog. The
// key and host are build-time config: EXPO_PUBLIC_POSTHOG_KEY and
// EXPO_PUBLIC_POSTHOG_HOST (EAS environment variables, or .env.local for a
// local build). Without either, this is a no-op. Everything that decides
// what is sent lives in src/telemetry/ and is unit-tested.

const OS_NAMES: Partial<Record<typeof Platform.OS, string>> = {
  ios: "iOS",
  android: "Android",
  web: "Web",
};

export const telemetry = createTelemetry({
  // Literal member access: Expo inlines EXPO_PUBLIC_* only when written so.
  config: telemetryConfig(
    process.env.EXPO_PUBLIC_POSTHOG_KEY,
    process.env.EXPO_PUBLIC_POSTHOG_HOST,
  ),
  distinctId: () => getErrorReportingId(appDb),
  common: {
    $app_version: Constants.expoConfig?.version ?? "unknown",
    $os: OS_NAMES[Platform.OS] ?? Platform.OS,
    $os_version: String(Platform.Version),
  },
  send: (url, body) =>
    fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body,
    }),
  limiter: createRateLimiter(),
  now: () => new Date(),
  newId: randomUUID,
  pending: {
    save: (body) => savePendingCrashReport(appDb, body),
    take: () => takePendingCrashReport(appDb),
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
