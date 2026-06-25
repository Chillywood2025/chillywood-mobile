#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");
const fail = (message) => {
  console.error(`guard:staff-role-hierarchy-policy failed: ${message}`);
  process.exit(1);
};
const assertIncludes = (haystack, needle, label) => {
  if (!haystack.includes(needle)) fail(`missing ${label}: ${needle}`);
};
const assertNotIncludes = (haystack, needle, label) => {
  if (haystack.includes(needle)) fail(`forbidden ${label}: ${needle}`);
};

const hierarchy = read("docs/admin/STAFF_ROLE_HIERARCHY_PROOF.md");
const roleLock = read("docs/admin/ROLE_TERMINOLOGY_LOCK.md");
const adminDoc = read("docs/admin/ADMIN_ROLE_SCOPE_AND_PERMISSIONS.md");
const moderatorDoc = read("docs/admin/MODERATOR_ROLE_SCOPE_AND_SUPPORT_DUTIES.md");
const firstOwnerDoc = read("docs/admin/FIRST_OWNER_AUTHORITY_AND_SUCCESSION.md");
const staffMigration = read("supabase/migrations/202605140008_platform_staff_role_management.sql");
const adminMigration = read("supabase/migrations/20260625184725_admin_role_scope_permissions.sql");
const firstOwnerMigration = read("supabase/migrations/20260625131000_first_owner_authority_succession.sql");
const moderatorMigration = read("supabase/migrations/20260625192527_moderator_role_scope_support_duties.sql");
const adminUi = read("app/admin.tsx");
const packageJson = read("package.json");
const roleNormalizer = staffMigration.match(/create or replace function public\."platform_staff_normalize_role"[\s\S]+?\$\$;/)?.[0] ?? staffMigration;
const combinedDocs = [hierarchy, roleLock, adminDoc, moderatorDoc, firstOwnerDoc].join("\n");
const migrations = [staffMigration, adminMigration, firstOwnerMigration, moderatorMigration].join("\n");

assertIncludes(hierarchy, "Staff role hierarchy proof: Closed", "closed hierarchy proof");
assertIncludes(hierarchy, "operator is the internal/backend alias for Admin", "operator internal Admin doctrine");
assertIncludes(hierarchy, "Admin is the product-facing role", "Admin product-facing doctrine");
assertIncludes(hierarchy, "support is not a backend role", "support not backend role doctrine");
assertIncludes(hierarchy, "Support is a work area and permission group", "support work-area doctrine");
assertIncludes(hierarchy, "Moderator includes support duties only through exact scopes", "Moderator support-duty doctrine");
assertIncludes(hierarchy, "Moderator is separate from Admin/operator", "Moderator separation doctrine");
assertIncludes(hierarchy, "No separate Operator or Support product roles exist", "no separate product Operator/Support roles");
assertIncludes(hierarchy, "First Owner authority remains above all staff roles", "First Owner authority top");
assertIncludes(hierarchy, "Admin and Moderator cannot alter Owner or First Owner authority", "Owner/First Owner protection");
assertIncludes(hierarchy, "Admin and Moderator cannot enable money/provider/payout systems", "money activation denial");
assertIncludes(hierarchy, "Admin and Moderator cannot execute provider refunds", "provider refund denial");
assertIncludes(hierarchy, "No backend role values were renamed", "no backend role rename");

assertIncludes(roleNormalizer, "when 'admin' then 'operator'", "admin maps to operator");
assertIncludes(roleNormalizer, "when 'operator' then 'operator'", "operator preserved");
assertIncludes(roleNormalizer, "when 'moderator' then 'moderator'", "moderator preserved");
assertNotIncludes(roleNormalizer, "when 'support' then", "support role normalizer");
assertNotIncludes(migrations, "\"role\" in ('owner', 'operator', 'moderator', 'support')", "support role constraint");
assertNotIncludes(migrations, "role = 'support'", "support role mutation");

assertIncludes(firstOwnerMigration, "first_owner_grant_owner_by_email", "First Owner grant Owner RPC");
assertIncludes(firstOwnerMigration, "first_owner_revoke_owner_by_email", "First Owner revoke Owner RPC");
assertIncludes(firstOwnerMigration, "first_owner_complete_self_step_down", "First Owner succession RPC");
assertIncludes(firstOwnerMigration, "first_owner_required", "First Owner required enforcement");
assertIncludes(adminDoc, "Admin cannot grant or revoke Owner", "Admin Owner denial");
assertIncludes(moderatorDoc, "Moderator cannot grant or revoke Owner", "Moderator Owner denial");
assertIncludes(moderatorDoc, "Moderator cannot grant or revoke Admin/operator", "Moderator Admin denial");
assertIncludes(moderatorMigration, "v_actor_role = 'operator' and v_target_role = 'moderator' and public.has_platform_permission('manage_moderators')", "Admin-only lower-role management");
assertNotIncludes(moderatorMigration, "v_actor_role = 'moderator' and v_target_role", "Moderator staff-management path");
assertIncludes(adminMigration, "first_owner_target_protected", "First Owner target protected");
assertIncludes(adminMigration, "has_platform_role(array['operator'::text])\n          and public.has_platform_permission('admin.user.suspend')", "Admin-only suspend");
assertNotIncludes(adminMigration, "has_platform_role(array['moderator'::text])\n          and public.has_platform_permission('admin.user.suspend')", "Moderator suspend path");

assertIncludes(adminUi, "Admin Command Center", "Admin UI label");
assertIncludes(adminUi, "Admin center label", "Admin label placeholder");
assertIncludes(adminUi, "Admin center helper copy", "Admin helper placeholder");
assertNotIncludes(adminUi, "Operator center label", "product Operator label");
assertNotIncludes(adminUi, "Operator center helper copy", "product Operator helper copy");
assertNotIncludes(adminUi, "Support role", "Support role UI copy");

for (const phrase of [
  "Support is a separate role",
  "Moderator equals Admin",
  "Admin can grant Owner",
  "Moderator can grant Owner",
  "Moderator can grant Admin",
  "Admin can enable money/provider/payout systems",
  "Moderator can enable money/provider/payout systems",
  "Admin can execute provider refunds",
  "Moderator can execute provider refunds",
]) {
  assertNotIncludes(combinedDocs, phrase, `contradictory hierarchy phrase ${phrase}`);
}

for (const script of [
  "proof:staff-role-hierarchy",
  "guard:staff-role-hierarchy-policy",
  "proof:first-owner-authority",
  "guard:first-owner-authority-policy",
  "proof:admin-role-scope",
  "guard:admin-role-scope-policy",
  "proof:moderator-role-scope",
  "guard:moderator-role-scope-policy",
  "proof:role-terminology-lock",
  "guard:role-terminology-policy",
]) {
  assertIncludes(packageJson, script, `package script ${script}`);
}

console.log("guard:staff-role-hierarchy-policy passed");
