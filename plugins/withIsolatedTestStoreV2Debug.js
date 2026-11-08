const { createRunOncePlugin, withAndroidManifest, withInfoPlist, withEntitlementsPlist } = require("@expo/config-plugins");
const contract = require("../config/test-store-debug-v2.json");
function withIsolatedTestStoreV2Debug(config, { nativeConfig = null } = {}) {
  if (config.ios?.bundleIdentifier !== contract.applicationId || config.android?.package !== contract.applicationId
    || config.updates?.enabled !== false || config.scheme !== contract.scheme) throw new Error("Isolated Test Store v2 identity is incomplete.");
  config = withInfoPlist(config, mod => {
    delete mod.modResults.SCV1TestStoreFlavor; delete mod.modResults.SCV1TestStoreConfiguration;
    mod.modResults.SCV2TestStoreFlavor = true; mod.modResults.SCV2TestStoreConfiguration = nativeConfig ?? {}; return mod;
  });
  config = withEntitlementsPlist(config, mod => { mod.modResults = {}; return mod; });
  return withAndroidManifest(config, mod => {
    const manifest = mod.modResults.manifest;
    if (manifest.$["android:sharedUserId"]) throw new Error("Isolated Test Store v2 cannot share an Android user identity.");
    const app = manifest.application?.[0]; if (!app) throw new Error("Missing isolated Android application.");
    app.$["android:allowBackup"] = "false"; app.$["android:fullBackupContent"] = "false";
    app["meta-data"] = (app["meta-data"] ?? []).filter(item => !/^SCV[12]_TESTSTORE_(FLAVOR|CONFIG)$/u.test(item.$?.["android:name"]));
    app["meta-data"].push({ $: { "android:name": "SCV2_TESTSTORE_FLAVOR", "android:value": "true" } },
      { $: { "android:name": "SCV2_TESTSTORE_CONFIG", "android:value": JSON.stringify(nativeConfig ?? {}) } }); return mod;
  });
}
module.exports = createRunOncePlugin(withIsolatedTestStoreV2Debug, "with-isolated-test-store-v2-debug", "1.0.0");
module.exports.withIsolatedTestStoreV2Debug = withIsolatedTestStoreV2Debug;
