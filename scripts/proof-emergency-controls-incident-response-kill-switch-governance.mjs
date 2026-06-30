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

const doc = read("docs/ops/EMERGENCY_CONTROLS_INCIDENT_RESPONSE_KILL_SWITCH_GOVERNANCE.md");
const packageJson = read("package.json");
const featureFlags = read("_lib/featureFlags.ts");
const moneyFlags = read("_lib/moneyFeatureFlags.ts");
const adminUi = read("app/admin.tsx");
const ownerControls = read("supabase/functions/admin-owner-controls/index.ts");
const auditDoc = read("docs/admin/AUDIT_LOG_INTEGRITY_PRIVILEGED_ACTION_EVIDENCE.md");
const publicSwitchboardDoc = read("docs/PUBLIC_NON_MONEY_FEATURE_ENABLEMENT_SWITCHBOARD.md");
const moneyDoc = read("docs/admin/MONEY_ADMIN_AUTHORITY_ACTIVATION_GOVERNANCE.md");
const commandCenterDoc = read("docs/admin/OWNER_ADMIN_COMMAND_CENTER_PRODUCTION_UI.md");
const adminRoleDoc = read("docs/admin/ADMIN_ROLE_SCOPE_AND_PERMISSIONS.md");
const moderatorDoc = read("docs/admin/MODERATOR_ROLE_SCOPE_AND_SUPPORT_DUTIES.md");

[
  "Emergency controls, incident response, and kill-switch governance: Closed / Partial / Blocked",
  "Safe public non-money systems remain enabled",
  "Emergency actions require exact scope, reason, and audit where backed",
  "First Owner / Owner owns emergency control authority",
  "Admin can operate only exact-scope emergency controls where explicitly allowed",
  "Moderator cannot operate broad emergency controls",
  "Support is not a backend role",
  "Emergency disable preserves evidence and does not hard-delete audit records",
  "Emergency disable does not execute refunds, purchases, payouts, transfers, or provider mutations",
  "Customer, creator, security, legal/DMCA, money, and live-room harassment templates are privacy-safe",
  "Post-incident audit review is required",
  "Rollback checklist exists",
  "Incident owner and escalation path are documented",
  "live_money_enabled remains OFF",
  "Creator-money remains OFF",
  "Premium public purchase remains OFF",
  "Payouts, payable balances, withdrawals, cash-out, transfers, Stripe Connect, merch checkout, and payout movement remain OFF",
  "Provider refunds remain manual/external",
  "No Google Play, RevenueCat, Stripe, payout, purchase, refund, or provider mutation happened",
].forEach((needle) => requireText("emergency governance doc", doc, needle));

[
  "Emergency Authority Matrix",
  "Kill-Switch Model",
  "Incident Owner / Escalation Path",
  "Rollback Checklist",
  "Customer Support Incident Reply",
  "Creator Support Incident Reply",
  "Security Incident Internal Note",
  "Legal/DMCA Incident Internal Note",
  "Money Incident Internal Note",
  "Live-Room Harassment Incident Internal Note",
  "Post-Incident Review Template",
  "Post-Incident Audit Review Requirement",
  "UI / Command Center Status",
  "Unsupported / Future Emergency Controls",
  "Existing Proof References",
].forEach((needle) => requireText("emergency governance sections", doc, needle));

[
  "| emergency-disable creator-money |",
  "| emergency-disable Premium purchases |",
  "| emergency-disable uploads |",
  "| emergency-disable chat |",
  "| emergency-disable calls |",
  "| emergency-disable LiveKit rooms |",
  "| emergency-disable Watch-Party Live |",
  "| emergency-disable Live Watch-Party |",
  "| emergency-disable Live Stage / Live Room |",
  "| emergency-disable comments/replies/posts |",
  "| emergency-disable account creation |",
  "| force logout sessions |",
  "| revoke suspicious access grants |",
  "| freeze Admin Command Center tools |",
  "| freeze Admin Search |",
  "| pause notifications |",
  "| pause provider webhook processing if safe/existing |",
  "| scanner/media storage emergency hold |",
  "| emergency account restriction/suspension |",
  "| emergency report queue escalation |",
  "| legal/DMCA emergency preservation |",
  "| money incident freeze |",
  "| emergency money kill switch |",
  "| rollback EAS update |",
  "| rollback Supabase function |",
  "| rollback feature flags |",
].forEach((needle) => requireText("emergency authority matrix", doc, needle));

