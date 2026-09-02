import type { Tables } from "../supabase/database.types";
import { readFollowedChannelUserIds } from "./channelAudience";
import { readActiveFriendUserIds } from "./friendGraph";
import { supabase } from "./supabase";

export const DISCOVERY_FEED_ITEMS_TABLE = "discovery_feed_items";
export const DISCOVERY_FEED_ITEM_BLOCKS_TABLE = "discovery_feed_item_blocks";

export const PUBLIC_SPECTATOR_SAFE_RIGHTS = [
  "creator_owned",
  "chillywood_original",
  "licensed_for_public_stream",
] as const;

export type DiscoveryFeedItem = Tables<"discovery_feed_items">;
export type DiscoveryFeedItemBlock = Tables<"discovery_feed_item_blocks">;
export type DiscoveryFeedRightsStatus = typeof PUBLIC_SPECTATOR_SAFE_RIGHTS[number];
export type DiscoveryFeedSurface = "home" | "profile" | "channel" | "home_profile_channel" | "none";
export type DiscoveryRankingReason =
  | "live_now"
  | "followed_channel"
  | "chilly_circle"
  | "recent_upload"
  | "upcoming_event"
  | "replay_ready"
  | "category_match"
  | "manual_foundation"
  | "editorial_pick"
  | "trending_lightweight";

export type PublicDiscoveryFeedReadOptions = {
  itemId?: string;
  surface?: Exclude<DiscoveryFeedSurface, "none">;
  channelUserId?: string;
  ownerUserId?: string;
  limit?: number;
};

export type DiscoveryFeedRankingSignals = {
  followedChannelIds?: string[];
  chillyCircleUserIds?: string[];
  categoryKeys?: string[];
};

export type RankedPublicDiscoveryFeedReadResult = {
  items: DiscoveryFeedItem[];
  signals: DiscoveryFeedRankingSignals;
  generatedAt: string;
  viewerSpecific: boolean;
};

export type DiscoveryFeedFoundationSummary = {
  itemCount: number | null;
  blockCount: number | null;
  publicDiscoverableCount: number | null;
  spectatorEnabledCount: number | null;
  spectatorPlaybackEnabledCount: number | null;
  generatedAt: string;
};

type CountQueryResult = {
  count: number | null;
  error: unknown;
};

type CountQuery = PromiseLike<CountQueryResult> & {
  eq: (column: string, value: string | number | boolean) => PromiseLike<CountQueryResult>;
};

const discoveryClient = supabase as unknown as {
  from: (table: string) => {
    select: (
      columns: string,
      options?: { count?: "exact"; head?: boolean },
    ) => CountQuery;
  };
};

const normalizeText = (value: unknown) => String(value ?? "").trim();
const normalizeList = (values?: string[]) => new Set((values ?? []).map(normalizeText).filter(Boolean));

const PUBLIC_READ_SURFACE_MAP: Record<Exclude<DiscoveryFeedSurface, "none">, DiscoveryFeedSurface[]> = {
  home: ["home", "home_profile_channel"],
  profile: ["profile", "home_profile_channel"],
  channel: ["channel", "home_profile_channel"],
  home_profile_channel: ["home_profile_channel"],
};

async function safeCount(loader: () => PromiseLike<CountQueryResult>) {
  try {
    const { count, error } = await loader();
    if (error) throw error;
    return count ?? 0;
  } catch {
    return null;
  }
}

export function isPublicSpectatorSafeRightsStatus(rightsStatus: string | null | undefined) {
  return PUBLIC_SPECTATOR_SAFE_RIGHTS.includes(rightsStatus as DiscoveryFeedRightsStatus);
}

export function isFeedItemPubliclyDiscoverable(item: Pick<
  DiscoveryFeedItem,
  "is_publicly_discoverable" | "visibility" | "moderation_status" | "rights_status"
>) {
  return item.is_publicly_discoverable === true
    && item.visibility === "public"
    && item.moderation_status === "clean"
    && isPublicSpectatorSafeRightsStatus(item.rights_status);
}

