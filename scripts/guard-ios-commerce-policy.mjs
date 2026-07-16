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
const purchaseIntentMigration = read("supabase/migrations/20260715174500_ios_app_store_purchase_intents.sql");
const legacyAndroidPurchaseIntentMigration = read("supabase/migrations/20260616121739_require_sandbox_tester_for_purchase_intents.sql");
const clientPolicy = read("_lib/paymentRailPolicy.ts");
const serverPolicy = read("supabase/functions/_shared/payment-rail-policy.ts");
const appStoreRuntimeCatalog = read("_lib/iosAppStoreCommerce.ts");
const webhook = read("supabase/functions/revenuecat-webhook/index.ts");
const storePolicy = read("supabase/functions/revenuecat-webhook/store-policy.mjs");
const revenueCatClient = read("_lib/revenuecat.ts");
const monetizationClient = read("_lib/monetization.ts");
const creatorTips = read("_lib/creatorTips.ts");
const seatPasses = read("_lib/paidWatchPartyTickets.ts");
const creatorSetup = read("_lib/creatorMonetizationSetup.ts");
const adminSandboxPurchases = read("app/admin-money-sandbox-purchases.tsx");
const tipSheet = read("components/monetization/tip-sheet.tsx");
const moneyScope = read("components/monetization/MoneyScopeInfoButton.tsx");
const dynamicPurchaseSources = [
  ["paid video", read("_lib/creatorPaidVideos.ts"), "purchasePaidVideoAccess", "createPaidVideoPurchaseIntent"],
  ["paid event", read("_lib/paidCreatorEvents.ts"), "purchasePaidCreatorEventPass", "createPaidCreatorEventPassPurchaseIntent"],
  ["VIP", read("_lib/creatorVipPasses.ts"), "purchaseCreatorVipPass", "createCreatorVipPassPurchaseIntent"],
  ["channel subscription", read("_lib/channelSubscriptions.ts"), "purchaseChannelSubscription", "createChannelSubscriptionPurchaseIntent"],
];

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
const finiteConsumableIds = manifest.catalog
  .filter((entry) => entry.concept === "creator_tip" || entry.concept === "seat_pass")
  .map((entry) => entry.productId)
  .sort();
const runtimeCatalogBlock = appStoreRuntimeCatalog.match(/export const IOS_APP_STORE_PRODUCTS\s*=\s*\[(?<catalog>[\s\S]*?)\];/);
const runtimeCatalogText = runtimeCatalogBlock?.groups?.catalog ?? appStoreRuntimeCatalog;
const runtimeAllProductIds = Array.from(
  String(runtimeCatalogText).matchAll(/productId\s*:\s*"([^"]+)"/gu),
).map((match) => match[1]).filter((productId) => productId.length > 0);
const runtimeFiniteIds = runtimeAllProductIds.filter(
  (productId) => !["com.chillywood.premium.monthly", "com.chillywood.premium.yearly"].includes(productId),
);

const runtimeFiniteIdsUnique = Array.from(new Set(runtimeFiniteIds)).sort();
const manifestFiniteIdsUnique = Array.from(new Set(finiteConsumableIds)).sort();
assert(
  runtimeFiniteIdsUnique.length === manifestFiniteIdsUnique.length &&
    JSON.stringify(runtimeFiniteIdsUnique) === JSON.stringify(manifestFiniteIdsUnique),
  "runtime finite-tier IDs must exactly match the manifest tip and Seat Pass IDs",
);
for (const productId of manifest.catalog.filter((entry) => entry.concept === "premium").map((entry) => entry.productId)) {
  includes(webhook, `"${productId}"`, "Premium webhook allowlist");
}
for (const source of [migration, clientPolicy, serverPolicy, webhook, storePolicy]) {
  includes(source, "revenuecat_app_store", "store-aware commerce source");
  includes(source, "revenuecat_google_play", "Android provider preservation");
}

