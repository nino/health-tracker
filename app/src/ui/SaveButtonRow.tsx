import { Children, type ReactNode } from "react";
import { StyleSheet, View } from "react-native";

// Two equal-width buttons side by side (Save | Save & Next).
export function SaveButtonRow(props: { children: ReactNode }) {
  return (
    <View style={styles.row}>
      {Children.map(props.children, (child) => (
        <View style={styles.cell}>{child}</View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", gap: 10 },
  cell: { flex: 1 },
});
