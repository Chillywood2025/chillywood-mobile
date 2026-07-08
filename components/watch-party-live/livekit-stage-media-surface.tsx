import "../../_lib/livekit/dom-exception-polyfill";

import { ConnectionState, Room, Track } from "livekit-client";
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  AppState,
  Image,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  type AppStateStatus,
  type StyleProp,
  type ViewStyle,
} from "react-native";

import { debugLog, reportRuntimeError } from "../../_lib/logger";
import {
  LIVE_VIDEO_CAPTURE_OPTIONS,
  createLiveKitV1RoomOptions,
} from "../../_lib/performancePolicy";
import {
  LiveKitAudioSession as AudioSession,
  LiveKitRoom,
  LiveKitVideoTrack as VideoTrack,
  isLiveKitTrackReference as isTrackReference,
  useLiveKitConnectionState as useConnectionState,
  useLiveKitLocalParticipant as useLocalParticipant,
  useLiveKitTracks as useTracks,
} from "../../_lib/livekit/react-native-module";
import type { LiveKitTokenReady } from "../../_lib/livekit/token-contract";

export type LiveKitStageParticipantRosterEntry = {
  identity: string;
  participantId?: string;
  label: string;
  role?: "host" | "speaker" | "viewer" | "listener";
  canPublish?: boolean;
  isRequestingToSpeak?: boolean;
  isCurrentUser?: boolean;
  identityAliases?: string[];
};

type LiveKitStageMediaSurfaceProps = {
  joinContract: LiveKitTokenReady;
  onFallback: (reason: "connection_timeout" | "disconnected" | "room_error") => void;
  active?: boolean;
  containerStyle?: StyleProp<ViewStyle>;
  fillParent?: boolean;
  layout?: "stage" | "bubble-grid";
  participantLabelsByIdentity?: Record<string, string>;
  participantAvatarUrlsByIdentity?: Record<string, string>;
  localParticipantFallback?: React.ReactNode;
  participantRoster?: LiveKitStageParticipantRosterEntry[];
  onParticipantPress?: (identity: string) => void;
  currentParticipantIdentity?: string;
  currentParticipantIdentityAliases?: string[];
  showRequestIndicators?: boolean;
  surfaceLabel?: string;
  publishLocalAudio?: boolean;
  publishLocalVideo?: boolean;
};

type LiveKitStageMediaContentProps = {
  joinContract: LiveKitTokenReady;
  layout: "stage" | "bubble-grid";
  participantLabelsByIdentity?: Record<string, string>;
  participantAvatarUrlsByIdentity?: Record<string, string>;
  localParticipantFallback?: React.ReactNode;
  participantRoster?: LiveKitStageParticipantRosterEntry[];
  onParticipantPress?: (identity: string) => void;
  currentParticipantIdentity?: string;
  currentParticipantIdentityAliases?: string[];
  showRequestIndicators: boolean;
  surfaceLabel: string;
  publishLocalAudio: boolean;
  publishLocalVideo: boolean;
  mediaDeviceFailure: string | null;
};

type RenderableLiveKitTrackReference = NonNullable<React.ComponentProps<typeof VideoTrack>["trackRef"]>;

type BubbleGridItem = {
  identity: string;
  participantId: string;
  key: string;
  label: string;
  role: LiveKitStageParticipantRosterEntry["role"] | null;
  canPublish: boolean;
  isRequestingToSpeak: boolean;
  trackRef: RenderableLiveKitTrackReference | null;
  avatarUrl: string | null;
  isCurrentParticipant: boolean;
};

const isRenderableTrackReference = (trackRef: unknown): trackRef is RenderableLiveKitTrackReference => (
  isTrackReference(trackRef)
);

const LIVEKIT_CONNECT_TIMEOUT_MILLIS = 30_000;
const LIVEKIT_DISCONNECT_FALLBACK_GRACE_MILLIS = 4_500;

type LiveKitSignalClientPatchable = {
  startReadingLoop?: (...args: unknown[]) => Promise<unknown>;
  handleWSError?: (error: unknown) => void;
  __chillywoodStageReadingLoopPatched?: boolean;
};

const getErrorMessage = (error: unknown) => (
  error instanceof Error ? error.message : String(error ?? "")
);

const isTransientSignalReadLoopError = (error: unknown) => {
  if (typeof error === "object" && error !== null && !(error instanceof Error)) {
    return true;
  }

  const normalizedMessage = getErrorMessage(error).toLowerCase();
  return normalizedMessage.includes("software caused connection abort")
    || normalizedMessage.includes("abort")
    || normalizedMessage.includes("1006")
    || normalizedMessage.includes("websocket")
    || normalizedMessage.includes("network request failed");
};

const isConnectedishState = (state: unknown) => (
  state === ConnectionState.Connected
  || state === ConnectionState.Connecting
  || state === ConnectionState.Reconnecting
  || state === ConnectionState.SignalReconnecting
);

const isClientInitiatedDisconnectReason = (reason: unknown) => {
  const normalizedReason = String(reason ?? "").toLowerCase();
  return normalizedReason.includes("client") || normalizedReason.includes("user initiated");
};

