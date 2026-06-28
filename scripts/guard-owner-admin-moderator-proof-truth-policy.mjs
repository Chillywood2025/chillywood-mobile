#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const failures = [];

const read = (relativePath) => {
  const absolute = path.join(root, relativePath);
  if (!fs.existsSync(absolute)) {
    failures.push(`Missing required file: ${relativePath}`);
    return "";
  }
  return fs.readFileSync(absolute, "utf8");
};

const fail = (message) => failures.push(message);

const requireText = (label, content, needle) => {
  if (!content.includes(needle)) fail(`${label} missing required text: ${needle}`);
};

const forbidMatch = (label, content, pattern, description) => {
  if (pattern.test(content)) fail(`${label} contains forbidden ${description}`);
};

const sentences = (content) => content
  .replace(/\r/g, "")
  .split(/(?<=[.!?])\s+|\n+/)
  .map((line) => line.trim())
  .filter(Boolean);

const forbidSentence = (label, content, predicate, description) => {
  for (const sentence of sentences(content)) {
    if (predicate(sentence)) fail(`${label} contains forbidden ${description}: "${sentence.slice(0, 220)}"`);
  }
};

const hasNegation = (sentence) => /\b(not|never|no|without|cannot|can't|must not|is not|are not|was not|were not|does not|do not)\b/i.test(sentence);

const doc = read("docs/release/OWNER_ADMIN_MODERATOR_PROOF_TRUTH_AUDIT.md");
const seededAuthorityDoc = read("docs/admin/OWNER_ADMIN_MODERATOR_PRODUCTION_AUTHORITY_SEEDED_DEVICE_PROOF.md");
const commandCenterDoc = read("docs/admin/OWNER_ADMIN_COMMAND_CENTER_PRODUCTION_UI.md");
const providerDoc = read("docs/ops/PROVIDER_DASHBOARD_OWNERSHIP_ACCESS_GOVERNANCE.md");
const packageJson = read("package.json");
const featureFlags = read("_lib/featureFlags.ts");
const moneyFlags = read("_lib/moneyFeatureFlags.ts");

[
  "Diagnostic/backend proof is not actual-user proof",
  "Service-role/bootstrap proof is not role-authority proof",
  "Owner RPC staff grant path is the authority proof where applicable",
  "Provider dashboard MFA/access remains owner-confirmation-required unless sanitized evidence exists",
  "Normal-user `/admin` denial",
  "Moderator cannot gain Admin/Owner power",
  "Admin/operator cannot gain Owner/First Owner authority",
  "Current First Owner was not touched",
  "No auth/RLS/staff permission weakening happened",
  "liveMoneyEnabled remains OFF",
].forEach((needle) => requireText("truth audit doc", doc, needle));

[
  "proof:owner-admin-moderator-proof-truth-audit",
  "guard:owner-admin-moderator-proof-truth-policy",
].forEach((needle) => requireText("package scripts", packageJson, needle));

const truthDocs = [
  ["truth audit doc", doc],
  ["seeded authority doc", seededAuthorityDoc],
  ["command center doc", commandCenterDoc],
  ["provider dashboard doc", providerDoc],
];

for (const [label, content] of truthDocs) {
  forbidSentence(label, content, (sentence) => (
    /service-role|service role/i.test(sentence)
    && /role-authority proof|role authority proof|authority proof/i.test(sentence)
    && !hasNegation(sentence)
  ), "service-role counted as role-authority proof");

  forbidSentence(label, content, (sentence) => (
    /backend readback|diagnostic|marker-only|controlled seeded/i.test(sentence)
    && /actual-user installed-app Closed|actual user installed app Closed|actual-user Closed/i.test(sentence)
    && !hasNegation(sentence)
  ), "backend/diagnostic/marker/controlled proof called actual-user Closed");

  forbidSentence(label, content, (sentence) => (
    /provider dashboard|dashboard MFA|dashboard access/i.test(sentence)
    && /repo-proved|repo proved|repo-verifiable Closed|repo verified Closed|Closed from repo/i.test(sentence)
    && !/owner-confirmation|required|unless sanitized evidence/i.test(sentence)
    && !hasNegation(sentence)
  ), "provider dashboard MFA/access called repo-proved");

  forbidMatch(label, content, /\bnormal user\b[^.\n]{0,120}\b(?:can|may|is allowed to|gets|gains)\b[^.\n]{0,80}\badmin access\b/i, "normal user admin access allowance");
  forbidMatch(label, content, /\bModerator\b[^.\n]{0,120}\b(?:can|may|is allowed to|gets|gains)\b[^.\n]{0,80}\b(?:Admin|Owner) (?:power|authority|access)\b/i, "Moderator gains Admin/Owner power");
  forbidMatch(label, content, /\bAdmin\/operator\b[^.\n]{0,120}\b(?:can|may|is allowed to|gets|gains)\b[^.\n]{0,80}\b(?:Owner|First Owner) (?:power|authority|access)\b/i, "Admin/operator gains Owner/First Owner power");
  forbidMatch(label, content, /Current First Owner (?:was|is) touched/i, "current First Owner touch");
  forbidMatch(label, content, /(?:auth|RLS|staff permission|staff permissions) (?:was|were|is|are) (?:weakened|bypassed|disabled)/i, "auth/RLS/staff permission weakening");
  forbidSentence(label, content, (sentence) => (
    /(?:service-role key|service_role key|SUPABASE_SERVICE_ROLE_KEY|access_token=|refresh_token=|LiveKit token|push token|signed URL|raw IP|tax ID|bank detail|private evidence|private message)/i.test(sentence)
    && /(?:exposed|committed|artifacted|printed|shown|leaked|included)/i.test(sentence)
    && !hasNegation(sentence)
  ), "secret/private data exposure");
}

forbidMatch("runtime feature flags", featureFlags, /liveMoneyEnabled:\s*true/i, "liveMoneyEnabled ON");
forbidMatch("runtime feature flags", featureFlags, /payoutsEnabled:\s*true/i, "payouts enabled");
forbidMatch("runtime feature flags", featureFlags, /stripeConnectProductionEnabled:\s*true/i, "Stripe Connect production enabled");
forbidMatch("runtime feature flags", featureFlags, /payableBalancesEnabled:\s*true/i, "payable balances enabled");
forbidMatch("runtime feature flags", featureFlags, /providerRefundsEnabled:\s*true/i, "provider refunds executable");

forbidMatch("money feature defaults", moneyFlags, /live_money_enabled:\s*["']on["']/i, "live_money_enabled ON");
forbidMatch("money feature defaults", moneyFlags, /payouts_enabled:\s*["']on["']/i, "payouts ON");
forbidMatch("money feature defaults", moneyFlags, /stripe_connect_production_enabled:\s*["']on["']/i, "Stripe Connect production ON");
forbidMatch("money feature defaults", moneyFlags, /provider_refunds_enabled:\s*["']on["']/i, "provider refunds executable");
forbidMatch("money feature defaults", moneyFlags, /payable_balances_enabled:\s*["']on["']/i, "payable balances ON");

if (failures.length) {
  console.error("Owner/Admin/Moderator proof truth policy guard failed:");
  failures.forEach((failure) => console.error(`- ${failure}`));
  process.exit(1);
}

console.log("Owner/Admin/Moderator proof truth policy guard passed.");
console.log("- controlled/backend/service-role/provider-dashboard proof cannot be mislabeled as actual-user role-authority proof.");
console.log("- staff boundaries and money-off/provider-safe posture remain guarded.");
