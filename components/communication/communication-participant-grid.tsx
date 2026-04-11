import React, { useEffect } from "react";
import { Image, StyleSheet, Text, useWindowDimensions, View } from "react-native";

import { getCommunicationRTCModule, type CommunicationParticipantView } from "../../_lib/communication";

type CommunicationParticipantGridProps = {
  participants: CommunicationParticipantView[];
  presentation?: "embedded" | "fullscreen";
};

const RTCView = getCommunicationRTCModule()?.RTCView as React.ComponentType<{
  streamURL: string;
  style?: object;
  objectFit?: "cover" | "contain";
  mirror?: boolean;
}> | undefined;

const getInitials = (value: string) => {
  const normalized = String(value ?? "").trim();
  if (!normalized) return "?";
  const words = normalized.split(/\s+/).filter(Boolean);
  if (words.length >= 2) return `${words[0][0] ?? ""}${words[1][0] ?? ""}`.toUpperCase();
  return normalized.slice(0, 2).toUpperCase();
};

const getConnectionLabel = (participant: CommunicationParticipantView) => {
  if (participant.isSelf) return participant.micOn ? "You · live mic" : "You · muted";
  if (participant.connectionState === "connected") return participant.micOn ? "Connected" : "Muted";
  if (participant.connectionState === "failed") return "Connection failed";
  if (participant.connectionState === "disconnected") return "Disconnected";
  if (participant.connectionState === "connecting") return "Connecting";
  return "Waiting";
};

export function CommunicationParticipantGrid({
  participants,
  presentation = "embedded",
}: CommunicationParticipantGridProps) {
  const { width, height } = useWindowDimensions();
  const isFullscreen = presentation === "fullscreen";
  const isLandscape = width > height;
  const gap = 12;
  const availableWidth = Math.max(width - 32, 240);
  const availableHeight = Math.max(height - 260, 280);

  const getGridColumns = () => {
    if (participants.length <= 2) return 1;
    if (participants.length === 3) return isLandscape ? 3 : 2;
    if (participants.length === 4) return 2;
    return isLandscape ? 3 : 2;
  };

  const fullscreenColumns = getGridColumns();
  const fullscreenRows = participants.length <= 2 ? 2 : Math.ceil(participants.length / fullscreenColumns);
  const fullscreenTileWidth = participants.length === 2
    ? availableWidth
    : Math.max(120, Math.floor((availableWidth - gap * (fullscreenColumns - 1)) / fullscreenColumns));
  const fullscreenTileHeight = participants.length === 2
    ? Math.max(180, Math.floor((availableHeight - gap) / 2))
    : Math.max(132, Math.floor((availableHeight - gap * (fullscreenRows - 1)) / fullscreenRows));

  useEffect(() => {
    if (!__DEV__) return;
    console.log("[CH_CALL]", "participant_grid_render", {
      participantCount: participants.length,
      presentation,
      remoteRenderableCount: participants.filter((participant) => !participant.isSelf && !!participant.streamURL && participant.cameraOn).length,
      fallbackCount: participants.filter((participant) => !(!!RTCView && !!participant.streamURL && participant.cameraOn)).length,
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
        const showVideo = !!RTCView && !!participant.streamURL && participant.cameraOn;
        const tileWide = participants.length <= 1;
        const compactTile = participants.length > 2;
        const oddLastTile = isFullscreen
          && participants.length > 2
          && fullscreenColumns === 2
          && participants.length % 2 === 1
          && index === participants.length - 1;

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
              isFullscreen && participants.length > 2 && {
                width: oddLastTile ? availableWidth : fullscreenTileWidth,
                minHeight: fullscreenTileHeight,
              },
            ]}
          >
            <View
              style={[
                styles.mediaFrame,
                compactTile && styles.mediaFrameCompact,
                isFullscreen && styles.mediaFrameFullscreen,
                isFullscreen && participants.length === 2 && { minHeight: fullscreenTileHeight, height: fullscreenTileHeight },
                isFullscreen && participants.length > 2 && { minHeight: fullscreenTileHeight, height: fullscreenTileHeight },
              ]}
            >
              {showVideo && RTCView ? (
                <RTCView
                  streamURL={participant.streamURL as string}
                  style={[
                    styles.video,
                    compactTile && styles.videoCompact,
                    isFullscreen && styles.videoFullscreen,
                    isFullscreen && participants.length === 2 && { height: fullscreenTileHeight },
                    isFullscreen && participants.length > 2 && { height: fullscreenTileHeight },
                  ]}
                  objectFit="cover"
                  mirror={participant.isSelf}
                />
              ) : (
                <View
                  style={[
                    styles.avatarFrame,
                    compactTile && styles.avatarFrameCompact,
                    isFullscreen && styles.avatarFrameFullscreen,
                    isFullscreen && participants.length === 2 && { minHeight: fullscreenTileHeight, height: fullscreenTileHeight },
                    isFullscreen && participants.length > 2 && { minHeight: fullscreenTileHeight, height: fullscreenTileHeight },
                  ]}
                >
                  {participant.avatarUrl ? (
                    <Image source={{ uri: participant.avatarUrl }} style={styles.avatarImage} />
                  ) : (
                    <Text style={styles.avatarInitial}>{getInitials(participant.displayName)}</Text>
                  )}
                  <Text style={styles.cameraLabel}>{participant.cameraOn ? "Camera warming up" : "Camera off"}</Text>
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
                  <View style={[styles.mediaPill, participant.cameraOn ? styles.mediaPillOn : styles.mediaPillOff]}>
                    <Text style={styles.mediaPillText}>{participant.cameraOn ? "Cam" : "Cam Off"}</Text>
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
    minHeight: 0,
  },
  tileFullscreenSplit: {
    flex: 1,
  },
  tileFullscreenSplitPortrait: {
    width: "100%",
  },
  tileFullscreenSplitLandscape: {
    width: 0,
  },
  tileCompact: {
    minHeight: 132,
  },
  mediaFrame: {
    overflow: "hidden",
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
    width: "100%",
    height: 216,
    backgroundColor: "#050608",
  },
  videoFullscreen: {
    flex: 1,
    height: undefined,
  },
  videoCompact: {
    height: 132,
  },
  avatarFrame: {
    width: "100%",
    minHeight: 216,
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    paddingHorizontal: 18,
    backgroundColor: "#090B10",
  },
  avatarFrameFullscreen: {
    flex: 1,
    minHeight: 0,
  },
  avatarFrameCompact: {
    minHeight: 132,
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
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
    backgroundColor: "rgba(11,14,20,0.86)",
    paddingHorizontal: 10,
    paddingVertical: 10,
    gap: 8,
  },
  nameBlock: {
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
  },
  mediaPill: {
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 5,
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
