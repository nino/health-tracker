// The in-app metrics — a port of MetricKind in the Swift app
// (ios/health-tracker/MetricStore.swift). Mood additionally mirrors to Apple
// Health as State of Mind; stress/anxiety have no OS health type anywhere.

export type MetricId = "mood" | "stress" | "anxiety";

export interface Metric {
  /** A MetricId for the built-ins; "custom:<id>" for custom rating items. */
  id: string;
  name: string;
  icon: string;
  /** All metrics are 1–10 (mood: 5.5 = neutral valence in Apple Health;
   * stress/anxiety: 1 = "none"). Stress/anxiety were 0–10 before schema v4 —
   * that migration and the JSON import fold old zeros into 1. */
  min: number;
  max: number;
  describe: (value: number) => string;
}

function describeMood(value: number): string {
  if (value <= 2) return "Very Negative";
  if (value <= 4) return "Negative";
  if (value <= 6) return "Neutral";
  if (value <= 8) return "Positive";
  return "Very Positive";
}

function describeLoad(value: number): string {
  if (value === 1) return "None";
  if (value <= 3) return "Minimal";
  if (value <= 5) return "Mild";
  if (value <= 7) return "Moderate";
  if (value <= 9) return "High";
  return "Extreme";
}

export const METRICS: Metric[] = [
  {
    id: "mood",
    name: "Mood",
    icon: "😊",
    min: 1,
    max: 10,
    describe: describeMood,
  },
  {
    id: "stress",
    name: "Stress",
    icon: "😬",
    min: 1,
    max: 10,
    describe: describeLoad,
  },
  {
    id: "anxiety",
    name: "Anxiety",
    icon: "😰",
    min: 1,
    max: 10,
    describe: describeLoad,
  },
];

export function metricById(id: string): Metric | undefined {
  return METRICS.find((m) => m.id === id);
}

/** Maps a 1–10 mood rating onto State of Mind valence (-1...1), 5.5 neutral. */
export function moodRatingToValence(rating: number): number {
  return (rating - 5.5) / 4.5;
}

/** Inverse of moodRatingToValence, clamped to the 1–10 scale. */
export function valenceToMoodRating(valence: number): number {
  return Math.min(10, Math.max(1, Math.round(valence * 4.5 + 5.5)));
}
