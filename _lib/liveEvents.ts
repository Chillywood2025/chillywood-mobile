import type { Tables, TablesInsert, TablesUpdate } from "../supabase/database.types";

import { supabase } from "./supabase";

export const CREATOR_EVENTS_TABLE = "creator_events";

export type CreatorEventType = "live_first" | "live_watch_party" | "watch_party_live";
export type CreatorEventStatus =
  | "draft"
  | "scheduled"
  | "live_now"
  | "ended"
  | "replay_available"
  | "expired"
  | "canceled";
export type CreatorEventReplayPolicy = "none" | "indefinite" | "until_expiration";
export type CreatorEventReplayState = "none" | "pending" | "available" | "expired";
export type CreatorEventReminderState = "ready" | "not_ready";

export type CreatorEventRecord = {
  id: string;
  hostUserId: string;
  eventTitle: string;
  eventType: CreatorEventType;
  status: CreatorEventStatus;
  startsAt: string | null;
  endsAt: string | null;
  linkedTitleId: string | null;
  replayPolicy: CreatorEventReplayPolicy;
  replayAvailableAt: string | null;
  replayExpiresAt: string | null;
  reminderReady: boolean;
  createdAt: string;
  updatedAt: string;
};

export type CreatorEventReplayAvailability = {
  policy: CreatorEventReplayPolicy;
  state: CreatorEventReplayState;
  isReplayAllowed: boolean;
  isReplayAvailableNow: boolean;
  isReplayExpired: boolean;
  replayAvailableAt: string | null;
  replayExpiresAt: string | null;
};

export type CreatorEventReminderReadiness = {
  state: CreatorEventReminderState;
  reminderReady: boolean;
  canSetReminder: boolean;
  reason: "ready" | "missing_start_time" | "not_scheduled";
};

export type CreatorEventSummary = CreatorEventRecord & {
  isUpcoming: boolean;
  isLiveNow: boolean;
  replay: CreatorEventReplayAvailability;
  reminder: CreatorEventReminderReadiness;
};

export type CreatorEventWriteError = {
  message: string;
};

export type CreateCreatorEventInput = {
  hostUserId: string;
  eventTitle: string;
  eventType: CreatorEventType;
  status?: CreatorEventStatus;
  startsAt?: string | null;
  endsAt?: string | null;
  linkedTitleId?: string | null;
  replayPolicy?: CreatorEventReplayPolicy;
  replayAvailableAt?: string | null;
  replayExpiresAt?: string | null;
  reminderReady?: boolean;
};

export type UpdateCreatorEventInput = {
  hostUserId: string;
  eventTitle?: string;
  eventType?: CreatorEventType;
  status?: CreatorEventStatus;
  startsAt?: string | null;
  endsAt?: string | null;
  linkedTitleId?: string | null;
  replayPolicy?: CreatorEventReplayPolicy;
  replayAvailableAt?: string | null;
  replayExpiresAt?: string | null;
  reminderReady?: boolean;
};

type CreatorEventRow = Tables<"creator_events">;
type CreatorEventInsert = TablesInsert<"creator_events">;
type CreatorEventUpdate = TablesUpdate<"creator_events">;

const CREATOR_EVENT_SELECT =
  "id,host_user_id,event_title,event_type,status,starts_at,ends_at,linked_title_id,replay_policy,replay_available_at,replay_expires_at,reminder_ready,created_at,updated_at";

const isDefined = <T>(value: T | null): value is T => value !== null;

const normalizeCreatorEventType = (value: unknown): CreatorEventType => {
  const normalized = String(value ?? "").trim().toLowerCase();
  if (normalized === "live_watch_party" || normalized === "watch_party_live") {
    return normalized;
  }
  return "live_first";
};

const normalizeCreatorEventStatus = (value: unknown): CreatorEventStatus => {
  const normalized = String(value ?? "").trim().toLowerCase();
  if (
    normalized === "scheduled"
    || normalized === "live_now"
    || normalized === "ended"
    || normalized === "replay_available"
    || normalized === "expired"
    || normalized === "canceled"
  ) {
    return normalized;
  }
  return "draft";
};

const normalizeCreatorEventReplayPolicy = (value: unknown): CreatorEventReplayPolicy => {
  const normalized = String(value ?? "").trim().toLowerCase();
  if (normalized === "indefinite" || normalized === "until_expiration") {
    return normalized;
  }
  return "none";
};

const normalizeIsoTimestamp = (value: unknown): string | null => {
  const normalized = String(value ?? "").trim();
  if (!normalized) return null;
  const parsed = Date.parse(normalized);
  if (!Number.isFinite(parsed)) return null;
  return new Date(parsed).toISOString();
};

