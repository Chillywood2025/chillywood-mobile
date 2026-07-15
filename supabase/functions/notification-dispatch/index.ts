import "jsr:@supabase/functions-js/edge-runtime.d.ts";

import { createClient } from "npm:@supabase/supabase-js@2.110.6";

import {
  IOS_NOTIFICATION_CATEGORIES,
  buildPlatformExpoPushMessage,
} from "../_shared/notification-payload.mjs";
import { reconcileRecentExpoPushReceipts } from "../_shared/expo-push-receipts.ts";

type JsonObject = Record<string, unknown>;
type SupabaseClientLike = ReturnType<typeof createClient<any>>;

type TriggerType =
  | "followed_creator_live"
  | "circle_friend_live"
  | "event_starts_soon"
  | "public_upload"
  | "replay_later";

type AuthenticatedUser = {
  id: string;
  email: string | null;
};

type DispatchPayload = {
  action?: unknown;
  sourceId?: unknown;
  source_id?: unknown;
  timingKey?: unknown;
  timing_key?: unknown;
  triggerType?: unknown;
  trigger_type?: unknown;
};

type DiscoveryItem = {
  access_type: string | null;
  channel_user_id: string | null;
  event_id: string | null;
  host_user_id: string | null;
  id: string;
  is_publicly_discoverable: boolean | null;
  item_type: string | null;
  live_state: string | null;
  media_id: string | null;
  moderation_status: string | null;
  owner_user_id: string | null;
  published_at: string | null;
  requires_premium_to_join: boolean | null;
  requires_subscription_to_watch: boolean | null;
  requires_ticket_to_watch: boolean | null;
  rights_status: string | null;
  room_id: string | null;
  source_id: string | null;
  source_type: string | null;
  title: string | null;
  visibility: string | null;
};

type CreatorEvent = {
  event_title: string | null;
  event_type: string | null;
  host_user_id: string | null;
  id: string;
  reminder_ready: boolean | null;
  replay_available_at: string | null;
  replay_policy: string | null;
  status: string | null;
  starts_at: string | null;
};

type Recipient = {
  id: string;
  reason: string;
};

type NotificationPreference = {
  circle_friend_live_enabled: boolean | null;
  event_starts_soon_enabled: boolean | null;
  followed_creator_live_enabled: boolean | null;
  in_app_enabled: boolean | null;
  public_upload_enabled: boolean | null;
  push_enabled: boolean | null;
  replay_later_enabled: boolean | null;
  user_id: string;
};

type PushToken = {
  id: string;
  platform: "android" | "ios";
  provider: string;
  token: string;
  token_fingerprint: string;
};

const CORS_HEADERS = {
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Origin": "*",
} as const;

const JSON_HEADERS = {
  ...CORS_HEADERS,
  "Content-Type": "application/json",
} as const;

const PUBLIC_SAFE_RIGHTS = new Set(["creator_owned", "chillywood_original", "licensed_for_public_stream"]);
const EXPO_PUSH_URL = "https://exp.host/--/api/v2/push/send";
const ANDROID_NOTIFICATION_CHANNEL_ID = "default";

const toText = (value: unknown) => String(value ?? "").trim();
const isIosOrdinaryPushRolloutEnabled = () => (
  toText(Deno.env.get("IOS_ORDINARY_PUSH_ROLLOUT_ENABLED")).toLowerCase() === "true"
);

const jsonResponse = (status: number, payload: JsonObject) =>
  new Response(JSON.stringify(payload), { headers: JSON_HEADERS, status });

const optionsResponse = () => new Response("ok", { headers: CORS_HEADERS, status: 200 });

const sanitizeErrorMessage = (error: unknown) => {
  const raw = error instanceof Error ? error.message : String(error ?? "Unknown notification dispatch error.");
  return raw
    .replace(/Bearer\s+[A-Za-z0-9._~+/=-]+/gi, "Bearer [redacted]")
    .replace(/Expo(nent)?PushToken\[[^\]]+\]/gi, "ExpoPushToken[redacted]")
    .replace(/[A-Za-z0-9._~+/=-]{48,}/g, "[redacted]")
    .slice(0, 260);
};

