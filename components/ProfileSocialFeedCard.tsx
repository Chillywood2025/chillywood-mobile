import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import React from "react";
import {
  Image,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";

import type { CreatorVideo } from "../_lib/creatorVideos";
import {
  getDiscoveryAccessLabel,
  getDiscoveryLiveLabel,
  type DiscoveryFeedItem,
} from "../_lib/discoveryFeed";
import type {
  ProfileSocialFeedActor,
  ProfileSocialFeedItem,
} from "../_lib/profileSocialFeed";
import { LinkedText } from "./social/linked-text";
import { SocialAttachmentCard } from "./social/social-attachment-card";

type ProfileSocialFeedCardProps = {
  item: ProfileSocialFeedItem;
  onOpenActorChannel: (actor: ProfileSocialFeedActor) => void;
  onOpenActorProfile: (actor: ProfileSocialFeedActor) => void;
  onOpenCreatorVideo: (video: CreatorVideo) => void;
  onOpenDiscoveryItem: (item: DiscoveryFeedItem) => void;
  onOpenNotification: (item: Extract<ProfileSocialFeedItem, { type: "backed_activity_item" }>) => void;
};

const formatDate = (value?: string | null) => {
  const normalized = String(value ?? "").trim();
  if (!normalized) return "";
  const parsed = new Date(normalized);
  if (Number.isNaN(parsed.getTime())) return "";
  return parsed.toLocaleDateString([], {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
};

const formatActorHandle = (actor?: ProfileSocialFeedActor | null) => {
  const handle = String(actor?.handle ?? "").trim();
  return handle ? `@${handle}` : "Chi'llywood";
};

const getPostKicker = (item: Extract<ProfileSocialFeedItem, { type: "chilly_circle_post" | "followed_user_post" }>) => (
  item.type === "chilly_circle_post" ? "CHI'LLY CIRCLE" : "FOLLOWING"
);

const getVideoKicker = (item: Extract<ProfileSocialFeedItem, { type: "creator_video" | "public_profile_creator_video" }>) => {
  if (item.type === "public_profile_creator_video") return "CREATOR VIDEO";
  switch (item.sourceContext) {
    case "own":
      return "YOUR PLATFORM";
    case "chilly_circle":
      return "CHI'LLY CIRCLE";
    case "following":
      return "FOLLOWING";
    default:
      return "CREATOR VIDEO";
  }
};

const getDiscoveryKicker = (item: Extract<ProfileSocialFeedItem, { type: "spectator_entry" | "public_profile_spectator_entry" }>) => {
  if (item.type === "public_profile_spectator_entry") return "PUBLIC PROFILE";
  switch (item.sourceContext) {
    case "own":
      return "YOUR LIVE";
    case "chilly_circle":
      return "CHI'LLY CIRCLE";
    case "following":
      return "FOLLOWING";
    default:
      return "SPECTATOR";
  }
};

export function ProfileSocialFeedCard({
  item,
  onOpenActorChannel,
  onOpenActorProfile,
  onOpenCreatorVideo,
  onOpenDiscoveryItem,
  onOpenNotification,
}: ProfileSocialFeedCardProps) {
  if (item.type === "my_post" || item.type === "public_profile_post") {
    return null;
  }

  if (item.type === "chilly_circle_post" || item.type === "followed_user_post") {
    return (
      <View style={styles.card}>
        <View style={styles.identityRow}>
          <View style={styles.avatar}>
            {item.actor.avatarUrl ? (
              <Image source={{ uri: item.actor.avatarUrl }} style={styles.avatarImage} />
            ) : (
              <Text style={styles.avatarInitial}>{item.actor.displayName.slice(0, 1).toUpperCase()}</Text>
            )}
          </View>
          <View style={styles.identityCopy}>
            <Text style={styles.kicker}>{getPostKicker(item)}</Text>
            <Text style={styles.name} numberOfLines={1}>{item.actor.displayName}</Text>
            <Text style={styles.meta} numberOfLines={1}>
              {formatActorHandle(item.actor)} · {formatDate(item.post.createdAt)}
            </Text>
          </View>
        </View>
        <LinkedText text={item.post.body} style={styles.bodyText} />
        {item.post.attachments.length ? (
          <View style={styles.attachmentStack}>
            {item.post.attachments.map((attachment) => (
              <SocialAttachmentCard key={attachment.id} attachment={attachment} compact />
            ))}
          </View>
        ) : null}
        <View style={styles.actionRow}>
          <TouchableOpacity style={styles.secondaryAction} activeOpacity={0.86} onPress={() => onOpenActorProfile(item.actor)}>
            <MaterialIcons name="person-outline" size={16} color="#E6ECFA" />
            <Text style={styles.secondaryActionText}>Profile</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.secondaryAction} activeOpacity={0.86} onPress={() => onOpenActorChannel(item.actor)}>
            <MaterialIcons name="video-library" size={16} color="#E6ECFA" />
            <Text style={styles.secondaryActionText}>Platform</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  if (item.type === "creator_video" || item.type === "public_profile_creator_video") {
    return (
      <View style={styles.card}>
        <TouchableOpacity style={styles.mediaPreview} activeOpacity={0.88} onPress={() => onOpenCreatorVideo(item.video)}>
          {item.video.thumbnailUrl ? (
            <Image source={{ uri: item.video.thumbnailUrl }} style={styles.mediaImage} />
          ) : (
            <View style={styles.mediaFallback}>
              <MaterialIcons name="movie" size={28} color="#EAF0FF" />
            </View>
          )}
          <View style={styles.mediaScrim} />
          <View style={styles.badgeRow}>
            <Text style={styles.mediaBadge}>{getVideoKicker(item)}</Text>
            <Text style={styles.mediaBadge}>{item.video.visibility === "public" ? "Public" : "Draft"}</Text>
          </View>
        </TouchableOpacity>
        <View style={styles.contentStack}>
          {item.actor ? (
            <Text style={styles.kicker}>{item.actor.displayName}</Text>
          ) : (
            <Text style={styles.kicker}>{getVideoKicker(item)}</Text>
          )}
          <Text style={styles.title} numberOfLines={2}>{item.video.title || "Creator Video"}</Text>
          {item.video.description ? (
            <Text style={styles.bodyText} numberOfLines={3}>{item.video.description}</Text>
          ) : (
            <Text style={styles.bodyText} numberOfLines={2}>{"Open this public creator video in the Chi'llywood Player."}</Text>
          )}
          <Text style={styles.meta}>{formatDate(item.video.updatedAt || item.video.createdAt)}</Text>
          <View style={styles.actionRow}>
            <TouchableOpacity style={styles.primaryAction} activeOpacity={0.86} onPress={() => onOpenCreatorVideo(item.video)}>
              <MaterialIcons name="play-arrow" size={17} color="#fff" />
              <Text style={styles.primaryActionText}>Watch</Text>
            </TouchableOpacity>
            {item.actor ? (
              <TouchableOpacity style={styles.secondaryAction} activeOpacity={0.86} onPress={() => onOpenActorChannel(item.actor!)}>
                <Text style={styles.secondaryActionText}>Platform</Text>
              </TouchableOpacity>
            ) : null}
          </View>
        </View>
      </View>
    );
  }

  if (item.type === "spectator_entry" || item.type === "public_profile_spectator_entry") {
    const title = String(item.discoveryItem.title ?? "").trim() || "Public live entry";
    const subtitle = String(item.discoveryItem.subtitle ?? "").trim();
    const schedule = formatDate(item.discoveryItem.starts_at ?? item.discoveryItem.published_at ?? item.discoveryItem.created_at);
    const actionLabel = item.discoveryItem.item_type === "creator_upload" ? "Open" : "Spectate";
    const routeLabel = item.discoveryItem.item_type === "creator_upload" ? "Player" : "Watch-only";

    return (
      <View style={styles.card}>
        <TouchableOpacity style={styles.mediaPreview} activeOpacity={0.88} onPress={() => onOpenDiscoveryItem(item.discoveryItem)}>
          {item.discoveryItem.thumbnail_url ? (
            <Image source={{ uri: item.discoveryItem.thumbnail_url }} style={styles.mediaImage} />
          ) : (
            <View style={styles.mediaFallback}>
              <MaterialIcons name="live-tv" size={28} color="#EAF0FF" />
            </View>
          )}
          <View style={styles.mediaScrim} />
          <View style={styles.badgeRow}>
            <Text style={[styles.mediaBadge, item.discoveryItem.live_state === "live" && styles.liveBadge]}>
              {getDiscoveryLiveLabel(item.discoveryItem)}
            </Text>
            <Text style={styles.mediaBadge}>{getDiscoveryAccessLabel(item.discoveryItem)}</Text>
          </View>
        </TouchableOpacity>
        <View style={styles.contentStack}>
          <Text style={styles.kicker}>{getDiscoveryKicker(item)}</Text>
          <Text style={styles.title} numberOfLines={2}>{title}</Text>
          {subtitle ? <Text style={styles.bodyText} numberOfLines={3}>{subtitle}</Text> : null}
          <Text style={styles.meta} numberOfLines={1}>
            {schedule || "Public metadata"} · {routeLabel}
          </Text>
          <View style={styles.actionRow}>
            <TouchableOpacity style={styles.primaryAction} activeOpacity={0.86} onPress={() => onOpenDiscoveryItem(item.discoveryItem)}>
              <MaterialIcons name="visibility" size={17} color="#fff" />
              <Text style={styles.primaryActionText}>{actionLabel}</Text>
            </TouchableOpacity>
            {item.actor ? (
              <TouchableOpacity style={styles.secondaryAction} activeOpacity={0.86} onPress={() => onOpenActorChannel(item.actor!)}>
                <Text style={styles.secondaryActionText}>Platform</Text>
              </TouchableOpacity>
            ) : null}
          </View>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.card}>
      <View style={styles.identityRow}>
        <View style={styles.activityIcon}>
          <MaterialIcons name={item.notification.isRead ? "notifications-none" : "notifications-active"} size={20} color="#F3F7FF" />
        </View>
        <View style={styles.identityCopy}>
          <Text style={styles.kicker}>ACTIVITY</Text>
          <Text style={styles.title} numberOfLines={2}>{item.notification.title}</Text>
          {item.notification.body ? (
            <Text style={styles.bodyText} numberOfLines={3}>{item.notification.body}</Text>
          ) : null}
          <Text style={styles.meta}>{formatDate(item.notification.createdAt)}</Text>
        </View>
      </View>
      {item.notification.target.supported ? (
        <View style={styles.actionRow}>
          <TouchableOpacity style={styles.secondaryAction} activeOpacity={0.86} onPress={() => onOpenNotification(item)}>
            <Text style={styles.secondaryActionText}>Open</Text>
          </TouchableOpacity>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.12)",
    backgroundColor: "rgba(9,12,18,0.96)",
    overflow: "hidden",
  },
  identityRow: {
    flexDirection: "row",
    gap: 12,
    padding: 16,
    paddingBottom: 10,
  },
  avatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    overflow: "hidden",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#171D2A",
  },
  avatarImage: {
    width: "100%",
    height: "100%",
  },
  avatarInitial: {
    color: "#F4F7FC",
    fontSize: 16,
    fontWeight: "900",
  },
  activityIcon: {
    width: 42,
    height: 42,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(220,20,60,0.24)",
  },
  identityCopy: {
    flex: 1,
    minWidth: 0,
  },
  contentStack: {
    padding: 16,
    gap: 8,
  },
  kicker: {
    color: "#8D98AE",
    fontSize: 10,
    fontWeight: "900",
    letterSpacing: 0.8,
    textTransform: "uppercase",
  },
  name: {
    color: "#F4F7FC",
    fontSize: 16,
    fontWeight: "900",
  },
  title: {
    color: "#F4F7FC",
    fontSize: 18,
    fontWeight: "900",
  },
  bodyText: {
    color: "#CED6E6",
    fontSize: 14,
    lineHeight: 20,
  },
  meta: {
    color: "#8D98AE",
    fontSize: 12,
    lineHeight: 17,
  },
  attachmentStack: {
    paddingHorizontal: 16,
    gap: 10,
  },
  mediaPreview: {
    minHeight: 178,
    backgroundColor: "#111723",
  },
  mediaImage: {
    ...StyleSheet.absoluteFillObject,
    width: "100%",
    height: "100%",
  },
  mediaFallback: {
    minHeight: 178,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#121824",
  },
  mediaScrim: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0,0,0,0.28)",
  },
  badgeRow: {
    position: "absolute",
    left: 12,
    right: 12,
    bottom: 12,
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  mediaBadge: {
    overflow: "hidden",
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 5,
    color: "#F3F7FF",
    backgroundColor: "rgba(14,18,28,0.82)",
    fontSize: 10,
    fontWeight: "900",
    textTransform: "uppercase",
  },
  liveBadge: {
    backgroundColor: "rgba(220,20,60,0.86)",
  },
  actionRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
    padding: 16,
    paddingTop: 8,
  },
  primaryAction: {
    minHeight: 40,
    borderRadius: 999,
    paddingHorizontal: 16,
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    gap: 6,
    backgroundColor: "#DC143C",
  },
  primaryActionText: {
    color: "#fff",
    fontSize: 13,
    fontWeight: "900",
  },
  secondaryAction: {
    minHeight: 40,
    borderRadius: 999,
    paddingHorizontal: 14,
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    gap: 6,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.14)",
    backgroundColor: "rgba(255,255,255,0.06)",
  },
  secondaryActionText: {
    color: "#E6ECFA",
    fontSize: 13,
    fontWeight: "800",
  },
});
