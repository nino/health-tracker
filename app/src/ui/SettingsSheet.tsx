import { useQuery, useQueryClient } from "@tanstack/react-query";
import * as DocumentPicker from "expo-document-picker";
import { File } from "expo-file-system";
import { useState } from "react";
import { Pressable, Share, StyleSheet, Switch, Text, View } from "react-native";

import { appDb, entryStore } from "../app/appDb";
import { SYMPTOMS } from "../catalog";
import { getEnabledSymptomIds, setEnabledSymptomIds } from "../store/settings";
import { parseSwiftExport } from "../store/swiftImport";
import { SheetModal } from "./SheetModal";
import { useTheme } from "./theme";

export function SettingsSheet(props: { onClose: () => void }) {
  const theme = useTheme();
  const queryClient = useQueryClient();
  const [importResult, setImportResult] = useState<string | null>(null);
  const enabled = useQuery({
    queryKey: ["enabledSymptomIds"],
    queryFn: () => getEnabledSymptomIds(appDb),
  });
  const enabledSet = new Set(enabled.data ?? []);

  const toggle = (id: string, on: boolean) => {
    const next = new Set(enabledSet);
    if (on) {
      next.add(id);
    } else {
      next.delete(id);
    }
    setEnabledSymptomIds(appDb, [...next]);
    void queryClient.invalidateQueries({ queryKey: ["enabledSymptomIds"] });
  };

  const exportJSON = () => {
    void Share.share({
      message: entryStore.exportJSON(),
      title: "health-tracker export",
    });
  };

  const importJSON = async () => {
    try {
      const picked = await DocumentPicker.getDocumentAsync({
        type: "application/json",
      });
      if (picked.canceled) return;
      const json = await new File(picked.assets[0].uri).text();
      const added = entryStore.import(parseSwiftExport(json));
      void queryClient.invalidateQueries({ queryKey: ["lastDates"] });
      setImportResult(`Imported ${added} entries.`);
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
        <Pressable style={styles.row} onPress={exportJSON}>
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
          <Text style={{ color: theme.tint }}>
            Import metric-log JSON (from the Swift app)
          </Text>
        </Pressable>
      </View>
      {importResult && (
        <Text style={[styles.hint, { color: theme.secondaryText }]}>
          {importResult}
        </Text>
      )}
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