export const parseCreatorEventRow = (row: CreatorEventRow | null): CreatorEventRecord | null => {
  if (!row) return null;

  const id = String(row.id ?? "").trim();
  const hostUserId = String(row.host_user_id ?? "").trim();
  const eventTitle = String(row.event_title ?? "").trim();
  if (!id || !hostUserId || !eventTitle) return null;

  return {
    id,
    hostUserId,
    eventTitle,
    eventType: normalizeCreatorEventType(row.event_type),
    status: normalizeCreatorEventStatus(row.status),
    startsAt: normalizeIsoTimestamp(row.starts_at),
    endsAt: normalizeIsoTimestamp(row.ends_at),
    linkedTitleId: String(row.linked_title_id ?? "").trim() || null,
    replayPolicy: normalizeCreatorEventReplayPolicy(row.replay_policy),
    replayAvailableAt: normalizeIsoTimestamp(row.replay_available_at),
    replayExpiresAt: normalizeIsoTimestamp(row.replay_expires_at),
    reminderReady: !!row.reminder_ready,
    createdAt: normalizeIsoTimestamp(row.created_at) ?? new Date().toISOString(),
    updatedAt: normalizeIsoTimestamp(row.updated_at) ?? new Date().toISOString(),
  };
};

export const readEventReplayAvailability = (
  event: CreatorEventRecord,
  nowMillis = Date.now(),
): CreatorEventReplayAvailability => {
  if (event.replayPolicy === "none") {
    return {
      policy: event.replayPolicy,
      state: "none",
      isReplayAllowed: false,
      isReplayAvailableNow: false,
      isReplayExpired: false,
      replayAvailableAt: null,
      replayExpiresAt: null,
    };
  }

  const replayAvailableAtMillis = event.replayAvailableAt ? Date.parse(event.replayAvailableAt) : null;
  const replayExpiresAtMillis = event.replayExpiresAt ? Date.parse(event.replayExpiresAt) : null;
  const statusExpired = event.status === "expired";
  const timeExpired = replayExpiresAtMillis != null && Number.isFinite(replayExpiresAtMillis) && nowMillis > replayExpiresAtMillis;
  const pendingReplay = replayAvailableAtMillis != null && Number.isFinite(replayAvailableAtMillis) && nowMillis < replayAvailableAtMillis;
  const expired = statusExpired || timeExpired;
  const availableByStatus =
    event.status === "ended"
    || event.status === "replay_available"
    || event.status === "expired";
  const available = !pendingReplay && !expired && availableByStatus;

  return {
    policy: event.replayPolicy,
    state: expired ? "expired" : pendingReplay ? "pending" : available ? "available" : "pending",
    isReplayAllowed: true,
    isReplayAvailableNow: available,
    isReplayExpired: expired,
    replayAvailableAt: event.replayAvailableAt,
    replayExpiresAt: event.replayExpiresAt,
  };
};

export const readEventReminderReadiness = (event: CreatorEventRecord): CreatorEventReminderReadiness => {
  if (event.status !== "scheduled") {
    return {
      state: "not_ready",
      reminderReady: false,
      canSetReminder: false,
      reason: "not_scheduled",
    };
  }

  if (!event.startsAt) {
    return {
      state: "not_ready",
      reminderReady: false,
      canSetReminder: false,
      reason: "missing_start_time",
    };
  }

  if (!event.reminderReady) {
    return {
      state: "not_ready",
      reminderReady: false,
      canSetReminder: false,
      reason: "not_scheduled",
    };
  }

  return {
    state: "ready",
    reminderReady: true,
    canSetReminder: true,
    reason: "ready",
  };
};

export const buildCreatorEventSummary = (
  event: CreatorEventRecord,
  nowMillis = Date.now(),
): CreatorEventSummary => {
  const startsAtMillis = event.startsAt ? Date.parse(event.startsAt) : null;
  return {
    ...event,
    isUpcoming:
      event.status === "scheduled"
      && startsAtMillis != null
      && Number.isFinite(startsAtMillis)
      && startsAtMillis > nowMillis,
    isLiveNow: event.status === "live_now",
    replay: readEventReplayAvailability(event, nowMillis),
    reminder: readEventReminderReadiness(event),
  };
};

