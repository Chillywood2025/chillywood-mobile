import type { Tables, TablesInsert, TablesUpdate } from "../supabase/database.types";

import { hasPlatformRoleMembership, readMyPlatformRoleMemberships } from "./moderation";
import { supabase } from "./supabase";

export const CHANNEL_FOLLOWERS_TABLE = "channel_followers";
export const CHANNEL_SUBSCRIBERS_TABLE = "channel_subscribers";
export const CHANNEL_AUDIENCE_REQUESTS_TABLE = "channel_audience_requests";
export const CHANNEL_AUDIENCE_BLOCKS_TABLE = "channel_audience_blocks";

export type ChannelAudienceRequestKind = "follow" | "subscriber_access";
export type ChannelAudienceRequestStatus = "pending" | "approved" | "declined" | "canceled";
export type ChannelAudienceActorScope = "signed_out" | "viewer" | "channel_owner" | "operator";
export type ChannelAudienceRequiredScope =
  | "viewer"
  | "requester_or_owner_or_operator"
  | "owner_or_operator"
  | "unsupported";
export type ChannelAudienceActionName =
  | "follow"
  | "unfollow"
  | "remove_follower"
  | "create_request"
  | "cancel_request"
  | "approve_request"
  | "decline_request"
  | "block"
  | "unblock"
  | "subscriber_relationship_mutation";
export type ChannelAudienceActionStatus = "completed" | "noop" | "blocked" | "unsupported" | "error";
export type ChannelAudienceActionReason =
  | "allowed"
  | "signed_out"
  | "missing_channel_user_id"
  | "missing_target_user_id"
  | "self_target"
  | "already_following"
  | "not_following"
  | "request_pending"
  | "request_not_found"
  | "request_not_pending"
  | "not_requester"
  | "not_owner_or_operator"
  | "already_blocked"
  | "not_blocked"
  | "subscriber_mutation_unsupported"
  | "insert_failed"
  | "update_failed"
  | "delete_failed";

export type ChannelAudienceActionResult = {
  action: ChannelAudienceActionName;
  status: ChannelAudienceActionStatus;
  reason: ChannelAudienceActionReason;
  message: string;
  actorScope: ChannelAudienceActorScope;
  requiredScope: ChannelAudienceRequiredScope;
  channelUserId: string | null;
  viewerUserId: string | null;
  targetUserId: string | null;
  requestId: number | null;
  requestKind: ChannelAudienceRequestKind | null;
  requestStatus: ChannelAudienceRequestStatus | null;
};

export type ChannelSubscriberRelationshipActionSupport = {
  action: "subscriber_relationship_mutation";
  supported: false;
  requiredScope: "unsupported";
  reason: "subscriber_mutation_unsupported";
  message: string;
};

export type ChannelViewerFollowState =
  | "signed_out"
  | "self"
  | "following"
  | "not_following"
  | "unavailable";

type ChannelFollowerRow = Tables<"channel_followers">;
type ChannelAudienceRequestRow = Tables<"channel_audience_requests">;
type ChannelAudienceBlockRow = Tables<"channel_audience_blocks">;

type ChannelFollowerInsert = TablesInsert<"channel_followers">;
type ChannelAudienceRequestInsert = TablesInsert<"channel_audience_requests">;
type ChannelAudienceRequestUpdate = TablesUpdate<"channel_audience_requests">;
type ChannelAudienceBlockInsert = TablesInsert<"channel_audience_blocks">;

type ChannelAudienceActorContext = {
  channelUserId: string | null;
  viewerUserId: string | null;
  actorScope: ChannelAudienceActorScope;
  isOwner: boolean;
  canOperateAcrossChannels: boolean;
};

const normalizeText = (value: unknown) => String(value ?? "").trim();

const normalizeRequestKind = (value: unknown): ChannelAudienceRequestKind | null => {
  const normalized = normalizeText(value).toLowerCase();
  if (normalized === "subscriber_access") return "subscriber_access";
  if (normalized === "follow") return "follow";
  return null;
};

const normalizeRequestStatus = (value: unknown): ChannelAudienceRequestStatus | null => {
  const normalized = normalizeText(value).toLowerCase();
  if (
    normalized === "pending"
    || normalized === "approved"
    || normalized === "declined"
    || normalized === "canceled"
  ) {
    return normalized;
  }
  return null;
};

const buildActionResult = (input: {
  action: ChannelAudienceActionName;
  status: ChannelAudienceActionStatus;
  reason: ChannelAudienceActionReason;
  message: string;
  actorScope: ChannelAudienceActorScope;
  requiredScope: ChannelAudienceRequiredScope;
  channelUserId?: string | null;
  viewerUserId?: string | null;
  targetUserId?: string | null;
  requestId?: number | null;
  requestKind?: ChannelAudienceRequestKind | null;
  requestStatus?: ChannelAudienceRequestStatus | null;
}): ChannelAudienceActionResult => ({
  action: input.action,
  status: input.status,
  reason: input.reason,
  message: input.message,
  actorScope: input.actorScope,
  requiredScope: input.requiredScope,
  channelUserId: normalizeText(input.channelUserId) || null,
  viewerUserId: normalizeText(input.viewerUserId) || null,
  targetUserId: normalizeText(input.targetUserId) || null,
  requestId: typeof input.requestId === "number" && Number.isFinite(input.requestId) ? input.requestId : null,
  requestKind: input.requestKind ?? null,
  requestStatus: input.requestStatus ?? null,
});

