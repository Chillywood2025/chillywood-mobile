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

const doc = read("docs/legal/MODERATION_QUEUE_CASE_MANAGEMENT_ESCALATION_GOVERNANCE.md");
const reportingDoc = read("docs/legal/REPORTING_MODERATION_PRODUCTION_WORKFLOW.md");
const moderatorDoc = read("docs/admin/MODERATOR_ROLE_SCOPE_AND_SUPPORT_DUTIES.md");
const auditDoc = read("docs/admin/AUDIT_LOG_INTEGRITY_PRIVILEGED_ACTION_EVIDENCE.md");
const publicDoc = read("docs/PUBLIC_NON_MONEY_FEATURE_ENABLEMENT_SWITCHBOARD.md");
const featureFlags = read("_lib/featureFlags.ts");
const moneyFlags = read("_lib/moneyFeatureFlags.ts");
const packageJson = read("package.json");

[
  "Reports route to separated queues where appropriate",
  "Live safety reports are urgent",
  "DMCA/legal reports are separate from general moderation",
  "Payment disputes are support/money cases, not general moderation",
  "Appeals are separate from initial moderation review",
  "Moderators can act only with exact scopes",
  "Internal notes are private, scoped, sanitized, and audited where backed",
  "Actions require reasons where backed",
  "Actions are reversible where backed",
  "User-facing notices are templated and privacy-safe",
  "Creator-facing notices are templated and privacy-safe",
  "Reporter identity is not exposed",
  "Private evidence is not exposed",
  "Repeated offenders are flagged where supported",
  "Coordinated reporting is detected where supported or documented as follow-up",
  "Malicious reporting is handled",
  "Urgent report SLA is documented",
  "Safe public non-money systems remain enabled",
  "live_money_enabled remains OFF",
  "Creator-money remains OFF",
  "Premium public purchase remains OFF",
  "Payouts, payable balances, withdrawals, cash-out, transfers, Stripe Connect, merch checkout, and payout movement remain OFF",
  "No Google Play, RevenueCat, Stripe, payout, purchase, refund, or provider mutation happened",
].forEach((needle) => requireText("moderation queue governance doc", doc, needle));

[
  "Normal reports, DMCA/legal, support, money/refund/access support, security incidents, and appeals are separated.",
].forEach((needle) => requireText("reporting workflow doc", reportingDoc, needle));

[
  "Moderator can perform support duties only with exact support scopes",
  "Moderator cannot perform account-wide suspension/restoration by default.",
].forEach((needle) => requireText("moderator scope doc", moderatorDoc, needle));

[
  "Moderation decisions are audited.",
].forEach((needle) => requireText("audit governance doc", auditDoc, needle));

[
  "Safe public non-money systems remain enabled",
].forEach((needle) => requireText("public switchboard doc", publicDoc, needle));

[
  "proof:moderation-queue-case-management-escalation-governance",
  "guard:moderation-queue-case-policy",
].forEach((needle) => requireText("package scripts", packageJson, needle));

forbidMatch("moderation queue governance doc", doc, /DMCA\/legal reports? (?:are|is) (?:mixed|combined|merged) into general moderation/i, "DMCA/legal mixed into general moderation");
forbidMatch("moderation queue governance doc", doc, /payment disputes? (?:are|is) general moderation/i, "payment disputes treated as general moderation");
forbidMatch("moderation queue governance doc", doc, /appeals? (?:are|is) (?:the same as|part of) initial moderation review/i, "appeals treated as initial moderation");
forbidMatch("moderation queue governance doc", doc, /Moderator (?:receives|has|can use|may use) broad (?:non-scoped|unscoped|Admin|Owner|emergency|moderation) authority/i, "broad Moderator authority");
forbidMatch("moderation queue governance doc", doc, /Moderator can (?:suspend|restore|deactivate|delete|restrict) accounts? by default/i, "default Moderator account restriction");
forbidMatch("moderation queue governance doc", doc, /internal notes? (?:are|is) public|internal notes? (?:are|is) user-facing|show internal notes? to (?:reporter|reported user|creator|public)/i, "public internal notes");
forbidMatch("moderation queue governance doc", doc, /notes?\/actions? (?:do not require|lack|without) audit/i, "notes/actions without audit policy");
forbidMatch("moderation queue governance doc", doc, /notices? (?:may|can|should) expose (?:reporter identity|private evidence|raw logs|payment\/provider data|legal conclusions)/i, "unsafe notice exposure");
forbidMatch("moderation queue governance doc", doc, /(?:hard-delete|hard delete) (?:is|as) (?:the )?default/i, "hard-delete default");
forbidMatch("moderation queue governance doc", doc, /Urgent report SLA (?:is optional|not required|missing)/i, "missing urgent SLA");
forbidMatch("moderation queue governance doc", doc, /repeated offenders? (?:are|is) not handled|malicious reporting (?:is|are) not handled/i, "missing repeated offender or malicious reporting handling");
forbidMatch("moderation queue governance doc", doc, /reporter identity (?:is|may be|can be) exposed/i, "reporter identity exposure");
forbidMatch("moderation queue governance doc", doc, /private evidence (?:is|may be|can be) exposed/i, "private evidence exposure");
forbidMatch("moderation queue governance doc", doc, /(?:expose|show|print|include in artifacts|commit) (?:raw storage paths?|signed URLs?|raw IPs?|push tokens?|LiveKit tokens?|provider secrets?|payment credentials?|tax IDs?|bank details?|service-role keys?|OAuth tokens?|private dashboard data)/i, "secret/private-data exposure allowance");

