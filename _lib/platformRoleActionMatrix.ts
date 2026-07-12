import type { PlatformStaffPermissionKey } from "./moderation";

export type PlatformAuthorityRole =
  | "anonymous"
  | "signed_in_user"
  | "creator/channel_owner"
  | "moderator"
  | "operator"
  | "admin"
  | "super_admin"
  | "owner"
  | "rachi"
  | "autonomous_operator";

export const PLATFORM_ROLE_ACTION_KEYS = [
  "canAccessAdmin",
  "canViewAdminHome",
  "canViewReports",
  "canReviewReports",
  "canModerateContent",
  "canUseAdminSearch",
  "canViewAuditSummary",
  "canViewPrivateEvidence",
  "canExportEvidence",
  "canManageStaffRoles",
  "canApproveAutonomousRequests",
  "canDenyAutonomousRequests",
  "canCreateAutonomousApprovalRequest",
  "canUseOwnerCommandCenter",
  "canExecuteOwnerCommand",
  "canEmergencyPauseSystem",
  "canViewMoneyCenter",
  "canRunMoneySafeReports",
  "canMoveMoney",
  "canGrantPremium",
  "canViewProviderStatus",
  "canMutateProviderConfig",
  "canViewLiveOps",
  "canMutateLiveKitPolicy",
  "canViewReleaseStatus",
  "canPublishOrRollbackRelease",
  "canViewSecurityFindings",
  "canMutateAuthRls",
  "canViewModerationQueue",
  "canEnforceUserRestriction",
  "canDeleteContent",
  "canSendBroadNotification",
  "canViewObservabilityFindings",
] as const;

export type PlatformRoleActionKey = typeof PLATFORM_ROLE_ACTION_KEYS[number];
export type PlatformRoleActionPermissions = Record<PlatformRoleActionKey, boolean>;

const denyAll = (): PlatformRoleActionPermissions => Object.fromEntries(
  PLATFORM_ROLE_ACTION_KEYS.map((key) => [key, false]),
) as PlatformRoleActionPermissions;

const allow = (
  base: PlatformRoleActionPermissions,
  keys: readonly PlatformRoleActionKey[],
) => {
  const next = { ...base };
  for (const key of keys) next[key] = true;
  return next;
};

const signedIn = denyAll();
const creator = denyAll();

const moderator = allow(denyAll(), [
  "canAccessAdmin",
  "canViewAdminHome",
  "canViewReports",
  "canReviewReports",
  "canModerateContent",
  "canViewAuditSummary",
  "canViewModerationQueue",
]);

const adminOperator = allow(moderator, [
  "canUseAdminSearch",
  "canManageStaffRoles",
  "canCreateAutonomousApprovalRequest",
  "canViewMoneyCenter",
  "canRunMoneySafeReports",
  "canViewProviderStatus",
  "canViewLiveOps",
  "canViewReleaseStatus",
  "canViewSecurityFindings",
  "canViewObservabilityFindings",
]);

const owner = allow(adminOperator, [
  "canViewPrivateEvidence",
  "canExportEvidence",
  "canApproveAutonomousRequests",
  "canDenyAutonomousRequests",
  "canUseOwnerCommandCenter",
  "canExecuteOwnerCommand",
  "canEmergencyPauseSystem",
]);

const rachi = allow(denyAll(), [
  "canCreateAutonomousApprovalRequest",
]);

// Rachi can request/recommend but cannot approve itself.
const autonomousOperator = allow(denyAll(), [
  "canCreateAutonomousApprovalRequest",
]);

export const PLATFORM_ROLE_ACTION_MATRIX: Record<PlatformAuthorityRole, PlatformRoleActionPermissions> = {
  anonymous: denyAll(),
  signed_in_user: signedIn,
  "creator/channel_owner": creator,
  moderator,
  operator: adminOperator,
  admin: adminOperator,
  super_admin: owner,
  owner,
  rachi,
  autonomous_operator: autonomousOperator,
};

