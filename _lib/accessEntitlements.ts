import type { CommunicationRoomMembership, CommunicationRoomState } from "./communication";
import { evaluateCommunicationRoomAccess } from "./communication";
import {
  type ContentAccessDecision,
  type CreatorPermissionSet,
  type MonetizationAccessRule,
  type MonetizationGateResolution,
  type PlanTier,
  type TitleAccessRule,
  type UserPlan,
  evaluateTitleAccess,
  normalizeCreatorPermissionSet,
  normalizeMonetizationAccessRule,
  normalizeTitleAccessRule,
  readCreatorPermissions,
  sanitizeCreatorRoomAccessRule,
  sanitizeCreatorTitleAccessRule,
} from "./monetization";
import { getOfficialPlatformAccount } from "./officialAccounts";
import {
  type CapturePolicy,
  type ContentAccessRule as RoomContentAccessRule,
  type JoinPolicy,
  type RoomAccessDecision,
  type RoomMembershipLike,
  type RoomPolicyLike,
  evaluateRoomAccess,
  normalizeCapturePolicy,
  normalizeContentAccessRule,
  normalizeJoinPolicy,
} from "./roomRules";
import type { UserProfile } from "./userData";
import { readUserProfileByUserId } from "./userData";
import type { WatchPartyRoomMembership, WatchPartyState } from "./watchParty";
import { evaluatePartyRoomAccess } from "./watchParty";

export type AccessResolverKind = "channel" | "content" | "room";
export type AccessResolverSupportStatus = "supported" | "unsupported_later";
export type AccessRenderState = "accessible" | "blocked" | "loading" | "unsupported";
export type AccessClassification =
  | "official_access"
  | "public"
  | "private"
  | "subscriber_access"
  | "mixed_access"
  | "party_pass"
  | "premium_only"
  | "unsupported_later";
export type AccessBlockSource =
  | "none"
  | "creator_capability"
  | "user_entitlement"
  | "room_rule"
  | "room_membership"
  | "identity"
  | "unsupported_later";
export type AccessReason =
  | "official_access"
  | "missing_channel_context"
  | "channel_defaults_open"
  | "channel_defaults_private"
  | "channel_defaults_subscriber"
  | "channel_defaults_mixed"
  | "creator_capability_normalized"
  | "allowed"
  | "premium_required"
  | "party_pass_required"
  | "identity_required"
  | "room_locked"
  | "removed"
  | "unsupported_later";
export type AccessPreviewMode = "full" | "teaser" | "hidden";
export type AccessPreviewReason =
  | "accessible_now"
  | "channel_summary_visible"
  | "content_teaser_allowed"
  | "room_teaser_allowed"
  | "removed_membership_hidden"
  | "unsupported_later";
export type AccessUnsupportedLaterConcept =
  | "one_time_purchase"
  | "ticketed_access"
  | "formal_invite_entitlements"
  | "event_access"
  | "block_or_shelf_access";
export type ChannelAccessPolicy =
  | "official_access"
  | "public"
  | "private"
  | "subscriber_access"
  | "mixed_access";
export type ContentAccessPolicy = "open" | "premium";
export type RoomResolverSurface = "watch_party" | "communication" | "generic";

export type AccessPreviewDecision = {
  allowed: boolean;
  mode: AccessPreviewMode;
  reason: AccessPreviewReason;
  supportStatus: AccessResolverSupportStatus;
};

type BaseAccessResolution<TRule> = {
  supportStatus: AccessResolverSupportStatus;
  renderState: AccessRenderState;
  classification: AccessClassification;
  reason: AccessReason;
  label: string;
  isAllowed: boolean;
  isBlocked: boolean;
  blockSource: AccessBlockSource;
  previewAllowed: boolean;
  previewMode: AccessPreviewMode;
  unsupportedLater: readonly AccessUnsupportedLaterConcept[];
  currentTruthSources: readonly string[];
  notes: readonly string[];
  currentTruthOnly: true;
  effectiveAccessRule: TRule;
};

