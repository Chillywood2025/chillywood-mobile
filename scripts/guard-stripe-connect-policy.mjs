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

assertIncludes(channelSettings, "Stripe setup can be reviewed, but payouts are still unavailable.", "Studio Stripe setup copy");
assertIncludes(channelSettings, "No withdrawal, transfer, cash-out, or payout release action is available.", "Studio payout action lock copy");
assertIncludes(channelSettings, "Instant cash-out", "Studio instant cash-out readout");
assertIncludes(channelSettings, "Optional instant cash-out is", "Studio cash-out fee copy");
assertIncludes(channelSettings, "Platform review is required before any future payout action can be considered.", "Studio review copy");
assertIncludes(admin, "Creator-facing Connect Stripe setup is test-mode only", "Admin Connect read-only copy");
assertIncludes(admin, "tax/1099 readiness", "Admin tax readiness copy");
assertIncludes(admin, "Owner approval is required", "Admin owner approval copy");

assertIncludes(foundationDoc, "Stripe CLI / Connect Proof Status", "Stripe CLI proof docs");
assertIncludes(foundationDoc, "production payouts remain disabled", "production payout disabled docs");

if (process.exitCode) {
  process.exit();
}

console.log("Stripe Connect policy guard passed.");
