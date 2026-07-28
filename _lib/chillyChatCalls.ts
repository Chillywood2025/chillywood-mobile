import type { RealtimeChannel } from "@supabase/supabase-js";
import type { Tables, TablesInsert } from "../supabase/database.types";

import {
  type ChillyChatCallDeliveryStatus,
  type ChillyCallChannelResult,
  normalizeChillyChatCallDispatchResponse,
} from "./chillyChatCallDispatchSchema";

import { supabase } from "./supabase";

export const CHAT_CALL_INVITES_TABLE = "chat_call_invites";
export const CHAT_CALL_EVENTS_TABLE = "chat_call_events";

export type ChillyChatCallType = "voice" | "video";
export type ChillyChatCallStatus = "ringing" | "accepted" | "declined" | "missed" | "canceled" | "ended" | "busy";
export type ChillyChatCallEventType = "started" | "accepted" | "declined" | "missed" | "canceled" | "ended" | "busy";
export type ChillyChatCallMediaProvider = "legacy_webrtc" | "livekit";
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
  mediaProvider: ChillyChatCallMediaProvider;
  status: ChillyChatCallStatus;
  createdAt: string;
  expiresAt: string;
  acceptedAt: string | null;
  endedAt: string | null;
};

export type ChillyChatCallInviteDelivery = {
  attempted: boolean;
  eligible: boolean | null;
  notificationCreated: boolean;
  pushSent: boolean;
  reason: string;
  status: ChillyChatCallDeliveryStatus;
  channels?: {
    androidNative: ChillyCallChannelResult;
    iosVoip: ChillyCallChannelResult;
    ordinaryPush: ChillyCallChannelResult;
    inAppNotification: ChillyCallChannelResult;
  };
};

export type CreatedChillyChatCallInvite = {
  delivery: ChillyChatCallInviteDelivery;
  invite: ChillyChatCallInvite;
};

