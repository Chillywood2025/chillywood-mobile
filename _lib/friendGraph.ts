import type { Tables } from "../supabase/database.types";

import { isOfficialPlatformAccountUserId } from "./officialAccounts";
import { supabase } from "./supabase";
import {
  buildUserChannelProfile,
  readUserProfileByUserId,
  type UserChannelProfile,
} from "./userData";

export const USER_FRIENDSHIPS_TABLE = "user_friendships";
export const CHANNEL_AUDIENCE_BLOCKS_TABLE = "channel_audience_blocks";

export type FriendRelationshipStatus = "pending" | "active" | "declined" | "canceled" | "removed";
export type FriendRelationshipAvailability = "available" | "signed_out" | "self" | "official_platform" | "blocked";
export type FriendPendingDirection = "incoming" | "outgoing";

export type FriendRelationshipRecord = {
  userLowId: string;
  userHighId: string;
  requestedByUserId: string;
  status: FriendRelationshipStatus;
  createdAt: string;
  respondedAt?: string;
  actionedByUserId?: string;
  updatedAt: string;
};

export type FriendRelationshipState = {
  viewerUserId: string | null;
  otherUserId: string;
  availability: FriendRelationshipAvailability;
  status: FriendRelationshipStatus | "none";
  pendingDirection: FriendPendingDirection | null;
  isFriend: boolean;
  canRequest: boolean;
  canAccept: boolean;
  canDecline: boolean;
  canCancel: boolean;
  canRemove: boolean;
  relationship: FriendRelationshipRecord | null;
};

export type FriendListSummaryItem = Pick<
  UserChannelProfile,
  "id" | "displayName" | "avatarUrl" | "tagline" | "role" | "identityKind" | "officialBadgeLabel" | "handle"
> & {
  friendshipUpdatedAt: string;
  friendshipStatus: "active";
};

export type FriendListSummary = {
  viewerUserId: string;
  generatedAt: string;
  activeCount: number;
  incomingRequestCount: number;
  outgoingRequestCount: number;
  items: FriendListSummaryItem[];
};

export type ChillyCircleListItem = Pick<
  UserChannelProfile,
  "id" | "displayName" | "avatarUrl" | "tagline" | "role" | "identityKind" | "officialBadgeLabel" | "handle"
> & {
  relationshipStatus: FriendRelationshipStatus;
  pendingDirection: FriendPendingDirection | null;
  requestedByUserId: string;
  relationshipUpdatedAt: string;
};

type FriendRelationshipRow = Pick<
  Tables<"user_friendships">,
  | "user_low_id"
  | "user_high_id"
  | "requested_by_user_id"
  | "status"
  | "created_at"
  | "responded_at"
  | "actioned_by_user_id"
  | "updated_at"
>;
type ChannelAudienceBlockRow = Pick<Tables<"channel_audience_blocks">, "channel_user_id" | "blocked_user_id">;

const FRIEND_RELATIONSHIP_SELECT =
  "user_low_id,user_high_id,requested_by_user_id,status,created_at,responded_at,actioned_by_user_id,updated_at";
const DEFAULT_FRIEND_LIST_LIMIT = 24;

const toText = (value: unknown) => String(value ?? "").trim();

const unwrapMaybeSingle = <T>(value: T | T[] | null): T | null => {
  if (Array.isArray(value)) return value[0] ?? null;
  return value ?? null;
};

const normalizeFriendshipStatus = (value: unknown): FriendRelationshipStatus | null => {
  const normalized = toText(value).toLowerCase();
  if (
    normalized === "pending"
    || normalized === "active"
    || normalized === "declined"
    || normalized === "canceled"
    || normalized === "removed"
  ) {
    return normalized;
  }
  return null;
};

const buildFriendPair = (leftUserId: string, rightUserId: string) => {
  const normalizedLeft = toText(leftUserId);
  const normalizedRight = toText(rightUserId);
  return normalizedLeft < normalizedRight
    ? { userLowId: normalizedLeft, userHighId: normalizedRight }
    : { userLowId: normalizedRight, userHighId: normalizedLeft };
};