export function hasDiscoveryDestinationIdentity(item: Partial<Pick<
  DiscoveryFeedItem,
  "channel_user_id" | "event_id" | "host_user_id" | "id" | "item_type" | "media_id" | "owner_user_id"
>>) {
  if (!normalizeText(item.id)) return false;
  if (item.item_type === "creator_upload") return !!normalizeText(item.media_id);
  if (item.item_type === "creator_event") return !!normalizeText(item.event_id);
  if (item.item_type === "channel_update") {
    return !!normalizeText(item.channel_user_id ?? item.owner_user_id ?? item.host_user_id);
  }
  return true;
}

export function isCircleSpectatorFeedItemEligibleForRanking(item: Pick<
  DiscoveryFeedItem,
  "is_publicly_discoverable" | "visibility" | "moderation_status" | "rights_status" | "is_spectator_enabled"
> & Parameters<typeof hasDiscoveryDestinationIdentity>[0]) {
  return item.is_publicly_discoverable !== true
    && (item.visibility === "circle" || item.visibility === "chilly_circle")
    && item.moderation_status === "clean"
    && item.is_spectator_enabled === true
    && isPublicSpectatorSafeRightsStatus(item.rights_status)
    && hasDiscoveryDestinationIdentity(item);
}

export function isDiscoveryFeedItemEligibleForRanking(item: Pick<
  DiscoveryFeedItem,
  "is_publicly_discoverable" | "visibility" | "moderation_status" | "rights_status"
> & Parameters<typeof hasDiscoveryDestinationIdentity>[0]) {
  return isFeedItemPubliclyDiscoverable(item) && hasDiscoveryDestinationIdentity(item);
}

export function isSpectatorPlaybackBlocked(item: Pick<DiscoveryFeedItem, "is_spectator_playback_enabled">) {
  return item.is_spectator_playback_enabled !== true;
}

type DiscoveryPassContext = Partial<Pick<
  DiscoveryFeedItem,
  "item_type" | "source_type"
>>;

export function getDiscoveryPassLabel(item: DiscoveryPassContext) {
  if (item.item_type === "live_room") return "Live Stage Pass";
  if (item.item_type === "watch_party") return "Party Room Pass";
  if (item.item_type === "creator_event") return "Event Pass";
  if (item.source_type === "live_stage" || item.source_type === "live_stage_room") return "Live Stage Pass";
  if (item.source_type === "watch_party_room") return "Party Room Pass";
  if (item.source_type === "creator_event" || item.source_type === "event") return "Event Pass";
  return "Pass required";
}

export function getDiscoveryAccessLabel(item: Pick<
  DiscoveryFeedItem,
  "access_type" | "visibility" | "requires_premium_to_join" | "requires_ticket_to_watch" | "requires_subscription_to_watch"
> & DiscoveryPassContext) {
  if (item.requires_ticket_to_watch || item.access_type === "ticketed") return getDiscoveryPassLabel(item);
  if (item.requires_subscription_to_watch || item.access_type === "subscriber_only_later") return "Subscriber";
  if (item.requires_premium_to_join || item.access_type === "premium_only") return "Premium";
  if (item.access_type === "circle" || item.visibility === "circle" || item.visibility === "chilly_circle") return "Chi'lly Circle";
  if (item.access_type === "public_free" || item.visibility === "public") return "Public";
  if (item.access_type === "invite_only" || item.visibility === "invite_only") return "Invite Only";
  return "Private";
}

export function getDiscoveryItemDestination(item: Pick<
  DiscoveryFeedItem,
  "channel_user_id" | "event_id" | "host_user_id" | "id" | "item_type" | "media_id" | "owner_user_id"
>) {
  const mediaId = normalizeText(item.media_id);
  if (item.item_type === "creator_upload" && mediaId) {
    return `/player/${encodeURIComponent(mediaId)}?source=creator-video`;
  }

  const eventId = normalizeText(item.event_id);
  if (item.item_type === "creator_event" && eventId) {
    return `/event/${encodeURIComponent(eventId)}`;
  }

  const platformUserId = normalizeText(item.channel_user_id ?? item.owner_user_id ?? item.host_user_id);
  if (item.item_type === "channel_update" && platformUserId) {
    return `/channel/${encodeURIComponent(platformUserId)}`;
  }

  return `/spectate/${encodeURIComponent(item.id)}`;
}