export type ChannelAccessResolution = BaseAccessResolution<ChannelAccessPolicy> & {
  kind: "channel";
  channelUserId: string | null;
  isOfficial: boolean;
  joinPolicy: JoinPolicy | null;
  requestedWatchPartyAccessRule: MonetizationAccessRule | null;
  requestedCommunicationAccessRule: MonetizationAccessRule | null;
  watchPartyAccessRule: MonetizationAccessRule | null;
  communicationAccessRule: MonetizationAccessRule | null;
  creatorPermissions: CreatorPermissionSet | null;
  normalizations: readonly string[];
};

export type ContentAccessResolution = BaseAccessResolution<ContentAccessPolicy> & {
  kind: "content";
  titleId: string | null;
  requestedAccessRule: TitleAccessRule;
  monetization: MonetizationGateResolution;
  plan: UserPlan | null;
  planTier: PlanTier | null;
  normalizations: readonly string[];
};

export type RoomAccessResolution = BaseAccessResolution<RoomContentAccessRule> & {
  kind: "room";
  roomSurface: RoomResolverSurface;
  joinPolicy: JoinPolicy;
  capturePolicy: CapturePolicy;
  monetization: MonetizationGateResolution;
  requiresAuthIdentity: boolean;
};

export type ResolveChannelAccessOptions = {
  channelUserId?: string | null;
  profile?: Partial<UserProfile> | null;
  creatorPermissions?: Partial<CreatorPermissionSet> | null;
  isOfficial?: boolean | null;
};

export type ResolveContentAccessOptions = {
  titleId?: string | null;
  accessRule?: TitleAccessRule | string | null;
  creatorPermissions?: Partial<CreatorPermissionSet> | null;
  plan?: UserPlan | null;
};

export type ResolveRoomAccessOptions =
  | {
      roomSurface: "watch_party";
      partyId: string;
      room?: WatchPartyState | null;
      membership?: WatchPartyRoomMembership | null;
      userId?: string;
    }
  | {
      roomSurface: "communication";
      room: CommunicationRoomState;
      membership?: CommunicationRoomMembership | null;
      userId?: string;
    }
  | {
      roomSurface: "generic";
      partyId: string;
      room: RoomPolicyLike;
      membership?: RoomMembershipLike | null;
      hasWritableIdentity: boolean;
    };

type LabelInput = AccessClassification | Pick<BaseAccessResolution<unknown>, "classification">;

const CHANNEL_UNSUPPORTED_LATER: readonly AccessUnsupportedLaterConcept[] = [
  "formal_invite_entitlements",
  "ticketed_access",
  "block_or_shelf_access",
] as const;

const CONTENT_UNSUPPORTED_LATER: readonly AccessUnsupportedLaterConcept[] = [
  "one_time_purchase",
  "ticketed_access",
  "formal_invite_entitlements",
] as const;

const ROOM_UNSUPPORTED_LATER: readonly AccessUnsupportedLaterConcept[] = [
  "ticketed_access",
  "formal_invite_entitlements",
  "event_access",
] as const;

const normalizeText = (value: unknown) => String(value ?? "").trim();

const buildPreviewDecision = (options: {
  kind: AccessResolverKind;
  renderState: AccessRenderState;
  reason: AccessReason;
  supportStatus?: AccessResolverSupportStatus;
}): AccessPreviewDecision => {
  const supportStatus = options.supportStatus ?? "supported";
  if (supportStatus === "unsupported_later" || options.renderState === "unsupported") {
    return {
      allowed: false,
      mode: "hidden",
      reason: "unsupported_later",
      supportStatus: "unsupported_later",
    };
  }

  if (options.renderState !== "blocked") {
    return {
      allowed: true,
      mode: "full",
      reason: "accessible_now",
      supportStatus,
    };
  }

  if (options.kind === "channel") {
    return {
      allowed: true,
      mode: "teaser",
      reason: "channel_summary_visible",
      supportStatus,
    };
  }

  if (options.kind === "content") {
    return {
      allowed: true,
      mode: "teaser",
      reason: "content_teaser_allowed",
      supportStatus,
    };
  }

  if (options.reason === "removed") {
    return {
      allowed: false,
      mode: "hidden",
      reason: "removed_membership_hidden",
      supportStatus,
    };
  }

  return {
    allowed: true,
    mode: "teaser",
    reason: "room_teaser_allowed",
    supportStatus,
  };
};

