import { describe, expect, test } from "bun:test";

import { DEFAULT_ENABLED_SYMPTOM_IDS } from "../catalog";
import { migrate } from "./migrations";
import {
  getEnabledSymptomIds,
  getSetting,
  setEnabledSymptomIds,
  setSetting,
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
});
