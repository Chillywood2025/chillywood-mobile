import { Platform } from "react-native";

import { reportRuntimeError } from "../logger";

type LiveKitReactNativeModule = {
  registerGlobals: () => void;
};

let didRegisterLiveKitGlobals = false;

export function bootstrapLiveKitFoundation() {
  if (didRegisterLiveKitGlobals || Platform.OS === "web") return;

  try {
    const liveKitModule = require("@livekit/react-native") as LiveKitReactNativeModule;
    liveKitModule.registerGlobals();
    didRegisterLiveKitGlobals = true;
  } catch (error) {
    reportRuntimeError("livekit-bootstrap", error, {
      platform: Platform.OS,
    });
  }
}
