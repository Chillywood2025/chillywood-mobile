import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import test from "node:test";
import ts from "typescript";
import { premiumRuntime } from "./helpers/premium-runtime-harness.mjs";

function revenueCat(platform, dev) {
  const calls = [];
  const purchases = new Proxy({}, { get(_value, method) { return () => { calls.push(method); throw Error(`Unexpected SDK call: ${String(method)}`); }; } });
  const bindings = {
    "expo-application": { applicationId: "com.chillywood.mobile.teststoredebugv3" },
    "react-native": { Platform: { OS: platform }, Linking: { canOpenURL() { calls.push("canOpenURL"); return true; } } },
    "react-native-purchases": { default: purchases, LOG_LEVEL: {}, PRODUCT_CATEGORY: {} },
    "./accountSessionAuthority": {}, "./actionSingleFlight.mjs": {}, "./entitlementAuthority": { withAuthorityReadDeadline: async value => value },
    "./logger": { debugLog() {}, reportRuntimeError() {} },
    "./runtimeConfig": { getRuntimeConfig() { throw Error("V3 must not read legacy provider configuration."); } },
    "./revenuecatPurchaseClosure": {}, "./isolatedTestStoreBuild": { isIsolatedTestStoreFlavor: () => false },
    "./isolatedTestStoreV3Build": { isIsolatedTestStoreV3Flavor: () => true },
    "./isolatedTestStoreV2Build": { isIsolatedTestStoreV2Flavor: () => false },
  };
  const scope = { exports: {}, __DEV__: dev, require(name) { assert.ok(name in bindings, name); return bindings[name]; } };
  vm.runInNewContext(ts.transpileModule(fs.readFileSync(new URL("../_lib/revenuecat.ts", import.meta.url), "utf8"), {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS },
  }).outputText, scope);
  return { api: scope.exports, calls };
}

for (const platform of ["ios", "android"]) for (const dev of [true, false]) {
  test(`v3 ${platform} ${dev ? "debug" : "release refusal"} cannot configure, switch, restore, purchase or manage legacy billing`, async () => {
    const { api, calls } = revenueCat(platform, dev);
    assert.equal(api.configureRevenueCatOnce().shouldConfigure, false);
    assert.equal(await api.getRevenueCatAppUserId(), "");
    assert.equal((await api.syncRevenueCatCustomerIdentity("owned-buyer")).status, "unavailable");
    assert.equal(await api.readRevenueCatCustomerInfo({ refresh: true }), null);
    assert.equal(await api.readRevenueCatOfferings(), null);
    assert.equal(await api.canMakeRevenueCatPurchases(), false);
    assert.equal((await api.readRevenueCatNonSubscriptionProducts(["tip"])).length, 0);
    assert.equal((await api.readRevenueCatSubscriptionProducts(["premium"])).length, 0);
    await assert.rejects(api.purchaseRevenueCatPackage({}), /Legacy billing/u);
    await assert.rejects(api.purchaseRevenueCatStoreProduct({}), /Legacy billing/u);
    await assert.rejects(api.restoreRevenueCatPurchases(), /Legacy billing/u);
    assert.equal(await api.openRevenueCatManageSubscriptions(), false);
    assert.deepEqual(calls, []);
  });
}

for (const platform of ["ios", "android"]) test(`v3 ${platform} preserves real server Premium and a free buyer without legacy SDK reconciliation`, async () => {
  const f = premiumRuntime(platform, { isolatedTestStoreV3: true, independentProjection: true });
  f.state.active = true;
  const premium = await f.read();
  assert.equal(premium.targets.premium_subscription.hasEntitlement, true);
  assert.equal(premium.targets.premium_subscription.entitlementAuthoritative, true);
  assert.equal(premium.canMakePayments, false);
  assert.equal(f.monetary.isPremiumPurchaseShellAvailableForMode("internal_tester_sandbox"), false);
  assert.equal((await f.monetary.purchaseMonetizationTarget("premium_subscription", { purchaseMode: "internal_tester_sandbox" })).ok, false);
  assert.equal((await f.monetary.restoreMonetizationAccess({ purchaseMode: "internal_tester_sandbox" })).ok, false);
  f.state.active = false;
  const buyer = await f.read();
  assert.equal(buyer.targets.premium_subscription.hasEntitlement, false);
  assert.equal(buyer.targets.premium_subscription.entitlementAuthoritative, true);
  assert.deepEqual([f.state.providerReads, f.state.purchases, f.state.restores, f.state.reconciles], [0, 0, 0, 0]);
});
