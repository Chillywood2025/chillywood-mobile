#!/usr/bin/env node

import { readFileSync } from "node:fs";
import path from "node:path";

const root = process.cwd();
const read = (relativePath) => readFileSync(path.join(root, relativePath), "utf8");

const fail = (message) => {
  console.error(`Creator monetization policy guard failed: ${message}`);
  process.exitCode = 1;
};

const assertIncludes = (source, needle, label) => {
  if (!source.includes(needle)) fail(`${label} is missing ${needle}`);
};

const assertNotIncludes = (source, needle, label) => {
  if (source.includes(needle)) fail(`${label} must not include ${needle}`);
};

const featureFlags = read("_lib/featureFlags.ts");
const creatorMonetization = read("_lib/creatorMonetization.ts");
const creatorMonetizationSetup = read("_lib/creatorMonetizationSetup.ts");
const paymentRailPolicy = read("_lib/paymentRailPolicy.ts");
const migration = read("supabase/migrations/202605140011_creator_monetization_systems_foundation.sql");
const creatorSetupMigration = read("supabase/migrations/20260605000610_creator_monetization_in_app_setup_flows.sql");
const creatorSetupBoundMigration = read("supabase/migrations/20260605002000_bound_creator_monetization_setup_access.sql");
const sandboxTesterMigration = read("supabase/migrations/20260616030632_sandbox_monetization_testers.sql");
const sandboxTesterGrantMigration = read("supabase/migrations/20260616034235_tighten_sandbox_monetization_tester_rpc_grants.sql");
const sandboxChannelVipSourceMigration = read("supabase/migrations/20260616120810_support_channel_vip_sandbox_config.sql");
const sandboxChannelVipConstraintMigration = read("supabase/migrations/20260616120924_allow_channel_vip_config_product_types.sql");
const sandboxIntentTesterMigration = read("supabase/migrations/20260616121739_require_sandbox_tester_for_purchase_intents.sql");
const monetization = read("_lib/monetization.ts");
const premiumEntitlements = read("_lib/premiumEntitlements.ts");
const channelSettings = read("app/channel-settings.tsx");
const creatorTips = read("_lib/creatorTips.ts");
const creatorSetupRoute = read("app/creator-monetization-setup.tsx");
const revenueRoute = read("app/revenue.tsx");
const publicChannel = read("app/channel/[userId].tsx");
const player = read("app/player/[id].tsx");
const watchPartyEntry = read("app/watch-party/index.tsx");
const watchPartyRoom = read("app/watch-party/[partyId].tsx");
const eventRoute = read("app/event/[eventId].tsx");
const vipRoute = read("app/vip-pass/[creatorId].tsx");
const admin = read("app/admin.tsx");

[
  "premiumPurchaseEnabled",
  "paidContentCheckoutEnabled",
  "creatorPricingEnabled",
  "tipsEnabled",
  "merchStoreEnabled",
  "cashoutEnabled",
  "payoutsEnabled",
  "stripeConnectProductionEnabled",
  "liveMoneyEnabled",
].forEach((flag) => {
  assertIncludes(featureFlags, `${flag}: false`, `runtime flag ${flag}`);
});

