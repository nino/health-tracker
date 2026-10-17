# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

A personal React Native + Expo app (iOS + Android) for logging symptoms, mood, stress, and anxiety with minimal friction. Local-first: the in-app SQLite store is the source of truth; health backends (Apple HealthKit today, Android Health Connect once it has symptom/mood record types) are pluggable sync targets. Open source at https://github.com/nino/health-tracker.

The app lives in `app/` — see `docs/react-native-rewrite.md` for the plan, research findings, and settled decisions. The original SwiftUI app it replaced was deleted 2026-07-28 (its HealthKit knowledge is preserved below and in the `health-kit` Expo module, which ports its `HealthKitManager`).

## The app (`app/`)

Expo SDK 57, TypeScript strict, **bun** for package management (`bun install`, `bunx expo ...`). Dependency policy: RN + Expo-curated packages + TanStack libraries only; everything else hand-rolled, including our own native health modules.

- Checks (run from `app/`): `bun run test` · `bun run typecheck` · `bun run lint` · `bun run format:check` (prettier; `bun run format` to fix).
- **Always `cd` into `app/` explicitly** (absolute path) before any `bun run`. From a directory without a package.json, bun falls back to PATH binaries — on this machine `bun run lint` once executed Nino's personal `~/.config/scripts/lint`, which runs `git checkout`/`git pull`/`yarn` in whatever repo it's in (2026-07-16; no damage, but only because uncommitted changes aborted the checkout).
- **No effects**: `useEffect`, `useLayoutEffect` and `useInsertionEffect` are banned everywhere except `src/ui/useMountEffect.ts` (ESLint-enforced in `eslint.config.js`). Derive state during render, act in the event handler, use a ref callback, or remount with a `key`; for setup/teardown use `useMountEffect`, reading the latest props through `useEffectEvent` (the lint's `additionalEffectHooks` setting lets effect events be called from it).
- `bun test` runs the domain layer only — test files must not import anything that pulls in `react-native`/`expo` (bun can't apply RN's babel transforms). Component tests would need `jest-expo`; don't add it until actually needed.
- Native code lives in local Expo modules under `app/modules/` — `health-kit` is Apple-only, `health-connect` Android-only; their JS wrappers use `requireOptionalNativeModule` and are null off-platform.
- `app/ios` and `app/android` are prebuild output and gitignored — never edit them; changes go in `app.json`, config plugins, or the modules.
- Native verification (from `app/`):
  ```sh
  bunx expo prebuild --no-install
  (cd android && JAVA_HOME=/opt/homebrew/opt/openjdk@17/libexec/openjdk.jdk/Contents/Home ANDROID_HOME=$HOME/Library/Android/sdk ./gradlew assembleDebug)
  (cd ios && pod install && xcodebuild -workspace HealthTracker.xcworkspace -scheme HealthTracker -destination 'generic/platform=iOS Simulator' build)
  ```
- Device builds go through EAS (`eas.json`: `development` = dev client, `preview` = sideloadable APK for Android, `production` = App Store / TestFlight). EAS is logged in as ninoan (`~/.bun/bin/eas`); ask before production/submit actions.
- TestFlight (verified working 2026-09-05): from `app/`, `eas build --platform ios --profile production --auto-submit` builds on EAS servers and uploads to App Store Connect; the build then shows up under TestFlight after processing. Build numbers come from EAS (`appVersionSource: remote`), so never edit `buildNumber` by hand — only bump `version` in `app.json` for a new marketing version. Credentials and the App Store Connect record are EAS-managed.
- `plugins/withSceneDelegate.js` adopts the UIScene life cycle (Info.plist scene manifest + a `SceneDelegate` on expo's `ExpoAppSceneDelegate`, needs expo ≥ 57.0.30). Apps linked against the iOS 27 SDK crash at launch without it, and the SDK 57 prebuild template doesn't do it. Drop the plugin once the Expo SDK's own template ships a SceneDelegate (SDK 58 does).
- Never pass `CODE_SIGNING_ALLOWED=NO` to simulator builds: it strips the HealthKit entitlement, and HealthKit then **hangs silently** on `requestAuthorization` instead of erroring (cost: a long debugging session on 2026-07-16). Simulator builds sign automatically.
- HealthKit's authorization sheet requires the request to be made from the main thread — the Expo module dispatches internally via `Task { @MainActor ... }`; keep it that way. Gating on `statusForAuthorizationRequest` hangs on simulators (the old Swift app hit this); the app gates with a local settings flag instead (`didRequestAuth:*`).
- On-device behavior (HealthKit prompts, real authorization sheets) can only be tested by Nino on his iPhone — ask rather than assume.

## Error reports (PostHog)

Opt-in only: nothing is sent unless the user switched on Settings → "Send error reports" (default off; never prompt or nudge for it). The switch *is* the anonymous id in the settings table (`errorReportingId`, a random UUID created on opt-in, deleted with any pending crash report on opt-out). The client is hand-rolled (no SDK): `src/telemetry/` holds the tested pure parts — `client.ts` (POSTs to `${host}/i/v0/e/`, anonymous events with `$process_person_profile: false` and `$geoip_disable: true`), `sanitize.ts` (messages lose quoted text, numbers, dates, ids, paths and HealthKit type names, capped at 200 chars; stacks keep only frame locations), `rateLimit.ts` (30 events an hour, extras dropped) and `events.ts` (the full vocabulary: `$exception`, `app_opened`, `entry_logged` with only a category). `src/app/telemetry.ts` wires it up: uncaught errors via `ErrorUtils`, unhandled rejections in release builds, failed queries, startup sync and mirror failures, import/export failures (import messages redacted, since they quote the file). A fatal error's report is also kept in settings and sent on the next launch if the app died first. Never send entry values, text, dates, specific symptom names or custom item names; when adding a report, add its context to `ErrorContext` rather than free text.

Key and host are build-time config, not in the repo: `EXPO_PUBLIC_POSTHOG_KEY` (the project API key, `phc_…`) and `EXPO_PUBLIC_POSTHOG_HOST` (e.g. `https://eu.i.posthog.com`). Without both, telemetry is a no-op (the switch still shows). Set them as EAS environment variables for the environments that should report, e.g. `eas env:create --environment production --environment preview --name EXPO_PUBLIC_POSTHOG_KEY --value phc_… --visibility plaintext` (and the same for the host); each `eas.json` build profile names its EAS environment (`development`, `preview`, `production`). For a local build, put them in `app/.env.local` (gitignored). No session replay, autocapture or person profiles: the PostHog free tier is the budget.

## Workflow

- Push to `origin main` immediately after every commit (Nino's standing instruction).
- Before opening a PR, run the `pre-pr` skill (`.claude/skills/pre-pr/`): checks, an independent code review of the diff, and fixes.
- **PR descriptions include screenshots** of any visible change (Nino's rule, 2026-07-28). Capture them from a real running app — a simulator/emulator locally, or the web screenshot harness (below) in remote containers — commit them to `docs/screenshots/`, and embed them with URLs pinned to a commit. Filenames must be unique per capture (`<date>-<short-sha>-<label>.png`, done by `capture.ts` automatically) — never reuse a name like `screenshot.png`, or the PR's image link silently shows whatever the file becomes later.

## Web screenshot harness

Web is **not a shipping target**; it exists so screenshots can be captured headlessly. From `app/`: `bunx expo export --platform web`, then `bun scripts/screenshots/capture.ts` (serves `dist/` itself, seeds ~10 weeks of demo data through the real Settings import, writes phone-sized shots to `docs/screenshots/`). Chromium is at `/opt/pw-browsers/chromium` in remote containers (`CHROMIUM_PATH` to override). Load-bearing pieces, all documented in-file:

- `index.web.ts` warms expo-sqlite's wasm worker asynchronously before mounting; `src/app/appDb.ts` opens the database lazily on first use. Both exist because expo-sqlite's synchronous web API waits on its worker with a *bounded* spin and throws (`Sync operation timeout`) if called before the worker is up — and a blocking retry can't recover, because the worker's startup is itself queued behind the blocked main thread.
- `metro.config.js` registers `.wasm` as an asset and serves COOP/COEP headers (the sync API needs SharedArrayBuffer, which needs cross-origin isolation; `capture.ts` sets the same headers).
- `patches/expo-sqlite@57.0.4.patch` (expo-sqlite is pinned exactly so the patch keeps applying) fixes an upstream web bug: the sync channel wrote the result length via `Uint8Array.set(new Uint32Array([length]))`, which coerces to a single byte, truncating every result over 255 bytes to `length % 256` (reads worked only for tiny results). Worth upstreaming; re-check when bumping expo-sqlite.

## Architecture

The design goal is zero duplication when adding symptom types — one symptom is one line of code.

- `src/catalog/` — the heart of the app: a data-driven catalog of all 39 HealthKit symptom category types (name, emoji icon, `hkIdentifier`, a `ValueKind` — severity / presence / appetite — supplying picker options and section title) plus the three metrics (mood/stress/anxiety with their ranges). Everything else (main-screen grid, settings toggles, log sheets, charts) derives from it. User-defined items (`custom_items` table, entry kind `"custom:<uuid>"`; severity, 1–10 rating, event, or numeric) flow through the same surfaces via the adapters in `src/catalog/custom.ts`; they never mirror to a health backend, deletion is archival only, and an item's kind is fixed after creation. Events (value always 1, plus an optional comment in `entries.value_text`; the separate free-text kind was folded into events in schema v7), numeric items (any typed number, decimals allowed — SQLite's column affinity stores them losslessly despite the INTEGER declaration), and the built-in quick-note tile (kind `"note"`, value 0, text in `value_text`) stay out of next-up; events chart as weekly counts with their comments listed underneath, numeric items as lines with a data-derived y-domain (the one non-fixed domain — see `numericDomain`), quick notes not at all.
- `src/store/` — the SQLite source of truth: `EntryStore` on a `SqlDriver` interface (expo-sqlite in the app, bun:sqlite in tests), `PRAGMA user_version` migrations, settings table, JSON export, Swift-app-export import with ±2s dedup. Ordering/range queries use a `date_unix_ms` column because local-offset ISO strings don't sort across DST boundaries.
- `src/backends/` — the `HealthBackend` abstraction and write-through mirroring: entries insert locally first (never blocked on a backend), then mirror with single-flight claim-before-write and bounded retries. `healthKitBackend` talks to the `health-kit` module; `healthConnectBackend` is scaffolding until Google ships symptom record types.
- `src/ui/` — one screen plus RN modal sheets, no navigation library. Main grid shows staleness-colored recency (re-rendered on a minute tick) and a weighted-random "next up" nudge; recency reads the local store only — no health-store queries at launch. History charts are hand-rolled on react-native-svg: one single-series chart per item (mood's high-is-good must not share a plot with stress/anxiety's high-is-bad), fixed y-domains, symptom y-axis = index into `valueKind.options` (display order), because raw HealthKit values don't sort (Present = 0, Not Present = 1); downsampled to ≤400 points.
- `src/lib/` — pure helpers (dates, staleness, chart geometry, random pick), all unit-tested.
- Timestamps serialize as ISO 8601 with local UTC offset (`src/lib/dates.ts`), the same convention as the old Swift app's metric log, so old exports stay importable.

## HealthKit specifics

- Value semantics were verified against the SDK header (`HKTypeIdentifiers.h` via `xcrun --sdk iphonesimulator --show-sdk-path`), not from memory — do the same before adding/changing category types. Of the 39 symptom types, all use `HKCategoryValueSeverity` except: `appetiteChanges` (`HKCategoryValueAppetiteChanges`) and `moodChanges`/`sleepChanges` (`HKCategoryValuePresence`).
- The UI's "Present" option maps to `HKCategoryValueSeverity.unspecified` (raw 0), not a presence value.
- Mood is saved as `HKStateOfMind` (kind `.momentaryEmotion`); the 1–10 rating maps linearly to valence via `(rating − 5.5) / 4.5`. Stress/anxiety are also 1–10 (1 = "none") since schema v4; they were 0–10 before, and the v4 migration plus the JSON import fold old zeros into 1. Mood mirroring requires iOS 18+.
- Authorization is requested for **all** symptom types plus State of Mind up front (once ever, gated by the settings flag), so enabling a symptom later never re-prompts. Adding a new read/share type will trigger one new permission prompt — mention that to Nino when it happens.
- HealthKit reports "read access denied" identically to "no data"; treat both as never logged. Don't try to distinguish them.
- Recency and history are read from the local store, not HealthKit — preserve that cheap-launch property (no health-store queries at launch). Recency sorts by the user-set entry date, so backdated entries are handled correctly.