const deriveRoomClassification = (decision: RoomAccessDecision): AccessClassification => {
  if (decision.reason === "room_locked" || decision.reason === "removed") return "private";
  if (decision.contentAccessRule === "party_pass") return "party_pass";
  if (decision.contentAccessRule === "premium") return "premium_only";
  if (decision.joinPolicy === "locked") return "private";
  return "public";
};

const buildContentClassification = (accessRule: ContentAccessPolicy): AccessClassification => (
  accessRule === "premium" ? "premium_only" : "public"
);

const getChannelReason = (classification: ChannelAccessPolicy): AccessReason => {
  if (classification === "official_access") return "official_access";
  if (classification === "private") return "channel_defaults_private";
  if (classification === "subscriber_access") return "channel_defaults_subscriber";
  if (classification === "mixed_access") return "channel_defaults_mixed";
  return "channel_defaults_open";
};

async function loadChannelProfile(options: ResolveChannelAccessOptions) {
  if (options.profile) return options.profile;
  const channelUserId = normalizeText(options.channelUserId);
  if (!channelUserId) return null;
  return readUserProfileByUserId(channelUserId).catch(() => null);
}

async function loadChannelPermissions(options: ResolveChannelAccessOptions) {
  const channelUserId = normalizeText(options.channelUserId);
  if (options.creatorPermissions) {
    return normalizeCreatorPermissionSet(options.creatorPermissions, channelUserId);
  }
  if (!channelUserId) return null;
  return readCreatorPermissions(channelUserId).catch(() => normalizeCreatorPermissionSet(null, channelUserId));
}

export function getAccessLabel(input: LabelInput): string {
  const classification = typeof input === "string" ? input : input.classification;
  if (classification === "official_access") return "Official Access";
  if (classification === "private") return "Private";
  if (classification === "subscriber_access") return "Subscriber Access";
  if (classification === "mixed_access") return "Mixed Access";
  if (classification === "party_pass") return "Party Pass";
  if (classification === "premium_only") return "Premium";
  if (classification === "unsupported_later") return "Later";
  return "Public";
}

export function canPreviewLockedSurface(options: {
  kind: AccessResolverKind;
  renderState: AccessRenderState;
  reason: AccessReason;
  supportStatus?: AccessResolverSupportStatus;
}): AccessPreviewDecision {
  return buildPreviewDecision(options);
}

