// Generated from config/release/ios-internal-v2.json and config/release/android-production.json.
// Run npm run generate:release-manifest-contract; CI fails when these values drift.
export const IOS_INTERNAL_V2_RELEASE_MANIFEST = Object.freeze({
  "manifestVersion": 2,
  "platform": "ios",
  "releaseLane": "internal-v2",
  "environment": "production",
  "buildProfile": "ios-internal-v2",
  "appId": "6791217176",
  "bundleIdentifier": "com.chillywood.mobile",
  "appVersion": "1.0.0",
  "nativeBuild": "13",
  "runtimeVersion": "1.0.0-ios-production-v2",
  "channel": "ios-internal-v2",
  "distributionSource": "testflight_internal",
  "binarySourceCommit": "13c4eb8a20680c0d97cfe53d0c55b1533334c269",
  "currentOtaSourceCommit": "7b7b0271fd68f66969458cce81a26371cc286e29",
  "currentOtaUpdateGroup": "3f85fc86-1a7d-429a-a87f-2235ad83a335",
  "binarySha256": "80e60ea36e32d3aac9e2b1295c599000f90e04f2a6500e86d98360f4539a95d2",
  "easBuildId": "291ebe2d-59d1-4531-ab7c-8709dd64dc27",
  "appStoreConnectBuildId": null,
  "buildStatus": "FINISHED",
  "clientCapabilities": {
    "nativeCallsBuildEnabled": true,
    "nativeCallsRuntimeEnabled": true,
    "ordinaryPushEnabled": true,
    "revenueCatAppStoreEnabled": true
  }
});

export const ANDROID_PRODUCTION_RELEASE_MANIFEST = Object.freeze({
  "manifestVersion": 3,
  "platform": "android",
  "packageIdentifier": "com.chillywood.mobile",
  "appVersion": "1.0.0",
  "nativeBuild": "84",
  "runtimeVersion": "1.0.0-android-imagemanipulator-v1",
  "channel": "production",
  "distributionSource": "google_play_internal",
  "sourceCommit": "8c426f4e74de61de7d4529d32d124744833912dc",
  "nativeCompatibilityDigest": "4abe7acf4df511520c4645be55ea01b0c5762f8184c76a4f48ed6ab31a47a50a"
});
