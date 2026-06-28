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
  const allowed = /\b(?:no|not|did not|do not|must not|without|unless|diagnostic|Partial|Blocked|pending|required|requires|not counted|not proven|not Closed|OFF|manual\/external|background push: Partial)\b/i;
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

const actualDoc = read("docs/release/ACTUAL_USER_CHAT_CALL_AND_LIVE_CLOSURE.md");
const standard = read("docs/release/ACTUAL_USER_PROOF_STANDARD.md");
const twoClientDoc = read("docs/release/TWO_CLIENT_INSTALLED_APP_REALTIME_UI_PROOF.md");
const finalBlockersDoc = read("docs/release/FINAL_INSTALLED_REALTIME_UI_BLOCKERS.md");
const featureFlags = read("_lib/featureFlags.ts");
const moneyFlags = read("_lib/moneyFeatureFlags.ts");

[
  "Actual-user Chat Call proof: Partial",
  "Actual-user Live UI proof: Partial",
  "Pre-created thread/call state was not counted as actual-user Closed",
  "`chat_threads` RLS was not weakened",
  "Premium gates were not bypassed or weakened",
  "No service-role chat permission proof was used",
].forEach((needle) => requireText("actual-user closure doc", actualDoc, needle));

requireText("actual-user standard", standard, "Diagnostic media proof, backend readback, pre-created thread state, pre-created call state");
requireText("two-client proof doc", twoClientDoc, "Final verdict: Partial under `docs/release/ACTUAL_USER_PROOF_STANDARD.md`.");
requireText("final blockers doc", finalBlockersDoc, "Final verdict: Partial under `docs/release/ACTUAL_USER_PROOF_STANDARD.md`.");

forbidPositiveSentence("actual-user closure doc", actualDoc, /pre-created.*counted.*Closed|diagnostic.*Chat Call Closed|backend.*Chat Call Closed/i, "pre-created/diagnostic state counted as actual-user Closed");
forbidPositiveSentence("actual-user closure doc", actualDoc, /service-role.*chat permission proof/i, "service-role chat permission proof");
forbidPositiveSentence("actual-user closure doc", actualDoc, /chat_threads.*RLS.*(?:weakened|disabled|bypassed)|RLS.*(?:weakened|disabled|bypassed)/i, "chat_threads RLS weakening");
forbidPositiveSentence("actual-user closure doc", actualDoc, /Premium gates?.*(?:bypassed|weakened|disabled|turned off)|bypass(?:ed)? Premium|weaken(?:ed)? Premium/i, "Premium bypass/weakening");
forbidPositiveSentence("actual-user closure doc", actualDoc, /physical phone sideload|sideloaded.*physical|APK install.*physical/i, "physical phone sideload/install");
forbidPositiveSentence("actual-user closure doc", actualDoc, /Play production submission happened|submitted? to production|promoted? to production/i, "Play production submission");
forbidPositiveSentence("actual-user closure doc", actualDoc, /provider mutation happened|mutated provider|Google Play product|base-plan mutation|RevenueCat.*mutated|Stripe mutation/i, "provider mutation");
forbidPositiveSentence("actual-user closure doc", actualDoc, /current First Owner.*touched|First Owner was touched/i, "First Owner touch");

forbid("actual-user closure doc", actualDoc, /(PASSWORD|PASSCODE)\s*=\s*['"]?[^<\s][^\s]{8,}/i, "password value");
forbid("actual-user closure doc", actualDoc, /(SUPABASE_SERVICE_ROLE_KEY|SERVICE_ROLE_KEY)\s*=\s*['"]?[A-Za-z0-9._-]{20,}/, "service-role key value");
forbid("actual-user closure doc", actualDoc, /eyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{10,}/, "JWT/token");
forbid("actual-user closure doc", actualDoc, /https?:\/\/[^\s)]*(?:token|signature|X-Amz-Signature|Expires|Key-Pair-Id)[^\s)]*/i, "signed URL");
forbid("actual-user closure doc", actualDoc, /\b(?:\d{1,3}\.){3}\d{1,3}\b/, "raw IP");

forbid("runtime feature flags", featureFlags, /liveMoneyEnabled:\s*true/, "liveMoneyEnabled activation");
forbid("runtime feature flags", featureFlags, /payoutsEnabled:\s*true/, "payout activation");
forbid("runtime feature flags", featureFlags, /cashoutEnabled:\s*true/, "cashout activation");
forbid("runtime feature flags", featureFlags, /stripeConnectProductionEnabled:\s*true/, "Stripe Connect production activation");
forbid("money feature defaults", moneyFlags, /live_money_enabled:\s*["']on["']/, "live_money_enabled on state");
forbid("money feature defaults", moneyFlags, /payouts_enabled:\s*["']on["']/, "payouts on state");
forbid("money feature defaults", moneyFlags, /payable_balances_enabled:\s*["']on["']/, "payable balances on state");

if (failures.length) {
  console.error("actual-user chat call and live policy guard failed:");
  failures.forEach((failure) => console.error(`- ${failure}`));
  process.exit(1);
}

console.log("actual-user chat call and live policy guard passed.");
console.log("- no pre-created state closeout, diagnostic Chat Call closeout, RLS/Premium weakening, sideload, provider mutation, money activation, or secret exposure was introduced.");
