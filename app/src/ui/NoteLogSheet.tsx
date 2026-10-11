import { useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { StyleSheet, TextInput } from "react-native";

import { saveEntry } from "../app/health";
import { NOTE } from "../catalog/note";
import { PlainButton, PrimaryButton } from "./Buttons";
import { DateField } from "./DateField";
import { SheetModal } from "./SheetModal";
import { useTheme } from "./theme";

/** Free-text log sheet for the built-in quick note: truly one-off entries,
 * kind "note", value 0, text in value_text, not part of next-up, no chart.
 * (Recurring topics are event items, whose entries take an optional
 * comment — see EventLogSheet.) */
export function NoteLogSheet(props: { onClose: () => void }) {
  const theme = useTheme();
  const queryClient = useQueryClient();
  const [text, setText] = useState("");
  const [date, setDate] = useState(() => new Date());

  const save = () => {
    const trimmed = text.trim();
    if (trimmed === "") return;
    saveEntry(queryClient, NOTE.id, 0, date, trimmed);
    props.onClose();
  };

  return (
    <SheetModal
      visible
      title={`${NOTE.icon} ${NOTE.name}`}
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
        placeholder="What happened?"
        placeholderTextColor={theme.secondaryText}
        multiline
        autoFocus
      />
      <DateField label="Date" value={date} onChange={setDate} />
      <PrimaryButton
        label="Save"
        onPress={save}
        disabled={text.trim() === ""}
      />
      <PlainButton label="Cancel" onPress={props.onClose} />
    </SheetModal>
  );
}

const styles = StyleSheet.create({
  input: {
    minHeight: 88,
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    padding: 12,
    fontSize: 16,
    textAlignVertical: "top",
  },
});
