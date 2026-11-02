/** Display enrichment only. Neither a notification nor its labels grant access. */
type Row = { id: string; notification_type?: string | null; target_route?: string | null; target_entity_id?: string | null; title?: string | null; body?: string | null; target_context?: unknown };
type Context = { notificationId: string; notificationType: string; targetRoute: string; targetId: string | null; creatorName: string | null; targetTitle: string | null; resolution: "resolved" | "unavailable"; liveState: "live" | "ended" | "unavailable" | null; discoveryHintKey: string | null };
const labels: Record<string, string> = {
  paid_video_unlocked: "Video purchase confirmed", watch_party_ticket_ready: "Party Room Pass confirmed",
  live_watch_party_access_ready: "Live Stage Pass confirmed", live_watch_party_seat_eligible: "Live Stage Seat Pass confirmed",
  live_watch_party_seat_approved: "Speaking seat approved", live_watch_party_seat_rejected: "Speaking seat request declined",
  channel_subscription_active: "Platform Subscription confirmed", vip_access_active: "VIP Pass confirmed",
  event_pass_active: "Event Pass confirmed", tip_sent_receipt: "Tip sent",
  paid_video_sold: "Video purchase received", watch_party_ticket_sold: "Party Room Pass sold",
  live_watch_party_access_sold: "Live Stage Pass sold", live_watch_party_seat_sold: "Live Stage Seat Pass sold",
  live_watch_party_seat_requested: "Speaking seat requested", channel_subscription_started: "Platform Subscription started",
  vip_pass_sold: "VIP Pass sold", event_pass_sold: "Event Pass sold", tip_received: "Tip received",
  public_upload: "New public video", replay_later: "Replay available", followed_creator_live: "Live notification",
  circle_friend_live: "Circle live notification", party_room_live: "Watch-Party notification",
  event_starts_soon: "Event reminder", watch_party_starts_soon: "Watch-Party reminder",
  creator_event_updated: "Event updated", creator_event_canceled: "Event canceled",
  auction_outbid: "Bid outbid", auction_won: "Auction won", auction_creator_award: "Auction award recorded",
  auction_checkout_deadline: "Auction checkout reminder", auction_payment_deadline: "Auction payment reminder",
  event_pass_event_starts_soon: "Event reminder", upcoming_event_reminder: "Event reminder",
  watch_party_ticket_room_starts_soon: "Watch-Party reminder", creator_went_live: "Live notification",
  content_dropped: "New content", creator_money_refunded: "Purchase refund recorded", creator_money_revoked: "Purchase access revoked",
  social_follow: "New follower", social_follow_request: "Follow request", social_follow_accepted: "Follow accepted",
  circle_request: "Circle request", circle_accepted: "Circle request accepted", circle_added: "Added to Circle",
  content_shared: "Title shared", circle_post: "Circle update", profile_post_liked: "Profile post liked",
  profile_comment: "Profile comment", profile_reply: "Profile reply", video_comment: "Video comment",
  video_reply: "Video reply", chat_message: "Chat message", live_room_member_joined: "Live attendance update",
};
const socialTypes = new Set(["social_follow", "social_follow_request", "social_follow_accepted", "circle_request", "circle_accepted", "circle_added", "content_shared", "circle_post", "profile_post_liked", "profile_comment", "profile_reply", "video_comment", "video_reply", "chat_message"]);
const record = (value: unknown): Record<string, unknown> | null => value !== null && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null;
const clean = (value: unknown) => typeof value === "string" ? value.replace(/[\u0000-\u001f\u007f-\u009f\u202a-\u202e\u2066-\u2069]/gu, " ").replace(/\s+/gu, " ").trim().slice(0, 160) || null : null;
export const needsNotificationDisplayContext = (row: Row) => Object.hasOwn(labels, row.notification_type ?? "");
const liveTypes = new Set(["followed_creator_live", "circle_friend_live", "live_room_member_joined"]);

/** Live discovery is sensitive: never render cached identity/room labels while its
 * current audience revalidation is unavailable, timed out, or still pending. */
export function redactUnverifiedLiveAttendance<T extends Row>(rows: T[]): T[] {
  return rows.map(row => liveTypes.has(row.notification_type ?? "")
    ? { ...row, title: labels[row.notification_type!], body: "Current availability could not be confirmed.",
      target_context: { live_discovery_state: "unavailable" } } : row);
}

