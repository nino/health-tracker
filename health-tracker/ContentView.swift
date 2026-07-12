//
//  ContentView.swift
//  health-tracker
//
//  Created by Nino Annighöfer on 2026-07-11.
//

import SwiftUI
import os

struct ContentView: View {
    private let healthKit = HealthKitManager()
    @State private var store = MetricStore()
    @State private var selectedSymptom: Symptom?
    @State private var selectedMetric: MetricKind?
    @State private var showingSettings = false
    @State private var showingInfo = false
    @State private var lastLogged: [Symptom: Date] = [:]
    @State private var lastMood: Date?
    @State private var hasLoadedDates = false
    @AppStorage("enabledSymptomIDs") private var enabledIDsStorage = Symptom.defaultEnabledStorage

    private var enabledSymptoms: [Symptom] {
        Symptom.enabled(from: enabledIDsStorage)
    }

    var body: some View {
        NavigationStack {
            ScrollView {
                TimelineView(.everyMinute) { context in
                    VStack(spacing: 12) {
                        LazyVGrid(columns: [GridItem(.flexible()), GridItem(.flexible())], spacing: 12) {
                            ForEach(MetricKind.allCases) { metric in
                                // Mood recency comes from HealthKit (it also sees
                                // entries made outside this app); stress/anxiety
                                // exist only in the local store.
                                logButton(
                                    metric.name,
                                    icon: metric.icon,
                                    lastDate: metric == .mood ? lastMood : store.lastDate(for: metric),
                                    now: context.date,
                                    pending: metric == .mood && !hasLoadedDates
                                ) {
                                    selectedMetric = metric
                                }
                            }

                            ForEach(enabledSymptoms) { symptom in
                                logButton(symptom.name, icon: symptom.icon, lastDate: lastLogged[symptom], now: context.date, pending: !hasLoadedDates) {
                                    selectedSymptom = symptom
                                }
                            }

                            if !enabledSymptoms.isEmpty {
                                Button {
                                    selectedSymptom = Symptom.weightedRandomByRecency(
                                        among: enabledSymptoms,
                                        lastLogged: lastLogged
                                    )
                                } label: {
                                    Label("Random", systemImage: "dice")
                                        .multilineTextAlignment(.center)
                                        .frame(maxWidth: .infinity, minHeight: 56)
                                }
                                .buttonStyle(.bordered)
                                .tint(.purple)
                            }
                        }

                        if enabledSymptoms.isEmpty {
                            Text("No symptoms enabled. Add some via the gear icon.")
                                .font(.footnote)
                                .foregroundStyle(.secondary)
                                .padding(.top)
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
                ToolbarItemGroup {
                    Button {
                        showingInfo = true
                    } label: {
                        Image(systemName: "info.circle")
                    }
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
        .sheet(item: $selectedMetric, onDismiss: refresh) { metric in
            MetricLogView(metric: metric, healthKit: healthKit, store: store)
        }
        .sheet(isPresented: $showingSettings, onDismiss: refresh) {
            SettingsView(store: store)
        }
        .sheet(isPresented: $showingInfo) {
            InfoView()
        }
        // Utility priority propagates through XPC to healthd, keeping the
        // launch-time HealthKit work from starving UI rendering.
        .task(priority: .utility) {
            Perf.note("first task started")
            let clock = ContinuousClock()
            let authState = Perf.signposter.beginInterval("authorization")
            let authTime = await clock.measure {
                try? await healthKit.requestAuthorization()
            }
            Perf.signposter.endInterval("authorization", authState)
            Perf.note("authorization done after \(authTime.ms)ms")
            let reloadState = Perf.signposter.beginInterval("reload")
            let reloadTime = await clock.measure {
                await reload()
            }
            Perf.signposter.endInterval("reload", reloadState)
            Perf.note("reload done after \(reloadTime.ms)ms")
        }
        .onAppear {
            Perf.note("ContentView appeared")
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
        pending: Bool,
        action: @escaping () -> Void
    ) -> some View {
        Button(action: action) {
            VStack(spacing: 2) {
                Label(title, systemImage: icon)
                    .multilineTextAlignment(.center)
                if lastDate == nil && pending {
                    ProgressView()
                        .controlSize(.mini)
                } else {
                    Text(lastLoggedText(lastDate, now: now))
                        .font(.caption)
                        .foregroundStyle(stalenessColor(lastDate, now: now))
                }
            }
            .frame(maxWidth: .infinity, minHeight: 56)
        }
        .buttonStyle(.bordered)
    }

    private func lastLoggedText(_ date: Date?, now: Date) -> String {
        guard let date else { return "never" }
        let minutes = Int(now.timeIntervalSince(date) / 60)
        if minutes < 60 { return "\(max(minutes, 0))m" }
        let hours = minutes / 60
        if hours < 24 { return "\(hours)h" }
        return "\(hours / 24)d"
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
        // Only the enabled symptoms ever show on screen, and enabling more in
        // settings re-triggers this via the sheet's onDismiss — so don't hit
        // healthd for all 39 types.
        async let mood = healthKit.lastMoodDate()
        async let dates = healthKit.lastLoggedDates(for: enabledSymptoms)
        lastMood = await mood
        lastLogged = await dates
        hasLoadedDates = true
    }
}

#Preview {
    ContentView()
}
