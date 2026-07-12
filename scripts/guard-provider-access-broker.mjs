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
const operator = read("supabase/functions/money-operator/index.ts");
const migration = read("supabase/migrations/20260712013340_provider_access_broker.sql");
const admin = read("app/admin.tsx");
const packageJson = read("package.json");
const registry = read("_lib/autonomousSystemsRegistry.ts");
const runbook = read("docs/MONEY_FLOW_CONTROL_RUNBOOK.md");
const providerGuard = read("scripts/guard-provider-webhook-reliability.mjs");
const moneyGuard = read("scripts/guard-money-flow-control.mjs");

const corpus = [broker, operator, migration, admin, registry, runbook, providerGuard, moneyGuard].join("\n\n");
const implementationCorpus = [broker, operator, migration, admin, registry, runbook].join("\n\n");

for (const required of [
  "Provider Access Broker",
  "provider_access_status",
  "provider_access_probe",
  "provider_dashboard_readback",
  "provider_test_delivery_plan",
  "provider_test_delivery_run",
  "provider_repair_request",
  "provider_access_report",
  "provider_access_capabilities",
  "provider_access_audit_events",
  "provider_dashboard_repair_requests",
]) {
  includes(corpus, required, "Provider Access Broker contract");
}

for (const provider of ["revenuecat", "google_play", "stripe_connect", "stripe_merch"]) {
  includes(corpus, provider, "provider access coverage");
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

for (const script of [
  "proof:provider-access-broker",
  "proof:provider-dashboard-access-policy",
  "guard:provider-access-broker",
  "money-operator:access-status",
  "money-operator:provider-access-probe",
  "money-operator:provider-dashboard-readback",
  "money-operator:provider-test-plan",
  "money-operator:provider-test-run",
  "money-operator:provider-repair-request",
]) {
  includes(packageJson, `"${script}"`, "package script");
}

matches(migration, /alter table public\.provider_access_capabilities enable row level security/i, "provider access capabilities RLS");
matches(migration, /alter table public\.provider_access_audit_events enable row level security/i, "provider access audit RLS");
matches(migration, /alter table public\.provider_dashboard_repair_requests enable row level security/i, "provider repair RLS");
matches(operator, /provider_dashboard_readback[\s\S]*provider_api_readonly/s, "provider dashboard readback read-only mode");
matches(operator, /provider_repair_request[\s\S]*pending_owner_approval/s, "provider repair approval only");
matches(operator, /provider_test_delivery_run[\s\S]*premium_manually_granted:\s*false/s, "provider TEST cannot grant Premium");

notMatches(implementationCorpus, /console\.(log|error|warn)\([^)]*(SECRET|TOKEN|WEBHOOK|SERVICE_ROLE|API_KEY|STRIPE|REVENUECAT|GOOGLE)/i, "provider access can print secrets");
notMatches(implementationCorpus, /\b(provider_dashboard_mutated|moneyMoved|money_moved)\s*[:=]\s*true\b/i, "provider access mutates dashboard or money");
notMatches(implementationCorpus, /\bstripe\.(payouts|transfers|charges|checkout|paymentLinks|invoices)\.create\b/i, "provider access creates Stripe money movement");
notMatches(implementationCorpus, /\b(stripe\.)?webhookEndpoints\.(create|update|del|delete)\b/i, "provider access mutates Stripe webhook endpoint");
notMatches(implementationCorpus, /\b(products|prices)\.(create|update|del|delete)\b/i, "provider access mutates provider products/prices");
notMatches(implementationCorpus, /manualPremiumGrant|grantPremium|editPremiumEntitlement/i, "provider access can manually grant Premium");
notMatches(implementationCorpus, /(MONEY_OPERATOR_TOKEN|STRIPE_SECRET_KEY|REVENUECAT_SECRET_API_KEY|GOOGLE_PLAY_SERVICE_ACCOUNT_JSON|WEBHOOK_SECRET)\s*[:=]\s*['"][^'"$]/, "provider access commits secret values");
notMatches(implementationCorpus, /test[-_ ]mode proof (?:satisfies production readiness|can satisfy production readiness|is production-ready)/i, "test-mode proof claimed production");
notMatches(implementationCorpus, /google_play[^.\n]{0,160}(?:failure|blocked|outage)(?![^.\n]*(RevenueCat|mediated|readiness-only|direct))/i, "Google direct absence treated as failure while RevenueCat-mediated");

if (failures.length) {
  console.error("Provider Access Broker guard failed:");
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log("Provider Access Broker guard passed.");
