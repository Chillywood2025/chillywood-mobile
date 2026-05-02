import { getChillyCircleStatus, type FriendRelationshipState } from "./friendGraph";
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
  | "blocked"
  | "missing_profile";

export type ProfilePrivacyAccess = {
  ownerUserId: string;
  viewerUserId: string | null;
  visibility: ProfileVisibility;
  canViewFullProfile: boolean;
  isLocked: boolean;
  reason: ProfilePrivacyAccessReason;
  relationshipState: FriendRelationshipState | null;
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
      canViewFullProfile: false,
      isLocked: true,
      reason: "missing_profile",
      relationshipState: null,
    };
  }

  if (viewerUserId && viewerUserId === ownerUserId) {
    return {
      ownerUserId,
      viewerUserId,
      visibility,
      canViewFullProfile: true,
      isLocked: false,
      reason: "owner",
      relationshipState: null,
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
      canViewFullProfile: false,
      isLocked: true,
      reason: "blocked",
      relationshipState,
    };
  }

  if (visibility === "everyone") {
    return {
      ownerUserId,
      viewerUserId,
      visibility,
      canViewFullProfile: true,
      isLocked: false,
      reason: "everyone",
      relationshipState,
    };
  }

  if (visibility === "private") {
    return {
      ownerUserId,
      viewerUserId,
      visibility,
      canViewFullProfile: false,
      isLocked: true,
      reason: "private",
      relationshipState,
    };
  }

  if (relationshipState?.isFriend) {
    return {
      ownerUserId,
      viewerUserId,
      visibility,
      canViewFullProfile: true,
      isLocked: false,
      reason: "chilly_circle",
      relationshipState,
    };
  }

  return {
    ownerUserId,
    viewerUserId,
    visibility,
    canViewFullProfile: false,
    isLocked: true,
    reason: "chilly_circle_required",
    relationshipState,
  };
}

export const getProfilePrivacyLockedTitle = (access: ProfilePrivacyAccess | null) => {
  if (access?.reason === "private") return "This profile is private.";
  if (access?.reason === "blocked") return "This profile is unavailable.";
  return "This profile is for Chi'lly Circle only.";
};

export const getProfilePrivacyLockedBody = (access: ProfilePrivacyAccess | null) => {
  if (access?.reason === "private") {
    return "Only the owner can see this full profile right now.";
  }
  if (access?.reason === "blocked") {
    return "A channel audience block prevents full profile access between these accounts.";
  }
  return "Send or accept a Chi'lly Circle request to see posts, comments, attachments, and profile activity.";
};
