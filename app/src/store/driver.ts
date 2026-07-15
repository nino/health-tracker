// Minimal synchronous SQL driver interface. The app wires it to expo-sqlite
// (see expoSqliteDriver.ts); tests wire it to bun:sqlite — same SQL engine,
// so migrations and queries are exercised against real SQLite either way.

export type SqlParam = string | number | null;

export interface SqlDriver {
  /** Run a statement that returns nothing. */
  run(sql: string, params?: SqlParam[]): void;
  /** Run a query and return all rows as objects. */
  all<T>(sql: string, params?: SqlParam[]): T[];
}

export function getUserVersion(db: SqlDriver): number {
  const rows = db.all<{ user_version: number }>("PRAGMA user_version");
  return rows[0]?.user_version ?? 0;
}

export function setUserVersion(db: SqlDriver, version: number): void {
  // PRAGMA doesn't support bound parameters; version is always our integer.
  db.run(`PRAGMA user_version = ${version}`);
}
