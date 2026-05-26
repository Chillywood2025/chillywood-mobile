import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import React, { useMemo, useState } from "react";
import {
  Modal,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";

import {
  createEmptyContentRightsDisclosure,
  formatContentRightsDisclosureSummary,
  isContentRightsDisclosureActive,
  normalizeContentRightsDisclosure,
  type ContentRightsDisclosureState,
} from "../../_lib/contentRights";

type RightsDisclosureControlProps = {
  value: ContentRightsDisclosureState;
  onChange: (next: ContentRightsDisclosureState) => void;
  disabled?: boolean;
  helperText?: string;
  mode?: "inline" | "overlay";
  showInactiveChip?: boolean;
};

export function RightsDisclosureControl({
  value,
  onChange,
  disabled = false,
  helperText = "Use this if your clip, upload, or live includes third-party content or music.",
  mode = "inline",
  showInactiveChip = true,
}: RightsDisclosureControlProps) {
  const [sheetVisible, setSheetVisible] = useState(false);
  const normalized = useMemo(() => normalizeContentRightsDisclosure(value), [value]);
  const active = isContentRightsDisclosureActive(normalized);
  const summary = formatContentRightsDisclosureSummary(normalized);

  if (mode === "overlay" && !active && !showInactiveChip) return null;

  const update = (patch: Partial<ContentRightsDisclosureState>) => {
    onChange(normalizeContentRightsDisclosure({ ...normalized, ...patch }));
  };

  const clear = () => {
    onChange(createEmptyContentRightsDisclosure());
    setSheetVisible(false);
  };

  return (
    <>
      <TouchableOpacity
        style={[
          mode === "overlay" ? styles.overlayChip : styles.inlineChip,
          active && styles.activeChip,
          disabled && styles.disabledChip,
        ]}
        activeOpacity={0.86}
        onPress={() => setSheetVisible(true)}
        disabled={disabled}
        accessibilityRole="button"
        accessibilityLabel="Open Rights disclosure"
      >
        <MaterialIcons name={active ? "copyright" : "info-outline"} size={16} color={active ? "#fff" : "#D7DEEA"} />
        <Text style={[styles.chipText, active && styles.activeChipText]}>
          {active ? summary : "Rights"}
        </Text>
        <MaterialIcons name="keyboard-arrow-up" size={18} color={active ? "#fff" : "#AEB8CA"} />
      </TouchableOpacity>

      <Modal
        visible={sheetVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setSheetVisible(false)}
      >
        <View style={styles.modalRoot}>
          <Pressable style={styles.modalScrim} onPress={() => setSheetVisible(false)} />
          <View style={styles.sheet}>
            <View style={styles.sheetHandle} />
            <View style={styles.sheetHeader}>
              <View>
                <Text style={styles.sheetKicker}>DISCLOSURE</Text>
                <Text style={styles.sheetTitle}>Rights</Text>
              </View>
              <TouchableOpacity
                style={styles.closeButton}
                onPress={() => setSheetVisible(false)}
                accessibilityRole="button"
                accessibilityLabel="Close Rights disclosure"
              >
                <MaterialIcons name="close" size={19} color="#E8EDF8" />
              </TouchableOpacity>
            </View>
            <Text style={styles.helperText}>{helperText}</Text>

            <TouchableOpacity
              style={[styles.checkboxRow, normalized.containsThirdPartyContent && styles.checkboxRowActive]}
              activeOpacity={0.84}
              onPress={() => update({ containsThirdPartyContent: !normalized.containsThirdPartyContent })}
            >
              <View style={[styles.checkbox, normalized.containsThirdPartyContent && styles.checkboxActive]}>
                <Text style={styles.checkboxMark}>{normalized.containsThirdPartyContent ? "✓" : ""}</Text>
              </View>
              <Text style={styles.checkboxText}>Contains third-party content</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.checkboxRow, normalized.containsThirdPartyMusic && styles.checkboxRowActive]}
              activeOpacity={0.84}
              onPress={() => update({ containsThirdPartyMusic: !normalized.containsThirdPartyMusic })}
            >
              <View style={[styles.checkbox, normalized.containsThirdPartyMusic && styles.checkboxActive]}>
                <Text style={styles.checkboxMark}>{normalized.containsThirdPartyMusic ? "✓" : ""}</Text>
              </View>
              <Text style={styles.checkboxText}>Contains third-party music</Text>
            </TouchableOpacity>

            <TextInput
              style={styles.noteInput}
              placeholder="Add a note"
              placeholderTextColor="#7F8AA2"
              value={normalized.note}
              onChangeText={(note) => update({ note })}
              multiline
              maxLength={500}
            />
            <Text style={styles.legalNote}>
              This disclosure does not confirm permission or licensing. Reports and takedowns can still apply.
            </Text>

            <View style={styles.sheetActions}>
              <TouchableOpacity style={styles.clearButton} activeOpacity={0.84} onPress={clear}>
                <Text style={styles.clearButtonText}>Clear disclosure</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.doneButton} activeOpacity={0.84} onPress={() => setSheetVisible(false)}>
                <Text style={styles.doneButtonText}>Done</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  inlineChip: {
    alignSelf: "flex-start",
    minHeight: 36,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.14)",
    backgroundColor: "rgba(255,255,255,0.06)",
    paddingHorizontal: 12,
    flexDirection: "row",
    alignItems: "center",
    gap: 7,
  },
  overlayChip: {
    position: "absolute",
    left: 18,
    right: 18,
    bottom: 18,
    minHeight: 44,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.18)",
    backgroundColor: "rgba(12,16,24,0.94)",
    paddingHorizontal: 14,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    zIndex: 40,
  },
  activeChip: {
    borderColor: "rgba(220,20,60,0.58)",
    backgroundColor: "rgba(220,20,60,0.26)",
  },
  disabledChip: {
    opacity: 0.55,
  },
  chipText: {
    color: "#D7DEEA",
    fontSize: 12.5,
    fontWeight: "900",
  },
  activeChipText: {
    color: "#fff",
  },
  modalRoot: {
    flex: 1,
    justifyContent: "flex-end",
  },
  modalScrim: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0,0,0,0.56)",
  },
  sheet: {
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.12)",
    backgroundColor: "#101521",
    paddingHorizontal: 18,
    paddingTop: 10,
    paddingBottom: 22,
    gap: 12,
  },
  sheetHandle: {
    alignSelf: "center",
    width: 42,
    height: 4,
    borderRadius: 999,
    backgroundColor: "rgba(255,255,255,0.24)",
    marginBottom: 2,
  },
  sheetHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  sheetKicker: {
    color: "#8D98B1",
    fontSize: 10,
    fontWeight: "900",
    letterSpacing: 1,
  },
  sheetTitle: {
    color: "#fff",
    fontSize: 22,
    fontWeight: "900",
  },
  closeButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255,255,255,0.08)",
  },
  helperText: {
    color: "#CAD3E4",
    fontSize: 13,
    lineHeight: 19,
    fontWeight: "700",
  },
  checkboxRow: {
    minHeight: 48,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.12)",
    backgroundColor: "rgba(255,255,255,0.05)",
    paddingHorizontal: 12,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  checkboxRowActive: {
    borderColor: "rgba(220,20,60,0.44)",
    backgroundColor: "rgba(220,20,60,0.14)",
  },
  checkbox: {
    width: 22,
    height: 22,
    borderRadius: 7,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.35)",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255,255,255,0.05)",
  },
  checkboxActive: {
    borderColor: "#FF6A86",
    backgroundColor: "#DC143C",
  },
  checkboxMark: {
    color: "#fff",
    fontSize: 14,
    fontWeight: "900",
  },
  checkboxText: {
    color: "#F3F6FC",
    fontSize: 14,
    fontWeight: "800",
    flex: 1,
  },
  noteInput: {
    minHeight: 74,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.12)",
    backgroundColor: "rgba(255,255,255,0.06)",
    color: "#fff",
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 13.5,
    fontWeight: "700",
    textAlignVertical: "top",
  },
  legalNote: {
    color: "#9EA9BE",
    fontSize: 12,
    lineHeight: 17,
    fontWeight: "700",
  },
  sheetActions: {
    flexDirection: "row",
    gap: 10,
  },
  clearButton: {
    flex: 1,
    minHeight: 42,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255,255,255,0.08)",
  },
  clearButtonText: {
    color: "#D5DDED",
    fontSize: 13,
    fontWeight: "900",
  },
  doneButton: {
    flex: 1,
    minHeight: 42,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#DC143C",
  },
  doneButtonText: {
    color: "#fff",
    fontSize: 13,
    fontWeight: "900",
  },
});
