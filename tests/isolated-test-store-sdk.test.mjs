import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import test from "node:test";
import ts from "typescript";
const uuid = n => `a0000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const A = { userId: uuid(1), accountId: uuid(1), sessionGeneration: uuid(2), state: "ACTIVE", restoreOnly: false };
const B = { ...A, userId: uuid(3), accountId: uuid(3), sessionGeneration: uuid(4) };
const allocation = () => ({ intentId: `scv1_intent_${uuid(5)}`, dispatchId: uuid(6), providerAppUserId: `scv1_teststore_${uuid(7)}`, configurationDigest: "a".repeat(64), projectId: "test-project", appId: "test-app", productId: "tip-199", provider: "revenuecat", store: "TEST_STORE", sourceEnvironment: "SANDBOX", providerScopeKey: "qualified-test-store", economicApplicationId: "isolated-test-store", quote: { offerId: `scv1_offer_${uuid(8)}`, offerRevision: 1, resourceId: `scv1_resource_${uuid(9)}`, resourceRevision: 1, creatorId: uuid(10), kind: "creator_tip", amountMinor: 199, currency: "usd" }, acceptPurchaseUntil: new Date(Date.now() + 60_000).toISOString() });
const claim = a => ({ protocol: "isolated-test-store-v1", command: "claim", requestId: uuid(11), actor: { userId: A.userId, sessionId: A.sessionGeneration }, generation: 1, environment: "sandbox", result: { status: "dispatch_claimed", reason: "fresh_claim", dispatchAllowed: true, retryProviderMutation: false, grantsAccess: false, notPayable: true, allocation: a, authorityValidUntil: new Date(Date.now() + 4_000).toISOString(), receipt: null } });
function load(path, bindings) {
  const scope = { exports: {}, Date, require(name) { assert.ok(name in bindings, name); return bindings[name]; } };
  vm.runInNewContext(ts.transpileModule(fs.readFileSync(new URL(path, import.meta.url), "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText, scope); return scope.exports;
}
function fixture() {
  const saved = allocation(); let authority = A; let build = { configId: saved.configurationDigest, projectId: saved.projectId, appId: saved.appId }; let owned = true;
  const listeners = new Set(); const calls = []; let configureWait = null; let product = { identifier: saved.productId, currencyCode: "USD", price: 1.99, subscriptionPeriod: null };
  let info = { originalAppUserId: saved.providerAppUserId, nonSubscriptionTransactions: [], activeSubscriptions: [], entitlements: { active: {} } };
  let purchase = async () => ({ productIdentifier: saved.productId, transaction: { productIdentifier: saved.productId, transactionIdentifier: "verified-only-by-server" } });
  const sdk = { getAppUserID: async () => saved.providerAppUserId, isAnonymous: async () => false, getCustomerInfo: async () => info,
    getProducts: async (...args) => { calls.push(["getProducts", ...args]); return [product]; }, purchaseStoreProduct: async value => { calls.push(["purchase", value.identifier]); return purchase(); },
    configure() { throw Error("JS configure forbidden"); }, logIn() { throw Error("Identity switch forbidden"); }, logOut() { throw Error("Logout forbidden"); }, restorePurchases() { throw Error("Restore forbidden"); } };
  const module = load("../_lib/isolatedTestStoreSdk.ts", {
    "react-native-purchases": { default: sdk, PRODUCT_CATEGORY: { NON_SUBSCRIPTION: "NON_SUBSCRIPTION" } },
    "./accountSessionAuthority": { getCurrentAccountSessionAuthoritySnapshot: () => authority, sameAccountSessionAuthority: (a, b) => !!a && !!b && a.userId === b.userId && a.accountId === b.accountId && a.sessionGeneration === b.sessionGeneration && a.restoreOnly === b.restoreOnly, subscribeToAccountSessionAuthority: callback => { listeners.add(callback); return () => listeners.delete(callback); } },
    "./isolatedTestStoreBuild": { readIsolatedTestStoreBuild: () => build, configureIsolatedTestStoreNative: async uid => { calls.push(["nativeConfigure", uid]); if (configureWait) await configureWait; return { configured: true, configId: saved.configurationDigest, providerAppUserId: uid }; }, ownsIsolatedTestStoreProviderIdentity: async () => owned },
    "./isolatedTestStoreContract": load("../_lib/isolatedTestStoreContract.ts", {}),
  });
  return { saved, calls, create: (a = saved) => module.captureIsolatedTestStoreSdk(authority, a), setBuild: value => { build = value; }, setProduct: value => { product = value; }, setInfo: value => { info = value; }, setOwned: value => { owned = value; }, setPurchase: value => { purchase = value; }, waitConfiguration: value => { configureWait = value; }, change(value) { authority = value; for (const listener of listeners) listener(value); } };
}
test("native-only configure and exact non-subscription quote precede one SDK call; callback remains an untrusted pending observation", async () => {
  const f = fixture(); const client = f.create(); await client.prepare(); const result = await client.purchase(claim(f.saved));
  assert.equal(result.outcome, "sdk_success"); assert.equal(result.transactionHint, "verified-only-by-server"); assert.equal("receipt" in result, false); assert.equal("grantsAccess" in result, false);
  assert.deepEqual(f.calls.map(x => x[0]), ["nativeConfigure", "getProducts", "purchase"]);
  await assert.rejects(client.purchase(claim(f.saved)), /unavailable/u);
  await assert.rejects(f.create().prepare(), /unavailable/u);
});
test("release/unconfigured native admission and wrong project, digest, store or currency cannot reach SDK", () => {
  for (const mutate of [a => ({ ...a, projectId: "other" }), a => ({ ...a, configurationDigest: "b".repeat(64) }), a => ({ ...a, store: "APP_STORE" }), a => ({ ...a, quote: { ...a.quote, currency: "jpy" } })]) { const f = fixture(); assert.throws(() => f.create(mutate(f.saved)), /unavailable/u); assert.equal(f.calls.length, 0); }
  const f = fixture(); f.setBuild(null); assert.throws(() => f.create(), /unavailable/u); assert.equal(f.calls.length, 0);
});
test("wrong price, currency, product or subscription never opens SDK purchase", async () => {
  for (const mutation of [{ price: 1.98 }, { currencyCode: "EUR" }, { identifier: "premium" }, { subscriptionPeriod: "P1M" }]) {
    const f = fixture(); f.setProduct({ identifier: f.saved.productId, currencyCode: "USD", price: 1.99, subscriptionPeriod: null, ...mutation });
    await assert.rejects(f.create().prepare(), /unavailable/u); assert.equal(f.calls.filter(c => c[0] === "purchase").length, 0);
  }
});
test("existing alias or transaction history prevents adopting that provider identity", async () => {
  for (const mutation of [{ originalAppUserId: "$RCAnonymousID:previous" }, { nonSubscriptionTransactions: [{}] }, { activeSubscriptions: ["premium"] }, { entitlements: { active: { premium: {} } } }]) {
    const f = fixture(); f.setInfo({ originalAppUserId: f.saved.providerAppUserId, nonSubscriptionTransactions: [], activeSubscriptions: [], entitlements: { active: {} }, ...mutation });
    await assert.rejects(f.create().prepare(), /unavailable/u); assert.equal(f.calls.some(c => c[0] === "purchase"), false);
  }
});
test("account A to B to A permanently retires captured SDK authority before purchase", async () => {
  const f = fixture(); const client = f.create(); await client.prepare(); f.change(B); f.change(A);
  await assert.rejects(client.purchase(claim(f.saved)), /unavailable/u); assert.equal(f.calls.some(c => c[0] === "purchase"), false);
  await assert.rejects(f.create().prepare(), /unavailable/u);
});
test("account change while native configuration resolves cannot continue product loading or replace the identity", async () => {
  const f = fixture(); let release; f.waitConfiguration(new Promise(resolve => { release = resolve; }));
  const preparing = f.create().prepare(); f.change(B); f.change(A); release();
  await assert.rejects(preparing, /unavailable/u); assert.deepEqual(f.calls.map(c => c[0]), ["nativeConfigure"]);
  await assert.rejects(f.create().prepare(), /unavailable/u);
});
test("unresolved native purchase and late result retain one identity across account change", async () => {
  const f = fixture(); let settle; f.setPurchase(() => new Promise(resolve => { settle = resolve; }));
  const client = f.create(); await client.prepare(); const pending = client.purchase(claim(f.saved));
  while (!settle) await new Promise(resolve => setImmediate(resolve));
  f.change(B); f.change(A); await assert.rejects(f.create().prepare(), /unavailable/u);
  settle({ productIdentifier: f.saved.productId, transaction: { productIdentifier: f.saved.productId, transactionIdentifier: "late" } });
  assert.equal((await pending).outcome, "sdk_unknown"); await assert.rejects(f.create().prepare(), /unavailable/u);
});
test("cancellation and malformed SDK outcomes never release process ownership or grant rights", async () => {
  for (const purchase of [async () => { throw { userCancelled: true }; }, async () => ({ customerInfo: { entitlements: { active: { premium: {} } } } })]) {
    const f = fixture(); f.setPurchase(purchase); const client = f.create(); await client.prepare();
    const result = await client.purchase(claim(f.saved)); assert.ok(["sdk_cancelled", "sdk_unknown"].includes(result.outcome)); assert.equal(result.transactionHint, null);
    await assert.rejects(f.create().prepare(), /unavailable/u);
  }
});
test("stale or widened claim and lost native ownership cannot open purchase", async () => {
  for (const mutate of [r => ({ ...r, result: { ...r.result, dispatchAllowed: false } }), r => ({ ...r, result: { ...r.result, authorityValidUntil: new Date(Date.now() - 1).toISOString() } }), r => ({ ...r, result: { ...r.result, allocation: { ...r.result.allocation, productId: "other" } } })]) {
    const f = fixture(); const client = f.create(); await client.prepare(); await assert.rejects(client.purchase(mutate(claim(f.saved))), /unavailable/u); assert.equal(f.calls.some(c => c[0] === "purchase"), false);
  }
  const f = fixture(); const client = f.create(); await client.prepare(); f.setOwned(false); await assert.rejects(client.purchase(claim(f.saved)), /unavailable/u); assert.equal(f.calls.some(c => c[0] === "purchase"), false);
});
