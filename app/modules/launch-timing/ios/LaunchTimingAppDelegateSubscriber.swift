import ExpoModulesCore

/// Records when the app's own code starts and when React Native's first
/// content is mounted. All times are Unix epoch milliseconds.
public class LaunchTimingAppDelegateSubscriber: ExpoAppDelegateSubscriber {
  // Written once on the main thread during launch, read later from JS.
  nonisolated(unsafe) static var mainStartMs: Double?
  nonisolated(unsafe) static var prewarmed = false
  nonisolated(unsafe) static var contentAppearedMs: Double?
  nonisolated(unsafe) private static var observer: NSObjectProtocol?

  // Runs during main(), as the AppDelegate starts initializing.
  public func appDelegateWillBeginInitialization() {
    Self.mainStartMs = nowMs()
    // iOS sets this for a prewarmed launch, where the process started long
    // before the user opened the app; it's removed once launching finishes.
    Self.prewarmed = ProcessInfo.processInfo.environment["ActivePrewarm"] == "1"
    // React Native posts this (on the main queue) once the root view has
    // mounted its first content: the next frame shows the app.
    Self.observer = NotificationCenter.default.addObserver(
      forName: NSNotification.Name("RCTContentDidAppearNotification"),
      object: nil,
      queue: nil
    ) { _ in
      if Self.contentAppearedMs == nil {
        Self.contentAppearedMs = nowMs()
      }
      if let observer = Self.observer {
        NotificationCenter.default.removeObserver(observer)
        Self.observer = nil
      }
    }
  }
}

func nowMs() -> Double {
  return Date().timeIntervalSince1970 * 1000
}
