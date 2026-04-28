import React from "react";
import {
  Image,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";

import type { CreatorVideo } from "../../_lib/creatorVideos";
import { isCreatorVideoPubliclyShareable } from "../../_lib/creatorVideoLinks";

type CreatorVideoCardMode = "owner" | "public";

type CreatorVideoCardProps = {
  video: CreatorVideo;
  mode: CreatorVideoCardMode;
  busy?: boolean;
  onOpen: () => void;
  onEdit?: () => void;
  onToggleVisibility?: () => void;
  onDelete?: () => void;
  onShare?: () => void;
};

const formatVisibilityLabel = (video: CreatorVideo) => (
  video.visibility === "public" ? "Public" : "Draft"
);

const formatModerationLabel = (video: CreatorVideo) => {
  switch (video.moderationStatus) {
    case "pending_review":
      return "Under Review";
    case "reported":
      return "Reported";
    case "hidden":
      return "Hidden";
    case "removed":
      return "Removed";
    case "banned":
      return "Unavailable";
    default:
      return null;
  }
};

const formatFileSize = (bytes: number | null) => {
  if (!bytes || !Number.isFinite(bytes)) return null;
  const megabytes = bytes / 1024 / 1024;
  if (megabytes >= 1) return `${Math.round(megabytes)} MB`;
  return `${Math.max(1, Math.round(bytes / 1024))} KB`;
};

const formatDate = (value: string) => {
  const timestamp = Date.parse(value);
  if (!Number.isFinite(timestamp)) return null;
  return new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric", year: "numeric" }).format(new Date(timestamp));
};

const hasPlayableSource = (video: CreatorVideo) => !!(video.playbackUrl || video.storagePath);

export function CreatorVideoCard({
  video,
  mode,
  busy = false,
  onOpen,
  onEdit,
  onToggleVisibility,
  onDelete,
  onShare,
}: CreatorVideoCardProps) {
  const moderationLabel = formatModerationLabel(video);
  const fileSize = formatFileSize(video.fileSizeBytes);
  const updatedDate = formatDate(video.updatedAt || video.createdAt);
  const playable = hasPlayableSource(video);
  const shareable = isCreatorVideoPubliclyShareable(video);
  const ownerMode = mode === "owner";
  const moderationBlocked = video.moderationStatus === "hidden"
    || video.moderationStatus === "removed"
    || video.moderationStatus === "banned";
  const meta = [
    fileSize,
    updatedDate ? `Updated ${updatedDate}` : null,
    video.mimeType || null,
  ].filter(Boolean);

  return (
    <View style={[styles.card, !playable && styles.cardUnavailable]}>
      <TouchableOpacity
        style={styles.preview}
        activeOpacity={0.88}
        onPress={onOpen}
        disabled={!playable}
      >
        {video.thumbnailUrl ? (
          <Image source={{ uri: video.thumbnailUrl }} style={styles.thumbnail} />
        ) : (
          <View style={styles.fallbackPreview}>
            <Text style={styles.fallbackKicker}>{"CHI'LLYWOOD"}</Text>
            <Text style={styles.fallbackTitle} numberOfLines={2}>{video.title}</Text>
          </View>
        )}
        <View style={styles.previewShade} />
        <View style={styles.playPill}>
          <Text style={styles.playPillText}>{playable ? "Play" : "Source Missing"}</Text>
        </View>
        <View style={styles.badgeRow}>
          <View style={[styles.badge, video.visibility === "public" ? styles.badgePublic : styles.badgeDraft]}>
            <Text style={styles.badgeText}>{formatVisibilityLabel(video)}</Text>
          </View>
          {moderationLabel ? (
            <View style={[styles.badge, styles.badgeModeration]}>
              <Text style={styles.badgeText}>{moderationLabel}</Text>
            </View>
          ) : null}
        </View>
      </TouchableOpacity>

      <View style={styles.body}>
        <Text style={styles.title} numberOfLines={2}>{video.title}</Text>
        <Text style={styles.description} numberOfLines={2}>
          {video.description || "Open this creator video in the Chi'llywood Player."}
        </Text>
        {meta.length ? (
          <Text style={styles.meta} numberOfLines={1}>{meta.join(" · ")}</Text>
        ) : null}
        {!playable ? (
          <Text style={styles.warning}>This upload is missing a playable source.</Text>
        ) : null}
        {moderationBlocked ? (
          <Text style={styles.warning}>This video is unavailable publicly until moderation restores it.</Text>
        ) : null}

        {ownerMode ? (
          <View style={styles.actionGrid}>
            <TouchableOpacity style={styles.primaryAction} activeOpacity={0.86} onPress={onOpen} disabled={!playable}>
              <Text style={styles.primaryActionText}>Open Player</Text>
            </TouchableOpacity>
            {onEdit ? (
              <TouchableOpacity style={styles.secondaryAction} activeOpacity={0.86} onPress={onEdit}>
                <Text style={styles.secondaryActionText}>Edit</Text>
              </TouchableOpacity>
            ) : null}
            {onToggleVisibility ? (
              <TouchableOpacity
                style={[styles.secondaryAction, (busy || moderationBlocked) && styles.actionDisabled]}
                activeOpacity={0.86}
                onPress={onToggleVisibility}
                disabled={busy || moderationBlocked}
              >
                <Text style={styles.secondaryActionText}>{video.visibility === "public" ? "Unpublish" : "Publish"}</Text>
              </TouchableOpacity>
            ) : null}
            {onDelete ? (
              <TouchableOpacity
                style={[styles.secondaryAction, busy && styles.actionDisabled]}
                activeOpacity={0.86}
                onPress={onDelete}
                disabled={busy}
              >
                <Text style={styles.secondaryActionText}>Delete</Text>
              </TouchableOpacity>
            ) : null}
          </View>
        ) : (
          <View style={styles.publicActions}>
            <TouchableOpacity style={styles.primaryAction} activeOpacity={0.86} onPress={onOpen} disabled={!playable}>
              <Text style={styles.primaryActionText}>Watch</Text>
            </TouchableOpacity>
            {onShare && shareable ? (
              <TouchableOpacity style={styles.secondaryAction} activeOpacity={0.86} onPress={onShare}>
                <Text style={styles.secondaryActionText}>Share</Text>
              </TouchableOpacity>
            ) : null}
          </View>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: 18,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.12)",
    backgroundColor: "rgba(8,10,16,0.96)",
    overflow: "hidden",
  },
  cardUnavailable: {
    borderColor: "rgba(255,255,255,0.08)",
    opacity: 0.92,
  },
  preview: {
    minHeight: 168,
    backgroundColor: "#080A10",
  },
  thumbnail: {
    ...StyleSheet.absoluteFillObject,
    width: "100%",
    height: "100%",
    resizeMode: "cover",
  },
  fallbackPreview: {
    minHeight: 168,
    padding: 18,
    justifyContent: "flex-end",
    backgroundColor: "#10141E",
  },
  fallbackKicker: {
    color: "#7F8AA2",
    fontSize: 10,
    fontWeight: "900",
    letterSpacing: 1.2,
  },
  fallbackTitle: {
    color: "#F4F7FC",
    fontSize: 23,
    lineHeight: 28,
    fontWeight: "900",
    marginTop: 4,
  },
  previewShade: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0,0,0,0.2)",
  },
  playPill: {
    position: "absolute",
    left: 14,
    bottom: 14,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.18)",
    backgroundColor: "rgba(220,20,60,0.86)",
    paddingHorizontal: 13,
    paddingVertical: 8,
  },
  playPillText: {
    color: "#fff",
    fontSize: 12,
    fontWeight: "900",
  },
  badgeRow: {
    position: "absolute",
    top: 12,
    left: 12,
    right: 12,
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  badge: {
    borderRadius: 999,
    borderWidth: 1,
    paddingHorizontal: 10,
    paddingVertical: 6,
    backgroundColor: "rgba(0,0,0,0.5)",
  },
  badgePublic: {
    borderColor: "rgba(45,153,92,0.5)",
  },
  badgeDraft: {
    borderColor: "rgba(115,134,255,0.42)",
  },
  badgeModeration: {
    borderColor: "rgba(242,194,91,0.5)",
  },
  badgeText: {
    color: "#F8FAFF",
    fontSize: 10,
    fontWeight: "900",
    letterSpacing: 0.5,
  },
  body: {
    padding: 14,
    gap: 8,
  },
  title: {
    color: "#F7F9FF",
    fontSize: 17,
    lineHeight: 22,
    fontWeight: "900",
  },
  description: {
    color: "#AEB8CB",
    fontSize: 12.5,
    lineHeight: 18,
    fontWeight: "600",
  },
  meta: {
    color: "#778399",
    fontSize: 11,
    fontWeight: "800",
  },
  warning: {
    color: "#FFD8A8",
    fontSize: 11.5,
    lineHeight: 16,
    fontWeight: "800",
  },
  actionGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    marginTop: 2,
  },
  publicActions: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    marginTop: 2,
  },
  primaryAction: {
    borderRadius: 999,
    backgroundColor: "#DC143C",
    paddingHorizontal: 13,
    paddingVertical: 9,
  },
  primaryActionText: {
    color: "#fff",
    fontSize: 12,
    fontWeight: "900",
  },
  secondaryAction: {
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.14)",
    backgroundColor: "rgba(255,255,255,0.06)",
    paddingHorizontal: 13,
    paddingVertical: 9,
  },
  secondaryActionText: {
    color: "#D9E0EF",
    fontSize: 12,
    fontWeight: "800",
  },
  actionDisabled: {
    opacity: 0.45,
  },
});
