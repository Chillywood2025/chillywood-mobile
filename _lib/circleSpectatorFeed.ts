import type { DiscoveryFeedItem, DiscoveryFeedRankingSignals } from "./discoveryFeed";
import {
  loadDiscoveryFeedRankingSignals,
  rankCircleSpectatorFeedItems,
} from "./discoveryFeed";
import { supabase } from "./supabase";

export const CIRCLE_SPECTATOR_FEED_ITEMS_TABLE = "circle_spectator_feed_items";

export type CircleSpectatorFeedReadOptions = {
  itemId?: string;
  limit?: number;
};

export type RankedCircleSpectatorFeedReadResult = {
  items: DiscoveryFeedItem[];
  signals: DiscoveryFeedRankingSignals;
  generatedAt: string;
  viewerSpecific: true;
};

type CircleSpectatorFeedItemRow = {
  access_type: string | null;
  allow_live_reaction_rooms: boolean | null;
  allow_replay_watch_party: boolean | null;
  allow_spectator_view: boolean | null;
  allow_watch_party_from_spectator: boolean | null;
  broadcast_session_id: string | null;
  category_key: string | null;
  channel_user_id: string | null;
  created_at: string | null;
  ended_at: string | null;
  event_id: string | null;
  host_user_id: string | null;
  id: string;
  is_spectator_enabled: boolean | null;
  is_spectator_playback_enabled: boolean | null;
  item_type: string;
  live_state: string | null;
  metadata: Record<string, unknown> | null;
  moderation_status: string | null;
  playback_record_id: string | null;
  published_at: string | null;
  ranking_reason: string | null;
  ranking_score: number | null;
  requires_premium_to_join: boolean | null;
  requires_subscription_to_watch: boolean | null;
  requires_ticket_to_watch: boolean | null;
  rights_status: string | null;
  room_id: string | null;
  source_id: string | null;
  source_room_id: string | null;
  source_type: string;
  starts_at: string | null;
  status: string | null;
  subtitle: string | null;
  thumbnail_url: string | null;
  title: string | null;
  updated_at: string | null;
  visibility: string | null;
  creator_user_id: string;
};

const toText = (value: unknown) => String(value ?? "").trim();

const adaptCircleSpectatorFeedItem = (row: CircleSpectatorFeedItemRow): DiscoveryFeedItem => ({
  access_type: "circle",
  ad_policy: "ads_not_allowed",
  allow_live_reaction_rooms: row.allow_live_reaction_rooms === true,
  allow_public_share: false,
  allow_replay_watch_party: row.allow_replay_watch_party === true,
  allow_spectator_view: row.allow_spectator_view === true,
  allow_watch_party_from_spectator: row.allow_watch_party_from_spectator === true,
  category_key: row.category_key,
  channel_user_id: toText(row.channel_user_id) || toText(row.creator_user_id) || null,
  circle_signal_user_id: toText(row.creator_user_id) || null,
  created_at: row.created_at ?? new Date().toISOString(),
  discovery_surface: "none",
  ended_at: row.ended_at,
  event_id: row.event_id,
  follow_signal_user_id: null,
  host_user_id: row.host_user_id,
  id: row.id,
  is_publicly_discoverable: false,
  is_spectator_enabled: row.is_spectator_enabled === true,
  is_spectator_playback_enabled: row.is_spectator_playback_enabled === true,
  item_type: row.item_type,
  live_state: row.live_state ?? "not_live",
  media_id: null,
  metadata: {
    ...(row.metadata ?? {}),
    circle_spectator_feed: true,
    playback_record_id: row.playback_record_id,
    source_room_id: row.source_room_id,
  },
  moderation_status: row.moderation_status ?? "clean",
  owner_user_id: toText(row.creator_user_id) || null,
  published_at: row.published_at,
  ranking_reason: row.ranking_reason,
  ranking_score: row.ranking_score ?? 0,
  requires_premium_to_join: row.requires_premium_to_join === true,
  requires_subscription_to_watch: row.requires_subscription_to_watch === true,
  requires_ticket_to_watch: row.requires_ticket_to_watch === true,
  rights_status: row.rights_status ?? "creator_owned",
  room_id: row.room_id ?? row.source_room_id,
  source_id: row.source_id ?? row.source_room_id,
  source_type: row.source_type,
  starts_at: row.starts_at,
  subtitle: row.subtitle,
  thumbnail_url: row.thumbnail_url,
  title: row.title,
  updated_at: row.updated_at ?? row.created_at ?? new Date().toISOString(),
  visibility: "circle",
}) as DiscoveryFeedItem;

export async function readCircleSpectatorFeedItems(
  options: CircleSpectatorFeedReadOptions = {},
): Promise<DiscoveryFeedItem[]> {
  const limit = Math.max(1, Math.min(50, Math.floor(Number(options.limit ?? 12)) || 12));
  const itemId = toText(options.itemId);

  let query = supabase
    .from(CIRCLE_SPECTATOR_FEED_ITEMS_TABLE)
    .select("*")
    .eq("status", "active")
    .eq("visibility", "circle")
    .eq("access_type", "circle")
    .eq("moderation_status", "clean")
    .order("ranking_score", { ascending: false })
    .order("starts_at", { ascending: false, nullsFirst: false })
    .order("published_at", { ascending: false, nullsFirst: false })
    .limit(limit);

  if (itemId) {
    query = query.eq("id", itemId);
  }

  const { data, error } = await query.returns<CircleSpectatorFeedItemRow[]>();
  if (error || !data) return [];
  return data.map(adaptCircleSpectatorFeedItem);
}

export async function readCircleSpectatorFeedItem(itemId: string): Promise<DiscoveryFeedItem | null> {
  const [item] = await readCircleSpectatorFeedItems({ itemId, limit: 1 });
  return item ?? null;
}

export async function readRankedCircleSpectatorFeedItems(
  options: CircleSpectatorFeedReadOptions = {},
): Promise<RankedCircleSpectatorFeedReadResult> {
  const [items, signals] = await Promise.all([
    readCircleSpectatorFeedItems(options),
    loadDiscoveryFeedRankingSignals(),
  ]);

  return {
    items: rankCircleSpectatorFeedItems(items, signals),
    signals,
    generatedAt: new Date().toISOString(),
    viewerSpecific: true,
  };
}
