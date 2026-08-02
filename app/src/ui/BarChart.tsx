import { useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import Svg, { Line, Rect } from "react-native-svg";

import { type ChartInputPoint } from "../lib/chartGeometry";
import { useTheme } from "./theme";

const HEIGHT = 140;
const PAD = 8;

// Count-per-bucket bars (event items' weekly counts). Unlike LineChart the
// y-domain tops out at the data's max — counts have no fixed scale — but
// always starts at 0 so bar heights stay proportional.
export function BarChart(props: { points: ChartInputPoint[]; color: string }) {
  const theme = useTheme();
  const [width, setWidth] = useState(0);
  const max = Math.max(1, ...props.points.map((p) => p.value));

  const plotWidth = width - 2 * PAD;
  const slot = props.points.length > 0 ? plotWidth / props.points.length : 0;
  const barWidth = Math.min(24, slot * 0.7);
  const py = (value: number) => PAD + (1 - value / max) * (HEIGHT - 2 * PAD);

  const gridLevels = [0, Math.ceil(max / 2), max].filter(
    (level, index, all) => all.indexOf(level) === index,
  );

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
                key={level}
                x1={PAD}
                y1={py(level)}
                x2={width - PAD}
                y2={py(level)}
                stroke={theme.border}
                strokeWidth={StyleSheet.hairlineWidth}
              />
            ))}
            {props.points.map((point, index) => (
              <Rect
                key={index}
                x={PAD + index * slot + (slot - barWidth) / 2}
                y={py(point.value)}
                width={barWidth}
                height={((HEIGHT - 2 * PAD) * point.value) / max}
                rx={2}
                fill={props.color}
              />
            ))}
          </Svg>
        )}
        <View style={styles.gridLabels} pointerEvents="none">
          {gridLevels.map((level) => (
            <Text
              key={level}
              style={[
                styles.gridLabel,
                { color: theme.secondaryText, top: py(level) - 13 },
              ]}
            >
              {level}
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
