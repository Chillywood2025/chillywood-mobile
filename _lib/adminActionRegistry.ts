import type { PlatformRoleActionKey, PlatformAuthorityRole } from "./platformRoleActionMatrix";
import type { PlatformStaffPermissionKey } from "./moderation";

export type AdminActionStatus =
  | "live"
  | "read_only"
  | "foundation_only"
  | "approval_request_only"
  | "blocked"
  | "hidden";

export type AdminActionRegistryEntry = {
  actionId: string;
  route: "/admin" | "/channel-studio" | "/channel/[userId]" | "user-facing";
  section: string;
  label: string;
  testId: string;
  backing:
    | "client_state_only"
    | "edge_function"
    | "rpc"
    | "read_model"
    | "autonomous_approval_request"
    | "owner_command_operator"
    | "scoped_operator"
    | "not_backed";
  backingRef: string;
  requiredRoles: readonly PlatformAuthorityRole[];
  requiredPermissionKeys?: readonly PlatformStaffPermissionKey[];
  requiredRoleAction: PlatformRoleActionKey;
  approvalLevel: 0 | 1 | 2 | 3 | 4;
  reasonRequired: boolean;
  auditRequired: boolean;
  evidencePrivacy: "none" | "masked" | "case_scoped" | "private_owner_only";
  status: AdminActionStatus;
  enabledForRoles: readonly PlatformAuthorityRole[];
  disabledForRoles: readonly PlatformAuthorityRole[];
  hiddenForRoles: readonly PlatformAuthorityRole[];
  expectedDenialCopy: string;
  expectedSuccessCopy: string;
  rollbackOrReversal: string;
  ownerApprovalRequired: boolean;
  externalConfirmationRequired: boolean;
  directExecutionAllowed: boolean;
  highRisk: boolean;
};

const ALL_NON_OWNER_ROLES: readonly PlatformAuthorityRole[] = [
  "anonymous",
  "signed_in_user",
  "creator/channel_owner",
  "moderator",
  "operator",
  "admin",
  "rachi",
  "autonomous_operator",
];

const STAFF_ROLES: readonly PlatformAuthorityRole[] = ["moderator", "operator", "admin", "super_admin", "owner"];
const OWNER_ROLES: readonly PlatformAuthorityRole[] = ["owner", "super_admin"];
const ADMIN_ROLES: readonly PlatformAuthorityRole[] = ["operator", "admin", "super_admin", "owner"];
const MODERATION_ROLES: readonly PlatformAuthorityRole[] = ["moderator", "operator", "admin", "super_admin", "owner"];

const entry = (input: AdminActionRegistryEntry): AdminActionRegistryEntry => input;