async function readAudienceActorContext(channelUserId: string): Promise<ChannelAudienceActorContext> {
  const normalizedChannelUserId = normalizeText(channelUserId) || null;
  const { data: sessionData } = await supabase.auth.getSession();
  const viewerUserId = normalizeText(sessionData.session?.user?.id) || null;

  if (!normalizedChannelUserId || !viewerUserId) {
    return {
      channelUserId: normalizedChannelUserId,
      viewerUserId,
      actorScope: viewerUserId ? "viewer" : "signed_out",
      isOwner: !!viewerUserId && viewerUserId === normalizedChannelUserId,
      canOperateAcrossChannels: false,
    };
  }

  const memberships = await readMyPlatformRoleMemberships().catch(() => []);
  const canOperateAcrossChannels = hasPlatformRoleMembership(memberships, ["owner", "operator"]);
  const isOwner = viewerUserId === normalizedChannelUserId;

  return {
    channelUserId: normalizedChannelUserId,
    viewerUserId,
    actorScope: isOwner ? "channel_owner" : canOperateAcrossChannels ? "operator" : "viewer",
    isOwner,
    canOperateAcrossChannels,
  };
}

async function readFollowerRow(
  channelUserId: string,
  followerUserId: string,
): Promise<ChannelFollowerRow | null> {
  const normalizedChannelUserId = normalizeText(channelUserId);
  const normalizedFollowerUserId = normalizeText(followerUserId);
  if (!normalizedChannelUserId || !normalizedFollowerUserId) return null;

  const { data, error } = await supabase
    .from(CHANNEL_FOLLOWERS_TABLE)
    .select("*")
    .eq("channel_user_id", normalizedChannelUserId)
    .eq("follower_user_id", normalizedFollowerUserId)
    .returns<ChannelFollowerRow>()
    .maybeSingle();

  if (error || !data) return null;
  return data;
}

async function readPendingRequestRow(
  channelUserId: string,
  requesterUserId: string,
  requestKind: ChannelAudienceRequestKind,
): Promise<ChannelAudienceRequestRow | null> {
  const normalizedChannelUserId = normalizeText(channelUserId);
  const normalizedRequesterUserId = normalizeText(requesterUserId);
  if (!normalizedChannelUserId || !normalizedRequesterUserId) return null;

  const { data, error } = await supabase
    .from(CHANNEL_AUDIENCE_REQUESTS_TABLE)
    .select("*")
    .eq("channel_user_id", normalizedChannelUserId)
    .eq("requester_user_id", normalizedRequesterUserId)
    .eq("request_kind", requestKind)
    .eq("status", "pending")
    .returns<ChannelAudienceRequestRow>()
    .maybeSingle();

  if (error || !data) return null;
  return data;
}

async function readRequestRowById(requestId: number): Promise<ChannelAudienceRequestRow | null> {
  const normalizedRequestId = Number.isFinite(requestId) ? Math.floor(requestId) : 0;
  if (!normalizedRequestId) return null;

  const { data, error } = await supabase
    .from(CHANNEL_AUDIENCE_REQUESTS_TABLE)
    .select("*")
    .eq("id", normalizedRequestId)
    .returns<ChannelAudienceRequestRow>()
    .maybeSingle();

  if (error || !data) return null;
  return data;
}

async function readBlockRow(
  channelUserId: string,
  blockedUserId: string,
): Promise<ChannelAudienceBlockRow | null> {
  const normalizedChannelUserId = normalizeText(channelUserId);
  const normalizedBlockedUserId = normalizeText(blockedUserId);
  if (!normalizedChannelUserId || !normalizedBlockedUserId) return null;

  const { data, error } = await supabase
    .from(CHANNEL_AUDIENCE_BLOCKS_TABLE)
    .select("*")
    .eq("channel_user_id", normalizedChannelUserId)
    .eq("blocked_user_id", normalizedBlockedUserId)
    .returns<ChannelAudienceBlockRow>()
    .maybeSingle();

  if (error || !data) return null;
  return data;
}

