import type { RealtimeChannel } from "@supabase/supabase-js";
import type { Tables, TablesInsert, TablesUpdate } from "../supabase/database.types";

import {
  createCommunicationRoom,
  endCommunicationRoom,
  formatCommunicationRoomCode,
  getCommunicationRoomSnapshot,
  isCommunicationRoomActive,
} from "./communication";
import {
  CHAT_CALL_EVENTS_TABLE,
  CHAT_CALL_INVITES_TABLE,
  beginChillyChatCall,
  dispatchChillyChatCallPush,
  readLatestChillyChatCallInviteForRoom,
  type BegunChillyChatCall,
  type ChillyChatCallInvite,
  type ChillyChatCallInviteDelivery,
} from "./chillyChatCalls";
import {
  createSocialAttachmentForSurface,
  readSocialAttachmentsForSurfaces,
  type SocialAttachment,
  type SocialAttachmentFile,
} from "./socialAttachments";
import { supabase } from "./supabase";
import { normalizePeopleSearchQuery } from "./peopleSearchNormalization";
import { getWritablePartyUserId } from "./watchParty";

export const CHAT_THREADS_TABLE = "chat_threads";
export const CHAT_THREAD_MEMBERS_TABLE = "chat_thread_members";
export const CHAT_MESSAGES_TABLE = "chat_messages";
export const CHAT_USER_PROFILES_TABLE = "user_profiles";

export type ChatCallType = "voice" | "video";

export type ChatTargetIdentity = {
  userId: string;
  displayName?: string;
  avatarUrl?: string | null;
  tagline?: string | null;
};

export type ChatUserSearchResult = ChatTargetIdentity & {
  username?: string;
};

export type ChatThreadMember = {
  threadId: string;
  userId: string;
  username?: string;
  displayName: string;
  avatarUrl?: string;
  tagline?: string;
  joinedAt: string;
  lastReadAt?: string;
  hiddenAt?: string;
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
  attachments: SocialAttachment[];
  moderationStatus: "clean" | "hidden" | "removed";
  moderationReason?: string;
  moderationReportId?: number;
  moderationActionedAt?: string;
  isModerationHidden: boolean;
};

type ChatThreadMemberRow = Pick<
  Tables<"chat_thread_members">,
  "thread_id" | "user_id" | "display_name" | "avatar_url" | "tagline" | "joined_at" | "last_read_at" | "hidden_at" | "unread_count"
>;

type ChatThreadRow = Pick<
  Tables<"chat_threads">,
  | "id"
  | "participant_pair_key"
  | "created_by"
  | "created_at"
  | "updated_at"
  | "last_message_at"
  | "last_message_preview"
  | "active_communication_room_id"
  | "active_call_type"
> & {
  members: ChatThreadMemberRow[] | null;
};

type ChatMessageRow = {
  id: string | null;
  thread_id: string | null;
  sender_user_id: string | null;
  body: string | null;
  message_type: string | null;
  created_at: string | null;
  moderation_status?: string | null;
  moderation_reason?: string | null;
  moderation_report_id?: number | null;
  moderation_actioned_at?: string | null;
};

type ChatUserProfileRow = Pick<
  Tables<"user_profiles">,
  "user_id" | "username" | "display_name" | "avatar_url" | "tagline"
>;

type ChatThreadMemberUpdate = TablesUpdate<"chat_thread_members">;
type ChatMessageInsert = TablesInsert<"chat_messages">;
type ChatCallInviteStatusRow = Pick<
  Tables<"chat_call_invites">,
  "id" | "thread_id" | "communication_room_id" | "status" | "created_at" | "expires_at"
>;

type DirectChatThreadOpenRepairRpc = PromiseLike<{
  data: { thread_id?: unknown }[] | null;
  error: { message?: string } | null;
}>;

type ChatThreadVisibilityRpc = PromiseLike<{
  data: Record<string, unknown> | null;
  error: { message?: string } | null;
}>;

const CHAT_THREAD_MEMBER_SELECT =
  "thread_id,user_id,display_name,avatar_url,tagline,joined_at,last_read_at,hidden_at,unread_count";
