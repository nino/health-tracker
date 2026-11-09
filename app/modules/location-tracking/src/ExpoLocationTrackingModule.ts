import { NativeModule, requireOptionalNativeModule } from "expo";

import type {
  LocationAuthorization,
  RecordedLocation,
} from "./ExpoLocationTracking.types";

declare class ExpoLocationTrackingModule extends NativeModule {
  /** Whether the user switched recording on (it survives relaunches). */
  isEnabled(): boolean;
  authorization(): Promise<LocationAuthorization>;
  /** Asks for location access if it was never asked, then switches
   * recording on unless access is denied or restricted. Resolves with the
   * resulting authorization. */
  enable(): Promise<LocationAuthorization>;
  /** Stops recording. Records already buffered stay until discarded. */
  disable(): Promise<void>;
  /** Everything recorded since the last discard, oldest first. */
  pending(): Promise<RecordedLocation[]>;
  /** Drops these records from the buffer, once they are stored. */
  discard(ids: string[]): Promise<void>;
}

// Apple platforms only; elsewhere this is null.
export const LocationTracking =
  requireOptionalNativeModule<ExpoLocationTrackingModule>(
    "ExpoLocationTracking",
  );
