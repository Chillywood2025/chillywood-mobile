import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import test from "node:test";
import ts from "typescript";
const uuid = n => `d0000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const A = { userId: uuid(1), accountId: uuid(1), sessionGeneration: uuid(2), state: "ACTIVE", restoreOnly: false };
const B = { ...A, userId: uuid(3), accountId: uuid(3), sessionGeneration: uuid(4) };
const digest = "a".repeat(64); const intentId = `scv1_intent_${uuid(5)}`;
const quote = { offerId: `scv1_offer_${uuid(6)}`, offerRevision: 1, resourceId: `scv1_resource_${uuid(7)}`, resourceRevision: 1, creatorId: uuid(8), kind: "creator_tip", amountMinor: 199, currency: "usd" };
const allocation = { intentId, dispatchId: uuid(9), providerAppUserId: `scv1_teststore_${uuid(10)}`, configurationDigest: digest, projectId: "project", appId: "app", productId: "tip", provider: "revenuecat", store: "TEST_STORE", sourceEnvironment: "SANDBOX", providerScopeKey: "test-store-only", economicApplicationId: "distinct-test-app", quote, acceptPurchaseUntil: "2030-01-01T00:00:00Z" };
const envelope = (command = "allocate", requestId = uuid(11)) => ({ protocol: "isolated-test-store-v1", command, requestId, actor: { userId: A.userId, sessionId: A.sessionGeneration }, generation: 1, environment: "sandbox", result: { status: "allocated", reason: "allocated", dispatchAllowed: false, retryProviderMutation: false, grantsAccess: false, notPayable: true, allocation, authorityValidUntil: null, receipt: null } });
const clone = v => JSON.parse(JSON.stringify(v));
function load(path, bindings, globals = {}) {
  const scope = { exports: {}, ...globals, require(name) { assert.ok(name in bindings, name); return bindings[name]; } };
  vm.runInNewContext(ts.transpileModule(fs.readFileSync(new URL(path, import.meta.url), "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText, scope); return scope.exports;
}
const contract = load("../_lib/isolatedTestStoreContract.ts", {});
function fixture() {
  let current = A; const listeners = new Set(); const calls = []; let respond = body => envelope(body.command, body.requestId);
  const module = load("../_lib/isolatedTestStore.ts", {
    "react-native": { Platform: { OS: "ios" } }, "./supabase": { SUPABASE_URL: "https://fixture.invalid", SUPABASE_ANON_KEY: "public-fixture" },
    "./accountBoundSupabaseMutation": { captureAccountBoundSupabaseMutationSubject: async () => ({ authority: current, accessToken: "captured-session-token" }) },
    "./accountSessionAuthority": { getCurrentAccountSessionAuthoritySnapshot: () => current, sameAccountSessionAuthority: (a, b) => !!a && !!b && a.userId === b.userId && a.accountId === b.accountId && a.sessionGeneration === b.sessionGeneration && a.restoreOnly === b.restoreOnly, subscribeToAccountSessionAuthority: listener => { listeners.add(listener); return () => listeners.delete(listener); } },
    "./isolatedTestStoreContract": contract,
  }, { fetch: async (url, options) => { calls.push({ url, ...options }); return { ok: true, json: async () => respond(JSON.parse(options.body)) }; } });
  return { calls, capture: () => module.captureIsolatedTestStoreClient(current, digest), change(value) { current = value; for (const listener of listeners) listener(value); }, respond(fn) { respond = fn; } };
}
test("captured token and exact current session bind the dedicated endpoint; mutations are never resent", async () => {
  const f = fixture(); const client = await f.capture(); const result = await client.request("allocate", uuid(11), { intentId, expectedQuote: quote });
  assert.equal(result.result.status, "allocated"); assert.equal(f.calls[0].url, "https://fixture.invalid/functions/v1/isolated-sandbox-test-store-v1");
  assert.equal(f.calls[0].headers.Authorization, "Bearer captured-session-token");
  const body = JSON.parse(f.calls[0].body); assert.equal(body.expectedSessionId, A.sessionGeneration); assert.equal(body.configurationDigest, digest); assert.equal("userId" in body, false);
  await assert.rejects(client.request("allocate", uuid(11), { intentId, expectedQuote: quote }), /invalid_request/u); assert.equal(f.calls.length, 1);
});
test("legacy IDs, unknown fields and widened quote fail before transport", async () => {
  const f = fixture(); const client = await f.capture();
  for (const payload of [{ intentId: uuid(5), expectedQuote: quote }, { intentId, expectedQuote: { ...quote, kind: "channel_subscription" } }, { intentId, expectedQuote: quote, live: true }, { intentId, expectedQuote: { ...quote, offerRevision: 0 } }]) await assert.rejects(client.request("allocate", uuid(11), payload), /invalid_request/u);
  assert.equal(f.calls.length, 0);
});
test("strict envelope rejects provider widening, mismatched quote, false grant, receipt and dispatch claims", () => {
  const expected = { command: "allocate", requestId: uuid(11), actor: { userId: A.userId, sessionId: A.sessionGeneration }, configurationDigest: digest, payload: { intentId, expectedQuote: quote } };
  for (const mutate of [v => { v.actor.sessionId = B.sessionGeneration; }, v => { v.result.allocation.store = "APP_STORE"; }, v => { v.result.allocation.configurationDigest = "b".repeat(64); }, v => { v.result.allocation.quote.amountMinor++; }, v => { v.result.allocation.quote.resourceRevision++; }, v => { delete v.result.allocation.productId; }, v => { v.result.grantsAccess = true; }, v => { v.result.notPayable = false; }, v => { v.result.retryProviderMutation = true; }, v => { v.result.dispatchAllowed = true; v.result.authorityValidUntil = "2029-01-01T00:00:00Z"; }, v => { v.result.status = "verified"; }, v => { v.extra = "unmodeled"; }]) {
    const value = clone(envelope()); mutate(value); assert.throws(() => contract.parseIsolatedTestStoreResult(value, expected), /invalid_response/u);
  }
});
test("only fresh claim can carry dispatch authority; reads and repeated claims cannot fabricate a lease", () => {
  const value = envelope("claim"); value.result.status = "dispatch_claimed"; value.result.dispatchAllowed = true; value.result.authorityValidUntil = "2029-01-01T00:00:00Z";
  const expected = { command: "claim", requestId: uuid(11), actor: value.actor, configurationDigest: digest, payload: { intentId, dispatchId: allocation.dispatchId, expectedQuote: quote } };
  assert.equal(contract.parseIsolatedTestStoreResult(value, expected).result.dispatchAllowed, true);
  value.command = "read"; assert.throws(() => contract.parseIsolatedTestStoreResult(value, { ...expected, command: "read", payload: { intentId } }), /invalid_response/u);
});
test("late A to B to A response is unknown and the old client remains permanently retired", async () => {
  const f = fixture(); let resolve; f.respond(() => new Promise(done => { resolve = done; })); const client = await f.capture();
  const pending = client.request("allocate", uuid(11), { intentId, expectedQuote: quote });
  while (!resolve) await new Promise(done => setImmediate(done)); f.change(B); f.change(A); resolve(envelope());
  await assert.rejects(pending, error => error.outcome === "unknown");
  await assert.rejects(client.request("read", uuid(12), { intentId }), /authority_retired/u); assert.equal(f.calls.length, 1);
});
test("quarantined or refunded receipts are visible without access or payable rights", () => {
  for (const state of ["verified", "refunded", "revoked", "quarantined"]) {
    const value = envelope("read"); value.result.status = state === "quarantined" ? "held" : state;
    value.result.receipt = { id: `scv1_receipt_${uuid(12)}`, state, providerTransactionId: "transaction", originalTransactionId: "original", purchasedAt: "2026-11-07T12:00:00Z" };
    const parsed = contract.parseIsolatedTestStoreResult(value, { command: "read", requestId: uuid(11), actor: value.actor, configurationDigest: digest, payload: { intentId } });
    assert.equal(parsed.result.grantsAccess, false); assert.equal(parsed.result.notPayable, true);
    value.result.status = "held";
    assert.equal(contract.parseIsolatedTestStoreResult(value, { command: "read", requestId: uuid(11), actor: value.actor, configurationDigest: digest, payload: { intentId } }).result.status, "held");
  }
});
if (process.env.ISOLATED_TEST_STORE_FIXTURE) test("actual same-attempt native Test Store endpoint projections pass the strict client parser", () => {
  const fixture = JSON.parse(fs.readFileSync(process.env.ISOLATED_TEST_STORE_FIXTURE, "utf8"));
  assert.equal(fixture.protocol, "isolated-test-store-v1"); assert.ok(fixture.cases.length > 0);
  for (const item of fixture.cases) contract.parseIsolatedTestStoreResult(item.response, item);
});
