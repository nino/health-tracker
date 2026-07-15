//
//  Perf.swift
//  health-tracker
//
//  Launch-performance instrumentation. Watch it live with:
//  Xcode console filter "perf", or Console.app subsystem com.ninoan.health-tracker.
//

import Foundation
import os

nonisolated enum Perf {
    static let log = Logger(subsystem: "com.ninoan.health-tracker", category: "perf")
    static let signposter = OSSignposter(subsystem: "com.ninoan.health-tracker", category: "perf")

    static func note(_ message: String) {
        log.notice("\(message, privacy: .public) [main=\(Thread.isMainThread)]")
    }
}

nonisolated extension Duration {
    var ms: Int {
        Int(Double(components.seconds) * 1000 + Double(components.attoseconds) / 1e15)
    }
}
