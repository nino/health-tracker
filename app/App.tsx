import { randomUUID } from "expo-crypto";
import { StatusBar } from "expo-status-bar";
import { useMemo } from "react";
import { Platform, StyleSheet, Text, View } from "react-native";

import {
  HealthConnect,
  HealthConnectSdkStatus,
} from "./modules/health-connect";
import { HealthKit } from "./modules/health-kit";
import { SYMPTOMS } from "./src/catalog";
import { EntryStore, SCHEMA_VERSION } from "./src/store";
import { openAppDatabase } from "./src/store/expoSqliteDriver";

// Phase-2 smoke screen: proves the JS bundle, both native modules, and the
// SQLite store (open + migrate on real expo-sqlite) all work on-device.
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

function storeStatus(): string {
  try {
    const store = new EntryStore(openAppDatabase(), randomUUID);
    return `Store: ${store.count()} entries, schema v${SCHEMA_VERSION}`;
  } catch (error) {
    return `Store failed: ${String(error)}`;
  }
}

export function App() {
  const store = useMemo(storeStatus, []);
  return (
    <View style={styles.container}>
      <Text style={styles.title}>Health Tracker</Text>
      <Text>{backendStatus()}</Text>
      <Text>{store}</Text>
      <Text>{SYMPTOMS.length} symptoms in catalog</Text>
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