export function getDiscoveryLiveLabel(item: Pick<DiscoveryFeedItem, "live_state" | "item_type">) {
  if (item.live_state === "live") return "Live";
  if (item.live_state === "scheduled") return "Upcoming";
  if (item.live_state === "ended") return "Ended";
  if (item.live_state === "replay_available_later" || item.item_type === "replay_later") return "Replay Later";
  return "Public";
}

export function getDiscoveryAdPolicyLabel(item: Pick<DiscoveryFeedItem, "ad_policy">) {
  switch (item.ad_policy) {
    case "free_with_ads":
      return "Free with ads later";
    case "premium_ad_free":
      return "Premium ad-free";
    case "no_ads":
      return "No ads";
    case "sponsor_breaks_only_later":
      return "Sponsor breaks later";
    case "ctv_ads_allowed_later":
      return "CTV ads later";
    default:
      return "Ads not allowed";
  }
}

const DISCOVERY_RANKING_REASON_LABELS: Record<DiscoveryRankingReason, string> = {
  live_now: "Live now",
  followed_channel: "From a creator you follow",
  chilly_circle: "From your Chi'lly Circle",
  recent_upload: "New upload",
  upcoming_event: "Upcoming event",
  replay_ready: "Replay ready",
  category_match: "Category match",
  manual_foundation: "Featured by Chi'llywood",
  editorial_pick: "Featured by Chi'llywood",
  trending_lightweight: "Trending now",
};

export function getDiscoveryRankingReasonLabel(reason: DiscoveryRankingReason) {
  return DISCOVERY_RANKING_REASON_LABELS[reason];
}

export function hasViewerSpecificDiscoverySignals(signals: DiscoveryFeedRankingSignals = {}) {
  return !!(
    normalizeList(signals.followedChannelIds).size
    || normalizeList(signals.chillyCircleUserIds).size
    || normalizeList(signals.categoryKeys).size
  );
}

const normalizeDiscoveryRankingReason = (value: unknown): DiscoveryRankingReason | null => {
  const normalized = normalizeText(value);
  if (
    normalized === "live_now"
    || normalized === "followed_channel"
    || normalized === "chilly_circle"
    || normalized === "recent_upload"
    || normalized === "upcoming_event"
    || normalized === "replay_ready"
    || normalized === "category_match"
    || normalized === "manual_foundation"
    || normalized === "editorial_pick"
    || normalized === "trending_lightweight"
  ) {
    return normalized;
  }
  return null;
};

const getDiscoveryActorIds = (item: Pick<DiscoveryFeedItem, "channel_user_id" | "owner_user_id" | "host_user_id">) => (
  [item.channel_user_id, item.owner_user_id, item.host_user_id].map(normalizeText).filter(Boolean)
);

const hasBackedLightweightTrendingSignal = (item: Pick<DiscoveryFeedItem, "metadata" | "ranking_reason">) => {
  const configuredReason = normalizeDiscoveryRankingReason(item.ranking_reason);
  if (configuredReason !== "trending_lightweight") return false;
  const metadata = item.metadata && typeof item.metadata === "object" && !Array.isArray(item.metadata)
    ? item.metadata as Record<string, unknown>
    : {};
  const safeCount = Number(metadata.public_trending_count ?? metadata.public_engagement_count ?? 0);
  return Number.isFinite(safeCount) && safeCount > 0;
};

