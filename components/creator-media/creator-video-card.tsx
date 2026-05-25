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
import {
  formatClipStudioTemplateLabel,
  type ClipStudioEdit,
  type ClipStudioTemplatePreset,
} from "../../_lib/clipStudio";
import { formatVodRenditionStatusSummary, getVodQualityPolicyCopy } from "../../_lib/vodQuality";

type CreatorVideoCardMode = "owner" | "public";

type CreatorVideoCardProps = {
  video: CreatorVideo;
  mode: CreatorVideoCardMode;
  clipEdit?: ClipStudioEdit | null;
  busy?: boolean;
  onOpen: () => void;
  onEdit?: () => void;
  onEditClip?: () => void;
  onToggleVisibility?: () => void;
  onDelete?: () => void;
  onShare?: () => void;
};

const formatVisibilityLabel = (video: CreatorVideo, ownerMode: boolean) => (
  video.visibility === "public" ? (ownerMode ? "Published" : "Public") : "Draft"
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

const FILE_EXTENSION_REGEX = /\.[a-z0-9]{2,5}$/i;
const TIMESTAMP_TITLE_REGEXES = [
  /^\d{8}[\s_.-]?\d{6}(?:\d{1,3})?$/i,
  /^\d{4}[\s_.-]?\d{2}[\s_.-]?\d{2}[\s_.-]?\d{2}[\s_.-]?\d{2}(?:[\s_.-]?\d{2})?$/i,
  /^(?:img|vid|video|mov|dsc|dscn|pxl|screenrecording|screen_recording|rp(?:replay)?_final)[\s_.-]*\d+/i,
];

const formatCreatorVideoDisplayTitle = (value: string) => {
  const originalTitle = String(value ?? "").trim();
  const withoutExtension = originalTitle.replace(FILE_EXTENSION_REGEX, "").trim();
  const cleanedTitle = withoutExtension
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  const titleForChecks = withoutExtension.replace(/\s+/g, "");
  const looksRaw = FILE_EXTENSION_REGEX.test(originalTitle)
    || TIMESTAMP_TITLE_REGEXES.some((regex) => regex.test(titleForChecks))
    || (/^[\d\s_.-]{6,}$/.test(withoutExtension) && /\d{6,}/.test(withoutExtension));

  if (!originalTitle) {
    return { displayTitle: "Creator Upload", rawTitleDetected: false };
  }

  if (looksRaw && (!cleanedTitle || /^[\d\s.-]+$/.test(cleanedTitle))) {
    return { displayTitle: "Creator Upload", rawTitleDetected: true };
  }

  return {
    displayTitle: cleanedTitle || "Creator Upload",
    rawTitleDetected: looksRaw,
  };
};

const formatPublicClipTemplateLabel = (
  preset: NonNullable<CreatorVideo["publicClipMetadata"]>["templatePreset"],
) => (
  preset ? formatClipStudioTemplateLabel(preset as ClipStudioTemplatePreset) : ""
);

export function CreatorVideoCard({
  video,
  mode,
  clipEdit,
  busy = false,
  onOpen,
  onEdit,
  onEditClip,
  onToggleVisibility,
  onDelete,
  onShare,
}: CreatorVideoCardProps) {
  const moderationLabel = formatModerationLabel(video);
  const fileSize = formatFileSize(video.fileSizeBytes);
  const updatedDate = formatDate(video.updatedAt || video.createdAt);
  const shareable = isCreatorVideoPubliclyShareable(video);
  const ownerMode = mode === "owner";
  const playable = ownerMode ? hasPlayableSource(video) : shareable;
  const ownerClipEdit = ownerMode ? clipEdit ?? null : null;
  const publicClipMetadata = !ownerMode && video.publicClipMetadata?.isPublic ? video.publicClipMetadata : null;
  const { displayTitle, rawTitleDetected } = formatCreatorVideoDisplayTitle(video.title);
  const moderationBlocked = video.moderationStatus === "hidden"
    || video.moderationStatus === "removed"
    || video.moderationStatus === "banned";
  const meta = [
    fileSize,
    updatedDate ? `Updated ${updatedDate}` : null,
    video.mimeType || null,
  ].filter(Boolean);
  const renditionStatusSummary = ownerMode ? formatVodRenditionStatusSummary(video.renditionStatuses) : "";
  const qualityPolicyCopy = ownerMode ? getVodQualityPolicyCopy() : null;
  const titleOverlayText = ownerClipEdit?.titleOverlayText.trim() ?? "";
  const titleOverlaySubtitle = ownerClipEdit?.titleOverlaySubtitle.trim() ?? "";
  const hasOwnerTitleOverlay = !!(titleOverlayText || titleOverlaySubtitle);
  const ownerTemplateLabel = ownerClipEdit ? formatClipStudioTemplateLabel(ownerClipEdit.templatePreset) : "";
  const publicTitleOverlayText = publicClipMetadata?.titleText.trim() ?? "";
  const publicTitleOverlaySubtitle = publicClipMetadata?.subtitleText.trim() ?? "";
  const hasPublicTitleOverlay = !!(publicTitleOverlayText || publicTitleOverlaySubtitle);
  const publicTemplateLabel = formatPublicClipTemplateLabel(publicClipMetadata?.templatePreset ?? null);

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
            <Text style={styles.fallbackKicker}>{"CHI'LLYWOOD CREATOR"}</Text>
            <Text style={styles.fallbackTitle} numberOfLines={2}>{displayTitle}</Text>
          </View>
        )}
        <View style={styles.previewShade} />
        <View style={styles.playPill}>
          <Text style={styles.playPillText}>{playable ? "Play" : "Source Missing"}</Text>
        </View>
        <View style={styles.badgeRow}>
          <View style={[styles.badge, video.visibility === "public" ? styles.badgePublic : styles.badgeDraft]}>
            <Text style={styles.badgeText}>{formatVisibilityLabel(video, ownerMode)}</Text>
          </View>
          <View style={[styles.badge, playable ? styles.badgeMediaReady : styles.badgeMediaUnavailable]}>
            <Text style={styles.badgeText}>{playable ? "Media Ready" : "Media Unavailable"}</Text>
          </View>
          {moderationLabel ? (
            <View style={[styles.badge, styles.badgeModeration]}>
              <Text style={styles.badgeText}>{moderationLabel}</Text>
            </View>
          ) : null}
          {ownerClipEdit ? (
            <View style={[styles.badge, styles.badgeTemplate]}>
              <Text style={styles.badgeText}>{ownerTemplateLabel}</Text>
            </View>
          ) : null}
          {publicTemplateLabel ? (
            <View style={[styles.badge, styles.badgeTemplate]}>
              <Text style={styles.badgeText}>{publicTemplateLabel}</Text>
            </View>
          ) : null}
        </View>
        {hasOwnerTitleOverlay ? (
          <View
            pointerEvents="none"
            style={[
              styles.ownerTitleOverlay,
              ownerClipEdit?.titleOverlayPosition === "top" && styles.ownerTitleOverlayTop,
              ownerClipEdit?.titleOverlayPosition === "center" && styles.ownerTitleOverlayCenter,
              ownerClipEdit?.titleOverlayStyle === "bold" && styles.ownerTitleOverlayBold,
              ownerClipEdit?.titleOverlayStyle === "spotlight" && styles.ownerTitleOverlaySpotlight,
              ownerClipEdit?.titleOverlayStyle === "trailer" && styles.ownerTitleOverlayTrailer,
            ]}
          >
            {titleOverlayText ? (
              <Text style={styles.ownerTitleOverlayText} numberOfLines={2}>{titleOverlayText}</Text>
            ) : null}
            {titleOverlaySubtitle ? (
              <Text style={styles.ownerTitleOverlaySubtitle} numberOfLines={2}>{titleOverlaySubtitle}</Text>
            ) : null}
          </View>
        ) : null}
        {hasPublicTitleOverlay ? (
          <View
            pointerEvents="none"
            style={[
              styles.publicTitleOverlay,
              publicClipMetadata?.titlePosition === "top" && styles.publicTitleOverlayTop,
              publicClipMetadata?.titlePosition === "center" && styles.publicTitleOverlayCenter,
              publicClipMetadata?.titleStyle === "bold" && styles.publicTitleOverlayBold,
              publicClipMetadata?.titleStyle === "spotlight" && styles.publicTitleOverlaySpotlight,
              publicClipMetadata?.titleStyle === "trailer" && styles.publicTitleOverlayTrailer,
            ]}
          >
            {publicTitleOverlayText ? (
              <Text style={styles.publicTitleOverlayText} numberOfLines={2}>{publicTitleOverlayText}</Text>
            ) : null}
            {publicTitleOverlaySubtitle ? (
              <Text style={styles.publicTitleOverlaySubtitle} numberOfLines={2}>{publicTitleOverlaySubtitle}</Text>
            ) : null}
          </View>
        ) : null}
      </TouchableOpacity>

      <View style={styles.body}>
        <Text style={styles.title} numberOfLines={2}>{displayTitle}</Text>
        <Text style={styles.description} numberOfLines={2}>
          {video.description || "Open this creator video in the Chi'llywood Player."}
        </Text>
        {meta.length ? (
          <Text style={styles.meta} numberOfLines={1}>{meta.join(" · ")}</Text>
        ) : null}
        {!playable ? (
          <Text style={styles.warning}>Media unavailable: this upload is missing a playable source.</Text>
        ) : null}
        {moderationBlocked ? (
          <Text style={styles.warning}>This video is unavailable publicly until moderation restores it.</Text>
        ) : null}
        {ownerMode && rawTitleDetected ? (
          <Text style={styles.ownerGuidance}>
            This title still looks like a file name. Tap Edit to rename it for viewers.
          </Text>
        ) : null}
        {ownerMode ? (
          <Text style={styles.ownerGuidance}>
            {`VOD ladder: ${renditionStatusSummary}. Free max ${qualityPolicyCopy?.freeMax}; Premium max ${qualityPolicyCopy?.premiumMax} when renditions exist.`}
          </Text>
        ) : null}
        {ownerClipEdit ? (
          <Text style={styles.ownerGuidance}>
            {`Clip Studio: ${hasOwnerTitleOverlay ? "Title Card" : "No Title Card"} · ${ownerTemplateLabel}`}
          </Text>
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
            {onEditClip ? (
              <TouchableOpacity style={styles.secondaryAction} activeOpacity={0.86} onPress={onEditClip}>
                <Text style={styles.secondaryActionText}>Edit Clip</Text>
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
    paddingBottom: 72,
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
  badgeMediaReady: {
    borderColor: "rgba(45,153,92,0.42)",
  },
  badgeMediaUnavailable: {
    borderColor: "rgba(255,116,116,0.4)",
  },
  badgeModeration: {
    borderColor: "rgba(242,194,91,0.5)",
  },
  badgeTemplate: {
    borderColor: "rgba(126,215,255,0.46)",
  },
  badgeText: {
    color: "#F8FAFF",
    fontSize: 10,
    fontWeight: "900",
    letterSpacing: 0.5,
  },
  ownerTitleOverlay: {
    position: "absolute",
    left: 14,
    right: 14,
    bottom: 58,
    borderRadius: 12,
    backgroundColor: "rgba(5,7,12,0.62)",
    paddingHorizontal: 10,
    paddingVertical: 8,
    gap: 2,
  },
  ownerTitleOverlayTop: {
    top: 58,
    bottom: undefined,
  },
  ownerTitleOverlayCenter: {
    top: "40%",
    bottom: undefined,
  },
  ownerTitleOverlayBold: {
    backgroundColor: "rgba(220,20,60,0.64)",
  },
  ownerTitleOverlaySpotlight: {
    backgroundColor: "rgba(8,12,18,0.74)",
    borderWidth: 1,
    borderColor: "rgba(242,194,91,0.4)",
  },
  ownerTitleOverlayTrailer: {
    backgroundColor: "rgba(3,4,8,0.8)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.32)",
  },
  ownerTitleOverlayText: {
    color: "#FFFFFF",
    fontSize: 16,
    lineHeight: 20,
    fontWeight: "900",
  },
  ownerTitleOverlaySubtitle: {
    color: "#DDE5F5",
    fontSize: 11,
    lineHeight: 15,
    fontWeight: "700",
  },
  publicTitleOverlay: {
    position: "absolute",
    left: 14,
    right: 14,
    bottom: 58,
    borderRadius: 10,
    backgroundColor: "rgba(5,7,12,0.64)",
    paddingHorizontal: 10,
    paddingVertical: 8,
    gap: 2,
  },
  publicTitleOverlayTop: {
    top: 58,
    bottom: undefined,
  },
  publicTitleOverlayCenter: {
    top: "40%",
    bottom: undefined,
  },
  publicTitleOverlayBold: {
    backgroundColor: "rgba(220,20,60,0.62)",
  },
  publicTitleOverlaySpotlight: {
    backgroundColor: "rgba(8,12,18,0.78)",
    borderWidth: 1,
    borderColor: "rgba(242,194,91,0.42)",
  },
  publicTitleOverlayTrailer: {
    backgroundColor: "rgba(3,4,8,0.82)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.3)",
  },
  publicTitleOverlayText: {
    color: "#FFFFFF",
    fontSize: 16,
    lineHeight: 20,
    fontWeight: "900",
  },
  publicTitleOverlaySubtitle: {
    color: "#DDE5F5",
    fontSize: 11,
    lineHeight: 15,
    fontWeight: "700",
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
  ownerGuidance: {
    color: "#B7C2D8",
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
