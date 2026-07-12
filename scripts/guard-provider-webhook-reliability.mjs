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
const moneyLoopProof = read("scripts/proof-money-provider-reliability-loop.mjs");
const providerAccessBroker = read("_lib/providerAccessBroker.ts");
const providerAccessGuard = read("scripts/guard-provider-access-broker.mjs");
const docs = [
  read("docs/MONEY_FLOW_CONTROL_RUNBOOK.md"),
  read("docs/AUTONOMOUS_SYSTEMS_SCOPE_REGISTRY.md"),
  read("docs/CHILLYWOOD_AUTONOMOUS_APP_OPERATING_MODEL.md"),
].join("\n\n");

const corpus = [moneyOperator, providerAccessBroker, revenueCat, googlePlay, stripeConnect, stripeMerch, providerReadiness, stripeShared, docs].join("\n\n");

includes(packageJson, '"proof:provider-webhook-reliability"', "package script");
includes(packageJson, '"guard:provider-webhook-reliability"', "package script");
includes(packageJson, '"proof:provider-access-broker"', "package script");
includes(packageJson, '"proof:provider-dashboard-access-policy"', "package script");
includes(packageJson, '"guard:provider-access-broker"', "package script");

for (const required of [
  "provider_webhook_health",
  "provider_webhook_test_plan",
  "record_provider_webhook_delivery_status",
  "provider_delivery_history_readback",
  "provider_dashboard_repair_request",
  "provider_webhook_reliability_report",
  "provider_access_status",
  "provider_dashboard_readback",
  "provider_test_delivery_run",
  "watch_once",
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

for (const surface of [
  "revenuecat_webhook_delivery",
  "google_play_webhook_delivery",
  "stripe_connect_webhook_delivery",
  "stripe_merch_webhook_delivery",
  "provider_readiness_audit",
  "provider_delivery_error_rate",
  "stale_provider_dashboard_integration_detection",
  "duplicate_webhook_integration_detection",
]) {
  includes(corpus, surface, "provider reliability surface");
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
includes(providerAccessBroker, "PROVIDER_ACCESS_BROKER_ID", "provider access broker helper");
includes(providerAccessBroker, "provider_dashboard_owner_session", "provider dashboard owner session mode");
includes(providerAccessBroker, "provider_api_readonly", "provider API read-only mode");
includes(providerAccessGuard, "provider access can print secrets", "provider access guard secret print check");
includes(moneyOperator, "classifyProviderDeliveryErrorRate", "provider error-rate classifier");
includes(moneyOperator, "providerSyncStatusForClassification", "provider error-rate status mapping");
includes(moneyOperator, "duplicate_webhook_integration_detection", "duplicate dashboard integration detection");
includes(moneyOperator, "stale_provider_dashboard_integration_detection", "stale dashboard integration detection");
includes(moneyOperator, "revenuecat_mediated_or_readiness_only", "Google Play source-of-truth classification");
includes(moneyGuard, "manual Premium grant", "money guard Premium block");
includes(moneyLoopProof, "100 percent error rate outage classification", "provider reliability loop proof");
includes(docs, "Provider Webhook Reliability", "docs provider webhook monitoring");
includes(packageJson, '"proof:money-provider-reliability-loop"', "package script");
includes(packageJson, '"money-operator:watch-once"', "package script");
includes(packageJson, '"money-operator:provider-health"', "package script");
includes(packageJson, '"money-operator:access-status"', "package script");
includes(packageJson, '"money-operator:provider-dashboard-readback"', "package script");
includes(packageJson, '"money-operator:report"', "package script");

matches(moneyOperator, /PROVIDER_WEBHOOKS[\s\S]*requiredSecretNames[\s\S]*REVENUECAT_WEBHOOK_SECRET[\s\S]*GOOGLE_PLAY_WEBHOOK_SECRET[\s\S]*STRIPE_WEBHOOK_SECRET/, "secret names listed by name only");
matches(moneyOperator, /syncStatus === "failed" \|\| syncStatus === "blocked"[\s\S]*recordProviderFinding/, "100 percent and failed provider delivery must create findings");
matches(moneyOperator, /dashboardIssues\.ownerActionRequired[\s\S]*createApprovalRequest/, "dashboard repair must create approval request");
notMatches(corpus, /\bstripe\.(payouts|transfers|charges|checkout|paymentLinks|invoices)\.create\b/i, "provider webhook reliability can create money movement");
notMatches(corpus, /grantPremium|manualPremium|editPremiumEntitlement|markPayoutPaid|releasePayout|createTransfer|createPaymentLink|createInvoice|chargeCustomer|enableCashout/i, "provider webhook reliability exposes forbidden imperative action");
notMatches(corpus, /(STRIPE_SECRET_KEY|STRIPE_WEBHOOK_SECRET|REVENUECAT_WEBHOOK_SECRET|GOOGLE_PLAY_WEBHOOK_SECRET|MONEY_OPERATOR_TOKEN_SHA256)\s*[:=]\s*['\"][^'\"$]/, "secret value committed");

if (failures.length) {
  console.error("Provider webhook reliability guard failed:");
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log("Provider webhook reliability guard passed.");
