#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const failures = [];
const notes = [];

const read = (relativePath) => {
  const absolute = path.join(root, relativePath);
  if (!fs.existsSync(absolute)) {
    failures.push(`Missing required file: ${relativePath}`);
    return "";
  }
  return fs.readFileSync(absolute, "utf8");
};

const requireText = (label, content, needle) => {
  if (!content.includes(needle)) failures.push(`${label} missing required text: ${needle}`);
};

const doc = read("docs/legal/MODERATION_QUEUE_CASE_MANAGEMENT_ESCALATION_GOVERNANCE.md");
const packageJson = read("package.json");
const reportingDoc = read("docs/legal/REPORTING_MODERATION_PRODUCTION_WORKFLOW.md");
const takedownDoc = read("docs/legal/CONTENT_TAKEDOWN_DECISIONS.md");
const liveDoc = read("docs/live/LIVE_ROOM_MODERATION_INCIDENT_RESPONSE.md");
const chatDoc = read("docs/chat/CHAT_CALL_MODERATION_NOTIFICATION_ABUSE.md");
const accountDoc = read("docs/account/ACCOUNT_RESTRICTION_APPEALS_OPERATIONS.md");
const moderatorDoc = read("docs/admin/MODERATOR_ROLE_SCOPE_AND_SUPPORT_DUTIES.md");
const auditDoc = read("docs/admin/AUDIT_LOG_INTEGRITY_PRIVILEGED_ACTION_EVIDENCE.md");
const emergencyDoc = read("docs/ops/EMERGENCY_CONTROLS_INCIDENT_RESPONSE_KILL_SWITCH_GOVERNANCE.md");
const publicDoc = read("docs/PUBLIC_NON_MONEY_FEATURE_ENABLEMENT_SWITCHBOARD.md");
const legalDoc = read("docs/legal/LEGAL_PRIVACY_DATA_SAFETY_FINAL_ALIGNMENT.md");
const monitoringDoc = read("docs/monitoring/MONITORING_ANALYTICS_CRASH_RUNTIME_DIAGNOSTICS.md");
const moderation = read("_lib/moderation.ts");
const adminUi = read("app/admin.tsx");

[
  "Moderation queue, case management, and escalation governance: Closed / Partial / Blocked",
  "Reports route to separated queues where appropriate",
  "Live safety reports are urgent",
  "DMCA/legal reports are separate from general moderation",
  "Payment disputes are support/money cases, not general moderation",
  "Appeals are separate from initial moderation review",
  "Moderators can act only with exact scopes",
  "Internal notes are private, scoped, sanitized, and audited where backed",
  "Actions require reasons where backed",
  "Actions are reversible where backed",
  "User-facing notices are templated and privacy-safe",
  "Creator-facing notices are templated and privacy-safe",
  "Reporter identity is not exposed",
  "Private evidence is not exposed",
  "Repeated offenders are flagged where supported",
  "Coordinated reporting is detected where supported or documented as follow-up",
  "Malicious reporting is handled",
  "Urgent report SLA is documented",
  "Safe public non-money systems remain enabled",
  "live_money_enabled remains OFF",
  "Creator-money remains OFF",
  "Premium public purchase remains OFF",
  "Payouts, payable balances, withdrawals, cash-out, transfers, Stripe Connect, merch checkout, and payout movement remain OFF",
  "No Google Play, RevenueCat, Stripe, payout, purchase, refund, or provider mutation happened",
].forEach((needle) => requireText("moderation queue governance doc", doc, needle));

[
  "Moderation Queue / Case Authority Matrix",
  "Queue Separation Model",
  "Severity / Priority Model",
  "Live Safety Urgent SLA",
  "Assignment / Escalation / Internal Notes",
  "Reason / Canned Reason Model",
  "Notice Templates",
  "Reversibility Model",
  "Repeated Offender / Coordinated Report / Malicious Report Handling",
  "UI / Command Center Status",
  "Backend / Denial Model",
  "Gaps / Follow-Ups",
  "Existing Proof References",
  "Launch Status",
].forEach((needle) => requireText("moderation queue governance sections", doc, needle));

