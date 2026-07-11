//
//  Symptom.swift
//  health-tracker
//

import HealthKit

enum Symptom: String, CaseIterable, Identifiable {
    case headache
    case nausea
    case fatigue
    case runnyNose
    case soreThroat
    case congestion

    var id: String { rawValue }

    var name: String {
        switch self {
        case .headache: "Headache"
        case .nausea: "Nausea"
        case .fatigue: "Fatigue"
        case .runnyNose: "Runny Nose"
        case .soreThroat: "Sore Throat"
        case .congestion: "Congestion"
        }
    }

    var icon: String {
        switch self {
        case .headache: "brain.head.profile"
        case .nausea: "face.dashed"
        case .fatigue: "zzz"
        case .runnyNose: "drop"
        case .soreThroat: "mouth"
        case .congestion: "nose"
        }
    }

    var categoryType: HKCategoryType {
        switch self {
        case .headache: HKCategoryType(.headache)
        case .nausea: HKCategoryType(.nausea)
        case .fatigue: HKCategoryType(.fatigue)
        case .runnyNose: HKCategoryType(.runnyNose)
        case .soreThroat: HKCategoryType(.soreThroat)
        case .congestion: HKCategoryType(.sinusCongestion)
        }
    }
}

enum Severity: CaseIterable, Identifiable {
    case notPresent
    case present
    case mild
    case moderate
    case severe

    var id: Self { self }

    var label: String {
        switch self {
        case .notPresent: "Not Present"
        case .present: "Present"
        case .mild: "Mild"
        case .moderate: "Moderate"
        case .severe: "Severe"
        }
    }

    // "Present" without a severity is stored as .unspecified, matching the Health app.
    var hkValue: HKCategoryValueSeverity {
        switch self {
        case .notPresent: .notPresent
        case .present: .unspecified
        case .mild: .mild
        case .moderate: .moderate
        case .severe: .severe
        }
    }
}
