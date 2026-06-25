import { readFileSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();
const read = (path) => readFileSync(join(root, path), "utf8");
const fail = (message) => {
  console.error(`Reporting moderation policy guard failed: ${message}`);
  process.exit(1);
};

const workflowDoc = read("docs/legal/REPORTING_MODERATION_PRODUCTION_WORKFLOW.md");
const moderationDoc = read("docs/legal/MODERATION_REPORTING_WORKFLOW.md");
const reportSheet = read("components/safety/report-sheet.tsx");
const moderationLib = read("_lib/moderation.ts");
const duplicateMigration = read("supabase/migrations/20260625202127_reporting_moderation_duplicate_guard.sql");
const packageJson = read("package.json");

[
  "Reporter identity stays private by default",
  "Reported users are not notified merely because a report was filed",
  "Moderation actions can notify affected users/creators with safe copy",
  "Appeals use support/escalation workflow in V1 unless full in-app appeal UI exists",
  "Reported items are reviewed before action unless high-risk policy requires urgent temporary hiding/escalation",
  "Illegal/safety/security categories are escalated differently",
  "Normal reports, DMCA/legal, support, money/refund/access support, security incidents, and appeals are separated",
  "Duplicate/false reports are deduped and rate-limited",
  "Staff access requires exact scopes and case/report context",
  "No reporter identity, raw storage paths, signed URLs, raw IPs, tokens, provider secrets, tax IDs, bank details, or private provider IDs are exposed",
].forEach((needle) => {
  if (!workflowDoc.includes(needle)) fail(`missing workflow doctrine: ${needle}`);
});

[
  "user profile",
  "Profile photo",
  "Profile background",
  "creator Platform/channel",
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
  "event",
  "event content/chat if present",
  "suspicious purchase/access/refund issue",
  "impersonation/username/handle issue",
].forEach((needle) => {
  if (!workflowDoc.includes(needle)) fail(`missing reportable surface: ${needle}`);
});

[
  "REPORT_SHEET_CATEGORY_OPTIONS",
  "harassment_bullying",
  "hate_discrimination",
  "threats_violence",
  "sexual_exploitation",
  "self_harm_danger",
  "minor_safety",
  "illegal_activity",
  "spam_scam",
  "privacy_doxxing",
  "copyright_dmca",
  "fraud_payment",
  "live_safety",
  "Please report in good faith",
  "Reporter identity stays private by default",
  "reports do not remove content automatically",
].forEach((needle) => {
  if (!reportSheet.includes(needle)) fail(`missing report sheet marker: ${needle}`);
});

[
  "SAFETY_REPORT_TARGET_TYPES",
  "SAFETY_REPORT_CATEGORIES",
  "This report target is not supported.",
  "Choose a supported report category.",
  "dedupe_safety_report",
].forEach((needle) => {
  if (!moderationLib.includes(needle)) fail(`missing report intake marker: ${needle}`);
});

[
  "enforce_safety_reports_duplicate_guard",
  "safety_report_duplicate_window",
  "before insert on public.\"safety_reports\"",
].forEach((needle) => {
  if (!duplicateMigration.includes(needle)) fail(`missing duplicate backend guard marker: ${needle}`);
});

if (/reported users are notified merely because a report was filed/i.test(`${workflowDoc}\n${moderationDoc}`)) {
  fail("docs must not notify reported users merely because a report was filed");
}
if (/auto-?delete reported content|automatically delete content|auto-?ban reported users/i.test(`${workflowDoc}\n${moderationDoc}`)) {
  fail("reports must not auto-delete content or auto-ban users");
}
if (/provider refund execution enabled|provider refunds enabled|payouts enabled|live_money_enabled\s*(?:is|=|:)\s*(?:on|enabled)/i.test(workflowDoc)) {
  fail("workflow must not enable provider refunds, payouts, or live money");
}
if (/support.+backend role|backend role.+support/i.test(workflowDoc)) {
  fail("support must not be introduced as a backend role");
}
if (/raw storage paths|signed URLs|raw IPs|tokens|provider secrets|tax IDs|bank details|private provider IDs/.test(reportSheet)) {
  fail("user-facing report sheet must not mention or expose private implementation details");
}

if (!packageJson.includes("\"proof:reporting-moderation-workflow\"")) fail("missing proof package script");
if (!packageJson.includes("\"guard:reporting-moderation-policy\"")) fail("missing guard package script");

console.log("guard:reporting-moderation-policy passed");
