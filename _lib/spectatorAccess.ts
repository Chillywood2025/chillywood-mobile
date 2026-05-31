import type { DiscoveryFeedItem } from "./discoveryFeed";
import { getDiscoveryAccessLabel, isFeedItemPubliclyDiscoverable, isPublicSpectatorSafeRightsStatus } from "./discoveryFeed";

export type SpectatorAccessReason =
  | "metadata_available"
  | "playback_not_connected"
  | "spectator_not_enabled"
  | "protected_title_blocked"
  | "private_or_invite_only"
  | "ticket_required"
  | "subscription_required"
  | "premium_required_for_full_room"
  | "not_publicly_discoverable";

export type SpectatorAccessDecision = {
  eligible: boolean;
  reason: SpectatorAccessReason;
  accessType: string;
  rightsStatus: string;
  canShowMetadata: boolean;
  canShowPlayback: boolean;
  canJoinFullRoom: boolean;
  requiresPremium: boolean;
  requiresTicket: boolean;
  safeCopy: string;
};

type SpectatorItemInput = Pick<
  DiscoveryFeedItem,
  | "access_type"
  | "visibility"
  | "rights_status"
  | "is_publicly_discoverable"
  | "is_spectator_enabled"
  | "is_spectator_playback_enabled"
  | "requires_premium_to_join"
  | "requires_ticket_to_watch"
  | "requires_subscription_to_watch"
  | "moderation_status"
>;

export function resolveSpectatorAccess(
  item: SpectatorItemInput,
  options?: { viewerIsPremium?: boolean; hasTicket?: boolean; hasSubscription?: boolean; isInvited?: boolean },
): SpectatorAccessDecision {
  const accessLabel = getDiscoveryAccessLabel(item);
  const rightsStatus = String(item.rights_status ?? "").trim() || "unknown_block_public_spectator";
  const accessType = String(item.access_type ?? "").trim() || "private";
  const requiresPremium = !!item.requires_premium_to_join || accessType === "premium_only";
  const requiresTicket = !!item.requires_ticket_to_watch || accessType === "ticketed";

  const base = {
    accessType,
    rightsStatus,
    requiresPremium,
    requiresTicket,
    canShowPlayback: false,
  };

  if (!isFeedItemPubliclyDiscoverable(item)) {
    return {
      ...base,
      eligible: false,
      reason: "not_publicly_discoverable",
      canShowMetadata: false,
      canJoinFullRoom: false,
      safeCopy: "This item is not public discovery content.",
    };
  }

  if (!isPublicSpectatorSafeRightsStatus(rightsStatus)) {
    return {
      ...base,
      eligible: false,
      reason: "protected_title_blocked",
      canShowMetadata: false,
      canJoinFullRoom: false,
      safeCopy: "Public spectator video is blocked until rights are explicitly cleared.",
    };
  }

  if (item.visibility === "private" || accessType === "private" || accessType === "invite_only") {
    return {
      ...base,
      eligible: false,
      reason: "private_or_invite_only",
      canShowMetadata: false,
      canJoinFullRoom: !!options?.isInvited && !requiresPremium,
      safeCopy: "This room is not available for public spectator viewing.",
    };
  }

  if (requiresTicket && !options?.hasTicket) {
    return {
      ...base,
      eligible: true,
      reason: "ticket_required",
      canShowMetadata: true,
      canJoinFullRoom: false,
      safeCopy: "Ticketed viewing requires a backed purchase flow before full access.",
    };
  }

  if ((item.requires_subscription_to_watch || accessType === "subscriber_only_later") && !options?.hasSubscription) {
    return {
      ...base,
      eligible: true,
      reason: "subscription_required",
      canShowMetadata: true,
      canJoinFullRoom: false,
      safeCopy: "Subscriber-only viewing is not active yet.",
    };
  }

  if (!item.is_spectator_enabled) {
    return {
      ...base,
      eligible: true,
      reason: "spectator_not_enabled",
      canShowMetadata: true,
      canJoinFullRoom: requiresPremium ? !!options?.viewerIsPremium : false,
      safeCopy: `${accessLabel} metadata is available, but spectator mode is not enabled for playback.`,
    };
  }

  if (!item.is_spectator_playback_enabled) {
    return {
      ...base,
      eligible: true,
      reason: "playback_not_connected",
      canShowMetadata: true,
      canJoinFullRoom: requiresPremium ? !!options?.viewerIsPremium : false,
      safeCopy: "Spectator metadata is available. Broadcast playback is not connected yet.",
    };
  }

  return {
    ...base,
    eligible: true,
    reason: "metadata_available",
    canShowMetadata: true,
    canShowPlayback: false,
    canJoinFullRoom: requiresPremium ? !!options?.viewerIsPremium : false,
    safeCopy: "Spectator details are available. Playback remains blocked until the broadcast is ready.",
  };
}
