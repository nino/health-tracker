export type LocationAuthorization =
  "notDetermined" | "restricted" | "denied" | "whenInUse" | "always";

/** One record from the native buffer. Times are Unix epoch milliseconds. */
export interface RecordedLocation {
  id: string;
  /** "visit": a place the device stayed at, reported on arrival and again
   * (with the same arrival) on departure. "move": a fix after a significant
   * change of position (roughly 500 m or more). */
  kind: "visit" | "move";
  latitude: number;
  longitude: number;
  /** Horizontal accuracy in metres. */
  accuracy: number;
  /** A move's fix time; for a visit, when it was reported. */
  timestamp: number;
  /** Visits only; missing when iOS doesn't know it (yet). */
  arrival?: number;
  departure?: number;
}