const CHAT_THREAD_SELECT =
  `id,participant_pair_key,created_by,created_at,updated_at,last_message_at,last_message_preview,active_communication_room_id,active_call_type,members:${CHAT_THREAD_MEMBERS_TABLE}(${CHAT_THREAD_MEMBER_SELECT})`;
const CHAT_MESSAGE_SELECT =
  "id,thread_id,sender_user_id,body,message_type,created_at,moderation_status,moderation_reason,moderation_report_id,moderation_actioned_at";
const CHAT_USER_SEARCH_SELECT =
  "user_id,username,display_name,avatar_url,tagline";

const toText = (value: unknown) => String(value ?? "").trim();
const isDefined = <T>(value: T | null): value is T => value !== null;

const logChatSearch = (event: string, details?: Record<string, unknown>) => {
  void event;
  void details;
};

const logChatInvite = (event: string, details?: Record<string, unknown>) => {
  void event;
  void details;
};

const logChatThread = (event: string, details?: Record<string, unknown>) => {
  void event;
  void details;
};

const logChatCall = (event: string, details?: Record<string, unknown>) => {
  void event;
  void details;
};

const normalizeCallType = (value: unknown): ChatCallType | undefined => {
  const normalized = toText(value).toLowerCase();
  if (normalized === "voice" || normalized === "video") return normalized;
  return undefined;
};

export const buildDirectParticipantPairKey = (a: string, b: string) =>
  [toText(a), toText(b)].filter(Boolean).sort().join("::");

async function openOrRepairDirectThreadWithRpc(target: ChatTargetIdentity): Promise<ChatThreadSummary> {
  const targetUserId = toText(target.userId);
  const rpc = (supabase.rpc as unknown as (
    fn: "get_or_create_direct_chat_thread",
    args: {
      p_target_user_id: string;
      p_target_display_name: string | null;
      p_target_avatar_url: string | null;
      p_target_tagline: string | null;
    },
  ) => DirectChatThreadOpenRepairRpc)("get_or_create_direct_chat_thread", {
    p_target_user_id: targetUserId,
    p_target_display_name: toText(target.displayName) || null,
    p_target_avatar_url: toText(target.avatarUrl) || null,
    p_target_tagline: toText(target.tagline) || null,
  });

  const { data, error } = await rpc;
  if (error) {
    logChatThread("direct_thread_rpc_repair_failed", {
      targetUserId,
      message: error.message ?? "unknown_error",
    });
    throw new Error("Unable to open Chi'lly Chat with this person right now.");
  }

  const threadId = toText(data?.[0]?.thread_id);
  if (!threadId) {
    logChatThread("direct_thread_rpc_repair_missing_thread", { targetUserId });
    throw new Error("Unable to open Chi'lly Chat with this person right now.");
  }

  const thread = await getChatThread(threadId);
  if (!thread?.currentMember || !thread.otherMember) {
    logChatThread("direct_thread_rpc_repair_readback_failed", {
      targetUserId,
      threadId,
    });
    throw new Error("Unable to open Chi'lly Chat with this person right now.");
  }

  await unhideChatThreadForMe(thread.threadId);
  const visibleThread = await getChatThread(thread.threadId);

  logChatThread("direct_thread_rpc_repair_success", {
    targetUserId,
    threadId: thread.threadId,
  });
  return visibleThread ?? thread;
}

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
    hiddenAt: toText(row.hidden_at) || undefined,
    unreadCount: Math.max(0, Number(row.unread_count ?? 0) || 0),
  };
}

function isHiddenFromCurrentInbox(thread: ChatThreadSummary) {
  const hiddenAt = toText(thread.currentMember?.hiddenAt);
  if (!hiddenAt) return false;
  const hiddenTime = Date.parse(hiddenAt);
  if (!Number.isFinite(hiddenTime)) return false;

  const lastMessageAt = toText(thread.lastMessageAt);
  if (!lastMessageAt) return true;
  const lastMessageTime = Date.parse(lastMessageAt);
  return !Number.isFinite(lastMessageTime) || lastMessageTime <= hiddenTime;
}

