import type { RecordedLocation } from "../../modules/location-tracking/src/ExpoLocationTracking.types";
import { toLocalISOString } from "../lib/dates";
import { type SqlDriver } from "./driver";

// Opt-in background location (issue #6): the places the phone stayed at and
// the larger moves between them, as recorded by modules/location-tracking.
// Stored and exported only — nothing reads them back into the UI yet, they
// never mirror to a health backend, and they never go into an error report.

export type LocationKind = "visit" | "move";

export interface StoredLocation {
  id: string;
  kind: LocationKind;
  latitude: number;
  longitude: number;
  /** Horizontal accuracy in metres. */
  accuracy: number;
  /** A visit's arrival (or, when unknown, its departure or the time it was
   * reported); a move's fix time. */
  date: Date;
  /** Visits only; null when iOS doesn't know it (yet). */
  arrival: Date | null;
  departure: Date | null;
}

interface LocationRow {
  id: string;
  kind: string;
  latitude: number;
  longitude: number;
  accuracy: number;
  date: string;
  date_unix_ms: number;
  arrival_unix_ms: number | null;
  departure_unix_ms: number | null;
}

function rowToLocation(row: LocationRow): StoredLocation {
  return {
    id: row.id,
    kind: row.kind as LocationKind,
    latitude: row.latitude,
    longitude: row.longitude,
    accuracy: row.accuracy,
    date: new Date(row.date_unix_ms),
    arrival:
      row.arrival_unix_ms === null ? null : new Date(row.arrival_unix_ms),
    departure:
      row.departure_unix_ms === null ? null : new Date(row.departure_unix_ms),
  };
}

function insert(
  db: SqlDriver,
  location: {
    id: string;
    kind: LocationKind;
    latitude: number;
    longitude: number;
    accuracy: number;
    dateMs: number;
    arrivalMs: number | null;
    departureMs: number | null;
  },
): void {
  db.run(
    `INSERT OR IGNORE INTO locations
       (id, kind, latitude, longitude, accuracy, date, date_unix_ms,
        arrival_unix_ms, departure_unix_ms)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      location.id,
      location.kind,
      location.latitude,
      location.longitude,
      location.accuracy,
      toLocalISOString(new Date(location.dateMs)),
      location.dateMs,
      location.arrivalMs,
      location.departureMs,
    ],
  );
}

function isUsable(record: RecordedLocation): boolean {
  return (
    typeof record.id === "string" &&
    record.id !== "" &&
    (record.kind === "visit" || record.kind === "move") &&
    Number.isFinite(record.latitude) &&
    Number.isFinite(record.longitude) &&
    Number.isFinite(record.accuracy) &&
    Number.isFinite(record.timestamp)
  );
}

// Times are kept to the second, the precision of the export's ISO strings:
// a visit restored from an export must still match the arrival time in its
// later departure report.
function wholeSecond(ms: number | undefined): number | null {
  return ms === undefined || !Number.isFinite(ms)
    ? null
    : Math.floor(ms / 1000) * 1000;
}

/** Stores records drained from the native buffer; returns how many rows were
 * added. Safe to repeat with the same records (a drain that died before the
 * buffer was cleared is simply replayed): moves are keyed by id, visits by
 * their arrival time. iOS reports a visit on arrival and again on departure,
 * and the second report completes the first one's row instead of adding
 * another. Records that aren't usable are skipped. */
export function saveRecordedLocations(
  db: SqlDriver,
  records: RecordedLocation[],
): number {
  const before = countLocations(db);
  db.run("BEGIN");
  try {
    for (const record of records) {
      if (!isUsable(record)) continue;
      const arrivalMs =
        record.kind === "visit" ? wholeSecond(record.arrival) : null;
      const departureMs =
        record.kind === "visit" ? wholeSecond(record.departure) : null;
      if (arrivalMs !== null) {
        const known = db.all<{ id: string; departure_unix_ms: number | null }>(
          `SELECT id, departure_unix_ms FROM locations
           WHERE kind = 'visit' AND arrival_unix_ms = ?`,
          [arrivalMs],
        )[0];
        if (known) {
          if (known.departure_unix_ms === null && departureMs !== null) {
            // The departure report carries the visit's final position.
            db.run(
              `UPDATE locations
               SET departure_unix_ms = ?, latitude = ?, longitude = ?, accuracy = ?
               WHERE id = ?`,
              [
                departureMs,
                record.latitude,
                record.longitude,
                record.accuracy,
                known.id,
              ],
            );
          }
          continue;
        }
      }
      insert(db, {
        id: record.id,
        kind: record.kind,
        latitude: record.latitude,
        longitude: record.longitude,
        accuracy: record.accuracy,
        dateMs: arrivalMs ?? departureMs ?? wholeSecond(record.timestamp)!,
        arrivalMs,
        departureMs,
      });
    }
    db.run("COMMIT");
  } catch (error) {
    db.run("ROLLBACK");
    throw error;
  }
  return countLocations(db) - before;
}

/** Oldest first. */
export function listLocations(db: SqlDriver): StoredLocation[] {
  return db
    .all<LocationRow>(`SELECT * FROM locations ORDER BY date_unix_ms`)
    .map(rowToLocation);
}

export function countLocations(db: SqlDriver): number {
  return db.all<{ n: number }>(`SELECT COUNT(*) AS n FROM locations`)[0].n;
}

/** A location as it appears in the JSON export. */
export interface ExportedLocation {
  id: string;
  kind: LocationKind;
  latitude: number;
  longitude: number;
  accuracy: number;
  date: string;
  arrival?: string;
  departure?: string;
}

export function exportLocations(db: SqlDriver): ExportedLocation[] {
  return db
    .all<LocationRow>(`SELECT * FROM locations ORDER BY date_unix_ms`)
    .map((row) => ({
      id: row.id,
      kind: row.kind as LocationKind,
      latitude: row.latitude,
      longitude: row.longitude,
      accuracy: row.accuracy,
      date: row.date,
      ...(row.arrival_unix_ms === null
        ? {}
        : { arrival: toLocalISOString(new Date(row.arrival_unix_ms)) }),
      ...(row.departure_unix_ms === null
        ? {}
        : { departure: toLocalISOString(new Date(row.departure_unix_ms)) }),
    }));
}

/** Restores locations from an export file (already validated by
 * parseExport); one already on this device, by id, is left alone. Returns
 * how many were added. */
export function importLocations(
  db: SqlDriver,
  locations: StoredLocation[],
): number {
  const before = countLocations(db);
  // One transaction: years of recording are thousands of rows.
  db.run("BEGIN");
  try {
    for (const location of locations) {
      insert(db, {
        id: location.id,
        kind: location.kind,
        latitude: location.latitude,
        longitude: location.longitude,
        accuracy: location.accuracy,
        dateMs: location.date.getTime(),
        arrivalMs: location.arrival?.getTime() ?? null,
        departureMs: location.departure?.getTime() ?? null,
      });
    }
    db.run("COMMIT");
  } catch (error) {
    db.run("ROLLBACK");
    throw error;
  }
  return countLocations(db) - before;
}
