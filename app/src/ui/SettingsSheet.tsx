import { useQuery, useQueryClient } from "@tanstack/react-query";
import { StyleSheet, Switch, Text, View } from "react-native";

import { appDb } from "../app/appDb";
import { SYMPTOMS } from "../catalog";
import { getEnabledSymptomIds, setEnabledSymptomIds } from "../store/settings";
import { SheetModal } from "./SheetModal";
import { useTheme } from "./theme";

export function SettingsSheet(props: { onClose: () => void }) {
  const theme = useTheme();
  const queryClient = useQueryClient();
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

  return (
    <SheetModal visible title="Symptoms" onClose={props.onClose}>
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
