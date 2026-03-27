import React from "react";
import { StyleSheet, Text, TouchableOpacity, View } from "react-native";

type CommunicationRoomHeaderProps = {
  roomCode: string;
  participantCount: number;
  isHost: boolean;
  channelState: "idle" | "connecting" | "live" | "reconnecting" | "error";
  linkedRoomCode?: string;
  linkedRoomMode?: "live" | "hybrid";
  onLeave: () => void;
  onReportRoom?: () => void;
};

const getStatusLabel = (channelState: CommunicationRoomHeaderProps["channelState"]) => {
  if (channelState === "live") return "Connected";
  if (channelState === "connecting") return "Connecting";
  if (channelState === "reconnecting") return "Reconnecting";
  if (channelState === "error") return "Connection issue";
  return "Preparing";
};

const getLinkedRoomLabel = (linkedRoomMode: CommunicationRoomHeaderProps["linkedRoomMode"]) =>
  linkedRoomMode === "live" ? "Live Room" : linkedRoomMode === "hybrid" ? "Party Room" : "Watch Party Room";

export function CommunicationRoomHeader({
  roomCode,
  participantCount,
  isHost,
  channelState,
  linkedRoomCode,
  linkedRoomMode,
  onLeave,
  onReportRoom,
}: CommunicationRoomHeaderProps) {
  return (
    <View style={styles.card}>
      <View style={styles.copyBlock}>
        <Text style={styles.kicker}>COMMUNICATION ROOM</Text>
        <Text style={styles.code}>{roomCode}</Text>
        {linkedRoomCode ? (
          <Text style={styles.contextText}>
            Linked to {getLinkedRoomLabel(linkedRoomMode)} · {linkedRoomCode}
          </Text>
        ) : null}
        <View style={styles.metaRow}>
          <View style={styles.metaPill}>
            <Text style={styles.metaText}>{participantCount} connected</Text>
          </View>
          <View style={styles.metaPill}>
            <Text style={styles.metaText}>{isHost ? "Host" : "Participant"}</Text>
          </View>
          <View style={styles.metaPill}>
            <Text style={styles.metaText}>{getStatusLabel(channelState)}</Text>
          </View>
        </View>
      </View>
      <View style={styles.actionsRow}>
        {onReportRoom ? (
          <TouchableOpacity style={styles.reportButton} activeOpacity={0.86} onPress={onReportRoom}>
            <Text style={styles.reportButtonText}>Report</Text>
          </TouchableOpacity>
        ) : null}
        <TouchableOpacity style={styles.leaveButton} activeOpacity={0.86} onPress={onLeave}>
          <Text style={styles.leaveButtonText}>Leave</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: 18,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.1)",
    backgroundColor: "rgba(13,14,20,0.96)",
    padding: 16,
    gap: 14,
  },
  copyBlock: {
    gap: 8,
  },
  kicker: {
    color: "#75809A",
    fontSize: 10,
    fontWeight: "900",
    letterSpacing: 1.1,
  },
  code: {
    color: "#F2F5FA",
    fontSize: 28,
    fontWeight: "900",
    letterSpacing: 1.2,
  },
  contextText: {
    color: "#9AA5BE",
    fontSize: 12,
    fontWeight: "700",
  },
  metaRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  metaPill: {
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.1)",
    backgroundColor: "rgba(255,255,255,0.04)",
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  metaText: {
    color: "#B7C0D6",
    fontSize: 11,
    fontWeight: "800",
  },
  leaveButton: {
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "rgba(220,20,60,0.32)",
    backgroundColor: "rgba(76,18,29,0.92)",
    paddingHorizontal: 14,
    paddingVertical: 9,
  },
  leaveButtonText: {
    color: "#FFD8DF",
    fontSize: 12,
    fontWeight: "900",
  },
  actionsRow: {
    flexDirection: "row",
    gap: 10,
  },
  reportButton: {
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.12)",
    backgroundColor: "rgba(255,255,255,0.05)",
    paddingHorizontal: 14,
    paddingVertical: 9,
  },
  reportButtonText: {
    color: "#C9D2E6",
    fontSize: 12,
    fontWeight: "900",
  },
});
