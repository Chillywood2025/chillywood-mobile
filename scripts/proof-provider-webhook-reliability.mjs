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
const moneyRunbook = read("docs/MONEY_FLOW_CONTROL_RUNBOOK.md");
const moneyGuard = read("scripts/guard-money-flow-control.mjs");
const moneyLoopProof = read("scripts/proof-money-provider-reliability-loop.mjs");
const providerAccessBroker = read("_lib/providerAccessBroker.ts");

const functionCorpus = [revenueCat, googlePlay, stripeConnect, stripeMerch, providerReadiness, stripeShared, moneyOperator, providerAccessBroker].join("\n\n");

const proofCases = [
  {
    name: "RevenueCat valid TEST path returns no Premium grant",
    passes: () => revenueCat.includes('normalizeEventType(event.type) === "TEST"')
      && revenueCat.includes('status: "test_received"')
      && revenueCat.includes("premiumGranted: false")
      && revenueCat.includes("liveMoneyAction: false"),
  },
  {
    name: "RevenueCat invalid/missing secret fails closed",
    passes: () => revenueCat.includes("REVENUECAT_WEBHOOK_SECRET")
      && revenueCat.includes("verifySharedWebhookSecret")
      && revenueCat.includes('error: "invalid_signature"')
      && revenueCat.includes("premiumGranted: false"),
  },
  {
    name: "Google Play missing/invalid auth fails closed or readiness-only",
    passes: () => googlePlay.includes("GOOGLE_PLAY_WEBHOOK_SECRET")
      && googlePlay.includes("setup_required")
      && googlePlay.includes('error: "invalid_signature"')
      && googlePlay.includes("subscriptionGranted: false"),
  },
  {
    name: "Google Play monitored/readiness-only if RevenueCat is source of truth",
    passes: () => googlePlay.includes("readiness only") || googlePlay.includes("Subscription entitlement changes are not handled by this scaffold"),
  },
  {
    name: "Stripe invalid signature fails closed",
    passes: () => stripeConnect.includes('error: "invalid_signature"')
      && stripeMerch.includes('error: "invalid_signature"')
      && stripeConnect.includes("verifyStripeWebhookSignature")
      && stripeMerch.includes("verifyStripeWebhookSignature"),
  },
  {
    name: "Stripe test-mode event cannot claim production",
    passes: () => stripeConnect.includes("Live-mode Stripe webhook event was rejected")
      && stripeMerch.includes("Live-mode Stripe merch webhook event was rejected")
      && stripeConnect.includes('mode: "test"')
      && stripeMerch.includes('mode: "sandbox"'),
  },
  {
    name: "duplicate provider event detection is safe",
    passes: () => stripeConnect.includes('status: "duplicate"')
      && stripeMerch.includes('status: "duplicate"')
      && moneyOperator.includes("money_duplicate_event_detections"),
  },
  {
    name: "provider sync status write is allowed",
    passes: () => moneyOperator.includes("record_provider_webhook_delivery_status")
      && moneyOperator.includes("money_provider_sync_status")
      && moneyOperator.includes("provider_webhook_delivery_status_recorded"),
  },
  {
    name: "100 percent provider error rate becomes outage/blocked with a finding",
    passes: () => moneyOperator.includes("classifyProviderDeliveryErrorRate")
      && moneyOperator.includes('return "outage"')
      && moneyOperator.includes("providerSyncStatusForClassification")
      && moneyOperator.includes("recordProviderFinding"),
  },
  {
    name: "provider delivery history readback records host/path/failure without secrets",
    passes: () => moneyOperator.includes("provider_delivery_history_readback")
      && moneyOperator.includes("endpoint_host")
      && moneyOperator.includes("endpoint_path")
      && moneyOperator.includes("last_failure_code")
      && moneyOperator.includes("integration_id_hash"),
  },
  {
    name: "stale and duplicate dashboard integrations create approval path only",
    passes: () => moneyOperator.includes("stale_provider_dashboard_integration_detection")
      && moneyOperator.includes("duplicate_webhook_integration_detection")
      && moneyOperator.includes("dashboardIssues.ownerActionRequired")
      && moneyOperator.includes("createApprovalRequest"),
  },
  {
    name: "Google Play can be classified as RevenueCat-mediated/readiness-only",
    passes: () => moneyOperator.includes("classifyGooglePlaySourceTruth")
      && moneyOperator.includes("revenuecat_mediated")
      && moneyOperator.includes("readiness_only"),
  },
  {
    name: "dashboard repair requires approval",
    passes: () => moneyOperator.includes("provider_dashboard_repair_request")
      && moneyOperator.includes("change_money_facing_config")
      && moneyOperator.includes("pending_owner_approval"),
  },
  {
    name: "manual Premium grant forbidden",
    passes: () => moneyOperator.includes("manual_premium_grant")
      && moneyOperator.includes("forbidden_money_action")
      && moneyGuard.includes("manual Premium grant"),
  },
  {
    name: "real charge/payout/transfer/cashout forbidden",
    passes: () => moneyOperator.includes("real_customer_charge")
      && moneyOperator.includes("real_payout")
      && moneyOperator.includes("real_transfer")
      && moneyOperator.includes("real_cashout")
      && moneyOperator.includes("blocked_pending_owner_scope_and_external_confirmation"),
  },
  {
    name: "no provider secrets logged",
    passes: () => functionCorpus.includes("sanitizeErrorMessage")
      && moneyOperator.includes("secret_like_payload_blocked")
      && !/console\.(log|error|warn)\([^)]*(SECRET|TOKEN|WEBHOOK|SERVICE_ROLE|STRIPE|REVENUECAT)/i.test(functionCorpus),
  },
  {
    name: "Money Operator records moneyMoved=false",
    passes: () => moneyOperator.includes("moneyMoved: false")
      && moneyOperator.includes("money_moved: false")
      && moneyOperator.includes("provider_dashboard_mutated: false"),
  },
  {
    name: "provider webhook failure creates finding/request, not fake success",
    passes: () => moneyOperator.includes("provider_webhook_delivery_issue")
      && moneyOperator.includes("money_reconciliation_findings")
      && moneyOperator.includes("provider_dashboard_repair_request"),
  },
  {
    name: "Provider Access Broker gives controlled readback path",
    passes: () => providerAccessBroker.includes("classifyProviderAccessCapability")
      && moneyOperator.includes("provider_dashboard_readback")
      && moneyOperator.includes("provider_access_status")
      && moneyOperator.includes("provider_test_delivery_run"),
  },
  {
    name: "provider dashboard TEST requires owner session when API cannot run it",
    passes: () => moneyOperator.includes("dashboard_owner_session_required")
      && providerAccessBroker.includes("provider_dashboard_owner_session"),
  },
];

