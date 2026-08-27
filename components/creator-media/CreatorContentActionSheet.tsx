import React from "react";
import {
  ActivityIndicator,
  Alert,
  Modal,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import type { CreatorVideo } from "../../_lib/creatorVideos";
import { isCreatorVideoPubliclyShareable } from "../../_lib/creatorVideoLinks";
import { AppText } from "../ui/typography";

export type CreatorContentActionSheetVisibilityAction = "draft" | "circle" | "public";

export type CreatorContentActionSheetProps = {
  visible: boolean;
  video: CreatorVideo | null;
  busy?: boolean;
  isFeatured?: boolean;
  onClose: () => void;
  onOpenPlayer: (video: CreatorVideo) => void;
  onEditDetails: (video: CreatorVideo) => void;
  onSetVisibility: (video: CreatorVideo, visibility: CreatorContentActionSheetVisibilityAction) => void;
  onSetPrice: (video: CreatorVideo) => void;
  onSetVipAccess?: (video: CreatorVideo, required: boolean) => void;
  onCreateEvent: (video: CreatorVideo) => void;
  onFeature: (video: CreatorVideo) => void;
  onShare: (video: CreatorVideo) => void;
  onDelete: (video: CreatorVideo) => void;
  onViewAnalytics?: (video: CreatorVideo) => void;
};

const isModerationBlocked = (video: CreatorVideo) => (
  video.moderationStatus === "hidden"
  || video.moderationStatus === "removed"
  || video.moderationStatus === "banned"
);

const hasPlayableSource = (video: CreatorVideo) => !!(video.playbackUrl || video.storagePath);

export function CreatorContentActionSheet({
  visible,
  video,
  busy = false,
  isFeatured = false,
  onClose,
  onOpenPlayer,
  onEditDetails,
  onSetVisibility,
  onSetPrice,
  onSetVipAccess,
  onCreateEvent,
  onFeature,
  onShare,
  onDelete,
  onViewAnalytics,
}: CreatorContentActionSheetProps) {
  const insets = useSafeAreaInsets();
  const shareable = video ? isCreatorVideoPubliclyShareable(video) : false;
  const blocked = video ? isModerationBlocked(video) : false;
  const playable = video ? hasPlayableSource(video) : false;
  const canFeaturePublicly = !!video && video.visibility === "public" && !blocked && playable;

  const run = (handler: (selected: CreatorVideo) => void) => {
    if (!video || busy) return;
    handler(video);
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={() => {
        if (!busy) onClose();
      }}
    >
      <View style={styles.backdrop}>
        <TouchableOpacity
          style={styles.dismiss}
          activeOpacity={1}
          disabled={busy}
          onPress={onClose}
          accessibilityRole="button"
          accessibilityLabel="Close creator content actions"
        />
        <View style={[styles.sheet, { paddingBottom: Math.max(18, insets.bottom + 12) }]}>
          <View style={styles.handle} />
          <AppText scale="caption" style={styles.kicker}>Platform content</AppText>
          <AppText scale="title3" style={styles.title} numberOfLines={2}>
            {video?.title || "Creator content"}
          </AppText>
          <AppText scale="footnote" style={styles.body}>
            Owner actions apply only to this content item. Drafts stay owner-only, Chi’lly Circle content stays member-only, and public content stays eligible only where backed.
          </AppText>

          <ScrollView style={styles.actionScroll} contentContainerStyle={styles.actionList}>
            <SheetAction label="Open in Player" disabled={!video || !playable || busy} onPress={() => run(onOpenPlayer)} />
            <SheetAction label="Edit details" disabled={!video || busy} onPress={() => run(onEditDetails)} />
            <SheetAction label="Save as Draft" disabled={!video || busy || video.visibility === "draft"} onPress={() => run((selected) => onSetVisibility(selected, "draft"))} />
            <SheetAction
              label="Make Private for Chi'lly Circle"
              disabled={!video || busy || video.visibility === "circle" || blocked}
              detail={blocked ? "Unavailable while moderation blocks this video" : undefined}
              onPress={() => run((selected) => onSetVisibility(selected, "circle"))}
            />
            <SheetAction label="Make Public" disabled={!video || busy || video.visibility === "public" || blocked} onPress={() => run((selected) => onSetVisibility(selected, "public"))} />
            {onSetVipAccess ? (
              <SheetAction
                label={video?.vipAccessRequired ? "Remove from VIP shelf" : "Add to VIP shelf"}
                disabled={!video || busy || (!video.vipAccessRequired && video.visibility !== "public")}
                detail={!video?.vipAccessRequired && video?.visibility !== "public" ? "Make this video Public first" : "VIP replaces per-video paid unlock for this item"}
                onPress={() => run((selected) => onSetVipAccess(selected, !selected.vipAccessRequired))}
              />
            ) : null}
            <SheetAction label="Set price / manage paid unlock" disabled={!video || busy || video.vipAccessRequired} detail={video?.vipAccessRequired ? "Remove VIP access first; VIP and per-video purchase are separate tiers" : undefined} onPress={() => run(onSetPrice)} />
            <SheetAction label="Create Event from this content" disabled={!video || busy} onPress={() => run(onCreateEvent)} />
            <SheetAction
              label={isFeatured ? "Featured on Platform" : "Feature on Platform"}
              disabled={!video || busy || isFeatured || !canFeaturePublicly}
              detail={!canFeaturePublicly ? "Requires a public, playable, safe video" : undefined}
              onPress={() => run(onFeature)}
            />
            <SheetAction label="Copy/share link" disabled={!video || busy || !shareable} onPress={() => run(onShare)} />
            {onViewAnalytics ? (
              <SheetAction label="View analytics" disabled={!video || busy} onPress={() => run(onViewAnalytics)} />
            ) : null}
            <SheetAction label="Delete" danger disabled={!video || busy} onPress={() => run(onDelete)} />
          </ScrollView>

          <TouchableOpacity
            style={[styles.cancelButton, busy && styles.disabledButton]}
            activeOpacity={0.86}
            disabled={busy}
            onPress={onClose}
            accessibilityRole="button"
            accessibilityLabel="Close creator content actions"
          >
            {busy ? <ActivityIndicator color="#fff" /> : <AppText scale="footnote" style={styles.cancelText}>Cancel</AppText>}
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

function SheetAction({
  label,
  detail,
  danger = false,
  disabled = false,
  onPress,
}: {
  label: string;
  detail?: string;
  danger?: boolean;
  disabled?: boolean;
  onPress: () => void;
}) {
  return (
    <TouchableOpacity
      style={[styles.actionButton, danger && styles.dangerButton]}
      activeOpacity={0.86}
      onPress={disabled
        ? () => Alert.alert("Action status", detail || `${label} needs a playable content item, a different current state, or the backed permission before it can run.`)
        : onPress}
      hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
      accessibilityRole="button"
      accessibilityLabel={detail ? `${label}. ${detail}` : label}
      accessibilityState={{ disabled: false }}
    >
      <AppText scale="footnote" style={[styles.actionText, danger && styles.dangerText]} numberOfLines={2}>{label}</AppText>
      {detail ? <AppText scale="caption" style={styles.actionDetail} numberOfLines={2}>{detail}</AppText> : null}
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    justifyContent: "flex-end",
    backgroundColor: "rgba(0,0,0,0.58)",
  },
  dismiss: {
    ...StyleSheet.absoluteFillObject,
  },
  sheet: {
    maxHeight: "88%",
    width: "100%",
    borderTopLeftRadius: 22,
    borderTopRightRadius: 22,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.14)",
    backgroundColor: "#0B1018",
    paddingHorizontal: 16,
    paddingTop: 10,
    gap: 9,
  },
  handle: {
    alignSelf: "center",
    width: 42,
    height: 4,
    borderRadius: 999,
    backgroundColor: "rgba(255,255,255,0.24)",
    marginBottom: 4,
  },
  kicker: {
    color: "#7ED7FF",
    fontSize: 11,
    fontWeight: "900",
  },
  title: {
    color: "#F8FAFF",
    fontSize: 21,
    lineHeight: 26,
    fontWeight: "900",
  },
  body: {
    color: "#AEB9CF",
    fontSize: 12.5,
    lineHeight: 18,
    fontWeight: "700",
  },
  actionScroll: {
    maxHeight: 470,
  },
  actionList: {
    gap: 8,
    paddingVertical: 4,
  },
  actionButton: {
    minHeight: 50,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.12)",
    backgroundColor: "rgba(255,255,255,0.075)",
    justifyContent: "center",
    paddingHorizontal: 13,
    paddingVertical: 9,
  },
  dangerButton: {
    borderColor: "rgba(255,92,122,0.38)",
    backgroundColor: "rgba(220,20,60,0.18)",
  },
  disabledButton: {
    opacity: 0.48,
  },
  actionText: {
    color: "#FFFFFF",
    fontSize: 13,
    lineHeight: 17,
    fontWeight: "900",
  },
  dangerText: {
    color: "#FFD7DE",
  },
  actionDetail: {
    color: "#8F9BB2",
    fontSize: 11,
    lineHeight: 15,
    fontWeight: "700",
    marginTop: 2,
  },
  cancelButton: {
    minHeight: 48,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#DC143C",
  },
  cancelText: {
    color: "#FFFFFF",
    fontSize: 13,
    fontWeight: "900",
  },
});
