import type { Json, Tables, TablesInsert, TablesUpdate } from "../supabase/database.types";

import AsyncStorage from "@react-native-async-storage/async-storage";
import Constants from "expo-constants";
import * as Device from "expo-device";
import * as Application from "expo-application";
import * as Notifications from "expo-notifications";
import { Platform } from "react-native";

import {
  buildCreatorEventSummary,
  CREATOR_EVENTS_TABLE,
  type CreatorEventSummary,
  parseCreatorEventRow,
  readCreatorEventSummaries,
  readPublicEventSummaries,
} from "./liveEvents";
import { supabase } from "./supabase";
import {
  CHAT_CALL_INVITES_TABLE,
  normalizeChillyChatRingtoneKey,
  type ChillyChatRingtoneKey,
} from "./chillyChatCalls";
import {
  CHILLY_CHAT_CALL_CHANNEL_ID,
  CHILLY_CHAT_MESSAGE_CHANNEL_ID,
  CHILLY_CHAT_MISSED_CALL_CHANNEL_ID,
} from "./chillyChatCallSoundAssets";

export const NOTIFICATIONS_TABLE = "notifications";
export const EVENT_REMINDERS_TABLE = "event_reminders";

export type NotificationCategory =
  | "creator_went_live"
  | "upcoming_event_reminder"
  | "new_message"
  | "access_granted"
  | "content_dropped"
  | "reply_comment"
  | "moderation_notice"
  | "payment_access_confirmation"
  | "chilly_chat_call"
  | "chilly_chat_missed_call"
  | "creator_money_purchase"
  | "creator_money_sale";

export type CreatorMoneyBuyerNotificationType =
  | "paid_video_unlocked"
  | "watch_party_ticket_ready"
  | "channel_subscription_active"
  | "vip_access_active"
  | "event_pass_active"
  | "tip_sent_receipt";

export type CreatorMoneySellerNotificationType =
  | "paid_video_sold"
  | "watch_party_ticket_sold"
  | "channel_subscription_started"
  | "vip_pass_sold"
  | "event_pass_sold"
  | "tip_received";

export const CREATOR_MONEY_BUYER_NOTIFICATION_TYPES: readonly CreatorMoneyBuyerNotificationType[] = [
  "paid_video_unlocked",
  "watch_party_ticket_ready",
  "channel_subscription_active",
  "vip_access_active",
  "event_pass_active",
  "tip_sent_receipt",
] as const;

export const CREATOR_MONEY_SELLER_NOTIFICATION_TYPES: readonly CreatorMoneySellerNotificationType[] = [
  "paid_video_sold",
  "watch_party_ticket_sold",
  "channel_subscription_started",
  "vip_pass_sold",
  "event_pass_sold",
  "tip_received",
] as const;

export const NOTIFICATION_PRIORITY_ORDER = [
  "safety_moderation_emergency",
  "incoming_chilly_chat_voice_video_call",
  "active_room_session_notice",
  "event_or_watch_party_starts_soon",
  "creator_money_access_ready_or_sale_support",
  "chat_message",
  "general_activity",
] as const;

export const INTERRUPTIVE_NOTIFICATION_PRIORITIES = [
  "safety_moderation_emergency",
  "incoming_chilly_chat_voice_video_call",
] as const;

export type DiscoveryActivityTriggerKey =
  | "followed_creator_went_live"
  | "chilly_circle_friend_went_live"
  | "channel_scheduled_public_event"
  | "watch_party_starts_soon"
  | "followed_channel_public_upload"
  | "replay_available_later";

export type DiscoveryActivityTriggerFoundation = {
  key: DiscoveryActivityTriggerKey;
  notificationCategory: NotificationCategory;
  targetRoute: NotificationTargetRoute;
  sendingConnected: false;
  requiredFilters: readonly string[];
};

export const DISCOVERY_ACTIVITY_TRIGGER_FOUNDATION: readonly DiscoveryActivityTriggerFoundation[] = [
  {
    key: "followed_creator_went_live",
    notificationCategory: "creator_went_live",
    targetRoute: "/channel/[userId]",
    sendingConnected: false,
    requiredFilters: ["follow_relationship", "blocked_relationships", "room_visibility", "moderation_status"],
  },
  {
    key: "chilly_circle_friend_went_live",
    notificationCategory: "creator_went_live",
    targetRoute: "/profile/[userId]",
    sendingConnected: false,
    requiredFilters: ["mutual_chilly_circle", "profile_privacy", "blocked_relationships", "room_visibility"],
  },
  {
    key: "channel_scheduled_public_event",
    notificationCategory: "upcoming_event_reminder",
    targetRoute: "/channel/[userId]",
    sendingConnected: false,
    requiredFilters: ["follow_relationship", "event_public_status", "blocked_relationships", "notification_permission"],
  },
  {
    key: "watch_party_starts_soon",
    notificationCategory: "upcoming_event_reminder",
    targetRoute: "/watch-party/[partyId]",
    sendingConnected: false,
    requiredFilters: ["room_visibility", "premium_or_ticket_access", "blocked_relationships", "notification_permission"],
  },
  {
    key: "followed_channel_public_upload",
    notificationCategory: "content_dropped",
    targetRoute: "/player/[id]",
    sendingConnected: false,
    requiredFilters: ["follow_relationship", "public_video", "moderation_status", "blocked_relationships"],
  },
  {
    key: "replay_available_later",
    notificationCategory: "content_dropped",
    targetRoute: "/channel/[userId]",
    sendingConnected: false,
    requiredFilters: ["replay_rights", "public_visibility", "blocked_relationships", "notification_permission"],
  },
] as const;

export const readDiscoveryActivityTriggerFoundation = () => DISCOVERY_ACTIVITY_TRIGGER_FOUNDATION;

export type NotificationTargetRoute =
  | "/profile/[userId]"
  | "/channel/[userId]"
  | "/channel-settings"
  | "/channel-studio"
  | "/settings"
  | "/chat"
  | "/chat/[threadId]"
  | "/subscribe"
  | "/watch-party"
  | "/watch-party/[partyId]"
  | "/watch-party/live-stage/[partyId]"
  | "/channel-subscription/[creatorId]"
  | "/vip-pass/[creatorId]"
  | "/event/[eventId]"
  | "/spectate/[itemId]"
  | "/title/[id]"
  | "/player/[id]"
  | "/admin";

export type NormalizedNotificationTarget = {
  route: NotificationTargetRoute | "unknown";
  rawRoute: string;
  entityId: string | null;
  context: Json;
  supported: boolean;
};

export type NotificationRecord = {
  id: string;
  userId: string;
  category: NotificationCategory;
  notificationType: string;
  title: string;
  body: string | null;
  deepLink: string | null;
  status: string;
  target: NormalizedNotificationTarget;
  actionGroup: NotificationActionGroup;
  actionLabel: string;
  actionStatus: NotificationLifecycleStatus;
  readAt: string | null;
  dismissedAt: string | null;
  createdAt: string;
  deliveredAt: string | null;
  isRead: boolean;
  isDismissed: boolean;
  isImportant: boolean;
  isActionable: boolean;
  isExpired: boolean;
};

export type NotificationSummary = {
  totalCount: number;
  unreadCount: number;
  undismissedCount: number;
  latestCreatedAt: string | null;
  categories: NotificationCategory[];
};

export type NotificationActionName = "mark_read" | "dismiss" | "set_event_reminder";
export type NotificationActionStatus = "completed" | "noop" | "blocked" | "error";
export type NotificationActionReason =
  | "allowed"
  | "signed_out"
  | "missing_notification_id"
  | "missing_event_id"
  | "notification_not_found"
  | "event_not_found"
  | "already_read"
  | "already_dismissed"
  | "reminder_not_ready"
  | "insert_failed"
  | "update_failed";

export type EventReminderEnrollmentState = "active" | "canceled" | "not_enrolled" | "not_ready" | "signed_out";

export type EventReminderEnrollment = {
  eventId: string;
  viewerUserId: string | null;
  state: EventReminderEnrollmentState;
  reminderReady: boolean;
  canEnroll: boolean;
  reason: "ready" | "not_ready" | "signed_out" | "event_not_found";
  updatedAt: string | null;
};

export type NotificationActionResult = {
  action: NotificationActionName;
  status: NotificationActionStatus;
  reason: NotificationActionReason;
  message: string;
  notificationId: string | null;
  eventId: string | null;
  viewerUserId: string | null;
  reminderState: EventReminderEnrollmentState | null;
};

export type CreatorEventReminderSummary = {
  event: CreatorEventSummary;
  activeReminderCount: number;
  canceledReminderCount: number;
  totalReminderCount: number;
};

export type PublicEventReminderSummary = {
  event: CreatorEventSummary;
  enrollment: EventReminderEnrollment;
};

