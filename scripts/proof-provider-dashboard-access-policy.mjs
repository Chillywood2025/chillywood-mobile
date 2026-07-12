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
const registry = read("_lib/autonomousSystemsRegistry.ts");
const migration = read("supabase/migrations/20260712013340_provider_access_broker.sql");
const runbook = read("docs/MONEY_FLOW_CONTROL_RUNBOOK.md");
const packageJson = read("package.json");

const corpus = [broker, operator, registry, migration, runbook].join("\n\n");

const cases = [
  ["missing token fails closed", () => operator.includes("money_operator_token_required") && packageJson.includes("money-operator:access-status")],
  ["provider secrets are never emitted", () => operator.includes("secret_values_returned: false") && migration.includes("no_secret_metadata")],
  ["RevenueCat API read-only access is modeled", () => operator.includes("revenueCatWebhookIntegrationReadback") && broker.includes("provider_api_readonly")],
  ["RevenueCat dashboard TEST via owner session is classified", () => operator.includes("provider_dashboard_owner_session_available") && operator.includes("dashboard_owner_session_required")],
  ["dashboard mutation creates approval request", () => operator.includes("provider_repair_request") && operator.includes("pending_owner_approval") && operator.includes("createApprovalRequest")],
  ["Google Play RevenueCat-mediated mode does not block entitlement path", () => broker.includes("revenuecat_mediated_unless_direct_google_notifications_enabled") && operator.includes("classifyGooglePlaySourceTruth")],
  ["Stripe test-mode readback cannot satisfy live-mode", () => broker.includes("stripe_connect_test_and_live_separated") && runbook.includes("test-mode proof cannot satisfy production readiness")],
  ["Stripe live mutation requires approval", () => broker.includes("provider_live_mutation_requires_approval") && broker.includes("Stripe live-mode switch")],
  ["duplicate/stale webhook integration detection writes finding", () => operator.includes("duplicate_webhook_integration_detection") && operator.includes("stale_provider_dashboard_integration_detection") && operator.includes("recordProviderFinding")],
  ["provider repair request creates approval request", () => operator.includes("provider_dashboard_repair_requests") && operator.includes("autonomous_approval_requests")],
  ["manual Premium grant forbidden", () => corpus.includes("manual Premium grant") && !/manualPremiumGrant\(/.test(corpus)],
  ["real money movement forbidden", () => corpus.includes("real charge") && corpus.includes("real payout") && corpus.includes("real transfer") && !/stripe\.(payouts|transfers|charges|checkout|paymentLinks|invoices)\.create/i.test(corpus)],
  ["provider product change forbidden", () => corpus.includes("provider product changes") && !/products\.update|prices\.update|products\.create|prices\.create/i.test(corpus)],
  ["secret rotation requires approval", () => runbook.includes("secret rotation") && runbook.includes("approval")],
  ["moneyMoved=false for access broker writes", () => operator.includes("moneyMoved: false") && migration.includes("money_moved boolean not null default false")],
];

for (const [name, passes] of cases) {
  if (!passes()) fail(`proof case failed: ${name}`);
}

for (const script of [
  "proof:provider-access-broker",
  "proof:provider-dashboard-access-policy",
  "guard:provider-access-broker",
]) {
  includes(packageJson, `"${script}"`, "package script");
}

matches(operator, /provider_dashboard_readback[\s\S]*provider_api_readonly/s, "provider dashboard readback reports provider API read-only mode");
matches(operator, /provider_test_delivery_run[\s\S]*premium_manually_granted:\s*false/s, "TEST delivery cannot grant Premium");
matches(operator, /provider_dashboard_mutated:\s*false/s, "provider dashboard mutation false");
notMatches(corpus, /(MONEY_OPERATOR_TOKEN|STRIPE_SECRET_KEY|REVENUECAT_SECRET_API_KEY|GOOGLE_PLAY_SERVICE_ACCOUNT_JSON)\s*[:=]\s*['"][^'"$]/, "secret value committed");

if (failures.length) {
  console.error("Provider dashboard access policy proof failed:");
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log(JSON.stringify({
  ok: true,
  proof: "provider-dashboard-access-policy",
  dashboardMutationRequiresApproval: true,
  moneyMoved: false,
  manualPremiumGrantAllowed: false,
}, null, 2));
