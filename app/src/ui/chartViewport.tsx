import { useEffect, useMemo, useRef, useState } from "react";
import {
  type GestureResponderEvent,
  type LayoutChangeEvent,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
  type ViewProps,
} from "react-native";
import { Line } from "react-native-svg";

import { type TimeRange } from "../lib/chartGeometry";
import { timeTicks } from "../lib/chartTicks";
import {
  FULL_VIEWPORT,
  minViewportSpan,
  panViewport,
  visibleRange,
  type Viewport,
  zoomViewport,
} from "../lib/chartViewport";
import { useTheme } from "./theme";

// Zoom/pan gestures for the history charts, shared by LineChart and
// BarChart. One finger (or a mouse) dragging sideways pans; two fingers
// pinching zooms the x-axis about the pinch midpoint; on web a trackpad
// pinch (ctrl+wheel) zooms and a horizontal scroll pans. Zoom never touches
// the y-axis — the fixed y-domains are the point of these charts.
//
// The charts live in a vertical ScrollView, so the responder is only
// claimed once a drag is clearly horizontal (or a second finger lands);
// vertical drags fall through to the sheet's scroll as before. Once
// claimed, the gesture refuses termination so the scroll view can't take
// it back mid-pan.

/** Minimum horizontal movement before a drag counts as a pan. */
const PAN_SLOP = 8;
/** Target pixel spacing between x-axis labels. */
const LABEL_SPACING = 64;
/** Width reserved per label; ticks whose label would spill past the plot's
 * edges are drawn without one. */
const LABEL_WIDTH = 56;

export interface ChartViewport {
  /** Visible fraction of the full range. */
  viewport: Viewport;
  /** The visible time window. */
  range: TimeRange;
  /** Measured plot width, 0 before layout. */
  width: number;
  isZoomed: boolean;
  reset: () => void;
  /** Spread onto the plot's container View. */
  plotProps: Pick<
    ViewProps,
    | "onLayout"
    | "onTouchStart"
    | "onMoveShouldSetResponder"
    | "onResponderGrant"
    | "onResponderMove"
    | "onResponderTerminationRequest"
  > & { ref: React.RefObject<View | null> };
}

interface GestureMemory {
  /** Where the first finger landed, for deciding whether a drag is ours. */
  startX: number;
  startY: number;
  /** Previous single-pointer x, so each move applies only its increment. */
  lastX: number;
  /** Previous two-finger pinch, if the last move was one. */
  pinch?: { distance: number; midX: number };
  touchCount: number;
}

// Implemented on the raw View responder props rather than PanResponder:
// the responder callbacks need the latest width and plot offset, which
// live in refs, and React's compiler lint (rightly) refuses refs captured by
// a factory called during render. Plain event-handler props are fine.
export function useChartViewport(full: TimeRange): ChartViewport {
  const [viewport, setViewport] = useState<Viewport>(FULL_VIEWPORT);
  const [width, setWidth] = useState(0);
  const ref = useRef<View>(null);
  // Latest render's values for the handlers; synced in an effect, which
  // runs before any gesture can arrive.
  const live = useRef({ width: 0, minSpan: 1, left: 0 });
  const minSpan = minViewportSpan(full);
  useEffect(() => {
    live.current.width = width;
    live.current.minSpan = minSpan;
  }, [width, minSpan]);
  const memory = useRef<GestureMemory>({
    startX: 0,
    startY: 0,
    lastX: 0,
    touchCount: 0,
  });

  const pan = (deltaPx: number) => {
    const { width } = live.current;
    if (width <= 0) return;
    setViewport((v) => panViewport(v, deltaPx / width));
  };
  const zoom = (factor: number, anchorPx: number) => {
    const { width, minSpan } = live.current;
    if (width <= 0) return;
    setViewport((v) => zoomViewport(v, factor, anchorPx / width, minSpan));
  };

  const onTouchStart = (e: GestureResponderEvent) => {
    if (e.nativeEvent.touches.length <= 1) {
      const { x, y } = pointer(e);
      memory.current.startX = x;
      memory.current.startY = y;
    }
  };
  const onMoveShouldSetResponder = (e: GestureResponderEvent) => {
    if (live.current.minSpan >= 1) return false; // nothing to zoom into
    if (e.nativeEvent.touches.length >= 2) return true;
    const { x, y } = pointer(e);
    const dx = Math.abs(x - memory.current.startX);
    const dy = Math.abs(y - memory.current.startY);
    return dx > PAN_SLOP && dx > dy;
  };
  const onResponderGrant = (e: GestureResponderEvent) => {
    memory.current.lastX = pointer(e).x;
    memory.current.touchCount = e.nativeEvent.touches.length;
    memory.current.pinch = undefined;
    // Returning true blocks the native responder (Android's ScrollView)
    // from taking the touches — the same switch PanResponder exposes as
    // onShouldBlockNativeResponder.
    return true;
  };
  const onResponderMove = (e: GestureResponderEvent) => {
    const touches = e.nativeEvent.touches;
    const m = memory.current;
    if (touches.length >= 2) {
      const [a, b] = touches;
      const distance = Math.hypot(a.pageX - b.pageX, a.pageY - b.pageY);
      const midX = (a.pageX + b.pageX) / 2 - live.current.left;
      if (m.pinch && m.pinch.distance > 0) {
        zoom(distance / m.pinch.distance, midX);
        pan(midX - m.pinch.midX);
      }
      m.pinch = { distance, midX };
    } else {
      // Only pan once the pointer count has settled: the first move after
      // a finger lifts would otherwise jump by the centroid shift.
      if (m.touchCount === touches.length && !m.pinch) {
        pan(pointer(e).x - m.lastX);
      }
      m.pinch = undefined;
    }
    m.lastX = pointer(e).x;
    m.touchCount = touches.length;
  };

  // Web only: trackpad pinch arrives as ctrl+wheel, horizontal scroll as
  // deltaX. RN's View has no onWheel, so listen on the DOM node directly.
  // touch-action keeps the browser from page-zooming on a two-finger pinch
  // over the plot while still letting vertical swipes scroll the sheet.
  useEffect(() => {
    if (Platform.OS !== "web") return;
    const node = ref.current as unknown as HTMLElement | null;
    if (!node?.addEventListener) return;
    node.style.touchAction = "pan-y";
    const onWheel = (e: WheelEvent) => {
      const { width, minSpan } = live.current;
      if (width <= 0 || minSpan >= 1) return;
      if (e.ctrlKey) {
        e.preventDefault();
        zoom(Math.exp(-e.deltaY / 100), e.offsetX);
      } else if (Math.abs(e.deltaX) > Math.abs(e.deltaY)) {
        e.preventDefault();
        pan(-e.deltaX);
      }
    };
    node.addEventListener("wheel", onWheel, { passive: false });
    return () => node.removeEventListener("wheel", onWheel);
  }, []);

  const onLayout = (e: LayoutChangeEvent) => {
    setWidth(e.nativeEvent.layout.width);
    ref.current?.measureInWindow((x) => {
      live.current.left = x;
    });
  };

  const isZoomed = viewport.start > 0 || viewport.end < 1;
  return {
    viewport,
    range: visibleRange(full, viewport),
    width,
    isZoomed,
    reset: () => setViewport(FULL_VIEWPORT),
    plotProps: {
      ref,
      onLayout,
      onTouchStart,
      onMoveShouldSetResponder,
      onResponderGrant,
      onResponderMove,
      onResponderTerminationRequest: () => false,
    },
  };
}

