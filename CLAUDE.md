# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

A personal multiplatform (iOS + macOS) SwiftUI app for logging symptoms and mood into Apple Health, plus stress and anxiety, with minimal friction. No dependencies; persistence is HealthKit, one `AppStorage` key, and a local JSON metric log (see `MetricStore.swift`). Open source at https://github.com/nino/health-tracker.

## Workflow

- Push to `origin main` immediately after every commit (Nino's standing instruction).
- Verify changes by building **both** platforms:
  ```sh
  xcodebuild -project health-tracker.xcodeproj -scheme health-tracker -destination 'generic/platform=iOS Simulator' build
  xcodebuild -project health-tracker.xcodeproj -scheme health-tracker -destination 'platform=macOS' CODE_SIGNING_ALLOWED=NO build
  ```
  `CODE_SIGNING_ALLOWED=NO` is needed for macOS because CLI builds can't do the interactive Apple ID signing; real signed runs happen through the Xcode UI. On-device behavior (HealthKit prompts, launch performance) can only be tested by Nino on his iPhone — ask rather than assume.
- `health-trackerTests`/`health-trackerUITests` are untouched Xcode template stubs; there is no meaningful test suite. (`xcodebuild test -scheme health-tracker -destination 'platform=iOS Simulator,name=iPhone 17'` would run them.)
- Ignore SourceKit diagnostics like "Cannot find 'Symptom' in scope" that appear after edits — they are stale-index noise in this project. Trust `xcodebuild` output only.
- The app target uses a filesystem-synchronized group: any file added under `health-tracker/` is automatically part of the target, no pbxproj edit needed.

## Architecture

The design goal is zero duplication when adding symptom types — one symptom is one line of code.

- `Symptom.swift` — the heart of the app: a data-driven catalog (`Symptom.all`) of all 39 HealthKit symptom category types, each with a name, SF Symbol, `HKCategoryTypeIdentifier`, and a `ValueKind` (severity / presence / appetite) that supplies the picker options, default value, and section title. Everything else (main-screen buttons, settings toggles, authorization set, log sheet) derives from this list. Also holds the enabled-set codec for `AppStorage` and the recency-weighted random pick.
- `HealthKitManager.swift` — the only file that touches HealthKit: authorization, saving category samples and State of Mind, and fetching last-logged dates.
- `MetricStore.swift` — `MetricKind` (mood/stress/anxiety) plus the local JSON store (`Application Support/health-tracker/metric-log.json`). Exists because Apple Health's XML export omits State of Mind, and stress/anxiety have no HealthKit type. Mood is dual-written (HealthKit + store); entries keep the user-set `date` and a `loggedAt` timestamp, serialized as ISO 8601 with local UTC offset. SettingsView exports the store as JSON via `fileExporter`.
- `ContentView.swift` — main grid (Mood/Stress/Anxiety + enabled symptoms + Random), owns the last-logged dates state, refreshes it when any sheet dismisses, re-renders every minute via `TimelineView` so relative ages/staleness colors stay current. Symptom recency comes from HealthKit; mood/stress/anxiety recency from the local store (deliberately NOT HealthKit — cold-start State of Mind queries were part of the launch lag, and it misses nothing unless mood was logged from outside this app).
- `SymptomLogView.swift` / `MetricLogView.swift` / `SettingsView.swift` / `InfoView.swift` / `MetricHistoryView.swift` — one sheet each; all generic over the catalog (or over `MetricKind`), none hardcodes a symptom. The history sheet charts MetricStore entries with Swift Charts (one single-series chart per metric — mood's high-is-good must not share a plot with stress/anxiety's high-is-bad; fixed y-domain from `metric.range`).
- Enabled symptoms live in `@AppStorage("enabledSymptomIDs")` as comma-joined sorted identifier rawValues; ContentView and SettingsView share the key, so toggles update the main screen automatically.

## Concurrency (the big trap)

The project builds with `SWIFT_DEFAULT_ACTOR_ISOLATION = MainActor` **and** `SWIFT_APPROACHABLE_CONCURRENCY = YES` (NonisolatedNonsendingByDefault). Consequences:

- Everything, including `nonisolated async` functions and task-group children created from main-actor code, runs on the **main actor by default**. `await` alone does not move work off the main thread; a fan-out of async HealthKit queries once froze scrolling because all children inherited the main actor.
- To actually run on a background thread, mark the function `@concurrent nonisolated` (see `HealthKitManager.lastLoggedDates`/`lastMoodDate`). Task-group children inherit that context.
- Value types whose conformances are used off the main actor must be declared `nonisolated` (`Symptom`, `SymptomOption` are — e.g. their `Hashable` is used inside `@concurrent` code).

## HealthKit specifics

- Value semantics were verified against the SDK header (`HKTypeIdentifiers.h` via `xcrun --sdk iphonesimulator --show-sdk-path`), not from memory — do the same before adding/changing category types. Of the 39 symptom types, all use `HKCategoryValueSeverity` except: `appetiteChanges` (`HKCategoryValueAppetiteChanges`) and `moodChanges`/`sleepChanges` (`HKCategoryValuePresence`).
- The UI's "Present" option maps to `HKCategoryValueSeverity.unspecified` (raw 0), not a presence value.
- Mood is saved as `HKStateOfMind` (kind `.momentaryEmotion`); the 1–10 rating maps linearly to valence via `(rating − 5.5) / 4.5`. Stress/anxiety use 0–10 (a real zero for "none") — the different ranges are intentional.
- Authorization is requested for **all** symptom types plus State of Mind up front, so enabling a symptom later never re-prompts. Adding a new read/share type will trigger one new permission prompt on next launch — mention that to Nino when it happens.
- HealthKit reports "read access denied" identically to "no data"; the UI treats both as never logged. Don't try to distinguish them.
- Launch performance is a settled investigation (2026-07-12): the app's HealthKit launch footprint is one authorization status check plus limit-1 queries for the enabled symptoms, throttled to 4 in-flight at utility priority (`Perf.swift` logs each phase — console filter "perf"). Residual jank on the first launch right after an install is post-reinstall system work (healthd cold caches, binary verification), confirmed by testing: launches not preceded by a reinstall are smooth. Don't re-chase it; do preserve the cheap-launch properties (no full-type authorization requests per launch, no State of Mind queries, no all-39 fan-outs).
- Recency queries sort by `endDate` (the user-set sample date), so backdated entries are handled correctly.
