# React Native rewrite plan

Cross-platform (iOS + Android) rewrite with React Native + Expo, so the app runs on
non-Apple phones (immediate motivation: a friend on a Xiaomi). Written 2026-07-15;
statuses and library facts were verified on that date.

## Goals

1. **iOS + Android** from one codebase.
2. **Local-first**: *all* tracked data (symptoms + mood/stress/anxiety) lives in an
   in-app store — the app owns its data. OS health stores become sync targets, not
   the source of truth. (Today the Swift app stores symptoms only in HealthKit.)
3. **Pluggable backends**: Apple HealthKit on iOS, Android Health Connect on Android,
   gracefully degrading to local-only where a backend can't hold a record type.
4. **Zero dependencies beyond RN + Expo.** No third-party health bindings, no chart
   library, no navigation library. Only Expo-curated packages (`expo-sqlite`,
   `expo-file-system`, and the Expo Modules API for our own native code) — everything
   else hand-rolled, same spirit as the Swift app.

## Reality check (research findings, 2026-07)

- **Health Connect has no symptom or mood record types today.** Its catalog covers
  fitness/vitals/sleep/nutrition/cycle tracking plus mindfulness *sessions* — nothing
  that maps to HealthKit's 39 symptom categories or State of Mind. Google announced
  (Dec 2025) an expansion into symptom tracking (nausea, shortness of breath,
  palpitations, insomnia, …) and alcohol logging, rolling out through 2026.
  Consequence: **on Android the local store is the only store for now**, which is
  exactly why goal 2 exists. The backend abstraction must let per-kind support light
  up later without schema changes.
- **Xiaomi**: Mi Fitness has no public third-party write API. Health Connect is the
  interop layer, built into Android 14+ (HyperOS). So "whatever you get on a Xiaomi
  phone" = Health Connect.
- **HealthKit from RN** requires a native module either way (Expo Go can't do
  HealthKit; a dev build / EAS is required regardless). The popular binding
  (`@kingstinct/react-native-healthkit`) does support State of Mind, but it binds all
  of HealthKit and rides the Nitro-modules churn — we only need ~6 functions, and
  `ios/health-tracker/HealthKitManager.swift` (139 lines) is already exactly that
  surface. **Decision: write our own Expo modules** (Swift + Kotlin).
- **What the rewrite gives up: the native macOS app.** RN targets iOS/Android.
  Accepted (2026-07-15): the macOS app isn't in use, so losing it is fine. Long-term,
  the realistic path to Mac support is running the RN iOS app on Apple-silicon Macs
  ("Designed for iPad") — `react-native-macos` exists but isn't Expo-supported, so it
  would break the zero-dependency/Expo constraint.

## Repo layout

```
ios/        the existing Swift app (kept building until the RN app reaches parity)
app/        the Expo app (new)
  src/
    catalog/     symptom + metric definitions (port of Symptom.swift / MetricKind)
    store/       SQLite entry store, migrations, export/import
    backends/    HealthBackend interface + HealthKit / HealthConnect / null impls
    ui/          screens & components (no navigation lib: one screen + RN modals)
  modules/
    health-kit/       our Expo module: Swift (port of HealthKitManager)
    health-connect/   our Expo module: Kotlin (androidx.health.connect:connect-client)
docs/       this plan
```

## Architecture

### Catalog (port of `Symptom.swift`)

The one-line-per-symptom design carries over as a TS module: name, icon, `valueKind`
(severity / presence / appetite → options, default, section title), plus **per-backend
mappings**: `hkIdentifier` (always set) and `healthConnectType` (null today, filled in
as Google ships symptom records). `MetricKind` (mood/stress/anxiety, ranges 1–10 vs
0–10, descriptions) ports the same way. Icons: map SF Symbol names to a small set of
bundled vector glyphs or emoji — SF Symbols don't exist on Android (decide in Phase 3).

### Local store (source of truth)

`expo-sqlite`, one `entries` table unifying symptoms and metrics:

```
entries(id TEXT PK, kind TEXT, value INTEGER, date TEXT, logged_at TEXT,
        backend TEXT NULL, backend_id TEXT NULL, backend_synced_at TEXT NULL)
```

- `kind` is either a metric (`mood`) or a symptom id (`HKCategoryTypeIdentifier` raw
  value — already stable, platform-neutral strings).
- `date` (user-set, backdatable) and `logged_at` stay separate, ISO 8601 with local
  UTC offset — same semantics as `MetricStore` today.
