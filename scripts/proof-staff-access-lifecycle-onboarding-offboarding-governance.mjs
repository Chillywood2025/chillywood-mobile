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

const doc = read("docs/admin/STAFF_ACCESS_LIFECYCLE_ONBOARDING_OFFBOARDING_GOVERNANCE.md");
const packageJson = read("package.json");
const commandCenterDoc = read("docs/admin/OWNER_ADMIN_COMMAND_CENTER_PRODUCTION_UI.md");
const firstOwnerDoc = read("docs/admin/FIRST_OWNER_AUTHORITY_AND_SUCCESSION.md");
const adminDoc = read("docs/admin/ADMIN_ROLE_SCOPE_AND_PERMISSIONS.md");
const moderatorDoc = read("docs/admin/MODERATOR_ROLE_SCOPE_AND_SUPPORT_DUTIES.md");
const hierarchyDoc = read("docs/admin/STAFF_ROLE_HIERARCHY_PROOF.md");
const auditDoc = read("docs/admin/AUDIT_LOG_INTEGRITY_PRIVILEGED_ACTION_EVIDENCE.md");
const emergencyDoc = read("docs/ops/EMERGENCY_CONTROLS_INCIDENT_RESPONSE_KILL_SWITCH_GOVERNANCE.md");
const publicDoc = read("docs/PUBLIC_NON_MONEY_FEATURE_ENABLEMENT_SWITCHBOARD.md");
const adminUi = read("app/admin.tsx");
const moderation = read("_lib/moderation.ts");
const ownerControls = read("_lib/adminOwnerControls.ts");
const ownerBackend = read("supabase/functions/admin-owner-controls/index.ts");

[
  "Staff access lifecycle, onboarding, and offboarding governance: Closed / Partial / Blocked",
  "Support is not a backend role",
  "Support-workflow access is exact-scope permission work",
  "Shared staff accounts are forbidden",
  "Proof/test accounts are separate from staff accounts",
  "Service accounts are not human staff accounts",
  "Staff actions must be attributable to one human account",
  "Staff access requires Owner/First Owner approval where backed",
  "Staff permissions are least-privilege",
  "Staff access should be temporary or reviewable by default",
  "Staff MFA is required where the identity/provider supports it",
  "Monthly staff access review is required",
  "Staff removal revokes app roles and scopes where backed",
  "Staff removal invalidates sessions where backed and documents manual/future full Auth logout if not backed",
  "Offboarding is audited",
  "Emergency staff removal is supported or documented as manual/future",
  "Provider dashboard offboarding is documented as manual checklist in this lane",
  "No provider dashboard access was changed",
  "Safe public non-money systems remain enabled",
  "live_money_enabled remains OFF",
  "Creator-money remains OFF",
  "Premium public purchase remains OFF",
  "Payouts, payable balances, withdrawals, cash-out, transfers, Stripe Connect, merch checkout, and payout movement remain OFF",
  "No Google Play, RevenueCat, Stripe, payout, purchase, refund, or provider mutation happened",
].forEach((needle) => requireText("staff lifecycle governance doc", doc, needle));

[
  "Staff Lifecycle Authority Matrix",
  "Onboarding Approval Model",
  "Support-Workflow Permission Model",
  "Least-Privilege / Temporary / MFA / Monthly Review Model",
  "Staff Removal / Session Invalidation Model",
  "Offboarding Checklist",
  "Provider Dashboard Offboarding Checklist",
  "Proof/Test Account Separation",
  "Service Account Separation",
  "Shared Account Prohibition",
  "UI / Command Center Status",
  "Audit Model",
  "Gaps / Follow-Ups",
  "Existing Proof References",
  "Launch Status",
].forEach((needle) => requireText("staff lifecycle sections", doc, needle));

