import "../../_lib/livekit/dom-exception-polyfill";

import { Room, Track } from "livekit-client";
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ActivityIndicator, StyleSheet, Text, View, type StyleProp, type ViewStyle } from "react-native";

import { debugLog, reportRuntimeError } from "../../_lib/logger";
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

type LiveKitStageMediaSurfaceProps = {
  joinContract: LiveKitTokenReady;
  onFallback: (reason: "connection_timeout" | "disconnected" | "room_error") => void;
  containerStyle?: StyleProp<ViewStyle>;
  fillParent?: boolean;
  surfaceLabel?: string;
  publishLocalAudio?: boolean;
};

type LiveKitStageMediaContentProps = {
  joinContract: LiveKitTokenReady;
  surfaceLabel: string;
  publishLocalAudio: boolean;
  mediaDeviceFailure: string | null;
};

const LIVEKIT_CONNECT_TIMEOUT_MILLIS = 10_000;

type LiveKitSignalClientPatchable = {
  startReadingLoop?: (...args: unknown[]) => Promise<unknown>;
  handleWSError?: (error: unknown) => void;
  __chillywoodStageReadingLoopPatched?: boolean;
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
          error: error instanceof Error ? error.message : String(error),
        });
        return undefined;
      }
      debugLog("livekit", "contained stage signal read loop error", {
        surfaceLabel,
        error: error instanceof Error ? error.message : String(error),
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

const getParticipantLabel = (identity: string, currentIdentity: string) => (
  identity === currentIdentity ? "You" : "Guest"
);

function LiveKitStageMediaContent({
  joinContract,
  surfaceLabel,
  publishLocalAudio,
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
  const shouldPublishLocalCamera = joinContract.participantRole !== "viewer";
  const tracks = useTracks(
    [
      { source: Track.Source.ScreenShare, withPlaceholder: false },
      { source: Track.Source.Camera, withPlaceholder: false },
    ],
    { onlySubscribed: true },
  );
  const remoteTracks = useMemo(
    () => tracks.filter((trackRef) => (
      isTrackReference(trackRef) && trackRef.participant.identity !== localParticipant.identity
    )),
    [localParticipant.identity, tracks],
  );
  const primaryRemoteTrack = remoteTracks[0] ?? null;
  const localCameraTrackRef = useMemo(() => {
    if (!shouldPublishLocalCamera || !cameraTrack) return null;
    return {
      participant: localParticipant,
      publication: cameraTrack,
      source: Track.Source.Camera,
    };
  }, [cameraTrack, localParticipant, shouldPublishLocalCamera]);
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
    debugLog("livekit", "stage media publish state", {
      surfaceLabel,
      roomName: joinContract.roomName,
      participantRole: joinContract.participantRole,
      shouldPublishLocalCamera,
      publishLocalAudio,
      isCameraEnabled,
      isMicrophoneEnabled,
      hasLocalCameraTrack: !!cameraTrack,
      hasRemoteTrack: !!primaryRemoteTrack,
      remoteTrackCount: remoteTracks.length,
      visibleTrackCount,
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
    mediaDeviceFailure,
    publishLocalAudio,
    primaryRemoteTrack,
    remoteTracks.length,
    shouldPublishLocalCamera,
    surfaceLabel,
    visibleTrackCount,
  ]);

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
              {getParticipantLabel(primaryTrack.participant.identity, localParticipant.identity)}
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
                {getParticipantLabel(secondaryTrack.participant.identity, localParticipant.identity)}
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
  containerStyle,
  fillParent = true,
  surfaceLabel = "Live Stage",
  publishLocalAudio = joinContract.participantRole !== "viewer",
}: LiveKitStageMediaSurfaceProps) {
  const fallbackTriggeredRef = useRef(false);
  const tearingDownRoomsRef = useRef(new Set<Room>());
  const [didConnectOnce, setDidConnectOnce] = useState(false);
  const [mediaDeviceFailure, setMediaDeviceFailure] = useState<string | null>(null);
  const publishLocalCamera = joinContract.participantRole !== "viewer";
  const connectOptions = useMemo(() => ({ autoSubscribe: true }), []);
  const room = useMemo(() => {
    const nextRoom = new Room({ adaptiveStream: true, dynacast: false });
    patchLiveKitSignalReadingLoop(
      nextRoom,
      surfaceLabel,
      () => tearingDownRoomsRef.current.has(nextRoom),
    );
    return nextRoom;
  }, [joinContract.participantToken, joinContract.roomName, surfaceLabel]);

  const triggerFallback = useCallback(
    (reason: "connection_timeout" | "disconnected" | "room_error", error?: unknown) => {
      if (fallbackTriggeredRef.current) return;
      fallbackTriggeredRef.current = true;

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
    [joinContract.endpoint, joinContract.participantRole, joinContract.roomName, onFallback],
  );

  useEffect(() => {
    fallbackTriggeredRef.current = false;
    setDidConnectOnce(false);
    setMediaDeviceFailure(null);
  }, [room]);

  useEffect(() => {
    return () => {
      tearingDownRoomsRef.current.add(room);
      fallbackTriggeredRef.current = true;
    };
  }, [room]);

  useEffect(() => {
    let active = true;

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
  }, [joinContract.participantRole, joinContract.roomName]);

  useEffect(() => {
    const timeout = setTimeout(() => {
      if (!didConnectOnce) {
        triggerFallback(
          "connection_timeout",
          new Error("LiveKit did not finish connecting before the fallback deadline."),
        );
      }
    }, LIVEKIT_CONNECT_TIMEOUT_MILLIS);

    return () => {
      clearTimeout(timeout);
    };
  }, [didConnectOnce, triggerFallback]);

  const handleConnected = useCallback(() => {
    tearingDownRoomsRef.current.delete(room);
    setDidConnectOnce(true);
    debugLog("livekit", "room connected", {
      surfaceLabel,
      roomName: joinContract.roomName,
      participantRole: joinContract.participantRole,
      publishLocalCamera,
    });
  }, [joinContract.participantRole, joinContract.roomName, publishLocalCamera, room, surfaceLabel]);

  const handleDisconnected = useCallback(() => {
    if (tearingDownRoomsRef.current.has(room)) return;
    triggerFallback(
      "disconnected",
      new Error("LiveKit disconnected before the stage path was stable enough to replace the legacy fallback."),
    );
  }, [room, triggerFallback]);

  const handleError = useCallback((error: Error) => {
    if (tearingDownRoomsRef.current.has(room)) return;
    triggerFallback("room_error", error);
  }, [room, triggerFallback]);

  const handleMediaDeviceFailure = useCallback((failure: unknown) => {
    const normalizedFailure = String(failure ?? "unknown_failure");
    setMediaDeviceFailure(normalizedFailure);
    reportRuntimeError("livekit-stage-media-device", new Error(`LiveKit media-device failure: ${normalizedFailure}`), {
      roomName: joinContract.roomName,
      participantRole: joinContract.participantRole,
      publishLocalAudio,
      publishLocalCamera,
    });
  }, [joinContract.participantRole, joinContract.roomName, publishLocalAudio, publishLocalCamera]);

  return (
    <View
      style={[styles.surface, fillParent && styles.surfaceFill, containerStyle]}
      pointerEvents="none"
      accessible={false}
      importantForAccessibility="no-hide-descendants"
      >
        <LiveKitRoom
        key={`${joinContract.roomName}:${joinContract.participantToken}`}
        room={room}
        serverUrl={joinContract.serverUrl}
        token={joinContract.participantToken}
        connect
        audio={publishLocalAudio}
        video={publishLocalCamera}
        connectOptions={connectOptions}
        onConnected={handleConnected}
        onDisconnected={handleDisconnected}
        onError={handleError}
        onMediaDeviceFailure={handleMediaDeviceFailure}
      >
        <LiveKitStageMediaContent
          joinContract={joinContract}
          surfaceLabel={surfaceLabel}
          publishLocalAudio={publishLocalAudio}
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
