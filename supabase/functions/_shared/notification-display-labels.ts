// Display labels only. These reads cannot grant access or select a destination.
export const notificationDisplayText = (value: unknown, limit = 120): string =>
  typeof value === "string"
    ? value.replace(/[\u0000-\u001f\u007f-\u009f\u202a-\u202e\u2066-\u2069]/gu, " ").replace(/\s+/gu, " ").trim().slice(0, limit)
    : "";

export async function readNotificationCreatorLabel(client: any, creatorId: string, recipientId: string): Promise<string> {
  if (!creatorId || !recipientId) return "";
  // Service workers have no viewer session. Do not use auth.uid()-bound
  // visibility helpers here, even when they accept a nominal viewer argument.
  for (const id of [creatorId, recipientId]) {
    const authority = await client.rpc("is_account_access_restricted", { p_user_id: id });
    if (authority.error) throw new Error("notification_creator_authority_unavailable");
    if (authority.data !== false) return "";
  }
  const owner = await client.rpc("is_platform_owner_user", { target_user_id: creatorId });
  if (owner.error) throw new Error("notification_creator_authority_unavailable");
  if (owner.data !== false) return "";
  const deletion = await client.rpc("account_deletion_public_hidden_reason", { p_user_id: creatorId });
  if (deletion.error) throw new Error("notification_creator_authority_unavailable");
  if (deletion.data != null) return "";
  const account = await client.auth.admin.getUserById(creatorId);
  if (account.error || account.data?.user?.id !== creatorId) return "";
  for (const [channelId, blockedId] of [[creatorId, recipientId], [recipientId, creatorId]]) {
    const blocks = await client.from("channel_audience_blocks").select("blocked_user_id")
      .eq("channel_user_id", channelId).eq("blocked_user_id", blockedId).limit(1);
    if (blocks.error) throw new Error("notification_creator_visibility_unavailable");
    if (!Array.isArray(blocks.data) || blocks.data.length) return "";
  }
  const result = await client.from("user_profiles").select("user_id,display_name,username,profile_access_visibility")
    .eq("user_id", creatorId).maybeSingle();
  if (result.error) throw new Error("notification_creator_label_unavailable");
  if (!result.data || result.data.user_id !== creatorId || result.data.profile_access_visibility !== "public") return "";
  const name = notificationDisplayText(result.data.display_name, 80);
  const handle = notificationDisplayText(result.data.username, 60);
  if (!name) return handle ? `@${handle}` : "";
  return handle && ![handle.toLowerCase(), `@${handle.toLowerCase()}`].includes(name.toLowerCase())
    ? `${name} (@${handle})` : name;
}

export function creatorMoneyNotificationCopy(type: string, creator: string, subject: string, category = "") {
  const name = notificationDisplayText(creator, 160) || "Creator details unavailable";
  const title = notificationDisplayText(subject);
  const detail = title ? `“${title}” · ${name}.` : name + ".";
  const status = "Open this item to check current access.";
  const sale = "Open Money Center Transactions for details and current status.";
  const names: Record<string, string> = {
    paid_video_unlocked: "Video purchase confirmed", watch_party_ticket_ready: "Party Room Pass purchased",
    live_watch_party_access_ready: "Live Stage Pass purchased", live_watch_party_seat_eligible: "Live Stage Seat Pass purchased",
    channel_subscription_active: "Platform Subscription started", vip_access_active: "VIP Pass purchased",
    event_pass_active: "Event Pass purchased", paid_video_sold: "Paid Video sold",
    watch_party_ticket_sold: "Party Room Pass sold", live_watch_party_access_sold: "Live Stage Pass sold",
    live_watch_party_seat_sold: "Live Stage Seat Pass sold", channel_subscription_started: "Platform Subscription started",
    vip_pass_sold: "VIP Pass sold", event_pass_sold: "Event Pass sold",
    creator_money_refunded: "Purchase refund recorded", creator_money_revoked: "Purchase access revoked",
  };
  if (type === "tip_sent_receipt") return { title: `Tip sent to ${name}`, body: `Your tip to ${name} was recorded. Tips do not unlock access.` };
  if (type === "tip_received") return { title: `Tip received · ${name}`, body: `A tip to ${name} was recorded. ${sale}` };
  const label = names[type];
  if (!label) return null;
  const isSale = category === "creator_money_sale" || type.endsWith("_sold") || type === "channel_subscription_started";
  const caveat = type === "live_watch_party_seat_eligible"
    ? "Host approval is still required for speaking, camera or microphone."
    : type === "channel_subscription_active" ? "This is a creator subscription, not Chi'llywood Premium."
    : type === "vip_access_active" ? "This VIP Pass applies only to this creator."
    : "";
  return { title: `${label} · ${title || name}`, body: `${detail} ${isSale ? sale : status}${caveat ? " " + caveat : ""}` };
}
