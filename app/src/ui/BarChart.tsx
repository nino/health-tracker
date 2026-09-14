import { useId } from "react";
import { StyleSheet, Text, View } from "react-native";
import Svg, { ClipPath, Defs, G, Line, Rect } from "react-native-svg";

import { scaleTime, type ChartInputPoint } from "../lib/chartGeometry";
import {
  ResetZoomButton,
  useChartViewport,
  useXTicks,
  XAxis,
  XGridLines,
} from "./chartViewport";
import { useTheme } from "./theme";

const HEIGHT = 140;
const PAD = 8;

// Count-per-bucket bars (event items' weekly counts). Unlike LineChart the
// y-domain tops out at the data's max — counts have no fixed scale — but
// always starts at 0 so bar heights stay proportional. Each bar spans its
// week on a real time axis (bucket start to the next bucket start), so the
// x-axis zooms and pans like the line charts'.
export function BarChart(props: { points: ChartInputPoint[]; color: string }) {
  const theme = useTheme();
  const clipId = useId();
  const max = Math.max(1, ...props.points.map((p) => p.value));
  const first = props.points[0]?.date;
  const last = props.points[props.points.length - 1]?.date;
  const full = {
    tMin: first?.getTime() ?? 0,
    tMax: last ? weekAfter(last).getTime() : 0,
  };
  const { range, width, isZoomed, reset, plotProps } = useChartViewport(full);

  const px = (x: number) => PAD + x * (width - 2 * PAD);
  const py = (value: number) => PAD + (1 - value / max) * (HEIGHT - 2 * PAD);
  const ticks = useXTicks(range, width, px);

  const gridLevels = [0, Math.ceil(max / 2), max].filter(
    (level, index, all) => all.indexOf(level) === index,
  );

  const bars = props.points.flatMap((point, index) => {
    const x0 = px(scaleTime(point.date, range));
    const x1 = px(scaleTime(weekAfter(point.date), range));
    if (x1 < 0 || x0 > width) return [];
    const barWidth = Math.min(24, (x1 - x0) * 0.7);
    return [
      { key: index, x: (x0 + x1 - barWidth) / 2, width: barWidth, point },
    ];
  });

  return (
    <View>
      <View style={styles.plot} {...plotProps}>
        {width > 0 && (
          <Svg width={width} height={HEIGHT}>
            <Defs>
              <ClipPath id={clipId}>
                <Rect x={0} y={0} width={width} height={HEIGHT} />
              </ClipPath>
            </Defs>
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
            <XGridLines
              ticks={ticks}
              y1={py(max)}
              y2={py(0)}
              color={theme.border}
            />
            <G clipPath={`url(#${clipId})`}>
              {bars.map((bar) => (
                <Rect
                  key={bar.key}
                  x={bar.x}
                  y={py(bar.point.value)}
                  width={bar.width}
                  height={((HEIGHT - 2 * PAD) * bar.point.value) / max}
                  rx={2}
                  fill={props.color}
                />
              ))}
            </G>
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
        <ResetZoomButton visible={isZoomed} onPress={reset} />
      </View>
      <XAxis ticks={ticks} width={width} />
    </View>
  );
}

/** The next weekly bucket's start, by calendar days (DST-safe). */
function weekAfter(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate() + 7);
}

const styles = StyleSheet.create({
  plot: { height: HEIGHT },
  gridLabels: { position: "absolute", top: 0, left: 0, right: 0, bottom: 0 },
  gridLabel: { position: "absolute", right: 0, fontSize: 10 },
});
