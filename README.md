# health-tracker

A React Native + Expo app (iOS + Android) for logging symptoms, mood, stress, and anxiety as fast as possible. Local-first: all tracked data lives in an in-app SQLite store the app owns; OS health stores (Apple HealthKit today, Android Health Connect when it grows symptom/mood record types) are sync targets, not the source of truth.

The app lives in `app/`. It began as a rewrite of a SwiftUI app — see `docs/react-native-rewrite.md` for the plan, research, and settled decisions; the original Swift app was removed once the RN app reached parity.

## Features

- **One-tap logging buttons** — the main screen is a grid of buttons for mood/stress/anxiety plus the symptoms you actually track, chosen in settings.
- **All 39 HealthKit symptom types** — with correct value semantics per symptom: most use the severity scale (Not Present / Present / Mild / Moderate / Severe); Mood Changes and Sleep Changes use presence; Appetite Changes uses No Change / Decreased / Increased.
- **Metrics** — mood on a 1–10 scale (mirrored to Apple Health as State of Mind), stress and anxiety on 0–10 (no HealthKit equivalent; local only).
- **Local-first store** — every entry is saved to SQLite first and never blocked on a health backend; HealthKit mirroring happens write-through with a retry queue. JSON export/import in settings.
- **Backdating** — every log sheet has an editable date/time.
- **Last-logged recency** — each button shows how long ago that item was logged, color-coded by staleness, plus a weighted-random "next up" nudge toward the least recently logged items.
- **History charts** — hand-rolled single-series line charts of everything you track.

## Development

Requires [bun](https://bun.sh). From `app/`:

```sh
bun install
bun run test        # domain-layer tests (bun test)
bun run typecheck
bun run lint
bun run format:check
```

The health backends are our own local Expo modules under `app/modules/` (Swift for HealthKit, Kotlin for Health Connect), so the app needs a dev build — Expo Go can't run it. `bunx expo prebuild` generates the native projects; device builds go through EAS. HealthKit requires the app to be signed with the HealthKit entitlement (Apple Developer account).

Dependency policy: React Native + Expo-curated packages + TanStack libraries only; everything else is hand-rolled, including the native health modules.