async function getSignedInFriendUserId() {
  const { data } = await supabase.auth.getSession();
  return toText(data.session?.user?.id) || null;
}

function parseFriendRelationshipRow(row: FriendRelationshipRow | null | undefined): FriendRelationshipRecord | null {
  if (!row) return null;

  const userLowId = toText(row.user_low_id);
  const userHighId = toText(row.user_high_id);
  const requestedByUserId = toText(row.requested_by_user_id);
  const status = normalizeFriendshipStatus(row.status);
  if (!userLowId || !userHighId || !requestedByUserId || !status) return null;

  return {
    userLowId,
    userHighId,
    requestedByUserId,
    status,
    createdAt: toText(row.created_at) || new Date().toISOString(),
    respondedAt: toText(row.responded_at) || undefined,
    actionedByUserId: toText(row.actioned_by_user_id) || undefined,
    updatedAt: toText(row.updated_at) || new Date().toISOString(),
  };
}

async function readFriendRelationshipRow(
  viewerUserId: string,
  otherUserId: string,
): Promise<FriendRelationshipRecord | null> {
  const { userLowId, userHighId } = buildFriendPair(viewerUserId, otherUserId);
  const { data, error } = await supabase
    .from(USER_FRIENDSHIPS_TABLE)
    .select(FRIEND_RELATIONSHIP_SELECT)
    .eq("user_low_id", userLowId)
    .eq("user_high_id", userHighId)
    .returns<FriendRelationshipRow>()
    .maybeSingle();

  if (error) throw error;

  return parseFriendRelationshipRow(data);
}

async function readChillyCircleBlockOverride(
  viewerUserId: string,
  otherUserId: string,
): Promise<boolean> {
  const normalizedViewerUserId = toText(viewerUserId);
  const normalizedOtherUserId = toText(otherUserId);
  if (!normalizedViewerUserId || !normalizedOtherUserId || normalizedViewerUserId === normalizedOtherUserId) return false;

  const [
    { data: blockedByOther, error: blockedByOtherError },
    { data: blockedByViewer, error: blockedByViewerError },
  ] = await Promise.all([
    supabase
      .from(CHANNEL_AUDIENCE_BLOCKS_TABLE)
      .select("channel_user_id,blocked_user_id")
      .eq("channel_user_id", normalizedOtherUserId)
      .eq("blocked_user_id", normalizedViewerUserId)
      .returns<ChannelAudienceBlockRow>()
      .maybeSingle(),
    supabase
      .from(CHANNEL_AUDIENCE_BLOCKS_TABLE)
      .select("channel_user_id,blocked_user_id")
      .eq("channel_user_id", normalizedViewerUserId)
      .eq("blocked_user_id", normalizedOtherUserId)
      .returns<ChannelAudienceBlockRow>()
      .maybeSingle(),
  ]);

  if (blockedByOtherError || blockedByViewerError) return false;
  return !!blockedByOther || !!blockedByViewer;
}

function buildFriendRelationshipState(options: {
  viewerUserId: string | null;
  otherUserId: string;
  availability: FriendRelationshipAvailability;
  relationship: FriendRelationshipRecord | null;
}): FriendRelationshipState {
  const relationship = options.relationship;
  const status = relationship?.status ?? "none";
  const pendingDirection = relationship?.status === "pending"
    ? relationship.requestedByUserId === options.viewerUserId
      ? "outgoing"
      : "incoming"
    : null;
  const isAvailable = options.availability === "available";

  return {
    viewerUserId: options.viewerUserId,
    otherUserId: options.otherUserId,
    availability: options.availability,
    status,
    pendingDirection,
    isFriend: isAvailable && status === "active",
    canRequest: isAvailable && (status === "none" || status === "declined" || status === "canceled" || status === "removed"),
    canAccept: isAvailable && status === "pending" && pendingDirection === "incoming",
    canDecline: isAvailable && status === "pending" && pendingDirection === "incoming",
    canCancel: isAvailable && status === "pending" && pendingDirection === "outgoing",
    canRemove: isAvailable && status === "active",
    relationship,
  };
}

