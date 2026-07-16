import { StyleSheet, Text, View } from "react-native";

import { type Staleness } from "../lib/staleness";
import { SheetModal } from "./SheetModal";
import { stalenessColor, useTheme } from "./theme";

// Labels mirror the thresholds in src/lib/staleness.ts.
const LEGEND: { bucket: Staleness; label: string }[] = [
  { bucket: "fresh", label: "Logged under 2 hours ago" },
  { bucket: "green", label: "2–4 hours ago" },
  { bucket: "yellow", label: "4–8 hours ago" },
  { bucket: "orange", label: "8–24 hours ago" },
  { bucket: "red", label: "Over a day ago, or never" },
];

export function InfoSheet(props: { onClose: () => void }) {
  const theme = useTheme();
  return (
    <SheetModal visible title="About" onClose={props.onClose}>
      <Text style={[styles.paragraph, { color: theme.text }]}>
        Tap a tile to log a symptom or your mood, stress, or anxiety — entries
        can be backdated with the date field. Random picks a symptom for you,
        slightly favoring the ones logged least recently.
      </Text>
      <Text style={[styles.paragraph, { color: theme.text }]}>
        Each tile shows how long ago it was last logged:
      </Text>
      <View
        style={[
          styles.legend,
          { backgroundColor: theme.card, borderColor: theme.border },
        ]}
      >
        {LEGEND.map((item) => (
          <View key={item.bucket} style={styles.legendRow}>
            <View
              style={[
                styles.dot,
                { backgroundColor: stalenessColor(item.bucket, theme) },
              ]}
            />
            <Text style={{ color: theme.text }}>{item.label}</Text>
          </View>
        ))}
      </View>
      <Text style={[styles.paragraph, { color: theme.secondaryText }]}>
        All data is stored on this device. On iPhone, entries will also sync to
        Apple Health in an upcoming version.
      </Text>
    </SheetModal>
  );
}

const styles = StyleSheet.create({
  paragraph: { lineHeight: 21 },
  legend: {
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    padding: 16,
    gap: 12,
  },
  legendRow: { flexDirection: "row", alignItems: "center", gap: 10 },
  dot: { width: 10, height: 10, borderRadius: 5 },
});
