#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");
const exists = (file) => fs.existsSync(path.join(root, file));

const files = {
  adminDoc: "docs/admin/ADMIN_ROLE_SCOPE_AND_PERMISSIONS.md",
  adminUi: "app/admin.tsx",
  doc: "docs/admin/MODERATOR_ROLE_SCOPE_AND_SUPPORT_DUTIES.md",
  edge: "supabase/functions/admin-owner-controls/index.ts",
  migration: "supabase/migrations/20260625184725_admin_role_scope_permissions.sql",
  moderation: "_lib/moderation.ts",
  newMigration: "supabase/migrations/20260625192527_moderator_role_scope_support_duties.sql",
  packageJson: "package.json",
  roleLock: "docs/admin/ROLE_TERMINOLOGY_LOCK.md",
  roleMigration: "supabase/migrations/202605140008_platform_staff_role_management.sql",
};

const text = Object.fromEntries(Object.entries(files).map(([key, file]) => [key, exists(file) ? read(file) : ""]));
const checks = [];
const add = (key, ok, detail) => checks.push({ key, ok: Boolean(ok), detail });
const hasAll = (haystack, needles) => needles.every((needle) => haystack.includes(needle));

const moderatorScopes = [
  "support_inbox",
  "creator_support",
  "billing_support_read",
  "reports_review",
  "content_moderation",
  "live_ops",
  "legal_review",
  "admin.support.view",
  "admin.support.manage",
  "admin.payment_status.view",
  "admin.refund_status.record",
  "admin.dmca.view",
  "admin.profile_private.view",
  "admin.room_private.view",
  "admin.chat_evidence.view",
  "admin.comment.moderate",
  "admin.room.moderate",
  "admin.live.force_end",
  "admin.content.hide",
  "admin.content.restore",
  "admin.content.remove",
];

const forbidden = [
  "owner.grant",
  "owner.revoke",
  "first_owner.succession",
  "first_owner.break_glass",
  "money.provider.activate",
  "premium.public.activate",
  "creator_money.activate",
  "live_money.enable",
  "payouts.enable",
  "stripe.connect.enable",
  "provider.refund.execute",
  "hard_purge.execute",
];

