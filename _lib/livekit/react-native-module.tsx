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
  configureAudio: async (_configuration: unknown) => {},
  startAudioSession: async () => {},
  stopAudioSession: async () => {},
  setAppleAudioConfiguration: async (_configuration: unknown) => {},
  getAudioOutputs: async () => [] as string[],
  selectAudioOutput: async (_deviceId: string) => {},
  showAudioRoutePicker: async () => {},
};

export async function configureLiveKitIosAudioSession(preferSpeakerOutput: boolean) {
  if (Platform.OS !== "ios") return;
  await LiveKitAudioSession.configureAudio({
    ios: {
      defaultOutput: preferSpeakerOutput ? "speaker" : "earpiece",
    },
  });
  await LiveKitAudioSession.setAppleAudioConfiguration({
    audioCategory: "playAndRecord",
    audioCategoryOptions: ["allowBluetooth", "mixWithOthers"],
    audioMode: preferSpeakerOutput ? "videoChat" : "voiceChat",
  });
}

export async function resetLiveKitIosAudioSession() {
  if (Platform.OS !== "ios") return;
  await LiveKitAudioSession.setAppleAudioConfiguration({
    audioCategory: "soloAmbient",
    audioCategoryOptions: [],
    audioMode: "default",
  });
}

export const LiveKitRoom = liveKitReactNativeModule?.LiveKitRoom ?? NoopLiveKitRoom;
export const LiveKitVideoTrack = liveKitReactNativeModule?.VideoTrack ?? NoopLiveKitVideoTrack;
export const isLiveKitTrackReference = liveKitReactNativeModule?.isTrackReference ?? noopIsTrackReference;
export const useLiveKitConnectionState = liveKitReactNativeModule?.useConnectionState ?? noopUseConnectionState;
export const useLiveKitLocalParticipant = liveKitReactNativeModule?.useLocalParticipant ?? noopUseLocalParticipant;
export const useLiveKitTracks = liveKitReactNativeModule?.useTracks ?? noopUseTracks;
