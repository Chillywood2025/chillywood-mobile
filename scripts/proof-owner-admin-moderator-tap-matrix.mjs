#!/usr/bin/env node
import { readFileSync } from "node:fs";
import path from "node:path";

const root = process.cwd();
const read = (file) => readFileSync(path.join(root, file), "utf8");
const failures = [];
const requireText = (label, source, needle) => {
  if (!source.includes(needle)) failures.push(`${label} missing ${needle}`);
};
const forbidText = (label, source, needle) => {
  if (source.includes(needle)) failures.push(`${label} must not include ${needle}`);
};

const matrix = read("_lib/platformRoleActionMatrix.ts");
const registry = read("_lib/adminActionRegistry.ts");
const admin = read("app/admin.tsx");
const ownerCommand = read("_lib/ownerCommandOperator.ts");

for (const role of [
  "anonymous",
  "signed_in_user",
  "creator/channel_owner",
  "moderator",
  "operator",
  "admin",
  "super_admin",
  "owner",
  "rachi",
  "autonomous_operator",
]) requireText("role matrix", matrix, role);

for (const action of [
  "canApproveAutonomousRequests",
  "canDenyAutonomousRequests",
  "canUseOwnerCommandCenter",
  "canExecuteOwnerCommand",
  "canEmergencyPauseSystem",
  "canUseAdminSearch",
  "canMoveMoney",
  "canGrantPremium",
  "canPublishOrRollbackRelease",
  "canMutateAuthRls",
  "canEnforceUserRestriction",
  "canDeleteContent",
  "canSendBroadNotification",
]) requireText("role matrix action", matrix, action);

for (const id of [
  "admin-role-action-contract-section",
  "admin-action-registry-status",
  "admin-role-action-denial-copy",
  "admin-high-risk-blocked-actions",
  "owner-command-execute-button",
  "autonomous-approval-approve-button",
  "admin-staff-grant-button",
  "admin-report-target-moderation-${status}-button",
  "admin-report-status-${action}-button",
]) requireText("admin UI tap contract", admin, id);

for (const id of [
  "owner.command.submit_or_execute_safe",
  "autonomous.approval.approve",
  "staff.role.grant",
  "moderation.report_target.hide",
  "money.center.view",
]) requireText("admin action registry", registry, id);

for (const boundary of [
  "Owner Command Center is owner/super_admin only.",
  "Manual Premium grant/edit controls are forbidden.",
  "Money movement is never a direct UI action",
  "Production publish/rollback requires Level 4 approval",
  "Rachi can request/recommend but cannot approve itself",
  "Admin Search requires owner/admin search scope and audited masked query readback.",
]) requireText("authority boundary", `${matrix}\n${registry}\n${admin}\n${ownerCommand}`, boundary);

for (const searchGate of [
  "const canUseAdminSearch = isSignedIn",
  'hasPlatformRoleMembership(platformRoles, ["owner", "super_admin", "operator"])',
  'hasPlatformStaffPermission(platformRoles, ["admin.user.search", "user_lookup"])',
  "if (!canUseAdminSearch) return false;",
  "if (!canUseAdminSearch) return null;",
  "if (!canUseAdminSearch || queryText.length < ADMIN_SEARCH_MIN_LENGTH)",
]) requireText("admin search moderator boundary", admin, searchGate);

for (const forbidden of [
  "manualPremiumGrant",
  "releasePayout",
  "markPayoutPaid",
  "createPaymentLink",
  "publishProductionOtaNow",
  "banUserNow",
  "deleteContentNow",
]) forbidText("admin UI direct high-risk handler", admin, forbidden);

if (failures.length) {
  console.error("proof:owner-admin-moderator-tap-matrix failed");
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log("proof:owner-admin-moderator-tap-matrix passed");