add("doc_exists", text.doc.includes("Moderator role scope: Closed"), "Moderator role doc exists and is closed.");
add("support_not_role", hasAll(text.doc + text.roleLock, ["Support is a work area, not a separate role", "Do not create a separate Support role"]) && !text.roleMigration.includes("when 'support'"), "Support remains a work area and is not a backend role.");
add("moderator_real_role", hasAll(text.roleMigration, ["when 'moderator' then 'moderator'", "platform_role_memberships"]) && text.doc.includes("backend role `moderator`"), "Moderator is a real backend role.");
add("separate_from_admin", hasAll(text.doc + text.roleLock + text.adminDoc, ["Moderator is separate from Admin/operator", "backend/internal `operator`"]) || hasAll(text.doc + text.roleLock + text.adminDoc, ["Moderator is separate from Admin/operator", "internal/backend alias for product-facing Admin"]), "Moderator remains separate from Admin/operator.");
add("permission_matrix", hasAll(text.doc, moderatorScopes), "Moderator permission matrix lists required support/moderation scopes.");
add("forbidden_matrix", hasAll(text.doc, forbidden), "Moderator forbidden matrix lists owner/money/provider/payout scopes.");
add("server_scope_vocab", hasAll(text.migration + text.edge, moderatorScopes), "Server-side scope vocabulary includes Moderator-capable scopes.");
add("server_permission_enforcement", hasAll(text.migration, ["has_platform_permission", "array['operator'::text, 'moderator'::text]"]) && hasAll(text.newMigration, ["has_platform_role(array['operator'::text, 'moderator'::text])", "has_platform_permission('admin.dmca.view')"]), "Backend uses exact scoped permission grants for Moderator-capable work.");
add("dmca_scoped_moderator", hasAll(text.newMigration, ["dmca_owner_or_scoped_staff_required", "active Admin/operator or Moderator staff with exact DMCA/legal scopes"]), "DMCA backend allows only Owner or exact-scoped Admin/Moderator.");
add("legal_intake_scoped", !text.edge.includes("if (user.role === \"moderator\") return json(403, { error: \"owner_or_approved_operator_required\" });\n  if (!hasAnyPermission(user, [\"legal_request_intake\"") && hasAll(text.edge, ["legal_permission_required", "legal_request_intake_required", "writeLegalRequestEvent"]), "Legal intake case work is permission-scoped rather than role-name-only.");
add("safety_queue_exact_scope", !text.moderation.includes("hasPlatformRoleMembership(memberships, [\"owner\", \"moderator\"])") && text.moderation.includes("hasPlatformStaffPermission(memberships, [\"reports_review\", \"content_moderation\"])"), "Report queue requires exact scope for Moderator.");
add("dmca_ui_exact_scope", hasAll(text.moderation, ["admin.dmca.view", "admin.dmca.manage"]) && !text.moderation.includes("hasPlatformRoleMembership(memberships, [\"operator\"])\n      && hasPlatformStaffPermission(memberships, [\"dmca_review\""), "DMCA UI helper is exact-scope based.");
add("cannot_grant_owner_admin", hasAll(text.doc, ["Moderator cannot grant or revoke Owner", "Moderator cannot grant or revoke Admin/operator"]) && hasAll(text.newMigration, ["v_actor_role = 'operator' and v_target_role = 'moderator' and public.has_platform_permission('manage_moderators')", "Moderator cannot grant Owner/Admin/operator or staff roles", "Moderator cannot revoke Owner/Admin/operator or staff roles"]) && !text.newMigration.includes("v_actor_role = 'moderator' and v_target_role"), "Moderator cannot grant Owner/Admin/operator or manage staff by default.");
add("cannot_suspend_first_owner", hasAll(text.doc, ["Moderator cannot remove, demote, delete, deactivate, or suspend First Owner"]) && hasAll(text.migration, ["public.is_first_owner(v_target, null)", "first_owner_target_protected"]) && !text.migration.includes("has_platform_role(array['moderator'::text])\n      and public.has_platform_permission('admin.user.suspend')"), "Moderator cannot act on First Owner and account suspend remains protected.");
add("reason_audit_case", hasAll(text.doc, ["reason", "case/report context", "audit"]) && hasAll(text.edge + text.adminUi, ["auditReason", "Manual target action without a selected report is disabled", "writePlatformAudit"]), "Sensitive/destructive actions require reason/case context/audit markers.");
add("refund_record_only", hasAll(text.doc, ["Moderator can record manual/external refund support status only with permission", "Moderator cannot issue refunds"]) && !text.edge.includes("provider.refund.execute"), "Refund behavior is record-only/manual-external.");
add("money_forbidden", hasAll(text.doc, ["Moderator cannot enable money/provider/payout systems", "Premium public activation", "creator_money.activate", "payouts.enable"]), "Money/provider/payout boundaries are documented as forbidden.");
add("private_data_boundary", hasAll(text.doc, ["raw storage paths", "signed URLs", "raw IP/security context", "tokens, secrets, tax IDs, bank details"]), "Private data boundary forbids raw sensitive values.");
add("ui_buttons_wired_disabled", hasAll(text.adminUi, ["onPress={() => void loadSafetyReports()", "onPress={() => void loadDmcaCases()", "Disabled: legal_request_intake required"]) && text.doc.includes("Broken Moderator/support buttons are wired or honestly disabled"), "Moderator/support buttons are wired or honestly disabled.");
add("package_scripts", hasAll(text.packageJson, ["proof:moderator-role-scope", "guard:moderator-role-scope-policy"]), "Package scripts are wired.");

const failed = checks.filter((check) => !check.ok);
const timestamp = new Date().toISOString().replace(/[-:]/g, "").replace(/\..+/, "").replace("T", "-");
const artifactDir = process.env.MODERATOR_ROLE_SCOPE_ARTIFACT_DIR || path.join("/tmp", `app-moderator-role-scope-proof-${timestamp}`);
fs.mkdirSync(artifactDir, { recursive: true });

const report = [
  "# Moderator Role Scope Proof",
  "",
  `Generated: ${new Date().toISOString()}`,
  "",
  `Passed: ${checks.length - failed.length}`,
  `Failed: ${failed.length}`,
  "",
  "## Checks",
  "",
  ...checks.map((check) => `- ${check.ok ? "PASS" : "FAIL"} ${check.key}: ${check.detail}`),
  "",
  "## Safety",
  "",
  "- No provider dashboard mutation.",
  "- No Premium public activation.",
  "- No creator-money switch activation.",
  "- No payouts, Stripe, merch, or provider refunds.",
  "- Static repo proof only.",
  "",
].join("\n");

fs.writeFileSync(path.join(artifactDir, "README.md"), report);
fs.writeFileSync(path.join(artifactDir, "moderator-permission-matrix.json"), JSON.stringify({ forbidden, moderatorScopes }, null, 2));

console.log(JSON.stringify({
  artifact: artifactDir,
  failed: failed.length,
  passed: checks.length - failed.length,
  total: checks.length,
}, null, 2));

if (failed.length) {
  for (const check of failed) console.error(`FAIL ${check.key}: ${check.detail}`);
  process.exit(1);
}
