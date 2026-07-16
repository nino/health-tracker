import { DEFAULT_ENABLED_SYMPTOM_IDS } from "../catalog";
import { type SqlDriver } from "./driver";

// Key-value settings on the same database (the AppStorage equivalent).

export function getSetting(db: SqlDriver, key: string): string | null {
  const rows = db.all<{ value: string }>(
    `SELECT value FROM settings WHERE key = ?`,
    [key],
  );
  return rows[0]?.value ?? null;
}

export function setSetting(db: SqlDriver, key: string, value: string): void {
  db.run(
    `INSERT INTO settings (key, value) VALUES (?, ?)
     ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
    [key, value],
  );
}

const ENABLED_KEY = "enabledSymptomIDs";

// Same codec as the Swift app's AppStorage key: comma-joined, sorted.
export function getEnabledSymptomIds(db: SqlDriver): string[] {
  const raw = getSetting(db, ENABLED_KEY);
  if (raw === null) return [...DEFAULT_ENABLED_SYMPTOM_IDS].sort();
  if (raw === "") return [];
  return raw.split(",");
}

export function setEnabledSymptomIds(db: SqlDriver, ids: string[]): void {
  setSetting(db, ENABLED_KEY, [...ids].sort().join(","));
}
