import { parseISOString, toLocalISOString } from "../lib/dates";
import { type SqlDriver } from "./driver";
import { migrate } from "./migrations";

// `kind` is either a MetricId ("mood") or a symptom id
// ("HKCategoryTypeIdentifierHeadache").
export interface Entry {
  id: string;
  kind: string;
  value: number;
  /** The user-set sample date (may be backdated). */
  date: Date;
  /** When the entry was actually saved — lets analysis down-weight fuzzy
   * backdated entries. */
  loggedAt: Date;
  /** Where this entry was mirrored ("healthkit"), if anywhere. */
  backend: string | null;
  /** The backend's sample id, for dedup and future deletion support. */
  backendId: string | null;
  backendSyncedAt: Date | null;
}

interface EntryRow {
  id: string;
  kind: string;
  value: number;
  date: string;
  logged_at: string;
  backend: string | null;
  backend_id: string | null;
  backend_synced_at: string | null;
}

function rowToEntry(row: EntryRow): Entry {
  return {
    id: row.id,
    kind: row.kind,
    value: row.value,
    date: parseISOString(row.date),
    loggedAt: parseISOString(row.logged_at),
    backend: row.backend,
    backendId: row.backend_id,
    backendSyncedAt:
      row.backend_synced_at === null
        ? null
        : parseISOString(row.backend_synced_at),
  };
}

// Comparison uses a 2s window, not exact equality, because the Swift app's
// dual writes and a HealthKit backfill of the same entry can differ by the
// save round-trip time.
export const IMPORT_DEDUP_WINDOW_MS = 2000;

// The source of truth for all tracked data. Writes are local-first: callers
// insert here synchronously and mirror to a health backend afterwards
// (markSynced records the outcome).
export class EntryStore {
  private db: SqlDriver;
  private newId: () => string;

  constructor(db: SqlDriver, newId: () => string) {
    this.db = db;
    this.newId = newId;
    migrate(db);
  }

  add(
    kind: string,
    value: number,
    date: Date,
    loggedAt: Date = new Date(),
  ): Entry {
    const entry: Entry = {
      id: this.newId(),
      kind,
      value,
      date,
      loggedAt,
      backend: null,
      backendId: null,
      backendSyncedAt: null,
    };
    this.db.run(
      `INSERT INTO entries (id, kind, value, date, date_unix_ms, logged_at)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [
        entry.id,
        entry.kind,
        entry.value,
        toLocalISOString(entry.date),
        entry.date.getTime(),
        toLocalISOString(entry.loggedAt),
      ],
    );
    return entry;
  }

  markSynced(
    id: string,
    backend: string,
    backendId: string,
    at: Date = new Date(),
  ): void {
    this.db.run(
      `UPDATE entries SET backend = ?, backend_id = ?, backend_synced_at = ? WHERE id = ?`,
      [backend, backendId, toLocalISOString(at), id],
    );
  }

  /** Entries that should exist in a backend but were never mirrored. */
  unsynced(kinds: string[]): Entry[] {
    if (kinds.length === 0) return [];
    const placeholders = kinds.map(() => "?").join(", ");
    return this.db
      .all<EntryRow>(
        `SELECT * FROM entries
         WHERE backend IS NULL AND kind IN (${placeholders})
         ORDER BY date_unix_ms`,
        kinds,
      )
      .map(rowToEntry);
  }

  byKind(kind: string): Entry[] {
    return this.db
      .all<EntryRow>(
        `SELECT * FROM entries WHERE kind = ? ORDER BY date_unix_ms`,
        [kind],
      )
      .map(rowToEntry);
  }

  /** Most recent user-set date per kind (backdating-aware, like the Swift
   * app's endDate-sorted recency queries). */
  lastDates(): Map<string, Date> {
    const rows = this.db.all<{ kind: string; last: number }>(
      `SELECT kind, MAX(date_unix_ms) AS last FROM entries GROUP BY kind`,
    );
    return new Map(rows.map((r) => [r.kind, new Date(r.last)]));
  }

  count(): number {
    return this.db.all<{ n: number }>(`SELECT COUNT(*) AS n FROM entries`)[0].n;
  }

  /** Import entries from elsewhere (Swift-app JSON, HealthKit backfill),
   * skipping any within two seconds of an existing same-kind entry so
   * dual-written data doesn't duplicate. Returns how many were added. */
  import(
    entries: {
      kind: string;
      value: number;
      date: Date;
      loggedAt?: Date;
      backend?: string;
      backendId?: string;
    }[],
  ): number {
    let added = 0;
    for (const candidate of entries) {
      const nearby = this.db.all<{ n: number }>(
        `SELECT COUNT(*) AS n FROM entries
         WHERE kind = ? AND date_unix_ms BETWEEN ? AND ?`,
        [
          candidate.kind,
          candidate.date.getTime() - IMPORT_DEDUP_WINDOW_MS,
          candidate.date.getTime() + IMPORT_DEDUP_WINDOW_MS,
        ],
      )[0].n;
      if (nearby > 0) continue;
      this.db.run(
        `INSERT INTO entries (id, kind, value, date, date_unix_ms, logged_at, backend, backend_id, backend_synced_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          this.newId(),
          candidate.kind,
          candidate.value,
          toLocalISOString(candidate.date),
          candidate.date.getTime(),
          // Original logging time is often unrecoverable for imports; the
          // sample date is the established convention (Swift mood import).
          toLocalISOString(candidate.loggedAt ?? candidate.date),
          candidate.backend ?? null,
          candidate.backendId ?? null,
          candidate.backend ? toLocalISOString(candidate.date) : null,
        ],
      );
      added++;
    }
    return added;
  }

  /** JSON export — a superset of the Swift app's metric-log.json format
   * (kind/rating/date/loggedAt), so existing tooling keeps working. */
  exportJSON(now: Date = new Date()): string {
    const entries = this.db
      .all<EntryRow>(`SELECT * FROM entries ORDER BY date_unix_ms`)
      .map((row) => ({
        id: row.id,
        kind: row.kind,
        rating: row.value,
        date: row.date,
        loggedAt: row.logged_at,
      }));
    return JSON.stringify(
      { exportedAt: toLocalISOString(now), entries },
      null,
      2,
    );
  }
}
