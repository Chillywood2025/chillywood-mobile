// @ts-check
const { createHash } = require("node:crypto");
const contract = require("./test-store-debug-v3.json");

const profiles = ["isolated-test-store-v3-debug-ios", "isolated-test-store-v3-debug-ios-simulator", "isolated-test-store-v3-debug-android"];
/**
 * @param {import("@expo/config").ExpoConfig} base
 * @param {{EAS_BUILD_PROFILE?: string, CHILLYWOOD_TEST_STORE_V3_FLAVOR?: string, CHILLYWOOD_TEST_STORE_V3_NATIVE_CONFIG?: string,
 * CHILLYWOOD_TEST_STORE_FLAVOR?: string, CHILLYWOOD_TEST_STORE_NATIVE_CONFIG?: string,
 * CHILLYWOOD_TEST_STORE_V2_FLAVOR?: string, CHILLYWOOD_TEST_STORE_V2_NATIVE_CONFIG?: string, SCQ_NATIVE_DESCRIPTOR?: string}} environment
 * @returns {import("@expo/config").ExpoConfig | null}
 */
function isolatedTestStoreV3DebugConfig(base, environment) {
  const selected = profiles.includes(environment.EAS_BUILD_PROFILE ?? "");
  if (!selected && !environment.CHILLYWOOD_TEST_STORE_V3_FLAVOR && !environment.CHILLYWOOD_TEST_STORE_V3_NATIVE_CONFIG) return null;
  if (!selected || environment.CHILLYWOOD_TEST_STORE_V3_FLAVOR !== "isolated-test-store-debug-v3"
    || environment.CHILLYWOOD_TEST_STORE_FLAVOR || environment.CHILLYWOOD_TEST_STORE_NATIVE_CONFIG
    || environment.CHILLYWOOD_TEST_STORE_V2_FLAVOR || environment.CHILLYWOOD_TEST_STORE_V2_NATIVE_CONFIG || environment.SCQ_NATIVE_DESCRIPTOR)
    throw new Error("Isolated Test Store v3 requires its exclusive explicit debug profile.");
  const platform = environment.EAS_BUILD_PROFILE === "isolated-test-store-v3-debug-android" ? "android" : "ios";
  /** @type {Record<string, string> | null} */
  let nativeConfig = null;
  if (environment.CHILLYWOOD_TEST_STORE_V3_NATIVE_CONFIG) {
    /** @type {unknown} */
    let value;
    try { value = JSON.parse(environment.CHILLYWOOD_TEST_STORE_V3_NATIVE_CONFIG); } catch { throw new Error("Invalid native Test Store v3 configuration."); }
    const p = /** @type {Record<string, unknown>} */ (value);
    if (!p || typeof p !== "object" || Array.isArray(p) || Object.keys(p).sort().join(",") !== "appId,projectId,publicSdkKey"
      || typeof p.projectId !== "string" || !/^[A-Za-z0-9_-]{4,100}$/u.test(p.projectId)
      || typeof p.appId !== "string" || !/^[A-Za-z0-9_-]{4,100}$/u.test(p.appId)
      || typeof p.publicSdkKey !== "string" || !/^test_[A-Za-z0-9_-]{8,200}$/u.test(p.publicSdkKey)) throw new Error("Invalid native Test Store v3 configuration.");
    const descriptor = { protocol: contract.protocol, mode: contract.mode, platform, applicationId: contract.applicationId,
      projectId: p.projectId, appId: p.appId, publicSdkKeySha256: createHash("sha256").update(p.publicSdkKey).digest("hex"), storageNamespace: contract.storageNamespace };
    nativeConfig = { protocol: descriptor.protocol, mode: descriptor.mode, platform, applicationId: descriptor.applicationId,
      projectId: p.projectId, appId: p.appId, publicSdkKey: p.publicSdkKey, storageNamespace: descriptor.storageNamespace,
      configId: createHash("sha256").update(JSON.stringify(descriptor)).digest("hex") };
  }
  return { ...base, name: "Chi'llywood Test Store v3", slug: "chillywood-test-store-debug-v3", scheme: contract.scheme,
    updates: { enabled: false, checkAutomatically: "NEVER", fallbackToCacheTimeout: 0 }, runtimeVersion: undefined,
    ios: { ...base.ios, bundleIdentifier: contract.applicationId, appleTeamId: undefined, googleServicesFile: undefined,
      associatedDomains: [], entitlements: {}, runtimeVersion: contract.iosRuntimeVersion,
      infoPlist: { ...base.ios?.infoPlist, CFBundleURLTypes: undefined, SCV1TestStoreFlavor: undefined, SCV1TestStoreConfiguration: undefined,
        SCV2TestStoreFlavor: undefined, SCV2TestStoreConfiguration: undefined, SCQQualificationConfiguration: undefined,
        SCV3TestStoreFlavor: true, SCV3TestStoreConfiguration: nativeConfig ?? {} } },
    android: { ...base.android, package: contract.applicationId, googleServicesFile: undefined, intentFilters: [], allowBackup: false,
      runtimeVersion: contract.androidRuntimeVersion },
    extra: { router: base.extra?.router ?? {}, isolatedTestStoreFlavor: "isolated-test-store-debug-v3" },
    plugins: [...(base.plugins ?? []).filter(p => { const name = Array.isArray(p) ? p[0] : p;
      return typeof name !== "string" || !/withIsolatedTestStore(?:V[123])?Debug|withQualification/u.test(name); }),
      ["./plugins/withIsolatedTestStoreV3Debug", { nativeConfig }]],
  };
}
module.exports = { isolatedTestStoreV3DebugConfig };
