import { METRICS, SYMPTOMS } from "../catalog";
import { NOTE_KIND } from "../catalog/note";
import { CUSTOM_KIND_PREFIX } from "../store/customItems";

// The complete vocabulary of what telemetry may say. Usage events carry no
// value, text, date or specific symptom — at most a coarse category.

export type EntryCategory = "symptom" | "metric" | "custom" | "note" | "other";

export type UsageEvent =
  { name: "app_opened" } | { name: "entry_logged"; category: EntryCategory };

/** Where a caught error came from — a fixed set, never free text. */
export type ErrorContext =
  | "uncaught"
  | "unhandled-rejection"
  | "query"
  | "startup-sync"
  | "mirror"
  | "import"
  | "export";

/** Extra, non-identifying detail an error report may carry. */
export type ErrorExtra = { backend?: string; entry_category?: EntryCategory };

const METRIC_IDS = new Set<string>(METRICS.map((m) => m.id));
const SYMPTOM_IDS = new Set<string>(SYMPTOMS.map((s) => s.id));

export function entryCategory(kind: string): EntryCategory {
  if (kind === NOTE_KIND) return "note";
  if (kind.startsWith(CUSTOM_KIND_PREFIX)) return "custom";
  if (METRIC_IDS.has(kind)) return "metric";
  if (SYMPTOM_IDS.has(kind)) return "symptom";
  return "other";
}
