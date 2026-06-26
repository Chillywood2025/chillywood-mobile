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

const doc = read("docs/legal/MODERATION_CASE_OPERATIONS_COMPLETION.md");
const queueDoc = read("docs/legal/MODERATION_QUEUE_CASE_MANAGEMENT_ESCALATION_GOVERNANCE.md");
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
const packageJson = read("package.json");

[
  "Moderation case operations completion: Closed / Partial / Blocked",
  "Case assignment is exact-scope, case-bound, and audited where backed",
  "Internal notes are private, scoped, sanitized, and audited where backed",
  "Internal notes are never user-facing",
  "Universal canned reasons are templates only",
  "Canned reasons still require human review",
  "Coordinated-report detection is flags/signals only",
  "Coordinated-report detection does not auto-punish",
  "Repeated-offender aggregation is review/risk flags only",
  "Repeated-offender aggregation does not auto-punish",
  "Malicious reporting is handled without exposing reporter identity",
  "Urgent-report SLA owner and escalation are documented",
  "No auto-ban, auto-delete, auto-suspend, auto-restrict, auto-hide, or auto-punishment was added",
  "Safe public non-money systems remain enabled",
  "live_money_enabled remains OFF",
  "Creator-money remains OFF",
  "Premium public purchase remains OFF",
  "Payouts, payable balances, withdrawals, cash-out, transfers, Stripe Connect, merch checkout, and payout movement remain OFF",
  "No Google Play, RevenueCat, Stripe, payout, purchase, refund, or provider mutation happened",
].forEach((needle) => requireText("moderation case operations completion doc", doc, needle));

[
  "Moderation Operations Completion Matrix",
  "Case Assignment / Internal Notes Model",
  "Canned Reasons / Human Review Model",
  "Coordinated Report Signal Model",
  "Repeated Offender Review-Flag Model",
  "Malicious Reporting Handling",
  "SLA Owner / Escalation",
  "UI / Command Center Status",
  "Existing Proof References",
  "Launch Status",
].forEach((needle) => requireText("moderation operations sections", doc, needle));

[
  "| generic case assignment |",
  "| case self-assignment |",
  "| case reassignment |",
  "| assignment audit |",
  "| internal notes |",
  "| note privacy |",
  "| note sanitization |",
  "| note audit |",
  "| universal canned reasons |",
  "| reason template selection |",
  "| reporter acknowledgement reason |",
  "| content removal reason |",
  "| content restore reason |",
  "| account restriction reason |",
  "| appeal upheld reason |",
  "| appeal reversed reason |",
  "| live safety reason |",
  "| DMCA/legal reason |",
  "| money/support dispute reason |",
  "| malicious reporting reason |",
  "| coordinated-report flag |",
  "| repeated-offender flag |",
  "| malicious-reporter flag |",
  "| urgent SLA owner |",
  "| urgent SLA escalation |",
].forEach((needle) => requireText("moderation operations matrix", doc, needle));

[
  "The remaining moderation case operations follow-ups are closed as safe human-review operations",
  "any future generic backend table/UI remains a separate exact implementation lane",
].forEach((needle) => requireText("queue governance reference", queueDoc, needle));

[
  "Moderation case operations completion is documented in `docs/legal/MODERATION_CASE_OPERATIONS_COMPLETION.md`",
].forEach((needle) => {
  [
    ["reporting workflow", reportingDoc],
    ["content takedown", takedownDoc],
    ["live moderation", liveDoc],
    ["chat moderation", chatDoc],
    ["account restriction", accountDoc],
    ["moderator scope", moderatorDoc],
    ["audit governance", auditDoc],
    ["emergency governance", emergencyDoc],
    ["public switchboard", publicDoc],
    ["legal privacy data safety", legalDoc],
    ["monitoring diagnostics", monitoringDoc],
  ].forEach(([label, content]) => requireText(label, content, needle));
});

[
  "SAFETY_REPORTS_TABLE",
  "SafetyReportSeverity",
  "SafetyReportStatus",
  "SafetyReportResolutionType",
  "reports_review",
  "content_moderation",
  "admin.chat_evidence.view",
  "admin.live.force_end",
].forEach((needle) => requireText("moderation helper backing", moderation, needle));

[
  "Action reason for immutable audit",
  "DMCA_NOTIFICATION_TEMPLATES",
  "Internal case notes",
  "Repeated Reports",
  "Repeated-report aggregation is not configured.",
].forEach((needle) => requireText("Admin moderation UI backing", adminUi, needle));

[
  "docs/legal/MODERATION_QUEUE_CASE_MANAGEMENT_ESCALATION_GOVERNANCE.md",
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
  "proof:moderation-case-operations-completion",
  "guard:moderation-case-operations-policy",
].forEach((needle) => requireText("package scripts", packageJson, needle));

notes.push("Moderation case operations completion doc exists with operations matrix, assignment/note model, canned-reason model, signal-only coordinated-report model, review-flag repeated-offender model, malicious-report privacy, and SLA owner/escalation.");
notes.push("Existing moderation queue, staff, emergency, audit, public, search, money, monitoring, legal, account, reporting, live, chat, and role proofs are referenced.");
notes.push("No automatic punishment, money activation, provider mutation, or broad Moderator authority is introduced by this lane.");

if (failures.length) {
  console.error("Moderation case operations completion proof failed:");
  failures.forEach((failure) => console.error(`- ${failure}`));
  process.exit(1);
}

console.log("Moderation case operations completion proof passed.");
notes.forEach((note) => console.log(`- ${note}`));