export const ADMIN_ACTION_REGISTRY: readonly AdminActionRegistryEntry[] = [
  entry({
    actionId: "admin.search.submit",
    route: "/admin",
    section: "Admin Search",
    label: "Search",
    testId: "admin-user-search-submit-button",
    backing: "read_model",
    backingRef: "writeAdminSearchAudit/readAdminUsersReadModel",
    requiredRoles: ADMIN_ROLES,
    requiredPermissionKeys: ["admin.user.search", "user_lookup"],
    requiredRoleAction: "canUseAdminSearch",
    approvalLevel: 1,
    reasonRequired: false,
    auditRequired: true,
    evidencePrivacy: "masked",
    status: "live",
    enabledForRoles: ADMIN_ROLES,
    disabledForRoles: ["moderator"],
    hiddenForRoles: ["anonymous", "signed_in_user", "creator/channel_owner", "rachi", "autonomous_operator"],
    expectedDenialCopy: "Admin Search requires exact owner/admin search scope and writes masked audit.",
    expectedSuccessCopy: "Search audit written with masked query preview.",
    rollbackOrReversal: "Clear local query; audit rows remain append-only.",
    ownerApprovalRequired: false,
    externalConfirmationRequired: false,
    directExecutionAllowed: true,
    highRisk: false,
  }),
  entry({
    actionId: "admin.search.clear",
    route: "/admin",
    section: "Admin Search",
    label: "Clear Search",
    testId: "admin-user-search-clear-button",
    backing: "client_state_only",
    backingRef: "local search state",
    requiredRoles: ADMIN_ROLES,
    requiredRoleAction: "canUseAdminSearch",
    approvalLevel: 0,
    reasonRequired: false,
    auditRequired: false,
    evidencePrivacy: "none",
    status: "live",
    enabledForRoles: ADMIN_ROLES,
    disabledForRoles: [],
    hiddenForRoles: ["anonymous", "signed_in_user", "creator/channel_owner", "rachi", "autonomous_operator"],
    expectedDenialCopy: "Search panel is hidden without admin search scope.",
    expectedSuccessCopy: "Local admin search state cleared.",
    rollbackOrReversal: "No backend state changed.",
    ownerApprovalRequired: false,
    externalConfirmationRequired: false,
    directExecutionAllowed: true,
    highRisk: false,
  }),
  entry({
    actionId: "admin.search.clear_recent",
    route: "/admin",
    section: "Admin Search",
    label: "Clear Recent Searches",
    testId: "admin-search-clear-recent-button",
    backing: "client_state_only",
    backingRef: "local recent search state",
    requiredRoles: ADMIN_ROLES,
    requiredRoleAction: "canUseAdminSearch",
    approvalLevel: 0,
    reasonRequired: false,
    auditRequired: false,
    evidencePrivacy: "none",
    status: "live",
    enabledForRoles: ADMIN_ROLES,
    disabledForRoles: [],
    hiddenForRoles: ["anonymous", "signed_in_user", "creator/channel_owner", "rachi", "autonomous_operator"],
    expectedDenialCopy: "Admin Search recent controls are hidden without admin search scope.",
    expectedSuccessCopy: "Local recent search state cleared.",
    rollbackOrReversal: "No backend state changed.",
    ownerApprovalRequired: false,
    externalConfirmationRequired: false,
    directExecutionAllowed: true,
    highRisk: false,
  }),
  ...[
    ["owner-command-classify-button", "owner.command.classify", "Classify", 1],
    ["owner-command-plan-button", "owner.command.plan", "Plan", 1],
    ["owner-command-dry-run-button", "owner.command.dry_run", "Dry Run", 1],
    ["owner-command-execute-button", "owner.command.submit_or_execute_safe", "Submit / Execute Safe", 2],
  ].map(([testId, actionId, label, approvalLevel]) => entry({
    actionId: String(actionId),
    route: "/admin",
    section: "Owner Command Center",
    label: String(label),
    testId: String(testId),
    backing: "owner_command_operator",
    backingRef: "supabase/functions/owner-command-operator",
    requiredRoles: OWNER_ROLES,
    requiredRoleAction: "canUseOwnerCommandCenter",
    approvalLevel: approvalLevel as 1 | 2,
    reasonRequired: false,
    auditRequired: true,
    evidencePrivacy: "masked",
    status: "live",
    enabledForRoles: OWNER_ROLES,
    disabledForRoles: ["operator", "admin", "moderator"],
    hiddenForRoles: ["anonymous", "signed_in_user", "creator/channel_owner", "rachi", "autonomous_operator"],
    expectedDenialCopy: "Owner Command Center is owner/super_admin only.",
    expectedSuccessCopy: "Owner command classified/planned or safe scoped audit work executed through target operators.",
    rollbackOrReversal: "Level 3/4 creates approval request and stops; safe no-op/report has no domain rollback.",
    ownerApprovalRequired: false,
    externalConfirmationRequired: false,
    directExecutionAllowed: true,
    highRisk: false,
  })),
  ...[
    ["autonomous-approval-refresh-button", "autonomous.approval.refresh", "Refresh Approvals"],
    ["autonomous-approval-approve-button", "autonomous.approval.approve", "Approve"],
    ["autonomous-approval-deny-button", "autonomous.approval.deny", "Deny"],
    ["autonomous-approval-cancel-button", "autonomous.approval.cancel", "Cancel"],
    ["autonomous-approval-emergency-pause-button", "autonomous.system.emergency_pause", "Emergency Pause"],
    ["autonomous-approval-resume-button", "autonomous.system.resume", "Resume"],
  ].map(([testId, actionId, label]) => entry({
    actionId,
    route: "/admin",
    section: "Autonomous Approvals",
    label,
    testId,
    backing: "autonomous_approval_request",
    backingRef: "supabase/functions/autonomous-approval-request",
    requiredRoles: OWNER_ROLES,
    requiredRoleAction: actionId.includes("pause") || actionId.includes("resume") ? "canEmergencyPauseSystem" : "canApproveAutonomousRequests",
    approvalLevel: actionId.endsWith("refresh") ? 1 : 3,
    reasonRequired: actionId.endsWith("deny"),
    auditRequired: true,
    evidencePrivacy: "masked",
    status: "live",
    enabledForRoles: OWNER_ROLES,
    disabledForRoles: ["operator", "admin", "moderator"],
    hiddenForRoles: ["anonymous", "signed_in_user", "creator/channel_owner", "rachi", "autonomous_operator"],
    expectedDenialCopy: "Owner or Super Admin role is required for live autonomous approval execution.",
    expectedSuccessCopy: actionId.endsWith("refresh") ? "Pending approval requests refreshed." : "Approval state changed; fresh preflight and exact scope are still required before execution.",
    rollbackOrReversal: actionId.endsWith("refresh") ? "No backend state changed." : "Deny/cancel stops request; emergency pause blocks non-read-only operator execution.",
    ownerApprovalRequired: !actionId.endsWith("refresh"),
    externalConfirmationRequired: false,
    directExecutionAllowed: actionId.endsWith("refresh"),
    highRisk: !actionId.endsWith("refresh"),
  })),
  ...[
    ["admin-staff-grant-button", "staff.role.grant", "Grant Role"],
    ["admin-staff-revoke-button", "staff.role.revoke", "Remove Role"],
    ["admin-staff-confirm-submit-button", "staff.role_or_permission.confirm", "Confirm"],
    ["admin-permission-save-button", "staff.permission.save", "Save Permissions"],
  ].map(([testId, actionId, label]) => entry({
    actionId,
    route: "/admin",
    section: "Roles",
    label,
    testId,
    backing: "edge_function",
    backingRef: "supabase/functions/admin-owner-controls",
    requiredRoles: OWNER_ROLES,
    requiredPermissionKeys: ["admin_grants", "manage_moderators", "admin.lower_role.manage"],
    requiredRoleAction: "canManageStaffRoles",
    approvalLevel: 3,
    reasonRequired: true,
    auditRequired: true,
    evidencePrivacy: "masked",
    status: "live",
    enabledForRoles: OWNER_ROLES,
    disabledForRoles: ["operator", "admin", "moderator"],
    hiddenForRoles: ["anonymous", "signed_in_user", "creator/channel_owner", "rachi", "autonomous_operator"],
    expectedDenialCopy: "Staff management requires owner/super_admin or exact lower-role management scope; moderators cannot add or remove staff.",
    expectedSuccessCopy: "Role or permission action queued through backed confirmation and audit.",
    rollbackOrReversal: "Revoke role or update permission set with reason; audit remains append-only.",
    ownerApprovalRequired: true,
    externalConfirmationRequired: false,
    directExecutionAllowed: false,
    highRisk: true,
  })),
  ...[
    ["admin-permission-reset-button", "staff.permission.reset_draft", "Reset Draft"],
    ["admin-staff-permission-load-button", "staff.permission.load", "Load Current"],
    ["admin-staff-permission-use-step-one-target-button", "staff.permission.copy_step_one_target", "Use Step 1 Target"],
    ["admin-staff-confirm-cancel-button", "staff.confirm.cancel", "Cancel"],
  ].map(([testId, actionId, label]) => entry({
    actionId,
    route: "/admin",
    section: "Roles",
    label,
    testId,
    backing: actionId.endsWith("load") ? "read_model" : "client_state_only",
    backingRef: actionId.endsWith("load") ? "readPlatformStaffPermissionsByEmail" : "local draft state",
    requiredRoles: OWNER_ROLES,
    requiredRoleAction: "canManageStaffRoles",
    approvalLevel: actionId.endsWith("load") ? 1 : 0,
    reasonRequired: false,
    auditRequired: false,
    evidencePrivacy: "masked",
    status: "live",
    enabledForRoles: OWNER_ROLES,
    disabledForRoles: ["operator", "admin", "moderator"],
    hiddenForRoles: ["anonymous", "signed_in_user", "creator/channel_owner", "rachi", "autonomous_operator"],
    expectedDenialCopy: "Role tooling is owner/super_admin scoped.",
    expectedSuccessCopy: "Draft/readback state updated without broad authority.",
    rollbackOrReversal: "Reset local draft; no destructive backend change.",
    ownerApprovalRequired: false,
    externalConfirmationRequired: false,
    directExecutionAllowed: true,
    highRisk: false,
  })),
  ...[
    ["admin-report-target-moderation-hidden-button", "moderation.report_target.hide", "Hide Target", 2],
    ["admin-report-target-moderation-removed-button", "moderation.report_target.remove", "Remove Target", 3],
    ["admin-report-target-moderation-clean-button", "moderation.report_target.restore", "Mark Clean", 2],
    ["admin-report-status-mark_reviewed-button", "moderation.report.mark_reviewed", "Mark Reviewed", 1],
    ["admin-report-status-dismiss-button", "moderation.report.dismiss", "Dismiss Report", 1],
    ["admin-report-status-escalate-button", "moderation.report.escalate", "Escalate", 1],
    ["admin-report-target-moderation-confirm-button", "moderation.report_target.confirm", "Confirm Moderation Action", 2],
    ["admin-report-target-moderation-cancel-button", "moderation.report_target.cancel", "Cancel Moderation Action", 0],
  ].map(([testId, actionId, label, approvalLevel]) => entry({
    actionId: String(actionId),
    route: "/admin",
    section: "Reports",
    label: String(label),
    testId: String(testId),
    backing: approvalLevel === 0 ? "client_state_only" : "rpc",
    backingRef: approvalLevel === 0 ? "local pending moderation state" : "applyAdminReportTargetAction/updateAdminReportStatusAction",
    requiredRoles: MODERATION_ROLES,
    requiredPermissionKeys: ["reports_review", "content_moderation", "admin.content.hide", "admin.content.remove", "admin.content.restore"],
    requiredRoleAction: actionId === "moderation.report_target.remove" ? "canDeleteContent" : "canModerateContent",
    approvalLevel: approvalLevel as 0 | 1 | 2 | 3,
    reasonRequired: approvalLevel !== 0,
    auditRequired: approvalLevel !== 0,
    evidencePrivacy: "case_scoped",
    status: approvalLevel === 3 ? "approval_request_only" : "live",
    enabledForRoles: approvalLevel === 3 ? OWNER_ROLES : MODERATION_ROLES,
    disabledForRoles: approvalLevel === 3 ? ["moderator", "operator", "admin"] : [],
    hiddenForRoles: ["anonymous", "signed_in_user", "creator/channel_owner", "rachi", "autonomous_operator"],
    expectedDenialCopy: "Moderation actions require exact scope, selected report context, reason, confirmation, and audit.",
    expectedSuccessCopy: approvalLevel === 0 ? "Pending moderation action cancelled locally." : "Report or target moderation state updated with immutable audit where backed.",
    rollbackOrReversal: approvalLevel === 0 ? "No backend state changed." : "Restore/mark clean where backed; hard purge is not expanded.",
    ownerApprovalRequired: approvalLevel === 3,
    externalConfirmationRequired: false,
    directExecutionAllowed: approvalLevel !== 3,
    highRisk: approvalLevel === 3,
  })),
  ...[
    ["admin-money-flow-control-section", "money.center.view", "Money Flow Control"],
    ["money-provider-webhook-health-by-provider", "money.provider_webhook.view_health", "Provider Webhook Health"],
    ["money-provider-access-status", "money.provider_access.view_status", "Provider Access Status"],
    ["money-flow-control-approval-required", "money.approval_boundary.view", "Money Approval Boundary"],
  ].map(([testId, actionId, label]) => entry({
    actionId,
    route: "/admin",
    section: "Money Center",
    label,
    testId,
    backing: "read_model",
    backingRef: "money_flow_control read models",
    requiredRoles: ADMIN_ROLES,
    requiredPermissionKeys: ["billing_support_read", "admin.payment_status.view"],
    requiredRoleAction: "canViewMoneyCenter",
    approvalLevel: 1,
    reasonRequired: false,
    auditRequired: false,
    evidencePrivacy: "masked",
    status: "read_only",
    enabledForRoles: ADMIN_ROLES,
    disabledForRoles: ["moderator"],
    hiddenForRoles: ["anonymous", "signed_in_user", "creator/channel_owner", "rachi", "autonomous_operator"],
    expectedDenialCopy: "Money Center is read-only/status unless a Level 3/4 approval request exists.",
    expectedSuccessCopy: "Money/provider status readback displayed; moneyMoved=false.",
    rollbackOrReversal: "No money mutation to roll back.",
    ownerApprovalRequired: false,
    externalConfirmationRequired: false,
    directExecutionAllowed: false,
    highRisk: false,
  })),
  ...[
    ["admin-notification-operator-section", "operator.notification.view_status", "Notification Operator"],
    ["admin-release-operator-section", "operator.release.view_status", "Release Operator"],
    ["admin-security-owner-operator-section", "operator.security_owner.view_status", "Security Owner Operator"],
    ["admin-moderation-safety-operator-section", "operator.moderation_safety.view_status", "Moderation Safety Operator"],
    ["admin-observability-operator-section", "operator.observability.view_status", "Observability Operator"],
  ].map(([testId, actionId, label]) => entry({
    actionId,
    route: "/admin",
    section: "System",
    label,
    testId,
    backing: "read_model",
    backingRef: "autonomous operator status/readback rows",
    requiredRoles: STAFF_ROLES,
    requiredRoleAction: "canViewAdminHome",
    approvalLevel: 1,
    reasonRequired: false,
    auditRequired: false,
    evidencePrivacy: "masked",
    status: "read_only",
    enabledForRoles: STAFF_ROLES,
    disabledForRoles: [],
    hiddenForRoles: ["anonymous", "signed_in_user", "creator/channel_owner", "rachi", "autonomous_operator"],
    expectedDenialCopy: "Operator status is staff-only and redacted.",
    expectedSuccessCopy: "Scoped operator status/readback displayed.",
    rollbackOrReversal: "No domain mutation.",
    ownerApprovalRequired: false,
    externalConfirmationRequired: false,
    directExecutionAllowed: false,
    highRisk: false,
  })),
];

