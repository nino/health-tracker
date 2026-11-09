import Foundation

/// Where records wait until the app stores them: one JSON object per line in
/// Application Support. Recording happens in background launches that should
/// cost as little as possible, so nothing here needs JavaScript or the app's
/// database; the app reads the buffer (`pending`) the next time it runs and
/// removes what it has stored (`discard`).
final class LocationBuffer: @unchecked Sendable {
  static let shared = LocationBuffer()

  private let queue = DispatchQueue(label: "location-tracking.buffer")

  private lazy var fileURL: URL = {
    let directory = FileManager.default.urls(
      for: .applicationSupportDirectory, in: .userDomainMask)[0]
    try? FileManager.default.createDirectory(
      at: directory, withIntermediateDirectories: true)
    return directory.appendingPathComponent("location-buffer.jsonl")
  }()

  func append(_ record: [String: Any]) {
    queue.async {
      guard var line = try? JSONSerialization.data(withJSONObject: record) else {
        return
      }
      line.append(0x0A)
      let url = self.fileURL
      if !FileManager.default.fileExists(atPath: url.path) {
        // Background launches can happen while the phone is locked, so the
        // file must not need the device to be unlocked (after the first
        // unlock since boot).
        FileManager.default.createFile(
          atPath: url.path,
          contents: nil,
          attributes: [.protectionKey: FileProtectionType.completeUntilFirstUserAuthentication]
        )
      }
      guard let handle = try? FileHandle(forWritingTo: url) else { return }
      defer { try? handle.close() }
      _ = try? handle.seekToEnd()
      try? handle.write(contentsOf: line)
    }
  }

  func pending() -> [[String: Any]] {
    queue.sync {
      self.lines().compactMap { line in
        try? JSONSerialization.jsonObject(with: line) as? [String: Any]
      }
    }
  }

  func discard(ids: [String]) {
    let discarded = Set(ids)
    queue.sync {
      let kept = self.lines().filter { line in
        guard
          let record = try? JSONSerialization.jsonObject(with: line) as? [String: Any],
          let id = record["id"] as? String
        else {
          return false  // unreadable: it would never be stored, so drop it
        }
        return !discarded.contains(id)
      }
      var contents = Data()
      for line in kept {
        contents.append(line)
        contents.append(0x0A)
      }
      try? contents.write(
        to: self.fileURL,
        options: [.atomic, .completeFileProtectionUntilFirstUserAuthentication])
    }
  }

  /// Call on `queue`.
  private func lines() -> [Data] {
    guard let contents = try? Data(contentsOf: fileURL) else { return [] }
    return contents.split(separator: 0x0A).map { Data($0) }
  }
}