/** The single pointer's page position. Native fills pageX/pageY on the
 * event itself; react-native-web's touch events only fill `touches`, and
 * its mouse events only the event, so check both. */
function pointer(e: GestureResponderEvent): { x: number; y: number } {
  const touch = e.nativeEvent.touches[0];
  return touch
    ? { x: touch.pageX, y: touch.pageY }
    : { x: e.nativeEvent.pageX, y: e.nativeEvent.pageY };
}

/** Tick positions for the visible window, in plot pixels via `px`. */
export function useXTicks(
  range: TimeRange,
  width: number,
  px: (fraction: number) => number,
) {
  return useMemo(() => {
    if (width <= 0) return [];
    const span = range.tMax - range.tMin;
    return timeTicks(range, Math.max(1, Math.floor(width / LABEL_SPACING))).map(
      (tick) => ({
        ...tick,
        x: px(span === 0 ? 0.5 : (tick.date.getTime() - range.tMin) / span),
      }),
    );
  }, [range.tMin, range.tMax, width]); // eslint-disable-line react-hooks/exhaustive-deps
}

export type XTick = ReturnType<typeof useXTicks>[number];

/** Vertical gridlines at the ticks, drawn inside the chart's Svg. */
export function XGridLines(props: {
  ticks: XTick[];
  y1: number;
  y2: number;
  color: string;
}) {
  return (
    <>
      {props.ticks.map((tick) => (
        <Line
          key={tick.date.getTime()}
          x1={tick.x}
          y1={props.y1}
          x2={tick.x}
          y2={props.y2}
          stroke={props.color}
          strokeWidth={StyleSheet.hairlineWidth}
        />
      ))}
    </>
  );
}

/** The label row under a chart: one centered label per tick. */
export function XAxis(props: { ticks: XTick[]; width: number }) {
  const theme = useTheme();
  const half = LABEL_WIDTH / 2;
  return (
    <View style={styles.axis}>
      {props.ticks
        .filter((tick) => tick.x >= half && tick.x <= props.width - half)
        .map((tick) => (
          <Text
            key={tick.date.getTime()}
            style={[
              styles.label,
              { color: theme.secondaryText, left: tick.x - half },
            ]}
            numberOfLines={1}
          >
            {tick.label}
          </Text>
        ))}
    </View>
  );
}

/** "Reset" affordance shown over a zoomed plot's top-left corner. */
export function ResetZoomButton(props: {
  visible: boolean;
  onPress: () => void;
}) {
  const theme = useTheme();
  if (!props.visible) return null;
  return (
    <Pressable
      onPress={props.onPress}
      hitSlop={8}
      style={[
        styles.reset,
        { backgroundColor: theme.background, borderColor: theme.border },
      ]}
    >
      <Text style={[styles.resetText, { color: theme.tint }]}>Reset zoom</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  axis: { height: 16 },
  label: {
    position: "absolute",
    top: 0,
    width: LABEL_WIDTH,
    textAlign: "center",
    fontSize: 11,
  },
  reset: {
    position: "absolute",
    top: 0,
    left: 0,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
    borderWidth: StyleSheet.hairlineWidth,
  },
  resetText: { fontSize: 11, fontWeight: "600" },
});