function getFriendRelationshipAvailability(viewerUserId: string | null, otherUserId: string): FriendRelationshipAvailability {
  if (!viewerUserId) return "signed_out";
  if (viewerUserId === otherUserId) return "self";
  if (isOfficialPlatformAccountUserId(otherUserId)) return "official_platform";
  return "available";
}

function assertFriendTargetAllowed(otherUserId: string) {
  const normalizedOtherUserId = toText(otherUserId);
  if (!normalizedOtherUserId) {
    throw new Error("Chi'lly Circle target user id is required.");
  }
  if (isOfficialPlatformAccountUserId(normalizedOtherUserId)) {
    throw new Error("Official platform accounts are not part of Chi'lly Circle.");
  }
  return normalizedOtherUserId;
}

async function mutateFriendRelationship(otherUserId: string, action: "accept" | "decline" | "cancel" | "remove") {
  const viewerUserId = await getSignedInFriendUserId();
  if (!viewerUserId) {
    throw new Error("Chi'lly Circle requires a signed-in user.");
  }

  const normalizedOtherUserId = assertFriendTargetAllowed(otherUserId);
  if (normalizedOtherUserId === viewerUserId) {
    throw new Error("You cannot update Chi'lly Circle with yourself.");
  }
  if (await readChillyCircleBlockOverride(viewerUserId, normalizedOtherUserId)) {
    throw new Error("Chi'lly Circle is unavailable while a channel audience block exists between these accounts.");
  }

  const { data, error } = await supabase.rpc("respond_to_friendship", {
    next_action: action,
    target_user_id: normalizedOtherUserId,
  });

  if (error) throw error;

  const relationship = parseFriendRelationshipRow(unwrapMaybeSingle(data as FriendRelationshipRow | FriendRelationshipRow[] | null));
  return buildFriendRelationshipState({
    viewerUserId,
    otherUserId: normalizedOtherUserId,
    availability: "available",
    relationship,
  });
}

async function buildFriendListItem(
  otherUserId: string,
  relationship: FriendRelationshipRecord,
): Promise<FriendListSummaryItem> {
  const profile = await readUserProfileByUserId(otherUserId).catch(() => null);
  const channelProfile = buildUserChannelProfile({
    id: otherUserId,
    profile,
    fallbackDisplayName: "Chi'lly Circle",
  });

  return {
    id: channelProfile.id,
    displayName: channelProfile.displayName,
    avatarUrl: channelProfile.avatarUrl,
    tagline: channelProfile.tagline,
    role: channelProfile.role,
    identityKind: channelProfile.identityKind,
    officialBadgeLabel: channelProfile.officialBadgeLabel,
    handle: channelProfile.handle,
    friendshipUpdatedAt: relationship.updatedAt,
    friendshipStatus: "active",
  };
}

function getRelationshipOtherUserId(viewerUserId: string, relationship: FriendRelationshipRecord) {
  return relationship.userLowId === viewerUserId ? relationship.userHighId : relationship.userLowId;
}

async function filterUnblockedRelationships(
  viewerUserId: string,
  relationships: FriendRelationshipRecord[],
): Promise<FriendRelationshipRecord[]> {
  const checks = await Promise.all(relationships.map(async (relationship) => {
    const otherUserId = getRelationshipOtherUserId(viewerUserId, relationship);
    const blocked = await readChillyCircleBlockOverride(viewerUserId, otherUserId);
    return blocked ? null : relationship;
  }));

  return checks.filter((relationship): relationship is FriendRelationshipRecord => !!relationship);
}

