import React, { useEffect } from "react";
import { StyleSheet, Text, View } from "react-native";

import { getCommunicationRTCModule, type CommunicationParticipantView } from "../../_lib/communication";
import { LiveKitVideoTrack } from "../../_lib/livekit/react-native-module";
import { responsiveFontSize, type ResponsiveLayout, useResponsiveLayout } from "../../hooks/use-responsive-layout";
import { ProfileMediaImage as Image } from "../ui/ProfileMediaImage";

const logCallDebug = (..._args: unknown[]) => {};

type CommunicationParticipantGridProps = {
  participants: CommunicationParticipantView[];
  callType?: "voice" | "video" | null;
  presentation?: "embedded" | "fullscreen";
  responsiveLayout?: ResponsiveLayout;
  localCameraEnabled?: boolean;
  onLiveKitVideoRendered?: (participant: CommunicationParticipantView) => void;
};

type CommunicationRTCViewComponent = React.ComponentType<{
  streamURL: string;
  style?: object;
  objectFit?: "cover" | "contain";
  mirror?: boolean;
}>;

const getInitials = (value: string) => {
  const normalized = String(value ?? "").trim();
  if (!normalized) return "?";
  const words = normalized.split(/\s+/).filter(Boolean);
  if (words.length >= 2) return `${words[0][0] ?? ""}${words[1][0] ?? ""}`.toUpperCase();
  return normalized.slice(0, 2).toUpperCase();
};

const getConnectionLabel = (
  participant: CommunicationParticipantView,
  options: { callType?: "voice" | "video" | null; hasVideoStream: boolean; cameraRequested: boolean },
) => {
  if (participant.isSelf) {
    if (options.hasVideoStream) return participant.micOn ? "You · live video" : "You · live video · muted";
    if (options.cameraRequested) return participant.micOn ? "You · camera connecting" : "You · camera connecting · muted";
    return participant.micOn ? "You · live mic" : "You · muted";
  }
  if (options.hasVideoStream) return participant.micOn ? "Video connected" : "Video connected · muted";
  if (options.cameraRequested) return participant.micOn ? "Video connecting" : "Video connecting · muted";
  if (options.callType === "video" && participant.connectionState === "connected") {
    return participant.micOn ? "Connected · camera off" : "Connected · muted";
  }
  if (participant.connectionState === "connected") return participant.micOn ? "Connected" : "Connected · muted";
  if (participant.connectionState === "failed") return "Connection failed";
  if (participant.connectionState === "disconnected") return "Disconnected";
  if (participant.connectionState === "connecting") return "Connecting";
  return "Waiting";
};

