import assert from "node:assert/strict";
import test from "node:test";
import fs from "node:fs";
import vm from "node:vm";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import ts from "typescript";
const require = createRequire(import.meta.url), { descriptor, qualificationConfig } = require("../config.js");
const id = n => `b0000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const scenario = { id: id(4), label: "Synthetic source fixture", providerOfferingId: "ofrng_actual_object", offeringIdentifier: "qualification_lookup",
  providerPackageId: "pk_actual_object", packageIdentifier: "package_lookup", providerProductId: "prod_actual_object", productId: "test_consumable",
  amountMinor: 199, currency: "usd", intendedAction: "purchase" };
const input = { qualificationConnectionId: id(1), qualificationConnectionRevision: 1, projectId: "synthetic_project", appId: "synthetic_app",
  publicSdkKey: "test_nonsecret_source_fixture", runId: id(2), scenarios: [scenario] };
const clone = v => JSON.parse(JSON.stringify(v));
function fixture() {
  const calls = [], state = { protocol: "test-store-qualification-native-v1", configurationDigest: "a".repeat(64), installationId: id(3),
    providerAppUserId: `scq_teststore_${id(3)}`, runId: id(2), closed: false, configured: false, activeInvocationId: null, scenarios: [clone(scenario)], records: [] };
  let outcome = "sdk_success", pending = null;
  const native = {
    async inspect() { calls.push("inspect"); return clone(state); }, async configure() { calls.push("configure"); assert.equal(state.closed, false); state.configured = true; },
    async prepare(scenarioId) {
      calls.push("prepare"); assert.equal(state.activeInvocationId, null); assert.equal(state.closed, false);
      const selected = state.scenarios.find(s => s.id === scenarioId), record = { protocol: "test-store-qualification-record-v1", invocationId: id(10 + state.records.length),
        scenarioId, runId: state.runId, configurationDigest: state.configurationDigest, providerAppUserId: state.providerAppUserId,
        offeringIdentifier: selected.offeringIdentifier, packageIdentifier: selected.packageIdentifier, productId: selected.productId,
        amountMinor: selected.amountMinor, currency: selected.currency, state: "prepared", outcome: null, createdAt: "2026-11-07T12:00:00Z", completedAt: null };
      state.records.push(record); state.activeInvocationId = record.invocationId; return { status: "prepared", handleId: id(100 + state.records.length), record: clone(record) };
    },
    async purchase() { calls.push("purchase"); const record = state.records.at(-1); record.state = "invoking"; if (pending) await pending;
      record.state = "completed"; record.outcome = outcome; record.completedAt = "2026-11-07T12:01:00Z"; state.activeInvocationId = null; return clone(record); },
    async seal() { calls.push("seal"); state.closed = true; },
  };
  function load() {
    const scope = { exports: {}, Error, require(name) { assert.equal(name, "expo-modules-core"); return { requireOptionalNativeModule: name => { assert.equal(name, "ChillywoodQualification"); return native; } }; } };
    vm.runInNewContext(ts.transpileModule(fs.readFileSync(new URL("../native.js", import.meta.url), "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText, scope);
    return scope.exports;
  }
  return { state, calls, native, load, cancel() { outcome = "sdk_cancelled"; }, wait() { let resolve; pending = new Promise(done => { resolve = done; }); return resolve; } };
}
test("default standalone profile is unavailable and has no main-app or update fallback", () => {
  assert.throws(() => qualificationConfig({}));
  for (const platform of ["ios", "android"]) {
    const config = qualificationConfig({ SCQ_PLATFORM: platform });
    assert.deepEqual(config.ios.infoPlist.SCQQualificationConfiguration, {}); assert.equal(config.updates.enabled, false);
    assert.equal(config.android.allowBackup, false); assert.equal(config.ios.bundleIdentifier, "com.chillywood.qualification.teststore");
    assert.equal(config.extra.economicProjectionAllowed, false);
  }
});
test("compiled descriptor strictly pins platform, project, digest and distinct provider and lookup IDs", () => {
  const ios = descriptor(JSON.stringify(input), "ios"), android = descriptor(JSON.stringify(input), "android");
  assert.notEqual(ios.configurationDigest, android.configurationDigest); assert.equal(ios.publicSdkKey, input.publicSdkKey);
  const parsed = JSON.parse(ios.descriptorJson); assert.equal(parsed.scenarios[0].offeringIdentifier, scenario.offeringIdentifier);
  assert.notEqual(parsed.scenarios[0].offeringIdentifier, parsed.scenarios[0].providerOfferingId);
  for (const change of [v => { v.publicSdkKey = "appl_live"; }, v => { v.extra = true; }, v => { v.scenarios[0].amountMinor = true; },
    v => { v.scenarios[0].currency = "eur"; }, v => { v.scenarios.push(v.scenarios[0]); }, v => { v.runId = "runtime-switch"; }]) {
    const invalid = clone(input); change(invalid); assert.throws(() => descriptor(JSON.stringify(invalid), "ios"));
  }
});
test("actual Expo loader resolves the standalone CommonJS config on both native platforms", () => {
  const { getConfig } = require("@expo/config"), root = fileURLToPath(new URL("..", import.meta.url));
  const oldPlatform = process.env.SCQ_PLATFORM, oldDescriptor = process.env.SCQ_NATIVE_DESCRIPTOR;
  try {
    for (const platform of ["ios", "android"]) {
      process.env.SCQ_PLATFORM = platform; process.env.SCQ_NATIVE_DESCRIPTOR = JSON.stringify(input);
      const loaded = getConfig(root, { skipPlugins: true }).exp;
      assert.equal(loaded.slug, "chillywood-test-store-qualification"); assert.equal(qualificationConfig(process.env).plugins.length, 1);
      assert.equal(JSON.parse(loaded.ios.infoPlist.SCQQualificationConfiguration.descriptorJson).platform, platform);
    }
  } finally {
    if (oldPlatform === undefined) delete process.env.SCQ_PLATFORM; else process.env.SCQ_PLATFORM = oldPlatform;
    if (oldDescriptor === undefined) delete process.env.SCQ_NATIVE_DESCRIPTOR; else process.env.SCQ_NATIVE_DESCRIPTOR = oldDescriptor;
  }
});
test("inspection rejects authority claims, foreign identity and unexpected record fields", () => {
  const f = fixture(), module = f.load(); assert.equal(module.parseInspection(clone(f.state)).configured, false);
  for (const change of [v => { v.grantsAccess = true; }, v => { v.providerAppUserId = `scv2_teststore_${id(3)}`; },
    v => { v.activeInvocationId = id(99); }, v => { v.configurationDigest = "wrong"; }]) {
    const value = clone(f.state); change(value); assert.throws(() => module.parseInspection(value));
  }
});
test("explicit native Package ticket is one-use; callback is only a local SDK observation", async () => {
  const f = fixture(), c = f.load().captureQualification(); await c.configure(); const record = await c.prepare(scenario.id);
  const result = await c.purchase(record.invocationId); assert.equal(result.outcome, "sdk_success"); assert.equal("receipt" in result, false);
  await assert.rejects(c.purchase(record.invocationId)); assert.equal(f.calls.filter(c => c === "purchase").length, 1);
});
test("cancellation permits only a separate explicit scenario attempt under the same fixed identity", async () => {
  const f = fixture(), c = f.load().captureQualification(); await c.configure(); f.cancel(); const one = await c.prepare(scenario.id);
  assert.equal((await c.purchase(one.invocationId)).outcome, "sdk_cancelled");
  const two = await c.prepare(scenario.id); assert.notEqual(two.invocationId, one.invocationId);
  assert.equal(two.providerAppUserId, one.providerAppUserId); assert.equal(f.calls.filter(c => c === "purchase").length, 1);
});
test("reload cannot reconstruct a prepared ticket or clear uncertain native work", async () => {
  const f = fixture(), old = f.load().captureQualification(); await old.configure(); const record = await old.prepare(scenario.id); old.dispose();
  const fresh = f.load().captureQualification(); await fresh.inspect();
  await assert.rejects(fresh.purchase(record.invocationId)); await assert.rejects(fresh.prepare(scenario.id));
  assert.equal(f.calls.filter(c => c === "purchase").length, 0);
});
test("disposed captures reject pending SDK results and cannot reconfigure a changed identity", async () => {
  const f = fixture(), c = f.load().captureQualification(); await c.configure(); const record = await c.prepare(scenario.id), finish = f.wait();
  const pending = c.purchase(record.invocationId); c.dispose(); finish(); await assert.rejects(pending);
  const current = f.load().captureQualification(); await current.inspect(); f.state.runId = id(999); await assert.rejects(current.inspect());
  await assert.rejects(current.configure());
});
test("local seal discards volatile tickets and prevents new attempts without claiming receiver sealing", async () => {
  const f = fixture(), c = f.load().captureQualification(); await c.configure(); const record = await c.prepare(scenario.id); const sealed = await c.seal();
  assert.equal(sealed.closed, true); assert.equal(sealed.activeInvocationId, record.invocationId);
  await assert.rejects(c.purchase(record.invocationId)); await assert.rejects(c.prepare(scenario.id));
  assert.equal(f.calls.filter(c => c === "purchase").length, 0); assert.equal("behavioralQualificationGranted" in sealed, false);
});