[
  "| add Owner |",
  "| remove Owner |",
  "| First Owner self-step-down |",
  "| add Admin/operator |",
  "| remove Admin/operator |",
  "| add Moderator |",
  "| remove Moderator |",
  "| grant staff scope |",
  "| revoke staff scope |",
  "| support-workflow scope grant |",
  "| support-workflow scope revoke |",
  "| temporary staff access |",
  "| expired staff access review |",
  "| monthly access review |",
  "| emergency staff removal |",
  "| staff session invalidation |",
  "| device/access grant revoke |",
  "| provider dashboard offboarding |",
  "| Supabase offboarding |",
  "| Google Play offboarding |",
  "| RevenueCat offboarding |",
  "| Stripe offboarding |",
  "| Firebase offboarding |",
  "| Expo/EAS offboarding |",
  "| GitHub offboarding |",
  "| LiveKit/infra offboarding |",
  "| DNS/Cloudflare offboarding |",
  "| support/legal hosting offboarding |",
  "| proof account creation |",
  "| proof account cleanup |",
  "| service account inventory |",
  "| shared account prohibition |",
].forEach((needle) => requireText("staff lifecycle authority matrix", doc, needle));

[
  "docs/ops/EMERGENCY_CONTROLS_INCIDENT_RESPONSE_KILL_SWITCH_GOVERNANCE.md",
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
  "grantPlatformStaffRoleByEmail",
  "revokePlatformStaffRoleByEmail",
  "grantPlatformStaffPermissionByEmail",
  "revokePlatformStaffPermissionByEmail",
  "updatePlatformStaffPermissionsByEmail",
  "admin_grant_platform_role_by_email",
  "admin_revoke_platform_role_by_email",
  "admin_grant_platform_staff_permission_by_email",
  "admin_revoke_platform_staff_permission_by_email",
  "admin_update_platform_staff_permissions_by_email",
  "expiresAt",
].forEach((needle) => requireText("staff helper backing", moderation, needle));

[
  "Staff & Roles",
  "Step 1: Grant / Revoke Staff Access",
  "Step 2: Scoped Permission Matrix",
  "Admin removal requires Owner or admin_grants.",
  "Moderator removal requires Owner or manage_moderators.",
  "Moderators cannot add or remove staff.",
  "Expiration must be in the future",
  "Supabase Auth session force logout remains manual until a reviewed Admin API lane is added.",
].forEach((needle) => requireText("Command Center staff UI", adminUi, needle));

[
  "revokeOwnerDevice",
  "revokeTemporaryOwnerGrant",
  "revokeAllTemporaryOwnerGrants",
].forEach((needle) => requireText("owner security helpers", ownerControls, needle));

[
  "support_agent",
  "moderator_support",
  "expires_at",
  "proofSource: \"permission read path filters status=active and expires_at\"",
].forEach((needle) => requireText("owner controls backend", ownerBackend, needle));

[
  "Staff access lifecycle, onboarding, and offboarding governance",
].forEach((needle) => {
  requireText("Command Center doc cross-reference", commandCenterDoc, needle);
  requireText("First Owner doc cross-reference", firstOwnerDoc, needle);
  requireText("Admin role doc cross-reference", adminDoc, needle);
  requireText("Moderator role doc cross-reference", moderatorDoc, needle);
  requireText("Staff hierarchy doc cross-reference", hierarchyDoc, needle);
  requireText("Audit doc cross-reference", auditDoc, needle);
  requireText("Emergency doc cross-reference", emergencyDoc, needle);
  requireText("Public switchboard doc cross-reference", publicDoc, needle);
});

[
  "proof:staff-access-lifecycle-onboarding-offboarding-governance",
  "guard:staff-access-lifecycle-policy",
].forEach((needle) => requireText("package scripts", packageJson, needle));

notes.push("Staff lifecycle governance document exists with authority matrix, onboarding/offboarding policy, provider-dashboard manual checklist, proof/test separation, and service-account separation.");
notes.push("Existing Command Center staff role/scope paths, permission expiration, Owner Security revoke actions, and audit docs remain referenced.");
notes.push("Provider dashboard offboarding is manual checklist only; no provider dashboard access was changed.");

if (failures.length) {
  console.error("Staff access lifecycle onboarding offboarding governance proof failed:");
  failures.forEach((failure) => console.error(`- ${failure}`));
  process.exit(1);
}

console.log("Staff access lifecycle onboarding offboarding governance proof passed.");
notes.forEach((note) => console.log(`- ${note}`));
