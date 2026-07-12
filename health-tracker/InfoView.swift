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
                    Text("Mood works the same way, using a 1–10 slider from very negative to very positive. It's saved as a State of Mind entry (a momentary emotion) in Apple Health.")
                }

                Section("Last Logged") {
                    Text("Each button shows how long ago you last logged that symptom, based on the data in Apple Health. The color shows how stale it is:")
                    legendRow(.secondary, "Less than 2 hours ago")
                    legendRow(.green, "2–4 hours ago")
                    legendRow(.yellow, "4–8 hours ago")
                    legendRow(.orange, "8–24 hours ago")
                    legendRow(.red, "More than a day ago, or never")
                }

                Section("Random") {
                    Text("The Random button picks one of your symptoms to log, slightly preferring the ones you've logged least recently. Pressing it now and then helps you record the absence of symptoms you haven't been thinking about — useful data, too.")
                }

                Section("Choosing Symptoms") {
                    Text("The gear icon opens the full list of symptom types Apple Health supports. Toggle the ones you want on the main screen.")
                }

                Section("Your Data") {
                    Text("Everything lives in Apple Health — this app stores nothing else and sends nothing anywhere. You can view, edit, or delete entries in the Health app.")
                    Text("If you deny the app read access, buttons show \"never\" since Apple Health reports denied access the same as no data. Logging still works with write access alone.")
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