assertIncludes(creatorMonetization, "PREMIUM_SUBSCRIPTION_PRICE_LABEL = \"$9.99/month\"", "Premium price truth");
assertIncludes(creatorMonetization, "PREMIUM_ENTITLEMENT_KEY = \"premium\"", "Premium entitlement truth");
assertIncludes(creatorMonetization, "PREMIUM_PRODUCT_ID = \"premium_subscription\"", "Premium product truth");
assertIncludes(creatorMonetization, "CREATOR_PAID_CONTENT_CREATOR_SHARE_BPS = 8000", "paid content creator split");
assertIncludes(creatorMonetization, "CREATOR_PAID_CONTENT_PLATFORM_SHARE_BPS = 2000", "paid content platform split");
assertIncludes(creatorMonetization, "CREATOR_TIP_CREATOR_SHARE_BPS = 10000", "tip creator share");
assertIncludes(creatorMonetization, "CREATOR_SCHEDULED_PAYOUT_FEE_BPS = 0", "scheduled payout bps");
assertIncludes(creatorMonetization, "CREATOR_SCHEDULED_PAYOUT_FEE_CENTS = 0", "scheduled payout zero fee");
assertIncludes(creatorMonetization, "CREATOR_INSTANT_CASHOUT_FEE_BPS = 150", "instant cash-out fee");
assertIncludes(creatorMonetization, "CREATOR_INSTANT_CASHOUT_FEE_CAP_CENTS: number | null = null", "no instant cash-out cap");
assertIncludes(creatorMonetization, "calculateScheduledPayoutFeeCents", "scheduled payout fee helper");
assertIncludes(creatorMonetization, "readCreatorMiniPlatformCommerceSurface", "public platform commerce readout");
assertIncludes(creatorMonetization, "setCreatorContentPrice", "creator pricing client helper");
assertIncludes(creatorMonetization, "requestCreatorPayout", "cash-out request client helper");
assertIncludes(creatorMonetization, "creatorMonetizationCheckoutPreflight", "checkout preflight client helper");
assertNotIncludes(creatorMonetization, "499", "no $4.99 cap in creator monetization helper");
assertIncludes(creatorMonetizationSetup, "APPROVED_CREATOR_SANDBOX_TIERS", "approved creator sandbox tiers");
assertIncludes(creatorMonetizationSetup, "arbitraryAndroidPricesAllowed: false", "no arbitrary Android prices");
assertIncludes(creatorMonetizationSetup, "stripeAndroidDigitalCheckoutEnabled: false", "no Stripe Android digital checkout");
assertIncludes(creatorMonetizationSetup, "payoutExecutionReadOnly: true", "payout readiness read-only");
assertIncludes(creatorMonetizationSetup, "liveKitPublishGrantedByPayment: false", "payment cannot grant LiveKit publish");
assertIncludes(creatorMonetizationSetup, "hostApprovalBypassedBySeatPass: false", "seat pass cannot bypass host approval");
[
  "cw_paid_content_access_sandbox_099",
  "cw_watch_party_live_ticket_sandbox_099",
  "cw_live_watch_party_access_sandbox_099",
  "cw_live_watch_party_seat_sandbox_099",
  "cw_creator_tip_sandbox_099",
  "cw_vip_pass_sandbox_499",
  "cw_event_pass_sandbox_099",
  "cw_merch_test_tee_sandbox",
].forEach((productId) => assertIncludes(creatorMonetizationSetup, productId, `creator setup product ${productId}`));
assertIncludes(paymentRailPolicy, "resolvePaymentRailPolicy", "payment rail policy helper");
assertIncludes(paymentRailPolicy, "PREMIUM_PAYMENT_RAIL = \"google_play_revenuecat\"", "Premium rail policy");
assertIncludes(paymentRailPolicy, "ANDROID_DIGITAL_CREATOR_CONTENT_STRIPE_ENABLED = false", "Android digital paid content Stripe block");
assertIncludes(paymentRailPolicy, "tips_cannot_unlock_digital_access", "tips cannot unlock digital access rail");

