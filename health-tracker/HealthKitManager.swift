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

    // Requests access for every supported symptom type up front, so enabling
    // a symptom later in settings doesn't trigger another permission prompt.
    func requestAuthorization() async throws {
        guard isAvailable else { return }
        var shareTypes: Set<HKSampleType> = Set(Symptom.all.map(\.categoryType))
        shareTypes.insert(HKSampleType.stateOfMindType())
        var readTypes: Set<HKObjectType> = Set(Symptom.all.map(\.categoryType))
        readTypes.insert(HKSampleType.stateOfMindType())
        try await store.requestAuthorization(toShare: shareTypes, read: readTypes)
    }

    // Most recent sample date per symptom. Missing entries mean never logged —
    // or read access denied, which HealthKit deliberately reports the same way.
    // Queries run in parallel off the main actor: doing them one at a time on
    // the main actor made cold launch visibly laggy.
    func lastLoggedDates(for symptoms: [Symptom]) async -> [Symptom: Date] {
        await withTaskGroup(of: (Symptom, Date?).self) { group in
            for symptom in symptoms {
                let type = symptom.categoryType
                group.addTask { [store] in
                    let descriptor = HKSampleQueryDescriptor(
                        predicates: [.categorySample(type: type)],
                        sortDescriptors: [SortDescriptor(\.endDate, order: .reverse)],
                        limit: 1
                    )
                    let sample = try? await descriptor.result(for: store).first
                    return (symptom, sample?.endDate)
                }
            }
            var dates: [Symptom: Date] = [:]
            for await (symptom, date) in group {
                if let date {
                    dates[symptom] = date
                }
            }
            return dates
        }
    }

    func lastMoodDate() async -> Date? {
        let descriptor = HKSampleQueryDescriptor(
            predicates: [.stateOfMind()],
            sortDescriptors: [SortDescriptor(\.endDate, order: .reverse)],
            limit: 1
        )
        return (try? await descriptor.result(for: store).first)?.endDate
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

    func save(_ symptom: Symptom, value: Int, date: Date) async throws {
        try await requestAuthorization()
        let sample = HKCategorySample(
            type: symptom.categoryType,
            value: value,
            start: date,
            end: date
        )
        try await store.save(sample)
    }
}
