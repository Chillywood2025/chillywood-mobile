import { existsSync, readFileSync, statSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";

const root = process.cwd();
const read = (path) => readFileSync(join(root, path), "utf8");
const has = (path, needle) => read(path).includes(needle);
const checks = [];

const add = (key, passed, detail) => checks.push({ key, passed, detail });

const artifactDir = join("/tmp", `app-report-affordances-event-chat-message-proof-${new Date().toISOString().replace(/[-:]/g, "").replace(/\..+/, "")}`);
await mkdir(artifactDir, { recursive: true });

const eventRoute = read("app/event/[eventId].tsx");
const chatRoute = read("app/chat/[threadId].tsx");
const moderationLib = read("_lib/moderation.ts");
const workflowDoc = read("docs/legal/REPORTING_MODERATION_PRODUCTION_WORKFLOW.md");
const legacyDoc = read("docs/legal/MODERATION_REPORTING_WORKFLOW.md");
const migrationPath = "supabase/migrations/20260625204222_event_chat_message_report_targets.sql";
const packageJson = read("package.json");

add("event_route_exists", existsSync(join(root, "app/event/[eventId].tsx")), "event detail route exists");
add("chat_thread_route_exists", existsSync(join(root, "app/chat/[threadId].tsx")), "chat thread route exists");
add("event_report_button", eventRoute.includes("testID=\"event-report-button\"") && eventRoute.includes("Report Event"), "event detail exposes a dedicated report event affordance");
add("event_report_sheet", eventRoute.includes("<ReportSheet") && eventRoute.includes("title=\"Report event\""), "event detail uses shared report sheet");
add("event_exact_target", eventRoute.includes("targetType: \"event\"") && eventRoute.includes("targetId: eventId"), "event report targets the specific event id internally");
add("event_context", eventRoute.includes("sourceSurface: \"event-detail\"") && eventRoute.includes("targetRoleLabel: \"Creator event\""), "event report stores safe private context");
add("chat_message_report_button", chatRoute.includes("testID=\"chat-message-report-button\"") && chatRoute.includes("Report message"), "chat bubbles expose per-message report affordance");
add("chat_message_report_sheet", chatRoute.includes("title=\"Report message\"") && chatRoute.includes("messageReportTarget"), "chat message report uses shared report sheet");
add("chat_exact_target", chatRoute.includes("targetType: \"chat_message\"") && chatRoute.includes("targetId: messageReportTarget.id"), "chat message report targets exact message id internally");
add("chat_thread_context", chatRoute.includes("sourceSurface: \"chat-thread-message\"") && chatRoute.includes("threadId") && chatRoute.includes("messageSenderUserId"), "chat message report stores thread context privately");
add("client_allowlist_event", moderationLib.includes("\"event\""), "client target allowlist includes event");
add("client_allowlist_chat_message", moderationLib.includes("\"chat_message\""), "client target allowlist includes chat_message");
add("db_allowlist_migration_exists", existsSync(join(root, migrationPath)) && statSync(join(root, migrationPath)).size > 0, "database allowlist migration exists");
add("db_allowlist_event", has(migrationPath, "'event'"), "database check constraint includes event");
add("db_allowlist_chat_message", has(migrationPath, "'chat_message'"), "database check constraint includes chat_message");
add("duplicate_guard_still_referenced", moderationLib.includes("dedupe_safety_report") && existsSync(join(root, "supabase/migrations/20260625202127_reporting_moderation_duplicate_guard.sql")), "duplicate guard remains in place");
add("docs_event_closed", workflowDoc.includes("Dedicated event report affordance: Closed"), "workflow doc closes dedicated event affordance");
add("docs_chat_closed", workflowDoc.includes("Exact chat-message report affordance: Closed"), "workflow doc closes exact chat-message affordance");
add("docs_event_exact", workflowDoc.includes("Event reports target the specific event"), "docs state event reports target exact event");
add("docs_chat_exact", workflowDoc.includes("Chat-message reports target the exact message with thread context"), "docs state chat-message reports target exact message with thread context");
add("docs_privacy", workflowDoc.includes("Reporter identity remains private by default") && legacyDoc.includes("Reporter identity stays private by default"), "docs preserve reporter privacy");
add("docs_no_notification", workflowDoc.includes("Reported users are not notified merely because a report was filed"), "docs preserve no-notification-on-file policy");
add("docs_no_auto_delete", workflowDoc.includes("Reported events/messages are not auto-deleted"), "docs preserve no auto-delete policy");
add("docs_evidence_scope", workflowDoc.includes("Private evidence access remains staff-scoped and case/report-context-only"), "docs preserve staff-scoped evidence access");
add("no_visible_raw_id_copy", !/raw (event|message|thread) id/i.test(`${eventRoute}\n${chatRoute}`), "visible report copy does not expose raw id language");
add("no_money_activation", !/live_money_enabled\\s*(?:is|=|:)\\s*(?:on|enabled)|payouts enabled|provider refunds enabled/i.test(`${eventRoute}\n${chatRoute}\n${workflowDoc}`), "no money/provider/payout activation markers");
add("package_proof_script", packageJson.includes("\"proof:report-affordances-event-chat-message\""), "package proof script is registered");
add("package_guard_script", packageJson.includes("\"guard:report-affordances-event-chat-message-policy\""), "package guard script is registered");

const failed = checks.filter((check) => !check.passed);
await writeFile(join(artifactDir, "checks.json"), `${JSON.stringify(checks, null, 2)}\n`);
await writeFile(join(artifactDir, "README.md"), [
  "# Event And Chat Message Report Affordance Proof",
  "",
  `Status: ${failed.length ? "failed" : "passed"}`,
  `Passed: ${checks.length - failed.length}/${checks.length}`,
  "",
  "This proof is static and sanitized. It does not submit reports, mutate provider state, expose reporter identity, or include private data.",
  "",
].join("\n"));

if (failed.length) {
  console.error(JSON.stringify({ artifact: artifactDir, failed: failed.length, total: checks.length, failures: failed }, null, 2));
  process.exit(1);
}

console.log(JSON.stringify({ artifact: artifactDir, passed: checks.length, failed: 0, total: checks.length }, null, 2));
