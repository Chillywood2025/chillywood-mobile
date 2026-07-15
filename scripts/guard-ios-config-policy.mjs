#!/usr/bin/env node

import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import path from "node:path";
import { isDeepStrictEqual } from "node:util";

const root = process.cwd();
const expectedBundleIdentifier = "com.chillywood.mobile";
const expectedAppleTeamId = "CU7536UQK9";
const requiredAssociatedDomain = "applinks:chillywoodstream.com";
const firebasePathProbe = "./.ios-config-policy/GoogleService-Info.plist";
const failures = [];

const read = (relativePath) => readFileSync(path.join(root, relativePath), "utf8");
const readJson = (relativePath) => JSON.parse(read(relativePath));
const assert = (condition, message) => {
  if (!condition) failures.push(message);
};
const assertEqual = (actual, expected, message) => {
  assert(isDeepStrictEqual(actual, expected), message);
};

const appJson = readJson("app.json");
const easJson = readJson("eas.json");
const packageJson = readJson("package.json");
const appConfigSource = read("app.config.ts");
const liveKitIosCompatibilityPlugin = read("plugins/withLiveKitIosStaticFrameworkCompatibility.js");
const runtimeValidationSource = read("scripts/validate-runtime.mjs");
const expo = appJson.expo ?? {};
const ios = expo.ios ?? {};

assert(ios.bundleIdentifier === expectedBundleIdentifier, `iOS bundle identifier must be ${expectedBundleIdentifier}`);
assert(ios.appleTeamId === expectedAppleTeamId, `iOS Apple Team ID must be ${expectedAppleTeamId}`);
assert(ios.supportsTablet === true, "iOS supportsTablet must remain true");
assert(expo.orientation === "default", "Expo orientation must remain default");
assert(expo.newArchEnabled === true, "Expo newArchEnabled must remain true");
assert(/^\d+$/u.test(String(ios.buildNumber ?? "")), "iOS buildNumber must be a numeric string");

const associatedDomains = Array.isArray(ios.associatedDomains) ? ios.associatedDomains : [];
assert(
  associatedDomains.includes(requiredAssociatedDomain),
  `iOS associatedDomains must include ${requiredAssociatedDomain}`,
);
const entitlementDomains = Array.isArray(ios.entitlements?.["com.apple.developer.associated-domains"])
  ? ios.entitlements["com.apple.developer.associated-domains"]
  : [];
assert(
  entitlementDomains.includes(requiredAssociatedDomain),
  `iOS associated-domain entitlement must include ${requiredAssociatedDomain}`,
);

assert(
  ios.infoPlist?.NSCameraUsageDescription
    === "Chi'llywood uses your camera so you can make video calls and join live rooms.",
  "iOS camera purpose string changed unexpectedly",
);
assert(
  ios.infoPlist?.NSMicrophoneUsageDescription
    === "Chi'llywood uses your microphone so you can speak in calls and live rooms.",
  "iOS microphone purpose string changed unexpectedly",
);
assert(
  typeof ios.infoPlist?.NSPhotoLibraryUsageDescription === "string"
    && ios.infoPlist.NSPhotoLibraryUsageDescription.trim().length > 0,
  "iOS photo-library purpose string is required",
);
assert(
  !("NSPhotoLibraryAddUsageDescription" in (ios.infoPlist ?? {})),
  "NSPhotoLibraryAddUsageDescription must not be added unless the app writes to Photos",
);
assert(
  ios.infoPlist?.ITSAppUsesNonExemptEncryption === false,
  "iOS export compliance must declare standard/exempt encryption only",
);

assert(appConfigSource.includes("process.env.IOS_GOOGLE_SERVICES_FILE"), "app.config.ts must support IOS_GOOGLE_SERVICES_FILE");
assert(appConfigSource.includes('"./GoogleService-Info.plist"'), "app.config.ts must support the ignored local Firebase plist fallback");
assert(appConfigSource.includes("existingIosInfoPlist"), "app.config.ts must merge existing ios.infoPlist values");
assert(appConfigSource.includes("existingIosEntitlements"), "app.config.ts must merge existing iOS entitlements");
assert(appConfigSource.includes('useFrameworks: "static"'), "iOS static-framework configuration must remain unchanged");
assert(
  appConfigSource.includes("./plugins/withLiveKitIosStaticFrameworkCompatibility"),
  "app.config.ts must apply the target-scoped LiveKit iOS static-framework compatibility plugin",
);
assert(
  liveKitIosCompatibilityPlugin.includes("livekit-react-native-webrtc")
    && liveKitIosCompatibilityPlugin.includes("CLANG_ALLOW_NON_MODULAR_INCLUDES_IN_FRAMEWORK_MODULES")
    && liveKitIosCompatibilityPlugin.includes("withPodfile"),
  "LiveKit iOS compatibility must remain scoped to its generated CocoaPods target",
);
assert(runtimeValidationSource.includes("CHILLYWOOD_VALIDATE_PLATFORM"), "runtime validation must support an explicit platform mode");
assert(runtimeValidationSource.includes("CHILLYWOOD_IOS_PURCHASES_REQUIRED"), "runtime validation must gate iOS RevenueCat requirements explicitly");

