# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

A personal React Native + Expo app (iOS + Android) for logging symptoms, mood, stress, and anxiety with minimal friction. Local-first: the in-app SQLite store is the source of truth; health backends (Apple HealthKit today, Android Health Connect once it has symptom/mood record types) are pluggable sync targets. Open source at https://github.com/nino/health-tracker.

The app lives in `app/` — see `docs/react-native-rewrite.md` for the plan, research findings, and settled decisions. The original SwiftUI app it replaced was deleted 2026-07-28 (its HealthKit knowledge is preserved below and in the `health-kit` Expo module, which ports its `HealthKitManager`).

## The app (`app/`)

Expo SDK 57, TypeScript strict, **bun** for package management (`bun install`, `bunx expo ...`). Dependency policy: RN + Expo-curated packages + TanStack libraries only; everything else hand-rolled, including our own native health modules.

- Checks (run from `app/`): `bun run test` · `bun run typecheck` · `bun run lint` · `bun run format:check` (prettier; `bun run format` to fix).
- **Always `cd` into `app/` explicitly** (absolute path) before any `bun run`. From a directory without a package.json, bun falls back to PATH binaries — on this machine `bun run lint` once executed Nino's personal `~/.config/scripts/lint`, which runs `git checkout`/`git pull`/`yarn` in whatever repo it's in (2026-07-16; no damage, but only because uncommitted changes aborted the checkout).
- `bun test` runs the domain layer only — test files must not import anything that pulls in `react-native`/`expo` (bun can't apply RN's babel transforms). Component tests would need `jest-expo`; don't add it until actually needed.
- Native code lives in local Expo modules under `app/modules/` — `health-kit` is Apple-only, `health-connect` Android-only; their JS wrappers use `requireOptionalNativeModule` and are null off-platform.
- `app/ios` and `app/android` are prebuild output and gitignored — never edit them; changes go in `app.json`, config plugins, or the modules.
- Native verification (from `app/`):
  ```sh
  bunx expo prebuild --no-install
  (cd android && JAVA_HOME=/opt/homebrew/opt/openjdk@17/libexec/openjdk.jdk/Contents/Home ANDROID_HOME=$HOME/Library/Android/sdk ./gradlew assembleDebug)
  (cd ios && pod install && xcodebuild -workspace HealthTracker.xcworkspace -scheme HealthTracker -destination 'generic/platform=iOS Simulator' build)
  ```
- Device builds go through EAS (`eas.json`: `development` = dev client, `preview` = sideloadable APK for Android). EAS is logged in as ninoan (`~/.bun/bin/eas`); ask before production/submit actions.
- Never pass `CODE_SIGNING_ALLOWED=NO` to simulator builds: it strips the HealthKit entitlement, and HealthKit then **hangs silently** on `requestAuthorization` instead of erroring (cost: a long debugging session on 2026-07-16). Simulator builds sign automatically.
- HealthKit's authorization sheet requires the request to be made from the main thread — the Expo module dispatches internally via `Task { @MainActor ... }`; keep it that way. Gating on `statusForAuthorizationRequest` hangs on simulators (the old Swift app hit this); the app gates with a local settings flag instead (`didRequestAuth:*`).
- On-device behavior (HealthKit prompts, real authorization sheets) can only be tested by Nino on his iPhone — ask rather than assume.

## Workflow

- Push to `origin main` immediately after every commit (Nino's standing instruction).

## Architecture

The design goal is zero duplication when adding symptom types — one symptom is one line of code.

- `src/catalog/` — the heart of the app: a data-driven catalog of all 39 HealthKit symptom category types (name, emoji icon, `hkIdentifier`, a `ValueKind` — severity / presence / appetite — supplying picker options and section title) plus the three metrics (mood/stress/anxiety with their ranges). Everything else (main-screen grid, settings toggles, log sheets, charts) derives from it.
- `src/store/` — the SQLite source of truth: `EntryStore` on a `SqlDriver` interface (expo-sqlite in the app, bun:sqlite in tests), `PRAGMA user_version` migrations, settings table, JSON export, Swift-app-export import with ±2s dedup. Ordering/range queries use a `date_unix_ms` column because local-offset ISO strings don't sort across DST boundaries.
- `src/backends/` — the `HealthBackend` abstraction and write-through mirroring: entries insert locally first (never blocked on a backend), then mirror with single-flight claim-before-write and bounded retries. `healthKitBackend` talks to the `health-kit` module; `healthConnectBackend` is scaffolding until Google ships symptom record types.
- `src/ui/` — one screen plus RN modal sheets, no navigation library. Main grid shows staleness-colored recency (re-rendered on a minute tick) and a weighted-random "next up" nudge; recency reads the local store only — no health-store queries at launch. History charts are hand-rolled on react-native-svg: one single-series chart per item (mood's high-is-good must not share a plot with stress/anxiety's high-is-bad), fixed y-domains, symptom y-axis = index into `valueKind.options` (display order), because raw HealthKit values don't sort (Present = 0, Not Present = 1); downsampled to ≤400 points.
- `src/lib/` — pure helpers (dates, staleness, chart geometry, random pick), all unit-tested.
- Timestamps serialize as ISO 8601 with local UTC offset (`src/lib/dates.ts`), the same convention as the old Swift app's metric log, so old exports stay importable.

## HealthKit specifics

- Value semantics were verified against the SDK header (`HKTypeIdentifiers.h` via `xcrun --sdk iphonesimulator --show-sdk-path`), not from memory — do the same before adding/changing category types. Of the 39 symptom types, all use `HKCategoryValueSeverity` except: `appetiteChanges` (`HKCategoryValueAppetiteChanges`) and `moodChanges`/`sleepChanges` (`HKCategoryValuePresence`).
- The UI's "Present" option maps to `HKCategoryValueSeverity.unspecified` (raw 0), not a presence value.
- Mood is saved as `HKStateOfMind` (kind `.momentaryEmotion`); the 1–10 rating maps linearly to valence via `(rating − 5.5) / 4.5`. Stress/anxiety use 0–10 (a real zero for "none") — the different ranges are intentional. Mood mirroring requires iOS 18+.
- Authorization is requested for **all** symptom types plus State of Mind up front (once ever, gated by the settings flag), so enabling a symptom later never re-prompts. Adding a new read/share type will trigger one new permission prompt — mention that to Nino when it happens.
- HealthKit reports "read access denied" identically to "no data"; treat both as never logged. Don't try to distinguish them.
- Recency and history are read from the local store, not HealthKit — preserve that cheap-launch property (no health-store queries at launch). Recency sorts by the user-set entry date, so backdated entries are handled correctly.
