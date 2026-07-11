import type { AutonomousApprovalRequest } from "./autonomousApprovalRequests";

export type PlatformOwnerAuthorityRole =
  | "admin"
  | "livekit_operator"
  | "media_automation"
  | "moderator"
  | "money_flow_control"
  | "operator"
  | "owner"
  | "rachi"
  | "super_admin";

export type PlatformOwnerAuthorityMembership = {
  role?: string | null;
  status?: string | null;
};

const normalizeRole = (value: unknown): PlatformOwnerAuthorityRole | null => {
  const role = String(value ?? "").trim().toLowerCase();
  if (
    role === "admin"
    || role === "livekit_operator"
    || role === "media_automation"
    || role === "moderator"
    || role === "money_flow_control"
    || role === "operator"
    || role === "owner"
    || role === "rachi"
    || role === "super_admin"
  ) {
    return role;
  }
  return null;
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
  actorRole === "admin"
  || actorRole === "livekit_operator"
  || actorRole === "media_automation"
  || actorRole === "money_flow_control"
  || actorRole === "operator"
  || actorRole === "owner"
  || actorRole === "rachi"
  || actorRole === "super_admin"
);

export const sanitizeOwnerAuthorityProof = (input: {
  approvalBacking: "live" | "foundation_only" | "missing";
  memberships: readonly PlatformOwnerAuthorityMembership[];
}) => ({
  approvalBacking: input.approvalBacking,
  ownerOrSuperAdminPresent: hasOwnerOrSuperAdminAuthority(input.memberships),
  roles: getAutonomousApprovalAuthorityRoles(input.memberships).map((role) => (
    role === "super_admin" ? "super_admin" : role === "owner" ? "owner" : "non_owner_staff"
  )),
});
