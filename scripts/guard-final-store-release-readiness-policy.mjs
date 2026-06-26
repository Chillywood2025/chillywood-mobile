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

const releaseDoc = read("docs/release/FINAL_STORE_RELEASE_READINESS_PLAY_SUBMISSION_PACKET.md");
const goNoGo = read("docs/FINAL_PUBLIC_USE_GO_NO_GO.md");
const finalChecklist = read("docs/FINAL_PRODUCTION_READINESS_CHECKLIST.md");
const dataSafety = read("docs/google-play/DATA_SAFETY_EVIDENCE_MAP.md");
const playFields = read("docs/google-play/PLAY_CONSOLE_FIELD_BY_FIELD_ANSWERS.md");
const reviewerPacket = read("docs/google-play/PLAY_REVIEWER_TEST_ACCOUNT_PACKET.md");
const publicSwitchboard = read("docs/PUBLIC_NON_MONEY_FEATURE_ENABLEMENT_SWITCHBOARD.md");
const provider = read("docs/ops/PROVIDER_DASHBOARD_OWNERSHIP_ACCESS_GOVERNANCE.md");
const seeded = read("docs/admin/OWNER_ADMIN_MODERATOR_PRODUCTION_AUTHORITY_SEEDED_DEVICE_PROOF.md");
const money = read("docs/admin/MONEY_ADMIN_AUTHORITY_ACTIVATION_GOVERNANCE.md");
const legal = read("docs/legal/LEGAL_PRIVACY_DATA_SAFETY_FINAL_ALIGNMENT.md");
const monitoring = read("docs/monitoring/MONITORING_ANALYTICS_CRASH_RUNTIME_DIAGNOSTICS.md");
const featureFlags = read("_lib/featureFlags.ts");
const moneyFlags = read("_lib/moneyFeatureFlags.ts");
const packageJson = read("package.json");

[
  "This lane did not submit the app to production",
  "This lane did not mutate Google Play, RevenueCat, Stripe, payouts, purchases, refunds, or provider dashboards",
  "Safe public non-money systems remain enabled",
  "live_money_enabled remains OFF",
  "Creator-money remains OFF",
  "Premium public purchase remains OFF",
  "Premium monthly public purchase remains a separate owner-approved proof lane",
  "Premium annual remains Google Play base-plan provider-blocked",
  "Creator Channel Subscription remains Google Play base-plan provider-blocked",
  "Payouts, payable balances, withdrawals, cash-out, transfers, Stripe Connect, merch checkout, and payout movement remain OFF",
  "Provider refunds remain manual/external",
  "Data Safety evidence map matches actual app behavior",
  "Account deletion is documented and reachable",
  "Legal/support/DMCA/privacy/terms surfaces are documented",
  "UGC/reporting/moderation policy is documented",
  "App Access/reviewer packet is sanitized and does not commit credentials",
  "Provider dashboard private proof remains owner-confirmation-required",
  "Final Play Console acceptance remains owner/store external",
  "Final release build/smoke remains a release operation unless explicitly run in this lane",
].forEach((needle) => requireText("final release packet", releaseDoc, needle));

[
  ["final go/no-go", goNoGo],
  ["final production readiness checklist", finalChecklist],
  ["Data Safety evidence map", dataSafety],
  ["Play field answers", playFields],
  ["reviewer packet", reviewerPacket],
  ["public switchboard", publicSwitchboard],
  ["provider dashboard governance", provider],
  ["seeded device proof", seeded],
  ["money governance", money],
  ["legal alignment", legal],
  ["monitoring alignment", monitoring],
].forEach(([label, content]) => {
  requireText(label, content, "docs/release/FINAL_STORE_RELEASE_READINESS_PLAY_SUBMISSION_PACKET.md");
});

const docsToScan = [
  ["final release packet", releaseDoc],
  ["final go/no-go", goNoGo],
  ["final production readiness checklist", finalChecklist],
  ["Data Safety evidence map", dataSafety],
  ["Play field answers", playFields],
  ["reviewer packet", reviewerPacket],
  ["public switchboard", publicSwitchboard],
  ["provider dashboard governance", provider],
  ["seeded device proof", seeded],
  ["money governance", money],
  ["legal alignment", legal],
  ["monitoring alignment", monitoring],
];

