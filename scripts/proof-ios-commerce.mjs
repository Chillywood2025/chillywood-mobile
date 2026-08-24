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
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
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
  { useCase: "premium_subscription", platform: "android", providerReady: true },
  {
    useCase: "premium_subscription", platform: "ios", environment: "sandbox",
    providerReady: true, appStorePurchasesEnabled: false, liveMoneyEnabled: false,
  },
  {
    useCase: "creator_tip_support", platform: "ios", environment: "sandbox",
    providerReady: true, appStorePurchasesEnabled: true, liveMoneyEnabled: false, unlocksDigitalAccess: false,
  },
  {
    useCase: "creator_tip_support", platform: "ios", environment: "sandbox",
    providerReady: true, appStorePurchasesEnabled: true, liveMoneyEnabled: false, unlocksDigitalAccess: true,
  },
  {
    useCase: "creator_paid_digital_content", platform: "ios", store: "app_store", environment: "sandbox",
    providerReady: true, appStorePurchasesEnabled: true, liveMoneyEnabled: false,
  },
  {
    useCase: "watch_party_seat_pass", platform: "ios", environment: "sandbox",
    providerReady: true, appStorePurchasesEnabled: true, liveMoneyEnabled: false, unlocksDigitalAccess: true,
  },
  {
    useCase: "watch_party_seat_pass", platform: "ios", environment: "production",
    providerReady: true, appStorePurchasesEnabled: true, liveMoneyEnabled: false, unlocksDigitalAccess: true,
  },
];
for (const input of policyCases) {
  const appDecision = appPaymentPolicy.resolvePaymentRailPolicy(input);
  const edgeDecision = edgePaymentPolicy.resolvePaymentRailPolicy(input);
  assert.deepEqual(JSON.parse(JSON.stringify(appDecision)), JSON.parse(JSON.stringify(edgeDecision)),
    `client/server payment policy drifted for ${input.platform}:${input.useCase}`);
  assert.equal(appDecision.grantsLiveKitAuthority, false);
  assert.equal(appDecision.createsPayableBalance, false);
}
assert.equal(appPaymentPolicy.PAYMENT_RAIL_POLICY_VERSION, "2026-05-15");
assert.equal(edgePaymentPolicy.PAYMENT_RAIL_POLICY_VERSION, "2026-05-15");
assert.equal(appPaymentPolicy.resolvePaymentRailPolicy(policyCases[0]).provider, "google_play_revenuecat");
assert.equal(appPaymentPolicy.resolvePaymentRailPolicy(policyCases[1]).allowed, false);
assert.equal(appPaymentPolicy.resolvePaymentRailPolicy(policyCases[2]).provider, "revenuecat_app_store");
assert.equal(appPaymentPolicy.resolvePaymentRailPolicy(policyCases[2]).allowed, true);
assert.equal(appPaymentPolicy.resolvePaymentRailPolicy(policyCases[3]).reason, "tips_cannot_unlock_digital_access");
assert.equal(appPaymentPolicy.resolvePaymentRailPolicy(policyCases[4]).provider, "revenuecat_app_store");
assert.equal(appPaymentPolicy.resolvePaymentRailPolicy(policyCases[4]).allowed, true,
  "finite iOS creator digital products may reach server authority while live money remains off");
assert.equal(appPaymentPolicy.resolvePaymentRailPolicy(policyCases[5]).provider, "revenuecat_app_store");
assert.equal(appPaymentPolicy.resolvePaymentRailPolicy(policyCases[5]).allowed, true);
assert.equal(appPaymentPolicy.resolvePaymentRailPolicy(policyCases[5]).grantsLiveKitAuthority, false);
assert.equal(appPaymentPolicy.resolvePaymentRailPolicy(policyCases[5]).createsPayableBalance, false);
assert.equal(appPaymentPolicy.resolvePaymentRailPolicy(policyCases[6]).allowed, false);

const runtimeProducts = JSON.parse(JSON.stringify(appStoreRuntimeCatalog.IOS_APP_STORE_PRODUCTS));
assert.equal(runtimeProducts.length, 30, "runtime App Store catalog must contain exactly 30 products");
const runtimeById = new Map(runtimeProducts.map((entry) => [entry.productId, entry]));
assert.equal(runtimeById.size, runtimeProducts.length, "runtime App Store product IDs must be unique");
assert.deepEqual(new Set(runtimeById.keys()), new Set(manifest.catalog.map((entry) => entry.productId)),
  "runtime App Store IDs must exactly match the permanent manifest");
