import { openDatabaseSync, type SQLiteDatabase } from "expo-sqlite";

import { type SqlDriver, type SqlParam } from "./driver";

// The app-side driver. Untestable by `bun test` (native module) — keep it a
// thin adapter with no logic; everything interesting lives behind SqlDriver.
class ExpoSqliteDriver implements SqlDriver {
  constructor(private db: SQLiteDatabase) {}

  run(sql: string, params: SqlParam[] = []): void {
    this.db.runSync(sql, params);
  }

  all<T>(sql: string, params: SqlParam[] = []): T[] {
    return this.db.getAllSync<T>(sql, params);
  }
}

export function openAppDatabase(name = "health-tracker.db"): SqlDriver {
  return new ExpoSqliteDriver(openDatabaseSync(name));
}