export const PLATFORM_ROLE_ACTION_DENIALS: Record<PlatformRoleActionKey, string> = {
  canAccessAdmin: "Admin access requires an active owner, super_admin, admin/operator, or scoped moderator role.",
  canViewAdminHome: "Admin home is staff-only.",
  canViewReports: "Reports require staff review scope.",
  canReviewReports: "Report review requires exact moderation or admin review scope.",
  canModerateContent: "Content moderation requires exact content scope, reason, confirmation, and audit.",
  canUseAdminSearch: "Admin Search requires owner/admin search scope and audited masked query readback.",
  canViewAuditSummary: "Audit summaries require staff audit scope.",
  canViewPrivateEvidence: "Private evidence requires owner/super_admin or exact case-scoped evidence authority.",
  canExportEvidence: "Evidence export is disabled by default and requires a future approved audited lane.",
  canManageStaffRoles: "Staff role changes require owner/super_admin or exact lower-role management scope.",
  canApproveAutonomousRequests: "Only owner/super_admin may approve Level 3/4 autonomous requests.",
  canDenyAutonomousRequests: "Only owner/super_admin may deny Level 3/4 autonomous requests.",
  canCreateAutonomousApprovalRequest: "Only trusted staff, Rachi, or autonomous operators may request approval.",
  canUseOwnerCommandCenter: "Owner Command Center is owner/super_admin only.",
  canExecuteOwnerCommand: "Owner commands execute only through the owner-command operator and target systems.",
  canEmergencyPauseSystem: "Emergency pause/resume is owner/super_admin only.",
  canViewMoneyCenter: "Money Center is staff status/readback only.",
  canRunMoneySafeReports: "Money reports are safe status/reconciliation only.",
  canMoveMoney: "Money movement is never a direct UI action; Level 4 approval plus provider confirmation is required.",
  canGrantPremium: "Manual Premium grant/edit controls are forbidden.",
  canViewProviderStatus: "Provider status readback requires staff money/provider scope.",
  canMutateProviderConfig: "Provider dashboard/config mutation requires autonomous approval.",
  canViewLiveOps: "Live Ops requires exact staff live_ops scope.",
  canMutateLiveKitPolicy: "LiveKit routing/cutoff/server policy mutation requires owner approval.",
  canViewReleaseStatus: "Release status readback is staff/owner scoped.",
  canPublishOrRollbackRelease: "Production publish/rollback requires Level 4 approval and release preflight.",
  canViewSecurityFindings: "Security findings require owner/admin/security scope.",
  canMutateAuthRls: "Auth/RLS mutation requires explicit owner approval and migration proof.",
  canViewModerationQueue: "Moderation queue requires exact report/moderation scope.",
  canEnforceUserRestriction: "User restrictions require backed policy, reason, confirmation, audit, and appeal/review path.",
  canDeleteContent: "Content deletion/removal requires exact content scope and audit; hard purge is not expanded.",
  canSendBroadNotification: "Broad notification campaigns require owner approval and cannot bypass preferences.",
  canViewObservabilityFindings: "Observability findings are staff/owner scoped and redacted.",
};

export const PERMISSION_KEY_BY_ROLE_ACTION: Partial<Record<PlatformRoleActionKey, readonly PlatformStaffPermissionKey[]>> = {
  canUseAdminSearch: ["admin.user.search", "user_lookup"],
  canReviewReports: ["reports_review", "content_moderation"],
  canModerateContent: ["content_moderation", "admin.content.hide", "admin.content.restore", "admin.content.remove"],
  canViewAuditSummary: ["admin.audit.view", "audit_review", "security_review"],
  canViewPrivateEvidence: ["evidence_preview", "legal_review", "admin.profile_private.view", "admin.chat_evidence.view"],
  canExportEvidence: ["evidence_export"],
  canManageStaffRoles: ["admin_grants", "manage_moderators", "admin.lower_role.manage"],
  canViewMoneyCenter: ["billing_support_read", "admin.payment_status.view"],
  canRunMoneySafeReports: ["billing_support_read", "admin.payment_status.view"],
  canViewProviderStatus: ["billing_support_read", "admin.payment_status.view"],
  canViewLiveOps: ["live_ops"],
  canViewReleaseStatus: ["security_review", "audit_review"],
  canViewSecurityFindings: ["security_review"],
  canViewModerationQueue: ["reports_review", "content_moderation"],
  canEnforceUserRestriction: ["admin.user.suspend", "admin.user.restore"],
  canDeleteContent: ["admin.content.remove"],
  canViewObservabilityFindings: ["security_review", "audit_review"],
};

export const getPlatformRoleActionPermissions = (
  role: PlatformAuthorityRole,
) => PLATFORM_ROLE_ACTION_MATRIX[role] ?? PLATFORM_ROLE_ACTION_MATRIX.anonymous;

export const canRolePerformAction = (
  role: PlatformAuthorityRole,
  action: PlatformRoleActionKey,
) => getPlatformRoleActionPermissions(role)[action] === true;

export const getDeniedRoleActionCopy = (
  action: PlatformRoleActionKey,
) => PLATFORM_ROLE_ACTION_DENIALS[action];

export const getRoleActionMatrixRows = () => Object.entries(PLATFORM_ROLE_ACTION_MATRIX).map(([role, permissions]) => ({
  role: role as PlatformAuthorityRole,
  permissions,
}));