async function buildChillyCircleListItem(
  viewerUserId: string,
  relationship: FriendRelationshipRecord,
): Promise<ChillyCircleListItem> {
  const otherUserId = relationship.userLowId === viewerUserId ? relationship.userHighId : relationship.userLowId;
  const profile = await readUserProfileByUserId(otherUserId).catch(() => null);
  const channelProfile = buildUserChannelProfile({
    id: otherUserId,
    profile,
    fallbackDisplayName: "Chi'lly Circle",
  });
  const pendingDirection = relationship.status === "pending"
    ? relationship.requestedByUserId === viewerUserId
      ? "outgoing"
      : "incoming"
    : null;

  return {
    id: channelProfile.id,
    displayName: channelProfile.displayName,
    avatarUrl: channelProfile.avatarUrl,
    tagline: channelProfile.tagline,
    role: channelProfile.role,
    identityKind: channelProfile.identityKind,
    officialBadgeLabel: channelProfile.officialBadgeLabel,
    handle: channelProfile.handle,
    relationshipStatus: relationship.status,
    pendingDirection,
    requestedByUserId: relationship.requestedByUserId,
    relationshipUpdatedAt: relationship.updatedAt,
  };
}

async function readCurrentUserRelationships(): Promise<{
  viewerUserId: string;
  relationships: FriendRelationshipRecord[];
}> {
  const viewerUserId = await getSignedInFriendUserId();
  if (!viewerUserId) {
    throw new Error("Chi'lly Circle requires a signed-in user.");
  }

  const [
    { data: lowRows, error: lowError },
    { data: highRows, error: highError },
  ] = await Promise.all([
    supabase
      .from(USER_FRIENDSHIPS_TABLE)
      .select(FRIEND_RELATIONSHIP_SELECT)
      .eq("user_low_id", viewerUserId)
      .order("updated_at", { ascending: false })
      .returns<FriendRelationshipRow[]>(),
    supabase
      .from(USER_FRIENDSHIPS_TABLE)
      .select(FRIEND_RELATIONSHIP_SELECT)
      .eq("user_high_id", viewerUserId)
      .order("updated_at", { ascending: false })
      .returns<FriendRelationshipRow[]>(),
  ]);

  if (lowError) throw lowError;
  if (highError) throw highError;

  const relationshipMap = new Map<string, FriendRelationshipRecord>();
  for (const row of [...(lowRows ?? []), ...(highRows ?? [])]) {
    const relationship = parseFriendRelationshipRow(row);
    if (!relationship) continue;
    relationshipMap.set(`${relationship.userLowId}::${relationship.userHighId}`, relationship);
  }

  return {
    viewerUserId,
    relationships: [...relationshipMap.values()].sort((left, right) => right.updatedAt.localeCompare(left.updatedAt)),
  };
}

export async function readFriendRelationshipState(otherUserId: string): Promise<FriendRelationshipState> {
  const normalizedOtherUserId = toText(otherUserId);
  if (!normalizedOtherUserId) {
    throw new Error("Chi'lly Circle target user id is required.");
  }

  const viewerUserId = await getSignedInFriendUserId();
  return getChillyCircleStatus(viewerUserId, normalizedOtherUserId);
}

export async function getChillyCircleStatus(
  viewerUserId: string | null,
  profileUserId: string,
): Promise<FriendRelationshipState> {
  const normalizedOtherUserId = toText(profileUserId);
  if (!normalizedOtherUserId) {
    throw new Error("Chi'lly Circle target user id is required.");
  }

  const normalizedViewerUserId = toText(viewerUserId) || null;
  let availability = getFriendRelationshipAvailability(normalizedViewerUserId, normalizedOtherUserId);

  if (availability === "available" && normalizedViewerUserId) {
    const isBlocked = await readChillyCircleBlockOverride(normalizedViewerUserId, normalizedOtherUserId);
    if (isBlocked) availability = "blocked";
  }

  if (availability !== "available" || !normalizedViewerUserId) {
    return buildFriendRelationshipState({
      viewerUserId: normalizedViewerUserId,
      otherUserId: normalizedOtherUserId,
      availability,
      relationship: null,
    });
  }

  const relationship = await readFriendRelationshipRow(normalizedViewerUserId, normalizedOtherUserId);
  return buildFriendRelationshipState({
    viewerUserId: normalizedViewerUserId,
    otherUserId: normalizedOtherUserId,
    availability,
    relationship,
  });
}

