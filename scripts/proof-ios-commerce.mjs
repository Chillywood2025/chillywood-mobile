#!/usr/bin/env node

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import ts from "typescript";
import {
  appStoreSwitchAllowsEnvironment,
  isSafeStoreMapping,
  providerProductIdCandidatesForStore,
  resolveRevenueCatStorePolicy,
} from "../supabase/functions/revenuecat-webhook/store-policy.mjs";

const manifest = JSON.parse(readFileSync(new URL("../config/ios/app-store-products.json", import.meta.url), "utf8"));
const storeKit = JSON.parse(readFileSync(new URL("../config/ios/Chillywood.storekit", import.meta.url), "utf8"));

const loadPaymentPolicy = (relativeUrl) => {
  const source = readFileSync(new URL(relativeUrl, import.meta.url), "utf8");
  const compiled = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
    },
  }).outputText;
  const context = { exports: {}, module: { exports: {} } };
  context.exports = context.module.exports;
  vm.runInNewContext(compiled, context, { filename: relativeUrl });
  return context.module.exports;
};

const appPaymentPolicy = loadPaymentPolicy("../_lib/paymentRailPolicy.ts");
const edgePaymentPolicy = loadPaymentPolicy("../supabase/functions/_shared/payment-rail-policy.ts");
const appStoreRuntimeCatalog = loadPaymentPolicy("../_lib/iosAppStoreCommerce.ts");
const policyCases = [
  {
    useCase: "premium_subscription",
    platform: "android",
    providerReady: true,
  },
  {
    useCase: "premium_subscription",
    platform: "ios",
    environment: "sandbox",
    providerReady: true,
    appStorePurchasesEnabled: false,
    liveMoneyEnabled: false,
  },
  {
    useCase: "creator_tip_support",
    platform: "ios",
    environment: "sandbox",
    providerReady: true,
    appStorePurchasesEnabled: true,
    liveMoneyEnabled: false,
    unlocksDigitalAccess: false,
  },
  {
    useCase: "creator_tip_support",
    platform: "ios",
    environment: "sandbox",
    providerReady: true,
    appStorePurchasesEnabled: true,
    liveMoneyEnabled: false,
    unlocksDigitalAccess: true,
  },
  {
    useCase: "creator_paid_digital_content",
    platform: "ios",
    environment: "sandbox",
    providerReady: true,
    appStorePurchasesEnabled: true,
  },
  {
    useCase: "watch_party_seat_pass",
    platform: "ios",
    environment: "sandbox",
    providerReady: true,
    appStorePurchasesEnabled: true,
    liveMoneyEnabled: false,
    unlocksDigitalAccess: true,
  },
  {
    useCase: "watch_party_seat_pass",
    platform: "ios",
    environment: "production",
    providerReady: true,
    appStorePurchasesEnabled: true,
    liveMoneyEnabled: false,
    unlocksDigitalAccess: true,
  },
];
for (const input of policyCases) {
  const appDecision = appPaymentPolicy.resolvePaymentRailPolicy(input);
  const edgeDecision = edgePaymentPolicy.resolvePaymentRailPolicy(input);
  assert.deepEqual(
    JSON.parse(JSON.stringify(appDecision)),
    JSON.parse(JSON.stringify(edgeDecision)),
    `client/server payment policy drifted for ${input.platform}:${input.useCase}`,
  );
  assert.equal(appDecision.grantsLiveKitAuthority, false);
  assert.equal(appDecision.createsPayableBalance, false);
}
assert.equal(appPaymentPolicy.resolvePaymentRailPolicy(policyCases[0]).provider, "google_play_revenuecat");
assert.equal(appPaymentPolicy.resolvePaymentRailPolicy(policyCases[1]).allowed, false);
assert.equal(appPaymentPolicy.resolvePaymentRailPolicy(policyCases[2]).provider, "revenuecat_app_store");
assert.equal(appPaymentPolicy.resolvePaymentRailPolicy(policyCases[2]).allowed, true);
assert.equal(appPaymentPolicy.resolvePaymentRailPolicy(policyCases[3]).reason, "tips_cannot_unlock_digital_access");
assert.equal(appPaymentPolicy.resolvePaymentRailPolicy(policyCases[4]).allowed, false);
assert.equal(appPaymentPolicy.resolvePaymentRailPolicy(policyCases[5]).provider, "revenuecat_app_store");
assert.equal(appPaymentPolicy.resolvePaymentRailPolicy(policyCases[5]).allowed, true);
assert.equal(appPaymentPolicy.resolvePaymentRailPolicy(policyCases[5]).grantsLiveKitAuthority, false);
assert.equal(appPaymentPolicy.resolvePaymentRailPolicy(policyCases[5]).createsPayableBalance, false);
assert.equal(appPaymentPolicy.resolvePaymentRailPolicy(policyCases[6]).allowed, false);

