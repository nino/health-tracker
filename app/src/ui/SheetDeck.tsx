import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import {
  AccessibilityInfo,
  Animated,
  Easing,
  Modal,
  Platform,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from "react-native";

import { HostedSheetContext } from "./SheetModal";
import { useTheme } from "./theme";

const useNativeDriver = Platform.OS !== "web";

export interface DeckCard {
  key: string;
  node: ReactNode;
}

// One presented modal for the Save & Next chain. Native modals can't
// overlap (iOS won't present until the previous dismiss finishes), so
// advancing used to cost a full slide-down plus a full slide-up. Here the
// modal stays up and the sheets inside it swap like a deck of cards: the
// saved card gets a ✓ stamp and is flicked off to the top-left while the
// next one springs up from underneath, both at once.
//
// The caller renders both cards (keyed by item), so the leaving sheet keeps
// its component state — its selected value is still showing as it flies.
export function SheetDeck(props: {
  current: DeckCard;
  /** The card being flicked away, until onLeft fires. */
  leaving: DeckCard | null;
  onLeft: () => void;
  onRequestClose: () => void;
}) {
  const theme = useTheme();
  const { width } = useWindowDimensions();
  const reduceMotion = useReduceMotion();
  // 0 = resting in front, 1 = gone / fully arrived.
  const [out] = useState(() => new Animated.Value(1));
  const [enter] = useState(() => new Animated.Value(1));

  const leavingKey = props.leaving?.key;
  // Through a ref: the parent re-renders mid-flight (the save invalidates
  // queries), and a fresh callback identity must not restart the animation.
  const onLeft = useRef(props.onLeft);
  useEffect(() => {
    onLeft.current = props.onLeft;
  });
  // Layout effect: reset both values before the first frame with the new
  // card paints, so neither shows its end state for a frame.
  useLayoutEffect(() => {
    if (leavingKey === undefined) return;
    out.setValue(0);
    enter.setValue(0);
    const animation = Animated.parallel([
      Animated.timing(out, {
        toValue: 1,
        // Linear in time; the interpolations below shape it (native-driven
        // interpolations can't take an easing function).
        duration: reduceMotion ? 150 : 340,
        easing: Easing.linear,
        useNativeDriver,
      }),
      reduceMotion
        ? Animated.timing(enter, { toValue: 1, duration: 150, useNativeDriver })
        : Animated.spring(enter, {
            toValue: 1,
            stiffness: 320,
            damping: 22,
            mass: 1,
            useNativeDriver,
          }),
    ]);
    animation.start(({ finished }) => {
      if (finished) onLeft.current();
    });
    return () => animation.stop();
  }, [leavingKey, out, enter, reduceMotion]);

  const leavingStyle = reduceMotion
    ? { opacity: out.interpolate({ inputRange: [0, 1], outputRange: [1, 0] }) }
    : {
        opacity: out.interpolate({
          inputRange: [0, 0.75, 1],
          outputRange: [1, 1, 0],
        }),
        // A short wind-up (nudged right while the stamp lands), then an
        // accelerating flick off to the top-left.
        transform: [
          {
            translateX: out.interpolate({
              inputRange: [0, 0.3, 0.6, 1],
              outputRange: [0, 0.04 * width, -0.3 * width, -1.1 * width],
            }),
          },
          {
            translateY: out.interpolate({
              inputRange: [0, 0.3, 0.6, 1],
              outputRange: [0, 6, -15, -80],
            }),
          },
          {
            rotate: out.interpolate({
              inputRange: [0, 0.3, 0.6, 1],
              outputRange: ["0deg", "1.5deg", "-5deg", "-16deg"],
            }),
          },
        ],
      };
  const stampStyle = {
    opacity: out.interpolate({
      inputRange: [0, 0.12, 1],
      outputRange: [0, 1, 1],
    }),
    transform: [
      {
        scale: out.interpolate({
          inputRange: [0, 0.12, 0.2],
          outputRange: [2.2, 0.9, 1],
          extrapolate: "clamp",
        }),
      },
      { rotate: "-12deg" },
    ],
  };
  const enteringStyle = reduceMotion
    ? { opacity: enter }
    : {
        opacity: enter.interpolate({
          inputRange: [0, 0.5],
          outputRange: [0.5, 1],
          extrapolate: "clamp",
        }),
        transform: [
          {
            translateY: enter.interpolate({
              inputRange: [0, 1],
              outputRange: [40, 0],
            }),
          },
          {
            scale: enter.interpolate({
              inputRange: [0, 1],
              outputRange: [0.9, 1],
            }),
          },
        ],
      };

  const layers = props.leaving
    ? [
        { card: props.leaving, leaving: true },
        { card: props.current, leaving: false },
      ]
    : [{ card: props.current, leaving: false }];

  return (
    <Modal
      visible
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={props.onRequestClose}
    >
      <HostedSheetContext.Provider value>
        <View style={[styles.deck, { backgroundColor: theme.border }]}>
          {layers.map(({ card, leaving }) => (
            <Animated.View
              key={card.key}
              pointerEvents={leaving ? "none" : "auto"}
              style={[
                StyleSheet.absoluteFill,
                // The leaving card flies over the arriving one.
                { zIndex: leaving ? 1 : 0 },
                props.leaving && (leaving ? leavingStyle : enteringStyle),
              ]}
            >
              {card.node}
              {leaving && !reduceMotion && (
                <Animated.View style={[styles.stamp, stampStyle]}>
                  <Text style={styles.stampText}>✓ SAVED</Text>
                </Animated.View>
              )}
            </Animated.View>
          ))}
        </View>
      </HostedSheetContext.Provider>
    </Modal>
  );
}

function useReduceMotion(): boolean {
  const [reduce, setReduce] = useState(false);
  useEffect(() => {
    AccessibilityInfo.isReduceMotionEnabled().then(setReduce, () => {});
    const sub = AccessibilityInfo.addEventListener(
      "reduceMotionChanged",
      setReduce,
    );
    return () => sub.remove();
  }, []);
  return reduce;
}

const styles = StyleSheet.create({
  deck: { flex: 1 },
  stamp: {
    position: "absolute",
    top: "30%",
    alignSelf: "center",
    paddingHorizontal: 18,
    paddingVertical: 8,
    borderWidth: 4,
    borderRadius: 12,
    borderColor: "#34c759",
  },
  stampText: {
    color: "#34c759",
    fontSize: 32,
    fontWeight: "900",
    letterSpacing: 2,
  },
});