assertIncludes(migration, 'create table if not exists public."monetization_system_settings"', "settings table");
assertIncludes(migration, '"live_money_enabled" boolean not null default false', "live money default off");
assertIncludes(migration, '"instant_cashout_fee_bps" integer not null default 150', "instant cash-out SQL fee");
assertIncludes(migration, '"scheduled_payout_fee_bps" integer not null default 0', "scheduled payout SQL fee");
assertIncludes(migration, '"scheduled_payout_fee_bps" = 0', "scheduled payout zero SQL guard");
assertIncludes(migration, '"instant_cashout_fee_cap_cents" integer', "cash-out cap column");
assertIncludes(migration, '"instant_cashout_fee_cap_cents" is null', "no cap SQL guard");
assertIncludes(migration, 'create table if not exists public."creator_earnings_ledger"', "immutable ledger table");
assertIncludes(migration, "block_creator_earnings_ledger_update", "ledger update guard");
assertIncludes(migration, "block_creator_earnings_ledger_delete", "ledger delete guard");
assertIncludes(migration, "creator_pricing_disabled", "pricing flag fail-closed");
assertIncludes(migration, "premium_creator_required", "Premium creator pricing guard");
assertIncludes(migration, "purchase_required", "paid content resolver lock");
assertIncludes(migration, "payouts_disabled", "payout fail-closed");
assertIncludes(migration, "live_money_disabled", "checkout preflight fail-closed");
assertIncludes(migration, "creator_monetization_checkout_preflight", "checkout preflight RPC");
assertIncludes(migration, "resolve_creator_content_access", "paid content access resolver RPC");
assertIncludes(migration, "set_creator_content_price", "creator price RPC");
assertIncludes(migration, "calculate_creator_instant_cashout_fee", "cash-out fee RPC");
assertIncludes(creatorSetupMigration, 'create table if not exists public."creator_monetization_configs"', "creator setup config table");
assertIncludes(creatorSetupMigration, '"environment" = \'sandbox\'', "creator setup sandbox-only constraint");
assertIncludes(creatorSetupMigration, '"payable_state" = \'not_payable\'', "creator setup not-payable constraint");
assertIncludes(creatorSetupMigration, '"production_enabled" is false', "creator setup production off constraint");
assertIncludes(creatorSetupMigration, '"payout_enabled" is false', "creator setup payouts off constraint");
assertIncludes(creatorSetupMigration, '"grants_livekit_publish" is false', "creator setup no LiveKit publish constraint");
assertIncludes(creatorSetupMigration, 'approved_sandbox_tier_required', "creator setup approved tier requirement");
assertIncludes(creatorSetupMigration, 'android_digital_products_require_revenuecat_google_play', "creator setup Android digital rail guard");
assertIncludes(creatorSetupMigration, 'save_creator_sandbox_monetization_config', "creator setup save RPC");
assertIncludes(creatorSetupMigration, 'admin_list_creator_sandbox_monetization_configs', "creator setup admin inspection RPC");
assertIncludes(creatorSetupBoundMigration, "has_active_beta_access()", "creator setup server-side beta/internal tester requirement");
assertIncludes(creatorSetupBoundMigration, "internal_sandbox_tester_required", "creator setup server-side tester denial");
assertIncludes(creatorSetupBoundMigration, "public.has_platform_role(array['owner'::text, 'operator'::text])", "creator setup owner/operator server-side access");
assertIncludes(sandboxTesterMigration, 'create table if not exists public."sandbox_monetization_testers"', "sandbox tester table");
assertIncludes(sandboxTesterMigration, "resolve_sandbox_monetization_tester", "sandbox tester resolver");
assertIncludes(sandboxTesterMigration, "grant_sandbox_monetization_tester", "sandbox tester grant RPC");
assertIncludes(sandboxTesterMigration, "revoke_sandbox_monetization_tester", "sandbox tester revoke RPC");
assertIncludes(sandboxTesterMigration, "service_role", "sandbox tester service-role proof-script access");
assertIncludes(sandboxTesterGrantMigration, "revoke all on function public.\"grant_sandbox_monetization_tester\"", "sandbox tester grant RPC public revoke");
assertIncludes(sandboxTesterGrantMigration, "revoke all on function public.\"revoke_sandbox_monetization_tester\"", "sandbox tester revoke RPC public revoke");
assertIncludes(sandboxTesterGrantMigration, "from anon", "sandbox tester RPC anon revoke");
assertIncludes(sandboxTesterGrantMigration, "to authenticated", "sandbox tester RPC authenticated grant");
assertIncludes(sandboxTesterGrantMigration, "to service_role", "sandbox tester RPC service role grant");
assertIncludes(sandboxChannelVipSourceMigration, "when 'channel_subscription' then 'channel_subscription'", "sandbox config channel subscription source mapping");
assertIncludes(sandboxChannelVipSourceMigration, "when 'vip_pass' then 'vip_pass'", "sandbox config VIP source mapping");
assertIncludes(sandboxChannelVipConstraintMigration, "'channel_subscription'", "sandbox config channel subscription constraint");
assertIncludes(sandboxChannelVipConstraintMigration, "'vip_pass'", "sandbox config VIP constraint");
assertIncludes(sandboxIntentTesterMigration, "sandbox_monetization_tester_required", "sandbox purchase intent revoked tester denial");
assertIncludes(sandboxIntentTesterMigration, "public.resolve_sandbox_monetization_tester", "sandbox purchase intent tester resolver");
assertIncludes(sandboxIntentTesterMigration, "'sandbox_tester_checked', true", "sandbox purchase intent tester checked metadata");
assertIncludes(sandboxIntentTesterMigration, "payable_state", "sandbox purchase intent not payable guard context");

