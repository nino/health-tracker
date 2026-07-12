//
//  ContentView.swift
//  health-tracker
//
//  Created by Nino Annighöfer on 2026-07-11.
//

import SwiftUI

struct ContentView: View {
    private let healthKit = HealthKitManager()
    @State private var selectedSymptom: Symptom?
    @State private var showingMood = false
    @State private var showingSettings = false
    @State private var lastLogged: [Symptom: Date] = [:]
    @State private var lastMood: Date?
    @AppStorage("enabledSymptomIDs") private var enabledIDsStorage = Symptom.defaultEnabledStorage

    private var enabledSymptoms: [Symptom] {
        Symptom.enabled(from: enabledIDsStorage)
    }

    var body: some View {
        NavigationStack {
            ScrollView {
                TimelineView(.everyMinute) { context in
                    VStack(spacing: 12) {
                        logButton("Mood", icon: "face.smiling", lastDate: lastMood, now: context.date) {
                            showingMood = true
                        }

                        ForEach(enabledSymptoms) { symptom in
                            logButton(symptom.name, icon: symptom.icon, lastDate: lastLogged[symptom], now: context.date) {
                                selectedSymptom = symptom
                            }
                        }

                        if enabledSymptoms.isEmpty {
                            Text("No symptoms enabled. Add some via the gear icon.")
                                .font(.footnote)
                                .foregroundStyle(.secondary)
                                .padding(.top)
                        } else {
                            Button {
                                selectedSymptom = Symptom.weightedRandomByRecency(
                                    among: enabledSymptoms,
                                    lastLogged: lastLogged
                                )
                            } label: {
                                Label("Random", systemImage: "dice")
                                    .font(.title3)
                                    .frame(maxWidth: .infinity, minHeight: 44)
                            }
                            .buttonStyle(.bordered)
                            .tint(.purple)
                        }

                        if !healthKit.isAvailable {
                            Text("Health data isn't available on this device.")
                                .font(.footnote)
                                .foregroundStyle(.secondary)
                                .padding(.top)
                        }
                    }
                    .padding()
                }
            }
            .navigationTitle("Log Symptom")
            .toolbar {
                ToolbarItem {
                    Button {
                        showingSettings = true
                    } label: {
                        Image(systemName: "gearshape")
                    }
                }
            }
        }
        .sheet(item: $selectedSymptom, onDismiss: refresh) { symptom in
            SymptomLogView(symptom: symptom, healthKit: healthKit)
        }
        .sheet(isPresented: $showingMood, onDismiss: refresh) {
            MoodLogView(healthKit: healthKit)
        }
        .sheet(isPresented: $showingSettings, onDismiss: refresh) {
            SettingsView()
        }
        .task {
            try? await healthKit.requestAuthorization()
            await reload()
        }
        #if os(macOS)
        .frame(minWidth: 320, minHeight: 320)
        #endif
    }

    private func logButton(
        _ title: String,
        icon: String,
        lastDate: Date?,
        now: Date,
        action: @escaping () -> Void
    ) -> some View {
        Button(action: action) {
            VStack(spacing: 2) {
                Label(title, systemImage: icon)
                    .font(.title3)
                Text(lastLoggedText(lastDate))
                    .font(.caption)
                    .foregroundStyle(stalenessColor(lastDate, now: now))
            }
            .frame(maxWidth: .infinity, minHeight: 44)
        }
        .buttonStyle(.bordered)
    }

    private func lastLoggedText(_ date: Date?) -> String {
        guard let date else { return "Never logged" }
        if Calendar.current.isDateInToday(date) {
            return date.formatted(date: .omitted, time: .shortened)
        }
        return date.formatted(date: .abbreviated, time: .shortened)
    }

    private func stalenessColor(_ date: Date?, now: Date) -> Color {
        guard let date else { return .red }
        let hours = now.timeIntervalSince(date) / 3600
        switch hours {
        case ..<2: return .secondary
        case ..<4: return .green
        case ..<8: return .yellow
        case ..<24: return .orange
        default: return .red
        }
    }

    private func refresh() {
        Task { await reload() }
    }

    private func reload() async {
        lastMood = await healthKit.lastMoodDate()
        lastLogged = await healthKit.lastLoggedDates(for: Symptom.all)
    }
}

#Preview {
    ContentView()
}
