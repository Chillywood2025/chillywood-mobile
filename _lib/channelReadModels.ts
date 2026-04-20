import {
  canAccessAdminConsole,
  canReviewSafetyQueue,
  getModerationAccess,
  hasPlatformRoleMembership,
  readMyPlatformRoleMemberships,
  readSafetyReportQueue,
  resolvePlatformActorRole,
  type ModerationActorRole,
  type PlatformRole,
  type PlatformRoleMembership,
  type SafetyReportQueueItem,
} from "./moderation";
import { getOfficialPlatformAccount } from "./officialAccounts";
import { supabase } from "./supabase";

export const CHANNEL_FOLLOWERS_TABLE = "channel_followers";
export const CHANNEL_SUBSCRIBERS_TABLE = "channel_subscribers";
export const CHANNEL_AUDIENCE_REQUESTS_TABLE = "channel_audience_requests";
export const CHANNEL_AUDIENCE_BLOCKS_TABLE = "channel_audience_blocks";
export const WATCH_PARTY_ROOMS_TABLE = "watch_party_rooms";
export const COMMUNICATION_ROOMS_TABLE = "communication_rooms";
export const USER_PROFILES_TABLE = "user_profiles";

export type ChannelAudienceAccessScope = "owner" | "operator" | "unavailable";
export type ChannelSafetyAdminAccessScope = "owner" | "reviewer" | "unavailable";
export type ChannelCreatorAnalyticsAccessScope = "owner" | "unavailable";
export type ChannelReadModelFieldStatus = "available" | "missing" | "later";
export type ChannelPublicActivityVisibility = "public" | "followers_only" | "subscribers_only" | "private";

export type ChannelAudienceReadModel = {
  channelUserId: string;
  generatedAt: string;
  accessScope: ChannelAudienceAccessScope;
  followerCount: number | null;
  subscriberCount: number | null;
  pendingRequestCount: number | null;
  blockedAudienceCount: number | null;
  vipCount: number | null;
  moderatorCount: number | null;
  coHostCount: number | null;
  publicActivityVisibility: ChannelPublicActivityVisibility | null;
  followerSurfaceEnabled: boolean | null;
  subscriberSurfaceEnabled: boolean | null;
  dataStatus: {
    followerCount: ChannelReadModelFieldStatus;
    subscriberCount: ChannelReadModelFieldStatus;
    pendingRequestCount: ChannelReadModelFieldStatus;
    blockedAudienceCount: ChannelReadModelFieldStatus;
    vipCount: ChannelReadModelFieldStatus;
    moderatorCount: ChannelReadModelFieldStatus;
    coHostCount: ChannelReadModelFieldStatus;
    publicActivityVisibility: ChannelReadModelFieldStatus;
    followerSurfaceEnabled: ChannelReadModelFieldStatus;
    subscriberSurfaceEnabled: ChannelReadModelFieldStatus;
  };
};

export type ChannelSafetyAdminReadModel = {
  channelUserId: string;
  generatedAt: string;
  accessScope: ChannelSafetyAdminAccessScope;
  actorRole: ModerationActorRole;
  canAccessAdmin: boolean;
  canReviewSafetyReports: boolean;
  platformRoles: PlatformRole[];
  recentSafetyReports: SafetyReportQueueItem[] | null;
  recentSafetyReportCount: number | null;
  recentPlatformOwnedTargetCount: number | null;
  recentSourceSurfaces: string[] | null;
  isOfficial: boolean;
  auditOwnerKey: string | null;
  dataStatus: {
    recentSafetyReports: ChannelReadModelFieldStatus;
    recentSafetyReportCount: ChannelReadModelFieldStatus;
    recentPlatformOwnedTargetCount: ChannelReadModelFieldStatus;
    recentSourceSurfaces: ChannelReadModelFieldStatus;
  };
};

