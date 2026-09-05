import { useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import Svg, { Circle, Line, Polyline } from "react-native-svg";

import {
  downsample,
  scalePoints,
  scaleTime,
  timeRange,
  type ChartInputPoint,
} from "../lib/chartGeometry";
import { useTheme } from "./theme";

const HEIGHT = 140;
const PAD = 8; // keeps dots at the domain edges fully visible
const MARKER_ROW = 28; // extra height for the off-scale marker row
const MAX_POINTS = 400;

// Single-series line/point chart with a fixed y-domain (never derived from
// the data — mood 1-10 must look like 4/10, not full-scale). Optional
// yLabels draws a labeled gridline per discrete level (symptom options).
// Optional markers are dated entries with no position on the y-scale
// (severity "Present"): drawn as hollow, unconnected dots in a labeled row
// below the bottom gridline, sharing the line's x-scale.
export function LineChart(props: {
  points: ChartInputPoint[];
  yMin: number;
  yMax: number;
  color: string;
  yLabels?: string[];
  markers?: Date[];
  markerLabel?: string;
}) {
  const theme = useTheme();
  const [width, setWidth] = useState(0);
  const points = downsample(props.points, MAX_POINTS);
  const markers = downsample(props.markers ?? [], MAX_POINTS);
  const range = timeRange([...points.map((p) => p.date), ...markers]);
  const scaled = scalePoints(points, props.yMin, props.yMax, range);
  const hasMarkerRow = props.markers !== undefined;
  const height = hasMarkerRow ? HEIGHT + MARKER_ROW : HEIGHT;

  const px = (x: number) => PAD + x * (width - 2 * PAD);
  const py = (y: number) => PAD + (1 - y) * (HEIGHT - 2 * PAD);
  const markerY = HEIGHT - PAD + MARKER_ROW;

  const gridLevels =
    props.yLabels?.map((label, index, all) => ({
      label,
      y: all.length === 1 ? 0.5 : index / (all.length - 1),
    })) ??
    [props.yMin, (props.yMin + props.yMax) / 2, props.yMax].map((value) => ({
      label: String(value),
      y: (value - props.yMin) / (props.yMax - props.yMin),
    }));

  const first = range.tMin === 0 ? undefined : new Date(range.tMin);
  const last = range.tMax === 0 ? undefined : new Date(range.tMax);

  return (
    <View>
      <View
        style={{ height }}
        onLayout={(e) => setWidth(e.nativeEvent.layout.width)}
      >
        {width > 0 && (
          <Svg width={width} height={height}>
            {gridLevels.map((level) => (
              <Line
                key={level.label}
                x1={px(0)}
                y1={py(level.y)}
                x2={px(1)}
                y2={py(level.y)}
                stroke={theme.border}
                strokeWidth={StyleSheet.hairlineWidth}
              />
            ))}
            {scaled.length > 1 && (
              <Polyline
                points={scaled.map((p) => `${px(p.x)},${py(p.y)}`).join(" ")}
                fill="none"
                stroke={props.color}
                strokeWidth={1.5}
              />
            )}
            {scaled.map((p, i) => (
              <Circle
                key={i}
                cx={px(p.x)}
                cy={py(p.y)}
                r={3}
                fill={props.color}
              />
            ))}
            {markers.map((date, i) => (
              <Circle
                key={`m${i}`}
                cx={px(scaleTime(date, range))}
                cy={markerY}
                r={3}
                fill="none"
                stroke={props.color}
                strokeWidth={1.5}
              />
            ))}
          </Svg>
        )}
        <View style={styles.gridLabels} pointerEvents="none">
          {gridLevels.map((level) => (
            <Text
              key={level.label}
              style={[
                styles.gridLabel,
                { color: theme.secondaryText, top: py(level.y) - 13 },
              ]}
            >
              {level.label}
            </Text>
          ))}
          {hasMarkerRow && props.markerLabel && (
            <Text
              style={[
                styles.gridLabel,
                { color: theme.secondaryText, top: markerY - 13 },
              ]}
            >
              {props.markerLabel}
            </Text>
          )}
        </View>
      </View>
      <View style={styles.xLabels}>
        <Text style={[styles.xLabel, { color: theme.secondaryText }]}>
          {first ? first.toLocaleDateString() : ""}
        </Text>
        <Text style={[styles.xLabel, { color: theme.secondaryText }]}>
          {last && last.getTime() !== first?.getTime()
            ? last.toLocaleDateString()
            : ""}
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  gridLabels: { position: "absolute", top: 0, left: 0, right: 0, bottom: 0 },
  gridLabel: { position: "absolute", right: 0, fontSize: 10 },
  xLabels: { flexDirection: "row", justifyContent: "space-between" },
  xLabel: { fontSize: 11 },
});
