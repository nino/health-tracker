import { describe, expect, test } from "bun:test";

import { DEFAULT_ENABLED_SYMPTOM_IDS } from "../catalog";
import { migrate } from "./migrations";
import {
  getEnabledSymptomIds,
  getErrorReportingId,
  getSetting,
  optInToErrorReporting,
  optOutOfErrorReporting,
  savePendingCrashReport,
  setEnabledSymptomIds,
  setSetting,
  takePendingCrashReport,
} from "./settings";
import { memoryDriver } from "./testDriver";

function freshDb() {
  const db = memoryDriver();
  migrate(db);
  return db;
}

describe("settings", () => {
  test("get/set round-trips and upserts", () => {
    const db = freshDb();
    expect(getSetting(db, "x")).toBeNull();
    setSetting(db, "x", "1");
    setSetting(db, "x", "2");
    expect(getSetting(db, "x")).toBe("2");
  });

  test("enabled symptoms default to the Swift app's six", () => {
    const ids = getEnabledSymptomIds(freshDb());
    expect(ids.length).toBe(6);
    expect([...ids].sort()).toEqual([...DEFAULT_ENABLED_SYMPTOM_IDS].sort());
  });

  test("enabled symptoms round-trip sorted, empty list stays empty", () => {
    const db = freshDb();
    setEnabledSymptomIds(db, [
      "HKCategoryTypeIdentifierNausea",
      "HKCategoryTypeIdentifierAcne",
    ]);
    expect(getEnabledSymptomIds(db)).toEqual([
      "HKCategoryTypeIdentifierAcne",
      "HKCategoryTypeIdentifierNausea",
    ]);
    // Explicitly-empty must not fall back to the defaults.
    setEnabledSymptomIds(db, []);
    expect(getEnabledSymptomIds(db)).toEqual([]);
  });

  test("error reporting is off by default; the id exists only while opted in", () => {
    const db = freshDb();
    expect(getErrorReportingId(db)).toBeNull();
    optInToErrorReporting(db, "id-1");
    expect(getErrorReportingId(db)).toBe("id-1");
    // Opting in again keeps the existing id.
    optInToErrorReporting(db, "id-2");
    expect(getErrorReportingId(db)).toBe("id-1");
    optOutOfErrorReporting(db);
    expect(getErrorReportingId(db)).toBeNull();
    expect(getSetting(db, "errorReportingId")).toBeNull();
  });

  test("a pending crash report is read once, and opting out discards it", () => {
    const db = freshDb();
    savePendingCrashReport(db, "{}");
    expect(takePendingCrashReport(db)).toBe("{}");
    expect(takePendingCrashReport(db)).toBeNull();
    savePendingCrashReport(db, "{}");
    optOutOfErrorReporting(db);
    expect(takePendingCrashReport(db)).toBeNull();
  });
});