export const patchLiveKitSignalReadingLoop = (
  room: Room,
  surfaceLabel: string,
  shouldSuppressError?: () => boolean,
) => {
  const client = (room as unknown as {
    engine?: { client?: LiveKitSignalClientPatchable };
  }).engine?.client;

  if (!client || client.__chillywoodStageReadingLoopPatched || typeof client.startReadingLoop !== "function") {
    return;
  }

  const originalStartReadingLoop = client.startReadingLoop.bind(client);

  client.startReadingLoop = async (...args: unknown[]) => {
    try {
      return await originalStartReadingLoop(...args);
    } catch (error) {
      if (shouldSuppressError?.()) {
        debugLog("livekit", "suppressed stale stage signal read loop error", {
          surfaceLabel,
          error: getErrorMessage(error),
        });
        return undefined;
      }
      if (isTransientSignalReadLoopError(error)) {
        debugLog("livekit", "suppressed transient stage signal read loop error", {
          surfaceLabel,
          error: getErrorMessage(error),
        });
        return undefined;
      }
      debugLog("livekit", "contained stage signal read loop error", {
        surfaceLabel,
        error: getErrorMessage(error),
      });
      client.handleWSError?.(error);
      return undefined;
    }
  };
  client.__chillywoodStageReadingLoopPatched = true;
};

const toConnectionLabel = (connectionState: unknown) => {
  const normalized = String(connectionState ?? "").trim();
  if (!normalized) return "Connecting";
  return normalized.replace(/_/g, " ").replace(/\b\w/g, (character) => character.toUpperCase());
};

const getParticipantLabel = (
  identity: string,
  currentIdentity: string,
  participantLabelsByIdentity?: Record<string, string>,
  participantRosterByIdentity?: Map<string, LiveKitStageParticipantRosterEntry>,
  currentIdentityAliases?: Set<string>,
) => {
  if (identity === currentIdentity || currentIdentityAliases?.has(identity)) return "You";
  const rosterEntry = participantRosterByIdentity?.get(identity);
  if (rosterEntry?.isCurrentUser) return "You";
  const candidate = String(rosterEntry?.label ?? participantLabelsByIdentity?.[identity] ?? "").trim();
  const normalizedCandidate = candidate.toLowerCase();
  if (candidate && normalizedCandidate !== "you" && normalizedCandidate !== "me") {
    return candidate;
  }
  return rosterEntry?.role === "host" ? "Host" : "Guest";
};

const normalizeIdentityList = (...values: unknown[]) => {
  const seen = new Set<string>();
  const identities: string[] = [];
  values.forEach((value) => {
    if (Array.isArray(value)) {
      value.forEach((entry) => {
        const normalized = String(entry ?? "").trim();
        if (!normalized || seen.has(normalized)) return;
        seen.add(normalized);
        identities.push(normalized);
      });
      return;
    }
    const normalized = String(value ?? "").trim();
    if (!normalized || seen.has(normalized)) return;
    seen.add(normalized);
    identities.push(normalized);
  });
  return identities;
};

const getParticipantInitials = (label: string) => {
  const clean = String(label || "").trim();
  if (!clean) return "?";
  const words = clean.split(/\s+/).filter(Boolean);
  if (words.length >= 2) return `${words[0][0] ?? ""}${words[1][0] ?? ""}`.toUpperCase();
  return clean.slice(0, 2).toUpperCase();
};

