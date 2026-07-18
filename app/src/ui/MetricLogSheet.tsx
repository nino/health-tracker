import { useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { saveEntry } from "../app/health";
import { type Metric } from "../catalog";
import { PlainButton, PrimaryButton, TintedButton } from "./Buttons";
import { DateField } from "./DateField";
import { SaveButtonRow } from "./SaveButtonRow";
import { SheetModal } from "./SheetModal";
import { useTheme } from "./theme";

export function MetricLogSheet(props: {
  metric: Metric;
  onClose: () => void;
  nextAvailable: boolean;
  onSaveAndNext: () => void;
}) {
  const theme = useTheme();
  const queryClient = useQueryClient();
  const neutral = Math.round((props.metric.min + props.metric.max) / 2);
  const [value, setValue] = useState(neutral);
  const [date, setDate] = useState(() => new Date());

  const save = () => {
    saveEntry(queryClient, props.metric.id, value, date);
    props.onClose();
  };

  const saveAndNext = () => {
    saveEntry(queryClient, props.metric.id, value, date);
    props.onSaveAndNext();
  };

  const ratings = [];
  for (let r = props.metric.min; r <= props.metric.max; r++) {
    ratings.push(r);
  }

  return (
    <SheetModal
      visible
      title={`${props.metric.icon} ${props.metric.name}`}
      onClose={props.onClose}
      closeLabel={null}
    >
      <View style={styles.readout}>
        <Text style={[styles.value, { color: theme.text }]}>{value}</Text>
        <Text style={{ color: theme.secondaryText }}>
          {props.metric.describe(value)}
        </Text>
      </View>
      <View style={styles.ratingRow}>
        {ratings.map((rating) => (
          <Pressable
            key={rating}
            onPress={() => setValue(rating)}
            style={[
              styles.rating,
              { backgroundColor: theme.card, borderColor: theme.border },
              rating === value && { backgroundColor: theme.tint },
            ]}
          >
            <Text
              style={[
                styles.ratingLabel,
                { color: rating === value ? "#ffffff" : theme.text },
              ]}
            >
              {rating}
            </Text>
          </Pressable>
        ))}
      </View>
      <DateField label="Date" value={date} onChange={setDate} />
      <SaveButtonRow>
        <PrimaryButton label="Save" onPress={save} />
        <TintedButton
          label="Save & Next"
          onPress={saveAndNext}
          disabled={!props.nextAvailable}
        />
      </SaveButtonRow>
      <PlainButton label="Cancel" onPress={props.onClose} />
    </SheetModal>
  );
}

const styles = StyleSheet.create({
  readout: { alignItems: "center", gap: 4 },
  value: { fontSize: 44, fontWeight: "700" },
  ratingRow: { flexDirection: "row", gap: 4 },
  rating: {
    flex: 1,
    height: 44,
    borderRadius: 10,
    borderWidth: StyleSheet.hairlineWidth,
    alignItems: "center",
    justifyContent: "center",
  },
  ratingLabel: { fontSize: 17, fontWeight: "600" },
});
