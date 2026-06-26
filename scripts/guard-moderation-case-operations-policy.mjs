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

const doc = read("docs/legal/MODERATION_CASE_OPERATIONS_COMPLETION.md");
const queueDoc = read("docs/legal/MODERATION_QUEUE_CASE_MANAGEMENT_ESCALATION_GOVERNANCE.md");
const moderatorDoc = read("docs/admin/MODERATOR_ROLE_SCOPE_AND_SUPPORT_DUTIES.md");
const auditDoc = read("docs/admin/AUDIT_LOG_INTEGRITY_PRIVILEGED_ACTION_EVIDENCE.md");
const publicDoc = read("docs/PUBLIC_NON_MONEY_FEATURE_ENABLEMENT_SWITCHBOARD.md");
const featureFlags = read("_lib/featureFlags.ts");
const moneyFlags = read("_lib/moneyFeatureFlags.ts");
const packageJson = read("package.json");

[
  "Case assignment is exact-scope, case-bound, and audited where backed",
  "Internal notes are private, scoped, sanitized, and audited where backed",
  "Internal notes are never user-facing",
  "Universal canned reasons are templates only",
  "Canned reasons still require human review",
  "Coordinated-report detection is flags/signals only",
  "Coordinated-report detection does not auto-punish",
  "Repeated-offender aggregation is review/risk flags only",
  "Repeated-offender aggregation does not auto-punish",
  "Malicious reporting is handled without exposing reporter identity",
  "Urgent-report SLA owner and escalation are documented",
  "No auto-ban, auto-delete, auto-suspend, auto-restrict, auto-hide, or auto-punishment was added",
  "Safe public non-money systems remain enabled",
  "live_money_enabled remains OFF",
  "Creator-money remains OFF",
  "Premium public purchase remains OFF",
  "Payouts, payable balances, withdrawals, cash-out, transfers, Stripe Connect, merch checkout, and payout movement remain OFF",
  "No Google Play, RevenueCat, Stripe, payout, purchase, refund, or provider mutation happened",
].forEach((needle) => requireText("moderation case operations doc", doc, needle));

[
  "The remaining moderation case operations follow-ups are closed as safe human-review operations",
].forEach((needle) => requireText("queue governance doc", queueDoc, needle));

[
  "cannot turn coordinated-report or repeated-offender signals into automatic punishment",
].forEach((needle) => requireText("moderator scope doc", moderatorDoc, needle));

[
  "coordinated-report flags, repeated-offender flags, malicious-report flags",
].forEach((needle) => requireText("audit governance doc", auditDoc, needle));

[
  "Safe public non-money systems remain enabled",
].forEach((needle) => requireText("public switchboard doc", publicDoc, needle));

[
  "proof:moderation-case-operations-completion",
  "guard:moderation-case-operations-policy",
].forEach((needle) => requireText("package scripts", packageJson, needle));

const docsToScan = [
  ["moderation case operations doc", doc],
  ["moderation queue governance doc", queueDoc],
  ["moderator scope doc", moderatorDoc],
];

for (const [label, content] of docsToScan) {
  forbidMatch(label, content, /(?:auto-ban|auto-delete|auto-suspend|auto-restrict|auto-hide|auto-punish(?:ment)?) (?:is|are|was|were|will be|can be|should be|must be) (?:enabled|allowed|triggered|executed|performed|supported|active)/i, "automatic punishment allowance");
  forbidMatch(label, content, /coordinated-report detection (?:auto-punishes|auto-punish|automatically punishes|automatically bans|automatically deletes|automatically suspends|automatically restricts|automatically hides)/i, "punitive coordinated-report detection");
  forbidMatch(label, content, /repeated-offender aggregation (?:auto-punishes|auto-punish|automatically punishes|automatically bans|automatically deletes|automatically suspends|automatically restricts|automatically hides)/i, "punitive repeated-offender aggregation");
  forbidMatch(label, content, /internal notes? (?:are|is) (?:public|user-facing)|show internal notes? to (?:reporter|reported user|creator|public)/i, "public internal notes");
  forbidMatch(label, content, /internal notes? (?:may|can|should|must) expose (?:reporter identity|private evidence|raw logs|payment\/provider data|provider data|legal conclusions)/i, "unsafe internal note exposure");
  forbidMatch(label, content, /canned reasons? (?:replace|replaces|skip|skips|remove|removes) human review/i, "canned reasons replacing human review");
  forbidMatch(label, content, /Moderator (?:receives|has|can use|may use) broad (?:non-scoped|unscoped|Admin|Owner|moderation|case-management) authority/i, "broad Moderator authority");
  forbidMatch(label, content, /reporter identity (?:is|may be|can be) exposed/i, "reporter identity exposure");
  forbidMatch(label, content, /private evidence (?:is|may be|can be) exposed/i, "private evidence exposure");
  forbidMatch(label, content, /(?:expose|show|print|include in artifacts|commit) (?:raw storage paths?|signed URLs?|raw IPs?|push tokens?|LiveKit tokens?|provider secrets?|payment credentials?|tax IDs?|bank details?|service-role keys?|OAuth tokens?|private dashboard data)/i, "secret/private-data exposure allowance");
}

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

forbidMatch("moderation case operations doc", doc, /Premium annual (?:is|now|currently)?\s*(?:live|enabled|available now)/i, "Premium annual live claim");
forbidMatch("moderation case operations doc", doc, /Creator Channel Subscription (?:is|now|currently)?\s*(?:live|enabled|available now)/i, "Creator Channel Subscription live claim");
forbidMatch("moderation case operations doc", doc, /creator-money (?:is|now|currently)?\s*(?:live|enabled|available now)/i, "creator-money live claim");
forbidMatch("moderation case operations doc", doc, /payouts? (?:are|is) (?:live|enabled|available now)/i, "payout live claim");
forbidMatch("moderation case operations doc", doc, /Stripe Connect (?:is|now|currently)?\s*(?:live|enabled|available now)/i, "Stripe Connect live claim");
forbidMatch("moderation case operations doc", doc, /merch checkout (?:is|now|currently)?\s*(?:live|enabled|available now)/i, "merch checkout live claim");

if (failures.length) {
  console.error("Moderation case operations policy guard failed:");
  failures.forEach((failure) => console.error(`- ${failure}`));
  process.exit(1);
}

console.log("Moderation case operations policy guard passed.");
console.log("- assignment, internal notes, canned reasons, coordinated-report signals, repeated-offender flags, malicious-report handling, and SLA ownership remain exact-scope, human-review, privacy-safe, and audited where backed.");
console.log("- no automatic punishment, broad Moderator authority, money activation, provider mutation, or private-data exposure is introduced.");
