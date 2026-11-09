import { describe, expect, test } from "bun:test";

import type { RecordedLocation } from "../../modules/location-tracking/src/ExpoLocationTracking.types";
import { EntryStore } from "./entryStore";
import {
  countLocations,
  listLocations,
  saveRecordedLocations,
} from "./locations";
import { importEntriesFromJSON, parseExport } from "./swiftImport";
import { memoryDriver, sequentialIds } from "./testDriver";

function fresh() {
  const db = memoryDriver();
  const store = new EntryStore(db, sequentialIds());
  return { db, store };
}

const ARRIVAL = Date.parse("2026-11-09T08:00:00+01:00");
const DEPARTURE = Date.parse("2026-11-09T12:30:00+01:00");

const arrivalReport: RecordedLocation = {
  id: "visit-arrival",
  kind: "visit",
  latitude: 52.52,
  longitude: 13.405,
  accuracy: 40,
  timestamp: ARRIVAL + 5 * 60_000,
  arrival: ARRIVAL,
};

const departureReport: RecordedLocation = {
  id: "visit-departure",
  kind: "visit",
  latitude: 52.5201,
  longitude: 13.4051,
  accuracy: 25,
  timestamp: DEPARTURE + 3 * 60_000,
  arrival: ARRIVAL,
  departure: DEPARTURE,
};

const move: RecordedLocation = {
  id: "move-1",
  kind: "move",
  latitude: 52.5,
  longitude: 13.3,
  accuracy: 300,
  timestamp: DEPARTURE + 20 * 60_000,
};

describe("saveRecordedLocations", () => {
  test("stores moves and visits, oldest first", () => {
    const { db } = fresh();
    expect(saveRecordedLocations(db, [move, arrivalReport])).toBe(2);
    const stored = listLocations(db);
    expect(stored.map((l) => l.kind)).toEqual(["visit", "move"]);
    expect(stored[0].date.getTime()).toBe(ARRIVAL);
    expect(stored[0].departure).toBeNull();
    expect(stored[1].date.getTime()).toBe(move.timestamp);
    expect(stored[1].arrival).toBeNull();
  });

  test("a visit's departure report completes its arrival row", () => {
    const { db } = fresh();
    saveRecordedLocations(db, [arrivalReport]);
    expect(saveRecordedLocations(db, [departureReport])).toBe(0);
    const [visit] = listLocations(db);
    expect(visit.id).toBe("visit-arrival");
    expect(visit.arrival?.getTime()).toBe(ARRIVAL);
    expect(visit.departure?.getTime()).toBe(DEPARTURE);
    // The departure report's position replaces the arrival's.
    expect(visit.latitude).toBe(52.5201);
    expect(visit.accuracy).toBe(25);
  });

  test("both reports of a visit in one batch make one row", () => {
    const { db } = fresh();
    expect(saveRecordedLocations(db, [arrivalReport, departureReport])).toBe(1);
    expect(listLocations(db)[0].departure?.getTime()).toBe(DEPARTURE);
  });

  test("times are kept to the second, so sub-second reports still join", () => {
    const { db } = fresh();
    saveRecordedLocations(db, [
      { ...arrivalReport, arrival: ARRIVAL + 412 },
      { ...departureReport, arrival: ARRIVAL + 412, departure: DEPARTURE + 7 },
      { ...move, timestamp: move.timestamp + 999 },
    ]);
    const [visit, moved] = listLocations(db);
    expect(visit.arrival?.getTime()).toBe(ARRIVAL);
    expect(visit.departure?.getTime()).toBe(DEPARTURE);
    expect(moved.date.getTime()).toBe(move.timestamp);
  });

  test("a visit restored from an export is completed by its departure report", () => {
    const { db, store } = fresh();
    saveRecordedLocations(db, [{ ...arrivalReport, arrival: ARRIVAL + 412 }]);
    const restored = fresh();
    importEntriesFromJSON(restored.store, restored.db, store.exportJSON());
    saveRecordedLocations(restored.db, [
      { ...departureReport, arrival: ARRIVAL + 412 },
    ]);
    const visits = listLocations(restored.db);
    expect(visits.length).toBe(1);
    expect(visits[0].departure?.getTime()).toBe(DEPARTURE);
  });

  test("replaying a batch adds nothing", () => {
    const { db } = fresh();
    const batch = [arrivalReport, departureReport, move];
    saveRecordedLocations(db, batch);
    const first = listLocations(db);
    expect(saveRecordedLocations(db, batch)).toBe(0);
    expect(listLocations(db)).toEqual(first);
  });

  test("a visit with an unknown arrival is dated by its departure", () => {
    const { db } = fresh();
    saveRecordedLocations(db, [
      { ...departureReport, id: "no-arrival", arrival: undefined },
    ]);
    const [visit] = listLocations(db);
    expect(visit.arrival).toBeNull();
    expect(visit.date.getTime()).toBe(DEPARTURE);
  });

  test("a move never carries visit times", () => {
    const { db } = fresh();
    saveRecordedLocations(db, [
      { ...move, arrival: ARRIVAL, departure: DEPARTURE },
    ]);
    const [stored] = listLocations(db);
    expect(stored.arrival).toBeNull();
    expect(stored.departure).toBeNull();
    expect(stored.date.getTime()).toBe(move.timestamp);
  });

  test("skips unusable records instead of failing the batch", () => {
    const { db } = fresh();
    const broken = [
      { ...move, id: "nan", latitude: Number.NaN },
      { ...move, id: "" },
      { ...move, id: "kind", kind: "teleport" },
    ] as RecordedLocation[];
    expect(saveRecordedLocations(db, [...broken, move])).toBe(1);
  });
});

