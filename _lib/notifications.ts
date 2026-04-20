import type { Json, Tables, TablesInsert, TablesUpdate } from "../supabase/database.types";

import {
  buildCreatorEventSummary,
  CREATOR_EVENTS_TABLE,
  type CreatorEventSummary,
  parseCreatorEventRow,
  readCreatorEventSummaries,
  readPublicEventSummaries,
} from "./liveEvents";
import { supabase } from "./supabase";

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
  | "payment_access_confirmation";

export type NotificationTargetRoute =
  | "/profile/[userId]"
  | "/channel-settings"
  | "/chat"
  | "/chat/[threadId]"
  | "/watch-party"
  | "/watch-party/[partyId]"
  | "/watch-party/live-stage/[partyId]"
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
  title: string;
  body: string | null;
  target: NormalizedNotificationTarget;
  readAt: string | null;
  dismissedAt: string | null;
  createdAt: string;
  isRead: boolean;
  isDismissed: boolean;
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
type EventReminderRow = Tables<"event_reminders">;
type EventReminderInsert = TablesInsert<"event_reminders">;
type EventReminderUpdate = TablesUpdate<"event_reminders">;
type CreatorEventRow = Tables<"creator_events">;

const CREATOR_EVENT_NOTIFICATION_SELECT =
  "id,host_user_id,event_title,event_type,status,starts_at,ends_at,linked_title_id,replay_policy,replay_available_at,replay_expires_at,reminder_ready,created_at,updated_at";

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
  ) {
    return normalized;
  }
  return "new_message";
};

const normalizeTargetRoute = (value: unknown): NotificationTargetRoute | "unknown" => {
  const normalized = normalizeText(value);
  if (
    normalized === "/profile/[userId]"
    || normalized === "/channel-settings"
    || normalized === "/chat"
    || normalized === "/chat/[threadId]"
    || normalized === "/watch-party"
    || normalized === "/watch-party/[partyId]"
    || normalized === "/watch-party/live-stage/[partyId]"
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

  return {
    id,
    userId,
    category: normalizeNotificationCategory(row.category),
    title,
    body: normalizeText(row.body) || null,
    target,
    readAt,
    dismissedAt,
    createdAt: normalizeIsoTimestamp(row.created_at) ?? new Date().toISOString(),
    isRead: !!readAt,
    isDismissed: !!dismissedAt,
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
  return data
    .map((row) => parseNotificationRow(row))
    .filter(isDefined);
}

export async function readNotificationSummary(
  userId?: string,
): Promise<NotificationSummary> {
  const notifications = await readNotificationList(userId, 100);

  return {
    totalCount: notifications.length,
    unreadCount: notifications.filter((notification) => !notification.isRead).length,
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

  const payload: NotificationUpdate = { read_at: new Date().toISOString() };
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

  const payload: NotificationUpdate = { dismissed_at: new Date().toISOString() };
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