export async function followChannel(channelUserId: string): Promise<ChannelAudienceActionResult> {
  const context = await readAudienceActorContext(channelUserId);
  if (!context.channelUserId) {
    return buildActionResult({
      action: "follow",
      status: "blocked",
      reason: "missing_channel_user_id",
      message: "Channel follow requires a channel user id.",
      actorScope: context.actorScope,
      requiredScope: "viewer",
      channelUserId: context.channelUserId,
      viewerUserId: context.viewerUserId,
    });
  }

  if (!context.viewerUserId) {
    return buildActionResult({
      action: "follow",
      status: "blocked",
      reason: "signed_out",
      message: "Sign in is required before following a channel.",
      actorScope: context.actorScope,
      requiredScope: "viewer",
      channelUserId: context.channelUserId,
      viewerUserId: context.viewerUserId,
    });
  }

  if (context.viewerUserId === context.channelUserId) {
    return buildActionResult({
      action: "follow",
      status: "blocked",
      reason: "self_target",
      message: "You cannot follow your own channel.",
      actorScope: context.actorScope,
      requiredScope: "viewer",
      channelUserId: context.channelUserId,
      viewerUserId: context.viewerUserId,
      targetUserId: context.viewerUserId,
    });
  }

  const existing = await readFollowerRow(context.channelUserId, context.viewerUserId);
  if (existing) {
    return buildActionResult({
      action: "follow",
      status: "noop",
      reason: "already_following",
      message: "This channel is already followed by the current viewer.",
      actorScope: context.actorScope,
      requiredScope: "viewer",
      channelUserId: context.channelUserId,
      viewerUserId: context.viewerUserId,
      targetUserId: context.viewerUserId,
    });
  }

  const payload: ChannelFollowerInsert = {
    channel_user_id: context.channelUserId,
    follower_user_id: context.viewerUserId,
    updated_at: new Date().toISOString(),
  };
  const { error } = await supabase.from(CHANNEL_FOLLOWERS_TABLE).insert(payload);

  if (error) {
    return buildActionResult({
      action: "follow",
      status: "error",
      reason: "insert_failed",
      message: String(error.message ?? "Unable to follow this channel right now."),
      actorScope: context.actorScope,
      requiredScope: "viewer",
      channelUserId: context.channelUserId,
      viewerUserId: context.viewerUserId,
      targetUserId: context.viewerUserId,
    });
  }

  return buildActionResult({
    action: "follow",
    status: "completed",
    reason: "allowed",
    message: "Channel follow relationship created.",
    actorScope: context.actorScope,
    requiredScope: "viewer",
    channelUserId: context.channelUserId,
    viewerUserId: context.viewerUserId,
    targetUserId: context.viewerUserId,
  });
}

export async function readMyChannelFollowState(channelUserId: string): Promise<ChannelViewerFollowState> {
  const context = await readAudienceActorContext(channelUserId);
  if (!context.channelUserId) return "unavailable";
  if (!context.viewerUserId) return "signed_out";
  if (context.viewerUserId === context.channelUserId) return "self";

  const existing = await readFollowerRow(context.channelUserId, context.viewerUserId);
  return existing ? "following" : "not_following";
}

export async function unfollowChannel(channelUserId: string): Promise<ChannelAudienceActionResult> {
  const context = await readAudienceActorContext(channelUserId);
  if (!context.channelUserId) {
    return buildActionResult({
      action: "unfollow",
      status: "blocked",
      reason: "missing_channel_user_id",
      message: "Channel unfollow requires a channel user id.",
      actorScope: context.actorScope,
      requiredScope: "viewer",
      channelUserId: context.channelUserId,
      viewerUserId: context.viewerUserId,
    });
  }

  if (!context.viewerUserId) {
    return buildActionResult({
      action: "unfollow",
      status: "blocked",
      reason: "signed_out",
      message: "Sign in is required before unfollowing a channel.",
      actorScope: context.actorScope,
      requiredScope: "viewer",
      channelUserId: context.channelUserId,
      viewerUserId: context.viewerUserId,
    });
  }

  const existing = await readFollowerRow(context.channelUserId, context.viewerUserId);
  if (!existing) {
    return buildActionResult({
      action: "unfollow",
      status: "noop",
      reason: "not_following",
      message: "This channel is not currently followed by the viewer.",
      actorScope: context.actorScope,
      requiredScope: "viewer",
      channelUserId: context.channelUserId,
      viewerUserId: context.viewerUserId,
      targetUserId: context.viewerUserId,
    });
  }

  const { error } = await supabase
    .from(CHANNEL_FOLLOWERS_TABLE)
    .delete()
    .eq("channel_user_id", context.channelUserId)
    .eq("follower_user_id", context.viewerUserId);

  if (error) {
    return buildActionResult({
      action: "unfollow",
      status: "error",
      reason: "delete_failed",
      message: String(error.message ?? "Unable to unfollow this channel right now."),
      actorScope: context.actorScope,
      requiredScope: "viewer",
      channelUserId: context.channelUserId,
      viewerUserId: context.viewerUserId,
      targetUserId: context.viewerUserId,
    });
  }

  return buildActionResult({
    action: "unfollow",
    status: "completed",
    reason: "allowed",
    message: "Channel follow relationship removed.",
    actorScope: context.actorScope,
    requiredScope: "viewer",
    channelUserId: context.channelUserId,
    viewerUserId: context.viewerUserId,
    targetUserId: context.viewerUserId,
  });
}

