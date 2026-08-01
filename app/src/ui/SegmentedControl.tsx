import { Pressable, StyleSheet, Text, View } from "react-native";

import { useTheme } from "./theme";

// iOS-style segmented control: a bordered track of equal-width segments,
// selected one filled with the tint.
export function SegmentedControl<Id extends string>(props: {
  segments: readonly { id: Id; label: string }[];
  value: Id;
  onChange: (id: Id) => void;
}) {
  const theme = useTheme();
  return (
    <View
      style={[
        styles.track,
        { backgroundColor: theme.card, borderColor: theme.border },
      ]}
    >
      {props.segments.map((segment) => {
        const selected = segment.id === props.value;
        return (
          <Pressable
            key={segment.id}
            onPress={() => props.onChange(segment.id)}
            style={[
              styles.segment,
              selected && { backgroundColor: theme.tint },
            ]}
          >
            <Text
              style={[
                styles.label,
                { color: selected ? "#ffffff" : theme.text },
                selected && styles.selectedLabel,
              ]}
            >
              {segment.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  track: {
    flexDirection: "row",
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    overflow: "hidden",
    padding: 2,
    gap: 2,
  },
  segment: {
    flex: 1,
    borderRadius: 10,
    alignItems: "center",
    paddingVertical: 8,
  },
  label: { fontSize: 14 },
  selectedLabel: { fontWeight: "600" },
});
