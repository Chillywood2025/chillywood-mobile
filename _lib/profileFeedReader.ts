import { supabase } from "./supabase";
import { getCurrentAccountSessionAuthoritySnapshot, sameAccountSessionAuthority } from "./accountSessionAuthority";
import { readCreatorVideosByIds } from "./creatorVideos";
import { readPublicDiscoveryFeedItems, rankDiscoveryFeedItems } from "./discoveryFeed";
import { readProfilePostsByIds } from "./profilePosts";
import { decodeProfileFeedCursor, encodeProfileFeedCursor, profileFeedPageLimit, type ProfileFeedPage } from "./profileFeedPagination";
import type { ProfileSocialFeedActor, ProfileSocialFeedItem } from "./profileSocialFeed";

type FeedRow = { id: string; source_type: "profile_post" | "creator_video"; source_id: string; creator_user_id: string; source_context: "own" | "chilly_circle" | "following"; created_at: string; snapshot_at: string };
type ActorRow = { user_id: string; display_name: string | null; username: string | null; avatar_url: string | null; profile_avatar_media_status: string | null };

/** One indexed relationship page + batch hydration, never one content request per followed person. */
export async function readOwnProfileFeedPage(
  options: { limit?: number; cursor?: string | null } = {},
): Promise<ProfileFeedPage<ProfileSocialFeedItem>> {
  const authority = getCurrentAccountSessionAuthoritySnapshot();
  if (!authority || authority.restoreOnly) throw new Error("Sign in to read your feed.");
  const current = () => {
    if (!sameAccountSessionAuthority(authority, getCurrentAccountSessionAuthoritySnapshot())) throw new Error("The signed-in account changed. Refresh your feed.");
  };
  const scope = `news-feed:${authority.userId}:${authority.sessionGeneration}`;
  const cursor = decodeProfileFeedCursor(options.cursor, scope);
  if (cursor && !cursor.snapshotAt) throw new Error("Invalid feed cursor. Refresh to start again.");
  // The first snapshot is server-time, not the device's potentially skewed clock.
  const snapshotAt = cursor?.snapshotAt ?? null;
  const limit = profileFeedPageLimit(options.limit);
  const { data, error } = await supabase.rpc("read_profile_relationship_feed_page", {
    p_before_created_at: cursor?.at ?? null, p_before_id: cursor?.id ?? null,
    p_snapshot_at: snapshotAt, p_limit: limit,
  });
  current();
  if (error) throw error;
  if (!data) throw new Error("Your feed could not be loaded.");
  const rows: FeedRow[] = data.slice(0, limit).map(row => {
    if ((row.source_type !== "profile_post" && row.source_type !== "creator_video")
      || !["own", "chilly_circle", "following"].includes(row.source_context)) throw new Error("Unsupported feed response. Refresh to try again.");
    return row as FeedRow;
  });
  const actors = [...new Set(rows.map(row => row.creator_user_id))];
  const [posts, videos, profiles, discovery] = await Promise.all([
    readProfilePostsByIds(rows.filter(row => row.source_type === "profile_post").map(row => row.source_id), { limit }),
    readCreatorVideosByIds(rows.filter(row => row.source_type === "creator_video").map(row => row.source_id), { limit, includeRenditionStatuses: false, throwOnUnavailable: true }),
    actors.length ? supabase.from("user_profiles").select("user_id,display_name,username,avatar_url,profile_avatar_media_status").in("user_id", actors).returns<ActorRow[]>() : Promise.resolve({ data: [], error: null }),
    // Real public discovery, independent of the viewer's relationship list. Never fabricate trending signals.
    cursor ? Promise.resolve(null) : readPublicDiscoveryFeedItems({ surface: "profile", limit: 8 })
      .then(items => ({ items: rankDiscoveryFeedItems(items) })),
  ]);
  current();
  if (profiles.error) throw profiles.error;
  if (!profiles.data) throw new Error("Feed authors could not be loaded.");
  const actorMap = new Map((profiles.data ?? []).map(row => [row.user_id, {
    userId: row.user_id, displayName: row.display_name || row.username || "Member",
    handle: row.username, avatarUrl: !row.profile_avatar_media_status || row.profile_avatar_media_status === "active" ? row.avatar_url : null,
  } satisfies ProfileSocialFeedActor]));
  const postMap = new Map(posts.map(post => [post.id, post]));
  const videoMap = new Map(videos.map(video => [video.id, video]));
  const items: ProfileSocialFeedItem[] = [];
  for (const row of rows) {
    const actor = actorMap.get(row.creator_user_id) ?? { userId: row.creator_user_id, displayName: "Member", handle: null, avatarUrl: null };
    const base = { id: `relationship-${row.source_type}-${row.source_id}`, mode: "own_profile_social_feed" as const, rankScore: 0, rankTime: row.created_at, actor };
    if (row.source_type === "creator_video") {
      const video = videoMap.get(row.source_id);
      const published = video?.visibility === "public" || (video?.visibility === "circle" && row.source_context !== "following");
      if (video && published && video.ownerId === row.creator_user_id) items.push({ ...base, type: "creator_video", video, sourceContext: row.source_context });
    } else {
      const post = postMap.get(row.source_id);
      if (!post || post.userId !== row.creator_user_id) continue;
      if (row.source_context === "own") items.push({ ...base, type: "my_post", post });
      else if (row.source_context === "chilly_circle") items.push({ ...base, type: "chilly_circle_post", sourceContext: "chilly_circle", post });
      else items.push({ ...base, type: "followed_user_post", sourceContext: "following", post });
    }
  }
  const videoIds = new Set(videos.map(video => video.id));
  const suggested = (discovery?.items ?? []).filter(item => !videoIds.has(item.media_id ?? "")
    && ![item.owner_user_id, item.channel_user_id, item.host_user_id].includes(authority.userId));
  // Interleave a small public-discovery lane instead of pinning old owner posts above all social content.
  suggested.slice(0, 4).forEach((discoveryItem, index) => {
    items.splice(Math.min(items.length, 4 + index * 6), 0, {
      // The same creator video may arrive on a later relationship page. Use one
      // content identity so page merging replaces, rather than duplicates, it.
      id: discoveryItem.item_type === "creator_upload" && discoveryItem.media_id
        ? `relationship-creator_video-${discoveryItem.media_id}` : `suggested-${discoveryItem.id}`,
      mode: "own_profile_social_feed", type: "spectator_entry",
      discoveryItem, actor: null, sourceContext: "discovery", rankScore: 0,
      rankTime: discoveryItem.published_at ?? discoveryItem.created_at,
    });
  });
  const last = rows.at(-1);
  const hasMore = data.length > limit;
  return { items, hasMore, nextCursor: hasMore && last ? encodeProfileFeedCursor({ version: 1, scope, at: last.created_at, id: last.id, snapshotAt: last.snapshot_at }) : null };
}
