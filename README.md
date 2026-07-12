# health-tracker

A small SwiftUI app for logging symptoms and mood into Apple Health as fast as possible. One multiplatform target that runs on both iPhone and Mac — the point is quick entry from whichever device is in front of you, with the data landing in HealthKit where it belongs.

## Features

- **One-tap symptom buttons** — the main screen is a two-column grid of buttons for the symptoms you actually track.
- **All 39 HealthKit symptom types** — choose which appear on the main screen via the gear icon. Toggles are persisted in `AppStorage`; six sensible defaults are enabled out of the box (headache, nausea, fatigue, runny nose, sore throat, congestion).
- **Correct value types per symptom** — most symptoms use HealthKit's severity scale (Not Present / Present / Mild / Moderate / Severe); Mood Changes and Sleep Changes use presence; Appetite Changes uses No Change / Decreased / Increased.
- **Mood logging** — a 1–10 slider saved via the State of Mind API (`HKStateOfMind`, momentary emotion), mapped linearly to valence −1…+1 with 5.5 as neutral.
- **Random button** — picks a symptom to log, weighted toward the ones logged least recently. It queries HealthKit for each enabled symptom's most recent sample; weights run linearly from 1x (newest) to 3x (oldest), with never-logged symptoms counting as oldest. A nudge toward even coverage, not a guarantee.
- **Backdating** — every log sheet has an editable date/time, so you can enter something you forgot earlier.
- **Last-logged timestamps** — each button shows how long ago that symptom (or mood) was last logged (e.g. "4h"), color-coded by staleness: neutral under 2 hours, green 2–4h, yellow 4–8h, orange 8–24h, red beyond a day or never logged.

## Requirements

- Xcode with the iOS/macOS 26.5 SDKs (the target's minimum deployment is iOS 26.5 / macOS 26.5).
- An Apple Developer account — HealthKit requires the app to be signed with the HealthKit entitlement.
- On macOS, Health data is only available if iCloud Health sync is enabled; otherwise the app will tell you health data isn't available.

## Setup

1. Open `health-tracker.xcodeproj` in Xcode.
2. In the target's Signing & Capabilities, select your own development team if Xcode doesn't do it automatically.
3. Pick an iPhone or Mac run destination and hit Run.
4. On first launch the app requests HealthKit authorization for all symptom types and State of Mind up front — grant what you want to log. (Asking for everything once means enabling a new symptom later doesn't trigger another prompt.)

Note: HealthKit reports "no data" and "read access denied" identically, so if you deny read access the Random button's recency weighting just treats those symptoms as never logged.

## Architecture

Plain SwiftUI, no dependencies. Everything lives in `health-tracker/`:

- `ContentView.swift` — main screen: mood button, enabled symptom buttons, Random button, gear icon for settings. Requests HealthKit authorization on appear and presents the log sheets.
- `Symptom.swift` — the model: the full catalog of 39 HealthKit symptom types with names/icons, their value kinds (severity / presence / appetite) and picker options, the enabled-set encoding for `AppStorage`, and the recency-weighted random pick.
- `HealthKitManager.swift` — the only file that talks to HealthKit: authorization, saving category samples and State of Mind samples, and fetching each symptom's most recent sample date for the Random weighting.
- `SymptomLogView.swift` — sheet for logging one symptom: value picker, date/time, save.
- `MoodLogView.swift` — sheet for logging mood: 1–10 slider with label/color feedback, date/time, save.
- `SettingsView.swift` — toggle list of all symptoms controlling what shows on the main screen.
- `InfoView.swift` — the info-button sheet explaining how the app works, including the staleness color legend.
