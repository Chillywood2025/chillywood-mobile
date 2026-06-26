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

const forbidMatch = (label, content, pattern, description) => {
  if (pattern.test(content)) failures.push(`${label} contains forbidden ${description}`);
};

const forbidPositiveSentence = (label, content, pattern, description) => {
  const sentences = content
    .split(/(?<=[.\n])\s+/)
    .map((sentence) => sentence.trim())
    .filter(Boolean);
  const allowed = /\b(?:no|not|did not|do not|unless explicitly owner-approved|not approved|without)\b/i;
  const hit = sentences.find((sentence) => pattern.test(sentence) && !allowed.test(sentence));
  if (hit) failures.push(`${label} contains forbidden ${description}: ${hit}`);
};

const doc = read("docs/release/TESTER_DELIVERY_VISIBLE_SURFACE_ACTIVE_WIRING.md");
const featureFlags = read("_lib/featureFlags.ts");
const moneyFlags = read("_lib/moneyFeatureFlags.ts");
const appJson = read("app.json");

[
  "Visible-surface active wiring tester delivery: Closed / Partial / Blocked",
  "Delivery classification: EAS Update eligible",
  "Tester Instructions",
  "Sideload is not an approved tester delivery path",
  "No APK sideload was used",
  "No Play production submission happened",
  "No provider mutation happened",
  "liveMoneyEnabled remains OFF",
  "Payouts, cashout, Stripe Connect production, payable balances, withdrawals, transfers, provider refunds, and automatic refunds remain OFF",
].forEach((needle) => requireText("visible-surface tester delivery doc", doc, needle));

forbidPositiveSentence("visible-surface tester delivery doc", doc, /sideload (?:is|was|recommended|used|proves|proof)/i, "sideload tester delivery");
forbidPositiveSentence("visible-surface tester delivery doc", doc, /APK sideload (?:is|was|recommended|used|proves|proof)/i, "APK sideload tester proof");
forbidPositiveSentence("visible-surface tester delivery doc", doc, /Play production submission happened|submitted? to Play production|promoted? to production/i, "Play production submission");
forbidPositiveSentence("visible-surface tester delivery doc", doc, /provider mutation happened|mutated provider|provider dashboards? mutated/i, "provider mutation");
forbidPositiveSentence("visible-surface tester delivery doc", doc, /provider refunds? (?:are|were|became) executable|provider refunds? executed/i, "provider refund execution");
forbidPositiveSentence("visible-surface tester delivery doc", doc, /Premium annual (?:is|was|became) live/i, "Premium annual live claim");
forbidPositiveSentence("visible-surface tester delivery doc", doc, /Creator Channel Subscription (?:is|was|became) live/i, "Creator Channel Subscription live claim");

requireText("app.json", appJson, "\"package\": \"com.chillywood.mobile\"");
forbidMatch("app.json", appJson, /"package"\s*:\s*"(?!com\.chillywood\.mobile")/, "unexpected package ID");

forbidMatch("runtime feature flags", featureFlags, /premiumPurchaseEnabled:\s*true/, "Premium public purchase activation");
forbidMatch("runtime feature flags", featureFlags, /liveMoneyEnabled:\s*true/, "liveMoneyEnabled activation");
forbidMatch("runtime feature flags", featureFlags, /payoutsEnabled:\s*true/, "payout activation");
forbidMatch("runtime feature flags", featureFlags, /cashoutEnabled:\s*true/, "cashout activation");
forbidMatch("runtime feature flags", featureFlags, /stripeConnectProductionEnabled:\s*true/, "Stripe Connect production activation");
forbidMatch("runtime feature flags", featureFlags, /merchStoreEnabled:\s*true/, "merch activation");

forbidMatch("money feature defaults", moneyFlags, /live_money_enabled:\s*["']on["']/, "live_money_enabled on state");
forbidMatch("money feature defaults", moneyFlags, /payouts_enabled:\s*["']on["']/, "payouts on state");
forbidMatch("money feature defaults", moneyFlags, /paid_content_enabled:\s*["']on["']/, "paid content on state");
forbidMatch("money feature defaults", moneyFlags, /tips_enabled:\s*["']on["']/, "tips on state");
forbidMatch("money feature defaults", moneyFlags, /merch_enabled:\s*["']on["']/, "merch on state");

if (failures.length) {
  console.error("Visible-surface tester delivery policy guard failed:");
  failures.forEach((failure) => console.error(`- ${failure}`));
  process.exit(1);
}

console.log("Visible-surface tester delivery policy guard passed.");
console.log("- no sideload tester path, production submission, provider mutation, money activation, provider refund execution, or package change was introduced.");
