import ExpoModulesCore
import HealthKit

public class ExpoHealthKitModule: Module {
  public func definition() -> ModuleDefinition {
    Name("ExpoHealthKit")

    Function("isHealthDataAvailable") {
      HKHealthStore.isHealthDataAvailable()
    }
  }
}
