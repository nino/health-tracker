import { useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { saveEntry } from "../app/health";
import { type Symptom } from "../catalog";
import { PlainButton, PrimaryButton, TintedButton } from "./Buttons";
import { DateField } from "./DateField";
import { SaveButtonRow } from "./SaveButtonRow";
import { SheetModal } from "./SheetModal";
import { useTheme } from "./theme";

export function SymptomLogSheet(props: {
  symptom: Symptom;
  onClose: () => void;
  /** True when some other enabled item hasn't been logged in the last 10
   * minutes — enables Save & Next. */
  nextAvailable: boolean;
  /** Called after a Save & Next save; the caller advances the sheet. */
  onSaveAndNext: () => void;
}) {
  const theme = useTheme();
  const queryClient = useQueryClient();
  const [value, setValue] = useState<number | null>(null);
  const [date, setDate] = useState(() => new Date());

  const save = () => {
    if (value == null) return;
    saveEntry(queryClient, props.symptom.id, value, date);
    props.onClose();
  };

  const saveAndNext = () => {
    if (value == null) return;
    saveEntry(queryClient, props.symptom.id, value, date);
    props.onSaveAndNext();
  };

  return (
    <SheetModal
      visible
      title={`${props.symptom.icon} ${props.symptom.name}`}
      onClose={props.onClose}
      closeLabel={null}
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
      <SaveButtonRow>
        <PrimaryButton label="Save" onPress={save} disabled={value == null} />
        <TintedButton
          label="Save & Next"
          onPress={saveAndNext}
          disabled={value == null || !props.nextAvailable}
        />
      </SaveButtonRow>
      <PlainButton label="Cancel" onPress={props.onClose} />
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
