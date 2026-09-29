const { createRunOncePlugin, withInfoPlist } = require("@expo/config-plugins");

const isEnabled = (value) => ["1", "true", "yes", "on"].includes(String(value ?? "").trim().toLowerCase());

const resolveDiagnosticsGate = (config, env = process.env) => {
  if (!isEnabled(env.CHILLYWOOD_INTERNAL_CALL_DIAGNOSTICS)) return false;
  const generation = config.extra?.runtime?.otaGeneration;
  if (!isEnabled(env.IOS_NATIVE_CALLS_ENABLED)
    || !isEnabled(env.EXPO_PUBLIC_IOS_NATIVE_CALLS_ENABLED)
    || env.EAS_BUILD_PROFILE !== "ios-internal-v2"
    || env.CHILLYWOOD_INTERNAL_V2_OTA_PLATFORM !== "ios"
    || generation?.internalOnly !== true
    || generation?.channel !== "ios-internal-v2") {
    throw new Error("Native call diagnostics require the explicit ios-internal-v2 diagnostic build.");
  }
  return true;
};

const applyDiagnosticsGate = (infoPlist, enabled) => {
  infoPlist.ChillywoodNativeCallDiagnosticsEnabled = enabled;
  if (enabled) infoPlist.ChillywoodNativeCallDiagnosticsChannel = "ios-internal-v2";
  else delete infoPlist.ChillywoodNativeCallDiagnosticsChannel;
};

const withChillyChatIosNativeCalls = (config) => {
  const enabled = isEnabled(process.env.IOS_NATIVE_CALLS_ENABLED);
  const runtimeDefaultEnabled = isEnabled(process.env.EXPO_PUBLIC_IOS_NATIVE_CALLS_ENABLED);
  const diagnosticsEnabled = resolveDiagnosticsGate(config);

  config = withInfoPlist(config, (nextConfig) => {
    nextConfig.modResults.ChillywoodNativeCallsBuildEnabled = enabled;
    nextConfig.modResults.ChillywoodNativeCallsRuntimeDefaultEnabled = enabled && runtimeDefaultEnabled;
    applyDiagnosticsGate(nextConfig.modResults, diagnosticsEnabled);
    if (enabled) {
      const currentModes = Array.isArray(nextConfig.modResults.UIBackgroundModes)
        ? nextConfig.modResults.UIBackgroundModes
        : [];
      nextConfig.modResults.UIBackgroundModes = [
        ...new Set([...currentModes, "audio", "remote-notification", "voip"]),
      ];
    }
    return nextConfig;
  });

  return config;
};

module.exports = createRunOncePlugin(
  withChillyChatIosNativeCalls,
  "with-chillywood-ios-native-calls",
  "1.0.0",
);
module.exports.__test = { resolveDiagnosticsGate, applyDiagnosticsGate };
