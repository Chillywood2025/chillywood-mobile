import React, { useEffect } from "react";
import { Image, StyleSheet, Text, useWindowDimensions, View } from "react-native";

import { getCommunicationRTCModule, type CommunicationParticipantView } from "../../_lib/communication";

const logCallDebug = (..._args: unknown[]) => {};

type CommunicationParticipantGridProps = {
  participants: CommunicationParticipantView[];
  presentation?: "embedded" | "fullscreen";
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

const getConnectionLabel = (participant: CommunicationParticipantView) => {
  if (participant.isSelf) return participant.micOn ? "You · live mic" : "You · muted";
  if (participant.streamURL) return participant.micOn ? "Video connected" : "Video connected · muted";
  if (participant.connectionState === "connected") return participant.micOn ? "Connected" : "Connected · muted";
  if (participant.connectionState === "failed") return "Connection failed";
  if (participant.connectionState === "disconnected") return "Disconnected";
  if (participant.connectionState === "connecting") return "Connecting";
  return "Waiting";
};

export function CommunicationParticipantGrid({
  participants,
  presentation = "embedded",
}: CommunicationParticipantGridProps) {
  const RTCView = getCommunicationRTCModule()?.RTCView as CommunicationRTCViewComponent | undefined;
  const { width, height } = useWindowDimensions();
  const isFullscreen = presentation === "fullscreen";
  const isLandscape = width > height;

  useEffect(() => {
    if (!__DEV__) return;
    logCallDebug("[CH_CALL]", "participant_grid_render", {
      participantCount: participants.length,
      presentation,
      remoteRenderableCount: participants.filter((participant) => !participant.isSelf && !!participant.streamURL).length,
      fallbackCount: participants.filter((participant) => !(!!RTCView && !!participant.streamURL)).length,
      participants: participants.map((participant) => ({
        userId: participant.userId,
        isSelf: participant.isSelf,
        streamReady: !!participant.streamURL,
        cameraOn: participant.cameraOn,
        micOn: participant.micOn,
        connectionState: participant.connectionState,
      })),
    });
  }, [participants, presentation]);

  return (
    <View
      style={[
        styles.grid,
        isFullscreen && styles.gridFullscreen,
        isFullscreen && participants.length === 2 && (isLandscape ? styles.gridFullscreenTwoLandscape : styles.gridFullscreenTwoPortrait),
      ]}
    >
      {participants.map((participant, index) => {
        const hasVideoStream = !!participant.streamURL;
        const showVideo = !!RTCView && hasVideoStream;
        const videoObjectFit = "cover";
        const tileWide = participants.length <= 1;
        const compactTile = participants.length > 2;
        const oddLastTile = isFullscreen && participants.length > 2 && !isLandscape && participants.length % 2 === 1 && index === participants.length - 1;

        return (
          <View
            key={participant.userId}
            style={[
              styles.tile,
              tileWide && styles.tileWide,
              compactTile && styles.tileCompact,
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
                compactTile && styles.mediaFrameCompact,
                isFullscreen && styles.mediaFrameFullscreen,
              ]}
            >
              {showVideo && RTCView ? (
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
                  <Text style={styles.cameraLabel}>{hasVideoStream ? "Video connecting" : participant.cameraOn ? "Camera warming up" : "Camera off"}</Text>
                </View>
              )}
              <View style={styles.topRow}>
                {participant.isHost ? (
                  <View style={[styles.badge, styles.hostBadge]}>
                    <Text style={styles.badgeText}>Host</Text>
                  </View>
                ) : null}
                {participant.isSelf ? (
                  <View style={styles.badge}>
                    <Text style={styles.badgeText}>You</Text>
                  </View>
                ) : null}
              </View>
              <View style={styles.bottomRow}>
                <View style={styles.nameBlock}>
                  <Text style={styles.name} numberOfLines={1}>{participant.displayName}</Text>
                  <Text style={styles.status} numberOfLines={1}>{getConnectionLabel(participant)}</Text>
                </View>
                <View style={styles.mediaPills}>
                  <View style={[styles.mediaPill, (participant.cameraOn || hasVideoStream) ? styles.mediaPillOn : styles.mediaPillOff]}>
                    <Text style={styles.mediaPillText}>{(participant.cameraOn || hasVideoStream) ? "Cam" : "Cam Off"}</Text>
                  </View>
                  <View style={[styles.mediaPill, participant.micOn ? styles.mediaPillOn : styles.mediaPillOff]}>
                    <Text style={styles.mediaPillText}>{participant.micOn ? "Mic" : "Muted"}</Text>
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
    gap: 12,
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
    minHeight: 216,
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
  tileCompact: {
    minHeight: 132,
  },
  mediaFrame: {
    overflow: "hidden",
    position: "relative",
    minHeight: 216,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.1)",
    backgroundColor: "#090B10",
  },
  mediaFrameFullscreen: {
    flex: 1,
    minHeight: 0,
  },
  mediaFrameCompact: {
    minHeight: 132,
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
    maxWidth: "66%",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
    backgroundColor: "rgba(5,8,14,0.68)",
    paddingHorizontal: 9,
    paddingVertical: 7,
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
