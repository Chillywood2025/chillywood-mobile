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
const migration = read("supabase/migrations/202605140011_creator_monetization_systems_foundation.sql");
const monetization = read("_lib/monetization.ts");
const premiumEntitlements = read("_lib/premiumEntitlements.ts");
const channelSettings = read("app/channel-settings.tsx");
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
assertIncludes(creatorMonetization, "CREATOR_INSTANT_CASHOUT_FEE_BPS = 150", "instant cash-out fee");
assertIncludes(creatorMonetization, "CREATOR_INSTANT_CASHOUT_FEE_CAP_CENTS: number | null = null", "no instant cash-out cap");
assertNotIncludes(creatorMonetization, "499", "no $4.99 cap in creator monetization helper");

assertIncludes(migration, 'create table if not exists public."monetization_system_settings"', "settings table");
assertIncludes(migration, '"live_money_enabled" boolean not null default false', "live money default off");
assertIncludes(migration, '"instant_cashout_fee_bps" integer not null default 150', "instant cash-out SQL fee");
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

assertIncludes(monetization, "premium_subscription: {", "RevenueCat premium target");
assertIncludes(monetization, "offeringId: \"premium\"", "RevenueCat premium offering");
assertIncludes(monetization, "entitlementIds: [\"premium\"]", "RevenueCat premium entitlement");
assertIncludes(premiumEntitlements, "entitlement_key", "backed entitlement helper");
assertIncludes(premiumEntitlements, "revoked_at", "revoked entitlement blocking");

assertIncludes(channelSettings, "Tips do not unlock digital perks or paid access", "tip no-perks copy");
assertIncludes(channelSettings, "Paid content", "Platform Studio paid content copy");
assertIncludes(channelSettings, "Merch/products", "Platform Studio product copy");
assertIncludes(admin, "No checkout success, payout release, fake purchase, fake order, fake tip, or live money action", "Admin money safety copy");
assertIncludes(admin, "1.5% with no default cap", "Admin cash-out fee copy");

assertNotIncludes(read("CURRENT_STATE.md"), "$7.99", "CURRENT_STATE stale Premium price");
assertNotIncludes(read("NEXT_TASK.md"), "$7.99", "NEXT_TASK stale Premium price");
assertNotIncludes(read("ROADMAP.md"), "$7.99", "ROADMAP stale Premium price");

if (process.exitCode) {
  process.exit();
}

console.log("Creator monetization policy guard passed.");
