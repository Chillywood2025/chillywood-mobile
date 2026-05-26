import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import React from "react";
import {
  Modal,
  Pressable,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";

import type { SocialAttachmentPickerScope } from "../../_lib/socialAttachments";

type SocialAttachmentActionSheetProps = {
  visible: boolean;
  title: string;
  body?: string;
  kicker?: string;
  showPlatformStudio?: boolean;
  onSelect: (scope: SocialAttachmentPickerScope) => void;
  onOpenPlatformStudio?: () => void;
  onClose: () => void;
};

const DEFAULT_BODY = "Photos and files attach here. Creator videos belong in Platform Studio.";

export function SocialAttachmentActionSheet({
  visible,
  title,
  body = DEFAULT_BODY,
  kicker = "ATTACHMENT",
  showPlatformStudio = false,
  onSelect,
  onOpenPlatformStudio,
  onClose,
}: SocialAttachmentActionSheetProps) {
  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
    >
      <View style={styles.overlay}>
        <Pressable
          style={StyleSheet.absoluteFill}
          onPress={onClose}
          accessibilityRole="button"
          accessibilityLabel="Close attachment options"
        />
        <View style={styles.sheet}>
          <View style={styles.handle} />
          <Text style={styles.kicker}>{kicker}</Text>
          <Text style={styles.title}>{title}</Text>
          <Text style={styles.body}>{body}</Text>
          <View style={styles.optionStack}>
            <TouchableOpacity
              style={styles.option}
              activeOpacity={0.86}
              onPress={() => onSelect("images")}
              accessibilityLabel="Choose photo attachment"
            >
              <View style={styles.optionIcon}>
                <MaterialIcons name="image" size={22} color="#F7FAFF" />
              </View>
              <View style={styles.optionCopy}>
                <Text style={styles.optionTitle}>Photos</Text>
                <Text style={styles.optionBody}>Pick an image from this device.</Text>
              </View>
              <MaterialIcons name="chevron-right" size={22} color="#8E98AE" />
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.option}
              activeOpacity={0.86}
              onPress={() => onSelect("files")}
              accessibilityLabel="Choose file attachment"
            >
              <View style={styles.optionIcon}>
                <MaterialIcons name="description" size={22} color="#F7FAFF" />
              </View>
              <View style={styles.optionCopy}>
                <Text style={styles.optionTitle}>Files</Text>
                <Text style={styles.optionBody}>Attach documents, audio, or supported media.</Text>
              </View>
              <MaterialIcons name="chevron-right" size={22} color="#8E98AE" />
            </TouchableOpacity>
            {showPlatformStudio && onOpenPlatformStudio ? (
              <TouchableOpacity
                style={[styles.option, styles.platformOption]}
                activeOpacity={0.86}
                onPress={onOpenPlatformStudio}
                accessibilityLabel="Open Platform Studio for creator content"
              >
                <View style={[styles.optionIcon, styles.platformIcon]}>
                  <MaterialIcons name="video-library" size={22} color="#FFFFFF" />
                </View>
                <View style={styles.optionCopy}>
                  <Text style={styles.optionTitle}>Platform Studio</Text>
                  <Text style={styles.optionBody}>Create creator videos and public Platform content there.</Text>
                </View>
                <MaterialIcons name="chevron-right" size={22} color="#E9EEFF" />
              </TouchableOpacity>
            ) : null}
          </View>
          <TouchableOpacity
            style={styles.cancelButton}
            activeOpacity={0.84}
            onPress={onClose}
            accessibilityLabel="Cancel attachment options"
          >
            <Text style={styles.cancelText}>Cancel</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    justifyContent: "flex-end",
    backgroundColor: "rgba(0,0,0,0.58)",
  },
  sheet: {
    borderTopLeftRadius: 22,
    borderTopRightRadius: 22,
    borderWidth: 1,
    borderBottomWidth: 0,
    borderColor: "rgba(255,255,255,0.12)",
    backgroundColor: "#080B12",
    paddingHorizontal: 18,
    paddingTop: 12,
    paddingBottom: 24,
    gap: 12,
  },
  handle: {
    alignSelf: "center",
    width: 44,
    height: 4,
    borderRadius: 999,
    backgroundColor: "rgba(255,255,255,0.22)",
    marginBottom: 4,
  },
  kicker: {
    color: "#7F8BA3",
    fontSize: 10,
    fontWeight: "900",
    letterSpacing: 0,
  },
  title: {
    color: "#F7FAFF",
    fontSize: 22,
    fontWeight: "900",
  },
  body: {
    color: "#A7B1C6",
    fontSize: 13,
    lineHeight: 18,
    fontWeight: "700",
  },
  optionStack: {
    gap: 10,
  },
  option: {
    minHeight: 76,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.1)",
    backgroundColor: "rgba(255,255,255,0.055)",
    paddingHorizontal: 12,
    paddingVertical: 11,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  platformOption: {
    borderColor: "rgba(220,20,60,0.26)",
    backgroundColor: "rgba(220,20,60,0.12)",
  },
  optionIcon: {
    width: 42,
    height: 42,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(115,134,255,0.2)",
  },
  platformIcon: {
    backgroundColor: "rgba(220,20,60,0.72)",
  },
  optionCopy: {
    flex: 1,
    minWidth: 0,
    gap: 3,
  },
  optionTitle: {
    color: "#F7FAFF",
    fontSize: 14,
    fontWeight: "900",
  },
  optionBody: {
    color: "#9DA8BD",
    fontSize: 12,
    lineHeight: 16,
    fontWeight: "700",
  },
  cancelButton: {
    minHeight: 44,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255,255,255,0.08)",
  },
  cancelText: {
    color: "#E6ECFA",
    fontSize: 13,
    fontWeight: "900",
  },
});
