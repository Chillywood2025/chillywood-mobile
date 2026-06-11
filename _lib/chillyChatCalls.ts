import type { Tables, TablesInsert, TablesUpdate } from "../supabase/database.types";

import { supabase } from "./supabase";

export const CHAT_CALL_INVITES_TABLE = "chat_call_invites";
export const CHAT_CALL_EVENTS_TABLE = "chat_call_events";

export type ChillyChatCallType = "voice" | "video";
export type ChillyChatCallStatus = "ringing" | "accepted" | "declined" | "missed" | "canceled" | "ended" | "busy";
export type ChillyChatCallEventType = "started" | "accepted" | "declined" | "missed" | "canceled" | "ended" | "busy";
export type ChillyChatRingtoneKey =
  | "chilly_ring"
  | "skyline_pulse"
  | "theater_bell"
  | "velvet_knock"
  | "quiet_buzz"
  | "classic_phone"
  | "silent_vibrate";

export type ChillyChatRingtoneOption = {
  key: ChillyChatRingtoneKey;
  label: string;
  description: string;
};

export type ChillyChatCallInvite = {
  id: string;
  threadId: string;
  communicationRoomId: string | null;
  callerUserId: string;
  calleeUserId: string;
  callType: ChillyChatCallType;
  status: ChillyChatCallStatus;
  createdAt: string;
  expiresAt: string;
  acceptedAt: string | null;
  endedAt: string | null;
};

export type ChillyChatCallEvent = {
  id: string;
  threadId: string;
  callInviteId: string | null;
  actorUserId: string;
  callType: ChillyChatCallType;
  eventType: ChillyChatCallEventType;
  durationSeconds: number | null;
  createdAt: string;
};

type CallInviteRow = Tables<"chat_call_invites">;
type CallInviteInsert = TablesInsert<"chat_call_invites">;
type CallInviteUpdate = TablesUpdate<"chat_call_invites">;
type CallEventRow = Tables<"chat_call_events">;
type CallEventInsert = TablesInsert<"chat_call_events">;

const CALL_INVITE_SELECT =
  "id,thread_id,communication_room_id,caller_user_id,callee_user_id,call_type,status,created_at,expires_at,accepted_at,ended_at";
const CALL_EVENT_SELECT =
  "id,thread_id,call_invite_id,actor_user_id,call_type,event_type,duration_seconds,created_at";

export const CHILLY_CHAT_RINGTONE_OPTIONS: readonly ChillyChatRingtoneOption[] = [
  {
    key: "chilly_ring",
    label: "Chi'lly Ring",
    description: "The default Chi'lly Chat ring.",
  },
  {
    key: "skyline_pulse",
    label: "Skyline Pulse",
    description: "A brighter pulse for calls.",
  },
  {
    key: "theater_bell",
    label: "Theater Bell",
    description: "A clean bell-style alert.",
  },
  {
    key: "velvet_knock",
    label: "Velvet Knock",
    description: "A softer call knock.",
  },
  {
    key: "quiet_buzz",
    label: "Quiet Buzz",
    description: "Low-key vibration-first call alert.",
  },
  {
    key: "classic_phone",
    label: "Classic Phone",
    description: "A familiar phone-style ring.",
  },
  {
    key: "silent_vibrate",
    label: "Silent / Vibrate Only",
    description: "No in-app ringtone, vibration only.",
  },
];

const toText = (value: unknown) => String(value ?? "").trim();

const normalizeCallType = (value: unknown): ChillyChatCallType => {
  const normalized = toText(value).toLowerCase();
  return normalized === "voice" ? "voice" : "video";
};

const normalizeStatus = (value: unknown): ChillyChatCallStatus => {
  const normalized = toText(value).toLowerCase();
  if (
    normalized === "ringing"
    || normalized === "accepted"
    || normalized === "declined"
    || normalized === "missed"
    || normalized === "canceled"
    || normalized === "ended"
    || normalized === "busy"
  ) {
    return normalized;
  }
  return "ringing";
};

const normalizeEventType = (value: unknown): ChillyChatCallEventType => {
  const normalized = toText(value).toLowerCase();
  if (
    normalized === "started"
    || normalized === "accepted"
    || normalized === "declined"
    || normalized === "missed"
    || normalized === "canceled"
    || normalized === "ended"
    || normalized === "busy"
  ) {
    return normalized;
  }
  return "started";
};

export const normalizeChillyChatRingtoneKey = (value: unknown): ChillyChatRingtoneKey => {
  const normalized = toText(value).toLowerCase();
  return CHILLY_CHAT_RINGTONE_OPTIONS.some((option) => option.key === normalized)
    ? normalized as ChillyChatRingtoneKey
    : "chilly_ring";
};

const parseInvite = (row: CallInviteRow | null): ChillyChatCallInvite | null => {
  if (!row) return null;
  const id = toText(row.id);
  const threadId = toText(row.thread_id);
  const callerUserId = toText(row.caller_user_id);
  const calleeUserId = toText(row.callee_user_id);
  if (!id || !threadId || !callerUserId || !calleeUserId) return null;
  return {
    id,
    threadId,
    communicationRoomId: toText(row.communication_room_id) || null,
    callerUserId,
    calleeUserId,
    callType: normalizeCallType(row.call_type),
    status: normalizeStatus(row.status),
    createdAt: toText(row.created_at) || new Date().toISOString(),
    expiresAt: toText(row.expires_at) || new Date(Date.now() + 45_000).toISOString(),
    acceptedAt: toText(row.accepted_at) || null,
    endedAt: toText(row.ended_at) || null,
  };
};