export async function sendFriendRequest(otherUserId: string): Promise<FriendRelationshipState> {
  const viewerUserId = await getSignedInFriendUserId();
  if (!viewerUserId) {
    throw new Error("Chi'lly Circle requires a signed-in user.");
  }

  const normalizedOtherUserId = assertFriendTargetAllowed(otherUserId);
  if (normalizedOtherUserId === viewerUserId) {
    throw new Error("You cannot request yourself.");
  }
  if (await readChillyCircleBlockOverride(viewerUserId, normalizedOtherUserId)) {
    throw new Error("Chi'lly Circle is unavailable while a channel audience block exists between these accounts.");
  }

  const { data, error } = await supabase.rpc("request_friendship", {
    target_user_id: normalizedOtherUserId,
  });

  if (error) throw error;

  const relationship = parseFriendRelationshipRow(unwrapMaybeSingle(data as FriendRelationshipRow | FriendRelationshipRow[] | null));
  return buildFriendRelationshipState({
    viewerUserId,
    otherUserId: normalizedOtherUserId,
    availability: "available",
    relationship,
  });
}

export async function acceptFriendRequest(otherUserId: string) {
  return mutateFriendRelationship(otherUserId, "accept");
}

export async function declineFriendRequest(otherUserId: string) {
  return mutateFriendRelationship(otherUserId, "decline");
}

export async function cancelFriendRequest(otherUserId: string) {
  return mutateFriendRelationship(otherUserId, "cancel");
}

export async function removeFriend(otherUserId: string) {
  return mutateFriendRelationship(otherUserId, "remove");
}

export async function sendChillyCircleRequest(profileUserId: string) {
  return sendFriendRequest(profileUserId);
}

export async function acceptChillyCircleRequest(profileUserId: string) {
  return acceptFriendRequest(profileUserId);
}

export async function declineChillyCircleRequest(profileUserId: string) {
  return declineFriendRequest(profileUserId);
}

export async function cancelChillyCircleRequest(profileUserId: string) {
  return cancelFriendRequest(profileUserId);
}

export async function removeFromChillyCircle(profileUserId: string) {
  return removeFriend(profileUserId);
}

export async function isInChillyCircle(viewerUserId: string, ownerId: string): Promise<boolean> {
  const state = await getChillyCircleStatus(viewerUserId, ownerId);
  return state.isFriend;
}

export async function listMyChillyCircle(options?: { limit?: number }): Promise<ChillyCircleListItem[]> {
  const { viewerUserId, relationships } = await readCurrentUserRelationships();
  const limit = Math.max(1, Math.min(100, Math.floor(Number(options?.limit ?? DEFAULT_FRIEND_LIST_LIMIT)) || DEFAULT_FRIEND_LIST_LIMIT));
  const activeRelationships = relationships.filter((relationship) => relationship.status === "active");
  const unblockedRelationships = await filterUnblockedRelationships(viewerUserId, activeRelationships);

  return Promise.all(unblockedRelationships.slice(0, limit).map((relationship) => (
    buildChillyCircleListItem(viewerUserId, relationship)
  )));
}

export async function listIncomingChillyCircleRequests(options?: { limit?: number }): Promise<ChillyCircleListItem[]> {
  const { viewerUserId, relationships } = await readCurrentUserRelationships();
  const limit = Math.max(1, Math.min(100, Math.floor(Number(options?.limit ?? DEFAULT_FRIEND_LIST_LIMIT)) || DEFAULT_FRIEND_LIST_LIMIT));
  const unblockedRelationships = await filterUnblockedRelationships(viewerUserId, relationships);
  const incoming = unblockedRelationships.filter((relationship) => (
    relationship.status === "pending" && relationship.requestedByUserId !== viewerUserId
  ));

  return Promise.all(incoming.slice(0, limit).map((relationship) => (
    buildChillyCircleListItem(viewerUserId, relationship)
  )));
}

