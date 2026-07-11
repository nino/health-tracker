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

    // Random pick that slightly favors symptoms logged least recently, so
    // occasional "Random" logging spreads coverage across all symptoms.
    // Never-logged symptoms count as oldest. Weights step down by 0.5 from
    // oldest to newest, so the least recent is ~3.5x as likely as the most
    // recent — a nudge, not a guarantee.
    static func weightedRandomByRecency(lastLogged: [Symptom: Date]) -> Symptom {
        let oldestFirst = allCases.sorted {
            (lastLogged[$0] ?? .distantPast) < (lastLogged[$1] ?? .distantPast)
        }
        let weights = oldestFirst.indices.map { 1.0 + 0.5 * Double(oldestFirst.count - 1 - $0) }
        var remaining = Double.random(in: 0..<weights.reduce(0, +))
        for (symptom, weight) in zip(oldestFirst, weights) {
            remaining -= weight
            if remaining < 0 { return symptom }
        }
        return oldestFirst.last!
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
