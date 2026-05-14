import type { CreatorVideo } from "./creatorVideos";
import type { DiscoveryFeedItem } from "./discoveryFeed";
import type { NotificationRecord } from "./notifications";
import type { ProfilePost } from "./profilePosts";

export type ProfileSocialFeedMode =
  | "own_profile_social_feed"
  | "public_profile_activity_feed";

export type ProfileSocialFeedActor = {
  userId: string;
  displayName: string;
  handle: string | null;
  avatarUrl: string | null;
};

export type ProfileSocialFeedActorMap = Record<string, ProfileSocialFeedActor | undefined>;

export type ProfileSocialPostSourceContext = "chilly_circle" | "following";
export type ProfileSocialVideoSourceContext = "own" | "chilly_circle" | "following" | "discovery";
export type ProfileSocialDiscoverySourceContext = "own" | "chilly_circle" | "following" | "public_profile" | "discovery";

export type ProfileSocialFeedPostActivity = {
  post: ProfilePost;
  actor: ProfileSocialFeedActor;
  sourceContext: ProfileSocialPostSourceContext;
};

type ProfileSocialFeedBase = {
  id: string;
  mode: ProfileSocialFeedMode;
  rankScore: number;
  rankTime: string | null;
};

export type ProfileSocialFeedItem =
  | (ProfileSocialFeedBase & {
      type: "my_post";
      post: ProfilePost;
      actor: ProfileSocialFeedActor | null;
    })
  | (ProfileSocialFeedBase & {
      type: "public_profile_post";
      post: ProfilePost;
      actor: ProfileSocialFeedActor | null;
    })
  | (ProfileSocialFeedBase & {
      type: "chilly_circle_post";
      post: ProfilePost;
      actor: ProfileSocialFeedActor;
      sourceContext: "chilly_circle";
    })
  | (ProfileSocialFeedBase & {
      type: "followed_user_post";
      post: ProfilePost;
      actor: ProfileSocialFeedActor;
      sourceContext: "following";
    })
  | (ProfileSocialFeedBase & {
      type: "creator_video";
      video: CreatorVideo;
      actor: ProfileSocialFeedActor | null;
      sourceContext: ProfileSocialVideoSourceContext;
    })
  | (ProfileSocialFeedBase & {
      type: "public_profile_creator_video";
      video: CreatorVideo;
      actor: ProfileSocialFeedActor | null;
    })
  | (ProfileSocialFeedBase & {
      type: "spectator_entry";
      discoveryItem: DiscoveryFeedItem;
      actor: ProfileSocialFeedActor | null;
      sourceContext: ProfileSocialDiscoverySourceContext;
    })
  | (ProfileSocialFeedBase & {
      type: "public_profile_spectator_entry";
      discoveryItem: DiscoveryFeedItem;
      actor: ProfileSocialFeedActor | null;
      sourceContext: "public_profile";
    })
  | (ProfileSocialFeedBase & {
      type: "backed_activity_item";
      notification: NotificationRecord;
    });

export type BuildOwnProfileSocialFeedInput = {
  ownerUserId: string;
  ownerActor: ProfileSocialFeedActor | null;
  ownPosts: ProfilePost[];
  ownVideos: CreatorVideo[];
  circlePosts: ProfileSocialFeedPostActivity[];
  followedPosts: ProfileSocialFeedPostActivity[];
  circleVideos: CreatorVideo[];
  followedVideos: CreatorVideo[];
  discoveryItems: DiscoveryFeedItem[];
  notifications: NotificationRecord[];
  actorsByUserId?: ProfileSocialFeedActorMap;
  chillyCircleUserIds?: string[];
  followedChannelUserIds?: string[];
};

export type BuildPublicProfileActivityFeedInput = {
  profileUserId: string;
  profileActor: ProfileSocialFeedActor | null;
  profilePosts: ProfilePost[];
  profileVideos: CreatorVideo[];
  discoveryItems: DiscoveryFeedItem[];
  actorsByUserId?: ProfileSocialFeedActorMap;
};

const normalizeText = (value: unknown) => String(value ?? "").trim();

const normalizeIso = (value: unknown) => {
  const normalized = normalizeText(value);
  if (!normalized) return null;
  const parsed = Date.parse(normalized);
  return Number.isFinite(parsed) ? new Date(parsed).toISOString() : normalized;
};

const timestampMillis = (value: unknown) => {
  const normalized = normalizeText(value);
  if (!normalized) return 0;
  const parsed = Date.parse(normalized);
  return Number.isFinite(parsed) ? parsed : 0;
};

const actorIdsForDiscoveryItem = (item: DiscoveryFeedItem) => [
  item.channel_user_id,
  item.owner_user_id,
  item.host_user_id,
].map(normalizeText).filter(Boolean);

