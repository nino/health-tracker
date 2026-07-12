//
//  MetricLogView.swift
//  health-tracker
//

import SwiftUI

// One sheet for mood, stress, and anxiety. All three are saved to the local
// MetricStore; mood additionally goes to Apple Health as State of Mind.
struct MetricLogView: View {
    let metric: MetricKind
    let healthKit: HealthKitManager
    let store: MetricStore

    @Environment(\.dismiss) private var dismiss
    @State private var rating = 5.0
    @State private var date = Date()
    @State private var isSaving = false
    @State private var errorMessage: String?

    private var ratingValue: Int { Int(rating.rounded()) }

    private var ratingColor: Color {
        switch metric {
        case .mood:
            switch ratingValue {
            case 1...2: .red
            case 3...4: .orange
            case 5...6: .gray
            case 7...8: .teal
            default: .green
            }
        case .stress, .anxiety:
            switch ratingValue {
            case 0...2: .green
            case 3...4: .teal
            case 5...6: .gray
            case 7...8: .orange
            default: .red
            }
        }
    }

    private var minSymbol: String {
        metric == .mood ? "hand.thumbsdown" : "leaf"
    }

    private var maxSymbol: String {
        metric == .mood ? "hand.thumbsup" : "flame"
    }

    var body: some View {
        NavigationStack {
            Form {
                Section(metric.name) {
                    VStack(spacing: 8) {
                        Text("\(ratingValue)")
                            .font(.system(size: 52, weight: .bold, design: .rounded))
                            .foregroundStyle(ratingColor)
                            .contentTransition(.numericText())
                            .animation(.default, value: ratingValue)
                        Text(metric.description(for: ratingValue))
                            .font(.headline)
                            .foregroundStyle(.secondary)
                        Slider(value: $rating, in: metric.range, step: 1) {
                            Text(metric.name)
                        } minimumValueLabel: {
                            Image(systemName: minSymbol)
                                .foregroundStyle(.secondary)
                        } maximumValueLabel: {
                            Image(systemName: maxSymbol)
                                .foregroundStyle(.secondary)
                        }
                    }
                    .frame(maxWidth: .infinity)
                    .padding(.vertical, 8)
                }

                Section {
                    DatePicker("Date & Time", selection: $date)
                }

                Section {
                    Button {
                        save()
                    } label: {
                        HStack {
                            Spacer()
                            if isSaving {
                                ProgressView()
                            } else {
                                Text("Save")
                                    .fontWeight(.semibold)
                            }
                            Spacer()
                        }
                    }
                    .buttonStyle(.borderedProminent)
                    .disabled(isSaving)
                }
            }
            .formStyle(.grouped)
            .navigationTitle(metric.name)
            #if !os(macOS)
            .navigationBarTitleDisplayMode(.inline)
            #endif
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Cancel") { dismiss() }
                }
            }
            .alert(
                "Couldn't Save",
                isPresented: Binding(
                    get: { errorMessage != nil },
                    set: { if !$0 { errorMessage = nil } }
                )
            ) {
                Button("OK", role: .cancel) {}
            } message: {
                Text(errorMessage ?? "")
            }
        }
        #if os(macOS)
        .frame(minWidth: 380, minHeight: 440)
        #endif
    }

    private func save() {
        isSaving = true
        Task {
            do {
                if metric == .mood {
                    try await healthKit.saveMood(rating: ratingValue, date: date)
                }
                try store.add(metric, rating: ratingValue, date: date)
                dismiss()
            } catch {
                errorMessage = error.localizedDescription
            }
            isSaving = false
        }
    }
}

#Preview {
    MetricLogView(metric: .stress, healthKit: HealthKitManager(), store: MetricStore())
}