const nullable = (value) => value == null ? null : value;
for (const manifestEntry of manifest.catalog) {
  const runtimeEntry = runtimeById.get(manifestEntry.productId);
  assert.ok(runtimeEntry, `${manifestEntry.productId} must exist in the runtime App Store catalog`);
  assert.equal(runtimeEntry.concept, manifestEntry.concept, `${manifestEntry.productId} runtime concept drifted`);
  assert.equal(runtimeEntry.productType, manifestEntry.type, `${manifestEntry.productId} runtime product type drifted`);
  assert.equal(runtimeEntry.referencePrice, manifestEntry.referencePrice, `${manifestEntry.productId} runtime reference price drifted`);
  assert.equal(runtimeEntry.referencePriceMinor, Math.round(Number(manifestEntry.referencePrice) * 100), `${manifestEntry.productId} runtime minor-unit price drifted`);
  assert.equal(nullable(runtimeEntry.subscriptionPeriod), nullable(manifestEntry.duration), `${manifestEntry.productId} runtime duration drifted`);
  assert.equal(nullable(runtimeEntry.subscriptionGroup), nullable(manifestEntry.subscriptionGroup), `${manifestEntry.productId} runtime subscription group drifted`);
  assert.equal(nullable(runtimeEntry.entitlement), nullable(manifestEntry.entitlement), `${manifestEntry.productId} runtime entitlement mapping drifted`);
  assert.equal(nullable(runtimeEntry.offering), nullable(manifestEntry.offering), `${manifestEntry.productId} runtime offering mapping drifted`);
  assert.equal(nullable(runtimeEntry.package), nullable(manifestEntry.package), `${manifestEntry.productId} runtime package mapping drifted`);
  assert.equal(nullable(runtimeEntry.slotNumber), nullable(manifestEntry.slot), `${manifestEntry.productId} runtime channel slot drifted`);
}

const runtimeTierIds = new Set(appStoreRuntimeCatalog.IOS_FINITE_APP_STORE_TIERS.map((entry) => entry.productId));
const finiteConcepts = new Set(["creator_tip", "seat_pass", "paid_video", "event_pass", "vip_pass"]);
const manifestFiniteTierIds = new Set(manifest.catalog.filter((entry) => finiteConcepts.has(entry.concept)).map((entry) => entry.productId));
assert.deepEqual(runtimeTierIds, manifestFiniteTierIds, "runtime finite-tier IDs must match the permanent manifest");
assert.equal(runtimeTierIds.size, 20);
assert.equal(appStoreRuntimeCatalog.resolveIosFiniteAppStoreTier("creator_tip", 99)?.productId, "com.chillywood.tip.tier1");
assert.equal(appStoreRuntimeCatalog.resolveIosFiniteAppStoreTier("creator_tip", 300)?.productId, "com.chillywood.tip.tier2",
  "legacy round-dollar display amounts may resolve only to their corresponding fixed Apple tier");
assert.equal(appStoreRuntimeCatalog.resolveIosFiniteAppStoreTier("seat_pass", 1000)?.productId, "com.chillywood.seatpass.tier4");
assert.equal(appStoreRuntimeCatalog.resolveIosFiniteAppStoreTier("paid_video", 499)?.productId, "com.chillywood.paidvideo.tier3");
assert.equal(appStoreRuntimeCatalog.resolveIosFiniteAppStoreTier("event_pass", 999)?.productId, "com.chillywood.eventpass.tier4");
assert.equal(appStoreRuntimeCatalog.resolveIosFiniteAppStoreTier("vip_pass", 299)?.productId, "com.chillywood.vip.tier2");
assert.equal(appStoreRuntimeCatalog.resolveIosFiniteAppStoreTier("creator_tip", 250), null);
assert.equal(appStoreRuntimeCatalog.resolveIosFiniteAppStoreTier("seat_pass", 0), null);

const channelSlots = appStoreRuntimeCatalog.listIosChannelSubscriptionSlots();
assert.equal(channelSlots.length, 8);
assert.equal(new Set(channelSlots.map((entry) => entry.productId)).size, 8);
assert.equal(new Set(channelSlots.map((entry) => entry.subscriptionGroup)).size, 8,
  "each concurrent creator subscription slot must use its own Apple subscription group");
assert.equal(channelSlots.every((entry) => entry.referencePriceMinor === 499), true);

const apple = resolveRevenueCatStorePolicy("APP_STORE");
assert.equal(apple.platform, "ios");
assert.equal(apple.provider, "revenuecat_app_store");
assert.equal(apple.supportsGoogleBasePlans, false);
assert.deepEqual(providerProductIdCandidatesForStore("com.chillywood.premium.monthly:unexpected", apple),
  ["com.chillywood.premium.monthly:unexpected"], "Apple identifiers must be exact and must not use Google base-plan parsing");

const google = resolveRevenueCatStorePolicy("PLAY_STORE");
assert.equal(google.platform, "android");
assert.equal(google.provider, "revenuecat_google_play");
assert.equal(google.supportsGoogleBasePlans, true);
assert.deepEqual(providerProductIdCandidatesForStore("premium_subscription:annual", google),
  ["premium_subscription:annual", "premium_subscription", "premium_subscription:monthly"],
  "Google base-plan compatibility must remain intact");

