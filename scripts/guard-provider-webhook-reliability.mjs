#!/usr/bin/env node

import { readFileSync } from "node:fs";
import path from "node:path";

const root = process.cwd();
const read = (relativePath) => readFileSync(path.join(root, relativePath), "utf8");
const failures = [];
const fail = (message) => failures.push(message);
const includes = (source, needle, label) => {
  if (!source.includes(needle)) fail(`${label} missing ${needle}`);
};
const matches = (source, pattern, label) => {
  if (!pattern.test(source)) fail(`${label} must match ${pattern}`);
};
const notMatches = (source, pattern, label) => {
  if (pattern.test(source)) fail(label);
};

const moneyOperator = read("supabase/functions/money-operator/index.ts");
const revenueCat = read("supabase/functions/revenuecat-webhook/index.ts");
const googlePlay = read("supabase/functions/google-play-webhook/index.ts");
const stripeConnect = read("supabase/functions/stripe-connect-webhook/index.ts");
const stripeMerch = read("supabase/functions/stripe-merch-webhook/index.ts");
const providerReadiness = read("supabase/functions/_shared/provider-readiness.ts");
const stripeShared = read("supabase/functions/_shared/stripe-connect.ts");
const packageJson = read("package.json");
const moneyGuard = read("scripts/guard-money-flow-control.mjs");
const docs = [
  read("docs/MONEY_FLOW_CONTROL_RUNBOOK.md"),
  read("docs/AUTONOMOUS_SYSTEMS_SCOPE_REGISTRY.md"),
  read("docs/CHILLYWOOD_AUTONOMOUS_APP_OPERATING_MODEL.md"),
].join("\n\n");

const corpus = [moneyOperator, revenueCat, googlePlay, stripeConnect, stripeMerch, providerReadiness, stripeShared, docs].join("\n\n");

includes(packageJson, '"proof:provider-webhook-reliability"', "package script");
includes(packageJson, '"guard:provider-webhook-reliability"', "package script");

for (const required of [
  "provider_webhook_health",
  "provider_webhook_test_plan",
  "record_provider_webhook_delivery_status",
  "provider_dashboard_repair_request",
  "provider_webhook_reliability_report",
  "money_provider_sync_status",
  "money_reconciliation_findings",
  "moneyMoved: false",
  "provider_dashboard_mutated: false",
]) {
  includes(moneyOperator, required, "Money Operator provider webhook reliability");
}

for (const provider of ["revenuecat", "google_play", "stripe_connect", "stripe_merch"]) {
  includes(moneyOperator, provider, "Money Operator provider registry");
}

for (const required of [
  "REVENUECAT_WEBHOOK_SECRET",
  "verifySharedWebhookSecret",
  "premiumGranted: false",
  "liveMoneyAction: false",
]) {
  includes(revenueCat, required, "RevenueCat webhook fail-closed behavior");
}

for (const required of [
  "GOOGLE_PLAY_WEBHOOK_SECRET",
  "subscriptionGranted: false",
  "liveMoneyAction: false",
]) {
  includes(googlePlay, required, "Google Play webhook readiness behavior");
}

for (const required of [
  "STRIPE_WEBHOOK_SECRET",
  "verifyStripeWebhookSignature",
  'error: "invalid_signature"',
  "liveMoneyAction: false",
]) {
  includes(stripeConnect + stripeMerch + stripeShared, required, "Stripe webhook fail-closed behavior");
}

includes(moneyOperator, "change_money_facing_config", "dashboard repair approval action");
includes(moneyOperator, "pending_owner_approval", "dashboard repair stops for approval");
includes(moneyGuard, "manual Premium grant", "money guard Premium block");
includes(docs, "Provider Webhook Reliability", "docs provider webhook monitoring");

matches(moneyOperator, /PROVIDER_WEBHOOKS[\s\S]*requiredSecretNames[\s\S]*REVENUECAT_WEBHOOK_SECRET[\s\S]*GOOGLE_PLAY_WEBHOOK_SECRET[\s\S]*STRIPE_WEBHOOK_SECRET/, "secret names listed by name only");
notMatches(corpus, /\bstripe\.(payouts|transfers|charges|checkout|paymentLinks|invoices)\.create\b/i, "provider webhook reliability can create money movement");
notMatches(corpus, /grantPremium|manualPremium|editPremiumEntitlement|markPayoutPaid|releasePayout|createTransfer|createPaymentLink|createInvoice|chargeCustomer|enableCashout/i, "provider webhook reliability exposes forbidden imperative action");
notMatches(corpus, /(STRIPE_SECRET_KEY|STRIPE_WEBHOOK_SECRET|REVENUECAT_WEBHOOK_SECRET|GOOGLE_PLAY_WEBHOOK_SECRET|MONEY_OPERATOR_TOKEN_SHA256)\s*[:=]\s*['\"][^'\"$]/, "secret value committed");

if (failures.length) {
  console.error("Provider webhook reliability guard failed:");
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log("Provider webhook reliability guard passed.");
