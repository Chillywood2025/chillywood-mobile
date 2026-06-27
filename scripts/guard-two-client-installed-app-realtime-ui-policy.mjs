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
  const allowed = /\b(?:no|not|did not|do not|must not|without|unless|diagnostic|emulator-only|owner-approved|Partial|Blocked|pending|required|requires|not accepted|not rerun|not run|OFF|manual\/external)\b/i;
  const hit = content
    .split(/(?<=[.\n])\s+/)
    .map((sentence) => sentence.trim())
    .filter(Boolean)
    .find((sentence) => pattern.test(sentence) && !allowed.test(sentence));
  if (hit) failures.push(`${label} contains forbidden ${description}: ${hit}`);
};

const doc = read("docs/release/TWO_CLIENT_INSTALLED_APP_REALTIME_UI_PROOF.md");
const featureFlags = read("_lib/featureFlags.ts");
const moneyFlags = read("_lib/moneyFeatureFlags.ts");

[
  "Final verdict: Partial",
  "R3CXA0DS5JV",
  "R5CR120QCBF",
  "Google Play internal/closed testing",
  "versionCode `57`",
  "com.android.vending",
  "Two physical Play-internal v57 Android clients were used",
  "R3CXA0DS5JV and R5CR120QCBF were both active clients",
  "Watch-Party realtime callback remains Closed",
  "Diagnostic sideloaded emulator is not accepted as Play-internal UI proof",
  "Matrix totals: 5 Closed, 4 Partial, 0 Blocked, 0 Failed",
  "No sideload was used on either physical tester phone",
  "No uninstall/reinstall/clear-data happened",
  "No Play production submission happened",
  "No provider mutation happened",
  "liveMoneyEnabled remains OFF",
].forEach((needle) => requireText("two-client installed app realtime UI proof doc", doc, needle));

forbidPositiveSentence("two-client installed app realtime UI proof doc", doc, /single active client.*full realtime|one active client.*full realtime|only one active client.*Closed/i, "one-client full realtime claim");
forbidPositiveSentence("two-client installed app realtime UI proof doc", doc, /diagnostic sideloaded emulator .*Play-internal UI proof|emulator-only diagnostic .*full installed-app realtime UI proof/i, "diagnostic emulator claimed as Play-internal UI proof");
forbidPositiveSentence("two-client installed app realtime UI proof doc", doc, /Play production submission happened|submitted? to production|promoted? to production/i, "Play production submission");
forbidPositiveSentence("two-client installed app realtime UI proof doc", doc, /provider mutation happened|mutated provider|Google Play product|base-plan mutation|RevenueCat mapping change|Stripe mutation/i, "provider mutation");
forbidPositiveSentence("two-client installed app realtime UI proof doc", doc, /provider refunds? executed|refunds? executed|payouts? executed|cashout executed|withdrawals? executed|transfers? executed/i, "refund/payout execution");
forbidPositiveSentence("two-client installed app realtime UI proof doc", doc, /LiveKit tokens? exposed|push tokens? exposed|signed URLs? exposed|raw IPs? exposed|private messages? exposed|private evidence exposed|secrets? exposed/i, "secret/private realtime data exposure");

forbid("two-client installed app realtime UI proof doc", doc, /(PASSWORD|PASSCODE)\s*=\s*['"]?[^<\s][^\s]{8,}/i, "password value");
forbid("two-client installed app realtime UI proof doc", doc, /(SUPABASE_SERVICE_ROLE_KEY|SERVICE_ROLE_KEY)\s*=\s*['"]?[A-Za-z0-9._-]{20,}/, "service-role key value");
forbid("two-client installed app realtime UI proof doc", doc, /eyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{10,}/, "JWT/token");
forbid("two-client installed app realtime UI proof doc", doc, /https?:\/\/[^\s)]*(?:token|signature|X-Amz-Signature|Expires|Key-Pair-Id)[^\s)]*/i, "signed URL");
forbid("two-client installed app realtime UI proof doc", doc, /\b(?:\d{1,3}\.){3}\d{1,3}\b/, "raw IP");

forbid("runtime feature flags", featureFlags, /liveMoneyEnabled:\s*true/, "liveMoneyEnabled activation");
forbid("runtime feature flags", featureFlags, /payoutsEnabled:\s*true/, "payout activation");
forbid("runtime feature flags", featureFlags, /cashoutEnabled:\s*true/, "cashout activation");
forbid("runtime feature flags", featureFlags, /stripeConnectProductionEnabled:\s*true/, "Stripe Connect production activation");
forbid("money feature defaults", moneyFlags, /live_money_enabled:\s*["']on["']/, "live_money_enabled on state");
forbid("money feature defaults", moneyFlags, /payouts_enabled:\s*["']on["']/, "payouts on state");
forbid("money feature defaults", moneyFlags, /payable_balances_enabled:\s*["']on["']/, "payable balances on state");

if (failures.length) {
  console.error("two-client installed app realtime UI policy guard failed:");
  failures.forEach((failure) => console.error(`- ${failure}`));
  process.exit(1);
}

console.log("two-client installed app realtime UI policy guard passed.");
console.log("- no one-client closeout, diagnostic-emulator Play proof, production submission, provider mutation, money activation, payout/refund execution, or secret/private-data exposure was introduced.");
