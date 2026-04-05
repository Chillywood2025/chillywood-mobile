import type { RealtimeChannel } from "@supabase/supabase-js";

import {
  createCommunicationRoom,
  getCommunicationRoomSnapshot,
  readCommunicationIdentity,
} from "./communication";
import { supabase } from "./supabase";
import { readUserProfile } from "./userData";
import { getWritablePartyUserId } from "./watchParty";

export const CHAT_THREADS_TABLE = "chat_threads";
export const CHAT_THREAD_MEMBERS_TABLE = "chat_thread_members";
export const CHAT_MESSAGES_TABLE = "chat_messages";

export type ChatCallType = "voice" | "video";

export type ChatTargetIdentity = {
  userId: string;
  displayName?: string;
  avatarUrl?: string | null;
  tagline?: string | null;
};

export type ChatThreadMember = {
  threadId: string;
  userId: string;
  displayName: string;
  avatarUrl?: string;
  tagline?: string;
  joinedAt: string;
  lastReadAt?: string;
  unreadCount: number;
};

export type ChatThreadSummary = {
  threadId: string;
  participantPairKey: string;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
  lastMessageAt?: string;
  lastMessagePreview?: string;
  activeCommunicationRoomId?: string;
  activeCallType?: ChatCallType;
  members: ChatThreadMember[];
  currentMember: ChatThreadMember | null;
  otherMember: ChatThreadMember | null;
};

export type ChatMessage = {
  id: string;
  threadId: string;
  senderUserId: string;
  body: string;
  messageType: "text";
  createdAt: string;
};

type ChatThreadRow = {
  id?: string | null;
  participant_pair_key?: string | null;
  created_by?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
  last_message_at?: string | null;
  last_message_preview?: string | null;
  active_communication_room_id?: string | null;
  active_call_type?: string | null;
  members?: ChatThreadMemberRow[] | null;
};

type ChatThreadMemberRow = {
  thread_id?: string | null;
  user_id?: string | null;
  display_name?: string | null;
  avatar_url?: string | null;
  tagline?: string | null;
  joined_at?: string | null;
  last_read_at?: string | null;
  unread_count?: number | null;
};

type ChatMessageRow = {
  id?: string | null;
  thread_id?: string | null;
  sender_user_id?: string | null;
  body?: string | null;
  message_type?: string | null;
  created_at?: string | null;
};

const CHAT_THREAD_MEMBER_SELECT =
  "thread_id,user_id,display_name,avatar_url,tagline,joined_at,last_read_at,unread_count";
const CHAT_THREAD_SELECT =
  `id,participant_pair_key,created_by,created_at,updated_at,last_message_at,last_message_preview,active_communication_room_id,active_call_type,members:${CHAT_THREAD_MEMBERS_TABLE}(${CHAT_THREAD_MEMBER_SELECT})`;
const CHAT_MESSAGE_SELECT =
  "id,thread_id,sender_user_id,body,message_type,created_at";

const toText = (value: unknown) => String(value ?? "").trim();

const normalizeCallType = (value: unknown): ChatCallType | undefined => {
  const normalized = toText(value).toLowerCase();
  if (normalized === "voice" || normalized === "video") return normalized;
  return undefined;
};

export const buildDirectParticipantPairKey = (a: string, b: string) =>
  [toText(a), toText(b)].filter(Boolean).sort().join("::");

async function getRequiredChatUserId() {
  const userId = toText(await getWritablePartyUserId());
  if (!userId) {
    throw new Error("Chi'lly Chat requires a signed-in user.");
  }
  return userId;
}

function parseChatThreadMember(row: ChatThreadMemberRow): ChatThreadMember | null {
  const threadId = toText(row.thread_id);
  const userId = toText(row.user_id);
  if (!threadId || !userId) return null;

  return {
    threadId,
    userId,
    displayName: toText(row.display_name) || "User",
    avatarUrl: toText(row.avatar_url) || undefined,
    tagline: toText(row.tagline) || undefined,
    joinedAt: toText(row.joined_at) || new Date().toISOString(),
    lastReadAt: toText(row.last_read_at) || undefined,
    unreadCount: Math.max(0, Number(row.unread_count ?? 0) || 0),
  };
}

