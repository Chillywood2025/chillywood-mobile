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

const broker = read("_lib/providerAccessBroker.ts");
const moneyOperator = read("supabase/functions/money-operator/index.ts");
const cli = read("scripts/money-operator-cli.mjs");
const migration = read("supabase/migrations/20260712013340_provider_access_broker.sql");
const admin = read("app/admin.tsx");
const packageJson = read("package.json");
const runbook = read("docs/MONEY_FLOW_CONTROL_RUNBOOK.md");

for (const provider of ["revenuecat", "google_play", "stripe_connect", "stripe_merch"]) {
  includes(broker, provider, "Provider Access Broker provider registry");
  includes(moneyOperator, provider, "Money Operator provider access registry");
}

for (const action of [
  "provider_access_status",
  "provider_access_probe",
  "provider_dashboard_readback",
  "provider_test_delivery_plan",
  "provider_test_delivery_run",
  "provider_repair_request",
  "provider_access_report",
]) {
  includes(moneyOperator + cli + packageJson, action, "Provider Access Broker action");
}

for (const table of [
  "provider_access_capabilities",
  "provider_access_audit_events",
  "provider_dashboard_repair_requests",
]) {
  includes(migration, table, "Provider Access Broker migration");
  includes(moneyOperator, table, "Money Operator provider access write");
}

for (const testId of [
  "money-provider-access-status",
  "money-provider-access-missing-credentials",
  "money-provider-dashboard-session-required",
  "money-provider-test-delivery-status",
  "money-provider-repair-approval-request",
]) {
  includes(admin, testId, "Admin Provider Access Broker status");
}

for (const required of [
  "classifyProviderAccessCapability",
  "classifyProviderAccessRisk",
  "buildProviderAccessRequest",
  "canProviderAccessAutoRead",
  "canProviderAccessAutoRepair",
  "sanitizeProviderAccessProof",
  "provider_dashboard_owner_session",
  "provider_api_readonly",
  "provider_api_test_mode_write",
  "provider_live_mutation_requires_approval",
  "provider_dashboard_mutated: false",
  "moneyMoved: false",
]) {
  includes(broker + moneyOperator, required, "Provider Access Broker helper");
}

includes(cli, "not_configured_fail_closed", "CLI fail closed without MONEY_OPERATOR_TOKEN");
includes(cli, "MONEY_OPERATOR_TOKEN", "CLI requires Money Operator token");
includes(runbook, "Provider Access Broker", "Runbook provider access section");
matches(migration, /enable row level security[\s\S]*enable row level security[\s\S]*enable row level security/i, "provider access tables RLS enabled");
matches(migration, /money_moved boolean not null default false[\s\S]*check \(money_moved = false\)/i, "provider access audit money_moved false");
matches(moneyOperator, /provider_dashboard_readback[\s\S]*revenueCatWebhookIntegrationReadback[\s\S]*stripeWebhookEndpointReadback/s, "provider readback uses read-only provider API helpers");
matches(moneyOperator, /provider_test_delivery_run[\s\S]*dashboard_owner_session_required/s, "TEST delivery needs dashboard session when unavailable");
matches(moneyOperator, /provider_repair_request[\s\S]*pending_owner_approval/s, "provider repair request stops at approval");

notMatches(broker + moneyOperator + cli + runbook, /\bstripe\.(payouts|transfers|charges|checkout|paymentLinks|invoices)\.create\b/i, "provider access broker creates money movement");
notMatches(broker + moneyOperator + runbook, /manualPremiumGrant|grantPremium|editPremiumEntitlement/i, "provider access broker manually grants Premium");
notMatches(broker + moneyOperator + runbook, /(secret|token|password|service_role|webhook_secret|api_key)\s*[:=]\s*['"][A-Za-z0-9_./+=~:-]{12,}/i, "provider access broker commits secret-like values");
notMatches(admin, /(?:charge|payout|transfer|cashout|payment link|checkout session|manual premium grant)[\s\S]{0,240}onPress=/i, "Admin exposes money movement button");

if (failures.length) {
  console.error("Provider Access Broker proof failed:");
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log(JSON.stringify({
  ok: true,
  proof: "provider-access-broker",
  providers: ["revenuecat", "google_play", "stripe_connect", "stripe_merch"],
  providerDashboardMutationAutonomous: false,
  moneyMoved: false,
}, null, 2));