const getActorForUserId = (
  actorsByUserId: ProfileSocialFeedActorMap | undefined,
  userId: string | null | undefined,
  fallback: ProfileSocialFeedActor | null = null,
) => {
  const normalizedUserId = normalizeText(userId);
  if (!normalizedUserId) return fallback;
  return actorsByUserId?.[normalizedUserId] ?? fallback;
};

const getDiscoveryRankTime = (item: DiscoveryFeedItem) => (
  normalizeIso(item.starts_at) ?? normalizeIso(item.published_at) ?? normalizeIso(item.created_at)
);

const getDiscoveryKindWeight = (item: DiscoveryFeedItem) => {
  if (item.live_state === "live") return 1200;
  if (item.live_state === "scheduled") return 900;
  if (item.live_state === "replay_available_later" || item.item_type === "replay_later") return 760;
  if (item.item_type === "creator_upload") return 700;
  return 620;
};

const getDiscoverySourceContext = (
  item: DiscoveryFeedItem,
  input: {
    ownerUserId: string;
    chillyCircleUserIds?: string[];
    followedChannelUserIds?: string[];
  },
): ProfileSocialDiscoverySourceContext => {
  const ownerUserId = normalizeText(input.ownerUserId);
  const actorIds = actorIdsForDiscoveryItem(item);
  if (ownerUserId && actorIds.includes(ownerUserId)) return "own";

  const chillyCircleUserIds = new Set((input.chillyCircleUserIds ?? []).map(normalizeText).filter(Boolean));
  if (actorIds.some((id) => chillyCircleUserIds.has(id))) return "chilly_circle";

  const followedChannelUserIds = new Set((input.followedChannelUserIds ?? []).map(normalizeText).filter(Boolean));
  if (actorIds.some((id) => followedChannelUserIds.has(id))) return "following";

  return "discovery";
};

const getActorForDiscoveryItem = (
  item: DiscoveryFeedItem,
  actorsByUserId: ProfileSocialFeedActorMap | undefined,
  fallback: ProfileSocialFeedActor | null = null,
) => {
  for (const actorId of actorIdsForDiscoveryItem(item)) {
    const actor = getActorForUserId(actorsByUserId, actorId, null);
    if (actor) return actor;
  }
  return fallback;
};

function contentKeyForItem(item: ProfileSocialFeedItem) {
  switch (item.type) {
    case "my_post":
    case "public_profile_post":
    case "chilly_circle_post":
    case "followed_user_post":
      return `post:${item.post.id}`;
    case "creator_video":
    case "public_profile_creator_video":
      return `video:${item.video.id}`;
    case "spectator_entry":
    case "public_profile_spectator_entry":
      if (item.discoveryItem.item_type === "creator_upload" && normalizeText(item.discoveryItem.media_id)) {
        return `video:${normalizeText(item.discoveryItem.media_id)}`;
      }
      return `discovery:${item.discoveryItem.id}`;
    case "backed_activity_item":
      return `notification:${item.notification.id}`;
  }
}

function itemPriority(item: ProfileSocialFeedItem) {
  switch (item.type) {
    case "my_post":
    case "public_profile_post":
      return 100;
    case "spectator_entry":
    case "public_profile_spectator_entry":
      if (item.discoveryItem.item_type === "creator_upload") return 75;
      return 90;
    case "creator_video":
    case "public_profile_creator_video":
      return 80;
    case "chilly_circle_post":
      return 70;
    case "followed_user_post":
      return 60;
    case "backed_activity_item":
      return 20;
  }
}

export function sortProfileSocialFeedItems(items: ProfileSocialFeedItem[]) {
  const deduped = new Map<string, ProfileSocialFeedItem>();

  for (const item of items) {
    const key = contentKeyForItem(item);
    const current = deduped.get(key);
    if (!current || itemPriority(item) > itemPriority(current)) {
      deduped.set(key, item);
    }
  }

  return [...deduped.values()].sort((left, right) => {
    if (left.rankScore !== right.rankScore) return right.rankScore - left.rankScore;
    return timestampMillis(right.rankTime) - timestampMillis(left.rankTime);
  });
}

