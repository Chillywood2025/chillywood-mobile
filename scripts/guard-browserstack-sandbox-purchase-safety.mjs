#!/usr/bin/env node

import { existsSync, readFileSync } from "node:fs";

const fail = (message) => {
  console.error(`BrowserStack sandbox purchase safety guard failed: ${message}`);
  process.exit(1);
};
const read = (file) => readFileSync(file, "utf8");
const assertIncludes = (source, needle, label) => {
  if (!source.includes(needle)) fail(`${label} missing ${needle}`);
};
const assertNotIncludes = (source, needle, label) => {
  if (source.includes(needle)) fail(`${label} must not include ${needle}`);
};

const files = [
  "scripts/qa/run-browserstack-maestro.mjs",
  "qa/browserstack/codex-repair-loop-policy.md",
  "qa/browserstack/manual-app-live-monetization-checklist.md",
  "qa/browserstack/monetization-e2e-flow-map.md",
  "qa/browserstack/runbook-android.md",
  "qa/BIG_APP_COMPANY_TEST_COVERAGE.md",
];

for (const file of files) {
  if (!existsSync(file)) fail(`missing required file ${file}`);
}

const runner = read("scripts/qa/run-browserstack-maestro.mjs");
const policy = read("qa/browserstack/codex-repair-loop-policy.md");
const checklist = read("qa/browserstack/manual-app-live-monetization-checklist.md");
const flowMap = read("qa/browserstack/monetization-e2e-flow-map.md");
const runbook = read("qa/browserstack/runbook-android.md");
const coverage = read("qa/BIG_APP_COMPANY_TEST_COVERAGE.md");
const docs = `${policy}\n${checklist}\n${flowMap}\n${runbook}\n${coverage}`;
const packageJson = read("package.json");

assertIncludes(runner, "purchase_flow_requested", "default purchase guard");
assertIncludes(runner, "--manual-assisted-purchase", "manual-assisted mode");
assertIncludes(runner, "--auto-confirm-sandbox-purchase", "strict sandbox opt-in mode");
assertIncludes(runner, "autoConfirmSandboxPurchase: false", "strict sandbox default false");
assertIncludes(runner, "SANDBOX_PURCHASE_SHEET_VERIFIED", "sandbox sheet verified classification");
assertIncludes(runner, "HUMAN_REQUIRED_GOOGLE_PLAY_CONFIRMATION", "human-required classification");
assertIncludes(runner, "FAIL_CLOSED_UNSAFE_PURCHASE_SHEET", "unsafe sheet classification");
assertIncludes(runner, "FAIL_CLOSED_UNKNOWN_PURCHASE_ACCOUNT", "unknown account classification");
assertIncludes(runner, "FAIL_CLOSED_REAL_PAYMENT_RISK", "real payment risk classification");
assertIncludes(runner, "Test card", "test card language");
assertIncludes(runner, "Test instrument", "test instrument language");
assertIncludes(runner, "Test purchase", "test purchase language");
assertIncludes(runner, "This is a test", "this is a test language");
assertIncludes(runner, "Google Play test", "Google Play test language");
assertIncludes(runner, "productionPurchaseIntents", "production purchase intent readback");
assertIncludes(runner, "payableLedgerEvents", "payable ledger readback");
assertIncludes(runner, "not_payable", "not-payable fixture check");
assertIncludes(runner, "payout_enabled", "payout-disabled fixture check");
assertIncludes(runner, "production_enabled", "production-disabled fixture check");
assertNotIncludes(runner, "tapOn: { point", "runner coordinate taps");
assertNotIncludes(runner, "point:", "runner coordinate taps");

[
  "test/sandbox wording",
  "expected tester account",
  "expected product",
  "live money off",
  "payout false",
  "not_payable",
  "post-purchase backend readback",
  "no unrelated unlocks",
  "Fake purchase completion is forbidden",
  "coordinate taps",
  "not the default",
].forEach((needle) => assertIncludes(docs, needle, "sandbox purchase safety docs"));

assertIncludes(flowMap, "Tip pre:", "Tip pre/post gates");
assertIncludes(flowMap, "Paid Video pre:", "Paid Video pre/post gates");
assertIncludes(flowMap, "Watch-Party Ticket pre:", "Watch-Party Ticket pre/post gates");
assertIncludes(flowMap, "Event Pass pre:", "Event Pass pre/post gates");
assertIncludes(flowMap, "Platform Subscription pre:", "Platform Subscription pre/post gates");
assertIncludes(flowMap, "VIP pre:", "VIP pre/post gates");
assertIncludes(flowMap, "PROVIDER_OWNERSHIP_REUSE_BLOCKER", "provider ownership blocker");
assertIncludes(packageJson, "guard:browserstack-sandbox-purchase-safety", "package script");

const secretPattern = /(BROWSERSTACK_ACCESS_KEY|SUPABASE_SERVICE_ROLE_KEY|CHILLYWOOD_E2E_[A-Z0-9_]*PASSWORD)=([^\s"']{8,}|"[^".][^"]{7,}"|'[^'.][^']{7,}')/;
for (const file of files.filter((item) => item.endsWith(".md"))) {
  if (secretPattern.test(read(file))) fail(`secret assignment pattern in ${file}`);
}

console.log("BrowserStack sandbox purchase safety guard passed.");
