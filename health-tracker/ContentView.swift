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

    var body: some View {
        NavigationStack {
            VStack(spacing: 12) {
                Button {
                    showingMood = true
                } label: {
                    Label("Mood", systemImage: "face.smiling")
                        .font(.title3)
                        .frame(maxWidth: .infinity, minHeight: 44)
                }
                .buttonStyle(.bordered)

                ForEach(Symptom.allCases) { symptom in
                    Button {
                        selectedSymptom = symptom
                    } label: {
                        Label(symptom.name, systemImage: symptom.icon)
                            .font(.title3)
                            .frame(maxWidth: .infinity, minHeight: 44)
                    }
                    .buttonStyle(.bordered)
                }

                Button {
                    selectedSymptom = Symptom.allCases.randomElement()
                } label: {
                    Label("Random", systemImage: "dice")
                        .font(.title3)
                        .frame(maxWidth: .infinity, minHeight: 44)
                }
                .buttonStyle(.bordered)
                .tint(.purple)

                if !healthKit.isAvailable {
                    Text("Health data isn't available on this device.")
                        .font(.footnote)
                        .foregroundStyle(.secondary)
                        .padding(.top)
                }

                Spacer()
            }
            .padding()
            .navigationTitle("Log Symptom")
        }
        .sheet(item: $selectedSymptom) { symptom in
            SymptomLogView(symptom: symptom, healthKit: healthKit)
        }
        .sheet(isPresented: $showingMood) {
            MoodLogView(healthKit: healthKit)
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