export type CreatorAnalyticsReadModel = {
  channelUserId: string;
  generatedAt: string;
  accessScope: ChannelCreatorAnalyticsAccessScope;
  watchPartySessionsHosted: number | null;
  liveSessionsHosted: number | null;
  communicationRoomsHosted: number | null;
  activeHostedRooms: number | null;
  latestHostedActivityAt: string | null;
  profileVisits: null;
  followerCount: number | null;
  subscriberCount: number | null;
  liveAttendanceTotal: null;
  contentLaunches: null;
  continueWatchingReturns: null;
  gatedSurfaceViews: null;
  dataStatus: {
    watchPartySessionsHosted: ChannelReadModelFieldStatus;
    liveSessionsHosted: ChannelReadModelFieldStatus;
    communicationRoomsHosted: ChannelReadModelFieldStatus;
    activeHostedRooms: ChannelReadModelFieldStatus;
    latestHostedActivityAt: ChannelReadModelFieldStatus;
    profileVisits: ChannelReadModelFieldStatus;
    followerCount: ChannelReadModelFieldStatus;
    subscriberCount: ChannelReadModelFieldStatus;
    liveAttendanceTotal: ChannelReadModelFieldStatus;
    contentLaunches: ChannelReadModelFieldStatus;
    continueWatchingReturns: ChannelReadModelFieldStatus;
    gatedSurfaceViews: ChannelReadModelFieldStatus;
  };
};

const ACTIVE_CHANNEL_SUBSCRIBER_STATUSES = ["active", "grace_period"] as const;

const emptyAudienceStatus: ChannelAudienceReadModel["dataStatus"] = {
  followerCount: "available",
  subscriberCount: "available",
  pendingRequestCount: "available",
  blockedAudienceCount: "available",
  vipCount: "missing",
  moderatorCount: "missing",
  coHostCount: "missing",
  publicActivityVisibility: "available",
  followerSurfaceEnabled: "available",
  subscriberSurfaceEnabled: "available",
};

const creatorAnalyticsStatus: CreatorAnalyticsReadModel["dataStatus"] = {
  watchPartySessionsHosted: "available",
  liveSessionsHosted: "available",
  communicationRoomsHosted: "available",
  activeHostedRooms: "available",
  latestHostedActivityAt: "available",
  profileVisits: "later",
  followerCount: "available",
  subscriberCount: "available",
  liveAttendanceTotal: "missing",
  contentLaunches: "missing",
  continueWatchingReturns: "later",
  gatedSurfaceViews: "later",
};

const normalizeText = (value: unknown) => String(value ?? "").trim();
const normalizePublicActivityVisibility = (value: unknown): ChannelPublicActivityVisibility | null => {
  const normalized = normalizeText(value).toLowerCase();
  if (
    normalized === "public"
    || normalized === "followers_only"
    || normalized === "subscribers_only"
    || normalized === "private"
  ) {
    return normalized;
  }
  return null;
};
const pickLatestIso = (...values: Array<string | null | undefined>) => {
  const sorted = values
    .map((value) => normalizeText(value))
    .filter(Boolean)
    .sort((left, right) => left.localeCompare(right));

  return sorted.at(-1) ?? null;
};

async function readChannelHelperContext(channelUserId: string) {
  const normalizedChannelUserId = normalizeText(channelUserId);
  if (!normalizedChannelUserId) {
    throw new Error("Channel user id is required.");
  }

  const { data: sessionData } = await supabase.auth.getSession();
  const viewerUserId = normalizeText(sessionData.session?.user?.id);
  const viewerEmail = normalizeText(sessionData.session?.user?.email);
  const moderationAccess = getModerationAccess({
    userId: viewerUserId || null,
    email: viewerEmail || null,
  });
  const memberships = viewerUserId || viewerEmail ? await readMyPlatformRoleMemberships().catch(() => []) : [];

  return {
    channelUserId: normalizedChannelUserId,
    generatedAt: new Date().toISOString(),
    isOwner: !!viewerUserId && viewerUserId === normalizedChannelUserId,
    moderationAccess,
    memberships,
    canOperateAcrossChannels: (
      canAccessAdminConsole(moderationAccess, memberships)
      || hasPlatformRoleMembership(memberships, ["owner", "operator"])
    ),
    canReviewSafetyAcrossChannels: (
      canReviewSafetyQueue(moderationAccess, memberships)
      || hasPlatformRoleMembership(memberships, ["owner", "operator", "moderator"])
    ),
  };
}