const readRequiredEnv = (key: string) => {
  const value = toText(Deno.env.get(key));
  if (!value) throw new Error(`Missing required environment variable: ${key}`);
  return value;
};

const parseJsonPayload = async (req: Request): Promise<{ value?: DispatchPayload; error?: Response }> => {
  const rawBody = await req.text();
  if (!rawBody.trim()) return { value: {} };

  try {
    const parsed = JSON.parse(rawBody) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return { error: jsonResponse(400, { error: "invalid_body" }) };
    }
    return { value: parsed as DispatchPayload };
  } catch {
    return { error: jsonResponse(400, { error: "invalid_json" }) };
  }
};

const normalizeTriggerType = (value: unknown): TriggerType | null => {
  const normalized = toText(value).toLowerCase();
  if (
    normalized === "followed_creator_live"
    || normalized === "circle_friend_live"
    || normalized === "event_starts_soon"
    || normalized === "public_upload"
    || normalized === "replay_later"
  ) {
    return normalized;
  }
  return null;
};

const notificationCategoryForTrigger = (triggerType: TriggerType) => {
  if (triggerType === "event_starts_soon") return "upcoming_event_reminder";
  if (triggerType === "public_upload" || triggerType === "replay_later") return "content_dropped";
  return "creator_went_live";
};

const preferenceFieldForTrigger = (triggerType: TriggerType): keyof NotificationPreference => {
  if (triggerType === "circle_friend_live") return "circle_friend_live_enabled";
  if (triggerType === "event_starts_soon") return "event_starts_soon_enabled";
  if (triggerType === "public_upload") return "public_upload_enabled";
  if (triggerType === "replay_later") return "replay_later_enabled";
  return "followed_creator_live_enabled";
};

async function readAuthenticatedOperator(req: Request) {
  const supabaseUrl = readRequiredEnv("SUPABASE_URL");
  const supabaseAnonKey = readRequiredEnv("SUPABASE_ANON_KEY");
  const serviceRoleKey = readRequiredEnv("SUPABASE_SERVICE_ROLE_KEY");
  const authHeader = req.headers.get("authorization") ?? "";
  if (!authHeader.toLowerCase().startsWith("bearer ")) {
    return { error: jsonResponse(401, { error: "missing_authorization" }) };
  }

  const bearer = authHeader.replace(/^Bearer\s+/i, "").trim();
  const adminClient = createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false } });
  if (bearer === serviceRoleKey) {
    return {
      adminClient,
      user: { email: null, id: "service_role" } satisfies AuthenticatedUser,
    };
  }

  const userClient = createClient(supabaseUrl, supabaseAnonKey, {
    auth: { persistSession: false },
    global: { headers: { Authorization: authHeader } },
  });
  const { data, error } = await userClient.auth.getUser();
  const userId = toText(data.user?.id);
  if (error || !userId) return { error: jsonResponse(401, { error: "unauthenticated" }) };

  const { data: membership, error: membershipError } = await adminClient
    .from("platform_role_memberships")
    .select("id")
    .eq("user_id", userId)
    .eq("status", "active")
    .in("role", ["owner", "operator"])
    .limit(1);

  if (membershipError || !membership?.length) {
    return { error: jsonResponse(403, { error: "operator_required" }) };
  }

  return {
    adminClient,
    user: { email: data.user?.email ?? null, id: userId } satisfies AuthenticatedUser,
  };
}

async function readDiscoveryItem(adminClient: SupabaseClientLike, sourceId: string) {
  const { data, error } = await adminClient
    .from("discovery_feed_items")
    .select("*")
    .eq("id", sourceId)
    .maybeSingle();

  if (error || !data) return null;
  return data as DiscoveryItem;
}

