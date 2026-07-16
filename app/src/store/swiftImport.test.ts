import { describe, expect, test } from "bun:test";

import { EntryStore } from "./entryStore";
import { importEntriesFromJSON, parseExport } from "./swiftImport";
import { memoryDriver, sequentialIds } from "./testDriver";

// The exact shape SettingsView.exportJSON produces in the Swift app.
const SWIFT_EXPORT = JSON.stringify({
  exportedAt: "2026-07-15T20:00:00+02:00",
  entries: [
    {
      id: "5E1A0DAF-2A2B-4C3D-8E9F-000000000001",
      kind: "mood",
      rating: 7,
      date: "2026-07-12T09:41:00+02:00",
      loggedAt: "2026-07-12T09:41:03+02:00",
    },
    {
      id: "5E1A0DAF-2A2B-4C3D-8E9F-000000000002",
      kind: "anxiety",
      rating: 0,
      date: "2026-07-13T22:15:00+02:00",
      loggedAt: "2026-07-13T22:15:01+02:00",
    },
  ],
});

function entryJSON(overrides: Record<string, unknown>): string {
  return JSON.stringify({
    entries: [
      {
        kind: "mood",
        rating: 5,
        date: "2026-07-12T09:41:00+02:00",
        loggedAt: "2026-07-12T09:41:00+02:00",
        ...overrides,
      },
    ],
  });
}

function freshStore(): EntryStore {
  return new EntryStore(memoryDriver(), sequentialIds());
}

describe("parseExport", () => {
  test("parses the Swift export shape", () => {
    const parsed = parseExport(SWIFT_EXPORT);
    expect(parsed.entries.length).toBe(2);
    expect(parsed.entries[0].kind).toBe("mood");
    expect(parsed.entries[0].value).toBe(7);
    expect(parsed.entries[0].date.getTime()).toBe(
      new Date("2026-07-12T09:41:00+02:00").getTime(),
    );
    expect(parsed.skippedUnknownKinds).toBe(0);
  });

  test("accepts a bare entries array", () => {
    expect(
      parseExport(JSON.stringify(JSON.parse(SWIFT_EXPORT).entries)).entries
        .length,
    ).toBe(2);
  });

  test("accepts symptom kinds — the app's own export round-trips", () => {
    const store = freshStore();
    store.add("mood", 7, new Date("2026-07-12T09:41:00+02:00"));
    store.add(
      "HKCategoryTypeIdentifierHeadache",
      2,
      new Date("2026-07-13T10:00:00+02:00"),
    );
    const parsed = parseExport(store.exportJSON());
    expect(parsed.entries.length).toBe(2);
    expect(parsed.entries[1].kind).toBe("HKCategoryTypeIdentifierHeadache");

    // And restores into a fresh store.
    const restored = freshStore();
    const result = importEntriesFromJSON(restored, store.exportJSON());
    expect(result.added).toBe(2);
    expect(restored.count()).toBe(2);
  });

  test("skips (and counts) unknown kinds instead of aborting", () => {
    const parsed = parseExport(
      JSON.stringify({
        entries: [
          ...JSON.parse(SWIFT_EXPORT).entries,
          {
            kind: "HKCategoryTypeIdentifierFromTheFuture",
            rating: 1,
            date: "2026-01-01T00:00:00Z",
            loggedAt: "2026-01-01T00:00:00Z",
          },
        ],
      }),
    );
    expect(parsed.entries.length).toBe(2);
    expect(parsed.skippedUnknownKinds).toBe(1);
  });

  test("rejects out-of-range and non-option values", () => {
    expect(() => parseExport(entryJSON({ rating: 999 }))).toThrow(
      /out-of-range/,
    );
    expect(() => parseExport(entryJSON({ rating: -1 }))).toThrow(
      /out-of-range/,
    );
    expect(() => parseExport(entryJSON({ rating: 1e300 }))).toThrow();
    expect(() =>
      parseExport(
        entryJSON({ kind: "HKCategoryTypeIdentifierHeadache", rating: 7 }),
      ),
    ).toThrow(/invalid value/);
    expect(() => parseExport(entryJSON({ rating: 5.5 }))).toThrow(
      /non-integer/,
    );
  });

  test("rejects poison and lenient dates", () => {
    // Round-trip-breaking years:
    expect(() =>
      parseExport(entryJSON({ date: "+275760-09-13T00:00:00Z" })),
    ).toThrow(/malformed/);
    expect(() =>
      parseExport(entryJSON({ date: "0202-07-12T09:41:00Z" })),
    ).toThrow(/implausible/);
    // Formats new Date() would silently accept:
    expect(() => parseExport(entryJSON({ date: "2024" }))).toThrow(/malformed/);
    expect(() => parseExport(entryJSON({ date: "12/31/2025" }))).toThrow(
      /malformed/,
    );
    // Silently-rolled nonexistent dates:
    expect(() =>
      parseExport(entryJSON({ date: "2026-02-30T00:00:00Z" })),
    ).toThrow(/nonexistent/);
    expect(() => parseExport('{"entries":[{"kind":"mood"}]}')).toThrow();
    expect(() => parseExport('{"nope":true}')).toThrow(/entries array/);
    expect(() => parseExport("[1,2]")).toThrow();
  });

  test("accepts Z, offsets, and fractional seconds", () => {
    expect(
      parseExport(
        entryJSON({ date: "2026-07-12T07:41:00Z" }),
      ).entries[0].date.getTime(),
    ).toBe(Date.UTC(2026, 6, 12, 7, 41, 0));
    expect(
      parseExport(
        entryJSON({ date: "2026-07-12T09:41:00.500+02:00" }),
      ).entries[0].date.getTime(),
    ).toBe(Date.UTC(2026, 6, 12, 7, 41, 0, 500));
  });
});

describe("importEntriesFromJSON", () => {
  test("imports with dedup against existing entries", () => {
    const store = freshStore();
    expect(importEntriesFromJSON(store, SWIFT_EXPORT).added).toBe(2);
    expect(importEntriesFromJSON(store, SWIFT_EXPORT).added).toBe(0);
    expect(store.count()).toBe(2);
  });

  test("Swift mood entries carry dual-write provenance (never re-mirrored)", () => {
    const store = freshStore();
    importEntriesFromJSON(store, SWIFT_EXPORT);
    const mood = store.byKind("mood")[0];
    expect(mood.backend).toBe("healthkit");
    expect(mood.backendId).toBe("swift-dual-write");
    // Stress/anxiety were never dual-written; they stay provenance-free.
    expect(store.byKind("anxiety")[0].backend).toBeNull();
  });

  test("keeps distinct in-batch entries logged <2s apart", () => {
    const store = freshStore();
    const result = importEntriesFromJSON(
      store,
      JSON.stringify({
        entries: [
          {
            kind: "stress",
            rating: 2,
            date: "2026-07-12T09:41:00+02:00",
            loggedAt: "2026-07-12T09:41:00+02:00",
          },
          {
            kind: "stress",
            rating: 9,
            date: "2026-07-12T09:41:01+02:00",
            loggedAt: "2026-07-12T09:41:01+02:00",
          },
        ],
      }),
    );
    expect(result.added).toBe(2);
    expect(store.byKind("stress").map((e) => e.value)).toEqual([2, 9]);
  });
});
