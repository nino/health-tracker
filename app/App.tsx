import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { StatusBar } from "expo-status-bar";
import { useEffect } from "react";
import { AppState } from "react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";

import { syncAtStartup, syncOnForeground } from "./src/app/health";
import { MainScreen } from "./src/ui/MainScreen";

// Data is local and synchronous; queries refresh via explicit invalidation.
const queryClient = new QueryClient({
  defaultOptions: { queries: { staleTime: Infinity } },
});

export function App() {
  useEffect(() => {
    void syncAtStartup(queryClient);
    const subscription = AppState.addEventListener("change", (state) => {
      if (state === "active") syncOnForeground();
    });
    return () => subscription.remove();
  }, []);

  return (
    <SafeAreaProvider>
      <QueryClientProvider client={queryClient}>
        <MainScreen />
        <StatusBar style="auto" />
      </QueryClientProvider>
    </SafeAreaProvider>
  );
}
