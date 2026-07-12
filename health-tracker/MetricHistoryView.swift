//
//  MetricHistoryView.swift
//  health-tracker
//

import SwiftUI
import Charts

struct MetricHistoryView: View {
    let store: MetricStore
    let symptoms: [Symptom]
    let healthKit: HealthKitManager

    @Environment(\.dismiss) private var dismiss
    @State private var range: HistoryRange = .month
    @State private var symptomPoints: [Symptom: [SymptomPoint]] = [:]

    enum HistoryRange: String, CaseIterable, Identifiable {
        case week = "Week"
        case month = "Month"
        case all = "All"

        var id: String { rawValue }

        var cutoff: Date? {
            switch self {
            case .week: Calendar.current.date(byAdding: .day, value: -7, to: Date())
            case .month: Calendar.current.date(byAdding: .month, value: -1, to: Date())
            case .all: nil
            }
        }
    }

    var body: some View {
        NavigationStack {
            List {
                Section {
                    Picker("Range", selection: $range) {
                        ForEach(HistoryRange.allCases) { range in
                            Text(range.rawValue).tag(range)
                        }
                    }
                    .pickerStyle(.segmented)
                    .labelsHidden()
                }

                ForEach(MetricKind.allCases) { metric in
                    Section(metric.name) {
                        MetricChart(metric: metric, entries: entries(for: metric))
                    }
                }

                ForEach(symptoms) { symptom in
                    Section(symptom.name) {
                        if let points = symptomPoints[symptom] {
                            SymptomChart(symptom: symptom, points: filtered(points))
                        } else {
                            ProgressView()
                                .frame(maxWidth: .infinity)
                        }
                    }
                }
            }
            .navigationTitle("History")
            #if !os(macOS)
            .navigationBarTitleDisplayMode(.inline)
            #endif
            .toolbar {
                ToolbarItem(placement: .confirmationAction) {
                    Button("Done") { dismiss() }
                }
            }
            .task {
                for symptom in symptoms {
                    let samples = await healthKit.samples(for: symptom)
                    symptomPoints[symptom] = samples.map { SymptomPoint(date: $0.date, value: $0.value) }
                }
            }
        }
        #if os(macOS)
        .frame(minWidth: 480, minHeight: 560)
        #endif
    }

    private func entries(for kind: MetricKind) -> [MetricEntry] {
        store.entries
            .filter { $0.kind == kind }
            .filter { entry in range.cutoff.map { entry.date >= $0 } ?? true }
            .sorted { $0.date < $1.date }
    }

    private func filtered(_ points: [SymptomPoint]) -> [SymptomPoint] {
        points.filter { point in range.cutoff.map { point.date >= $0 } ?? true }
    }
}

private struct SymptomPoint: Identifiable {
    let id = UUID()
    let date: Date
    let value: Int
}

private struct MetricChart: View {
    let metric: MetricKind
    let entries: [MetricEntry]

    @State private var selectedDate: Date?

    private var color: Color {
        switch metric {
        case .mood: .teal
        case .stress: .orange
        case .anxiety: .indigo
        }
    }

    private var selectedEntry: MetricEntry? {
        guard let selectedDate else { return nil }
        return entries.min {
            abs($0.date.timeIntervalSince(selectedDate)) < abs($1.date.timeIntervalSince(selectedDate))
        }
    }

    var body: some View {
        if entries.isEmpty {
            Text("No entries in this range.")
                .font(.footnote)
                .foregroundStyle(.secondary)
        } else {
            Chart {
                ForEach(entries) { entry in
                    LineMark(
                        x: .value("Date", entry.date),
                        y: .value("Rating", entry.rating)
                    )
                    .lineStyle(StrokeStyle(lineWidth: 2))
                    PointMark(
                        x: .value("Date", entry.date),
                        y: .value("Rating", entry.rating)
                    )
                    .symbolSize(36)
                }
                .foregroundStyle(color)

                if let selectedEntry {
                    RuleMark(x: .value("Date", selectedEntry.date))
                        .foregroundStyle(.secondary.opacity(0.4))
                        .lineStyle(StrokeStyle(lineWidth: 1))
                        .annotation(
                            position: .top,
                            overflowResolution: .init(x: .fit(to: .chart), y: .disabled)
                        ) {
                            ChartAnnotation(
                                headline: "\(selectedEntry.rating) — \(metric.description(for: selectedEntry.rating))",
                                date: selectedEntry.date
                            )
                        }
                }
            }
            .chartYScale(domain: Double(metric.range.lowerBound)...Double(metric.range.upperBound))
            .chartXSelection(value: $selectedDate)
            .frame(height: 180)
            .padding(.vertical, 4)
        }
    }
}

private struct SymptomChart: View {
    let symptom: Symptom
    let points: [SymptomPoint]

    @State private var selectedDate: Date?

    private var options: [SymptomOption] {
        symptom.valueKind.options
    }

    // The options array is already in display order (e.g. Not Present, Present,
    // Mild, Moderate, Severe), so its index works as the ordinal plot position —
    // the raw HealthKit values don't sort meaningfully (Present = 0, Not Present = 1).
    private func position(of value: Int) -> Int {
        options.firstIndex { $0.value == value } ?? 0
    }

    private var selectedPoint: SymptomPoint? {
        guard let selectedDate else { return nil }
        return points.min {
            abs($0.date.timeIntervalSince(selectedDate)) < abs($1.date.timeIntervalSince(selectedDate))
        }
    }

    var body: some View {
        if points.isEmpty {
            Text("No entries in this range.")
                .font(.footnote)
                .foregroundStyle(.secondary)
        } else {
            Chart {
                ForEach(points) { point in
                    LineMark(
                        x: .value("Date", point.date),
                        y: .value("Level", position(of: point.value))
                    )
                    .lineStyle(StrokeStyle(lineWidth: 2))
                    PointMark(
                        x: .value("Date", point.date),
                        y: .value("Level", position(of: point.value))
                    )
                    .symbolSize(36)
                }
                .foregroundStyle(.blue)

                if let selectedPoint {
                    RuleMark(x: .value("Date", selectedPoint.date))
                        .foregroundStyle(.secondary.opacity(0.4))
                        .lineStyle(StrokeStyle(lineWidth: 1))
                        .annotation(
                            position: .top,
                            overflowResolution: .init(x: .fit(to: .chart), y: .disabled)
                        ) {
                            ChartAnnotation(
                                headline: options[position(of: selectedPoint.value)].label,
                                date: selectedPoint.date
                            )
                        }
                }
            }
            .chartYScale(domain: -0.5...(Double(options.count - 1) + 0.5))
            .chartYAxis {
                AxisMarks(values: Array(0..<options.count)) { value in
                    AxisGridLine()
                    AxisValueLabel {
                        if let index = value.as(Int.self), options.indices.contains(index) {
                            Text(options[index].label)
                        }
                    }
                }
            }
            .chartXSelection(value: $selectedDate)
            .frame(height: 180)
            .padding(.vertical, 4)
        }
    }
}

private struct ChartAnnotation: View {
    let headline: String
    let date: Date

    var body: some View {
        VStack(alignment: .leading, spacing: 2) {
            Text(headline)
                .font(.caption)
                .fontWeight(.semibold)
            Text(date.formatted(date: .abbreviated, time: .shortened))
                .font(.caption2)
                .foregroundStyle(.secondary)
        }
        .padding(6)
        .background(.regularMaterial, in: RoundedRectangle(cornerRadius: 6))
    }
}

#Preview {
    MetricHistoryView(store: MetricStore(), symptoms: Symptom.all.prefix(3).map { $0 }, healthKit: HealthKitManager())
}
