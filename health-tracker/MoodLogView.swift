//
//  MoodLogView.swift
//  health-tracker
//

import SwiftUI

struct MoodLogView: View {
    let healthKit: HealthKitManager

    @Environment(\.dismiss) private var dismiss
    @State private var rating = 5.0
    @State private var date = Date()
    @State private var isSaving = false
    @State private var errorMessage: String?

    private var ratingValue: Int { Int(rating.rounded()) }

    private var moodDescription: String {
        switch ratingValue {
        case 1...2: "Very Negative"
        case 3...4: "Negative"
        case 5...6: "Neutral"
        case 7...8: "Positive"
        default: "Very Positive"
        }
    }

    private var moodColor: Color {
        switch ratingValue {
        case 1...2: .red
        case 3...4: .orange
        case 5...6: .gray
        case 7...8: .teal
        default: .green
        }
    }

    var body: some View {
        NavigationStack {
            Form {
                Section("Mood") {
                    VStack(spacing: 8) {
                        Text("\(ratingValue)")
                            .font(.system(size: 52, weight: .bold, design: .rounded))
                            .foregroundStyle(moodColor)
                            .contentTransition(.numericText())
                            .animation(.default, value: ratingValue)
                        Text(moodDescription)
                            .font(.headline)
                            .foregroundStyle(.secondary)
                        Slider(value: $rating, in: 1...10, step: 1) {
                            Text("Mood")
                        } minimumValueLabel: {
                            Image(systemName: "hand.thumbsdown")
                                .foregroundStyle(.secondary)
                        } maximumValueLabel: {
                            Image(systemName: "hand.thumbsup")
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
            .navigationTitle("Mood")
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
                try await healthKit.saveMood(rating: ratingValue, date: date)
                dismiss()
            } catch {
                errorMessage = error.localizedDescription
            }
            isSaving = false
        }
    }
}

#Preview {
    MoodLogView(healthKit: HealthKitManager())
}