function LiveKitStageMediaContent({
  joinContract,
  layout,
  participantLabelsByIdentity,
  participantAvatarUrlsByIdentity,
  localParticipantFallback,
  participantRoster,
  onParticipantPress,
  currentParticipantIdentity,
  currentParticipantIdentityAliases,
  showRequestIndicators,
  surfaceLabel,
  publishLocalAudio,
  publishLocalVideo,
  mediaDeviceFailure,
}: LiveKitStageMediaContentProps) {
  const connectionState = useConnectionState();
  const {
    cameraTrack,
    isCameraEnabled,
    isMicrophoneEnabled,
    lastCameraError,
    lastMicrophoneError,
    localParticipant,
  } = useLocalParticipant();
  const currentIdentitySet = useMemo(() => new Set(normalizeIdentityList(
    localParticipant.identity,
    currentParticipantIdentity,
    currentParticipantIdentityAliases ?? [],
  )), [currentParticipantIdentity, currentParticipantIdentityAliases, localParticipant.identity]);
  const isCurrentLiveKitIdentity = useCallback(
    (identity: unknown) => {
      const normalized = String(identity ?? "").trim();
      return !!normalized && currentIdentitySet.has(normalized);
    },
    [currentIdentitySet],
  );
  const shouldPublishLocalCamera = publishLocalVideo && joinContract.participantRole !== "viewer";
  const tracks = useTracks(
    [
      { source: Track.Source.ScreenShare, withPlaceholder: false },
      { source: Track.Source.Camera, withPlaceholder: false },
    ],
    { onlySubscribed: true },
  );
  const renderableTracks = useMemo(
    () => tracks.filter(isRenderableTrackReference),
    [tracks],
  );
  const remoteTracks = useMemo(
    () => renderableTracks.filter((trackRef) => !isCurrentLiveKitIdentity(trackRef.participant.identity)),
    [isCurrentLiveKitIdentity, renderableTracks],
  );
  const remoteCameraTracks = useMemo(
    () => remoteTracks.filter((trackRef) => trackRef.source === Track.Source.Camera),
    [remoteTracks],
  );
  const participantRosterByIdentity = useMemo(() => {
    const next = new Map<string, LiveKitStageParticipantRosterEntry>();
    (participantRoster ?? []).forEach((entry) => {
      const identity = String(entry.identity ?? "").trim();
      if (!identity || next.has(identity)) return;
      next.set(identity, {
        ...entry,
        identity,
        participantId: String(entry.participantId ?? entry.identity ?? "").trim(),
        label: String(entry.label ?? "").trim(),
        identityAliases: normalizeIdentityList(entry.identity, entry.participantId, entry.identityAliases ?? []),
      });
    });
    return next;
  }, [participantRoster]);
  const primaryRemoteTrack = remoteTracks[0] ?? null;
  const publishedLocalCameraTrackRef = useMemo(
    () => renderableTracks.find((trackRef) => (
      trackRef.participant.identity === localParticipant.identity
      && trackRef.source === Track.Source.Camera
    )) ?? null,
    [localParticipant.identity, renderableTracks],
  );
  const directLocalCameraTrackRef = useMemo<RenderableLiveKitTrackReference | null>(() => {
    if (!shouldPublishLocalCamera || !cameraTrack) return null;
    const trackRef = {
      participant: localParticipant,
      publication: cameraTrack,
      source: Track.Source.Camera,
    };
    return isRenderableTrackReference(trackRef) ? trackRef : null;
  }, [cameraTrack, localParticipant, shouldPublishLocalCamera]);
  const localCameraTrackRef = publishedLocalCameraTrackRef ?? directLocalCameraTrackRef;
  const primaryTrack = useMemo(
    () => primaryRemoteTrack ?? localCameraTrackRef,
    [localCameraTrackRef, primaryRemoteTrack],
  );
  const secondaryTrack = useMemo(() => {
    if (primaryRemoteTrack && localCameraTrackRef) return localCameraTrackRef;
    if (!primaryRemoteTrack && remoteTracks.length > 1) return remoteTracks[1] ?? null;
    return null;
  }, [localCameraTrackRef, primaryRemoteTrack, remoteTracks]);
  const isShowingLocalPreview = !!primaryTrack && primaryTrack.participant.identity === localParticipant.identity;
  const isShowingSecondaryLocalPreview = !!secondaryTrack && secondaryTrack.participant.identity === localParticipant.identity;
  const visibleTrackCount = (primaryTrack ? 1 : 0) + (secondaryTrack ? 1 : 0);

  useEffect(() => {
    let cancelled = false;
    const participant = localParticipant as {
      setCameraEnabled?: (enabled: boolean, options?: unknown) => Promise<unknown>;
      setMicrophoneEnabled?: (enabled: boolean) => Promise<unknown>;
    };

    participant.setCameraEnabled?.(shouldPublishLocalCamera, LIVE_VIDEO_CAPTURE_OPTIONS).catch((error) => {
      if (cancelled) return;
      debugLog("livekit", "explicit local camera publish toggle failed", {
        surfaceLabel,
        roomName: joinContract.roomName,
        participantRole: joinContract.participantRole,
        shouldPublishLocalCamera,
        error: getErrorMessage(error),
      });
    });
    participant.setMicrophoneEnabled?.(publishLocalAudio).catch((error) => {
      if (cancelled) return;
      debugLog("livekit", "explicit local microphone publish toggle failed", {
        surfaceLabel,
        roomName: joinContract.roomName,
        participantRole: joinContract.participantRole,
        publishLocalAudio,
        error: getErrorMessage(error),
      });
    });

    return () => {
      cancelled = true;
    };
  }, [
    joinContract.participantRole,
    joinContract.roomName,
    localParticipant,
    publishLocalAudio,
    shouldPublishLocalCamera,
    surfaceLabel,
  ]);

  const bubbleGridTracks = useMemo(() => {
    const nextTracks = [
      ...(localCameraTrackRef ? [localCameraTrackRef] : []),
      ...remoteCameraTracks,
    ];
    return nextTracks.slice(0, 25);
  }, [localCameraTrackRef, remoteCameraTracks]);
  const bubbleGridItems = useMemo<BubbleGridItem[]>(() => {
    const trackByIdentity = new Map<string, RenderableLiveKitTrackReference>();
    bubbleGridTracks.forEach((trackRef) => {
      const identity = String(trackRef.participant.identity ?? "").trim();
      if (!identity || trackByIdentity.has(identity)) return;
      trackByIdentity.set(identity, trackRef);
    });

    const nextItems: BubbleGridItem[] = [];
    const seenIdentities = new Set<string>();
    participantRosterByIdentity.forEach((entry, identity) => {
      if (seenIdentities.has(identity)) return;
      const aliases = normalizeIdentityList(identity, entry.participantId, entry.identityAliases ?? []);
      const trackRef = aliases.map((alias) => trackByIdentity.get(alias) ?? null).find(Boolean) ?? null;
      const isCurrentParticipant = entry.isCurrentUser === true || aliases.some((alias) => currentIdentitySet.has(alias));
      const label = getParticipantLabel(identity, localParticipant.identity, participantLabelsByIdentity, participantRosterByIdentity, currentIdentitySet);
      nextItems.push({
        identity,
        participantId: String(entry.participantId ?? identity).trim() || identity,
        key: `${identity}:${trackRef?.source ?? "placeholder"}`,
        label,
        role: entry.role ?? null,
        canPublish: !!entry.canPublish,
        isRequestingToSpeak: showRequestIndicators && !!entry.isRequestingToSpeak,
        trackRef,
        avatarUrl: String(participantAvatarUrlsByIdentity?.[identity] ?? "").trim() || null,
        isCurrentParticipant,
      });
      seenIdentities.add(identity);
    });

    bubbleGridTracks.forEach((trackRef) => {
      const identity = String(trackRef.participant.identity ?? "").trim();
      if (!identity || seenIdentities.has(identity)) return;
      const label = getParticipantLabel(identity, localParticipant.identity, participantLabelsByIdentity, participantRosterByIdentity, currentIdentitySet);
      const isCurrentParticipant = currentIdentitySet.has(identity);
      nextItems.push({
        identity,
        participantId: participantRosterByIdentity.get(identity)?.participantId ?? identity,
        key: `${identity}:${trackRef.source}`,
        label,
        role: participantRosterByIdentity.get(identity)?.role ?? null,
        canPublish: !!participantRosterByIdentity.get(identity)?.canPublish,
        isRequestingToSpeak: showRequestIndicators && !!participantRosterByIdentity.get(identity)?.isRequestingToSpeak,
        trackRef,
        avatarUrl: String(participantAvatarUrlsByIdentity?.[identity] ?? "").trim() || null,
        isCurrentParticipant,
      });
      seenIdentities.add(identity);
    });

    return nextItems.slice(0, 25);
  }, [
    bubbleGridTracks,
    currentIdentitySet,
    localParticipant.identity,
    participantAvatarUrlsByIdentity,
    participantLabelsByIdentity,
    participantRosterByIdentity,
    showRequestIndicators,
  ]);
  const participantLabelEntries = useMemo(() => {
    const identities = new Set<string>([
      ...Array.from(participantRosterByIdentity.keys()),
      ...Object.keys(participantLabelsByIdentity ?? {}),
      ...bubbleGridTracks.map((trackRef) => trackRef.participant.identity),
    ]);
    return Array.from(identities).map((identity) => ({
      identity,
      label: getParticipantLabel(identity, localParticipant.identity, participantLabelsByIdentity, participantRosterByIdentity, currentIdentitySet),
      role: participantRosterByIdentity.get(identity)?.role ?? null,
      canPublish: !!participantRosterByIdentity.get(identity)?.canPublish,
      isRequestingToSpeak: showRequestIndicators && !!participantRosterByIdentity.get(identity)?.isRequestingToSpeak,
    }));
  }, [
    bubbleGridTracks,
    currentIdentitySet,
    localParticipant.identity,
    participantLabelsByIdentity,
    participantRosterByIdentity,
    showRequestIndicators,
  ]);
  const bubbleGridTrackMappings = useMemo(
    () => bubbleGridItems.map((item) => ({
      identity: item.identity,
      label: item.label,
      role: item.role,
      hasCameraTrack: !!item.trackRef,
      canPublish: item.canPublish,
      isRequestingToSpeak: item.isRequestingToSpeak,
    })),
    [bubbleGridItems],
  );

  useEffect(() => {
    debugLog("livekit", "stage media publish state", {
      surfaceLabel,
      roomName: joinContract.roomName,
      participantRole: joinContract.participantRole,
      shouldPublishLocalCamera,
      publishLocalAudio,
      isCameraEnabled,
      isMicrophoneEnabled,
      hasLocalCameraTrack: !!cameraTrack,
      hasPublishedLocalCameraTrack: !!publishedLocalCameraTrackRef,
      hasRemoteTrack: !!primaryRemoteTrack,
      remoteTrackCount: remoteTracks.length,
      visibleTrackCount,
      bubbleGridTrackCount: bubbleGridTracks.length,
      bubbleGridItemCount: bubbleGridItems.length,
      localParticipantIdentity: localParticipant.identity,
      currentParticipantIdentity: String(currentParticipantIdentity ?? ""),
      currentParticipantIdentityAliases: Array.from(currentIdentitySet),
      remoteCameraIdentities: remoteCameraTracks.map((trackRef) => trackRef.participant.identity),
      bubbleGridIdentities: bubbleGridTracks.map((trackRef) => trackRef.participant.identity),
      bubbleGridTrackMappings: JSON.stringify(bubbleGridTrackMappings),
      participantLabelEntries: JSON.stringify(participantLabelEntries),
      showRequestIndicators,
      connectionState: String(connectionState ?? ""),
      lastMicrophoneError: lastMicrophoneError?.message ?? null,
      mediaDeviceFailure,
    });
  }, [
    cameraTrack,
    connectionState,
    isCameraEnabled,
    isMicrophoneEnabled,
    joinContract.participantRole,
    joinContract.roomName,
    lastMicrophoneError?.message,
    localParticipant.identity,
    mediaDeviceFailure,
    participantLabelEntries,
    publishLocalAudio,
    publishedLocalCameraTrackRef,
    primaryRemoteTrack,
    bubbleGridItems.length,
    bubbleGridTracks.length,
    bubbleGridTracks,
    bubbleGridTrackMappings,
    remoteCameraTracks,
    remoteTracks.length,
    shouldPublishLocalCamera,
    showRequestIndicators,
    surfaceLabel,
    visibleTrackCount,
  ]);

  if (layout === "bubble-grid") {
    if (bubbleGridItems.length > 0) {
      const bubbleGridContent = (
        <View style={styles.bubbleGridContent} collapsable={false}>
          {bubbleGridItems.map((item) => {
            const isLocalParticipant = item.isCurrentParticipant;

            return (
              <Pressable
                key={item.key}
                style={styles.bubbleGridItem}
                collapsable={false}
                disabled={!onParticipantPress}
                onPress={() => onParticipantPress?.(item.participantId)}
              >
                {item.trackRef ? (
                  <View style={styles.bubbleVideoWrap} collapsable={false}>
                    <VideoTrack
                      trackRef={item.trackRef}
                      style={styles.bubbleVideo}
                      objectFit="cover"
                      mirror={isLocalParticipant}
                      zOrder={0}
                    />
                  </View>
                ) : isLocalParticipant && localParticipantFallback ? (
                  <View style={styles.bubbleVideoWrap} collapsable={false}>
                    {localParticipantFallback}
                  </View>
                ) : item.avatarUrl ? (
                  <View style={styles.bubbleVideoWrap} collapsable={false}>
                    <Image source={{ uri: item.avatarUrl }} style={styles.bubbleAvatarImage} />
                  </View>
                ) : (
                  <View style={[styles.bubbleVideoWrap, styles.bubblePlaceholderWrap]} collapsable={false}>
                    <Text style={styles.bubblePlaceholderInitials} numberOfLines={1}>
                      {getParticipantInitials(item.label)}
                    </Text>
                    <Text style={styles.bubblePlaceholderStatus} numberOfLines={1}>
                      {item.isRequestingToSpeak ? "Request" : item.role === "host" ? "Host" : item.canPublish ? "Seated" : "Audience"}
                    </Text>
                  </View>
                )}
                {item.isRequestingToSpeak ? (
                  <View style={styles.bubbleRequestBadge}>
                    <Text style={styles.bubbleRequestBadgeText}>REQ</Text>
                  </View>
                ) : null}
                <Text style={styles.bubbleLabel} numberOfLines={1}>
                  {item.label}
                </Text>
              </Pressable>
            );
          })}
        </View>
      );

      return (
        <View style={styles.bubbleGridSurface} collapsable={false}>
          <ScrollView
            style={styles.bubbleGridScroll}
            contentContainerStyle={styles.bubbleGridScrollContent}
            showsVerticalScrollIndicator={bubbleGridItems.length > 1}
            nestedScrollEnabled
          >
            {bubbleGridContent}
          </ScrollView>
        </View>
      );
    }

    return (
      <View style={styles.bubbleGridPlaceholder}>
        {String(connectionState ?? "").toLowerCase() !== "connected" ? <ActivityIndicator color="#FFFFFF" /> : null}
        <Text style={styles.bubbleGridPlaceholderTitle}>Camera bubbles preparing</Text>
        <Text style={styles.bubbleGridPlaceholderBody}>
          {toConnectionLabel(connectionState)}
        </Text>
      </View>
    );
  }

  if (primaryTrack && isTrackReference(primaryTrack)) {
    return (
      <View style={styles.videoSurfaceStack}>
        <VideoTrack
          trackRef={primaryTrack}
          style={StyleSheet.absoluteFillObject}
          objectFit="cover"
          mirror={isShowingLocalPreview}
        />
        <View pointerEvents="none" style={styles.videoOverlay}>
          <View style={styles.videoBadge}>
            <Text style={styles.videoBadgeText}>
              {getParticipantLabel(primaryTrack.participant.identity, localParticipant.identity, participantLabelsByIdentity, participantRosterByIdentity, currentIdentitySet)}
            </Text>
          </View>
        </View>
        {secondaryTrack && isTrackReference(secondaryTrack) ? (
          <View style={styles.secondaryVideoWrap} pointerEvents="none">
            <VideoTrack
              trackRef={secondaryTrack}
              style={styles.secondaryVideo}
              objectFit="cover"
              mirror={isShowingSecondaryLocalPreview}
            />
            <View style={styles.secondaryVideoBadge}>
              <Text style={styles.secondaryVideoBadgeText}>
                {getParticipantLabel(secondaryTrack.participant.identity, localParticipant.identity, participantLabelsByIdentity, participantRosterByIdentity, currentIdentitySet)}
              </Text>
            </View>
          </View>
        ) : null}
      </View>
    );
  }

  const connectionLabel = toConnectionLabel(connectionState);
  const isConnecting = String(connectionState ?? "").toLowerCase() !== "connected";
  const showCameraWaitingState = !isConnecting && shouldPublishLocalCamera && !lastCameraError && !mediaDeviceFailure;
  const showMicrophoneWaitingState = !isConnecting && publishLocalAudio && !lastMicrophoneError && !mediaDeviceFailure && !isMicrophoneEnabled;
  const microphoneFailureMessage = lastMicrophoneError?.message ?? null;
  const mediaFailureLabel = mediaDeviceFailure
    ? `Media device issue: ${mediaDeviceFailure}`
    : null;
  const placeholderTitle = isConnecting
    ? `Connecting ${surfaceLabel}…`
    : lastCameraError
      ? "Camera unavailable"
      : microphoneFailureMessage
        ? "Microphone unavailable"
        : mediaFailureLabel
          ? "Media device unavailable"
          : showCameraWaitingState && showMicrophoneWaitingState
            ? "Preparing camera and microphone…"
            : showCameraWaitingState
              ? "Preparing your camera…"
              : showMicrophoneWaitingState
                ? "Preparing your microphone…"
                : `${surfaceLabel} connected`;
  const placeholderBody = isConnecting
    ? `LiveKit is preparing the room connection for ${joinContract.roomName}.`
    : lastCameraError
      ? `LiveKit connected, but camera publish failed: ${lastCameraError.message}`
      : microphoneFailureMessage
        ? `LiveKit connected, but microphone publish failed: ${microphoneFailureMessage}`
        : mediaFailureLabel
          ? `LiveKit connected, but local media setup still failed: ${mediaFailureLabel}`
          : showCameraWaitingState && showMicrophoneWaitingState
            ? "The room is connected and your camera plus microphone are still preparing for live media."
            : showCameraWaitingState
              ? "The room is connected and your camera is still preparing for live video."
              : showMicrophoneWaitingState
                ? "The room is connected and your microphone is still preparing for live audio."
                : "The room is connected, but no published stage video is available yet.";

  return (
    <View style={styles.placeholderSurface}>
      {isConnecting ? <ActivityIndicator color="#FFFFFF" /> : null}
      <Text style={styles.placeholderTitle}>{placeholderTitle}</Text>
      <Text style={styles.placeholderBody}>{placeholderBody}</Text>
      <Text style={styles.placeholderStatus}>{connectionLabel}</Text>
    </View>
  );
}