export async function resolveChannelAccess(
  options: ResolveChannelAccessOptions,
): Promise<ChannelAccessResolution> {
  const channelUserId = normalizeText(options.channelUserId) || null;
  const isOfficial = typeof options.isOfficial === "boolean"
    ? options.isOfficial
    : !!getOfficialPlatformAccount(channelUserId);

  if (isOfficial) {
    const preview = canPreviewLockedSurface({
      kind: "channel",
      renderState: "accessible",
      reason: "official_access",
    });

    return {
      kind: "channel",
      channelUserId,
      supportStatus: "supported",
      renderState: "accessible",
      classification: "official_access",
      reason: "official_access",
      label: getAccessLabel("official_access"),
      isAllowed: true,
      isBlocked: false,
      blockSource: "none",
      previewAllowed: preview.allowed,
      previewMode: preview.mode,
      unsupportedLater: CHANNEL_UNSUPPORTED_LATER,
      currentTruthSources: ["official_platform_accounts"],
      notes: [
        "Official platform profiles stay visible on canonical profile and Chi'lly Chat surfaces.",
      ],
      currentTruthOnly: true,
      effectiveAccessRule: "official_access",
      isOfficial: true,
      joinPolicy: null,
      requestedWatchPartyAccessRule: null,
      requestedCommunicationAccessRule: null,
      watchPartyAccessRule: null,
      communicationAccessRule: null,
      creatorPermissions: null,
      normalizations: [],
    };
  }

  if (!channelUserId && !options.profile) {
    const preview = canPreviewLockedSurface({
      kind: "channel",
      renderState: "loading",
      reason: "missing_channel_context",
    });

    return {
      kind: "channel",
      channelUserId,
      supportStatus: "supported",
      renderState: "loading",
      classification: "public",
      reason: "missing_channel_context",
      label: "Loading Access",
      isAllowed: true,
      isBlocked: false,
      blockSource: "none",
      previewAllowed: preview.allowed,
      previewMode: preview.mode,
      unsupportedLater: CHANNEL_UNSUPPORTED_LATER,
      currentTruthSources: ["user_profiles", "creator_permissions"],
      notes: ["Channel user id or profile defaults are still missing."],
      currentTruthOnly: true,
      effectiveAccessRule: "public",
      isOfficial: false,
      joinPolicy: null,
      requestedWatchPartyAccessRule: null,
      requestedCommunicationAccessRule: null,
      watchPartyAccessRule: null,
      communicationAccessRule: null,
      creatorPermissions: null,
      normalizations: [],
    };
  }

  const [profile, creatorPermissions] = await Promise.all([
    loadChannelProfile(options),
    loadChannelPermissions(options),
  ]);

  const requestedWatchPartyAccessRule = normalizeMonetizationAccessRule(profile?.defaultWatchPartyContentAccessRule);
  const requestedCommunicationAccessRule = normalizeMonetizationAccessRule(profile?.defaultCommunicationContentAccessRule);
  const joinPolicy = normalizeJoinPolicy(profile?.defaultWatchPartyJoinPolicy);
  const watchPartyAccessRule = sanitizeCreatorRoomAccessRule(requestedWatchPartyAccessRule, creatorPermissions);
  const communicationAccessRule = sanitizeCreatorRoomAccessRule(requestedCommunicationAccessRule, creatorPermissions);
  const normalizations: string[] = [];

  if (!profile) {
    normalizations.push("No explicit channel profile row was available, so current helper truth fell back to open defaults.");
  }
  if (requestedWatchPartyAccessRule !== watchPartyAccessRule) {
    normalizations.push("Watch-party access normalized to supported creator capability truth.");
  }
  if (requestedCommunicationAccessRule !== communicationAccessRule) {
    normalizations.push("Communication access normalized to supported creator capability truth.");
  }

  const classification: ChannelAccessPolicy = (
    watchPartyAccessRule !== "open" && communicationAccessRule !== "open"
      ? "subscriber_access"
      : joinPolicy === "locked"
        ? "private"
        : watchPartyAccessRule === "open" && communicationAccessRule === "open"
          ? "public"
          : "mixed_access"
  );
  const reason = getChannelReason(classification);
  const preview = canPreviewLockedSurface({
    kind: "channel",
    renderState: "accessible",
    reason,
  });

  return {
    kind: "channel",
    channelUserId,
    supportStatus: "supported",
    renderState: "accessible",
    classification,
    reason,
    label: getAccessLabel(classification),
    isAllowed: true,
    isBlocked: false,
    blockSource: "none",
    previewAllowed: preview.allowed,
    previewMode: preview.mode,
    unsupportedLater: CHANNEL_UNSUPPORTED_LATER,
    currentTruthSources: ["user_profiles", "creator_permissions"],
    notes: normalizations,
    currentTruthOnly: true,
    effectiveAccessRule: classification,
    isOfficial: false,
    joinPolicy,
    requestedWatchPartyAccessRule,
    requestedCommunicationAccessRule,
    watchPartyAccessRule,
    communicationAccessRule,
    creatorPermissions,
    normalizations,
  };
}

