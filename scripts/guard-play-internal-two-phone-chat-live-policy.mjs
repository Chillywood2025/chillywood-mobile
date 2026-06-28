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

const hasNegation = (sentence) => /\b(no|not|never|without|cannot|can't|must not|is not|are not|was not|were not|did not|do not|does not|pending|Partial|Blocked|could not|unless|requires|unavailable|cannot be read|not proved|not confirmed)\b/i.test(sentence);

const forbidSentence = (label, content, predicate, description) => {
  for (const sentence of sentences(content)) {
    if (predicate(sentence)) fail(`${label} contains forbidden ${description}: "${sentence.slice(0, 240)}"`);
  }
};

const doc = read("docs/release/PLAY_INTERNAL_TWO_PHONE_CHAT_LIVE_PROOF.md");
const featureFlags = read("_lib/featureFlags.ts");
const moneyFlags = read("_lib/moneyFeatureFlags.ts");

[
  "Device List",
  "Update Pickup Evidence",
  "R5CR120QCBF",
  "R3CXA0DS5JV",
  "Active update ID could not be confirmed",
  "Chat Video Scenario 1 Result",
  "Status: Partial.",
  "Live Remote Video Result",
  "Premium-required",
  "No sideload, uninstall, reinstall, or clear-data happened",
  "No auth/RLS/Premium/chat/account-status/staff permission weakening happened",
  "No provider/live-money mutation happened",
  "liveMoneyEnabled remains OFF",
].forEach((needle) => requireText("play internal two phone proof doc", doc, needle));

forbidSentence("play internal two phone proof doc", doc, (sentence) => (
  /Play-internal two-phone Chat\/Live proof:\s*Closed|Verdict:\s*Closed|actual-user.*Closed/i.test(sentence)
  && !hasNegation(sentence)
), "Closed actual-user claim");

forbidSentence("play internal two phone proof doc", doc, (sentence) => (
  /source fixed|EAS Update published|proof scripts passing|backend|readback/i.test(sentence)
  && /installed-app proof|actual-user Closed|actual user Closed/i.test(sentence)
  && !hasNegation(sentence)
), "source/EAS/backend evidence counted as installed-app Closed");

forbidSentence("play internal two phone proof doc", doc, (sentence) => (
  /one attached device|one phone|single phone/i.test(sentence)
  && /two-phone.*Closed|two-client.*Closed/i.test(sentence)
  && !hasNegation(sentence)
), "one-phone evidence counted as two-phone Closed");

forbidSentence("play internal two phone proof doc", doc, (sentence) => (
  /Chat remote video|Chat video|Scenario 1|Scenario 2|Scenario 3|background\/push|ringing/i.test(sentence)
  && /\bClosed\b/i.test(sentence)
  && !hasNegation(sentence)
), "Chat video/background ringing Closed while Partial");

forbidSentence("play internal two phone proof doc", doc, (sentence) => (
  /Live remote video|Live host controls|Live Stage|host-control/i.test(sentence)
  && /\bClosed\b/i.test(sentence)
  && !hasNegation(sentence)
), "Live proof Closed while Partial");

forbidSentence("play internal two phone proof doc", doc, (sentence) => (
  /sideload|APK install|uninstall|reinstall|clear-data|clear data/i.test(sentence)
  && /happened|used|performed|installed/i.test(sentence)
  && !hasNegation(sentence)
), "physical phone sideload/destructive action claim");

forbidSentence("play internal two phone proof doc", doc, (sentence) => (
  /auth|RLS|Premium|chat permission|account-status|staff permission/i.test(sentence)
  && /weakened|bypassed|disabled|turned off/i.test(sentence)
  && !hasNegation(sentence)
), "auth/RLS/Premium/chat/account-status/staff weakening");

forbidSentence("play internal two phone proof doc", doc, (sentence) => (
  /provider mutation|Google Play product|base-plan|RevenueCat|Stripe|provider dashboard|Play production/i.test(sentence)
  && /happened|mutated|changed|applied|executed|submitted/i.test(sentence)
  && !hasNegation(sentence)
), "provider or Play production mutation claim");

forbidSentence("play internal two phone proof doc", doc, (sentence) => (
  /Current First Owner/i.test(sentence)
  && /touched|modified|changed/i.test(sentence)
  && !hasNegation(sentence)
), "current First Owner touch");

forbidMatch("play internal two phone proof doc", doc, /(PASSWORD|PASSCODE)\s*=\s*['"]?[^<\s][^\s]{8,}/i, "password value");
forbidMatch("play internal two phone proof doc", doc, /(SUPABASE_SERVICE_ROLE_KEY|SERVICE_ROLE_KEY|SUPABASE_ANON_KEY)\s*=\s*['"]?[A-Za-z0-9._-]{20,}/, "Supabase key value");
forbidMatch("play internal two phone proof doc", doc, /eyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{10,}/, "JWT/token");
forbidMatch("play internal two phone proof doc", doc, /https?:\/\/[^\s)]*(?:token|signature|X-Amz-Signature|Expires|Key-Pair-Id)[^\s)]*/i, "signed URL");
forbidMatch("play internal two phone proof doc", doc, /\b(?:\d{1,3}\.){3}\d{1,3}\b/, "raw IP value");

forbidMatch("runtime feature flags", featureFlags, /liveMoneyEnabled:\s*true/i, "liveMoneyEnabled ON");
forbidMatch("runtime feature flags", featureFlags, /payoutsEnabled:\s*true/i, "payouts enabled");
forbidMatch("runtime feature flags", featureFlags, /cashoutEnabled:\s*true/i, "cashout enabled");
forbidMatch("runtime feature flags", featureFlags, /stripeConnectProductionEnabled:\s*true/i, "Stripe Connect production enabled");
forbidMatch("runtime feature flags", featureFlags, /payableBalancesEnabled:\s*true/i, "payable balances enabled");
forbidMatch("runtime feature flags", featureFlags, /providerRefundsEnabled:\s*true/i, "provider refunds executable");
forbidMatch("money feature defaults", moneyFlags, /live_money_enabled:\s*["']on["']/i, "live_money_enabled ON");
forbidMatch("money feature defaults", moneyFlags, /payouts_enabled:\s*["']on["']/i, "payouts ON");
forbidMatch("money feature defaults", moneyFlags, /cashout_enabled:\s*["']on["']/i, "cashout ON");
forbidMatch("money feature defaults", moneyFlags, /stripe_connect_production_enabled:\s*["']on["']/i, "Stripe Connect production ON");
forbidMatch("money feature defaults", moneyFlags, /provider_refunds_enabled:\s*["']on["']/i, "provider refunds executable");
forbidMatch("money feature defaults", moneyFlags, /payable_balances_enabled:\s*["']on["']/i, "payable balances ON");

if (failures.length) {
  console.error("Play-internal two-phone Chat/Live policy guard failed:");
  failures.forEach((failure) => console.error(`- ${failure}`));
  process.exit(1);
}

console.log("Play-internal two-phone Chat/Live policy guard passed.");
console.log("- source/EAS/backend evidence cannot be counted as installed-app Closed, and Chat/Live remain Partial until visible two-phone proof closes.");