describe("locations in the JSON export", () => {
  test("absent until something was recorded", () => {
    const { store } = fresh();
    expect("locations" in JSON.parse(store.exportJSON())).toBe(false);
  });

  test("round-trip into a fresh store, and importing twice adds nothing", () => {
    const { db, store } = fresh();
    store.add("mood", 7, new Date("2026-11-09T09:41:00+01:00"));
    saveRecordedLocations(db, [arrivalReport, departureReport, move]);
    const json = store.exportJSON();

    const exported = JSON.parse(json) as {
      locations: Record<string, unknown>[];
    };
    expect(exported.locations.length).toBe(2);
    expect(exported.locations[0].departure).toMatch(/[+-]\d{2}:\d{2}$/);
    expect("arrival" in exported.locations[1]).toBe(false);

    const restored = fresh();
    const result = importEntriesFromJSON(restored.store, restored.db, json);
    expect(result.added).toBe(1);
    expect(result.addedLocations).toBe(2);
    expect(listLocations(restored.db)).toEqual(listLocations(db));
    expect(
      importEntriesFromJSON(restored.store, restored.db, json).addedLocations,
    ).toBe(0);
    expect(countLocations(restored.db)).toBe(2);
  });

  test("an export without locations still imports", () => {
    expect(parseExport(JSON.stringify({ entries: [] })).locations).toEqual([]);
  });

  test("malformed locations abort the import", () => {
    const withLocation = (location: unknown) =>
      JSON.stringify({ entries: [], locations: [location] });
    const good = {
      id: "a",
      kind: "move",
      latitude: 1,
      longitude: 2,
      accuracy: 3,
      date: "2026-11-09T08:00:00+01:00",
    };
    expect(parseExport(withLocation(good)).locations.length).toBe(1);
    expect(() => parseExport(withLocation({ ...good, latitude: 91 }))).toThrow(
      "Location 0 has a missing or implausible latitude",
    );
    expect(() => parseExport(withLocation({ ...good, kind: "x" }))).toThrow(
      "Location 0 has an unknown kind",
    );
    expect(() => parseExport(withLocation({ ...good, date: "2026" }))).toThrow(
      "Location 0 has a malformed date",
    );
    expect(() =>
      parseExport(JSON.stringify({ entries: [], locations: {} })),
    ).toThrow("locations is not an array");
  });
});
