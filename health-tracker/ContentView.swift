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
    @AppStorage("enabledSymptomIDs") private var enabledIDsStorage = Symptom.defaultEnabledStorage

    private var enabledSymptoms: [Symptom] {
        Symptom.enabled(from: enabledIDsStorage)
    }

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(spacing: 12) {
                    Button {
                        showingMood = true
                    } label: {
                        Label("Mood", systemImage: "face.smiling")
                            .font(.title3)
                            .frame(maxWidth: .infinity, minHeight: 44)
                    }
                    .buttonStyle(.bordered)

                    ForEach(enabledSymptoms) { symptom in
                        Button {
                            selectedSymptom = symptom
                        } label: {
                            Label(symptom.name, systemImage: symptom.icon)
                                .font(.title3)
                                .frame(maxWidth: .infinity, minHeight: 44)
                        }
                        .buttonStyle(.bordered)
                    }

                    if enabledSymptoms.isEmpty {
                        Text("No symptoms enabled. Add some via the gear icon.")
                            .font(.footnote)
                            .foregroundStyle(.secondary)
                            .padding(.top)
                    } else {
                        Button {
                            Task {
                                let lastLogged = await healthKit.lastLoggedDates(for: enabledSymptoms)
                                selectedSymptom = Symptom.weightedRandomByRecency(
                                    among: enabledSymptoms,
                                    lastLogged: lastLogged
                                )
                            }
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
        .sheet(item: $selectedSymptom) { symptom in
            SymptomLogView(symptom: symptom, healthKit: healthKit)
        }
        .sheet(isPresented: $showingMood) {
            MoodLogView(healthKit: healthKit)
        }
        .sheet(isPresented: $showingSettings) {
            SettingsView()
        }
        .task {
            try? await healthKit.requestAuthorization()
        }
        #if os(macOS)
        .frame(minWidth: 320, minHeight: 320)
        #endif
    }
}

#Preview {
    ContentView()
}
