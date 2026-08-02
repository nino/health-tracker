import { queryOptions } from "@tanstack/react-query";

import { listCustomItems } from "../store/customItems";
import { getEnabledSymptomIds } from "../store/settings";
import { appDb, entryStore } from "./appDb";

// Query key factories + shared queryOptions (the TkDodo patterns — see
// .claude/skills/react-query-tkdodo). Keys go generic → specific so
// invalidation can be broad (entryKeys.all after an import) or surgical
// (one kind after a save). Every useQuery and invalidateQueries call goes
// through these — no inline key literals.

export const entryKeys = {
  all: ["entries"] as const,
  byKind: (kind: string) => [...entryKeys.all, "byKind", kind] as const,
  lastDates: () => [...entryKeys.all, "lastDates"] as const,
};

export const customItemKeys = { all: ["customItems"] as const };

export const settingsKeys = {
  enabledSymptomIds: ["enabledSymptomIds"] as const,
};

export function entriesByKindOptions(kind: string) {
  return queryOptions({
    queryKey: entryKeys.byKind(kind),
    queryFn: () => entryStore.byKind(kind),
  });
}

export function lastDatesOptions() {
  return queryOptions({
    queryKey: entryKeys.lastDates(),
    queryFn: () => entryStore.lastDates(),
  });
}

export function customItemsOptions() {
  return queryOptions({
    queryKey: customItemKeys.all,
    queryFn: () => listCustomItems(appDb),
  });
}

export function enabledSymptomIdsOptions() {
  return queryOptions({
    queryKey: settingsKeys.enabledSymptomIds,
    queryFn: () => getEnabledSymptomIds(appDb),
  });
}