[
  "docs/admin/AUDIT_LOG_INTEGRITY_PRIVILEGED_ACTION_EVIDENCE.md",
  "docs/PUBLIC_NON_MONEY_FEATURE_ENABLEMENT_SWITCHBOARD.md",
  "docs/admin/ADMIN_SEARCH_PRIVACY_EXPORT_GOVERNANCE.md",
  "docs/admin/MONEY_ADMIN_AUTHORITY_ACTIVATION_GOVERNANCE.md",
  "docs/admin/OWNER_ADMIN_COMMAND_CENTER_PRODUCTION_UI.md",
  "docs/admin/FIRST_OWNER_AUTHORITY_AND_SUCCESSION.md",
  "docs/admin/ADMIN_ROLE_SCOPE_AND_PERMISSIONS.md",
  "docs/admin/MODERATOR_ROLE_SCOPE_AND_SUPPORT_DUTIES.md",
  "docs/admin/STAFF_ROLE_HIERARCHY_PROOF.md",
  "docs/legal/LEGAL_PRIVACY_DATA_SAFETY_FINAL_ALIGNMENT.md",
  "docs/account/ACCOUNT_RESTRICTION_APPEALS_OPERATIONS.md",
  "docs/legal/REPORTING_MODERATION_PRODUCTION_WORKFLOW.md",
  "docs/legal/CONTENT_TAKEDOWN_DECISIONS.md",
  "docs/live/LIVE_ROOM_MODERATION_INCIDENT_RESPONSE.md",
  "docs/chat/CHAT_CALL_MODERATION_NOTIFICATION_ABUSE.md",
  "docs/monitoring/MONITORING_ANALYTICS_CRASH_RUNTIME_DIAGNOSTICS.md",
].forEach((needle) => requireText("existing proof references", doc, needle));

[
  "new_accounts_enabled: true",
  "uploads_enabled: true",
  "comments_enabled: true",
  "attachments_enabled: true",
  "chat_enabled: true",
  "chat_attachments_enabled: true",
  "live_first_enabled: true",
  "live_watch_party_enabled: true",
  "watch_party_live_enabled: true",
  "profile_posting_enabled: true",
  "creator_posting_enabled: true",
  "premiumPurchaseEnabled: false",
  "paidContentCheckoutEnabled: false",
  "tipsEnabled: false",
  "merchStoreEnabled: false",
  "cashoutEnabled: false",
  "payoutsEnabled: false",
  "stripeConnectProductionEnabled: false",
  "liveMoneyEnabled: false",
].forEach((needle) => requireText("runtime feature flags", featureFlags, needle));

[
  'live_money_enabled: "off"',
  'tips_enabled: "sandbox_only"',
  'paid_content_enabled: "sandbox_only"',
  'merch_enabled: "off"',
  'payouts_enabled: "off"',
  'digital_sales_enabled: "sandbox_only"',
].forEach((needle) => requireText("money feature defaults", moneyFlags, needle));

[
  "Emergency Actions",
  "Open incident checklist",
  "Supabase Auth session force logout remains manual until a reviewed Admin API lane is added.",
  "Emergency actions require backend-verified owner access plus a backend-trusted current device. Each action also requires a reason, confirmation phrase, and audit write.",
].forEach((needle) => requireText("admin emergency UI", adminUi, needle));

[
  "emergencyOwnerToolLock",
  "No safe backend emergency lock capability is configured.",
  "forceLogoutAllOwnerSessions",
  "Supabase owner-session force logout is manual unless a reviewed Admin API lane is added.",
].forEach((needle) => requireText("owner security backend", ownerControls, needle));

[
  "Emergency controls, incident response, and kill-switch governance",
].forEach((needle) => {
  requireText("audit doc cross-reference", auditDoc, needle);
  requireText("public switchboard cross-reference", publicSwitchboardDoc, needle);
  requireText("money doc cross-reference", moneyDoc, needle);
  requireText("Command Center doc cross-reference", commandCenterDoc, needle);
  requireText("Admin role doc cross-reference", adminRoleDoc, needle);
  requireText("Moderator role doc cross-reference", moderatorDoc, needle);
});

[
  "proof:emergency-controls-incident-response-kill-switch-governance",
  "guard:emergency-controls-incident-response-policy",
].forEach((needle) => requireText("package scripts", packageJson, needle));

notes.push("Emergency governance document exists with authority matrix, escalation path, rollback checklist, templates, and post-incident audit review.");
notes.push("Runtime public non-money controls remain enabled by default; money-moving controls remain off.");
notes.push("Owner Security UI/backend distinguish backed grant/device emergency actions from manual/future Auth force logout and broad locks.");
notes.push("Closed audit/public/search/money/monitoring/legal/account/reporting/live/chat/staff proof references remain linked.");

if (failures.length) {
  console.error("Emergency controls incident response kill-switch governance proof failed:");
  failures.forEach((failure) => console.error(`- ${failure}`));
  process.exit(1);
}

console.log("Emergency controls incident response kill-switch governance proof passed.");
notes.forEach((note) => console.log(`- ${note}`));
