#!/usr/bin/env node

import { readFileSync } from "node:fs";
import path from "node:path";

const root = process.cwd();
const read = (relativePath) => readFileSync(path.join(root, relativePath), "utf8");

const fail = (message) => {
  console.error(`Stripe Connect policy guard failed: ${message}`);
  process.exitCode = 1;
};

const assertIncludes = (source, needle, label) => {
  if (!source.includes(needle)) fail(`${label} is missing ${needle}`);
};

const assertNotIncludes = (source, needle, label) => {
  if (source.includes(needle)) fail(`${label} must not include ${needle}`);
};

const shared = read("supabase/functions/_shared/stripe-connect.ts");
const account = read("supabase/functions/stripe-connect-account/index.ts");
const onboarding = read("supabase/functions/stripe-connect-onboarding-link/index.ts");
const sync = read("supabase/functions/stripe-connect-account-sync/index.ts");
const webhook = read("supabase/functions/stripe-connect-webhook/index.ts");
const transferCreate = read("supabase/functions/stripe-connect-transfer-create/index.ts");
const payoutRelease = read("supabase/functions/payout-release-preflight/index.ts");
const merchCheckout = read("supabase/functions/stripe-merch-checkout/index.ts");
const merchWebhook = read("supabase/functions/stripe-merch-webhook/index.ts");
const merchMigration = `${read("supabase/migrations/20260603165000_money_access_grants_product_catalog.sql")}\n${read("supabase/migrations/20260604043000_stripe_merch_payout_sandbox_readiness.sql")}`;
const creatorMonetization = read("_lib/creatorMonetization.ts");
const creatorPayouts = read("_lib/creatorPayouts.ts");
const channelSettings = read("app/channel-settings.tsx");
const admin = read("app/admin.tsx");
const packageJson = read("package.json");
const foundationDoc = read("docs/CREATOR_MONETIZATION_SYSTEMS_FOUNDATION.md");

assertIncludes(packageJson, "guard:stripe-connect-policy", "package guard script");

assertIncludes(shared, "STRIPE_API_VERSION = \"2026-02-25.clover\"", "Stripe API version");
assertIncludes(shared, "PROVIDER_ENVIRONMENT = \"test\"", "Stripe Connect mode");
assertIncludes(shared, "readStripeTestSecret", "test secret reader");
assertIncludes(shared, "startsWith(\"sk_test_\")", "test-mode secret refusal");
assertIncludes(shared, "readStripeWebhookSecret", "webhook secret reader");
assertIncludes(shared, "startsWith(\"whsec_\")", "webhook secret format check");
assertIncludes(shared, "verifyStripeWebhookSignature", "webhook signature verification");
assertIncludes(shared, "timingSafeEqualHex", "timing-safe webhook comparison");
assertIncludes(shared, "STRIPE_CONNECT_FOUNDATION_WEBHOOK_EVENT_TYPES", "foundation webhook event allowlist");
[
  "checkout.session.completed",
  "payment_intent.succeeded",
  "payment_intent.payment_failed",
  "charge.refunded",
  "charge.dispute.created",
  "account.updated",
  "payout.paid",
  "payout.failed",
  "transfer.created",
  "transfer.reversed",
  "transfer.canceled",
].forEach((eventType) => {
  assertIncludes(shared, eventType, `foundation webhook event ${eventType}`);
});

assertIncludes(account, "provider_account_id_not_allowed", "account provider id refusal");
assertIncludes(account, "liveMoneyAction: false", "account no live money");
assertIncludes(account, "payoutCreated: false", "account no payout");
assertIncludes(account, "transferCreated: false", "account no transfer");
assertIncludes(account, "checkoutCreated: false", "account no checkout");

assertIncludes(onboarding, "readStripeTestSecret", "onboarding test secret only");
assertIncludes(onboarding, "liveMoneyAction: false", "onboarding no live money");
assertIncludes(sync, "readStripeTestSecret", "account sync test secret only");
assertIncludes(sync, "liveMoneyAction: false", "account sync no live money");

