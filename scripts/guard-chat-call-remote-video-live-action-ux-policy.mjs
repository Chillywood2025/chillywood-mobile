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

const forbidPositiveSentence = (label, content, pattern, description) => {
  const allowed = /\b(?:no|not|did not|do not|must not|without|unless|Partial|Blocked|pending|required|requires|OFF|manual\/external|not attached|not verified|not counted|not Closed|did not claim)\b/i;
  const hit = content
    .split(/(?<=[.\n])\s+/)
    .map((sentence) => sentence.trim())
    .filter(Boolean)
    .find((sentence) => pattern.test(sentence) && !allowed.test(sentence));
  if (hit) failures.push(`${label} contains forbidden ${description}: ${hit}`);
};

const requireText = (label, content, needle) => {
  if (!content.includes(needle)) failures.push(`${label} missing required text: ${needle}`);
};

const doc = read("docs/release/CHAT_CALL_REMOTE_VIDEO_LIVE_ACTION_UX_SWEEP.md");
const featureFlags = read("_lib/featureFlags.ts");
const moneyFlags = read("_lib/moneyFeatureFlags.ts");

[
  "Actual-user installed-app proof result: Partial.",
  "No physical phone sideload was used.",
  "`chat_threads` RLS was not weakened.",
  "Premium gates were not bypassed or weakened.",
  "No auth/account-status/chat permission bypass was added.",
  "liveMoneyEnabled remains OFF.",
  "Payouts, cashout, Stripe Connect production, payable balances, withdrawals, transfers, provider refunds, and automatic refunds remain OFF.",
  "No provider mutation happened.",
].forEach((needle) => requireText("sweep doc", doc, needle));

forbidPositiveSentence("sweep doc", doc, /Actual-user installed-app proof result:\s*Closed|Primary issue result:\s*Closed|Verdict:\s*Closed/i, "Closed actual-user claim");
forbidPositiveSentence("sweep doc", doc, /physical phone sideload|sideloaded.*physical|APK install.*physical/i, "physical phone sideload");
forbidPositiveSentence("sweep doc", doc, /chat_threads.*RLS.*(?:weakened|disabled|bypassed)|RLS.*(?:weakened|disabled|bypassed)/i, "chat_threads RLS weakening");
forbidPositiveSentence("sweep doc", doc, /Premium gates?.*(?:bypassed|weakened|disabled|turned off)|bypass(?:ed)? Premium|weaken(?:ed)? Premium/i, "Premium bypass/weakening");
forbidPositiveSentence("sweep doc", doc, /Play production submission happened|submitted? to production|promoted? to production/i, "Play production submission");
forbidPositiveSentence("sweep doc", doc, /provider mutation happened|mutated provider|Google Play product|base-plan mutation|RevenueCat.*mutated|Stripe mutation/i, "provider mutation");
forbidPositiveSentence("sweep doc", doc, /current First Owner.*touched|First Owner was touched/i, "First Owner touch");

forbid("sweep doc", doc, /(PASSWORD|PASSCODE)\s*=\s*['"]?[^<\s][^\s]{8,}/i, "password value");
forbid("sweep doc", doc, /(SUPABASE_SERVICE_ROLE_KEY|SERVICE_ROLE_KEY)\s*=\s*['"]?[A-Za-z0-9._-]{20,}/, "service-role key value");
forbid("sweep doc", doc, /eyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{10,}/, "JWT/token");
forbid("sweep doc", doc, /https?:\/\/[^\s)]*(?:token|signature|X-Amz-Signature|Expires|Key-Pair-Id)[^\s)]*/i, "signed URL");
forbid("sweep doc", doc, /\b(?:\d{1,3}\.){3}\d{1,3}\b/, "raw IP");

forbid("runtime feature flags", featureFlags, /liveMoneyEnabled:\s*true/, "liveMoneyEnabled activation");
forbid("runtime feature flags", featureFlags, /payoutsEnabled:\s*true/, "payout activation");
forbid("runtime feature flags", featureFlags, /cashoutEnabled:\s*true/, "cashout activation");
forbid("runtime feature flags", featureFlags, /stripeConnectProductionEnabled:\s*true/, "Stripe Connect production activation");
forbid("money feature defaults", moneyFlags, /live_money_enabled:\s*["']on["']/, "live_money_enabled on state");
forbid("money feature defaults", moneyFlags, /payouts_enabled:\s*["']on["']/, "payouts on state");
forbid("money feature defaults", moneyFlags, /payable_balances_enabled:\s*["']on["']/, "payable balances on state");

if (failures.length) {
  console.error("chat call remote video/live action UX policy guard failed:");
  failures.forEach((failure) => console.error(`- ${failure}`));
  process.exit(1);
}

console.log("chat call remote video/live action UX policy guard passed.");
console.log("- no false actual-user Closed claim, sideload, RLS/Premium weakening, provider mutation, money activation, or secret exposure was introduced.");
