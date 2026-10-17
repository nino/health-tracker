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

export function deleteSetting(db: SqlDriver, key: string): void {
  db.run(`DELETE FROM settings WHERE key = ?`, [key]);
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

// Error reporting is opt-in, and the anonymous id is the opt-in: it exists
// only while reports are switched on, so there is no separate flag that
// could disagree with it. Opting out deletes the id and any crash report
// still waiting to be sent.
const ERROR_REPORTING_ID_KEY = "errorReportingId";
const PENDING_CRASH_REPORT_KEY = "pendingCrashReport";

export function getErrorReportingId(db: SqlDriver): string | null {
  return getSetting(db, ERROR_REPORTING_ID_KEY) || null;
}

export function optInToErrorReporting(db: SqlDriver, newId: string): void {
  if (getErrorReportingId(db) === null) {
    setSetting(db, ERROR_REPORTING_ID_KEY, newId);
  }
}

export function optOutOfErrorReporting(db: SqlDriver): void {
  deleteSetting(db, ERROR_REPORTING_ID_KEY);
  deleteSetting(db, PENDING_CRASH_REPORT_KEY);
}

export function savePendingCrashReport(db: SqlDriver, body: string): void {
  setSetting(db, PENDING_CRASH_REPORT_KEY, body);
}

/** The crash report kept from a previous launch. It stays until
 * `discardPendingCrashReport` removes it after a successful send. */
export function peekPendingCrashReport(db: SqlDriver): string | null {
  return getSetting(db, PENDING_CRASH_REPORT_KEY);
}

/** Delete the kept crash report only if it is still `body` (a newer one
 * may have replaced it while `body` was being sent). */
export function discardPendingCrashReport(db: SqlDriver, body: string): void {
  db.run(`DELETE FROM settings WHERE key = ? AND value = ?`, [
    PENDING_CRASH_REPORT_KEY,
    body,
  ]);
}
