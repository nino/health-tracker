import { LocationTracking } from "../../modules/location-tracking";
import { saveRecordedLocations } from "../store/locations";
import { appDb } from "./appDb";
import { reportError } from "./telemetry";

// Opt-in background location (Settings → "Record location", iOS only for
// now). The native module records into its own buffer without running any
// JavaScript; this moves the buffer into the store whenever the app runs.

let draining: Promise<void> | null = null;

async function drain(): Promise<void> {
  if (!LocationTracking) return;
  const pending = await LocationTracking.pending();
  if (pending.length === 0) return;
  // Stored first, discarded second: dying in between replays the batch,
  // which saveRecordedLocations tolerates.
  saveRecordedLocations(appDb, pending);
  await LocationTracking.discard(pending.map((record) => record.id));
}

/** Moves whatever the native recorder buffered into the store. Called on
 * launch and on every return to the foreground; one drain at a time. Runs
 * whether or not recording is on, so records from before it was switched
 * off still arrive. */
export function drainLocations(): Promise<void> {
  draining ??= drain()
    .catch((error) => reportError(error, "location"))
    .finally(() => {
      draining = null;
    });
  return draining;
}

export interface LocationTrackingState {
  enabled: boolean;
  /** Recording is on but iOS only delivers while the app is in use. */
  foregroundOnly: boolean;
  /** Location access is off for the app (or the whole device). */
  blocked: boolean;
}

/** null where the platform has no recorder (Android, web). */
export async function readLocationTracking(): Promise<LocationTrackingState | null> {
  if (!LocationTracking) return null;
  const authorization = await LocationTracking.authorization();
  // The stored switch alone isn't enough: without access (never asked on
  // this phone after a restore, or since refused) nothing is recorded, and
  // showing the switch off lets the user turn it on again to be asked.
  const enabled =
    LocationTracking.isEnabled() &&
    (authorization === "always" || authorization === "whenInUse");
  return {
    enabled,
    foregroundOnly: enabled && authorization === "whenInUse",
    blocked: authorization === "denied" || authorization === "restricted",
  };
}

export async function setLocationTracking(on: boolean): Promise<void> {
  if (!LocationTracking) return;
  if (on) {
    await LocationTracking.enable();
  } else {
    await LocationTracking.disable();
    await drainLocations();
  }
}