[
  "| general moderation queue |",
  "| live safety queue |",
  "| DMCA/legal queue |",
  "| payment/money support queue |",
  "| appeals queue |",
  "| urgent severity assignment |",
  "| report triage |",
  "| case self-assignment |",
  "| case reassignment |",
  "| case escalation to Owner |",
  "| case escalation to legal/DMCA |",
  "| case escalation to money/support |",
  "| internal case note |",
  "| user-facing notice |",
  "| creator-facing notice |",
  "| action reason |",
  "| canned reason |",
  "| takedown action |",
  "| restore/reversal |",
  "| chat-message hide/remove/restore |",
  "| live-room force-end |",
  "| account restriction recommendation |",
  "| repeated-offender flag |",
  "| coordinated-report flag |",
  "| malicious-report flag |",
  "| urgent report SLA |",
  "| post-action audit review |",
].forEach((needle) => requireText("moderation queue authority matrix", doc, needle));

[
  "User Notice: Content Removed",
  "User Notice: Content Restored",
  "User Notice: Account Restricted / Suspended",
  "Creator Notice: Creator Content Removed / Unavailable",
  "Creator Notice: Creator Content Restored",
  "Reporter Acknowledgement",
  "Appeal Received",
  "Appeal Decision Upheld",
  "Appeal Decision Reversed",
  "DMCA Acknowledgement",
  "Legal Escalation Internal Note",
  "Money / Support Dispute Acknowledgement",
  "Live Safety Incident Follow-Up",
  "Malicious Reporting Warning",
].forEach((needle) => requireText("notice templates", doc, needle));

[
  "SAFETY_REPORTS_TABLE",
  "SafetyReportSeverity",
  "SafetyReportStatus",
  "SafetyReportResolutionType",
  "\"critical\"",
  "\"high\"",
  "\"escalated\"",
  "canReviewSafetyQueue",
  "reports_review",
  "content_moderation",
  "admin.chat_evidence.view",
  "admin.live.force_end",
].forEach((needle) => requireText("moderation helper backing", moderation, needle));

[
  "SafetyReportQueueItem",
  "safetyReports",
  "safetyReportQueueSummary",
  "selectedSafetyReport",
  "formatReportRiskLabel",
  "reportStatusActionBusy",
  "Action reason for immutable audit",
  "Report status actions require an action reason and write immutable audit rows.",
  "Escalate",
  "DMCA",
  "Live Ops",
].forEach((needle) => requireText("Admin moderation UI backing", adminUi, needle));

[
  "Normal reports, DMCA/legal, support, money/refund/access support, security incidents, and appeals are separated.",
  "Urgent reports include threats, self-harm, child/minor safety, live violence, doxxing, active fraud, and security incidents.",
].forEach((needle) => requireText("reporting workflow reference", reportingDoc, needle));

[
  "Reports do not auto-delete content.",
  "Takedowns require exact scope, reason, case/report context where applicable, and audit.",
].forEach((needle) => requireText("content takedown reference", takedownDoc, needle));

[
  "Live safety reports route to the live-safety queue.",
  "LiveKit token issuer remains source of truth for publish authority.",
].forEach((needle) => requireText("live moderation reference", liveDoc, needle));

[
  "Specific chat messages can be reported.",
  "Staff private chat evidence access requires exact scope and case/report context.",
].forEach((needle) => requireText("chat moderation reference", chatDoc, needle));

[
  "Appeals use support/escalation workflow in V1",
  "Appeals do not expose reporter identity or private evidence.",
].forEach((needle) => requireText("account appeals reference", accountDoc, needle));

[
  "Moderator can perform support duties only with exact support scopes",
  "Moderator cannot perform account-wide suspension/restoration by default.",
].forEach((needle) => requireText("moderator role reference", moderatorDoc, needle));

