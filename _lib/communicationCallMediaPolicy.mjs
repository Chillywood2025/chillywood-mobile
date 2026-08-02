export function canAttemptNativeCallBackgroundAudio(input) {
  return String(input?.appState ?? "") !== "active"
    && input?.allowBackgroundAudio === true
    && input?.micRequested === true;
}

export function shouldPreserveNativeCallBackgroundAudio(input) {
  return canAttemptNativeCallBackgroundAudio(input)
    && input?.hasUsableAudioTrack === true;
}

export function setActiveCommunicationTracksEnabled(tracks, enabled) {
  let updatedCount = 0;
  for (const track of Array.isArray(tracks) ? tracks : []) {
    if (!track || String(track.readyState ?? "").trim().toLowerCase() === "ended") continue;
    track.enabled = enabled === true;
    updatedCount += 1;
  }
  return updatedCount;
}

export function resolveIncomingCallRoomJoinAction(input) {
  if (input?.currentUserIsRoomHost === true) return "host";
  if (input?.inviteBelongsToCurrentCallee !== true) return "blocked";
  if (input?.inviteStatus === "ringing") return "accept";
  if (input?.inviteStatus === "accepted") return "resume";
  return "blocked";
}

export function doesNativeCallActionOwnTransition(input) {
  const platform = String(input?.platform ?? "").trim().toLowerCase();
  const callInviteId = String(input?.callInviteId ?? "").trim();
  const nativeCallAction = String(input?.nativeCallAction ?? "").trim().toLowerCase();
  if (!callInviteId) return false;
  if (platform === "android") {
    return input?.trustedAndroidProvenance === true
      && ["answer", "decline"].includes(nativeCallAction);
  }
  if (platform === "ios") {
    return String(input?.nativeCallUuid ?? "").trim().length > 0
      && ["answer", "decline", "end", "mute", "unmute"].includes(nativeCallAction);
  }
  return false;
}

export function resolveChillyChatCallParticipantRole(input) {
  const currentUserId = String(input?.currentUserId ?? "").trim();
  const callerUserId = String(input?.callerUserId ?? "").trim();
  const calleeUserId = String(input?.calleeUserId ?? "").trim();
  if (!currentUserId || !callerUserId || !calleeUserId || callerUserId === calleeUserId) return "none";
  if (currentUserId === callerUserId) return "caller";
  if (currentUserId === calleeUserId) return "callee";
  return "none";
}

export function resolveIncomingCallPresentation(input) {
  if (input?.nativeCallPresentationOwned === true) return "native_ios";
  const appState = String(input?.appState ?? "").trim().toLowerCase();
  if (appState !== "active") return "native_background";
  return input?.alreadyOnSameThread === true ? "thread_banner" : "app_banner";
}

export function shouldShowOutgoingRingingPanel(input) {
  return input?.inviteStatus === "ringing"
    && resolveChillyChatCallParticipantRole(input) === "caller";
}

export function resolveIosChatCallAudioRoute(callType) {
  return callType === "video" ? "speaker" : "receiver";
}

export function resolveAcceptedChatCallRoomId(input) {
  const acceptedInviteRoomId = input?.inviteStatus === "accepted"
    ? String(input?.inviteRoomId ?? "").trim()
    : "";
  return acceptedInviteRoomId || String(input?.threadRoomId ?? "").trim();
}

export function shouldKeepAcceptedChatCallPanelOpen(input) {
  return input?.wasOpen === true
    && resolveAcceptedChatCallRoomId(input).length > 0;
}

export function shouldActivateAcceptedChatCallMedia(input) {
  return String(input?.roomId ?? "").trim().length > 0
    && input?.inviteStatus === "accepted";
}