forbidMatch("runtime feature flags", featureFlags, /premiumPurchaseEnabled:\s*true/, "Premium public purchase activation");
forbidMatch("runtime feature flags", featureFlags, /paidContentCheckoutEnabled:\s*true/, "paid content checkout activation");
forbidMatch("runtime feature flags", featureFlags, /tipsEnabled:\s*true/, "tips activation");
forbidMatch("runtime feature flags", featureFlags, /merchStoreEnabled:\s*true/, "merch activation");
forbidMatch("runtime feature flags", featureFlags, /cashoutEnabled:\s*true/, "cash-out activation");
forbidMatch("runtime feature flags", featureFlags, /payoutsEnabled:\s*true/, "payout activation");
forbidMatch("runtime feature flags", featureFlags, /stripeConnectProductionEnabled:\s*true/, "Stripe Connect production activation");
forbidMatch("runtime feature flags", featureFlags, /liveMoneyEnabled:\s*true/, "live money activation");

forbidMatch("money feature defaults", moneyFlags, /live_money_enabled:\s*["']on["']/, "live_money_enabled on state");
forbidMatch("money feature defaults", moneyFlags, /payouts_enabled:\s*["']on["']/, "payouts on state");
forbidMatch("money feature defaults", moneyFlags, /paid_content_enabled:\s*["']on["']/, "paid content on state");
forbidMatch("money feature defaults", moneyFlags, /tips_enabled:\s*["']on["']/, "tips on state");
forbidMatch("money feature defaults", moneyFlags, /merch_enabled:\s*["']on["']/, "merch on state");

forbidMatch("moderation queue governance doc", doc, /Premium annual (?:is|now|currently)?\s*(?:live|enabled|available now)/i, "Premium annual live claim");
forbidMatch("moderation queue governance doc", doc, /Creator Channel Subscription (?:is|now|currently)?\s*(?:live|enabled|available now)/i, "Creator Channel Subscription live claim");
forbidMatch("moderation queue governance doc", doc, /creator-money (?:is|now|currently)?\s*(?:live|enabled|available now)/i, "creator-money live claim");
forbidMatch("moderation queue governance doc", doc, /payouts? (?:are|is) (?:live|enabled|available now)/i, "payout live claim");
forbidMatch("moderation queue governance doc", doc, /Stripe Connect (?:is|now|currently)?\s*(?:live|enabled|available now)/i, "Stripe Connect live claim");
forbidMatch("moderation queue governance doc", doc, /merch checkout (?:is|now|currently)?\s*(?:live|enabled|available now)/i, "merch checkout live claim");

if (failures.length) {
  console.error("Moderation queue case policy guard failed:");
  failures.forEach((failure) => console.error(`- ${failure}`));
  process.exit(1);
}

console.log("Moderation queue case policy guard passed.");
console.log("- queue separation, exact-scope Moderator authority, private notes, privacy-safe notices, urgent SLA, and malicious-report handling remain documented.");
console.log("- safe public non-money systems remain enabled while live money, creator-money, Premium public purchase, payouts, Stripe/merch, provider refunds, purchases, and provider mutation remain off/not performed.");
