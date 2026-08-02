import { metricById, symptomById, VALUE_KINDS } from "../catalog";
import { NOTE_KIND } from "../catalog/note";
import { toLocalISOString } from "../lib/dates";
import { CUSTOM_KIND_PREFIX, type CustomItemKind } from "./customItems";
import { type SqlDriver } from "./driver";
import { type EntryStore } from "./entryStore";

// Parses exported JSON — the Swift app's metric-log.json or this app's own
// export ({ exportedAt, entries, customItems? } or a bare entry array) —
// into candidates for EntryStore.import. Malformed entries abort loudly
// (never a silent partial import); entries whose kind this app doesn't know
// are skipped and counted, so exports from newer versions degrade
// gracefully.

export interface ImportCandidate {
  kind: string;
  value: number;
  valueText?: string;
  date: Date;
  loggedAt: Date;
  backend?: string;
  backendId?: string;
}

/** A custom-item definition as it appears in an export file. */
export interface CustomItemCandidate {
  id: string;
  name: string;
  icon: string;
  kind: CustomItemKind;
  highIsGood: boolean;
  createdAt: Date;
  archivedAt: Date | null;
}

export interface ParsedExport {
  entries: ImportCandidate[];
  customItems: CustomItemCandidate[];
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

const SEVERITY_VALUES = new Set(
  VALUE_KINDS.severity.options.map((o) => o.value),
);

function validateValue(
  kind: string,
  rating: unknown,
  index: number,
  customKinds: Map<string, CustomItemKind>,
): number {
  if (typeof rating !== "number" || !Number.isInteger(rating)) {
    throw new Error(`Entry ${index} has a non-integer rating`);
  }
  const customKind = customKinds.get(kind);
  if (customKind === "severity") {
    if (!SEVERITY_VALUES.has(rating)) {
      throw new Error(
        `Entry ${index} has an invalid severity value for ${kind}: ${rating}`,
      );
    }
    return rating;
  }
  if (customKind === "rating") {
    if (rating < 1 || rating > 10) {
      throw new Error(
        `Entry ${index} has an out-of-range ${kind} rating: ${rating}`,
      );
    }
    return rating;
  }
  if (customKind === "event") {
    if (rating !== 1) {
      throw new Error(
        `Entry ${index} has an invalid event value for ${kind}: ${rating}`,
      );
    }
    return rating;
  }
  if (kind === NOTE_KIND) {
    if (rating !== 0) {
      throw new Error(`Entry ${index} has a non-zero note value: ${rating}`);
    }
    return rating;
  }
  const metric = metricById(kind);
  if (metric) {
    // Exports written before schema v4 have 0–10 stress/anxiety; fold the
    // zeros into 1 ("none"), the same mapping the v4 migration applied.
    const value =
      rating === 0 && (kind === "stress" || kind === "anxiety") ? 1 : rating;
    if (value < metric.min || value > metric.max) {
      throw new Error(
        `Entry ${index} has an out-of-range ${kind} rating: ${rating}`,
      );
    }
    return value;
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

function requireString(value: unknown, index: number, field: string): string {
  if (typeof value !== "string" || value === "") {
    throw new Error(`Custom item ${index} has a missing or empty ${field}`);
  }
  return value;
}

function parseCustomItems(parsed: unknown): CustomItemCandidate[] {
  if (parsed === null || typeof parsed !== "object") return [];
  const raw = (parsed as { customItems?: unknown }).customItems;
  if (raw === undefined) return []; // pre-custom-items export
  if (!Array.isArray(raw)) {
    throw new Error("customItems is not an array");
  }
  return raw.map((item, index) => {
    if (item === null || typeof item !== "object") {
      throw new Error(`Custom item ${index} is not an object`);
    }
    const record = item as Record<string, unknown>;
    const kind = record.kind;
    if (kind !== "severity" && kind !== "rating" && kind !== "event") {
      throw new Error(
        `Custom item ${index} has an unknown kind: ${String(kind)}`,
      );
    }
    return {
      id: requireString(record.id, index, "id"),
      name: requireString(record.name, index, "name"),
      icon: requireString(record.icon, index, "icon"),
      kind,
      highIsGood: kind === "rating" && record.highIsGood === true,
      createdAt: parseStrictDate(record.createdAt, index, "createdAt"),
      archivedAt:
        record.archivedAt === null || record.archivedAt === undefined
          ? null
          : parseStrictDate(record.archivedAt, index, "archivedAt"),
    };
  });
}

/** `knownCustomKinds` maps entry kinds ("custom:<id>") of already-stored
 * custom items — entries for those import even when the file predates its
 * item or omits the definition. */
export function parseExport(
  json: string,
  knownCustomKinds: Map<string, CustomItemKind> = new Map(),
): ParsedExport {
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
  const customItems = parseCustomItems(parsed);
  const customKinds = new Map(knownCustomKinds);
  for (const item of customItems) {
    const key = `${CUSTOM_KIND_PREFIX}${item.id}`;
    // On an id conflict the device's definition wins (matching the INSERT
    // OR IGNORE in importEntriesFromJSON) — values must validate against
    // the kind the entries will actually live under, not the file's claim.
    if (!customKinds.has(key)) customKinds.set(key, item.kind);
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
    const isKnownCustom = customKinds.has(kind);
    if (
      !isKnownCustom &&
      kind !== NOTE_KIND &&
      !metricById(kind) &&
      !symptomById(kind)
    ) {
      skippedUnknownKinds++;
      return;
    }
    const candidate: ImportCandidate = {
      kind,
      value: validateValue(kind, entry.rating, index, customKinds),
      date: parseStrictDate(entry.date, index, "date"),
      loggedAt: parseStrictDate(entry.loggedAt, index, "loggedAt"),
    };
    if (kind === NOTE_KIND) {
      if (typeof entry.text !== "string" || entry.text.trim() === "") {
        throw new Error(`Entry ${index} is a note without text`);
      }
      candidate.valueText = entry.text;
    }
    entries.push(candidate);
  });
  return { entries, customItems, skippedUnknownKinds };
}

/** The one import path for user-provided JSON. Restores custom-item
 * definitions before entries (INSERT OR IGNORE — a definition already on
 * this device wins over the file's copy). Mood entries get HealthKit
 * provenance: the Swift app dual-wrote every mood to Apple Health, so
 * re-mirroring them would duplicate samples. (If the file came from a device
 * where mood never reached HealthKit, those entries are skipped rather than
 * risked as duplicates — a missing mirror is recoverable, a duplicate
 * health sample is not.) */
export function importEntriesFromJSON(
  store: EntryStore,
  db: SqlDriver,
  json: string,
): { added: number; skippedUnknownKinds: number } {
  const known = new Map<string, CustomItemKind>(
    db
      .all<{ id: string; kind: string }>(`SELECT id, kind FROM custom_items`)
      .map((row) => [
        `${CUSTOM_KIND_PREFIX}${row.id}`,
        row.kind as CustomItemKind,
      ]),
  );
  const parsed = parseExport(json, known);
  for (const item of parsed.customItems) {
    db.run(
      `INSERT OR IGNORE INTO custom_items
         (id, name, icon, kind, high_is_good, created_at, archived_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [
        item.id,
        item.name,
        item.icon,
        item.kind,
        item.highIsGood ? 1 : 0,
        toLocalISOString(item.createdAt),
        item.archivedAt === null ? null : toLocalISOString(item.archivedAt),
      ],
    );
  }
  const added = store.import(
    parsed.entries.map((entry) =>
      entry.kind === "mood"
        ? { ...entry, backend: "healthkit", backendId: "swift-dual-write" }
        : entry,
    ),
  );
  return { added, skippedUnknownKinds: parsed.skippedUnknownKinds };
}
