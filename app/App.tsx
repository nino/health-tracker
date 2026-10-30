import { QueryClientProvider } from "@tanstack/react-query";
import { StatusBar } from "expo-status-bar";
import { AppState } from "react-native";
import {
  initialWindowMetrics,
  SafeAreaProvider,
} from "react-native-safe-area-context";

import { syncAtStartup, syncOnForeground } from "./src/app/health";
import { queryClient } from "./src/app/queryClient";
import { telemetry } from "./src/app/telemetry";
import { MainScreen } from "./src/ui/MainScreen";
import { useMountEffect } from "./src/ui/useMountEffect";

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
    // Without initialMetrics the provider renders nothing until native
    // reports the insets, which costs a cold start a blank frame (and a
    // round trip) before the main screen can mount.
    <SafeAreaProvider initialMetrics={initialWindowMetrics}>
      <QueryClientProvider client={queryClient}>
        <MainScreen />
        <StatusBar style="auto" />
      </QueryClientProvider>
    </SafeAreaProvider>
  );
}