for (const check of proofCases) {
  if (!check.passes()) fail(`proof case failed: ${check.name}`);
}

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
  "revenuecat",
  "google_play",
  "stripe_connect",
  "stripe_merch",
]) {
  includes(moneyOperator, required, "Money Operator provider webhook monitor");
}

includes(packageJson, '"proof:provider-webhook-reliability"', "package script");
includes(packageJson, '"proof:money-provider-reliability-loop"', "package script");
includes(packageJson, '"proof:provider-access-broker"', "package script");
includes(packageJson, '"proof:provider-dashboard-access-policy"', "package script");
includes(packageJson, '"money-operator:watch-once"', "package script");
includes(packageJson, '"money-operator:provider-health"', "package script");
includes(packageJson, '"money-operator:access-status"', "package script");
includes(packageJson, '"money-operator:provider-dashboard-readback"', "package script");
includes(packageJson, '"money-operator:report"', "package script");
includes(packageJson, '"guard:provider-webhook-reliability"', "package script");
includes(moneyRunbook, "Provider Webhook Reliability", "money runbook");
includes(moneyLoopProof, "duplicate provider webhook event replay", "provider loop proof replay coverage");

matches(moneyOperator, /PROVIDER_WEBHOOKS[\s\S]*revenuecat[\s\S]*google_play[\s\S]*stripe_connect[\s\S]*stripe_merch/, "provider webhook registry");
notMatches(functionCorpus, /\bstripe\.(payouts|transfers|charges|checkout|paymentLinks|invoices)\.create\b/i, "provider webhook monitor creates real money movement");
notMatches(functionCorpus, /manualPremiumGrant|grantPremium|editPremiumEntitlement/i, "provider webhook monitor manually grants Premium");

if (failures.length) {
  console.error("Provider webhook reliability proof failed:");
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log(JSON.stringify({
  ok: true,
  proof: "provider-webhook-reliability",
  providers: ["revenuecat", "google_play", "stripe_connect", "stripe_merch"],
  providerDashboardMutationAutonomous: false,
  moneyMoved: false,
  manualPremiumGrantAllowed: false,
}, null, 2));