const parseEvent = (row: CallEventRow | null): ChillyChatCallEvent | null => {
  if (!row) return null;
  const id = toText(row.id);
  const threadId = toText(row.thread_id);
  const actorUserId = toText(row.actor_user_id);
  if (!id || !threadId || !actorUserId) return null;
  return {
    id,
    threadId,
    callInviteId: toText(row.call_invite_id) || null,
    actorUserId,
    callType: normalizeCallType(row.call_type),
    eventType: normalizeEventType(row.event_type),
    durationSeconds: typeof row.duration_seconds === "number" ? row.duration_seconds : null,
    createdAt: toText(row.created_at) || new Date().toISOString(),
  };
};

export async function createChillyChatCallInvite(input: {
  threadId: string;
  communicationRoomId: string;
  callerUserId: string;
  calleeUserId: string;
  callType: ChillyChatCallType;
}): Promise<ChillyChatCallInvite | null> {
  const now = new Date();
  const payload: CallInviteInsert = {
    callee_user_id: input.calleeUserId,
    caller_user_id: input.callerUserId,
    call_type: input.callType,
    communication_room_id: input.communicationRoomId,
    created_at: now.toISOString(),
    expires_at: new Date(now.getTime() + 45_000).toISOString(),
    status: "ringing",
    thread_id: input.threadId,
  };

  const { data, error } = await supabase
    .from(CHAT_CALL_INVITES_TABLE)
    .insert(payload)
    .select(CALL_INVITE_SELECT)
    .returns<CallInviteRow>()
    .single();

  if (error || !data) return null;
  const invite = parseInvite(data);
  if (invite) {
    await insertChillyChatCallEvent({
      actorUserId: input.callerUserId,
      callInviteId: invite.id,
      callType: input.callType,
      eventType: "started",
      threadId: input.threadId,
    }).catch(() => null);
  }
  return invite;
}

export async function listChillyChatCallEvents(threadId: string): Promise<ChillyChatCallEvent[]> {
  const normalizedThreadId = toText(threadId);
  if (!normalizedThreadId) return [];
  const { data, error } = await supabase
    .from(CHAT_CALL_EVENTS_TABLE)
    .select(CALL_EVENT_SELECT)
    .eq("thread_id", normalizedThreadId)
    .order("created_at", { ascending: true })
    .limit(50)
    .returns<CallEventRow[]>();

  if (error || !data) return [];
  return data.map(parseEvent).filter((event): event is ChillyChatCallEvent => !!event);
}

export async function readLatestRingingChillyChatCallInvite(threadId: string): Promise<ChillyChatCallInvite | null> {
  const normalizedThreadId = toText(threadId);
  if (!normalizedThreadId) return null;
  const { data, error } = await supabase
    .from(CHAT_CALL_INVITES_TABLE)
    .select(CALL_INVITE_SELECT)
    .eq("thread_id", normalizedThreadId)
    .eq("status", "ringing")
    .gt("expires_at", new Date().toISOString())
    .order("created_at", { ascending: false })
    .limit(1)
    .returns<CallInviteRow[]>();

  if (error || !data?.length) return null;
  return parseInvite(data[0]);
}

export async function updateChillyChatCallInviteStatus(input: {
  invite: ChillyChatCallInvite;
  actorUserId: string;
  status: Exclude<ChillyChatCallStatus, "ringing">;
  durationSeconds?: number | null;
}): Promise<ChillyChatCallInvite | null> {
  const now = new Date().toISOString();
  const updates: CallInviteUpdate = {
    status: input.status,
  };
  if (input.status === "accepted") updates.accepted_at = now;
  if (input.status === "ended") updates.ended_at = now;

  const { data, error } = await supabase
    .from(CHAT_CALL_INVITES_TABLE)
    .update(updates)
    .eq("id", input.invite.id)
    .select(CALL_INVITE_SELECT)
    .returns<CallInviteRow>()
    .maybeSingle();

  if (error) return null;
  await insertChillyChatCallEvent({
    actorUserId: input.actorUserId,
    callInviteId: input.invite.id,
    callType: input.invite.callType,
    durationSeconds: input.durationSeconds,
    eventType: input.status === "accepted"
      ? "accepted"
      : input.status === "declined"
        ? "declined"
        : input.status === "missed"
          ? "missed"
          : input.status === "canceled"
            ? "canceled"
            : input.status === "busy"
              ? "busy"
              : "ended",
    threadId: input.invite.threadId,
  }).catch(() => null);
  return parseInvite(data ?? null);
}

export async function insertChillyChatCallEvent(input: {
  threadId: string;
  callInviteId?: string | null;
  actorUserId: string;
  callType: ChillyChatCallType;
  eventType: ChillyChatCallEventType;
  durationSeconds?: number | null;
}): Promise<ChillyChatCallEvent | null> {
  const payload: CallEventInsert = {
    actor_user_id: input.actorUserId,
    call_invite_id: input.callInviteId ?? null,
    call_type: input.callType,
    duration_seconds: input.durationSeconds ?? null,
    event_type: input.eventType,
    thread_id: input.threadId,
  };
  const { data, error } = await supabase
    .from(CHAT_CALL_EVENTS_TABLE)
    .insert(payload)
    .select(CALL_EVENT_SELECT)
    .returns<CallEventRow>()
    .maybeSingle();

  if (error || !data) return null;
  return parseEvent(data);
}
