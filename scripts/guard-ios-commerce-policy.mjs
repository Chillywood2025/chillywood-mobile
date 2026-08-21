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
const assert = (condition, message) => { if (!condition) fail(message); };
const includes = (source, needle, label) => assert(source.includes(needle), `${label} is missing ${needle}`);
const excludes = (source, needle, label) => assert(!source.includes(needle), `${label} must not include ${needle}`);

const manifest = readJson("config/ios/app-store-products.json");
const storeKit = readJson("config/ios/Chillywood.storekit");
const runtimeCatalog = read("_lib/iosAppStoreCommerce.ts");
const clientPolicy = read("_lib/paymentRailPolicy.ts");
const serverPolicy = read("supabase/functions/_shared/payment-rail-policy.ts");
const switchboard = read("_lib/sevenFlowSwitchboard.ts");
const supabaseClient = read("_lib/supabase.ts");
const webhook = read("supabase/functions/revenuecat-webhook/index.ts");
const readiness = read("supabase/migrations/202608210001_creator_money_production_readiness_ios_parity.sql");
const routing = read("supabase/migrations/202608210002_ios_creator_money_rpc_routing.sql");
const atomic = read("supabase/migrations/202608210003_ios_creator_money_atomic_provider_processing.sql");
const settlement = read("supabase/migrations/202608210004_creator_money_settlement_and_payout_safety.sql");
const convergence = read("supabase/migrations/202608210005_creator_money_terminal_reconciliation_and_payout_allocations.sql");
const paidVideo = read("_lib/creatorPaidVideos.ts");
const paidEvents = read("_lib/paidCreatorEvents.ts");
const vip = read("_lib/creatorVipPasses.ts");
const channels = read("_lib/channelSubscriptions.ts");

assert(manifest.schemaVersion === 2, "manifest schemaVersion must be 2");
assert(manifest.bundleIdentifier === "com.chillywood.mobile", "manifest bundle identifier drifted");
assert(manifest.liveMoneyEnabled === false, "manifest live money must remain disabled");
assert(manifest.productionActivation?.enabled === false, "manifest production activation must remain disabled");
assert(manifest.productionActivation?.requiresProviderProof === true, "provider proof must be mandatory");
assert(manifest.productionActivation?.requiresOwnerApproval === true, "Owner approval must be mandatory");
assert(manifest.productionActivation?.requiresWave1CreatorEligibility === true, "Wave 1 creator eligibility must be mandatory");
assert(manifest.productionActivation?.requiresPhysicalDeviceProof === true, "physical-device proof must be mandatory");
assert(Array.isArray(manifest.catalog) && manifest.catalog.length === 30, "manifest must contain the reviewed 30-product finite catalog");
assert((manifest.disabledDynamicConcepts ?? []).length === 0, "implemented finite concepts must not remain marked dynamically disabled");

const ids = manifest.catalog.map((entry) => entry.productId);
assert(new Set(ids).size === ids.length, "App Store product IDs must be unique");
assert(manifest.catalog.every((entry) => entry.status === "sandbox_only"), "all catalog entries must remain sandbox_only in source");
const concepts = new Map();
for (const entry of manifest.catalog) concepts.set(entry.concept, (concepts.get(entry.concept) ?? 0) + 1);
for (const [concept, count] of Object.entries({ premium: 2, creator_tip: 4, seat_pass: 4, paid_video: 4, event_pass: 4, vip_pass: 4, channel_subscription: 8 })) {
  assert(concepts.get(concept) === count, `${concept} finite-product count drifted`);
}

const storeKitIds = [
  ...(storeKit.products ?? []).map((entry) => entry.productID),
  ...(storeKit.subscriptionGroups ?? []).flatMap((group) => (group.subscriptions ?? []).map((entry) => entry.productID)),
].sort();
assert(JSON.stringify(storeKitIds) === JSON.stringify([...ids].sort()), "StoreKit IDs must exactly match the manifest");
assert((storeKit.subscriptionGroups ?? []).length === 9, "StoreKit must contain Premium plus eight independent creator-subscription groups");
const channelGroups = (storeKit.subscriptionGroups ?? []).filter((group) =>
  (group.subscriptions ?? []).some((entry) => String(entry.productID ?? "").startsWith("com.chillywood.channel.subscription.slot")),
);
assert(channelGroups.length === 8, "creator channel subscriptions must have eight independent groups");
assert(new Set(channelGroups.map((group) => group.id ?? group.referenceName)).size === 8, "creator channel subscription groups must be distinct");

