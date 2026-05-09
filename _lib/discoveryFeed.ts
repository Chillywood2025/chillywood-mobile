import type { Tables } from "../supabase/database.types";
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
  | "category_match"
  | "manual_foundation";

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

export function isSpectatorPlaybackBlocked(item: Pick<DiscoveryFeedItem, "is_spectator_playback_enabled">) {
  return item.is_spectator_playback_enabled !== true;
}

export function getDiscoveryAccessLabel(item: Pick<
  DiscoveryFeedItem,
  "access_type" | "visibility" | "requires_premium_to_join" | "requires_ticket_to_watch" | "requires_subscription_to_watch"
>) {
  if (item.requires_ticket_to_watch || item.access_type === "ticketed") return "Ticketed";
  if (item.requires_subscription_to_watch || item.access_type === "subscriber_only_later") return "Subscriber";
  if (item.requires_premium_to_join || item.access_type === "premium_only") return "Premium";
  if (item.access_type === "public_free" || item.visibility === "public") return "Public";
  if (item.access_type === "invite_only" || item.visibility === "invite_only") return "Invite Only";
  return "Private";
}

export function getDiscoveryLiveLabel(item: Pick<DiscoveryFeedItem, "live_state" | "item_type">) {
  if (item.live_state === "live") return "Live";
  if (item.live_state === "scheduled") return "Upcoming";
  if (item.live_state === "ended") return "Ended";
  if (item.live_state === "replay_available_later" || item.item_type === "replay_later") return "Replay Later";
  return "Public";
}

export function resolveDiscoveryRankingReason(
  item: Pick<
    DiscoveryFeedItem,
    "live_state" | "item_type" | "channel_user_id" | "owner_user_id" | "host_user_id" | "category_key" | "published_at" | "starts_at" | "ranking_reason"
  >,
  signals: DiscoveryFeedRankingSignals = {},
): DiscoveryRankingReason {
  const configuredReason = normalizeText(item.ranking_reason);
  if (
    configuredReason === "live_now"
    || configuredReason === "followed_channel"
    || configuredReason === "chilly_circle"
    || configuredReason === "recent_upload"
    || configuredReason === "upcoming_event"
    || configuredReason === "category_match"
    || configuredReason === "manual_foundation"
  ) {
    return configuredReason;
  }

  if (item.live_state === "live") return "live_now";

  const followedChannelIds = normalizeList(signals.followedChannelIds);
  const actorIds = [item.channel_user_id, item.owner_user_id, item.host_user_id].map(normalizeText).filter(Boolean);
  if (actorIds.some((id) => followedChannelIds.has(id))) return "followed_channel";

  const chillyCircleUserIds = normalizeList(signals.chillyCircleUserIds);
  if (actorIds.some((id) => chillyCircleUserIds.has(id))) return "chilly_circle";

  const categoryKeys = normalizeList(signals.categoryKeys);
  if (normalizeText(item.category_key) && categoryKeys.has(normalizeText(item.category_key))) return "category_match";

  if (item.live_state === "scheduled" || item.item_type === "creator_event") return "upcoming_event";
  if (item.item_type === "creator_upload" || item.published_at) return "recent_upload";
  return "manual_foundation";
}

export function scoreDiscoveryFeedItem(
  item: Pick<
    DiscoveryFeedItem,
    "live_state" | "item_type" | "channel_user_id" | "owner_user_id" | "host_user_id" | "category_key" | "published_at" | "starts_at" | "ranking_score" | "ranking_reason"
  >,
  signals: DiscoveryFeedRankingSignals = {},
) {
  const reason = resolveDiscoveryRankingReason(item, signals);
  const configuredScore = typeof item.ranking_score === "number" && Number.isFinite(item.ranking_score)
    ? item.ranking_score
    : 0;
  const reasonScore: Record<DiscoveryRankingReason, number> = {
    live_now: 1000,
    followed_channel: 800,
    chilly_circle: 700,
    upcoming_event: 600,
    recent_upload: 500,
    category_match: 400,
    manual_foundation: 0,
  };
  const freshnessSource = normalizeText(item.starts_at) || normalizeText(item.published_at);
  const freshnessMillis = Date.parse(freshnessSource);
  const freshnessScore = Number.isFinite(freshnessMillis)
    ? Math.max(0, Math.min(100, Math.round((freshnessMillis - Date.now()) / (1000 * 60 * 60 * 24))))
    : 0;

  return {
    reason,
    score: configuredScore + reasonScore[reason] + freshnessScore,
  };
}

export function rankDiscoveryFeedItems<T extends DiscoveryFeedItem>(
  items: T[],
  signals: DiscoveryFeedRankingSignals = {},
) {
  return [...items].sort((left, right) => {
    const leftScore = scoreDiscoveryFeedItem(left, signals).score;
    const rightScore = scoreDiscoveryFeedItem(right, signals).score;
    if (leftScore !== rightScore) return rightScore - leftScore;
    const leftTime = Date.parse(normalizeText(left.starts_at) || normalizeText(left.published_at) || normalizeText(left.created_at));
    const rightTime = Date.parse(normalizeText(right.starts_at) || normalizeText(right.published_at) || normalizeText(right.created_at));
    return (Number.isFinite(rightTime) ? rightTime : 0) - (Number.isFinite(leftTime) ? leftTime : 0);
  });
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
  return data.filter(isFeedItemPubliclyDiscoverable);
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
