import { existsSync, readFileSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";

const root = process.cwd();
const read = (relativePath) => readFileSync(join(root, relativePath), "utf8");
const checks = [];
const add = (key, passed, detail) => checks.push({ key, passed, detail });
const artifactDir = join("/tmp", `app-chat-call-moderation-notification-abuse-proof-${new Date().toISOString().replace(/[-:]/g, "").replace(/\..+/, "")}`);
await mkdir(artifactDir, { recursive: true });

const docPath = "docs/chat/CHAT_CALL_MODERATION_NOTIFICATION_ABUSE.md";
const doc = read(docPath);
const chatThread = read("app/chat/[threadId].tsx");
const chatLib = read("_lib/chat.ts");
const callLib = read("_lib/chillyChatCalls.ts");
const callDispatch = read("supabase/functions/chilly-chat-call-dispatch/index.ts");
const deviceTokens = read("supabase/functions/notification-device-tokens/index.ts");
const moderationLib = read("_lib/moderation.ts");
const accountAccessMigration = read("supabase/migrations/20260624171153_wave5_1_account_access_restrictions.sql");
const abuseMigration = read("supabase/migrations/20260624125951_wave4_abuse_rate_limit_controls.sql");
const reportTargetsMigration = read("supabase/migrations/20260625204222_event_chat_message_report_targets.sql");
const chatThreadMessageActionsMigration = read("supabase/migrations/20260625214816_chat_thread_report_message_actions.sql");
const duplicateReportMigration = read("supabase/migrations/20260625202127_reporting_moderation_duplicate_guard.sql");
const attachmentPolicyMigration = read("supabase/migrations/20260624115132_tighten_social_attachment_scan_safe_select.sql");
const callMigration = read("supabase/migrations/202606100001_chilly_chat_call_invites_and_ringtones.sql");
const packageJson = read("package.json");

add("doc_exists", existsSync(join(root, docPath)), "chat/call moderation notification abuse doc exists");
[
  "Chat/call moderation and notification abuse controls:",
  "Specific chat messages can be reported",
  "Users can report a whole chat conversation",
  "Dedicated chat_thread report target: Closed",
  "Chat-message hide/remove/restore: Closed",
  "Chat-message hide/remove/restore preserves evidence",
  "Staff private chat evidence access requires exact scope and case/report context",
  "Moderators/Admins cannot browse arbitrary private chats",
  "Blocked users cannot message, call, or ring each other",
  "Disabled/deleted/scheduled-deletion users fail closed for chat and calls",
  "Call/ring notifications are deduped or rate-limited",
  "Chat sends are rate-limited or documented as follow-up",
  "Support/moderation staff can see safe call metadata only with scope/context",
  "Support/moderation staff cannot see call audio/video content",
  "No call recording is introduced",
  "Attachments remain scan-gated",
  "Reported attachments remain evidence-preserved and case-scoped",
  "No private message bodies, reporter identity, raw storage paths, signed URLs, raw IPs, tokens, push tokens, provider secrets, tax IDs, bank details, or private provider IDs are exposed",
].forEach((needle) => add(`required_wording_${needle}`, doc.includes(needle), `required wording exists: ${needle}`));

[
  "## Chat Reporting Matrix",
  "## Staff Chat Evidence Access Policy",
  "## Message Moderation Policy",
  "## Blocked / Disabled / Deleted Denial Policy",
  "## Call / Ring Abuse Controls",
  "## Notification Privacy Policy",
  "## Attachment Scan / Report Policy",
  "## Audit Model",
  "## Launch Status",
].forEach((needle) => add(`doc_section_${needle}`, doc.includes(needle), `doc section exists: ${needle}`));

add("chat_message_report_ui", chatThread.includes("Report message") && chatThread.includes('targetType: "chat_message"'), "specific chat-message report UI targets chat_message");
add("chat_message_report_context", chatThread.includes("messageSenderUserId") && chatThread.includes("messageCreatedAt") && chatThread.includes("hasAttachments"), "message report stores thread/message context");
add("thread_context_report_ui", chatThread.includes('targetType: "chat_thread"') && chatThread.includes("Report conversation") && chatThread.includes("activeCallType") && chatThread.includes("threadId"), "thread-level report is dedicated chat_thread report");
add("moderation_target_allowlist", moderationLib.includes('"chat_message"') && moderationLib.includes('"chat_thread"') && reportTargetsMigration.includes("'chat_message'") && chatThreadMessageActionsMigration.includes("'chat_thread'"), "chat_message and chat_thread target types are allowlisted in code/migrations");
add("duplicate_report_guard", duplicateReportMigration.includes("enforce_safety_reports_duplicate_guard") && duplicateReportMigration.includes("safety_report_duplicate_window"), "duplicate report guard exists");

add("chat_membership_read", chatLib.includes("getChatThread(normalizedThreadId)") && chatLib.includes("if (!thread?.currentMember)"), "chat send reads thread membership before insert");
add("chat_message_rate_limit", accountAccessMigration.includes("enforce_chat_messages_abuse_guard") && accountAccessMigration.includes("'chat_message_duplicate'") && abuseMigration.includes("create trigger \"enforce_chat_messages_abuse_guard\""), "chat message rate/duplicate guard exists and is triggered");
add("chat_message_block_denial", accountAccessMigration.includes("has_channel_audience_block_between") && accountAccessMigration.includes("blocked_relationship"), "chat message guard denies blocked relationships");
add("chat_message_restricted_denial", accountAccessMigration.includes("assert_account_private_feature_allowed") && accountAccessMigration.includes("'chat_message'"), "chat message guard checks account access restriction");
add("call_invite_rate_limit", accountAccessMigration.includes("enforce_chat_call_invites_abuse_guard") && accountAccessMigration.includes("'chat_call_invite'") && abuseMigration.includes("create trigger \"enforce_chat_call_invites_abuse_guard\""), "call invite rate limit guard exists and is triggered");
add("call_invite_active_dedupe", accountAccessMigration.includes("active_call_invite_exists"), "active ringing call invite dedupe exists");
add("call_invite_rls", callMigration.includes("chat_call_invites_select_members") && callMigration.includes("public.can_access_chat_thread"), "call invites/events are member-scoped by RLS");

add("dispatch_membership_check", callDispatch.includes("thread_membership_required") && callDispatch.includes("not_call_participant"), "call dispatch validates actor and thread membership");
add("dispatch_block_check", callDispatch.includes("hasAudienceBlock") && callDispatch.includes("audience_block"), "call dispatch denies blocked relationships");
add("dispatch_restricted_check", callDispatch.includes("isAccountAccessRestricted") && callDispatch.includes("account_access_restricted"), "call dispatch denies restricted accounts");
add("dispatch_dedupe", callDispatch.includes("notification_event_dedupes") && callDispatch.includes("duplicate_prevented"), "call/ring notifications dedupe dispatch");
add("dispatch_delivery_attempts", callDispatch.includes("notification_delivery_attempts") && callDispatch.includes("reconcileRecentExpoPushReceipts"), "call dispatch records delivery attempts and reconciles receipts");
add("dispatch_payload_privacy", callDispatch.includes("callInviteId") && callDispatch.includes("notificationChannelId") && !callDispatch.includes("messageBody"), "call push payload contains call routing context and no message body marker");
add("dispatch_sanitized_errors", callDispatch.includes("sanitizeErrorMessage") && callDispatch.includes("ExpoPushToken[redacted]"), "call dispatch sanitizes errors/tokens");
add(
  "device_token_fingerprint_only",
  deviceTokens.includes('userClient.rpc("wave1_push_ownership_readback"')
    && deviceTokens.includes("p_install_id: installId")
    && deviceTokens.includes("tokenFingerprint")
    && !deviceTokens.includes("return jsonResponse(200, { status: \"ok\", token:"),
  "device token status uses exact current-session readback and returns fingerprint not raw token",
);

add("attachment_scan_safe", attachmentPolicyMigration.includes("\"surface_type\" = 'chat_message'") && attachmentPolicyMigration.includes("media_scan_public_safe") && attachmentPolicyMigration.includes("can_access_chat_thread"), "chat-message attachments are scan-gated and thread-scoped");
add("message_mutation_closed_truth", doc.includes("Chat-message hide/remove/restore: Closed") && doc.includes("Chat-message hide/remove/restore preserves evidence"), "doc marks direct chat-message mutation closed with evidence preservation");
add("message_mutation_backend", chatThreadMessageActionsMigration.includes("when 'chat_message'") && chatThreadMessageActionsMigration.includes("admin_reports_write_audit"), "chat-message target actions are backed and audited");
add("package_proof_script", packageJson.includes("\"proof:chat-call-moderation-notification-abuse\""), "package proof script is registered");
add("package_guard_script", packageJson.includes("\"guard:chat-call-moderation-notification-policy\""), "package guard script is registered");

[
  "proof:reporting-moderation-workflow",
  "proof:live-room-moderation-incident-response",
  "proof:content-takedown-decisions",
  "proof:staff-role-hierarchy",
].forEach((needle) => add(`reference_${needle}`, packageJson.includes(`"${needle}"`), `existing proof script remains available: ${needle}`));

const failed = checks.filter((check) => !check.passed);
await writeFile(join(artifactDir, "checks.json"), `${JSON.stringify(checks, null, 2)}\n`);
await writeFile(join(artifactDir, "README.md"), [
  "# Chat Call Moderation Notification Abuse Proof",
  "",
  `Status: ${failed.length ? "failed" : "passed"}`,
  `Passed: ${checks.length - failed.length}/${checks.length}`,
  "",
  "This proof is static and sanitized. It does not mutate chat messages, create call recordings, expose private chat bodies, activate money, or include private data.",
  "",
].join("\n"));

if (failed.length) {
  console.error(JSON.stringify({ artifact: artifactDir, failed: failed.length, total: checks.length, failures: failed }, null, 2));
  process.exit(1);
}

console.log(JSON.stringify({ artifact: artifactDir, passed: checks.length, failed: 0, total: checks.length }, null, 2));
