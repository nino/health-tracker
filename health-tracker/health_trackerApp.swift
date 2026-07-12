//
//  health_trackerApp.swift
//  health-tracker
//
//  Created by Nino Annighöfer on 2026-07-11.
//

import SwiftUI

@main
struct health_trackerApp: App {
    init() {
        Perf.note("app init")
    }

    var body: some Scene {
        WindowGroup {
            ContentView()
        }
    }
}