type NotificationRow = Tables<"notifications">;
type NotificationUpdate = TablesUpdate<"notifications">;
type CallInviteStatusRow = Pick<Tables<"chat_call_invites">, "id" | "status" | "expires_at">;
type EventReminderRow = Tables<"event_reminders">;
type EventReminderInsert = TablesInsert<"event_reminders">;
type EventReminderUpdate = TablesUpdate<"event_reminders">;
type CreatorEventRow = Tables<"creator_events">;
type NotificationPreferenceRow = Tables<"notification_preferences">;
type NotificationPreferenceInsert = TablesInsert<"notification_preferences">;
type NotificationPreferenceUpdate = TablesUpdate<"notification_preferences">;

const CREATOR_EVENT_NOTIFICATION_SELECT =
  "id,host_user_id,event_title,event_type,status,starts_at,ends_at,linked_title_id,replay_policy,replay_available_at,replay_expires_at,reminder_ready,created_at,updated_at";

export type NotificationActionGroup =
  | "action_required"
  | "access_ready"
  | "creator_sale"
  | "chat_call"
  | "event_reminder"
  | "general_activity"
  | "history";

export type NotificationLifecycleStatus =
  | "active"
  | "handled"
  | "expired"
  | "revoked"
  | "dismissed";

const IMPORTANT_NOTIFICATION_CATEGORIES: readonly NotificationCategory[] = [
  "creator_money_purchase",
  "creator_money_sale",
  "chilly_chat_call",
  "chilly_chat_missed_call",
  "upcoming_event_reminder",
  "moderation_notice",
  "access_granted",
  "payment_access_confirmation",
] as const;

const CREATOR_MONEY_BUYER_ACTION_LABELS: Record<string, string> = {
  paid_video_unlocked: "Watch video",
  watch_party_ticket_ready: "Enter room",
  channel_subscription_active: "View subscription",
  vip_access_active: "View VIP",
  event_pass_active: "View event",
  tip_sent_receipt: "View creator",
};

const CREATOR_MONEY_CREATOR_ACTION_LABELS: Record<string, string> = {
  paid_video_sold: "View transaction",
  watch_party_ticket_sold: "View transaction",
  channel_subscription_started: "View transaction",
  vip_pass_sold: "View transaction",
  event_pass_sold: "View transaction",
  tip_received: "View transaction",
};

const normalizeJsonRecord = (value: unknown): Record<string, unknown> => (
  !!value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {}
);

const normalizeText = (value: unknown) => String(value ?? "").trim();
const isDefined = <T>(value: T | null): value is T => value !== null;

const normalizeIsoTimestamp = (value: unknown): string | null => {
  const normalized = normalizeText(value);
  if (!normalized) return null;
  const parsed = Date.parse(normalized);
  if (!Number.isFinite(parsed)) return null;
  return new Date(parsed).toISOString();
};

const normalizeNotificationCategory = (value: unknown): NotificationCategory => {
  const normalized = normalizeText(value).toLowerCase();
  if (
    normalized === "creator_went_live"
    || normalized === "upcoming_event_reminder"
    || normalized === "new_message"
    || normalized === "access_granted"
    || normalized === "content_dropped"
    || normalized === "reply_comment"
    || normalized === "moderation_notice"
    || normalized === "payment_access_confirmation"
    || normalized === "chilly_chat_call"
    || normalized === "chilly_chat_missed_call"
    || normalized === "creator_money_purchase"
    || normalized === "creator_money_sale"
  ) {
    return normalized;
  }
  return "new_message";
};

const normalizeTargetRoute = (value: unknown): NotificationTargetRoute | "unknown" => {
  const normalized = normalizeText(value);
  if (
    normalized === "/profile/[userId]"
    || normalized === "/channel/[userId]"
    || normalized === "/channel-settings"
    || normalized === "/channel-studio"
    || normalized === "/settings"
    || normalized === "/chat"
    || normalized === "/chat/[threadId]"
    || normalized === "/subscribe"
    || normalized === "/watch-party"
    || normalized === "/watch-party/[partyId]"
    || normalized === "/watch-party/live-stage/[partyId]"
    || normalized === "/channel-subscription/[creatorId]"
    || normalized === "/vip-pass/[creatorId]"
    || normalized === "/event/[eventId]"
    || normalized === "/spectate/[itemId]"
    || normalized === "/title/[id]"
    || normalized === "/player/[id]"
    || normalized === "/admin"
  ) {
    return normalized;
  }
  return "unknown";
};

export const normalizeNotificationTarget = (input: {
  targetRoute: unknown;
  targetEntityId?: unknown;
  targetContext?: Json;
}): NormalizedNotificationTarget => {
  const rawRoute = normalizeText(input.targetRoute);
  const route = normalizeTargetRoute(rawRoute);
  return {
    route,
    rawRoute,
    entityId: normalizeText(input.targetEntityId) || null,
    context: input.targetContext ?? {},
    supported: route !== "unknown" && !!rawRoute,
  };
};

const readContextText = (context: Record<string, unknown>, ...keys: string[]) => {
  for (const key of keys) {
    const value = normalizeText(context[key]);
    if (value) return value;
  }
  return "";
};

const readContextTimestamp = (context: Record<string, unknown>, ...keys: string[]) => {
  for (const key of keys) {
    const value = normalizeIsoTimestamp(context[key]);
    if (value) return value;
  }
  return null;
};

const isTerminalNotificationStatus = (status: string) => (
  status === "handled"
  || status === "resolved"
  || status === "answered"
  || status === "declined"
  || status === "missed_handled"
);

export function classifyNotificationAction(input: {
  category: NotificationCategory;
  notificationType: string;
  status: string;
  targetContext?: Json;
  dismissedAt?: string | null;
}): {
  actionGroup: NotificationActionGroup;
  actionLabel: string;
  actionStatus: NotificationLifecycleStatus;
  isImportant: boolean;
  isActionable: boolean;
  isExpired: boolean;
} {
  const context = normalizeJsonRecord(input.targetContext);
  const notificationType = normalizeText(input.notificationType);
  const normalizedStatus = normalizeText(input.status).toLowerCase();
  const contextStatus = readContextText(context, "action_status", "actionStatus", "lifecycle_status", "lifecycleStatus", "status").toLowerCase();
  const effectiveStatus = contextStatus || normalizedStatus;
  const expiresAt = readContextTimestamp(context, "action_expires_at", "actionExpiresAt", "expires_at", "expiresAt", "ends_at", "endsAt");
  const expiredByTime = !!expiresAt && Date.parse(expiresAt) <= Date.now();

  let actionStatus: NotificationLifecycleStatus = "active";
  if (input.dismissedAt || normalizedStatus === "dismissed" || contextStatus === "dismissed") {
    actionStatus = "dismissed";
  } else if (expiredByTime || effectiveStatus === "expired" || effectiveStatus === "canceled" || effectiveStatus === "cancelled") {
    actionStatus = "expired";
  } else if (effectiveStatus === "revoked" || effectiveStatus === "refunded" || effectiveStatus === "reversed") {
    actionStatus = "revoked";
  } else if (isTerminalNotificationStatus(effectiveStatus)) {
    actionStatus = "handled";
  }

  let actionGroup: NotificationActionGroup = "general_activity";
  let actionLabel = "Open";

  if (input.category === "creator_money_purchase") {
    actionGroup = "access_ready";
    actionLabel = CREATOR_MONEY_BUYER_ACTION_LABELS[notificationType] ?? "View";
  } else if (input.category === "creator_money_sale") {
    actionGroup = "creator_sale";
    actionLabel = CREATOR_MONEY_CREATOR_ACTION_LABELS[notificationType] ?? "View transaction";
  } else if (input.category === "chilly_chat_call") {
    actionGroup = "chat_call";
    actionLabel = actionStatus === "active" ? "Answer or reply" : "Open Chat";
  } else if (input.category === "chilly_chat_missed_call") {
    actionGroup = "chat_call";
    actionLabel = "Open Chat";
  } else if (input.category === "upcoming_event_reminder" || notificationType === "event_starts_soon" || notificationType === "watch_party_starts_soon") {
    actionGroup = "event_reminder";
    actionLabel = notificationType === "watch_party_starts_soon" ? "Enter room" : "Open event";
  } else if (input.category === "moderation_notice") {
    actionGroup = "action_required";
    actionLabel = "Review notice";
  } else if (input.category === "access_granted" || input.category === "payment_access_confirmation") {
    actionGroup = "access_ready";
    actionLabel = "Open";
  }

  const baseImportant = IMPORTANT_NOTIFICATION_CATEGORIES.includes(input.category)
    || notificationType === "event_starts_soon"
    || notificationType === "watch_party_starts_soon";
  const isExpired = actionStatus === "expired" || actionStatus === "revoked";
  const isActionable = baseImportant && actionStatus === "active";
  const isImportant = baseImportant && actionStatus === "active";

  return {
    actionGroup: isExpired || actionStatus === "handled" ? "history" : actionGroup,
    actionLabel,
    actionStatus,
    isImportant,
    isActionable,
    isExpired,
  };
}

