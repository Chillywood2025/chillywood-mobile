import { readFileSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();
const read = (path) => readFileSync(join(root, path), "utf8");
const fail = (message) => {
  console.error(`Event/chat report affordance guard failed: ${message}`);
  process.exit(1);
};

const eventRoute = read("app/event/[eventId].tsx");
const chatRoute = read("app/chat/[threadId].tsx");
const moderationLib = read("_lib/moderation.ts");
const workflowDoc = read("docs/legal/REPORTING_MODERATION_PRODUCTION_WORKFLOW.md");
const migration = read("supabase/migrations/20260625204222_event_chat_message_report_targets.sql");
const packageJson = read("package.json");

if (!eventRoute.includes("testID=\"event-report-button\"") || !eventRoute.includes("Report Event")) {
  fail("event UI exists but dedicated event report affordance is missing");
}
if (!eventRoute.includes("targetType: \"event\"") || !eventRoute.includes("targetId: eventId")) {
  fail("event report must target the exact event, not a generic profile/platform target");
}
if (!eventRoute.includes("title=\"Report event\"") || !eventRoute.includes("<ReportSheet")) {
  fail("event report must use the shared report sheet");
}
if (!chatRoute.includes("testID=\"chat-message-report-button\"") || !chatRoute.includes("Report message")) {
  fail("chat message UI exists but exact message report affordance is missing");
}
if (!chatRoute.includes("targetType: \"chat_message\"") || !chatRoute.includes("targetId: messageReportTarget.id")) {
  fail("chat message report must target the exact message, not only the participant/thread");
}
if (!chatRoute.includes("sourceSurface: \"chat-thread-message\"") || !chatRoute.includes("messageSenderUserId") || !chatRoute.includes("threadId")) {
  fail("chat message report must include private thread/message context");
}
if (!moderationLib.includes("\"event\"") || !moderationLib.includes("\"chat_message\"")) {
  fail("client target allowlist must include event and chat_message");
}
if (!migration.includes("'event'") || !migration.includes("'chat_message'")) {
  fail("database target check constraint must include event and chat_message");
}
if (!workflowDoc.includes("Dedicated event report affordance: Closed") || !workflowDoc.includes("Exact chat-message report affordance: Closed")) {
  fail("workflow docs must close the dedicated event and exact chat-message affordance lane");
}
if (!workflowDoc.includes("Reporter identity remains private by default")) {
  fail("reporter identity privacy wording is missing");
}
if (!workflowDoc.includes("Reported users are not notified merely because a report was filed")) {
  fail("reported-user no-notification-on-file policy is missing");
}
if (!workflowDoc.includes("Reported events/messages are not auto-deleted")) {
  fail("event/message no-auto-delete policy is missing");
}
if (!workflowDoc.includes("Duplicate/false reports remain deduped and rate-limited")) {
  fail("duplicate/rate-limit policy is missing");
}
if (!workflowDoc.includes("Private evidence access remains staff-scoped and case/report-context-only")) {
  fail("private evidence staff-scope policy is missing");
}
if (/Report (?:event|message).+(?:id|ID)|(?:event|message|thread) id:/i.test(`${eventRoute}\n${chatRoute}`)) {
  fail("visible report copy must not expose raw target ids");
}
if (/auto-?delete|automatically delete|auto-?ban|automatically ban/i.test(`${eventRoute}\n${chatRoute}`)) {
  fail("report affordances must not auto-delete content or auto-ban users");
}
if (/notified merely because a report was filed/i.test(`${eventRoute}\n${chatRoute}`) && !chatRoute.includes("not notified merely because a report was filed")) {
  fail("reported-user notification copy must remain safe");
}
if (/live_money_enabled\\s*(?:is|=|:)\\s*(?:on|enabled)|provider refunds enabled|payouts enabled|Stripe payout enabled|creator-money switches enabled/i.test(`${eventRoute}\n${chatRoute}\n${workflowDoc}`)) {
  fail("money/provider/payout activation markers are not allowed");
}
[
  "\"proof:report-affordances-event-chat-message\"",
  "\"guard:report-affordances-event-chat-message-policy\"",
].forEach((needle) => {
  if (!packageJson.includes(needle)) fail(`missing package script ${needle}`);
});

console.log("guard:report-affordances-event-chat-message-policy passed");
