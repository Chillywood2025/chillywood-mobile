#!/usr/bin/env node

import { readFileSync } from "node:fs";
import path from "node:path";

const root = process.cwd();
const read = (relativePath) => readFileSync(path.join(root, relativePath), "utf8");
const readJson = (relativePath) => JSON.parse(read(relativePath));

const fail = (message) => {
  console.error(`iOS commerce policy guard failed: ${message}`);
  process.exitCode = 1;
};
const assert = (condition, message) => {
  if (!condition) fail(message);
};
const includes = (source, needle, label) => assert(source.includes(needle), `${label} is missing ${needle}`);
const excludes = (source, needle, label) => assert(!source.includes(needle), `${label} must not include ${needle}`);

const manifest = readJson("config/ios/app-store-products.json");
const storeKit = readJson("config/ios/Chillywood.storekit");
const migration = read("supabase/migrations/20260715151250_ios_app_store_mappings.sql");
const clientPolicy = read("_lib/paymentRailPolicy.ts");
const serverPolicy = read("supabase/functions/_shared/payment-rail-policy.ts");
const webhook = read("supabase/functions/revenuecat-webhook/index.ts");
const storePolicy = read("supabase/functions/revenuecat-webhook/store-policy.mjs");
const revenueCatClient = read("_lib/revenuecat.ts");
const monetizationClient = read("_lib/monetization.ts");

assert(manifest.liveMoneyEnabled === false, "manifest must keep live money disabled");
assert(manifest.bundleIdentifier === "com.chillywood.mobile", "manifest bundle identifier drifted");
assert(Array.isArray(manifest.catalog) && manifest.catalog.length === 10, "manifest must contain exactly ten permanent products");
assert(new Set(manifest.catalog.map((entry) => entry.productId)).size === 10, "manifest product IDs must be unique");
assert(manifest.catalog.every((entry) => entry.status === "sandbox_only"), "every Apple product must remain sandbox-only");

const manifestIds = manifest.catalog.map((entry) => entry.productId).sort();
const storeKitIds = [
  ...(storeKit.products ?? []).map((entry) => entry.productID),
  ...(storeKit.subscriptionGroups ?? []).flatMap((group) => (
    (group.subscriptions ?? []).map((entry) => entry.productID)
  )),
].sort();
assert(JSON.stringify(storeKitIds) === JSON.stringify(manifestIds), "StoreKit product IDs must exactly match the canonical manifest");
assert((storeKit.subscriptionGroups ?? []).length === 1, "StoreKit config must contain one Premium subscription group");
assert((storeKit.products ?? []).filter((entry) => entry.type === "Consumable").length === 8, "StoreKit config must contain eight consumables");
assert((storeKit.subscriptionGroups?.[0]?.subscriptions ?? []).length === 2, "StoreKit config must contain monthly and yearly subscriptions");
const storeKitEntries = new Map([
  ...(storeKit.products ?? []).map((entry) => [entry.productID, entry]),
  ...(storeKit.subscriptionGroups ?? []).flatMap((group) => (
    (group.subscriptions ?? []).map((entry) => [entry.productID, entry])
  )),
]);
for (const manifestEntry of manifest.catalog) {
  const storeKitEntry = storeKitEntries.get(manifestEntry.productId);
  const localization = storeKitEntry?.localizations?.find((entry) => entry.locale === "en_US");
  assert(storeKitEntry?.displayPrice === manifestEntry.referencePrice, `${manifestEntry.productId} StoreKit price drifted`);
  assert(storeKitEntry?.referenceName === manifestEntry.referenceName, `${manifestEntry.productId} reference name drifted`);
  assert(localization?.displayName === manifestEntry.displayName, `${manifestEntry.productId} display name drifted`);
  assert(localization?.description === manifestEntry.description, `${manifestEntry.productId} description drifted`);
  if (manifestEntry.type === "auto_renewable_subscription") {
    assert(storeKitEntry?.type === "RecurringSubscription", `${manifestEntry.productId} must be recurring`);
    assert(storeKitEntry?.recurringSubscriptionPeriod === manifestEntry.duration, `${manifestEntry.productId} duration drifted`);
  } else {
    assert(storeKitEntry?.type === "Consumable", `${manifestEntry.productId} must be consumable`);
  }
}

