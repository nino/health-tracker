import { Pressable, StyleSheet, Text } from "react-native";

import { useTheme } from "./theme";

export function PrimaryButton(props: { label: string; onPress: () => void }) {
  const theme = useTheme();
  return (
    <Pressable
      onPress={props.onPress}
      style={({ pressed }) => [
        styles.primary,
        { backgroundColor: theme.tint },
        pressed && styles.pressed,
      ]}
    >
      <Text style={styles.primaryLabel}>{props.label}</Text>
    </Pressable>
  );
}

// iOS-style "tinted" button: tint at low opacity behind tinted text.
export function TintedButton(props: {
  label: string;
  onPress: () => void;
  disabled?: boolean;
}) {
  const theme = useTheme();
  return (
    <Pressable
      onPress={props.onPress}
      disabled={props.disabled}
      style={({ pressed }) => [
        styles.primary,
        { backgroundColor: `${theme.tint}26` },
        pressed && styles.pressed,
        props.disabled && styles.disabled,
      ]}
    >
      <Text style={[styles.primaryLabel, { color: theme.tint }]}>
        {props.label}
      </Text>
    </Pressable>
  );
}

export function PlainButton(props: { label: string; onPress: () => void }) {
  const theme = useTheme();
  return (
    <Pressable
      onPress={props.onPress}
      style={({ pressed }) => [styles.plain, pressed && styles.pressed]}
    >
      <Text style={[styles.plainLabel, { color: theme.tint }]}>
        {props.label}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  primary: {
    height: 50,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  primaryLabel: { color: "#ffffff", fontSize: 17, fontWeight: "600" },
  plain: { alignItems: "center", paddingVertical: 8 },
  plainLabel: { fontSize: 17 },
  pressed: { opacity: 0.7 },
  disabled: { opacity: 0.4 },
});