export async function readChannelAudienceSummary(channelUserId: string): Promise<ChannelAudienceReadModel> {
  const context = await readChannelHelperContext(channelUserId);
  const accessScope: ChannelAudienceAccessScope = context.isOwner
    ? "owner"
    : context.canOperateAcrossChannels
      ? "operator"
      : "unavailable";

  if (accessScope === "unavailable") {
    return {
      channelUserId: context.channelUserId,
      generatedAt: context.generatedAt,
      accessScope,
      followerCount: null,
      subscriberCount: null,
      pendingRequestCount: null,
      blockedAudienceCount: null,
      vipCount: null,
      moderatorCount: null,
      coHostCount: null,
      publicActivityVisibility: null,
      followerSurfaceEnabled: null,
      subscriberSurfaceEnabled: null,
      dataStatus: emptyAudienceStatus,
    };
  }

  const [
    { count: followerCountRaw, error: followerCountError },
    { count: subscriberCountRaw, error: subscriberCountError },
    { count: pendingRequestCountRaw, error: pendingRequestCountError },
    { count: blockedAudienceCountRaw, error: blockedAudienceCountError },
    { data: audienceVisibilityData, error: audienceVisibilityError },
  ] = await Promise.all([
    supabase
      .from(CHANNEL_FOLLOWERS_TABLE)
      .select("*", { count: "exact", head: true })
      .eq("channel_user_id", context.channelUserId),
    supabase
      .from(CHANNEL_SUBSCRIBERS_TABLE)
      .select("*", { count: "exact", head: true })
      .eq("channel_user_id", context.channelUserId)
      .in("status", [...ACTIVE_CHANNEL_SUBSCRIBER_STATUSES]),
    supabase
      .from(CHANNEL_AUDIENCE_REQUESTS_TABLE)
      .select("*", { count: "exact", head: true })
      .eq("channel_user_id", context.channelUserId)
      .eq("status", "pending"),
    supabase
      .from(CHANNEL_AUDIENCE_BLOCKS_TABLE)
      .select("*", { count: "exact", head: true })
      .eq("channel_user_id", context.channelUserId),
    supabase
      .from(USER_PROFILES_TABLE)
      .select("public_activity_visibility,follower_surface_enabled,subscriber_surface_enabled")
      .eq("user_id", context.channelUserId)
      .maybeSingle(),
  ]);

  if (followerCountError) throw followerCountError;
  if (subscriberCountError) throw subscriberCountError;
  if (pendingRequestCountError) throw pendingRequestCountError;
  if (blockedAudienceCountError) throw blockedAudienceCountError;
  if (audienceVisibilityError) throw audienceVisibilityError;

  const followerCount = Number(followerCountRaw ?? 0);
  const subscriberCount = Number(subscriberCountRaw ?? 0);
  const pendingRequestCount = Number(pendingRequestCountRaw ?? 0);
  const blockedAudienceCount = Number(blockedAudienceCountRaw ?? 0);
  const publicActivityVisibility = normalizePublicActivityVisibility(audienceVisibilityData?.public_activity_visibility);
  const followerSurfaceEnabled = typeof audienceVisibilityData?.follower_surface_enabled === "boolean"
    ? audienceVisibilityData.follower_surface_enabled
    : null;
  const subscriberSurfaceEnabled = typeof audienceVisibilityData?.subscriber_surface_enabled === "boolean"
    ? audienceVisibilityData.subscriber_surface_enabled
    : null;

  return {
    channelUserId: context.channelUserId,
    generatedAt: context.generatedAt,
    accessScope,
    followerCount,
    subscriberCount,
    pendingRequestCount,
    blockedAudienceCount,
    vipCount: null,
    moderatorCount: null,
    coHostCount: null,
    publicActivityVisibility,
    followerSurfaceEnabled,
    subscriberSurfaceEnabled,
    dataStatus: emptyAudienceStatus,
  };
}