[
  "Moderation decisions are audited.",
  "Final proof artifacts include only sanitized audit evidence.",
].forEach((needle) => requireText("audit governance reference", auditDoc, needle));

[
  "Post-incident audit review is required.",
  "live-room harassment",
].forEach((needle) => requireText("emergency governance reference", emergencyDoc, needle));

[
  "Safe public non-money systems remain enabled",
  "Reporting, blocking, account restriction, legal/support/account deletion, and monitoring remain aligned.",
].forEach((needle) => requireText("public switchboard reference", publicDoc, needle));

[
  "Data Safety evidence map matches actual app behavior",
].forEach((needle) => requireText("legal data safety reference", legalDoc, needle));

[
  "LiveKit/chat/upload/payment/reporting failures use safe diagnostics",
].forEach((needle) => requireText("monitoring reference", monitoringDoc, needle));

[
  "docs/admin/STAFF_ACCESS_LIFECYCLE_ONBOARDING_OFFBOARDING_GOVERNANCE.md",
  "docs/ops/EMERGENCY_CONTROLS_INCIDENT_RESPONSE_KILL_SWITCH_GOVERNANCE.md",
  "docs/admin/AUDIT_LOG_INTEGRITY_PRIVILEGED_ACTION_EVIDENCE.md",
  "docs/PUBLIC_NON_MONEY_FEATURE_ENABLEMENT_SWITCHBOARD.md",
  "docs/admin/ADMIN_SEARCH_PRIVACY_EXPORT_GOVERNANCE.md",
  "docs/admin/MONEY_ADMIN_AUTHORITY_ACTIVATION_GOVERNANCE.md",
  "docs/monitoring/MONITORING_ANALYTICS_CRASH_RUNTIME_DIAGNOSTICS.md",
  "docs/legal/LEGAL_PRIVACY_DATA_SAFETY_FINAL_ALIGNMENT.md",
  "docs/account/ACCOUNT_RESTRICTION_APPEALS_OPERATIONS.md",
  "docs/legal/REPORTING_MODERATION_PRODUCTION_WORKFLOW.md",
  "docs/legal/CONTENT_TAKEDOWN_DECISIONS.md",
  "docs/live/LIVE_ROOM_MODERATION_INCIDENT_RESPONSE.md",
  "docs/chat/CHAT_CALL_MODERATION_NOTIFICATION_ABUSE.md",
  "docs/admin/MODERATOR_ROLE_SCOPE_AND_SUPPORT_DUTIES.md",
  "docs/admin/STAFF_ROLE_HIERARCHY_PROOF.md",
  "docs/admin/ADMIN_ROLE_SCOPE_AND_PERMISSIONS.md",
  "docs/admin/FIRST_OWNER_AUTHORITY_AND_SUCCESSION.md",
  "docs/admin/OWNER_ADMIN_COMMAND_CENTER_PRODUCTION_UI.md",
].forEach((needle) => requireText("existing proof references", doc, needle));

[
  "proof:moderation-queue-case-management-escalation-governance",
  "guard:moderation-queue-case-policy",
].forEach((needle) => requireText("package scripts", packageJson, needle));

notes.push("Moderation queue/case governance document exists with separated queue matrix, urgent SLA, scoped action policy, notice templates, and follow-up gaps.");
notes.push("Existing safety_reports, Admin Reports, DMCA/legal, live, chat, account appeals, audit, emergency, public enablement, and monitoring references remain intact.");
notes.push("Money, provider, payout, Premium public purchase, broad Moderator powers, and Support backend role remain off/not introduced.");

if (failures.length) {
  console.error("Moderation queue case management escalation governance proof failed:");
  failures.forEach((failure) => console.error(`- ${failure}`));
  process.exit(1);
}

console.log("Moderation queue case management escalation governance proof passed.");
notes.forEach((note) => console.log(`- ${note}`));
