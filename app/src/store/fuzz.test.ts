import { describe, expect, test } from "bun:test";
import * as fc from "fast-check";

import { METRICS, SYMPTOMS, metricById, symptomById } from "../catalog";
import { parseISOString, toLocalISOString } from "../lib/dates";
import { EntryStore } from "./entryStore";
import { importEntriesFromJSON, parseExport } from "./swiftImport";
import { memoryDriver, sequentialIds } from "./testDriver";

// Property tests over the one untrusted-input surface (JSON import) and the
// serialization core — the permanent version of the 2026-07-16 review
// round's one-off fuzzing. On failure fast-check prints a shrunken
// counterexample plus the seed to replay it.

const NUM_RUNS = 500;

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

function validValueArb(kind: string): fc.Arbitrary<number> {
  const metric = metricById(kind);
  if (metric) return fc.integer({ min: metric.min, max: metric.max });
  return fc.constantFrom(
    ...symptomById(kind)!.valueKind.options.map((o) => o.value),
  );
}

// Second-precision dates in the supported range, as the store handles them.
const validDateArb = fc
  .date({
    min: new Date("1970-01-02T00:00:00Z"),
    max: new Date("2100-12-30T00:00:00Z"),
    noInvalidDate: true,
  })
  .map((d) => new Date(Math.floor(d.getTime() / 1000) * 1000));

const validEntryArb = fc
  .constantFrom(...ALL_KINDS)
  .chain((kind) =>
    fc.record({
      kind: fc.constant(kind),
      rating: validValueArb(kind),
      date: validDateArb.map(toLocalISOString),
      loggedAt: validDateArb.map(toLocalISOString),
    }),
  );

const garbageFieldArb = fc.oneof(
  fc.string(),
  fc.constantFrom(
    "",
    "2024",
    "12/31/2025",
    "2026-02-30T00:00:00Z",
    "+275760-09-13T00:00:00Z",
    "0001-01-01T00:00:00Z",
    "2026-07-12T09:41:00",
    "'; DROP TABLE entries; --",
  ),
  fc.double(),
  fc.integer({ min: -100000, max: 100000 }),
  fc.constant(null),
  fc.boolean(),
  fc.array(fc.string(), { maxLength: 2 }),
  fc.object({ maxDepth: 1 }),
);

// A valid entry with 0..3 fields replaced by garbage (or dropped).
const mutatedEntryArb = validEntryArb.chain((entry) =>
  fc
    .array(
      fc.tuple(
        fc.constantFrom("kind", "rating", "date", "loggedAt"),
        fc.option(garbageFieldArb, { nil: undefined }),
      ),
      { maxLength: 3 },
    )
    .map((mutations) => {
      const mutated: Record<string, unknown> = { ...entry };
      for (const [field, value] of mutations) {
        if (value === undefined) {
          delete mutated[field];
        } else {
          mutated[field] = value;
        }
      }
      return mutated;
    }),
);

describe("fuzz: parseExport is total", () => {
  test("any mix of valid/mutated entries either throws Error or yields only valid entries", () => {
    fc.assert(
      fc.property(
        fc.array(fc.oneof(validEntryArb, mutatedEntryArb), { maxLength: 6 }),
        fc.boolean(),
        (entries, wrapped) => {
          const json = JSON.stringify(wrapped ? { entries } : entries);
          let parsed;
          try {
            parsed = parseExport(json);
          } catch (error) {
            expect(error).toBeInstanceOf(Error);
            return;
          }
          for (const entry of parsed.entries) {
            expect(isValidValueFor(entry.kind, entry.value)).toBe(true);
            expect(entry.date.getFullYear()).toBeGreaterThanOrEqual(1970);
            expect(entry.date.getFullYear()).toBeLessThanOrEqual(2100);
            // Every accepted date must survive the store's serialization.
            expect(parseISOString(toLocalISOString(entry.date)).getTime()).toBe(
              Math.floor(entry.date.getTime() / 1000) * 1000,
            );
          }
        },
      ),
      { numRuns: NUM_RUNS },
    );
  });

  test("arbitrary JSON values never crash with a non-Error", () => {
    fc.assert(
      fc.property(fc.jsonValue({ maxDepth: 4 }), (value) => {
        try {
          parseExport(JSON.stringify(value));
        } catch (error) {
          expect(error).toBeInstanceOf(Error);
        }
      }),
      { numRuns: NUM_RUNS },
    );
    // Prototype pollution stays impossible.
    parseExport('{"__proto__": {"polluted": true}, "entries": []}');
    expect(
      (Object.prototype as unknown as Record<string, unknown>).polluted,
    ).toBeUndefined();
  });
});

describe("fuzz: round-trips", () => {
  test("date serialization is identity at second precision across the range", () => {
    fc.assert(
      fc.property(validDateArb, (date) => {
        expect(parseISOString(toLocalISOString(date)).getTime()).toBe(
          date.getTime(),
        );
      }),
      { numRuns: NUM_RUNS * 4 },
    );
  });

  test("random stores survive export → import into a fresh store", () => {
    // Entries spaced >2s apart so the import dedup provably never fires.
    const storeContentsArb = fc.array(
      fc
        .constantFrom(...ALL_KINDS)
        .chain((kind) =>
          fc.record({
            kind: fc.constant(kind),
            value: validValueArb(kind),
            gapMs: fc.integer({ min: 3000, max: 86_400_000 }),
          }),
        ),
      { maxLength: 50 },
    );
    fc.assert(
      fc.property(storeContentsArb, (contents) => {
        const store = new EntryStore(memoryDriver(), sequentialIds());
        let t = Date.UTC(2020, 0, 1);
        for (const item of contents) {
          t += item.gapMs;
          store.add(item.kind, item.value, new Date(t));
        }

        const restored = new EntryStore(memoryDriver(), sequentialIds());
        const result = importEntriesFromJSON(restored, store.exportJSON());
        expect(result.added).toBe(contents.length);
        expect(result.skippedUnknownKinds).toBe(0);
        for (const kind of new Set(contents.map((c) => c.kind))) {
          expect(
            restored.byKind(kind).map((e) => [e.value, e.date.getTime()]),
          ).toEqual(store.byKind(kind).map((e) => [e.value, e.date.getTime()]));
        }
      }),
      { numRuns: 50 },
    );
  });
});
