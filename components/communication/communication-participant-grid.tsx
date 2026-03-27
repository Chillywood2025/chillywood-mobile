import React from "react";
import { Image, StyleSheet, Text, View } from "react-native";

import { getCommunicationRTCModule, type CommunicationParticipantView } from "../../_lib/communication";

type CommunicationParticipantGridProps = {
  participants: CommunicationParticipantView[];
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

export function CommunicationParticipantGrid({ participants }: CommunicationParticipantGridProps) {
  return (
    <View style={styles.grid}>
      {participants.map((participant) => {
        const showVideo = !!RTCView && !!participant.streamURL && participant.cameraOn;
        const tileWide = participants.length <= 1;

        return (
          <View key={participant.userId} style={[styles.tile, tileWide && styles.tileWide]}>
            <View style={styles.mediaFrame}>
              {showVideo && RTCView ? (
                <RTCView
                  streamURL={participant.streamURL as string}
                  style={styles.video}
                  objectFit="cover"
                  mirror={participant.isSelf}
                />
              ) : (
                <View style={styles.avatarFrame}>
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
  tile: {
    width: "48%",
    minHeight: 216,
  },
  tileWide: {
    width: "100%",
  },
  mediaFrame: {
    overflow: "hidden",
    minHeight: 216,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.1)",
    backgroundColor: "#090B10",
  },
  video: {
    width: "100%",
    height: 216,
    backgroundColor: "#050608",
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
