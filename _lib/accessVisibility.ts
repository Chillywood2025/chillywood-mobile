import { supabase } from "./supabase";

export type AccessVisibility = "public" | "private" | "subscriber_only";

export type VisibilityAccessReason =
  | "public_allowed"
  | "owner_allowed"
  | "operator_allowed"
  | "circle_member_allowed"
  | "subscriber_allowed"
  | "signed_out_requires_access"
  | "subscriber_required"
  | "circle_or_subscriber_required"
  | "blocked"
  | "not_found"
  | "unavailable";

export type VisibilityAccessResolution = {
  allowed: boolean;
  visibility: AccessVisibility;
  reason: VisibilityAccessReason;
  isOwner: boolean;
  isBlocked: boolean;
  isCircleMember: boolean;
  isSubscriber: boolean;
  isFollower: boolean;
  viewerUserId: string | null;
  ownerUserId: string | null;
};

export const ACCESS_VISIBILITY_OPTIONS: readonly {
  value: AccessVisibility;
  label: string;
  description: string;
  profileDescription: string;
  platformDescription: string;
  profileTestID: string;
  platformTestID: string;
}[] = [
  {
    value: "public",
    label: "Public",
    description: "Anyone can view.",
    profileDescription: "Anyone can view your Profile.",
    platformDescription: "Anyone can view your creator Platform.",
    profileTestID: "profile-visibility-public-option",
    platformTestID: "platform-visibility-public-option",
  },
  {
    value: "private",
    label: "Private",
    description: "Circle members or subscribers can view.",
    profileDescription: "Circle members or subscribers can view your Profile.",
    platformDescription: "Circle members or subscribers can view your Platform.",
    profileTestID: "profile-visibility-private-option",
    platformTestID: "platform-visibility-private-option",
  },
  {
    value: "subscriber_only",
    label: "Subscriber-only",
    description: "Only subscribers can view.",
    profileDescription: "Only subscribers can view your Profile.",
    platformDescription: "Only subscribers can view your Platform.",
    profileTestID: "profile-visibility-subscriber-only-option",
    platformTestID: "platform-visibility-subscriber-only-option",
  },
];

const toText = (value: unknown) => String(value ?? "").trim();

export const normalizeAccessVisibility = (value: unknown): AccessVisibility => {
  const normalized = toText(value).toLowerCase();
  if (normalized === "private" || normalized === "subscriber_only") return normalized;
  return "public";
};

export const getAccessVisibilityLabel = (value: unknown) => {
  const normalized = normalizeAccessVisibility(value);
  return ACCESS_VISIBILITY_OPTIONS.find((option) => option.value === normalized)?.label ?? "Public";
};

const parseAccessResult = (value: unknown): VisibilityAccessResolution => {
  const row = value && typeof value === "object" ? value as Record<string, unknown> : {};
  return {
    allowed: row.allowed === true,
    visibility: normalizeAccessVisibility(row.visibility),
    reason: (
      row.reason === "public_allowed"
      || row.reason === "owner_allowed"
      || row.reason === "operator_allowed"
      || row.reason === "circle_member_allowed"
      || row.reason === "subscriber_allowed"
      || row.reason === "signed_out_requires_access"
      || row.reason === "subscriber_required"
      || row.reason === "circle_or_subscriber_required"
      || row.reason === "blocked"
      || row.reason === "not_found"
    ) ? row.reason : "unavailable",
    isOwner: row.is_owner === true || row.isOwner === true,
    isBlocked: row.is_blocked === true || row.isBlocked === true,
    isCircleMember: row.is_circle_member === true || row.isCircleMember === true,
    isSubscriber: row.is_subscriber === true || row.isSubscriber === true,
    isFollower: row.is_follower === true || row.isFollower === true,
    viewerUserId: toText(row.viewer_user_id ?? row.viewerUserId) || null,
    ownerUserId: toText(row.owner_user_id ?? row.ownerUserId) || null,
  };
};

async function resolveVisibilityAccess(functionName: "resolve_profile_visibility_access" | "resolve_platform_visibility_access", ownerUserId: string) {
  const normalizedOwnerUserId = toText(ownerUserId);
  if (!normalizedOwnerUserId) {
    return parseAccessResult({ allowed: false, reason: "not_found", visibility: "public" });
  }

  const { data, error } = await (supabase as any).rpc(functionName, {
    [functionName === "resolve_profile_visibility_access" ? "profile_owner_id" : "platform_owner_id"]: normalizedOwnerUserId,
  });
  if (error) throw error;
  return parseAccessResult(data);
}

export const resolveProfileVisibilityAccess = (profileOwnerId: string) =>
  resolveVisibilityAccess("resolve_profile_visibility_access", profileOwnerId);

export const resolvePlatformVisibilityAccess = (platformOwnerId: string) =>
  resolveVisibilityAccess("resolve_platform_visibility_access", platformOwnerId);
