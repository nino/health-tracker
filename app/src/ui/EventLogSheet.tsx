import { useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { StyleSheet, Text } from "react-native";

import { saveEntry } from "../app/health";
import { customEntryKind, type CustomItem } from "../store/customItems";
import { PlainButton, PrimaryButton } from "./Buttons";
import { DateField } from "./DateField";
import { SheetModal } from "./SheetModal";
import { useTheme } from "./theme";

/** Log sheet for event custom items: no value to pick — saving records "it
 * happened" (value 1) at the chosen date. Events are not part of next-up
 * (there is no "didn't happen" log), so there is no Save & Next. */
export function EventLogSheet(props: {
  item: CustomItem;
  onClose: () => void;
}) {
  const theme = useTheme();
  const queryClient = useQueryClient();
  const [date, setDate] = useState(() => new Date());

  const save = () => {
    saveEntry(queryClient, customEntryKind(props.item.id), 1, date);
    props.onClose();
  };

  return (
    <SheetModal
      visible
      title={`${props.item.icon} ${props.item.name}`}
      onClose={props.onClose}
      closeLabel={null}
    >
      <Text style={[styles.hint, { color: theme.secondaryText }]}>
        Log that it happened.
      </Text>
      <DateField label="Date" value={date} onChange={setDate} />
      <PrimaryButton label="Save" onPress={save} />
      <PlainButton label="Cancel" onPress={props.onClose} />
    </SheetModal>
  );
}

const styles = StyleSheet.create({ hint: { fontSize: 13 } });
