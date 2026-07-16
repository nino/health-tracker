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

// Shared sheet shell: title bar with Cancel/action, scrollable content.
export function SheetModal(props: {
  visible: boolean;
  title: string;
  onClose: () => void;
  actionLabel?: string;
  onAction?: () => void;
  children: ReactNode;
}) {
  const theme = useTheme();
  return (
    <Modal
      visible={props.visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={props.onClose}
    >
      <View style={[styles.container, { backgroundColor: theme.background }]}>
        <View style={[styles.header, { borderBottomColor: theme.border }]}>
          <Pressable onPress={props.onClose} hitSlop={8}>
            <Text style={[styles.headerButton, { color: theme.tint }]}>
              Cancel
            </Text>
          </Pressable>
          <Text style={[styles.title, { color: theme.text }]}>
            {props.title}
          </Text>
          {props.actionLabel && props.onAction ? (
            <Pressable onPress={props.onAction} hitSlop={8}>
              <Text
                style={[
                  styles.headerButton,
                  styles.actionButton,
                  { color: theme.tint },
                ]}
              >
                {props.actionLabel}
              </Text>
            </Pressable>
          ) : (
            <View style={styles.headerSpacer} />
          )}
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
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  headerButton: { fontSize: 17, minWidth: 60 },
  actionButton: { fontWeight: "600", textAlign: "right" },
  headerSpacer: { minWidth: 60 },
  title: { fontSize: 17, fontWeight: "600" },
  content: { padding: 16, gap: 16 },
});
