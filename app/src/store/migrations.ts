import { getUserVersion, setUserVersion, type SqlDriver } from "./driver";

// Ordered, append-only migration list. PRAGMA user_version tracks the last
// applied index. Never edit or reorder shipped migrations — append instead.
// A failure throws and leaves user_version pointing at the last completed
// migration; it must never fall back to an empty database (that was the
// silent-data-loss hazard in the Swift MetricStore).
const MIGRATIONS: string[][] = [
  // v1: the unified entries table — symptoms and metrics alike.
  // date/logged_at are ISO 8601 with local UTC offset (export fidelity);
  // date_unix_ms exists because local-offset strings don't sort correctly
  // across DST transitions — ALL ordering and range queries use it.
  [
    `CREATE TABLE entries (
      id TEXT PRIMARY KEY,
      kind TEXT NOT NULL,
      value INTEGER NOT NULL,
      date TEXT NOT NULL,
      date_unix_ms INTEGER NOT NULL,
      logged_at TEXT NOT NULL,
      backend TEXT,
      backend_id TEXT,
      backend_synced_at TEXT
    )`,
    `CREATE INDEX idx_entries_kind_date ON entries(kind, date_unix_ms)`,
  ],
  // v2: key-value settings (the AppStorage equivalent) — enabled symptoms etc.
  [
    `CREATE TABLE settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    )`,
  ],
];

export const SCHEMA_VERSION = MIGRATIONS.length;

export function migrate(db: SqlDriver): void {
  const current = getUserVersion(db);
  if (current > SCHEMA_VERSION) {
    // Database written by a newer app; refuse to touch it.
    throw new Error(
      `Database schema v${current} is newer than this app understands (v${SCHEMA_VERSION})`,
    );
  }
  for (let v = current; v < MIGRATIONS.length; v++) {
    for (const statement of MIGRATIONS[v]) {
      db.run(statement);
    }
    setUserVersion(db, v + 1);
  }
}
