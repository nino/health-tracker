//
//  SettingsView.swift
//  health-tracker
//

import SwiftUI
import UniformTypeIdentifiers

struct SettingsView: View {
    let store: MetricStore

    @Environment(\.dismiss) private var dismiss
    @AppStorage("enabledSymptomIDs") private var enabledIDsStorage = Symptom.defaultEnabledStorage
    @State private var exportDocument: JSONExportDocument?
    @State private var showingExporter = false
    @State private var exportError: String?

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

                Section {
                    Button {
                        startExport()
                    } label: {
                        Label("Export as JSON", systemImage: "square.and.arrow.up")
                    }
                    .disabled(store.entries.isEmpty)
                } header: {
                    Text("Mood, Stress & Anxiety Data")
                } footer: {
                    Text(store.entries.isEmpty
                        ? "Nothing to export yet — log a mood, stress, or anxiety entry first."
                        : "Exports all \(store.entries.count) in-app mood, stress, and anxiety entries. Apple Health's export omits State of Mind, so this is the way to get mood data out.")
                }
            }
            .navigationTitle("Settings")
            #if !os(macOS)
            .navigationBarTitleDisplayMode(.inline)
            #endif
            .toolbar {
                ToolbarItem(placement: .confirmationAction) {
                    Button("Done") { dismiss() }
                }
            }
            .fileExporter(
                isPresented: $showingExporter,
                document: exportDocument,
                contentType: .json,
                defaultFilename: "health-metrics-\(Date().formatted(.iso8601.year().month().day()))"
            ) { result in
                if case .failure(let error) = result {
                    exportError = error.localizedDescription
                }
            }
            .alert(
                "Couldn't Export",
                isPresented: Binding(
                    get: { exportError != nil },
                    set: { if !$0 { exportError = nil } }
                )
            ) {
                Button("OK", role: .cancel) {}
            } message: {
                Text(exportError ?? "")
            }
        }
        #if os(macOS)
        .frame(minWidth: 380, minHeight: 480)
        #endif
    }

    private func startExport() {
        do {
            exportDocument = JSONExportDocument(data: try store.exportJSON())
            showingExporter = true
        } catch {
            exportError = error.localizedDescription
        }
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

nonisolated struct JSONExportDocument: FileDocument {
    static let readableContentTypes: [UTType] = [.json]

    let data: Data

    init(data: Data) {
        self.data = data
    }

    init(configuration: ReadConfiguration) throws {
        data = configuration.file.regularFileContents ?? Data()
    }

    func fileWrapper(configuration: WriteConfiguration) throws -> FileWrapper {
        FileWrapper(regularFileWithContents: data)
    }
}

#Preview {
    SettingsView(store: MetricStore())
}
