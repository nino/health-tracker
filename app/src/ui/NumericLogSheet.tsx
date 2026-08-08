import { useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { StyleSheet, TextInput } from "react-native";

import { saveEntry } from "../app/health";
import { customEntryKind, type CustomItem } from "../store/customItems";
import { PlainButton, PrimaryButton } from "./Buttons";
import { DateField } from "./DateField";
import { SheetModal } from "./SheetModal";
import { useTheme } from "./theme";

/** Log sheet for numeric custom items: type any number (reps, weight,
 * minutes — decimals allowed). Like events, numeric items stay out of
 * next-up (there is no "didn't do any" log), so there is no Save & Next. */
export function NumericLogSheet(props: {
  item: CustomItem;
  onClose: () => void;
}) {
  const theme = useTheme();
  const queryClient = useQueryClient();
  const [text, setText] = useState("");
  const [date, setDate] = useState(() => new Date());

  // Some locales' decimal-pad offers only a comma.
  const value = Number(text.trim().replace(",", "."));
  const valid = text.trim() !== "" && Number.isFinite(value);

  const save = () => {
    if (!valid) return;
    saveEntry(queryClient, customEntryKind(props.item.id), value, date);
    props.onClose();
  };

  return (
    <SheetModal
      visible
      title={`${props.item.icon} ${props.item.name}`}
      onClose={props.onClose}
      closeLabel={null}
    >
      <TextInput
        style={[
          styles.input,
          {
            color: theme.text,
            backgroundColor: theme.card,
            borderColor: theme.border,
          },
        ]}
        value={text}
        onChangeText={setText}
        placeholder="0"
        placeholderTextColor={theme.secondaryText}
        keyboardType="decimal-pad"
        autoFocus
      />
      <DateField label="Date" value={date} onChange={setDate} />
      <PrimaryButton label="Save" onPress={save} disabled={!valid} />
      <PlainButton label="Cancel" onPress={props.onClose} />
    </SheetModal>
  );
}

const styles = StyleSheet.create({
  input: {
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    padding: 12,
    fontSize: 22,
    textAlign: "center",
    fontVariant: ["tabular-nums"],
  },
});
