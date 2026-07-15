// The in-app metrics — a port of MetricKind in the Swift app
// (ios/health-tracker/MetricStore.swift). Mood additionally mirrors to Apple
// Health as State of Mind; stress/anxiety have no OS health type anywhere.

export type MetricId = "mood" | "stress" | "anxiety";

export interface Metric {
  id: MetricId;
  name: string;
  icon: string;
  /** Mood keeps the established 1–10 scale (5.5 = neutral valence in Apple
   * Health); stress and anxiety are 0–10 so "none at all" is a real value. */
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
  if (value === 0) return "None";
  if (value <= 2) return "Minimal";
  if (value <= 4) return "Mild";
  if (value <= 6) return "Moderate";
  if (value <= 8) return "High";
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
    min: 0,
    max: 10,
    describe: describeLoad,
  },
  {
    id: "anxiety",
    name: "Anxiety",
    icon: "😰",
    min: 0,
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
