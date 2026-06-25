import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();
const read = (relativePath) => readFileSync(join(root, relativePath), "utf8");
const failures = [];
const assert = (condition, message) => {
  if (!condition) failures.push(message);
};

const docPath = "docs/account/ACCOUNT_RESTRICTION_APPEALS_OPERATIONS.md";
const accessMigrationPath = "supabase/migrations/20260624171153_wave5_1_account_access_restrictions.sql";
const adminScopeMigrationPath = "supabase/migrations/20260625184725_admin_role_scope_permissions.sql";
const purgeDocPath = "docs/ACCOUNT_PURGE_DEIDENTIFICATION_POLICY.md";

assert(existsSync(join(root, docPath)), "account restriction operations doc is missing");

const doc = existsSync(join(root, docPath)) ? read(docPath) : "";
const accessMigration = read(accessMigrationPath);
const adminScopeMigration = read(adminScopeMigrationPath);
const purgeDoc = read(purgeDocPath);
const packageJson = read("package.json");

[
  "Reports do not auto-suspend or auto-ban",
  "Suspension/deactivation/restore require exact scope, reason, target, and audit",
  "First Owner cannot be suspended, deactivated, deleted, restored, or restricted by Admin/Moderator",
  "Moderator cannot perform account-wide suspension/restoration by default",
  "Restricted users fail closed for private app features",
  "LiveKit tokens where enforcement exists",
  "Premium entitlement may remain provider-side, but app access fails closed for restricted users",
  "Paid-access and payment history are preserved",
  "Provider refunds remain manual/external",
  "Payouts and money movement remain disabled",
  "Appeals use support/escalation workflow in V1",
  "Appeals do not expose reporter identity or private evidence",
  "Purge/de-identification remains separate owner-controlled policy",
].forEach((needle) => assert(doc.includes(needle), `policy doc missing: ${needle}`));

assert(adminScopeMigration.includes("admin_suspend_account_for_support") && adminScopeMigration.includes("admin.user.suspend"), "backed admin suspend function or exact scope marker missing");
assert(adminScopeMigration.includes("admin_restore_account_for_support") && adminScopeMigration.includes("admin.user.restore"), "backed admin restore function or exact scope marker missing");
assert(adminScopeMigration.includes("admin_action_reason_required"), "account restriction/restore lacks reason requirement");
assert(adminScopeMigration.includes("platform_admin_audit_logs") && adminScopeMigration.includes("before_state") && adminScopeMigration.includes("after_state"), "account restriction/restore lacks audit before/after markers");
assert(adminScopeMigration.includes("public.is_first_owner(v_target, null)") && adminScopeMigration.includes("first_owner_target_protected"), "First Owner restriction protection marker missing");
assert(!adminScopeMigration.includes("has_platform_role(array['moderator'::text])") || doc.includes("Moderator cannot perform account-wide suspension/restoration by default"), "moderator account-wide suspension/restoration policy is unsafe or undocumented");

assert(accessMigration.includes("is_account_access_restricted") && accessMigration.includes("is_account_deletion_scheduled") && accessMigration.includes("banned_until"), "restricted account helper no longer covers deletion/suspension");
assert(accessMigration.includes("assert_account_private_feature_allowed"), "private feature assertion helper missing");
[
  "enforce_chat_messages_abuse_guard",
  "enforce_chat_call_invites_abuse_guard",
  "enforce_watch_party_room_membership_block_guard",
  "enforce_watch_party_room_messages_abuse_guard",
  "enforce_videos_account_access_guard",
  "enforce_profile_posts_account_access_guard",
  "enforce_creator_video_comments_abuse_guard",
  "enforce_profile_post_comments_abuse_guard",
].forEach((needle) => assert(accessMigration.includes(needle), `restricted private-feature guard missing: ${needle}`));

assert(purgeDoc.includes("Purge/de-identification remains separate owner-controlled policy") || purgeDoc.includes("Permanent purge/de-identification is the post-restore-window phase"), "purge/de-identification separation is missing");

[
  "reports auto-suspend",
  "reports auto-ban",
  "Admin/Moderator can restrict First Owner",
  "Moderator can perform account-wide suspension/restoration by default",
  "Premium/provider refunds are executed",
  "provider refunds executed",
  "payouts and money movement are enabled",
  "appeals expose reporter identity",
  "appeals expose private evidence",
  "purge/de-identification is normal suspension",
].forEach((needle) => assert(!doc.includes(needle), `unsafe positive policy wording found: ${needle}`));

[
  "provider.refund.execute",
  "premium.public.activate",
  "creator_money.activate",
  "live_money.enable",
  "payouts.enable",
  "stripe.connect.enable",
].forEach((needle) => assert(!adminScopeMigration.includes(needle), `forbidden money/provider/payout activation marker found: ${needle}`));

assert(packageJson.includes("\"proof:account-restriction-appeals\""), "package proof script missing");
assert(packageJson.includes("\"guard:account-restriction-appeals-policy\""), "package guard script missing");

if (failures.length) {
  console.error(JSON.stringify({ status: "failed", failures }, null, 2));
  process.exit(1);
}

console.log(JSON.stringify({
  status: "passed",
  checks: [
    "account states and appeals policy documented",
    "reports do not auto-suspend or auto-ban",
    "suspend/restore exact scope, reason, audit, and First Owner protection markers exist",
    "private-feature denial markers remain present",
    "purge/de-identification stays separate",
    "money/provider/payout systems remain unchanged",
  ],
}, null, 2));
