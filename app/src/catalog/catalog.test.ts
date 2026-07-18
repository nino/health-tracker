import { describe, expect, test } from "bun:test";

import {
  DEFAULT_ENABLED_SYMPTOM_IDS,
  METRICS,
  metricById,
  moodRatingToValence,
  SYMPTOMS,
  symptomById,
  valenceToMoodRating,
  VALUE_KINDS,
} from "./index";

describe("symptom catalog", () => {
  test("has all 39 HealthKit symptom types", () => {
    expect(SYMPTOMS.length).toBe(39);
  });

  test("ids are unique HKCategoryTypeIdentifiers", () => {
    const ids = SYMPTOMS.map((s) => s.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const id of ids) {
      expect(id).toStartWith("HKCategoryTypeIdentifier");
    }
  });

  test("stays alphabetical by name so additions keep the Swift ordering", () => {
    const names = SYMPTOMS.map((s) => s.name);
    expect(names).toEqual([...names].sort((a, b) => a.localeCompare(b)));
  });

  test("default-enabled ids all exist in the catalog", () => {
    for (const id of DEFAULT_ENABLED_SYMPTOM_IDS) {
      expect(symptomById(id)).toBeDefined();
    }
  });

  test("the three special value kinds match the Swift catalog", () => {
    expect(
      symptomById("HKCategoryTypeIdentifierAppetiteChanges")?.valueKind.name,
    ).toBe("appetite");
    expect(
      symptomById("HKCategoryTypeIdentifierMoodChanges")?.valueKind.name,
    ).toBe("presence");
    expect(
      symptomById("HKCategoryTypeIdentifierSleepChanges")?.valueKind.name,
    ).toBe("presence");
    const others = SYMPTOMS.filter(
      (s) =>
        ![
          "HKCategoryTypeIdentifierAppetiteChanges",
          "HKCategoryTypeIdentifierMoodChanges",
          "HKCategoryTypeIdentifierSleepChanges",
        ].includes(s.id),
    );
    for (const s of others) {
      expect(s.valueKind.name).toBe("severity");
    }
  });
});

describe("value kinds (raw values verified against HKCategoryValues.h)", () => {
  test("severity options carry HKCategoryValueSeverity raw values", () => {
    expect(VALUE_KINDS.severity.options.map((o) => o.value)).toEqual([
      1, 0, 2, 3, 4,
    ]);
    // "Present" maps to Unspecified (0), not a presence value.
    expect(VALUE_KINDS.severity.options[1].label).toBe("Present");
  });

  test("presence options carry HKCategoryValuePresence raw values", () => {
    expect(VALUE_KINDS.presence.options.map((o) => o.value)).toEqual([1, 0]);
  });

  test("appetite options carry HKCategoryValueAppetiteChanges raw values", () => {
    expect(VALUE_KINDS.appetite.options.map((o) => o.value)).toEqual([1, 2, 3]);
  });
});

describe("metrics", () => {
  test("mood is 1-10, stress/anxiety are 0-10", () => {
    expect(metricById("mood")?.min).toBe(1);
    expect(metricById("stress")?.min).toBe(0);
    expect(metricById("anxiety")?.min).toBe(0);
    for (const m of METRICS) {
      expect(m.max).toBe(10);
    }
  });

  test("valence mapping is linear with 5.5 neutral and round-trips", () => {
    expect(moodRatingToValence(1)).toBe(-1);
    expect(moodRatingToValence(10)).toBe(1);
    expect(moodRatingToValence(5.5)).toBe(0);
    for (let rating = 1; rating <= 10; rating++) {
      expect(valenceToMoodRating(moodRatingToValence(rating))).toBe(rating);
    }
  });

  test("describe covers the whole range", () => {
    expect(metricById("mood")?.describe(1)).toBe("Very Negative");
    expect(metricById("mood")?.describe(10)).toBe("Very Positive");
    expect(metricById("stress")?.describe(0)).toBe("None");
    expect(metricById("stress")?.describe(10)).toBe("Extreme");
  });
});