function parseChatThread(row: ChatThreadRow, currentUserId: string): ChatThreadSummary | null {
  const threadId = toText(row.id);
  const participantPairKey = toText(row.participant_pair_key);
  const createdBy = toText(row.created_by);
  if (!threadId || !participantPairKey || !createdBy) return null;

  const members = ((row.members ?? []) as ChatThreadMemberRow[])
    .map(parseChatThreadMember)
    .filter(Boolean) as ChatThreadMember[];
  const orderedMembers = [...members].sort((a, b) => {
    const aSelf = a.userId === currentUserId ? 1 : 0;
    const bSelf = b.userId === currentUserId ? 1 : 0;
    if (aSelf !== bSelf) return bSelf - aSelf;
    return a.displayName.localeCompare(b.displayName);
  });
  const currentMember = orderedMembers.find((member) => member.userId === currentUserId) ?? null;
  const otherMember = orderedMembers.find((member) => member.userId !== currentUserId) ?? null;

  return {
    threadId,
    participantPairKey,
    createdBy,
    createdAt: toText(row.created_at) || new Date().toISOString(),
    updatedAt: toText(row.updated_at) || new Date().toISOString(),
    lastMessageAt: toText(row.last_message_at) || undefined,
    lastMessagePreview: toText(row.last_message_preview) || undefined,
    activeCommunicationRoomId: toText(row.active_communication_room_id) || undefined,
    activeCallType: normalizeCallType(row.active_call_type),
    members: orderedMembers,
    currentMember,
    otherMember,
  };
}

function parseChatMessage(row: ChatMessageRow): ChatMessage | null {
  const id = toText(row.id);
  const threadId = toText(row.thread_id);
  const senderUserId = toText(row.sender_user_id);
  const body = toText(row.body);
  if (!id || !threadId || !senderUserId || !body) return null;

  return {
    id,
    threadId,
    senderUserId,
    body,
    messageType: "text",
    createdAt: toText(row.created_at) || new Date().toISOString(),
  };
}

export async function listChatThreads(): Promise<ChatThreadSummary[]> {
  const currentUserId = await getRequiredChatUserId();
  const { data, error } = await supabase
    .from(CHAT_THREADS_TABLE)
    .select(CHAT_THREAD_SELECT)
    .order("last_message_at", { ascending: false, nullsFirst: false })
    .order("updated_at", { ascending: false });

  if (error || !data) return [];

  return (data as ChatThreadRow[])
    .map((row) => parseChatThread(row, currentUserId))
    .filter(Boolean) as ChatThreadSummary[];
}

export async function getChatThread(threadId: string): Promise<ChatThreadSummary | null> {
  const currentUserId = await getRequiredChatUserId();
  const normalizedThreadId = toText(threadId);
  if (!normalizedThreadId) return null;

  const { data, error } = await supabase
    .from(CHAT_THREADS_TABLE)
    .select(CHAT_THREAD_SELECT)
    .eq("id", normalizedThreadId)
    .maybeSingle();

  if (error || !data) return null;
  return parseChatThread(data as ChatThreadRow, currentUserId);
}

export async function listChatMessages(threadId: string): Promise<ChatMessage[]> {
  const normalizedThreadId = toText(threadId);
  if (!normalizedThreadId) return [];

  const { data, error } = await supabase
    .from(CHAT_MESSAGES_TABLE)
    .select(CHAT_MESSAGE_SELECT)
    .eq("thread_id", normalizedThreadId)
    .order("created_at", { ascending: true });

  if (error || !data) return [];
  return (data as ChatMessageRow[])
    .map(parseChatMessage)
    .filter(Boolean) as ChatMessage[];
}