export async function removeChannelFollower(input: {
  channelUserId: string;
  followerUserId: string;
}): Promise<ChannelAudienceActionResult> {
  const context = await readAudienceActorContext(input.channelUserId);
  const targetUserId = normalizeText(input.followerUserId) || null;

  if (!context.channelUserId) {
    return buildActionResult({
      action: "remove_follower",
      status: "blocked",
      reason: "missing_channel_user_id",
      message: "Follower removal requires a channel user id.",
      actorScope: context.actorScope,
      requiredScope: "owner_or_operator",
      channelUserId: context.channelUserId,
      viewerUserId: context.viewerUserId,
      targetUserId,
    });
  }

  if (!context.viewerUserId) {
    return buildActionResult({
      action: "remove_follower",
      status: "blocked",
      reason: "signed_out",
      message: "Sign in is required before removing a follower relationship.",
      actorScope: context.actorScope,
      requiredScope: "owner_or_operator",
      channelUserId: context.channelUserId,
      viewerUserId: context.viewerUserId,
      targetUserId,
    });
  }

  if (!targetUserId) {
    return buildActionResult({
      action: "remove_follower",
      status: "blocked",
      reason: "missing_target_user_id",
      message: "Follower removal requires a follower user id.",
      actorScope: context.actorScope,
      requiredScope: "owner_or_operator",
      channelUserId: context.channelUserId,
      viewerUserId: context.viewerUserId,
      targetUserId,
    });
  }

  if (!context.isOwner && !context.canOperateAcrossChannels) {
    return buildActionResult({
      action: "remove_follower",
      status: "blocked",
      reason: "not_owner_or_operator",
      message: "Only the channel owner or an operator can remove follower relationships.",
      actorScope: context.actorScope,
      requiredScope: "owner_or_operator",
      channelUserId: context.channelUserId,
      viewerUserId: context.viewerUserId,
      targetUserId,
    });
  }

  const existing = await readFollowerRow(context.channelUserId, targetUserId);
  if (!existing) {
    return buildActionResult({
      action: "remove_follower",
      status: "noop",
      reason: "not_following",
      message: "No follower relationship exists for that audience member on this channel.",
      actorScope: context.actorScope,
      requiredScope: "owner_or_operator",
      channelUserId: context.channelUserId,
      viewerUserId: context.viewerUserId,
      targetUserId,
    });
  }

  const { error } = await supabase
    .from(CHANNEL_FOLLOWERS_TABLE)
    .delete()
    .eq("channel_user_id", context.channelUserId)
    .eq("follower_user_id", targetUserId);

  if (error) {
    return buildActionResult({
      action: "remove_follower",
      status: "error",
      reason: "delete_failed",
      message: String(error.message ?? "Unable to remove this follower relationship right now."),
      actorScope: context.actorScope,
      requiredScope: "owner_or_operator",
      channelUserId: context.channelUserId,
      viewerUserId: context.viewerUserId,
      targetUserId,
    });
  }

  return buildActionResult({
    action: "remove_follower",
    status: "completed",
    reason: "allowed",
    message: "Follower relationship removed from this channel.",
    actorScope: context.actorScope,
    requiredScope: "owner_or_operator",
    channelUserId: context.channelUserId,
    viewerUserId: context.viewerUserId,
    targetUserId,
  });
}

