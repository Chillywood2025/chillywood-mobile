import { useCallback, useRef } from "react";

import type {
  ChillyChatCallInvite,
  ChillyChatCallMediaProvider,
} from "../_lib/chillyChatCalls";
import { resolveChatCallMediaTransportGates } from "../_lib/chatCallMediaProviderPolicy";
import type {
  CommunicationMediaPreferences,
  CommunicationParticipantView,
} from "../_lib/communication";
import { createIosAcceptedCallKitMediaDescriptor } from "../_lib/communicationCallMediaPolicy.mjs";
import { useCommunicationRoomSession } from "./use-communication-room-session";
import { useLegacyAndroidAudioRoute } from "./use-legacy-android-audio-route";
import {
  type ChatCallFirstMediaState,
  useLiveKitChatCallSession,
} from "./use-livekit-chat-call-session";

type UseChatCallMediaSessionOptions = {
  authenticatedAccessToken: string;
  authenticatedUserId: string;
  allowBackgroundAudio?: boolean;
  enabled: boolean;
  initialMediaPreferences?: Partial<CommunicationMediaPreferences>;
  invite: ChillyChatCallInvite | null;
  iosAcceptedCallKitMediaDescriptor?: IosAcceptedCallKitMediaDescriptor | null;
  mediaActivationSerial?: number;
  nativeForegroundActivationInviteId?: string;
  nativeForegroundActivationSerial?: number;
  onRoomEnded?: (reason: "host-left" | "ended" | "room-full") => void | Promise<void>;
  roomId: string;
  threadId: string;
};

type IosAcceptedCallKitMediaDescriptor = NonNullable<
  ReturnType<typeof createIosAcceptedCallKitMediaDescriptor>
>;

const EMPTY_FIRST_MEDIA_STATE: ChatCallFirstMediaState = {
  firstAudio: false,
  firstVideo: false,
  localAudioPublished: false,
  localVideoPublished: false,
  remoteAudioSubscribed: false,
  remoteVideoSubscribed: false,
};

const noAutomaticMicrophoneFeedback = (_muted: boolean) => false;

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
    authenticatedAccessToken: options.authenticatedAccessToken,
    authenticatedUserId: options.authenticatedUserId,
    roomId: options.roomId,
    enabled: shouldEnableLegacy,
    allowBackgroundAudio: options.allowBackgroundAudio,
    mediaActivationSerial: options.mediaActivationSerial,
    restartDisconnectedSession: true,
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
    iosAcceptedCallKitMediaDescriptor: options.iosAcceptedCallKitMediaDescriptor,
    mediaActivationSerial: options.mediaActivationSerial,
    nativeForegroundActivationInviteId: options.nativeForegroundActivationInviteId,
    nativeForegroundActivationSerial: options.nativeForegroundActivationSerial,
    initialMediaPreferences: options.initialMediaPreferences,
    invite: options.invite,
    onRoomEnded: options.onRoomEnded,
    threadId: options.threadId,
  });
  const legacyAudio = useLegacyAndroidAudioRoute({
    active: shouldEnableLegacy && options.invite?.status === "accepted"
      && (legacySession.channelState === "live" || legacySession.channelState === "reconnecting"),
    identity: `${options.authenticatedUserId}:${options.roomId}:${inviteId}`,
    video: options.invite?.callType === "video",
  });
  const stopLegacyAudio = legacyAudio.stop;
  const leaveLegacyMedia = legacySession.leaveRoom;
  const leaveLegacyRoom = useCallback(async (...args: Parameters<typeof leaveLegacyMedia>) => {
    // Retire routing synchronously alongside End; native selection never
    // postpones capture/membership cleanup. Preserve either cleanup failure.
    const routeStop = stopLegacyAudio();
    const results = await Promise.allSettled([leaveLegacyMedia(...args), routeStop]);
    for (const result of results) if (result.status === "rejected") throw result.reason;
    return (results[0] as PromiseFulfilledResult<Awaited<ReturnType<typeof leaveLegacyMedia>>>).value;
  }, [leaveLegacyMedia, stopLegacyAudio]);

  if (mediaProvider === "livekit") {
    return {
      ...liveKitSession,
      mediaControlError: liveKitSession.mediaReconciliationMessage,
      mediaProvider,
      legacyTransportActive: false,
      liveKitTransportActive: shouldEnableLiveKit,
      consumeAutomaticMicrophoneFeedback: noAutomaticMicrophoneFeedback,
    };
  }

  return {
    ...legacySession,
    mediaProvider,
    legacyTransportActive: shouldEnableLegacy,
    liveKitTransportActive: false,
    leaveRoom: leaveLegacyRoom,
    setSpeaker: legacyAudio.setSpeaker,
    speakerEnabled: legacyAudio.speakerEnabled,
    canSetSpeaker: legacyAudio.canSetSpeaker,
    mediaControlError: legacySession.mediaControlError ?? legacyAudio.error,
    firstMediaState: EMPTY_FIRST_MEDIA_STATE,
    markInstalledUiConnected: () => undefined,
    markParticipantVideoRendered: (_participant: CommunicationParticipantView) => undefined,
  };
}