export async function getOrCreateDirectThread(target: ChatTargetIdentity): Promise<ChatThreadSummary> {
  const currentUserId = await getRequiredChatUserId();
  const targetUserId = toText(target.userId);
  if (!targetUserId) {
    throw new Error("Missing target user for Chi'lly Chat thread.");
  }
  if (targetUserId === currentUserId) {
    throw new Error("Use the Chi'lly Chat inbox for your own profile.");
  }

  const participantPairKey = buildDirectParticipantPairKey(currentUserId, targetUserId);
  if (!participantPairKey) {
    throw new Error("Missing participant identities for Chi'lly Chat thread.");
  }

  const existing = await supabase
    .from(CHAT_THREADS_TABLE)
    .select(CHAT_THREAD_SELECT)
    .eq("participant_pair_key", participantPairKey)
    .maybeSingle();

  if (!existing.error && existing.data) {
    const thread = parseChatThread(existing.data as ChatThreadRow, currentUserId);
    if (thread) return thread;
  }

  const [currentIdentity, currentProfile] = await Promise.all([
    readCommunicationIdentity(),
    readUserProfile().catch(() => null),
  ]);

  const inserted = await supabase
    .from(CHAT_THREADS_TABLE)
    .insert({
      thread_kind: "direct",
      participant_pair_key: participantPairKey,
      created_by: currentUserId,
    })
    .select("id")
    .single();

  if (inserted.error) {
    const errorCode = toText((inserted.error as { code?: unknown })?.code);
    if (errorCode === "23505") {
      const raced = await getChatThreadByPairKey(participantPairKey);
      if (raced) return raced;
    }
    throw inserted.error;
  }

  const threadId = toText((inserted.data as { id?: unknown } | null)?.id);
  if (!threadId) {
    throw new Error("Failed to create Chi'lly Chat thread.");
  }

  const memberRows = [
    {
      thread_id: threadId,
      user_id: currentUserId,
      display_name: toText(currentIdentity.displayName) || "You",
      avatar_url: toText(currentIdentity.avatarUrl) || null,
      tagline: toText(currentIdentity.tagline ?? currentProfile?.tagline) || null,
    },
    {
      thread_id: threadId,
      user_id: targetUserId,
      display_name: toText(target.displayName) || "Channel",
      avatar_url: toText(target.avatarUrl) || null,
      tagline: toText(target.tagline) || null,
    },
  ];

  const membershipInsert = await supabase
    .from(CHAT_THREAD_MEMBERS_TABLE)
    .upsert(memberRows, { onConflict: "thread_id,user_id" });

  if (membershipInsert.error) {
    throw membershipInsert.error;
  }

  const thread = await getChatThread(threadId);
  if (!thread) {
    throw new Error("Failed to load the new Chi'lly Chat thread.");
  }

  return thread;
}

async function getChatThreadByPairKey(pairKey: string) {
  const currentUserId = await getRequiredChatUserId();
  const { data, error } = await supabase
    .from(CHAT_THREADS_TABLE)
    .select(CHAT_THREAD_SELECT)
    .eq("participant_pair_key", pairKey)
    .maybeSingle();

  if (error || !data) return null;
  return parseChatThread(data as ChatThreadRow, currentUserId);
}

export async function sendChatMessage(threadId: string, body: string): Promise<ChatMessage> {
  const currentUserId = await getRequiredChatUserId();
  const normalizedThreadId = toText(threadId);
  const trimmedBody = toText(body);
  if (!normalizedThreadId || !trimmedBody) {
    throw new Error("Message text is required.");
  }

  const { data, error } = await supabase
    .from(CHAT_MESSAGES_TABLE)
    .insert({
      thread_id: normalizedThreadId,
      sender_user_id: currentUserId,
      body: trimmedBody,
      message_type: "text",
    })
    .select(CHAT_MESSAGE_SELECT)
    .single();

  if (error || !data) {
    throw error ?? new Error("Failed to send Chi'lly Chat message.");
  }

  const message = parseChatMessage(data as ChatMessageRow);
  if (!message) {
    throw new Error("Failed to parse Chi'lly Chat message.");
  }
  return message;
}

export async function markChatThreadRead(threadId: string): Promise<void> {
  const currentUserId = await getRequiredChatUserId();
  const normalizedThreadId = toText(threadId);
  if (!normalizedThreadId) return;

  await supabase
    .from(CHAT_THREAD_MEMBERS_TABLE)
    .update({
      unread_count: 0,
      last_read_at: new Date().toISOString(),
    })
    .eq("thread_id", normalizedThreadId)
    .eq("user_id", currentUserId);
}

