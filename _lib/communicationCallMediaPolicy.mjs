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

export function resolveIosChatCallAudioRoute(callType) {
  return callType === "video" ? "speaker" : "receiver";
}
