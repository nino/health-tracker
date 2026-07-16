import { useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { appDb, entryStore } from "../app/appDb";
import { METRICS, SYMPTOMS, type Metric, type Symptom } from "../catalog";
import { nextUp } from "../lib/nextUp";
import { weightedRandomByRecency } from "../lib/randomPick";
import { getEnabledSymptomIds } from "../store/settings";
import { HistorySheet } from "./HistorySheet";
import { InfoSheet } from "./InfoSheet";
import { MetricLogSheet } from "./MetricLogSheet";
import { SettingsSheet } from "./SettingsSheet";
import { SymptomLogSheet } from "./SymptomLogSheet";
import { Tile, PlainTile } from "./Tile";
import { useTheme } from "./theme";

// Re-render every minute so relative ages and staleness colors stay current
// (the TimelineView equivalent).
function useMinuteTick(): Date {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 60_000);
    return () => clearInterval(timer);
  }, []);
  return now;
}

export function MainScreen() {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const now = useMinuteTick();
  const [selectedSymptom, setSelectedSymptom] = useState<Symptom | null>(null);
  const [selectedMetric, setSelectedMetric] = useState<Metric | null>(null);
  const [showingSettings, setShowingSettings] = useState(false);
  const [showingInfo, setShowingInfo] = useState(false);
  const [showingHistory, setShowingHistory] = useState(false);

  const lastDates = useQuery({
    queryKey: ["lastDates"],
    queryFn: () => entryStore.lastDates(),
  });
  const enabledIds = useQuery({
    queryKey: ["enabledSymptomIds"],
    queryFn: () => getEnabledSymptomIds(appDb),
  });

  const enabledSymptoms = SYMPTOMS.filter((s) =>
    (enabledIds.data ?? []).includes(s.id),
  );
  const dates = lastDates.data ?? new Map<string, Date>();

  const pickRandom = () => {
    const pick = weightedRandomByRecency(enabledSymptoms, dates);
    if (pick) setSelectedSymptom(pick);
  };

  // Grid order for Save & Next: metrics first, then enabled symptoms.
  const gridItems: (Metric | Symptom)[] = [...METRICS, ...enabledSymptoms];
  const currentKind = selectedMetric?.id ?? selectedSymptom?.id ?? "";
  const nextAvailable =
    nextUp(gridItems, currentKind, dates, now) !== undefined;

  // Called by a sheet right after its Save & Next saved: advance to the next
  // item needing logging. Reads recency fresh from the store — the query
  // cache hasn't refetched yet at this point.
  const advanceToNext = () => {
    const next = nextUp(
      gridItems,
      currentKind,
      entryStore.lastDates(),
      new Date(),
    );
    if (!next) {
      setSelectedMetric(null);
      setSelectedSymptom(null);
      return;
    }
    if ("valueKind" in next) {
      setSelectedMetric(null);
      setSelectedSymptom(next);
    } else {
      setSelectedSymptom(null);
      setSelectedMetric(next);
    }
  };

  return (
    <View
      style={[
        styles.screen,
        { backgroundColor: theme.background, paddingTop: insets.top },
      ]}
    >
      <View style={styles.header}>
        <Text style={[styles.title, { color: theme.text }]}>Log Symptom</Text>
        <View style={styles.headerButtons}>
          <Pressable onPress={() => setShowingHistory(true)} hitSlop={8}>
            <Text style={styles.headerIcon}>📈</Text>
          </Pressable>
          <Pressable onPress={() => setShowingInfo(true)} hitSlop={8}>
            <Text style={styles.headerIcon}>ℹ️</Text>
          </Pressable>
          <Pressable onPress={() => setShowingSettings(true)} hitSlop={8}>
            <Text style={styles.headerIcon}>⚙️</Text>
          </Pressable>
        </View>
      </View>

      <ScrollView
        contentContainerStyle={[
          styles.grid,
          { paddingBottom: insets.bottom + 16 },
        ]}
      >
        {METRICS.map((metric) => (
          <Tile
            key={metric.id}
            title={metric.name}
            icon={metric.icon}
            lastDate={dates.get(metric.id) ?? null}
            now={now}
            onPress={() => setSelectedMetric(metric)}
          />
        ))}
        {enabledSymptoms.map((symptom) => (
          <Tile
            key={symptom.id}
            title={symptom.name}
            icon={symptom.icon}
            lastDate={dates.get(symptom.id) ?? null}
            now={now}
            onPress={() => setSelectedSymptom(symptom)}
          />
        ))}
        {enabledSymptoms.length > 0 && (
          <PlainTile title="Random" icon="🎲" onPress={pickRandom} />
        )}
        {enabledIds.isSuccess && enabledSymptoms.length === 0 && (
          <Text style={[styles.empty, { color: theme.secondaryText }]}>
            No symptoms enabled. Add some via the gear icon.
          </Text>
        )}
      </ScrollView>

      {selectedSymptom && (
        <SymptomLogSheet
          key={selectedSymptom.id}
          symptom={selectedSymptom}
          onClose={() => setSelectedSymptom(null)}
          nextAvailable={nextAvailable}
          onSaveAndNext={advanceToNext}
        />
      )}
      {selectedMetric && (
        <MetricLogSheet
          key={selectedMetric.id}
          metric={selectedMetric}
          onClose={() => setSelectedMetric(null)}
          nextAvailable={nextAvailable}
          onSaveAndNext={advanceToNext}
        />
      )}
      {showingSettings && (
        <SettingsSheet onClose={() => setShowingSettings(false)} />
      )}
      {showingInfo && <InfoSheet onClose={() => setShowingInfo(false)} />}
      {showingHistory && (
        <HistorySheet onClose={() => setShowingHistory(false)} />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  title: { fontSize: 28, fontWeight: "700" },
  headerButtons: { flexDirection: "row", gap: 16 },
  headerIcon: { fontSize: 22 },
  grid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
    paddingHorizontal: 16,
  },
  empty: { width: "100%", textAlign: "center", marginTop: 24 },
});
