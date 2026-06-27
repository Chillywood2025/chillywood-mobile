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
  const allowed = /\b(?:no|not|did not|do not|must not|without|unless|diagnostic|emulator-only|owner-approved|Partial|Blocked|pending|required|requires|not accepted|not called|not observed|OFF|manual\/external|readback-only proof is not callback proof)\b/i;
  const hit = content
    .split(/(?<=[.\n])\s+/)
    .map((sentence) => sentence.trim())
    .filter(Boolean)
    .find((sentence) => pattern.test(sentence) && !allowed.test(sentence));
  if (hit) failures.push(`${label} contains forbidden ${description}: ${hit}`);
};

const doc = read("docs/release/WATCH_PARTY_REALTIME_CALLBACK_FIX.md");
const featureFlags = read("_lib/featureFlags.ts");
const moneyFlags = read("_lib/moneyFeatureFlags.ts");

[
  "Final verdict: Closed",
  "watch_party_sync_events callback observed / not observed",
  "Observed",
  "Playback readback matched",
  "This is called Closed because callback proof and playback readback both passed.",
  "Latest focused artifact: `/tmp/app-watch-party-realtime-callback-fix-20260627142209/`",
  "Diagnostic sideloaded emulator is not accepted as Play-internal UI proof",
  "No sideload was used on the physical tester phone",
  "No Play production submission happened",
  "No provider mutation happened",
  "liveMoneyEnabled remains OFF",
  "Payouts, cashout, Stripe Connect production, payable balances, withdrawals, transfers, provider refunds, and automatic refunds remain OFF",
].forEach((needle) => requireText("Watch-Party callback fix doc", doc, needle));

forbidPositiveSentence("Watch-Party callback fix doc", doc, /readback-only .*Closed|callback proof .*Closed.*readback/i, "readback-only callback closeout");
if (
  /callback observed/i.test(doc) &&
  !(
    doc.includes("Latest focused artifact: `/tmp/app-watch-party-realtime-callback-fix-20260627142209/`") &&
    doc.includes("| Status | `passed` |") &&
    doc.includes("This is called Closed because callback proof and playback readback both passed.")
  )
) {
  failures.push("Watch-Party callback fix doc claims callback observed without latest passed artifact evidence.");
}
forbidPositiveSentence("Watch-Party callback fix doc", doc, /physical tester phone.*sideload|sideload.*physical tester phone/i, "physical phone sideload");
forbidPositiveSentence("Watch-Party callback fix doc", doc, /diagnostic sideloaded emulator .*Play-internal UI proof|emulator-only diagnostic .*full installed-app realtime UI proof/i, "diagnostic emulator claimed as Play-internal UI proof");
forbidPositiveSentence("Watch-Party callback fix doc", doc, /Play production submission happened|submitted? to production|promoted? to production/i, "Play production submission");
forbidPositiveSentence("Watch-Party callback fix doc", doc, /provider mutation happened|mutated provider|Google Play product|base-plan mutation|RevenueCat mapping change|Stripe mutation/i, "provider mutation");
forbidPositiveSentence("Watch-Party callback fix doc", doc, /provider refunds? executed|refunds? executed|payouts? executed|cashout executed|withdrawals? executed|transfers? executed/i, "refund/payout execution");
forbidPositiveSentence("Watch-Party callback fix doc", doc, /LiveKit tokens? exposed|push tokens? exposed|signed URLs? exposed|raw IPs? exposed|private messages? exposed|private evidence exposed|secrets? exposed/i, "secret/private realtime data exposure");

forbid("Watch-Party callback fix doc", doc, /(PASSWORD|PASSCODE)\s*=\s*['"]?[^<\s][^\s]{8,}/i, "password value");
forbid("Watch-Party callback fix doc", doc, /(SUPABASE_SERVICE_ROLE_KEY|SERVICE_ROLE_KEY)\s*=\s*['"]?[A-Za-z0-9._-]{20,}/, "service-role key value");
forbid("Watch-Party callback fix doc", doc, /eyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{10,}/, "JWT/token");
forbid("Watch-Party callback fix doc", doc, /https?:\/\/[^\s)]*(?:token|signature|X-Amz-Signature|Expires|Key-Pair-Id)[^\s)]*/i, "signed URL");
forbid("Watch-Party callback fix doc", doc, /\b(?:\d{1,3}\.){3}\d{1,3}\b/, "raw IP");

forbid("runtime feature flags", featureFlags, /liveMoneyEnabled:\s*true/, "liveMoneyEnabled activation");
forbid("runtime feature flags", featureFlags, /payoutsEnabled:\s*true/, "payout activation");
forbid("runtime feature flags", featureFlags, /cashoutEnabled:\s*true/, "cashout activation");
forbid("runtime feature flags", featureFlags, /stripeConnectProductionEnabled:\s*true/, "Stripe Connect production activation");
forbid("money feature defaults", moneyFlags, /live_money_enabled:\s*["']on["']/, "live_money_enabled on state");
forbid("money feature defaults", moneyFlags, /payouts_enabled:\s*["']on["']/, "payouts on state");
forbid("money feature defaults", moneyFlags, /payable_balances_enabled:\s*["']on["']/, "payable balances on state");

if (failures.length) {
  console.error("Watch-Party realtime callback policy guard failed:");
  failures.forEach((failure) => console.error(`- ${failure}`));
  process.exit(1);
}

console.log("Watch-Party realtime callback policy guard passed.");
console.log("- no readback-only closeout, physical phone sideload, diagnostic-emulator Play proof, production submission, provider mutation, money activation, payout/refund execution, or secret/private-data exposure was introduced.");
