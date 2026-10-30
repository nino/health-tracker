import { queryOptions, type QueryClient } from "@tanstack/react-query";

import { listCustomItems } from "../store/customItems";
import { getEnabledSymptomIds, getErrorReportingId } from "../store/settings";
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
  errorReporting: ["errorReporting"] as const,
};

// The reads behind the main screen's queries, shared with
// primeMainScreenQueries below.
const readLastDates = () => entryStore.lastDates();
const readEnabledSymptomIds = () => getEnabledSymptomIds(appDb);
const readCustomItems = () => listCustomItems(appDb);

export function entriesByKindOptions(kind: string) {
  return queryOptions({
    queryKey: entryKeys.byKind(kind),
    queryFn: () => entryStore.byKind(kind),
  });
}

export function lastDatesOptions() {
  return queryOptions({
    queryKey: entryKeys.lastDates(),
    queryFn: readLastDates,
  });
}

export function customItemsOptions() {
  return queryOptions({
    queryKey: customItemKeys.all,
    queryFn: readCustomItems,
  });
}

export function enabledSymptomIdsOptions() {
  return queryOptions({
    queryKey: settingsKeys.enabledSymptomIds,
    queryFn: readEnabledSymptomIds,
  });
}

export function errorReportingOptions() {
  return queryOptions({
    queryKey: settingsKeys.errorReporting,
    queryFn: () => getErrorReportingId(appDb) !== null,
  });
}

/** Fills the main screen's queries before its first render. A query
 * function always runs asynchronously, so without this the first frame
 * shows a half-empty grid (no symptoms, every tile "never") and the real
 * one follows a frame later. The reads are synchronous and local. A read
 * that throws leaves its query empty: it then runs as usual and its error
 * is reported through the query cache. */
export function primeMainScreenQueries(client: QueryClient): void {
  const prime = (fill: () => void) => {
    try {
      fill();
    } catch (error) {
      // see above
      if (__DEV__) console.warn("priming a startup query failed", error);
    }
  };
  // The keys come from the options factories, whose typed keys make each
  // read's result type match its query's. entryStore first: creating it
  // runs the migrations.
  prime(() =>
    client.setQueryData(lastDatesOptions().queryKey, readLastDates()),
  );
  prime(() =>
    client.setQueryData(
      enabledSymptomIdsOptions().queryKey,
      readEnabledSymptomIds(),
    ),
  );
  prime(() =>
    client.setQueryData(customItemsOptions().queryKey, readCustomItems()),
  );
}