for (const [label, content] of docsToScan) {
  forbidMatch(label, content, /This lane (?:submitted|submits|will submit) the app to production(?![^.\n]*did not)/i, "production submission claim");
  forbidMatch(label, content, /This lane (?:mutated|changed|created|edited|activated) (?:Google Play|RevenueCat|Stripe|provider dashboards?)/i, "provider mutation claim");
  forbidMatch(label, content, /Premium public purchase (?:is|now|currently)\s*(?:enabled|live|available)/i, "Premium public purchase live claim");
  forbidMatch(label, content, /Premium annual (?:is|now|currently)\s*(?:enabled|live|available|buyable)/i, "Premium annual live claim");
  forbidMatch(label, content, /Creator Channel Subscription (?:is|now|currently)\s*(?:enabled|live|available|buyable)/i, "Creator Channel Subscription live claim");
  forbidMatch(label, content, /creator-money (?:is|now|currently)\s*(?:enabled|live|available)/i, "creator-money live claim");
  forbidMatch(label, content, /live_money_enabled (?:is|=|:)\s*(?:ON|on|enabled|true)/i, "live_money_enabled enabled claim");
  forbidMatch(label, content, /payouts? (?:are|is|now|currently)\s*(?:enabled|live|available)/i, "payout live claim");
  forbidMatch(label, content, /Stripe Connect (?:is|now|currently)\s*(?:enabled|live|available)/i, "Stripe Connect live claim");
  forbidMatch(label, content, /merch checkout (?:is|now|currently)\s*(?:enabled|live|available)/i, "merch checkout live claim");
  forbidMatch(label, content, /provider refunds? (?:are|is|now|currently)\s*(?:automatic|automated|executable|enabled|live)/i, "provider refund automation claim");
  forbidMatch(label, content, /(?:password|reviewer password|proof password)\s*[:=]\s*[`'"]?[A-Za-z0-9_!@#$%^&*().+=-]{8,}/i, "password assignment");
  forbidMatch(label, content, /(?:AIza[0-9A-Za-z_-]{20,}|sk_(?:live|test)_[0-9A-Za-z]{16,}|rk_(?:live|test)_[0-9A-Za-z]{16,}|-----BEGIN (?:RSA |EC |OPENSSH |)PRIVATE KEY-----|\"private_key\"\\s*:|service_role_[A-Za-z0-9_-]{12,}|eyJ[A-Za-z0-9_-]{20,}\\.[A-Za-z0-9_-]{20,}\\.[A-Za-z0-9_-]{10,})/, "credential-like material");
}

forbidMatch("runtime feature flags", featureFlags, /premiumPurchaseEnabled:\s*true/, "Premium public purchase activation");
forbidMatch("runtime feature flags", featureFlags, /paidContentCheckoutEnabled:\s*true/, "paid content checkout activation");
forbidMatch("runtime feature flags", featureFlags, /tipsEnabled:\s*true/, "tips activation");
forbidMatch("runtime feature flags", featureFlags, /merchStoreEnabled:\s*true/, "merch activation");
forbidMatch("runtime feature flags", featureFlags, /cashoutEnabled:\s*true/, "cash-out activation");
forbidMatch("runtime feature flags", featureFlags, /payoutsEnabled:\s*true/, "payout activation");
forbidMatch("runtime feature flags", featureFlags, /stripeConnectProductionEnabled:\s*true/, "Stripe Connect activation");
forbidMatch("runtime feature flags", featureFlags, /liveMoneyEnabled:\s*true/, "live money activation");

forbidMatch("money feature defaults", moneyFlags, /live_money_enabled:\s*["']on["']/, "live_money_enabled on state");
forbidMatch("money feature defaults", moneyFlags, /payouts_enabled:\s*["']on["']/, "payouts on state");
forbidMatch("money feature defaults", moneyFlags, /paid_content_enabled:\s*["']on["']/, "paid content on state");
forbidMatch("money feature defaults", moneyFlags, /tips_enabled:\s*["']on["']/, "tips on state");
forbidMatch("money feature defaults", moneyFlags, /merch_enabled:\s*["']on["']/, "merch on state");

[
  "proof:final-store-release-readiness-play-submission-packet",
  "guard:final-store-release-readiness-policy",
].forEach((needle) => requireText("package scripts", packageJson, needle));

if (failures.length) {
  console.error("Final store/release readiness policy guard failed:");
  failures.forEach((failure) => console.error(`- ${failure}`));
  process.exit(1);
}

console.log("Final store/release readiness policy guard passed.");
console.log("- no production submission/provider mutation/money activation claims were introduced.");
console.log("- reviewer packet remains sanitized and credentials are not committed.");
console.log("- public non-money systems, legal/Data Safety, role/staff/audit/search/moderation, and money-off boundaries remain guarded.");
