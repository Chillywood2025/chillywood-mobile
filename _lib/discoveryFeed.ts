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
