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

/** Write-through mirroring: push every unsynced entry the backend can hold.
 * Failures leave entries queued for the next run. Returns how many synced. */
export async function mirrorPending(
  store: EntryStore,
  backend: HealthBackend,
): Promise<number> {
  let mirrored = 0;
  for (const entry of store.unsynced(mirrorableKinds(backend))) {
    try {
      const backendId = await backend.write(
        entry.kind,
        entry.value,
        entry.date,
      );
      store.markSynced(entry.id, backend.name, backendId);
      mirrored++;
    } catch {
      // Stay queued; retried on next app start / save.
    }
  }
  return mirrored;
}

/** Request backend authorization exactly once per distinct kind-set. The
 * flag key includes the mirrorable kind count, so adding a type to the
 * catalog later triggers exactly one new request; steady-state launches
 * never touch the backend's authorization machinery at all. */
export async function ensureAuthorization(
  db: SqlDriver,
  backend: HealthBackend,
): Promise<void> {
  const kinds = mirrorableKinds(backend);
  if (kinds.length === 0) return;
  const flag = `didRequestAuth:${backend.name}:${kinds.length}`;
  if (getSetting(db, flag) === "true") return;
  await backend.requestAuthorization();
  setSetting(db, flag, "true");
}

const IMPORT_FLAG = "didImportFromBackend";

/** One-time backfill of pre-existing backend history into the local store
 * (mirrors the Swift app's one-time HealthKit mood import). Imported entries
 * carry backend provenance so they are never mirrored back, and the ±2s
 * import dedup keeps dual-written entries single. */
export async function importBackendHistory(
  db: SqlDriver,
  store: EntryStore,
  backend: HealthBackend,
): Promise<number> {
  const flag = `${IMPORT_FLAG}:${backend.name}`;
  if (getSetting(db, flag) === "true") return 0;
  let added = 0;
  for (const kind of mirrorableKinds(backend)) {
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
