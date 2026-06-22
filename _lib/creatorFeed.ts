import { readCreatorVideosByIds, type CreatorVideo } from "./creatorVideos";
import { readProfilePostsByIds, type ProfilePost } from "./profilePosts";
import { supabase } from "./supabase";

export const CREATOR_FEED_ITEMS_TABLE = "creator_feed_items";

export type CreatorFeedTargetScope = "followers" | "circle";
export type CreatorFeedVisibility = "public" | "circle";
export type CreatorFeedStatus = "active" | "removed" | "hidden";
export type CreatorFeedSourceType = "creator_video" | "profile_post";

export type CreatorFeedItem = {
  id: string;
  source_type: CreatorFeedSourceType;
  source_id: string;
  creator_user_id: string;
  visibility: CreatorFeedVisibility;
  target_scope: CreatorFeedTargetScope;
  published_at: string;
  created_at: string;
  updated_at: string;
  status: CreatorFeedStatus;
  ranking_score: number;
  metadata: Record<string, unknown>;
};

export type CreatorRelationshipFeedReadResult = {
  scope: CreatorFeedTargetScope;
  items: CreatorFeedItem[];
  videos: CreatorVideo[];
  profilePosts: ProfilePost[];
  generatedAt: string;
};

const normalizeText = (value: unknown) => String(value ?? "").trim();

const normalizeScope = (value: unknown): CreatorFeedTargetScope => (
  normalizeText(value) === "circle" ? "circle" : "followers"
);

const parseCreatorFeedItem = (row: Record<string, unknown>): CreatorFeedItem => ({
  id: normalizeText(row.id),
  source_type: normalizeText(row.source_type) === "profile_post" ? "profile_post" : "creator_video",
  source_id: normalizeText(row.source_id),
  creator_user_id: normalizeText(row.creator_user_id),
  visibility: normalizeText(row.visibility) === "circle" ? "circle" : "public",
  target_scope: normalizeScope(row.target_scope),
  published_at: normalizeText(row.published_at),
  created_at: normalizeText(row.created_at),
  updated_at: normalizeText(row.updated_at),
  status: normalizeText(row.status) === "hidden" ? "hidden" : normalizeText(row.status) === "removed" ? "removed" : "active",
  ranking_score: typeof row.ranking_score === "number" && Number.isFinite(row.ranking_score) ? row.ranking_score : 0,
  metadata: row.metadata && typeof row.metadata === "object" && !Array.isArray(row.metadata)
    ? row.metadata as Record<string, unknown>
    : {},
});

export async function readCreatorRelationshipFeedItems(
  scope: CreatorFeedTargetScope,
  options?: { limit?: number },
): Promise<CreatorFeedItem[]> {
  const limit = Math.max(1, Math.min(50, Math.floor(Number(options?.limit ?? 12)) || 12));
  const { data, error } = await supabase
    .from(CREATOR_FEED_ITEMS_TABLE)
    .select("*")
    .eq("target_scope", scope)
    .eq("status", "active")
    .order("ranking_score", { ascending: false })
    .order("published_at", { ascending: false })
    .limit(limit);

  if (error || !Array.isArray(data)) return [];
  return data
    .map((row) => parseCreatorFeedItem(row as Record<string, unknown>))
    .filter((item) => item.id && item.source_id && item.target_scope === scope);
}

export async function readCreatorRelationshipFeedVideos(
  scope: CreatorFeedTargetScope,
  options?: { limit?: number },
): Promise<CreatorRelationshipFeedReadResult> {
  const items = await readCreatorRelationshipFeedItems(scope, options);
  const videoIds = items
    .filter((item) => item.source_type === "creator_video")
    .map((item) => item.source_id);
  const profilePostIds = items
    .filter((item) => item.source_type === "profile_post")
    .map((item) => item.source_id);
  const [videos, profilePosts] = await Promise.all([
    readCreatorVideosByIds(videoIds, { limit: options?.limit ?? 12 }),
    readProfilePostsByIds(profilePostIds, { limit: options?.limit ?? 12 }),
  ]);
  const allowedVideoIds = new Set(videos.map((video) => video.id));
  const allowedProfilePostIds = new Set(profilePosts.map((post) => post.id));

  return {
    scope,
    items: items.filter((item) => (
      item.source_type === "creator_video"
        ? allowedVideoIds.has(item.source_id)
        : allowedProfilePostIds.has(item.source_id)
    )),
    videos,
    profilePosts,
    generatedAt: new Date().toISOString(),
  };
}
