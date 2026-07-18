// Which HKCategoryValue enum a symptom type records. Numeric values verified
// against HKCategoryValues.h in the iOS 26.5 SDK (2026-07-15) — they must
// match what the Swift app writes, or histories diverge between the apps.

export type ValueKindName = "severity" | "presence" | "appetite";

export interface SymptomOption {
  label: string;
  /** The raw HKCategoryValue* value written to HealthKit. */
  value: number;
}

export interface ValueKind {
  name: ValueKindName;
  /** Picker options in display order (charts use the index as the y-axis). */
  options: SymptomOption[];
  sectionTitle: string;
}

// HKCategoryValueSeverity: Unspecified=0, NotPresent=1, Mild=2, Moderate=3, Severe=4.
// The UI's "Present" deliberately maps to Unspecified (0), same as the Swift app.
const severity: ValueKind = {
  name: "severity",
  options: [
    { label: "Not Present", value: 1 },
    { label: "Present", value: 0 },
    { label: "Mild", value: 2 },
    { label: "Moderate", value: 3 },
    { label: "Severe", value: 4 },
  ],
  sectionTitle: "Severity",
};

// HKCategoryValuePresence: Present=0, NotPresent=1.
const presence: ValueKind = {
  name: "presence",
  options: [
    { label: "Not Present", value: 1 },
    { label: "Present", value: 0 },
  ],
  sectionTitle: "Status",
};

// HKCategoryValueAppetiteChanges: Unspecified=0, NoChange=1, Decreased=2, Increased=3.
const appetite: ValueKind = {
  name: "appetite",
  options: [
    { label: "No Change", value: 1 },
    { label: "Decreased", value: 2 },
    { label: "Increased", value: 3 },
  ],
  sectionTitle: "Change",
};

export const VALUE_KINDS = { severity, presence, appetite } as const;
