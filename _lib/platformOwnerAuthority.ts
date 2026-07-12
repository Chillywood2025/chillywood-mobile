import {
  AUTONOMOUS_APPROVAL_REQUESTER_TYPES,
  isAutonomousApprovalRequesterType,
  type AutonomousApprovalRequest,
  type AutonomousApprovalRequesterType,
} from "./autonomousApprovalRequests";

export type PlatformOwnerAuthorityRole = AutonomousApprovalRequesterType;

export type PlatformOwnerAuthorityMembership = {
  role?: string | null;
  status?: string | null;
};

const normalizeRole = (value: unknown): PlatformOwnerAuthorityRole | null => {
  const role = String(value ?? "").trim().toLowerCase();
  return isAutonomousApprovalRequesterType(role) ? role : null;
};

export const getAutonomousApprovalAuthorityRoles = (
  memberships: readonly PlatformOwnerAuthorityMembership[],
) => memberships
  .filter((membership) => String(membership.status ?? "active").toLowerCase() === "active")
  .map((membership) => normalizeRole(membership.role))
  .filter((role): role is PlatformOwnerAuthorityRole => !!role);

export const hasOwnerOrSuperAdminAuthority = (
  memberships: readonly PlatformOwnerAuthorityMembership[],
) => {
  const roles = getAutonomousApprovalAuthorityRoles(memberships);
  return roles.includes("owner") || roles.includes("super_admin");
};

export const canUserReviewAutonomousApproval = (
  memberships: readonly PlatformOwnerAuthorityMembership[],
) => hasOwnerOrSuperAdminAuthority(memberships);

export const canUserApproveAutonomousRequest = (input: {
  actorUserId?: string | null;
  memberships: readonly PlatformOwnerAuthorityMembership[];
  request: Pick<AutonomousApprovalRequest, "approvalLevel" | "requestedByActorId" | "requestedByActorType" | "status">;
}) => {
  if (input.request.status !== "pending") return false;
  if (!hasOwnerOrSuperAdminAuthority(input.memberships)) return false;
  if (input.request.requestedByActorId && input.actorUserId && input.request.requestedByActorId === input.actorUserId) return false;
  return true;
};

export const canUserDenyAutonomousRequest = canUserApproveAutonomousRequest;

export const canActorRequestAutonomousApproval = (actorRole: PlatformOwnerAuthorityRole) => (
  AUTONOMOUS_APPROVAL_REQUESTER_TYPES.includes(actorRole)
);

export const sanitizeOwnerAuthorityProof = (input: {
  approvalBacking: "live" | "foundation_only" | "missing";
  memberships: readonly PlatformOwnerAuthorityMembership[];
}) => ({
  approvalBacking: input.approvalBacking,
  ownerOrSuperAdminPresent: hasOwnerOrSuperAdminAuthority(input.memberships),
  roles: getAutonomousApprovalAuthorityRoles(input.memberships).map((role) => (
    role === "super_admin" ? "super_admin" : role === "owner" ? "owner" : role.endsWith("_operator") || role === "media_automation" || role === "money_flow_control" ? "non_human_requester" : "non_owner_staff"
  )),
});