export function CommunicationParticipantGrid({
  participants,
  callType = null,
  presentation = "embedded",
  responsiveLayout: providedResponsiveLayout,
  localCameraEnabled,
  onLiveKitVideoRendered,
}: CommunicationParticipantGridProps) {
  const RTCView = getCommunicationRTCModule()?.RTCView as CommunicationRTCViewComponent | undefined;
  const fallbackResponsiveLayout = useResponsiveLayout();
  const responsiveLayout = providedResponsiveLayout ?? fallbackResponsiveLayout;
  const isFullscreen = presentation === "fullscreen";
  const isLandscape = responsiveLayout.isLandscape;
  const textMaxFontSizeMultiplier = responsiveLayout.isCompactPhone ? 1.12 : 1.2;
  const isVideoCall = callType === "video";

  useEffect(() => {
    if (!__DEV__) return;
    logCallDebug("[CH_CALL]", "participant_grid_render", {
      participantCount: participants.length,
      callType,
      presentation,
      deviceClass: responsiveLayout.deviceClass,
      remoteRenderableCount: isVideoCall ? participants.filter((participant) => !participant.isSelf && !!participant.streamURL).length : 0,
      fallbackCount: participants.filter((participant) => !(!!RTCView && isVideoCall && !!participant.streamURL)).length,
      participants: participants.map((participant) => ({
        userId: participant.userId,
        isSelf: participant.isSelf,
        streamReady: !!participant.streamURL,
        cameraOn: participant.cameraOn,
        micOn: participant.micOn,
        connectionState: participant.connectionState,
      })),
    });
  }, [RTCView, callType, isVideoCall, participants, presentation, responsiveLayout.deviceClass]);

  return (
    <View
      style={[
        styles.grid,
        { gap: responsiveLayout.videoTileGap },
        isFullscreen && styles.gridFullscreen,
        isFullscreen && participants.length === 2 && (isLandscape ? styles.gridFullscreenTwoLandscape : styles.gridFullscreenTwoPortrait),
      ]}
    >
      {participants.map((participant, index) => {
        const cameraRequested = isVideoCall
          ? participant.isSelf && typeof localCameraEnabled === "boolean"
            ? localCameraEnabled
            : participant.cameraOn
          : false;
        const hasLiveKitVideo = isVideoCall
          && !!participant.liveKitVideoTrackReference
          && (!participant.isSelf || cameraRequested);
        const hasVideoStream = isVideoCall
          && (!!participant.streamURL || hasLiveKitVideo)
          && (!participant.isSelf || cameraRequested);
        const showLegacyVideo = !!RTCView && !!participant.streamURL && hasVideoStream;
        const videoObjectFit = "cover";
        const cameraPillLabel = hasVideoStream ? "Cam On" : cameraRequested ? "Starting" : "Cam Off";
        const tileWide = participants.length <= 1;
        const compactTile = participants.length > 2;
        const oddLastTile = isFullscreen && participants.length > 2 && !isLandscape && participants.length % 2 === 1 && index === participants.length - 1;

        return (
          <View
            key={participant.userId}
            testID={participant.isSelf ? "communication-participant-self" : "communication-participant-remote"}
            accessibilityLabel={participant.isSelf ? "Your call participant tile" : "Remote call participant tile"}
            style={[
              styles.tile,
              { minHeight: responsiveLayout.videoTileMinHeight },
              tileWide && styles.tileWide,
              compactTile && { minHeight: responsiveLayout.compactVideoTileMinHeight },
              isFullscreen && styles.tileFullscreen,
              isFullscreen && participants.length === 2 && styles.tileFullscreenSplit,
              isFullscreen && participants.length === 2 && (isLandscape ? styles.tileFullscreenSplitLandscape : styles.tileFullscreenSplitPortrait),
              isFullscreen && participants.length > 2 && (isLandscape ? styles.tileFullscreenMultiLandscape : styles.tileFullscreenMultiPortrait),
              oddLastTile && styles.tileFullscreenOddLast,
            ]}
          >
            <View
              style={[
                styles.mediaFrame,
                { minHeight: compactTile ? responsiveLayout.compactVideoTileMinHeight : responsiveLayout.videoTileMinHeight },
                isFullscreen && styles.mediaFrameFullscreen,
              ]}
            >
              {hasLiveKitVideo ? (
                <View
                  testID={participant.isSelf ? "communication-video-self" : "communication-video-remote"}
                  accessibilityLabel={participant.isSelf ? "Your live video" : "Remote live video"}
                  style={[
                    styles.video,
                    isFullscreen && styles.videoFullscreen,
                  ]}
                  onLayout={() => onLiveKitVideoRendered?.(participant)}
                >
                  <LiveKitVideoTrack
                    trackRef={participant.liveKitVideoTrackReference as React.ComponentProps<typeof LiveKitVideoTrack>["trackRef"]}
                    style={styles.videoFill}
                    objectFit={videoObjectFit}
                    mirror={participant.isSelf}
                    zOrder={participant.isSelf ? 1 : 0}
                  />
                </View>
              ) : showLegacyVideo && RTCView ? (
                <RTCView
                  streamURL={participant.streamURL as string}
                  style={[
                    styles.video,
                    isFullscreen && styles.videoFullscreen,
                  ]}
                  objectFit={videoObjectFit}
                  mirror={participant.isSelf}
                />
              ) : (
                <View
                  testID={participant.isSelf ? "communication-video-self-placeholder" : "communication-video-remote-placeholder"}
                  style={[
                    styles.avatarFrame,
                    compactTile && styles.avatarFrameCompact,
                  ]}
                >
                  {participant.avatarUrl ? (
                    <Image source={{ uri: participant.avatarUrl }} style={styles.avatarImage} />
                  ) : (
                    <Text style={styles.avatarInitial}>{getInitials(participant.displayName)}</Text>
                  )}
                  <Text style={styles.cameraLabel}>{cameraRequested ? "Camera Connecting" : "Camera Off"}</Text>
                </View>
              )}
              <View style={styles.topRow}>
                {participant.isHost ? (
                  <View style={[styles.badge, styles.hostBadge]}>
                    <Text maxFontSizeMultiplier={textMaxFontSizeMultiplier} style={styles.badgeText}>Host</Text>
                  </View>
                ) : null}
                {participant.isSelf ? (
                  <View style={styles.badge}>
                    <Text maxFontSizeMultiplier={textMaxFontSizeMultiplier} style={styles.badgeText}>You</Text>
                  </View>
                ) : null}
              </View>
              <View style={styles.bottomRow}>
                <View
                  style={[
                    styles.nameBlock,
                    {
                      maxWidth: responsiveLayout.metadataBadgeMaxWidth,
                      paddingHorizontal: responsiveLayout.metadataBadgePaddingHorizontal,
                      paddingVertical: responsiveLayout.metadataBadgePaddingVertical,
                    },
                  ]}
                >
                  <Text
                    maxFontSizeMultiplier={textMaxFontSizeMultiplier}
                    style={[styles.name, { fontSize: responsiveFontSize(14, responsiveLayout.fontScale, 0.9, 1.12) }]}
                    numberOfLines={1}
                  >
                    {participant.displayName}
                  </Text>
                  <Text
                    testID={participant.isSelf ? "communication-media-status-self" : "communication-media-status-remote"}
                    maxFontSizeMultiplier={textMaxFontSizeMultiplier}
                    style={[styles.status, { fontSize: responsiveFontSize(11.5, responsiveLayout.fontScale, 0.9, 1.12) }]}
                    numberOfLines={1}
                  >
                    {getConnectionLabel(participant, { callType, hasVideoStream, cameraRequested })}
                  </Text>
                </View>
                <View style={styles.mediaPills}>
                  <View style={[styles.mediaPill, hasVideoStream ? styles.mediaPillOn : styles.mediaPillOff]}>
                    <Text maxFontSizeMultiplier={textMaxFontSizeMultiplier} style={styles.mediaPillText}>{cameraPillLabel}</Text>
                  </View>
                  <View style={[styles.mediaPill, participant.micOn ? styles.mediaPillOn : styles.mediaPillOff]}>
                    <Text maxFontSizeMultiplier={textMaxFontSizeMultiplier} style={styles.mediaPillText}>{participant.micOn ? "Mic" : "Muted"}</Text>
                  </View>
                </View>
              </View>
            </View>
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  grid: {
    flexDirection: "row",
    flexWrap: "wrap",
  },
  gridFullscreen: {
    flex: 1,
    minHeight: 0,
    alignContent: "stretch",
  },
  gridFullscreenTwoPortrait: {
    flexDirection: "column",
    flexWrap: "nowrap",
  },
  gridFullscreenTwoLandscape: {
    flexDirection: "row",
    flexWrap: "nowrap",
  },
  tile: {
    width: "48%",
  },
  tileWide: {
    width: "100%",
  },
  tileFullscreen: {
    width: "100%",
    flexGrow: 1,
    flexShrink: 1,
    minHeight: 0,
  },
  tileFullscreenSplit: {
    flex: 1,
    minHeight: 0,
  },
  tileFullscreenSplitPortrait: {
    width: "100%",
  },
  tileFullscreenSplitLandscape: {
    width: 0,
  },
  tileFullscreenMultiPortrait: {
    width: "48%",
    minHeight: 0,
  },
  tileFullscreenMultiLandscape: {
    flexBasis: "31%",
    flexGrow: 1,
    minHeight: 0,
  },
  tileFullscreenOddLast: {
    width: "100%",
  },
  mediaFrame: {
    overflow: "hidden",
    position: "relative",
    borderRadius: 18,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.1)",
    backgroundColor: "#090B10",
  },
  mediaFrameFullscreen: {
    flex: 1,
    minHeight: 0,
  },
  video: {
    position: "absolute",
    left: 0,
    right: 0,
    top: 0,
    bottom: 0,
    backgroundColor: "#050608",
  },
  videoFullscreen: {
    width: "100%",
    height: "100%",
  },
  videoFill: {
    width: "100%",
    height: "100%",
  },
  avatarFrame: {
    position: "absolute",
    left: 0,
    right: 0,
    top: 0,
    bottom: 0,
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    paddingHorizontal: 18,
    backgroundColor: "#090B10",
  },
  avatarFrameCompact: {
    paddingHorizontal: 14,
  },
  avatarImage: {
    width: 72,
    height: 72,
    borderRadius: 36,
  },
  avatarInitial: {
    color: "#F1F4FA",
    fontSize: 30,
    fontWeight: "900",
  },
  cameraLabel: {
    color: "#8E99B2",
    fontSize: 12,
    fontWeight: "700",
    textAlign: "center",
  },
  topRow: {
    position: "absolute",
    left: 10,
    right: 10,
    top: 10,
    flexDirection: "row",
    gap: 8,
  },
  badge: {
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.12)",
    backgroundColor: "rgba(11,14,20,0.84)",
    paddingHorizontal: 9,
    paddingVertical: 5,
  },
  hostBadge: {
    borderColor: "rgba(220,20,60,0.3)",
    backgroundColor: "rgba(69,19,28,0.84)",
  },
  badgeText: {
    color: "#EFF3FA",
    fontSize: 10.5,
    fontWeight: "900",
  },
  bottomRow: {
    position: "absolute",
    left: 10,
    right: 10,
    bottom: 10,
    flexDirection: "row",
    alignItems: "flex-end",
    justifyContent: "space-between",
    gap: 8,
  },
  nameBlock: {
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
    backgroundColor: "rgba(5,8,14,0.68)",
    gap: 2,
  },
  name: {
    color: "#F4F7FC",
    fontSize: 14,
    fontWeight: "900",
  },
  status: {
    color: "#95A0B8",
    fontSize: 11.5,
    fontWeight: "700",
  },
  mediaPills: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    justifyContent: "flex-end",
    flexShrink: 1,
  },
  mediaPill: {
    borderRadius: 999,
    paddingHorizontal: 7,
    paddingVertical: 4,
    borderWidth: 1,
  },
  mediaPillOn: {
    borderColor: "rgba(70,214,135,0.28)",
    backgroundColor: "rgba(22,67,41,0.78)",
  },
  mediaPillOff: {
    borderColor: "rgba(255,255,255,0.1)",
    backgroundColor: "rgba(255,255,255,0.05)",
  },
  mediaPillText: {
    color: "#EDF1F9",
    fontSize: 10.5,
    fontWeight: "800",
  },
});
