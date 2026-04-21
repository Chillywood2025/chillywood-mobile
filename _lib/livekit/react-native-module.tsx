import React from "react";
import { Platform } from "react-native";

type LiveKitReactNativeModule = typeof import("@livekit/react-native");

const loadLiveKitReactNativeModule = (): LiveKitReactNativeModule | null => {
  if (Platform.OS === "web") return null;
  return require("@livekit/react-native") as LiveKitReactNativeModule;
};

const liveKitReactNativeModule = loadLiveKitReactNativeModule();

const NoopLiveKitRoom = (({ children }: { children?: React.ReactNode }) => <>{children}</>) as unknown as LiveKitReactNativeModule["LiveKitRoom"];
const NoopLiveKitVideoTrack = (() => null) as unknown as LiveKitReactNativeModule["VideoTrack"];
const noopIsTrackReference = ((_: unknown) => false) as unknown as LiveKitReactNativeModule["isTrackReference"];
const noopUseConnectionState = (() => "disconnected") as unknown as LiveKitReactNativeModule["useConnectionState"];
const noopUseLocalParticipant = (() => ({
  isMicrophoneEnabled: false,
  isScreenShareEnabled: false,
  isCameraEnabled: false,
  microphoneTrack: undefined,
  cameraTrack: undefined,
  lastMicrophoneError: undefined,
  lastCameraError: undefined,
  localParticipant: {
    identity: "",
  },
})) as unknown as LiveKitReactNativeModule["useLocalParticipant"];
const noopUseTracks = ((..._args: unknown[]) => []) as unknown as LiveKitReactNativeModule["useTracks"];

export const LiveKitAudioSession = liveKitReactNativeModule?.AudioSession ?? {
  startAudioSession: async () => {},
  stopAudioSession: async () => {},
};

export const LiveKitRoom = liveKitReactNativeModule?.LiveKitRoom ?? NoopLiveKitRoom;
export const LiveKitVideoTrack = liveKitReactNativeModule?.VideoTrack ?? NoopLiveKitVideoTrack;
export const isLiveKitTrackReference = liveKitReactNativeModule?.isTrackReference ?? noopIsTrackReference;
export const useLiveKitConnectionState = liveKitReactNativeModule?.useConnectionState ?? noopUseConnectionState;
export const useLiveKitLocalParticipant = liveKitReactNativeModule?.useLocalParticipant ?? noopUseLocalParticipant;
export const useLiveKitTracks = liveKitReactNativeModule?.useTracks ?? noopUseTracks;