export async function readChannelSafetyAdminSummary(channelUserId: string): Promise<ChannelSafetyAdminReadModel> {
  const context = await readChannelHelperContext(channelUserId);
  const canReviewSafetyReports = context.canReviewSafetyAcrossChannels;
  const accessScope: ChannelSafetyAdminAccessScope = context.isOwner
    ? "owner"
    : canReviewSafetyReports
      ? "reviewer"
      : "unavailable";
  const officialAccount = getOfficialPlatformAccount(context.channelUserId);
  const platformRoles = context.memberships
    .filter((membership): membership is PlatformRoleMembership => membership.status === "active")
    .map((membership) => membership.role);
  const recentSafetyQueue = canReviewSafetyReports ? await readSafetyReportQueue({ limit: 8 }).catch(() => null) : null;
  const recentSafetyReports = recentSafetyQueue?.items ?? null;
  const recentSafetyReportCount = recentSafetyQueue ? recentSafetyQueue.summary.totalReports : null;
  const recentPlatformOwnedTargetCount = recentSafetyQueue ? recentSafetyQueue.summary.platformOwnedTargetCount : null;
  const recentSourceSurfaces = recentSafetyQueue ? recentSafetyQueue.summary.sourceSurfaces : null;

  return {
    channelUserId: context.channelUserId,
    generatedAt: context.generatedAt,
    accessScope,
    actorRole: resolvePlatformActorRole(context.moderationAccess, context.memberships),
    canAccessAdmin: canAccessAdminConsole(context.moderationAccess, context.memberships),
    canReviewSafetyReports,
    platformRoles,
    recentSafetyReports,
    recentSafetyReportCount,
    recentPlatformOwnedTargetCount,
    recentSourceSurfaces,
    isOfficial: !!officialAccount,
    auditOwnerKey: officialAccount?.auditOwnerKey ?? context.moderationAccess.auditOwnerKey,
    dataStatus: {
      recentSafetyReports: recentSafetyReports === null ? "missing" : "available",
      recentSafetyReportCount: recentSafetyReportCount === null ? "missing" : "available",
      recentPlatformOwnedTargetCount: recentPlatformOwnedTargetCount === null ? "missing" : "available",
      recentSourceSurfaces: recentSourceSurfaces === null ? "missing" : "available",
    },
  };
}

