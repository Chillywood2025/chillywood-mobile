#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");
const fail = (message) => {
  console.error(`guard:moderator-role-scope-policy failed: ${message}`);
  process.exit(1);
};
const assertIncludes = (haystack, needle, label) => {
  if (!haystack.includes(needle)) fail(`missing ${label}: ${needle}`);
};
const assertNotIncludes = (haystack, needle, label) => {
  if (haystack.includes(needle)) fail(`forbidden ${label}: ${needle}`);
};

const doc = read("docs/admin/MODERATOR_ROLE_SCOPE_AND_SUPPORT_DUTIES.md");
const roleLock = read("docs/admin/ROLE_TERMINOLOGY_LOCK.md");
const roleMigration = read("supabase/migrations/202605140008_platform_staff_role_management.sql");
const adminScopeMigration = read("supabase/migrations/20260625184725_admin_role_scope_permissions.sql");
const moderatorMigration = read("supabase/migrations/20260625192527_moderator_role_scope_support_duties.sql");
const edge = read("supabase/functions/admin-owner-controls/index.ts");
const moderation = read("_lib/moderation.ts");
const adminUi = read("app/admin.tsx");
const packageJson = read("package.json");
const combined = [doc, roleLock, roleMigration, adminScopeMigration, moderatorMigration, edge, moderation, adminUi].join("\n");

assertIncludes(doc, "Moderator role scope: Closed", "closed status");
assertIncludes(doc, "Moderator is a real production role", "real role wording");
assertIncludes(doc, "Support is a work area, not a separate role", "support work-area wording");
assertIncludes(doc, "Moderator can perform support duties only with exact support scopes", "support exact scope wording");
assertIncludes(doc, "Moderator is separate from Admin/operator", "Admin separation wording");
assertIncludes(doc, "Moderator cannot grant or revoke Owner", "Owner grant denial");
assertIncludes(doc, "Moderator cannot grant or revoke Admin/operator", "Admin grant denial");
assertIncludes(doc, "Moderator cannot alter First Owner succession", "succession denial");
assertIncludes(doc, "Moderator cannot remove, demote, delete, deactivate, or suspend First Owner", "First Owner destructive denial");
assertIncludes(doc, "Moderator cannot enable money/provider/payout systems", "money denial");
assertIncludes(doc, "Moderator cannot execute provider refunds", "refund execution denial");
assertIncludes(doc, "Moderator destructive actions require permission, reason, confirmation, case/report context where applicable, and audit", "destructive action model");
assertIncludes(doc, "Backend denies non-moderator and unscoped-moderator attempts even if UI is bypassed", "backend denial model");
assertIncludes(doc, "Broken Moderator/support buttons are wired or honestly disabled", "button wiring model");

assertIncludes(roleMigration, "when 'moderator' then 'moderator'", "backend moderator role");
assertIncludes(roleMigration, "when 'admin' then 'operator'", "admin to operator alias");
assertNotIncludes(roleMigration, "when 'support'", "support backend role");
assertNotIncludes(roleMigration, "'support' then", "support role normalizer");
assertNotIncludes(roleMigration, "support ->", "support role mapping");

assertIncludes(adminScopeMigration, "array['operator'::text, 'moderator'::text]", "permissions apply to Admin and Moderator");
assertIncludes(moderatorMigration, "has_platform_role(array['operator'::text, 'moderator'::text])", "DMCA scoped Admin/Moderator backend");
assertIncludes(moderatorMigration, "dmca_owner_or_scoped_staff_required", "DMCA denial marker");

assertIncludes(moderation, "hasPlatformStaffPermission(memberships, [\"reports_review\", \"content_moderation\"])", "exact-scoped report queue");
assertNotIncludes(moderation, "hasPlatformRoleMembership(memberships, [\"owner\", \"moderator\"])", "unscoped moderator report access");
assertIncludes(moderation, "admin.dmca.view", "DMCA view scope in UI helper");
assertIncludes(moderation, "admin.dmca.manage", "DMCA manage scope in UI helper");

assertIncludes(edge, "moderator_support", "moderator support permission template");
assertIncludes(edge, "Moderator Support Workflow", "moderator support template label");
assertIncludes(moderatorMigration, "v_actor_role = 'operator' and v_target_role = 'moderator' and public.has_platform_permission('manage_moderators')", "Admin-only lower-role management condition");
assertIncludes(moderatorMigration, "Moderator cannot grant Owner/Admin/operator or staff roles", "Moderator grant denial comment");
assertIncludes(moderatorMigration, "Moderator cannot revoke Owner/Admin/operator or staff roles", "Moderator revoke denial comment");
assertNotIncludes(moderatorMigration, "v_actor_role = 'moderator' and v_target_role", "Moderator staff-management path");
assertNotIncludes(edge, "if (user.role === \"moderator\") return json(403, { error: \"owner_or_approved_operator_required\" });\n  if (!hasAnyPermission(user, [\"legal_request_intake\"", "unconditional moderator legal intake denial");

assertIncludes(adminUi, "onPress={() => void loadSafetyReports()", "wired report refresh");
assertIncludes(adminUi, "onPress={() => void loadDmcaCases()", "wired DMCA refresh");
assertIncludes(adminUi, "Manual target action without a selected report is disabled", "honest disabled report action");

assertIncludes(packageJson, "proof:moderator-role-scope", "proof package script");
assertIncludes(packageJson, "guard:moderator-role-scope-policy", "guard package script");

assertNotIncludes(combined, "Support is a separate role", "separate Support role claim");
assertNotIncludes(combined, "support backend role creation", "support backend role creation claim");
assertNotIncludes(combined, "Moderator equals Admin", "Moderator/Admin merge claim");
assertNotIncludes(combined, "Moderator can grant Owner", "Moderator owner grant claim");
assertNotIncludes(combined, "Moderator can grant Admin", "Moderator admin grant claim");
assertNotIncludes(combined, "Moderator can execute provider refunds", "Moderator provider refund execution claim");
assertNotIncludes(combined, "Moderator can enable Premium public activation", "Moderator Premium activation claim");
assertNotIncludes(combined, "Moderator can enable creator-money", "Moderator creator-money activation claim");

console.log("guard:moderator-role-scope-policy passed");
