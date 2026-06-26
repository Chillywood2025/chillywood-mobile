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
  const allowedDenial = /\b(?:no|did not|do not|not performed|avoided|without)\b/i;
  const hit = sentences.find((sentence) => pattern.test(sentence) && !allowedDenial.test(sentence));
  if (hit) failures.push(`${label} contains forbidden ${description}: ${hit}`);
};

const doc = read("docs/release/EVERY_VISIBLE_SURFACE_ACTIVE_WIRING_AUDIT.md");
const publicSwitchboard = read("docs/PUBLIC_NON_MONEY_FEATURE_ENABLEMENT_SWITCHBOARD.md");
const commandCenter = read("docs/admin/OWNER_ADMIN_COMMAND_CENTER_PRODUCTION_UI.md");
const moneyGovernance = read("docs/admin/MONEY_ADMIN_AUTHORITY_ACTIVATION_GOVERNANCE.md");
const finalPacket = read("docs/release/FINAL_STORE_RELEASE_READINESS_PLAY_SUBMISSION_PACKET.md");
const playInternal = read("docs/release/PLAY_INTERNAL_TEST_AAB_UPLOAD_TESTER_SMOKE.md");
const goNoGo = read("docs/FINAL_PUBLIC_USE_GO_NO_GO.md");
const checklist = read("docs/FINAL_PRODUCTION_READINESS_CHECKLIST.md");
const featureFlags = read("_lib/featureFlags.ts");
const moneyFlags = read("_lib/moneyFeatureFlags.ts");
const appJson = read("app.json");

const docs = [
  ["visible surface audit doc", doc],
  ["public switchboard", publicSwitchboard],
  ["Owner/Admin Command Center doc", commandCenter],
  ["money governance doc", moneyGovernance],
  ["final release packet", finalPacket],
  ["Play internal tester doc", playInternal],
  ["go/no-go", goNoGo],
  ["final readiness checklist", checklist],
];

for (const [label, content] of docs) {
  forbidMatch(label, /dead visible buttons? (?:are|is) acceptable/i.test(content) ? content : "", /dead visible buttons? (?:are|is) acceptable/i, "dead-button acceptance");
  forbidMatch(label, /visible controls? (?:may|can|should) (?:stay|remain|be) (?:hidden|disabled)/i.test(content) ? content : "", /visible controls? (?:may|can|should) (?:stay|remain|be) (?:hidden|disabled)/i, "hidden/disabled visible-control acceptance");
  forbidMatch(label, content, /unavailable tools are hidden or honestly disabled/i, "old disabled-tool doctrine");
  forbidMatch(label, content, /Kept disabled|Disabled unlock action while money off|Kept unavailable|Not available yet/i, "old disabled/unavailable money copy");
  forbidMatch(label, content, /public UI says proof\/debug\/internal/i, "public proof/debug/internal copy claim");
  forbidMatch(label, content, /money buttons? (?:are|is) fake|fake money button/i, "fake money button acceptance");
  forbidMatch(label, content, /permissions? (?:do|does) nothing/i, "permission-noop acceptance");
  forbidMatch(label, content, /normal users? gain admin access/i, "normal-user admin access");
  forbidMatch(label, content, /Moderator gains? (?:Admin|Owner) power/i, "Moderator Admin/Owner power");
  forbidMatch(label, content, /provider refunds? (?:are|is|become|became) (?:automatic|automated|executable)/i, "provider refund execution");
  forbidPositiveSentence(label, content, /provider mutation happened/i, "provider mutation claim");
  forbidPositiveSentence(label, content, /Google Play product\/base-plan mutation happened/i, "Google Play product mutation claim");
  forbidPositiveSentence(label, content, /RevenueCat mapping mutation happened/i, "RevenueCat mutation claim");
  forbidPositiveSentence(label, content, /Stripe mutation happened/i, "Stripe mutation claim");
  forbidMatch(label, content, /(?:password|token|service-role key|api key|webhook secret)\s*[:=]\s*[`'"]?[A-Za-z0-9_!@#$%^&*().+=/-]{8,}/i, "credential assignment");
  forbidMatch(label, content, /https?:\/\/[^\s)]*(?:X-Goog-Signature|token=|signature=|signed)[^\s)]*/i, "signed URL");
  forbidMatch(label, content, /\b(?:\d{1,3}\.){3}\d{1,3}\b/, "raw IPv4 address");
  forbidMatch(label, content, /(?:AIza[0-9A-Za-z_-]{20,}|sk_(?:live|test)_[0-9A-Za-z]{16,}|rk_(?:live|test)_[0-9A-Za-z]{16,}|-----BEGIN (?:RSA |EC |OPENSSH |)PRIVATE KEY-----|"private_key"\s*:|eyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{10,})/, "credential-like material");
}

[
  "No visible clickable dead buttons are allowed",
  "Nothing visible should be hidden or disabled",
  "Every visible control works, routes correctly, opens a setup/status/resolution flow, opens a support/review flow, or starts a tester-safe flow",
  "Permission scopes must unlock backed behavior",
  "Tester-visible monetization UX is separate from live money settlement",
  "liveMoneyEnabled remains OFF",
  "Payouts, cashout, Stripe Connect production, payable balances, withdrawals, transfers, provider refunds, and automatic refunds remain OFF",
  "No Google Play, RevenueCat, Stripe, payout, refund, purchase, or provider mutation happened",
].forEach((needle) => requireText("visible surface audit doc", doc, needle));

requireText("app.json", appJson, "\"package\": \"com.chillywood.mobile\"");
forbidMatch("app.json", appJson, /"package"\s*:\s*"(?!com\.chillywood\.mobile")/, "unexpected package ID");
forbidMatch("runtime feature flags", featureFlags, /premiumPurchaseEnabled:\s*true/, "Premium public purchase activation");
forbidMatch("runtime feature flags", featureFlags, /liveMoneyEnabled:\s*true/, "liveMoneyEnabled activation");
forbidMatch("runtime feature flags", featureFlags, /payoutsEnabled:\s*true/, "payout activation");
forbidMatch("runtime feature flags", featureFlags, /stripeConnectProductionEnabled:\s*true/, "Stripe Connect production activation");
forbidMatch("runtime feature flags", featureFlags, /merchStoreEnabled:\s*true/, "merch checkout activation");
forbidMatch("money feature defaults", moneyFlags, /live_money_enabled:\s*["']on["']/, "live_money_enabled on state");
forbidMatch("money feature defaults", moneyFlags, /payouts_enabled:\s*["']on["']/, "payouts on state");
forbidMatch("money feature defaults", moneyFlags, /paid_content_enabled:\s*["']on["']/, "paid content on state");
forbidMatch("money feature defaults", moneyFlags, /tips_enabled:\s*["']on["']/, "tips on state");
forbidMatch("money feature defaults", moneyFlags, /merch_enabled:\s*["']on["']/, "merch on state");

if (failures.length) {
  console.error("Every visible surface active wiring policy guard failed:");
  failures.forEach((failure) => console.error(`- ${failure}`));
  process.exit(1);
}

console.log("Every visible surface active wiring policy guard passed.");
console.log("- no dead-button acceptance, hidden/disabled visible-control doctrine, public proof/debug/internal copy claim, money activation, provider mutation, or secret exposure was introduced.");