export async function resolveContentAccess(
  options: ResolveContentAccessOptions,
): Promise<ContentAccessResolution> {
  const requestedAccessRule = normalizeTitleAccessRule(options.accessRule);
  const creatorPermissions = options.creatorPermissions
    ? normalizeCreatorPermissionSet(options.creatorPermissions)
    : null;
  const effectiveAccessRule = creatorPermissions
    ? sanitizeCreatorTitleAccessRule(requestedAccessRule, creatorPermissions)
    : requestedAccessRule;
  const access = await evaluateTitleAccess({
    titleId: options.titleId,
    accessRule: effectiveAccessRule,
    plan: options.plan ?? null,
  });
  const normalizations: string[] = [];
  if (creatorPermissions && requestedAccessRule !== effectiveAccessRule) {
    normalizations.push("Title access normalized to supported creator capability truth.");
  }

  const classification = buildContentClassification(effectiveAccessRule);
  const renderState: AccessRenderState = access.allowed ? "accessible" : "blocked";
  const blockSource: AccessBlockSource = access.allowed
    ? "none"
    : access.reason === "premium_required" || access.reason === "party_pass_required"
      ? "user_entitlement"
      : "none";
  const preview = canPreviewLockedSurface({
    kind: "content",
    renderState,
    reason: normalizations.length ? "creator_capability_normalized" : access.reason,
  });

  return {
    kind: "content",
    titleId: normalizeText(options.titleId) || null,
    supportStatus: "supported",
    renderState,
    classification,
    reason: normalizations.length ? "creator_capability_normalized" : access.reason,
    label: getAccessLabel(classification),
    isAllowed: access.allowed,
    isBlocked: !access.allowed,
    blockSource,
    previewAllowed: preview.allowed,
    previewMode: preview.mode,
    unsupportedLater: CONTENT_UNSUPPORTED_LATER,
    currentTruthSources: ["titles.content_access_rule", "monetization.evaluateTitleAccess"],
    notes: normalizations,
    currentTruthOnly: true,
    effectiveAccessRule,
    requestedAccessRule,
    monetization: access.monetization,
    plan: access.plan,
    planTier: access.plan.tier,
    normalizations,
  };
}

async function loadRoomAccessDecision(options: ResolveRoomAccessOptions): Promise<RoomAccessDecision> {
  if (options.roomSurface === "watch_party") {
    return evaluatePartyRoomAccess({
      partyId: options.partyId,
      room: options.room,
      membership: options.membership,
      userId: options.userId,
    });
  }

  if (options.roomSurface === "communication") {
    return evaluateCommunicationRoomAccess({
      room: options.room,
      membership: options.membership,
      userId: options.userId,
    });
  }

  return evaluateRoomAccess({
    partyId: options.partyId,
    room: options.room,
    membership: options.membership,
    hasWritableIdentity: options.hasWritableIdentity,
  });
}

export async function resolveRoomAccess(
  options: ResolveRoomAccessOptions,
): Promise<RoomAccessResolution> {
  const decision = await loadRoomAccessDecision(options);
  const classification = deriveRoomClassification(decision);
  const renderState: AccessRenderState = decision.canJoin ? "accessible" : "blocked";
  const blockSource: AccessBlockSource = decision.canJoin
    ? "none"
    : decision.reason === "identity_required"
      ? "identity"
      : decision.reason === "room_locked"
        ? "room_rule"
        : decision.reason === "removed"
          ? "room_membership"
          : decision.reason === "premium_required" || decision.reason === "party_pass_required"
            ? "user_entitlement"
            : "none";
  const preview = canPreviewLockedSurface({
    kind: "room",
    renderState,
    reason: decision.reason,
  });

  const sources = options.roomSurface === "watch_party"
    ? ["watch_party.evaluatePartyRoomAccess", "room_rules.evaluateRoomAccess"]
    : options.roomSurface === "communication"
      ? ["communication.evaluateCommunicationRoomAccess", "room_rules.evaluateRoomAccess"]
      : ["room_rules.evaluateRoomAccess"];

  return {
    kind: "room",
    roomSurface: options.roomSurface,
    supportStatus: "supported",
    renderState,
    classification,
    reason: decision.reason,
    label: getAccessLabel(classification),
    isAllowed: decision.canJoin,
    isBlocked: !decision.canJoin,
    blockSource,
    previewAllowed: preview.allowed,
    previewMode: preview.mode,
    unsupportedLater: ROOM_UNSUPPORTED_LATER,
    currentTruthSources: sources,
    notes: [],
    currentTruthOnly: true,
    effectiveAccessRule: decision.contentAccessRule,
    joinPolicy: decision.joinPolicy,
    capturePolicy: normalizeCapturePolicy(decision.capturePolicy),
    monetization: decision.monetization,
    requiresAuthIdentity: decision.requiresAuthIdentity,
  };
}
