import {
  QueryCache,
  QueryClient,
  QueryClientProvider,
} from "@tanstack/react-query";
import { StatusBar } from "expo-status-bar";
import { AppState } from "react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";

import { syncAtStartup, syncOnForeground } from "./src/app/health";
import { reportError, telemetry } from "./src/app/telemetry";
import { MainScreen } from "./src/ui/MainScreen";
import { useMountEffect } from "./src/ui/useMountEffect";

// Data is local and synchronous; queries refresh via explicit invalidation.
// A failing query means the store itself is broken (a failed migration, say),
// which is worth an error report.
const queryClient = new QueryClient({
  defaultOptions: { queries: { staleTime: Infinity } },
  queryCache: new QueryCache({
    onError: (error) => reportError(error, "query"),
  }),
});

export function App() {
  useMountEffect(() => {
    telemetry.flushPending();
    telemetry.capture({ name: "app_opened" });
    void syncAtStartup(queryClient);
    const subscription = AppState.addEventListener("change", (state) => {
      if (state === "active") syncOnForeground();
    });
    return () => subscription.remove();
  });

  return (
    <SafeAreaProvider>
      <QueryClientProvider client={queryClient}>
        <MainScreen />
        <StatusBar style="auto" />
      </QueryClientProvider>
    </SafeAreaProvider>
  );
}
