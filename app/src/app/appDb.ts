import { randomUUID } from "expo-crypto";

import { EntryStore } from "../store";
import { type SqlDriver } from "../store/driver";
import { openAppDatabase } from "../store/expoSqliteDriver";

// The one database connection and store instance the UI works with — shared
// module-wide, but opened lazily on first use: on web (the PR-screenshot
// harness) a synchronous open at module scope would race expo-sqlite's wasm
// worker startup (see index.web.ts). First use is always post-mount, and the
// store still migrates before anything else touches the database.

let driver: SqlDriver | undefined;
function db(): SqlDriver {
  driver ??= openAppDatabase();
  return driver;
}

export const appDb: SqlDriver = {
  run: (sql, params) => db().run(sql, params),
  all: (sql, params) => db().all(sql, params),
};

let store: EntryStore | undefined;
export const entryStore: EntryStore = new Proxy({} as EntryStore, {
  get(_, prop) {
    store ??= new EntryStore(appDb, randomUUID);
    const value = store[prop as keyof EntryStore];
    return typeof value === "function" ? value.bind(store) : value;
  },
});
