//
//  MetricStore.swift
//  health-tracker
//

import Foundation
import Observation

// The in-app metrics. Mood additionally goes to Apple Health as State of Mind;
// all three are kept in the local store because Apple Health's XML export
// doesn't include State of Mind samples, and stress/anxiety have no HealthKit
// type at all.
nonisolated enum MetricKind: String, Codable, CaseIterable, Identifiable {
    case mood
    case stress
    case anxiety

    var id: String { rawValue }

    var name: String {
        switch self {
        case .mood: "Mood"
        case .stress: "Stress"
        case .anxiety: "Anxiety"
        }
    }

    var icon: String {
        switch self {
        case .mood: "face.smiling"
        case .stress: "gauge.with.needle"
        case .anxiety: "brain.head.profile"
        }
    }

    // Mood keeps the established 1–10 scale (5.5 = neutral valence in Apple
    // Health); stress and anxiety are 0–10 so "none at all" is a real value.
    var range: ClosedRange<Double> {
        switch self {
        case .mood: 1...10
        case .stress, .anxiety: 0...10
        }
    }

    func description(for value: Int) -> String {
        switch self {
        case .mood:
            switch value {
            case 1...2: "Very Negative"
            case 3...4: "Negative"
            case 5...6: "Neutral"
            case 7...8: "Positive"
            default: "Very Positive"
            }
        case .stress, .anxiety:
            switch value {
            case 0: "None"
            case 1...2: "Minimal"
            case 3...4: "Mild"
            case 5...6: "Moderate"
            case 7...8: "High"
            default: "Extreme"
            }
        }
    }
}

nonisolated struct MetricEntry: Identifiable, Hashable {
    let id: UUID
    let kind: MetricKind
    let rating: Int
    /// The user-set sample date (may be backdated).
    let date: Date
    /// When the entry was actually saved — lets analysis down-weight
    /// fuzzy backdated entries.
    let loggedAt: Date
}

extension MetricEntry: Codable {
    private enum CodingKeys: String, CodingKey {
        case id, kind, rating, date, loggedAt
    }

    // Timestamps are stored as ISO 8601 with the local UTC offset
    // ("2026-07-12T09:41:00+02:00") so the export stays timezone-aware.
    static func isoFormatter() -> ISO8601DateFormatter {
        let formatter = ISO8601DateFormatter()
        formatter.formatOptions = .withInternetDateTime
        formatter.timeZone = .current
        return formatter
    }

    init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        id = try container.decode(UUID.self, forKey: .id)
        kind = try container.decode(MetricKind.self, forKey: .kind)
        rating = try container.decode(Int.self, forKey: .rating)
        date = try Self.decodeDate(in: container, forKey: .date)
        loggedAt = try Self.decodeDate(in: container, forKey: .loggedAt)
    }

    private static func decodeDate(
        in container: KeyedDecodingContainer<CodingKeys>,
        forKey key: CodingKeys
    ) throws -> Date {
        let string = try container.decode(String.self, forKey: key)
        guard let date = isoFormatter().date(from: string) else {
            throw DecodingError.dataCorruptedError(
                forKey: key,
                in: container,
                debugDescription: "Invalid ISO 8601 date: \(string)"
            )
        }
        return date
    }

    func encode(to encoder: Encoder) throws {
        var container = encoder.container(keyedBy: CodingKeys.self)
        let formatter = Self.isoFormatter()
        try container.encode(id, forKey: .id)
        try container.encode(kind, forKey: .kind)
        try container.encode(rating, forKey: .rating)
        try container.encode(formatter.string(from: date), forKey: .date)
        try container.encode(formatter.string(from: loggedAt), forKey: .loggedAt)
    }
}

// The only persistence outside HealthKit and AppStorage: a JSON file in
// Application Support, kept because Apple Health's XML export omits State
// of Mind. Small enough (one record per log) to load and rewrite whole.
@Observable
final class MetricStore {
    private(set) var entries: [MetricEntry] = []
    private let fileURL: URL

    init() {
        let support = FileManager.default.urls(
            for: .applicationSupportDirectory,
            in: .userDomainMask
        )[0]
        fileURL = support
            .appendingPathComponent("health-tracker", isDirectory: true)
            .appendingPathComponent("metric-log.json")
        if let data = try? Data(contentsOf: fileURL) {
            if let decoded = try? JSONDecoder().decode([MetricEntry].self, from: data) {
                entries = decoded
            } else {
                // Never keep writing over a file we couldn't read — the next
                // persist() would silently erase it. Move it aside instead.
                let backup = fileURL.deletingLastPathComponent()
                    .appendingPathComponent("metric-log.corrupt-\(Int(Date().timeIntervalSince1970)).json")
                try? FileManager.default.moveItem(at: fileURL, to: backup)
                Perf.note("metric log undecodable; moved aside to \(backup.lastPathComponent)")
            }
        }
        Perf.note("MetricStore loaded (\(entries.count) entries)")
    }

    func add(_ kind: MetricKind, rating: Int, date: Date) throws {
        entries.append(MetricEntry(id: UUID(), kind: kind, rating: rating, date: date, loggedAt: Date()))
        try persist()
    }

    // One-time import of mood entries that predate this store (see ContentView).
    // Skips samples within 2s of an existing mood entry so dual-written entries
    // don't duplicate. Imported entries use the sample date as loggedAt — the
    // original logging time isn't recoverable from HealthKit.
    func importMood(_ samples: [(date: Date, rating: Int)]) throws -> Int {
        let existingDates = entries.filter { $0.kind == .mood }.map(\.date)
        var added = 0
        for sample in samples {
            guard !existingDates.contains(where: { abs($0.timeIntervalSince(sample.date)) < 2 }) else {
                continue
            }
            entries.append(MetricEntry(
                id: UUID(),
                kind: .mood,
                rating: sample.rating,
                date: sample.date,
                loggedAt: sample.date
            ))
            added += 1
        }
        if added > 0 {
            entries.sort { $0.date < $1.date }
            try persist()
        }
        return added
    }

    func lastDate(for kind: MetricKind) -> Date? {
        entries.lazy.filter { $0.kind == kind }.map(\.date).max()
    }

    private func persist() throws {
        try FileManager.default.createDirectory(
            at: fileURL.deletingLastPathComponent(),
            withIntermediateDirectories: true
        )
        try encoder().encode(entries).write(to: fileURL, options: .atomic)
    }

    func exportJSON() throws -> Data {
        struct Export: Encodable {
            let exportedAt: String
            let entries: [MetricEntry]
        }
        let export = Export(
            exportedAt: MetricEntry.isoFormatter().string(from: Date()),
            entries: entries.sorted { $0.date < $1.date }
        )
        return try encoder().encode(export)
    }

    private func encoder() -> JSONEncoder {
        let encoder = JSONEncoder()
        encoder.outputFormatting = [.prettyPrinted, .sortedKeys]
        return encoder
    }
}
