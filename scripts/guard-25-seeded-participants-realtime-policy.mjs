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

const requireText = (label, content, needle) => {
  if (!content.includes(needle)) failures.push(`${label} missing required text: ${needle}`);
};

const forbid = (label, content, pattern, description) => {
  if (pattern.test(content)) failures.push(`${label} contains forbidden ${description}`);
};

const forbidPositiveSentence = (label, content, pattern, description) => {
  const allowed = /\b(?:no|not|did not|do not|must not|without|unless explicitly owner-approved|owner-approved|emulator-only|diagnostic|blocked|missing|required|still required|Partial|not claimed|not used|not available|cannot|OFF|manual\/external|only)\b/i;
  const hit = content
    .split(/(?<=[.\n])\s+/)
    .map((sentence) => sentence.trim())
    .filter(Boolean)
    .find((sentence) => pattern.test(sentence) && !allowed.test(sentence));
  if (hit) failures.push(`${label} contains forbidden ${description}: ${hit}`);
};

const doc = read("docs/release/TWENTY_FIVE_SEEDED_PARTICIPANTS_REALTIME_PROOF.md");
const featureFlags = read("_lib/featureFlags.ts");
const moneyFlags = read("_lib/moneyFeatureFlags.ts");

[
  "25 seeded participants realtime proof: Closed / Partial / Blocked",
  "At least two active clients are required for realtime proof",
  "Seeded accounts are identities; active clients prove simultaneous behavior",
  "Partial: second Play-internal v57 active client is still required",
  "No sideload was used",
  "No APK install was used as tester proof",
  "No uninstall/reinstall/clear-data happened",
  "No Play production submission happened",
  "No provider mutation happened",
  "No service-role was used as role/permission authority proof",
  "Current First Owner was not touched",
  "liveMoneyEnabled remains OFF",
  "Payouts, cashout, Stripe Connect production, payable balances, withdrawals, transfers, provider refunds, and automatic refunds remain OFF",
  "No LiveKit tokens, push tokens, signed URLs, raw IPs, secrets, private messages, or private evidence were exposed",
].forEach((needle) => requireText("25 seeded participants realtime proof doc", doc, needle));

forbidPositiveSentence("25 seeded participants realtime proof doc", doc, /one-device sequential proof .*full realtime|one attached device .*full realtime|single device .*fully proved realtime/i, "one-device sequential proof claimed as full realtime");
forbidPositiveSentence("25 seeded participants realtime proof doc", doc, /25 seeded identities .*25 active clients|25 accounts .*25 active clients|25 active clients joined/i, "identity-only participant pack claimed as 25 active clients");
forbidPositiveSentence("25 seeded participants realtime proof doc", doc, /service-role .*role\/permission authority|service-role .*authority proof/i, "service-role authority proof claim");
forbidPositiveSentence("25 seeded participants realtime proof doc", doc, /current First Owner .*touched|modified current First Owner/i, "current First Owner mutation");
forbidPositiveSentence("25 seeded participants realtime proof doc", doc, /sideload|APK install|uninstall|reinstall|clear-data|clear data/i, "sideload or destructive device action");
forbidPositiveSentence("25 seeded participants realtime proof doc", doc, /Play production submission happened|submitted? to production|promoted? to production/i, "Play production submission");
forbidPositiveSentence("25 seeded participants realtime proof doc", doc, /provider mutation happened|mutated provider|provider dashboards? mutated|Google Play product|base-plan mutation|RevenueCat mapping change|Stripe mutation/i, "provider mutation");
forbidPositiveSentence("25 seeded participants realtime proof doc", doc, /provider refunds? executed|refunds? executed|payouts? executed|cashout executed|withdrawals? executed|transfers? executed/i, "refund/payout execution");
forbidPositiveSentence("25 seeded participants realtime proof doc", doc, /LiveKit tokens? exposed|push tokens? exposed|signed URLs? exposed|raw IPs? exposed|private messages? exposed|private evidence exposed|secrets? exposed/i, "secret/private realtime data exposure");

forbid("25 seeded participants realtime proof doc", doc, /(PASSWORD|PASSCODE)\s*=\s*['"]?[^<\s][^\s]{8,}/i, "password value");
forbid("25 seeded participants realtime proof doc", doc, /(SUPABASE_SERVICE_ROLE_KEY|SERVICE_ROLE_KEY)\s*=\s*['"]?[A-Za-z0-9._-]{20,}/, "service-role key value");
forbid("25 seeded participants realtime proof doc", doc, /eyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{10,}/, "JWT/token");
forbid("25 seeded participants realtime proof doc", doc, /https?:\/\/[^\s)]*(?:token|signature|X-Amz-Signature|Expires|Key-Pair-Id)[^\s)]*/i, "signed URL");
forbid("25 seeded participants realtime proof doc", doc, /\b(?:\d{1,3}\.){3}\d{1,3}\b/, "raw IP");

forbid("runtime feature flags", featureFlags, /liveMoneyEnabled:\s*true/, "liveMoneyEnabled activation");
forbid("runtime feature flags", featureFlags, /payoutsEnabled:\s*true/, "payout activation");
forbid("runtime feature flags", featureFlags, /cashoutEnabled:\s*true/, "cashout activation");
forbid("runtime feature flags", featureFlags, /stripeConnectProductionEnabled:\s*true/, "Stripe Connect production activation");
forbid("money feature defaults", moneyFlags, /live_money_enabled:\s*["']on["']/, "live_money_enabled on state");
forbid("money feature defaults", moneyFlags, /payouts_enabled:\s*["']on["']/, "payouts on state");
forbid("money feature defaults", moneyFlags, /payable_balances_enabled:\s*["']on["']/, "payable balances on state");

if (failures.length) {
  console.error("25 seeded participants realtime policy guard failed:");
  failures.forEach((failure) => console.error(`- ${failure}`));
  process.exit(1);
}

console.log("25 seeded participants realtime policy guard passed.");
console.log("- no false realtime closeout, sideload, destructive device action, production submission, provider mutation, money activation, First Owner mutation, or secret/private-data exposure was introduced.");