const CALL_NOTIFICATION_STALE_GRACE_MS = 60_000;

const readCallInviteIdFromNotificationRow = (row: NotificationRow) => {
  const context = normalizeJsonRecord(row.target_context);
  return (
    normalizeText(row.source_id)
    || readContextText(context, "callInviteId", "call_invite_id", "inviteId")
  );
};

const isActiveCallNotificationRow = (row: NotificationRow) => {
  if (normalizeNotificationCategory(row.category) !== "chilly_chat_call") return false;
  if (row.dismissed_at) return false;
  const context = normalizeJsonRecord(row.target_context);
  const status = normalizeText(row.status).toLowerCase();
  const contextStatus = readContextText(context, "action_status", "actionStatus", "lifecycle_status", "lifecycleStatus", "status").toLowerCase();
  const effectiveStatus = contextStatus || status;
  if (status === "dismissed" || contextStatus === "dismissed") return false;
  if (effectiveStatus === "expired" || effectiveStatus === "canceled" || effectiveStatus === "cancelled") return false;
  if (effectiveStatus === "revoked" || isTerminalNotificationStatus(effectiveStatus)) return false;
  return true;
};

async function reconcileChillyChatCallNotificationRows(
  rows: NotificationRow[],
  viewerUserId: string,
): Promise<NotificationRow[]> {
  const callRows = rows.filter(isActiveCallNotificationRow);
  if (!callRows.length) return rows;

  const nowMs = Date.now();
  const nowIso = new Date(nowMs).toISOString();
  const inviteIds = Array.from(new Set(callRows.map(readCallInviteIdFromNotificationRow).filter(Boolean)));
  const inviteStatusById = new Map<string, CallInviteStatusRow>();

  if (inviteIds.length) {
    const { data } = await supabase
      .from(CHAT_CALL_INVITES_TABLE)
      .select("id,status,expires_at")
      .in("id", inviteIds)
      .returns<CallInviteStatusRow[]>();
    (data ?? []).forEach((invite) => {
      const inviteId = normalizeText(invite.id);
      if (inviteId) inviteStatusById.set(inviteId, invite);
    });
  }

  const staleIds = new Set<string>();
  const nextRows = rows.map((row) => {
    if (!isActiveCallNotificationRow(row)) return row;

    const context = normalizeJsonRecord(row.target_context);
    const inviteId = readCallInviteIdFromNotificationRow(row);
    const invite = inviteId ? inviteStatusById.get(inviteId) : null;
    const contextExpiresAt = readContextTimestamp(context, "action_expires_at", "actionExpiresAt", "expires_at", "expiresAt", "ends_at", "endsAt");
    const rowCreatedAt = normalizeIsoTimestamp(row.created_at);
    const inviteExpiresAt = normalizeIsoTimestamp(invite?.expires_at);
    const inviteStatus = normalizeText(invite?.status).toLowerCase();
    const contextExpired = !!contextExpiresAt && Date.parse(contextExpiresAt) <= nowMs;
    const inviteExpired = !!inviteExpiresAt && Date.parse(inviteExpiresAt) <= nowMs;
    const rowAgeMs = rowCreatedAt ? nowMs - Date.parse(rowCreatedAt) : CALL_NOTIFICATION_STALE_GRACE_MS + 1;
    const missingInviteExpired = !invite && (contextExpired || rowAgeMs >= CALL_NOTIFICATION_STALE_GRACE_MS);
    const inviteNoLongerRinging = !!invite && (inviteStatus !== "ringing" || inviteExpired);

    if (!contextExpired && !missingInviteExpired && !inviteNoLongerRinging) return row;

    const id = normalizeText(row.id);
    if (id) staleIds.add(id);
    return {
      ...row,
      read_at: row.read_at ?? nowIso,
      status: "handled",
      target_context: {
        ...context,
        action_status: inviteStatus === "declined" ? "declined" : inviteStatus === "missed" ? "missed_handled" : "handled",
      } as Json,
    } satisfies NotificationRow;
  });

  if (staleIds.size) {
    try {
      await supabase
        .from(NOTIFICATIONS_TABLE)
        .update({
          read_at: nowIso,
          status: "handled",
        } satisfies NotificationUpdate)
        .eq("user_id", viewerUserId)
        .eq("category", "chilly_chat_call")
        .is("dismissed_at", null)
        .in("id", Array.from(staleIds));
    } catch {
      // Local reconciliation still prevents stale rows from rendering as actionable.
    }
  }

  return nextRows;
}

const parseNotificationRow = (row: NotificationRow | null): NotificationRecord | null => {
  if (!row) return null;

  const id = normalizeText(row.id);
  const userId = normalizeText(row.user_id);
  const title = normalizeText(row.title);
  if (!id || !userId || !title) return null;

  const target = normalizeNotificationTarget({
    targetRoute: row.target_route,
    targetEntityId: row.target_entity_id,
    targetContext: row.target_context,
  });
  const readAt = normalizeIsoTimestamp(row.read_at);
  const dismissedAt = normalizeIsoTimestamp(row.dismissed_at);
  const notificationType = normalizeText(row.notification_type) || normalizeNotificationCategory(row.category);
  const status = normalizeText(row.status) || "pending";
  const action = classifyNotificationAction({
    category: normalizeNotificationCategory(row.category),
    notificationType,
    status,
    targetContext: row.target_context,
    dismissedAt,
  });

  return {
    id,
    userId,
    category: normalizeNotificationCategory(row.category),
    notificationType,
    title,
    body: normalizeText(row.body) || null,
    deepLink: normalizeText(row.deep_link) || null,
    status,
    target,
    actionGroup: action.actionGroup,
    actionLabel: action.actionLabel,
    actionStatus: action.actionStatus,
    readAt,
    dismissedAt,
    createdAt: normalizeIsoTimestamp(row.created_at) ?? new Date().toISOString(),
    deliveredAt: normalizeIsoTimestamp(row.delivered_at),
    isRead: !!readAt,
    isDismissed: !!dismissedAt,
    isImportant: action.isImportant,
    isActionable: action.isActionable,
    isExpired: action.isExpired,
  };
};

const parseEventReminderRow = (row: EventReminderRow | null): EventReminderRow | null => {
  if (!row) return null;
  const id = normalizeText(row.id);
  const eventId = normalizeText(row.event_id);
  const userId = normalizeText(row.user_id);
  if (!id || !eventId || !userId) return null;
  return row;
};

const buildNotificationActionResult = (input: {
  action: NotificationActionName;
  status: NotificationActionStatus;
  reason: NotificationActionReason;
  message: string;
  notificationId?: string | null;
  eventId?: string | null;
  viewerUserId?: string | null;
  reminderState?: EventReminderEnrollmentState | null;
}): NotificationActionResult => ({
  action: input.action,
  status: input.status,
  reason: input.reason,
  message: input.message,
  notificationId: normalizeText(input.notificationId) || null,
  eventId: normalizeText(input.eventId) || null,
  viewerUserId: normalizeText(input.viewerUserId) || null,
  reminderState: input.reminderState ?? null,
});

async function readSessionUserId(explicitUserId?: string): Promise<string | null> {
  const normalizedExplicitUserId = normalizeText(explicitUserId);
  if (normalizedExplicitUserId) return normalizedExplicitUserId;

  const { data } = await supabase.auth.getSession();
  return normalizeText(data.session?.user?.id) || null;
}

async function readNotificationRowById(notificationId: string, viewerUserId: string): Promise<NotificationRow | null> {
  const normalizedNotificationId = normalizeText(notificationId);
  if (!normalizedNotificationId || !viewerUserId) return null;

  const { data, error } = await supabase
    .from(NOTIFICATIONS_TABLE)
    .select("*")
    .eq("id", normalizedNotificationId)
    .eq("user_id", viewerUserId)
    .returns<NotificationRow>()
    .maybeSingle();

  if (error || !data) return null;
  return data;
}

async function readReminderEventSummaryById(eventId: string): Promise<CreatorEventSummary | null> {
  const normalizedEventId = normalizeText(eventId);
  if (!normalizedEventId) return null;

  const { data, error } = await supabase
    .from(CREATOR_EVENTS_TABLE)
    .select(CREATOR_EVENT_NOTIFICATION_SELECT)
    .eq("id", normalizedEventId)
    .returns<CreatorEventRow>()
    .maybeSingle();

  if (error || !data) return null;
  const parsed = parseCreatorEventRow(data);
  return parsed ? buildCreatorEventSummary(parsed) : null;
}

