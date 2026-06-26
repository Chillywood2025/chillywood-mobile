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

const doc = read("docs/ops/PROVIDER_DASHBOARD_OWNERSHIP_ACCESS_GOVERNANCE.md");
const dashboardDoc = read("docs/DASHBOARD_SETUP_COMMAND_CENTER.md");
const providerRunbook = read("docs/PROVIDER_LINK_READINESS_RUNBOOK.md");
const staffDoc = read("docs/admin/STAFF_ACCESS_LIFECYCLE_ONBOARDING_OFFBOARDING_GOVERNANCE.md");
const emergencyDoc = read("docs/ops/EMERGENCY_CONTROLS_INCIDENT_RESPONSE_KILL_SWITCH_GOVERNANCE.md");
const moneyDoc = read("docs/admin/MONEY_ADMIN_AUTHORITY_ACTIVATION_GOVERNANCE.md");
const monitoringDoc = read("docs/monitoring/MONITORING_ANALYTICS_CRASH_RUNTIME_DIAGNOSTICS.md");
const legalDoc = read("docs/legal/LEGAL_PRIVACY_DATA_SAFETY_FINAL_ALIGNMENT.md");
const finalGoNoGo = read("docs/FINAL_PUBLIC_USE_GO_NO_GO.md");
const finalChecklist = read("docs/FINAL_PRODUCTION_READINESS_CHECKLIST.md");
const nextTask = read("NEXT_TASK.md");
const roadmap = read("ROADMAP.md");
const currentState = read("CURRENT_STATE.md");
const packageJson = read("package.json");

[
  "Provider dashboard ownership and access governance: Closed / Partial / Blocked",
  "This lane did not mutate provider dashboards",
  "First Owner / Owner owns provider dashboard accountability",
  "Each provider has a primary owner and backup owner requirement",
  "Company-controlled email is required where available",
  "Personal accounts are avoided for production ownership",
  "Provider roles must be least-privilege",
  "MFA/2FA is required where supported",
  "Shared provider dashboard accounts are forbidden where individual access is supported",
  "Service accounts are not human staff accounts",
  "Service accounts are documented by name/type only with owner, purpose, scope, storage location by system name only, rotation path, and revocation path",
  "API keys and provider secrets must live in secret managers/provider dashboards/EAS/Supabase/GitHub secrets, not repo",
  "Provider webhooks must be protected with signature/shared-secret validation where supported",
  "Webhook secrets have a rotation plan",
  "Old API keys must be revoked or documented for revocation",
  "Credential rotation calendar exists",
  "Provider offboarding checklist exists",
  "Backup owner and recovery path are documented",
  "Provider support tickets are tracked with sanitized references",
  "Provider decisions are mirrored into repo docs with sanitized facts",
  "Dashboard access proof remains owner-confirmation-required where repo cannot verify it",
  "Safe public non-money systems remain enabled",
  "live_money_enabled remains OFF",
  "Creator-money remains OFF",
  "Premium public purchase remains OFF",
  "Payouts, payable balances, withdrawals, cash-out, transfers, Stripe Connect, merch checkout, and payout movement remain OFF",
  "No Google Play, RevenueCat, Stripe, payout, purchase, refund, or provider mutation happened",
].forEach((needle) => requireText("provider dashboard governance doc", doc, needle));

[
  "Provider Dashboard Ownership Matrix",
  "Company Email / Personal Account / MFA Policy",
  "Service Account / Secret Inventory",
  "Webhook Protection / Rotation Model",
  "Credential Rotation Calendar",
  "Provider Offboarding Checklist",
  "Backup Owner / Recovery Path",
  "Provider Support-Ticket Tracking Model",
  "Provider Decision Mirroring Model",
  "Proof Status / Owner Confirmation Required",
  "Existing Proof References",
  "Owner Action Items",
  "Launch Status",
].forEach((needle) => requireText("provider governance sections", doc, needle));

[
  "| Google Play Console |",
  "| RevenueCat |",
  "| Supabase |",
  "| Firebase / Google Cloud |",
  "| Stripe |",
  "| Expo / EAS |",
  "| GitHub |",
  "| LiveKit |",
  "| Hetzner / infrastructure |",
  "| DNS / Cloudflare |",
  "| Legal/support hosting |",
  "| Support email/ticketing |",
  "| Domain registrar |",
  "| Media storage provider |",
  "| Notifications provider |",
  "| Scanner/webhook provider |",
].forEach((needle) => requireText("provider dashboard ownership matrix", doc, needle));

[
  "docs/legal/MODERATION_CASE_OPERATIONS_COMPLETION.md",
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
  ["dashboard setup command center", dashboardDoc],
  ["provider link readiness runbook", providerRunbook],
  ["staff lifecycle governance", staffDoc],
  ["emergency controls governance", emergencyDoc],
  ["money admin governance", moneyDoc],
  ["monitoring diagnostics", monitoringDoc],
  ["legal privacy data safety", legalDoc],
  ["final public go no-go", finalGoNoGo],
  ["final production readiness checklist", finalChecklist],
  ["next task", nextTask],
  ["roadmap", roadmap],
  ["current state", currentState],
].forEach(([label, content]) => {
  requireText(label, content, "docs/ops/PROVIDER_DASHBOARD_OWNERSHIP_ACCESS_GOVERNANCE.md");
});

[
  "proof:provider-dashboard-ownership-access-governance",
  "guard:provider-dashboard-ownership-policy",
].forEach((needle) => requireText("package scripts", packageJson, needle));

notes.push("Provider dashboard governance doc exists with ownership matrix, company email/MFA policy, service account inventory, webhook rotation model, credential rotation calendar, offboarding checklist, support-ticket tracking, and provider-decision mirroring.");
notes.push("Existing moderation, staff, emergency, audit, public, search, money, monitoring, legal, account, reporting, live, chat, and role proofs are referenced.");
notes.push("Dashboard access proof remains owner-confirmation-required where repo cannot verify actual provider dashboard users, MFA, or access state.");

if (failures.length) {
  console.error("Provider dashboard ownership/access governance proof failed:");
  failures.forEach((failure) => console.error(`- ${failure}`));
  process.exit(1);
}

console.log("Provider dashboard ownership/access governance proof passed.");
notes.forEach((note) => console.log(`- ${note}`));
