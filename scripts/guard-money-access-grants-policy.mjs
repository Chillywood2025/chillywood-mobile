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
const purchaseIntentMigration = read("supabase/migrations/20260603190000_money_purchase_intents.sql");
const failurePathsMigration = read("supabase/migrations/20260604015548_money_failure_paths_event_pass.sql");
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
  'create table if not exists public."money_purchase_intents"',
  'create or replace function public."create_money_purchase_intent"',
  'create or replace function public."get_my_money_purchase_intent"',
  'create or replace function public."admin_list_money_purchase_intents"',
  'create or replace function public."admin_get_money_purchase_intent"',
  'create or replace function public."expire_money_purchase_intents"',
  '"money_purchase_intents_sandbox_only_check"',
  '"money_purchase_intents_no_merch_digital_check"',
  'sandbox_provider_mapping_required',
  'provider_product_id_required',
  'sandbox_purchase_intents_not_enabled',
  'merch_is_physical_goods_only',
  'premium_uses_existing_revenuecat_shell',
].forEach((needle) => assertIncludes(purchaseIntentMigration, needle, "money purchase intent migration"));

[
  'create unique index if not exists "access_grants_provider_event_grant_unique"',
  'create unique index if not exists "money_access_ledger_provider_event_unique"',
  'create or replace function public."admin_revoke_money_access_grant_for_proof"',
  'provider_refund_claimed\', false',
  'create or replace function public."has_event_pass_access"',
  "'event_state_blocks_access'",
  "'event_pass_required'",
  "'canPublish', false",
  "'approvalRequired', true",
].forEach((needle) => assertIncludes(failurePathsMigration, needle, "money failure/event-pass migration"));

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
assertIncludes(moneyAccess, "MONEY_PURCHASE_INTENTS_TABLE", "purchase intent table constant");
assertIncludes(moneyAccess, "dynamicPurchaseIntentsSandboxOnly: true", "purchase intents sandbox only proof");
assertIncludes(moneyAccess, "missingPurchaseIntentGrantsAccess: false", "missing intent cannot grant access proof");
assertIncludes(moneyAccess, "expiredPurchaseIntentGrantsAccess: false", "expired intent cannot grant access proof");
assertIncludes(moneyAccess, "consumedPurchaseIntentCanBeReused: false", "consumed intent cannot be reused proof");
assertIncludes(failurePathsMigration, '"provider_event_id", "user_id", "grant_type"', "duplicate provider event cannot duplicate grants");
assertIncludes(failurePathsMigration, 'on public."money_access_ledger_events" ("provider_event_id")', "duplicate provider event cannot duplicate ledger rows");
assertIncludes(failurePathsMigration, '"status" = \'revoked\'', "admin revoke marks access revoked");
assertIncludes(failurePathsMigration, '"event_type",\n    "amount_minor"', "admin revoke appends sanitized ledger event");
assertIncludes(failurePathsMigration, "'ADMIN_REVOKE'", "admin revoke ledger is explicit");
assertIncludes(failurePathsMigration, "'production_money', false", "admin revoke does not create production money");
assertIncludes(failurePathsMigration, "'payout_readiness_proved', false", "admin revoke does not create payout readiness");
assertIncludes(failurePathsMigration, "'live_money_enabled_at_verification', false", "admin revoke live money remains off");
assertIncludes(failurePathsMigration, "v_event.\"status\" in ('draft', 'ended', 'expired', 'canceled')", "event pass blocked event states deny");
assertIncludes(failurePathsMigration, "'canPublish', false", "event pass never grants LiveKit publish");
assertIncludes(failurePathsMigration, "'host_or_admin_preview_route_policy_still_applies'", "event host/admin preview does not grant route authority");

assertIncludes(revenueCatWebhook, "mirrorRevenueCatPremiumMoneyAccess", "RevenueCat money access mirror");
assertIncludes(revenueCatWebhook, "mirrorRevenueCatDynamicMoneyAccess", "RevenueCat dynamic money access mirror");
assertIncludes(revenueCatWebhook, ".from(\"provider_events\")", "RevenueCat provider event mirror");
assertIncludes(revenueCatWebhook, ".from(\"access_grants\")", "RevenueCat access grant mirror");
assertIncludes(revenueCatWebhook, ".from(\"money_access_ledger_events\")", "RevenueCat money access ledger mirror");
assertIncludes(revenueCatWebhook, ".from(\"money_purchase_intents\")", "RevenueCat purchase intent matching");
assertIncludes(revenueCatWebhook, "purchase_intent_missing_or_expired", "RevenueCat missing intent blocks access");
assertIncludes(revenueCatWebhook, "duplicate_provider_event", "RevenueCat duplicate event idempotency");
assertIncludes(revenueCatWebhook, "product_not_sandbox_enabled", "RevenueCat dynamic products sandbox-only");
assertIncludes(revenueCatWebhook, "production_or_setup_event_blocked", "RevenueCat production/setup dynamic events blocked");
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
