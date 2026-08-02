---
name: react-query-tkdodo
description: TkDodo's React Query (TanStack Query) best practices, applied to this codebase — query key factories, queryOptions abstractions, staleTime, mutations, and what not to do. Use whenever adding or changing useQuery/useMutation/invalidateQueries code in app/src.
---

# React Query the TkDodo way

TkDodo (Dominik Dorfmeister, TanStack Query maintainer) has written the de-facto
canonical guidance for React Query. Follow it whenever touching query code here.
Primary sources (read them when in doubt — they are short):

- https://tkdodo.eu/blog/practical-react-query
- https://tkdodo.eu/blog/effective-react-query-keys
- https://tkdodo.eu/blog/creating-query-abstractions
- https://tkdodo.eu/blog/mastering-mutations-in-react-query

This app uses TanStack Query v5 with a **synchronous local SQLite store**
(`entryStore`, `appDb`) as the "server". The advice still applies: the store is
server state (it outlives components and can change from other code paths like
imports and sync), so it stays in the query cache, never copied into
`useState`.

## Query keys

1. **One hierarchy, generic → specific.** `['entries']` → `['entries', kind]`.
   Broad invalidation (`['entries']`) then covers every per-kind query.
2. **The key is a dependency array.** Everything the queryFn reads must be in
   the key (a `kind`, a filter, a date range). Never refetch-by-hand what a key
   change would refetch automatically.
3. **Use a query key factory per feature — no inline string arrays.** Current
   code uses ad-hoc literals (`["lastDates"]`, `["entries", kind]`,
   `["customItems"]`, `["enabledSymptomIds"]`); when you touch a query, migrate
   its keys into a factory colocated with the feature (e.g.
   `src/app/queries.ts`), imported directly (no barrel files):

   ```ts
   export const entryKeys = {
     all: ["entries"] as const,
     byKind: (kind: string) => [...entryKeys.all, kind] as const,
   };
   export const settingsKeys = {
     enabledSymptomIds: ["enabledSymptomIds"] as const,
     customItems: ["customItems"] as const,
     lastDates: ["lastDates"] as const,
   };
   ```

   Every `useQuery` and every `invalidateQueries` call goes through the
   factory. Typos in string literals are silent staleness bugs.

## Abstractions: queryOptions over custom hooks

4. **Share query definitions with `queryOptions()`**, not by wrapping
   everything in a custom hook. A `queryOptions` object composes with
   `useQuery`, `useSuspenseQuery`, `prefetchQuery`, and imperative
   `queryClient` calls, and keeps full type inference:

   ```ts
   export function entriesByKind(kind: string) {
     return queryOptions({
       queryKey: entryKeys.byKind(kind),
       queryFn: () => entryStore.byKind(kind),
     });
   }
   // usage site adds what it needs:
   useQuery({ ...entriesByKind(kind), select: (e) => e.length });
   ```

5. **The best abstractions are not configurable.** Do not add option-bag
   parameters to shared query definitions; spread extra options at the usage
   site instead (`select`, `staleTime`, `enabled`).
6. A custom hook is still fine as a thin layer *on top of* a `queryOptions`
   definition when several components repeat the same usage — but the options
   object is the shared unit, the hook is not.

## Behavior

7. **Tune `staleTime`, leave `gcTime` alone.** Our data only changes through
   our own writes (every write invalidates), so generous `staleTime` is right;
   the minute-tick re-render must not trigger refetch storms.
8. **Never copy query data into `useState`.** Render from the query result;
   derive with `select`. The one sanctioned exception is seeding a form's
   initial value from a query.
9. **`enabled` is the tool for dependent/conditional queries** — not
   conditional hook calls, not manual fetching.

## Mutations (when we grow real `useMutation` usage)

10. **Prefer invalidation over `setQueryData`.** Refetching from SQLite is
    cheap and cannot drift from store logic. (Today's code invalidates after
    synchronous writes — keep that.)
11. **Return the `invalidateQueries` promise from mutation callbacks** so the
    mutation stays pending until the refetch lands.
12. **Query-cache logic in `useMutation` callbacks; UI reactions (close sheet,
    toast, navigate) in the `mutate(_, { onSuccess })` callback** — component
    callbacks are skipped on unmount, cache callbacks are not.
13. **Default to `mutate`, not `mutateAsync`.** `mutate` swallows nothing you
    need — errors surface in `onError` — and avoids unhandled-rejection traps.
14. **Optimistic updates only where instant feedback matters and failure is
    rare** (a toggle), never as the default pattern.

## Review checklist for query-touching PRs

- [ ] No inline key literals — factory only, used by queries *and* invalidations.
- [ ] Key contains every input the queryFn reads.
- [ ] No server/store data copied into component state.
- [ ] Shared definitions are `queryOptions` objects; no configurable mega-hooks.
- [ ] Invalidation preferred over manual cache writes; its promise returned
      from mutation callbacks.