function parseChatThread(
  row: ChatThreadRow,
  currentUserId: string,
  options?: { requireCurrentMember?: boolean },
): ChatThreadSummary | null {
  const threadId = toText(row.id);
  const participantPairKey = toText(row.participant_pair_key);
  const createdBy = toText(row.created_by);
  if (!threadId || !participantPairKey || !createdBy) return null;

  const requireCurrentMember = options?.requireCurrentMember ?? true;
  const members = (row.members ?? [])
    .map(parseChatThreadMember)
    .filter(isDefined);
  const orderedMembers = [...members].sort((a, b) => {
    const aSelf = a.userId === currentUserId ? 1 : 0;
    const bSelf = b.userId === currentUserId ? 1 : 0;
    if (aSelf !== bSelf) return bSelf - aSelf;
    return a.displayName.localeCompare(b.displayName);
  });
  const currentMember = orderedMembers.find((member) => member.userId === currentUserId) ?? null;
  const otherMember = orderedMembers.find((member) => member.userId !== currentUserId) ?? null;
  if (requireCurrentMember && !currentMember) return null;

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

function parseChatMessage(
  row: ChatMessageRow,
  attachments: SocialAttachment[] = [],
): ChatMessage | null {
  const id = toText(row.id);
  const threadId = toText(row.thread_id);
  const senderUserId = toText(row.sender_user_id);
  const body = toText(row.body);
  const rawModerationStatus = toText(row.moderation_status).toLowerCase();
  const moderationStatus = rawModerationStatus === "hidden" || rawModerationStatus === "removed"
    ? rawModerationStatus
    : "clean";
  const isModerationHidden = moderationStatus === "hidden" || moderationStatus === "removed";
  if (!id || !threadId || !senderUserId || (!body && !isModerationHidden)) return null;

  return {
    id,
    threadId,
    senderUserId,
    body: isModerationHidden
      ? moderationStatus === "removed"
        ? "This message was removed after review."
        : "This message is hidden while it is reviewed."
      : body,
    messageType: "text",
    createdAt: toText(row.created_at) || new Date().toISOString(),
    attachments: isModerationHidden ? [] : attachments,
    moderationStatus,
    moderationReason: toText(row.moderation_reason) || undefined,
    moderationReportId: Number.isFinite(Number(row.moderation_report_id)) ? Number(row.moderation_report_id) : undefined,
    moderationActionedAt: toText(row.moderation_actioned_at) || undefined,
    isModerationHidden,
  };
}

async function enrichChatThreadsWithUsernames(threads: ChatThreadSummary[]) {
  const userIds = Array.from(new Set(threads.flatMap((thread) => thread.members.map((member) => member.userId)).filter(Boolean)));
  if (!userIds.length) return threads;

  const { data, error } = await supabase
    .from(CHAT_USER_PROFILES_TABLE)
    .select(CHAT_USER_SEARCH_SELECT)
    .in("user_id", userIds)
    .returns<ChatUserProfileRow[]>();

  if (error || !data) return threads;

  const profileByUserId = new Map(data.map((row) => [toText(row.user_id), row]));
  return threads.map((thread) => {
    const members = thread.members.map((member) => {
      const profile = profileByUserId.get(member.userId);
      const username = toText(profile?.username);
      const displayName = toText(profile?.display_name) || username;
      if (!profile && !username && !displayName) return member;
      return {
        ...member,
        username: username || member.username,
        displayName: displayName || member.displayName,
        avatarUrl: toText(profile?.avatar_url) || member.avatarUrl,
        tagline: toText(profile?.tagline) || member.tagline,
      };
    });
    const currentMember = members.find((member) => member.userId === thread.currentMember?.userId) ?? thread.currentMember;
    const otherMember = members.find((member) => member.userId === thread.otherMember?.userId) ?? thread.otherMember;
    return { ...thread, members, currentMember, otherMember };
  });
}

async function shouldClearStaleActiveThreadCall(thread: ChatThreadSummary): Promise<boolean> {
  const threadId = toText(thread.threadId);
  const roomId = toText(thread.activeCommunicationRoomId);
  if (!threadId || !roomId || !thread.activeCallType) return false;

  const { data } = await supabase
    .from(CHAT_CALL_INVITES_TABLE)
    .select("id,thread_id,communication_room_id,status,created_at,expires_at")
    .eq("thread_id", threadId)
    .eq("communication_room_id", roomId)
    .order("created_at", { ascending: false })
    .limit(1)
    .returns<ChatCallInviteStatusRow[]>();

  const invite = data?.[0] ?? null;
  if (invite) {
    const inviteStatus = toText(invite.status).toLowerCase();
    const expiresAt = Date.parse(toText(invite.expires_at));
    const expired = Number.isFinite(expiresAt) && expiresAt <= Date.now();
    if (inviteStatus === "ringing" && !expired) return false;
    if (inviteStatus === "accepted" && !expired) {
      const snapshot = await getCommunicationRoomSnapshot(roomId).catch(() => null);
      return !(snapshot?.room && isCommunicationRoomActive(snapshot.room));
    }
    return true;
  }

  const snapshot = await getCommunicationRoomSnapshot(roomId).catch(() => null);
  return !(snapshot?.room && isCommunicationRoomActive(snapshot.room));
}

async function reconcileActiveChatThreadCallState(threads: ChatThreadSummary[]): Promise<ChatThreadSummary[]> {
  return Promise.all(threads.map(async (thread) => {
    if (!thread.activeCommunicationRoomId || !thread.activeCallType) return thread;
    const shouldClear = await shouldClearStaleActiveThreadCall(thread).catch(() => false);
    if (!shouldClear) return thread;
    await clearEndedChatThreadCall(thread.threadId).catch(() => null);
    return {
      ...thread,
      activeCommunicationRoomId: undefined,
      activeCallType: undefined,
    };
  }));
}

function escapeIlikeValue(value: string) {
  return value.replace(/[%(),]/g, "").trim();
}

function parseChatUserSearchResult(row: ChatUserProfileRow): ChatUserSearchResult | null {
  const userId = toText(row.user_id);
  if (!userId) return null;

  return {
    userId,
    username: toText(row.username) || undefined,
    displayName: toText(row.display_name) || toText(row.username) || "User",
    avatarUrl: toText(row.avatar_url) || undefined,
    tagline: toText(row.tagline) || undefined,
  };
}

export async function listChatThreads(): Promise<ChatThreadSummary[]> {
  const currentUserId = await getRequiredChatUserId();
  const { data, error } = await supabase
    .from(CHAT_THREADS_TABLE)
    .select(CHAT_THREAD_SELECT)
    .order("last_message_at", { ascending: false, nullsFirst: false })
    .order("updated_at", { ascending: false })
    .returns<ChatThreadRow[]>();

  if (error || !data) return [];

  const threads = data
    .map((row) => parseChatThread(row, currentUserId))
    .filter(isDefined)
    .filter((thread) => !isHiddenFromCurrentInbox(thread));
  return reconcileActiveChatThreadCallState(await enrichChatThreadsWithUsernames(threads));
}

export async function getChatThread(threadId: string): Promise<ChatThreadSummary | null> {
  const currentUserId = await getRequiredChatUserId();
  const normalizedThreadId = toText(threadId);
  if (!normalizedThreadId) return null;

  const { data, error } = await supabase
    .from(CHAT_THREADS_TABLE)
    .select(CHAT_THREAD_SELECT)
    .eq("id", normalizedThreadId)
    .returns<ChatThreadRow>()
    .maybeSingle();

  if (error || !data) return null;
  const thread = parseChatThread(data, currentUserId);
  if (!thread) return null;
  const enriched = (await enrichChatThreadsWithUsernames([thread]))[0] ?? thread;
  return (await reconcileActiveChatThreadCallState([enriched]))[0] ?? enriched;
}

export async function getChatThreadByActiveCommunicationRoomId(roomId: string): Promise<ChatThreadSummary | null> {
  const currentUserId = await getRequiredChatUserId();
  const normalizedRoomId = formatCommunicationRoomCode(roomId);
  if (!normalizedRoomId) return null;

  const { data, error } = await supabase
    .from(CHAT_THREADS_TABLE)
    .select(CHAT_THREAD_SELECT)
    .eq("active_communication_room_id", normalizedRoomId)
    .order("updated_at", { ascending: false })
    .limit(5)
    .returns<ChatThreadRow[]>();

  if (error || !data) return null;
  const thread = data
    .map((row) => parseChatThread(row, currentUserId))
    .filter(isDefined)
    .find((thread) => toText(thread.activeCommunicationRoomId).toUpperCase() === normalizedRoomId) ?? null;
  if (!thread) return null;
  return (await enrichChatThreadsWithUsernames([thread]))[0] ?? thread;
}

export async function hideChatThreadFromInbox(threadId: string): Promise<void> {
  const normalizedThreadId = toText(threadId);
  if (!normalizedThreadId) {
    throw new Error("This Chi'lly Chat thread is unavailable.");
  }

  const rpc = (supabase.rpc as unknown as (
    fn: "hide_chat_thread_from_inbox",
    args: { p_thread_id: string },
  ) => ChatThreadVisibilityRpc)("hide_chat_thread_from_inbox", {
    p_thread_id: normalizedThreadId,
  });

  const { error } = await rpc;
  if (error) {
    logChatThread("thread_hide_failed", {
      threadId: normalizedThreadId,
      message: error.message ?? "unknown_error",
    });
    if (String(error.message ?? "").includes("active_call_in_progress")) {
      throw new Error("Finish or leave the active call before removing this conversation from your inbox.");
    }
    throw new Error("Couldn't remove this conversation right now. Please try again.");
  }
}

export async function unhideChatThreadForMe(threadId: string): Promise<void> {
  const normalizedThreadId = toText(threadId);
  if (!normalizedThreadId) return;

  const rpc = (supabase.rpc as unknown as (
    fn: "unhide_chat_thread_for_me",
    args: { p_thread_id: string },
  ) => ChatThreadVisibilityRpc)("unhide_chat_thread_for_me", {
    p_thread_id: normalizedThreadId,
  });

  const { error } = await rpc;
  if (error) {
    logChatThread("thread_unhide_failed", {
      threadId: normalizedThreadId,
      message: error.message ?? "unknown_error",
    });
  }
}

export async function listChatMessages(threadId: string): Promise<ChatMessage[]> {
  const normalizedThreadId = toText(threadId);
  if (!normalizedThreadId) return [];

  const thread = await getChatThread(normalizedThreadId);
  if (!thread?.currentMember) return [];

  const { data, error } = await supabase
    .from(CHAT_MESSAGES_TABLE)
    .select(CHAT_MESSAGE_SELECT)
    .eq("thread_id", normalizedThreadId)
    .order("created_at", { ascending: true })
    .returns<ChatMessageRow[]>();

  if (error || !data) return [];
  const attachmentsByMessageId = await readSocialAttachmentsForSurfaces(
    "chat_message",
    data.map((row) => toText(row.id)).filter(Boolean),
  );
  return data
    .map((row) => parseChatMessage(row, attachmentsByMessageId.get(toText(row.id)) ?? []))
    .filter(isDefined);
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

  logChatThread("direct_thread_start", {
    currentUserId,
    targetUserId,
    targetDisplayName: toText(target.displayName) || "",
    pairKey: buildDirectParticipantPairKey(currentUserId, targetUserId),
  });
  return openOrRepairDirectThreadWithRpc(target);
}

export async function searchChatPeople(rawQuery: string, limit = 12): Promise<ChatUserSearchResult[]> {
  const currentUserId = await getRequiredChatUserId();
  const normalized = normalizePeopleSearchQuery(rawQuery);
  const query = escapeIlikeValue(normalized.cleaned);
  const candidates = normalized.candidates.map(escapeIlikeValue).filter(Boolean);
  logChatSearch("search_start", {
    currentUserId,
    rawQuery,
    query,
    limit,
  });
  if (!normalized.searchable || !candidates.length) {
    logChatSearch("search_skipped_short_query", {
      currentUserId,
      query,
    });
    return [];
  }

  const { data, error } = await supabase
    .from(CHAT_USER_PROFILES_TABLE)
    .select(CHAT_USER_SEARCH_SELECT)
    .or(candidates.flatMap((candidate) => [
      `display_name.ilike.%${candidate}%`,
      `username.ilike.%${candidate}%`,
      `tagline.ilike.%${candidate}%`,
    ]).join(","))
    .order("updated_at", { ascending: false })
    .limit(limit)
    .returns<ChatUserProfileRow[]>();

  if (error || !data) {
    logChatSearch("search_failed", {
      currentUserId,
      query,
      message: error?.message ?? "no_data",
    });
    return [];
  }

  const results = data
    .map(parseChatUserSearchResult)
    .filter((entry): entry is ChatUserSearchResult => !!entry && entry.userId !== currentUserId);
  logChatSearch("search_success", {
    currentUserId,
    query,
    resultCount: results.length,
    results: results.slice(0, 5).map((entry) => ({
      userId: entry.userId,
      username: entry.username ?? "",
      displayName: entry.displayName ?? "",
    })),
  });
  return results;
}

export async function sendChatMessage(
  threadId: string,
  body: string,
  attachmentFile?: SocialAttachmentFile | null,
): Promise<ChatMessage> {
  const currentUserId = await getRequiredChatUserId();
  const normalizedThreadId = toText(threadId);
  const trimmedBody = toText(body);
  const hasAttachment = !!attachmentFile;
  const bodyForInsert = trimmedBody || (attachmentFile ? toText(attachmentFile.name) || "Attachment" : "");
  if (!normalizedThreadId || !bodyForInsert) {
    throw new Error("Message text is required.");
  }
  const thread = await getChatThread(normalizedThreadId);
  if (!thread?.currentMember) {
    throw new Error("This Chi'lly Chat thread is unavailable.");
  }

  logChatInvite("send_message_start", {
    currentUserId,
    threadId: normalizedThreadId,
    bodyPreview: bodyForInsert.slice(0, 80),
    hasAttachment,
  });

  const { data, error } = await supabase
    .from(CHAT_MESSAGES_TABLE)
    .insert({
      thread_id: normalizedThreadId,
      sender_user_id: currentUserId,
      body: bodyForInsert,
      message_type: "text",
    } satisfies ChatMessageInsert)
    .select(CHAT_MESSAGE_SELECT)
    .returns<ChatMessageRow>()
    .single();

  if (error || !data) {
    logChatInvite("send_message_failed", {
      currentUserId,
      threadId: normalizedThreadId,
      message: error?.message ?? "no_data",
    });
    throw error ?? new Error("Failed to send Chi'lly Chat message.");
  }

  const message = parseChatMessage(data);
  if (!message) {
    logChatInvite("send_message_parse_failed", {
      currentUserId,
      threadId: normalizedThreadId,
    });
    throw new Error("Failed to parse Chi'lly Chat message.");
  }

  if (attachmentFile) {
    try {
      const attachment = await createSocialAttachmentForSurface({
        surfaceType: "chat_message",
        surfaceId: message.id,
        file: attachmentFile,
      });
      message.attachments = [attachment];
    } catch (attachmentError) {
      try {
        await supabase
          .from(CHAT_MESSAGES_TABLE)
          .delete()
          .eq("id", message.id)
          .eq("sender_user_id", currentUserId);
      } catch {
        // The visible error should stay about the attachment failure.
      }
      throw attachmentError;
    }
  }

  logChatInvite("send_message_success", {
    currentUserId,
    threadId: normalizedThreadId,
    messageId: message.id,
    hasAttachment,
  });
  return message;
}

export async function sendDirectInviteMessage(target: ChatTargetIdentity, body: string): Promise<{
  thread: ChatThreadSummary;
  message: ChatMessage;
}> {
  logChatInvite("send_direct_invite_start", {
    targetUserId: toText(target.userId),
    targetDisplayName: toText(target.displayName) || "",
    bodyPreview: toText(body).slice(0, 80),
  });
  const thread = await getOrCreateDirectThread(target);
  const message = await sendChatMessage(thread.threadId, body);
  logChatInvite("send_direct_invite_success", {
    targetUserId: toText(target.userId),
    threadId: thread.threadId,
    messageId: message.id,
  });
  return { thread, message };
}

export async function markChatThreadRead(threadId: string): Promise<void> {
  const currentUserId = await getRequiredChatUserId();
  const normalizedThreadId = toText(threadId);
  if (!normalizedThreadId) return;

  const markReadUpdate: ChatThreadMemberUpdate = {
    unread_count: 0,
    last_read_at: new Date().toISOString(),
  };

  await supabase
    .from(CHAT_THREAD_MEMBERS_TABLE)
    .update(markReadUpdate)
    .eq("thread_id", normalizedThreadId)
    .eq("user_id", currentUserId);
}

export async function clearEndedChatThreadCall(threadId: string, expectedRoomId?: string | null): Promise<void> {
  const normalizedThreadId = toText(threadId);
  if (!normalizedThreadId) return;
  const normalizedRoomId = formatCommunicationRoomCode(expectedRoomId);
  const rpc = supabase.rpc as unknown as (
    fn: "clear_stale_chilly_chat_thread_call",
    args: { p_thread_id: string; p_expected_room_id: string | null },
  ) => PromiseLike<{ data: unknown; error: { message?: string } | null }>;
  await rpc("clear_stale_chilly_chat_thread_call", {
    p_thread_id: normalizedThreadId,
    p_expected_room_id: normalizedRoomId || null,
  });
}

export async function startChatThreadCall(threadId: string, mode: ChatCallType): Promise<{
  delivery: ChillyChatCallInviteDelivery | null;
  invite: ChillyChatCallInvite | null;
  role: "caller" | "callee";
  thread: ChatThreadSummary;
  roomId: string;
  callType: ChatCallType;
}> {
  const currentUserId = await getRequiredChatUserId();
  logChatCall("thread_call_start", {
    currentUserId,
    threadId: toText(threadId),
    mode,
  });
  const thread = await getChatThread(threadId);
  if (!thread) {
    logChatCall("thread_call_missing_thread", {
      currentUserId,
      threadId: toText(threadId),
      mode,
    });
    throw new Error("Unable to load Chi'lly Chat thread.");
  }

  const existingRoomId = toText(thread.activeCommunicationRoomId);
  if (existingRoomId) {
    const snapshot = await getCommunicationRoomSnapshot(existingRoomId);
    if (snapshot?.room && isCommunicationRoomActive(snapshot.room)) {
      logChatCall("thread_call_reuse_active_room", {
        currentUserId,
        threadId: thread.threadId,
        roomId: existingRoomId,
        mode: thread.activeCallType ?? mode,
      });
      const existingInvite = await readLatestChillyChatCallInviteForRoom(existingRoomId).catch(() => null);
      return {
        delivery: null,
        invite: existingInvite,
        role: existingInvite?.calleeUserId === currentUserId ? "callee" : "caller",
        thread,
        roomId: existingRoomId,
        callType: thread.activeCallType ?? mode,
      };
    }

    logChatCall("thread_call_clear_stale_room", {
      currentUserId,
      threadId: thread.threadId,
      roomId: existingRoomId,
      snapshotStatus: snapshot?.room.status ?? "missing",
      stale: snapshot?.room ? !isCommunicationRoomActive(snapshot.room) : true,
    });
    await clearEndedChatThreadCall(thread.threadId, existingRoomId);
  }

  const created = await createCommunicationRoom({
    hostUserId: currentUserId,
    // Direct-thread calls retain their existing member-only thread authority;
    // creator Premium defaults must never become a separate Chat Call gate.
    contentAccessRule: "open",
  });

  if ("error" in created) {
    logChatCall("thread_call_room_create_failed", {
      currentUserId,
      threadId: thread.threadId,
      mode,
      message: created.error.message,
    });
    throw new Error(created.error.message);
  }

  const roomId = toText(created.roomId);
  if (!toText(thread.otherMember?.userId)) {
    await endCommunicationRoom(roomId, currentUserId).catch(() => null);
    logChatCall("thread_call_missing_callee", {
      currentUserId,
      threadId: thread.threadId,
      roomId,
      mode,
    });
    throw new Error("Unable to start Chi'lly Chat call. The receiver is unavailable.");
  }

  let delivery: ChillyChatCallInviteDelivery | null = null;
  let begunCall: BegunChillyChatCall;
  try {
    begunCall = await beginChillyChatCall({
      callType: mode,
      communicationRoomId: roomId,
      threadId: thread.threadId,
    });
  } catch (inviteError) {
    await endCommunicationRoom(roomId, currentUserId).catch(() => null);
    logChatCall("thread_call_invite_failed", {
      currentUserId,
      threadId: thread.threadId,
      roomId,
      mode,
      message: inviteError instanceof Error ? inviteError.message : "invite_failed",
    });
    throw new Error("Unable to start Chi'lly Chat call. The receiver invite could not be saved.");
  }

  if (begunCall.created) {
    delivery = await dispatchChillyChatCallPush({
      action: "incoming",
      inviteId: begunCall.invite.id,
    });
    logChatCall("thread_call_invite_delivery", {
      currentUserId,
      threadId: thread.threadId,
      roomId: begunCall.invite.communicationRoomId ?? roomId,
      mode,
      notificationCreated: delivery.notificationCreated,
      pushSent: delivery.pushSent,
      reason: delivery.reason,
      status: delivery.status,
    });
  } else if (begunCall.invite.status === "busy") {
    await endCommunicationRoom(roomId, currentUserId).catch(() => null);
    logChatCall("thread_call_receiver_busy", {
      currentUserId,
      threadId: thread.threadId,
      roomId: begunCall.invite.communicationRoomId ?? roomId,
      mode: begunCall.invite.callType,
    });
  } else {
    await endCommunicationRoom(roomId, currentUserId).catch(() => null);
    logChatCall("thread_call_collision_reused", {
      currentUserId,
      threadId: thread.threadId,
      roomId: begunCall.invite.communicationRoomId ?? "",
      mode: begunCall.invite.callType,
      role: begunCall.role,
    });
  }

  const updated = await getChatThread(thread.threadId);
  if (!updated) {
    logChatCall("thread_call_refresh_failed", {
      currentUserId,
      threadId: thread.threadId,
      roomId,
      mode,
    });
    throw new Error("Unable to refresh Chi'lly Chat call state.");
  }

  logChatCall("thread_call_start_success", {
    currentUserId,
    threadId: updated.threadId,
    roomId,
    mode,
  });

  return {
    delivery,
    invite: begunCall.invite,
    role: begunCall.role,
    thread: updated,
    roomId: begunCall.invite.communicationRoomId ?? roomId,
    callType: begunCall.invite.callType,
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
      () => {
        logChatThread("thread_subscription_event", {
          threadId: normalizedThreadId,
          table: CHAT_MESSAGES_TABLE,
        });
        onChange();
      },
    )
    .on(
      "postgres_changes",
      {
        event: "*",
        schema: "public",
        table: CHAT_CALL_INVITES_TABLE,
        filter: `thread_id=eq.${normalizedThreadId}`,
      },
      () => {
        logChatThread("thread_subscription_event", {
          threadId: normalizedThreadId,
          table: CHAT_CALL_INVITES_TABLE,
        });
        onChange();
      },
    )
    .on(
      "postgres_changes",
      {
        event: "*",
        schema: "public",
        table: CHAT_CALL_EVENTS_TABLE,
        filter: `thread_id=eq.${normalizedThreadId}`,
      },
      () => {
        logChatThread("thread_subscription_event", {
          threadId: normalizedThreadId,
          table: CHAT_CALL_EVENTS_TABLE,
        });
        onChange();
      },
    )
    .on(
      "postgres_changes",
      {
        event: "*",
        schema: "public",
        table: CHAT_THREAD_MEMBERS_TABLE,
        filter: `thread_id=eq.${normalizedThreadId}`,
      },
      () => {
        logChatThread("thread_subscription_event", {
          threadId: normalizedThreadId,
          table: CHAT_THREAD_MEMBERS_TABLE,
        });
        onChange();
      },
    )
    .on(
      "postgres_changes",
      {
        event: "*",
        schema: "public",
        table: CHAT_THREADS_TABLE,
        filter: `id=eq.${normalizedThreadId}`,
      },
      () => {
        logChatThread("thread_subscription_event", {
          threadId: normalizedThreadId,
          table: CHAT_THREADS_TABLE,
        });
        onChange();
      },
    )
    .subscribe((status) => {
      logChatThread("thread_subscription_status", {
        threadId: normalizedThreadId,
        status,
      });
    });

  return () => {
    supabase.removeChannel(channel);
  };
}