for (const productId of manifestIds) includes(migration, `'${productId}'`, "Apple mapping migration");
for (const productId of manifest.catalog.filter((entry) => entry.concept === "premium").map((entry) => entry.productId)) {
  includes(webhook, `"${productId}"`, "Premium webhook allowlist");
}
for (const source of [migration, clientPolicy, serverPolicy, webhook, storePolicy]) {
  includes(source, "revenuecat_app_store", "store-aware commerce source");
  includes(source, "revenuecat_google_play", "Android provider preservation");
}

includes(migration, "'revenuecat_app_store_enabled',\n  'off'", "App Store kill switch default");
includes(migration, 'alter table public."monetization_product_store_mappings" enable row level security', "mapping RLS");
includes(migration, 'revoke all on table public."monetization_product_store_mappings" from anon, authenticated', "mapping client privilege revocation");
includes(migration, '"grants_livekit_authority" = false', "mapping room-authority block");
includes(migration, '"creates_payable_balance" = false', "mapping payable-balance block");
includes(migration, '"concept" <> \'creator_tip\'', "tip access constraint");
includes(migration, "'live_money_action', false", "live-money false metadata");
includes(migration, "'payout_ready', false", "payout false metadata");

for (const policy of [clientPolicy, serverPolicy]) {
  includes(policy, 'REVENUECAT_APP_STORE_PROVIDER = "revenuecat_app_store"', "App Store provider policy");
  includes(policy, 'REVENUECAT_GOOGLE_PLAY_PROVIDER = "revenuecat_google_play"', "Google provider policy");
  includes(policy, "APP_STORE_PURCHASES_DEFAULT_ENABLED = false", "App Store client/server default");
  includes(policy, "ios_dynamic_digital_content_not_in_finite_app_store_catalog", "finite-catalog policy");
  includes(policy, "creator_tips_use_revenuecat_app_store_sandbox_only", "iOS tip policy");
  includes(policy, "tips_cannot_unlock_digital_access", "tip access block");
  includes(policy, "grantsLiveKitAuthority: false", "purchase authority block");
  includes(policy, "createsPayableBalance: false", "payable-balance block");
}

includes(webhook, "readStoreProductResolution", "store-aware webhook lookup");
includes(webhook, 'storePolicy.provider === "revenuecat_app_store"', "App Store webhook split");
includes(webhook, "app_store_purchase_switch_disabled", "App Store webhook fail-closed result");
includes(webhook, '.eq("provider", provider)', "provider-aware webhook idempotency");
includes(webhook, '.eq("provider_product_id", productResolution.providerProductId)', "provider-aware purchase intent lookup");
includes(webhook, "creator_tip_cannot_unlock_digital_access", "webhook tip access block");
includes(webhook, "store_mapping_authority_or_payable_balance_blocked", "webhook authority/payable block");
includes(webhook, "REVOKED_EVENT_TYPES", "refund and revocation handling");
includes(webhook, "duplicate_provider_event", "provider idempotency");
includes(webhook, "retryableFailure: !nonRetriablePayloadError", "webhook retry classification");
includes(webhook, "const responseStatus = nonRetriablePayloadError ? 200 : 500", "retriable webhook status");
includes(storePolicy, "supportsGoogleBasePlans: false", "Apple exact-ID policy");
includes(storePolicy, "supportsGoogleBasePlans: true", "Google base-plan policy");

includes(revenueCatClient, "appStorePurchasesEnabled", "iOS RevenueCat client gate");
includes(revenueCatClient, "App Store purchases are disabled for this build.", "iOS RevenueCat fail-closed copy");
includes(monetizationClient, "App Store / RevenueCat", "iOS store-specific UI copy");
includes(monetizationClient, "Google Play / RevenueCat", "Android store-specific UI copy");

for (const disabledConcept of manifest.disabledDynamicConcepts ?? []) {
  excludes(manifestIds.join("\n"), disabledConcept, `disabled dynamic concept ${disabledConcept}`);
}

if (process.exitCode) process.exit();
console.log("iOS commerce policy guard passed (finite catalog, store split, sandbox gates, no money/authority escalation). ");
