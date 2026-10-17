import { useEffectEvent, useState, type ReactNode } from "react";
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
import { useMountEffect } from "./useMountEffect";

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
  // 0 = resting in front, 1 = gone / fully arrived. Fresh values per
  // transition, created at 0 during the render that brings the new card in
  // (state adjusted during render, so React redoes that render before
  // painting), so neither card shows its end state for a frame.
  const leavingKey = props.leaving?.key;
  const [transition, setTransition] = useState(() => newTransition(leavingKey));
  if (transition?.key !== leavingKey) {
    setTransition(newTransition(leavingKey));
  }

  const animated =
    transition &&
    deckStyles(transition.out, transition.enter, reduceMotion, width);

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
                animated && (leaving ? animated.leaving : animated.entering),
              ]}
            >
              {card.node}
              {leaving && animated && !reduceMotion && (
                <Animated.View style={[styles.stamp, animated.stamp]}>
                  <Text style={styles.stampText}>✓ SAVED</Text>
                </Animated.View>
              )}
            </Animated.View>
          ))}
        </View>
        {transition && (
          // Keyed, so each transition mounts its own animation. Reduce
          // Motion flipping mid-flight remounts it too, continuing from the
          // current values with the matching timing.
          <DeckAnimation
            key={`${transition.key}:${reduceMotion}`}
            out={transition.out}
            enter={transition.enter}
            reduceMotion={reduceMotion}
            onDone={props.onLeft}
          />
        )}
      </HostedSheetContext.Provider>
    </Modal>
  );
}

// Interpolations for one transition: the leaving card's flick, its ✓
// stamp, and the arriving card's spring.
function deckStyles(
  out: Animated.Value,
  enter: Animated.Value,
  reduceMotion: boolean,
  width: number,
) {
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
  return { leaving: leavingStyle, stamp: stampStyle, entering: enteringStyle };
}

function newTransition(key: string | undefined) {
  if (key === undefined) return null;
  return { key, out: new Animated.Value(0), enter: new Animated.Value(0) };
}

// Runs one card swap from mount to finish. Renders nothing; it exists so
// the animation starts and stops with a mount instead of an effect with
// dependencies.
function DeckAnimation(props: {
  out: Animated.Value;
  enter: Animated.Value;
  reduceMotion: boolean;
  onDone: () => void;
}) {
  // The parent re-renders mid-flight (the save invalidates queries); this
  // always calls the latest callback without restarting anything.
  const onDone = useEffectEvent(props.onDone);
  useMountEffect(() => {
    const { out, enter, reduceMotion } = props;
    const animation = Animated.parallel([
      Animated.timing(out, {
        toValue: 1,
        // Linear in time; the interpolations above shape it (native-driven
        // interpolations can't take an easing function).
        duration: reduceMotion ? 150 : 120,
        easing: Easing.linear,
        useNativeDriver,
      }),
      reduceMotion
        ? Animated.timing(enter, { toValue: 1, duration: 150, useNativeDriver })
        : Animated.spring(enter, {
            toValue: 1,
            stiffness: 1920,
            damping: 54,
            mass: 1,
            useNativeDriver,
          }),
    ]);
    animation.start(({ finished }) => {
      if (finished) onDone();
    });
    return () => animation.stop();
  });
  return null;
}

function useReduceMotion(): boolean {
  const [reduce, setReduce] = useState(false);
  useMountEffect(() => {
    // Wrapped, since the hooks lint reads a bare setter in an effect with no
    // dependency list as a possible update loop.
    const update = (value: boolean) => setReduce(value);
    AccessibilityInfo.isReduceMotionEnabled().then(update, () => {});
    const sub = AccessibilityInfo.addEventListener(
      "reduceMotionChanged",
      update,
    );
    return () => sub.remove();
  });
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
