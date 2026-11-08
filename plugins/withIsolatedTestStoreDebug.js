const { createRunOncePlugin, withAndroidManifest, withInfoPlist, withEntitlementsPlist } = require("@expo/config-plugins");
const contract = require("../config/test-store-debug-v1.json");

function withIsolatedTestStoreDebug(config, { nativeConfig = null } = {}) {
  if (config.ios?.bundleIdentifier !== contract.applicationId || config.android?.package !== contract.applicationId
    || config.updates?.enabled !== false || config.scheme !== contract.scheme)
    throw new Error("Isolated Test Store native identity is incomplete.");
  config = withInfoPlist(config, mod => {
    mod.modResults.SCV1TestStoreFlavor = true;
    mod.modResults.SCV1TestStoreConfiguration = nativeConfig ?? {};
    return mod;
  });
  config = withEntitlementsPlist(config, mod => {
    // Shared app/keychain/iCloud groups could couple the two installations.
    mod.modResults = {};
    return mod;
  });
  return withAndroidManifest(config, mod => {
    const manifest = mod.modResults.manifest;
    if (manifest.$["android:sharedUserId"]) throw new Error("Isolated Test Store cannot share an Android user identity.");
    const app = manifest.application?.[0];
    if (!app) throw new Error("Missing isolated Android application.");
    app.$["android:allowBackup"] = "false";
    app.$["android:fullBackupContent"] = "false";
    app["meta-data"] = (app["meta-data"] ?? []).filter(item => !["SCV1_TESTSTORE_FLAVOR", "SCV1_TESTSTORE_CONFIG"].includes(item.$?.["android:name"]));
    app["meta-data"].push({ $: { "android:name": "SCV1_TESTSTORE_FLAVOR", "android:value": "true" } },
      { $: { "android:name": "SCV1_TESTSTORE_CONFIG", "android:value": JSON.stringify(nativeConfig ?? {}) } });
    return mod;
  });
}
module.exports = createRunOncePlugin(withIsolatedTestStoreDebug, "with-isolated-test-store-debug", "1.0.0");
module.exports.withIsolatedTestStoreDebug = withIsolatedTestStoreDebug;
