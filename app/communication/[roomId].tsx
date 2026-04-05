import { useLocalSearchParams, useRouter } from "expo-router";
import React, { useCallback, useMemo, useRef, useState } from "react";
import { ScrollView, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { CommunicationControlBar } from "../../components/communication/communication-control-bar";
import { CommunicationParticipantGrid } from "../../components/communication/communication-participant-grid";
import { CommunicationRoomHeader } from "../../components/communication/communication-room-header";
import { ReportSheet } from "../../components/safety/report-sheet";
import { BetaAccessScreen } from "../../components/system/beta-access-screen";
import { getBetaAccessBlockCopy, useBetaProgram } from "../../_lib/betaProgram";
import { buildSafetyReportContext, submitSafetyReport, trackModerationActionUsed } from "../../_lib/moderation";
import { useSession } from "../../_lib/session";
import { useCommunicationRoomSession } from "../../hooks/use-communication-room-session";

type SearchParams = {
  roomId?: string;
  cameraOn?: string;
  micOn?: string;
  returnTo?: string;
  returnPartyId?: string;
  returnMode?: string;
  returnSource?: string;
};

const parseBooleanParam = (value: string) => {
  const normalized = String(value ?? "").trim().toLowerCase();
  return normalized === "1" || normalized === "true" || normalized === "yes" || normalized === "on";
};

export default function CommunicationRoomScreen() {
  const router = useRouter();
  const { isLoading: authLoading, isSignedIn } = useSession();
  const { accessState, isLoading: betaLoading, isActive } = useBetaProgram();
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<SearchParams>();
  const roomId = String(Array.isArray(params.roomId) ? params.roomId[0] : params.roomId ?? "").trim();
  const initialCameraOn = parseBooleanParam(String(Array.isArray(params.cameraOn) ? params.cameraOn[0] : params.cameraOn ?? "1"));
  const initialMicOn = parseBooleanParam(String(Array.isArray(params.micOn) ? params.micOn[0] : params.micOn ?? "1"));
  const returnTarget = String(Array.isArray(params.returnTo) ? params.returnTo[0] : params.returnTo ?? "").trim().toLowerCase();
  const returnPartyId = String(Array.isArray(params.returnPartyId) ? params.returnPartyId[0] : params.returnPartyId ?? "").trim();
  const returnMode = String(Array.isArray(params.returnMode) ? params.returnMode[0] : params.returnMode ?? "").trim();
  const returnSource = String(Array.isArray(params.returnSource) ? params.returnSource[0] : params.returnSource ?? "").trim();
  const canUseCommunicationRoom = isSignedIn && isActive;
  const blockedBetaCopy = getBetaAccessBlockCopy(accessState.status, "Communication rooms");

  const [redirectReason, setRedirectReason] = useState<"host-left" | "ended" | "room-full" | null>(null);
  const [reportVisible, setReportVisible] = useState(false);
  const [reportBusy, setReportBusy] = useState(false);
  const redirectTriggeredRef = useRef(false);

  const initialMediaPreferences = useMemo(
    () => ({
      cameraEnabled: initialCameraOn,
      micEnabled: initialMicOn,
    }),
    [initialCameraOn, initialMicOn],
  );

  const {
    room,
    identity,
    loading,
    error,
    channelState,
    isRtcAvailable,
    cameraEnabled,
    micEnabled,
    participants,
    participantCount,
    toggleCamera,
    toggleMic,
    leaveRoom,
  } = useCommunicationRoomSession({
    roomId,
    initialMediaPreferences,
    onRoomEnded: setRedirectReason,
    enabled: canUseCommunicationRoom,
  });

  const leaveLabel = useMemo(() => {
    if (redirectReason === "room-full") return "This room is already full.";
    if (redirectReason === "host-left") return "The host ended this communication room.";
    if (redirectReason === "ended") return "This communication room has ended.";
    return "You left the communication room.";
  }, [redirectReason]);

  const navigateAfterLeave = useCallback((notice: string) => {
    if (returnTarget) {
      if (router.canGoBack()) {
        router.back();
        return;
      }

      if (returnPartyId && returnTarget === "live-stage") {
        router.replace({
          pathname: "/watch-party/live-stage/[partyId]",
          params: {
            partyId: returnPartyId,
            ...(returnMode ? { mode: returnMode } : {}),
            ...(returnSource ? { source: returnSource } : {}),
          },
        });
        return;
      }

      if (returnPartyId && returnTarget === "watch-party") {
        router.replace({
          pathname: "/watch-party/[partyId]",
          params: {
            partyId: returnPartyId,
            ...(returnMode ? { mode: returnMode } : {}),
            ...(returnSource ? { source: returnSource } : {}),
          },
        });
        return;
      }
    }

    if (router.canGoBack()) {
      router.back();
      return;
    }

    router.replace({
      pathname: "/communication",
      params: { notice },
    });
  }, [returnMode, returnPartyId, returnSource, returnTarget, router]);

  React.useEffect(() => {
    if (!redirectReason || redirectTriggeredRef.current) return;
    redirectTriggeredRef.current = true;
    navigateAfterLeave(leaveLabel);
  }, [leaveLabel, navigateAfterLeave, redirectReason]);

  const onLeave = useCallback(async () => {
    const isHost = !!room && !!identity && room.hostUserId === identity.userId;
    await leaveRoom({ endRoomIfHost: isHost });
    redirectTriggeredRef.current = true;
    navigateAfterLeave(isHost ? "You ended the communication room." : "You left the communication room.");
  }, [identity, leaveRoom, navigateAfterLeave, room]);

  const onSubmitRoomReport = useCallback(async (input: { category: Parameters<typeof submitSafetyReport>[0]["category"]; note: string }) => {
    if (!room) return;
    setReportBusy(true);
    try {
      await submitSafetyReport({
        targetType: "room",
        targetId: room.roomId,
        category: input.category,
        note: input.note,
        roomId: room.roomId,
        context: buildSafetyReportContext({
          sourceSurface: "communication-room",
          sourceRoute: `/communication/${room.roomId}`,
          targetLabel: room.roomCode ?? room.roomId,
          targetRoleLabel: "Room",
          context: {
            linkedPartyId: room.linkedPartyId ?? null,
            linkedRoomCode: room.linkedRoomCode ?? null,
            linkedRoomMode: room.linkedRoomMode ?? null,
          },
        }),
      });
      setReportVisible(false);
    } finally {
      setReportBusy(false);
    }
  }, [room]);

  if (authLoading || betaLoading) {
    return (
      <BetaAccessScreen
        title="Loading communication access"
        body="Checking your signed-in session before joining this communication room."
        loadingOverride
      />
    );
  }

  if (!isSignedIn) {
    return (
      <BetaAccessScreen
        title="Sign in to join communication rooms"
        body="Communication rooms require a signed-in Chi'llywood identity so membership truth and reconnect handling stay consistent."
      />
    );
  }

  if (!isActive) {
    return (
      <BetaAccessScreen
        title={blockedBetaCopy.title}
        body={blockedBetaCopy.body}
        accessState={accessState.status === "loading" || accessState.status === "signed_out" || accessState.status === "active" ? null : accessState.status}
      />
    );
  }

  if (!roomId) {
    return (
      <View style={styles.emptyState}>
        <Text style={styles.emptyTitle}>Missing communication room</Text>
        <Text style={styles.emptyBody}>Open a communication lobby first, then create or join a room from there.</Text>
      </View>
    );
  }

  if (!isRtcAvailable) {
    return (
      <View style={styles.emptyState}>
        <Text style={styles.emptyTitle}>Native build required</Text>
        <Text style={styles.emptyBody}>Communication rooms need a development build with native RTC support.</Text>
      </View>
    );
  }

  return (
    <View style={styles.outer}>
      <ScrollView
        contentContainerStyle={[
          styles.content,
          { paddingTop: Math.max(24, insets.top + 12), paddingBottom: Math.max(34, insets.bottom + 18) },
        ]}
      >
        <CommunicationRoomHeader
          roomCode={room?.roomCode || roomId}
          participantCount={participantCount}
          isHost={!!room && !!identity && room.hostUserId === identity.userId}
          channelState={channelState}
          linkedRoomCode={room?.linkedRoomCode}
          linkedRoomMode={room?.linkedRoomMode}
          onLeave={onLeave}
          onReportRoom={() => {
            trackModerationActionUsed({
              surface: "communication-room",
              action: "open_safety_report",
              targetType: "room",
              targetId: room?.roomId ?? roomId,
              roomId: room?.roomId ?? roomId,
              sourceRoute: `/communication/${room?.roomId ?? roomId}`,
            });
            setReportVisible(true);
          }}
        />

        {loading ? (
          <View style={styles.statusCard}>
            <Text style={styles.statusTitle}>Joining communication room…</Text>
            <Text style={styles.statusBody}>Bringing your local media and room presence online.</Text>
          </View>
        ) : null}

        {error && !redirectReason ? (
          <View style={styles.errorCard}>
            <Text style={styles.errorTitle}>Connection update</Text>
            <Text style={styles.errorBody}>{error}</Text>
          </View>
        ) : null}

        <View style={styles.sectionCard}>
          <Text style={styles.sectionKicker}>PARTICIPANTS</Text>
          <Text style={styles.sectionTitle}>
            {participantCount > 1 ? `${participantCount} people connected` : "1 person connected"}
          </Text>
          <Text style={styles.sectionBody}>
            This first in-app communication foundation is optimized for 1:1 calls and small group rooms up to four active participants.
          </Text>
        </View>

        <CommunicationParticipantGrid participants={participants} />
      </ScrollView>

      <View style={[styles.controlDock, { paddingBottom: Math.max(16, insets.bottom + 4) }]}>
        <CommunicationControlBar
          cameraEnabled={cameraEnabled}
          micEnabled={micEnabled}
          onToggleCamera={toggleCamera}
          onToggleMic={toggleMic}
          onLeave={onLeave}
        />
      </View>

      <ReportSheet
        visible={reportVisible}
        title="Report communication room"
        description="Send a safety report for this communication session if the room feels abusive, unsafe, or misused."
        busy={reportBusy}
        onSubmit={onSubmitRoomReport}
        onClose={() => setReportVisible(false)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  outer: {
    flex: 1,
    backgroundColor: "#06070B",
  },
  content: {
    paddingHorizontal: 18,
    gap: 14,
  },
  emptyState: {
    flex: 1,
    paddingHorizontal: 24,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#06070B",
    gap: 10,
  },
  emptyTitle: {
    color: "#F4F7FC",
    fontSize: 22,
    fontWeight: "900",
    textAlign: "center",
  },
  emptyBody: {
    color: "#A4AEC4",
    fontSize: 14,
    lineHeight: 20,
    fontWeight: "600",
    textAlign: "center",
  },
  statusCard: {
    borderRadius: 18,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.1)",
    backgroundColor: "rgba(13,14,20,0.96)",
    padding: 16,
    gap: 6,
  },
  statusTitle: {
    color: "#F3F6FB",
    fontSize: 16,
    fontWeight: "900",
  },
  statusBody: {
    color: "#A4AEC4",
    fontSize: 13,
    lineHeight: 18,
    fontWeight: "600",
  },
  errorCard: {
    borderRadius: 18,
    borderWidth: 1,
    borderColor: "rgba(220,20,60,0.24)",
    backgroundColor: "rgba(69,18,28,0.72)",
    padding: 16,
    gap: 6,
  },
  errorTitle: {
    color: "#FFF0F3",
    fontSize: 16,
    fontWeight: "900",
  },
  errorBody: {
    color: "#FFD8DF",
    fontSize: 13,
    lineHeight: 18,
    fontWeight: "600",
  },
  sectionCard: {
    borderRadius: 18,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.1)",
    backgroundColor: "rgba(13,14,20,0.96)",
    padding: 16,
    gap: 6,
  },
  sectionKicker: {
    color: "#7A859D",
    fontSize: 10,
    fontWeight: "900",
    letterSpacing: 1.1,
  },
  sectionTitle: {
    color: "#F4F7FC",
    fontSize: 18,
    fontWeight: "900",
  },
  sectionBody: {
    color: "#A4AEC4",
    fontSize: 12.5,
    lineHeight: 18,
    fontWeight: "600",
  },
  controlDock: {
    borderTopWidth: 1,
    borderTopColor: "rgba(255,255,255,0.08)",
    backgroundColor: "rgba(8,10,15,0.96)",
    paddingTop: 12,
    paddingHorizontal: 18,
  },
});
