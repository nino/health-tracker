import CoreLocation
import Foundation

/// Records visits and significant location changes into `LocationBuffer`.
///
/// Both services are the cheap ones: iOS does the watching (cell towers and
/// Wi-Fi, no continuous GPS), wakes or relaunches the app for a few seconds
/// when there is something to deliver, and neither needs the `location`
/// background mode. For a relaunch to deliver its event, monitoring has to be
/// started again during launch — hence the persisted flag and
/// `LocationTrackingAppDelegateSubscriber`.
///
/// Main thread only: CLLocationManager delivers to the run loop of the thread
/// it was created on.
final class LocationRecorder: NSObject, CLLocationManagerDelegate {
  static let shared = LocationRecorder()

  private static let enabledKey = "locationTrackingEnabled"

  /// Whether the user switched recording on. Lives in UserDefaults, not the
  /// app's database, because a background launch has to read it before any
  /// JavaScript runs.
  static var isEnabled: Bool {
    UserDefaults.standard.bool(forKey: enabledKey)
  }

  private lazy var manager: CLLocationManager = {
    let manager = CLLocationManager()
    manager.delegate = self
    return manager
  }()

  private var authorizationWaiters: [(CLAuthorizationStatus) -> Void] = []

  var authorization: CLAuthorizationStatus {
    manager.authorizationStatus
  }

  /// Called during launch: picks monitoring back up if it is switched on.
  func resumeIfEnabled() {
    if Self.isEnabled {
      startMonitoring()
    }
  }

  /// Asks for access if it was never asked, then switches recording on
  /// unless access is denied or restricted.
  func enable(_ done: @escaping (CLAuthorizationStatus) -> Void) {
    requestAuthorization { status in
      if status == .authorizedAlways || status == .authorizedWhenInUse {
        UserDefaults.standard.set(true, forKey: Self.enabledKey)
        self.startMonitoring()
      }
      done(status)
    }
  }

  func disable() {
    UserDefaults.standard.set(false, forKey: Self.enabledKey)
    manager.stopMonitoringVisits()
    manager.stopMonitoringSignificantLocationChanges()
  }

  private func requestAuthorization(_ done: @escaping (CLAuthorizationStatus) -> Void) {
    let status = manager.authorizationStatus
    switch status {
    case .notDetermined:
      // Asking for Always straight away shows the ordinary sheet; "Allow
      // While Using App" then grants a provisional Always, and iOS itself
      // asks later whether to keep it.
      authorizationWaiters.append(done)
      manager.requestAlwaysAuthorization()
    case .authorizedWhenInUse:
      // Background delivery needs Always. iOS shows this upgrade prompt at
      // most once and reports nothing if the user declines, so don't wait.
      manager.requestAlwaysAuthorization()
      done(status)
    default:
      done(status)
    }
  }

  private func startMonitoring() {
    manager.startMonitoringVisits()
    if CLLocationManager.significantLocationChangeMonitoringAvailable() {
      manager.startMonitoringSignificantLocationChanges()
    }
  }

  // MARK: CLLocationManagerDelegate

  func locationManagerDidChangeAuthorization(_ manager: CLLocationManager) {
    let status = manager.authorizationStatus
    // Also called when the manager is created, possibly still undetermined.
    guard status != .notDetermined else { return }
    let waiters = authorizationWaiters
    authorizationWaiters = []
    for waiter in waiters {
      waiter(status)
    }
  }

  func locationManager(_ manager: CLLocationManager, didVisit visit: CLVisit) {
    guard Self.isEnabled, visit.horizontalAccuracy >= 0 else { return }
    var record: [String: Any] = [
      "id": UUID().uuidString,
      "kind": "visit",
      "latitude": visit.coordinate.latitude,
      "longitude": visit.coordinate.longitude,
      "accuracy": visit.horizontalAccuracy,
      "timestamp": epochMs(Date()),
    ]
    // distantPast / distantFuture stand for "not known (yet)".
    if visit.arrivalDate != .distantPast {
      record["arrival"] = epochMs(visit.arrivalDate)
    }
    if visit.departureDate != .distantFuture {
      record["departure"] = epochMs(visit.departureDate)
    }
    LocationBuffer.shared.append(record)
  }

  func locationManager(_ manager: CLLocationManager, didUpdateLocations locations: [CLLocation]) {
    guard Self.isEnabled else { return }
    for location in locations where location.horizontalAccuracy >= 0 {
      LocationBuffer.shared.append([
        "id": UUID().uuidString,
        "kind": "move",
        "latitude": location.coordinate.latitude,
        "longitude": location.coordinate.longitude,
        "accuracy": location.horizontalAccuracy,
        "timestamp": epochMs(location.timestamp),
      ])
    }
  }

  func locationManager(_ manager: CLLocationManager, didFailWithError error: Error) {
    // Nothing to do: a fix that couldn't be had is simply not recorded.
  }
}

private func epochMs(_ date: Date) -> Double {
  return (date.timeIntervalSince1970 * 1000).rounded()
}
