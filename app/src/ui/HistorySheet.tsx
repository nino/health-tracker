import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { StyleSheet, Text, View } from "react-native";

import {
  customItemsOptions,
  enabledSymptomIdsOptions,
  entriesByKindOptions,
} from "../app/queries";
import { METRICS, SYMPTOMS, type Metric, type Symptom } from "../catalog";
import { customItemToMetric, customItemToSymptom } from "../catalog/custom";
import { chartOptions } from "../catalog/valueKind";
import {
  aggregatePoints,
  CHART_MODES,
  weeklyCounts,
  type ChartMode,
} from "../lib/chartAggregate";
import { numericDomain, type ChartInputPoint } from "../lib/chartGeometry";
import { customEntryKind, type CustomItem } from "../store/customItems";
import { BarChart } from "./BarChart";
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
  /** Returning undefined drops the entry from the chart. */
  mapValue?: (value: number) => number | undefined;
  /** Entries with no y-position, drawn as a marker row (see LineChart). */
  isMarker?: (value: number) => boolean;
  markerLabel?: string;
}) {
  const theme = useTheme();
  const entries = useQuery(entriesByKindOptions(props.kind));
  // Symptoms map to option indices *before* averaging, so a day-average sits
  // between the labeled gridlines it came from. Markers are never averaged:
  // they have no value, only a date.
  const mapped: ChartInputPoint[] = [];
  const markers: Date[] = [];
  for (const e of entries.data ?? []) {
    if (props.isMarker?.(e.value)) {
      markers.push(e.date);
      continue;
    }
    const value = props.mapValue ? props.mapValue(e.value) : e.value;
    if (value !== undefined) mapped.push({ date: e.date, value });
  }
  const points = aggregatePoints(mapped, props.mode);

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
      {points.length === 0 && markers.length === 0 ? (
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
          markers={props.isMarker ? markers : undefined}
          markerLabel={props.markerLabel}
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
  // The y-axis is the index into the on-scale options (display order) — raw
  // HealthKit values don't sort (Present = 0, Not Present = 1). Off-scale
  // entries (severity's "Present") go to the chart's marker row instead.
  const options = chartOptions(symptom.valueKind);
  const indexByValue = new Map(options.map((o, index) => [o.value, index]));
  const offScale = symptom.valueKind.options.filter((o) => o.offScale);
  const offScaleValues = new Set(offScale.map((o) => o.value));
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
      mapValue={(value) => indexByValue.get(value)}
      isMarker={
        offScale.length > 0 ? (value) => offScaleValues.has(value) : undefined
      }
      markerLabel={offScale.map((o) => o.label).join(" / ")}
    />
  );
}

// Numeric items are the one chart without a fixed y-domain: the values
// share no scale (press-ups vs body weight), so the domain derives from the
// aggregated data. The display-mode control applies as usual.
function NumericChartCard(props: {
  item: CustomItem;
  mode: ChartMode;
  color: string;
}) {
  const theme = useTheme();
  const kind = customEntryKind(props.item.id);
  const entries = useQuery(entriesByKindOptions(kind));
  const points = aggregatePoints(
    (entries.data ?? []).map((e) => ({ date: e.date, value: e.value })),
    props.mode,
  );
  const domain = numericDomain(points.map((p) => p.value));

  return (
    <View
      style={[
        styles.card,
        { backgroundColor: theme.card, borderColor: theme.border },
      ]}
    >
      <Text style={[styles.cardTitle, { color: theme.text }]}>
        {props.item.icon} {props.item.name}
      </Text>
      {points.length === 0 ? (
        <Text style={[styles.empty, { color: theme.secondaryText }]}>
          Nothing logged yet.
        </Text>
      ) : (
        <LineChart
          points={points}
          yMin={domain.min}
          yMax={domain.max}
          color={props.color}
        />
      )}
    </View>
  );
}

// Text items don't chart — history shows the notes themselves, newest
// first, capped so one prolific topic can't make the sheet unscrollable.
const MAX_TEXT_ENTRIES = 20;

function TextHistoryCard(props: { item: CustomItem }) {
  const theme = useTheme();
  const kind = customEntryKind(props.item.id);
  const entries = useQuery(entriesByKindOptions(kind));
  const all = entries.data ?? [];
  const latest = all.slice(-MAX_TEXT_ENTRIES).reverse();

  return (
    <View
      style={[
        styles.card,
        { backgroundColor: theme.card, borderColor: theme.border },
      ]}
    >
      <Text style={[styles.cardTitle, { color: theme.text }]}>
        {props.item.icon} {props.item.name}
      </Text>
      {latest.length === 0 ? (
        <Text style={[styles.empty, { color: theme.secondaryText }]}>
          Nothing logged yet.
        </Text>
      ) : (
        latest.map((entry) => (
          <View key={entry.id} style={styles.textEntry}>
            <Text
              style={[styles.textEntryDate, { color: theme.secondaryText }]}
            >
              {entry.date.toLocaleDateString()}
            </Text>
            <Text style={{ color: theme.text }}>{entry.valueText}</Text>
          </View>
        ))
      )}
      {all.length > MAX_TEXT_ENTRIES && (
        <Text style={[styles.empty, { color: theme.secondaryText }]}>
          Showing the latest {MAX_TEXT_ENTRIES} of {all.length}.
        </Text>
      )}
    </View>
  );
}

// Event items chart as occurrences per week — the display-mode control
// doesn't apply (a raw scatter of "1" carries no information).
function EventChartCard(props: { item: CustomItem; color: string }) {
  const theme = useTheme();
  const kind = customEntryKind(props.item.id);
  const entries = useQuery(entriesByKindOptions(kind));
  const points = weeklyCounts(
    (entries.data ?? []).map((e) => e.date),
    new Date(),
  );

  return (
    <View
      style={[
        styles.card,
        { backgroundColor: theme.card, borderColor: theme.border },
      ]}
    >
      <Text style={[styles.cardTitle, { color: theme.text }]}>
        {props.item.icon} {props.item.name} · per week
      </Text>
      {points.length === 0 ? (
        <Text style={[styles.empty, { color: theme.secondaryText }]}>
          Nothing logged yet.
        </Text>
      ) : (
        <BarChart points={points} color={props.color} />
      )}
    </View>
  );
}

export function HistorySheet(props: { onClose: () => void }) {
  const theme = useTheme();
  const [mode, setMode] = useState<ChartMode>("raw");
  const enabledIds = useQuery(enabledSymptomIdsOptions());
  const customItems = useQuery(customItemsOptions());
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
      {custom
        .filter((item) => item.kind === "numeric")
        .map((item) => (
          <NumericChartCard
            key={item.id}
            item={item}
            mode={mode}
            color={theme.tint}
          />
        ))}
      {enabledSymptoms.map((symptom) =>
        symptomChart(symptom, mode, theme.tint),
      )}
      {custom
        .filter((item) => item.kind === "event")
        .map((item) => (
          <EventChartCard key={item.id} item={item} color={theme.tint} />
        ))}
      {custom
        .filter((item) => item.kind === "text")
        .map((item) => (
          <TextHistoryCard key={item.id} item={item} />
        ))}
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
  textEntry: { gap: 1 },
  textEntryDate: { fontSize: 11 },
});
