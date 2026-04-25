import { Audio } from "expo-av";
import { useCameraPermissions } from "expo-camera";
import { useLocalSearchParams, useRouter } from "expo-router";
import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import type { MediaStream } from "@livekit/react-native-webrtc";

import { CommunicationPreviewCard } from "../../components/communication/communication-preview-card";
import {
  DEFAULT_APP_CONFIG,
  readAppConfig,
  resolveBrandingConfig,
  resolveFeatureConfig,
  resolveMonetizationConfig,
} from "../../_lib/appConfig";
import {
  resolveRoomAccess,
  type RoomAccessResolution,
} from "../../_lib/accessEntitlements";
import { trackEvent } from "../../_lib/analytics";
import { getBetaAccessBlockCopy, useBetaProgram } from "../../_lib/betaProgram";
import {
  createCommunicationMediaStream,
  createCommunicationRoom,
  formatCommunicationRoomCode,
  getCommunicationRoomByCode,
  getCommunicationRTCModule,
  getCommunicationStreamURL,
  readCommunicationIdentity,
  stopCommunicationStream,
  type CommunicationRoomState,
  type CommunicationIdentity,
} from "../../_lib/communication";
import { reportRuntimeError } from "../../_lib/logger";
import {
  getMonetizationAccessSheetPresentation,
} from "../../_lib/monetization";
import { useSession } from "../../_lib/session";
import { AccessSheet, type AccessSheetReason } from "../../components/monetization/access-sheet";
import { BetaAccessScreen } from "../../components/system/beta-access-screen";

type PermissionState = "unknown" | "granted" | "denied" | "blocked";

const mapMicrophonePermission = (permission: { granted: boolean; canAskAgain: boolean }): PermissionState => {
  if (permission.granted) return "granted";
  return permission.canAskAgain ? "denied" : "blocked";
};

const isAccessSheetReason = (reason: string | null | undefined): reason is AccessSheetReason => (
  reason === "premium_required" || reason === "party_pass_required"
);

const getCommunicationRoomAccessMessage = (access: Pick<RoomAccessResolution, "reason" | "label"> | null | undefined) => {
  if (access?.reason === "room_locked") return "That communication room is locked right now.";
  if (access?.reason === "removed") return "You no longer have access to that communication room.";
  if (access?.reason === "identity_required") return "You need a valid Chi'llywood session before joining this room.";
  if (access && isAccessSheetReason(access.reason)) {
    return `${access.label} access is not currently available for that communication room.`;
  }
  return "That communication room still isn't available for your current access level.";
};

