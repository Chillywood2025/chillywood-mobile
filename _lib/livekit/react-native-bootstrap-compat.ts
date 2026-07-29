export const WEBRTC_AUDIO_LIFECYCLE_ACTIVE_METHODS = [
  "audioDeviceModuleSetEngineCreatedActive",
  "audioDeviceModuleSetWillEnableEngineActive",
  "audioDeviceModuleSetWillStartEngineActive",
  "audioDeviceModuleSetDidStopEngineActive",
  "audioDeviceModuleSetDidDisableEngineActive",
  "audioDeviceModuleSetWillReleaseEngineActive",
] as const;

type MutableNavigatorIdentity = {
  product?: unknown;
  userAgent?: unknown;
};

type MutableNativeModule = Record<string, unknown>;

export function ensureReactNativeNavigatorUserAgent(
  navigatorIdentity: MutableNavigatorIdentity | null | undefined,
) {
  if (!navigatorIdentity || typeof navigatorIdentity !== "object") return false;
  if (
    typeof navigatorIdentity.userAgent === "string"
    && navigatorIdentity.userAgent.trim()
  ) {
    return false;
  }

  const product = typeof navigatorIdentity.product === "string"
    ? navigatorIdentity.product.trim()
    : "";
  try {
    navigatorIdentity.userAgent = product || "ReactNative";
    return true;
  } catch {
    return false;
  }
}

export function installLegacyWebRtcAudioLifecycleShims(
  webRtcModule: MutableNativeModule | null | undefined,
) {
  if (!webRtcModule || typeof webRtcModule !== "object") return [] as string[];

  const installed: string[] = [];
  WEBRTC_AUDIO_LIFECYCLE_ACTIVE_METHODS.forEach((method) => {
    if (typeof webRtcModule[method] === "function") return;
    webRtcModule[method] = () => undefined;
    installed.push(method);
  });
  return installed;
}