export function buildOwnProfileSocialFeed(input: BuildOwnProfileSocialFeedInput): ProfileSocialFeedItem[] {
  const mode: ProfileSocialFeedMode = "own_profile_social_feed";
  const ownerUserId = normalizeText(input.ownerUserId);
  const actorsByUserId = input.actorsByUserId ?? {};
  const items: ProfileSocialFeedItem[] = [];

  for (const post of input.ownPosts) {
    items.push({
      id: `my-post-${post.id}`,
      type: "my_post",
      mode,
      post,
      actor: input.ownerActor,
      rankScore: 980,
      rankTime: normalizeIso(post.createdAt),
    });
  }

  for (const video of input.ownVideos) {
    items.push({
      id: `own-video-${video.id}`,
      type: "creator_video",
      mode,
      video,
      actor: input.ownerActor,
      sourceContext: "own",
      rankScore: 940,
      rankTime: normalizeIso(video.updatedAt) ?? normalizeIso(video.createdAt),
    });
  }

  for (const activity of input.circlePosts) {
    items.push({
      id: `circle-post-${activity.post.id}`,
      type: "chilly_circle_post",
      mode,
      post: activity.post,
      actor: activity.actor,
      sourceContext: "chilly_circle",
      rankScore: 860,
      rankTime: normalizeIso(activity.post.createdAt),
    });
  }

  for (const activity of input.followedPosts) {
    items.push({
      id: `followed-post-${activity.post.id}`,
      type: "followed_user_post",
      mode,
      post: activity.post,
      actor: activity.actor,
      sourceContext: "following",
      rankScore: 800,
      rankTime: normalizeIso(activity.post.createdAt),
    });
  }

  for (const video of input.circleVideos) {
    items.push({
      id: `circle-video-${video.id}`,
      type: "creator_video",
      mode,
      video,
      actor: getActorForUserId(actorsByUserId, video.ownerId, null),
      sourceContext: "chilly_circle",
      rankScore: 840,
      rankTime: normalizeIso(video.updatedAt) ?? normalizeIso(video.createdAt),
    });
  }

  for (const video of input.followedVideos) {
    items.push({
      id: `followed-video-${video.id}`,
      type: "creator_video",
      mode,
      video,
      actor: getActorForUserId(actorsByUserId, video.ownerId, null),
      sourceContext: "following",
      rankScore: 780,
      rankTime: normalizeIso(video.updatedAt) ?? normalizeIso(video.createdAt),
    });
  }

  for (const discoveryItem of input.discoveryItems) {
    const sourceContext = getDiscoverySourceContext(discoveryItem, {
      ownerUserId,
      chillyCircleUserIds: input.chillyCircleUserIds,
      followedChannelUserIds: input.followedChannelUserIds,
    });
    items.push({
      id: `spectator-${discoveryItem.id}`,
      type: "spectator_entry",
      mode,
      discoveryItem,
      actor: getActorForDiscoveryItem(discoveryItem, actorsByUserId, input.ownerActor),
      sourceContext,
      rankScore: getDiscoveryKindWeight(discoveryItem)
        + (sourceContext === "own" ? 80 : sourceContext === "chilly_circle" ? 60 : sourceContext === "following" ? 40 : 0),
      rankTime: getDiscoveryRankTime(discoveryItem),
    });
  }

  for (const notification of input.notifications) {
    if (notification.isDismissed) continue;
    items.push({
      id: `activity-${notification.id}`,
      type: "backed_activity_item",
      mode,
      notification,
      rankScore: 360,
      rankTime: normalizeIso(notification.createdAt),
    });
  }

  return sortProfileSocialFeedItems(items);
}

export function buildPublicProfileActivityFeed(input: BuildPublicProfileActivityFeedInput): ProfileSocialFeedItem[] {
  const mode: ProfileSocialFeedMode = "public_profile_activity_feed";
  const actorsByUserId = input.actorsByUserId ?? {};
  const items: ProfileSocialFeedItem[] = [];

  for (const discoveryItem of input.discoveryItems) {
    items.push({
      id: `public-spectator-${discoveryItem.id}`,
      type: "public_profile_spectator_entry",
      mode,
      discoveryItem,
      actor: getActorForDiscoveryItem(discoveryItem, actorsByUserId, input.profileActor),
      sourceContext: "public_profile",
      rankScore: getDiscoveryKindWeight(discoveryItem),
      rankTime: getDiscoveryRankTime(discoveryItem),
    });
  }

  for (const post of input.profilePosts) {
    items.push({
      id: `public-post-${post.id}`,
      type: "public_profile_post",
      mode,
      post,
      actor: input.profileActor,
      rankScore: 700,
      rankTime: normalizeIso(post.createdAt),
    });
  }

  for (const video of input.profileVideos) {
    items.push({
      id: `public-video-${video.id}`,
      type: "public_profile_creator_video",
      mode,
      video,
      actor: getActorForUserId(actorsByUserId, video.ownerId, input.profileActor),
      rankScore: 680,
      rankTime: normalizeIso(video.updatedAt) ?? normalizeIso(video.createdAt),
    });
  }

  return sortProfileSocialFeedItems(items);
}
