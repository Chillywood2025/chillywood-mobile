#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");
const fail = (message) => {
  console.error(`guard:admin-role-scope-policy failed: ${message}`);
  process.exit(1);
};
const assertIncludes = (haystack, needle, label) => {
  if (!haystack.includes(needle)) fail(`missing ${label}: ${needle}`);
};
const assertNotIncludes = (haystack, needle, label) => {
  if (haystack.includes(needle)) fail(`forbidden ${label}: ${needle}`);
};

const doc = read("docs/admin/ADMIN_ROLE_SCOPE_AND_PERMISSIONS.md");
const migration = read("supabase/migrations/20260625184725_admin_role_scope_permissions.sql");
const firstOwnerMigration = read("supabase/migrations/20260625131000_first_owner_authority_succession.sql");
const adminUi = read("app/admin.tsx");
const edge = read("supabase/functions/admin-owner-controls/index.ts");
const moderation = read("_lib/moderation.ts");
const combined = [doc, migration, firstOwnerMigration, adminUi, edge, moderation].join("\n");

const scopes = [
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

for (const scope of scopes) {
  assertIncludes(doc, scope, `doc scope ${scope}`);
  assertIncludes(migration, scope, `migration scope ${scope}`);
  assertIncludes(adminUi + moderation, scope, `UI/type scope ${scope}`);
}

assertIncludes(doc, "Admin is a real production role", "real Admin role wording");
assertIncludes(doc, "Admin permissions are scoped and granted by Owner/First Owner", "Owner/First Owner grant wording");
assertIncludes(doc, "Admin cannot grant or revoke Owner", "Owner grant/revoke denial");
assertIncludes(doc, "Admin cannot alter First Owner succession", "succession denial");
assertIncludes(doc, "Admin cannot remove, demote, delete, or deactivate First Owner", "First Owner destructive denial");
assertIncludes(doc, "Admin cannot enable money/provider/payout systems", "money activation denial");
assertIncludes(doc, "Admin cannot execute provider refunds", "provider refund denial");
assertIncludes(doc, "Admin destructive actions require permission, reason, confirmation, and audit", "destructive action model");
assertIncludes(doc, "Backend denies non-admin and unscoped-admin attempts even if UI is bypassed", "backend denial wording");
assertIncludes(doc, "Broken Admin buttons are wired or honestly disabled", "button wiring wording");

assertIncludes(firstOwnerMigration, "first_owner_grant_owner_by_email", "First Owner grant RPC");
assertIncludes(firstOwnerMigration, "first_owner_revoke_owner_by_email", "First Owner revoke RPC");
assertIncludes(firstOwnerMigration, "first_owner_complete_self_step_down", "First Owner succession RPC");
assertIncludes(firstOwnerMigration, "first_owner_required", "First Owner required enforcement");

assertIncludes(migration, "admin_user_suspend_permission_required", "suspend permission denial");
assertIncludes(migration, "admin_user_restore_permission_required", "restore permission denial");
assertIncludes(migration, "admin_action_reason_required", "reason required");
assertIncludes(migration, "public.is_first_owner(v_target, null)", "First Owner target protection");
assertIncludes(migration, "platform_admin_audit_logs", "admin audit log");
assertIncludes(migration, "before_state", "before state audit");
assertIncludes(migration, "after_state", "after state audit");
assertIncludes(migration, "providerRefundExecuted', false", "refund non-execution marker");
assertIncludes(migration, "liveMoneyAction', false", "live money non-action marker");

assertIncludes(adminUi, "Manual target action without a selected report is disabled", "honest disabled manual report action");
assertIncludes(adminUi, "onPress={() => void loadDmcaCases()", "wired DMCA refresh");
assertIncludes(adminUi, "onPress={() => void loadSafetyReports()", "wired reports refresh");

assertNotIncludes(combined, "Admin can grant Owner", "Admin Owner grant claim");
assertNotIncludes(combined, "Admin can revoke Owner", "Admin Owner revoke claim");
assertNotIncludes(combined, "provider.refund.execute\" Admin", "Admin provider refund scope");
assertNotIncludes(combined, "premium.public.activate\" Admin", "Admin Premium activation scope");
assertNotIncludes(combined, "creator_money.activate\" Admin", "Admin creator-money activation scope");

console.log("guard:admin-role-scope-policy passed");