export async function createChannelAudienceRequest(input: {
  channelUserId: string;
  requestKind?: ChannelAudienceRequestKind;
  note?: string | null;
}): Promise<ChannelAudienceActionResult> {
  const context = await readAudienceActorContext(input.channelUserId);
  const requestKind = normalizeRequestKind(input.requestKind ?? "follow") ?? "follow";

  if (!context.channelUserId) {
    return buildActionResult({
      action: "create_request",
      status: "blocked",
      reason: "missing_channel_user_id",
      message: "Audience requests require a channel user id.",
      actorScope: context.actorScope,
      requiredScope: "viewer",
      channelUserId: context.channelUserId,
      viewerUserId: context.viewerUserId,
      requestKind,
    });
  }

  if (!context.viewerUserId) {
    return buildActionResult({
      action: "create_request",
      status: "blocked",
      reason: "signed_out",
      message: "Sign in is required before requesting audience access.",
      actorScope: context.actorScope,
      requiredScope: "viewer",
      channelUserId: context.channelUserId,
      viewerUserId: context.viewerUserId,
      requestKind,
    });
  }

  if (context.viewerUserId === context.channelUserId) {
    return buildActionResult({
      action: "create_request",
      status: "blocked",
      reason: "self_target",
      message: "You cannot create an audience request for your own channel.",
      actorScope: context.actorScope,
      requiredScope: "viewer",
      channelUserId: context.channelUserId,
      viewerUserId: context.viewerUserId,
      targetUserId: context.viewerUserId,
      requestKind,
    });
  }

  const existing = await readPendingRequestRow(context.channelUserId, context.viewerUserId, requestKind);
  if (existing) {
    return buildActionResult({
      action: "create_request",
      status: "noop",
      reason: "request_pending",
      message: "A matching audience request is already pending.",
      actorScope: context.actorScope,
      requiredScope: "viewer",
      channelUserId: context.channelUserId,
      viewerUserId: context.viewerUserId,
      targetUserId: context.viewerUserId,
      requestId: Number(existing.id ?? 0),
      requestKind,
      requestStatus: "pending",
    });
  }

  const payload: ChannelAudienceRequestInsert = {
    channel_user_id: context.channelUserId,
    requester_user_id: context.viewerUserId,
    request_kind: requestKind,
    status: "pending",
    note: normalizeText(input.note) || null,
    reviewed_at: null,
    reviewed_by: null,
    updated_at: new Date().toISOString(),
  };
  const { data, error } = await supabase
    .from(CHANNEL_AUDIENCE_REQUESTS_TABLE)
    .insert(payload)
    .select("*")
    .returns<ChannelAudienceRequestRow>()
    .single();
  const createdRequestId = Number(((data as { id?: number } | null)?.id) ?? 0);

  if (error || !data) {
    return buildActionResult({
      action: "create_request",
      status: "error",
      reason: "insert_failed",
      message: String(error?.message ?? "Unable to create an audience request right now."),
      actorScope: context.actorScope,
      requiredScope: "viewer",
      channelUserId: context.channelUserId,
      viewerUserId: context.viewerUserId,
      targetUserId: context.viewerUserId,
      requestKind,
    });
  }

  return buildActionResult({
    action: "create_request",
    status: "completed",
    reason: "allowed",
    message: "Audience request created.",
    actorScope: context.actorScope,
    requiredScope: "viewer",
    channelUserId: context.channelUserId,
    viewerUserId: context.viewerUserId,
    targetUserId: context.viewerUserId,
    requestId: createdRequestId || null,
    requestKind,
    requestStatus: "pending",
  });
}

export async function cancelChannelAudienceRequest(requestId: number): Promise<ChannelAudienceActionResult> {
  const request = await readRequestRowById(requestId);
  const context = await readAudienceActorContext(request?.channel_user_id ?? "");
  const normalizedRequestId = Number.isFinite(requestId) ? Math.floor(requestId) : 0;

  if (!context.viewerUserId) {
    return buildActionResult({
      action: "cancel_request",
      status: "blocked",
      reason: "signed_out",
      message: "Sign in is required before canceling an audience request.",
      actorScope: context.actorScope,
      requiredScope: "requester_or_owner_or_operator",
      channelUserId: request?.channel_user_id ?? null,
      viewerUserId: context.viewerUserId,
      requestId: normalizedRequestId || null,
      requestKind: normalizeRequestKind(request?.request_kind),
      requestStatus: normalizeRequestStatus(request?.status),
    });
  }

  if (!request) {
    return buildActionResult({
      action: "cancel_request",
      status: "noop",
      reason: "request_not_found",
      message: "Audience request not found.",
      actorScope: context.actorScope,
      requiredScope: "requester_or_owner_or_operator",
      viewerUserId: context.viewerUserId,
      requestId: normalizedRequestId || null,
    });
  }

  const requestStatus = normalizeRequestStatus(request.status);
  const requestKind = normalizeRequestKind(request.request_kind);
  const requesterUserId = normalizeText(request.requester_user_id) || null;
  const canCancel = (
    requesterUserId === context.viewerUserId
    || context.isOwner
    || context.canOperateAcrossChannels
  );

  if (!canCancel) {
    return buildActionResult({
      action: "cancel_request",
      status: "blocked",
      reason: "not_requester",
      message: "Only the requester, channel owner, or an operator can cancel this audience request.",
      actorScope: context.actorScope,
      requiredScope: "requester_or_owner_or_operator",
      channelUserId: request.channel_user_id,
      viewerUserId: context.viewerUserId,
      targetUserId: requesterUserId,
      requestId: Number(request.id ?? 0),
      requestKind,
      requestStatus,
    });
  }

  if (requestStatus !== "pending") {
    return buildActionResult({
      action: "cancel_request",
      status: "noop",
      reason: "request_not_pending",
      message: "Only pending audience requests can be canceled.",
      actorScope: context.actorScope,
      requiredScope: "requester_or_owner_or_operator",
      channelUserId: request.channel_user_id,
      viewerUserId: context.viewerUserId,
      targetUserId: requesterUserId,
      requestId: Number(request.id ?? 0),
      requestKind,
      requestStatus,
    });
  }

  const { error } = await supabase
    .from(CHANNEL_AUDIENCE_REQUESTS_TABLE)
    .delete()
    .eq("id", Number(request.id ?? 0));

  if (error) {
    return buildActionResult({
      action: "cancel_request",
      status: "error",
      reason: "delete_failed",
      message: String(error.message ?? "Unable to cancel this audience request right now."),
      actorScope: context.actorScope,
      requiredScope: "requester_or_owner_or_operator",
      channelUserId: request.channel_user_id,
      viewerUserId: context.viewerUserId,
      targetUserId: requesterUserId,
      requestId: Number(request.id ?? 0),
      requestKind,
      requestStatus,
    });
  }

  return buildActionResult({
    action: "cancel_request",
    status: "completed",
    reason: "allowed",
    message: "Audience request canceled.",
    actorScope: context.actorScope,
    requiredScope: "requester_or_owner_or_operator",
    channelUserId: request.channel_user_id,
    viewerUserId: context.viewerUserId,
    targetUserId: requesterUserId,
    requestId: Number(request.id ?? 0),
    requestKind,
    requestStatus: "canceled",
  });
}

