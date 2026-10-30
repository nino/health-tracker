import Darwin
import ExpoModulesCore

public class LaunchTimingModule: Module {
  public func definition() -> ModuleDefinition {
    Name("ExpoLaunchTiming")

    // The launch's native milestones as Unix epoch milliseconds, or nil if
    // the process start time can't be read. contentAppeared is missing until
    // React Native has mounted its first content.
    Function("launch") { () -> [String: Any]? in
      guard let processStart = processStartMs(),
        let mainStart = LaunchTimingAppDelegateSubscriber.mainStartMs
      else {
        return nil
      }
      var result: [String: Any] = [
        "processStart": processStart,
        "mainStart": mainStart,
        "prewarmed": LaunchTimingAppDelegateSubscriber.prewarmed,
      ]
      if let contentAppeared = LaunchTimingAppDelegateSubscriber.contentAppearedMs {
        result["contentAppeared"] = contentAppeared
      }
      return result
    }
  }
}

/// When the kernel started this process.
private func processStartMs() -> Double? {
  var info = kinfo_proc()
  var size = MemoryLayout<kinfo_proc>.stride
  var mib: [Int32] = [CTL_KERN, KERN_PROC, KERN_PROC_PID, getpid()]
  guard sysctl(&mib, u_int(mib.count), &info, &size, nil, 0) == 0 else {
    return nil
  }
  let start = info.kp_proc.p_starttime
  return Double(start.tv_sec) * 1000 + Double(start.tv_usec) / 1000
}
