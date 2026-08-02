import { useQuery, useQueryClient } from "@tanstack/react-query";
import * as DocumentPicker from "expo-document-picker";
import { File, Paths } from "expo-file-system";
import * as Sharing from "expo-sharing";
import { useState } from "react";
import { Pressable, StyleSheet, Switch, Text, View } from "react-native";

import { appDb, entryStore } from "../app/appDb";
import {
  customItemKeys,
  customItemsOptions,
  enabledSymptomIdsOptions,
  entryKeys,
  settingsKeys,
} from "../app/queries";
import { SYMPTOMS } from "../catalog";
import { type CustomItem } from "../store/customItems";
import { setEnabledSymptomIds } from "../store/settings";
import { importEntriesFromJSON } from "../store/swiftImport";
import { CustomItemSheet } from "./CustomItemSheet";
import { SheetModal } from "./SheetModal";
import { useTheme } from "./theme";

export function SettingsSheet(props: { onClose: () => void }) {
  const theme = useTheme();
  const queryClient = useQueryClient();
  const [importResult, setImportResult] = useState<string | null>(null);
  // null = closed, "new" = creating, otherwise editing that item.
  const [editing, setEditing] = useState<CustomItem | "new" | null>(null);
  const enabled = useQuery(enabledSymptomIdsOptions());
  const enabledSet = new Set(enabled.data ?? []);
  const customItems = useQuery(customItemsOptions());

  const toggle = (id: string, on: boolean) => {
    const next = new Set(enabledSet);
    if (on) {
      next.add(id);
    } else {
      next.delete(id);
    }
    setEnabledSymptomIds(appDb, [...next]);
    void queryClient.invalidateQueries({
      queryKey: settingsKeys.enabledSymptomIds,
    });
  };

  // Shared as a file, not an inline string: Android's share Intent has a
  // ~1 MB transaction limit that a few years of entries would exceed.
  const exportJSON = async () => {
    try {
      const file = new File(Paths.cache, "health-tracker-export.json");
      if (file.exists) file.delete();
      file.write(entryStore.exportJSON());
      await Sharing.shareAsync(file.uri, { mimeType: "application/json" });
    } catch (error) {
      setImportResult(`Export failed: ${String(error)}`);
    }
  };

  const importJSON = async () => {
    try {
      const picked = await DocumentPicker.getDocumentAsync({
        type: "application/json",
      });
      if (picked.canceled) return;
      // On web (the PR-screenshot harness) the asset carries a browser File;
      // expo-file-system can't read blob: URIs there.
      const asset = picked.assets[0];
      const json = asset.file
        ? await asset.file.text()
        : await new File(asset.uri).text();
      const { added, skippedUnknownKinds } = importEntriesFromJSON(
        entryStore,
        appDb,
        json,
      );
      // entryKeys.all covers every byKind query and lastDates.
      void queryClient.invalidateQueries({ queryKey: entryKeys.all });
      void queryClient.invalidateQueries({ queryKey: customItemKeys.all });
      setImportResult(
        skippedUnknownKinds > 0
          ? `Imported ${added} entries (${skippedUnknownKinds} of an unknown type skipped).`
          : `Imported ${added} entries.`,
      );
    } catch (error) {
      setImportResult(`Import failed: ${String(error)}`);
    }
  };

  return (
    <SheetModal visible title="Settings" onClose={props.onClose}>
      <View
        style={[
          styles.list,
          { backgroundColor: theme.card, borderColor: theme.border },
        ]}
      >
        <Pressable style={styles.row} onPress={() => void exportJSON()}>
          <Text style={{ color: theme.tint }}>Export data as JSON</Text>
        </Pressable>
        <Pressable
          style={[
            styles.row,
            {
              borderTopWidth: StyleSheet.hairlineWidth,
              borderTopColor: theme.border,
            },
          ]}
          onPress={() => void importJSON()}
        >
          <Text style={{ color: theme.tint }}>Import JSON data</Text>
        </Pressable>
      </View>
      {importResult && (
        <Text style={[styles.hint, { color: theme.secondaryText }]}>
          {importResult}
        </Text>
      )}
      <Text style={[styles.hint, { color: theme.secondaryText }]}>
        Custom items always appear on the main screen; archive one to remove it
        (its history stays).
      </Text>
      <View
        style={[
          styles.list,
          { backgroundColor: theme.card, borderColor: theme.border },
        ]}
      >
        {(customItems.data ?? []).map((item, index) => (
          <Pressable
            key={item.id}
            style={[
              styles.row,
              index > 0 && {
                borderTopWidth: StyleSheet.hairlineWidth,
                borderTopColor: theme.border,
              },
            ]}
            onPress={() => setEditing(item)}
          >
            <Text style={styles.icon}>{item.icon}</Text>
            <Text style={[styles.name, { color: theme.text }]}>
              {item.name}
            </Text>
            <Text style={{ color: theme.secondaryText }}>
              {item.kind === "severity"
                ? "Severity"
                : item.kind === "rating"
                  ? "1–10"
                  : "Event"}
            </Text>
          </Pressable>
        ))}
        <Pressable
          style={[
            styles.row,
            (customItems.data ?? []).length > 0 && {
              borderTopWidth: StyleSheet.hairlineWidth,
              borderTopColor: theme.border,
            },
          ]}
          onPress={() => setEditing("new")}
        >
          <Text style={{ color: theme.tint }}>Add custom item…</Text>
        </Pressable>
      </View>
      <Text style={[styles.hint, { color: theme.secondaryText }]}>
        Enabled symptoms appear on the main screen.
      </Text>
      <View
        style={[
          styles.list,
          { backgroundColor: theme.card, borderColor: theme.border },
        ]}
      >
        {SYMPTOMS.map((symptom, index) => (
          <View
            key={symptom.id}
            style={[
              styles.row,
              index > 0 && {
                borderTopWidth: StyleSheet.hairlineWidth,
                borderTopColor: theme.border,
              },
            ]}
          >
            <Text style={styles.icon}>{symptom.icon}</Text>
            <Text style={[styles.name, { color: theme.text }]}>
              {symptom.name}
            </Text>
            <Switch
              value={enabledSet.has(symptom.id)}
              onValueChange={(on) => toggle(symptom.id, on)}
            />
          </View>
        ))}
      </View>
      {editing !== null && (
        <CustomItemSheet
          item={editing === "new" ? null : editing}
          onClose={() => setEditing(null)}
        />
      )}
    </SheetModal>
  );
}

const styles = StyleSheet.create({
  hint: { fontSize: 13 },
  list: {
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    overflow: "hidden",
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  icon: { fontSize: 18, width: 24, textAlign: "center" },
  name: { flex: 1 },
});
