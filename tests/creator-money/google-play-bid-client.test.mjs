import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import test from "node:test";
import ts from "typescript";

const capability = "11111111-1111-4111-8111-111111111111";
const input = { feature: "room_seat_auction", creatorId: "creator", sourceId: "auction", amountMinor: 237 };
const deferred = () => { let resolve; const promise = new Promise(r => { resolve = r; }); return { promise, resolve }; };
function harness(options = {}) {
  let authority = { userId: "buyer", sessionGeneration: "one" }, sequence = 0;
  const calls = [];
  const load = (path, imports) => {
    const exports = {};
    vm.runInNewContext(ts.transpileModule(fs.readFileSync(path, "utf8"), {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
    }).outputText, { exports, require: name => { assert.ok(name in imports, name); return imports[name]; }, URL, Date, Error });
    return exports;
  };
  const authorityApi = {
    getCurrentAccountSessionAuthoritySnapshot: () => authority,
    sameAccountSessionAuthority: (a, b) => a?.userId === b?.userId && a?.sessionGeneration === b?.sessionGeneration,
  };
  const mutation = {
    captureAccountBoundSupabaseMutationSubject: async () => ({ authority: { ...authority }, accessToken: "test" }),
    invokeAccountBoundSupabaseMutationRpc: async (_subject, name, args) => {
      calls.push(["rpc", name, args]);
      if (options.admission) await options.admission();
      return { error: null, data: { capabilityId: capability, expiresAt: "2099-01-01T00:00:00Z",
        verification: "native_sdk_observation_unverified", financialAuthority: false, accessGranted: false } };
    },
  };
  const flow = load("_lib/google-play-external-content-link-flow.ts", {});
  const native = {
    capabilities: () => ({ apiVersion: 1, program: "external_content_link", billingLibraryVersion: "8.2.1" }),
    prepare: async () => { calls.push(["prepare"]); return { flowId: String(++sequence), externalTransactionToken: "token-" + sequence }; },
    launch: () => assert.fail("Bidding must not launch a payment"),
    cancel: async id => calls.push(["cancel", id]),
  };
  const admission = load("_lib/googlePlayExternalAdmission.ts", {
    "./accountBoundSupabaseMutation": mutation, "./accountSessionAuthority": authorityApi,
  });
  const api = load("_lib/googlePlayAuctionBidEligibility.ts", {
    "react-native": { Platform: { OS: options.platform ?? "android" } },
    "./accountBoundSupabaseMutation": mutation, "./accountSessionAuthority": authorityApi,
    "./iosExternalAdmission": {admitIosExternalCheckout:async()=>capability},
 "./googlePlayExternalAdmission": admission,
    "./google-play-external-content-links": { withGooglePlayExternalEligibility: flow.createGooglePlayExternalEligibilityFlow("android", () => options.oldBuild ? null : native) },
  });
  return { calls, run: action => api.withGooglePlayAuctionBidEligibility(input, action),
    switch: () => { authority = { userId: "other", sessionGeneration: "two" }; } };
}

test("production bid wrapper admits exact source and amount, uses fresh observations, never opens payment", async () => {
  const h = harness();
  for (let i = 0; i < 2; i++) assert.equal(await h.run(async id => { assert.equal(id, capability); return "bid"; }), "bid");
  const rpc = h.calls.filter(c => c[0] === "rpc");
  assert.equal(rpc.length, 2); assert.equal(rpc[0][2].p_feature, input.feature);
  assert.equal(rpc[0][2].p_source_id, input.sourceId); assert.equal(rpc[0][2].p_amount_minor, 237);
  assert.notEqual(rpc[0][2].p_external_transaction_token, rpc[1][2].p_external_transaction_token);
  assert.equal(h.calls.filter(c => c[0] === "cancel").length, 2);
});
test("late bid admission cannot execute on a replaced account and still closes native preparation", async () => {
  const d = deferred(), h = harness({ admission: () => d.promise });
  const pending = h.run(() => assert.fail("Old account cannot bid"));
  await new Promise(r => setImmediate(r)); h.switch(); d.resolve();
  await assert.rejects(pending); assert.equal(h.calls.filter(c => c[0] === "cancel").length, 1);
});
test("old Android build fails before admission; iOS obtains fresh storefront admission; web keeps server-resolved capability", async () => {
  const old = harness({ oldBuild: true }); await assert.rejects(old.run(() => assert.fail()), /Update the Android app/);
  assert.equal(old.calls.length, 0);
  const ios = harness({ platform: "ios" }); await ios.run(async id => assert.equal(id, capability)); assert.equal(ios.calls.length, 0);
});
test("failed bid operation closes preparation and duplicate eligibility cannot race another operation", async () => {
  const d = deferred(), h = harness({ admission: () => d.promise });
  const pending = h.run(async () => { throw Error("unknown bid outcome"); });
  await new Promise(r => setImmediate(r)); await assert.rejects(h.run(() => assert.fail()), /already being checked/);
  d.resolve(); await assert.rejects(pending, /unknown bid outcome/);
  assert.equal(h.calls.filter(c => c[0] === "cancel").length, 1);
});