export async function clearEndedChatThreadCall(threadId: string): Promise<void> {
  const normalizedThreadId = toText(threadId);
  if (!normalizedThreadId) return;

  await supabase
    .from(CHAT_THREADS_TABLE)
    .update({
      active_communication_room_id: null,
      active_call_type: null,
    })
    .eq("id", normalizedThreadId);
}

export async function startChatThreadCall(threadId: string, mode: ChatCallType): Promise<{
  thread: ChatThreadSummary;
  roomId: string;
  callType: ChatCallType;
}> {
  const currentUserId = await getRequiredChatUserId();
  const thread = await getChatThread(threadId);
  if (!thread) {
    throw new Error("Unable to load Chi'lly Chat thread.");
  }

  const existingRoomId = toText(thread.activeCommunicationRoomId);
  if (existingRoomId) {
    const snapshot = await getCommunicationRoomSnapshot(existingRoomId);
    if (snapshot?.room.status === "active") {
      return {
        thread,
        roomId: existingRoomId,
        callType: thread.activeCallType ?? mode,
      };
    }

    await clearEndedChatThreadCall(thread.threadId);
  }

  const created = await createCommunicationRoom({
    hostUserId: currentUserId,
  });

  if ("error" in created) {
    throw new Error(created.error.message);
  }

  const roomId = toText(created.roomId);
  await supabase
    .from(CHAT_THREADS_TABLE)
    .update({
      active_communication_room_id: roomId,
      active_call_type: mode,
    })
    .eq("id", thread.threadId);

  const updated = await getChatThread(thread.threadId);
  if (!updated) {
    throw new Error("Unable to refresh Chi'lly Chat call state.");
  }

  return {
    thread: updated,
    roomId,
    callType: mode,
  };
}

export function subscribeToInbox(onChange: () => void) {
  let active = true;
  let memberChannel: RealtimeChannel | null = null;
  let threadChannel: RealtimeChannel | null = null;

  getRequiredChatUserId()
    .then((currentUserId) => {
      if (!active) return;
      memberChannel = supabase
        .channel(`chat-inbox-${currentUserId}`)
        .on(
          "postgres_changes",
          {
            event: "*",
            schema: "public",
            table: CHAT_THREAD_MEMBERS_TABLE,
            filter: `user_id=eq.${currentUserId}`,
          },
          () => onChange(),
        )
        .subscribe();

      threadChannel = supabase
        .channel(`chat-inbox-threads-${currentUserId}`)
        .on(
          "postgres_changes",
          {
            event: "*",
            schema: "public",
            table: CHAT_THREADS_TABLE,
          },
          () => onChange(),
        )
        .subscribe();
    })
    .catch(() => null);

  return () => {
    active = false;
    if (memberChannel) supabase.removeChannel(memberChannel);
    if (threadChannel) supabase.removeChannel(threadChannel);
  };
}

export function subscribeToThread(threadId: string, onChange: () => void) {
  const normalizedThreadId = toText(threadId);
  if (!normalizedThreadId) return () => {};

  const channel = supabase
    .channel(`chat-thread-${normalizedThreadId}`)
    .on(
      "postgres_changes",
      {
        event: "*",
        schema: "public",
        table: CHAT_MESSAGES_TABLE,
        filter: `thread_id=eq.${normalizedThreadId}`,
      },
      () => onChange(),
    )
    .on(
      "postgres_changes",
      {
        event: "*",
        schema: "public",
        table: CHAT_THREAD_MEMBERS_TABLE,
        filter: `thread_id=eq.${normalizedThreadId}`,
      },
      () => onChange(),
    )
    .on(
      "postgres_changes",
      {
        event: "*",
        schema: "public",
        table: CHAT_THREADS_TABLE,
        filter: `id=eq.${normalizedThreadId}`,
      },
      () => onChange(),
    )
    .subscribe();

  return () => {
    supabase.removeChannel(channel);
  };
}
