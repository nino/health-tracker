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
    // Gated on statusForAuthorizationRequest: an actual authorization request
    // makes healthd process all 40 types, which is expensive enough to jank
    // the UI — only pay that when the request would do something.
    func requestAuthorization() async throws {
        guard isAvailable else { return }
        var shareTypes: Set<HKSampleType> = Set(Symptom.all.map(\.categoryType))
        shareTypes.insert(HKSampleType.stateOfMindType())
        var readTypes: Set<HKObjectType> = Set(Symptom.all.map(\.categoryType))
        readTypes.insert(HKSampleType.stateOfMindType())
        let status = try await store.statusForAuthorizationRequest(toShare: shareTypes, read: readTypes)
        guard status == .shouldRequest else {
            Perf.note("authorization request skipped (status \(status.rawValue))")
            return
        }
        try await store.requestAuthorization(toShare: shareTypes, read: readTypes)
    }

    // Most recent sample date per symptom. Missing entries mean never logged —
    // or read access denied, which HealthKit deliberately reports the same way.
    // @concurrent forces this (and the task group children, which inherit its
    // context) onto the global executor — with NonisolatedNonsendingByDefault
    // they'd otherwise all run on the main actor and freeze the UI at launch.
    @concurrent
    nonisolated func lastLoggedDates(for symptoms: [Symptom]) async -> [Symptom: Date] {
        Perf.note("lastLoggedDates started (\(symptoms.count) symptoms)")
        let clock = ContinuousClock()
        var total = Duration.zero
        let dates = await withTaskGroup(of: (Symptom, Date?, Duration).self) { group in
            // Throttled to 4 in-flight queries at utility priority: a full-width
            // fan-out saturates healthd on a cold start, which lags the whole
            // UI even though this app's main thread is idle.
            var next = 0
            func enqueue() {
                guard next < symptoms.count else { return }
                let symptom = symptoms[next]
                next += 1
                let type = symptom.categoryType
                group.addTask(priority: .utility) { [store] in
                    let descriptor = HKSampleQueryDescriptor(
                        predicates: [.categorySample(type: type)],
                        sortDescriptors: [SortDescriptor(\.endDate, order: .reverse)],
                        limit: 1
                    )
                    var sample: HKCategorySample?
                    let time = await clock.measure {
                        sample = try? await descriptor.result(for: store).first
                    }
                    return (symptom, sample?.endDate, time)
                }
            }
            for _ in 0..<4 { enqueue() }

            var dates: [Symptom: Date] = [:]
            var slowest: (String, Duration) = ("", .zero)
            for await (symptom, date, time) in group {
                enqueue()
                total += time
                if time > slowest.1 {
                    slowest = (symptom.name, time)
                }
                if let date {
                    dates[symptom] = date
                }
            }
            Perf.note("slowest query: \(slowest.0) \(slowest.1.ms)ms")
            return dates
        }
        Perf.note("lastLoggedDates done, \(total.ms)ms total query time")
        return dates
    }

    // All State of Mind samples, oldest first, for the one-time import of mood
    // entries that predate the local MetricStore. Returns [] if read access is
    // denied (indistinguishable from no data).
    @concurrent
    nonisolated func allMoodSamples() async -> [(date: Date, valence: Double)] {
        let descriptor = HKSampleQueryDescriptor(
            predicates: [.stateOfMind()],
            sortDescriptors: [SortDescriptor(\.endDate, order: .forward)],
            limit: nil
        )
        guard let samples = try? await descriptor.result(for: store) else { return [] }
        return samples.map { ($0.endDate, $0.valence) }
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