async function readCreatorEvent(adminClient: SupabaseClientLike, sourceId: string) {
  const { data, error } = await adminClient
    .from("creator_events")
    .select("id,host_user_id,event_title,event_type,status,starts_at,replay_policy,replay_available_at,reminder_ready")
    .eq("id", sourceId)
    .maybeSingle();

  if (error || !data) return null;
  return data as CreatorEvent;
}

const isPublicSafeDiscoveryItem = (item: DiscoveryItem) => {
  if (item.visibility !== "public") return "blocked_visibility";
  if (item.moderation_status !== "clean") return "blocked_moderation";
  if (!PUBLIC_SAFE_RIGHTS.has(toText(item.rights_status))) return "blocked_rights";
  if (!item.is_publicly_discoverable) return "not_publicly_discoverable";
  if (item.requires_ticket_to_watch) return "blocked_ticketed";
  if (item.requires_subscription_to_watch) return "blocked_subscription";
  if (item.access_type && item.access_type !== "public_free") return "blocked_access";
  return null;
};

const buildLiveTarget = (item: DiscoveryItem) => ({
  deepLink: `chillywoodmobile://spectate/${item.id}`,
  entityId: item.id,
  route: "/spectate/[itemId]",
});

const buildPlayerTarget = (item: DiscoveryItem) => ({
  deepLink: `chillywoodmobile://player/${toText(item.source_id || item.media_id)}`,
  entityId: toText(item.source_id || item.media_id),
  route: "/player/[id]",
});

const buildChannelTarget = (userId: string) => ({
  deepLink: `chillywoodmobile://channel/${userId}`,
  entityId: userId,
  route: "/channel/[userId]",
});

async function readFollowerRecipients(adminClient: SupabaseClientLike, channelUserId: string) {
  const { data } = await adminClient
    .from("channel_followers")
    .select("follower_user_id")
    .eq("channel_user_id", channelUserId);

  return (data ?? [])
    .map((row) => toText(row.follower_user_id))
    .filter(Boolean)
    .filter((id) => id !== channelUserId)
    .map((id) => ({ id, reason: "follow_relationship" }));
}

async function readCircleRecipients(adminClient: SupabaseClientLike, hostUserId: string) {
  const { data } = await adminClient
    .from("user_friendships")
    .select("user_low_id,user_high_id")
    .eq("status", "active")
    .or(`user_low_id.eq.${hostUserId},user_high_id.eq.${hostUserId}`);

  return (data ?? [])
    .map((row) => {
      const low = toText(row.user_low_id);
      const high = toText(row.user_high_id);
      return low === hostUserId ? high : low;
    })
    .filter(Boolean)
    .filter((id) => id !== hostUserId)
    .map((id) => ({ id, reason: "chilly_circle_active" }));
}

async function readReminderRecipients(adminClient: SupabaseClientLike, eventId: string, hostUserId: string) {
  const { data } = await adminClient
    .from("event_reminders")
    .select("user_id")
    .eq("event_id", eventId)
    .eq("status", "active");

  return (data ?? [])
    .map((row) => toText(row.user_id))
    .filter(Boolean)
    .filter((id) => id !== hostUserId)
    .map((id) => ({ id, reason: "event_reminder_active" }));
}

async function filterBlockedRecipients(adminClient: SupabaseClientLike, channelUserId: string, recipients: Recipient[]) {
  if (!channelUserId || !recipients.length) return recipients;
  const recipientIds = recipients.map((recipient) => recipient.id);
  const { data } = await adminClient
    .from("channel_audience_blocks")
    .select("blocked_user_id")
    .eq("channel_user_id", channelUserId)
    .in("blocked_user_id", recipientIds);

  const blocked = new Set((data ?? []).map((row) => toText(row.blocked_user_id)).filter(Boolean));
  return recipients.filter((recipient) => !blocked.has(recipient.id));
}

