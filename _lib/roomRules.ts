import {
  createEmptyMonetizationGateResolution,
  resolveMonetizationAccess,
  type MonetizationGateResolution,
  type MonetizationTargetId,
} from "./monetization";

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
  monetization: MonetizationGateResolution;
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
  roomType?: unknown;
  linkedRoomMode?: unknown;
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

const resolveRoomMonetizationTargetHint = (room: RoomPolicyLike): MonetizationTargetId | null => {
  const accessRule = normalizeContentAccessRule(room.contentAccessRule);
  if (accessRule === "party_pass") return "premium_watch_party_access";
  if (accessRule !== "premium") return null;

  const roomType = String(room.roomType ?? "").trim().toLowerCase();
  if (roomType === "live") return "premium_live_access";
  if (roomType === "title") return "paid_title_access";

  const linkedRoomMode = String(room.linkedRoomMode ?? "").trim().toLowerCase();
  if (linkedRoomMode === "live") return "premium_live_access";
  if (linkedRoomMode === "hybrid") return "premium_watch_party_access";

  return "premium_subscription";
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
  const emptyMonetization = createEmptyMonetizationGateResolution();
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
      monetization: emptyMonetization,
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
      monetization: emptyMonetization,
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
      monetization: emptyMonetization,
    };
  }

  let monetization = emptyMonetization;
  if (!isHost && contentAccessRule !== "open") {
    const monetizationAccess = await resolveMonetizationAccess({
      accessRule: contentAccessRule,
      accessKey: options.partyId,
      targetHint: resolveRoomMonetizationTargetHint(options.room),
    });
    monetization = monetizationAccess.monetization;
    if (!monetizationAccess.allowed) {
      return {
        canJoin: false,
        reason: monetizationAccess.reason,
        joinPolicy,
        contentAccessRule,
        capturePolicy,
        requiresAuthIdentity: true,
        monetization,
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
    monetization,
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
