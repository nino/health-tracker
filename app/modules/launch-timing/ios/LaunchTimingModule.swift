import Darwin
import ExpoModulesCore

public class LaunchTimingModule: Module {
  public func definition() -> ModuleDefinition {
    Name("ExpoLaunchTiming")

    // The launch's native milestones as Unix epoch milliseconds, or nil if
    // the process start time can't be read. contentAppeared is missing until
    // React Native has mounted its first content.
    Function("launch") { () -> [String: Any]? in
      let times = LaunchTimes.shared.snapshot()
      guard let processStart = processStartMs(), let mainStart = times.mainStart
      else {
        return nil
      }
      var result: [String: Any] = [
        "processStart": processStart,
        "mainStart": mainStart,
        "prewarmed": times.prewarmed,
      ]
      if let contentAppeared = times.contentAppeared {
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
  // `p_starttime` is a C macro for this union member; Swift can't see macros.
  let start = info.kp_proc.p_un.__p_starttime
  return Double(start.tv_sec) * 1000 + Double(start.tv_usec) / 1000
}
