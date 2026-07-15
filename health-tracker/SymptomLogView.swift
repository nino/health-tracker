//
//  SymptomLogView.swift
//  health-tracker
//

import SwiftUI

struct SymptomLogView: View {
    let symptom: Symptom
    let healthKit: HealthKitManager
    // Called with the saved sample date instead of dismissing, so the parent
    // can move the sheet on to the next least-recently-logged entry.
    let onSaveAndNext: ((Date) -> Void)?

    @Environment(\.dismiss) private var dismiss
    @State private var selectedValue: Int
    @State private var date = Date()
    @State private var isSaving = false
    @State private var savingNext = false
    @State private var errorMessage: String?

    init(symptom: Symptom, healthKit: HealthKitManager, onSaveAndNext: ((Date) -> Void)? = nil) {
        self.symptom = symptom
        self.healthKit = healthKit
        self.onSaveAndNext = onSaveAndNext
        _selectedValue = State(initialValue: symptom.valueKind.defaultValue)
    }

    var body: some View {
        NavigationStack {
            Form {
                Section(symptom.valueKind.sectionTitle) {
                    ForEach(symptom.valueKind.options) { option in
                        Button {
                            selectedValue = option.value
                        } label: {
                            HStack {
                                Text(option.label)
                                    .foregroundStyle(.primary)
                                Spacer()
                                if selectedValue == option.value {
                                    Image(systemName: "checkmark")
                                        .foregroundStyle(.tint)
                                }
                            }
                            .contentShape(Rectangle())
                        }
                        .buttonStyle(.plain)
                    }
                }

                Section {
                    DatePicker("Date & Time", selection: $date)
                }

                Section {
                    HStack(spacing: 12) {
                        Button {
                            save()
                        } label: {
                            HStack {
                                Spacer()
                                if isSaving && !savingNext {
                                    ProgressView()
                                } else {
                                    Text("Save")
                                        .fontWeight(.semibold)
                                }
                                Spacer()
                            }
                        }
                        .buttonStyle(.borderedProminent)

                        if onSaveAndNext != nil {
                            Button {
                                save(andNext: true)
                            } label: {
                                HStack {
                                    Spacer()
                                    if isSaving && savingNext {
                                        ProgressView()
                                    } else {
                                        Text("Save & Next")
                                            .fontWeight(.semibold)
                                    }
                                    Spacer()
                                }
                            }
                            .buttonStyle(.bordered)
                        }
                    }
                    .disabled(isSaving)
                }
            }
            .formStyle(.grouped)
            .navigationTitle(symptom.name)
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

    private func save(andNext: Bool = false) {
        isSaving = true
        savingNext = andNext
        Task {
            do {
                try await healthKit.save(symptom, value: selectedValue, date: date)
                if andNext, let onSaveAndNext {
                    onSaveAndNext(date)
                } else {
                    dismiss()
                }
            } catch {
                errorMessage = error.localizedDescription
            }
            isSaving = false
        }
    }
}

#Preview {
    SymptomLogView(symptom: Symptom.all[0], healthKit: HealthKitManager())
}
