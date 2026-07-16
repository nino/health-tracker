import { Platform } from "react-native";

import { HealthKit, type HKCategorySample } from "../../modules/health-kit";
import { moodRatingToValence, SYMPTOMS, valenceToMoodRating } from "../catalog";
import { type BackendSample, type HealthBackend } from "./types";

// Apple HealthKit: symptoms as category samples, mood as State of Mind.
// Stress/anxiety have no HealthKit type — they stay local-only ("none").

const SYMPTOM_IDS = new Set(SYMPTOMS.map((s) => s.id));

// State of Mind exists only on iOS 18+; claiming mood capability below that
// would queue writes that are guaranteed to throw forever.
const IOS_MAJOR_VERSION =
  Platform.OS === "ios" ? parseInt(String(Platform.Version), 10) : 0;

export const healthKitBackend: HealthBackend = {
  name: "healthkit",

  capability(kind) {
    if (!HealthKit?.isHealthDataAvailable()) return "none";
    if (kind === "mood") {
      return IOS_MAJOR_VERSION >= 18 ? "read-write" : "none";
    }
    return SYMPTOM_IDS.has(kind) ? "read-write" : "none";
  },

  async requestAuthorization() {
    await HealthKit?.requestAuthorization([...SYMPTOM_IDS]);
  },

  async write(kind, value, date) {
    if (!HealthKit) throw new Error("HealthKit module unavailable");
    if (kind === "mood") {
      // Clamp defensively: HKStateOfMind raises an uncatchable
      // NSInvalidArgumentException for valence outside [-1, 1].
      const rating = Math.min(10, Math.max(1, value));
      return HealthKit.saveStateOfMind(
        moodRatingToValence(rating),
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
