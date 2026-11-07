import { createHash } from "node:crypto";
import type { ExpoConfig } from "@expo/config";
import contract from "./test-store-debug-v1.json";

const profiles = ["isolated-test-store-debug-ios", "isolated-test-store-debug-ios-simulator", "isolated-test-store-debug-android"];
type Environment = { EAS_BUILD_PROFILE?: string; CHILLYWOOD_TEST_STORE_FLAVOR?: string; CHILLYWOOD_TEST_STORE_NATIVE_CONFIG?: string };
export function isolatedTestStoreDebugConfig(base: ExpoConfig, environment: Environment): ExpoConfig | null {
  const selected = profiles.includes(environment.EAS_BUILD_PROFILE ?? "");
  const flavor = environment.CHILLYWOOD_TEST_STORE_FLAVOR;
  if (!selected && !flavor && !environment.CHILLYWOOD_TEST_STORE_NATIVE_CONFIG) return null;
  if (!selected || flavor !== "isolated-test-store-debug-v1") throw new Error("Isolated Test Store requires its explicit debug build profile.");
  const platform = environment.EAS_BUILD_PROFILE === "isolated-test-store-debug-android" ? "android" : "ios";
  let nativeConfig: Record<string, string> | null = null;
  // This input is incorporated into the native artifact, never Expo extra or an
  // OTA manifest. Supplying it does not prove external project ownership/store
  // exclusivity; those facts must be independently qualified before a build.
  if (environment.CHILLYWOOD_TEST_STORE_NATIVE_CONFIG) {
    let provider: unknown;
    try { provider = JSON.parse(environment.CHILLYWOOD_TEST_STORE_NATIVE_CONFIG); }
    catch { throw new Error("Invalid native Test Store configuration."); }
    const p = provider as Record<string, unknown>;
    if (!p || typeof p !== "object" || Array.isArray(p) || Object.keys(p).sort().join(",") !== "appId,projectId,publicSdkKey"
      || typeof p.projectId !== "string" || !/^[A-Za-z0-9_-]{4,100}$/u.test(p.projectId)
      || typeof p.appId !== "string" || !/^[A-Za-z0-9_-]{4,100}$/u.test(p.appId)
      || typeof p.publicSdkKey !== "string" || !/^test_[A-Za-z0-9_-]{8,200}$/u.test(p.publicSdkKey))
      throw new Error("Invalid native Test Store configuration.");
    const descriptor = { protocol: contract.protocol, mode: contract.mode, platform, applicationId: contract.applicationId,
      projectId: p.projectId, appId: p.appId, publicSdkKeySha256: createHash("sha256").update(p.publicSdkKey).digest("hex"),
      storageNamespace: contract.storageNamespace };
    nativeConfig = { protocol: descriptor.protocol, mode: descriptor.mode, platform, applicationId: contract.applicationId,
      projectId: p.projectId, appId: p.appId, publicSdkKey: p.publicSdkKey, storageNamespace: contract.storageNamespace,
      configId: createHash("sha256").update(JSON.stringify(descriptor)).digest("hex") };
  }
  return {
    ...base,
    name: "Chi'llywood Test Store", slug: "chillywood-test-store-debug", scheme: contract.scheme,
    updates: { enabled: false, checkAutomatically: "NEVER", fallbackToCacheTimeout: 0 },
    runtimeVersion: undefined,
    ios: { ...base.ios, bundleIdentifier: contract.applicationId, appleTeamId: undefined, googleServicesFile: undefined,
      associatedDomains: [], entitlements: {}, runtimeVersion: contract.iosRuntimeVersion,
      infoPlist: { ...base.ios?.infoPlist, CFBundleURLTypes: undefined, SCV1TestStoreFlavor: true,
        SCV1TestStoreConfiguration: nativeConfig ?? {} } },
    android: { ...base.android, package: contract.applicationId, googleServicesFile: undefined, intentFilters: [],
      allowBackup: false, runtimeVersion: contract.androidRuntimeVersion },
    // No inherited production EAS project, callback links, provider files or
    // dynamic native-call/Firebase plugins. Their isolated equivalents are not
    // provisioned by selecting this source profile.
    extra: { router: base.extra?.router ?? {}, isolatedTestStoreFlavor: "isolated-test-store-debug-v1" },
    plugins: [...(base.plugins ?? []), ["./plugins/withIsolatedTestStoreDebug", { nativeConfig }]],
  };
}
