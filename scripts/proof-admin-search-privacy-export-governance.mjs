#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");
const exists = (file) => fs.existsSync(path.join(root, file));

const failures = [];
const requireFile = (file) => {
  if (!exists(file)) failures.push(`missing ${file}`);
  return exists(file) ? read(file) : "";
};
const requireText = (source, text, label = text) => {
  if (!source.includes(text)) failures.push(`missing ${label}`);
};

const doc = requireFile("docs/admin/ADMIN_SEARCH_PRIVACY_EXPORT_GOVERNANCE.md");

[
  "Admin search privacy and export governance: Closed / Partial / Blocked",
  "Search Authority Matrix",
  "Result Minimization Matrix",
  "Export Policy Matrix",
  "Admin search requires exact scope",
  "Non-admin and unscoped attempts are denied",
  "Searches are audited with masked query preview",
  "Failed/denied searches are audited where supported",
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
  "No secrets, raw storage paths, signed URLs, raw IPs, tokens, push tokens, provider secrets, tax IDs, bank details, private provider IDs, raw payment credentials, or private evidence are exposed",
  "Suspicious search patterns are flagged or documented for monitoring follow-up",
  "docs/admin/OWNER_ADMIN_COMMAND_CENTER_PRODUCTION_UI.md",
  "docs/OWNER_ADMIN_SEARCH_PERMISSION_AUDIT_HARDENING.md",
  "docs/admin/MONEY_ADMIN_AUTHORITY_ACTIVATION_GOVERNANCE.md",
].forEach((text) => requireText(doc, text));

[
  "email search",
  "username/handle search",
  "phone search",
  "device search",
  "private content search",
  "chat/thread/message evidence search",
  "payment/provider status search",
  "RevenueCat customer/order summary search",
  "Google Play order summary search",
  "deleted user lookup",
  "de-identified user lookup",
  "export search results",
].forEach((text) => requireText(doc.toLowerCase(), text.toLowerCase(), `matrix row ${text}`));

const admin = requireFile("app/admin.tsx");
const auditClient = requireFile("_lib/adminSearchAudit.ts");
const auditMigration = requireFile("supabase/migrations/202605290004_admin_search_query_audit.sql");
const moneyAuditEvents = requireFile("_lib/moneyAuditEvents.ts");
const packageJson = requireFile("package.json");

[
  "ADMIN_SEARCH_MIN_LENGTH",
  "ADMIN_SEARCH_DEBOUNCE_MS",
  "adminSearchCanUseScope",
  "availableAdminSearchScopes",
  "writeAdminSearchAudit",
  "testID=\"admin-search-panel\"",
  "testID=\"admin-user-search-input\"",
  "maskOperatorIdentity(entry.email)",
  "Email lookup is admin-only",
].forEach((text) => requireText(admin, text, `admin UI ${text}`));

[
  "client_written_full_query: false",
  "write_admin_search_audit",
].forEach((text) => requireText(auditClient, text, `audit client ${text}`));

[
  "admin_search_mask_query",
  "admin_search_denied",
  "'raw_query_stored', false",
  "'email_plaintext_stored', false",
  "query_preview",
].forEach((text) => requireText(auditMigration, text, `audit migration ${text}`));

requireText(moneyAuditEvents, "formatCompactIdentifier(source.providerEventId)", "masked provider event id detail");
requireText(packageJson, "proof:admin-search-privacy-export-governance", "package proof script");
requireText(packageJson, "guard:admin-search-privacy-export-policy", "package guard script");

[
  "docs/admin/OWNER_ADMIN_COMMAND_CENTER_PRODUCTION_UI.md",
  "docs/admin/ADMIN_ROLE_SCOPE_AND_PERMISSIONS.md",
  "docs/admin/MODERATOR_ROLE_SCOPE_AND_SUPPORT_DUTIES.md",
  "docs/legal/LEGAL_PRIVACY_DATA_SAFETY_FINAL_ALIGNMENT.md",
  "docs/monitoring/MONITORING_ANALYTICS_CRASH_RUNTIME_DIAGNOSTICS.md",
  "docs/account/ACCOUNT_RESTRICTION_APPEALS_OPERATIONS.md",
].forEach((file) => requireFile(file));

if (failures.length) {
  console.error("Admin search privacy export governance proof failed:");
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log("Admin search privacy export governance proof passed.");
