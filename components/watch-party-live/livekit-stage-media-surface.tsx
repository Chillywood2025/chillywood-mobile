import "../../_lib/livekit/dom-exception-polyfill";

import { Track } from "livekit-client";
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ActivityIndicator, StyleSheet, Text, View, type StyleProp, type ViewStyle } from "react-native";

import { reportRuntimeError } from "../../_lib/logger";
import type { LiveKitTokenReady } from "../../_lib/livekit/token-contract";

const {
  AudioSession,
  LiveKitRoom,
  VideoTrack,
  isTrackReference,
  useConnectionState,
  useTracks,
} = require("@livekit/react-native") as typeof import("@livekit/react-native");

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

function LiveKitStageMediaContent({ joinContract, surfaceLabel }: LiveKitStageMediaContentProps) {
  const connectionState = useConnectionState();
  const tracks = useTracks(
    [
      { source: Track.Source.ScreenShare, withPlaceholder: false },
      { source: Track.Source.Camera, withPlaceholder: false },
    ],
    { onlySubscribed: true },
  );
  const primaryTrack = useMemo(
    () => tracks.find((trackRef) => isTrackReference(trackRef)) ?? null,
    [tracks],
  );

  if (primaryTrack && isTrackReference(primaryTrack)) {
    return (
      <VideoTrack
        trackRef={primaryTrack}
        style={StyleSheet.absoluteFillObject}
        objectFit="cover"
        mirror={false}
      />
    );
  }

  const connectionLabel = toConnectionLabel(connectionState);
  const isConnecting = String(connectionState ?? "").toLowerCase() !== "connected";

  return (
    <View style={styles.placeholderSurface}>
      {isConnecting ? <ActivityIndicator color="#FFFFFF" /> : null}
      <Text style={styles.placeholderTitle}>
        {isConnecting ? `Connecting ${surfaceLabel}…` : `${surfaceLabel} connected`}
      </Text>
      <Text style={styles.placeholderBody}>
        {isConnecting
          ? `LiveKit is preparing the room connection for ${joinContract.roomName}.`
          : "The room is connected, but no published stage video is available yet."}
      </Text>
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
        video={false}
        connectOptions={{ autoSubscribe: true }}
        options={{ adaptiveStream: true, dynacast: false }}
        onConnected={() => {
          setDidConnectOnce(true);
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
