import { useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import Svg, { Circle, Line, Polyline } from "react-native-svg";

import {
  downsample,
  scalePoints,
  type ChartInputPoint,
} from "../lib/chartGeometry";
import { useTheme } from "./theme";

const HEIGHT = 140;
const PAD = 8; // keeps dots at the domain edges fully visible
const MAX_POINTS = 400;

// Single-series line/point chart with a fixed y-domain (never derived from
// the data — mood 1-10 must look like 4/10, not full-scale). Optional
// yLabels draws a labeled gridline per discrete level (symptom options).
export function LineChart(props: {
  points: ChartInputPoint[];
  yMin: number;
  yMax: number;
  color: string;
  yLabels?: string[];
}) {
  const theme = useTheme();
  const [width, setWidth] = useState(0);
  const points = downsample(props.points, MAX_POINTS);
  const scaled = scalePoints(points, props.yMin, props.yMax);

  const px = (x: number) => PAD + x * (width - 2 * PAD);
  const py = (y: number) => PAD + (1 - y) * (HEIGHT - 2 * PAD);

  const gridLevels =
    props.yLabels?.map((label, index, all) => ({
      label,
      y: all.length === 1 ? 0.5 : index / (all.length - 1),
    })) ??
    [props.yMin, (props.yMin + props.yMax) / 2, props.yMax].map((value) => ({
      label: String(value),
      y: (value - props.yMin) / (props.yMax - props.yMin),
    }));

  const first = props.points[0]?.date;
  const last = props.points[props.points.length - 1]?.date;

  return (
    <View>
      <View
        style={styles.plot}
        onLayout={(e) => setWidth(e.nativeEvent.layout.width)}
      >
        {width > 0 && (
          <Svg width={width} height={HEIGHT}>
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
        </View>
      </View>
      <View style={styles.xLabels}>
        <Text style={[styles.xLabel, { color: theme.secondaryText }]}>
          {first ? first.toLocaleDateString() : ""}
        </Text>
        <Text style={[styles.xLabel, { color: theme.secondaryText }]}>
          {last && last !== first ? last.toLocaleDateString() : ""}
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  plot: { height: HEIGHT },
  gridLabels: { position: "absolute", top: 0, left: 0, right: 0, bottom: 0 },
  gridLabel: { position: "absolute", right: 0, fontSize: 10 },
  xLabels: { flexDirection: "row", justifyContent: "space-between" },
  xLabel: { fontSize: 11 },
});
