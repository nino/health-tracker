import { Database } from "bun:sqlite";

import { type SqlDriver, type SqlParam } from "./driver";

// Test-only driver on bun's built-in SQLite — the same engine expo-sqlite
// wraps, so schema and queries are exercised for real. Never import this
// from app code.
export function memoryDriver(): SqlDriver {
  const db = new Database(":memory:");
  return {
    run(sql: string, params: SqlParam[] = []): void {
      db.prepare(sql).run(...params);
    },
    all<T>(sql: string, params: SqlParam[] = []): T[] {
      return db.prepare(sql).all(...params) as T[];
    },
  };
}

let counter = 0;
/** Deterministic id generator for tests. */
export function sequentialIds(): () => string {
  return () => `test-id-${++counter}`;
}
