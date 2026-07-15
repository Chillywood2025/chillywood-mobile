const { createRunOncePlugin, withInfoPlist } = require("@expo/config-plugins");

const isEnabled = (value) => ["1", "true", "yes", "on"].includes(String(value ?? "").trim().toLowerCase());

const withChillyChatIosNativeCalls = (config) => {
  const enabled = isEnabled(process.env.IOS_NATIVE_CALLS_ENABLED);

  config = withInfoPlist(config, (nextConfig) => {
    nextConfig.modResults.ChillywoodNativeCallsBuildEnabled = enabled;
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