const runtimeTierIds = new Set(appStoreRuntimeCatalog.IOS_FINITE_APP_STORE_TIERS.map((entry) => entry.productId));
const manifestFiniteTierIds = new Set(
  manifest.catalog
    .filter((entry) => entry.concept === "creator_tip" || entry.concept === "seat_pass")
    .map((entry) => entry.productId),
);
assert.deepEqual(runtimeTierIds, manifestFiniteTierIds, "runtime finite-tier IDs must match the permanent manifest");
assert.equal(
  appStoreRuntimeCatalog.resolveIosFiniteAppStoreTier("creator_tip", 99)?.productId,
  "com.chillywood.tip.tier1",
);
assert.equal(
  appStoreRuntimeCatalog.resolveIosFiniteAppStoreTier("creator_tip", 300)?.productId,
  "com.chillywood.tip.tier2",
  "legacy round-dollar display amounts may resolve only to their corresponding fixed Apple tier",
);
assert.equal(
  appStoreRuntimeCatalog.resolveIosFiniteAppStoreTier("seat_pass", 1000)?.productId,
  "com.chillywood.seatpass.tier4",
);
assert.equal(appStoreRuntimeCatalog.resolveIosFiniteAppStoreTier("creator_tip", 250), null);
assert.equal(appStoreRuntimeCatalog.resolveIosFiniteAppStoreTier("seat_pass", 0), null);

const apple = resolveRevenueCatStorePolicy("APP_STORE");
assert.equal(apple.platform, "ios");
assert.equal(apple.provider, "revenuecat_app_store");
assert.equal(apple.supportsGoogleBasePlans, false);
assert.deepEqual(
  providerProductIdCandidatesForStore("com.chillywood.premium.monthly:unexpected", apple),
  ["com.chillywood.premium.monthly:unexpected"],
  "Apple identifiers must be exact and must not use Google base-plan parsing",
);

const google = resolveRevenueCatStorePolicy("PLAY_STORE");
assert.equal(google.platform, "android");
assert.equal(google.provider, "revenuecat_google_play");
assert.equal(google.supportsGoogleBasePlans, true);
assert.deepEqual(
  providerProductIdCandidatesForStore("premium_subscription:annual", google),
  ["premium_subscription:annual", "premium_subscription", "premium_subscription:monthly"],
  "Google base-plan compatibility must remain intact",
);

assert.equal(appStoreSwitchAllowsEnvironment("off", "sandbox"), false);
assert.equal(appStoreSwitchAllowsEnvironment("sandbox_only", "sandbox"), true);
assert.equal(appStoreSwitchAllowsEnvironment("sandbox_only", "production"), false);
assert.equal(appStoreSwitchAllowsEnvironment("on", "production"), true);

assert.equal(isSafeStoreMapping({
  concept: "creator_tip",
  unlocks_digital_access: false,
  grants_livekit_authority: false,
  creates_payable_balance: false,
}), true);
assert.equal(isSafeStoreMapping({ concept: "creator_tip", unlocks_digital_access: true }), false);
assert.equal(isSafeStoreMapping({ concept: "seat_pass", grants_livekit_authority: true }), false);
assert.equal(isSafeStoreMapping({ concept: "premium", creates_payable_balance: true }), false);

const manifestIds = new Set(manifest.catalog.map((entry) => entry.productId));
const localIds = new Set([
  ...storeKit.products.map((entry) => entry.productID),
  ...storeKit.subscriptionGroups.flatMap((group) => group.subscriptions.map((entry) => entry.productID)),
]);
assert.deepEqual(localIds, manifestIds, "local StoreKit configuration must mirror the permanent manifest");
const localEntries = new Map([
  ...storeKit.products.map((entry) => [entry.productID, entry]),
  ...storeKit.subscriptionGroups.flatMap((group) => group.subscriptions.map((entry) => [entry.productID, entry])),
]);
for (const manifestEntry of manifest.catalog) {
  const localEntry = localEntries.get(manifestEntry.productId);
  assert.equal(localEntry?.displayPrice, manifestEntry.referencePrice);
  assert.equal(localEntry?.referenceName, manifestEntry.referenceName);
  assert.equal(localEntry?.localizations?.[0]?.displayName, manifestEntry.displayName);
  assert.equal(localEntry?.localizations?.[0]?.description, manifestEntry.description);
}
assert.equal(manifest.liveMoneyEnabled, false);
assert.equal(manifest.catalog.filter((entry) => entry.concept === "creator_tip").every((entry) => entry.entitlement === null), true);

console.log("iOS commerce proof passed:");
console.log("- App Store and Google Play provider identities remain separate");
console.log("- Apple product matching is exact; Google base-plan matching is preserved");
console.log("- App Store switch defaults fail closed outside approved sandbox state");
console.log("- tips grant no access; purchases grant no room authority or payable balance");
console.log("- StoreKit configuration exactly mirrors the ten-product manifest");
console.log("- runtime tips and Seat Passes resolve only to exact permanent Apple tiers");
console.log("- unsupported dynamic iOS concepts remain policy-blocked before provider checkout");
