import { METRICS, SYMPTOMS } from "../catalog";
import { type SqlDriver } from "../store/driver";
import { type EntryStore } from "../store/entryStore";
import { getSetting, setSetting } from "../store/settings";
import { type HealthBackend } from "./types";

function mirrorableKinds(backend: HealthBackend): string[] {
  return [...METRICS.map((m) => m.id), ...SYMPTOMS.map((s) => s.id)].filter(
    (kind) => backend.capability(kind) === "read-write",
  );
}

/** Stable key for a kind-set, so once-ever flags re-fire when the set
 * *changes* (not just when it grows — a swap keeps the count identical). */
function kindsKey(kinds: string[]): string {
  const joined = [...kinds].sort().join(",");
  let hash = 5381;
  for (let i = 0; i < joined.length; i++) {
    hash = ((hash * 33) ^ joined.charCodeAt(i)) >>> 0;
  }
  return `${kinds.length}-${hash.toString(36)}`;
}

// Single-flight per store: concurrent calls (startup drain overlapping a
// user save) chain instead of interleaving — overlapping runs would both
// see the same unsynced entries and double-write them to the backend.
const inFlight = new WeakMap<EntryStore, Promise<number>>();

/** Write-through mirroring: push every unsynced entry the backend can hold.
 * Failures release the claim and count an attempt; entries park after
 * MAX_MIRROR_ATTEMPTS. Returns how many entries synced in this run. */
export function mirrorPending(
  store: EntryStore,
  backend: HealthBackend,
): Promise<number> {
  const previous = inFlight.get(store) ?? Promise.resolve(0);
  const run = previous.catch(() => 0).then(() => runMirror(store, backend));
  inFlight.set(store, run);
  return run;
}

async function runMirror(
  store: EntryStore,
  backend: HealthBackend,
): Promise<number> {
  let mirrored = 0;
  for (const entry of store.unsynced(mirrorableKinds(backend))) {
    // Claim before the slow native write: a crash between the backend write
    // and markSynced must not lead to a second write next launch (a
    // duplicate health sample is worse than a missing one).
    store.claimForMirror(entry.id, backend.name);
    try {
      const backendId = await backend.write(
        entry.kind,
        entry.value,
        entry.date,
      );
      store.markSynced(entry.id, backend.name, backendId);
      mirrored++;
    } catch {
      store.releaseMirrorClaim(entry.id); // counts the attempt
    }
  }
  return mirrored;
}

/** Request backend authorization exactly once per distinct kind-set, so
 * changing the catalog (adding *or* swapping types) triggers exactly one new
 * request and steady-state launches never touch the backend's authorization
 * machinery at all. */
export async function ensureAuthorization(
  db: SqlDriver,
  backend: HealthBackend,
): Promise<void> {
  const kinds = mirrorableKinds(backend);
  if (kinds.length === 0) return;
  const flag = `didRequestAuth:${backend.name}:${kindsKey(kinds)}`;
  if (getSetting(db, flag) === "true") return;
  await backend.requestAuthorization();
  setSetting(db, flag, "true");
}

/** One-time backfill of pre-existing backend history into the local store
 * (mirrors the Swift app's one-time HealthKit mood import). Imported entries
 * carry backend provenance so they are never mirrored back, and the ±2s
 * import dedup keeps dual-written entries single. The flag is keyed on the
 * kind-set: a backend whose capabilities light up later (Health Connect)
 * gets its backfill then, not skipped forever. */
export async function importBackendHistory(
  db: SqlDriver,
  store: EntryStore,
  backend: HealthBackend,
): Promise<number> {
  const kinds = mirrorableKinds(backend);
  if (kinds.length === 0) return 0; // nothing attempted — set no flag
  const flag = `didImportFromBackend:${backend.name}:${kindsKey(kinds)}`;
  if (getSetting(db, flag) === "true") return 0;
  let added = 0;
  for (const kind of kinds) {
    const samples = await backend.history(kind);
    added += store.import(
      samples.map((sample) => ({
        kind,
        value: sample.value,
        date: sample.date,
        backend: backend.name,
        backendId: sample.backendId,
      })),
    );
  }
  setSetting(db, flag, "true");
  return added;
}
