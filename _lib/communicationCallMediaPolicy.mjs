export function canAttemptNativeCallBackgroundAudio(input) {
  return String(input?.appState ?? "") !== "active"
    && input?.allowBackgroundAudio === true
    && input?.micRequested === true;
}

export function shouldPreserveNativeCallBackgroundAudio(input) {
  return canAttemptNativeCallBackgroundAudio(input)
    && input?.hasUsableAudioTrack === true;
}
