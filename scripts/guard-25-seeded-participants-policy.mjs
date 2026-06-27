#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const failures = [];

const read = (relativePath, optional = false) => {
  const absolute = path.join(root, relativePath);
  if (!fs.existsSync(absolute)) {
    if (!optional) failures.push(`Missing required file: ${relativePath}`);
    return "";
  }
  return fs.readFileSync(absolute, "utf8");
};

const requireText = (label, content, needle) => {
  if (!content.includes(needle)) failures.push(`${label} missing required text: ${needle}`);
};

const forbid = (label, content, pattern, description) => {
  if (pattern.test(content)) failures.push(`${label} contains forbidden ${description}`);
};

const forbidPositiveSentence = (label, content, pattern, description) => {
  const allowed = /\b(?:no|not|did not|do not|must not|without|only|refusing|blocked|missing|OFF|manual\/external|not claimed|not used)\b/i;
  const hit = content
    .split(/(?<=[.\n])\s+/)
    .map((sentence) => sentence.trim())
    .filter(Boolean)
    .find((sentence) => pattern.test(sentence) && !allowed.test(sentence));
  if (hit) failures.push(`${label} contains forbidden ${description}: ${hit}`);
};

const bootstrap = read("scripts/local-bootstrap-25-seeded-participants.mjs");
const proof = read("scripts/proof-25-seeded-participants.mjs");
const packageJson = read("package.json");
const realtimeDoc = read("docs/release/TWENTY_FIVE_SEEDED_PARTICIPANTS_REALTIME_PROOF.md", true);
const featureFlags = read("_lib/featureFlags.ts");
const moneyFlags = read("_lib/moneyFeatureFlags.ts");

[
  "refusing_service_role_bootstrap_in_ci",
  "CHILLYWOOD_ALLOW_SERVICE_ROLE_PROOF_FIXTURE_BOOTSTRAP",
  "refusing_non_participant_proof_email",
  "proof_participant_001@chillywood.test",
  "proof_participant_025@chillywood.test",
  "writeSafeBrowserStackEnvValue",
  "serviceRoleBootstrapBoundary",
  "not role/permission authority proof",
  "firstOwnerTouched: false",
  "noProviderMutation: true",
  "noRealUsersModified: true",
  "noSecretsPrinted: true",
].forEach((needle) => requireText("participant bootstrap script", bootstrap, needle));

[
  "proof_participant_001",
  "proof_participant_025",
  "ROLE_ACCOUNTS",
  "liveMoneyEnabled appears ON",
  "valuesPrinted: false",
].forEach((needle) => requireText("participant proof script", proof, needle));

[
  "bootstrap:25-seeded-participants",
  "proof:25-seeded-participants",
  "guard:25-seeded-participants-policy",
].forEach((needle) => requireText("package scripts", packageJson, needle));

if (realtimeDoc) {
  requireText("realtime proof doc", realtimeDoc, "25 seeded participants realtime proof: Closed / Partial / Blocked");
  requireText("realtime proof doc", realtimeDoc, "Service-role bootstrap is proof-only account creation/repair and is not role/permission authority proof");
}

forbidPositiveSentence("participant bootstrap script", bootstrap, /current First Owner .*touched|real users? .*modified|provider mutation happened/i, "unsafe account/provider claim");
forbidPositiveSentence("participant proof script", proof, /current First Owner .*touched|provider mutation happened|service-role .*authority proof/i, "unsafe proof claim");
forbid("participant bootstrap script", bootstrap, /console\.log\(.*password|console\.error\(.*password/i, "password logging");
forbid("participant proof script", proof, /console\.log\(.*password|console\.error\(.*password/i, "password logging");
forbid("runtime feature flags", featureFlags, /liveMoneyEnabled:\s*true/, "liveMoneyEnabled activation");
forbid("runtime feature flags", featureFlags, /payoutsEnabled:\s*true/, "payout activation");
forbid("runtime feature flags", featureFlags, /cashoutEnabled:\s*true/, "cashout activation");
forbid("runtime feature flags", featureFlags, /stripeConnectProductionEnabled:\s*true/, "Stripe Connect production activation");
forbid("money feature defaults", moneyFlags, /live_money_enabled:\s*["']on["']/, "live_money_enabled ON");
forbid("money feature defaults", moneyFlags, /payouts_enabled:\s*["']on["']/, "payouts ON");
forbid("money feature defaults", moneyFlags, /payable_balances_enabled:\s*["']on["']/, "payable balances ON");

if (failures.length) {
  console.error("25 seeded participants policy guard failed:");
  failures.forEach((failure) => console.error(`- ${failure}`));
  process.exit(1);
}

console.log("25 seeded participants policy guard passed.");
console.log("- participant bootstrap/readiness stays proof-only, local-only, no-secret, no-provider, no-money, and not role-authority proof.");