includes(migration, "'revenuecat_app_store_enabled',\n  'off'", "App Store kill switch default");
includes(migration, 'add constraint "provider_events_provider_check"\n  check ("provider" in (\n    \'revenuecat_google_play\',\n    \'revenuecat_app_store\'', "provider event App Store constraint expansion");
includes(migration, 'add constraint "money_purchase_intents_provider_check"\n  check ("provider" in (\n    \'revenuecat_google_play\',\n    \'revenuecat_app_store\'', "purchase-intent App Store constraint expansion");
includes(migration, 'alter table public."monetization_product_store_mappings" enable row level security', "mapping RLS");
includes(migration, 'revoke all on table public."monetization_product_store_mappings" from public, anon, authenticated', "mapping client privilege revocation");
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
  includes(policy, "ios_seat_pass_uses_finite_app_store_catalog_sandbox_only", "iOS Seat Pass policy");
  includes(policy, "tips_cannot_unlock_digital_access", "tip access block");
  includes(policy, "grantsLiveKitAuthority: false", "purchase authority block");
  includes(policy, "createsPayableBalance: false", "payable-balance block");
}

includes(purchaseIntentMigration, 'create or replace function public."create_ios_app_store_purchase_intent"', "Apple purchase-intent RPC");
excludes(purchaseIntentMigration, 'create or replace function public."create_money_purchase_intent"', "Android purchase-intent preservation");
includes(legacyAndroidPurchaseIntentMigration, 'create or replace function public."create_money_purchase_intent"', "existing Android purchase-intent RPC");
for (const requiredPolicy of [
  'mapping."platform" = \'ios\'',
  'mapping."store" = \'app_store\'',
  'mapping."provider" = \'revenuecat_app_store\'',
  "v_app_store_switch_state <> 'sandbox_only'",
  "v_webhook_switch_state <> 'sandbox_only'",
  "v_live_money_switch_state <> 'off'",
  "v_payouts_switch_state <> 'off'",
  "v_mapping.\"concept\" not in ('creator_tip', 'seat_pass')",
  'v_mapping."grants_livekit_authority" is true',
  'v_mapping."creates_payable_balance" is true',
  "ios_app_store_exact_tier_price_required",
  "sandbox_monetization_tester_required",
  "ios_app_store_purchase_intent_rate_limited",
  "creator_cannot_tip_self",
  "creator_tip_blocked_by_audience_policy",
  "creator_cannot_buy_own_ticket",
  'public."resolve_paid_watch_party_ticket_access"',
]) {
  includes(purchaseIntentMigration, requiredPolicy, "Apple purchase-intent policy");
}
includes(purchaseIntentMigration, "watch_party_ticket_store_catalog", "Seat Pass conceptual mapping correction");
includes(purchaseIntentMigration, "'watch_party_live_ticket'", "Seat Pass Party Room access type");
includes(purchaseIntentMigration, "coalesce(p_metadata, '{}'::jsonb) || jsonb_build_object(", "server-owned safety metadata precedence");

for (const [label, source] of [["creator tip", creatorTips], ["Seat Pass", seatPasses]]) {
  includes(source, "resolvePaymentRailPolicy({", `${label} runtime payment policy`);
  includes(source, 'provider !== "revenuecat_app_store"', `${label} App Store provider assertion`);
  includes(source, '"create_ios_app_store_purchase_intent"', `${label} Apple purchase-intent RPC`);
  includes(source, "resolveIosFiniteAppStoreTier", `${label} finite product-tier resolution`);
  const policyIndex = source.indexOf("resolvePaymentRailPolicy({");
  const intentCallIndex = label === "Seat Pass"
    ? source.indexOf("createIosPaidWatchPartyTicketPurchaseIntent(", policyIndex)
    : source.indexOf("creatorTipsClient.rpc", policyIndex);
  const productLookupIndex = source.indexOf("readRevenueCatNonSubscriptionProducts", intentCallIndex);
  assert(policyIndex >= 0 && policyIndex < intentCallIndex, `${label} must apply policy before creating an Apple intent`);
  assert(intentCallIndex >= 0 && productLookupIndex > intentCallIndex, `${label} must create the bounded intent before provider lookup`);
}
includes(creatorTips, '"creator_tip_support"', "creator tip policy use case");
includes(seatPasses, '"watch_party_seat_pass"', "Seat Pass policy use case");