export type BegunChillyChatCall = {
  created: boolean;
  invite: ChillyChatCallInvite;
  role: "caller" | "callee";
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
type CallEventRow = Tables<"chat_call_events">;
type CallEventInsert = TablesInsert<"chat_call_events">;

const CALL_INVITE_SELECT =
  "id,thread_id,communication_room_id,caller_user_id,callee_user_id,call_type,chat_call_media_provider,status,created_at,expires_at,accepted_at,ended_at";
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

export const normalizeChillyChatCallMediaProvider = (
  value: unknown,
): ChillyChatCallMediaProvider => (
  toText(value).toLowerCase() === "livekit" ? "livekit" : "legacy_webrtc"
);

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
    mediaProvider: normalizeChillyChatCallMediaProvider(row.chat_call_media_provider),
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

const DEFAULT_CALL_DELIVERY: ChillyChatCallInviteDelivery = {
  attempted: false,
  eligible: null,
  notificationCreated: false,
  pushSent: false,
  reason: "not_attempted",
  status: "unknown",
};

type CallDispatchAction = "incoming" | "missed" | "cancel" | "declined" | "end" | "timeout";

export async function dispatchChillyChatCallPush(input: {
  action: CallDispatchAction;
  inviteId: string;
}): Promise<ChillyChatCallInviteDelivery> {
  const inviteId = toText(input.inviteId);
  if (!inviteId) {
    return {
      ...DEFAULT_CALL_DELIVERY,
      attempted: false,
      reason: "missing_invite_id",
      status: "failed",
    };
  }
  const { data, error } = await supabase.functions.invoke("chilly-chat-call-dispatch", {
    body: {
      action: input.action,
      inviteId,
    },
  });
  if (error) {
    return {
      ...DEFAULT_CALL_DELIVERY,
      attempted: true,
      reason: toText(error.message) || "dispatch_failed",
      status: "failed",
    };
  }
  const response = normalizeChillyChatCallDispatchResponse(data);
  return {
    attempted: true,
    eligible: response.eligible,
    notificationCreated: response.result.notificationCreated,
    pushSent: response.result.pushSent,
    reason: response.result.reason,
    status: response.result.status,
    channels: response.channels,
  };
}

export async function beginChillyChatCall(input: {
  threadId: string;
  communicationRoomId: string;
  callType: ChillyChatCallType;
}): Promise<BegunChillyChatCall> {
  const { data, error } = await supabase.rpc("begin_chilly_chat_call", {
    p_call_type: input.callType,
    p_communication_room_id: input.communicationRoomId,
    p_thread_id: input.threadId,
  });
  if (error || !data || typeof data !== "object" || Array.isArray(data)) {
    throw error ?? new Error("Unable to reserve this Chi'lly Chat call.");
  }

  const payload = data as Record<string, unknown>;
  const invitePayload = payload.invite;
  if (!invitePayload || typeof invitePayload !== "object" || Array.isArray(invitePayload)) {
    throw new Error("Unable to read the reserved Chi'lly Chat call.");
  }
  const invite = parseInvite(invitePayload as CallInviteRow);
  if (!invite) {
    throw new Error("Unable to read the reserved Chi'lly Chat call.");
  }
  const session = await supabase.auth.getSession();
  const currentUserId = toText(session.data.session?.user?.id);
  const role = invite.callerUserId === currentUserId
    ? "caller"
    : invite.calleeUserId === currentUserId
      ? "callee"
      : null;
  if (!role) {
    throw new Error("The reserved Chi'lly Chat call does not belong to this account.");
  }

  return {
    created: payload.created === true,
    invite,
    role,
  };
}

export async function createChillyChatCallInvite(input: {
  threadId: string;
  communicationRoomId: string;
  callerUserId: string;
  calleeUserId: string;
  callType: ChillyChatCallType;
}): Promise<CreatedChillyChatCallInvite> {
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

  if (error || !data) {
    throw error ?? new Error("Unable to create Chi'lly Chat call invite.");
  }
  const invite = parseInvite(data);
  if (!invite) {
    throw new Error("Unable to read Chi'lly Chat call invite.");
  }

  await insertChillyChatCallEvent({
    actorUserId: input.callerUserId,
    callInviteId: invite.id,
    callType: input.callType,
    eventType: "started",
    threadId: input.threadId,
  }).catch(() => null);

  const delivery = await dispatchChillyChatCallPush({
    action: "incoming",
    inviteId: invite.id,
  });

  return { delivery, invite };
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

export async function readLatestRingingChillyChatCallInviteForCallee(calleeUserId?: string): Promise<ChillyChatCallInvite | null> {
  const explicitCalleeUserId = toText(calleeUserId);
  const viewerUserId = explicitCalleeUserId || toText((await supabase.auth.getSession()).data.session?.user?.id);
  if (!viewerUserId) return null;

  const { data, error } = await supabase
    .from(CHAT_CALL_INVITES_TABLE)
    .select(CALL_INVITE_SELECT)
    .eq("callee_user_id", viewerUserId)
    .eq("status", "ringing")
    .gt("expires_at", new Date().toISOString())
    .order("created_at", { ascending: false })
    .limit(1)
    .returns<CallInviteRow[]>();

  if (error || !data?.length) return null;
  const invite = parseInvite(data[0]);
  if (!invite || invite.callerUserId === viewerUserId) return null;
  return invite;
}

export async function readChillyChatCallInvite(inviteId: string): Promise<ChillyChatCallInvite | null> {
  const normalizedInviteId = toText(inviteId);
  if (!normalizedInviteId) return null;

  const { data, error } = await supabase
    .from(CHAT_CALL_INVITES_TABLE)
    .select(CALL_INVITE_SELECT)
    .eq("id", normalizedInviteId)
    .returns<CallInviteRow>()
    .maybeSingle();

  if (error || !data) return null;
  return parseInvite(data);
}

export async function readLatestChillyChatCallInviteForRoom(roomId: string): Promise<ChillyChatCallInvite | null> {
  const normalizedRoomId = toText(roomId);
  if (!normalizedRoomId) return null;

  const { data, error } = await supabase
    .from(CHAT_CALL_INVITES_TABLE)
    .select(CALL_INVITE_SELECT)
    .eq("communication_room_id", normalizedRoomId)
    .order("created_at", { ascending: false })
    .limit(1)
    .returns<CallInviteRow[]>();

  if (error || !data?.length) return null;
  return parseInvite(data[0]);
}

export function subscribeToIncomingChillyChatCallInvites(
  calleeUserId: string,
  onChange: () => void,
) {
  const normalizedCalleeUserId = toText(calleeUserId);
  if (!normalizedCalleeUserId) return () => {};

  let channel: RealtimeChannel | null = supabase
    .channel(`chat-call-invites-callee-${normalizedCalleeUserId}`)
    .on(
      "postgres_changes",
      {
        event: "*",
        schema: "public",
        table: CHAT_CALL_INVITES_TABLE,
        filter: `callee_user_id=eq.${normalizedCalleeUserId}`,
      },
      () => onChange(),
    )
    .subscribe();

  return () => {
    if (channel) {
      supabase.removeChannel(channel);
      channel = null;
    }
  };
}

export function subscribeToChillyChatCallInvite(
  inviteId: string,
  onChange: () => void,
) {
  const normalizedInviteId = toText(inviteId);
  if (!normalizedInviteId) return () => {};

  let channel: RealtimeChannel | null = supabase
    .channel(`chat-call-invite-${normalizedInviteId}`)
    .on(
      "postgres_changes",
      {
        event: "*",
        schema: "public",
        table: CHAT_CALL_INVITES_TABLE,
        filter: `id=eq.${normalizedInviteId}`,
      },
      () => onChange(),
    )
    .subscribe();

  return () => {
    if (channel) {
      supabase.removeChannel(channel);
      channel = null;
    }
  };
}

export async function updateChillyChatCallInviteStatus(input: {
  invite: ChillyChatCallInvite;
  actorUserId: string;
  status: Exclude<ChillyChatCallStatus, "ringing">;
  durationSeconds?: number | null;
}): Promise<ChillyChatCallInvite | null> {
  const actorUserId = toText(input.actorUserId);
  const inviteId = toText(input.invite.id);
  if (!actorUserId || !inviteId) return null;
  const { data: sessionData } = await supabase.auth.getSession();
  if (toText(sessionData.session?.user?.id) !== actorUserId) return null;

  const { data, error } = await supabase.functions.invoke("chilly-chat-call-transition", {
    body: {
      durationSeconds: input.durationSeconds ?? null,
      inviteId,
      status: input.status,
    },
  });
  if (error || !data || typeof data !== "object") return null;
  const snapshot = (data as { invite?: unknown }).invite;
  if (!snapshot || typeof snapshot !== "object") return null;
  const row = snapshot as Record<string, unknown>;
  const id = toText(row.id);
  const threadId = toText(row.threadId);
  const callerUserId = toText(row.callerUserId);
  const calleeUserId = toText(row.calleeUserId);
  const createdAt = toText(row.createdAt);
  const expiresAt = toText(row.expiresAt);
  if (!id || !threadId || !callerUserId || !calleeUserId || !createdAt || !expiresAt) return null;
  return {
    id,
    threadId,
    communicationRoomId: toText(row.communicationRoomId) || null,
    callerUserId,
    calleeUserId,
    callType: normalizeCallType(row.callType),
    mediaProvider: normalizeChillyChatCallMediaProvider(row.chatCallMediaProvider),
    status: normalizeStatus(row.status),
    createdAt,
    expiresAt,
    acceptedAt: toText(row.acceptedAt) || null,
    endedAt: toText(row.endedAt) || null,
  };
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
