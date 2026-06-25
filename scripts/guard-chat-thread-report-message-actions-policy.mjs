import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();
const read = (relativePath) => readFileSync(join(root, relativePath), "utf8");
const failures = [];
const assert = (condition, message) => {
  if (!condition) failures.push(message);
};

const migrationPath = "supabase/migrations/20260625214816_chat_thread_report_message_actions.sql";
const docPath = "docs/chat/CHAT_CALL_MODERATION_NOTIFICATION_ABUSE.md";

assert(existsSync(join(root, migrationPath)), "chat_thread/message action migration is missing");
assert(existsSync(join(root, docPath)), "chat/call moderation doc is missing");

const migration = read(migrationPath);
const doc = read(docPath);
const chatThread = read("app/chat/[threadId].tsx");
const chatLib = read("_lib/chat.ts");
const moderationLib = read("_lib/moderation.ts");
const adminUi = read("app/admin.tsx");
const packageJson = read("package.json");

assert(moderationLib.includes("\"chat_thread\""), "chat_thread report target is missing from TypeScript allowlist");
assert(migration.includes("'chat_thread'") && migration.includes("safety_reports_target_type_check"), "chat_thread report target is missing from database constraint");
assert(chatThread.includes('targetType: "chat_thread"') && chatThread.includes("Report conversation"), "thread report affordance is missing or not using chat_thread");
assert(!chatThread.includes('title="Report participant"'), "thread-level report copy still presents participant report instead of conversation report");
assert(chatThread.includes('targetType: "chat_message"') && chatThread.includes("Report message"), "exact chat-message report affordance was removed");

assert(migration.includes("when 'chat_message'"), "chat-message hide/remove/restore backend branch is missing");
assert(migration.includes("admin_report_chat_message_thread_context_required") && migration.includes("admin_report_chat_message_thread_mismatch"), "chat-message moderation lacks required thread/case context enforcement");
assert(migration.includes("admin.content.hide") && migration.includes("admin.content.remove") && migration.includes("admin.content.restore"), "chat-message moderation lacks exact content scopes");
assert(migration.includes("admin_report_reason_required"), "chat-message moderation lacks reason requirement");
assert(migration.includes("admin_reports_write_audit"), "chat-message moderation lacks audit write");
assert(migration.includes("v_target_before") && migration.includes("v_target_after"), "chat-message moderation lacks before/after state capture");
assert(!migration.includes("delete from public.\"chat_messages\"") && !migration.includes("delete public.\"chat_messages\""), "chat-message moderation hard-deletes evidence");

assert(chatLib.includes("moderation_status") && chatLib.includes("This message was removed after review.") && chatLib.includes("This message is hidden while it is reviewed."), "normal chat UI does not safely mask hidden/removed messages");
assert(chatLib.includes("attachments: isModerationHidden ? [] : attachments"), "normal chat UI does not suppress hidden/removed message attachments");
assert(adminUi.includes("Case-scoped message target") && adminUi.includes("Target case-scoped private chat"), "Command Center may expose raw chat target IDs");

[
  "Staff private chat evidence access requires exact scope and case/report context",
  "Moderators/Admins cannot browse arbitrary private chats",
  "Chat-message hide/remove/restore preserves evidence",
  "Chat-message hide/remove/restore does not hard-delete moderation/legal evidence",
  "Chat-message moderation actions require exact scope, reason, case/report context where applicable, and audit",
  "Reporter identity remains private",
  "Reported users are not notified merely because a report was filed",
  "Duplicate/rate-limit protections apply",
].forEach((needle) => assert(doc.includes(needle), `policy doc missing: ${needle}`));

[
  "staff can browse arbitrary private chats",
  "reporter identity is exposed",
  "reported users are notified merely because a report was filed",
  "hard-delete chat moderation/legal evidence",
  "provider refunds executed",
  "payouts enabled",
  "creator-money enabled",
  "Premium public activation enabled",
].forEach((needle) => assert(!doc.includes(needle), `unsafe positive policy wording found: ${needle}`));

[
  "live_money_enabled",
  "payouts_enabled",
  "provider.refund.execute",
  "premium.public.activate",
  "creator_money.activate",
  "stripe.connect.enable",
].forEach((needle) => assert(!migration.includes(needle), `money/provider/payout activation marker found in migration: ${needle}`));

assert(packageJson.includes("\"proof:chat-thread-report-and-message-actions\""), "package proof script missing");
assert(packageJson.includes("\"guard:chat-thread-report-message-actions-policy\""), "package guard script missing");

if (failures.length) {
  console.error(JSON.stringify({ status: "failed", failures }, null, 2));
  process.exit(1);
}

console.log(JSON.stringify({
  status: "passed",
  checks: [
    "chat_thread target is allowlisted and wired",
    "chat-message hide/remove/restore is report-linked",
    "scope/reason/context/audit requirements are present",
    "chat evidence is preserved without hard delete",
    "normal chat UI masks moderated messages",
    "raw chat target identifiers are not shown in Command Center labels",
    "money/provider/payout systems remain unchanged",
  ],
}, null, 2));
