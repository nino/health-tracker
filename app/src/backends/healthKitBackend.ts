import { HealthKit, type HKCategorySample } from "../../modules/health-kit";
import { moodRatingToValence, SYMPTOMS, valenceToMoodRating } from "../catalog";
import { type BackendSample, type HealthBackend } from "./types";

// Apple HealthKit: symptoms as category samples, mood as State of Mind.
// Stress/anxiety have no HealthKit type — they stay local-only ("none").

const SYMPTOM_IDS = new Set(SYMPTOMS.map((s) => s.id));

export const healthKitBackend: HealthBackend = {
  name: "healthkit",

  capability(kind) {
    if (!HealthKit?.isHealthDataAvailable()) return "none";
    return SYMPTOM_IDS.has(kind) || kind === "mood" ? "read-write" : "none";
  },

  async requestAuthorization() {
    await HealthKit?.requestAuthorization([...SYMPTOM_IDS]);
  },

  async write(kind, value, date) {
    if (!HealthKit) throw new Error("HealthKit module unavailable");
    if (kind === "mood") {
      return HealthKit.saveStateOfMind(
        moodRatingToValence(value),
        date.getTime(),
      );
    }
    return HealthKit.saveCategorySample(kind, value, date.getTime());
  },

  async history(kind): Promise<BackendSample[]> {
    if (!HealthKit) return [];
    if (kind === "mood") {
      const samples = await HealthKit.stateOfMindSamples();
      return samples.map((s) => ({
        backendId: s.uuid,
        // Exact inverse of the linear write mapping, clamped to 1-10.
        value: valenceToMoodRating(s.valence),
        date: new Date(s.dateMs),
      }));
    }
    const samples: HKCategorySample[] = await HealthKit.categorySamples(kind);
    return samples.map((s) => ({
      backendId: s.uuid,
      value: s.value,
      date: new Date(s.dateMs),
    }));
  },
};
