#!/usr/bin/env node

import { readFileSync } from "node:fs";
import path from "node:path";

const root = process.cwd();
const read = (relativePath) => readFileSync(path.join(root, relativePath), "utf8");

const fail = (message) => {
  console.error(`Money access grants policy guard failed: ${message}`);
  process.exitCode = 1;
};

const assertIncludes = (source, needle, label) => {
  if (!source.includes(needle)) fail(`${label} is missing ${needle}`);
};

const assertNotIncludes = (source, needle, label) => {
  if (source.includes(needle)) fail(`${label} must not include ${needle}`);
};

const migration = read("supabase/migrations/20260603165000_money_access_grants_product_catalog.sql");
const moneyAccess = read("_lib/moneyAccessGrants.ts");
const moneyFlags = read("_lib/moneyFeatureFlags.ts");
const monetization = read("_lib/monetization.ts");
const revenueCatWebhook = read("supabase/functions/revenuecat-webhook/index.ts");
const packageJson = read("package.json");

[
  'create table if not exists public."monetization_products"',
  'create table if not exists public."provider_events"',
  'create table if not exists public."access_grants"',
  'create table if not exists public."money_access_ledger_events"',
  'create table if not exists public."merch_products"',
  'create table if not exists public."merch_orders"',
  'create or replace function public."has_premium_access"',
  'create or replace function public."has_paid_content_access"',
  'create or replace function public."has_watch_party_live_ticket"',
  'create or replace function public."has_live_watch_party_access"',
  'create or replace function public."has_live_watch_party_seat_eligibility"',
  'create or replace function public."resolve_money_access_room_entry"',
  'create or replace function public."get_admin_money_access_readout"',
].forEach((needle) => assertIncludes(migration, needle, "money access migration"));

[
  "premium_subscription",
  "paid_content_access",
  "watch_party_live_ticket",
  "live_watch_party_access_pass",
  "live_watch_party_seat_pass",
  "creator_tip",
  "merch_physical_good",
  "event_pass",
].forEach((type) => {
  assertIncludes(migration, `'${type}'`, `product/grant type ${type}`);
  assertIncludes(moneyAccess, `"${type}"`, `client product type ${type}`);
});

[
  "setup",
  "sandbox",
  "active",
  "disabled",
  "retired",
  "not_payable",
  "pending_verification",
  "payable",
  "paid",
  "refunded",
  "reversed",
  "chargeback",
].forEach((status) => assertIncludes(migration, `'${status}'`, `status ${status}`));

[
  "watch_party_tickets_enabled",
  "live_watch_party_access_enabled",
  "live_watch_party_seats_enabled",
  "watch_party_seats_enabled",
  "paid_content_enabled",
  "tips_enabled",
  "payouts_enabled",
  "live_money_enabled",
  "provider_webhooks_enabled",
  "revenuecat_google_play_enabled",
  "stripe_connect_enabled",
].forEach((key) => {
  assertIncludes(migration, `'${key}'`, `kill switch migration ${key}`);
  assertIncludes(moneyFlags, key, `money feature flag ${key}`);
});

