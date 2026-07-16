import { describe, expect, test } from "bun:test";

import { getUserVersion, setUserVersion } from "./driver";
import { EntryStore } from "./entryStore";
import { migrate, SCHEMA_VERSION } from "./migrations";
import { memoryDriver, sequentialIds } from "./testDriver";

function freshStore(): EntryStore {
  return new EntryStore(memoryDriver(), sequentialIds());
}

describe("migrations", () => {
  test("fresh database migrates to the current schema version", () => {
    const db = memoryDriver();
    migrate(db);
    expect(getUserVersion(db)).toBe(SCHEMA_VERSION);
  });

  test("migrating twice is a no-op", () => {
    const db = memoryDriver();
    migrate(db);
    migrate(db);
    expect(getUserVersion(db)).toBe(SCHEMA_VERSION);
  });

  test("refuses a database from a newer app instead of touching it", () => {
    const db = memoryDriver();
    setUserVersion(db, SCHEMA_VERSION + 1);
    expect(() => migrate(db)).toThrow(/newer than this app/);
  });
});

describe("EntryStore", () => {
  test("add and read back preserves fields at second precision", () => {
    const store = freshStore();
    const date = new Date("2026-07-12T09:41:00+02:00");
    const loggedAt = new Date("2026-07-15T21:00:00+02:00");
    store.add("mood", 7, date, loggedAt);

    const entries = store.byKind("mood");
    expect(entries.length).toBe(1);
    expect(entries[0].value).toBe(7);
    expect(entries[0].date.getTime()).toBe(date.getTime());
    expect(entries[0].loggedAt.getTime()).toBe(loggedAt.getTime());
    expect(entries[0].backend).toBeNull();
  });

  test("byKind returns oldest first and only the requested kind", () => {
    const store = freshStore();
    store.add("stress", 3, new Date("2026-07-02T10:00:00Z"));
    store.add("stress", 5, new Date("2026-07-01T10:00:00Z"));
    store.add("mood", 8, new Date("2026-07-03T10:00:00Z"));

    const stress = store.byKind("stress");
    expect(stress.map((e) => e.value)).toEqual([5, 3]);
  });

  test("lastDates honors backdating (max user-set date, not insert order)", () => {
    const store = freshStore();
    store.add("mood", 6, new Date("2026-07-10T08:00:00Z"));
    // Backdated entry logged later:
    store.add("mood", 4, new Date("2026-07-05T08:00:00Z"));

    expect(store.lastDates().get("mood")?.getTime()).toBe(
      new Date("2026-07-10T08:00:00Z").getTime(),
    );
  });

  test("unsynced/markSynced round-trip", () => {
    const store = freshStore();
    const entry = store.add(
      "HKCategoryTypeIdentifierHeadache",
      2,
      new Date("2026-07-14T12:00:00Z"),
    );
    store.add("stress", 5, new Date("2026-07-14T13:00:00Z"));

    const pending = store.unsynced([
      "HKCategoryTypeIdentifierHeadache",
      "mood",
    ]);
    expect(pending.map((e) => e.id)).toEqual([entry.id]);

    store.markSynced(entry.id, "healthkit", "sample-uuid-1");
    expect(store.unsynced(["HKCategoryTypeIdentifierHeadache"])).toEqual([]);
    const synced = store.byKind("HKCategoryTypeIdentifierHeadache")[0];
    expect(synced.backend).toBe("healthkit");
    expect(synced.backendId).toBe("sample-uuid-1");
  });

  test("unsynced with no kinds is empty (never a malformed IN ())", () => {
    expect(freshStore().unsynced([])).toEqual([]);
  });

  test("claimed entries are invisible to unsynced until released", () => {
    const store = freshStore();
    const entry = store.add("mood", 5, new Date("2026-07-16T08:00:00Z"));
    store.claimForMirror(entry.id, "healthkit");
    expect(store.unsynced(["mood"])).toEqual([]);
    store.releaseMirrorClaim(entry.id);
    expect(store.unsynced(["mood"]).map((e) => e.id)).toEqual([entry.id]);
  });

  test("entries park after MAX_MIRROR_ATTEMPTS failed releases", () => {
    const store = freshStore();
    const entry = store.add("mood", 5, new Date("2026-07-16T08:00:00Z"));
    for (let i = 0; i < 5; i++) {
      store.claimForMirror(entry.id, "healthkit");
      store.releaseMirrorClaim(entry.id);
    }
    expect(store.unsynced(["mood"])).toEqual([]);
    // Still present locally for charts/recency.
    expect(store.byKind("mood").length).toBe(1);
  });

  test("import dedups within ±2s per kind, keeps everything else", () => {
    const store = freshStore();
    const base = new Date("2026-07-12T09:41:00+02:00");
    store.add("mood", 7, base);

    const added = store.import([
      // 1.5s away from the dual-written entry: duplicate, skipped.
      { kind: "mood", value: 7, date: new Date(base.getTime() + 1500) },
      // 3s away: distinct entry.
      { kind: "mood", value: 6, date: new Date(base.getTime() + 3000) },
      // Same instant but different kind: kept.
      { kind: "stress", value: 4, date: base },
    ]);

    expect(added).toBe(2);
    expect(store.count()).toBe(3);
  });

  test("imported backfill entries carry their backend provenance", () => {
    const store = freshStore();
    store.import([
      {
        kind: "HKCategoryTypeIdentifierNausea",
        value: 3,
        date: new Date("2026-06-01T10:00:00Z"),
        backend: "healthkit",
        backendId: "hk-uuid-9",
      },
    ]);
    const entry = store.byKind("HKCategoryTypeIdentifierNausea")[0];
    expect(entry.backend).toBe("healthkit");
    expect(entry.backendId).toBe("hk-uuid-9");
    // Imports use the sample date as loggedAt (original time unrecoverable).
    expect(entry.loggedAt.getTime()).toBe(entry.date.getTime());
  });

  test("exportJSON emits the Swift-compatible shape, oldest first", () => {
    const store = freshStore();
    store.add("mood", 7, new Date("2026-07-12T09:41:00+02:00"));
    store.add("stress", 2, new Date("2026-07-11T09:00:00+02:00"));

    const parsed = JSON.parse(
      store.exportJSON(new Date("2026-07-15T21:00:00+02:00")),
    );
    expect(typeof parsed.exportedAt).toBe("string");
    expect(parsed.entries.length).toBe(2);
    expect(parsed.entries[0].kind).toBe("stress");
    // Swift compatibility: the value field is named "rating".
    expect(parsed.entries[1].rating).toBe(7);
    expect(parsed.entries[1].date).toMatch(/[+-]\d{2}:\d{2}$/);
  });
});
