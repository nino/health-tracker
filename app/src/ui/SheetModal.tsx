import { type ReactNode } from "react";
import {
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";

import { useTheme } from "./theme";

// Shared sheet shell: title bar, scrollable content. Sheets with a primary
// action (the log sheets) render their own Save/Cancel buttons in the
// content and pass closeLabel={null}; passive sheets keep a header button.
export function SheetModal(props: {
  visible: boolean;
  title: string;
  onClose: () => void;
  /** Header close-button label; null hides the header button entirely. */
  closeLabel?: string | null;
  children: ReactNode;
}) {
  const theme = useTheme();
  const closeLabel = props.closeLabel === undefined ? "Done" : props.closeLabel;
  return (
    <Modal
      visible={props.visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={props.onClose}
    >
      <View style={[styles.container, { backgroundColor: theme.background }]}>
        <View style={[styles.header, { borderBottomColor: theme.border }]}>
          {closeLabel !== null ? (
            <Pressable onPress={props.onClose} hitSlop={8}>
              <Text style={[styles.headerButton, { color: theme.tint }]}>
                {closeLabel}
              </Text>
            </Pressable>
          ) : (
            <View style={styles.headerSpacer} />
          )}
          <Text style={[styles.title, { color: theme.text }]}>
            {props.title}
          </Text>
          <View style={styles.headerSpacer} />
        </View>
        <ScrollView contentContainerStyle={styles.content}>
          {props.children}
        </ScrollView>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 20,
    paddingVertical: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  headerButton: { fontSize: 17, minWidth: 60 },
  headerSpacer: { minWidth: 60 },
  title: { fontSize: 17, fontWeight: "600" },
  content: { padding: 20, paddingTop: 24, paddingBottom: 40, gap: 20 },
});
