import type { CommunicationParticipantView } from "../../_lib/communication";
import React, { useEffect } from "react";
import { ActivityIndicator, StyleSheet, Text, View } from "react-native";

import { CommunicationControlBar } from "./communication-control-bar";
import { CommunicationParticipantGrid } from "./communication-participant-grid";

type InRoomCommunicationPanelProps = {
  surfaceLabel: string;
  titleText?: string;
  bodyText?: string;
  loadingText?: string;
  emptyStateText?: string;
  roomCode?: string;
  participantCount: number;
  isHost: boolean;
  channelState: "idle" | "connecting" | "live" | "reconnecting" | "error";
  loading: boolean;
  statusMessage?: string | null;
  participants: CommunicationParticipantView[];
  cameraEnabled: boolean;
  micEnabled: boolean;
  showControls?: boolean;
  onToggleCamera: () => void;
  onToggleMic: () => void;
  onLeave: () => void;
};

const getStatusLabel = (channelState: InRoomCommunicationPanelProps["channelState"]) => {
  if (channelState === "live") return "Connected";
  if (channelState === "connecting") return "Connecting";
  if (channelState === "reconnecting") return "Reconnecting";
  if (channelState === "error") return "Connection issue";
  return "Preparing";
};

export function InRoomCommunicationPanel({
  surfaceLabel,
  titleText,
  bodyText,
  loadingText,
  emptyStateText,
  roomCode,
  participantCount,
  isHost,
  channelState,
  loading,
  statusMessage,
  participants,
  cameraEnabled,
  micEnabled,
  showControls = true,
  onToggleCamera,
  onToggleMic,
  onLeave,
}: InRoomCommunicationPanelProps) {
  useEffect(() => {
    if (!__DEV__) return;
    console.log("[CH_CALL]", "panel_render", {
      surfaceLabel,
      participantCount,
      channelState,
      loading,
      hasStatusMessage: !!statusMessage,
      showControls,
      participantRenderCount: participants.length,
    });
  }, [channelState, loading, participantCount, participants.length, showControls, statusMessage, surfaceLabel]);

  return (
    <View style={styles.card}>
      <View style={styles.copyBlock}>
        <Text style={styles.kicker}>CHI&apos;LLY CHAT</Text>
        <Text style={styles.title}>{titleText ?? `${surfaceLabel} Chi'lly Chat`}</Text>
        <Text style={styles.body}>
          {bodyText ?? "Chi'lly Chat is Chi'llywood's native communication layer for direct threads, room-linked conversations, and live coordination."}
        </Text>
      </View>

      <View style={styles.metaRow}>
        {roomCode ? (
          <View style={styles.metaPill}>
            <Text style={styles.metaText}>{roomCode}</Text>
          </View>
        ) : null}
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

      {loading ? (
        <View style={styles.stateCard}>
          <ActivityIndicator size="small" color="#DCE6FC" />
          <Text style={styles.stateText}>{loadingText ?? "Connecting Chi'lly Chat…"}</Text>
        </View>
      ) : statusMessage ? (
        <View style={styles.stateCard}>
          <Text style={styles.stateText}>{statusMessage}</Text>
        </View>
      ) : participants.length > 0 ? (
        <CommunicationParticipantGrid participants={participants} />
      ) : (
        <View style={styles.stateCard}>
          <Text style={styles.stateText}>{emptyStateText ?? "Waiting for participants to join Chi'lly Chat."}</Text>
        </View>
      )}

      {showControls && !loading && !statusMessage ? (
        <CommunicationControlBar
          cameraEnabled={cameraEnabled}
          micEnabled={micEnabled}
          leaveLabel={isHost ? "End Call" : "Leave"}
          onToggleCamera={onToggleCamera}
          onToggleMic={onToggleMic}
          onLeave={onLeave}
        />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: 18,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.1)",
    backgroundColor: "rgba(10,14,22,0.96)",
    padding: 14,
    gap: 12,
  },
  copyBlock: {
    gap: 6,
  },
  kicker: {
    color: "#7D8AA6",
    fontSize: 10,
    fontWeight: "900",
    letterSpacing: 1.1,
  },
  title: {
    color: "#F2F6FF",
    fontSize: 18,
    fontWeight: "900",
  },
  body: {
    color: "#A8B4CC",
    fontSize: 12.5,
    lineHeight: 18,
    fontWeight: "600",
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
    backgroundColor: "rgba(255,255,255,0.05)",
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  metaText: {
    color: "#C6D0E5",
    fontSize: 11,
    fontWeight: "800",
  },
  stateCard: {
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
    backgroundColor: "rgba(255,255,255,0.04)",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 14,
    paddingVertical: 18,
    gap: 8,
  },
  stateText: {
    color: "#D7E0F2",
    fontSize: 12.5,
    lineHeight: 18,
    fontWeight: "700",
    textAlign: "center",
  },
});