for (const marker of [
  '"paid_video"', '"event_pass"', '"vip_pass"', '"channel_subscription"',
  "listIosChannelSubscriptionSlots", "FINITE_TIERS", "com.chillywood.channel.subscription.slot",
]) includes(runtimeCatalog, marker, "runtime App Store catalog");
excludes(switchboard, "ios_dynamic_product_disabled", "seven-flow switchboard");
for (const marker of ["com.chillywood.paidvideo.tier1", "com.chillywood.eventpass.tier1", "com.chillywood.vip.tier1", "com.chillywood.channel.subscription.slot1"]) {
  includes(switchboard, marker, "seven-flow switchboard finite iOS mapping");
}

for (const policy of [clientPolicy, serverPolicy]) {
  includes(policy, 'PAYMENT_RAIL_POLICY_VERSION = "2026-08-21-ios-parity-v1"', "payment rail policy version");
  includes(policy, 'REVENUECAT_APP_STORE_PROVIDER = "revenuecat_app_store"', "App Store provider");
  includes(policy, 'REVENUECAT_GOOGLE_PLAY_PROVIDER = "revenuecat_google_play"', "Google Play provider");
  includes(policy, "ios_creator_paid_digital_uses_finite_app_store_catalog_server_authority", "finite iOS digital policy");
  includes(policy, "createsPayableBalance: false", "client/server payable-balance block");
  includes(policy, "grantsLiveKitAuthority: false", "client/server LiveKit authority block");
  includes(policy, "tips_cannot_unlock_digital_access", "tip access block");
}

includes(supabaseClient, '"x-chillywood-platform"', "Supabase platform routing header");
includes(supabaseClient, 'Platform.OS === "ios" ? "ios"', "Supabase iOS platform routing hint");
for (const source of [paidVideo, paidEvents, vip, channels]) {
  includes(source, "resolvePaymentRailPolicy({", "creator-money client payment policy");
  includes(source, 'platform: "ios"', "creator-money iOS policy invocation");
  includes(source, 'store: "app_store"', "creator-money App Store policy invocation");
  includes(source, "purchaseRevenueCat", "creator-money RevenueCat purchase path");
}

for (const marker of [
  'add column if not exists "expires_at"',
  'owner_required_for_high_risk_money_activation',
  'monetization_write_audit',
  'expire_money_purchase_intents',
  "revenuecat_app_store_enabled",
  "provider_webhooks_enabled",
  "owner_release_approved",
  "physical_device_proof",
  "provider_proof",
  "wave1_creator_eligibility",
  "payouts_enabled",
  "live_money_enabled",
]) includes(readiness, marker, "production-readiness hardening migration");
includes(readiness, 'where "key" in (\'live_money_enabled\',\'payouts_enabled\')', "live/payout forced-off migration");
includes(readiness, '"state"=\'off\'', "live/payout forced-off state");

for (const marker of [
  'create or replace function public."create_money_purchase_intent"',
  'create_ios_creator_money_purchase_intent',
  'x-chillywood-platform',
  "paid_content_access_sandbox_099",
  "channel_subscription_sandbox_monthly_499",
]) includes(routing, marker, "iOS routing migration");

for (const marker of [
  'process_revenuecat_consumable_event_atomic',
  'pg_advisory_xact_lock',
  'pending_verification',
  'payout_readiness_proved',
  'creator_no_longer_verified_for_production_money',
  'grants_livekit_publish',
  'grants_host_power',
  'grants_admin_power',
  'grants_payout_access',
]) includes(atomic, marker, "atomic provider migration");
includes(webhook, 'adminClient.rpc("process_revenuecat_consumable_event_atomic"', "RevenueCat atomic creator-money webhook call");

for (const marker of [
  'finalize_creator_money_settlement',
  'release_mature_creator_money_settlements',
  'creator_money_recovery_obligations',
  'create_creator_payout_request_safe',
  'mark_creator_payout_provider_result',
  "pending_verification",
  "payout_switches_not_enabled",
  "settlement_reference_hash",
]) includes(settlement, marker, "settlement/payout migration");
for (const marker of [
  "canonical_content_type",
  "creator_video",
  "lifecycle_no_financial_reversal",
  "creator_money_reversal_links",
  "creator_payout_allocations",
  "payout_allocation_incomplete",
  "paid_amount_recovery_required",
  "process_revenuecat_consumable_event_atomic_v1",
]) includes(convergence, marker, "terminal/payout convergence migration");

for (const migration of [readiness, routing, atomic, settlement, convergence]) {
  excludes(migration, "stripe.transfers.create", "source-only migration");
  excludes(migration, "stripe.payouts.create", "source-only migration");
  excludes(migration, "revenuecat.com", "source-only migration");
}

if (!process.exitCode) {
  console.log("iOS commerce policy guard passed: finite creator-money parity is production-shaped, provider/payout activation stays fail-closed, and no source migration executes external money movement.");
}
