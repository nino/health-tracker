import { StatusBar } from "expo-status-bar";
import { Platform, StyleSheet, Text, View } from "react-native";

import {
  HealthConnect,
  HealthConnectSdkStatus,
} from "./modules/health-connect";
import { HealthKit } from "./modules/health-kit";

// Phase-1 smoke screen: proves the JS bundle and both native modules load.
// Replaced by the real main grid in phase 3.
function backendStatus(): string {
  if (Platform.OS === "ios") {
    if (!HealthKit) return "HealthKit module missing";
    return `HealthKit available: ${HealthKit.isHealthDataAvailable()}`;
  }
  if (Platform.OS === "android") {
    if (!HealthConnect) return "Health Connect module missing";
    const status = HealthConnect.getSdkStatus();
    const label = HealthConnectSdkStatus[status] ?? `unknown (${status})`;
    return `Health Connect: ${label}`;
  }
  return `No health backend on ${Platform.OS}`;
}

export function App() {
  return (
    <View style={styles.container}>
      <Text style={styles.title}>Health Tracker</Text>
      <Text>{backendStatus()}</Text>
      <StatusBar style="auto" />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
  },
  title: { fontSize: 20, fontWeight: "600" },
});