async function readEventReminderRow(
  eventId: string,
  viewerUserId: string,
): Promise<EventReminderRow | null> {
  const normalizedEventId = normalizeText(eventId);
  if (!normalizedEventId || !viewerUserId) return null;

  const { data, error } = await supabase
    .from(EVENT_REMINDERS_TABLE)
    .select("*")
    .eq("event_id", normalizedEventId)
    .eq("user_id", viewerUserId)
    .returns<EventReminderRow>()
    .maybeSingle();

  if (error || !data) return null;
  return parseEventReminderRow(data);
}

const buildReminderEnrollment = (
  eventId: string,
  viewerUserId: string | null,
  event: CreatorEventSummary | null,
  row: EventReminderRow | null,
): EventReminderEnrollment => {
  if (!viewerUserId) {
    return {
      eventId: normalizeText(eventId),
      viewerUserId: null,
      state: "signed_out",
      reminderReady: !!event?.reminder.reminderReady,
      canEnroll: false,
      reason: "signed_out",
      updatedAt: null,
    };
  }

  if (!event) {
    return {
      eventId: normalizeText(eventId),
      viewerUserId,
      state: "not_ready",
      reminderReady: false,
      canEnroll: false,
      reason: "event_not_found",
      updatedAt: null,
    };
  }

  if (!event.reminder.canSetReminder) {
    return {
      eventId: event.id,
      viewerUserId,
      state: "not_ready",
      reminderReady: false,
      canEnroll: false,
      reason: "not_ready",
      updatedAt: null,
    };
  }

  if (!row) {
    return {
      eventId: event.id,
      viewerUserId,
      state: "not_enrolled",
      reminderReady: true,
      canEnroll: true,
      reason: "ready",
      updatedAt: null,
    };
  }

  const state = normalizeText(row.status).toLowerCase() === "canceled" ? "canceled" : "active";
  return {
    eventId: event.id,
    viewerUserId,
    state,
    reminderReady: true,
    canEnroll: true,
    reason: "ready",
    updatedAt: normalizeIsoTimestamp(row.updated_at),
  };
};

async function readEventReminderRowsForEvents(eventIds: string[]): Promise<EventReminderRow[]> {
  const normalizedEventIds = Array.from(new Set(eventIds.map((value) => normalizeText(value)).filter(Boolean)));
  if (!normalizedEventIds.length) return [];

  const { data, error } = await supabase
    .from(EVENT_REMINDERS_TABLE)
    .select("*")
    .in("event_id", normalizedEventIds)
    .returns<EventReminderRow[]>();

  if (error || !data) return [];
  return data
    .map((row) => parseEventReminderRow(row))
    .filter(isDefined);
}

async function readViewerEventReminderRows(eventIds: string[], viewerUserId: string): Promise<EventReminderRow[]> {
  const normalizedEventIds = Array.from(new Set(eventIds.map((value) => normalizeText(value)).filter(Boolean)));
  if (!normalizedEventIds.length || !viewerUserId) return [];

  const { data, error } = await supabase
    .from(EVENT_REMINDERS_TABLE)
    .select("*")
    .eq("user_id", viewerUserId)
    .in("event_id", normalizedEventIds)
    .returns<EventReminderRow[]>();

  if (error || !data) return [];
  return data
    .map((row) => parseEventReminderRow(row))
    .filter(isDefined);
}

export async function readNotificationList(
  userId?: string,
  limit = 50,
): Promise<NotificationRecord[]> {
  const viewerUserId = await readSessionUserId(userId);
  if (!viewerUserId) return [];

  const safeLimit = Math.min(Math.max(Math.floor(limit), 1), 100);
  const { data, error } = await supabase
    .from(NOTIFICATIONS_TABLE)
    .select("*")
    .eq("user_id", viewerUserId)
    .order("created_at", { ascending: false })
    .limit(safeLimit)
    .returns<NotificationRow[]>();

  if (error || !data) return [];
  const reconciledRows = await reconcileChillyChatCallNotificationRows(data, viewerUserId);
  return reconciledRows
    .map((row) => parseNotificationRow(row))
    .filter(isDefined);
}

export async function readImportantNotificationList(
  userId?: string,
  limit = 20,
): Promise<NotificationRecord[]> {
  const viewerUserId = await readSessionUserId(userId);
  if (!viewerUserId) return [];

  const safeLimit = Math.min(Math.max(Math.floor(limit), 1), 50);
  const { data, error } = await supabase
    .from(NOTIFICATIONS_TABLE)
    .select("*")
    .eq("user_id", viewerUserId)
    .is("dismissed_at", null)
    .in("category", [...IMPORTANT_NOTIFICATION_CATEGORIES])
    .order("created_at", { ascending: false })
    .limit(safeLimit)
    .returns<NotificationRow[]>();

  if (error || !data) return [];
  const reconciledRows = await reconcileChillyChatCallNotificationRows(data, viewerUserId);
  return reconciledRows
    .map((row) => parseNotificationRow(row))
    .filter(isDefined)
    .filter((notification) => notification.isImportant);
}

export async function readNotificationActivityList(
  userId?: string,
  importantLimit = 20,
  recentLimit = 30,
): Promise<NotificationRecord[]> {
  const [importantRows, recentRows] = await Promise.all([
    readImportantNotificationList(userId, importantLimit),
    readNotificationList(userId, recentLimit),
  ]);
  const seen = new Set<string>();
  return [...importantRows, ...recentRows].filter((notification) => {
    if (seen.has(notification.id)) return false;
    seen.add(notification.id);
    return true;
  });
}

export async function readNotificationSummary(
  userId?: string,
): Promise<NotificationSummary> {
  const notifications = await readNotificationList(userId, 100);

  return {
    totalCount: notifications.length,
    unreadCount: notifications.filter((notification) => !notification.isRead && !notification.isDismissed).length,
    undismissedCount: notifications.filter((notification) => !notification.isDismissed).length,
    latestCreatedAt: notifications[0]?.createdAt ?? null,
    categories: Array.from(new Set(notifications.map((notification) => notification.category))),
  };
}

export async function markNotificationRead(
  notificationId: string,
  userId?: string,
): Promise<NotificationActionResult> {
  const viewerUserId = await readSessionUserId(userId);
  if (!viewerUserId) {
    return buildNotificationActionResult({
      action: "mark_read",
      status: "blocked",
      reason: "signed_out",
      message: "Marking notifications read requires a signed-in user.",
      notificationId,
    });
  }

  const normalizedNotificationId = normalizeText(notificationId);
  if (!normalizedNotificationId) {
    return buildNotificationActionResult({
      action: "mark_read",
      status: "blocked",
      reason: "missing_notification_id",
      message: "Notification reads require a notification id.",
      notificationId,
      viewerUserId,
    });
  }

  const current = await readNotificationRowById(normalizedNotificationId, viewerUserId);
  if (!current) {
    return buildNotificationActionResult({
      action: "mark_read",
      status: "blocked",
      reason: "notification_not_found",
      message: "Notification not found for the current user.",
      notificationId: normalizedNotificationId,
      viewerUserId,
    });
  }

  if (normalizeIsoTimestamp(current.read_at)) {
    return buildNotificationActionResult({
      action: "mark_read",
      status: "noop",
      reason: "already_read",
      message: "Notification is already marked as read.",
      notificationId: normalizedNotificationId,
      viewerUserId,
    });
  }

  const payload: NotificationUpdate = { read_at: new Date().toISOString(), status: "read" };
  const { error } = await supabase
    .from(NOTIFICATIONS_TABLE)
    .update(payload)
    .eq("id", normalizedNotificationId)
    .eq("user_id", viewerUserId);

  if (error) {
    return buildNotificationActionResult({
      action: "mark_read",
      status: "error",
      reason: "update_failed",
      message: "Unable to mark notification as read.",
      notificationId: normalizedNotificationId,
      viewerUserId,
    });
  }

  return buildNotificationActionResult({
    action: "mark_read",
    status: "completed",
    reason: "allowed",
    message: "Notification marked as read.",
    notificationId: normalizedNotificationId,
    viewerUserId,
  });
}

