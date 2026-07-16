import { describe, expect, test } from "bun:test";

import { METRICS, SYMPTOMS, metricById, symptomById } from "../catalog";
import { parseISOString, toLocalISOString } from "../lib/dates";
import { EntryStore } from "./entryStore";
import { importEntriesFromJSON, parseExport } from "./swiftImport";
import { memoryDriver, sequentialIds } from "./testDriver";

// Seeded property tests — the permanent version of the one-off fuzzing from
// the 2026-07-16 adversarial review. Deterministic (mulberry32 with fixed
// seeds), so a failure is a reproducible counterexample, not flake.

function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function pick<T>(rnd: () => number, items: T[]): T {
  return items[Math.floor(rnd() * items.length)];
}

const ALL_KINDS = [...METRICS.map((m) => m.id), ...SYMPTOMS.map((s) => s.id)];

function isValidValueFor(kind: string, value: number): boolean {
  const metric = metricById(kind);
  if (metric) {
    return (
      Number.isInteger(value) && value >= metric.min && value <= metric.max
    );
  }
  const symptom = symptomById(kind);
  return (
    symptom !== undefined &&
    symptom.valueKind.options.some((o) => o.value === value)
  );
}

function randomValidEntry(rnd: () => number): Record<string, unknown> {
  const kind = pick(rnd, ALL_KINDS);
  const metric = metricById(kind);
  const value = metric
    ? metric.min + Math.floor(rnd() * (metric.max - metric.min + 1))
    : pick(rnd, symptomById(kind)!.valueKind.options).value;
  // 2000..2090, always day 01..28 so every date exists.
  const iso = `${2000 + Math.floor(rnd() * 90)}-${String(1 + Math.floor(rnd() * 12)).padStart(2, "0")}-${String(1 + Math.floor(rnd() * 28)).padStart(2, "0")}T${String(Math.floor(rnd() * 24)).padStart(2, "0")}:${String(Math.floor(rnd() * 60)).padStart(2, "0")}:${String(Math.floor(rnd() * 60)).padStart(2, "0")}Z`;
  return { kind, rating: value, date: iso, loggedAt: iso };
}

const GARBAGE_STRINGS = [
  "",
  "0",
  "2024",
  "12/31/2025",
  "Mar 5 2020",
  "2026-02-30T00:00:00Z",
  "+275760-09-13T00:00:00Z",
  "0001-01-01T00:00:00Z",
  "2026-07-12T09:41:00", // no offset
  "2026-13-01T00:00:00Z",
  "2026-07-12T25:00:00Z",
  "NaN",
  "null",
  "🤕",
  "'; DROP TABLE entries; --",
];

function mutate(
  rnd: () => number,
  entry: Record<string, unknown>,
): Record<string, unknown> {
  const mutated = { ...entry };
  const field = pick(rnd, ["kind", "rating", "date", "loggedAt"]);
  const mutation = Math.floor(rnd() * 6);
  switch (mutation) {
    case 0:
      delete mutated[field];
      break;
    case 1:
      mutated[field] = pick(rnd, GARBAGE_STRINGS);
      break;
    case 2:
      mutated[field] = pick(rnd, [
        null,
        true,
        [],
        {},
        1e300,
        -1e300,
        0.5,
        -1,
        999,
      ]);
      break;
    case 3:
      mutated.kind = pick(rnd, [
        "steps",
        "HKCategoryTypeIdentifierNotAThing",
        "MOOD",
        " mood",
      ]);
      break;
    case 4: {
      // Corrupt one character of a date string.
      const value = String(mutated[field]);
      const at = Math.floor(rnd() * Math.max(1, value.length));
      mutated[field] =
        value.slice(0, at) +
        pick(rnd, ["X", "9", "-", " "]) +
        value.slice(at + 1);
      break;
    }
    case 5:
      mutated.rating = Math.floor(rnd() * 2000) - 1000;
      break;
  }
  return mutated;
}