async function reviewChannelAudienceRequest(
  action: "approve_request" | "decline_request",
  requestId: number,
  nextStatus: Extract<ChannelAudienceRequestStatus, "approved" | "declined">,
): Promise<ChannelAudienceActionResult> {
  const request = await readRequestRowById(requestId);
  const context = await readAudienceActorContext(request?.channel_user_id ?? "");
  const normalizedRequestId = Number.isFinite(requestId) ? Math.floor(requestId) : 0;

  if (!context.viewerUserId) {
    return buildActionResult({
      action,
      status: "blocked",
      reason: "signed_out",
      message: "Sign in is required before reviewing an audience request.",
      actorScope: context.actorScope,
      requiredScope: "owner_or_operator",
      channelUserId: request?.channel_user_id ?? null,
      viewerUserId: context.viewerUserId,
      requestId: normalizedRequestId || null,
      requestKind: normalizeRequestKind(request?.request_kind),
      requestStatus: normalizeRequestStatus(request?.status),
    });
  }

  if (!request) {
    return buildActionResult({
      action,
      status: "noop",
      reason: "request_not_found",
      message: "Audience request not found.",
      actorScope: context.actorScope,
      requiredScope: "owner_or_operator",
      viewerUserId: context.viewerUserId,
      requestId: normalizedRequestId || null,
    });
  }

  const requestStatus = normalizeRequestStatus(request.status);
  const requestKind = normalizeRequestKind(request.request_kind);
  const requesterUserId = normalizeText(request.requester_user_id) || null;

  if (!context.isOwner && !context.canOperateAcrossChannels) {
    return buildActionResult({
      action,
      status: "blocked",
      reason: "not_owner_or_operator",
      message: "Only the channel owner or an operator can review this audience request.",
      actorScope: context.actorScope,
      requiredScope: "owner_or_operator",
      channelUserId: request.channel_user_id,
      viewerUserId: context.viewerUserId,
      targetUserId: requesterUserId,
      requestId: Number(request.id ?? 0),
      requestKind,
      requestStatus,
    });
  }

  if (requestStatus !== "pending") {
    return buildActionResult({
      action,
      status: "noop",
      reason: "request_not_pending",
      message: "Only pending audience requests can be reviewed.",
      actorScope: context.actorScope,
      requiredScope: "owner_or_operator",
      channelUserId: request.channel_user_id,
      viewerUserId: context.viewerUserId,
      targetUserId: requesterUserId,
      requestId: Number(request.id ?? 0),
      requestKind,
      requestStatus,
    });
  }

  if (action === "approve_request" && requestKind === "subscriber_access") {
    return buildActionResult({
      action,
      status: "unsupported",
      reason: "subscriber_mutation_unsupported",
      message:
        "Approving subscriber-access requests stays unsupported in this helper foundation pass because creator/channel subscriber mutation truth is still operator, billing-sync, or manual-backfill driven.",
      actorScope: context.actorScope,
      requiredScope: "unsupported",
      channelUserId: request.channel_user_id,
      viewerUserId: context.viewerUserId,
      targetUserId: requesterUserId,
      requestId: Number(request.id ?? 0),
      requestKind,
      requestStatus,
    });
  }

  if (action === "approve_request" && requestKind === "follow" && requesterUserId) {
    const existingFollower = await readFollowerRow(request.channel_user_id, requesterUserId);

    if (!existingFollower) {
      const followerPayload: ChannelFollowerInsert = {
        channel_user_id: request.channel_user_id,
        follower_user_id: requesterUserId,
        updated_at: new Date().toISOString(),
      };
      const { error: followerInsertError } = await supabase.from(CHANNEL_FOLLOWERS_TABLE).insert(followerPayload);

      if (followerInsertError) {
        return buildActionResult({
          action,
          status: "error",
          reason: "insert_failed",
          message: String(followerInsertError.message ?? "Unable to approve this follow request right now."),
          actorScope: context.actorScope,
          requiredScope: "owner_or_operator",
          channelUserId: request.channel_user_id,
          viewerUserId: context.viewerUserId,
          targetUserId: requesterUserId,
          requestId: Number(request.id ?? 0),
          requestKind,
          requestStatus,
        });
      }
    }
  }

  const payload: ChannelAudienceRequestUpdate = {
    status: nextStatus,
    reviewed_at: new Date().toISOString(),
    reviewed_by: context.viewerUserId,
    updated_at: new Date().toISOString(),
  };
  const { data, error } = await supabase
    .from(CHANNEL_AUDIENCE_REQUESTS_TABLE)
    .update(payload)
    .eq("id", Number(request.id ?? 0))
    .select("*")
    .returns<ChannelAudienceRequestRow>()
    .single();
  const reviewedRequestId = Number(((data as { id?: number } | null)?.id) ?? 0);

  if (error || !data) {
    return buildActionResult({
      action,
      status: "error",
      reason: "update_failed",
      message: String(error?.message ?? "Unable to review this audience request right now."),
      actorScope: context.actorScope,
      requiredScope: "owner_or_operator",
      channelUserId: request.channel_user_id,
      viewerUserId: context.viewerUserId,
      targetUserId: requesterUserId,
      requestId: Number(request.id ?? 0),
      requestKind,
      requestStatus,
    });
  }

  return buildActionResult({
    action,
    status: "completed",
    reason: "allowed",
    message: nextStatus === "approved" ? "Audience request approved." : "Audience request declined.",
    actorScope: context.actorScope,
    requiredScope: "owner_or_operator",
    channelUserId: request.channel_user_id,
    viewerUserId: context.viewerUserId,
    targetUserId: requesterUserId,
    requestId: reviewedRequestId || Number(request.id ?? 0) || null,
    requestKind,
    requestStatus: nextStatus,
  });
}

