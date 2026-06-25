import { existsSync, readFileSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";

const root = process.cwd();
const read = (relativePath) => readFileSync(join(root, relativePath), "utf8");
const checks = [];
const add = (key, passed, detail) => checks.push({ key, passed, detail });
const artifactDir = join("/tmp", `app-chat-thread-report-message-actions-proof-${new Date().toISOString().replace(/[-:]/g, "").replace(/\..+/, "")}`);
await mkdir(artifactDir, { recursive: true });

const migrationPath = "supabase/migrations/20260625214816_chat_thread_report_message_actions.sql";
const docPath = "docs/chat/CHAT_CALL_MODERATION_NOTIFICATION_ABUSE.md";
const migration = read(migrationPath);
const chatThread = read("app/chat/[threadId].tsx");
const chatLib = read("_lib/chat.ts");
const moderationLib = read("_lib/moderation.ts");
const adminUi = read("app/admin.tsx");
const reportingDoc = read("docs/legal/REPORTING_MODERATION_PRODUCTION_WORKFLOW.md");
const takedownDoc = read("docs/legal/CONTENT_TAKEDOWN_DECISIONS.md");
const packageJson = read("package.json");

add("doc_exists", existsSync(join(root, docPath)), "chat/call moderation doc exists");
add("migration_exists", existsSync(join(root, migrationPath)), "chat thread report/message action migration exists");

[
  "Dedicated chat_thread report target: Closed",
  "Chat-message hide/remove/restore: Closed",
  "Users can report a whole chat conversation",
  "`chat_thread` reports target the exact thread internally",
  "`chat_message` reports target the exact message with thread context internally",
  "Staff private chat evidence access requires exact scope and case/report context",
  "Moderators/Admins cannot browse arbitrary private chats",
  "Chat-message hide/remove/restore preserves evidence",
  "Chat-message hide/remove/restore does not hard-delete moderation/legal evidence",
  "Chat-message moderation actions require exact scope, reason, case/report context where applicable, and audit",
  "Reporter identity remains private",
  "Reported users are not notified merely because a report was filed",
  "Duplicate/rate-limit protections apply",
  "No private message bodies, reporter identity, raw storage paths, signed URLs, raw IPs, tokens, push tokens, provider secrets, tax IDs, bank details, or private provider IDs are exposed",
].forEach((needle) => add(`doc_wording_${needle}`, docPath && read(docPath).includes(needle), `required wording exists: ${needle}`));

add("chat_thread_type_ts", moderationLib.includes("| \"chat_thread\"") && moderationLib.includes("\"chat_thread\""), "TypeScript safety report allowlist includes chat_thread");
add("chat_thread_db_constraint", migration.includes("'chat_thread'") && migration.includes("safety_reports_target_type_check"), "database target-type constraint includes chat_thread");
add("thread_report_ui", chatThread.includes('targetType: "chat_thread"') && chatThread.includes("Report conversation"), "thread screen reports exact chat_thread target with safe copy");
add("thread_report_no_participant_title", !chatThread.includes('title="Report participant"'), "thread report sheet no longer presents participant report copy");
add("message_report_still_present", chatThread.includes('targetType: "chat_message"') && chatThread.includes("Report message") && chatThread.includes("messageSenderUserId") && chatThread.includes("hasAttachments"), "specific chat-message report remains exact and contextual");

add("message_status_columns", migration.includes("\"moderation_status\"") && migration.includes("\"moderation_report_id\"") && migration.includes("\"moderation_actioned_at\""), "chat_messages moderation status/evidence fields exist");
add("message_no_hard_delete", !migration.includes("delete from public.\"chat_messages\"") && !migration.includes("delete public.\"chat_messages\""), "chat-message moderation migration does not hard-delete message rows");
add("message_action_branch", migration.includes("when 'chat_message'") && migration.includes("admin_report_chat_message_thread_context_required") && migration.includes("admin_report_chat_message_thread_mismatch"), "RPC has exact chat_message branch and thread-context enforcement");
add("message_exact_scope", migration.includes("admin_reports_actor_can_target_action_scope") && migration.includes("admin.content.hide") && migration.includes("admin.content.remove") && migration.includes("admin.content.restore"), "RPC enforces exact or equivalent content scopes");
add("message_reason_required", migration.includes("admin_report_reason_required"), "RPC requires reason text");
add("message_audit", migration.includes("admin_reports_write_audit") && migration.includes("v_target_before") && migration.includes("v_target_after"), "RPC writes audit with before/after state");
add("message_evidence_preserved", migration.includes("'evidence_preserved'") && migration.includes("\"moderation_status\" = v_next_status"), "RPC records evidence-preservation metadata and status without deleting body/attachments");

add("chat_client_masks_status", chatLib.includes("This message was removed after review.") && chatLib.includes("This message is hidden while it is reviewed.") && chatLib.includes("attachments: isModerationHidden ? [] : attachments"), "normal chat client masks hidden/removed message content and attachments");
add("admin_target_support", adminUi.includes('targetType === "chat_message"') && adminUi.includes("Case-scoped message target") && adminUi.includes("Target case-scoped private chat"), "Command Center supports chat_message actions without visible raw chat target IDs");
add("admin_exact_scopes_ui", adminUi.includes("\"admin.content.hide\"") && adminUi.includes("\"admin.content.remove\"") && adminUi.includes("\"admin.content.restore\""), "Command Center recognizes exact content action scopes");

[
  reportingDoc,
  takedownDoc,
].forEach((body, index) => {
  add(`cross_doc_chat_thread_${index}`, body.includes("chat_thread") && body.includes("Closed after validation"), "cross-doc chat_thread closed status exists");
  add(`cross_doc_message_actions_${index}`, body.includes("Chat-message hide/remove/restore") || body.includes("chat-message hide/remove/restore"), "cross-doc chat-message action status exists");
});

add("package_proof_script", packageJson.includes("\"proof:chat-thread-report-and-message-actions\""), "package proof script is registered");
add("package_guard_script", packageJson.includes("\"guard:chat-thread-report-message-actions-policy\""), "package guard script is registered");

[
  "live_money_enabled",
  "payouts_enabled",
  "provider.refund.execute",
  "premium.public.activate",
  "creator_money.activate",
  "stripe.connect.enable",
].forEach((needle) => add(`no_money_activation_${needle}`, !migration.includes(needle), `migration does not activate ${needle}`));

const failed = checks.filter((check) => !check.passed);
await writeFile(join(artifactDir, "checks.json"), `${JSON.stringify(checks, null, 2)}\n`);
await writeFile(join(artifactDir, "README.md"), [
  "# Chat Thread Report And Message Actions Proof",
  "",
  `Status: ${failed.length ? "failed" : "passed"}`,
  `Passed: ${checks.length - failed.length}/${checks.length}`,
  "",
  "This proof is static and sanitized. It does not read real chat bodies, expose reporter identity, mutate provider dashboards, activate money, or include secrets.",
  "",
].join("\n"));

if (failed.length) {
  console.error(JSON.stringify({ artifact: artifactDir, failed: failed.length, total: checks.length, failures: failed }, null, 2));
  process.exit(1);
}

console.log(JSON.stringify({ artifact: artifactDir, passed: checks.length, failed: 0, total: checks.length }, null, 2));
