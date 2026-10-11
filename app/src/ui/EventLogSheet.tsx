import { useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { StyleSheet, TextInput } from "react-native";

import { saveEntry } from "../app/health";
import { customEntryKind, type CustomItem } from "../store/customItems";
import { PlainButton, PrimaryButton } from "./Buttons";
import { DateField } from "./DateField";
import { SheetModal } from "./SheetModal";
import { useTheme } from "./theme";

/** Log sheet for event custom items: no value to pick — saving records "it
 * happened" (value 1) at the chosen date, with an optional comment in
 * value_text. The comment field doesn't take focus, so logging without one
 * stays a single tap on Save. Events are not part of next-up (there is no
 * "didn't happen" log), so there is no Save & Next. */
export function EventLogSheet(props: {
  item: CustomItem;
  onClose: () => void;
}) {
  const theme = useTheme();
  const queryClient = useQueryClient();
  const [comment, setComment] = useState("");
  const [date, setDate] = useState(() => new Date());

  const save = () => {
    const trimmed = comment.trim();
    saveEntry(
      queryClient,
      customEntryKind(props.item.id),
      1,
      date,
      trimmed === "" ? null : trimmed,
    );
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
        value={comment}
        onChangeText={setComment}
        placeholder="Comment (optional)"
        placeholderTextColor={theme.secondaryText}
        multiline
      />
      <DateField label="Date" value={date} onChange={setDate} />
      <PrimaryButton label="Save" onPress={save} />
      <PlainButton label="Cancel" onPress={props.onClose} />
    </SheetModal>
  );
}

const styles = StyleSheet.create({
  input: {
    minHeight: 64,
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    padding: 12,
    fontSize: 16,
    textAlignVertical: "top",
  },
});
