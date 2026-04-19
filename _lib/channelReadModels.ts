import {
  getModerationAccess,
  hasPlatformRoleMembership,
  readMyPlatformRoleMemberships,
  readSafetyReports,
  type ModerationActorRole,
  type PlatformRole,
  type PlatformRoleMembership,
  type SafetyReportRecord,
} from "./moderation";
import { getOfficialPlatformAccount } from "./officialAccounts";
import { supabase } from "./supabase";

export const CHANNEL_FOLLOWERS_TABLE = "channel_followers";
export const CHANNEL_SUBSCRIBERS_TABLE = "channel_subscribers";
export const CHANNEL_AUDIENCE_REQUESTS_TABLE = "channel_audience_requests";
export const CHANNEL_AUDIENCE_BLOCKS_TABLE = "channel_audience_blocks";

export type ChannelAudienceAccessScope = "owner" | "operator" | "unavailable";
export type ChannelSafetyAdminAccessScope = "owner" | "reviewer" | "unavailable";
export type ChannelReadModelFieldStatus = "available" | "missing";

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
  publicActivityVisibility: null;
  followerSurfaceEnabled: null;
  subscriberSurfaceEnabled: null;
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
  recentSafetyReports: SafetyReportRecord[] | null;
  recentSafetyReportCount: number | null;
  isOfficial: boolean;
  auditOwnerKey: string | null;
  dataStatus: {
    recentSafetyReports: ChannelReadModelFieldStatus;
    recentSafetyReportCount: ChannelReadModelFieldStatus;
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
  publicActivityVisibility: "missing",
  followerSurfaceEnabled: "missing",
  subscriberSurfaceEnabled: "missing",
};

const normalizeText = (value: unknown) => String(value ?? "").trim();

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
      moderationAccess.canAccessAdmin
      || hasPlatformRoleMembership(memberships, ["operator"])
    ),
    canReviewSafetyAcrossChannels: (
      moderationAccess.canReviewSafetyReports
      || hasPlatformRoleMembership(memberships, ["operator", "moderator"])
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
  ]);

  if (followerCountError) throw followerCountError;
  if (subscriberCountError) throw subscriberCountError;
  if (pendingRequestCountError) throw pendingRequestCountError;
  if (blockedAudienceCountError) throw blockedAudienceCountError;

  const followerCount = Number(followerCountRaw ?? 0);
  const subscriberCount = Number(subscriberCountRaw ?? 0);
  const pendingRequestCount = Number(pendingRequestCountRaw ?? 0);
  const blockedAudienceCount = Number(blockedAudienceCountRaw ?? 0);

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
    publicActivityVisibility: null,
    followerSurfaceEnabled: null,
    subscriberSurfaceEnabled: null,
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
  const recentSafetyReports = canReviewSafetyReports ? await readSafetyReports().catch(() => []) : null;
  const recentSafetyReportCount = recentSafetyReports ? recentSafetyReports.length : null;

  return {
    channelUserId: context.channelUserId,
    generatedAt: context.generatedAt,
    accessScope,
    actorRole: context.moderationAccess.actorRole,
    canAccessAdmin: context.moderationAccess.canAccessAdmin,
    canReviewSafetyReports,
    platformRoles,
    recentSafetyReports,
    recentSafetyReportCount,
    isOfficial: !!officialAccount,
    auditOwnerKey: officialAccount?.auditOwnerKey ?? context.moderationAccess.auditOwnerKey,
    dataStatus: {
      recentSafetyReports: recentSafetyReports ? "available" : "missing",
      recentSafetyReportCount: recentSafetyReportCount === null ? "missing" : "available",
    },
  };
}