assertIncludes(webhook, "isStripeConnectFoundationWebhookEventType", "webhook foundation event recognition");
assertIncludes(webhook, "signatureVerified: true", "webhook signature proof output");
assertIncludes(webhook, "foundation_event_recorded_no_live_money", "webhook no-money foundation handling");
assertIncludes(webhook, "checkoutCreated: false", "webhook no checkout");
assertIncludes(webhook, "payoutCreated: false", "webhook no payout");
assertIncludes(webhook, "transferCreated: false", "webhook no transfer");
assertIncludes(webhook, "Live-mode Stripe events are not processed", "webhook live-mode refusal");

assertIncludes(transferCreate, "stripeSecretRead: false", "transfer-create secret refusal");
assertIncludes(transferCreate, "providerCall: false", "transfer-create no provider call");
assertIncludes(transferCreate, "money_instruction_not_allowed", "transfer-create client money refusal");
assertIncludes(transferCreate, "transferCreated: false", "transfer-create no transfer");
assertIncludes(payoutRelease, "release_instruction_not_allowed", "payout release client money refusal");
assertIncludes(payoutRelease, "payoutReleaseCreated: false", "payout release disabled");
assertIncludes(payoutRelease, "providerCall: false", "payout release no provider call");

assertIncludes(merchMigration, "cw_merch_test_tee_sandbox", "sandbox merch product seed");
assertIncludes(merchMigration, "stripe_merch_events", "Stripe merch event table");
assertIncludes(merchMigration, "merch_order_items", "merch order items table");
assertIncludes(merchMigration, "merch_products_physical_only_check", "merch physical-only constraint");
assertIncludes(merchMigration, "merch_orders_no_digital_access_check", "merch no digital access constraint");
assertIncludes(merchMigration, "\"creates_digital_access\" is false", "merch digital access false constraint");
assertIncludes(merchMigration, "revenuecat_entitlement_created", "merch no RevenueCat entitlement metadata");
assertIncludes(merchMigration, "premium_entitlement_created", "merch no Premium entitlement metadata");
assertIncludes(merchMigration, "not_payable", "merch not payable metadata");

assertIncludes(merchCheckout, "readStripeTestSecret", "merch checkout test secret only");
assertIncludes(merchCheckout, "stripe_physical_goods", "merch checkout physical goods provider");
assertIncludes(merchCheckout, "owner/operator-only", "merch checkout operator-only copy");
assertIncludes(merchCheckout, "creates_digital_access === true", "merch checkout digital access refusal");
assertIncludes(merchCheckout, "physical_merch", "merch checkout physical rail metadata");
assertIncludes(merchCheckout, "digitalAccessGrantCreated: false", "merch checkout no access grant");
assertIncludes(merchCheckout, "revenueCatEntitlementCreated: false", "merch checkout no RevenueCat entitlement");
assertIncludes(merchCheckout, "premiumEntitlementCreated: false", "merch checkout no Premium entitlement");
assertIncludes(merchCheckout, "payoutCreated: false", "merch checkout no payout");
assertIncludes(merchCheckout, "cashOutEnabled: false", "merch checkout no cash-out");
assertNotIncludes(merchCheckout, "user_entitlements", "merch checkout must not write Premium entitlements");
assertNotIncludes(merchCheckout, "access_grants", "merch checkout must not write access grants");
assertNotIncludes(merchCheckout, "money_access_ledger_events", "merch checkout must not write digital ledger");

