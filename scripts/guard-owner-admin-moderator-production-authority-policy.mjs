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

const doc = read("docs/admin/OWNER_ADMIN_MODERATOR_PRODUCTION_AUTHORITY_SEEDED_DEVICE_PROOF.md");
const hierarchy = read("docs/admin/STAFF_ROLE_HIERARCHY_PROOF.md");
const moderator = read("docs/admin/MODERATOR_ROLE_SCOPE_AND_SUPPORT_DUTIES.md");
const adminSearch = read("docs/admin/ADMIN_SEARCH_PRIVACY_EXPORT_GOVERNANCE.md");
const audit = read("docs/admin/AUDIT_LOG_INTEGRITY_PRIVILEGED_ACTION_EVIDENCE.md");
const publicSwitchboard = read("docs/PUBLIC_NON_MONEY_FEATURE_ENABLEMENT_SWITCHBOARD.md");
const featureFlags = read("_lib/featureFlags.ts");
const moneyFlags = read("_lib/moneyFeatureFlags.ts");
const adminUi = read("app/admin.tsx");
const packageJson = read("package.json");

[
  "Support is not a backend role",
  "`operator` remains the internal/backend Admin role",
  "Moderator remains separate from Admin/operator",
  "Non-admin users cannot reach Admin Command Center or Admin Search",
  "Moderator can act only with exact scopes and cannot gain Admin/Owner powers",
  "Moderator cannot gain LiveKit publish authority accidentally",
  "Admin Search requires exact scope and audit with masked query preview",
  "Destructive actions require reason and audit where backed",
  "Raw storage paths, signed URLs, tokens, raw IPs, provider IDs, payment credentials, tax IDs, bank details, private evidence, and reporter identity are not exposed",
  "Safe public non-money systems remain enabled",
  "live_money_enabled remains OFF",
  "Creator-money remains OFF",
  "Premium public purchase remains OFF",
  "Payouts, payable balances, withdrawals, cash-out, transfers, Stripe Connect, merch checkout, and payout movement remain OFF",
  "Provider refunds remain manual/external",
  "No Google Play, RevenueCat, Stripe, payout, purchase, refund, or provider mutation happened",
].forEach((needle) => requireText("seeded authority doc", doc, needle));

[
  "Support is not a backend role",
  "operator is the internal/backend alias for Admin",
  "Moderator is separate from Admin/operator",
].forEach((needle) => requireText("staff hierarchy", hierarchy, needle));

[
  "Moderators can act only with exact scopes",
].forEach((needle) => requireText("moderator scope", moderator, needle));

[
  "Admin search requires exact scope",
  "Searches are audited with masked query preview",
].forEach((needle) => requireText("admin search", adminSearch, needle));

[
  "Moderator/support-workflow users cannot browse broad audit history by default",
].forEach((needle) => requireText("audit governance", audit, needle));

[
  "Safe public non-money systems remain enabled",
].forEach((needle) => requireText("public switchboard", publicSwitchboard, needle));

[
  "canAccessAdminConsole",
  "readMyPlatformRoleMemberships",
  "Reason required",
  "formatAdminOperationFailure",
].forEach((needle) => requireText("admin UI", adminUi, needle));

[
  "proof:owner-admin-moderator-production-authority-seeded-device",
  "guard:owner-admin-moderator-production-authority-policy",
].forEach((needle) => requireText("package scripts", packageJson, needle));

const scanTargets = [
  ["seeded authority doc", doc],
  ["staff hierarchy", hierarchy],
  ["moderator scope", moderator],
  ["admin search", adminSearch],
  ["audit governance", audit],
];

for (const [label, content] of scanTargets) {
  forbidMatch(label, content, /\bsupport\b[^.\n]{0,80}\bbackend role\b[^.\n]{0,80}\b(introduced|created|allowed|enabled)\b/i, "Support backend role allowance");
  forbidMatch(label, content, /(?<!does not )(?<!do not )(?<!no )rename [`'"]?operator[`'"]?|operator (?:is|was|will be) renamed/i, "operator rename");
  forbidMatch(label, content, /Moderator\/Admin (?:are|were|will be) merged|Moderator (?:is|was|will be) merged with Admin/i, "Moderator/Admin merge");
  forbidMatch(label, content, /Moderator (?:receives|has|can use|may use) broad (?:Admin|Owner|non-scoped|unscoped) powers/i, "broad Moderator power");
  forbidMatch(label, content, /non-admin (?:can|may|is allowed to) (?:reach|access|use) admin/i, "non-admin admin access allowance");
  forbidMatch(label, content, /unscoped Admin Search (?:is|may be|can be) allowed/i, "unscoped Admin Search allowance");
  forbidMatch(label, content, /reporter identity (?:is|may be|can be) exposed/i, "reporter identity exposure");
  forbidMatch(label, content, /private evidence (?:is|may be|can be) exposed/i, "private evidence exposure");
  forbidMatch(label, content, /(?:may|can|should|must) expose (?:raw storage paths?|signed URLs?|raw IPs?|tokens?|provider IDs?|payment credentials?|tax IDs?|bank details?)/i, "raw private data exposure");
  forbidMatch(label, content, /(?:auto-ban|auto-delete|auto-suspend|auto-restrict|auto-hide|auto-punishment) (?:is|are|was|were|will be|can be|may be) (?:enabled|allowed|introduced|performed)/i, "auto-punishment allowance");
}

forbidMatch("runtime feature flags", featureFlags, /premiumPurchaseEnabled:\s*true/, "Premium public purchase activation");
forbidMatch("runtime feature flags", featureFlags, /creatorPricingEnabled:\s*true/, "creator pricing activation");
forbidMatch("runtime feature flags", featureFlags, /tipsEnabled:\s*true/, "tips activation");
forbidMatch("runtime feature flags", featureFlags, /payoutsEnabled:\s*true/, "payout activation");
forbidMatch("runtime feature flags", featureFlags, /stripeConnectProductionEnabled:\s*true/, "Stripe Connect activation");
forbidMatch("runtime feature flags", featureFlags, /merchStoreEnabled:\s*true/, "merch activation");
forbidMatch("runtime feature flags", featureFlags, /liveMoneyEnabled:\s*true/, "live money activation");

forbidMatch("money feature defaults", moneyFlags, /live_money_enabled:\s*["']on["']/, "live_money_enabled on state");
forbidMatch("money feature defaults", moneyFlags, /payouts_enabled:\s*["']on["']/, "payouts on state");
forbidMatch("money feature defaults", moneyFlags, /paid_content_enabled:\s*["']on["']/, "paid content on state");
forbidMatch("money feature defaults", moneyFlags, /tips_enabled:\s*["']on["']/, "tips on state");
forbidMatch("money feature defaults", moneyFlags, /merch_enabled:\s*["']on["']/, "merch on state");

if (failures.length) {
  console.error("Owner/Admin/Moderator production authority policy guard failed:");
  failures.forEach((failure) => console.error(`- ${failure}`));
  process.exit(1);
}

console.log("Owner/Admin/Moderator production authority policy guard passed.");
console.log("- role boundaries, scoped Admin Search, support privacy, audit/reason requirements, and money-off/provider-safe posture are present.");
