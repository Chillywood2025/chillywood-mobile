export type NativeCallBackgroundAudioPolicyInput = {
  appState: string;
  allowBackgroundAudio: boolean;
  micRequested: boolean;
  hasUsableAudioTrack?: boolean;
};

export function canAttemptNativeCallBackgroundAudio(input: NativeCallBackgroundAudioPolicyInput): boolean;
export function shouldPreserveNativeCallBackgroundAudio(input: NativeCallBackgroundAudioPolicyInput): boolean;

export type ChillyChatCallParticipantRoleInput = {
  currentUserId?: string | null;
  callerUserId?: string | null;
  calleeUserId?: string | null;
};

export type IncomingCallPresentationInput = {
  appState?: string | null;
  alreadyOnSameThread?: boolean;
};

export function resolveChillyChatCallParticipantRole(input: ChillyChatCallParticipantRoleInput): "caller" | "callee" | "none";
export function resolveIncomingCallPresentation(input: IncomingCallPresentationInput): "native_background" | "thread_banner" | "app_banner";
export function shouldShowOutgoingRingingPanel(
  input: ChillyChatCallParticipantRoleInput & { inviteStatus?: string | null },
): boolean;

export function setActiveCommunicationTracksEnabled(tracks: Array<{ readyState?: string; enabled: boolean }>, enabled: boolean): number;
export function resolveIncomingCallRoomJoinAction(input: {
  currentUserIsRoomHost: boolean;
  inviteBelongsToCurrentCallee: boolean;
  inviteStatus?: string | null;
}): "host" | "accept" | "resume" | "blocked";
export function resolveIosChatCallAudioRoute(callType?: string | null): "speaker" | "receiver";
export function shouldActivateAcceptedChatCallMedia(input: { roomId?: string | null; inviteStatus?: string | null }): boolean;