export async function approveChannelAudienceRequest(requestId: number) {
  return reviewChannelAudienceRequest("approve_request", requestId, "approved");
}

export async function declineChannelAudienceRequest(requestId: number) {
  return reviewChannelAudienceRequest("decline_request", requestId, "declined");
}

export async function blockChannelAudienceMember(input: {
  channelUserId: string;
  blockedUserId: string;
  reason?: string | null;
}): Promise<ChannelAudienceActionResult> {
  const context = await readAudienceActorContext(input.channelUserId);
  const blockedUserId = normalizeText(input.blockedUserId) || null;

  if (!context.channelUserId) {
    return buildActionResult({
      action: "block",
      status: "blocked",
      reason: "missing_channel_user_id",
      message: "Audience blocking requires a channel user id.",
      actorScope: context.actorScope,
      requiredScope: "owner_or_operator",
      channelUserId: context.channelUserId,
      viewerUserId: context.viewerUserId,
      targetUserId: blockedUserId,
    });
  }

  if (!blockedUserId) {
    return buildActionResult({
      action: "block",
      status: "blocked",
      reason: "missing_target_user_id",
      message: "Audience blocking requires a target user id.",
      actorScope: context.actorScope,
      requiredScope: "owner_or_operator",
      channelUserId: context.channelUserId,
      viewerUserId: context.viewerUserId,
    });
  }

  if (!context.viewerUserId) {
    return buildActionResult({
      action: "block",
      status: "blocked",
      reason: "signed_out",
      message: "Sign in is required before blocking an audience member.",
      actorScope: context.actorScope,
      requiredScope: "owner_or_operator",
      channelUserId: context.channelUserId,
      viewerUserId: context.viewerUserId,
      targetUserId: blockedUserId,
    });
  }

  if (blockedUserId === context.channelUserId) {
    return buildActionResult({
      action: "block",
      status: "blocked",
      reason: "self_target",
      message: "A channel cannot block itself.",
      actorScope: context.actorScope,
      requiredScope: "owner_or_operator",
      channelUserId: context.channelUserId,
      viewerUserId: context.viewerUserId,
      targetUserId: blockedUserId,
    });
  }

  if (!context.isOwner && !context.canOperateAcrossChannels) {
    return buildActionResult({
      action: "block",
      status: "blocked",
      reason: "not_owner_or_operator",
      message: "Only the channel owner or an operator can block an audience member.",
      actorScope: context.actorScope,
      requiredScope: "owner_or_operator",
      channelUserId: context.channelUserId,
      viewerUserId: context.viewerUserId,
      targetUserId: blockedUserId,
    });
  }

  const existing = await readBlockRow(context.channelUserId, blockedUserId);
  if (existing) {
    return buildActionResult({
      action: "block",
      status: "noop",
      reason: "already_blocked",
      message: "This audience member is already blocked for the channel.",
      actorScope: context.actorScope,
      requiredScope: "owner_or_operator",
      channelUserId: context.channelUserId,
      viewerUserId: context.viewerUserId,
      targetUserId: blockedUserId,
    });
  }

  const payload: ChannelAudienceBlockInsert = {
    channel_user_id: context.channelUserId,
    blocked_user_id: blockedUserId,
    blocked_by_user_id: context.viewerUserId,
    reason: normalizeText(input.reason) || null,
    updated_at: new Date().toISOString(),
  };
  const { error } = await supabase.from(CHANNEL_AUDIENCE_BLOCKS_TABLE).insert(payload);

  if (error) {
    return buildActionResult({
      action: "block",
      status: "error",
      reason: "insert_failed",
      message: String(error.message ?? "Unable to block this audience member right now."),
      actorScope: context.actorScope,
      requiredScope: "owner_or_operator",
      channelUserId: context.channelUserId,
      viewerUserId: context.viewerUserId,
      targetUserId: blockedUserId,
    });
  }

  return buildActionResult({
    action: "block",
    status: "completed",
    reason: "allowed",
    message: "Audience member blocked.",
    actorScope: context.actorScope,
    requiredScope: "owner_or_operator",
    channelUserId: context.channelUserId,
    viewerUserId: context.viewerUserId,
    targetUserId: blockedUserId,
  });
}