const calculateDiscoveryFreshnessScore = (
  item: Pick<DiscoveryFeedItem, "starts_at" | "published_at" | "created_at">,
  nowMillis = Date.now(),
) => {
  const startsMillis = Date.parse(normalizeText(item.starts_at));
  if (Number.isFinite(startsMillis) && startsMillis > nowMillis) {
    const daysUntil = (startsMillis - nowMillis) / (1000 * 60 * 60 * 24);
    return Math.max(20, Math.min(100, Math.round(100 - daysUntil * 8)));
  }

  const timestamp = Date.parse(
    normalizeText(item.published_at)
    || normalizeText(item.starts_at)
    || normalizeText(item.created_at),
  );
  if (!Number.isFinite(timestamp)) return 0;

  const ageHours = Math.max(0, (nowMillis - timestamp) / (1000 * 60 * 60));
  if (ageHours <= 6) return 100;
  if (ageHours <= 24) return 88;
  if (ageHours <= 72) return 68;
  if (ageHours <= 24 * 14) return 42;
  if (ageHours <= 24 * 45) return 22;
  return 8;
};

export function resolveDiscoveryRankingReason(
  item: Pick<
    DiscoveryFeedItem,
    "live_state" | "item_type" | "channel_user_id" | "owner_user_id" | "host_user_id" | "category_key" | "published_at" | "starts_at" | "ranking_reason" | "metadata"
  >,
  signals: DiscoveryFeedRankingSignals = {},
): DiscoveryRankingReason {
  if (item.live_state === "live") return "live_now";

  const followedChannelIds = normalizeList(signals.followedChannelIds);
  const actorIds = getDiscoveryActorIds(item);
  if (actorIds.some((id) => followedChannelIds.has(id))) return "followed_channel";

  const chillyCircleUserIds = normalizeList(signals.chillyCircleUserIds);
  if (actorIds.some((id) => chillyCircleUserIds.has(id))) return "chilly_circle";

  if (item.live_state === "scheduled" || item.item_type === "creator_event") return "upcoming_event";
  if (item.live_state === "replay_available_later" || item.item_type === "replay_later") return "replay_ready";

  const categoryKeys = normalizeList(signals.categoryKeys);
  if (normalizeText(item.category_key) && categoryKeys.has(normalizeText(item.category_key))) return "category_match";

  if (hasBackedLightweightTrendingSignal(item)) return "trending_lightweight";

  const configuredReason = normalizeDiscoveryRankingReason(item.ranking_reason);
  if (configuredReason === "editorial_pick" || configuredReason === "manual_foundation") return configuredReason;

  if (item.item_type === "creator_upload" || item.published_at) return "recent_upload";
  return configuredReason ?? "manual_foundation";
}

export function scoreDiscoveryFeedItem(
  item: Pick<
    DiscoveryFeedItem,
    | "is_publicly_discoverable"
    | "visibility"
    | "moderation_status"
    | "rights_status"
    | "live_state"
    | "item_type"
    | "channel_user_id"
    | "owner_user_id"
    | "host_user_id"
    | "category_key"
    | "published_at"
    | "starts_at"
    | "created_at"
    | "ranking_score"
    | "ranking_reason"
    | "metadata"
  >,
  signals: DiscoveryFeedRankingSignals = {},
) {
  if (!isDiscoveryFeedItemEligibleForRanking(item)) {
    return {
      reason: "manual_foundation" as DiscoveryRankingReason,
      score: 0,
      excluded: true,
    };
  }

  const reason = resolveDiscoveryRankingReason(item, signals);
  const configuredScore = typeof item.ranking_score === "number" && Number.isFinite(item.ranking_score)
    ? item.ranking_score
    : 0;
  const reasonScore: Record<DiscoveryRankingReason, number> = {
    live_now: 1000,
    followed_channel: 800,
    chilly_circle: 700,
    recent_upload: 620,
    upcoming_event: 600,
    replay_ready: 560,
    category_match: 400,
    editorial_pick: 340,
    trending_lightweight: 320,
    manual_foundation: 260,
  };
  const freshnessScore = calculateDiscoveryFreshnessScore(item);

  return {
    reason,
    score: configuredScore + reasonScore[reason] + freshnessScore,
    excluded: false,
  };
}