function parseContext(value: unknown): Context | null {
  const item = record(value);
  if (!item || typeof item.notificationId !== "string" || typeof item.notificationType !== "string"
    || typeof item.targetRoute !== "string" || !(item.targetId === null || typeof item.targetId === "string")
    || !(item.resolution === "resolved" || item.resolution === "unavailable")) return null;
  return { notificationId: item.notificationId, notificationType: item.notificationType, targetRoute: item.targetRoute,
    targetId: item.targetId, discoveryHintKey: typeof item.discoveryHintKey === "string" && /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/iu.test(item.discoveryHintKey) ? item.discoveryHintKey.toLowerCase() : null, resolution: item.resolution, creatorName: clean(item.creatorName), targetTitle: clean(item.targetTitle),
    liveState: item.liveState === "live" || item.liveState === "ended" || item.liveState === "unavailable" ? item.liveState : null };
}

export function applyNotificationDisplayContext<T extends Row>(rows: T[], payload: unknown): T[] {
  const result = record(payload);
  if (!result || result.schemaVersion !== 1 || !Array.isArray(result.items) || result.items.length > 100) return rows;
  const contexts = new Map<string, Context>();
  const duplicates = new Set<string>();
  for (const raw of result.items) {
    const item = parseContext(raw);
    if (!item) continue;
    if (contexts.has(item.notificationId)) duplicates.add(item.notificationId);
    contexts.set(item.notificationId, item);
  }
  return rows.map(row => {
    const item = contexts.get(row.id), type = row.notification_type ?? "";
    if (!item || duplicates.has(row.id) || !needsNotificationDisplayContext(row)
      || item.notificationType !== type || item.targetRoute !== row.target_route
      || item.targetId !== (row.target_entity_id ?? null)) return row;
    const resolved = item.resolution === "resolved" && (!liveTypes.has(type) || item.liveState === "live" || item.liveState === "ended");
    const creator = resolved ? item.creatorName : null;
    const subject = resolved ? item.targetTitle : null;
    const detail = subject && creator ? `${subject} · ${creator}` : subject || creator;
    const ended = liveTypes.has(type) && item.liveState === "ended";
    const title = `${ended ? "Live ended" : labels[type]}${detail ? ` · ${detail}` : ""}`;
    const unavailable = socialTypes.has(type) ? "The person or item is no longer available to identify. Open details to check availability."
      : "The creator or item is no longer available to identify. Open details to check availability.";
    const body = ended ? "This live session has ended. This notification is history, not an invitation to join."
      : type.startsWith("auction_") ? `${detail ? `This auction concerns ${detail}.` : unavailable} ${type === "auction_outbid" ? "Bidding alone does not take payment." : "An award alone does not grant admission."} Open the auction for current status, payment and deadlines; do not start a duplicate payment.`
      : !detail ? unavailable
      : type === "tip_sent_receipt" ? `Your tip to ${creator || subject} was recorded. Tips do not unlock access.`
      : type === "channel_subscription_active" ? `Your subscription to ${creator || subject} was recorded. This is separate from Chi'llywood Premium. Open details for current status.`
      : type === "vip_access_active" ? `Your VIP Pass for ${creator || subject} was recorded. Open details for current access and expiry.`
      : type === "live_watch_party_seat_eligible" ? `Your Seat Pass for ${detail} was recorded. Payment alone does not approve speaking, camera or microphone; host approval is required. Open details for current status.`
      : type === "public_upload" ? `${creator || "This creator"} posted ${subject ? `“${subject}”` : "a public video"}.`
      : type === "creator_event_canceled" ? `${subject || "This event"}${creator ? ` by ${creator}` : ""} was canceled.`
      : type === "live_room_member_joined" ? `${creator} joined ${subject || "a live room"}. Open details to check current availability.`
      : `This update concerns ${detail}. Open details for current status and availability.`;
    return { ...row, title, body, ...(liveTypes.has(type) ? { target_context: {
      ...(resolved && item.discoveryHintKey ? { discovery_hint_key: item.discoveryHintKey } : {}),
      live_discovery_state: resolved ? item.liveState ?? "unavailable" : "unavailable",
      ...(ended ? { action_status: "expired" } : {}),
    } } : {}) };
  });
}