export const ADMIN_TEST_ID_ALIASES: readonly string[] = [
  "admin-main-tab-${normalizeAdminTestId(tab.key)}",
  "admin-search-scope-${scope.key}",
  "admin-search-result-chip-${scope.key}",
  "admin-search-recent-${recent.scope}",
  "admin-staff-role-target-${option.key}",
  "admin-staff-permission-${permissionKey}",
  "admin-report-target-moderation-${status}-button",
  "admin-report-status-${action}-button",
];

export const FORBIDDEN_ACTIVE_ADMIN_ACTIONS = [
  "manual_premium_grant",
  "premium_entitlement_edit",
  "payout_release",
  "payout_mark_paid",
  "payout_process_batch",
  "send_money",
  "cashout",
  "production_charge",
  "invoice_send",
  "payment_link_create",
  "production_ota_publish_direct",
  "production_ota_rollback_direct",
  "owner_role_mutation_without_owner_gate",
  "auth_rls_mutation_without_approval",
  "user_ban_without_approval",
  "user_suspend_without_backed_scope",
  "user_restrict_without_appeal",
  "content_delete_without_audit",
  "broad_push_campaign_direct",
] as const;

export const getAdminActionByTestId = (
  testId: string,
) => ADMIN_ACTION_REGISTRY.find((entry) => entry.testId === testId) ?? null;

export const listActiveAdminActions = () => ADMIN_ACTION_REGISTRY.filter((entry) => (
  entry.status === "live" || entry.status === "approval_request_only"
));

export const listHighRiskAdminActions = () => ADMIN_ACTION_REGISTRY.filter((entry) => entry.highRisk);
