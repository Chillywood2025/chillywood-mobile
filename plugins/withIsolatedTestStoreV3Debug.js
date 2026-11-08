const { createRunOncePlugin, withAndroidManifest, withInfoPlist, withEntitlementsPlist } = require("@expo/config-plugins");
const contract = require("../config/test-store-debug-v3.json");
function withIsolatedTestStoreV3Debug(config, { nativeConfig = null } = {}) {
  if (config.ios?.bundleIdentifier !== contract.applicationId || config.android?.package !== contract.applicationId
    || config.updates?.enabled !== false || config.scheme !== contract.scheme) throw new Error("Isolated Test Store v3 identity is incomplete.");
  config = withInfoPlist(config, mod => {
    delete mod.modResults.SCV1TestStoreFlavor; delete mod.modResults.SCV1TestStoreConfiguration;
    delete mod.modResults.SCV2TestStoreFlavor; delete mod.modResults.SCV2TestStoreConfiguration;
    delete mod.modResults.SCQQualificationConfiguration;
    mod.modResults.SCV3TestStoreFlavor = true; mod.modResults.SCV3TestStoreConfiguration = nativeConfig ?? {}; return mod;
  });
  config = withEntitlementsPlist(config, mod => { mod.modResults = {}; return mod; });
  return withAndroidManifest(config, mod => {
    const manifest = mod.modResults.manifest;
    if (manifest.$["android:sharedUserId"]) throw new Error("Isolated Test Store v3 cannot share an Android user identity.");
    const app = manifest.application?.[0]; if (!app) throw new Error("Missing isolated Android application.");
    app.$["android:allowBackup"] = "false"; app.$["android:fullBackupContent"] = "false";
    app["meta-data"] = (app["meta-data"] ?? []).filter(item => !/^(?:SCV[123]_TESTSTORE_(?:FLAVOR|CONFIG)|SCQ_QUALIFICATION_CONFIG)$/u.test(item.$?.["android:name"]));
    app["meta-data"].push({ $: { "android:name": "SCV3_TESTSTORE_FLAVOR", "android:value": "true" } },
      { $: { "android:name": "SCV3_TESTSTORE_CONFIG", "android:value": JSON.stringify(nativeConfig ?? {}) } }); return mod;
  });
}
module.exports = createRunOncePlugin(withIsolatedTestStoreV3Debug, "with-isolated-test-store-v3-debug", "1.0.0");
module.exports.withIsolatedTestStoreV3Debug = withIsolatedTestStoreV3Debug;
