import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import React from "react";
import {
  ActivityIndicator,
  Image,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";

import type { ProfileAppearanceFitMode } from "../../_lib/userData";

type ProfileSheetOptionProps = {
  icon: keyof typeof MaterialIcons.glyphMap;
  title: string;
  body?: string;
  tone?: "default" | "danger" | "muted";
  disabled?: boolean;
  busy?: boolean;
  compact?: boolean;
  showChevron?: boolean;
  onPress: () => void;
  testID?: string;
};

type ProfileAppearanceSheetProps = {
  visible: boolean;
  kind: "avatar" | "background";
  imageUrl?: string;
  fitMode?: ProfileAppearanceFitMode;
  busy?: boolean;
  onView: () => void;
  onChoose: () => void;
  onRemove: () => void;
  onSelectFitMode: (fitMode: ProfileAppearanceFitMode) => void;
  onClose: () => void;
};

type ProfileActionsSheetProps = {
  visible: boolean;
  displayName: string;
  hasPhoto?: boolean;
  hasBackground?: boolean;
  blocked?: boolean;
  busy?: boolean;
  onViewPhoto: () => void;
  onChat: () => void;
  onViewPlatform: () => void;
  onBlock: () => void;
  onReport: () => void;
  onReportPhoto?: () => void;
  onReportBackground?: () => void;
  onShare: () => void;
  onClose: () => void;
};

type ProfileImagePreviewSheetProps = {
  visible: boolean;
  title: string;
  imageUrl?: string;
  fitMode?: ProfileAppearanceFitMode;
  onClose: () => void;
};

const fitLabels: Record<ProfileAppearanceFitMode, string> = {
  fill: "Fill",
  fit: "Fit",
  center: "Center",
};

const resizeModeForFit = (fitMode?: ProfileAppearanceFitMode) => {
  if (fitMode === "fit") return "contain" as const;
  if (fitMode === "center") return "center" as const;
  return "cover" as const;
};

function ProfileSheetOption({
  icon,
  title,
  body,
  tone = "default",
  disabled = false,
  busy = false,
  compact = false,
  showChevron = true,
  onPress,
  testID,
}: ProfileSheetOptionProps) {
  return (
    <TouchableOpacity
      testID={testID}
      style={[
        styles.option,
        compact && styles.optionCompact,
        tone === "danger" && styles.optionDanger,
        tone === "muted" && styles.optionMuted,
        disabled && styles.optionDisabled,
      ]}
      activeOpacity={0.86}
      onPress={onPress}
      disabled={disabled || busy}
      accessibilityRole="button"
      accessibilityLabel={title}
    >
      <View
        style={[
          styles.optionIcon,
          compact && styles.optionIconCompact,
          tone === "danger" && styles.optionIconDanger,
        ]}
      >
        {busy ? (
          <ActivityIndicator color="#F7FAFF" size="small" />
        ) : (
          <MaterialIcons name={icon} size={21} color="#F7FAFF" />
        )}
      </View>
      <View style={styles.optionCopy}>
        <Text
          style={[
            styles.optionTitle,
            compact && styles.optionTitleCompact,
            tone === "danger" && styles.optionTitleDanger,
          ]}
        >
          {title}
        </Text>
        {body ? <Text style={styles.optionBody}>{body}</Text> : null}
      </View>
      {showChevron ? (
        <MaterialIcons name="chevron-right" size={22} color="#8E98AE" />
      ) : null}
    </TouchableOpacity>
  );
}

export function ProfileAppearanceSheet({
  visible,
  kind,
  imageUrl,
  fitMode = "fill",
  busy = false,
  onView,
  onChoose,
  onRemove,
  onSelectFitMode,
  onClose,
}: ProfileAppearanceSheetProps) {
  const isAvatar = kind === "avatar";
  const hasImage = Boolean(imageUrl);
  const title = isAvatar ? "Profile Photo" : "Profile Background";
  const chooseLabel = isAvatar ? "Change Photo" : "Change Background";

  if (isAvatar) {
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
            onPress={busy ? undefined : onClose}
          />
          <View
            style={[styles.sheet, styles.actionSheet]}
            testID="profile-photo-action-sheet"
          >
            <View style={styles.handle} />
            <Text style={styles.actionTitle}>{title}</Text>

            <View style={styles.optionStack}>
              <ProfileSheetOption
                testID="profile-avatar-choose-action"
                icon="photo-library"
                title={chooseLabel}
                busy={busy}
                compact
                showChevron={false}
                onPress={onChoose}
              />
              {hasImage ? (
                <ProfileSheetOption
                  testID="profile-avatar-remove-action"
                  icon="delete-outline"
                  title="Remove Photo"
                  tone="danger"
                  busy={busy}
                  compact
                  showChevron={false}
                  onPress={onRemove}
                />
              ) : null}
            </View>

            <TouchableOpacity
              style={styles.cancelButton}
              activeOpacity={0.84}
              disabled={busy}
              onPress={onClose}
            >
              <Text style={styles.cancelText}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    );
  }

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
          onPress={busy ? undefined : onClose}
        />
        <View
          style={[styles.sheet, styles.actionSheet]}
          testID="profile-background-action-sheet"
        >
          <View style={styles.handle} />
          <Text style={styles.actionTitle}>{title}</Text>
          <Text style={styles.actionBody}>
            Platform branding stays in Brand Studio.
          </Text>

          <View style={styles.optionStack}>
            <ProfileSheetOption
              testID="profile-background-choose-action"
              icon="photo-library"
              title={chooseLabel}
              busy={busy}
              compact
              showChevron={false}
              onPress={onChoose}
            />
            {hasImage ? (
              <>
                <ProfileSheetOption
                  testID="profile-background-view-action"
                  icon="visibility"
                  title="View Background"
                  compact
                  showChevron={false}
                  onPress={onView}
                />
                <View
                  style={styles.adjustBlock}
                  testID="profile-background-adjust-section"
                >
                  <View style={styles.previewRowCompact}>
                    <View style={styles.backgroundPreview}>
                      <Image
                        source={{ uri: imageUrl }}
                        style={styles.previewImage}
                        resizeMode={resizeModeForFit(fitMode)}
                      />
                    </View>
                    <View style={styles.previewCopy}>
                      <Text style={styles.previewTitle}>Adjust Background</Text>
                      <Text style={styles.previewBody}>
                        Keep the Profile header readable.
                      </Text>
                    </View>
                  </View>

                  <View
                    style={styles.fitRow}
                    testID="profile-background-adjust-fit-controls"
                  >
                    {(["fill", "fit", "center"] as const).map((mode) => {
                      const active = fitMode === mode;
                      return (
                        <TouchableOpacity
                          key={mode}
                          style={[
                            styles.fitChip,
                            active && styles.fitChipActive,
                            busy && styles.optionDisabled,
                          ]}
                          activeOpacity={0.84}
                          disabled={busy}
                          onPress={() => onSelectFitMode(mode)}
                        >
                          <Text
                            style={[
                              styles.fitChipText,
                              active && styles.fitChipTextActive,
                            ]}
                          >
                            {fitLabels[mode]}
                          </Text>
                        </TouchableOpacity>
                      );
                    })}
                  </View>
                </View>
                <ProfileSheetOption
                  testID="profile-background-remove-action"
                  icon="delete-outline"
                  title="Remove Background"
                  tone="danger"
                  busy={busy}
                  compact
                  showChevron={false}
                  onPress={onRemove}
                />
              </>
            ) : null}
          </View>

          <TouchableOpacity
            style={styles.cancelButton}
            activeOpacity={0.84}
            disabled={busy}
            onPress={onClose}
          >
            <Text style={styles.cancelText}>Cancel</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

export function ProfileActionsSheet({
  visible,
  displayName,
  hasPhoto = false,
  hasBackground = false,
  blocked = false,
  busy = false,
  onViewPhoto,
  onChat,
  onViewPlatform,
  onBlock,
  onReport,
  onReportPhoto,
  onReportBackground,
  onShare,
  onClose,
}: ProfileActionsSheetProps) {
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
          onPress={busy ? undefined : onClose}
        />
        <View style={styles.sheet}>
          <View style={styles.handle} />
          <Text style={styles.kicker}>PROFILE ACTIONS</Text>
          <Text style={styles.title}>Profile Actions</Text>
          <Text style={styles.body}>
            {displayName
              ? `Actions for ${displayName}.`
              : "Choose a safe Profile action."}
          </Text>
          <View style={styles.optionStack}>
            <ProfileSheetOption
              testID="profile-actions-view-photo"
              icon="visibility"
              title="View Profile Photo"
              body={
                hasPhoto
                  ? "Open a larger preview."
                  : "No profile photo to preview yet."
              }
              tone={hasPhoto ? "default" : "muted"}
              disabled={!hasPhoto}
              onPress={onViewPhoto}
            />
            <ProfileSheetOption
              testID="profile-actions-chat"
              icon="forum"
              title="Chi'lly Chat"
              body="Open messaging when privacy allows."
              onPress={onChat}
            />
            <ProfileSheetOption
              testID="profile-actions-platform"
              icon="smart-display"
              title="View Platform"
              body="Open the public Platform view."
              onPress={onViewPlatform}
            />
            <ProfileSheetOption
              testID="profile-actions-block"
              icon="block"
              title={blocked ? "User Blocked" : "Block User"}
              body={
                blocked
                  ? "Messaging and social actions are already restricted."
                  : "Requires confirmation before blocking."
              }
              tone="danger"
              disabled={blocked}
              busy={busy}
              onPress={onBlock}
            />
            <ProfileSheetOption
              testID="profile-actions-report"
              icon="outlined-flag"
              title="Report User"
              body="Send a safety report."
              onPress={onReport}
            />
            {hasPhoto && onReportPhoto ? (
              <ProfileSheetOption
                testID="profile-actions-report-photo"
                icon="report"
                title="Report Profile Photo"
                body="Report this photo without hiding it automatically."
                onPress={onReportPhoto}
              />
            ) : null}
            {hasBackground && onReportBackground ? (
              <ProfileSheetOption
                testID="profile-actions-report-background"
                icon="report"
                title="Report Profile Background"
                body="Report this background without hiding it automatically."
                onPress={onReportBackground}
              />
            ) : null}
            <ProfileSheetOption
              testID="profile-actions-share"
              icon="ios-share"
              title="Share Profile"
              body="Share a public-safe Profile link."
              onPress={onShare}
            />
          </View>
          <TouchableOpacity
            style={styles.cancelButton}
            activeOpacity={0.84}
            disabled={busy}
            onPress={onClose}
          >
            <Text style={styles.cancelText}>Cancel</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

export function ProfileImagePreviewSheet({
  visible,
  title,
  imageUrl,
  fitMode = "fill",
  onClose,
}: ProfileImagePreviewSheetProps) {
  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
    >
      <View style={styles.previewOverlay}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
        <View style={styles.previewSheet}>
          <View style={styles.handle} />
          <Text style={styles.kicker}>PROFILE PREVIEW</Text>
          <Text style={styles.title}>{title}</Text>
          <View style={styles.largePreview}>
            {imageUrl ? (
              <Image
                source={{ uri: imageUrl }}
                style={styles.previewImage}
                resizeMode={resizeModeForFit(fitMode)}
              />
            ) : (
              <MaterialIcons name="person" size={44} color="#DCE5F5" />
            )}
          </View>
          <TouchableOpacity
            style={styles.cancelButton}
            activeOpacity={0.84}
            onPress={onClose}
          >
            <Text style={styles.cancelText}>Close</Text>
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
  previewOverlay: {
    flex: 1,
    justifyContent: "flex-end",
    backgroundColor: "rgba(0,0,0,0.72)",
  },
  sheet: {
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    borderWidth: 1,
    borderBottomWidth: 0,
    borderColor: "rgba(255,255,255,0.12)",
    backgroundColor: "#080B12",
    paddingHorizontal: 18,
    paddingTop: 12,
    paddingBottom: 24,
    gap: 12,
  },
  actionSheet: {
    paddingBottom: 18,
    gap: 10,
  },
  previewSheet: {
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
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
  actionTitle: {
    color: "#F7FAFF",
    fontSize: 20,
    fontWeight: "900",
  },
  body: {
    color: "#A7B1C6",
    fontSize: 13,
    lineHeight: 18,
    fontWeight: "700",
  },
  actionBody: {
    color: "#A7B1C6",
    fontSize: 12,
    lineHeight: 17,
    fontWeight: "700",
  },
  previewRow: {
    minHeight: 88,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.1)",
    backgroundColor: "rgba(255,255,255,0.045)",
    padding: 10,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  previewRowCompact: {
    minHeight: 76,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  avatarPreview: {
    width: 68,
    height: 68,
    borderRadius: 34,
    overflow: "hidden",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255,255,255,0.08)",
  },
  backgroundPreview: {
    width: 112,
    height: 66,
    borderRadius: 14,
    overflow: "hidden",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255,255,255,0.08)",
  },
  previewFallback: {
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.1)",
  },
  previewImage: {
    width: "100%",
    height: "100%",
  },
  previewCopy: {
    flex: 1,
    minWidth: 0,
    gap: 3,
  },
  previewTitle: {
    color: "#F4F7FF",
    fontSize: 14,
    fontWeight: "900",
  },
  previewBody: {
    color: "#98A4BA",
    fontSize: 12,
    lineHeight: 17,
    fontWeight: "700",
  },
  fitRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  adjustBlock: {
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.1)",
    backgroundColor: "rgba(255,255,255,0.045)",
    padding: 10,
    gap: 10,
  },
  fitChip: {
    minHeight: 36,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.1)",
    backgroundColor: "rgba(255,255,255,0.055)",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 14,
  },
  fitChipActive: {
    borderColor: "rgba(115,134,255,0.34)",
    backgroundColor: "rgba(115,134,255,0.16)",
  },
  fitChipText: {
    color: "#C8D2E4",
    fontSize: 12,
    fontWeight: "900",
  },
  fitChipTextActive: {
    color: "#EEF2FF",
  },
  optionStack: {
    gap: 10,
  },
  option: {
    minHeight: 72,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.1)",
    backgroundColor: "rgba(255,255,255,0.055)",
    paddingHorizontal: 12,
    paddingVertical: 10,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  optionCompact: {
    minHeight: 56,
    borderRadius: 14,
    paddingVertical: 8,
  },
  optionDanger: {
    borderColor: "rgba(220,20,60,0.26)",
    backgroundColor: "rgba(220,20,60,0.11)",
  },
  optionMuted: {
    opacity: 0.78,
  },
  optionDisabled: {
    opacity: 0.52,
  },
  optionIcon: {
    width: 42,
    height: 42,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(115,134,255,0.2)",
  },
  optionIconCompact: {
    width: 36,
    height: 36,
    borderRadius: 12,
  },
  optionIconDanger: {
    backgroundColor: "rgba(220,20,60,0.32)",
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
  optionTitleCompact: {
    fontSize: 14,
  },
  optionTitleDanger: {
    color: "#FFE4EA",
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
  largePreview: {
    width: "100%",
    aspectRatio: 1,
    maxHeight: 420,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.12)",
    backgroundColor: "rgba(255,255,255,0.06)",
    overflow: "hidden",
    alignItems: "center",
    justifyContent: "center",
  },
});
