import { VALUE_KINDS, type ValueKind } from "./valueKind";

export interface Symptom {
  /** The HKCategoryTypeIdentifier raw value — stable, platform-neutral, and
   * what the Swift app uses; doubles as the entry `kind` in the local store. */
  id: string;
  name: string;
  /** Emoji glyph (cross-platform; SF Symbols don't exist on Android). */
  icon: string;
  valueKind: ValueKind;
  /** Health Connect record type — null until Google ships symptom records. */
  healthConnectType: null;
}

function symptom(
  name: string,
  icon: string,
  hkName: string,
  valueKind: ValueKind = VALUE_KINDS.severity,
): Symptom {
  return {
    id: `HKCategoryTypeIdentifier${hkName}`,
    name,
    icon,
    valueKind,
    healthConnectType: null,
  };
}

// Every symptom type HealthKit supports, alphabetical — a 1:1 port of
// Symptom.all in the Swift app (ios/health-tracker/Symptom.swift). Adding a
// symptom stays one line.
export const SYMPTOMS: Symptom[] = [
  symptom("Abdominal Cramps", "⚡", "AbdominalCramps"),
  symptom("Acne", "🩹", "Acne"),
  symptom("Appetite Changes", "🍽️", "AppetiteChanges", VALUE_KINDS.appetite),
  symptom("Bladder Incontinence", "💧", "BladderIncontinence"),
  symptom("Bloating", "🎈", "Bloating"),
  symptom("Breast Pain", "❤️‍🩹", "BreastPain"),
  symptom("Chest Tightness or Pain", "💢", "ChestTightnessOrPain"),
  symptom("Chills", "❄️", "Chills"),
  symptom("Congestion", "👃", "SinusCongestion"),
  symptom("Constipation", "⏳", "Constipation"),
  symptom("Coughing", "😮‍💨", "Coughing"),
  symptom("Diarrhea", "🌊", "Diarrhea"),
  symptom("Dizziness", "🌀", "Dizziness"),
  symptom("Dry Skin", "🏜️", "DrySkin"),
  symptom("Fainting", "💫", "Fainting"),
  symptom("Fatigue", "😴", "Fatigue"),
  symptom("Fever", "🌡️", "Fever"),
  symptom("Generalized Body Ache", "🦴", "GeneralizedBodyAche"),
  symptom("Hair Loss", "✂️", "HairLoss"),
  symptom("Headache", "🤕", "Headache"),
  symptom("Heartburn", "🔥", "Heartburn"),
  symptom("Hot Flashes", "🥵", "HotFlashes"),
  symptom("Loss of Smell", "🌷", "LossOfSmell"),
  symptom("Loss of Taste", "👅", "LossOfTaste"),
  symptom("Lower Back Pain", "🧍", "LowerBackPain"),
  symptom("Memory Lapse", "🧠", "MemoryLapse"),
  symptom("Mood Changes", "🎭", "MoodChanges", VALUE_KINDS.presence),
  symptom("Nausea", "🤢", "Nausea"),
  symptom("Night Sweats", "🌙", "NightSweats"),
  symptom("Pelvic Pain", "🪑", "PelvicPain"),
  symptom(
    "Rapid, Pounding, or Fluttering Heartbeat",
    "💓",
    "RapidPoundingOrFlutteringHeartbeat",
  ),
  symptom("Runny Nose", "🤧", "RunnyNose"),
  symptom("Shortness of Breath", "🫁", "ShortnessOfBreath"),
  symptom("Skipped Heartbeat", "💔", "SkippedHeartbeat"),
  symptom("Sleep Changes", "🛏️", "SleepChanges", VALUE_KINDS.presence),
  symptom("Sore Throat", "😷", "SoreThroat"),
  symptom("Vaginal Dryness", "🌵", "VaginalDryness"),
  symptom("Vomiting", "🤮", "Vomiting"),
  symptom("Wheezing", "😤", "Wheezing"),
];

export const DEFAULT_ENABLED_SYMPTOM_IDS: string[] = [
  "HKCategoryTypeIdentifierHeadache",
  "HKCategoryTypeIdentifierNausea",
  "HKCategoryTypeIdentifierFatigue",
  "HKCategoryTypeIdentifierRunnyNose",
  "HKCategoryTypeIdentifierSoreThroat",
  "HKCategoryTypeIdentifierSinusCongestion",
];

export function symptomById(id: string): Symptom | undefined {
  return SYMPTOMS.find((s) => s.id === id);
}
