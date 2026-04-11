import type { CommunicationParticipantView } from "../../_lib/communication";
import React, { useEffect } from "react";
import { ActivityIndicator, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { CommunicationControlBar } from "./communication-control-bar";
import { CommunicationParticipantGrid } from "./communication-participant-grid";

const logCallDebug = (..._args: unknown[]) => {};

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
  presentation?: "embedded" | "fullscreen";
  onToggleCamera: () => void;
  onToggleMic: () => void;
  onLeave: () => void;
  onCloseSurface?: () => void;
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
  presentation = "embedded",
  onToggleCamera,
  onToggleMic,
  onLeave,
  onCloseSurface,
}: InRoomCommunicationPanelProps) {
  const insets = useSafeAreaInsets();
  const isFullscreen = presentation === "fullscreen";

  useEffect(() => {
    if (!__DEV__) return;
    logCallDebug("[CH_CALL]", "panel_render", {
      surfaceLabel,
      participantCount,
      channelState,
      loading,
      hasStatusMessage: !!statusMessage,
      showControls,
      participantRenderCount: participants.length,
      presentation,
    });
  }, [channelState, loading, participantCount, participants.length, presentation, showControls, statusMessage, surfaceLabel]);

  const controlsVisible = showControls && !loading && !statusMessage;
  const resolvedTitle = titleText ?? `${surfaceLabel} Chi'lly Chat`;
  const resolvedBody = bodyText ?? "Chi'lly Chat is Chi'llywood's native communication layer for direct threads, room-linked conversations, and live coordination.";

  return (
    <View
      style={[
        styles.card,
        isFullscreen && styles.fullscreenCard,
        isFullscreen && {
          paddingTop: insets.top + 10,
          paddingBottom: Math.max(insets.bottom, 12),
        },
      ]}
    >
      {isFullscreen ? (
        <View style={styles.fullscreenHeader}>
          <View style={styles.fullscreenHeaderCopy}>
            <Text style={styles.kicker}>CHI&apos;LLY CHAT</Text>
            <Text style={styles.fullscreenTitle}>{resolvedTitle}</Text>
            <Text style={styles.fullscreenBody}>{resolvedBody}</Text>
          </View>
          {onCloseSurface ? (
            <TouchableOpacity
              style={styles.closeButton}
              activeOpacity={0.86}
              onPress={onCloseSurface}
            >
              <Text style={styles.closeButtonText}>Back to Thread</Text>
            </TouchableOpacity>
          ) : null}
        </View>
      ) : (
        <View style={styles.copyBlock}>
          <Text style={styles.kicker}>CHI&apos;LLY CHAT</Text>
          <Text style={styles.title}>{resolvedTitle}</Text>
          <Text style={styles.body}>{resolvedBody}</Text>
        </View>
      )}

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
        <View style={[styles.stateCard, isFullscreen && styles.fullscreenStateCard]}>
          <ActivityIndicator size="small" color="#DCE6FC" />
          <Text style={styles.stateText}>{loadingText ?? "Connecting Chi'lly Chat…"}</Text>
        </View>
      ) : statusMessage ? (
        <View style={[styles.stateCard, isFullscreen && styles.fullscreenStateCard]}>
          <Text style={styles.stateText}>{statusMessage}</Text>
        </View>
      ) : participants.length > 0 ? (
        <View style={[styles.participantStage, isFullscreen && styles.participantStageFullscreen]}>
          <CommunicationParticipantGrid
            participants={participants}
            presentation={isFullscreen ? "fullscreen" : "embedded"}
          />
        </View>
      ) : (
        <View style={[styles.stateCard, isFullscreen && styles.fullscreenStateCard]}>
          <Text style={styles.stateText}>{emptyStateText ?? "Waiting for participants to join Chi'lly Chat."}</Text>
        </View>
      )}

      {controlsVisible ? (
        <View style={[styles.controlsWrap, isFullscreen && styles.controlsWrapFullscreen]}>
          <CommunicationControlBar
            cameraEnabled={cameraEnabled}
            micEnabled={micEnabled}
            leaveLabel={isHost ? "End Call" : "Leave"}
            onToggleCamera={onToggleCamera}
            onToggleMic={onToggleMic}
            onLeave={onLeave}
          />
        </View>
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
  fullscreenCard: {
    flex: 1,
    borderRadius: 0,
    borderWidth: 0,
    backgroundColor: "#05070C",
    paddingHorizontal: 16,
  },
  copyBlock: {
    gap: 6,
  },
  fullscreenHeader: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: 12,
  },
  fullscreenHeaderCopy: {
    flex: 1,
    gap: 6,
  },
  closeButton: {
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.12)",
    backgroundColor: "rgba(255,255,255,0.06)",
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  closeButtonText: {
    color: "#E7EDF8",
    fontSize: 12,
    fontWeight: "900",
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
  fullscreenTitle: {
    color: "#F7FAFF",
    fontSize: 22,
    fontWeight: "900",
  },
  body: {
    color: "#A8B4CC",
    fontSize: 12.5,
    lineHeight: 18,
    fontWeight: "600",
  },
  fullscreenBody: {
    color: "#9DABCA",
    fontSize: 13,
    lineHeight: 19,
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
  participantStage: {
    gap: 12,
  },
  participantStageFullscreen: {
    flex: 1,
    minHeight: 0,
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
  fullscreenStateCard: {
    flex: 1,
    minHeight: 0,
  },
  stateText: {
    color: "#D7E0F2",
    fontSize: 12.5,
    lineHeight: 18,
    fontWeight: "700",
    textAlign: "center",
  },
  controlsWrap: {
    marginTop: 2,
  },
  controlsWrapFullscreen: {
    paddingTop: 4,
  },
});
