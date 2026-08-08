import { describe, expect, test } from "bun:test";

import { listCustomItems } from "./customItems";
import { type SqlDriver } from "./driver";
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

function freshStore(): { store: EntryStore; db: SqlDriver } {
  const db = memoryDriver();
  return { store: new EntryStore(db, sequentialIds()), db };
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
    const { store } = freshStore();
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
    const result = importEntriesFromJSON(
      restored.store,
      restored.db,
      store.exportJSON(),
    );
    expect(result.added).toBe(2);
    expect(restored.store.count()).toBe(2);
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

  test("folds pre-v4 stress/anxiety zeros into 1, mood zero still rejects", () => {
    // The SWIFT_EXPORT fixture predates the 1–10 stress/anxiety scale.
    const parsed = parseExport(SWIFT_EXPORT);
    expect(parsed.entries[1].kind).toBe("anxiety");
    expect(parsed.entries[1].value).toBe(1);
    expect(
      parseExport(entryJSON({ kind: "stress", rating: 0 })).entries[0].value,
    ).toBe(1);
    // Mood never had a zero; it stays an error, as does symptom "Present" (0)
    // staying untouched.
    expect(() => parseExport(entryJSON({ rating: 0 }))).toThrow(/out-of-range/);
    expect(
      parseExport(
        entryJSON({ kind: "HKCategoryTypeIdentifierHeadache", rating: 0 }),
      ).entries[0].value,
    ).toBe(0);
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
    const { store, db } = freshStore();
    expect(importEntriesFromJSON(store, db, SWIFT_EXPORT).added).toBe(2);
    expect(importEntriesFromJSON(store, db, SWIFT_EXPORT).added).toBe(0);
    expect(store.count()).toBe(2);
  });

  test("Swift mood entries carry dual-write provenance (never re-mirrored)", () => {
    const { store, db } = freshStore();
    importEntriesFromJSON(store, db, SWIFT_EXPORT);
    const mood = store.byKind("mood")[0];
    expect(mood.backend).toBe("healthkit");
    expect(mood.backendId).toBe("swift-dual-write");
    // Stress/anxiety were never dual-written; they stay provenance-free.
    expect(store.byKind("anxiety")[0].backend).toBeNull();
  });

  test("keeps distinct in-batch entries logged <2s apart", () => {
    const { store, db } = freshStore();
    const result = importEntriesFromJSON(
      store,
      db,
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

describe("custom items in exports", () => {
  const CUSTOM_EXPORT = JSON.stringify({
    exportedAt: "2026-08-02T12:00:00+02:00",
    entries: [
      {
        kind: "custom:11111111-1111-1111-1111-111111111111",
        rating: 3,
        date: "2026-07-20T10:00:00+02:00",
        loggedAt: "2026-07-20T10:00:00+02:00",
      },
      {
        kind: "custom:22222222-2222-2222-2222-222222222222",
        rating: 8,
        date: "2026-07-21T10:00:00+02:00",
        loggedAt: "2026-07-21T10:00:00+02:00",
      },
    ],
    customItems: [
      {
        id: "11111111-1111-1111-1111-111111111111",
        name: "Tinnitus",
        icon: "🔔",
        kind: "severity",
        highIsGood: false,
        createdAt: "2026-07-19T09:00:00+02:00",
        archivedAt: null,
      },
      {
        id: "22222222-2222-2222-2222-222222222222",
        name: "Energy",
        icon: "⚡",
        kind: "rating",
        highIsGood: true,
        createdAt: "2026-07-19T09:00:00+02:00",
        archivedAt: null,
      },
    ],
  });

  test("restores definitions and their entries", () => {
    const { store, db } = freshStore();
    const result = importEntriesFromJSON(store, db, CUSTOM_EXPORT);
    expect(result.added).toBe(2);
    expect(result.skippedUnknownKinds).toBe(0);
    const items = listCustomItems(db);
    expect(items.map((i) => i.name)).toEqual(["Energy", "Tinnitus"]);
    expect(items[0].kind).toBe("rating");
    expect(items[0].highIsGood).toBe(true);
  });

  test("full round-trip: export of a store with custom items re-imports", () => {
    const { store, db } = freshStore();
    importEntriesFromJSON(store, db, CUSTOM_EXPORT);
    const restored = freshStore();
    const result = importEntriesFromJSON(
      restored.store,
      restored.db,
      store.exportJSON(),
    );
    expect(result.added).toBe(2);
    expect(listCustomItems(restored.db).length).toBe(2);
  });

  test("an existing local definition wins over the file's copy", () => {
    const { store, db } = freshStore();
    importEntriesFromJSON(store, db, CUSTOM_EXPORT);
    db.run(`UPDATE custom_items SET name = 'Renamed' WHERE name = 'Tinnitus'`);
    importEntriesFromJSON(store, db, CUSTOM_EXPORT);
    const names = listCustomItems(db).map((i) => i.name);
    expect(names).toContain("Renamed");
    expect(names).not.toContain("Tinnitus");
  });

  test("custom entries without a definition anywhere are skipped, not fatal", () => {
    const { store, db } = freshStore();
    const result = importEntriesFromJSON(
      store,
      db,
      JSON.stringify({
        entries: [
          {
            kind: "custom:99999999-9999-9999-9999-999999999999",
            rating: 3,
            date: "2026-07-20T10:00:00+02:00",
            loggedAt: "2026-07-20T10:00:00+02:00",
          },
        ],
      }),
    );
    expect(result.added).toBe(0);
    expect(result.skippedUnknownKinds).toBe(1);
  });

  test("entries validate against the item's kind", () => {
    // 11...11 is a severity item: 7 is not a severity raw value.
    expect(() =>
      parseExport(
        JSON.stringify({
          entries: [
            {
              kind: "custom:11111111-1111-1111-1111-111111111111",
              rating: 7,
              date: "2026-07-20T10:00:00+02:00",
              loggedAt: "2026-07-20T10:00:00+02:00",
            },
          ],
          customItems: JSON.parse(CUSTOM_EXPORT).customItems,
        }),
      ),
    ).toThrow(/invalid severity value/);
    // 22...22 is a rating item: 0 is out of the 1–10 range.
    expect(() =>
      parseExport(
        JSON.stringify({
          entries: [
            {
              kind: "custom:22222222-2222-2222-2222-222222222222",
              rating: 0,
              date: "2026-07-20T10:00:00+02:00",
              loggedAt: "2026-07-20T10:00:00+02:00",
            },
          ],
          customItems: JSON.parse(CUSTOM_EXPORT).customItems,
        }),
      ),
    ).toThrow(/out-of-range/);
  });

  test("events and notes round-trip; their values validate", () => {
    const EVENT_ID = "33333333-3333-3333-3333-333333333333";
    const eventExport = JSON.stringify({
      entries: [
        {
          kind: `custom:${EVENT_ID}`,
          rating: 1,
          date: "2026-07-20T10:00:00+02:00",
          loggedAt: "2026-07-20T10:00:00+02:00",
        },
        {
          kind: "note",
          rating: 0,
          text: "hit my head",
          date: "2026-07-21T10:00:00+02:00",
          loggedAt: "2026-07-21T10:00:00+02:00",
        },
      ],
      customItems: [
        {
          id: EVENT_ID,
          name: "Flossed",
          icon: "🦷",
          kind: "event",
          highIsGood: false,
          createdAt: "2026-07-19T09:00:00+02:00",
          archivedAt: null,
        },
      ],
    });
    const { store, db } = freshStore();
    const result = importEntriesFromJSON(store, db, eventExport);
    expect(result.added).toBe(2);
    expect(listCustomItems(db)[0].kind).toBe("event");
    expect(store.byKind("note")[0].valueText).toBe("hit my head");

    // Round-trips through this app's own export.
    const restored = freshStore();
    expect(
      importEntriesFromJSON(restored.store, restored.db, store.exportJSON())
        .added,
    ).toBe(2);

    // An event value other than 1 is invalid; a note needs text and value 0.
    const withEntry = (entry: Record<string, unknown>) =>
      JSON.stringify({
        entries: [
          {
            date: "2026-07-20T10:00:00+02:00",
            loggedAt: "2026-07-20T10:00:00+02:00",
            ...entry,
          },
        ],
        customItems: JSON.parse(eventExport).customItems,
      });
    expect(() =>
      parseExport(withEntry({ kind: `custom:${EVENT_ID}`, rating: 3 })),
    ).toThrow(/invalid event value/);
    expect(() => parseExport(withEntry({ kind: "note", rating: 0 }))).toThrow(
      /note without text/,
    );
    expect(() =>
      parseExport(withEntry({ kind: "note", rating: 5, text: "x" })),
    ).toThrow(/non-zero note value/);
  });

  test("numeric and text items round-trip; their values validate", () => {
    const NUMERIC_ID = "44444444-4444-4444-4444-444444444444";
    const TEXT_ID = "55555555-5555-5555-5555-555555555555";
    const newKindsExport = JSON.stringify({
      entries: [
        // Decimals are valid for numeric items (weight).
        {
          kind: `custom:${NUMERIC_ID}`,
          rating: 72.4,
          date: "2026-07-20T10:00:00+02:00",
          loggedAt: "2026-07-20T10:00:00+02:00",
        },
        {
          kind: `custom:${TEXT_ID}`,
          rating: 0,
          text: "went fine, mind wandered",
          date: "2026-07-21T10:00:00+02:00",
          loggedAt: "2026-07-21T10:00:00+02:00",
        },
      ],
      customItems: [
        {
          id: NUMERIC_ID,
          name: "Weight",
          icon: "⚖️",
          kind: "numeric",
          highIsGood: false,
          createdAt: "2026-07-19T09:00:00+02:00",
          archivedAt: null,
        },
        {
          id: TEXT_ID,
          name: "Dishes",
          icon: "🍽️",
          kind: "text",
          highIsGood: false,
          createdAt: "2026-07-19T09:00:00+02:00",
          archivedAt: null,
        },
      ],
    });
    const { store, db } = freshStore();
    const result = importEntriesFromJSON(store, db, newKindsExport);
    expect(result.added).toBe(2);
    expect(store.byKind(`custom:${NUMERIC_ID}`)[0].value).toBe(72.4);
    expect(store.byKind(`custom:${TEXT_ID}`)[0].valueText).toBe(
      "went fine, mind wandered",
    );

    // Round-trips through this app's own export.
    const restored = freshStore();
    expect(
      importEntriesFromJSON(restored.store, restored.db, store.exportJSON())
        .added,
    ).toBe(2);
    expect(restored.store.byKind(`custom:${NUMERIC_ID}`)[0].value).toBe(72.4);

    // Numeric must still be a finite number; text items need text + value 0.
    const withEntry = (entry: Record<string, unknown>) =>
      JSON.stringify({
        entries: [
          {
            date: "2026-07-20T10:00:00+02:00",
            loggedAt: "2026-07-20T10:00:00+02:00",
            ...entry,
          },
        ],
        customItems: JSON.parse(newKindsExport).customItems,
      });
    expect(() =>
      parseExport(withEntry({ kind: `custom:${NUMERIC_ID}`, rating: "12" })),
    ).toThrow(/non-numeric/);
    expect(() =>
      parseExport(withEntry({ kind: `custom:${TEXT_ID}`, rating: 0 })),
    ).toThrow(/note without text/);
    expect(() =>
      parseExport(
        withEntry({ kind: `custom:${TEXT_ID}`, rating: 1, text: "x" }),
      ),
    ).toThrow(/non-zero text-item value/);
  });

  test("on an id conflict, values validate against the device's kind", () => {
    const { store, db } = freshStore();
    importEntriesFromJSON(store, db, CUSTOM_EXPORT); // 22...22 is "rating"
    // A file that claims the same id is a severity item, with a value that
    // is only valid for severity (0). The device's kind must win: abort.
    const conflicting = JSON.stringify({
      entries: [
        {
          kind: "custom:22222222-2222-2222-2222-222222222222",
          rating: 0,
          date: "2026-07-25T10:00:00+02:00",
          loggedAt: "2026-07-25T10:00:00+02:00",
        },
      ],
      customItems: [
        {
          id: "22222222-2222-2222-2222-222222222222",
          name: "Energy",
          icon: "⚡",
          kind: "severity",
          createdAt: "2026-07-19T09:00:00+02:00",
        },
      ],
    });
    expect(() => importEntriesFromJSON(store, db, conflicting)).toThrow(
      /out-of-range/,
    );
    expect(listCustomItems(db).find((i) => i.name === "Energy")?.kind).toBe(
      "rating",
    );
  });

  test("whitespace-only note text rejects", () => {
    expect(() =>
      parseExport(
        JSON.stringify({
          entries: [
            {
              kind: "note",
              rating: 0,
              text: "   ",
              date: "2026-07-21T10:00:00+02:00",
              loggedAt: "2026-07-21T10:00:00+02:00",
            },
          ],
        }),
      ),
    ).toThrow(/note without text/);
  });

  test("malformed custom items abort loudly", () => {
    expect(() =>
      parseExport(
        JSON.stringify({
          entries: [],
          customItems: [{ id: "x", name: "No kind", icon: "❓" }],
        }),
      ),
    ).toThrow(/unknown kind/);
    expect(() =>
      parseExport(JSON.stringify({ entries: [], customItems: "nope" })),
    ).toThrow(/not an array/);
  });
});