export async function listOutgoingChillyCircleRequests(options?: { limit?: number }): Promise<ChillyCircleListItem[]> {
  const { viewerUserId, relationships } = await readCurrentUserRelationships();
  const limit = Math.max(1, Math.min(100, Math.floor(Number(options?.limit ?? DEFAULT_FRIEND_LIST_LIMIT)) || DEFAULT_FRIEND_LIST_LIMIT));
  const unblockedRelationships = await filterUnblockedRelationships(viewerUserId, relationships);
  const outgoing = unblockedRelationships.filter((relationship) => (
    relationship.status === "pending" && relationship.requestedByUserId === viewerUserId
  ));

  return Promise.all(outgoing.slice(0, limit).map((relationship) => (
    buildChillyCircleListItem(viewerUserId, relationship)
  )));
}

export async function readFriendListSummary(options?: {
  limit?: number;
}): Promise<FriendListSummary> {
  const { viewerUserId, relationships } = await readCurrentUserRelationships();
  const limit = Math.max(1, Math.min(100, Math.floor(Number(options?.limit ?? DEFAULT_FRIEND_LIST_LIMIT)) || DEFAULT_FRIEND_LIST_LIMIT));
  const unblockedRelationships = await filterUnblockedRelationships(viewerUserId, relationships);
  const activeRelationships = unblockedRelationships.filter((relationship) => relationship.status === "active");
  const incomingRequestCount = unblockedRelationships.filter((relationship) => (
    relationship.status === "pending" && relationship.requestedByUserId !== viewerUserId
  )).length;
  const outgoingRequestCount = unblockedRelationships.filter((relationship) => (
    relationship.status === "pending" && relationship.requestedByUserId === viewerUserId
  )).length;

  const items = await Promise.all(
    activeRelationships.slice(0, limit).map((relationship) => {
      const otherUserId = getRelationshipOtherUserId(viewerUserId, relationship);
      return buildFriendListItem(otherUserId, relationship);
    }),
  );

  return {
    viewerUserId,
    generatedAt: new Date().toISOString(),
    activeCount: activeRelationships.length,
    incomingRequestCount,
    outgoingRequestCount,
    items,
  };
}

export async function readActiveFriendUserIds(): Promise<string[]> {
  const viewerUserId = await getSignedInFriendUserId();
  if (!viewerUserId) {
    return [];
  }

  const [
    { data: lowRows, error: lowError },
    { data: highRows, error: highError },
  ] = await Promise.all([
    supabase
      .from(USER_FRIENDSHIPS_TABLE)
      .select(FRIEND_RELATIONSHIP_SELECT)
      .eq("user_low_id", viewerUserId)
      .eq("status", "active")
      .returns<FriendRelationshipRow[]>(),
    supabase
      .from(USER_FRIENDSHIPS_TABLE)
      .select(FRIEND_RELATIONSHIP_SELECT)
      .eq("user_high_id", viewerUserId)
      .eq("status", "active")
      .returns<FriendRelationshipRow[]>(),
  ]);

  if (lowError) throw lowError;
  if (highError) throw highError;

  const friendUserIds = new Set<string>();
  for (const row of [...(lowRows ?? []), ...(highRows ?? [])]) {
    const relationship = parseFriendRelationshipRow(row);
    if (!relationship || relationship.status !== "active") continue;
    const otherUserId = relationship.userLowId === viewerUserId
      ? relationship.userHighId
      : relationship.userLowId;
    if (otherUserId && !(await readChillyCircleBlockOverride(viewerUserId, otherUserId))) {
      friendUserIds.add(otherUserId);
    }
  }

  return [...friendUserIds];
}
