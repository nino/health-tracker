//
//  HealthKitManager.swift
//  health-tracker
//

import HealthKit

final class HealthKitManager {
    private let store = HKHealthStore()

    var isAvailable: Bool {
        HKHealthStore.isHealthDataAvailable()
    }

    func requestAuthorization() async throws {
        guard isAvailable else { return }
        var types: Set<HKSampleType> = Set(Symptom.allCases.map(\.categoryType))
        types.insert(HKSampleType.stateOfMindType())
        try await store.requestAuthorization(toShare: types, read: [])
    }

    // Maps a 1–10 mood rating onto State of Mind valence (-1...1), 5.5 being neutral.
    func saveMood(rating: Int, date: Date) async throws {
        try await requestAuthorization()
        let valence = (Double(rating) - 5.5) / 4.5
        let sample = HKStateOfMind(
            date: date,
            kind: .momentaryEmotion,
            valence: valence,
            labels: [],
            associations: []
        )
        try await store.save(sample)
    }

    func save(_ symptom: Symptom, severity: Severity, date: Date) async throws {
        try await requestAuthorization()
        let sample = HKCategorySample(
            type: symptom.categoryType,
            value: severity.hkValue.rawValue,
            start: date,
            end: date
        )
        try await store.save(sample)
    }
}
