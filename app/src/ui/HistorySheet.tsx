import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { StyleSheet, Text, View } from "react-native";

import { appDb, entryStore } from "../app/appDb";
import { METRICS, SYMPTOMS, type Metric, type Symptom } from "../catalog";
import { customItemToMetric, customItemToSymptom } from "../catalog/custom";
import { listCustomItems } from "../store/customItems";
import {
  aggregatePoints,
  CHART_MODES,
  type ChartMode,
} from "../lib/chartAggregate";
import { type ChartInputPoint } from "../lib/chartGeometry";
import { getEnabledSymptomIds } from "../store/settings";
import { LineChart } from "./LineChart";
import { SegmentedControl } from "./SegmentedControl";
import { SheetModal } from "./SheetModal";
import { useTheme } from "./theme";

// One single-series chart per metric and enabled symptom, all from the local
// store (phase-4 backfill means HealthKit history is already local). Mood's
// high-is-good never shares a plot with stress/anxiety's high-is-bad.

function ChartCard(props: {
  title: string;
  kind: string;
  mode: ChartMode;
  yMin: number;
  yMax: number;
  color: string;
  yLabels?: string[];
  mapValue?: (value: number) => number;
}) {
  const theme = useTheme();
  const entries = useQuery({
    queryKey: ["entries", props.kind],
    queryFn: () => entryStore.byKind(props.kind),
  });
  // Symptoms map to option indices *before* averaging, so a day-average sits
  // between the labeled gridlines it came from.
  const points: ChartInputPoint[] = aggregatePoints(
    (entries.data ?? []).map((e) => ({
      date: e.date,
      value: props.mapValue ? props.mapValue(e.value) : e.value,
    })),
    props.mode,
  );

  return (
    <View
      style={[
        styles.card,
        { backgroundColor: theme.card, borderColor: theme.border },
      ]}
    >
      <Text style={[styles.cardTitle, { color: theme.text }]}>
        {props.title}
      </Text>
      {points.length === 0 ? (
        <Text style={[styles.empty, { color: theme.secondaryText }]}>
          Nothing logged yet.
        </Text>
      ) : (
        <LineChart
          points={points}
          yMin={props.yMin}
          yMax={props.yMax}
          color={props.color}
          yLabels={props.yLabels}
        />
      )}
    </View>
  );
}

function metricChart(metric: Metric, mode: ChartMode, color: string) {
  return (
    <ChartCard
      key={metric.id}
      title={`${metric.icon} ${metric.name}`}
      kind={metric.id}
      mode={mode}
      yMin={metric.min}
      yMax={metric.max}
      color={color}
    />
  );
}

function symptomChart(symptom: Symptom, mode: ChartMode, color: string) {
  const options = symptom.valueKind.options;
  // The y-axis is the index into the options (display order) — raw HealthKit
  // values don't sort (Present = 0, Not Present = 1).
  const indexByValue = new Map(options.map((o, index) => [o.value, index]));
  return (
    <ChartCard
      key={symptom.id}
      title={`${symptom.icon} ${symptom.name}`}
      kind={symptom.id}
      mode={mode}
      yMin={0}
      yMax={options.length - 1}
      color={color}
      yLabels={options.map((o) => o.label)}
      mapValue={(value) => indexByValue.get(value) ?? 0}
    />
  );
}

export function HistorySheet(props: { onClose: () => void }) {
  const theme = useTheme();
  const [mode, setMode] = useState<ChartMode>("raw");
  const enabledIds = useQuery({
    queryKey: ["enabledSymptomIds"],
    queryFn: () => getEnabledSymptomIds(appDb),
  });
  const customItems = useQuery({
    queryKey: ["customItems"],
    queryFn: () => listCustomItems(appDb),
  });
  const custom = customItems.data ?? [];
  const enabledSymptoms = [
    ...SYMPTOMS.filter((s) => (enabledIds.data ?? []).includes(s.id)),
    ...custom
      .filter((item) => item.kind === "severity")
      .map(customItemToSymptom),
  ].sort((a, b) => a.name.localeCompare(b.name));
  const customRating = custom.filter((item) => item.kind === "rating");

  return (
    <SheetModal visible title="History" onClose={props.onClose}>
      <SegmentedControl
        segments={CHART_MODES}
        value={mode}
        onChange={setMode}
      />
      {/* Mood is high-is-good (green); stress/anxiety are high-is-bad.
          Custom ratings follow their own high-is-good switch. */}
      {METRICS.map((metric) =>
        metricChart(metric, mode, metric.id === "mood" ? "#34c759" : "#ff9500"),
      )}
      {customRating.map((item) =>
        metricChart(
          customItemToMetric(item),
          mode,
          item.highIsGood ? "#34c759" : "#ff9500",
        ),
      )}
      {enabledSymptoms.map((symptom) =>
        symptomChart(symptom, mode, theme.tint),
      )}
    </SheetModal>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    padding: 14,
    gap: 8,
  },
  cardTitle: { fontWeight: "600" },
  empty: { fontSize: 13 },
});
