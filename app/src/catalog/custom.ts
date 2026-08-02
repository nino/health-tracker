import { customEntryKind, type CustomItem } from "../store/customItems";
import { type Metric } from "./metrics";
import { type Symptom } from "./symptoms";
import { VALUE_KINDS } from "./valueKind";

// Adapters that let custom items flow through every existing surface
// (tiles, log sheets, charts, next-up) as Symptom- or Metric-shaped
// objects — no custom-item branches in the UI beyond building these lists.

function describeCustomRating(value: number): string {
  if (value <= 2) return "Very Low";
  if (value <= 4) return "Low";
  if (value <= 6) return "Moderate";
  if (value <= 8) return "High";
  return "Very High";
}

/** A severity custom item, shaped like a built-in symptom. */
export function customItemToSymptom(item: CustomItem): Symptom {
  return {
    id: customEntryKind(item.id),
    name: item.name,
    icon: item.icon,
    valueKind: VALUE_KINDS.severity,
    healthConnectType: null,
  };
}

/** A rating custom item, shaped like a built-in metric (1–10). */
export function customItemToMetric(item: CustomItem): Metric {
  return {
    id: customEntryKind(item.id),
    name: item.name,
    icon: item.icon,
    min: 1,
    max: 10,
    describe: describeCustomRating,
  };
}
