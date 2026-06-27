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
  const allowed = /\b(?:no|not|did not|do not|must not|without|unless|diagnostic|fallback|Partial|Blocked|required|requires|needs|OFF|manual\/external|not enough|not accepted|not called Closed|not weakened|not bypassed)\b/i;
  const hit = content
    .split(/(?<=[.\n])\s+/)
    .map((sentence) => sentence.trim())
    .filter(Boolean)
    .find((sentence) => pattern.test(sentence) && !allowed.test(sentence));
  if (hit) failures.push(`${label} contains forbidden ${description}: ${hit}`);
};

const doc = read("docs/release/FINAL_INSTALLED_REALTIME_UI_BLOCKERS.md");
const twoClientDoc = read("docs/release/TWO_CLIENT_INSTALLED_APP_REALTIME_UI_PROOF.md");
const featureFlags = read("_lib/featureFlags.ts");
const moneyFlags = read("_lib/moneyFeatureFlags.ts");

[
  "Final verdict: Partial",
  "Two physical Play-internal v57 Android clients were used",
  "No physical phone sideload was used",
  "Premium gates were not bypassed or weakened",
  "`chat_threads` RLS was not weakened",
  "No auth/account-status/chat permission bypass was added",
  "Watch-Party installed UI proof",
  "Closed: both clients exposed the expected Watch-Party installed UI state",
  "Chat Call installed UI proof",
  "Partial: `chat_threads` insert remained RLS-denied",
  "Live installed UI proof",
  "Partial: `proof_premium_001` no longer showed the Premium gate",
  "Owner/Admin/Moderator realtime controls remain Closed",
  "liveMoneyEnabled remains OFF",
].forEach((needle) => requireText("final installed realtime UI blockers doc", doc, needle));

forbidPositiveSentence("final installed realtime UI blockers doc", doc, /Premium gates?.*(?:bypassed|weakened|disabled|turned off)|bypass(?:ed)? Premium|weaken(?:ed)? Premium/i, "Premium gate bypass/weakening");
forbidPositiveSentence("final installed realtime UI blockers doc", doc, /chat_threads.*RLS.*(?:weakened|disabled|bypassed)|RLS.*(?:weakened|disabled|bypassed)/i, "chat_threads RLS weakening");
forbidPositiveSentence("final installed realtime UI blockers doc", doc, /backend-only.*installed UI.*Closed|diagnostic.*installed UI.*Closed/i, "backend-only diagnostic called installed UI Closed");
forbidPositiveSentence("final installed realtime UI blockers doc", doc, /only one device.*Closed|single physical.*Closed|one active client.*Closed/i, "one-device closeout claim");
forbidPositiveSentence("final installed realtime UI blockers doc", doc, /physical phone sideload|sideloaded.*physical|APK install.*physical/i, "physical phone sideload/install");
forbidPositiveSentence("final installed realtime UI blockers doc", doc, /Play production submission happened|submitted? to production|promoted? to production/i, "Play production submission");
forbidPositiveSentence("final installed realtime UI blockers doc", doc, /provider mutation happened|mutated provider|Google Play product|base-plan mutation|RevenueCat.*mutated|Stripe mutation/i, "provider mutation");
forbidPositiveSentence("final installed realtime UI blockers doc", doc, /provider refunds? executed|refunds? executed|payouts? executed|cashout executed|withdrawals? executed|transfers? executed/i, "refund/payout execution");
forbidPositiveSentence("final installed realtime UI blockers doc", doc, /current First Owner.*touched|First Owner was touched/i, "First Owner touch");
forbid("two-client installed app realtime UI proof doc", twoClientDoc, /Watch-Party sync: Partial/i, "stale Watch-Party Partial status");

forbid("final installed realtime UI blockers doc", doc, /(PASSWORD|PASSCODE)\s*=\s*['"]?[^<\s][^\s]{8,}/i, "password value");
forbid("final installed realtime UI blockers doc", doc, /(SUPABASE_SERVICE_ROLE_KEY|SERVICE_ROLE_KEY)\s*=\s*['"]?[A-Za-z0-9._-]{20,}/, "service-role key value");
forbid("final installed realtime UI blockers doc", doc, /eyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{10,}/, "JWT/token");
forbid("final installed realtime UI blockers doc", doc, /https?:\/\/[^\s)]*(?:token|signature|X-Amz-Signature|Expires|Key-Pair-Id)[^\s)]*/i, "signed URL");
forbid("final installed realtime UI blockers doc", doc, /\b(?:\d{1,3}\.){3}\d{1,3}\b/, "raw IP");

forbid("runtime feature flags", featureFlags, /liveMoneyEnabled:\s*true/, "liveMoneyEnabled activation");
forbid("runtime feature flags", featureFlags, /payoutsEnabled:\s*true/, "payout activation");
forbid("runtime feature flags", featureFlags, /cashoutEnabled:\s*true/, "cashout activation");
forbid("runtime feature flags", featureFlags, /stripeConnectProductionEnabled:\s*true/, "Stripe Connect production activation");
forbid("money feature defaults", moneyFlags, /live_money_enabled:\s*["']on["']/, "live_money_enabled on state");
forbid("money feature defaults", moneyFlags, /payouts_enabled:\s*["']on["']/, "payouts on state");
forbid("money feature defaults", moneyFlags, /payable_balances_enabled:\s*["']on["']/, "payable balances on state");

if (failures.length) {
  console.error("final installed realtime UI blockers policy guard failed:");
  failures.forEach((failure) => console.error(`- ${failure}`));
  process.exit(1);
}

console.log("final installed realtime UI blockers policy guard passed.");
console.log("- no Premium bypass, chat RLS weakening, backend-only installed UI closeout, physical sideload, production submission, provider mutation, money activation, or secret exposure was introduced.");
