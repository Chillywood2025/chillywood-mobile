import assert from "node:assert/strict";
import { createRequire } from "node:module";
import test from "node:test";

const require = createRequire(import.meta.url);
const { resolveDiagnosticsGate, applyDiagnosticsGate } = require("../plugins/withChillyChatIosNativeCalls.js").__test;
const config = () => ({ extra: { runtime: { otaGeneration: { internalOnly: true, channel: "ios-internal-v2" } } } });
const env = () => ({ CHILLYWOOD_INTERNAL_CALL_DIAGNOSTICS: "true", IOS_NATIVE_CALLS_ENABLED: "true",
  EXPO_PUBLIC_IOS_NATIVE_CALLS_ENABLED: "true", EAS_BUILD_PROFILE: "ios-internal-v2", CHILLYWOOD_INTERNAL_V2_OTA_PLATFORM: "ios" });

test("native diagnostics are absent by default and require the complete internal build conjunction", () => {
  assert.equal(resolveDiagnosticsGate({}, {}), false);
  assert.equal(resolveDiagnosticsGate(config(), { ...env(), CHILLYWOOD_INTERNAL_CALL_DIAGNOSTICS: "false" }), false);
  assert.equal(resolveDiagnosticsGate(config(), env()), true);
});

for (const [key, value] of [
  ["IOS_NATIVE_CALLS_ENABLED", "false"], ["EXPO_PUBLIC_IOS_NATIVE_CALLS_ENABLED", "false"],
  ["EAS_BUILD_PROFILE", "production"], ["EAS_BUILD_PROFILE", "ios-qa"],
  ["EAS_BUILD_PROFILE", "ios-internal-device-v3"], ["EAS_BUILD_PROFILE", ""],
  ["CHILLYWOOD_INTERNAL_V2_OTA_PLATFORM", "android"],
]) {
  test(`diagnostic opt-in rejects ${key}=${value}`, () => {
    assert.throws(() => resolveDiagnosticsGate(config(), { ...env(), [key]: value }), /explicit ios-internal-v2/);
  });
}

for (const generation of [undefined, { internalOnly: false, channel: "ios-internal-v2" },
  { internalOnly: true, channel: "production-v2" }, { internalOnly: "true", channel: "ios-internal-v2" }]) {
  test(`diagnostic opt-in rejects an unproved internal generation: ${JSON.stringify(generation)}`, () => {
    assert.throws(() => resolveDiagnosticsGate({ extra: { runtime: { otaGeneration: generation } } }, env()), /explicit ios-internal-v2/);
  });
}

test("the actual plist transform removes a previously enabled diagnostic channel on a normal build", () => {
  const plist = { unrelated: "preserved" };
  applyDiagnosticsGate(plist, resolveDiagnosticsGate(config(), env()));
  assert.equal(plist.ChillywoodNativeCallDiagnosticsEnabled, true);
  assert.equal(plist.ChillywoodNativeCallDiagnosticsChannel, "ios-internal-v2");
  applyDiagnosticsGate(plist, resolveDiagnosticsGate({}, {}));
  assert.deepEqual(plist, { unrelated: "preserved", ChillywoodNativeCallDiagnosticsEnabled: false });
});