export async function readCreatorAnalyticsSummary(channelUserId: string): Promise<CreatorAnalyticsReadModel> {
  const context = await readChannelHelperContext(channelUserId);
  const accessScope: ChannelCreatorAnalyticsAccessScope = context.isOwner ? "owner" : "unavailable";

  if (accessScope === "unavailable") {
    return {
      channelUserId: context.channelUserId,
      generatedAt: context.generatedAt,
      accessScope,
      watchPartySessionsHosted: null,
      liveSessionsHosted: null,
      communicationRoomsHosted: null,
      activeHostedRooms: null,
      latestHostedActivityAt: null,
      profileVisits: null,
      followerCount: null,
      subscriberCount: null,
      liveAttendanceTotal: null,
      contentLaunches: null,
      continueWatchingReturns: null,
      gatedSurfaceViews: null,
      dataStatus: creatorAnalyticsStatus,
    };
  }

  const [
    { count: titleRoomCountRaw, error: titleRoomCountError },
    { count: liveRoomCountRaw, error: liveRoomCountError },
    { count: communicationRoomCountRaw, error: communicationRoomCountError },
    { count: activeWatchPartyCountRaw, error: activeWatchPartyCountError },
    { count: activeCommunicationCountRaw, error: activeCommunicationCountError },
    { data: latestWatchPartyActivityRows, error: latestWatchPartyActivityError },
    { data: latestCommunicationActivityRows, error: latestCommunicationActivityError },
    { count: followerCountRaw, error: followerCountError },
    { count: subscriberCountRaw, error: subscriberCountError },
  ] = await Promise.all([
    supabase
      .from(WATCH_PARTY_ROOMS_TABLE)
      .select("*", { count: "exact", head: true })
      .eq("host_user_id", context.channelUserId)
      .eq("room_type", "title"),
    supabase
      .from(WATCH_PARTY_ROOMS_TABLE)
      .select("*", { count: "exact", head: true })
      .eq("host_user_id", context.channelUserId)
      .eq("room_type", "live"),
    supabase
      .from(COMMUNICATION_ROOMS_TABLE)
      .select("*", { count: "exact", head: true })
      .eq("host_user_id", context.channelUserId),
    supabase
      .from(WATCH_PARTY_ROOMS_TABLE)
      .select("*", { count: "exact", head: true })
      .eq("host_user_id", context.channelUserId)
      .eq("is_active", true),
    supabase
      .from(COMMUNICATION_ROOMS_TABLE)
      .select("*", { count: "exact", head: true })
      .eq("host_user_id", context.channelUserId)
      .eq("status", "active"),
    supabase
      .from(WATCH_PARTY_ROOMS_TABLE)
      .select("last_activity_at")
      .eq("host_user_id", context.channelUserId)
      .order("last_activity_at", { ascending: false })
      .limit(1),
    supabase
      .from(COMMUNICATION_ROOMS_TABLE)
      .select("last_activity_at")
      .eq("host_user_id", context.channelUserId)
      .order("last_activity_at", { ascending: false })
      .limit(1),
    supabase
      .from(CHANNEL_FOLLOWERS_TABLE)
      .select("*", { count: "exact", head: true })
      .eq("channel_user_id", context.channelUserId),
    supabase
      .from(CHANNEL_SUBSCRIBERS_TABLE)
      .select("*", { count: "exact", head: true })
      .eq("channel_user_id", context.channelUserId)
      .in("status", [...ACTIVE_CHANNEL_SUBSCRIBER_STATUSES]),
  ]);

  if (titleRoomCountError) throw titleRoomCountError;
  if (liveRoomCountError) throw liveRoomCountError;
  if (communicationRoomCountError) throw communicationRoomCountError;
  if (activeWatchPartyCountError) throw activeWatchPartyCountError;
  if (activeCommunicationCountError) throw activeCommunicationCountError;
  if (latestWatchPartyActivityError) throw latestWatchPartyActivityError;
  if (latestCommunicationActivityError) throw latestCommunicationActivityError;
  if (followerCountError) throw followerCountError;
  if (subscriberCountError) throw subscriberCountError;

  const watchPartySessionsHosted = Number(titleRoomCountRaw ?? 0);
  const liveSessionsHosted = Number(liveRoomCountRaw ?? 0);
  const communicationRoomsHosted = Number(communicationRoomCountRaw ?? 0);
  const activeHostedRooms = Number(activeWatchPartyCountRaw ?? 0) + Number(activeCommunicationCountRaw ?? 0);
  const latestHostedActivityAt = pickLatestIso(
    latestWatchPartyActivityRows?.[0]?.last_activity_at ?? null,
    latestCommunicationActivityRows?.[0]?.last_activity_at ?? null,
  );
  const followerCount = Number(followerCountRaw ?? 0);
  const subscriberCount = Number(subscriberCountRaw ?? 0);

  return {
    channelUserId: context.channelUserId,
    generatedAt: context.generatedAt,
    accessScope,
    watchPartySessionsHosted,
    liveSessionsHosted,
    communicationRoomsHosted,
    activeHostedRooms,
    latestHostedActivityAt,
    profileVisits: null,
    followerCount,
    subscriberCount,
    liveAttendanceTotal: null,
    contentLaunches: null,
    continueWatchingReturns: null,
    gatedSurfaceViews: null,
    dataStatus: creatorAnalyticsStatus,
  };
}