assertIncludes(monetization, "premium_subscription: {", "RevenueCat premium target");
assertIncludes(monetization, "offeringId: \"premium\"", "RevenueCat premium offering");
assertIncludes(monetization, "entitlementIds: [\"premium\"]", "RevenueCat premium entitlement");
assertIncludes(monetization, "PREMIUM_PURCHASE_SHELL_ON_HOLD = true", "Premium purchase shell closed by default");
assertIncludes(monetization, "isPremiumPurchaseShellAvailable", "Premium purchase shell availability guard");
assertIncludes(premiumEntitlements, "entitlement_key", "backed entitlement helper");
assertIncludes(premiumEntitlements, "revoked_at", "revoked entitlement blocking");

assertIncludes(creatorTips, "purchaseCreatorTipWithGooglePlay", "Google Play creator tip helper");
assertIncludes(creatorTips, "creator_tip_sandbox_099", "creator tip sandbox product key");
assertIncludes(creatorTips, "cw_creator_tip_sandbox_099", "creator tip RevenueCat product");
assertIncludes(channelSettings, "Sandbox Tester Experience", "Money Center sandbox tester setup section");
assertIncludes(channelSettings, "money-sandbox-setup-button", "Money Center sandbox setup selector");
assertIncludes(channelSettings, "money-sandbox-refresh-button", "Money Center sandbox refresh selector");
assertIncludes(channelSettings, "money-sandbox-open-tester-preview-button", "Money Center sandbox tester preview selector");
assertIncludes(channelSettings, "money-sandbox-manage-testers-button", "Money Center sandbox manage testers selector");
assertIncludes(channelSettings, "money-sandbox-create-party-room-target-button", "Money Center sandbox create Party Room selector");
assertIncludes(channelSettings, "money-sandbox-tips-card", "Money Center sandbox tips card selector");
assertIncludes(channelSettings, "money-sandbox-paid-video-card", "Money Center sandbox paid video card selector");
assertIncludes(channelSettings, "money-sandbox-watch-party-ticket-card", "Money Center sandbox Watch-Party card selector");
assertIncludes(channelSettings, "money-sandbox-event-pass-card", "Money Center sandbox event card selector");
assertIncludes(channelSettings, "money-sandbox-channel-subscription-card", "Money Center sandbox subscription card selector");
assertIncludes(channelSettings, "money-sandbox-vip-pass-card", "Money Center sandbox VIP card selector");
assertIncludes(channelSettings, "Sandbox Testing", "Money Center sandbox product status copy");
assertIncludes(channelSettings, "Live Money", "Money Center live money off copy");
assertIncludes(channelSettings, "Payouts", "Money Center payouts off copy");
assertIncludes(channelSettings, "Test mode - no payouts", "Money Center compact sandbox safety banner");
assertIncludes(channelSettings, "No real charges. No creator earnings. No withdrawals.", "Money Center compact no-money copy");
assertIncludes(channelSettings, "timed_out", "Money Center setup timeout lifecycle");
assertIncludes(channelSettings, "Setup timed out", "Money Center setup timeout notice");
assertIncludes(channelSettings, "Create a Party Room before testers can buy a ticket", "Money Center Watch-Party missing next action copy");
assertNotIncludes(channelSettings, "Sandbox testing is complete", "Money Center misleading sandbox complete copy");
assertIncludes(channelSettings, "Monetization", "Platform Studio Monetization tab");
assertIncludes(channelSettings, "Paid Video", "Platform Studio paid video copy");
assertIncludes(channelSettings, "Physical merch", "Platform Studio merch copy");
assertIncludes(channelSettings, "Stripe is reserved for physical merch", "Android digital Stripe block copy");
assertIncludes(creatorSetupRoute, "/channel-studio?tab=monetization&focus=offers", "legacy creator setup redirects to Money Center");
assertIncludes(channelSettings, "Set up sandbox offers", "Money Center creator setup action");
assertIncludes(channelSettings, "Google Play / RevenueCat sandbox", "Money Center Android digital rail copy");
assertIncludes(channelSettings, "tab=monetization&focus=payouts", "old payout deep link maps to Monetization");
assertIncludes(revenueRoute, "focus=balance", "old revenue route maps to creator balance");
assertNotIncludes(channelSettings, "{ id: \"payouts\", label: \"Payouts\" }", "separate Payouts tab");
assertNotIncludes(channelSettings, "{ id: \"revenue\", label: \"Revenue\" }", "separate Revenue tab");
assertNotIncludes(channelSettings, "{ id: \"monetize\", label: \"Monetize\" }", "separate Monetize tab");
assertIncludes(channelSettings, "Run your platform from one place", "Platform Studio platform copy");
assertIncludes(publicChannel, "Platform Store", "public platform store state");
assertIncludes(publicChannel, "Test Creator Purchases", "public tester sandbox purchase surface");
assertIncludes(publicChannel, "Sandbox only. No real money moves.", "public tester sandbox no-money copy");
assertIncludes(publicChannel, "No money moved. No payout created.", "public tester sandbox receipt copy");
assertIncludes(publicChannel, "Checkout pending", "public platform checkout disabled copy");
assertIncludes(publicChannel, "tester-watch-party-ticket-button", "public tester Watch-Party ticket selector");
assertIncludes(publicChannel, "tester-channel-subscribe-button", "tester subscription CTA selector");
assertIncludes(publicChannel, "tester-vip-pass-button", "tester VIP CTA selector");
assertIncludes(player, "creatorVideoPaidContentLocked", "Player paid creator-content lock");
assertIncludes(player, "It does not include Premium", "Player paid-content doctrine copy");
assertIncludes(player, "tester-paid-video-unlock-button", "tester paid video selector");
assertIncludes(read("components/monetization/tip-sheet.tsx"), "tip-confirm-button", "tip sheet confirm selector");
assertIncludes(watchPartyEntry, "tester-watch-party-ticket-button", "tester Watch-Party entry ticket selector");
assertIncludes(watchPartyRoom, "watch-party-ticket-purchase-button", "Watch-Party room ticket purchase selector");
assertIncludes(eventRoute, "event-pass-purchase-button", "event pass purchase selector");
assertIncludes(vipRoute, "vip-area-get-vip-button", "VIP route purchase selector");
assertIncludes(admin, "No checkout success, payout release, simulated purchase, simulated order, simulated tip, or live money action", "Admin money safety copy");
assertIncludes(admin, "1.5% with no default cap", "Admin cash-out fee copy");

assertNotIncludes(read("CURRENT_STATE.md"), "$7.99", "CURRENT_STATE stale Premium price");
assertNotIncludes(read("NEXT_TASK.md"), "$7.99", "NEXT_TASK stale Premium price");
assertNotIncludes(read("ROADMAP.md"), "$7.99", "ROADMAP stale Premium price");

if (process.exitCode) {
  process.exit();
}

console.log("Creator monetization policy guard passed.");
