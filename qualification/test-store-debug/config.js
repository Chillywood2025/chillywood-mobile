const { createHash } = require("node:crypto");
const applicationId = "com.chillywood.qualification.teststore";
const uuid = value => typeof value === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u.test(value);
const text = value => typeof value === "string" && /^[A-Za-z0-9_.$:-]{1,160}$/u.test(value);
const row = value => !!value && typeof value === "object" && !Array.isArray(value);
const keys = (value, expected) => row(value) && Object.keys(value).sort().join(",") === [...expected].sort().join(",");
const fail = () => { throw new Error("Qualification DEBUG descriptor unavailable"); };
function descriptor(raw, platform) {
  if (!raw) return null;
  let value; try { value = JSON.parse(raw); } catch { return fail(); }
  if (!keys(value, ["qualificationConnectionId", "qualificationConnectionRevision", "projectId", "appId", "publicSdkKey", "runId", "scenarios"])
    || !uuid(value.qualificationConnectionId) || !uuid(value.runId) || !Number.isSafeInteger(value.qualificationConnectionRevision)
    || value.qualificationConnectionRevision < 1 || !text(value.projectId) || !text(value.appId)
    || typeof value.publicSdkKey !== "string" || !/^test_[A-Za-z0-9_-]{8,200}$/u.test(value.publicSdkKey)
    || !Array.isArray(value.scenarios) || value.scenarios.length < 1 || value.scenarios.length > 8) return fail();
  const ids = new Set();
  for (const scenario of value.scenarios) {
    if (!keys(scenario, ["id", "label", "providerOfferingId", "offeringIdentifier", "providerPackageId", "packageIdentifier", "providerProductId", "productId", "amountMinor", "currency", "intendedAction"])
      || !uuid(scenario.id) || ids.has(scenario.id) || typeof scenario.label !== "string" || scenario.label.length < 1 || scenario.label.length > 80
      || /[\u0000-\u001f\u007f]/u.test(scenario.label) || !["providerOfferingId", "offeringIdentifier", "providerPackageId", "packageIdentifier", "providerProductId", "productId"].every(key => text(scenario[key]))
      || !Number.isSafeInteger(scenario.amountMinor) || scenario.amountMinor < 1 || scenario.amountMinor > 10_000
      || scenario.currency !== "usd" || !["purchase", "cancel"].includes(scenario.intendedAction)) return fail();
    ids.add(scenario.id);
  }
  const profile = { protocol: "test-store-qualification-build-v1", mode: "record-only-debug", platform, applicationId,
    runtime: `scq-v1-${platform}`, storageNamespace: "scq-native-v1", qualificationConnectionId: value.qualificationConnectionId,
    qualificationConnectionRevision: value.qualificationConnectionRevision, projectId: value.projectId, appId: value.appId,
    publicSdkKeySha256: createHash("sha256").update(value.publicSdkKey).digest("hex"), runId: value.runId, scenarios: value.scenarios };
  const descriptorJson = JSON.stringify(profile);
  return { descriptorJson, publicSdkKey: value.publicSdkKey, configurationDigest: createHash("sha256").update(descriptorJson).digest("hex") };
}
function qualificationConfig(environment) {
  if (!["ios", "android"].includes(environment.SCQ_PLATFORM ?? "")) return fail();
  const nativeConfig = descriptor(environment.SCQ_NATIVE_DESCRIPTOR, environment.SCQ_PLATFORM);
  return { name: "Test Store Qualification", slug: "chillywood-test-store-qualification", version: "0.1.0",
    scheme: "chillywood-test-store-qualification", orientation: "portrait", newArchEnabled: true,
    updates: { enabled: false, checkAutomatically: "NEVER", fallbackToCacheTimeout: 0 },
    ios: { bundleIdentifier: applicationId, supportsTablet: false, runtimeVersion: "scq-v1-ios", associatedDomains: [],
      infoPlist: { SCQQualificationConfiguration: nativeConfig ?? {}, UIBackgroundModes: [] } },
    android: { package: applicationId, allowBackup: false, runtimeVersion: "scq-v1-android", permissions: [], blockedPermissions: ["android.permission.AD_ID"] },
    plugins: [["./plugins/withQualification", { nativeConfig }]],
    extra: { qualificationOnly: true, economicProjectionAllowed: false },
  };
}
module.exports = { applicationId, descriptor, qualificationConfig };
