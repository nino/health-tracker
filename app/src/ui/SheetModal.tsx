import { createContext, useContext, useState, type ReactNode } from "react";
import {
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { ScrollLockContext } from "./scrollLock";
import { useTheme } from "./theme";

// Set by a host that owns the Modal itself (SheetDeck, for the Save & Next
// chain): sheets inside it render only their frame, so swapping one log
// sheet for the next animates inside a single presented modal instead of
// a full native dismiss followed by a full native present.
export const HostedSheetContext = createContext(false);

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
  const insets = useSafeAreaInsets();
  const closeLabel = props.closeLabel === undefined ? "Done" : props.closeLabel;
  // iOS pageSheet floats below the status bar; Android modals are
  // edge-to-edge, so the header needs the top inset there.
  const headerTopInset = Platform.OS === "android" ? insets.top : 0;
  const hosted = useContext(HostedSheetContext);
  // Charts switch scrolling off for the duration of a pinch/pan (see
  // scrollLock.tsx); everything else leaves it alone.
  const [scrollLocks, setScrollLocks] = useState(0);
  const acquireScrollLock = () => {
    setScrollLocks((n) => n + 1);
    let released = false;
    return () => {
      if (released) return;
      released = true;
      setScrollLocks((n) => n - 1);
    };
  };
  const frame = (
    <View style={[styles.container, { backgroundColor: theme.background }]}>
      <View
        style={[
          styles.header,
          { borderBottomColor: theme.border, paddingTop: 14 + headerTopInset },
        ]}
      >
        {closeLabel !== null ? (
          <Pressable onPress={props.onClose} hitSlop={8}>
            <Text style={[styles.headerButton, { color: theme.tint }]}>
              {closeLabel}
            </Text>
          </Pressable>
        ) : (
          <View style={styles.headerSpacer} />
        )}
        <Text style={[styles.title, { color: theme.text }]}>{props.title}</Text>
        <View style={styles.headerSpacer} />
      </View>
      <ScrollView
        // Without this, the first tap on Save while the keyboard is up
        // only dismisses the keyboard and never reaches the button.
        keyboardShouldPersistTaps="handled"
        scrollEnabled={scrollLocks === 0}
        contentContainerStyle={[
          styles.content,
          { paddingBottom: 40 + insets.bottom },
        ]}
      >
        <ScrollLockContext.Provider value={acquireScrollLock}>
          {props.children}
        </ScrollLockContext.Provider>
      </ScrollView>
    </View>
  );
  if (hosted) return frame;
  return (
    <Modal
      visible={props.visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={props.onClose}
    >
      {frame}
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
    paddingBottom: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  headerButton: { fontSize: 17, minWidth: 60 },
  headerSpacer: { minWidth: 60 },
  title: { fontSize: 17, fontWeight: "600" },
  content: { padding: 20, paddingTop: 24, gap: 20 },
});