async function readPreferences(adminClient: SupabaseClientLike, userIds: string[]) {
  if (!userIds.length) return new Map<string, NotificationPreference>();
  const { data } = await adminClient
    .from("notification_preferences")
    .select("*")
    .in("user_id", userIds);

  const preferences = new Map<string, NotificationPreference>();
  (data ?? []).forEach((row) => {
    preferences.set(toText(row.user_id), row as NotificationPreference);
  });
  return preferences;
}

async function readPushTokens(adminClient: SupabaseClientLike, userId: string) {
  const readPlatformTokens = async (platform: PushToken["platform"]) => {
    const { data } = await adminClient
      .from("user_push_tokens")
      .select("id,platform,provider,token,token_fingerprint")
      .eq("user_id", userId)
      .eq("platform", platform)
      .eq("provider", "expo")
      .eq("enabled", true)
      .is("revoked_at", null)
      .order("last_seen_at", { ascending: false })
      .limit(5);
    return (data ?? []) as PushToken[];
  };

  const [androidTokens, iosTokens] = await Promise.all([
    readPlatformTokens("android"),
    readPlatformTokens("ios"),
  ]);
  return [...androidTokens, ...iosTokens];
}

async function insertDeliveryAttempt(adminClient: SupabaseClientLike, input: {
  errorCode?: string | null;
  errorMessage?: string | null;
  notificationId: string | null;
  provider: string;
  providerMessageId?: string | null;
  pushTokenId?: string | null;
  recipientUserId: string;
  status: "attempted" | "sent" | "failed" | "skipped";
}) {
  await adminClient.from("notification_delivery_attempts").insert({
    error_code: input.errorCode ?? null,
    error_message: input.errorMessage ? sanitizeErrorMessage(input.errorMessage) : null,
    notification_id: input.notificationId,
    provider: input.provider,
    provider_message_id: input.providerMessageId ?? null,
    push_token_id: input.pushTokenId ?? null,
    recipient_user_id: input.recipientUserId,
    status: input.status,
  });
}

async function sendExpoPush(message: JsonObject) {
  const response = await fetch(EXPO_PUSH_URL, {
    body: JSON.stringify(message),
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
    },
    method: "POST",
  });
  const body = await response.json().catch(() => ({}));
  return { body, ok: response.ok, status: response.status };
}

const buildNotificationCopy = (triggerType: TriggerType, title: string) => {
  if (triggerType === "followed_creator_live") {
    return {
      body: title ? `${title} is live now.` : "A creator you follow is live now.",
      title: "A creator you follow is live",
    };
  }
  if (triggerType === "circle_friend_live") {
    return {
      body: title ? `${title} is live now.` : "Someone in your Chi'lly Circle is live now.",
      title: "Chi'lly Circle live now",
    };
  }
  if (triggerType === "event_starts_soon") {
    return {
      body: title ? `${title} starts soon.` : "A saved event starts soon.",
      title: "Event starts soon",
    };
  }
  if (triggerType === "public_upload") {
    return {
      body: title ? `${title} is available to watch.` : "A creator you follow posted a public upload.",
      title: "New public upload",
    };
  }
  return {
    body: title ? `${title} is ready to watch.` : "A saved replay is ready.",
    title: "Replay is ready",
  };
};