export async function dismissNotification(
  notificationId: string,
  userId?: string,
): Promise<NotificationActionResult> {
  const viewerUserId = await readSessionUserId(userId);
  if (!viewerUserId) {
    return buildNotificationActionResult({
      action: "dismiss",
      status: "blocked",
      reason: "signed_out",
      message: "Dismissing notifications requires a signed-in user.",
      notificationId,
    });
  }

  const normalizedNotificationId = normalizeText(notificationId);
  if (!normalizedNotificationId) {
    return buildNotificationActionResult({
      action: "dismiss",
      status: "blocked",
      reason: "missing_notification_id",
      message: "Notification dismissals require a notification id.",
      notificationId,
      viewerUserId,
    });
  }

  const current = await readNotificationRowById(normalizedNotificationId, viewerUserId);
  if (!current) {
    return buildNotificationActionResult({
      action: "dismiss",
      status: "blocked",
      reason: "notification_not_found",
      message: "Notification not found for the current user.",
      notificationId: normalizedNotificationId,
      viewerUserId,
    });
  }

  if (normalizeIsoTimestamp(current.dismissed_at)) {
    return buildNotificationActionResult({
      action: "dismiss",
      status: "noop",
      reason: "already_dismissed",
      message: "Notification is already dismissed.",
      notificationId: normalizedNotificationId,
      viewerUserId,
    });
  }

  const payload: NotificationUpdate = { dismissed_at: new Date().toISOString(), status: "dismissed" };
  const { error } = await supabase
    .from(NOTIFICATIONS_TABLE)
    .update(payload)
    .eq("id", normalizedNotificationId)
    .eq("user_id", viewerUserId);

  if (error) {
    return buildNotificationActionResult({
      action: "dismiss",
      status: "error",
      reason: "update_failed",
      message: "Unable to dismiss notification.",
      notificationId: normalizedNotificationId,
      viewerUserId,
    });
  }

  return buildNotificationActionResult({
    action: "dismiss",
    status: "completed",
    reason: "allowed",
    message: "Notification dismissed.",
    notificationId: normalizedNotificationId,
    viewerUserId,
  });
}

export async function dismissChillyChatCallNotificationRows(input: {
  callInviteId?: string | null;
  threadId?: string | null;
  userId?: string;
}): Promise<number> {
  const viewerUserId = await readSessionUserId(input.userId);
  if (!viewerUserId) return 0;

  const callInviteId = normalizeText(input.callInviteId);
  const threadId = normalizeText(input.threadId);

  const now = new Date().toISOString();
  let query = supabase
    .from(NOTIFICATIONS_TABLE)
    .update({
      dismissed_at: now,
      read_at: now,
      status: "dismissed",
    } satisfies NotificationUpdate)
    .eq("user_id", viewerUserId)
    .eq("category", "chilly_chat_call")
    .is("dismissed_at", null);

  // Dismiss every active incoming-call row for this user. Older rows can be
  // keyed by prior invite ids but still appear as answerable after Decline.
  if (callInviteId && threadId) {
    query = query.or(`source_id.eq.${callInviteId},target_entity_id.eq.${threadId}`);
  } else if (callInviteId) {
    query = query.eq("source_id", callInviteId);
  } else if (threadId) {
    query = query.eq("target_entity_id", threadId);
  }

  if (!callInviteId && !threadId) {
    query = supabase
      .from(NOTIFICATIONS_TABLE)
      .update({
        dismissed_at: now,
        read_at: now,
        status: "dismissed",
      } satisfies NotificationUpdate)
      .eq("user_id", viewerUserId)
      .eq("category", "chilly_chat_call")
      .is("dismissed_at", null);
  }

  const { data, error } = await query
    .select("id")
    .returns<Array<{ id: string }>>();

  const matchedCount = error || !data ? 0 : data.length;
  if (!callInviteId && !threadId) return matchedCount;

  const { data: staleData, error: staleError } = await supabase
    .from(NOTIFICATIONS_TABLE)
    .update({
      dismissed_at: now,
      read_at: now,
      status: "dismissed",
    } satisfies NotificationUpdate)
    .eq("user_id", viewerUserId)
    .eq("category", "chilly_chat_call")
    .is("dismissed_at", null)
    .select("id")
    .returns<Array<{ id: string }>>();

  return matchedCount + (staleError || !staleData ? 0 : staleData.length);
}

export async function readEventReminderEnrollment(
  eventId: string,
  userId?: string,
): Promise<EventReminderEnrollment> {
  const viewerUserId = await readSessionUserId(userId);
  const event = await readReminderEventSummaryById(eventId);
  if (!viewerUserId) {
    return buildReminderEnrollment(eventId, null, event, null);
  }

  const reminderRow = await readEventReminderRow(eventId, viewerUserId);
  return buildReminderEnrollment(eventId, viewerUserId, event, reminderRow);
}

export async function setEventReminderEnrollment(
  eventId: string,
  enabled: boolean,
  userId?: string,
): Promise<NotificationActionResult> {
  const viewerUserId = await readSessionUserId(userId);
  if (!viewerUserId) {
    return buildNotificationActionResult({
      action: "set_event_reminder",
      status: "blocked",
      reason: "signed_out",
      message: "Event reminders require a signed-in user.",
      eventId,
      reminderState: "signed_out",
    });
  }

  const normalizedEventId = normalizeText(eventId);
  if (!normalizedEventId) {
    return buildNotificationActionResult({
      action: "set_event_reminder",
      status: "blocked",
      reason: "missing_event_id",
      message: "Event reminder actions require an event id.",
      eventId,
      viewerUserId,
    });
  }

  const event = await readReminderEventSummaryById(normalizedEventId);
  if (!event) {
    return buildNotificationActionResult({
      action: "set_event_reminder",
      status: "blocked",
      reason: "event_not_found",
      message: "Creator event not found for reminder enrollment.",
      eventId: normalizedEventId,
      viewerUserId,
    });
  }

  if (!event.reminder.canSetReminder) {
    return buildNotificationActionResult({
      action: "set_event_reminder",
      status: "blocked",
      reason: "reminder_not_ready",
      message: "This event is not reminder-ready yet.",
      eventId: normalizedEventId,
      viewerUserId,
      reminderState: "not_ready",
    });
  }

  const current = await readEventReminderRow(normalizedEventId, viewerUserId);
  const nextStatus = enabled ? "active" : "canceled";

  if (!current && !enabled) {
    return buildNotificationActionResult({
      action: "set_event_reminder",
      status: "noop",
      reason: "allowed",
      message: "No reminder enrollment exists to cancel.",
      eventId: normalizedEventId,
      viewerUserId,
      reminderState: "not_enrolled",
    });
  }

  if (current && normalizeText(current.status).toLowerCase() === nextStatus) {
    return buildNotificationActionResult({
      action: "set_event_reminder",
      status: "noop",
      reason: "allowed",
      message: enabled ? "Reminder is already active." : "Reminder is already canceled.",
      eventId: normalizedEventId,
      viewerUserId,
      reminderState: enabled ? "active" : "canceled",
    });
  }

  if (!current) {
    const payload: EventReminderInsert = {
      event_id: normalizedEventId,
      user_id: viewerUserId,
      status: "active",
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
    const { error } = await supabase
      .from(EVENT_REMINDERS_TABLE)
      .insert(payload);

    if (error) {
      return buildNotificationActionResult({
        action: "set_event_reminder",
        status: "error",
        reason: "insert_failed",
        message: "Unable to save event reminder enrollment.",
        eventId: normalizedEventId,
        viewerUserId,
        reminderState: "not_enrolled",
      });
    }

    return buildNotificationActionResult({
      action: "set_event_reminder",
      status: "completed",
      reason: "allowed",
      message: "Event reminder is active.",
      eventId: normalizedEventId,
      viewerUserId,
      reminderState: "active",
    });
  }

  const payload: EventReminderUpdate = {
    status: nextStatus,
    updated_at: new Date().toISOString(),
  };
  const { error } = await supabase
    .from(EVENT_REMINDERS_TABLE)
    .update(payload)
    .eq("event_id", normalizedEventId)
    .eq("user_id", viewerUserId);

  if (error) {
    return buildNotificationActionResult({
      action: "set_event_reminder",
      status: "error",
      reason: "update_failed",
      message: "Unable to update event reminder enrollment.",
      eventId: normalizedEventId,
      viewerUserId,
      reminderState: enabled ? "active" : "canceled",
    });
  }

  return buildNotificationActionResult({
    action: "set_event_reminder",
    status: "completed",
    reason: "allowed",
    message: enabled ? "Event reminder is active." : "Event reminder has been canceled.",
    eventId: normalizedEventId,
    viewerUserId,
    reminderState: enabled ? "active" : "canceled",
  });
}

export async function readCreatorEventReminderSummaries(
  hostUserId: string,
): Promise<CreatorEventReminderSummary[]> {
  const events = await readCreatorEventSummaries(hostUserId);
  if (!events.length) return [];

  const reminderRows = await readEventReminderRowsForEvents(events.map((event) => event.id));

  return events.map((event) => {
    const matchingRows = reminderRows.filter((row) => normalizeText(row.event_id) === event.id);
    const activeReminderCount = matchingRows.filter((row) => normalizeText(row.status).toLowerCase() === "active").length;
    const canceledReminderCount = matchingRows.filter((row) => normalizeText(row.status).toLowerCase() === "canceled").length;

    return {
      event,
      activeReminderCount,
      canceledReminderCount,
      totalReminderCount: matchingRows.length,
    };
  });
}

export async function readPublicEventReminderSummaries(
  hostUserId: string,
  userId?: string,
): Promise<PublicEventReminderSummary[]> {
  const events = await readPublicEventSummaries(hostUserId);
  if (!events.length) return [];

  const viewerUserId = await readSessionUserId(userId);
  const reminderRows = viewerUserId
    ? await readViewerEventReminderRows(events.map((event) => event.id), viewerUserId)
    : [];

  return events.map((event) => {
    const reminderRow = viewerUserId
      ? reminderRows.find((row) => normalizeText(row.event_id) === event.id) ?? null
      : null;

    return {
      event,
      enrollment: buildReminderEnrollment(event.id, viewerUserId, event, reminderRow),
    };
  });
}

export type NotificationPreferenceSettings = {
  followedCreatorLiveEnabled: boolean;
  circleFriendLiveEnabled: boolean;
  eventStartsSoonEnabled: boolean;
  publicUploadEnabled: boolean;
  replayLaterEnabled: boolean;
  creatorMoneyPurchasesEnabled: boolean;
  creatorMoneySalesEnabled: boolean;
  chillyChatCallsEnabled: boolean;
  chillyChatCallSoundKey: ChillyChatRingtoneKey;
  chillyChatCallVibrateEnabled: boolean;
  chillyChatCallCustomInAppSoundUri: string | null;
  pushEnabled: boolean;
  inAppEnabled: boolean;
  updatedAt: string | null;
};

export type NotificationPreferencePatch = Partial<Omit<NotificationPreferenceSettings, "updatedAt">>;

export type PushPermissionState =
  | "unsupported"
  | "undetermined"
  | "granted"
  | "denied"
  | "error";

export type PushRegistrationState = {
  status: "unsupported" | "not_registered" | "registered" | "denied" | "blocked" | "error";
  permissionState: PushPermissionState;
  provider: "expo";
  tokenFingerprint: string | null;
  message: string;
};

export type ForegroundNotificationAlert = {
  body: string;
  inviteId?: string;
  path: string;
  presentedNotificationId?: string;
  title: string;
  triggerType: string;
};

export type ForegroundActivityNotification = {
  body: string;
  category: string;
  notificationType: string;
  path: string;
  title: string;
};

const NOTIFICATION_INSTALL_ID_STORAGE_KEY = "chillywood.notification.install_id.v1";

const DEFAULT_NOTIFICATION_PREFERENCES: NotificationPreferenceSettings = {
  circleFriendLiveEnabled: true,
  eventStartsSoonEnabled: true,
  followedCreatorLiveEnabled: true,
  inAppEnabled: true,
  chillyChatCallCustomInAppSoundUri: null,
  chillyChatCallSoundKey: "chilly_ring",
  chillyChatCallVibrateEnabled: true,
  chillyChatCallsEnabled: true,
  creatorMoneyPurchasesEnabled: true,
  creatorMoneySalesEnabled: true,
  publicUploadEnabled: true,
  pushEnabled: true,
  replayLaterEnabled: true,
  updatedAt: null,
};

const buildClientId = () =>
  "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (char) => {
    const rand = Math.floor(Math.random() * 16);
    const next = char === "x" ? rand : (rand & 0x3) | 0x8;
    return next.toString(16);
  });

