// Generated from config/release/ios-qa.json and config/release/android-production.json.
// Run npm run generate:release-manifest-contract; CI fails when these values drift.
export const IOS_QA_RELEASE_MANIFEST = Object.freeze({
  "manifestVersion": 1,
  "platform": "ios",
  "appId": "6791217176",
  "bundleIdentifier": "com.chillywood.mobile",
  "appVersion": "1.0.0",
  "nativeBuild": "8",
  "runtimeVersion": "1.0.0-iosqa1",
  "channel": "ios-qa",
  "distributionSource": "testflight_internal",
  "sourceCommit": "bbb9d6db67620b1d39e3a3e67ab8ef7166ce02ae",
  "binarySha256": "24a951d58302dd73e13e4adc899fc28680472eb78f37cac04639ee95896e36d8",
  "appStoreConnectBuildId": "a6ed5eda-fe76-4dd0-b18c-d00c72b0f00f",
  "clientCapabilities": {
    "nativeCallsBuildEnabled": true,
    "nativeCallsRuntimeEnabled": true,
    "ordinaryPushEnabled": true,
    "revenueCatAppStoreEnabled": true
  }
});

export const ANDROID_PRODUCTION_RELEASE_MANIFEST = Object.freeze({
  "manifestVersion": 2,
  "platform": "android",
  "packageIdentifier": "com.chillywood.mobile",
  "appVersion": "1.0.0",
  "nativeBuild": null,
  "runtimeVersion": "1.0.0-android-imagemanipulator-v1",
  "channel": "production",
  "distributionSource": "google_play_internal",
  "sourceCommit": null,
  "nativeCompatibilityDigest": "4abe7acf4df511520c4645be55ea01b0c5762f8184c76a4f48ed6ab31a47a50a"
});
