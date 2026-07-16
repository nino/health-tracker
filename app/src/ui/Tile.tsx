import { Pressable, StyleSheet, Text, View } from "react-native";

import { relativeAge, staleness } from "../lib/staleness";
import { stalenessColor, useTheme } from "./theme";

export function Tile(props: {
  title: string;
  icon: string;
  lastDate: Date | null;
  now: Date;
  onPress: () => void;
}) {
  const theme = useTheme();
  const bucket = staleness(props.lastDate, props.now);
  return (
    <Pressable
      onPress={props.onPress}
      style={({ pressed }) => [
        styles.card,
        { backgroundColor: theme.card, borderColor: theme.border },
        pressed && styles.pressed,
      ]}
    >
      <Text style={styles.icon}>{props.icon}</Text>
      <View style={styles.textColumn}>
        <Text style={[styles.title, { color: theme.text }]} numberOfLines={2}>
          {props.title}
        </Text>
        <View style={styles.ageRow}>
          <View
            style={[
              styles.dot,
              { backgroundColor: stalenessColor(bucket, theme) },
            ]}
          />
          <Text style={[styles.age, { color: theme.secondaryText }]}>
            {relativeAge(props.lastDate, props.now)}
          </Text>
        </View>
      </View>
    </Pressable>
  );
}

// A plain tile without recency (the Random button).
export function PlainTile(props: {
  title: string;
  icon: string;
  onPress: () => void;
}) {
  const theme = useTheme();
  return (
    <Pressable
      onPress={props.onPress}
      style={({ pressed }) => [
        styles.card,
        { backgroundColor: theme.card, borderColor: theme.border },
        pressed && styles.pressed,
      ]}
    >
      <Text style={styles.icon}>{props.icon}</Text>
      <View style={styles.textColumn}>
        <Text style={[styles.title, { color: theme.text }]}>{props.title}</Text>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    width: "48.5%",
    minHeight: 64,
    borderRadius: 16,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 14,
    paddingVertical: 10,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  pressed: { opacity: 0.7, transform: [{ scale: 0.98 }] },
  icon: { fontSize: 22, width: 28, textAlign: "center" },
  textColumn: { flex: 1, gap: 3 },
  title: { fontWeight: "500" },
  ageRow: { flexDirection: "row", alignItems: "center", gap: 4 },
  dot: { width: 8, height: 8, borderRadius: 4 },
  age: { fontSize: 12 },
});
