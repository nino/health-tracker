import ExpoModulesCore
import HealthKit

// The exact HealthKit surface the app needs — a port of the Swift app's
// HealthKitManager. The JS side owns the symptom catalog and passes
// HKCategoryTypeIdentifier raw values; nothing here hardcodes a symptom.
public class ExpoHealthKitModule: Module {
  private let store = HKHealthStore()

  private func categoryType(_ identifier: String) throws -> HKCategoryType {
    guard
      let type = HKObjectType.categoryType(
        forIdentifier: HKCategoryTypeIdentifier(rawValue: identifier))
    else {
      NSLog("[health-tracker] unknown HKCategoryTypeIdentifier: %@", identifier)
      throw Exception(
        name: "UnknownCategoryType",
        description: "Unknown HKCategoryTypeIdentifier: \(identifier)")
    }
    return type
  }

  public func definition() -> ModuleDefinition {
    Name("ExpoHealthKit")

    Function("isHealthDataAvailable") {
      HKHealthStore.isHealthDataAvailable()
    }

    // Requests access for every supported type up front (the JS catalog
    // passes all 39), so enabling a symptom later never re-prompts. The
    // caller gates this behind a local once-ever flag — an authorization
    // request makes healthd process all the types, which is expensive, and
    // the statusForAuthorizationRequest gate the Swift app uses hangs
    // indefinitely on iOS simulators, so it deliberately isn't used here.
    AsyncFunction("requestAuthorization") { (identifiers: [String]) in
      NSLog("[health-tracker] requestAuthorization called (%d identifiers)", identifiers.count)
      guard HKHealthStore.isHealthDataAvailable() else {
        NSLog("[health-tracker] health data unavailable, skipping authorization")
        return
      }
      var types: Set<HKSampleType> = Set(try identifiers.map { try self.categoryType($0) })
      if #available(iOS 18.0, *) {
        types.insert(HKSampleType.stateOfMindType())
      }
      // The authorization sheet is UI: HealthKit expects this call to
      // originate from the main thread, and Expo async functions run on a
      // background executor — calling from there hangs without ever
      // presenting.
      do {
        try await Task { @MainActor [store = self.store] in
          try await store.requestAuthorization(toShare: types, read: types)
        }.value
      } catch {
        NSLog("[health-tracker] authorization request failed: %@", String(describing: error))
        throw error
      }
      NSLog("[health-tracker] authorization request completed")
    }

    // Returns the saved sample's UUID so the local store can record it.
    AsyncFunction("saveCategorySample") {
      (identifier: String, value: Int, dateMs: Double) -> String in
      let date = Date(timeIntervalSince1970: dateMs / 1000)
      let sample = HKCategorySample(
        type: try self.categoryType(identifier),
        value: value,
        start: date,
        end: date
      )
      try await self.store.save(sample)
      return sample.uuid.uuidString
    }

    // Valence is -1...1 (the JS side owns the rating<->valence mapping).
    AsyncFunction("saveStateOfMind") { (valence: Double, dateMs: Double) -> String in
      guard #available(iOS 18.0, *) else {
        throw Exception(
          name: "StateOfMindUnavailable",
          description: "State of Mind requires iOS 18")
      }
      // Clamp: HKStateOfMind raises NSInvalidArgumentException (uncatchable
      // from Swift) for valence outside [-1, 1].
      let sample = HKStateOfMind(
        date: Date(timeIntervalSince1970: dateMs / 1000),
        kind: .momentaryEmotion,
        valence: max(-1, min(1, valence)),
        labels: [],
        associations: []
      )
      try await self.store.save(sample)
      return sample.uuid.uuidString
    }

    // Full history for one category type, oldest first. Returns [] when read
    // access is denied — HealthKit reports that identically to "no data".
    AsyncFunction("categorySamples") { (identifier: String) -> [[String: Any]] in
      let descriptor = HKSampleQueryDescriptor(
        predicates: [.categorySample(type: try self.categoryType(identifier))],
        sortDescriptors: [SortDescriptor(\.endDate, order: .forward)],
        limit: nil
      )
      guard let samples = try? await descriptor.result(for: self.store) else { return [] }
      return samples.map {
        [
          "uuid": $0.uuid.uuidString,
          "value": $0.value,
          "dateMs": $0.endDate.timeIntervalSince1970 * 1000,
        ]
      }
    }

    // All State of Mind samples, oldest first, for the one-time mood import.
    AsyncFunction("stateOfMindSamples") { () -> [[String: Any]] in
      guard #available(iOS 18.0, *) else { return [] }
      let descriptor = HKSampleQueryDescriptor(
        predicates: [.stateOfMind()],
        sortDescriptors: [SortDescriptor(\.endDate, order: .forward)],
        limit: nil
      )
      guard let samples = try? await descriptor.result(for: self.store) else { return [] }
      return samples.map {
        [
          "uuid": $0.uuid.uuidString,
          "valence": $0.valence,
          "dateMs": $0.endDate.timeIntervalSince1970 * 1000,
        ]
      }
    }
  }
}
