import Constants from "expo-constants";
import * as Updates from "expo-updates";
import { Platform } from "react-native";

import { createInternalCallMediaDiagnosticReporter } from "./internalCallMediaDiagnosticPolicy.mjs";

// Updates.channel comes from the signed native build, never from route params,
// user preferences, backend configuration, or an Expo extra channel label.
export const reportInternalCallMediaDiagnostic = createInternalCallMediaDiagnosticReporter({
  readContext: () => ({
    enabled: Constants.expoConfig?.extra?.runtime?.internalCallMediaDiagnosticsEnabled,
    channel: Updates.channel,
    platform: Platform.OS,
  }),
  emit: (line: string) => console.info(line),
  now: () => performance.now(),
});
