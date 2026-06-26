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

const doc = read("docs/admin/AUDIT_LOG_INTEGRITY_PRIVILEGED_ACTION_EVIDENCE.md");
const commandCenterDoc = read("docs/admin/OWNER_ADMIN_COMMAND_CENTER_PRODUCTION_UI.md");
const adminSearchDoc = read("docs/admin/ADMIN_SEARCH_PRIVACY_EXPORT_GOVERNANCE.md");
const publicSwitchboardDoc = read("docs/PUBLIC_NON_MONEY_FEATURE_ENABLEMENT_SWITCHBOARD.md");
const moneyDoc = read("docs/admin/MONEY_ADMIN_AUTHORITY_ACTIVATION_GOVERNANCE.md");
const immutableAuditMigration = read("supabase/migrations/202605080006_immutable_admin_audit_log_foundation.sql");
const adminSearchMigration = read("supabase/migrations/202605290004_admin_search_query_audit.sql");
const featureFlags = read("_lib/featureFlags.ts");
const moneyFlags = read("_lib/moneyFeatureFlags.ts");
const packageJson = read("package.json");

[
  "Audit logs are append-only from app/admin paths",
  "Audit logs cannot be edited or deleted through normal app/admin flows",
  "Audit correction, if ever needed, must create a new correction record instead of editing the original row.",
  "Every privileged action must create an audit log where backed",
  "Failed or denied privileged attempts are audited where supported",
  "Audit readback requires exact scope",
  "Moderator/support-workflow users cannot browse broad audit history by default",
  "Audit logs are privacy-safe and minimized",
  "Admin search audits store masked query preview",
  "Final proof artifacts include only sanitized audit evidence",
  "Safe public non-money systems remain enabled",
  "live_money_enabled remains OFF",
  "Creator-money remains OFF",
  "No Google Play, RevenueCat, Stripe, payout, purchase, refund, or provider mutation happened",
].forEach((needle) => requireText("audit governance doc", doc, needle));

[
  "prevent_platform_admin_audit_log_mutation",
  "before update or delete",
  "platform_admin_audit_logs is append-only",
  "revoke update, delete on table public.\"platform_admin_audit_logs\" from \"authenticated\"",
].forEach((needle) => requireText("immutable audit migration", immutableAuditMigration, needle));

[
  "query_preview",
  "raw_query_stored",
  "email_plaintext_stored",
  "admin_search_denied",
].forEach((needle) => requireText("admin search audit migration", adminSearchMigration, needle));

[
  "Audit log integrity and privileged action evidence governance",
].forEach((needle) => {
  requireText("Command Center doc", commandCenterDoc, needle);
  requireText("Admin Search doc", adminSearchDoc, needle);
  requireText("Public switchboard doc", publicSwitchboardDoc, needle);
  requireText("Money governance doc", moneyDoc, needle);
});

[
  "proof:audit-log-integrity-privileged-action-evidence",
  "guard:audit-log-integrity-policy",
].forEach((needle) => requireText("package scripts", packageJson, needle));

forbidMatch("audit governance doc", doc, /audit logs (?:may|can|are allowed to) be (?:edited|updated|deleted|removed) through normal app\/admin flows/i, "normal app/admin audit mutation allowance");
forbidMatch("audit governance doc", doc, /audit logs are mutable(?! only by correction record)/i, "mutable audit claim");
forbidMatch("audit governance doc", doc, /Moderator\/support-workflow users can browse broad audit history by default/i, "broad moderator/support audit browsing");
forbidMatch("audit governance doc", doc, /proof artifacts (?:include|may include|can include) raw audit logs/i, "raw audit proof artifact allowance");
forbidMatch("audit governance doc", doc, /audit (?:metadata|logs|records) (?:may|can|are allowed to|should) store plaintext email/i, "plaintext email audit storage allowance");
forbidMatch("audit governance doc", doc, /audit (?:metadata|logs|records) (?:may|can|are allowed to|should) store private evidence/i, "private evidence audit storage allowance");
forbidMatch("audit governance doc", doc, /audit (?:metadata|logs|records) (?:may|can|are allowed to|should) store (?:tokens|signed URLs|raw IPs|provider secrets|payment credentials|tax IDs|bank details|private chat bodies|call content|raw provider payloads)/i, "secret/private audit metadata allowance");

forbidMatch("Admin Search governance doc", adminSearchDoc, /search audit stores plaintext email/i, "plaintext email search audit claim");
forbidMatch("Admin Search governance doc", adminSearchDoc, /search audit (?:may|can|is allowed to|should) store .*private evidence/i, "private evidence search audit claim");

forbidMatch("runtime monetization defaults", featureFlags, /premiumPurchaseEnabled:\s*true/, "Premium public purchase activation");
forbidMatch("runtime monetization defaults", featureFlags, /paidContentCheckoutEnabled:\s*true/, "paid content checkout activation");
forbidMatch("runtime monetization defaults", featureFlags, /tipsEnabled:\s*true/, "tips activation");
forbidMatch("runtime monetization defaults", featureFlags, /merchStoreEnabled:\s*true/, "merch activation");
forbidMatch("runtime monetization defaults", featureFlags, /cashoutEnabled:\s*true/, "cash-out activation");
forbidMatch("runtime monetization defaults", featureFlags, /payoutsEnabled:\s*true/, "payout activation");
forbidMatch("runtime monetization defaults", featureFlags, /stripeConnectProductionEnabled:\s*true/, "Stripe Connect production activation");
forbidMatch("runtime monetization defaults", featureFlags, /liveMoneyEnabled:\s*true/, "live money activation");

forbidMatch("money feature defaults", moneyFlags, /live_money_enabled:\s*["']on["']/, "live_money_enabled on state");
forbidMatch("money feature defaults", moneyFlags, /payouts_enabled:\s*["']on["']/, "payouts on state");
forbidMatch("money feature defaults", moneyFlags, /paid_content_enabled:\s*["']on["']/, "paid content on state");
forbidMatch("money feature defaults", moneyFlags, /tips_enabled:\s*["']on["']/, "tips on state");
forbidMatch("money feature defaults", moneyFlags, /merch_enabled:\s*["']on["']/, "merch on state");

forbidMatch("audit governance doc", doc, /Premium annual (?:is|now|currently)?\s*(?:live|enabled|available now)/i, "Premium annual live claim");
forbidMatch("audit governance doc", doc, /Creator Channel Subscription (?:is|now|currently)?\s*(?:live|enabled|available now)/i, "Creator Channel Subscription live claim");
forbidMatch("audit governance doc", doc, /creator-money (?:is|now|currently)?\s*(?:live|enabled|available now)/i, "creator-money live claim");
forbidMatch("audit governance doc", doc, /payouts? (?:are|is) (?:live|enabled|available now)/i, "payout live claim");
forbidMatch("audit governance doc", doc, /Stripe Connect (?:is|now|currently)?\s*(?:live|enabled|available now)/i, "Stripe Connect live claim");
forbidMatch("audit governance doc", doc, /merch checkout (?:is|now|currently)?\s*(?:live|enabled|available now)/i, "merch checkout live claim");

if (failures.length) {
  console.error("Audit log integrity policy guard failed:");
  failures.forEach((failure) => console.error(`- ${failure}`));
  process.exit(1);
}

console.log("Audit log integrity policy guard passed.");
console.log("- audit edit/delete remains denied through normal app/admin flows.");
console.log("- broad support/moderator audit browsing and audit exports remain disabled by default.");
console.log("- live money, creator-money, payouts, Stripe/merch, and provider mutation remain off.");
