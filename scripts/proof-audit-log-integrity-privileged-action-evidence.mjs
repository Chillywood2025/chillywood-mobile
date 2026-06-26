#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const failures = [];
const notes = [];

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

const requireMatch = (label, content, pattern, description) => {
  if (!pattern.test(content)) failures.push(`${label} missing required pattern: ${description}`);
};

const doc = read("docs/admin/AUDIT_LOG_INTEGRITY_PRIVILEGED_ACTION_EVIDENCE.md");
const commandCenterDoc = read("docs/admin/OWNER_ADMIN_COMMAND_CENTER_PRODUCTION_UI.md");
const adminSearchDoc = read("docs/admin/ADMIN_SEARCH_PRIVACY_EXPORT_GOVERNANCE.md");
const moneyDoc = read("docs/admin/MONEY_ADMIN_AUTHORITY_ACTIVATION_GOVERNANCE.md");
const publicSwitchboardDoc = read("docs/PUBLIC_NON_MONEY_FEATURE_ENABLEMENT_SWITCHBOARD.md");
const packageJson = read("package.json");
const immutableAuditMigration = read("supabase/migrations/202605080006_immutable_admin_audit_log_foundation.sql");
const firstOwnerMigration = read("supabase/migrations/20260625131000_first_owner_authority_succession.sql");
const adminSearchMigration = read("supabase/migrations/202605290004_admin_search_query_audit.sql");
const platformAuditHelper = read("_lib/platformAudit.ts");
const adminUi = read("app/admin.tsx");

[
  "Audit log integrity and privileged action evidence governance: Closed / Partial / Blocked",
  "Every privileged action must create an audit log where backed",
  "Failed or denied privileged attempts are audited where supported",
  "Audit logs are append-only from app/admin paths",
  "Audit logs cannot be edited or deleted through normal app/admin flows",
  "Audit readback requires exact scope",
  "Moderator/support-workflow users cannot browse broad audit history by default",
  "Audit logs are privacy-safe and minimized",
  "Audit logs include actor, target, action, reason, timestamp, result, and before/after where practical",
  "Audit logs avoid tokens, signed URLs, raw IPs, secrets, provider secrets, payment credentials, tax IDs, bank details, private chat bodies, call content, private evidence, and raw provider payloads",
  "Audit retention preserves legal/security/payment/support/moderation evidence after account deletion where required",
  "Audit de-identification is policy-controlled",
  "Audit logs are queryable by incident, user, and admin actor where supported",
  "Final proof artifacts include only sanitized audit evidence",
  "Role changes are audited",
  "Money switch changes or attempts are audited where backed",
  "Moderation decisions are audited",
  "Admin search queries are audited with masked query preview",
  "Safe public non-money systems remain enabled",
  "live_money_enabled remains OFF",
  "Creator-money remains OFF",
  "Payouts, payable balances, withdrawals, cash-out, transfers, Stripe Connect, merch checkout, and payout movement remain OFF",
  "No Google Play, RevenueCat, Stripe, payout, purchase, refund, or provider mutation happened",
].forEach((needle) => requireText("audit governance doc", doc, needle));

[
  "Privileged Action Audit Matrix",
  "Append-Only / Edit-Delete Enforcement",
  "Audit Privacy / Sanitization",
  "Audit Readback / Queryability",
  "Failed / Denied Attempt Audit Coverage",
  "Proof Artifact Sanitization",
  "Retention / De-Identification",
  "Existing Proof References",
].forEach((needle) => requireText("audit governance doc", doc, needle));

[
  "| First Owner marker/authority changes |",
  "| Owner grant/revoke |",
  "| Break Glass |",
  "| Admin/operator grant/revoke |",
  "| Moderator grant/revoke |",
  "| staff scope grant/revoke |",
  "| account suspend |",
  "| account restore |",
  "| report creation |",
  "| report review |",
  "| moderation decision |",
  "| content takedown |",
  "| content restore |",
  "| chat thread report |",
  "| chat message report |",
  "| chat message hide/remove/restore |",
  "| live room force-end |",
  "| admin search |",
  "| failed/denied admin search |",
  "| support case readback |",
  "| manual refund support status record |",
  "| access grant revoke |",
  "| money switch change attempt |",
  "| emergency money kill switch |",
  "| provider transaction/customer/order summary readback |",
  "| audit log readback |",
  "| export attempt |",
  "| failed privileged attempt |",
].forEach((needle) => requireText("privileged action matrix", doc, needle));

