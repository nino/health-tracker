import { describe, expect, test } from "bun:test";

import { parseISOString, toLocalISOString } from "./dates";

// Invariant-style tests so they pass in any host timezone.
describe("toLocalISOString", () => {
  test("matches the ISO 8601 shape with an explicit offset", () => {
    const iso = toLocalISOString(new Date("2026-07-12T09:41:00Z"));
    expect(iso).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}[+-]\d{2}:\d{2}$/);
  });

  test("round-trips through Date at second precision", () => {
    const original = new Date("2026-07-12T09:41:23.000Z");
    const roundTripped = parseISOString(toLocalISOString(original));
    expect(roundTripped.getTime()).toBe(original.getTime());
  });

  test("encodes the offset the host reports for that instant", () => {
    const date = new Date("2026-01-15T12:00:00Z"); // winter, in case of DST
    const iso = toLocalISOString(date);
    const offsetMinutes = -date.getTimezoneOffset();
    const sign = offsetMinutes >= 0 ? "+" : "-";
    const abs = Math.abs(offsetMinutes);
    const expected = `${sign}${String(Math.floor(abs / 60)).padStart(2, "0")}:${String(abs % 60).padStart(2, "0")}`;
    expect(iso.slice(-6)).toBe(expected);
  });

  test("parses the Swift app export format", () => {
    expect(parseISOString("2026-07-12T09:41:00+02:00").getTime()).toBe(
      Date.UTC(2026, 6, 12, 7, 41, 0),
    );
  });

  test("parseISOString rejects garbage", () => {
    expect(() => parseISOString("not a date")).toThrow("Invalid ISO 8601 date");
  });

  test("early years pad to four digits and still round-trip", () => {
    const early = new Date(Date.UTC(202, 0, 15, 12, 0, 0));
    const iso = toLocalISOString(early);
    expect(iso).toMatch(/^0202-/);
    expect(parseISOString(iso).getTime()).toBe(early.getTime());
  });

  test("years outside ISO 8601 throw instead of poisoning the store", () => {
    expect(() => toLocalISOString(new Date(8.64e15))).toThrow(RangeError);
    expect(() => toLocalISOString(new Date(Date.UTC(-1000, 0, 1)))).toThrow(
      RangeError,
    );
  });
});
