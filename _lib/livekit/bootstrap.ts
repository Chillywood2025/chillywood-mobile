import "./dom-exception-polyfill";

import { NativeModules, Platform } from "react-native";

import { reportRuntimeError } from "../logger";
import {
  ensureReactNativeNavigatorUserAgent,
  installLegacyWebRtcAudioLifecycleShims,
} from "./react-native-bootstrap-compat";

type LiveKitReactNativeModule = {
  registerGlobals: (options?: { autoConfigureAudioSession?: boolean }) => void;
};

let didRegisterLiveKitGlobals = false;

export function bootstrapLiveKitFoundation() {
  if (didRegisterLiveKitGlobals || Platform.OS === "web") return;

  try {
    ensureReactNativeNavigatorUserAgent(globalThis.navigator);
    if (Platform.OS === "ios") {
      installLegacyWebRtcAudioLifecycleShims(
        NativeModules.WebRTCModule as Record<string, unknown> | undefined,
      );
    }
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
