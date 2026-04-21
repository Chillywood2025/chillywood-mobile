import "../../_lib/livekit/dom-exception-polyfill";

import { Track } from "livekit-client";
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
};

type LiveKitStageMediaContentProps = {
  joinContract: LiveKitTokenReady;
  surfaceLabel: string;
};

const LIVEKIT_CONNECT_TIMEOUT_MILLIS = 10_000;

const toConnectionLabel = (connectionState: unknown) => {
  const normalized = String(connectionState ?? "").trim();
  if (!normalized) return "Connecting";
  return normalized.replace(/_/g, " ").replace(/\b\w/g, (character) => character.toUpperCase());
};

const getParticipantLabel = (identity: string, currentIdentity: string) => (
  identity === currentIdentity ? "You" : "Guest"
);

function LiveKitStageMediaContent({ joinContract, surfaceLabel }: LiveKitStageMediaContentProps) {
  const connectionState = useConnectionState();
  const {
    cameraTrack,
    isCameraEnabled,
    lastCameraError,
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
      isCameraEnabled,
      hasLocalCameraTrack: !!cameraTrack,
      hasRemoteTrack: !!primaryRemoteTrack,
      remoteTrackCount: remoteTracks.length,
      visibleTrackCount,
      connectionState: String(connectionState ?? ""),
    });
  }, [
    cameraTrack,
    connectionState,
    isCameraEnabled,
    joinContract.participantRole,
    joinContract.roomName,
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
  const showPublishWaitingState = !isConnecting && shouldPublishLocalCamera && !lastCameraError;
  const placeholderTitle = isConnecting
    ? `Connecting ${surfaceLabel}…`
    : showPublishWaitingState
      ? "Preparing your camera…"
      : `${surfaceLabel} connected`;
  const placeholderBody = isConnecting
    ? `LiveKit is preparing the room connection for ${joinContract.roomName}.`
    : lastCameraError
      ? `LiveKit connected, but camera publish failed: ${lastCameraError.message}`
      : showPublishWaitingState
        ? "The room is connected and your camera is still preparing for live video."
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
}: LiveKitStageMediaSurfaceProps) {
  const fallbackTriggeredRef = useRef(false);
  const [didConnectOnce, setDidConnectOnce] = useState(false);
  const publishLocalCamera = joinContract.participantRole !== "viewer";

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
  }, [joinContract.participantToken, joinContract.roomName]);

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

  return (
    <View style={[styles.surface, fillParent && styles.surfaceFill, containerStyle]} pointerEvents="none">
      <LiveKitRoom
        serverUrl={joinContract.serverUrl}
        token={joinContract.participantToken}
        connect
        audio={false}
        video={publishLocalCamera}
        connectOptions={{ autoSubscribe: true }}
        options={{ adaptiveStream: true, dynacast: false }}
        onConnected={() => {
          setDidConnectOnce(true);
          debugLog("livekit", "room connected", {
            surfaceLabel,
            roomName: joinContract.roomName,
            participantRole: joinContract.participantRole,
            publishLocalCamera,
          });
        }}
        onDisconnected={() => {
          triggerFallback(
            "disconnected",
            new Error("LiveKit disconnected before the stage path was stable enough to replace the legacy fallback."),
          );
        }}
        onError={(error) => {
          triggerFallback("room_error", error);
        }}
        onMediaDeviceFailure={(failure) => {
          triggerFallback(
            "room_error",
            new Error(`LiveKit media-device failure: ${String(failure ?? "unknown_failure")}`),
          );
        }}
      >
        <LiveKitStageMediaContent joinContract={joinContract} surfaceLabel={surfaceLabel} />
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
