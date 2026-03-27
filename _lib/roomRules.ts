import { resolveMonetizationAccess } from "./monetization";

export type JoinPolicy = "open" | "locked";
export type ReactionsPolicy = "enabled" | "muted";
export type ContentAccessRule = "open" | "party_pass" | "premium";
export type CapturePolicy = "best_effort" | "host_managed";
export type RoomMembershipState = "active" | "reconnecting" | "left" | "removed";

export type RoomAccessReason =
  | "allowed"
  | "identity_required"
  | "room_locked"
  | "removed"
  | "party_pass_required"
  | "premium_required";

export type RoomAccessDecision = {
  canJoin: boolean;
  reason: RoomAccessReason;
  joinPolicy: JoinPolicy;
  contentAccessRule: ContentAccessRule;
  capturePolicy: CapturePolicy;
  requiresAuthIdentity: boolean;
};

export type RoomCapabilitySet = {
  isHost: boolean;
  isRoomMember: boolean;
  canJoin: boolean;
  canControlPlayback: boolean;
  canModerate: boolean;
  canOpenCommunication: boolean;
  canPublishCamera: boolean;
  canPublishMic: boolean;
  canSendChat: boolean;
};

export type RoomMembershipLike = {
  userId?: unknown;
  role?: unknown;
  canSpeak?: unknown;
  membershipState?: unknown;
  cameraEnabled?: unknown;
  micEnabled?: unknown;
  lastSeenAt?: unknown;
};

export type RoomPolicyLike = {
  partyId?: unknown;
  hostUserId?: unknown;
  joinPolicy?: unknown;
  contentAccessRule?: unknown;
  capturePolicy?: unknown;
};

export const ROOM_MEMBERSHIP_ACTIVE_WINDOW_MILLIS = 25_000;

export const normalizeJoinPolicy = (value: unknown): JoinPolicy => (
  String(value ?? "").trim().toLowerCase() === "locked" ? "locked" : "open"
);

export const normalizeReactionsPolicy = (value: unknown): ReactionsPolicy => (
  String(value ?? "").trim().toLowerCase() === "muted" ? "muted" : "enabled"
);

export const normalizeContentAccessRule = (value: unknown): ContentAccessRule => {
  const normalized = String(value ?? "").trim().toLowerCase();
  if (normalized === "party_pass") return "party_pass";
  if (normalized === "premium") return "premium";
  return "open";
};

export const normalizeCapturePolicy = (value: unknown): CapturePolicy => (
  String(value ?? "").trim().toLowerCase() === "host_managed" ? "host_managed" : "best_effort"
);

export const normalizeRoomMembershipState = (value: unknown): RoomMembershipState => {
  const normalized = String(value ?? "").trim().toLowerCase();
  if (normalized === "reconnecting") return "reconnecting";
  if (normalized === "left") return "left";
  if (normalized === "removed") return "removed";
  return "active";
};

export const isMembershipActive = (membership: Pick<RoomMembershipLike, "membershipState" | "lastSeenAt"> | null | undefined) => {
  if (!membership) return false;
  const state = normalizeRoomMembershipState(membership.membershipState);
  if (state !== "active" && state !== "reconnecting") return false;
  const lastSeenAt = new Date(String(membership.lastSeenAt ?? 0)).getTime();
  if (!Number.isFinite(lastSeenAt) || lastSeenAt <= 0) return state === "active";
  return Date.now() - lastSeenAt <= ROOM_MEMBERSHIP_ACTIVE_WINDOW_MILLIS;
};

export const deriveWatchPartyStageRole = (options: {
  role?: unknown;
  canSpeak?: unknown;
  currentStageRole?: unknown;
}) => {
  if (String(options.role ?? "").trim().toLowerCase() === "host") return "host" as const;
  const explicitStageRole = String(options.currentStageRole ?? "").trim().toLowerCase();
  if (explicitStageRole === "speaker" || explicitStageRole === "listener") {
    return explicitStageRole as "speaker" | "listener";
  }
  return options.canSpeak ? "speaker" as const : "listener" as const;
};

export async function evaluateRoomAccess(options: {
  partyId: string;
  room: RoomPolicyLike;
  membership?: RoomMembershipLike | null;
  hasWritableIdentity: boolean;
}): Promise<RoomAccessDecision> {
  const joinPolicy = normalizeJoinPolicy(options.room.joinPolicy);
  const contentAccessRule = normalizeContentAccessRule(options.room.contentAccessRule);
  const capturePolicy = normalizeCapturePolicy(options.room.capturePolicy);
  const isHost = String(options.room.hostUserId ?? "").trim() === String(options.membership?.userId ?? "").trim();
  const membershipState = normalizeRoomMembershipState(options.membership?.membershipState);
  const isExistingMember = isMembershipActive(options.membership) || membershipState === "left";

  if (!options.hasWritableIdentity) {
    return {
      canJoin: false,
      reason: "identity_required",
      joinPolicy,
      contentAccessRule,
      capturePolicy,
      requiresAuthIdentity: true,
    };
  }

  if (membershipState === "removed") {
    return {
      canJoin: false,
      reason: "removed",
      joinPolicy,
      contentAccessRule,
      capturePolicy,
      requiresAuthIdentity: true,
    };
  }

  if (!isHost && joinPolicy === "locked" && !isExistingMember) {
    return {
      canJoin: false,
      reason: "room_locked",
      joinPolicy,
      contentAccessRule,
      capturePolicy,
      requiresAuthIdentity: true,
    };
  }

  if (!isHost && contentAccessRule !== "open") {
    const monetizationAccess = await resolveMonetizationAccess({
      accessRule: contentAccessRule,
      accessKey: options.partyId,
    });
    if (!monetizationAccess.allowed) {
      return {
        canJoin: false,
        reason: monetizationAccess.reason,
        joinPolicy,
        contentAccessRule,
        capturePolicy,
        requiresAuthIdentity: true,
      };
    }
  }

  return {
    canJoin: true,
    reason: "allowed",
    joinPolicy,
    contentAccessRule,
    capturePolicy,
    requiresAuthIdentity: true,
  };
}

export const buildRoomCapabilities = (options: {
  access: RoomAccessDecision;
  hostUserId?: unknown;
  membership?: RoomMembershipLike | null;
}) => {
  const membershipState = normalizeRoomMembershipState(options.membership?.membershipState);
  const isHost = String(options.hostUserId ?? "").trim() === String(options.membership?.userId ?? "").trim()
    || String(options.membership?.role ?? "").trim().toLowerCase() === "host";
  const isRoomMember = membershipState === "active" || membershipState === "reconnecting";
  const canSpeak = !!options.membership?.canSpeak || isHost;

  const capabilities: RoomCapabilitySet = {
    isHost,
    isRoomMember,
    canJoin: options.access.canJoin,
    canControlPlayback: isHost && options.access.canJoin,
    canModerate: isHost && options.access.canJoin,
    canOpenCommunication: options.access.canJoin,
    canPublishCamera: options.access.canJoin && membershipState !== "removed",
    canPublishMic: options.access.canJoin && membershipState !== "removed" && canSpeak,
    canSendChat: options.access.canJoin && membershipState !== "removed",
  };

  return capabilities;
};
