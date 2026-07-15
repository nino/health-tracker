import { parseISOString } from "../lib/dates";

// Parses the Swift app's metric-log.json export ({ exportedAt, entries } or a
// bare entry array) into candidates for EntryStore.import. Throws on
// malformed input rather than silently importing partial data.

export interface SwiftExportEntry {
  kind: string;
  value: number;
  date: Date;
  loggedAt: Date;
}

const METRIC_KINDS = new Set(["mood", "stress", "anxiety"]);

export function parseSwiftExport(json: string): SwiftExportEntry[] {
  const parsed: unknown = JSON.parse(json);
  const raw = Array.isArray(parsed)
    ? parsed
    : parsed !== null &&
        typeof parsed === "object" &&
        Array.isArray((parsed as { entries?: unknown }).entries)
      ? (parsed as { entries: unknown[] }).entries
      : null;
  if (raw === null) {
    throw new Error("Not a metric-log export: expected an entries array");
  }
  return raw.map((item, index) => {
    if (item === null || typeof item !== "object") {
      throw new Error(`Entry ${index} is not an object`);
    }
    const entry = item as Record<string, unknown>;
    const kind = entry.kind;
    const rating = entry.rating;
    if (typeof kind !== "string" || !METRIC_KINDS.has(kind)) {
      throw new Error(`Entry ${index} has unknown kind: ${String(kind)}`);
    }
    if (typeof rating !== "number" || !Number.isInteger(rating)) {
      throw new Error(`Entry ${index} has a non-integer rating`);
    }
    if (typeof entry.date !== "string" || typeof entry.loggedAt !== "string") {
      throw new Error(`Entry ${index} is missing date/loggedAt`);
    }
    return {
      kind,
      value: rating,
      date: parseISOString(entry.date),
      loggedAt: parseISOString(entry.loggedAt),
    };
  });
}