const buildValidatedEventWriteShape = (
  value: CreateCreatorEventInput | (CreatorEventRecord & UpdateCreatorEventInput),
): { payload: CreatorEventInsert | CreatorEventUpdate } | { error: CreatorEventWriteError } => {
  const hostUserId = String(value.hostUserId ?? "").trim();
  const eventTitle = String(value.eventTitle ?? "").trim();
  const eventType = normalizeCreatorEventType(value.eventType);
  const status = normalizeCreatorEventStatus(value.status);
  const startsAt = normalizeIsoTimestamp(value.startsAt);
  const endsAt = normalizeIsoTimestamp(value.endsAt);
  const linkedTitleId = String(value.linkedTitleId ?? "").trim() || null;
  const replayPolicy = normalizeCreatorEventReplayPolicy(value.replayPolicy);
  let replayAvailableAt = normalizeIsoTimestamp(value.replayAvailableAt);
  let replayExpiresAt = normalizeIsoTimestamp(value.replayExpiresAt);
  let reminderReady = !!value.reminderReady;

  if (!hostUserId) {
    return { error: { message: "Creator event writes require a host user id." } };
  }

  if (!eventTitle) {
    return { error: { message: "Creator event title is required." } };
  }

  if (status !== "draft" && status !== "canceled" && !startsAt) {
    return { error: { message: "Scheduled or active creator events need a valid start time." } };
  }

  if (endsAt && startsAt && Date.parse(endsAt) < Date.parse(startsAt)) {
    return { error: { message: "Creator event end time cannot be before the start time." } };
  }

  if (eventType === "watch_party_live" && status !== "draft" && !linkedTitleId) {
    return { error: { message: "Scheduled Watch-Party Live events need a linked title id." } };
  }

  if (replayPolicy === "none") {
    replayAvailableAt = null;
    replayExpiresAt = null;
  }

  if (replayPolicy === "until_expiration" && !replayExpiresAt) {
    return { error: { message: "Expiring replay windows need a replay expiration time." } };
  }

  if (replayAvailableAt && replayExpiresAt && Date.parse(replayExpiresAt) < Date.parse(replayAvailableAt)) {
    return { error: { message: "Replay expiration cannot be earlier than replay availability." } };
  }

  if (status !== "scheduled" || !startsAt) {
    reminderReady = false;
  }

  return {
    payload: {
      host_user_id: hostUserId,
      event_title: eventTitle,
      event_type: eventType,
      status,
      starts_at: startsAt,
      ends_at: endsAt,
      linked_title_id: linkedTitleId,
      replay_policy: replayPolicy,
      replay_available_at: replayAvailableAt,
      replay_expires_at: replayExpiresAt,
      reminder_ready: reminderReady,
      updated_at: new Date().toISOString(),
    },
  };
};

async function readCreatorEventRowById(eventId: string): Promise<CreatorEventRecord | null> {
  const normalizedEventId = String(eventId ?? "").trim();
  if (!normalizedEventId) return null;

  const { data, error } = await supabase
    .from(CREATOR_EVENTS_TABLE)
    .select(CREATOR_EVENT_SELECT)
    .eq("id", normalizedEventId)
    .returns<CreatorEventRow>()
    .maybeSingle();

  if (error || !data) return null;
  return parseCreatorEventRow(data);
}

export async function createCreatorEvent(
  input: CreateCreatorEventInput,
): Promise<CreatorEventSummary | { error: CreatorEventWriteError }> {
  const validated = buildValidatedEventWriteShape({
    ...input,
    status: input.status ?? "draft",
    replayPolicy: input.replayPolicy ?? "none",
  });

  if ("error" in validated) return validated;

  const validatedPayload = validated.payload;
  const payload: CreatorEventInsert = {
    host_user_id: String(validatedPayload.host_user_id ?? "").trim(),
    event_title: String(validatedPayload.event_title ?? "").trim(),
    event_type: String(validatedPayload.event_type ?? "live_first").trim(),
    status: String(validatedPayload.status ?? "draft").trim(),
    starts_at: validatedPayload.starts_at ?? null,
    ends_at: validatedPayload.ends_at ?? null,
    linked_title_id: validatedPayload.linked_title_id ?? null,
    replay_policy: String(validatedPayload.replay_policy ?? "none").trim(),
    replay_available_at: validatedPayload.replay_available_at ?? null,
    replay_expires_at: validatedPayload.replay_expires_at ?? null,
    reminder_ready: !!validatedPayload.reminder_ready,
    created_at: new Date().toISOString(),
    updated_at: String(validatedPayload.updated_at ?? new Date().toISOString()),
  };

  const { data, error } = await supabase
    .from(CREATOR_EVENTS_TABLE)
    .insert(payload)
    .select(CREATOR_EVENT_SELECT)
    .returns<CreatorEventRow>()
    .single();

  if (error || !data) {
    return {
      error: {
        message:
          typeof error === "object" && error && "message" in error
            ? String((error as { message?: unknown }).message ?? "Unable to create creator event.")
            : "Unable to create creator event.",
      },
    };
  }

  const parsed = parseCreatorEventRow(data);
  return parsed ? buildCreatorEventSummary(parsed) : { error: { message: "Creator event returned an unreadable payload." } };
}