const getNotificationInstallId = async () => {
  const existing = await AsyncStorage.getItem(NOTIFICATION_INSTALL_ID_STORAGE_KEY);
  if (existing) return existing;
  const next = typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
    ? crypto.randomUUID()
    : buildClientId();
  await AsyncStorage.setItem(NOTIFICATION_INSTALL_ID_STORAGE_KEY, next);
  return next;
};

const parsePreferenceRow = (row: NotificationPreferenceRow | null): NotificationPreferenceSettings => {
  if (!row) return DEFAULT_NOTIFICATION_PREFERENCES;
  return {
    circleFriendLiveEnabled: row.circle_friend_live_enabled !== false,
    chillyChatCallCustomInAppSoundUri: normalizeText(row.chilly_chat_call_custom_in_app_sound_uri) || null,
    chillyChatCallSoundKey: normalizeChillyChatRingtoneKey(row.chilly_chat_call_sound_key),
    chillyChatCallVibrateEnabled: row.chilly_chat_call_vibrate_enabled !== false,
    chillyChatCallsEnabled: row.chilly_chat_calls_enabled !== false,
    creatorMoneyPurchasesEnabled: row.creator_money_purchases_enabled !== false,
    creatorMoneySalesEnabled: row.creator_money_sales_enabled !== false,
    eventStartsSoonEnabled: row.event_starts_soon_enabled !== false,
    followedCreatorLiveEnabled: row.followed_creator_live_enabled !== false,
    inAppEnabled: row.in_app_enabled !== false,
    publicUploadEnabled: row.public_upload_enabled !== false,
    pushEnabled: row.push_enabled !== false,
    replayLaterEnabled: row.replay_later_enabled !== false,
    updatedAt: normalizeIsoTimestamp(row.updated_at),
  };
};

const buildPreferenceUpdate = (patch: NotificationPreferencePatch): NotificationPreferenceUpdate => {
  const update: NotificationPreferenceUpdate = {};
  if (typeof patch.followedCreatorLiveEnabled === "boolean") {
    update.followed_creator_live_enabled = patch.followedCreatorLiveEnabled;
  }
  if (typeof patch.circleFriendLiveEnabled === "boolean") {
    update.circle_friend_live_enabled = patch.circleFriendLiveEnabled;
  }
  if (typeof patch.eventStartsSoonEnabled === "boolean") {
    update.event_starts_soon_enabled = patch.eventStartsSoonEnabled;
  }
  if (typeof patch.chillyChatCallsEnabled === "boolean") {
    update.chilly_chat_calls_enabled = patch.chillyChatCallsEnabled;
  }
  if (typeof patch.chillyChatCallVibrateEnabled === "boolean") {
    update.chilly_chat_call_vibrate_enabled = patch.chillyChatCallVibrateEnabled;
  }
  if (patch.chillyChatCallSoundKey) {
    update.chilly_chat_call_sound_key = normalizeChillyChatRingtoneKey(patch.chillyChatCallSoundKey);
  }
  if (typeof patch.chillyChatCallCustomInAppSoundUri === "string" || patch.chillyChatCallCustomInAppSoundUri === null) {
    update.chilly_chat_call_custom_in_app_sound_uri = patch.chillyChatCallCustomInAppSoundUri;
  }
  if (typeof patch.publicUploadEnabled === "boolean") {
    update.public_upload_enabled = patch.publicUploadEnabled;
  }
  if (typeof patch.replayLaterEnabled === "boolean") {
    update.replay_later_enabled = patch.replayLaterEnabled;
  }
  if (typeof patch.creatorMoneyPurchasesEnabled === "boolean") {
    update.creator_money_purchases_enabled = patch.creatorMoneyPurchasesEnabled;
  }
  if (typeof patch.creatorMoneySalesEnabled === "boolean") {
    update.creator_money_sales_enabled = patch.creatorMoneySalesEnabled;
  }
  if (typeof patch.pushEnabled === "boolean") {
    update.push_enabled = patch.pushEnabled;
  }
  if (typeof patch.inAppEnabled === "boolean") {
    update.in_app_enabled = patch.inAppEnabled;
  }
  return update;
};

export async function readNotificationPreferences(userId?: string): Promise<NotificationPreferenceSettings> {
  const viewerUserId = await readSessionUserId(userId);
  if (!viewerUserId) return DEFAULT_NOTIFICATION_PREFERENCES;

  const { data, error } = await supabase
    .from("notification_preferences")
    .select("*")
    .eq("user_id", viewerUserId)
    .returns<NotificationPreferenceRow>()
    .maybeSingle();

  if (!error && data) return parsePreferenceRow(data);

  const insert: NotificationPreferenceInsert = { user_id: viewerUserId };
  const { data: created } = await supabase
    .from("notification_preferences")
    .insert(insert)
    .select("*")
    .returns<NotificationPreferenceRow>()
    .maybeSingle();

  return parsePreferenceRow(created ?? null);
}

export async function updateNotificationPreferences(
  patch: NotificationPreferencePatch,
  userId?: string,
): Promise<NotificationPreferenceSettings> {
  const viewerUserId = await readSessionUserId(userId);
  if (!viewerUserId) throw new Error("Notification preferences require a signed-in user.");

  const update = buildPreferenceUpdate(patch);
  const { data, error } = await supabase
    .from("notification_preferences")
    .upsert({ ...update, user_id: viewerUserId }, { onConflict: "user_id" })
    .select("*")
    .returns<NotificationPreferenceRow>()
    .maybeSingle();

  if (error || !data) throw new Error("Unable to update notification preferences.");
  return parsePreferenceRow(data);
}

