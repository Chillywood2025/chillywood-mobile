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
const notMatches = (source, pattern, label) => {
  if (pattern.test(source)) fail(label);
};
const matches = (source, pattern, label) => {
  if (!pattern.test(source)) fail(`${label} must match ${pattern}`);
};

const helper = read("_lib/moneyFlowControl.ts");
const registry = read("_lib/autonomousSystemsRegistry.ts");
const admin = read("app/admin.tsx");
const packageJson = read("package.json");
const registryDoc = read("docs/AUTONOMOUS_SYSTEMS_SCOPE_REGISTRY.md");
const moneyRunbook = read("docs/MONEY_FLOW_CONTROL_RUNBOOK.md");
const operatingModel = read("docs/CHILLYWOOD_AUTONOMOUS_APP_OPERATING_MODEL.md");
const ownerAdminSpec = read("docs/owner-admin-rachi-implementation-spec.md");

const docs = [registryDoc, moneyRunbook, operatingModel, ownerAdminSpec].join("\n\n");
const source = [helper, registry, admin, docs].join("\n\n");
const runtimeMoneySource = [helper, registry, admin, moneyRunbook, operatingModel].join("\n\n");
const lowerDocs = docs.toLowerCase();

includes(packageJson, '"guard:money-flow-control"', "package script");
includes(packageJson, '"proof:money-flow-control"', "package script");
includes(registry, 'id: "money_flow_control"', "autonomous registry");
includes(registry, "foundation_readonly_guarded", "money registry status");
includes(registry, "owner/super-admin approval for Level 3", "Level 3 registry gate");
includes(registry, "owner/super-admin approval plus external provider confirmation for Level 4", "Level 4 registry gate");
includes(helper, "unknown_money_action_defaults_level_4", "money helper default posture");
includes(helper, "manual_premium_grant_forbidden", "manual Premium grant block");
includes(helper, "fake_revenue_forbidden", "fake revenue block");
includes(helper, "fake_creator_earnings_forbidden", "fake earnings block");
includes(helper, "fake_payable_balance_forbidden", "fake payable balance block");
includes(helper, "external_provider_confirmation_required_for_level_4", "provider confirmation block");

for (const testId of [
  "admin-money-flow-control-section",
  "money-flow-control-readonly-status",
  "money-flow-control-approval-required",
  "money-flow-control-external-confirmation-required",
  "money-flow-control-blocked-actions",
  "money-flow-control-proof-status",
]) {
  includes(admin, testId, "Admin Money Flow Control section");
}

for (const requiredDoc of [
  "read-only reconciliation can be autonomous",
  "real money mutation requires Level 3/4",
  "real money movement requires Level 4",
  "external provider confirmation",
  "no manual Premium grant",
  "no fake revenue",
  "no fake creator earnings",
  "no fake payable balance",
  "Rachi can recommend/request, not approve",
]) {
  includes(lowerDocs, requiredDoc.toLowerCase(), "money control docs");
}

matches(registry, /id:\s*"production_money_setup_or_policy_mutation"[\s\S]*approvalLevel:\s*3[\s\S]*ownerApprovalRequired:\s*true/, "production money setup Level 3");
matches(registry, /id:\s*"real_money_movement_or_public_money_launch"[\s\S]*approvalLevel:\s*4[\s\S]*ownerApprovalRequired:\s*true/, "real money movement Level 4");
matches(helper, /MONEY_FLOW_LEVEL_4_ACTIONS[\s\S]*"real_payout"[\s\S]*"real_transfer"[\s\S]*"real_cashout"/, "real money actions Level 4");
matches(helper, /MONEY_FLOW_FORBIDDEN_ACTIONS[\s\S]*"manual_premium_grant"[\s\S]*"fake_revenue"[\s\S]*"fake_creator_earnings"[\s\S]*"fake_payable_balance"/, "forbidden fake/manual actions");

notMatches(admin, /testID=["'][^"']*(release|process|execute|send|mark-paid|grant-premium|cashout)[^"']*["'][\s\S]{0,240}onPress=/i, "Admin exposes active money mutation testID with onPress");
notMatches(admin, /onPress=\{[^}]*\b(releasePayout|processPayout|createPayout|markPayoutPaid|markPaid|grantPremium|manualPremium|createCheckout|createPaymentLink|createInvoice|createTransfer|sendMoney|enableCashout)\b/i, "Admin exposes active payout/charge/manual Premium handler");
notMatches(admin, /(?:Release Payout|Process Batch|Mark Paid|Send Money|Grant Premium|Manual Premium Grant|Create Checkout|Create Payment Link|Create Invoice|Create Transfer)[\s\S]{0,240}onPress=/i, "Admin exposes active money mutation copy with onPress");

notMatches(helper, /approvalLevel:\s*[012][\s\S]{0,200}(real_payout|real_transfer|real_cashout|real_customer_charge|production_stripe_mode_switch)/i, "real money action downgraded below Level 3");
notMatches(runtimeMoneySource, /fake (?:MRR|ARR|creator earnings|payable balance|paid status).{0,80}(?:allowed|enabled|active|live)(?![^.]*\bforbidden\b)/i, "fake money state allowed");
notMatches(runtimeMoneySource, /manual Premium grant.{0,80}(?:allowed|enabled|active|live)(?![^.]*\bforbidden\b)/i, "manual Premium grant allowed");
notMatches(runtimeMoneySource, /test[- ]mode.{0,80}(?:is|now|equals).{0,80}production/i, "test-mode provider data claimed production");
notMatches([helper, admin, moneyRunbook].join("\n\n"), /\b(STRIPE_SECRET_KEY|STRIPE_WEBHOOK_SECRET|REVENUECAT_API_KEY|GOOGLE_PLAY_SERVICE_ACCOUNT|SERVICE_ROLE_KEY|SUPABASE_SERVICE_ROLE|R2_SECRET|CLOUDFLARE_API_TOKEN)\b/, "provider/service secret reference in money control source/docs");

if (failures.length) {
  console.error("Money Flow Control guard failed:");
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log("Money Flow Control guard passed.");