export function LiveKitStageMediaSurface({
  joinContract,
  onFallback,
  active = true,
  containerStyle,
  fillParent = true,
  layout = "stage",
  participantLabelsByIdentity,
  participantAvatarUrlsByIdentity,
  localParticipantFallback,
  participantRoster,
  onParticipantPress,
  currentParticipantIdentity,
  currentParticipantIdentityAliases,
  showRequestIndicators = true,
  surfaceLabel = "Live Stage",
  publishLocalAudio = joinContract.participantRole !== "viewer",
  publishLocalVideo,
}: LiveKitStageMediaSurfaceProps) {
  const fallbackTriggeredRef = useRef(false);
  const didConnectOnceRef = useRef(false);
  const shouldConnectRoomRef = useRef(false);
  const disconnectFallbackTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const tearingDownRoomsRef = useRef(new Set<Room>());
  const [didConnectOnce, setDidConnectOnce] = useState(false);
  const [appState, setAppState] = useState<AppStateStatus>(() => AppState.currentState);
  const [hasAndroidFocus, setHasAndroidFocus] = useState(true);
  const [mediaDeviceFailure, setMediaDeviceFailure] = useState<string | null>(null);
  const publishLocalCamera = publishLocalVideo ?? (
    joinContract.participantRole !== "viewer" && joinContract.requestedGrants.canPublish
  );
  const appIsInteractive = appState === "active" && (Platform.OS !== "android" || hasAndroidFocus);
  const shouldConnectRoom = active && appIsInteractive;
  shouldConnectRoomRef.current = shouldConnectRoom;
  const effectivePublishLocalAudio = shouldConnectRoom && publishLocalAudio;
  const effectivePublishLocalCamera = shouldConnectRoom && publishLocalCamera;
  const connectOptions = useMemo(() => ({ autoSubscribe: true }), []);
  const roomKey = `${joinContract.roomName}:${joinContract.participantToken}`;
  const room = useMemo(() => {
    void roomKey;
    const nextRoom = new Room(createLiveKitV1RoomOptions({ adaptiveStream: true, dynacast: true }));
    patchLiveKitSignalReadingLoop(
      nextRoom,
      surfaceLabel,
      () => tearingDownRoomsRef.current.has(nextRoom),
    );
    return nextRoom;
  }, [layout, roomKey, surfaceLabel]);

  const clearDisconnectFallbackTimeout = useCallback(() => {
    if (!disconnectFallbackTimeoutRef.current) return;
    clearTimeout(disconnectFallbackTimeoutRef.current);
    disconnectFallbackTimeoutRef.current = null;
  }, []);

  const disableLocalMediaQuietly = useCallback((reason: string) => {
    const localParticipant = room.localParticipant as {
      setCameraEnabled?: (enabled: boolean) => Promise<unknown>;
      setMicrophoneEnabled?: (enabled: boolean) => Promise<unknown>;
    };

    Promise.all([
      localParticipant.setCameraEnabled?.(false) ?? Promise.resolve(),
      localParticipant.setMicrophoneEnabled?.(false) ?? Promise.resolve(),
    ]).catch((error) => {
      debugLog("livekit", "local media disable during pause failed", {
        surfaceLabel,
        roomName: joinContract.roomName,
        reason,
        error: getErrorMessage(error),
      });
    });
  }, [joinContract.roomName, room, surfaceLabel]);

  const triggerFallback = useCallback(
    (reason: "connection_timeout" | "disconnected" | "room_error", error?: unknown) => {
      if (fallbackTriggeredRef.current) return;
      fallbackTriggeredRef.current = true;
      clearDisconnectFallbackTimeout();

      if (error) {
        reportRuntimeError("livekit-stage-room", error, {
          reason,
          roomName: joinContract.roomName,
          participantRole: joinContract.participantRole,
          endpoint: joinContract.endpoint,
        });
      }

      onFallback(reason);
    },
    [clearDisconnectFallbackTimeout, joinContract.endpoint, joinContract.participantRole, joinContract.roomName, onFallback],
  );

  useEffect(() => {
    fallbackTriggeredRef.current = false;
    didConnectOnceRef.current = false;
    clearDisconnectFallbackTimeout();
    setDidConnectOnce(false);
    setMediaDeviceFailure(null);
  }, [clearDisconnectFallbackTimeout, room]);

  useEffect(() => {
    const tearingDownRooms = tearingDownRoomsRef.current;
    return () => {
      tearingDownRooms.add(room);
      fallbackTriggeredRef.current = true;
      clearDisconnectFallbackTimeout();
      disableLocalMediaQuietly("unmount");
    };
  }, [clearDisconnectFallbackTimeout, disableLocalMediaQuietly, room]);

  useEffect(() => {
    const changeSubscription = AppState.addEventListener("change", (nextState) => {
      setAppState(nextState);
    });
    const focusSubscription = Platform.OS === "android"
      ? AppState.addEventListener("focus", () => setHasAndroidFocus(true))
      : null;
    const blurSubscription = Platform.OS === "android"
      ? AppState.addEventListener("blur", () => setHasAndroidFocus(false))
      : null;

    return () => {
      changeSubscription.remove();
      focusSubscription?.remove();
      blurSubscription?.remove();
    };
  }, []);

  useEffect(() => {
    if (shouldConnectRoom) return;
    clearDisconnectFallbackTimeout();
    disableLocalMediaQuietly(appIsInteractive ? "inactive-prop" : "app-not-interactive");
  }, [appIsInteractive, clearDisconnectFallbackTimeout, disableLocalMediaQuietly, shouldConnectRoom]);

  useEffect(() => {
    let active = true;

    if (!shouldConnectRoom) return () => {
      active = false;
    };

    AudioSession.startAudioSession().catch((error) => {
      if (!active) return;
      reportRuntimeError("livekit-stage-audio-session", error, {
        roomName: joinContract.roomName,
        participantRole: joinContract.participantRole,
      });
    });

    return () => {
      active = false;
      AudioSession.stopAudioSession().catch(() => {});
    };
  }, [joinContract.participantRole, joinContract.roomName, shouldConnectRoom]);

  useEffect(() => {
    if (!shouldConnectRoom) return undefined;

    const timeout = setTimeout(() => {
      if (!didConnectOnce) {
        if (isConnectedishState(room.state)) {
          debugLog("livekit", "stage media connection still in progress after timeout window", {
            surfaceLabel,
            roomName: joinContract.roomName,
            participantRole: joinContract.participantRole,
            connectionState: String(room.state ?? ""),
          });
          return;
        }
        triggerFallback(
          "connection_timeout",
          new Error("LiveKit did not finish connecting before the fallback deadline."),
        );
      }
    }, LIVEKIT_CONNECT_TIMEOUT_MILLIS);

    return () => {
      clearTimeout(timeout);
    };
  }, [didConnectOnce, joinContract.participantRole, joinContract.roomName, room, shouldConnectRoom, surfaceLabel, triggerFallback]);

  const handleConnected = useCallback(() => {
    clearDisconnectFallbackTimeout();
    tearingDownRoomsRef.current.delete(room);
    didConnectOnceRef.current = true;
    setDidConnectOnce(true);
    debugLog("livekit", "room connected", {
      surfaceLabel,
      roomName: joinContract.roomName,
      participantRole: joinContract.participantRole,
      publishLocalCamera,
    });
  }, [clearDisconnectFallbackTimeout, joinContract.participantRole, joinContract.roomName, publishLocalCamera, room, surfaceLabel]);

  const handleDisconnected = useCallback((reason?: unknown) => {
    if (tearingDownRoomsRef.current.has(room) || !shouldConnectRoomRef.current || isClientInitiatedDisconnectReason(reason)) {
      debugLog("livekit", "room disconnected without fallback", {
        surfaceLabel,
        roomName: joinContract.roomName,
        participantRole: joinContract.participantRole,
        reason: String(reason ?? "unknown"),
        appState,
        hasAndroidFocus,
      });
      return;
    }
    if (!didConnectOnceRef.current) {
      clearDisconnectFallbackTimeout();
      disconnectFallbackTimeoutRef.current = setTimeout(() => {
        disconnectFallbackTimeoutRef.current = null;
        if (tearingDownRoomsRef.current.has(room) || !shouldConnectRoomRef.current || isConnectedishState(room.state)) {
          return;
        }
        triggerFallback(
          "disconnected",
          new Error("LiveKit disconnected before the stage path connected once."),
        );
      }, LIVEKIT_DISCONNECT_FALLBACK_GRACE_MILLIS);
      return;
    }

    clearDisconnectFallbackTimeout();
    disconnectFallbackTimeoutRef.current = setTimeout(() => {
      disconnectFallbackTimeoutRef.current = null;
      if (tearingDownRoomsRef.current.has(room) || !shouldConnectRoomRef.current || isConnectedishState(room.state)) {
        return;
      }
      triggerFallback(
        "disconnected",
        new Error("LiveKit stayed disconnected after the stage reconnect grace period."),
      );
    }, LIVEKIT_DISCONNECT_FALLBACK_GRACE_MILLIS);
  }, [
    appState,
    clearDisconnectFallbackTimeout,
    hasAndroidFocus,
    joinContract.participantRole,
    joinContract.roomName,
    room,
    surfaceLabel,
    triggerFallback,
  ]);

  const handleError = useCallback((error: Error) => {
    if (tearingDownRoomsRef.current.has(room) || !shouldConnectRoomRef.current) return;
    triggerFallback("room_error", error);
  }, [room, triggerFallback]);

  const handleMediaDeviceFailure = useCallback((failure: unknown, kind?: unknown) => {
    if (tearingDownRoomsRef.current.has(room) || !shouldConnectRoomRef.current) {
      debugLog("livekit", "suppressed media-device failure during inactive room state", {
        surfaceLabel,
        roomName: joinContract.roomName,
        participantRole: joinContract.participantRole,
        failure: String(failure ?? "unknown_failure"),
        kind: String(kind ?? ""),
        appState,
        hasAndroidFocus,
      });
      return;
    }

    const normalizedFailure = String(failure ?? "unknown_failure");
    setMediaDeviceFailure(normalizedFailure);
    reportRuntimeError("livekit-stage-media-device", new Error(`LiveKit media-device failure: ${normalizedFailure}`), {
      roomName: joinContract.roomName,
      participantRole: joinContract.participantRole,
      publishLocalAudio,
      publishLocalCamera,
      kind: String(kind ?? ""),
    });
  }, [
    appState,
    hasAndroidFocus,
    joinContract.participantRole,
    joinContract.roomName,
    publishLocalAudio,
    publishLocalCamera,
    room,
    surfaceLabel,
  ]);

  return (
    <View
      style={[styles.surface, fillParent && styles.surfaceFill, containerStyle]}
      pointerEvents={onParticipantPress ? "auto" : "none"}
      accessible={false}
      importantForAccessibility="no-hide-descendants"
    >
      <LiveKitRoom
        key={roomKey}
        room={room}
        serverUrl={joinContract.serverUrl}
        token={joinContract.participantToken}
        connect={shouldConnectRoom}
        audio={effectivePublishLocalAudio}
        video={effectivePublishLocalCamera ? LIVE_VIDEO_CAPTURE_OPTIONS : false}
        connectOptions={connectOptions}
        onConnected={handleConnected}
        onDisconnected={handleDisconnected}
        onError={handleError}
        onMediaDeviceFailure={handleMediaDeviceFailure}
      >
        <LiveKitStageMediaContent
          joinContract={joinContract}
          layout={layout}
          participantLabelsByIdentity={participantLabelsByIdentity}
          participantAvatarUrlsByIdentity={participantAvatarUrlsByIdentity}
          localParticipantFallback={localParticipantFallback}
          participantRoster={participantRoster}
          onParticipantPress={onParticipantPress}
          currentParticipantIdentity={currentParticipantIdentity}
          currentParticipantIdentityAliases={currentParticipantIdentityAliases}
          showRequestIndicators={showRequestIndicators}
          surfaceLabel={surfaceLabel}
          publishLocalAudio={effectivePublishLocalAudio}
          publishLocalVideo={effectivePublishLocalCamera}
          mediaDeviceFailure={mediaDeviceFailure}
        />
      </LiveKitRoom>
    </View>
  );
}

