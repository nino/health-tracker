import { metricById, symptomById } from "../catalog";
import { type EntryStore } from "./entryStore";

// Parses exported JSON — the Swift app's metric-log.json or this app's own
// export ({ exportedAt, entries } or a bare entry array) — into candidates
// for EntryStore.import. Malformed entries abort loudly (never a silent
// partial import); entries whose kind this app doesn't know are skipped and
// counted, so exports from newer versions degrade gracefully.

export interface ImportCandidate {
  kind: string;
  value: number;
  date: Date;
  loggedAt: Date;
  backend?: string;
  backendId?: string;
}

export interface ParsedExport {
  entries: ImportCandidate[];
  skippedUnknownKinds: number;
}

const ISO_RE =
  /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.\d+)?(Z|[+-]\d{2}:\d{2})$/;

// Strict on purpose: `new Date()` alone accepts garbage ("2024", "0", month
// rollovers like Feb 30) and dates whose year breaks ISO round-tripping,
// which would poison every later read of the store.
function parseStrictDate(value: unknown, index: number, field: string): Date {
  if (typeof value !== "string") {
    throw new Error(`Entry ${index} is missing ${field}`);
  }
  const match = ISO_RE.exec(value);
  if (!match) {
    throw new Error(`Entry ${index} has a malformed ${field}: ${value}`);
  }
  const year = Number(match[1]);
  if (year < 1970 || year > 2100) {
    throw new Error(`Entry ${index} has an implausible ${field} year: ${year}`);
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    throw new Error(`Entry ${index} has an invalid ${field}: ${value}`);
  }
  // Reject silently-rolled dates (Feb 30 → Mar 2): shift into the string's
  // own offset and compare every component against what was written.
  const offset = match[7];
  const offsetMinutes =
    offset === "Z"
      ? 0
      : (offset[0] === "-" ? -1 : 1) *
        (Number(offset.slice(1, 3)) * 60 + Number(offset.slice(4, 6)));
  const shifted = new Date(date.getTime() + offsetMinutes * 60_000);
  const matches =
    shifted.getUTCFullYear() === year &&
    shifted.getUTCMonth() + 1 === Number(match[2]) &&
    shifted.getUTCDate() === Number(match[3]) &&
    shifted.getUTCHours() === Number(match[4]) &&
    shifted.getUTCMinutes() === Number(match[5]) &&
    shifted.getUTCSeconds() === Number(match[6]);
  if (!matches) {
    throw new Error(`Entry ${index} has a nonexistent ${field}: ${value}`);
  }
  return date;
}

function validateValue(kind: string, rating: unknown, index: number): number {
  if (typeof rating !== "number" || !Number.isInteger(rating)) {
    throw new Error(`Entry ${index} has a non-integer rating`);
  }
  const metric = metricById(kind);
  if (metric) {
    if (rating < metric.min || rating > metric.max) {
      throw new Error(
        `Entry ${index} has an out-of-range ${kind} rating: ${rating}`,
      );
    }
    return rating;
  }
  const symptom = symptomById(kind);
  if (!symptom) throw new Error(`Entry ${index} has unknown kind: ${kind}`);
  if (!symptom.valueKind.options.some((o) => o.value === rating)) {
    throw new Error(
      `Entry ${index} has an invalid value for ${symptom.name}: ${rating}`,
    );
  }
  return rating;
}

export function parseExport(json: string): ParsedExport {
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
  const entries: ImportCandidate[] = [];
  let skippedUnknownKinds = 0;
  raw.forEach((item, index) => {
    if (item === null || typeof item !== "object") {
      throw new Error(`Entry ${index} is not an object`);
    }
    const entry = item as Record<string, unknown>;
    const kind = entry.kind;
    if (typeof kind !== "string") {
      throw new Error(`Entry ${index} has no kind`);
    }
    if (!metricById(kind) && !symptomById(kind)) {
      skippedUnknownKinds++;
      return;
    }
    entries.push({
      kind,
      value: validateValue(kind, entry.rating, index),
      date: parseStrictDate(entry.date, index, "date"),
      loggedAt: parseStrictDate(entry.loggedAt, index, "loggedAt"),
    });
  });
  return { entries, skippedUnknownKinds };
}

/** The one import path for user-provided JSON. Mood entries get HealthKit
 * provenance: the Swift app dual-wrote every mood to Apple Health, so
 * re-mirroring them would duplicate samples. (If the file came from a device
 * where mood never reached HealthKit, those entries are skipped rather than
 * risked as duplicates — a missing mirror is recoverable, a duplicate
 * health sample is not.) */
export function importEntriesFromJSON(
  store: EntryStore,
  json: string,
): { added: number; skippedUnknownKinds: number } {
  const parsed = parseExport(json);
  const added = store.import(
    parsed.entries.map((entry) =>
      entry.kind === "mood"
        ? { ...entry, backend: "healthkit", backendId: "swift-dual-write" }
        : entry,
    ),
  );
  return { added, skippedUnknownKinds: parsed.skippedUnknownKinds };
}
