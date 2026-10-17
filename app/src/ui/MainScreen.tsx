import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { entryStore } from "../app/appDb";
import {
  customItemsOptions,
  enabledSymptomIdsOptions,
  lastDatesOptions,
} from "../app/queries";
import { METRICS, SYMPTOMS, type Metric, type Symptom } from "../catalog";
import { customItemToMetric, customItemToSymptom } from "../catalog/custom";
import { NOTE } from "../catalog/note";
import { nextUp } from "../lib/nextUp";
import { weightedRandomByRecency } from "../lib/randomPick";
import { customEntryKind, type CustomItem } from "../store/customItems";
import { EventLogSheet } from "./EventLogSheet";
import { HistorySheet } from "./HistorySheet";
import { InfoSheet } from "./InfoSheet";
import { MetricLogSheet } from "./MetricLogSheet";
import { NoteLogSheet } from "./NoteLogSheet";
import { NumericLogSheet } from "./NumericLogSheet";
import { SettingsSheet } from "./SettingsSheet";
import { SheetDeck } from "./SheetDeck";
import { SymptomLogSheet } from "./SymptomLogSheet";
import { Tile, PlainTile } from "./Tile";
import { useTheme } from "./theme";
import { useMountEffect } from "./useMountEffect";

// Re-render every minute so relative ages and staleness colors stay current
// (the TimelineView equivalent).
function useMinuteTick(): Date {
  const [now, setNow] = useState(() => new Date());
  useMountEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 60_000);
    return () => clearInterval(timer);
  });
  return now;
}

export function MainScreen() {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const now = useMinuteTick();
  // The metric or symptom being logged. Both kinds share one SheetDeck so
  // Save & Next can swap sheets without dismissing the modal.
  const [logItem, setLogItem] = useState<Metric | Symptom | null>(null);
  // The just-saved item whose sheet is still flying off the deck.
  const [leavingItem, setLeavingItem] = useState<Metric | Symptom | null>(null);
  // Event and numeric items share one selection; the sheet is picked
  // by kind. (Severity/rating items flow through the symptom/metric states.)
  const [selectedCustom, setSelectedCustom] = useState<CustomItem | null>(null);
  const [showingNote, setShowingNote] = useState(false);
  const [showingSettings, setShowingSettings] = useState(false);
  const [showingInfo, setShowingInfo] = useState(false);
  const [showingHistory, setShowingHistory] = useState(false);

  const lastDates = useQuery(lastDatesOptions());
  const enabledIds = useQuery(enabledSymptomIdsOptions());
  const customItems = useQuery(customItemsOptions());

  // Custom items are always on (archiving removes them); they slot in
  // alphabetically — rating items after the built-in metrics, severity items
  // merged into the symptom list.
  const custom = customItems.data ?? [];
  const customMetrics = custom
    .filter((item) => item.kind === "rating")
    .map(customItemToMetric);
  const enabledSymptoms = [
    ...SYMPTOMS.filter((s) => (enabledIds.data ?? []).includes(s.id)),
    ...custom
      .filter((item) => item.kind === "severity")
      .map(customItemToSymptom),
  ].sort((a, b) => a.name.localeCompare(b.name));
  const gridMetrics = [...METRICS, ...customMetrics];
  // Events and numeric items tile after the symptoms; they already sort
  // alphabetically (listCustomItems orders by name).
  const otherItems = custom.filter(
    (item) => item.kind === "event" || item.kind === "numeric",
  );
  const dates = lastDates.data ?? new Map<string, Date>();

  const pickRandom = () => {
    const pick = weightedRandomByRecency(enabledSymptoms, dates);
    if (pick) setLogItem(pick);
  };

  // Grid order for Save & Next: metrics first, then enabled symptoms.
  // Events and the note tile stay out: next-up is for things always worth
  // logging, and there is no "didn't happen" log.
  const gridItems: (Metric | Symptom)[] = [...gridMetrics, ...enabledSymptoms];
  const currentKind = logItem?.id ?? "";
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
      closeLog();
      return;
    }
    setLeavingItem(logItem);
    setLogItem(next);
  };

  const closeLog = () => {
    setLogItem(null);
    setLeavingItem(null);
  };

  const logSheet = (item: Metric | Symptom, leaving: boolean) => {
    // A leaving sheet is inert (the deck blocks its touches); it keeps
    // Save & Next enabled since that's the button that sent it away.
    const common = {
      onClose: leaving ? () => {} : closeLog,
      nextAvailable: leaving || nextAvailable,
      onSaveAndNext: leaving ? () => {} : advanceToNext,
    };
    return "valueKind" in item ? (
      <SymptomLogSheet symptom={item} {...common} />
    ) : (
      <MetricLogSheet metric={item} {...common} />
    );
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
        {gridMetrics.map((metric) => (
          <Tile
            key={metric.id}
            title={metric.name}
            icon={metric.icon}
            lastDate={dates.get(metric.id) ?? null}
            now={now}
            onPress={() => setLogItem(metric)}
          />
        ))}
        {enabledSymptoms.map((symptom) => (
          <Tile
            key={symptom.id}
            title={symptom.name}
            icon={symptom.icon}
            lastDate={dates.get(symptom.id) ?? null}
            now={now}
            onPress={() => setLogItem(symptom)}
          />
        ))}
        {otherItems.map((item) => (
          <Tile
            key={item.id}
            title={item.name}
            icon={item.icon}
            lastDate={dates.get(customEntryKind(item.id)) ?? null}
            now={now}
            onPress={() => setSelectedCustom(item)}
          />
        ))}
        <PlainTile
          title={NOTE.name}
          icon={NOTE.icon}
          onPress={() => setShowingNote(true)}
        />
        {enabledSymptoms.length > 0 && (
          <PlainTile title="Random" icon="🎲" onPress={pickRandom} />
        )}
        {enabledIds.isSuccess && enabledSymptoms.length === 0 && (
          <Text style={[styles.empty, { color: theme.secondaryText }]}>
            No symptoms enabled. Add some via the gear icon.
          </Text>
        )}
      </ScrollView>

      {logItem && (
        <SheetDeck
          current={{ key: logItem.id, node: logSheet(logItem, false) }}
          leaving={
            leavingItem && {
              key: leavingItem.id,
              node: logSheet(leavingItem, true),
            }
          }
          onLeft={() => setLeavingItem(null)}
          onRequestClose={closeLog}
        />
      )}
      {selectedCustom?.kind === "event" && (
        <EventLogSheet
          key={selectedCustom.id}
          item={selectedCustom}
          onClose={() => setSelectedCustom(null)}
        />
      )}
      {selectedCustom?.kind === "numeric" && (
        <NumericLogSheet
          key={selectedCustom.id}
          item={selectedCustom}
          onClose={() => setSelectedCustom(null)}
        />
      )}
      {showingNote && <NoteLogSheet onClose={() => setShowingNote(false)} />}
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
