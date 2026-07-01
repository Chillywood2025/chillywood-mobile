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
const purchaseFlows = [
  "maestro/monetization/monetization-tip-smoke.yaml",
  "maestro/monetization/monetization-paid-video-smoke.yaml",
  "maestro/monetization/monetization-watch-party-ticket-smoke.yaml",
  "maestro/monetization/monetization-event-pass-smoke.yaml",
  "maestro/monetization/monetization-platform-subscription-smoke.yaml",
  "maestro/monetization/monetization-vip-smoke.yaml",
];

for (const file of [...files, ...purchaseFlows]) {
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
assertIncludes(runner, "purchaseFlowViewerEnv", "assigned purchase viewer env map");
assertIncludes(runner, "one_purchase_flow_per_strict_sandbox_run", "one strict purchase flow per run guard");
assertIncludes(runner, "CHILLYWOOD_E2E_VIEWER_02_EMAIL", "paid video viewer assignment");
assertIncludes(runner, "CHILLYWOOD_E2E_VIEWER_06_PASSWORD", "VIP viewer assignment");
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
assertIncludes(flowMap, "Watch-Party Seat Pass pre:", "Watch-Party Seat Pass pre/post gates");
assertIncludes(flowMap, "Event Pass pre:", "Event Pass pre/post gates");
assertIncludes(flowMap, "Platform Subscription pre:", "Platform Subscription pre/post gates");
assertIncludes(flowMap, "VIP pre:", "VIP pre/post gates");
assertIncludes(flowMap, "PROVIDER_OWNERSHIP_REUSE_BLOCKER", "provider ownership blocker");
assertIncludes(packageJson, "guard:browserstack-sandbox-purchase-safety", "package script");

for (const file of purchaseFlows) {
  const flow = read(file);
  const loginIndex = flow.indexOf('openLink: "chillywoodmobile://login"');
  const routeIndex = flow.indexOf('openLink: "chillywoodmobile://channel/${CHILLYWOOD_E2E_CREATOR_ID}"');
  if (loginIndex < 0) fail(`${file} missing login deep link`);
  if (routeIndex < 0) fail(`${file} missing creator route deep link`);
  if (loginIndex > routeIndex) fail(`${file} opens creator route before login`);
  [
    "auth-login-email-input",
    "auth-login-password-input",
    "auth-login-submit-button",
    "auth-logged-in-home",
    "${CHILLYWOOD_E2E_VIEWER_EMAIL}",
    "${CHILLYWOOD_E2E_VIEWER_PASSWORD}",
  ].forEach((needle) => assertIncludes(flow, needle, file));
  assertNotIncludes(flow, "tapOn: { point", `${file} coordinate taps`);
  assertNotIncludes(flow, "point:", `${file} coordinate taps`);
}

const secretPattern = /(BROWSERSTACK_ACCESS_KEY|SUPABASE_SERVICE_ROLE_KEY|CHILLYWOOD_E2E_[A-Z0-9_]*PASSWORD)=([^\s"']{8,}|"[^".][^"]{7,}"|'[^'.][^']{7,}')/;
for (const file of files.filter((item) => item.endsWith(".md"))) {
  if (secretPattern.test(read(file))) fail(`secret assignment pattern in ${file}`);
}

console.log("BrowserStack sandbox purchase safety guard passed.");
