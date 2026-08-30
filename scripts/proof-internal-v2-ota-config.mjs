import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";

const readConfig = (target) => {
  const env = {
    ...process.env,
    EXPO_PUBLIC_IOS_NATIVE_CALLS_ENABLED: "false",
  };
  delete env.CHILLYWOOD_INTERNAL_V2_OTA_PLATFORM;
  if (target) env.CHILLYWOOD_INTERNAL_V2_OTA_PLATFORM = target;

  const result = spawnSync("npx", ["expo", "config", "--type", "public", "--json"], {
    cwd: process.cwd(),
    encoding: "utf8",
    env,
  });
  return result;
};

const parseConfig = (result) => {
  assert.equal(result.status, 0, result.stderr || result.stdout);
  const jsonStart = result.stdout.indexOf("{");
  assert.ok(jsonStart >= 0, "Expo config did not emit JSON");
  return JSON.parse(result.stdout.slice(jsonStart));
};

const production = parseConfig(readConfig(null));
assert.equal(production?.extra?.runtime?.communication?.iosNativeCallsEnabled, false, "ordinary production OTA must preserve the protected production value");
assert.equal(production?.extra?.runtime?.internalV2OtaPlatform, undefined, "ordinary production OTA must not claim internal-v2 provenance");

const iosInternal = parseConfig(readConfig("ios"));
assert.equal(iosInternal?.extra?.runtime?.communication?.iosNativeCallsEnabled, true, "iOS internal-v2 OTA must override the remote production false value");
assert.equal(iosInternal?.extra?.runtime?.internalV2OtaPlatform, "ios", "iOS internal-v2 target must be diagnosable");

const androidInternal = parseConfig(readConfig("android"));
assert.equal(androidInternal?.extra?.runtime?.communication?.iosNativeCallsEnabled, false, "Android internal-v2 OTA must not widen iOS native-call runtime scope");
assert.equal(androidInternal?.extra?.runtime?.internalV2OtaPlatform, "android", "Android internal-v2 target must be diagnosable");

const invalid = readConfig("production-v2");
assert.notEqual(invalid.status, 0, "unknown internal-v2 publication targets must fail closed");

console.log(JSON.stringify({
  androidIosNativeCallsEnabled: androidInternal.extra.runtime.communication.iosNativeCallsEnabled,
  iosNativeCallsEnabled: iosInternal.extra.runtime.communication.iosNativeCallsEnabled,
  productionIosNativeCallsEnabled: production.extra.runtime.communication.iosNativeCallsEnabled,
  status: "passed",
}, null, 2));