assertIncludes(merchWebhook, "readStripeWebhookSecret", "merch webhook secret reader");
assertIncludes(merchWebhook, "verifyStripeWebhookSignature", "merch webhook signature verification");
assertIncludes(merchWebhook, "Live-mode Stripe merch events are not processed", "merch webhook live-mode refusal");
assertIncludes(merchWebhook, "stripe_merch_events", "merch webhook event storage");
assertIncludes(merchWebhook, "checkout.session.completed", "merch checkout completed event");
assertIncludes(merchWebhook, "payment_intent.succeeded", "merch payment succeeded event");
assertIncludes(merchWebhook, "checkout.session.expired", "merch expired event");
assertIncludes(merchWebhook, "charge.refunded", "merch refund event");
assertIncludes(merchWebhook, "charge.dispute.created", "merch dispute event");
assertIncludes(merchWebhook, "digitalAccessGrantCreated: false", "merch webhook no access grant");
assertIncludes(merchWebhook, "revenueCatEntitlementCreated: false", "merch webhook no RevenueCat entitlement");
assertIncludes(merchWebhook, "premiumEntitlementCreated: false", "merch webhook no Premium entitlement");
assertIncludes(merchWebhook, "payoutCreated: false", "merch webhook no payout");
assertIncludes(merchWebhook, "cashOutEnabled: false", "merch webhook no cash-out");
assertIncludes(merchWebhook, "status: \"duplicate\"", "merch webhook duplicate handling");
assertNotIncludes(merchWebhook, "user_entitlements", "merch webhook must not write Premium entitlements");
assertNotIncludes(merchWebhook, "access_grants", "merch webhook must not write access grants");
assertNotIncludes(merchWebhook, "money_access_ledger_events", "merch webhook must not write digital ledger");

assertIncludes(creatorMonetization, "CREATOR_SCHEDULED_PAYOUT_FEE_BPS = 0", "scheduled payout fee");
assertIncludes(creatorMonetization, "CREATOR_INSTANT_CASHOUT_FEE_BPS = 150", "instant cash-out fee");
assertIncludes(creatorMonetization, "CREATOR_INSTANT_CASHOUT_FEE_CAP_CENTS: number | null = null", "no instant cap");
assertNotIncludes(creatorMonetization, "499", "no $4.99 cash-out cap");

assertIncludes(creatorPayouts, "resolveCreatorPayoutReadiness", "creator payout readiness resolver");
assertIncludes(creatorPayouts, "STRIPE_CONNECT_TEST_ENABLED = true", "Stripe Connect test flag");
assertIncludes(creatorPayouts, "PAYOUT_DRY_RUN_ENABLED = true", "payout dry-run flag");
assertIncludes(creatorPayouts, "TEST_PAYOUT_WORKFLOW_ENABLED = true", "test payout workflow flag");
assertIncludes(creatorPayouts, "previewCreatorPayoutPreproductionWorkflow", "preproduction payout preview");
assertIncludes(creatorPayouts, "canRequestScheduledPayout", "scheduled payout readiness");
assertIncludes(creatorPayouts, "canRequestInstantCashout", "instant cash-out readiness");
assertIncludes(creatorPayouts, "Live money is disabled.", "live money disabled blocker");
assertIncludes(creatorPayouts, "Tax/1099 readiness is pending.", "tax readiness blocker");
assertIncludes(creatorPayouts, "No payable balance can be created by the mobile app.", "mobile balance write blocker");
assertIncludes(creatorPayouts, "Owner approval is required before any payout execution can move forward.", "owner approval blocker");
assertIncludes(creatorPayouts, "canExecuteProductionPayout: false", "production payout execution disabled");

assertIncludes(channelSettings, "Stripe Connect is for creator payouts only. It is not used to charge Android users for digital access.", "Studio Stripe setup copy");
assertIncludes(channelSettings, "No withdrawal, transfer, cash-out, or payout release action is available.", "Studio payout action lock copy");
assertIncludes(channelSettings, "Instant cash-out", "Studio instant cash-out readout");
assertIncludes(channelSettings, "Optional instant cash-out is", "Studio cash-out fee copy");
assertIncludes(channelSettings, "No payout is available until setup and verification are complete.", "Studio review copy");
assertIncludes(admin, "Creator-facing Connect Stripe setup is test-mode only", "Admin Connect read-only copy");
assertIncludes(admin, "tax/1099 readiness", "Admin tax readiness copy");
assertIncludes(admin, "Owner approval is required", "Admin owner approval copy");

assertIncludes(foundationDoc, "Stripe CLI / Connect Proof Status", "Stripe CLI proof docs");
assertIncludes(foundationDoc, "production payouts remain disabled", "production payout disabled docs");

if (process.exitCode) {
  process.exit();
}

console.log("Stripe Connect policy guard passed.");
