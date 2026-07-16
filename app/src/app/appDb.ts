import { randomUUID } from "expo-crypto";

import { EntryStore } from "../store";
import { openAppDatabase } from "../store/expoSqliteDriver";

// The one database connection and store instance the UI works with.
// (Module-level so every screen shares it; the store migrates on creation.)
export const appDb = openAppDatabase();
export const entryStore = new EntryStore(appDb, randomUUID);