async function buildDispatchPlan(adminClient: SupabaseClientLike, triggerType: TriggerType, sourceId: string) {
  if (triggerType === "event_starts_soon") {
    const event = await readCreatorEvent(adminClient, sourceId);
    if (!event) return { blockedReason: "event_not_found" };
    const hostUserId = toText(event.host_user_id);
    const startsAt = Date.parse(toText(event.starts_at));
    const now = Date.now();
    const fifteenMinutes = 15 * 60 * 1000;
    if (event.status !== "scheduled" || !event.reminder_ready || !Number.isFinite(startsAt)) {
      return { blockedReason: "event_not_reminder_ready" };
    }
    if (startsAt < now - 60 * 1000 || startsAt > now + fifteenMinutes) {
      return { blockedReason: "event_not_in_15_minute_window" };
    }
    const recipients = await filterBlockedRecipients(
      adminClient,
      hostUserId,
      await readReminderRecipients(adminClient, event.id, hostUserId),
    );
    return {
      actorUserId: hostUserId,
      eligibilityReason: "event_reminder_15_minutes_before_start",
      recipients,
      sourceType: "creator_event",
      target: buildChannelTarget(hostUserId),
      title: toText(event.event_title),
    };
  }

  const item = await readDiscoveryItem(adminClient, sourceId);
  if (!item) return { blockedReason: "discovery_item_not_found" };

  const blockedReason = isPublicSafeDiscoveryItem(item);
  if (blockedReason) return { blockedReason };

  const hostUserId = toText(item.host_user_id || item.channel_user_id || item.owner_user_id);
  const channelUserId = toText(item.channel_user_id || item.host_user_id || item.owner_user_id);
  if (!hostUserId) return { blockedReason: "missing_host_user_id" };

  if ((triggerType === "followed_creator_live" || triggerType === "circle_friend_live") && item.live_state !== "live") {
    return { blockedReason: "item_not_live" };
  }
  if (triggerType === "public_upload" && item.item_type !== "creator_upload" && item.source_type !== "creator_video") {
    return { blockedReason: "item_not_public_upload" };
  }
  if (triggerType === "replay_later" && item.item_type !== "replay_later" && item.live_state !== "replay_available_later") {
    return { blockedReason: "item_not_replay_later" };
  }

  const rawRecipients = triggerType === "circle_friend_live"
    ? await readCircleRecipients(adminClient, hostUserId)
    : await readFollowerRecipients(adminClient, channelUserId || hostUserId);
  const recipients = await filterBlockedRecipients(adminClient, channelUserId || hostUserId, rawRecipients);
  const target = triggerType === "public_upload" ? buildPlayerTarget(item) : buildLiveTarget(item);

  if (!target.entityId) return { blockedReason: "missing_target_id" };

  return {
    actorUserId: hostUserId,
    eligibilityReason: "public_safe_eligible",
    recipients,
    sourceType: toText(item.source_type || item.item_type) || "discovery_feed_item",
    target,
    title: toText(item.title),
  };
}

