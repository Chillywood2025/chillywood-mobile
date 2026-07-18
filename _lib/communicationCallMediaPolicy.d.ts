export type NativeCallBackgroundAudioPolicyInput = {
  appState: string;
  allowBackgroundAudio: boolean;
  micRequested: boolean;
  hasUsableAudioTrack?: boolean;
};

export function canAttemptNativeCallBackgroundAudio(input: NativeCallBackgroundAudioPolicyInput): boolean;
export function shouldPreserveNativeCallBackgroundAudio(input: NativeCallBackgroundAudioPolicyInput): boolean;
