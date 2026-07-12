//
//  MetricHistoryView.swift
//  health-tracker
//

import SwiftUI
import Charts

struct MetricHistoryView: View {
    let store: MetricStore

    @Environment(\.dismiss) private var dismiss
    @State private var range: HistoryRange = .month

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
                            VStack(alignment: .leading, spacing: 2) {
                                Text("\(selectedEntry.rating) — \(metric.description(for: selectedEntry.rating))")
                                    .font(.caption)
                                    .fontWeight(.semibold)
                                Text(selectedEntry.date.formatted(date: .abbreviated, time: .shortened))
                                    .font(.caption2)
                                    .foregroundStyle(.secondary)
                            }
                            .padding(6)
                            .background(.regularMaterial, in: RoundedRectangle(cornerRadius: 6))
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

#Preview {
    MetricHistoryView(store: MetricStore())
}
