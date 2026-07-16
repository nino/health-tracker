import { useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { entryStore } from "../app/appDb";
import { type Symptom } from "../catalog";
import { DateField } from "./DateField";
import { SheetModal } from "./SheetModal";
import { useTheme } from "./theme";

export function SymptomLogSheet(props: {
  symptom: Symptom;
  onClose: () => void;
}) {
  const theme = useTheme();
  const queryClient = useQueryClient();
  const [value, setValue] = useState(props.symptom.valueKind.defaultValue);
  const [date, setDate] = useState(() => new Date());

  const save = () => {
    entryStore.add(props.symptom.id, value, date);
    void queryClient.invalidateQueries({ queryKey: ["lastDates"] });
    props.onClose();
  };

  return (
    <SheetModal
      visible
      title={`${props.symptom.icon} ${props.symptom.name}`}
      onClose={props.onClose}
      actionLabel="Save"
      onAction={save}
    >
      <Text style={[styles.section, { color: theme.secondaryText }]}>
        {props.symptom.valueKind.sectionTitle.toUpperCase()}
      </Text>
      <View
        style={[
          styles.options,
          { backgroundColor: theme.card, borderColor: theme.border },
        ]}
      >
        {props.symptom.valueKind.options.map((option, index) => (
          <Pressable
            key={option.value}
            onPress={() => setValue(option.value)}
            style={[
              styles.option,
              index > 0 && {
                borderTopWidth: StyleSheet.hairlineWidth,
                borderTopColor: theme.border,
              },
            ]}
          >
            <Text style={{ color: theme.text }}>{option.label}</Text>
            {value === option.value && (
              <Text style={{ color: theme.tint, fontWeight: "600" }}>✓</Text>
            )}
          </Pressable>
        ))}
      </View>
      <DateField label="Date" value={date} onChange={setDate} />
    </SheetModal>
  );
}

const styles = StyleSheet.create({
  section: { fontSize: 13, marginBottom: -8 },
  options: {
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    overflow: "hidden",
  },
  option: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingVertical: 13,
  },
});
