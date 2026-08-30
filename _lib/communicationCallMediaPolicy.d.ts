export type NativeCallBackgroundAudioPolicyInput = {
  appState: string;
  allowBackgroundAudio: boolean;
  micRequested: boolean;
  hasUsableAudioTrack?: boolean;
};

export function canAttemptNativeCallBackgroundAudio(input: NativeCallBackgroundAudioPolicyInput): boolean;
export function shouldPreserveNativeCallBackgroundAudio(input: NativeCallBackgroundAudioPolicyInput): boolean;
export function resolveLegacyChatSessionRecovery(input: {
  alreadyRequested?: boolean;
  appState?: string | null;
  enabled?: boolean;
  ending?: boolean;
  generationIsCurrent?: boolean;
  trigger?: string | null;
}): Readonly<{
  delayMs: number;
  trigger: "app_foreground" | "peer_disconnected" | "peer_failed" | "realtime_closed" | "realtime_error" | "realtime_timeout";
}> | null;

export type ChillyChatCallParticipantRoleInput = {
  currentUserId?: string | null;
  callerUserId?: string | null;
  calleeUserId?: string | null;
};

export type IncomingCallPresentationInput = {
  appState?: string | null;
  alreadyOnSameThread?: boolean;
  nativeCallPresentationOwned?: boolean;
};

export function resolveChillyChatCallParticipantRole(input: ChillyChatCallParticipantRoleInput): "caller" | "callee" | "none";
export function resolveIncomingCallPresentation(input: IncomingCallPresentationInput): "native_ios" | "native_background" | "thread_banner" | "app_banner";
export function shouldShowOutgoingRingingPanel(
  input: ChillyChatCallParticipantRoleInput & { inviteStatus?: string | null },
): boolean;

export function setActiveCommunicationTracksEnabled(tracks: Array<{ readyState?: string; enabled: boolean }>, enabled: boolean): number;
export function resolveIncomingCallRoomJoinAction(input: {
  currentUserIsRoomHost: boolean;
  inviteBelongsToCurrentCallee: boolean;
  inviteStatus?: string | null;
}): "host" | "accept" | "resume" | "blocked";
export function resolveChatThreadCallReconciliation(input: {
  inviteExpiresAt?: string | null;
  inviteStatus?: string | null;
  nowMs?: number | null;
  roomState?: "active" | "inactive" | "unavailable" | null;
}): "preserve" | "authoritative_cleanup" | "defer";
export function shouldApplyAuthoritativeChatCallCleanup(input: {
  cleared?: boolean;
  reason?: string | null;
}): boolean;
export function doesNativeCallActionOwnTransition(input: {
  authority?: "foreground_authenticated_ui" | "none" | "trusted_native_claim";
  callInviteId?: string | null;
  currentUserId?: string | null;
  nativeIdentity?: string | null;
  nativeCallAction?: string | null;
  monotonicNowMs?: number | null;
  platform?: string | null;
  threadId?: string | null;
  trustedNativeClaim?: {
    action?: string;
    authenticatedUserId?: string;
    consumed?: boolean;
    consumedAtMonotonicMs?: number;
    expiresAtMonotonicMs?: number;
    inviteId?: string;
    nativeEventGeneration?: number;
    nativeIdentity?: string;
    platform?: string;
    source?: string;
    threadId?: string;
  } | null;
}): boolean;
export type IosAcceptedCallKitMediaDescriptor = Readonly<{authenticatedUserId: string; callUuid: string; claimId: string; inviteId: string; mediaProvider: "legacy_webrtc" | "livekit"; nativeEventGeneration: number; platform: "ios"; roomId: string; source: "ios_callkit_native_event"; threadId: string}>;
export function createIosAcceptedCallKitMediaDescriptor(input?: Record<string, unknown>): IosAcceptedCallKitMediaDescriptor | null;
export function terminateIosAcceptedNativeAnswer(input?: Record<string, unknown>, operations?: Record<string, (...args: any[]) => unknown>): Promise<boolean>;
export function completeIosAcceptedNativeAnswer(input?: Record<string, unknown>, operations?: Record<string, unknown>): Promise<{descriptor?: IosAcceptedCallKitMediaDescriptor; status: "denied" | "ready" | "terminal_confirmed" | "terminal_retryable"}>;
export function settleIosAcceptedCallKitMediaFailure(input?: Record<string, unknown>, operations?: Record<string, (...args: any[]) => unknown>): Promise<{descriptor?: IosAcceptedCallKitMediaDescriptor; status: "denied" | "retryable" | "settled" | "settled_cleanup_pending"}>;
export function doesForegroundAuthenticatedUiCallIntentOwnAction(input: {
  action?: string | null;
  activeInviteId?: string | null;
  activeRoomId?: string | null;
  authority?: "foreground_authenticated_ui" | "none";
  currentUserId?: string | null;
  foregroundUiIntent?: {
    action?: string;
    authenticatedUserId?: string;
    consumed?: boolean;
    consumedAtMonotonicMs?: number;
    expiresAtMonotonicMs?: number;
    inviteId?: string;
    roomId?: string;
    source?: string;
    threadId?: string;
  } | null;
  monotonicNowMs?: number | null;
  threadId?: string | null;
}): boolean;
export function resolveIosChatCallAudioRoute(callType?: string | null): "speaker" | "receiver";
export function shouldActivateAcceptedChatCallMedia(input: { roomId?: string | null; inviteStatus?: string | null }): boolean;