export default function CommunicationLobbyScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ notice?: string }>();
  const { isLoading: authLoading, isSignedIn } = useSession();
  const { accessState, isLoading: betaLoading, isActive } = useBetaProgram();
  const [cameraPermission, requestCameraPermission] = useCameraPermissions();
  const [microphonePermissionState, setMicrophonePermissionState] = useState<PermissionState>("unknown");
  const [identity, setIdentity] = useState<CommunicationIdentity | null>(null);
  const [identityLoading, setIdentityLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [roomCodeInput, setRoomCodeInput] = useState("");
  const [cameraEnabled, setCameraEnabled] = useState(true);
  const [micEnabled, setMicEnabled] = useState(true);
  const [previewStreamURL, setPreviewStreamURL] = useState("");
  const [appConfig, setAppConfig] = useState(DEFAULT_APP_CONFIG);
  const [accessSheetVisible, setAccessSheetVisible] = useState(false);
  const [accessSheetReason, setAccessSheetReason] = useState<AccessSheetReason | null>(null);
  const [pendingJoinRoom, setPendingJoinRoom] = useState<CommunicationRoomState | null>(null);
  const [pendingJoinAccess, setPendingJoinAccess] = useState<RoomAccessResolution | null>(null);

  const previewStreamRef = useRef<MediaStream | null>(null);
  const isRtcAvailable = !!getCommunicationRTCModule();
  const notice = String(Array.isArray(params.notice) ? params.notice[0] : params.notice ?? "").trim();
  const features = resolveFeatureConfig(appConfig);
  const branding = resolveBrandingConfig(appConfig);
  const monetizationConfig = resolveMonetizationConfig(appConfig);
  const canUseCommunication = isSignedIn && isActive;
  const blockedBetaCopy = getBetaAccessBlockCopy(accessState.status, "Communication rooms");

  const cameraPermissionState: PermissionState = cameraPermission?.granted
    ? "granted"
    : cameraPermission && !cameraPermission.canAskAgain
      ? "blocked"
      : cameraPermission
        ? "denied"
        : "unknown";

  useEffect(() => {
    if (!canUseCommunication) {
      setIdentity(null);
      setIdentityLoading(false);
      return;
    }
    let active = true;
    setIdentityLoading(true);

    readCommunicationIdentity()
      .then((resolvedIdentity) => {
        if (!active) return;
        setIdentity(resolvedIdentity);
        setIdentityLoading(false);
      })
      .catch(() => {
        if (!active) return;
        setError("Unable to load your Chi'llywood identity for communication rooms.");
        setIdentityLoading(false);
      });

    readAppConfig()
      .then((config) => {
        if (!active) return;
        setAppConfig(config);
      })
      .catch(() => {
        if (!active) return;
        setAppConfig(DEFAULT_APP_CONFIG);
      });

    Audio.getPermissionsAsync()
      .then((permission) => {
        if (active) setMicrophonePermissionState(mapMicrophonePermission(permission));
      })
      .catch(() => {
        if (active) setMicrophonePermissionState("unknown");
      });

    return () => {
      active = false;
    };
  }, [canUseCommunication]);

  useEffect(() => {
    let active = true;

    const syncPreview = async () => {
      if (!canUseCommunication) {
        stopCommunicationStream(previewStreamRef.current);
        previewStreamRef.current = null;
        setPreviewStreamURL("");
        return;
      }

      if (!isRtcAvailable) {
        setPreviewStreamURL("");
        return;
      }

      const wantsCamera = cameraEnabled;
      const wantsMic = micEnabled;
      const canUseCamera = wantsCamera
        ? (cameraPermission?.granted ? true : !!(await requestCameraPermission()).granted)
        : false;

      let canUseMic = false;
      if (wantsMic) {
        const micPermission = await Audio.requestPermissionsAsync();
        if (!active) return;
        setMicrophonePermissionState(mapMicrophonePermission(micPermission));
        canUseMic = micPermission.granted;
      }

      if (!active) return;

      if (!canUseCamera && !canUseMic) {
        stopCommunicationStream(previewStreamRef.current);
        previewStreamRef.current = null;
        setPreviewStreamURL("");
        return;
      }

      const nextStream = await createCommunicationMediaStream({
        audio: canUseMic,
        video: canUseCamera,
      }).catch(() => null);

      if (!active) {
        stopCommunicationStream(nextStream);
        return;
      }

      stopCommunicationStream(previewStreamRef.current);
      previewStreamRef.current = nextStream;
      setPreviewStreamURL(getCommunicationStreamURL(nextStream));
    };

    void syncPreview();

    return () => {
      active = false;
    };
  }, [cameraEnabled, cameraPermission?.granted, canUseCommunication, isRtcAvailable, micEnabled, requestCameraPermission]);

  useEffect(() => () => {
    stopCommunicationStream(previewStreamRef.current);
    previewStreamRef.current = null;
  }, []);

  const roomCodeValue = useMemo(() => formatCommunicationRoomCode(roomCodeInput), [roomCodeInput]);

  const openRoom = (roomId: string) => {
    router.push({
      pathname: "/communication/[roomId]",
      params: {
        roomId,
        cameraOn: cameraEnabled ? "1" : "0",
        micOn: micEnabled ? "1" : "0",
      },
    });
  };

  const evaluateJoinAccess = async (room: CommunicationRoomState) => {
    const access = await resolveRoomAccess({
      roomSurface: "communication",
      room,
    }).catch(() => null);
    if (!access) {
      setError("Unable to confirm access for that communication room right now.");
      return false;
    }

    if (access.isAllowed) {
      openRoom(room.roomId);
      return true;
    }

    if (isAccessSheetReason(access.reason)) {
      trackEvent("monetization_gate_shown", {
        surface: "communication-lobby",
        reason: access.reason,
        roomId: room.roomId,
      });
      setPendingJoinRoom(room);
      setPendingJoinAccess(access);
      setAccessSheetReason(access.reason);
      setAccessSheetVisible(true);
      return false;
    }

    setError(getCommunicationRoomAccessMessage(access));
    return false;
  };

  const onStartRoom = async () => {
    if (!identity) return;
    if (!features.communicationEnabled) {
      setError("Communication rooms are currently hidden in app configuration.");
      return;
    }
    setSubmitting(true);
    setError(null);
    const result = await createCommunicationRoom(identity.userId);
    setSubmitting(false);

    if ("error" in result) {
      trackEvent("room_create_failure", {
        surface: "communication-lobby",
        reason: result.error.message,
      });
      setError(result.error.message);
      return;
    }

    trackEvent("room_create_success", {
      surface: "communication-lobby",
      roomId: result.roomId,
    });
    openRoom(result.roomId);
  };

  const onJoinRoom = async () => {
    if (!features.communicationEnabled) {
      setError("Communication rooms are currently hidden in app configuration.");
      return;
    }
    const normalizedRoomCode = roomCodeValue;
    if (!normalizedRoomCode) {
      setError("Enter a room code to join an existing communication room.");
      return;
    }

    setSubmitting(true);
    setError(null);
    const room = await getCommunicationRoomByCode(normalizedRoomCode);
    setSubmitting(false);

    if (!room || room.status === "ended") {
      trackEvent("room_join_failure", {
        surface: "communication-lobby",
        reason: "room_unavailable",
        roomCode: normalizedRoomCode,
      });
      setError("That communication room is unavailable or has already ended.");
      return;
    }

    trackEvent("room_join_success", {
      surface: "communication-lobby",
      roomId: room.roomId,
      roomCode: room.roomCode,
    });
    await evaluateJoinAccess(room);
  };

  const onResolveJoinAccess = async (action: "purchase" | "restore") => {
    if (!pendingJoinRoom || !pendingJoinAccess || !accessSheetReason) {
      return {
        message: "Unable to confirm access for that room right now.",
        tone: "error" as const,
      };
    }

    setError(null);

    try {
      const accessKey = String(pendingJoinRoom.linkedPartyId ?? pendingJoinRoom.roomId ?? "").trim();
      if (!accessKey) {
        const message = "That room is missing the access key needed to continue.";
        setError(message);
        return {
          message,
          tone: "error" as const,
        };
      }

      const latestRoom = await getCommunicationRoomByCode(pendingJoinRoom.roomCode).catch(() => null);
      const roomToUse = latestRoom ?? pendingJoinRoom;
      const access = await resolveRoomAccess({
        roomSurface: "communication",
        room: roomToUse,
      }).catch(() => null);

      if (access?.isAllowed) {
        trackEvent("monetization_unlock_success", {
          action,
          surface: "communication-lobby",
          reason: accessSheetReason,
        });
        setPendingJoinRoom(null);
        setPendingJoinAccess(null);
        setAccessSheetReason(null);
        setAccessSheetVisible(false);
        setError(null);
        openRoom(roomToUse.roomId);
        return {
          message: action === "restore" ? "Purchases restored. Opening communication room…" : "Access unlocked. Opening communication room…",
          tone: "success" as const,
        };
      }

      if (access && isAccessSheetReason(access.reason)) {
        setPendingJoinAccess(access);
        setAccessSheetReason(access.reason);
        const message = access.monetization.issues[0] ?? getCommunicationRoomAccessMessage(access);
        trackEvent("monetization_unlock_failure", {
          action,
          surface: "communication-lobby",
          reason: access.reason,
        });
        setError(message);
        return {
          message,
          tone: "error" as const,
        };
      }

      const message = getCommunicationRoomAccessMessage(access);
      trackEvent("monetization_unlock_failure", {
        action,
        surface: "communication-lobby",
        reason: accessSheetReason,
      });
      setError(message);
      return {
        message,
        tone: "error" as const,
      };
    } catch (error) {
      reportRuntimeError("communication-lobby-unlock", error, {
        action,
        reason: accessSheetReason,
      });
      const message = "Unable to confirm access for that room right now.";
      setError(message);
      return {
        message,
        tone: "error" as const,
      };
    }
  };

  if (authLoading || betaLoading) {
    return (
      <BetaAccessScreen
        title="Loading communication access"
        body="Checking your signed-in session before opening communication create and join controls."
        loadingOverride
      />
    );
  }

  if (!isSignedIn) {
    return (
      <BetaAccessScreen
        title="Sign in to create or join communication rooms"
        body="Communication uses your signed-in Chi'llywood identity so room membership, moderation, and reconnect truth stay trustworthy."
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

  return (
    <View style={styles.outer}>
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => router.back()} activeOpacity={0.8}>
            <Text style={styles.backArrow}>←</Text>
          </TouchableOpacity>
          <Text style={styles.headerKicker}>{branding.appDisplayName.toUpperCase()} · COMMUNICATION</Text>
          <View style={{ width: 18 }} />
        </View>

        <View style={styles.heroCard}>
          <Text style={styles.heroKicker}>IN-APP CALL ROOM</Text>
          <Text style={styles.heroTitle}>Audio and video, inside {branding.appDisplayName}.</Text>
          <Text style={styles.heroBody}>
            Start a 1:1 call or a small group room with the same identity you already use across your channel, rooms, and live surfaces.
          </Text>
        </View>

        {notice ? (
          <View style={styles.noticeCard}>
            <Text style={styles.noticeText}>{notice}</Text>
          </View>
        ) : null}

        {error ? (
          <View style={styles.errorCard}>
            <Text style={styles.errorText}>{error}</Text>
          </View>
        ) : null}

        {!isRtcAvailable ? (
          <View style={styles.blockedCard}>
            <Text style={styles.blockedTitle}>Native build required</Text>
            <Text style={styles.blockedBody}>
              Communication rooms need a development build with native RTC support. Expo Go and web are not enough for this foundation.
            </Text>
          </View>
        ) : null}

        {!features.communicationEnabled ? (
          <View style={styles.blockedCard}>
            <Text style={styles.blockedTitle}>Communication hidden</Text>
            <Text style={styles.blockedBody}>
              Communication entry is currently turned off in app configuration.
            </Text>
          </View>
        ) : null}

        <CommunicationPreviewCard
          displayName={identity?.displayName || "Chi'llywood User"}
          avatarUrl={identity?.avatarUrl}
          tagline={identity?.tagline}
          streamURL={previewStreamURL}
          cameraEnabled={cameraEnabled}
          micEnabled={micEnabled}
          cameraPermissionState={cameraPermissionState}
          microphonePermissionState={microphonePermissionState}
        />

        <View style={styles.identityCard}>
          <Text style={styles.identityKicker}>YOUR IDENTITY</Text>
          {identityLoading ? (
            <View style={styles.identityLoadingRow}>
              <ActivityIndicator color="#C8D0E2" />
              <Text style={styles.identityLoadingText}>Loading your Chi&apos;llywood profile…</Text>
            </View>
          ) : (
            <>
              <Text style={styles.identityName}>{identity?.displayName || "Chi'llywood User"}</Text>
              {identity?.tagline ? <Text style={styles.identityTagline}>{identity.tagline}</Text> : null}
              <Text style={styles.identityBody}>
                This room will keep your current Chi&apos;llywood identity. No second profile or separate account flow is created for communication.
              </Text>
            </>
          )}
        </View>

        <View style={styles.actionCard}>
          <Text style={styles.cardKicker}>MEDIA CONTROLS</Text>
          <View style={styles.toggleRow}>
            <TouchableOpacity
              style={[styles.toggleButton, cameraEnabled ? styles.toggleButtonOn : styles.toggleButtonOff]}
              activeOpacity={0.86}
              onPress={() => setCameraEnabled((prev) => !prev)}
            >
              <Text style={styles.toggleButtonText}>{cameraEnabled ? "Camera On" : "Camera Off"}</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.toggleButton, micEnabled ? styles.toggleButtonOn : styles.toggleButtonOff]}
              activeOpacity={0.86}
              onPress={() => setMicEnabled((prev) => !prev)}
            >
              <Text style={styles.toggleButtonText}>{micEnabled ? "Mic On" : "Mic Muted"}</Text>
            </TouchableOpacity>
          </View>

          <Text style={styles.cardKicker}>JOIN BY CODE</Text>
          <TextInput
            value={roomCodeInput}
            onChangeText={(value) => setRoomCodeInput(formatCommunicationRoomCode(value))}
            placeholder="Enter room code"
            placeholderTextColor="#727C92"
            autoCapitalize="characters"
            autoCorrect={false}
            style={styles.input}
          />

          <View style={styles.primaryRow}>
            <TouchableOpacity
              style={[
                styles.primaryButton,
                styles.primaryButtonSolid,
                (!isRtcAvailable || submitting || identityLoading || !features.communicationEnabled) && styles.primaryButtonDisabled,
              ]}
              activeOpacity={0.86}
              onPress={onStartRoom}
              disabled={!isRtcAvailable || submitting || identityLoading || !features.communicationEnabled}
            >
              <Text style={[styles.primaryButtonText, styles.primaryButtonTextSolid]}>
                {submitting ? "Starting…" : "Start Room"}
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[
                styles.primaryButton,
                styles.primaryButtonOutline,
                (!isRtcAvailable || submitting || !features.communicationEnabled) && styles.primaryButtonDisabled,
              ]}
              activeOpacity={0.86}
              onPress={onJoinRoom}
              disabled={!isRtcAvailable || submitting || !features.communicationEnabled}
            >
              <Text style={styles.primaryButtonText}>{submitting ? "Joining…" : "Join Room"}</Text>
            </TouchableOpacity>
          </View>

          <Text style={styles.helperText}>
            Communication rooms support 1:1 and small-group mesh calls for up to four active participants in this first foundation pass.
          </Text>
        </View>
      </ScrollView>
      {accessSheetReason ? (
        <AccessSheet
          visible={accessSheetVisible}
          reason={accessSheetReason}
          gate={pendingJoinAccess}
          appDisplayName={branding.appDisplayName}
          premiumUpsellTitle={monetizationConfig.premiumUpsellTitle}
          premiumUpsellBody={monetizationConfig.premiumUpsellBody}
          kickerOverride={pendingJoinAccess ? getMonetizationAccessSheetPresentation({
            gate: pendingJoinAccess,
            appDisplayName: branding.appDisplayName,
            premiumUpsellTitle: monetizationConfig.premiumUpsellTitle,
            premiumUpsellBody: monetizationConfig.premiumUpsellBody,
          }).kicker : undefined}
          titleOverride={pendingJoinAccess ? getMonetizationAccessSheetPresentation({
            gate: pendingJoinAccess,
            appDisplayName: branding.appDisplayName,
            premiumUpsellTitle: monetizationConfig.premiumUpsellTitle,
            premiumUpsellBody: monetizationConfig.premiumUpsellBody,
          }).title : undefined}
          bodyOverride={pendingJoinAccess ? getMonetizationAccessSheetPresentation({
            gate: pendingJoinAccess,
            appDisplayName: branding.appDisplayName,
            premiumUpsellTitle: monetizationConfig.premiumUpsellTitle,
            premiumUpsellBody: monetizationConfig.premiumUpsellBody,
          }).body : undefined}
          actionLabelOverride={pendingJoinAccess ? getMonetizationAccessSheetPresentation({
            gate: pendingJoinAccess,
            appDisplayName: branding.appDisplayName,
            premiumUpsellTitle: monetizationConfig.premiumUpsellTitle,
            premiumUpsellBody: monetizationConfig.premiumUpsellBody,
          }).actionLabel : undefined}
          onPurchaseResult={(result) => {
            if (!result.ok) {
              trackEvent("monetization_unlock_failure", {
                action: "purchase",
                surface: "communication-lobby",
                reason: accessSheetReason ?? "unknown",
              });
              setError(result.message);
              return;
            }
            return onResolveJoinAccess("purchase");
          }}
          onRestoreResult={(result) => {
            if (!result.ok) {
              trackEvent("monetization_unlock_failure", {
                action: "restore",
                surface: "communication-lobby",
                reason: accessSheetReason ?? "unknown",
              });
              setError(result.message);
              return;
            }
            return onResolveJoinAccess("restore");
          }}
          onClose={() => setAccessSheetVisible(false)}
        />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  outer: {
    flex: 1,
    backgroundColor: "#06070B",
  },
  content: {
    paddingTop: 56,
    paddingBottom: 44,
    paddingHorizontal: 18,
    gap: 14,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  backArrow: {
    color: "#B7C0D6",
    fontSize: 20,
    fontWeight: "700",
    paddingRight: 8,
  },
  headerKicker: {
    color: "#68738A",
    fontSize: 10,
    fontWeight: "900",
    letterSpacing: 1.2,
  },
  heroCard: {
    borderRadius: 20,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.1)",
    backgroundColor: "rgba(13,14,20,0.96)",
    padding: 18,
    gap: 8,
  },
  heroKicker: {
    color: "#7A859D",
    fontSize: 10,
    fontWeight: "900",
    letterSpacing: 1.1,
  },
  heroTitle: {
    color: "#F3F6FB",
    fontSize: 24,
    fontWeight: "900",
  },
  heroBody: {
    color: "#A4AEC4",
    fontSize: 13,
    lineHeight: 19,
    fontWeight: "600",
  },
  noticeCard: {
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "rgba(88,156,255,0.22)",
    backgroundColor: "rgba(29,41,70,0.72)",
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  noticeText: {
    color: "#E0E7FF",
    fontSize: 12.5,
    lineHeight: 18,
    fontWeight: "700",
  },
  errorCard: {
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "rgba(220,20,60,0.24)",
    backgroundColor: "rgba(69,18,28,0.74)",
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  errorText: {
    color: "#FFD8DF",
    fontSize: 12.5,
    lineHeight: 18,
    fontWeight: "700",
  },
  blockedCard: {
    borderRadius: 18,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.1)",
    backgroundColor: "rgba(13,14,20,0.96)",
    padding: 16,
    gap: 6,
  },
  blockedTitle: {
    color: "#F4F6FB",
    fontSize: 17,
    fontWeight: "900",
  },
  blockedBody: {
    color: "#A4AEC4",
    fontSize: 13,
    lineHeight: 18,
    fontWeight: "600",
  },
  identityCard: {
    borderRadius: 18,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.1)",
    backgroundColor: "rgba(13,14,20,0.96)",
    padding: 16,
    gap: 8,
  },
  identityKicker: {
    color: "#7A859D",
    fontSize: 10,
    fontWeight: "900",
    letterSpacing: 1.1,
  },
  identityLoadingRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  identityLoadingText: {
    color: "#B9C2D7",
    fontSize: 13,
    fontWeight: "700",
  },
  identityName: {
    color: "#F4F7FC",
    fontSize: 20,
    fontWeight: "900",
  },
  identityTagline: {
    color: "#B2BCD2",
    fontSize: 13,
    lineHeight: 18,
    fontWeight: "600",
  },
  identityBody: {
    color: "#8E99B2",
    fontSize: 12.5,
    lineHeight: 18,
    fontWeight: "600",
  },
  actionCard: {
    borderRadius: 18,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.1)",
    backgroundColor: "rgba(13,14,20,0.96)",
    padding: 16,
    gap: 12,
  },
  cardKicker: {
    color: "#7A859D",
    fontSize: 10,
    fontWeight: "900",
    letterSpacing: 1.1,
  },
  toggleRow: {
    flexDirection: "row",
    gap: 10,
  },
  toggleButton: {
    flex: 1,
    minHeight: 46,
    borderRadius: 14,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 12,
  },
  toggleButtonOn: {
    borderColor: "rgba(70,214,135,0.28)",
    backgroundColor: "rgba(22,67,41,0.84)",
  },
  toggleButtonOff: {
    borderColor: "rgba(255,255,255,0.1)",
    backgroundColor: "rgba(18,21,29,0.94)",
  },
  toggleButtonText: {
    color: "#F0F4FB",
    fontSize: 12.5,
    fontWeight: "900",
  },
  input: {
    minHeight: 46,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.1)",
    backgroundColor: "rgba(8,10,15,0.92)",
    color: "#F3F6FB",
    paddingHorizontal: 14,
    fontSize: 15,
    fontWeight: "800",
    letterSpacing: 1.1,
  },
  primaryRow: {
    flexDirection: "row",
    gap: 10,
  },
  primaryButton: {
    flex: 1,
    minHeight: 48,
    borderRadius: 14,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 14,
  },
  primaryButtonSolid: {
    borderColor: "rgba(255,255,255,0.16)",
    backgroundColor: "#F3F4F8",
  },
  primaryButtonOutline: {
    borderColor: "rgba(255,255,255,0.12)",
    backgroundColor: "rgba(255,255,255,0.05)",
  },
  primaryButtonDisabled: {
    opacity: 0.55,
  },
  primaryButtonText: {
    color: "#EEF2FA",
    fontSize: 13.5,
    fontWeight: "900",
  },
  primaryButtonTextSolid: {
    color: "#080A10",
  },
  helperText: {
    color: "#8E99B2",
    fontSize: 12.5,
    lineHeight: 18,
    fontWeight: "600",
  },
});
