import { QueryCache, QueryClient } from "@tanstack/react-query";

import { reportError } from "./telemetry";

// Data is local and synchronous; queries refresh via explicit invalidation.
// A failing query means the store itself is broken (a failed migration, say),
// which is worth an error report.
export const queryClient = new QueryClient({
  defaultOptions: { queries: { staleTime: Infinity } },
  queryCache: new QueryCache({
    onError: (error) => reportError(error, "query"),
  }),
});