export function scoreCircleSpectatorFeedItem(
  item: Pick<
    DiscoveryFeedItem,
    | "is_publicly_discoverable"
    | "visibility"
    | "moderation_status"
    | "rights_status"
    | "is_spectator_enabled"
    | "live_state"
    | "item_type"
    | "channel_user_id"
    | "owner_user_id"
    | "host_user_id"
    | "category_key"
    | "published_at"
    | "starts_at"
    | "created_at"
    | "ranking_score"
    | "ranking_reason"
    | "metadata"
  >,
  signals: DiscoveryFeedRankingSignals = {},
) {
  if (!isCircleSpectatorFeedItemEligibleForRanking(item)) {
    return {
      reason: "manual_foundation" as DiscoveryRankingReason,
      score: 0,
      excluded: true,
    };
  }

  const reason = resolveDiscoveryRankingReason(item, signals);
  const configuredScore = typeof item.ranking_score === "number" && Number.isFinite(item.ranking_score)
    ? item.ranking_score
    : 0;
  const reasonScore: Record<DiscoveryRankingReason, number> = {
    live_now: 1000,
    followed_channel: 820,
    chilly_circle: 860,
    recent_upload: 620,
    upcoming_event: 600,
    replay_ready: 560,
    category_match: 400,
    editorial_pick: 340,
    trending_lightweight: 0,
    manual_foundation: 260,
  };
  const freshnessScore = calculateDiscoveryFreshnessScore(item);

  return {
    reason,
    score: configuredScore + reasonScore[reason] + freshnessScore,
    excluded: false,
  };
}

export function rankDiscoveryFeedItems<T extends DiscoveryFeedItem>(
  items: T[],
  signals: DiscoveryFeedRankingSignals = {},
) {
  return items.filter(isDiscoveryFeedItemEligibleForRanking).sort((left, right) => {
    const leftScore = scoreDiscoveryFeedItem(left, signals).score;
    const rightScore = scoreDiscoveryFeedItem(right, signals).score;
    if (leftScore !== rightScore) return rightScore - leftScore;
    const leftTime = Date.parse(normalizeText(left.starts_at) || normalizeText(left.published_at) || normalizeText(left.created_at));
    const rightTime = Date.parse(normalizeText(right.starts_at) || normalizeText(right.published_at) || normalizeText(right.created_at));
    return (Number.isFinite(rightTime) ? rightTime : 0) - (Number.isFinite(leftTime) ? leftTime : 0);
  });
}

export function rankCircleSpectatorFeedItems<T extends DiscoveryFeedItem>(
  items: T[],
  signals: DiscoveryFeedRankingSignals = {},
) {
  return items.filter(isCircleSpectatorFeedItemEligibleForRanking).sort((left, right) => {
    const leftScore = scoreCircleSpectatorFeedItem(left, signals).score;
    const rightScore = scoreCircleSpectatorFeedItem(right, signals).score;
    if (leftScore !== rightScore) return rightScore - leftScore;
    const leftTime = Date.parse(normalizeText(left.starts_at) || normalizeText(left.published_at) || normalizeText(left.created_at));
    const rightTime = Date.parse(normalizeText(right.starts_at) || normalizeText(right.published_at) || normalizeText(right.created_at));
    return (Number.isFinite(rightTime) ? rightTime : 0) - (Number.isFinite(leftTime) ? leftTime : 0);
  });
}

export async function loadDiscoveryFeedRankingSignals(options?: { limit?: number }): Promise<DiscoveryFeedRankingSignals> {
  const limit = Math.max(1, Math.min(100, Math.floor(Number(options?.limit ?? 75)) || 75));
  const [followedChannelIds, chillyCircleUserIds] = await Promise.all([
    readFollowedChannelUserIds({ limit }).catch(() => []),
    readActiveFriendUserIds().catch(() => []),
  ]);

  return {
    followedChannelIds: Array.from(new Set(followedChannelIds.map(normalizeText).filter(Boolean))),
    chillyCircleUserIds: Array.from(new Set(chillyCircleUserIds.map(normalizeText).filter(Boolean))),
    categoryKeys: [],
  };
}

