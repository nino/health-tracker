import { useQueryClient } from "@tanstack/react-query";
import { randomUUID } from "expo-crypto";
import { useState } from "react";
import { StyleSheet, Switch, Text, TextInput, View } from "react-native";

import { appDb } from "../app/appDb";
import { customItemKeys } from "../app/queries";
import {
  addCustomItem,
  archiveCustomItem,
  updateCustomItem,
  type CustomItem,
  type CustomItemKind,
} from "../store/customItems";
import { PlainButton, PrimaryButton } from "./Buttons";
import { SegmentedControl } from "./SegmentedControl";
import { SheetModal } from "./SheetModal";
import { useTheme } from "./theme";

const KIND_SEGMENTS: readonly { id: CustomItemKind; label: string }[] = [
  { id: "severity", label: "Severity" },
  { id: "rating", label: "1–10 Rating" },
];

/** Create or edit a custom item. The kind is fixed after creation — stored
 * values would silently change meaning. Deleting is archival only. */
export function CustomItemSheet(props: {
  /** null = create a new item. */
  item: CustomItem | null;
  onClose: () => void;
}) {
  const theme = useTheme();
  const queryClient = useQueryClient();
  const [name, setName] = useState(props.item?.name ?? "");
  const [icon, setIcon] = useState(props.item?.icon ?? "");
  const [kind, setKind] = useState<CustomItemKind>(
    props.item?.kind ?? "severity",
  );
  const [highIsGood, setHighIsGood] = useState(props.item?.highIsGood ?? false);

  const invalidate = () =>
    void queryClient.invalidateQueries({ queryKey: customItemKeys.all });

  const save = () => {
    const trimmedName = name.trim();
    if (trimmedName === "") return;
    const trimmedIcon = icon.trim() === "" ? "✏️" : icon.trim();
    if (props.item) {
      updateCustomItem(appDb, props.item.id, {
        name: trimmedName,
        icon: trimmedIcon,
        highIsGood,
      });
    } else {
      addCustomItem(appDb, randomUUID, {
        name: trimmedName,
        icon: trimmedIcon,
        kind,
        highIsGood,
      });
    }
    invalidate();
    props.onClose();
  };

  const archive = () => {
    if (!props.item) return;
    archiveCustomItem(appDb, props.item.id);
    invalidate();
    props.onClose();
  };

  return (
    <SheetModal
      visible
      title={props.item ? "Edit Custom Item" : "New Custom Item"}
      onClose={props.onClose}
      closeLabel={null}
    >
      <View
        style={[
          styles.fields,
          { backgroundColor: theme.card, borderColor: theme.border },
        ]}
      >
        <View style={styles.fieldRow}>
          <Text style={{ color: theme.secondaryText }}>Name</Text>
          <TextInput
            style={[styles.input, { color: theme.text }]}
            value={name}
            onChangeText={setName}
            placeholder="e.g. Tinnitus"
            placeholderTextColor={theme.secondaryText}
            autoFocus={props.item === null}
          />
        </View>
        <View
          style={[
            styles.fieldRow,
            {
              borderTopWidth: StyleSheet.hairlineWidth,
              borderTopColor: theme.border,
            },
          ]}
        >
          <Text style={{ color: theme.secondaryText }}>Emoji</Text>
          <TextInput
            style={[styles.input, { color: theme.text }]}
            value={icon}
            onChangeText={setIcon}
            placeholder="✏️"
            placeholderTextColor={theme.secondaryText}
          />
        </View>
      </View>

      {props.item === null ? (
        <SegmentedControl
          segments={KIND_SEGMENTS}
          value={kind}
          onChange={setKind}
        />
      ) : (
        <Text style={[styles.hint, { color: theme.secondaryText }]}>
          {props.item.kind === "severity"
            ? "Severity item — logged like a symptom."
            : "1–10 rating item."}{" "}
          The kind can&apos;t change after creation.
        </Text>
      )}

      {(props.item?.kind ?? kind) === "rating" && (
        <View
          style={[
            styles.fields,
            { backgroundColor: theme.card, borderColor: theme.border },
          ]}
        >
          <View style={styles.fieldRow}>
            <Text style={[styles.switchLabel, { color: theme.text }]}>
              High is good
            </Text>
            <Switch value={highIsGood} onValueChange={setHighIsGood} />
          </View>
        </View>
      )}

      <PrimaryButton
        label="Save"
        onPress={save}
        disabled={name.trim() === ""}
      />
      {props.item && <PlainButton label="Archive Item" onPress={archive} />}
      <PlainButton label="Cancel" onPress={props.onClose} />
    </SheetModal>
  );
}

const styles = StyleSheet.create({
  fields: {
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    overflow: "hidden",
  },
  fieldRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  input: { flex: 1, fontSize: 16, textAlign: "right", padding: 0 },
  switchLabel: { flex: 1 },
  hint: { fontSize: 13 },
});
