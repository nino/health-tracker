//
//  SettingsView.swift
//  health-tracker
//

import SwiftUI

struct SettingsView: View {
    @Environment(\.dismiss) private var dismiss
    @AppStorage("enabledSymptomIDs") private var enabledIDsStorage = Symptom.defaultEnabledStorage

    var body: some View {
        NavigationStack {
            List {
                Section {
                    ForEach(Symptom.all) { symptom in
                        Toggle(isOn: isEnabled(symptom)) {
                            Label(symptom.name, systemImage: symptom.icon)
                        }
                    }
                } footer: {
                    Text("Enabled symptoms appear on the main screen.")
                }
            }
            .navigationTitle("Symptoms")
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
        .frame(minWidth: 380, minHeight: 480)
        #endif
    }

    private func isEnabled(_ symptom: Symptom) -> Binding<Bool> {
        Binding(
            get: { enabledIDsStorage.split(separator: ",").map(String.init).contains(symptom.id) },
            set: { isOn in
                var ids = Set(enabledIDsStorage.split(separator: ",").map(String.init))
                if isOn {
                    ids.insert(symptom.id)
                } else {
                    ids.remove(symptom.id)
                }
                enabledIDsStorage = ids.sorted().joined(separator: ",")
            }
        )
    }
}

#Preview {
    SettingsView()
}
