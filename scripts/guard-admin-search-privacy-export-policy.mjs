#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");
const exists = (file) => fs.existsSync(path.join(root, file));
const fail = (message) => {
  console.error(`Admin search privacy export policy guard failed: ${message}`);
  process.exit(1);
};
const assertIncludes = (source, text, label = text) => {
  if (!source.includes(text)) fail(`missing ${label}`);
};
const assertNotMatches = (source, pattern, label) => {
  if (pattern.test(source)) fail(label);
};

const doc = exists("docs/admin/ADMIN_SEARCH_PRIVACY_EXPORT_GOVERNANCE.md")
  ? read("docs/admin/ADMIN_SEARCH_PRIVACY_EXPORT_GOVERNANCE.md")
  : fail("missing admin search governance doc");
const admin = exists("app/admin.tsx") ? read("app/admin.tsx") : fail("missing admin UI");
const auditClient = exists("_lib/adminSearchAudit.ts") ? read("_lib/adminSearchAudit.ts") : fail("missing audit client");
const auditMigration = exists("supabase/migrations/202605290004_admin_search_query_audit.sql")
  ? read("supabase/migrations/202605290004_admin_search_query_audit.sql")
  : fail("missing admin search audit migration");
const packageJson = exists("package.json") ? read("package.json") : fail("missing package.json");

[
  "Admin search requires exact scope",
  "Non-admin and unscoped attempts are denied",
  "Searches are audited with masked query preview",
  "Search results are minimized",
  "Search results are bounded/paginated or safely limited",
  "Support-workflow readbacks are masked/minimized by default",
  "Moderator does not see full email by default",
  "Admin can see full email only with exact scope",
  "Phone/device search is disabled by default unless future case-scoped privacy review approves it",
  "Private chat/content evidence search requires exact scope and case/report/legal context",
  "Payment/provider search is masked/scoped summary only",
  "Deleted/de-identified users are not available in ordinary search",
  "Exports are disabled by default and require future Owner-approved audited lane",
].forEach((text) => assertIncludes(doc, text));

assertIncludes(packageJson, "guard:admin-search-privacy-export-policy", "package guard script");
assertIncludes(admin, "adminSearchCanUseScope", "scope gate");
assertIncludes(admin, "availableAdminSearchScopes", "available scope gate");
assertIncludes(admin, "writeAdminSearchAudit", "audit writer");
assertIncludes(admin, "maskOperatorIdentity(entry.email)", "masked email readback");
assertIncludes(admin, "ADMIN_SEARCH_MIN_LENGTH", "bounded search minimum length");
assertIncludes(admin, "ADMIN_SEARCH_DEBOUNCE_MS", "debounced search");
assertIncludes(auditClient, "client_written_full_query: false", "client full query disabled");
assertIncludes(auditMigration, "admin_search_mask_query", "masked query function");
assertIncludes(auditMigration, "admin_search_denied", "denied search audit");
assertIncludes(auditMigration, "'raw_query_stored', false", "raw query not stored");
assertIncludes(auditMigration, "'email_plaintext_stored', false", "email plaintext not stored");

const policySources = [
  ["admin search governance doc", doc],
  ["admin UI", admin],
];

for (const [label, source] of policySources) {
  assertNotMatches(source, /non-admin search (?:is )?(?:allowed|enabled)/i, `${label} allows non-admin search`);
  assertNotMatches(source, /unscoped admin search (?:is )?(?:allowed|enabled)/i, `${label} allows unscoped admin search`);
  assertNotMatches(source, /support(?:-workflow)? users? (?:can|may) see full email by default/i, `${label} gives support full email by default`);
  assertNotMatches(source, /moderator (?:can|may) see full email by default/i, `${label} gives moderator full email by default`);
  assertNotMatches(source, /phone\/device search (?:is )?(?:enabled|available) by default/i, `${label} enables phone/device search by default`);
  assertNotMatches(source, /private (?:chat|content) search (?:does not require|without) (?:case|report|legal)/i, `${label} weakens private evidence context`);
  assertNotMatches(source, /exports? (?:are|is) enabled by default/i, `${label} enables exports by default`);
  assertNotMatches(source, /raw provider (?:transaction|customer|order) data (?:is )?exposed/i, `${label} exposes raw provider data`);
  assertNotMatches(source, /plaintext email (?:is )?stored in search audit/i, `${label} stores plaintext email audit`);
  assertNotMatches(source, /private evidence (?:is )?stored in search audit/i, `${label} stores private evidence audit`);
}

const moneyPolicy = [
  "_lib/moneyFeatureFlags.ts",
  "docs/admin/MONEY_ADMIN_AUTHORITY_ACTIVATION_GOVERNANCE.md",
].filter(exists).map(read).join("\n");

[
  /live_money_enabled:\s*["']on["']/i,
  /payouts_enabled:\s*["']on["']/i,
  /digital_sales_enabled:\s*["']on["']/i,
  /creator_monetization_enabled:\s*["']on["']/i,
  /paid_content_enabled:\s*["']on["']/i,
  /tips_enabled:\s*["']on["']/i,
  /stripe_connect_enabled:\s*["']on["']/i,
  /merch_enabled:\s*["']on["']/i,
  /providerRefundsEnabled\s*[:=]\s*true/i,
  /executeProviderRefund\s*\(/i,
  /stripe\.refunds\.create/i,
  /Premium annual (?:is|now|currently)?\s*(?:live|enabled|available now)/i,
  /creator[- ]money (?:is|now|currently)?\s*(?:live|enabled|available now)/i,
].forEach((pattern) => assertNotMatches(moneyPolicy, pattern, `money/provider/payout activation pattern ${pattern}`));

console.log("Admin search privacy export policy guard passed.");
