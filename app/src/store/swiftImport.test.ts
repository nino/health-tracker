import { describe, expect, test } from "bun:test";

import { EntryStore } from "./entryStore";
import { parseSwiftExport } from "./swiftImport";
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

describe("parseSwiftExport", () => {
  test("parses the Swift export shape", () => {
    const entries = parseSwiftExport(SWIFT_EXPORT);
    expect(entries.length).toBe(2);
    expect(entries[0].kind).toBe("mood");
    expect(entries[0].value).toBe(7);
    expect(entries[0].date.getTime()).toBe(
      new Date("2026-07-12T09:41:00+02:00").getTime(),
    );
    expect(entries[1].value).toBe(0);
  });

  test("accepts a bare entries array", () => {
    const entries = parseSwiftExport(
      JSON.stringify(JSON.parse(SWIFT_EXPORT).entries),
    );
    expect(entries.length).toBe(2);
  });

  test("rejects unknown kinds and malformed entries loudly", () => {
    expect(() =>
      parseSwiftExport(
        '{"entries":[{"kind":"steps","rating":1,"date":"2026-01-01T00:00:00Z","loggedAt":"2026-01-01T00:00:00Z"}]}',
      ),
    ).toThrow(/unknown kind/);
    expect(() => parseSwiftExport('{"entries":[{"kind":"mood"}]}')).toThrow();
    expect(() => parseSwiftExport('{"nope":true}')).toThrow(/entries array/);
    expect(() => parseSwiftExport("[1,2]")).toThrow();
  });

  test("parsed entries import into the store with dedup", () => {
    const store = new EntryStore(memoryDriver(), sequentialIds());
    const first = store.import(parseSwiftExport(SWIFT_EXPORT));
    const second = store.import(parseSwiftExport(SWIFT_EXPORT));
    expect(first).toBe(2);
    expect(second).toBe(0);
    expect(store.count()).toBe(2);
  });
});
