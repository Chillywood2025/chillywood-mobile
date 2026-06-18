import { getChillyCircleStatus, type FriendRelationshipState } from "./friendGraph";
import {
  resolveProfileVisibilityAccess,
  type AccessVisibility,
  type VisibilityAccessResolution,
} from "./accessVisibility";
import { isOfficialPlatformAccountUserId } from "./officialAccounts";
import {
  normalizeProfileVisibility,
  type ProfileVisibility,
} from "./profileVisibility";

export type ProfilePrivacyAccessReason =
  | "owner"
  | "everyone"
  | "chilly_circle"
  | "chilly_circle_required"
  | "private"
  | "subscriber_only"
  | "subscriber_required"
  | "blocked"
  | "missing_profile"
  | "unavailable";

export type ProfilePrivacyAccess = {
  ownerUserId: string;
  viewerUserId: string | null;
  visibility: ProfileVisibility;
  accessVisibility: AccessVisibility;
  canViewFullProfile: boolean;
  isLocked: boolean;
  reason: ProfilePrivacyAccessReason;
  relationshipState: FriendRelationshipState | null;
  accessResolution?: VisibilityAccessResolution | null;
};

const toText = (value: unknown) => String(value ?? "").trim();

export async function resolveProfilePrivacyAccess(input: {
  ownerUserId: string;
  viewerUserId?: string | null;
  visibility?: ProfileVisibility | string | null;
  relationshipState?: FriendRelationshipState | null;
}): Promise<ProfilePrivacyAccess> {
  const ownerUserId = toText(input.ownerUserId);
  const viewerUserId = toText(input.viewerUserId) || null;
  const visibility = normalizeProfileVisibility(input.visibility);

  if (!ownerUserId) {
    return {
      ownerUserId,
      viewerUserId,
      visibility,
      accessVisibility: "public",
      canViewFullProfile: false,
      isLocked: true,
      reason: "missing_profile",
      relationshipState: null,
      accessResolution: null,
    };
  }

  if (isOfficialPlatformAccountUserId(ownerUserId)) {
    return {
      ownerUserId,
      viewerUserId,
      visibility,
      accessVisibility: "public",
      canViewFullProfile: true,
      isLocked: false,
      reason: "everyone",
      relationshipState: null,
      accessResolution: null,
    };
  }

  try {
    const access = await resolveProfileVisibilityAccess(ownerUserId);
    const reason: ProfilePrivacyAccessReason = access.reason === "owner_allowed"
      ? "owner"
      : access.reason === "public_allowed"
        ? "everyone"
        : access.reason === "circle_member_allowed"
          ? "chilly_circle"
          : access.reason === "subscriber_allowed"
            ? "subscriber_required"
            : access.reason === "subscriber_required"
              ? "subscriber_only"
              : access.reason === "blocked"
                ? "blocked"
                : access.reason === "not_found"
                  ? "missing_profile"
                  : access.reason === "circle_or_subscriber_required"
                    ? "chilly_circle_required"
                    : access.reason === "signed_out_requires_access" && access.visibility === "subscriber_only"
                      ? "subscriber_only"
                      : access.reason === "signed_out_requires_access"
                        ? "chilly_circle_required"
                        : "unavailable";

    return {
      ownerUserId,
      viewerUserId: access.viewerUserId ?? viewerUserId,
      visibility,
      accessVisibility: access.visibility,
      canViewFullProfile: access.allowed,
      isLocked: !access.allowed,
      reason,
      relationshipState: null,
      accessResolution: access,
    };
  } catch {
    return {
      ownerUserId,
      viewerUserId,
      visibility,
      accessVisibility: "private",
      canViewFullProfile: false,
      isLocked: true,
      reason: "unavailable",
      relationshipState: null,
      accessResolution: null,
    };
  }

  if (viewerUserId && viewerUserId === ownerUserId) {
    return {
      ownerUserId,
      viewerUserId,
      visibility,
      accessVisibility: "public",
      canViewFullProfile: true,
      isLocked: false,
      reason: "owner",
      relationshipState: null,
      accessResolution: null,
    };
  }

  const relationshipState = viewerUserId
    ? input.relationshipState ?? await getChillyCircleStatus(viewerUserId, ownerUserId).catch(() => null)
    : null;

  if (relationshipState?.availability === "blocked") {
    return {
      ownerUserId,
      viewerUserId,
      visibility,
      accessVisibility: "private",
      canViewFullProfile: false,
      isLocked: true,
      reason: "blocked",
      relationshipState,
      accessResolution: null,
    };
  }

  if (visibility === "everyone") {
    return {
      ownerUserId,
      viewerUserId,
      visibility,
      accessVisibility: "public",
      canViewFullProfile: true,
      isLocked: false,
      reason: "everyone",
      relationshipState,
      accessResolution: null,
    };
  }

  if (visibility === "private") {
    return {
      ownerUserId,
      viewerUserId,
      visibility,
      accessVisibility: "private",
      canViewFullProfile: false,
      isLocked: true,
      reason: "private",
      relationshipState,
      accessResolution: null,
    };
  }

  if (relationshipState?.isFriend) {
    return {
      ownerUserId,
      viewerUserId,
      visibility,
      accessVisibility: "private",
      canViewFullProfile: true,
      isLocked: false,
      reason: "chilly_circle",
      relationshipState,
      accessResolution: null,
    };
  }

  return {
    ownerUserId,
    viewerUserId,
    visibility,
    accessVisibility: "private",
    canViewFullProfile: false,
    isLocked: true,
    reason: "chilly_circle_required",
    relationshipState,
    accessResolution: null,
  };
}

export const getProfilePrivacyLockedTitle = (access: ProfilePrivacyAccess | null) => {
  if (access?.accessVisibility === "subscriber_only" || access?.reason === "subscriber_only") return "This Profile is subscriber-only.";
  if (access?.reason === "private") return "This profile is private.";
  if (access?.reason === "blocked") return "This profile is unavailable.";
  if (access?.reason === "unavailable") return "Profile privacy is unavailable.";
  return "This profile is for Chi'lly Circle only.";
};

export const getProfilePrivacyLockedBody = (access: ProfilePrivacyAccess | null) => {
  if (access?.accessVisibility === "subscriber_only" || access?.reason === "subscriber_only") {
    return "Subscribers can view this Profile. Chi'lly Circle and followers alone do not unlock subscriber-only access.";
  }
  if (access?.reason === "private") {
    return "Only the owner can see this full profile right now.";
  }
  if (access?.reason === "blocked") {
    return "A channel audience block prevents full profile access between these accounts.";
  }
  if (access?.reason === "unavailable") {
    return "Profile access could not be verified right now, so private content stays hidden.";
  }
  return "Circle members or subscribers can view this Profile. Followers remain a public social signal only.";
};
