//
//  Symptom.swift
//  health-tracker
//

import HealthKit

nonisolated struct SymptomOption: Identifiable, Hashable {
    let label: String
    let value: Int

    var id: Int { value }
}

nonisolated struct Symptom: Identifiable, Hashable {
    // Which HKCategoryValue enum the type records; see HKTypeIdentifiers.h.
    enum ValueKind: Hashable {
        case severity
        case presence
        case appetite

        var options: [SymptomOption] {
            switch self {
            case .severity: [
                SymptomOption(label: "Not Present", value: HKCategoryValueSeverity.notPresent.rawValue),
                SymptomOption(label: "Present", value: HKCategoryValueSeverity.unspecified.rawValue),
                SymptomOption(label: "Mild", value: HKCategoryValueSeverity.mild.rawValue),
                SymptomOption(label: "Moderate", value: HKCategoryValueSeverity.moderate.rawValue),
                SymptomOption(label: "Severe", value: HKCategoryValueSeverity.severe.rawValue),
            ]
            case .presence: [
                SymptomOption(label: "Not Present", value: HKCategoryValuePresence.notPresent.rawValue),
                SymptomOption(label: "Present", value: HKCategoryValuePresence.present.rawValue),
            ]
            case .appetite: [
                SymptomOption(label: "No Change", value: HKCategoryValueAppetiteChanges.noChange.rawValue),
                SymptomOption(label: "Decreased", value: HKCategoryValueAppetiteChanges.decreased.rawValue),
                SymptomOption(label: "Increased", value: HKCategoryValueAppetiteChanges.increased.rawValue),
            ]
            }
        }

        var defaultValue: Int {
            switch self {
            case .severity: HKCategoryValueSeverity.unspecified.rawValue
            case .presence: HKCategoryValuePresence.present.rawValue
            case .appetite: HKCategoryValueAppetiteChanges.noChange.rawValue
            }
        }

        var sectionTitle: String {
            switch self {
            case .severity: "Severity"
            case .presence: "Status"
            case .appetite: "Change"
            }
        }
    }

    let name: String
    let icon: String
    let identifier: HKCategoryTypeIdentifier
    let valueKind: ValueKind

    var id: String { identifier.rawValue }
    var categoryType: HKCategoryType { HKCategoryType(identifier) }

    private init(_ name: String, _ icon: String, _ identifier: HKCategoryTypeIdentifier, _ valueKind: ValueKind = .severity) {
        self.name = name
        self.icon = icon
        self.identifier = identifier
        self.valueKind = valueKind
    }

    // Every symptom type HealthKit supports, alphabetical.
    static let all: [Symptom] = [
        Symptom("Abdominal Cramps", "bolt", .abdominalCramps),
        Symptom("Acne", "bandage", .acne),
        Symptom("Appetite Changes", "fork.knife", .appetiteChanges, .appetite),
        Symptom("Bladder Incontinence", "drop", .bladderIncontinence),
        Symptom("Bloating", "circle.dashed", .bloating),
        Symptom("Breast Pain", "heart", .breastPain),
        Symptom("Chest Tightness or Pain", "lungs", .chestTightnessOrPain),
        Symptom("Chills", "snowflake", .chills),
        Symptom("Congestion", "nose", .sinusCongestion),
        Symptom("Constipation", "hourglass", .constipation),
        Symptom("Coughing", "wind", .coughing),
        Symptom("Diarrhea", "water.waves", .diarrhea),
        Symptom("Dizziness", "tornado", .dizziness),
        Symptom("Dry Skin", "hand.raised", .drySkin),
        Symptom("Fainting", "waveform.path.ecg", .fainting),
        Symptom("Fatigue", "zzz", .fatigue),
        Symptom("Fever", "thermometer.medium", .fever),
        Symptom("Generalized Body Ache", "figure.walk", .generalizedBodyAche),
        Symptom("Hair Loss", "scissors", .hairLoss),
        Symptom("Headache", "brain.head.profile", .headache),
        Symptom("Heartburn", "flame", .heartburn),
        Symptom("Hot Flashes", "thermometer.sun", .hotFlashes),
        Symptom("Loss of Smell", "allergens", .lossOfSmell),
        Symptom("Loss of Taste", "mouth", .lossOfTaste),
        Symptom("Lower Back Pain", "figure.stand", .lowerBackPain),
        Symptom("Memory Lapse", "brain", .memoryLapse),
        Symptom("Mood Changes", "face.smiling", .moodChanges, .presence),
        Symptom("Nausea", "face.dashed", .nausea),
        Symptom("Night Sweats", "moon.zzz", .nightSweats),
        Symptom("Pelvic Pain", "figure.arms.open", .pelvicPain),
        Symptom("Rapid, Pounding, or Fluttering Heartbeat", "bolt.heart", .rapidPoundingOrFlutteringHeartbeat),
        Symptom("Runny Nose", "drop", .runnyNose),
        Symptom("Shortness of Breath", "lungs", .shortnessOfBreath),
        Symptom("Skipped Heartbeat", "heart.slash", .skippedHeartbeat),
        Symptom("Sleep Changes", "bed.double", .sleepChanges, .presence),
        Symptom("Sore Throat", "mouth", .soreThroat),
        Symptom("Vaginal Dryness", "drop.halffull", .vaginalDryness),
        Symptom("Vomiting", "exclamationmark.circle", .vomiting),
        Symptom("Wheezing", "waveform.path", .wheezing),
    ]

    static let defaultEnabledStorage: String = [
        HKCategoryTypeIdentifier.headache,
        .nausea,
        .fatigue,
        .runnyNose,
        .soreThroat,
        .sinusCongestion,
    ].map(\.rawValue).sorted().joined(separator: ",")

    static func enabled(from storage: String) -> [Symptom] {
        let ids = Set(storage.split(separator: ",").map(String.init))
        return all.filter { ids.contains($0.id) }
    }

    // Random pick that slightly favors symptoms logged least recently, so
    // occasional "Random" logging spreads coverage across all symptoms.
    // Never-logged symptoms count as oldest. Weights run linearly from 1x
    // (most recent) to 3x (least recent) regardless of how many symptoms
    // are enabled — a nudge, not a guarantee.
    static func weightedRandomByRecency(among symptoms: [Symptom], lastLogged: [Symptom: Date]) -> Symptom? {
        guard symptoms.count > 1 else { return symptoms.first }
        let oldestFirst = symptoms.sorted {
            (lastLogged[$0] ?? .distantPast) < (lastLogged[$1] ?? .distantPast)
        }
        let step = 2.0 / Double(oldestFirst.count - 1)
        let weights = oldestFirst.indices.map { 1.0 + step * Double(oldestFirst.count - 1 - $0) }
        var remaining = Double.random(in: 0..<weights.reduce(0, +))
        for (symptom, weight) in zip(oldestFirst, weights) {
            remaining -= weight
            if remaining < 0 { return symptom }
        }
        return oldestFirst.last
    }
}
