import "./dom-exception-polyfill";

import { NativeModules, Platform } from "react-native";

import { reportRuntimeError } from "../logger";
import {
  ensureReactNativeNavigatorUserAgent,
  installLegacyWebRtcAudioLifecycleShims,
  notifyWebRtcAudioSessionLifecycle,
  type WebRtcAudioSessionLifecycle,
} from "./react-native-bootstrap-compat";

type LiveKitReactNativeModule = {
  registerGlobals: (options?: { autoConfigureAudioSession?: boolean }) => void;
};

let didRegisterLiveKitGlobals = false;

export function synchronizeLiveKitCallKitAudioSession(
  lifecycle: WebRtcAudioSessionLifecycle,
) {
  if (Platform.OS !== "ios") return false;
  try {
    return notifyWebRtcAudioSessionLifecycle(
      NativeModules.WebRTCModule as Record<string, unknown> | undefined,
      lifecycle,
    );
  } catch (error) {
    reportRuntimeError("livekit-callkit-audio-session", error, { lifecycle });
    return false;
  }
}

export function bootstrapLiveKitFoundation() {
  if (didRegisterLiveKitGlobals || Platform.OS === "web") return;

  try {
    ensureReactNativeNavigatorUserAgent(globalThis.navigator);
    if (Platform.OS === "ios") {
      installLegacyWebRtcAudioLifecycleShims(
        NativeModules.WebRTCModule as Record<string, unknown> | undefined,
      );
    }
    // LiveKit performs native global registration and must not initialize on web.
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const liveKitModule = require("@livekit/react-native") as LiveKitReactNativeModule;
    liveKitModule.registerGlobals({
      autoConfigureAudioSession: Platform.OS !== "ios",
    });
    didRegisterLiveKitGlobals = true;
  } catch (error) {
    reportRuntimeError("livekit-bootstrap", error, {
      platform: Platform.OS,
    });
  }
}
