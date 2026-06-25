import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();
const read = (relativePath) => readFileSync(join(root, relativePath), "utf8");
const failures = [];
const assert = (condition, message) => {
  if (!condition) failures.push(message);
};
const assertIncludes = (body, needle, label) => assert(body.includes(needle), `${label}: missing ${needle}`);

const docPath = "docs/chat/CHAT_CALL_MODERATION_NOTIFICATION_ABUSE.md";
assert(existsSync(join(root, docPath)), "chat/call moderation doc is missing");

const doc = read(docPath);
const chatThread = read("app/chat/[threadId].tsx");
const chatLib = read("_lib/chat.ts");
const callDispatch = read("supabase/functions/chilly-chat-call-dispatch/index.ts");
const deviceTokens = read("supabase/functions/notification-device-tokens/index.ts");
const moderationLib = read("_lib/moderation.ts");
const accountAccessMigration = read("supabase/migrations/20260624171153_wave5_1_account_access_restrictions.sql");
const abuseMigration = read("supabase/migrations/20260624125951_wave4_abuse_rate_limit_controls.sql");
const attachmentPolicyMigration = read("supabase/migrations/20260624115132_tighten_social_attachment_scan_safe_select.sql");
const callMigration = read("supabase/migrations/202606100001_chilly_chat_call_invites_and_ringtones.sql");
const packageJson = read("package.json");

[
  "Staff private chat evidence access requires exact scope and case/report context",
  "Moderators/Admins cannot browse arbitrary private chats",
  "Blocked users cannot message, call, or ring each other",
  "Disabled/deleted/scheduled-deletion users fail closed for chat and calls",
  "Call/ring notifications are deduped or rate-limited",
  "Support/moderation staff cannot see call audio/video content",
  "No call recording is introduced",
  "Attachments remain scan-gated",
  "Reported attachments remain evidence-preserved and case-scoped",
].forEach((needle) => assertIncludes(doc, needle, "policy doc"));

[
  "staff can browse arbitrary private chats",
  "call recording may be introduced",
  "call recording is enabled",
  "call recording is stored",
  "staff can see call audio/video content",
  "provider refunds executed",
  "payouts enabled",
  "creator-money enabled",
  "Premium public activation enabled",
].forEach((needle) => {
  assert(!doc.includes(needle), `unsafe positive policy wording found: ${needle}`);
});

assert(chatThread.includes("Report message") && chatThread.includes('targetType: "chat_message"'), "specific chat-message report action must stay wired");
assert(chatThread.includes("messageSenderUserId") && chatThread.includes("hasAttachments"), "chat-message report must keep thread/message context");
assert(moderationLib.includes('"chat_message"'), "moderation target allowlist must include chat_message");

assert(chatLib.includes("getChatThread(normalizedThreadId)") && chatLib.includes("if (!thread?.currentMember)"), "chat send must keep thread membership check");
assert(accountAccessMigration.includes("has_channel_audience_block_between") && accountAccessMigration.includes("blocked_relationship"), "blocked-user message denial must stay present");
assert(accountAccessMigration.includes("assert_account_private_feature_allowed") && accountAccessMigration.includes("'chat_message'"), "restricted-account message denial must stay present");
assert(accountAccessMigration.includes("active_call_invite_exists") && accountAccessMigration.includes("'chat_call_invite'"), "call invite dedupe/rate-limit guard must stay present");
assert(abuseMigration.includes("create trigger \"enforce_chat_messages_abuse_guard\""), "chat message abuse trigger must stay present");
assert(abuseMigration.includes("create trigger \"enforce_chat_call_invites_abuse_guard\""), "chat call abuse trigger must stay present");

assert(callMigration.includes("public.can_access_chat_thread"), "chat call RLS must remain thread-member scoped");
assert(callDispatch.includes("thread_membership_required") && callDispatch.includes("not_call_participant"), "call dispatch must validate actor/thread membership");
assert(callDispatch.includes("hasAudienceBlock") && callDispatch.includes("audience_block"), "call dispatch must deny blocked relationships");
assert(callDispatch.includes("isAccountAccessRestricted") && callDispatch.includes("account_access_restricted"), "call dispatch must deny restricted accounts");
assert(callDispatch.includes("notification_event_dedupes") && callDispatch.includes("duplicate_prevented"), "call notification dedupe must stay present");
assert(callDispatch.includes("notification_delivery_attempts"), "call notification delivery attempts must stay audited");
assert(callDispatch.includes("sanitizeErrorMessage") && callDispatch.includes("ExpoPushToken[redacted]"), "call dispatch must sanitize token/error output");
assert(!callDispatch.includes("messageBody"), "call/ring dispatch must not include message body payloads");

assert(deviceTokens.includes("token_fingerprint") && deviceTokens.includes("tokenFingerprint"), "device token status must expose fingerprint/status only");
assert(!deviceTokens.includes("return jsonResponse(200, { status: \"ok\", token:"), "device token endpoint must not return raw token");

assert(attachmentPolicyMigration.includes("\"surface_type\" = 'chat_message'"), "chat-message attachment surface policy must stay present");
assert(attachmentPolicyMigration.includes("media_scan_public_safe"), "chat attachments must stay scan-gated");
assert(attachmentPolicyMigration.includes("can_access_chat_thread"), "chat attachment visibility must stay thread-scoped");

assert(packageJson.includes("\"proof:chat-call-moderation-notification-abuse\""), "package proof script missing");
assert(packageJson.includes("\"guard:chat-call-moderation-notification-policy\""), "package guard script missing");

if (failures.length) {
  console.error(JSON.stringify({ status: "failed", failures }, null, 2));
  process.exit(1);
}

console.log(JSON.stringify({
  status: "passed",
  checks: [
    "chat-message reports remain exact and thread-contextual",
    "private chat evidence remains case/scope constrained",
    "blocked/restricted chat and call denial remains present",
    "call/ring dedupe and rate limits remain present",
    "call content/recording remains absent",
    "attachments remain scan-gated",
    "token/push payload privacy remains guarded",
  ],
}, null, 2));
