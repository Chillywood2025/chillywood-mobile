import { readFileSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();
const read = (path) => readFileSync(join(root, path), "utf8");
const fail = (message) => {
  console.error(`Content takedown policy guard failed: ${message}`);
  process.exit(1);
};

const takedownDoc = read("docs/legal/CONTENT_TAKEDOWN_DECISIONS.md");
const reportingDoc = read("docs/legal/REPORTING_MODERATION_PRODUCTION_WORKFLOW.md");
const commandCenterDoc = read("docs/admin/OWNER_ADMIN_COMMAND_CENTER_PRODUCTION_UI.md");
const moderatorDoc = read("docs/admin/MODERATOR_ROLE_SCOPE_AND_SUPPORT_DUTIES.md");
const moneySupportDoc = read("docs/support/MONEY_SUPPORT_WORKFLOW.md");
const reportsMigration = read("supabase/migrations/202605260002_profile_media_status_policy.sql");
const packageJson = read("package.json");

[
  "Reports do not auto-delete content",
  "Takedowns require exact scope, reason, case/report context where applicable, and audit",
  "Hide/quarantine/restrict is preferred over hard delete",
  "Evidence is preserved for moderation, DMCA/legal, security, payment/access disputes, and appeals",
  "Paid-access history is preserved",
  "Takedown does not execute provider refunds",
  "Takedown does not enable payouts or move money",
  "Manual/external refund/access support path",
  "Appeals use support/escalation workflow in V1",
].forEach((needle) => {
  if (!takedownDoc.includes(needle)) fail(`missing required takedown doctrine: ${needle}`);
});

[
  "profile",
  "Profile photo",
  "Profile background",
  "Platform/channel page",
  "Platform/brand asset",
  "public creator video",
  "paid video",
  "VIP/subscriber content",
  "post",
  "comment",
  "reply",
  "chat message",
  "room message",
  "Watch-Party room",
  "Live room",
  "live participant",
  "saved replay",
  "event",
  "paid event access",
  "attachment/media",
  "DMCA/legal evidence",
].forEach((needle) => {
  if (!takedownDoc.includes(`| ${needle} |`)) fail(`missing takedown matrix row for ${needle}`);
});

if (!reportsMigration.includes("admin_report_reason_required") || !reportsMigration.includes("admin_reports_write_audit")) {
  fail("backed report target actions must require reason and audit");
}
if (!reportsMigration.includes("v_target_before") || !reportsMigration.includes("v_target_after")) {
  fail("backed report target actions must preserve before/after state where practical");
}
if (!takedownDoc.includes("Hard delete is not expanded")) {
  fail("hard delete restriction is missing");
}
if (!takedownDoc.includes("Staff private evidence access") && !takedownDoc.includes("case/report context")) {
  fail("staff private evidence access must require case/report context");
}
if (!reportingDoc.includes("Content takedown decisions: Closed")
  || !commandCenterDoc.includes("Content takedown decisions: Closed")
  || !moderatorDoc.includes("Content takedown decisions: Closed")
  || !moneySupportDoc.includes("Content takedown decisions: Closed")) {
  fail("linked docs must reference closed content takedown decisions");
}
if (/reports auto-delete content|reports automatically delete|report submission deletes|report auto-bans|reports auto-ban/i.test(takedownDoc)) {
  fail("reports must not auto-delete content or auto-ban users");
}
if (/provider refunds are executed|execute provider refunds automatically|automatic provider refund|payouts are enabled|money movement is enabled|live_money_enabled\\s*(?:is|=|:)\\s*(?:on|enabled)/i.test(takedownDoc)) {
  fail("takedown policy must not enable refunds, payouts, or live money");
}
if (/hard delete is expanded|hard-delete by moderator|hard delete by moderator|ordinary takedown destroys evidence/i.test(takedownDoc)) {
  fail("hard delete must not be expanded unsafely");
}
if (/raw storage paths exposed|signed URLs exposed|token values exposed|raw IPs exposed|provider secrets exposed|tax IDs exposed|bank details exposed|private provider IDs exposed/i.test(takedownDoc)) {
  fail("private implementation details must not be exposed");
}
[
  "\"proof:content-takedown-decisions\"",
  "\"guard:content-takedown-policy\"",
].forEach((needle) => {
  if (!packageJson.includes(needle)) fail(`missing package script ${needle}`);
});

console.log("guard:content-takedown-policy passed");
