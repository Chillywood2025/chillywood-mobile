import { useRef } from "react";

import type {
  ChillyChatCallInvite,
  ChillyChatCallMediaProvider,
} from "../_lib/chillyChatCalls";
import { resolveChatCallMediaTransportGates } from "../_lib/chatCallMediaProviderPolicy";
import type {
  CommunicationMediaPreferences,
  CommunicationParticipantView,
} from "../_lib/communication";
import { useCommunicationRoomSession } from "./use-communication-room-session";
import {
  type ChatCallFirstMediaState,
  useLiveKitChatCallSession,
} from "./use-livekit-chat-call-session";

type UseChatCallMediaSessionOptions = {
  authenticatedUserId: string;
  allowBackgroundAudio?: boolean;
  enabled: boolean;
  initialMediaPreferences?: Partial<CommunicationMediaPreferences>;
  invite: ChillyChatCallInvite | null;
  mediaActivationSerial?: number;
  onRoomEnded?: (reason: "host-left" | "ended" | "room-full") => void | Promise<void>;
  roomId: string;
  threadId: string;
};

const EMPTY_FIRST_MEDIA_STATE: ChatCallFirstMediaState = {
  firstAudio: false,
  firstVideo: false,
  localAudioPublished: false,
  localVideoPublished: false,
  remoteAudioSubscribed: false,
  remoteVideoSubscribed: false,
};

export function useChatCallMediaSession(options: UseChatCallMediaSessionOptions) {
  const fixedProviderRef = useRef<{
    inviteId: string;
    provider: ChillyChatCallMediaProvider;
  } | null>(null);
  const inviteId = String(options.invite?.id ?? "").trim();
  if (!fixedProviderRef.current || fixedProviderRef.current.inviteId !== inviteId) {
    fixedProviderRef.current = inviteId
      ? {
        inviteId,
        provider: options.invite?.mediaProvider === "livekit" ? "livekit" : "legacy_webrtc",
      }
      : null;
  }
  const mediaProvider = fixedProviderRef.current?.provider ?? "legacy_webrtc";
  const {
    legacyTransportActive: shouldEnableLegacy,
    liveKitTransportActive: shouldEnableLiveKit,
  } = resolveChatCallMediaTransportGates({
    enabled: options.enabled,
    inviteId,
    mediaProvider,
  });

  const legacySession = useCommunicationRoomSession({
    authenticatedUserId: options.authenticatedUserId,
    roomId: options.roomId,
    enabled: shouldEnableLegacy,
    allowBackgroundAudio: options.allowBackgroundAudio,
    mediaActivationSerial: options.mediaActivationSerial,
    initialMediaPreferences: options.initialMediaPreferences,
    analyticsContext: {
      surface: "chat-thread",
      role: null,
    },
    onRoomEnded: options.onRoomEnded,
  });
  const liveKitSession = useLiveKitChatCallSession({
    authenticatedUserId: options.authenticatedUserId,
    roomId: options.roomId,
    enabled: shouldEnableLiveKit,
    allowBackgroundAudio: options.allowBackgroundAudio,
    mediaActivationSerial: options.mediaActivationSerial,
    initialMediaPreferences: options.initialMediaPreferences,
    invite: options.invite,
    onRoomEnded: options.onRoomEnded,
    threadId: options.threadId,
  });

  if (mediaProvider === "livekit") {
    return {
      ...liveKitSession,
      mediaProvider,
      legacyTransportActive: false,
      liveKitTransportActive: shouldEnableLiveKit,
    };
  }

  return {
    ...legacySession,
    mediaProvider,
    legacyTransportActive: shouldEnableLegacy,
    liveKitTransportActive: false,
    setSpeaker: async (_enabled: boolean) => false,
    speakerEnabled: false,
    canSetSpeaker: false,
    firstMediaState: EMPTY_FIRST_MEDIA_STATE,
    markInstalledUiConnected: () => undefined,
    markParticipantVideoRendered: (_participant: CommunicationParticipantView) => undefined,
  };
}
