import React from "react";
import {
  StyleSheet,
  TouchableOpacity,
  View,
} from "react-native";

import type { CreatorVideo } from "../../_lib/creatorVideos";
import { isCreatorVideoPubliclyShareable } from "../../_lib/creatorVideoLinks";
import { RACHI_OFFICIAL_USER_ID } from "../../_lib/officialAccounts";
import {
  formatClipStudioTemplateLabel,
  type ClipStudioEdit,
  type ClipStudioTemplatePreset,
} from "../../_lib/clipStudio";
import { StableImage } from "../ui/StableImage";
import { AppText } from "../ui/typography";

type CreatorVideoCardMode = "owner" | "public";

type CreatorVideoCardProps = {
  video: CreatorVideo;
  mode: CreatorVideoCardMode;
  clipEdit?: ClipStudioEdit | null;
  featured?: boolean;
  accessLabel?: string | null;
  busy?: boolean;
  onOpen: () => void;
  onEdit?: () => void;
  onEditClip?: () => void;
  onSetFeatured?: () => void;
  onClearFeatured?: () => void;
  onToggleVisibility?: () => void;
  onDelete?: () => void;
  onShare?: () => void;
  onOpenActions?: () => void;
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

const formatOwnerPlaybackStatus = (video: CreatorVideo) => {
  if (!video.renditionStatuses.length) {
    return "Playback is ready. Background processing can finish automatically when available.";
  }
  const hasFailed = video.renditionStatuses.some((item) => item.status === "failed");
  const hasWorking = video.renditionStatuses.some((item) => item.status === "queued" || item.status === "processing");
  if (hasFailed) return "Playback is available. One background version needs attention.";
  if (hasWorking) return "Playback is available. Background versions are still finishing.";
  return "Playback is ready for viewers.";
};

const FILE_EXTENSION_REGEX = /\.[a-z0-9]{2,5}$/i;
const TIMESTAMP_TITLE_REGEXES = [
  /^\d{8}[\s_.-]?\d{6}(?:\d{1,3})?$/i,
  /^\d{4}[\s_.-]?\d{2}[\s_.-]?\d{2}[\s_.-]?\d{2}[\s_.-]?\d{2}(?:[\s_.-]?\d{2})?$/i,
  /^(?:img|vid|video|mov|dsc|dscn|pxl|screenrecording|screen_recording|rp(?:replay)?_final)[\s_.-]*\d+/i,
];

const INTERNAL_PROOF_TEXT_REGEX = /\b(?:proof|fixture)\b/i;

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
  featured = false,
  accessLabel = null,
  busy = false,
  onOpen,
  onEdit,
  onEditClip,
  onSetFeatured,
  onClearFeatured,
  onToggleVisibility,
  onDelete,
  onShare,
  onOpenActions,
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
  ].filter(Boolean);
  const titleOverlayText = ownerClipEdit?.titleOverlayText.trim() ?? "";
  const titleOverlaySubtitle = ownerClipEdit?.titleOverlaySubtitle.trim() ?? "";
  const hasOwnerTitleOverlay = !!(titleOverlayText || titleOverlaySubtitle);
  const ownerTemplateLabel = ownerClipEdit ? formatClipStudioTemplateLabel(ownerClipEdit.templatePreset) : "";
  const publicTitleOverlayText = publicClipMetadata?.titleText.trim() ?? "";
  const publicTitleOverlaySubtitle = publicClipMetadata?.subtitleText.trim() ?? "";
  const hasPublicTitleOverlay = !!(publicTitleOverlayText || publicTitleOverlaySubtitle);
  const publicTemplateLabel = formatPublicClipTemplateLabel(publicClipMetadata?.templatePreset ?? null);
  const isOfficialRachiInternalProofFixture = !ownerMode
    && video.ownerId === RACHI_OFFICIAL_USER_ID
    && INTERNAL_PROOF_TEXT_REGEX.test(`${video.title} ${video.description}`);
  const publicDisplayTitle = isOfficialRachiInternalProofFixture ? "Chi'llywood Original" : displayTitle;
  const publicDescription = isOfficialRachiInternalProofFixture
    ? "Official Chi'llywood Original from Rachi."
    : (video.description || "Open this creator video in the Chi'llywood Player.");

  return (
    <View style={[styles.card, !playable && styles.cardUnavailable]}>
      <TouchableOpacity
        style={styles.preview}
        activeOpacity={0.88}
        onPress={playable ? onOpen : ownerMode ? onOpenActions : undefined}
        onLongPress={ownerMode ? onOpenActions : undefined}
        disabled={!playable && !ownerMode}
        accessibilityLabel={ownerMode ? `Open ${displayTitle}. Hold for content actions.` : `Open ${publicDisplayTitle}`}
      >
        <StableImage
          expectedWidth="100%"
          expectedHeight="100%"
          source={video.thumbnailUrl ? { uri: video.thumbnailUrl } : null}
          containerStyle={styles.thumbnailFrame}
          borderRadius={0}
          resizeMode="cover"
        />
        {!video.thumbnailUrl ? (
          <View style={styles.fallbackPreview}>
            <AppText scale="caption" style={styles.fallbackKicker}>{"Chi'llywood CREATOR"}</AppText>
            <AppText scale="title2" style={styles.fallbackTitle} numberOfLines={2}>{publicDisplayTitle}</AppText>
          </View>
        ) : null}
        <View style={styles.previewShade} />
        <View style={styles.playPill}>
          <AppText scale="footnote" style={styles.playPillText}>{playable ? "Play" : "Source Missing"}</AppText>
        </View>
        {ownerMode && onOpenActions ? (
          <TouchableOpacity
            style={styles.overflowButton}
            activeOpacity={0.84}
            onPress={onOpenActions}
            hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
            accessibilityRole="button"
            accessibilityLabel={`Open actions for ${displayTitle}`}
            testID="creator-video-card-overflow-button"
          >
            <AppText scale="title3" style={styles.overflowText}>•••</AppText>
          </TouchableOpacity>
        ) : null}
        <View style={styles.badgeRow}>
          <View style={[styles.badge, video.visibility === "public" ? styles.badgePublic : styles.badgeDraft]}>
            <AppText scale="caption" style={styles.badgeText}>{formatVisibilityLabel(video, ownerMode)}</AppText>
          </View>
          <View style={[styles.badge, playable ? styles.badgeMediaReady : styles.badgeMediaUnavailable]}>
            <AppText scale="caption" style={styles.badgeText}>{playable ? "Media Ready" : "Media Unavailable"}</AppText>
          </View>
          {moderationLabel ? (
            <View style={[styles.badge, styles.badgeModeration]}>
              <AppText scale="caption" style={styles.badgeText}>{moderationLabel}</AppText>
            </View>
          ) : null}
          {ownerClipEdit ? (
            <View style={[styles.badge, styles.badgeTemplate]}>
              <AppText scale="caption" style={styles.badgeText}>{ownerTemplateLabel}</AppText>
            </View>
          ) : null}
          {ownerMode && featured ? (
            <View style={[styles.badge, styles.badgeFeatured]}>
              <AppText scale="caption" style={styles.badgeText}>Featured</AppText>
            </View>
          ) : null}
          {accessLabel ? (
            <View style={[styles.badge, styles.badgeTemplate]}>
              <AppText scale="caption" style={styles.badgeText}>{accessLabel}</AppText>
            </View>
          ) : null}
          {publicTemplateLabel ? (
            <View style={[styles.badge, styles.badgeTemplate]}>
              <AppText scale="caption" style={styles.badgeText}>{publicTemplateLabel}</AppText>
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
              <AppText scale="subhead" style={styles.ownerTitleOverlayText} numberOfLines={2}>{titleOverlayText}</AppText>
            ) : null}
            {titleOverlaySubtitle ? (
              <AppText scale="caption" style={styles.ownerTitleOverlaySubtitle} numberOfLines={2}>{titleOverlaySubtitle}</AppText>
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
              <AppText scale="subhead" style={styles.publicTitleOverlayText} numberOfLines={2}>{publicTitleOverlayText}</AppText>
            ) : null}
            {publicTitleOverlaySubtitle ? (
              <AppText scale="caption" style={styles.publicTitleOverlaySubtitle} numberOfLines={2}>{publicTitleOverlaySubtitle}</AppText>
            ) : null}
          </View>
        ) : null}
      </TouchableOpacity>

      <View style={styles.body}>
        <AppText scale="subhead" style={styles.title} numberOfLines={2}>{publicDisplayTitle}</AppText>
        <AppText scale="footnote" style={styles.description} numberOfLines={2}>
          {publicDescription}
        </AppText>
        {meta.length ? (
          <AppText scale="caption" style={styles.meta} numberOfLines={1}>{meta.join(" · ")}</AppText>
        ) : null}
        {!playable ? (
          <AppText scale="caption" style={styles.warning}>Media unavailable: this upload is missing a playable source.</AppText>
        ) : null}
        {moderationBlocked ? (
          <AppText scale="caption" style={styles.warning}>This video is unavailable publicly until moderation restores it.</AppText>
        ) : null}
        {ownerMode && rawTitleDetected ? (
          <AppText scale="caption" style={styles.ownerGuidance}>
            This title still looks like a file name. Tap Edit to rename it for viewers.
          </AppText>
        ) : null}
        {ownerMode ? (
          <AppText scale="caption" style={styles.ownerGuidance}>
            {formatOwnerPlaybackStatus(video)}
          </AppText>
        ) : null}
        {ownerClipEdit ? (
          <AppText scale="caption" style={styles.ownerGuidance}>
            {`Clip Studio: ${hasOwnerTitleOverlay ? "Title Card" : "No Title Card"} · ${ownerTemplateLabel}`}
          </AppText>
        ) : null}
        {ownerMode && accessLabel ? (
          <AppText scale="caption" style={styles.ownerGuidance}>
            {accessLabel === "Paid Video" ? "Fans must unlock this video before playback. Sandbox sales are not payable." : accessLabel}
          </AppText>
        ) : null}

        {ownerMode ? (
          <View style={styles.actionGrid}>
            <TouchableOpacity style={styles.primaryAction} activeOpacity={0.86} onPress={onOpen} disabled={!playable}>
              <AppText scale="footnote" style={styles.primaryActionText}>Open Player</AppText>
            </TouchableOpacity>
            {onEdit ? (
              <TouchableOpacity style={styles.secondaryAction} activeOpacity={0.86} onPress={onEdit}>
                <AppText scale="footnote" style={styles.secondaryActionText}>Edit</AppText>
              </TouchableOpacity>
            ) : null}
            {onEditClip ? (
              <TouchableOpacity style={styles.secondaryAction} activeOpacity={0.86} onPress={onEditClip}>
                <AppText scale="footnote" style={styles.secondaryActionText}>Edit Clip</AppText>
              </TouchableOpacity>
            ) : null}
            {onSetFeatured || onClearFeatured ? (
              <TouchableOpacity
                style={[
                  styles.secondaryAction,
                  featured && styles.featuredAction,
                  (busy || moderationBlocked || (!featured && video.visibility !== "public")) && styles.actionDisabled,
                ]}
                activeOpacity={0.86}
                onPress={featured ? onClearFeatured : onSetFeatured}
                disabled={busy || moderationBlocked || (!featured && video.visibility !== "public")}
              >
                <AppText scale="footnote" style={styles.secondaryActionText}>{featured ? "Remove Featured" : "Set Featured"}</AppText>
              </TouchableOpacity>
            ) : null}
            {onToggleVisibility ? (
              <TouchableOpacity
                style={[styles.secondaryAction, (busy || moderationBlocked) && styles.actionDisabled]}
                activeOpacity={0.86}
                onPress={onToggleVisibility}
                disabled={busy || moderationBlocked}
              >
                <AppText scale="footnote" style={styles.secondaryActionText}>{video.visibility === "public" ? "Unpublish" : "Publish"}</AppText>
              </TouchableOpacity>
            ) : null}
            {onDelete ? (
              <TouchableOpacity
                style={[styles.secondaryAction, busy && styles.actionDisabled]}
                activeOpacity={0.86}
                onPress={onDelete}
                disabled={busy}
              >
                <AppText scale="footnote" style={styles.secondaryActionText}>Delete</AppText>
              </TouchableOpacity>
            ) : null}
          </View>
        ) : (
          <View style={styles.publicActions}>
            <TouchableOpacity style={styles.primaryAction} activeOpacity={0.86} onPress={onOpen} disabled={!playable}>
              <AppText scale="footnote" style={styles.primaryActionText}>Watch</AppText>
            </TouchableOpacity>
            {onShare && shareable ? (
              <TouchableOpacity style={styles.secondaryAction} activeOpacity={0.86} onPress={onShare}>
                <AppText scale="footnote" style={styles.secondaryActionText}>Share</AppText>
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
  thumbnailFrame: {
    ...StyleSheet.absoluteFillObject,
    width: "100%",
    height: "100%",
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
  overflowButton: {
    position: "absolute",
    top: 12,
    right: 12,
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.22)",
    backgroundColor: "rgba(5,7,12,0.72)",
  },
  overflowText: {
    color: "#FFFFFF",
    fontSize: 18,
    lineHeight: 20,
    fontWeight: "900",
    marginTop: -4,
  },
  badgeRow: {
    position: "absolute",
    top: 12,
    left: 12,
    right: 58,
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
  badgeFeatured: {
    borderColor: "rgba(242,194,91,0.58)",
    backgroundColor: "rgba(242,194,91,0.16)",
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
  featuredAction: {
    borderColor: "rgba(242,194,91,0.42)",
    backgroundColor: "rgba(242,194,91,0.12)",
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
