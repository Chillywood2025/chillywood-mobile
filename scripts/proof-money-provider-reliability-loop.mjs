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

const helper = read("_lib/moneyFlowControl.ts");
const registry = read("_lib/autonomousSystemsRegistry.ts");
const operator = read("supabase/functions/money-operator/index.ts");
const admin = read("app/admin.tsx");
const packageJson = read("package.json");
const cli = read("scripts/money-operator-cli.mjs");
const runbook = read("docs/MONEY_FLOW_CONTROL_RUNBOOK.md");
const providerAccessBroker = read("_lib/providerAccessBroker.ts");

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
  includes(helper, surface, "money helper provider reliability surface");
  includes(registry, surface, "autonomous registry provider reliability surface");
}

for (const action of [
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
]) {
  includes(operator, `action === "${action}"`, "money operator reliability action");
}

for (const script of [
  '"money-operator:watch-once"',
  '"money-operator:provider-health"',
  '"money-operator:access-status"',
  '"money-operator:provider-dashboard-readback"',
  '"money-operator:provider-test-plan"',
  '"money-operator:report"',
  '"proof:money-provider-reliability-loop"',
  '"proof:provider-webhook-reliability"',
  '"guard:provider-webhook-reliability"',
]) {
  includes(packageJson, script, "package script");
}

for (const required of [
  "classifyProviderDeliveryErrorRate",
  "providerSyncStatusForClassification",
  "outage",
  "blocked",
  "provider_webhook_delivery_issue",
  "money_reconciliation_findings",
  "provider_delivery_history_readback",
  "provider_dashboard_repair_request",
  "duplicate_webhook_integration_detection",
  "stale_provider_dashboard_integration_detection",
  "premium_stale_readback_detection",
  "revenuecat_mediated_or_readiness_only",
  "test-mode provider proof cannot satisfy production readiness",
]) {
  includes(operator + helper + registry + runbook, required, "provider reliability loop");
}

for (const testId of [
  "money-provider-webhook-health-by-provider",
  "money-provider-webhook-last-success-failure",
  "money-provider-webhook-error-rate-classification",
  "money-provider-webhook-owner-action",
  "money-provider-webhook-approval-request",
]) {
  includes(admin, testId, "Admin Money Center provider reliability testID");
}

includes(cli, "x-money-operator-token", "money operator CLI token header");
includes(cli, "not_configured_fail_closed", "money operator CLI fail-closed behavior");
includes(operator + runbook, "duplicate provider webhook event replay", "duplicate provider webhook event replay coverage");
includes(providerAccessBroker, "Provider Access Broker", "Provider Access Broker source");
includes(providerAccessBroker, "provider_api_readonly", "provider API read-only mode");
includes(providerAccessBroker, "provider_dashboard_owner_session", "provider dashboard owner session mode");
includes(operator, "provider_access_capabilities", "provider access capability writes");
includes(operator, "provider_dashboard_repair_requests", "provider dashboard repair request writes");
matches(operator, /classifyProviderDeliveryErrorRate[\s\S]*percent < 100[\s\S]*return "outage"/, "100 percent error rate outage classification");
matches(operator, /syncStatus === "failed" \|\| syncStatus === "blocked"[\s\S]*recordProviderFinding/, "failed/blocked delivery must create finding");
matches(operator, /dashboardIssues\.ownerActionRequired[\s\S]*createApprovalRequest/, "dashboard mutation must create approval request");
notMatches(operator + cli, /\bstripe\.(payouts|transfers|charges|checkout|paymentLinks|invoices)\.create\b/i, "provider loop must not create money movement");
notMatches(operator + runbook, /manualPremiumGrant|grantPremium|editPremiumEntitlement/i, "provider loop must not manually grant Premium");
notMatches(operator + runbook, /(STRIPE_SECRET_KEY|STRIPE_WEBHOOK_SECRET|REVENUECAT_WEBHOOK_SECRET|GOOGLE_PLAY_WEBHOOK_SECRET|MONEY_OPERATOR_TOKEN_SHA256)\s*[:=]\s*['\"][^'\"$]/, "provider loop must not commit secret values");

if (failures.length) {
  console.error("Money provider reliability loop proof failed:");
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log(JSON.stringify({
  ok: true,
  proof: "money-provider-reliability-loop",
  surfaces: 8,
  continuousAction: "watch_once",
  providerDashboardMutationAutonomous: false,
  moneyMoved: false,
}, null, 2));
