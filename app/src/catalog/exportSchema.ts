import { type CustomItemKind, customEntryKind } from "../store/customItems";
import { describeCustomRating } from "./custom";
import { METRICS } from "./metrics";
import { NOTE_KIND } from "./note";
import { SYMPTOMS } from "./symptoms";
import { VALUE_KINDS, type ValueKind } from "./valueKind";

// A JSON Schema (draft 2020-12) describing the export file, embedded in the
// export itself so the numbers are interpretable without this app: raw
// HealthKit values don't sort (Present = 0, Not Present = 1), and the
// meaning of `rating` depends on `kind`. Everything here derives from the
// catalog plus the custom items in the file, so it can't drift from what
// the app actually writes.

type Json = Record<string, unknown>;

/** The subset of a custom item the schema needs. */
export interface SchemaCustomItem {
  id: string;
  name: string;
  kind: CustomItemKind;
  highIsGood: boolean;
}

function labelledValues(kind: ValueKind): Json {
  return {
    type: "integer",
    oneOf: kind.options.map((o) => ({ const: o.value, title: o.label })),
  };
}

interface Scale {
  min: number;
  max: number;
  describe: (value: number) => string;
}

/** "1–2 Very Negative, 3–4 Negative, …" from a metric's describe(). */
function bands(metric: Scale): string {
  const parts: string[] = [];
  let start = metric.min;
  for (let v = metric.min; v <= metric.max; v++) {
    const next = v + 1;
    if (next > metric.max || metric.describe(next) !== metric.describe(v)) {
      const range = start === v ? `${start}` : `${start}–${v}`;
      parts.push(`${range} ${metric.describe(v)}`);
      start = next;
    }
  }
  return parts.join(", ");
}

function scale(metric: Scale, note: string): Json {
  return {
    type: "integer",
    minimum: metric.min,
    maximum: metric.max,
    description: `${note} ${bands(metric)}.`,
  };
}

/** One `if kind in [...] then rating is ...` branch. */
function branch(kinds: string[], rating: Json, extra: Json = {}): Json | null {
  if (kinds.length === 0) return null;
  return {
    if: { properties: { kind: { enum: kinds } } },
    then: { properties: { rating, ...extra } },
  };
}

export function exportSchema(customItems: SchemaCustomItem[]): Json {
  const symptomIds = (kind: ValueKind) =>
    SYMPTOMS.filter((s) => s.valueKind === kind).map((s) => s.id);
  const customIds = (kind: CustomItemKind) =>
    customItems
      .filter((i) => i.kind === kind)
      .map((i) => customEntryKind(i.id));
  const metric = (id: string): Scale => {
    const found = METRICS.find((m) => m.id === id);
    if (!found) throw new Error(`Unknown metric: ${id}`);
    return found;
  };
  const customRating: Scale = {
    min: 1,
    max: 10,
    describe: describeCustomRating,
  };

  const ratingBranches = [
    branch([...symptomIds(VALUE_KINDS.severity), ...customIds("severity")], {
      ...labelledValues(VALUE_KINDS.severity),
      description:
        "HKCategoryValueSeverity. 0 means the symptom was present with " +
        'no severity given (HealthKit\'s "unspecified"), not absent; ' +
        "1 is the absence value.",
    }),
    branch(symptomIds(VALUE_KINDS.presence), {
      ...labelledValues(VALUE_KINDS.presence),
      description: "HKCategoryValuePresence.",
    }),
    branch(symptomIds(VALUE_KINDS.appetite), {
      ...labelledValues(VALUE_KINDS.appetite),
      description: "HKCategoryValueAppetiteChanges.",
    }),
    branch(["mood"], scale(metric("mood"), "Higher is better.")),
    branch(
      ["stress", "anxiety"],
      scale(metric("stress"), "1 means none; higher is worse."),
    ),
    ...customItems
      .filter((i) => i.kind === "rating")
      .map((i) =>
        branch(
          [customEntryKind(i.id)],
          scale(
            customRating,
            i.highIsGood ? "Higher is better." : "Higher is worse.",
          ),
        ),
      ),
    branch(customIds("event"), {
      const: 1,
      description: "An occurrence; one entry per event.",
    }),
    branch(customIds("numeric"), {
      type: "number",
      description: "The number as typed; decimals allowed.",
    }),
    branch(
      [NOTE_KIND, ...customIds("text")],
      { const: 0, description: "Always 0; the content is in `text`." },
      { text: { type: "string" } },
    ),
  ].filter((b): b is Json => b !== null);

  const symptomNames = Object.fromEntries(SYMPTOMS.map((s) => [s.id, s.name]));
  const customNames = Object.fromEntries(
    customItems.map((i) => [customEntryKind(i.id), `${i.name} (${i.kind})`]),
  );

  return {
    $schema: "https://json-schema.org/draft/2020-12/schema",
    title: "Health Tracker export",
    description:
      "Every logged entry plus the definitions of user-created items. " +
      "What `rating` means depends on `kind`; see the per-kind rules under " +
      "entries.items.allOf. Timestamps are ISO 8601 with the local UTC offset.",
    type: "object",
    required: ["entries"],
    properties: {
      exportedAt: { type: "string", format: "date-time" },
      schema: { description: "This schema, so the file documents itself." },
      entries: {
        type: "array",
        description: "Oldest first, by `date`.",
        items: {
          type: "object",
          required: ["kind", "rating", "date"],
          properties: {
            id: { type: "string" },
            kind: {
              type: "string",
              description:
                "A HealthKit symptom identifier, a built-in metric (mood, " +
                'stress, anxiety), "note" for quick notes, or ' +
                '"custom:<id>" referencing customItems.',
              "x-names": { ...symptomNames, ...customNames },
            },
            rating: { type: "number" },
            text: { type: "string" },
            date: {
              type: "string",
              format: "date-time",
              description:
                "When the entry is for (user-set, may be backdated).",
            },
            loggedAt: {
              type: "string",
              format: "date-time",
              description: "When it was actually recorded.",
            },
          },
          allOf: ratingBranches,
        },
      },
      customItems: {
        type: "array",
        description:
          "User-defined items, archived ones included (their entries are " +
          "still in the file).",
        items: {
          type: "object",
          required: ["id", "name", "icon", "kind", "createdAt"],
          properties: {
            id: { type: "string" },
            name: { type: "string" },
            icon: { type: "string" },
            kind: {
              oneOf: [
                {
                  const: "severity",
                  title: "Same scale as a HealthKit symptom",
                },
                { const: "rating", title: "1–10 scale; see highIsGood" },
                { const: "event", title: "Occurrences; rating is always 1" },
                { const: "numeric", title: "Any number" },
                { const: "text", title: "Notes; rating 0, content in text" },
              ],
            },
            highIsGood: {
              type: "boolean",
              description: "Rating items only: whether 10 is the good end.",
            },
            createdAt: { type: "string", format: "date-time" },
            archivedAt: { type: ["string", "null"], format: "date-time" },
          },
        },
      },
    },
  };
}
