// A health backend mirrors locally-stored entries into an OS health store.
// The local EntryStore is always the source of truth; backends are
// write-through targets plus a one-time history source for imports.

export type Capability = "read-write" | "none";

export interface BackendSample {
  backendId: string;
  value: number;
  date: Date;
}

export interface HealthBackend {
  /** Recorded in entries.backend, e.g. "healthkit". */
  name: string;
  capability(kind: string): Capability;
  requestAuthorization(): Promise<void>;
  /** Mirrors one entry; returns the backend's sample id. */
  write(kind: string, value: number, date: Date): Promise<string>;
  /** Full history for one kind, oldest first (used by the one-time import).
   * Returns [] when read access is denied — indistinguishable from no data. */
  history(kind: string): Promise<BackendSample[]>;
}

export const NULL_BACKEND: HealthBackend = {
  name: "null",
  capability: () => "none",
  requestAuthorization: () => Promise.resolve(),
  write: () => Promise.reject(new Error("null backend cannot write")),
  history: () => Promise.resolve([]),
};