export async function readPushPermissionState(): Promise<PushPermissionState> {
  if (Platform.OS === "web") return "unsupported";
  if (!Device.isDevice) return "unsupported";

  try {
    const current = await Notifications.getPermissionsAsync();
    if (current.granted) return "granted";
    if (current.canAskAgain) return "undetermined";
    return "denied";
  } catch {
    return "error";
  }
}

const readExpoProjectId = () => {
  const constants = Constants as typeof Constants & {
    easConfig?: { projectId?: string };
  };
  return normalizeText(constants.easConfig?.projectId || Constants.expoConfig?.extra?.eas?.projectId);
};

export async function configureNotificationRuntime() {
  if (Platform.OS === "web") return;

  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      priority: Notifications.AndroidNotificationPriority.HIGH,
      shouldPlaySound: true,
      shouldSetBadge: false,
      shouldShowBanner: true,
      shouldShowList: true,
    }),
  });

  if (Platform.OS === "android") {
    await Notifications.setNotificationChannelAsync("default", {
      importance: Notifications.AndroidImportance.HIGH,
      name: "Chi'llywood activity",
      vibrationPattern: [0, 250, 250, 250],
    });
    await Notifications.setNotificationChannelAsync(CHILLY_CHAT_MESSAGE_CHANNEL_ID, {
      importance: Notifications.AndroidImportance.DEFAULT,
      name: "Chi'lly Chat messages",
      vibrationPattern: [0, 120],
    });
    await Notifications.setNotificationChannelAsync(CHILLY_CHAT_CALL_CHANNEL_ID, {
      importance: Notifications.AndroidImportance.MAX,
      name: "Chi'lly Chat calls",
      vibrationPattern: [0, 400, 180, 400],
    });
    await Notifications.setNotificationChannelAsync(CHILLY_CHAT_MISSED_CALL_CHANNEL_ID, {
      importance: Notifications.AndroidImportance.HIGH,
      name: "Missed Chi'lly Chat calls",
      vibrationPattern: [0, 220, 180, 220],
    });
  }
}

const buildUnsupportedPushRegistration = (message: string): PushRegistrationState => ({
  message,
  permissionState: "unsupported",
  provider: "expo",
  status: "unsupported",
  tokenFingerprint: null,
});

export async function readCurrentPushRegistration(): Promise<PushRegistrationState> {
  if (Platform.OS === "web" || !Device.isDevice) {
    return buildUnsupportedPushRegistration("Push notifications require a physical mobile device.");
  }

  if (Platform.OS !== "android") {
    return buildUnsupportedPushRegistration("Android notifications are production-ready now. iOS/APNs remains later.");
  }

  await configureNotificationRuntime();
  const permissionState = await readPushPermissionState();

  if (permissionState === "denied") {
    return {
      message: "Device push notifications are off in Android settings. In-app Activity is tied to your account and still works in the app.",
      permissionState,
      provider: "expo",
      status: "denied",
      tokenFingerprint: null,
    };
  }

  if (permissionState === "error") {
    return {
      message: "Unable to verify Android notification permission. In-app Activity is tied to your account and still works in the app.",
      permissionState,
      provider: "expo",
      status: "error",
      tokenFingerprint: null,
    };
  }

  if (permissionState !== "granted") {
    return {
      message: "Device push registration is not set up yet. In-app Activity is tied to your account and still works in the app.",
      permissionState,
      provider: "expo",
      status: "not_registered",
      tokenFingerprint: null,
    };
  }

  const installId = await getNotificationInstallId();
  const { data, error } = await supabase.functions.invoke("notification-device-tokens", {
    body: {
      action: "status",
      installId,
      platform: Platform.OS,
      provider: "expo",
    },
  });

  if (error) {
    return {
      message: "Unable to verify this device push registration. In-app Activity is tied to your account and still works in the app.",
      permissionState,
      provider: "expo",
      status: "error",
      tokenFingerprint: null,
    };
  }

  const payload = data as { registered?: unknown; status?: unknown; tokenFingerprint?: unknown } | null;
  const tokenFingerprint = normalizeText(payload?.tokenFingerprint) || null;
  const isRegistered = payload?.registered === true || normalizeText(payload?.status) === "registered";

  if (isRegistered) {
    return {
      message: "This Android device is registered for Chi'llywood push alerts. In-app Activity is tied to your account and still works in the app.",
      permissionState,
      provider: "expo",
      status: "registered",
      tokenFingerprint,
    };
  }

  return {
    message: "Notifications are allowed on this Android device, but this install is not registered for phone push alerts. In-app Activity is tied to your account and still works in the app.",
    permissionState,
    provider: "expo",
    status: "not_registered",
    tokenFingerprint: null,
  };
}

async function registerPushTokenWithBackend(input: {
  permissionStatus: PushPermissionState;
  token: string;
}): Promise<PushRegistrationState> {
  const installId = await getNotificationInstallId();
  const { data, error } = await supabase.functions.invoke("notification-device-tokens", {
    body: {
      action: "register",
      appVersion: Application.nativeApplicationVersion,
      buildVersion: Application.nativeBuildVersion,
      installId,
      metadata: {
        deviceName: Device.deviceName ?? null,
        modelName: Device.modelName ?? null,
        osName: Device.osName ?? null,
        osVersion: Device.osVersion ?? null,
      },
      permissionStatus: input.permissionStatus,
      platform: Platform.OS,
      provider: "expo",
      token: input.token,
    },
  });

  if (error) {
    return {
      message: "Unable to register this device for notifications.",
      permissionState: input.permissionStatus,
      provider: "expo",
      status: "error",
      tokenFingerprint: null,
    };
  }

  const tokenFingerprint = normalizeText((data as { tokenFingerprint?: unknown } | null)?.tokenFingerprint) || null;
  return {
    message: "This Android device is registered for Chi'llywood notifications.",
    permissionState: input.permissionStatus,
    provider: "expo",
    status: "registered",
    tokenFingerprint,
  };
}

export async function requestAndroidPushPermissionAndRegister(): Promise<PushRegistrationState> {
  if (Platform.OS === "web" || !Device.isDevice) {
    return {
      message: "Push notifications require a physical mobile device.",
      permissionState: "unsupported",
      provider: "expo",
      status: "unsupported",
      tokenFingerprint: null,
    };
  }

  if (Platform.OS !== "android") {
    return {
      message: "Android notifications are production-ready now. iOS/APNs remains later.",
      permissionState: "unsupported",
      provider: "expo",
      status: "unsupported",
      tokenFingerprint: null,
    };
  }

  await configureNotificationRuntime();
  const current = await Notifications.getPermissionsAsync();
  const finalPermission = current.granted ? current : await Notifications.requestPermissionsAsync();

  if (!finalPermission.granted) {
    return {
      message: "Notifications are off for this device. Chi'llywood still works; enable notifications in Android settings when you want alerts.",
      permissionState: finalPermission.canAskAgain ? "undetermined" : "denied",
      provider: "expo",
      status: "denied",
      tokenFingerprint: null,
    };
  }

  const projectId = readExpoProjectId();
  if (!projectId) {
    return {
      message: "Expo project id is missing from this build, so push token registration cannot complete.",
      permissionState: "granted",
      provider: "expo",
      status: "blocked",
      tokenFingerprint: null,
    };
  }

  try {
    const token = await Notifications.getExpoPushTokenAsync({ projectId });
    const rawToken = normalizeText(token.data);
    if (!rawToken) throw new Error("Expo returned an empty push token.");
    return registerPushTokenWithBackend({ permissionStatus: "granted", token: rawToken });
  } catch {
    return {
      message: "Unable to get a production push token for this Android build.",
      permissionState: "granted",
      provider: "expo",
      status: "error",
      tokenFingerprint: null,
    };
  }
}

export async function refreshAndroidPushRegistrationIfGranted(): Promise<PushRegistrationState> {
  if (Platform.OS === "web" || !Device.isDevice) {
    return {
      message: "Push notifications require a physical mobile device.",
      permissionState: "unsupported",
      provider: "expo",
      status: "unsupported",
      tokenFingerprint: null,
    };
  }

  if (Platform.OS !== "android") {
    return {
      message: "Android notifications are production-ready now. iOS/APNs remains later.",
      permissionState: "unsupported",
      provider: "expo",
      status: "unsupported",
      tokenFingerprint: null,
    };
  }

  await configureNotificationRuntime();
  const current = await Notifications.getPermissionsAsync();
  if (!current.granted) {
    return {
      message: "Notifications are not enabled for this device.",
      permissionState: current.canAskAgain ? "undetermined" : "denied",
      provider: "expo",
      status: "denied",
      tokenFingerprint: null,
    };
  }

  const projectId = readExpoProjectId();
  if (!projectId) {
    return {
      message: "Expo project id is missing from this build, so push token registration cannot complete.",
      permissionState: "granted",
      provider: "expo",
      status: "blocked",
      tokenFingerprint: null,
    };
  }

  try {
    const token = await Notifications.getExpoPushTokenAsync({ projectId });
    const rawToken = normalizeText(token.data);
    if (!rawToken) throw new Error("Expo returned an empty push token.");
    return registerPushTokenWithBackend({ permissionStatus: "granted", token: rawToken });
  } catch {
    return {
      message: "Unable to refresh the production push token for this Android build.",
      permissionState: "granted",
      provider: "expo",
      status: "error",
      tokenFingerprint: null,
    };
  }
}