assert.equal(appStoreSwitchAllowsEnvironment("off", "sandbox"), false);
assert.equal(appStoreSwitchAllowsEnvironment("sandbox_only", "sandbox"), true);
assert.equal(appStoreSwitchAllowsEnvironment("sandbox_only", "production"), false);
assert.equal(appStoreSwitchAllowsEnvironment("on", "production"), true);

assert.equal(isSafeStoreMapping({ concept: "creator_tip", unlocks_digital_access: false, grants_livekit_authority: false, creates_payable_balance: false }), true);
assert.equal(isSafeStoreMapping({ concept: "creator_tip", unlocks_digital_access: true }), false);
assert.equal(isSafeStoreMapping({ concept: "seat_pass", grants_livekit_authority: true }), false);
assert.equal(isSafeStoreMapping({ concept: "premium", creates_payable_balance: true }), false);
assert.equal(isSafeStoreMapping({ concept: "paid_video", unlocks_digital_access: true, grants_livekit_authority: false, creates_payable_balance: false }), true);
assert.equal(isSafeStoreMapping({ concept: "event_pass", unlocks_digital_access: true, grants_livekit_authority: false, creates_payable_balance: false }), true);
assert.equal(isSafeStoreMapping({ concept: "vip_pass", unlocks_digital_access: true, grants_livekit_authority: false, creates_payable_balance: false }), true);
assert.equal(isSafeStoreMapping({ concept: "channel_subscription", unlocks_digital_access: true, grants_livekit_authority: false, creates_payable_balance: false }), true);

const manifestIds = new Set(manifest.catalog.map((entry) => entry.productId));
const localIds = new Set([
  ...storeKit.products.map((entry) => entry.productID),
  ...storeKit.subscriptionGroups.flatMap((group) => group.subscriptions.map((entry) => entry.productID)),
]);
assert.deepEqual(localIds, manifestIds, "local StoreKit configuration must mirror the permanent manifest");
const localEntries = new Map([
  ...storeKit.products.map((entry) => [entry.productID, { entry, group: null }]),
  ...storeKit.subscriptionGroups.flatMap((group) =>
    group.subscriptions.map((entry) => [entry.productID, { entry, group }])),
]);
for (const manifestEntry of manifest.catalog) {
  const local = localEntries.get(manifestEntry.productId);
  assert.ok(local, `${manifestEntry.productId} must exist in StoreKit`);
  const expectedType = manifestEntry.type === "consumable" ? "Consumable" : "RecurringSubscription";
  assert.equal(local.entry.type, expectedType, `${manifestEntry.productId} StoreKit type drifted`);
  assert.equal(local.entry.displayPrice, manifestEntry.referencePrice);
  assert.equal(local.entry.referenceName, manifestEntry.referenceName);
  assert.equal(local.entry.localizations?.[0]?.displayName, manifestEntry.displayName);
  assert.equal(local.entry.localizations?.[0]?.description, manifestEntry.description);
  if (manifestEntry.type === "auto_renewable_subscription") {
    const expectedGroupId = `group-${manifestEntry.subscriptionGroup}`;
    assert.equal(local.entry.recurringSubscriptionPeriod, manifestEntry.duration, `${manifestEntry.productId} StoreKit duration drifted`);
    assert.equal(local.group?.id, expectedGroupId, `${manifestEntry.productId} StoreKit group ID drifted`);
    assert.equal(local.group?.name, manifestEntry.subscriptionGroup, `${manifestEntry.productId} StoreKit group name drifted`);
    assert.equal(local.entry.subscriptionGroupID, expectedGroupId, `${manifestEntry.productId} StoreKit group binding drifted`);
  } else {
    assert.equal(local.group, null, `${manifestEntry.productId} consumable must not be grouped as a subscription`);
    assert.equal(local.entry.recurringSubscriptionPeriod, undefined, `${manifestEntry.productId} consumable must not have a duration`);
    assert.equal(local.entry.subscriptionGroupID, undefined, `${manifestEntry.productId} consumable must not have a subscription group`);
  }
}
assert.equal(manifest.liveMoneyEnabled, false);
assert.equal(manifest.productionActivation.enabled, false);
assert.equal(manifest.catalog.filter((entry) => entry.concept === "creator_tip").every((entry) => entry.entitlement === null), true);

console.log("iOS commerce proof passed:");
console.log("- App Store and Google Play provider identities remain separate");
console.log("- Apple product matching is exact; Google base-plan matching is preserved");
console.log("- App Store production activation remains fail closed");
console.log("- tips grant no access; purchases grant no room authority or payable balance");
console.log("- StoreKit configuration exactly mirrors the 30-product finite manifest");
console.log("- finite creator-money tiers and eight independent channel subscription slots are deterministic");
console.log("- iOS creator digital requests reach server authority without enabling live money");