export async function readRankedPublicDiscoveryFeedItems(
  options: PublicDiscoveryFeedReadOptions = {},
): Promise<RankedPublicDiscoveryFeedReadResult> {
  const [items, signals] = await Promise.all([
    readPublicDiscoveryFeedItems(options),
    loadDiscoveryFeedRankingSignals(),
  ]);

  return {
    items: rankDiscoveryFeedItems(items, signals),
    signals,
    generatedAt: new Date().toISOString(),
    viewerSpecific: hasViewerSpecificDiscoverySignals(signals),
  };
}

export async function readPublicDiscoveryFeedItems(
  options: PublicDiscoveryFeedReadOptions = {},
): Promise<DiscoveryFeedItem[]> {
  const limit = Math.max(1, Math.min(50, Math.floor(Number(options.limit ?? 12)) || 12));
  const itemId = normalizeText(options.itemId);

  let query = supabase
    .from(DISCOVERY_FEED_ITEMS_TABLE)
    .select("*")
    .eq("is_publicly_discoverable", true)
    .eq("visibility", "public")
    .eq("moderation_status", "clean")
    .in("rights_status", [...PUBLIC_SPECTATOR_SAFE_RIGHTS])
    .order("ranking_score", { ascending: false })
    .order("starts_at", { ascending: false, nullsFirst: false })
    .order("published_at", { ascending: false, nullsFirst: false })
    .limit(limit);

  if (itemId) {
    query = query.eq("id", itemId);
  }

  if (options.surface) {
    query = query.in("discovery_surface", PUBLIC_READ_SURFACE_MAP[options.surface]);
  }

  const channelUserId = normalizeText(options.channelUserId);
  if (channelUserId) query = query.eq("channel_user_id", channelUserId);

  const ownerUserId = normalizeText(options.ownerUserId);
  if (ownerUserId) query = query.eq("owner_user_id", ownerUserId);

  const { data, error } = await query.returns<DiscoveryFeedItem[]>();
  if (error || !data) return [];
  return data.filter(isDiscoveryFeedItemEligibleForRanking);
}

export async function readPublicDiscoveryFeedItem(itemId: string): Promise<DiscoveryFeedItem | null> {
  const [item] = await readPublicDiscoveryFeedItems({ itemId, limit: 1 });
  return item ?? null;
}

export async function readDiscoveryFeedFoundationSummary(): Promise<DiscoveryFeedFoundationSummary> {
  const itemCount = await safeCount(() => discoveryClient
    .from(DISCOVERY_FEED_ITEMS_TABLE)
    .select("id", { count: "exact", head: true }));
  const blockCount = await safeCount(() => discoveryClient
    .from(DISCOVERY_FEED_ITEM_BLOCKS_TABLE)
    .select("id", { count: "exact", head: true }));
  const publicDiscoverableCount = await safeCount(() => discoveryClient
    .from(DISCOVERY_FEED_ITEMS_TABLE)
    .select("id", { count: "exact", head: true })
    .eq("is_publicly_discoverable", true));
  const spectatorEnabledCount = await safeCount(() => discoveryClient
    .from(DISCOVERY_FEED_ITEMS_TABLE)
    .select("id", { count: "exact", head: true })
    .eq("is_spectator_enabled", true));
  const spectatorPlaybackEnabledCount = await safeCount(() => discoveryClient
    .from(DISCOVERY_FEED_ITEMS_TABLE)
    .select("id", { count: "exact", head: true })
    .eq("is_spectator_playback_enabled", true));

  return {
    itemCount,
    blockCount,
    publicDiscoverableCount,
    spectatorEnabledCount,
    spectatorPlaybackEnabledCount,
    generatedAt: new Date().toISOString(),
  };
}