const styles = StyleSheet.create({
  surface: {
    overflow: "hidden",
    backgroundColor: "#05070E",
  },
  surfaceFill: {
    ...StyleSheet.absoluteFillObject,
  },
  videoSurfaceStack: {
    flex: 1,
    backgroundColor: "#05070E",
  },
  bubbleGridSurface: {
    flex: 1,
    backgroundColor: "rgba(5,7,14,0.96)",
    paddingHorizontal: 10,
    paddingVertical: 9,
  },
  bubbleGridScroll: {
    flex: 1,
  },
  bubbleGridScrollContent: {
    flexGrow: 1,
  },
  bubbleGridContent: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    alignItems: "flex-start",
    paddingBottom: 6,
  },
  bubbleGridItem: {
    width: 82,
    alignItems: "center",
    gap: 4,
  },
  bubbleVideoWrap: {
    width: 78,
    height: 78,
    borderRadius: 39,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.18)",
    backgroundColor: "rgba(255,255,255,0.08)",
  },
  bubbleVideo: {
    width: "100%",
    height: "100%",
    borderRadius: 39,
  },
  bubbleAvatarImage: {
    width: "100%",
    height: "100%",
    borderRadius: 39,
  },
  bubblePlaceholderWrap: {
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255,255,255,0.1)",
  },
  bubblePlaceholderInitials: {
    color: "#FFFFFF",
    fontSize: 21,
    fontWeight: "900",
    textAlign: "center",
  },
  bubblePlaceholderStatus: {
    marginTop: 2,
    color: "rgba(233,236,245,0.68)",
    fontSize: 8,
    fontWeight: "800",
    textAlign: "center",
    textTransform: "uppercase",
  },
  bubbleRequestBadge: {
    position: "absolute",
    top: -4,
    right: 2,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "rgba(141,182,255,0.68)",
    backgroundColor: "rgba(52,92,166,0.94)",
    paddingHorizontal: 5,
    paddingVertical: 2,
  },
  bubbleRequestBadgeText: {
    color: "#FFFFFF",
    fontSize: 7.5,
    fontWeight: "900",
  },
  bubbleLabel: {
    width: "100%",
    color: "#F6F8FE",
    fontSize: 10,
    fontWeight: "800",
    textAlign: "center",
  },
  bubbleGridPlaceholder: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    backgroundColor: "rgba(5,7,14,0.96)",
    paddingHorizontal: 16,
  },
  bubbleGridPlaceholderTitle: {
    color: "#FFFFFF",
    fontSize: 13,
    fontWeight: "900",
    textAlign: "center",
  },
  bubbleGridPlaceholderBody: {
    color: "rgba(233,236,245,0.72)",
    fontSize: 10,
    fontWeight: "800",
    letterSpacing: 0.4,
    textTransform: "uppercase",
  },
  videoOverlay: {
    position: "absolute",
    top: 12,
    left: 12,
  },
  videoBadge: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: "rgba(4,8,20,0.66)",
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "rgba(255,255,255,0.18)",
  },
  videoBadgeText: {
    color: "#FFFFFF",
    fontSize: 11,
    fontWeight: "800",
    letterSpacing: 0.4,
    textTransform: "uppercase",
  },
  secondaryVideoWrap: {
    position: "absolute",
    right: 14,
    bottom: 14,
    width: 118,
    height: 168,
    borderRadius: 22,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.16)",
    backgroundColor: "rgba(5,7,14,0.94)",
    shadowColor: "#000000",
    shadowOpacity: 0.28,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 6 },
    elevation: 10,
  },
  secondaryVideo: {
    width: "100%",
    height: "100%",
  },
  secondaryVideoBadge: {
    position: "absolute",
    left: 8,
    bottom: 8,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 999,
    backgroundColor: "rgba(4,8,20,0.72)",
  },
  secondaryVideoBadgeText: {
    color: "#FFFFFF",
    fontSize: 10,
    fontWeight: "800",
    textTransform: "uppercase",
  },
  placeholderSurface: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 28,
    backgroundColor: "rgba(5,7,14,0.92)",
  },
  placeholderTitle: {
    marginTop: 14,
    color: "#FFFFFF",
    fontSize: 20,
    fontWeight: "800",
    textAlign: "center",
  },
  placeholderBody: {
    marginTop: 8,
    color: "rgba(233,236,245,0.82)",
    fontSize: 14,
    lineHeight: 20,
    textAlign: "center",
  },
  placeholderStatus: {
    marginTop: 10,
    color: "rgba(157,214,255,0.92)",
    fontSize: 12,
    fontWeight: "700",
    letterSpacing: 0.4,
    textTransform: "uppercase",
  },
});
