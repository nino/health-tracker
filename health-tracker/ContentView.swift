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
    @State private var showingHistory = false
    @State private var lastLogged: [Symptom: Date] = [:]
    @State private var hasLoadedDates = false
    @AppStorage("enabledSymptomIDs") private var enabledIDsStorage = Symptom.defaultEnabledStorage
    @AppStorage("didImportHealthKitMood") private var didImportHealthKitMood = false

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
                                logButton(
                                    metric.name,
                                    icon: metric.icon,
                                    lastDate: store.lastDate(for: metric),
                                    now: context.date,
                                    pending: false
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
                                    HStack(spacing: 10) {
                                        Image(systemName: "dice")
                                            .font(.title3)
                                            .foregroundStyle(.purple)
                                            .frame(width: 26)
                                        Text("Random")
                                            .fontWeight(.medium)
                                            .foregroundStyle(.primary)
                                        Spacer(minLength: 0)
                                    }
                                    .padding(.horizontal, 14)
                                    .frame(maxWidth: .infinity, minHeight: 64, alignment: .leading)
                                    .background(cardColor, in: RoundedRectangle(cornerRadius: 16))
                                    .overlay(
                                        RoundedRectangle(cornerRadius: 16)
                                            .strokeBorder(.quaternary, lineWidth: 1)
                                    )
                                }
                                .buttonStyle(CardButtonStyle())
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
            .background(screenColor.ignoresSafeArea())
            .navigationTitle("Log Symptom")
            .toolbar {
                ToolbarItemGroup {
                    Button {
                        showingHistory = true
                    } label: {
                        Image(systemName: "chart.xyaxis.line")
                    }
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
        .sheet(isPresented: $showingHistory) {
            MetricHistoryView(store: store, symptoms: enabledSymptoms, healthKit: healthKit)
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
            await importLegacyMood()
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
            // Card layout: text wears text colors for contrast; the tinted icon
            // and the staleness dot carry the color.
            HStack(spacing: 10) {
                Image(systemName: icon)
                    .font(.title3)
                    .foregroundStyle(.tint)
                    .frame(width: 26)
                VStack(alignment: .leading, spacing: 3) {
                    Text(title)
                        .fontWeight(.medium)
                        .foregroundStyle(.primary)
                        .multilineTextAlignment(.leading)
                    if lastDate == nil && pending {
                        ProgressView()
                            .controlSize(.mini)
                    } else {
                        HStack(spacing: 4) {
                            Circle()
                                .fill(stalenessColor(lastDate, now: now))
                                .frame(width: 8, height: 8)
                            Text(lastLoggedText(lastDate, now: now))
                                .foregroundStyle(.secondary)
                        }
                        .font(.caption)
                    }
                }
                Spacer(minLength: 0)
            }
            .padding(.horizontal, 14)
            .padding(.vertical, 10)
            .frame(maxWidth: .infinity, minHeight: 64, alignment: .leading)
            .background(cardColor, in: RoundedRectangle(cornerRadius: 16))
            .overlay(
                RoundedRectangle(cornerRadius: 16)
                    .strokeBorder(.quaternary, lineWidth: 1)
            )
        }
        .buttonStyle(CardButtonStyle())
    }

    private var cardColor: Color {
        #if os(macOS)
        Color(nsColor: .controlBackgroundColor)
        #else
        Color(uiColor: .secondarySystemGroupedBackground)
        #endif
    }

    private var screenColor: Color {
        #if os(macOS)
        Color(nsColor: .windowBackgroundColor)
        #else
        Color(uiColor: .systemGroupedBackground)
        #endif
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

    // One-time pull of State of Mind entries that predate the local store, so
    // old moods show in history/recency/export. Runs after the launch reload at
    // utility priority; the flag keeps it off the steady-state launch path.
    // Caveat: if read access is denied, this imports nothing and doesn't retry.
    private func importLegacyMood() async {
        guard !didImportHealthKitMood else { return }
        let samples = await healthKit.allMoodSamples()
        let rated = samples.map { sample in
            (date: sample.date, rating: min(10, max(1, Int((sample.valence * 4.5 + 5.5).rounded()))))
        }
        let added = (try? store.importMood(rated)) ?? 0
        didImportHealthKitMood = true
        Perf.note("imported \(added) mood entries from HealthKit")
    }

    private func reload() async {
        // Only the enabled symptoms ever show on screen, and enabling more in
        // settings re-triggers this via the sheet's onDismiss — so don't hit
        // healthd for all 39 types. Mood/stress/anxiety recency comes from the
        // local MetricStore, not HealthKit, to keep cold launch cheap.
        lastLogged = await healthKit.lastLoggedDates(for: enabledSymptoms)
        hasLoadedDates = true
    }
}

private struct CardButtonStyle: ButtonStyle {
    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .scaleEffect(configuration.isPressed ? 0.98 : 1)
            .opacity(configuration.isPressed ? 0.7 : 1)
            .animation(.easeOut(duration: 0.1), value: configuration.isPressed)
    }
}

#Preview {
    ContentView()
}
