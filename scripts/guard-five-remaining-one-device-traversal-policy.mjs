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

const forbid = (label, content, pattern, description) => {
  if (pattern.test(content)) failures.push(`${label} contains forbidden ${description}`);
};

const requireText = (label, content, needle) => {
  if (!content.includes(needle)) failures.push(`${label} missing required text: ${needle}`);
};

const forbidPositiveSentence = (label, content, pattern, description) => {
  const allowed = /\b(?:no|not|did not|do not|must not|without|against|blocked|missing|required|two-device required|not claimed|not used|not run|unless explicitly owner-approved|manual\/external|OFF|denial|access-status|readiness|status|support|only)\b/i;
  const hit = content
    .split(/(?<=[.\n])\s+/)
    .map((sentence) => sentence.trim())
    .filter(Boolean)
    .find((sentence) => pattern.test(sentence) && !allowed.test(sentence));
  if (hit) failures.push(`${label} contains forbidden ${description}: ${hit}`);
};

const doc = read("docs/release/FIVE_REMAINING_ONE_DEVICE_TRAVERSAL_BLOCKERS.md");
const runner = read("scripts/local-run-full-seeded-one-device-role-traversal-rerun.mjs");
const featureFlags = read("_lib/featureFlags.ts");
const moneyFlags = read("_lib/moneyFeatureFlags.ts");

[
  "Normal `/admin` is expected denial/access-status behavior, not staff access",
  "Creator payouts remain readiness/status/support only",
  "No service-role was used",
  "No accounts were created or recreated",
  "No passwords were printed or committed",
  "No sideload, uninstall, reinstall, or clear-data happened",
  "No provider mutation happened",
  "liveMoneyEnabled remains OFF",
  "Payouts, cashout, Stripe Connect production, payable balances, withdrawals, transfers, provider refunds, and automatic refunds remain OFF",
].forEach((needle) => requireText("five remaining blocker doc", doc, needle));

requireText("local rerun runner", runner, "chillywoodmobile:///");
requireText("local rerun runner", runner, "FULL_SEEDED_ONE_DEVICE_AFFECTED_ONLY");
requireText("local rerun runner", runner, "normal users must see active access-status denial, not Admin tools");
requireText("local rerun runner", runner, "legacy payout route redirects to active Platform Studio payout-readiness gate without live payout execution");

forbidPositiveSentence("five remaining blocker doc", doc, /normal .*admin .*(?:granted|accessed|reached).*Admin Command Center|normal .*staff access/i, "normal user admin access");
forbidPositiveSentence("five remaining blocker doc", doc, /payout(?:s)? (?:executed|released|created|paid|withdrawn|transferred)|payable balance(?:s)? (?:created|enabled)/i, "live payout/payable execution");
forbidPositiveSentence("five remaining blocker doc", doc, /service-role (?:was|used|bootstrap|created|repaired|authority)/i, "service-role use");
forbidPositiveSentence("five remaining blocker doc", doc, /accounts? (?:were|was) (?:created|recreated)|created accounts?|recreated accounts?/i, "account creation/recreation");
forbidPositiveSentence("five remaining blocker doc", doc, /sideload|APK install|uninstall|reinstall|clear-data|clear data/i, "sideload or destructive device action");
forbidPositiveSentence("five remaining blocker doc", doc, /provider mutation happened|mutated provider|provider dashboards? mutated/i, "provider mutation");
forbidPositiveSentence("five remaining blocker doc", doc, /provider refunds? (?:are|were|became) executable|provider refunds? executed/i, "provider refund execution");
forbidPositiveSentence("five remaining blocker doc", doc, /dead visible controls? (?:accepted|allowed|remain)/i, "dead visible control acceptance");

forbid("five remaining blocker doc", doc, /(PASSWORD|PASSCODE)\s*=\s*['"]?[^<\s][^\s]{8,}/i, "password value");
forbid("five remaining blocker doc", doc, /(SUPABASE_SERVICE_ROLE_KEY|SERVICE_ROLE_KEY)\s*=\s*['"]?[A-Za-z0-9._-]{20,}/, "service-role key value");
forbid("five remaining blocker doc", doc, /eyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{10,}/, "JWT/token");
forbid("five remaining blocker doc", doc, /https?:\/\/[^\s)]*(?:token|signature|X-Amz-Signature|Expires|Key-Pair-Id)[^\s)]*/i, "signed URL");
forbid("five remaining blocker doc", doc, /\b(?:\d{1,3}\.){3}\d{1,3}\b/, "raw IP");

forbid("runtime feature flags", featureFlags, /liveMoneyEnabled:\s*true/, "liveMoneyEnabled activation");
forbid("runtime feature flags", featureFlags, /payoutsEnabled:\s*true/, "payout activation");
forbid("runtime feature flags", featureFlags, /cashoutEnabled:\s*true/, "cashout activation");
forbid("runtime feature flags", featureFlags, /stripeConnectProductionEnabled:\s*true/, "Stripe Connect production activation");
forbid("money feature defaults", moneyFlags, /live_money_enabled:\s*["']on["']/, "live_money_enabled on state");
forbid("money feature defaults", moneyFlags, /payouts_enabled:\s*["']on["']/, "payouts on state");
forbid("money feature defaults", moneyFlags, /payable_balances_enabled:\s*["']on["']/, "payable balances on state");

if (failures.length) {
  console.error("Five remaining one-device traversal policy guard failed:");
  failures.forEach((failure) => console.error(`- ${failure}`));
  process.exit(1);
}

console.log("Five remaining one-device traversal policy guard passed.");
console.log("- no normal-admin widening, payout execution, service-role use, account recreation, destructive device action, provider mutation, secret exposure, or money activation was introduced.");
