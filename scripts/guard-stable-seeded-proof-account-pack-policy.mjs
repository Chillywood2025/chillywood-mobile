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
  const allowed = /\b(?:no|not|did not|do not|must not|unless|blocked|missing|partial|forbidden|refusing|without|never|not claimed|not used)\b/i;
  const hit = content
    .split(/(?<=[.\n])\s+/)
    .map((sentence) => sentence.trim())
    .filter(Boolean)
    .find((sentence) => pattern.test(sentence) && !allowed.test(sentence));
  if (hit) failures.push(`${label} contains forbidden ${description}: ${hit}`);
};

const doc = read("docs/release/STABLE_SEEDED_PROOF_ACCOUNT_PACK.md");
const oneDeviceDoc = read("docs/release/ONE_ATTACHED_DEVICE_FULL_APP_AUTOMATION_PROOF.md", true);
const packageJson = read("package.json");
const featureFlags = read("_lib/featureFlags.ts");
const moneyFlags = read("_lib/moneyFeatureFlags.ts");

[
  "Stable seeded proof account pack: Closed / Partial / Blocked",
  "Service-role bootstrap is approved only for proof-only account creation/repair",
  "Service-role bootstrap is not role/permission authority proof",
  "Owner RPC staff grant path remains the authority proof",
  "No passwords, service-role keys, tokens, provider secrets, signed URLs, raw IPs, tax IDs, bank details, private evidence, or private messages are committed or artifacted",
  "Current First Owner was not touched",
  "No real users were modified",
  "No provider mutation happened",
  "liveMoneyEnabled remains OFF",
  "Payouts, cashout, Stripe Connect production, payable balances, withdrawals, transfers, provider refunds, and automatic refunds remain OFF",
  "proof_normal_001",
  "proof_creator_001",
  "proof_moderator_001",
  "proof_admin_operator_001",
  "proof_owner_001",
  "proof_restricted_001",
  "proof_blocked_a_001",
  "proof_blocked_b_001",
  "proof_premium_001",
  "proof_nonpremium_001",
].forEach((needle) => requireText("stable seeded proof account pack doc", doc, needle));

[
  "bootstrap:stable-seeded-proof-account-pack",
  "proof:stable-seeded-proof-account-pack",
  "guard:stable-seeded-proof-account-pack-policy",
].forEach((needle) => requireText("package scripts", packageJson, needle));

forbidPositiveSentence("stable seeded proof account pack doc", doc, /service-role .*authority proof|service-role .*role\/permission authority proof/i, "service-role authority proof claim");
forbidPositiveSentence("stable seeded proof account pack doc", doc, /current First Owner (?:was|is) touched|modified current First Owner|changed current First Owner/i, "current First Owner mutation");
forbidPositiveSentence("stable seeded proof account pack doc", doc, /real users? (?:were|are) modified|modified real users/i, "real user modification claim");
forbidPositiveSentence("stable seeded proof account pack doc", doc, /provider mutation happened|mutated provider|provider dashboards? mutated/i, "provider mutation claim");
forbidPositiveSentence("stable seeded proof account pack doc", doc, /Premium annual (?:is|was) live|Creator Channel Subscription (?:is|was) live/i, "provider-blocked monetization live claim");

forbid("stable seeded proof account pack doc", doc, /(SUPABASE_SERVICE_ROLE_KEY|SERVICE_ROLE_KEY)\s*=\s*['"]?[A-Za-z0-9._-]{20,}/, "service-role key value");
forbid("stable seeded proof account pack doc", doc, /(PASSWORD|PASSCODE)\s*=\s*['"]?[^<\s][^\s]{8,}/i, "password value");
forbid("stable seeded proof account pack doc", doc, /eyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{10,}/, "JWT/token");
forbid("stable seeded proof account pack doc", doc, /https?:\/\/[^\s)]*(?:token|signature|X-Amz-Signature|Expires|Key-Pair-Id)[^\s)]*/i, "signed URL");

forbid("runtime feature flags", featureFlags, /liveMoneyEnabled:\s*true/, "liveMoneyEnabled activation");
forbid("runtime feature flags", featureFlags, /payoutsEnabled:\s*true/, "payout activation");
forbid("runtime feature flags", featureFlags, /cashoutEnabled:\s*true/, "cashout activation");
forbid("runtime feature flags", featureFlags, /stripeConnectProductionEnabled:\s*true/, "Stripe Connect production activation");
forbid("money feature defaults", moneyFlags, /live_money_enabled:\s*["']on["']/, "live_money_enabled ON");
forbid("money feature defaults", moneyFlags, /payouts_enabled:\s*["']on["']/, "payouts ON");

if (oneDeviceDoc) {
  requireText("one-device proof doc", oneDeviceDoc, "stable seeded proof account pack");
}

if (failures.length) {
  console.error("Stable seeded proof account pack policy guard failed:");
  failures.forEach((failure) => console.error(`- ${failure}`));
  process.exit(1);
}

console.log("Stable seeded proof account pack policy guard passed.");
console.log("- proof accounts, service-role boundary, Owner RPC authority boundary, no-secret policy, First Owner safety, provider safety, and money-off policy are documented and guarded.");
