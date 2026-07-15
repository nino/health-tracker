//
//  InfoView.swift
//  health-tracker
//

import SwiftUI

struct InfoView: View {
    @Environment(\.dismiss) private var dismiss

    var body: some View {
        NavigationStack {
            List {
                Section("Logging") {
                    Text("Tap a symptom to log it. Pick a severity (or presence, for symptoms Apple Health tracks that way), adjust the date and time if you're logging something from earlier, and hit Save. Everything is written straight to Apple Health.")
                    Text("Save & Next saves the entry and immediately moves on to whatever you've logged least recently, so you can sweep through everything in one sitting.")
                    Text("Mood works the same way, using a 1–10 slider from very negative to very positive. It's saved as a State of Mind entry (a momentary emotion) in Apple Health, and also kept in the app.")
                    Text("Stress and anxiety use a 0–10 slider. Apple Health has no data type for them, so they live in the app only.")
                    Text("The chart icon in the toolbar shows the history of your moods, stress, anxiety, and enabled symptoms over time — tap or drag on a chart to inspect an entry.")
                }

                Section("Last Logged") {
                    Text("Each button shows how long ago you last logged it — symptoms come from the data in Apple Health; mood, stress, and anxiety from the app's own log. The color shows how stale it is:")
                    legendRow(.secondary, "Less than 2 hours ago")
                    legendRow(.green, "2–4 hours ago")
                    legendRow(.yellow, "4–8 hours ago")
                    legendRow(.orange, "8–24 hours ago")
                    legendRow(.red, "More than a day ago, or never")
                }

                Section("Random") {
                    Text("The Random button picks one of your symptoms to log, strongly preferring the ones you've logged least recently — something you logged minutes ago is very unlikely to come up again. Pressing it now and then helps you record the absence of symptoms you haven't been thinking about — useful data, too.")
                }

                Section("Choosing Symptoms") {
                    Text("The gear icon opens the full list of symptom types Apple Health supports. Toggle the ones you want on the main screen.")
                }

                Section("Your Data") {
                    Text("Symptoms live in Apple Health; you can view, edit, or delete them in the Health app. Mood, stress, and anxiety entries are also stored locally, because Apple Health's export doesn't include State of Mind data. Nothing is sent anywhere.")
                    Text("The gear icon has an export button that saves all mood, stress, and anxiety entries as a JSON file.")
                    Text("If you deny the app read access, buttons show \"never\" since Apple Health reports denied access the same as no data. Logging still works with write access alone.")
                }

                Section("Source Code") {
                    Text("This app is open source — it exists because entering data into Apple Health directly is more convoluted than it should be.")
                    Link(destination: URL(string: "https://github.com/nino/health-tracker")!) {
                        Label("github.com/nino/health-tracker", systemImage: "chevron.left.forwardslash.chevron.right")
                    }
                }
            }
            .navigationTitle("About")
            #if !os(macOS)
            .navigationBarTitleDisplayMode(.inline)
            #endif
            .toolbar {
                ToolbarItem(placement: .confirmationAction) {
                    Button("Done") { dismiss() }
                }
            }
        }
        #if os(macOS)
        .frame(minWidth: 420, minHeight: 520)
        #endif
    }

    private func legendRow(_ color: Color, _ text: String) -> some View {
        HStack(spacing: 10) {
            Circle()
                .fill(color)
                .frame(width: 10, height: 10)
            Text(text)
        }
    }
}

#Preview {
    InfoView()
}
