const { withAndroidManifest, withInfoPlist, withEntitlementsPlist } = require("@expo/config-plugins");
const { applicationId } = require("../config");
module.exports = function withQualification(config, { nativeConfig = null } = {}) {
  if (config.ios?.bundleIdentifier !== applicationId || config.android?.package !== applicationId || config.updates?.enabled !== false)
    throw new Error("Qualification native identity unavailable");
  config = withInfoPlist(config, value => { value.modResults.SCQQualificationConfiguration = nativeConfig ?? {}; return value; });
  config = withEntitlementsPlist(config, value => { value.modResults = {}; return value; });
  return withAndroidManifest(config, value => {
    const manifest = value.modResults.manifest, app = manifest.application?.[0];
    if (!app || manifest.$["android:sharedUserId"]) throw new Error("Qualification private Android identity unavailable");
    app.$["android:allowBackup"] = "false"; app.$["android:fullBackupContent"] = "false";
    app["meta-data"] = (app["meta-data"] ?? []).filter(item => item.$?.["android:name"] !== "SCQ_QUALIFICATION_CONFIG");
    app["meta-data"].push({ $: { "android:name": "SCQ_QUALIFICATION_CONFIG", "android:value": JSON.stringify(nativeConfig ?? {}) } });
    return value;
  });
};
