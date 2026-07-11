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

const confirmation = read("_lib/moneyExternalConfirmation.ts");
const helper = read("_lib/moneyFlowControl.ts");
const functionSource = read("supabase/functions/money-operator/index.ts");
const moneyRunbook = read("docs/MONEY_FLOW_CONTROL_RUNBOOK.md");
const registryDoc = read("docs/AUTONOMOUS_SYSTEMS_SCOPE_REGISTRY.md");
const packageJson = read("package.json");

for (const source of [
  "stripe_transfer_readback",
  "stripe_payout_readback",
  "stripe_charge_readback",
  "google_play_receipt_readback",
  "revenuecat_customer_info_readback",
  "signed_provider_webhook_verification",
  "payout_provider_transfer_id_readback",
  "owner_attested_manual_external_confirmation",
]) {
  includes(confirmation, source, "external confirmation source");
}

for (const requiredRule of [
  "external_provider_confirmation_required",
  "provider_reference_readback_required",
  "confirmation_checked_at_required",
  "test_mode_confirmation_cannot_satisfy_production",
  "owner_attested_manual_confirmation_must_be_explicitly_marked",
]) {
  includes(confirmation, requiredRule, "external confirmation validation");
}

includes(helper, "assertExternalConfirmationForLevel4", "money helper Level 4 assertion");
includes(helper, "validateMoneyExternalConfirmation", "money helper external confirmation import");
includes(helper, "external_provider_confirmation_required_for_level_4", "money helper confirmation label");
includes(functionSource, "external_confirmation_required", "operator records confirmation requirement");
includes(functionSource, "external_confirmation_status", "operator records confirmation status");
includes(functionSource, "blocked_pending_owner_scope_and_external_confirmation", "operator blocks unconfirmed money action");
includes(moneyRunbook, "external provider confirmation", "money runbook confirmation policy");
includes(registryDoc, "external provider confirmation", "registry doc confirmation policy");
includes(packageJson, '"proof:money-external-confirmation"', "package script");

matches(confirmation, /approvalLevel < 4[\s\S]*required:\s*false/, "Level 0-3 does not require external confirmation");
matches(confirmation, /approvalLevel[\s\S]*4[\s\S]*!confirmation[\s\S]*external_provider_confirmation_required/, "Level 4 requires confirmation");
matches(confirmation, /environmentMode === "production"[\s\S]*providerMode !== "production"[\s\S]*test_mode_confirmation_cannot_satisfy_production/, "test-mode cannot satisfy production");

notMatches(functionSource, /\bstripe\.(payouts|transfers|charges|checkout|paymentLinks|invoices)\.create\b/i, "external confirmation helper triggers provider money movement");
notMatches(confirmation, /(STRIPE_SECRET_KEY|STRIPE_WEBHOOK_SECRET|REVENUECAT_API_KEY|GOOGLE_PLAY_SERVICE_ACCOUNT|SERVICE_ROLE_KEY|SUPABASE_SERVICE_ROLE|R2_SECRET|CLOUDFLARE_API_TOKEN)/, "confirmation helper references secrets");

if (failures.length) {
  console.error("Money external confirmation proof failed:");
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log(JSON.stringify({
  ok: true,
  proof: "money-external-confirmation",
  level4RequiresExternalConfirmation: true,
  testModeCanSatisfyProduction: false,
  realMoneyMovementExecuted: false,
}, null, 2));