- `backend_*` columns record where the entry was mirrored (sample UUID for dedup) and
  whether the mirror succeeded — this is the write-through queue.
- **Schema is versioned from day one** via `PRAGMA user_version` + an ordered
  migration list; a failed migration never truncates (fixes the silent-data-loss
  hazard the Swift `MetricStore` has).
- Export: JSON (superset of today's `metric-log.json` format) via the OS share sheet.

### Backend abstraction

```ts
interface HealthBackend {
  capabilities(kind: EntryKind): 'read-write' | 'write-only' | 'none'
  requestAuthorization(kinds: EntryKind[]): Promise<void>
  write(entry: Entry): Promise<string /* backend sample id */>
  lastDates(kinds: EntryKind[]): Promise<Map<EntryKind, Date>>   // recency backfill
  history(kind: EntryKind): Promise<Sample[]>                     // import / charts
}
```

- **iOS**: `HealthKitBackend` on our own Expo module. The Swift side is a near-verbatim
  port of `HealthKitManager` (auth gated on `statusForAuthorizationRequest`, category
  samples, `HKStateOfMind` with the linear rating↔valence mapping, limit-1 recency
  queries sorted by `endDate`, throttled fan-out). Config plugin adds the HealthKit
  entitlement + usage strings.
- **Android**: `HealthConnectBackend`, `capabilities()` returns `'none'` for
  everything today; the Kotlin module starts as availability-check + permission
  scaffolding and grows when symptom record types ship.
- Writes are **local-first**: insert into SQLite (never blocked on the backend), then
  mirror to the backend where `capabilities() !== 'none'`; failures stay queued and
  retry on next launch/foreground. Recency display reads local data only — that keeps
  the cheap-launch property (no health-store queries at launch at all, better than the
  Swift app).

### UI parity checklist (all hand-rolled)

Main grid (metrics + enabled symptoms + weighted-random button, staleness dot +
relative age, minute re-render), symptom/metric log sheets with backdating, settings
toggles, info sheet, history charts. Charts are the one real hand-rolling cost:
single-series line/point charts drawn with plain Views or a small inline SVG—no chart
library. Same chart rules as today: mood never shares a plot with stress/anxiety;
fixed y-domain; symptom y-axis is the option index in display order.

## Migration from the Swift app

First-run import, iOS only, mirroring the existing one-time mood import pattern:
1. **Metrics**: import `metric-log.json` via the Swift app's JSON export + the share
   sheet (the apps run side by side under different bundle ids, so sandboxing rules
   out reading the file directly).
2. **Symptoms**: backfill full history from HealthKit through `history()` (the Swift
   app never stored symptoms locally). ±2s dedup against anything already mirrored.
3. Imported entries use the sample date as `logged_at` (original logging time is
   unrecoverable), same convention as the existing mood import.

## Phases

1. **Scaffold** — Expo app in `app/` (TS strict, dev-client, EAS build profiles),
   empty Expo modules compiling on both platforms. Milestone: dev build runs on
   Nino's iPhone and a Xiaomi (or Android emulator).
2. **Domain core** — catalog port, SQLite store + migrations + export. This layer is
   pure TS: unit-test it (the first real tests in this project).
3. **UI parity** — main grid, log sheets, settings, info, charts; local-only.
   Milestone: the friend can install an APK and start logging.
4. **HealthKit backend** — Swift module, write-through mirroring, first-run import.
   Milestone: Nino switches daily logging to the RN app; the Swift app can be
   retired once nothing is missed.
5. **Health Connect backend** — when Google ships symptom/mood record types, fill in
   the Kotlin module and flip `capabilities()`.

## Decisions (settled 2026-07-15)

- **Bundle id**: new id, side by side with the Swift app during the transition.
  Import happens via the export/share flow (see Migration above).
- **Icons**: emoji for symptom/metric glyphs — cross-platform for free, revisit only
  if it looks bad in practice.
- **Distribution**: direct APK sideload for the friend (EAS build with an `apk`
  buildType profile; she enables "install unknown apps" once — updates are re-sent
  files, and the EAS-managed keystore must stay the same across builds or Android
  refuses the update). For iOS, TestFlight eventually via EAS Submit — the Apple
  Developer membership the HealthKit entitlement already requires covers it; internal
  testing needs no App Review. Play internal testing track only if APK-passing gets
  annoying.