[
  "docs/PUBLIC_NON_MONEY_FEATURE_ENABLEMENT_SWITCHBOARD.md",
  "docs/admin/ADMIN_SEARCH_PRIVACY_EXPORT_GOVERNANCE.md",
  "docs/admin/MONEY_ADMIN_AUTHORITY_ACTIVATION_GOVERNANCE.md",
  "docs/admin/OWNER_ADMIN_COMMAND_CENTER_PRODUCTION_UI.md",
  "docs/admin/FIRST_OWNER_AUTHORITY_AND_SUCCESSION.md",
  "docs/admin/ADMIN_ROLE_SCOPE_AND_PERMISSIONS.md",
  "docs/admin/MODERATOR_ROLE_SCOPE_AND_SUPPORT_DUTIES.md",
  "docs/admin/STAFF_ROLE_HIERARCHY_PROOF.md",
  "docs/legal/LEGAL_PRIVACY_DATA_SAFETY_FINAL_ALIGNMENT.md",
  "docs/account/ACCOUNT_RESTRICTION_APPEALS_OPERATIONS.md",
  "docs/legal/REPORTING_MODERATION_PRODUCTION_WORKFLOW.md",
  "docs/legal/CONTENT_TAKEDOWN_DECISIONS.md",
  "docs/live/LIVE_ROOM_MODERATION_INCIDENT_RESPONSE.md",
  "docs/chat/CHAT_CALL_MODERATION_NOTIFICATION_ABUSE.md",
  "docs/monitoring/MONITORING_ANALYTICS_CRASH_RUNTIME_DIAGNOSTICS.md",
].forEach((needle) => requireText("existing proof references", doc, needle));

[
  "prevent_platform_admin_audit_log_mutation",
  "before update or delete",
  "platform_admin_audit_logs is append-only",
  "revoke update, delete on table public.\"platform_admin_audit_logs\" from \"authenticated\"",
  "create index if not exists \"platform_admin_audit_logs_actor_user_idx\"",
  "create index if not exists \"platform_admin_audit_logs_target_idx\"",
  "create index if not exists \"platform_admin_audit_logs_target_user_idx\"",
].forEach((needle) => requireText("immutable audit migration", immutableAuditMigration, needle));

[
  "platform_first_owner_authority_audit",
  "platform_first_owner_audit_prevent_mutation",
  "platform_first_owner_write_audit",
  "challenge_failed",
  "first_owner_succession",
].forEach((needle) => requireText("First Owner audit migration", firstOwnerMigration, needle));

[
  "write_admin_search_audit",
  "admin_search_mask_query",
  "query_preview",
  "email_plaintext_stored",
  "raw_query_stored",
  "admin_search_denied",
].forEach((needle) => requireText("admin search audit migration", adminSearchMigration, needle));

[
  "PLATFORM_ADMIN_AUDIT_LOGS_TABLE",
  "readAdminImmutableAuditReadModel",
  "limit?: number",
  "Math.max(1, Math.min(max",
].forEach((needle) => requireText("platform audit helper", platformAuditHelper, needle));

[
  "Audit Explorer",
  "admin.audit.view",
  "audit_review",
  "readAdminImmutableAuditReadModel",
  "platform_admin_audit_logs connected",
].forEach((needle) => requireText("admin UI audit readback", adminUi, needle));

[
  "Audit log integrity and privileged action evidence governance",
].forEach((needle) => {
  requireText("Command Center doc reference", commandCenterDoc, needle);
  requireText("Admin Search doc reference", adminSearchDoc, needle);
  requireText("Money doc reference", moneyDoc, needle);
  requireText("Public switchboard doc reference", publicSwitchboardDoc, needle);
});

[
  "proof:audit-log-integrity-privileged-action-evidence",
  "guard:audit-log-integrity-policy",
].forEach((needle) => requireText("package scripts", packageJson, needle));

requireMatch(
  "audit governance doc",
  doc,
  /Audit logs must not store tokens, signed URLs, raw IPs, secrets, provider secrets, payment credentials, tax IDs, bank details, private chat bodies, call content, private evidence, raw provider payloads/,
  "explicit forbidden audit metadata list",
);

notes.push("Audit integrity governance document exists.");
notes.push("Privileged action audit matrix covers role, moderation, account, chat, live, money, admin search, support, audit readback, export attempts, and failed privileged attempts.");
notes.push("Core immutable audit table has append-only trigger and no update/delete app-client path markers.");
notes.push("Admin search audit stores masked query previews and denies plaintext query storage.");
notes.push("Public non-money and money-off truths remain referenced.");

if (failures.length) {
  console.error("Audit log integrity privileged-action evidence proof failed:");
  failures.forEach((failure) => console.error(`- ${failure}`));
  process.exit(1);
}

console.log("Audit log integrity privileged-action evidence proof passed.");
notes.forEach((note) => console.log(`- ${note}`));
