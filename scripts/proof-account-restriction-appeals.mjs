import { existsSync, readFileSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";

const root = process.cwd();
const read = (relativePath) => readFileSync(join(root, relativePath), "utf8");
const checks = [];
const add = (key, passed, detail) => checks.push({ key, passed, detail });
const artifactDir = join("/tmp", `app-account-restriction-appeals-proof-${new Date().toISOString().replace(/[-:]/g, "").replace(/\..+/, "")}`);
await mkdir(artifactDir, { recursive: true });

const docPath = "docs/account/ACCOUNT_RESTRICTION_APPEALS_OPERATIONS.md";
const accessMigrationPath = "supabase/migrations/20260624171153_wave5_1_account_access_restrictions.sql";
const adminScopeMigrationPath = "supabase/migrations/20260625184725_admin_role_scope_permissions.sql";
const readbackMigrationPath = "supabase/migrations/20260624171939_wave5_1_account_support_audit_readback.sql";

const doc = existsSync(join(root, docPath)) ? read(docPath) : "";
const accessMigration = read(accessMigrationPath);
const adminScopeMigration = read(adminScopeMigrationPath);
const readbackMigration = read(readbackMigrationPath);
const purgeDoc = read("docs/ACCOUNT_PURGE_DEIDENTIFICATION_POLICY.md");
const adminDoc = read("docs/admin/ADMIN_ROLE_SCOPE_AND_PERMISSIONS.md");
const moderatorDoc = read("docs/admin/MODERATOR_ROLE_SCOPE_AND_SUPPORT_DUTIES.md");
const reportingDoc = read("docs/legal/REPORTING_MODERATION_PRODUCTION_WORKFLOW.md");
const takedownDoc = read("docs/legal/CONTENT_TAKEDOWN_DECISIONS.md");
const chatDoc = read("docs/chat/CHAT_CALL_MODERATION_NOTIFICATION_ABUSE.md");
const liveDoc = read("docs/live/LIVE_ROOM_MODERATION_INCIDENT_RESPONSE.md");
const supportDoc = read("docs/support/MONEY_SUPPORT_WORKFLOW.md");
const packageJson = read("package.json");

add("doc_exists", existsSync(join(root, docPath)), "account restriction operations doc exists");

[
  "Account restriction and appeals operations: Closed",
  "Reports do not auto-suspend or auto-ban",
  "Suspension/deactivation/restore require exact scope, reason, target, and audit",
  "First Owner cannot be suspended, deactivated, deleted, restored, or restricted by Admin/Moderator",
  "Moderator cannot perform account-wide suspension/restoration by default",
  "Restricted users fail closed for private app features",
  "Restricted users fail closed for chat, calls, rings, live rooms, uploads, comments, posts, and LiveKit tokens where enforcement exists",
  "Premium entitlement may remain provider-side, but app access fails closed for restricted users",
  "Paid-access and payment history are preserved",
  "Provider refunds remain manual/external",
  "Payouts and money movement remain disabled",
  "Appeals use support/escalation workflow in V1",
  "Appeals do not expose reporter identity or private evidence",
  "Restriction/restore/appeal actions are audited",
  "Purge/de-identification remains separate owner-controlled policy",
  "No secrets, raw storage paths, signed URLs, raw IPs, tokens, push tokens, provider secrets, tax IDs, bank details, or private provider IDs are exposed",
].forEach((needle) => add(`doc_required_${needle}`, doc.includes(needle), `required wording exists: ${needle}`));

[
  "## Account State Matrix",
  "## Staff Authority Matrix",
  "## Private Feature Denial Rules",
  "## Premium / Paid-Access Behavior",
  "## Public Profile / Platform Behavior",
  "## Appeals Workflow",
  "## Notification Policy",
  "## Restore Policy",
  "## Purge / De-identification Separation",
  "## Audit / Evidence Model",
  "## UI / Backend Denial Model",
].forEach((needle) => add(`doc_section_${needle}`, doc.includes(needle), `section exists: ${needle}`));

add("restricted_helper_exists", accessMigration.includes("create or replace function public.\"is_account_access_restricted\"") && accessMigration.includes("is_account_deletion_scheduled") && accessMigration.includes("banned_until"), "restricted account helper covers scheduled deletion and auth suspension");
add("private_feature_assert_exists", accessMigration.includes("create or replace function public.\"assert_account_private_feature_allowed\"") && accessMigration.includes("account_access_restricted"), "private feature assertion fails closed");
add("chat_call_room_upload_comment_guards", [
  "enforce_chat_threads_account_access_guard",
  "enforce_chat_thread_members_account_access_guard",
  "enforce_chat_messages_abuse_guard",
  "enforce_chat_call_invites_abuse_guard",
  "enforce_communication_rooms_abuse_guard",
  "enforce_communication_room_memberships_account_access_guard",
  "enforce_watch_party_rooms_abuse_guard",
  "enforce_watch_party_room_membership_block_guard",
  "enforce_watch_party_room_messages_abuse_guard",
  "enforce_videos_account_access_guard",
  "enforce_profile_posts_account_access_guard",
  "enforce_creator_video_comments_abuse_guard",
  "enforce_profile_post_comments_abuse_guard",
].every((needle) => accessMigration.includes(needle)), "private feature triggers cover chat/call/live/upload/post/comment paths");

add("admin_suspend_exact_scope", adminScopeMigration.includes("admin_suspend_account_for_support") && adminScopeMigration.includes("admin.user.suspend") && adminScopeMigration.includes("admin_action_reason_required"), "admin suspend requires exact scope and reason");
add("admin_restore_exact_scope", adminScopeMigration.includes("admin_restore_account_for_support") && adminScopeMigration.includes("admin.user.restore") && adminScopeMigration.includes("admin_action_reason_required"), "admin restore requires exact scope and reason");
add("first_owner_protection", adminScopeMigration.includes("public.is_first_owner(v_target, null)") && adminScopeMigration.includes("first_owner_target_protected"), "First Owner target protection exists in backed suspend/restore functions");
add("suspend_restore_audit_before_after", adminScopeMigration.includes("platform_admin_audit_logs") && adminScopeMigration.includes("before_state") && adminScopeMigration.includes("after_state") && adminScopeMigration.includes("firstOwnerProtected"), "suspend/restore writes audit with before/after and protection metadata");
add("no_provider_money_side_effects", adminScopeMigration.includes("'providerRefundExecuted', false") && adminScopeMigration.includes("'liveMoneyAction', false"), "suspend/restore record no provider refund or live-money side effects");
add("sanitized_readback", readbackMigration.includes("list_account_support_action_audit") && readbackMigration.includes("reasonPresent") && readbackMigration.includes("providerRefundExecuted") && readbackMigration.includes("liveMoneyAction"), "sanitized account support audit readback exists");

[
  ["purge_doc_reference", purgeDoc],
  ["admin_doc_reference", adminDoc],
  ["moderator_doc_reference", moderatorDoc],
  ["reporting_doc_reference", reportingDoc],
  ["takedown_doc_reference", takedownDoc],
  ["chat_doc_reference", chatDoc],
  ["live_doc_reference", liveDoc],
  ["support_doc_reference", supportDoc],
].forEach(([key, body]) => add(key, body.includes("Account restriction and appeals operations: Closed"), `${key} cross-doc status exists`));

add("package_proof_script", packageJson.includes("\"proof:account-restriction-appeals\""), "package proof script registered");
add("package_guard_script", packageJson.includes("\"guard:account-restriction-appeals-policy\""), "package guard script registered");

[
  "provider.refund.execute",
  "premium.public.activate",
  "creator_money.activate",
  "live_money.enable",
  "payouts.enable",
  "stripe.connect.enable",
].forEach((needle) => add(`no_forbidden_permission_${needle}`, !adminScopeMigration.includes(needle), `account restriction migration does not add ${needle}`));

const failed = checks.filter((check) => !check.passed);
await writeFile(join(artifactDir, "checks.json"), `${JSON.stringify(checks, null, 2)}\n`);
await writeFile(join(artifactDir, "README.md"), [
  "# Account Restriction Appeals Proof",
  "",
  `Status: ${failed.length ? "failed" : "passed"}`,
  `Passed: ${checks.length - failed.length}/${checks.length}`,
  "",
  "This proof is static and sanitized. It does not mutate real users, suspend accounts, restore accounts, execute provider refunds, move money, or include private account evidence.",
  "",
].join("\n"));

if (failed.length) {
  console.error(JSON.stringify({ artifact: artifactDir, failed: failed.length, total: checks.length, failures: failed }, null, 2));
  process.exit(1);
}

console.log(JSON.stringify({ artifact: artifactDir, passed: checks.length, failed: 0, total: checks.length }, null, 2));