async function dispatchToRecipient(adminClient: SupabaseClientLike, input: {
  actorUserId: string;
  eligibilityReason: string;
  recipient: Recipient;
  sourceId: string;
  sourceType: string;
  target: { deepLink: string; entityId: string; route: string };
  timingKey: string;
  title: string;
  triggerType: TriggerType;
  preferences: NotificationPreference | undefined;
}) {
  const prefField = preferenceFieldForTrigger(input.triggerType);
  const preference = input.preferences;
  const pushAllowed = preference?.push_enabled !== false && preference?.[prefField] !== false;
  const inAppAllowed = preference?.in_app_enabled !== false && preference?.[prefField] !== false;
  const copy = buildNotificationCopy(input.triggerType, input.title);
  const dedupeKey = [
    input.triggerType,
    input.recipient.id,
    input.sourceType,
    input.sourceId,
    input.timingKey,
  ].join(":");

  const { error: dedupeError } = await adminClient.from("notification_event_dedupes").insert({
    dedupe_key: dedupeKey,
    recipient_user_id: input.recipient.id,
    source_id: input.sourceId,
    source_type: input.sourceType,
    timing_key: input.timingKey,
    trigger_type: input.triggerType,
  });
  if (dedupeError) {
    return {
      notificationId: null,
      pushSent: false,
      recipientUserId: input.recipient.id,
      status: "skipped",
      reason: "duplicate_prevented",
    };
  }

  let notificationId: string | null = null;
  if (inAppAllowed) {
    const { data, error } = await adminClient
      .from("notifications")
      .insert({
        actor_user_id: input.actorUserId || null,
        body: copy.body,
        category: notificationCategoryForTrigger(input.triggerType),
        deep_link: input.target.deepLink,
        eligibility_reason: input.eligibilityReason,
        notification_type: input.triggerType,
        priority: input.triggerType === "event_starts_soon" ? 3 : 5,
        source_id: input.sourceId,
        source_type: input.sourceType,
        status: "pending",
        target_context: { triggerType: input.triggerType, timingKey: input.timingKey },
        target_entity_id: input.target.entityId,
        target_route: input.target.route,
        title: copy.title,
        user_id: input.recipient.id,
      })
      .select("id")
      .maybeSingle();

    if (error || !data?.id) {
      await adminClient.from("notification_event_dedupes").delete().eq("dedupe_key", dedupeKey);
      return {
        notificationId: null,
        pushSent: false,
        recipientUserId: input.recipient.id,
        status: "failed",
        reason: "notification_insert_failed",
      };
    }
    notificationId = data.id;
    await adminClient.from("notification_event_dedupes").update({ notification_id: notificationId }).eq("dedupe_key", dedupeKey);
  }

  if (!pushAllowed) {
    await insertDeliveryAttempt(adminClient, {
      errorCode: "preference_disabled",
      notificationId,
      provider: "none",
      recipientUserId: input.recipient.id,
      status: "skipped",
    });
    return {
      notificationId,
      pushSent: false,
      recipientUserId: input.recipient.id,
      status: inAppAllowed ? "created" : "skipped",
      reason: "preference_disabled",
    };
  }

  await reconcileRecentExpoPushReceipts(adminClient, input.recipient.id);
  const tokens = await readPushTokens(adminClient, input.recipient.id);
  if (!tokens.length) {
    await insertDeliveryAttempt(adminClient, {
      errorCode: "no_enabled_push_token",
      notificationId,
      provider: "expo",
      recipientUserId: input.recipient.id,
      status: "skipped",
    });
    return {
      notificationId,
      pushSent: false,
      recipientUserId: input.recipient.id,
      status: inAppAllowed ? "created" : "skipped",
      reason: "no_enabled_push_token",
    };
  }

  const iosRolloutEnabled = isIosOrdinaryPushRolloutEnabled();
  const rolloutBlockedTokens = tokens.filter((token) => token.platform === "ios" && !iosRolloutEnabled);
  for (const token of rolloutBlockedTokens) {
    await insertDeliveryAttempt(adminClient, {
      errorCode: "ios_push_rollout_disabled",
      notificationId,
      provider: token.provider,
      pushTokenId: token.id,
      recipientUserId: input.recipient.id,
      status: "skipped",
    });
  }
  const deliverableTokens = tokens.filter((token) => token.platform === "android" || iosRolloutEnabled);
  if (!deliverableTokens.length) {
    return {
      notificationId,
      pushSent: false,
      recipientUserId: input.recipient.id,
      status: inAppAllowed ? "created" : "skipped",
      reason: "ios_push_rollout_disabled",
    };
  }

  let sentCount = 0;
  for (const token of deliverableTokens) {
    const pushResult = await sendExpoPush(buildPlatformExpoPushMessage({
      androidChannelId: ANDROID_NOTIFICATION_CHANNEL_ID,
      badge: 1,
      body: copy.body,
      categoryId: IOS_NOTIFICATION_CATEGORIES.activity,
      data: {
        notificationId,
        path: input.target.deepLink.replace(/^chillywoodmobile:\/\//u, "/"),
        triggerType: input.triggerType,
      },
      interruptionLevel: "active",
      platform: token.platform,
      priority: "high",
      sound: "default",
      title: copy.title,
      to: token.token,
    }));
    const firstTicket = Array.isArray((pushResult.body as { data?: unknown }).data)
      ? ((pushResult.body as { data: JsonObject[] }).data[0] ?? {})
      : ((pushResult.body as { data?: JsonObject }).data ?? {});
    const status = toText(firstTicket.status || (pushResult.ok ? "sent" : "failed"));
    const providerMessageId = toText(firstTicket.id) || null;
    const errorCode = toText(firstTicket.details && typeof firstTicket.details === "object"
      ? (firstTicket.details as JsonObject).error
      : firstTicket.message) || null;
    const sent = pushResult.ok && status === "ok";

    if (sent) sentCount += 1;
    await insertDeliveryAttempt(adminClient, {
      errorCode,
      errorMessage: sent ? null : toText(firstTicket.message) || `Expo push returned ${pushResult.status}`,
      notificationId,
      provider: token.provider,
      providerMessageId,
      pushTokenId: token.id,
      recipientUserId: input.recipient.id,
      status: sent ? "sent" : "failed",
    });

    if (errorCode === "DeviceNotRegistered") {
      await adminClient
        .from("user_push_tokens")
        .update({
          enabled: false,
          revoked_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq("id", token.id);
    }
  }

  if (notificationId) {
    await adminClient
      .from("notifications")
      .update({
        delivered_at: sentCount > 0 ? new Date().toISOString() : null,
        status: sentCount > 0 ? "sent" : "failed",
      })
      .eq("id", notificationId);
  }

  return {
    notificationId,
    pushSent: sentCount > 0,
    recipientUserId: input.recipient.id,
    status: sentCount > 0 ? "sent" : "failed",
    reason: sentCount > 0 ? "sent" : "provider_failed",
  };
}

Deno.serve(async (req): Promise<Response> => {
  if (req.method === "OPTIONS") return optionsResponse();
  if (req.method !== "POST") return jsonResponse(405, { error: "method_not_allowed" });

  try {
    const auth = await readAuthenticatedOperator(req);
    if ("error" in auth) {
      return auth.error ?? jsonResponse(500, { error: "authentication_result_invalid" });
    }

    const payload = await parseJsonPayload(req);
    if (payload.error) return payload.error;

    const body = payload.value ?? {};
    const triggerType = normalizeTriggerType(body.triggerType ?? body.trigger_type);
    const sourceId = toText(body.sourceId ?? body.source_id);
    const timingKey = toText(body.timingKey ?? body.timing_key) || "default";
    if (!triggerType) return jsonResponse(400, { error: "invalid_trigger_type" });
    if (!sourceId) return jsonResponse(400, { error: "missing_source_id" });

    const plan = await buildDispatchPlan(auth.adminClient, triggerType, sourceId);
    if ("blockedReason" in plan) {
      return jsonResponse(200, {
        blockedReason: plan.blockedReason,
        eligible: false,
        pushSent: false,
        triggerType,
      });
    }

    const uniqueRecipients = Array.from(new Map(plan.recipients.map((recipient) => [recipient.id, recipient])).values());
    const preferences = await readPreferences(auth.adminClient, uniqueRecipients.map((recipient) => recipient.id));
    const results = [];
    for (const recipient of uniqueRecipients) {
      results.push(await dispatchToRecipient(auth.adminClient, {
        actorUserId: plan.actorUserId,
        eligibilityReason: plan.eligibilityReason,
        preferences: preferences.get(recipient.id),
        recipient,
        sourceId,
        sourceType: plan.sourceType,
        target: plan.target,
        timingKey,
        title: plan.title,
        triggerType,
      }));
    }

    return jsonResponse(200, {
      createdCount: results.filter((result) => !!result.notificationId).length,
      eligible: true,
      pushSentCount: results.filter((result) => result.pushSent).length,
      recipientCount: uniqueRecipients.length,
      results,
      triggerType,
    });
  } catch (error) {
    return jsonResponse(500, { error: "notification_dispatch_error", message: sanitizeErrorMessage(error) });
  }
});