export async function revokeCurrentPushInstall(): Promise<PushRegistrationState> {
  if (Platform.OS === "web") {
    return {
      message: "Push notifications are not supported on web.",
      permissionState: "unsupported",
      provider: "expo",
      status: "unsupported",
      tokenFingerprint: null,
    };
  }

  const installId = await getNotificationInstallId();
  const { error } = await supabase.functions.invoke("notification-device-tokens", {
    body: {
      action: "revoke",
      installId,
      platform: Platform.OS,
      provider: "expo",
    },
  });

  if (error) {
    return {
      message: "Unable to turn off this device registration right now.",
      permissionState: await readPushPermissionState(),
      provider: "expo",
      status: "error",
      tokenFingerprint: null,
    };
  }

  return {
    message: "This device will no longer receive Chi'llywood push notifications.",
    permissionState: await readPushPermissionState(),
    provider: "expo",
    status: "not_registered",
    tokenFingerprint: null,
  };
}

const normalizeNotificationPath = (value: unknown) => {
  const raw = normalizeText(value);
  if (!raw) return null;
  const path = raw.startsWith("chillywoodmobile://")
    ? raw.replace(/^chillywoodmobile:\/\//u, "/")
    : raw;
  if (
    path === "/chat"
    || path === "/settings"
    || path === "/subscribe"
    || path.startsWith("/channel-studio")
    || path.startsWith("/spectate/")
    || path.startsWith("/channel/")
    || path.startsWith("/channel-subscription/")
    || path.startsWith("/profile/")
    || path.startsWith("/player/")
    || path.startsWith("/watch-party/")
    || path.startsWith("/vip-pass/")
    || path.startsWith("/event/")
    || path.startsWith("/chat/")
  ) {
    return path;
  }
  return null;
};

export const resolveNotificationPath = (value: unknown) => normalizeNotificationPath(value);

export function subscribeToNotificationResponses(onPath: (path: string) => void) {
  const handledResponseKeys = new Set<string>();
  const handleResponse = (response: Notifications.NotificationResponse | null) => {
    if (!response) return;
    const requestIdentifier = normalizeText(response.notification.request.identifier);
    const actionIdentifier = normalizeText(response.actionIdentifier);
    const responseKey = `${requestIdentifier}:${actionIdentifier || "default"}`;
    if (responseKey !== ":" && handledResponseKeys.has(responseKey)) return;
    const data = response.notification.request.content.data as Record<string, unknown>;
    const path = normalizeNotificationPath(data.path || data.url || data.deepLink);
    if (!path) return;
    if (responseKey !== ":") handledResponseKeys.add(responseKey);
    onPath(path);
    Notifications.clearLastNotificationResponseAsync().catch(() => null);
  };

  Notifications.getLastNotificationResponseAsync()
    .then(handleResponse)
    .catch(() => null);

  return Notifications.addNotificationResponseReceivedListener(handleResponse);
}

export async function dismissPresentedChillyChatCallNotifications(input: {
  callInviteId?: string | null;
  dismissAllPresentedNotificationsFallback?: boolean;
  dismissIncomingCallFallback?: boolean;
  path?: string | null;
  presentedNotificationId?: string | null;
  threadId?: string | null;
}): Promise<number> {
  if (Platform.OS === "web") return 0;

  const targetInviteId = normalizeText(input.callInviteId);
  const targetPresentedNotificationId = normalizeText(input.presentedNotificationId);
  const targetPath = normalizeNotificationPath(input.path);
  const targetThreadId = normalizeText(input.threadId);
  const canUseIncomingTitleFallback = input.dismissIncomingCallFallback === true
    && (!!targetInviteId || !!targetPath || !!targetThreadId || !!targetPresentedNotificationId);
  const canUsePresentedNotificationSweep = input.dismissAllPresentedNotificationsFallback === true
    && canUseIncomingTitleFallback;

  try {
    let dismissed = 0;
    if (targetPresentedNotificationId) {
      await Notifications.dismissNotificationAsync(targetPresentedNotificationId).then(() => {
        dismissed += 1;
      }).catch(() => null);
    }

    const presented = await Notifications.getPresentedNotificationsAsync();

    await Promise.all(presented.map(async (notification) => {
      const notificationIdentifier = normalizeText(notification.request.identifier);
      const data = notification.request.content.data as Record<string, unknown>;
      const title = normalizeText(notification.request.content.title).toLowerCase();
      const triggerType = normalizeText(data.triggerType || data.notificationType || data.category).toLowerCase();
      const openCall = data.openCall === true || normalizeText(data.openCall) === "1" || normalizeText(data.openCall).toLowerCase() === "true";
      const callInviteId = normalizeText(data.callInviteId);
      const path = normalizeNotificationPath(data.path || data.url || data.deepLink);
      const isChillyChatCall = triggerType === "chilly_chat_call" || openCall;
      const isIncomingChillyChatCallTitle = title.startsWith("incoming chi'lly chat") && title.includes("call");
      const matchesPresentedIdentifier = !!targetPresentedNotificationId && notificationIdentifier === targetPresentedNotificationId;
      if (!isChillyChatCall && !matchesPresentedIdentifier && !(canUseIncomingTitleFallback && isIncomingChillyChatCallTitle)) return;

      const matchesInvite = !!targetInviteId && callInviteId === targetInviteId;
      const matchesPath = !!targetPath && path === targetPath;
      const matchesThread = !!targetThreadId && !!path && path.startsWith(`/chat/${targetThreadId}`);
      const matchesIncomingFallback = canUseIncomingTitleFallback && isIncomingChillyChatCallTitle;
      if (!matchesPresentedIdentifier && !matchesInvite && !matchesPath && !matchesThread && !matchesIncomingFallback) return;

      await Notifications.dismissNotificationAsync(notification.request.identifier);
      dismissed += 1;
    }));

    // Remote Android call pushes can survive the synthetic identifier path; only sweep after an explicit call action.
    if (dismissed === 0 && canUsePresentedNotificationSweep) {
      await Notifications.dismissAllNotificationsAsync().then(() => {
        dismissed += 1;
      }).catch(() => null);
    }

    return dismissed;
  } catch {
    return 0;
  }
}

export function subscribeToForegroundNotificationAlerts(onAlert: (alert: ForegroundNotificationAlert) => void) {
  return Notifications.addNotificationReceivedListener((notification) => {
    const content = notification.request.content;
    const data = content.data as Record<string, unknown>;
    const path = normalizeNotificationPath(data.path || data.url || data.deepLink);
    if (!path) return;

    const triggerType = normalizeText(data.triggerType || data.notificationType || data.category).toLowerCase();
    const isIncomingChillyChatCall = triggerType === "chilly_chat_call" || data.openCall === true;
    if (!isIncomingChillyChatCall) return;

    onAlert({
      body: normalizeText(content.body) || "Tap to open the Chi'lly Chat call.",
      inviteId: normalizeText(data.callInviteId) || undefined,
      path,
      presentedNotificationId: notification.request.identifier,
      title: normalizeText(content.title) || "Incoming Chi'lly Chat call",
      triggerType: triggerType || "chilly_chat_call",
    });
  });
}

export function subscribeToForegroundActivityNotifications(onAlert: (alert: ForegroundActivityNotification) => void) {
  return Notifications.addNotificationReceivedListener((notification) => {
    const content = notification.request.content;
    const data = content.data as Record<string, unknown>;
    const path = normalizeNotificationPath(data.path || data.url || data.deepLink);
    if (!path) return;

    const triggerType = normalizeText(data.triggerType || data.notificationType || data.category).toLowerCase();
    const isIncomingChillyChatCall = triggerType === "chilly_chat_call" || data.openCall === true;
    if (isIncomingChillyChatCall) return;

    const category = normalizeText(data.category).toLowerCase();
    const notificationType = normalizeText(data.notificationType || data.type || triggerType).toLowerCase();
    const isCreatorMoneyActivity = category === "creator_money_sale" || category === "creator_money_purchase";
    const isTimeSensitiveActivity = notificationType === "event_starts_soon" || notificationType === "watch_party_starts_soon";
    if (!isCreatorMoneyActivity && !isTimeSensitiveActivity) return;

    onAlert({
      body: normalizeText(content.body) || "Open Activity when you are ready.",
      category,
      notificationType,
      path,
      title: category === "creator_money_sale" ? "New creator activity" : normalizeText(content.title) || "Activity",
    });
  });
}