assert(easJson.cli?.appVersionSource === "remote", "EAS appVersionSource must remain remote");
assert(easJson.build?.production?.autoIncrement === true, "EAS production must auto-increment native build versions");
assert(easJson.build?.production?.distribution === "store", "EAS production distribution must remain store");
assert(easJson.build?.development?.environment === "development", "EAS development must use the development environment");
assert(easJson.build?.preview?.environment === "preview", "EAS preview must use the preview environment");
assert(easJson.build?.production?.environment === "production", "EAS production must use the production environment");
assert(easJson.build?.["development-simulator"]?.extends === "development", "EAS iOS simulator profile must extend development");
assert(easJson.build?.["development-simulator"]?.ios?.simulator === true, "EAS iOS simulator profile must set ios.simulator=true");

const ascAppIds = [];
const collectAscAppIds = (value) => {
  if (!value || typeof value !== "object") return;
  for (const [key, entry] of Object.entries(value)) {
    if (key === "ascAppId") ascAppIds.push(entry);
    collectAscAppIds(entry);
  }
};
collectAscAppIds(easJson);
for (const ascAppId of ascAppIds) {
  assert(/^\d+$/u.test(String(ascAppId)), "EAS ascAppId must be a real numeric App Store Connect app ID, never a placeholder");
}

const expectedAndroidAppConfig = {
  package: "com.chillywood.mobile",
  versionCode: 55,
  permissions: [
    "CAMERA",
    "POST_NOTIFICATIONS",
    "RECORD_AUDIO",
    "MODIFY_AUDIO_SETTINGS",
    "USE_FULL_SCREEN_INTENT",
  ],
  adaptiveIcon: {
    backgroundColor: "#03030F",
    foregroundImage: "./assets/images/android-icon-foreground.png",
    backgroundImage: "./assets/images/android-icon-background.png",
    monochromeImage: "./assets/images/android-icon-monochrome.png",
  },
  edgeToEdgeEnabled: true,
  predictiveBackGestureEnabled: false,
};
assertEqual(expo.android, expectedAndroidAppConfig, "app.json Android configuration changed from the protected baseline");

const withoutIos = (profile) => {
  if (!profile || typeof profile !== "object") return profile;
  const { ios: _ios, ...androidEffectiveProfile } = profile;
  return androidEffectiveProfile;
};
assertEqual(withoutIos(easJson.build?.development), {
  developmentClient: true,
  distribution: "internal",
  channel: "development",
  environment: "development",
}, "EAS development Android behavior changed from the protected baseline");
assertEqual(withoutIos(easJson.build?.preview), {
  developmentClient: false,
  distribution: "internal",
  channel: "preview",
  environment: "preview",
}, "EAS preview Android behavior changed from the protected baseline");
assertEqual(withoutIos(easJson.build?.production), {
  autoIncrement: true,
  channel: "production",
  distribution: "store",
  environment: "production",
  android: { buildType: "app-bundle" },
}, "EAS production Android behavior changed from the protected baseline");
assertEqual(withoutIos(easJson.build?.["production-apk"]), {
  autoIncrement: true,
  channel: "production",
  distribution: "internal",
  environment: "production",
  android: { buildType: "apk" },
}, "EAS production-apk Android behavior changed from the protected baseline");
assertEqual(easJson.submit?.production?.android, { track: "internal" }, "EAS production Android submit behavior changed");
assertEqual(
  easJson.submit?.closed?.android,
  { track: "alpha", releaseStatus: "draft" },
  "EAS closed Android submit behavior changed",
);

assert(packageJson.scripts?.["guard:ios-config-policy"] === "node ./scripts/guard-ios-config-policy.mjs", "package.json must expose guard:ios-config-policy");
assert(packageJson.scripts?.["proof:ios-config"] === "node ./scripts/proof-ios-config.mjs", "package.json must expose proof:ios-config");

let resolvedConfig = null;
try {
  const npxCommand = process.platform === "win32" ? "npx.cmd" : "npx";
  const output = execFileSync(npxCommand, ["expo", "config", "--type", "public", "--json"], {
    cwd: root,
    encoding: "utf8",
    env: {
      CI: "1",
      EXPO_NO_CLIENT_ENV_VARS: "1",
      EXPO_NO_DOTENV: "1",
      HOME: process.env.HOME,
      IOS_GOOGLE_SERVICES_FILE: firebasePathProbe,
      PATH: process.env.PATH,
    },
    stdio: ["ignore", "pipe", "ignore"],
  });
  resolvedConfig = JSON.parse(output);
} catch {
  failures.push("Unable to resolve Expo public config in an isolated, no-secret environment");
}

if (resolvedConfig) {
  assert(resolvedConfig.ios?.bundleIdentifier === expectedBundleIdentifier, "resolved iOS bundle identifier is incorrect");
  assert(resolvedConfig.ios?.appleTeamId === expectedAppleTeamId, "resolved Apple Team ID is incorrect");
  assert(resolvedConfig.ios?.googleServicesFile === firebasePathProbe, "IOS_GOOGLE_SERVICES_FILE must take priority in resolved Expo config");
  assert(
    Array.isArray(resolvedConfig.ios?.associatedDomains)
      && resolvedConfig.ios.associatedDomains.includes(requiredAssociatedDomain),
    "resolved iOS Associated Domains configuration is incomplete",
  );
  assert(resolvedConfig.android?.package === expectedBundleIdentifier, "resolved Android package changed unexpectedly");
  assert(resolvedConfig.android?.googleServicesFile === "./google-services.json", "resolved Android Firebase configuration changed unexpectedly");
}

if (failures.length) {
  console.error("iOS configuration policy guard failed:");
  failures.forEach((failure) => console.error(`- ${failure}`));
  process.exit(1);
}

console.log("iOS configuration policy guard passed.");
