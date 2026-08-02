import { describe, expect, test } from "bun:test";

import { type CustomItem } from "../store/customItems";
import { customItemToMetric, customItemToSymptom } from "./custom";
import { VALUE_KINDS } from "./valueKind";

function item(overrides: Partial<CustomItem>): CustomItem {
  return {
    id: "abc",
    name: "Tinnitus",
    icon: "🔔",
    kind: "severity",
    highIsGood: false,
    createdAt: new Date("2026-08-01T10:00:00+02:00"),
    archivedAt: null,
    ...overrides,
  };
}

describe("custom item adapters", () => {
  test("severity items adapt to Symptom with the shared severity options", () => {
    const symptom = customItemToSymptom(item({}));
    expect(symptom.id).toBe("custom:abc");
    expect(symptom.valueKind).toBe(VALUE_KINDS.severity);
    expect(symptom.healthConnectType).toBeNull();
  });

  test("rating items adapt to a 1-10 Metric with a full describe range", () => {
    const metric = customItemToMetric(item({ kind: "rating", name: "Energy" }));
    expect(metric.id).toBe("custom:abc");
    expect(metric.min).toBe(1);
    expect(metric.max).toBe(10);
    for (let value = 1; value <= 10; value++) {
      expect(metric.describe(value)).not.toBe("");
    }
    expect(metric.describe(1)).toBe("Very Low");
    expect(metric.describe(10)).toBe("Very High");
  });
});