for (const [label, source, purchaseFunction, intentFunction] of dynamicPurchaseSources) {
  const purchaseIndex = source.indexOf(`export async function ${purchaseFunction}`);
  const iosBlockIndex = source.indexOf('if (Platform.OS === "ios")', purchaseIndex);
  const policyIndex = source.indexOf("resolvePaymentRailPolicy({", iosBlockIndex);
  const intentIndex = source.indexOf(intentFunction, policyIndex);
  assert(purchaseIndex >= 0, `${label} purchase function is missing`);
  assert(iosBlockIndex > purchaseIndex, `${label} must have an iOS fail-closed branch`);
  assert(policyIndex > iosBlockIndex, `${label} must invoke payment-rail policy on iOS`);
  assert(intentIndex > policyIndex, `${label} iOS policy must run before intent/provider work`);
  includes(source, "IOS_DYNAMIC_APP_STORE_UNAVAILABLE_COPY", `${label} truthful iOS unavailable copy`);
}

const genericIosBlock = creatorSetup.indexOf('if (Platform.OS === "ios")', creatorSetup.indexOf("launchCreatorSandboxDigitalPurchase"));
const genericProviderLookup = creatorSetup.indexOf("readRevenueCatNonSubscriptionProducts", genericIosBlock);
assert(genericIosBlock >= 0 && genericProviderLookup > genericIosBlock, "generic creator setup must fail closed before iOS provider lookup");
const adminIosBlock = adminSandboxPurchases.indexOf('if (Platform.OS === "ios")', adminSandboxPurchases.indexOf("runSandboxPurchase"));
const adminProviderLookup = adminSandboxPurchases.indexOf("readRevenueCatNonSubscriptionProducts", adminIosBlock);
assert(adminIosBlock >= 0 && adminProviderLookup > adminIosBlock, "generic admin sandbox purchase must fail closed before iOS provider lookup");

for (const [label, source] of [["tip sheet", tipSheet], ["money scope", moneyScope]]) {
  includes(source, 'Platform.OS === "ios"', `${label} platform-aware copy`);
  includes(source, "App Store", `${label} App Store copy`);
  includes(source, "Google Play", `${label} Android copy preservation`);
}
includes(tipSheet, 'listIosStoreProductsForConcept("creator_tip")', "iOS tip sheet finite product list");
includes(tipSheet, 'Platform.OS !== "ios" ? (', "iOS tip sheet custom-amount block");

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
includes(storePolicy, 'if (environment === "production")', "App Store production mapping branch");
includes(storePolicy, 'normalizeText(mapping.status) === "active"', "App Store production active-mapping requirement");

includes(revenueCatClient, "appStorePurchasesEnabled", "iOS RevenueCat client gate");
includes(revenueCatClient, "App Store purchases are disabled for this build.", "iOS RevenueCat fail-closed copy");
includes(monetizationClient, "App Store / RevenueCat", "iOS store-specific UI copy");
includes(monetizationClient, "Google Play / RevenueCat", "Android store-specific UI copy");

for (const disabledConcept of manifest.disabledDynamicConcepts ?? []) {
  excludes(manifestIds.join("\n"), disabledConcept, `disabled dynamic concept ${disabledConcept}`);
}

if (process.exitCode) process.exit();
console.log("iOS commerce policy guard passed (finite catalog, store split, sandbox gates, no money/authority escalation). ");