export async function unblockChannelAudienceMember(input: {
  channelUserId: string;
  blockedUserId: string;
}): Promise<ChannelAudienceActionResult> {
  const context = await readAudienceActorContext(input.channelUserId);
  const blockedUserId = normalizeText(input.blockedUserId) || null;

  if (!context.channelUserId) {
    return buildActionResult({
      action: "unblock",
      status: "blocked",
      reason: "missing_channel_user_id",
      message: "Audience unblocking requires a channel user id.",
      actorScope: context.actorScope,
      requiredScope: "owner_or_operator",
      channelUserId: context.channelUserId,
      viewerUserId: context.viewerUserId,
      targetUserId: blockedUserId,
    });
  }

  if (!blockedUserId) {
    return buildActionResult({
      action: "unblock",
      status: "blocked",
      reason: "missing_target_user_id",
      message: "Audience unblocking requires a target user id.",
      actorScope: context.actorScope,
      requiredScope: "owner_or_operator",
      channelUserId: context.channelUserId,
      viewerUserId: context.viewerUserId,
    });
  }

  if (!context.viewerUserId) {
    return buildActionResult({
      action: "unblock",
      status: "blocked",
      reason: "signed_out",
      message: "Sign in is required before unblocking an audience member.",
      actorScope: context.actorScope,
      requiredScope: "owner_or_operator",
      channelUserId: context.channelUserId,
      viewerUserId: context.viewerUserId,
      targetUserId: blockedUserId,
    });
  }

  if (!context.isOwner && !context.canOperateAcrossChannels) {
    return buildActionResult({
      action: "unblock",
      status: "blocked",
      reason: "not_owner_or_operator",
      message: "Only the channel owner or an operator can unblock an audience member.",
      actorScope: context.actorScope,
      requiredScope: "owner_or_operator",
      channelUserId: context.channelUserId,
      viewerUserId: context.viewerUserId,
      targetUserId: blockedUserId,
    });
  }

  const existing = await readBlockRow(context.channelUserId, blockedUserId);
  if (!existing) {
    return buildActionResult({
      action: "unblock",
      status: "noop",
      reason: "not_blocked",
      message: "This audience member is not currently blocked.",
      actorScope: context.actorScope,
      requiredScope: "owner_or_operator",
      channelUserId: context.channelUserId,
      viewerUserId: context.viewerUserId,
      targetUserId: blockedUserId,
    });
  }

  const { error } = await supabase
    .from(CHANNEL_AUDIENCE_BLOCKS_TABLE)
    .delete()
    .eq("channel_user_id", context.channelUserId)
    .eq("blocked_user_id", blockedUserId);

  if (error) {
    return buildActionResult({
      action: "unblock",
      status: "error",
      reason: "delete_failed",
      message: String(error.message ?? "Unable to unblock this audience member right now."),
      actorScope: context.actorScope,
      requiredScope: "owner_or_operator",
      channelUserId: context.channelUserId,
      viewerUserId: context.viewerUserId,
      targetUserId: blockedUserId,
    });
  }

  return buildActionResult({
    action: "unblock",
    status: "completed",
    reason: "allowed",
    message: "Audience member unblocked.",
    actorScope: context.actorScope,
    requiredScope: "owner_or_operator",
    channelUserId: context.channelUserId,
    viewerUserId: context.viewerUserId,
    targetUserId: blockedUserId,
  });
}

export function getChannelSubscriberRelationshipActionSupport(): ChannelSubscriberRelationshipActionSupport {
  return {
    action: "subscriber_relationship_mutation",
    supported: false,
    requiredScope: "unsupported",
    reason: "subscriber_mutation_unsupported",
    message:
      "Creator/channel subscriber relationship mutation stays unsupported in this helper foundation pass because current truth is still operator, billing-sync, or manual-backfill driven rather than a creator-side workflow.",
  };
}
