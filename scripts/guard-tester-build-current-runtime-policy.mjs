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

const delivery = read("docs/release/TESTER_BUILD_CURRENT_RUNTIME_DELIVERY.md");
const finalPacket = read("docs/release/FINAL_STORE_RELEASE_READINESS_PLAY_SUBMISSION_PACKET.md");
const goNoGo = read("docs/FINAL_PUBLIC_USE_GO_NO_GO.md");
const checklist = read("docs/FINAL_PRODUCTION_READINESS_CHECKLIST.md");
const featureFlags = read("_lib/featureFlags.ts");
const moneyFlags = read("_lib/moneyFeatureFlags.ts");
const appJson = read("app.json");

const docs = [
  ["tester delivery doc", delivery],
  ["final release packet", finalPacket],
  ["go/no-go", goNoGo],
  ["final readiness checklist", checklist],
];

for (const [label, content] of docs) {
  forbidMatch(label, content, /submitted the app to production(?![^.\n]*did not)/i, "production Play submission claim");
  forbidMatch(label, content, /mutated (?:Google Play|RevenueCat|Stripe|provider dashboards?)(?![^.\n]*did not)/i, "provider mutation claim");
  forbidMatch(label, content, /Premium public purchase (?:is|now|currently)\s*(?:enabled|live|available)/i, "Premium public purchase live claim");
  forbidMatch(label, content, /live_money_enabled (?:is|=|:)\s*(?:ON|on|enabled|true)/i, "live_money_enabled activation claim");
  forbidMatch(label, content, /creator-money (?:is|now|currently)\s*(?:enabled|live|available)/i, "creator-money live claim");
  forbidMatch(label, content, /payouts? (?:are|is|now|currently)\s*(?:enabled|live|available)/i, "payout live claim");
  forbidMatch(label, content, /Stripe Connect (?:is|now|currently)\s*(?:enabled|live|available)/i, "Stripe Connect live claim");
  forbidMatch(label, content, /merch checkout (?:is|now|currently)\s*(?:enabled|live|available)/i, "merch checkout live claim");
  forbidMatch(label, content, /provider refunds? (?:are|is|now|currently)\s*(?:automatic|automated|executable|enabled|live)/i, "provider refund automation claim");
  forbidMatch(label, content, /(?:password|token|service-role key|api key|webhook secret)\s*[:=]\s*[`'"]?[A-Za-z0-9_!@#$%^&*().+=/-]{8,}/i, "credential assignment");
  forbidMatch(label, content, /(?:https?:\/\/[^\s)]*(?:X-Goog-Signature|token=|signature=|signed)[^\s)]*)/i, "signed URL");
  forbidMatch(label, content, /\b(?:\d{1,3}\.){3}\d{1,3}\b/, "raw IPv4 address");
  forbidMatch(label, content, /(?:AIza[0-9A-Za-z_-]{20,}|sk_(?:live|test)_[0-9A-Za-z]{16,}|rk_(?:live|test)_[0-9A-Za-z]{16,}|-----BEGIN (?:RSA |EC |OPENSSH |)PRIVATE KEY-----|\"private_key\"\s*:|eyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{10,})/, "credential-like material");
}

[
  "This lane did not submit the app to production",
  "This lane did not mutate Google Play, RevenueCat, Stripe, payouts, purchases, refunds, or provider dashboards",
  "Tester Instructions",
  "Known Disabled Systems",
  "Rollback Instructions",
].forEach((needle) => requireText("tester delivery doc", delivery, needle));

requireText("app.json", appJson, "\"package\": \"com.chillywood.mobile\"");
requireText("app.json", appJson, "\"runtimeVersion\": \"1.0.0\"");

forbidMatch("app.json", appJson, /\"package\"\s*:\s*\"(?!com\.chillywood\.mobile\")/, "unexpected package ID");
forbidMatch("runtime feature flags", featureFlags, /premiumPurchaseEnabled:\s*true/, "Premium public purchase activation");
forbidMatch("runtime feature flags", featureFlags, /liveMoneyEnabled:\s*true/, "live money activation");
forbidMatch("runtime feature flags", featureFlags, /payoutsEnabled:\s*true/, "payout activation");
forbidMatch("runtime feature flags", featureFlags, /stripeConnectProductionEnabled:\s*true/, "Stripe Connect activation");
forbidMatch("runtime feature flags", featureFlags, /merchStoreEnabled:\s*true/, "merch activation");
forbidMatch("money feature defaults", moneyFlags, /live_money_enabled:\s*["']on["']/, "live_money_enabled on state");
forbidMatch("money feature defaults", moneyFlags, /payouts_enabled:\s*["']on["']/, "payouts on state");
forbidMatch("money feature defaults", moneyFlags, /paid_content_enabled:\s*["']on["']/, "paid content on state");
forbidMatch("money feature defaults", moneyFlags, /tips_enabled:\s*["']on["']/, "tips on state");
forbidMatch("money feature defaults", moneyFlags, /merch_enabled:\s*["']on["']/, "merch on state");

if (failures.length) {
  console.error("Tester build/current runtime delivery policy guard failed:");
  failures.forEach((failure) => console.error(`- ${failure}`));
  process.exit(1);
}

console.log("Tester build/current runtime delivery policy guard passed.");
console.log("- no production submission, provider mutation, money activation, package change, or secret exposure was introduced.");
