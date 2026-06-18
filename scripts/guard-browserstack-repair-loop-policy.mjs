#!/usr/bin/env node

import { existsSync, readFileSync } from "node:fs";

const read = (file) => readFileSync(file, "utf8");
const fail = (message) => {
  console.error(`BrowserStack repair-loop policy guard failed: ${message}`);
  process.exit(1);
};
const assertIncludes = (source, needle, label) => {
  if (!source.includes(needle)) fail(`${label} missing ${needle}`);
};
const assertNotIncludes = (source, needle, label) => {
  if (source.includes(needle)) fail(`${label} must not include ${needle}`);
};

const requiredFiles = [
  "qa/browserstack/codex-repair-loop-policy.md",
  "scripts/qa/browserstack-repair-loop.mjs",
  "qa/browserstack/runbook-android.md",
  "qa/browserstack/manual-app-live-monetization-checklist.md",
  "qa/browserstack/monetization-e2e-flow-map.md",
  "qa/BIG_APP_COMPANY_TEST_COVERAGE.md",
];

for (const file of requiredFiles) {
  if (!existsSync(file)) fail(`missing required file ${file}`);
}

const policy = read("qa/browserstack/codex-repair-loop-policy.md");
const repairLoop = read("scripts/qa/browserstack-repair-loop.mjs");
const runner = read("scripts/qa/run-browserstack-maestro.mjs");
const runbook = read("qa/browserstack/runbook-android.md");
const manual = read("qa/browserstack/manual-app-live-monetization-checklist.md");
const flowMap = read("qa/browserstack/monetization-e2e-flow-map.md");
const coverage = read("qa/BIG_APP_COMPANY_TEST_COVERAGE.md");
const packageJson = read("package.json");

[
  "Auto-Fix Allowed",
  "Ask/Stop Required",
  "Block/Fail Closed",
  "Google Play purchase confirmation",
  "live money or payout behavior",
  "RLS/security policy",
  "LiveKit/host/publish authority",
].forEach((needle) => assertIncludes(policy, needle, "policy doc"));

["AUTO_FIX_ALLOWED", "HUMAN_REQUIRED", "FAIL_CLOSED"].forEach((needle) => {
  assertIncludes(repairLoop, needle, "repair loop runner");
});

assertIncludes(runner, "purchase_flow_requested", "App Automate purchase guard");
assertIncludes(runner, "--manual-assisted-purchase", "manual-assisted purchase mode");
assertIncludes(runner, "HUMAN_REQUIRED_GOOGLE_PLAY_CONFIRMATION", "manual-assisted human stop");
assertNotIncludes(runner, "tapOn: { point", "runner coordinate taps");
assertNotIncludes(repairLoop, "tapOn: { point", "repair loop coordinate taps");

[
  "purchase confirmation is human-required",
  "Do not weaken live money, payouts, Premium gates, RLS, LiveKit authority, Watch-Party shared player, or Chi'lly Chat",
  "rerun only the failed flow",
].forEach((needle) => assertIncludes(runbook, needle, "runbook"));

[
  "Google Play purchase confirmation is human-required",
  "No coordinate taps",
  "post-purchase app state and backend readback",
].forEach((needle) => assertIncludes(manual, needle, "manual checklist"));

assertIncludes(flowMap, "Manual-assisted Google Play confirmation is human-required", "flow map manual boundary");
assertIncludes(coverage, "Codex repair loop", "big-app coverage repair loop");
assertIncludes(packageJson, "guard:browserstack-repair-loop-policy", "package script");

const secretPattern = /(BROWSERSTACK_ACCESS_KEY|SUPABASE_SERVICE_ROLE_KEY|CHILLYWOOD_E2E_[A-Z0-9_]*PASSWORD)=([^\s"']{8,}|"[^".][^"]{7,}"|'[^'.][^']{7,}')/;
for (const file of requiredFiles) {
  const text = read(file);
  if (secretPattern.test(text)) fail(`secret assignment pattern in ${file}`);
}

console.log("BrowserStack repair-loop policy guard passed.");
