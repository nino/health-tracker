import { type QueryClient } from "@tanstack/react-query";

import {
  activeBackend,
  ensureAuthorization,
  importBackendHistory,
  mirrorPending,
} from "../backends";
import { appDb, entryStore } from "./appDb";

// Startup sync: authorization (status-gated, so it only ever prompts once),
// the one-time backfill of pre-existing backend history, then write-through
// mirroring of anything still queued. Errors are swallowed — entries stay
// queued and retry on the next run; the local store never depends on this.
export async function syncAtStartup(queryClient: QueryClient): Promise<void> {
  try {
    await ensureAuthorization(appDb, activeBackend);
    const imported = await importBackendHistory(
      appDb,
      entryStore,
      activeBackend,
    );
    await mirrorPending(entryStore, activeBackend);
    if (imported > 0) {
      void queryClient.invalidateQueries({ queryKey: ["lastDates"] });
    }
  } catch (error) {
    console.warn("health backend sync failed", error);
  }
}

/** The one save path for the UI: local write first (source of truth), then
 * fire-and-forget mirroring to the platform backend. */
export function saveEntry(
  queryClient: QueryClient,
  kind: string,
  value: number,
  date: Date,
): void {
  entryStore.add(kind, value, date);
  void queryClient.invalidateQueries({ queryKey: ["lastDates"] });
  void queryClient.invalidateQueries({ queryKey: ["entries", kind] });
  void mirrorPending(entryStore, activeBackend).catch(() => {});
}
