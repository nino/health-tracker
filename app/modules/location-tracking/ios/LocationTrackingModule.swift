import CoreLocation
import ExpoModulesCore
import UIKit

public class LocationTrackingModule: Module {
  public func definition() -> ModuleDefinition {
    Name("ExpoLocationTracking")

    Function("isEnabled") { () -> Bool in
      LocationRecorder.isEnabled
    }

    AsyncFunction("authorization") { () async -> String in
      await withCheckedContinuation { continuation in
        DispatchQueue.main.async {
          continuation.resume(returning: name(of: LocationRecorder.shared.authorization))
        }
      }
    }

    AsyncFunction("enable") { () async -> String in
      await withCheckedContinuation { continuation in
        DispatchQueue.main.async {
          LocationRecorder.shared.enable { status in
            continuation.resume(returning: name(of: status))
          }
        }
      }
    }

    AsyncFunction("disable") { () async in
      await withCheckedContinuation { (continuation: CheckedContinuation<Void, Never>) in
        DispatchQueue.main.async {
          LocationRecorder.shared.disable()
          continuation.resume()
        }
      }
    }

    AsyncFunction("pending") { () -> [[String: Any]] in
      LocationBuffer.shared.pending()
    }

    AsyncFunction("discard") { (ids: [String]) in
      LocationBuffer.shared.discard(ids: ids)
    }
  }
}

public class LocationTrackingAppDelegateSubscriber: ExpoAppDelegateSubscriber {
  // iOS relaunches the app in the background to deliver a visit or a
  // significant change; the event only arrives once monitoring is started
  // again. Does nothing (and creates no location manager) while recording is
  // switched off.
  public func application(
    _ application: UIApplication,
    didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]? = nil
  ) -> Bool {
    LocationRecorder.shared.resumeIfEnabled()
    // Again whenever the app comes forward: a launch before the first unlock
    // after a reboot can't read the flag, and that process would otherwise
    // never start monitoring. Starting twice is harmless. A notification
    // rather than applicationDidBecomeActive, which UIKit no longer calls
    // under the scene life cycle; the token is never removed.
    _ = NotificationCenter.default.addObserver(
      forName: UIApplication.didBecomeActiveNotification,
      object: nil,
      queue: .main
    ) { _ in
      LocationRecorder.shared.resumeIfEnabled()
    }
    return true
  }
}

private func name(of status: CLAuthorizationStatus) -> String {
  switch status {
  case .notDetermined: return "notDetermined"
  case .restricted: return "restricted"
  case .denied: return "denied"
  case .authorizedWhenInUse: return "whenInUse"
  case .authorizedAlways: return "always"
  @unknown default: return "denied"
  }
}
