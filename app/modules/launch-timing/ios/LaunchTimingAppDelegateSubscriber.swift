import ExpoModulesCore

/// The launch's native milestones, as Unix epoch milliseconds. Written on
/// the main thread during launch and read from the JS thread, hence the lock.
final class LaunchTimes: @unchecked Sendable {
  static let shared = LaunchTimes()

  private let lock = NSLock()
  private var mainStart: Double?
  private var prewarmed = false
  private var contentAppeared: Double?

  func markMainStart(prewarmed: Bool) {
    lock.lock()
    defer { lock.unlock() }
    mainStart = nowMs()
    self.prewarmed = prewarmed
  }

  func markContentAppeared() {
    lock.lock()
    defer { lock.unlock() }
    if contentAppeared == nil {
      contentAppeared = nowMs()
    }
  }

  func snapshot() -> (mainStart: Double?, prewarmed: Bool, contentAppeared: Double?) {
    lock.lock()
    defer { lock.unlock() }
    return (mainStart, prewarmed, contentAppeared)
  }
}

public class LaunchTimingAppDelegateSubscriber: ExpoAppDelegateSubscriber {
  // Runs during main(), as the AppDelegate starts initializing.
  public func appDelegateWillBeginInitialization() {
    // iOS sets this for a prewarmed launch, where the process started long
    // before the user opened the app; it's removed once launching finishes.
    let prewarmed = ProcessInfo.processInfo.environment["ActivePrewarm"] == "1"
    LaunchTimes.shared.markMainStart(prewarmed: prewarmed)
    // React Native posts this (on the main queue) once the root view has
    // mounted its first content: the next frame shows the app. The token is
    // never removed; the handler is one comparison after the first time.
    _ = NotificationCenter.default.addObserver(
      forName: NSNotification.Name("RCTContentDidAppearNotification"),
      object: nil,
      queue: nil
    ) { _ in
      LaunchTimes.shared.markContentAppeared()
    }
  }
}

func nowMs() -> Double {
  return Date().timeIntervalSince1970 * 1000
}
