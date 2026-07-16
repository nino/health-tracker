import DateTimePicker, {
  DateTimePickerAndroid,
} from "@react-native-community/datetimepicker";
import { Platform, Pressable, StyleSheet, Text, View } from "react-native";

import { useTheme } from "./theme";

// Backdatable date+time editing. iOS renders the system compact picker
// inline; Android's picker is dialog-based and can't do datetime in one, so
// two tappable fields open the date and time dialogs.
export function DateField(props: {
  label: string;
  value: Date;
  onChange: (date: Date) => void;
}) {
  const theme = useTheme();

  if (Platform.OS === "ios") {
    return (
      <View style={styles.row}>
        <Text style={{ color: theme.text }}>{props.label}</Text>
        <DateTimePicker
          value={props.value}
          mode="datetime"
          display="compact"
          maximumDate={new Date()}
          onValueChange={(_, date) => props.onChange(date)}
        />
      </View>
    );
  }

  const openAndroid = (mode: "date" | "time") => {
    DateTimePickerAndroid.open({
      value: props.value,
      mode,
      maximumDate: mode === "date" ? new Date() : undefined,
      onValueChange: (_, date) => props.onChange(date),
    });
  };

  return (
    <View style={styles.row}>
      <Text style={{ color: theme.text }}>{props.label}</Text>
      <View style={styles.androidFields}>
        <Pressable
          onPress={() => openAndroid("date")}
          style={[styles.field, { backgroundColor: theme.card }]}
        >
          <Text style={{ color: theme.text }}>
            {props.value.toLocaleDateString()}
          </Text>
        </Pressable>
        <Pressable
          onPress={() => openAndroid("time")}
          style={[styles.field, { backgroundColor: theme.card }]}
        >
          <Text style={{ color: theme.text }}>
            {props.value.toLocaleTimeString([], {
              hour: "2-digit",
              minute: "2-digit",
            })}
          </Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  androidFields: { flexDirection: "row", gap: 8 },
  field: { borderRadius: 8, paddingHorizontal: 12, paddingVertical: 8 },
});