describe("fuzz: parseExport is total", () => {
  test("mutated inputs either throw Error or yield only valid entries", () => {
    const rnd = mulberry32(0xbeef);
    for (let i = 0; i < 2000; i++) {
      const entries = Array.from({ length: 1 + Math.floor(rnd() * 4) }, () => {
        const entry = randomValidEntry(rnd);
        return rnd() < 0.7 ? mutate(rnd, entry) : entry;
      });
      const json = JSON.stringify(rnd() < 0.8 ? { entries } : entries);
      let parsed;
      try {
        parsed = parseExport(json);
      } catch (error) {
        expect(error).toBeInstanceOf(Error);
        continue;
      }
      for (const entry of parsed.entries) {
        expect(isValidValueFor(entry.kind, entry.value)).toBe(true);
        expect(Number.isNaN(entry.date.getTime())).toBe(false);
        expect(entry.date.getFullYear()).toBeGreaterThanOrEqual(1970);
        expect(entry.date.getFullYear()).toBeLessThanOrEqual(2100);
        // Every accepted date must survive the store's serialization.
        expect(parseISOString(toLocalISOString(entry.date)).getTime()).toBe(
          Math.floor(entry.date.getTime() / 1000) * 1000,
        );
      }
    }
  });

  test("structurally hostile JSON never crashes unexpectedly", () => {
    const rnd = mulberry32(0xcafe);
    const hostile = [
      "null",
      "42",
      '"entries"',
      "[[[[[[]]]]]]",
      '{"entries": {}}',
      '{"entries": [null]}',
      '{"entries": [[]]}',
      `{"entries": [${'{"kind":"mood",'.repeat(50)}}]}`.slice(0, 200),
      '{"__proto__": {"polluted": true}, "entries": []}',
      JSON.stringify({ entries: [{ __proto__: { x: 1 }, kind: "mood" }] }),
    ];
    for (const json of hostile) {
      try {
        parseExport(json);
      } catch (error) {
        expect(error).toBeInstanceOf(Error);
      }
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect((Object.prototype as any).polluted).toBeUndefined();
    expect(rnd).toBeDefined();
  });
});

describe("fuzz: round-trips", () => {
  test("date serialization is identity at second precision across the range", () => {
    const rnd = mulberry32(0x5eed);
    const min = Date.UTC(1970, 0, 1);
    const max = Date.UTC(2100, 11, 31);
    for (let i = 0; i < 2000; i++) {
      const ms = Math.floor(min + rnd() * (max - min));
      const date = new Date(Math.floor(ms / 1000) * 1000);
      expect(parseISOString(toLocalISOString(date)).getTime()).toBe(
        date.getTime(),
      );
    }
  });

  test("random stores survive export → import into a fresh store", () => {
    const rnd = mulberry32(0xf00d);
    for (let round = 0; round < 30; round++) {
      const store = new EntryStore(memoryDriver(), sequentialIds());
      const count = 1 + Math.floor(rnd() * 40);
      // Space entries >2s apart so dedup provably never fires.
      let t = Date.UTC(2020, 0, 1);
      for (let i = 0; i < count; i++) {
        t += 3000 + Math.floor(rnd() * 86_400_000);
        const kind = pick(rnd, ALL_KINDS);
        const metric = metricById(kind);
        const value = metric
          ? metric.min + Math.floor(rnd() * (metric.max - metric.min + 1))
          : pick(rnd, symptomById(kind)!.valueKind.options).value;
        store.add(kind, value, new Date(t));
      }

      const restored = new EntryStore(memoryDriver(), sequentialIds());
      const result = importEntriesFromJSON(restored, store.exportJSON());
      expect(result.added).toBe(count);
      expect(result.skippedUnknownKinds).toBe(0);
      expect(restored.count()).toBe(count);
      for (const kind of new Set(ALL_KINDS)) {
        expect(
          restored.byKind(kind).map((e) => [e.value, e.date.getTime()]),
        ).toEqual(store.byKind(kind).map((e) => [e.value, e.date.getTime()]));
      }
    }
  });
});