assertIncludes(migration, `"is_android_digital" = false\n      or "provider" in ('revenuecat_google_play', 'google_play', 'revenuecat')`, "Android digital RevenueCat/Google Play rail");
assertIncludes(migration, `"product_type" <> 'merch_physical_good'`, "merch physical product separation");
assertIncludes(migration, `"is_physical_good" = true`, "merch physical good flag");
assertIncludes(migration, `"digital_access_grant_id" is null`, "merch orders cannot create digital access");
assertIncludes(migration, `"environment" <> 'sandbox' or "payable_state" in ('not_payable', 'refunded', 'reversed', 'chargeback')`, "sandbox ledger not payable");
assertIncludes(migration, `"environment" <> 'setup' or "payable_state" = 'not_payable'`, "setup ledger not payable");
assertIncludes(migration, `"payable_state" not in ('payable', 'paid') or "environment" = 'production'`, "payable production only");
assertIncludes(migration, `"provider_event_id" is not null`, "production active grants require provider event");
assertIncludes(migration, `"metadata"::text !~* '(secret|token|password|service_role|private_key|webhook_secret|api_key`, "metadata secret guard");
assertIncludes(migration, `"metadata"::text !~* '(secret|token|password|service_role|private_key|webhook_secret|api_key|livekit|publish|host_controls|admin_power)'`, "access grant authority metadata guard");
assertIncludes(migration, `coalesce(("metadata"->>'grants_livekit_publish')::boolean, false) = false`, "access grants do not grant LiveKit publish");
assertIncludes(migration, `coalesce(("metadata"->>'grants_host_power')::boolean, false) = false`, "access grants do not grant host power");
assertIncludes(migration, `coalesce(("metadata"->>'grants_admin_power')::boolean, false) = false`, "access grants do not grant admin power");
assertIncludes(migration, `coalesce(("metadata"->>'grants_payout_access')::boolean, false) = false`, "access grants do not grant payout access");
assertIncludes(migration, `'premium_subscription_monthly'`, "Premium catalog seed");
assertIncludes(migration, `'sandbox_proved', true`, "Premium sandbox proved catalog label");
assertIncludes(migration, `'purchase_shell_closed_by_default', true`, "Premium shell closed catalog label");
assertIncludes(migration, `'setup_only', true`, "setup-only product labels");
assertIncludes(migration, `'buy_button_active', false`, "inactive buy button labels");
assertIncludes(migration, `'tip_button_active', false`, "inactive tip button label");
assertIncludes(migration, `'creates_digital_access', false`, "merch no digital access label");
assertIncludes(migration, `'canPublish', false`, "room resolver never grants publish");
assertIncludes(migration, `'speakerApprovalRequired', true`, "room resolver preserves speaker approval");

assertIncludes(moneyAccess, "paymentCreatesAccessRecordsOnly: true", "money access policy proof");
assertIncludes(moneyAccess, "premiumSourceRemainsUserEntitlements: true", "Premium entitlement source proof");
assertIncludes(moneyAccess, "androidDigitalRail: \"revenuecat_google_play\"", "Android digital rail proof");
assertIncludes(moneyAccess, "merchSeparateFromDigitalAccess: true", "merch separation proof");
assertIncludes(moneyAccess, "liveKitPublishGrantedByPayment: false", "LiveKit publish proof");
assertIncludes(moneyAccess, "hostPowerGrantedByPayment: false", "host power proof");
assertIncludes(moneyAccess, "payoutAccessGrantedByPayment: false", "payout access proof");
assertIncludes(moneyAccess, "sandboxLedgerPayable: false", "sandbox not payable proof");
assertIncludes(moneyAccess, "setupLedgerPayable: false", "setup not payable proof");

assertIncludes(revenueCatWebhook, "mirrorRevenueCatPremiumMoneyAccess", "RevenueCat money access mirror");
assertIncludes(revenueCatWebhook, ".from(\"provider_events\")", "RevenueCat provider event mirror");
assertIncludes(revenueCatWebhook, ".from(\"access_grants\")", "RevenueCat access grant mirror");
assertIncludes(revenueCatWebhook, ".from(\"money_access_ledger_events\")", "RevenueCat money access ledger mirror");
assertIncludes(revenueCatWebhook, "provider_payload_stored: false", "RevenueCat mirror stores no raw provider payload");
assertIncludes(revenueCatWebhook, "payableState: \"not_payable\"", "RevenueCat mirror keeps sandbox not payable");
assertIncludes(revenueCatWebhook, "moneyAccessMirrored: true", "RevenueCat webhook response mirrors money access");
assertIncludes(revenueCatWebhook, "liveMoneyAction: false", "RevenueCat webhook live money false");
assertNotIncludes(revenueCatWebhook, "checkout_session", "RevenueCat webhook must not create checkout sessions");
assertNotIncludes(revenueCatWebhook, "payout_created", "RevenueCat webhook must not create payouts");
assertNotIncludes(revenueCatWebhook, "transfer_created", "RevenueCat webhook must not create transfers");

assertIncludes(monetization, "PREMIUM_PURCHASE_SHELL_ON_HOLD = true", "Premium purchase shell closed by default");
assertIncludes(packageJson, "\"guard:money-access-grants-policy\"", "npm guard script");

assertNotIncludes(migration, "checkout_session", "no checkout session in money access migration");
assertNotIncludes(migration, "payment_intent", "no payment intent in money access migration");
assertNotIncludes(migration, "transfer_created", "no transfer creation in money access migration");
assertNotIncludes(migration, "payout_created", "no payout creation in money access migration");

if (process.exitCode) {
  process.exit();
}

console.log("Money access grants policy guard passed.");