export async function updateCreatorEvent(
  eventId: string,
  input: UpdateCreatorEventInput,
): Promise<CreatorEventSummary | { error: CreatorEventWriteError }> {
  const current = await readCreatorEventRowById(eventId);
  if (!current) {
    return { error: { message: "Creator event not found." } };
  }

  if (current.hostUserId !== String(input.hostUserId ?? "").trim()) {
    return { error: { message: "Creator event updates require the owning host identity." } };
  }

  const validated = buildValidatedEventWriteShape({
    ...current,
    ...input,
    hostUserId: current.hostUserId,
    eventTitle: input.eventTitle ?? current.eventTitle,
    eventType: input.eventType ?? current.eventType,
    status: input.status ?? current.status,
    startsAt: input.startsAt ?? current.startsAt,
    endsAt: input.endsAt ?? current.endsAt,
    linkedTitleId: input.linkedTitleId ?? current.linkedTitleId,
    replayPolicy: input.replayPolicy ?? current.replayPolicy,
    replayAvailableAt: input.replayAvailableAt ?? current.replayAvailableAt,
    replayExpiresAt: input.replayExpiresAt ?? current.replayExpiresAt,
    reminderReady: input.reminderReady ?? current.reminderReady,
  });

  if ("error" in validated) return validated;

  const payload: CreatorEventUpdate = validated.payload;
  const { data, error } = await supabase
    .from(CREATOR_EVENTS_TABLE)
    .update(payload)
    .eq("id", String(eventId ?? "").trim())
    .eq("host_user_id", current.hostUserId)
    .select(CREATOR_EVENT_SELECT)
    .returns<CreatorEventRow>()
    .single();

  if (error || !data) {
    return {
      error: {
        message:
          typeof error === "object" && error && "message" in error
            ? String((error as { message?: unknown }).message ?? "Unable to update creator event.")
            : "Unable to update creator event.",
      },
    };
  }

  const parsed = parseCreatorEventRow(data);
  return parsed ? buildCreatorEventSummary(parsed) : { error: { message: "Creator event returned an unreadable payload." } };
}

export async function readCreatorEventSummaries(
  hostUserId: string,
): Promise<CreatorEventSummary[]> {
  const normalizedHostUserId = String(hostUserId ?? "").trim();
  if (!normalizedHostUserId) return [];

  const { data, error } = await supabase
    .from(CREATOR_EVENTS_TABLE)
    .select(CREATOR_EVENT_SELECT)
    .eq("host_user_id", normalizedHostUserId)
    .order("starts_at", { ascending: true, nullsFirst: false })
    .returns<CreatorEventRow[]>();

  if (error || !data) return [];
  return data
    .map((row) => parseCreatorEventRow(row))
    .filter(isDefined)
    .map((event) => buildCreatorEventSummary(event));
}

export async function readPublicEventSummaries(
  hostUserId: string,
): Promise<CreatorEventSummary[]> {
  const normalizedHostUserId = String(hostUserId ?? "").trim();
  if (!normalizedHostUserId) return [];

  const { data, error } = await supabase
    .from(CREATOR_EVENTS_TABLE)
    .select(CREATOR_EVENT_SELECT)
    .eq("host_user_id", normalizedHostUserId)
    .neq("status", "draft")
    .order("starts_at", { ascending: true, nullsFirst: false })
    .returns<CreatorEventRow[]>();

  if (error || !data) return [];
  return data
    .map((row) => parseCreatorEventRow(row))
    .filter(isDefined)
    .map((event) => buildCreatorEventSummary(event));
}

export async function readCreatorEventReplayAvailability(
  eventId: string,
): Promise<CreatorEventReplayAvailability | null> {
  const event = await readCreatorEventRowById(eventId);
  return event ? readEventReplayAvailability(event) : null;
}

export async function readCreatorEventReminderReadiness(
  eventId: string,
): Promise<CreatorEventReminderReadiness | null> {
  const event = await readCreatorEventRowById(eventId);
  return event ? readEventReminderReadiness(event) : null;
}
