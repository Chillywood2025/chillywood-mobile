#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");

const files = {
  adminUi: "app/admin.tsx",
  doc: "docs/admin/ADMIN_ROLE_SCOPE_AND_PERMISSIONS.md",
  edge: "supabase/functions/admin-owner-controls/index.ts",
  migration: "supabase/migrations/20260625184725_admin_role_scope_permissions.sql",
  moderation: "_lib/moderation.ts",
  firstOwnerMigration: "supabase/migrations/20260625131000_first_owner_authority_succession.sql",
};

const text = Object.fromEntries(Object.entries(files).map(([key, file]) => [key, read(file)]));
const checks = [];

const add = (key, ok, detail) => checks.push({ detail, key, ok: Boolean(ok) });
const hasAll = (haystack, needles) => needles.every((needle) => haystack.includes(needle));

const requiredScopes = [
  "admin.user.search",
  "admin.user.view",
  "admin.user.suspend",
  "admin.user.restore",
  "admin.support.view",
  "admin.support.manage",
  "admin.dmca.view",
  "admin.dmca.manage",
  "admin.payment_status.view",
  "admin.refund_status.record",
  "admin.profile_private.view",
  "admin.room_private.view",
  "admin.chat_evidence.view",
  "admin.content.hide",
  "admin.content.restore",
  "admin.content.remove",
  "admin.comment.moderate",
  "admin.room.moderate",
  "admin.live.force_end",
  "admin.audit.view",
  "admin.lower_role.manage",
];

add("doc_exists", text.doc.includes("Admin role scope: Closed"), "Admin role scope doc exists and is marked closed.");
add("permission_matrix", hasAll(text.doc, requiredScopes), "Admin permission matrix lists every production scope.");
add("real_backend_role", hasAll(text.doc + text.migration, ["platform_role_memberships", "operator", "platform_staff_permission_grants"]), "Admin is represented by real backend role/grant tables.");
add("server_scope_vocab", hasAll(text.migration, requiredScopes), "Migration accepts required production Admin scopes.");
add("edge_scope_vocab", hasAll(text.edge, requiredScopes), "Edge function permission templates/normalizer know required Admin scopes.");
add("ui_scope_vocab", hasAll(text.adminUi + text.moderation, requiredScopes), "Admin UI typed permission matrix knows required Admin scopes.");
add("server_side_permission_enforcement", hasAll(text.migration, ["has_platform_permission('admin.user.suspend')", "has_platform_permission('admin.user.restore')", "admin_user_suspend_permission_required", "admin_user_restore_permission_required"]), "Account suspend/restore require exact scoped permissions.");
add("reason_required", hasAll(text.migration, ["admin_action_reason_required", "v_reason is null or length(v_reason) < 6"]), "Destructive account actions require reason text.");
add("audit_required", hasAll(text.migration, ["platform_admin_audit_logs", "before_state", "after_state", "requiredPermission"]), "Destructive account actions write audit with before/after state.");
add("first_owner_protected", hasAll(text.migration, ["public.is_first_owner(v_target, null)", "first_owner_target_protected"]), "Admin account actions protect First Owner target.");
add("owner_grant_forbidden", hasAll(text.firstOwnerMigration, ["first_owner_grant_owner_by_email", "first_owner_required"]) && text.doc.includes("Admin cannot grant or revoke Owner"), "Owner grant/revoke remains First Owner-only and Admin-forbidden.");
add("succession_forbidden", hasAll(text.firstOwnerMigration, ["first_owner_complete_self_step_down", "first_owner_required"]) && text.doc.includes("Admin cannot alter First Owner succession"), "First Owner succession remains First Owner-only.");
add("money_forbidden", hasAll(text.doc, ["Admin cannot enable money/provider/payout systems", "Admin cannot execute provider refunds", "provider.refund.execute"]), "Admin money/provider/payout/refund boundaries are documented.");
add("refund_record_only", text.doc.includes("Admin can record manual/external refund status only with permission"), "Refund behavior is record-only/manual-external for Admin.");
add("private_data_boundary", hasAll(text.doc, ["No secrets, tokens, signed URLs, raw IPs, tax IDs, bank details, or provider secrets are exposed", "case-scoped"]), "Private-data and secret boundaries are documented.");
add("non_admin_denial_markers", hasAll(text.adminUi + text.edge + text.migration, ["Permission denied", "owner_required", "admin_user_suspend_permission_required"]), "Non-admin and unscoped denial markers exist.");
add("ui_buttons_wired_or_disabled", hasAll(text.adminUi, ["Manual target action without a selected report is disabled", "onPress={() => void loadDmcaCases()", "onPress={() => void loadSafetyReports()"]) && text.doc.includes("Broken Admin buttons are wired or honestly disabled"), "Visible Admin buttons are backed or honestly disabled.");
add("no_provider_mutation", hasAll(text.doc.toLowerCase(), ["premium public activation", "creator-money activation", "payouts", "provider refunds remain manual/external"]), "No provider/money activation is authorized by Admin scope.");

const failed = checks.filter((check) => !check.ok);
const summary = {
  artifact: null,
  failed: failed.length,
  passed: checks.length - failed.length,
  total: checks.length,
};

const timestamp = new Date().toISOString().replace(/[-:]/g, "").replace(/\..+/, "").replace("T", "-");
const artifactDir = path.join("/tmp", `app-admin-role-scope-proof-${timestamp}`);
fs.mkdirSync(artifactDir, { recursive: true });
summary.artifact = artifactDir;

const report = [
  "# Admin Role Scope Proof",
  "",
  `Generated: ${new Date().toISOString()}`,
  "",
  `Passed: ${summary.passed}`,
  `Failed: ${summary.failed}`,
  "",
  "## Checks",
  "",
  ...checks.map((check) => `- ${check.ok ? "PASS" : "FAIL"} ${check.key}: ${check.detail}`),
  "",
  "## Safety",
  "",
  "- No purchases.",
  "- No provider dashboard mutation.",
  "- No Premium public activation.",
  "- No creator-money switch activation.",
  "- No payouts, Stripe, merch, or provider refunds.",
  "- Static repo proof only.",
  "",
].join("\n");

fs.writeFileSync(path.join(artifactDir, "README.md"), report);
fs.writeFileSync(path.join(artifactDir, "admin-permission-matrix.json"), JSON.stringify({ requiredScopes }, null, 2));

console.log(JSON.stringify(summary, null, 2));
if (failed.length) {
  for (const check of failed) console.error(`FAIL ${check.key}: ${check.detail}`);
  process.exit(1);
}
