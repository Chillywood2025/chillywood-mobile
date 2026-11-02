import { createClient } from "@supabase/supabase-js";
import type { Database, Tables, TablesInsert } from "../supabase/database.types";

import {
  prepareChatCallRoomCandidate,
  formatCommunicationRoomCode,
  getCommunicationRoom,
  getCommunicationRoomSnapshot,
  isCommunicationRoomActive,
} from "./communication";
import {
  CHAT_CALL_EVENTS_TABLE,
  CHAT_CALL_INVITES_TABLE,
  beginChillyChatCall,
  dispatchChillyChatCallPush,
  readChillyChatCallInvite,
  readLatestChillyChatCallInviteForRoom,
  type BegunChillyChatCall,
  type ChillyChatCallInvite,
  type ChillyChatCallInviteDelivery,
} from "./chillyChatCalls";
import {
  createSocialAttachmentForSurface,
  isSocialAttachmentOutcomeAmbiguous,
  readSocialAttachmentsForSurfaces,
  type SocialAttachment,
  type SocialAttachmentFile,
} from "./socialAttachments";
import { supabase, SUPABASE_URL, SUPABASE_ANON_KEY } from "./supabase";
import { normalizePeopleSearchQuery } from "./peopleSearchNormalization";
import { getWritablePartyUserId } from "./watchParty";
import {
  getCurrentAccountSessionAuthoritySnapshot,
  sameAccountSessionAuthority,
  type AccountSessionAuthorityBinding,
} from "./accountSessionAuthority";
import {
  captureAccountBoundSupabaseMutationSubject,
  assertAccountBoundSupabaseMutationSubjectCurrent,
  invokeAccountBoundSupabaseMutationRpc,
  type AccountBoundSupabaseMutationSubject,
} from "./accountBoundSupabaseMutation";
import {
  resolveChatThreadCallReconciliation,
  shouldApplyAuthoritativeChatCallCleanup,
} from "./communicationCallMediaPolicy.mjs";
import { reportRuntimeError } from "./logger";
import { UserFacingError } from "./userFacingErrors";
import { compareChatActivityTimestamps } from "./chatActivity";
import {
  getNotificationActivityOwnerKey,
  subscribeToNotificationActivity,
  subscribeToNotificationActivityChanges,
} from "./notificationActivity";

export const CHAT_THREADS_TABLE = "chat_threads";
export const CHAT_THREAD_MEMBERS_TABLE = "chat_thread_members";
export const CHAT_MESSAGES_TABLE = "chat_messages";
export const CHAT_USER_PROFILES_TABLE = "user_profiles";
const CHAT_COLLECTION_PAGE_SIZE = 200;
const CHAT_PROFILE_LOOKUP_BATCH_SIZE = 100;

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
  lastCallReadAt?: string;
  hiddenAt?: string;
  unreadCount: number;
  unreadCallCount?: number;
};

export type ChatThreadSummary = {
  threadId: string;
  participantPairKey: string;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
  lastMessageAt?: string;
  displayLastActivityAt?: string | null;
  lastActivityPreview?: string;
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
  displayCreatedAt?: string | null;
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
> & { unread_call_count?: number; last_call_read_at?: string | null };

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
  last_activity_at?: string | null;
  last_activity_preview?: string | null;
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

type ChatMessageInsert = TablesInsert<"chat_messages">;
type ChatCallInviteStatusRow = Pick<
  Tables<"chat_call_invites">,
  "id" | "thread_id" | "communication_room_id" | "status" | "created_at" | "expires_at"
>;

const CHAT_THREAD_SELECT =
  "id,participant_pair_key,created_by,created_at,updated_at,last_message_at,last_message_preview,last_activity_at,last_activity_preview,active_communication_room_id,active_call_type,members";
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

type ChatMutationAuthority = {
  accessToken: string;
  binding: AccountSessionAuthorityBinding;
};

const CHAT_ACCOUNT_CHANGED_MESSAGE = "Your account changed before Chi'lly Chat finished. Please try again.";

const assertChatMutationAuthorityCurrent = (authority: ChatMutationAuthority) => {
  if (!sameAccountSessionAuthority(
    authority.binding,
    getCurrentAccountSessionAuthoritySnapshot(),
  )) {
    throw new UserFacingError("chat_action", CHAT_ACCOUNT_CHANGED_MESSAGE);
  }
};

function captureChatReadBinding(): AccountSessionAuthorityBinding {
  const binding = getCurrentAccountSessionAuthoritySnapshot();
  if (
    !binding
    || binding.state !== "ACTIVE"
    || binding.restoreOnly
    || binding.accountId !== binding.userId
  ) throw new UserFacingError("chat_action", CHAT_ACCOUNT_CHANGED_MESSAGE);
  return binding;
}

const assertChatReadBindingCurrent = (binding: AccountSessionAuthorityBinding) => {
  if (!sameAccountSessionAuthority(binding, getCurrentAccountSessionAuthoritySnapshot())) {
    throw new UserFacingError("chat_action", CHAT_ACCOUNT_CHANGED_MESSAGE);
  }
};

const assertChatReadCurrent = (binding?: AccountSessionAuthorityBinding, signal?: AbortSignal) => {
  if (signal?.aborted) {
    const error = new Error("Chi'lly Chat read retired.");
    error.name = "AbortError";
    throw error;
  }
  if (binding) assertChatReadBindingCurrent(binding);
};

const invokeBoundChatRpc = async <T>(
  authority: ChatMutationAuthority,
  functionName: string,
  args: Record<string, unknown>,
  options: { retainTransportSettlement?: boolean } = {},
) => invokeAccountBoundSupabaseMutationRpc<T>(
  { accessToken: authority.accessToken, authority: authority.binding },
  functionName,
  args,
  options,
);

async function captureChatMutationAuthority(expectedUserId?: string, signal?: AbortSignal): Promise<ChatMutationAuthority> {
  try {
    const subject = await captureAccountBoundSupabaseMutationSubject(expectedUserId, { waitForReadSettlement: !!signal, signal });
    return { accessToken: subject.accessToken, binding: subject.authority };
  } catch {
    throw new UserFacingError("chat_action", CHAT_ACCOUNT_CHANGED_MESSAGE);
  }
}

async function openOrRepairDirectThreadWithRpc(
  target: ChatTargetIdentity,
  authority: ChatMutationAuthority,
): Promise<ChatThreadSummary> {
  const targetUserId = toText(target.userId);
  assertChatMutationAuthorityCurrent(authority);
  const { data, error } = await invokeBoundChatRpc<{ thread_id?: unknown }[]>(
    authority,
    "get_or_create_direct_chat_thread",
    {
    p_target_user_id: targetUserId,
    p_target_display_name: toText(target.displayName) || null,
    p_target_avatar_url: toText(target.avatarUrl) || null,
    p_target_tagline: toText(target.tagline) || null,
    },
  );
  assertChatMutationAuthorityCurrent(authority);
  if (error) {
    logChatThread("direct_thread_rpc_repair_failed", {
      targetUserId,
      message: error.message ?? "unknown_error",
    });
    throw new UserFacingError("chat_action", "Unable to open Chi'lly Chat with this person right now.");
  }

  const threadId = toText(data?.[0]?.thread_id);
  if (!threadId) {
    logChatThread("direct_thread_rpc_repair_missing_thread", { targetUserId });
    throw new UserFacingError("chat_action", "Unable to open Chi'lly Chat with this person right now.");
  }

  const thread = await getChatThread(threadId);
  assertChatMutationAuthorityCurrent(authority);
  if (!thread?.currentMember || !thread.otherMember) {
    logChatThread("direct_thread_rpc_repair_readback_failed", {
      targetUserId,
      threadId,
    });
    throw new UserFacingError("chat_action", "Unable to open Chi'lly Chat with this person right now.");
  }

  assertChatMutationAuthorityCurrent(authority);
  await unhideChatThreadWithAuthority(thread.threadId, authority);
  assertChatMutationAuthorityCurrent(authority);
  const visibleThread = await getChatThread(thread.threadId);
  assertChatMutationAuthorityCurrent(authority);

  logChatThread("direct_thread_rpc_repair_success", {
    targetUserId,
    threadId: thread.threadId,
  });
  return visibleThread ?? thread;
}

async function getRequiredChatUserId() {
  const mountedAuthority = getCurrentAccountSessionAuthoritySnapshot();
  const mountedUserId = toText(mountedAuthority?.userId);
  if (
    mountedAuthority?.state === "ACTIVE"
    && mountedAuthority.restoreOnly === false
    && mountedAuthority.accountId === mountedUserId
    && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu.test(mountedUserId)
  ) return mountedUserId;
  const userId = toText(await getWritablePartyUserId());
  if (!userId) {
    throw new UserFacingError("chat_action", "Chi'lly Chat requires a signed-in user.");
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
    lastCallReadAt: toText(row.last_call_read_at) || undefined,
    hiddenAt: toText(row.hidden_at) || undefined,
    unreadCount: Math.max(0, Number(row.unread_count ?? 0) || 0) + Math.max(0, Number(row.unread_call_count ?? 0) || 0),
    unreadCallCount: Math.max(0, Number(row.unread_call_count ?? 0) || 0),
  };
}

function isHiddenFromCurrentInbox(thread: ChatThreadSummary) {
  const hiddenAt = toText(thread.currentMember?.hiddenAt);
  if (!hiddenAt) return false;
  const hiddenTime = Date.parse(hiddenAt);
  if (!Number.isFinite(hiddenTime)) return false;

  const lastMessageAt = toText(thread.displayLastActivityAt);
  if (!lastMessageAt) return true;
  return !Number.isFinite(Date.parse(lastMessageAt)) || compareChatActivityTimestamps(lastMessageAt, hiddenAt) <= 0;
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
    createdAt: toText(row.created_at),
    updatedAt: toText(row.updated_at),
    lastMessageAt: toText(row.last_message_at) || undefined,
    displayLastActivityAt: row.last_activity_at === undefined
      ? toText(row.last_message_at) || toText(row.created_at) || null : toText(row.last_activity_at) || null,
    lastActivityPreview: row.last_activity_preview === undefined
      ? toText(row.last_message_preview) || undefined : toText(row.last_activity_preview),
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
    displayCreatedAt: toText(row.created_at) || null,
    attachments: isModerationHidden ? [] : attachments,
    moderationStatus,
    moderationReason: toText(row.moderation_reason) || undefined,
    moderationReportId: Number.isFinite(Number(row.moderation_report_id)) ? Number(row.moderation_report_id) : undefined,
    moderationActionedAt: toText(row.moderation_actioned_at) || undefined,
    isModerationHidden,
  };
}

const sortChatThreadsForInbox = (threads: ChatThreadSummary[]) => [...threads].sort((left, right) => {
  return compareChatActivityTimestamps(right.displayLastActivityAt, left.displayLastActivityAt)
    || left.threadId.localeCompare(right.threadId);
});

const sortChatMessagesForThread = (messages: ChatMessage[]) => [...messages].sort((left, right) => {
  const createdDifference = compareChatActivityTimestamps(left.createdAt, right.createdAt);
  return createdDifference || left.id.localeCompare(right.id);
});

async function enrichChatThreadsWithUsernames(threads: ChatThreadSummary[], binding?: AccountSessionAuthorityBinding, signal?: AbortSignal) {
  assertChatReadCurrent(binding, signal);
  const userIds = Array.from(new Set(threads.flatMap((thread) => thread.members.map((member) => member.userId)).filter(Boolean)));
  if (!userIds.length) return threads;

  const profiles: ChatUserProfileRow[] = [];
  for (let offset = 0; offset < userIds.length; offset += CHAT_PROFILE_LOOKUP_BATCH_SIZE) {
    assertChatReadCurrent(binding, signal);
    let query = supabase
      .from(CHAT_USER_PROFILES_TABLE)
      .select(CHAT_USER_SEARCH_SELECT)
      .in("user_id", userIds.slice(offset, offset + CHAT_PROFILE_LOOKUP_BATCH_SIZE));
    if (signal) query = query.abortSignal(signal);
    const { data, error } = await query.returns<ChatUserProfileRow[]>();
    assertChatReadCurrent(binding, signal);
    if (error || !data) return threads;
    for (const profile of data) profiles[profiles.length] = profile;
  }

  const profileByUserId = new Map(profiles.map((row) => [toText(row.user_id), row]));
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

async function readActiveThreadRoomState(roomId: string, binding?: AccountSessionAuthorityBinding, signal?: AbortSignal): Promise<"active" | "inactive"> {
  // Signal-owned inbox reconciliation consumes only canonical room state,
  // avoiding the snapshot's unrelated parallel membership read. Legacy
  // call-control callers retain their existing snapshot/error semantics.
  const room = signal
    ? await getCommunicationRoom(roomId, { signal })
    : (await getCommunicationRoomSnapshot(roomId))?.room;
  assertChatReadCurrent(binding, signal);
  return room && isCommunicationRoomActive(room) ? "active" : "inactive";
}

async function shouldRequestStaleActiveThreadCallCleanup(thread: ChatThreadSummary, binding?: AccountSessionAuthorityBinding, signal?: AbortSignal): Promise<boolean> {
  assertChatReadCurrent(binding, signal);
  const threadId = toText(thread.threadId);
  const roomId = toText(thread.activeCommunicationRoomId);
  if (!threadId || !roomId || !thread.activeCallType) return false;

  let query = supabase
    .from(CHAT_CALL_INVITES_TABLE)
    .select("id,thread_id,communication_room_id,status,created_at,expires_at")
    .eq("thread_id", threadId)
    .eq("communication_room_id", roomId)
    .order("created_at", { ascending: false })
    .limit(1);
  if (signal) query = query.abortSignal(signal);
  const { data, error } = await query.returns<ChatCallInviteStatusRow[]>();
  assertChatReadCurrent(binding, signal);
  if (error) throw new Error(error.message || "Unable to read the active Chi'lly Chat call invite.");

  const invite = data?.[0] ?? null;
  const inviteStatus = toText(invite?.status).toLowerCase();
  const roomState = inviteStatus === "accepted" || !invite
    ? await readActiveThreadRoomState(roomId, binding, signal) : "unavailable";
  return resolveChatThreadCallReconciliation({
    inviteExpiresAt: invite?.expires_at,
    inviteStatus,
    nowMs: Date.now(),
    roomState,
  }) === "authoritative_cleanup";
}

async function reconcileActiveChatThreadCallState(
  threads: ChatThreadSummary[],
  expectedBinding?: AccountSessionAuthorityBinding,
  signal?: AbortSignal,
): Promise<ChatThreadSummary[]> {
  // Wait for every underlying read/write, including transports that ignore
  // abort, before releasing the caller's single-flight ownership.
  const outcomes = await Promise.allSettled(threads.map(async (thread) => {
    assertChatReadCurrent(expectedBinding, signal);
    if (!thread.activeCommunicationRoomId || !thread.activeCallType) return thread;
    try {
      if (!await shouldRequestStaleActiveThreadCallCleanup(thread, expectedBinding, signal)) return thread;
    } catch (error) {
      assertChatReadCurrent(expectedBinding, signal);
      reportRuntimeError("chilly-chat-call-reconciliation-read", error, {
        roomId: thread.activeCommunicationRoomId,
        threadId: thread.threadId,
      });
      return thread;
    }
    assertChatReadCurrent(expectedBinding, signal);
    try {
      const cleanup = await clearEndedChatThreadCall(
        thread.threadId,
        thread.activeCommunicationRoomId,
        expectedBinding,
        signal,
      );
      if (!shouldApplyAuthoritativeChatCallCleanup(cleanup)) return thread;
      return {
        ...thread,
        activeCommunicationRoomId: undefined,
        activeCallType: undefined,
      };
    } catch (error) {
      assertChatReadCurrent(expectedBinding, signal);
      reportRuntimeError("chilly-chat-call-reconciliation-cleanup", error, {
        roomId: thread.activeCommunicationRoomId,
        threadId: thread.threadId,
      });
      return thread;
    }
  }));
  const failure = outcomes.find(result => result.status === "rejected");
  if (failure?.status === "rejected") throw failure.reason;
  return outcomes.map(result => (result as PromiseFulfilledResult<ChatThreadSummary>).value);
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

export async function listChatThreads(options: { signal?: AbortSignal } = {}): Promise<ChatThreadSummary[]> {
  const { signal } = options;
  const binding = captureChatReadBinding();
  assertChatReadCurrent(binding, signal);
  const currentUserId = await getRequiredChatUserId();
  assertChatReadCurrent(binding, signal);
  if (currentUserId !== binding.userId) throw new UserFacingError("chat_action", CHAT_ACCOUNT_CHANGED_MESSAGE);
  const rowsById = new Map<string, ChatThreadRow>();
  let threadIdCursor = "";
  for (;;) {
    assertChatReadCurrent(binding, signal);
    let query = supabase
      .from("chat_thread_activity")
      .select(CHAT_THREAD_SELECT)
      .order("id", { ascending: true })
      .limit(CHAT_COLLECTION_PAGE_SIZE);
    if (threadIdCursor) query = query.gt("id", threadIdCursor);
    if (signal) query = query.abortSignal(signal);
    const { data, error } = await query.returns<ChatThreadRow[]>();
    assertChatReadCurrent(binding, signal);
    if (error || !data) throw new UserFacingError("chat_action", "Unable to load Chi'lly Chat right now.");
    for (const row of data) {
      const threadId = toText(row.id);
      if (threadId) rowsById.set(threadId, row);
    }
    if (data.length < CHAT_COLLECTION_PAGE_SIZE) break;
    const nextCursor = toText(data[data.length - 1]?.id);
    if (!nextCursor || nextCursor <= threadIdCursor) throw new Error("Chi'lly Chat pagination did not advance.");
    threadIdCursor = nextCursor;
  }

  const threads = sortChatThreadsForInbox(Array.from(rowsById.values())
    .map((row) => parseChatThread(row, currentUserId))
    .filter(isDefined)
    .filter((thread) => !isHiddenFromCurrentInbox(thread)));
  const enriched = await enrichChatThreadsWithUsernames(threads, binding, signal);
  assertChatReadCurrent(binding, signal);
  const reconciled = await reconcileActiveChatThreadCallState(enriched, binding, signal);
  assertChatReadCurrent(binding, signal);
  return reconciled;
}

export async function getChatThread(
  threadId: string,
  options: { reconcileCallState?: boolean } = {},
): Promise<ChatThreadSummary | null> {
  const binding = captureChatReadBinding();
  const currentUserId = await getRequiredChatUserId();
  assertChatReadBindingCurrent(binding);
  if (currentUserId !== binding.userId) throw new UserFacingError("chat_action", CHAT_ACCOUNT_CHANGED_MESSAGE);
  const normalizedThreadId = toText(threadId);
  if (!normalizedThreadId) return null;

  const { data, error } = await supabase
    .from("chat_thread_activity")
    .select(CHAT_THREAD_SELECT)
    .eq("id", normalizedThreadId)
    .returns<ChatThreadRow>()
    .maybeSingle();

  if (error || !data) return null;
  assertChatReadBindingCurrent(binding);
  const thread = parseChatThread(data, currentUserId);
  if (!thread) return null;
  const enriched = (await enrichChatThreadsWithUsernames([thread]))[0] ?? thread;
  assertChatReadBindingCurrent(binding);
  // Start recovery must only observe. In particular, an old receipt cannot
  // authorize cleanup of a call that may already have been answered/replaced.
  if (options.reconcileCallState === false) return enriched;
  const reconciled = await reconcileActiveChatThreadCallState([enriched], binding);
  assertChatReadBindingCurrent(binding);
  return reconciled[0] ?? enriched;
}

export async function getChatThreadByActiveCommunicationRoomId(roomId: string): Promise<ChatThreadSummary | null> {
  const currentUserId = await getRequiredChatUserId();
  const normalizedRoomId = formatCommunicationRoomCode(roomId);
  if (!normalizedRoomId) return null;

  const { data, error } = await supabase
    .from("chat_thread_activity")
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
  const authority = await captureChatMutationAuthority();
  const normalizedThreadId = toText(threadId);
  if (!normalizedThreadId) {
    throw new UserFacingError("chat_action", "This Chi'lly Chat thread is unavailable.");
  }

  assertChatMutationAuthorityCurrent(authority);
  const { error } = await invokeBoundChatRpc<Record<string, unknown>>(
    authority,
    "hide_chat_thread_from_inbox",
    { p_thread_id: normalizedThreadId },
  );
  assertChatMutationAuthorityCurrent(authority);
  if (error) {
    logChatThread("thread_hide_failed", {
      threadId: normalizedThreadId,
      message: error.message ?? "unknown_error",
    });
    if (String(error.message ?? "").includes("active_call_in_progress")) {
      throw new UserFacingError("chat_action", "Finish or leave the active call before removing this conversation from your inbox.");
    }
    throw new UserFacingError("chat_action", "Couldn't remove this conversation right now. Please try again.");
  }
}

async function unhideChatThreadWithAuthority(
  threadId: string,
  authority: ChatMutationAuthority,
): Promise<void> {
  const normalizedThreadId = toText(threadId);
  if (!normalizedThreadId) return;

  assertChatMutationAuthorityCurrent(authority);
  const { error } = await invokeBoundChatRpc<Record<string, unknown>>(
    authority,
    "unhide_chat_thread_for_me",
    { p_thread_id: normalizedThreadId },
  );
  assertChatMutationAuthorityCurrent(authority);
  if (error) {
    logChatThread("thread_unhide_failed", {
      threadId: normalizedThreadId,
      message: error.message ?? "unknown_error",
    });
  }
}

export async function unhideChatThreadForMe(threadId: string): Promise<void> {
  const authority = await captureChatMutationAuthority();
  return unhideChatThreadWithAuthority(threadId, authority);
}

export async function readChatActivityCut(threadId: string): Promise<string> {
  const authority = await captureChatMutationAuthority();
  const { data, error } = await invokeBoundChatRpc(authority, "read_chilly_chat_activity_cut", { p_thread_id: threadId });
  assertChatMutationAuthorityCurrent(authority);
  if (error || typeof data !== "string" || !Number.isFinite(Date.parse(data))) {
    throw new UserFacingError("chat_action", "Unable to load the latest conversation safely.");
  }
  return data;
}

export async function listChatMessages(threadId: string, activityCut?: string): Promise<ChatMessage[]> {
  const binding = captureChatReadBinding();
  const normalizedThreadId = toText(threadId);
  if (!normalizedThreadId) return [];

  const thread = await getChatThread(normalizedThreadId);
  assertChatReadBindingCurrent(binding);
  if (!thread?.currentMember) return [];

  const rowsById = new Map<string, ChatMessageRow>();
  let messageIdCursor = "";
  for (;;) {
    let query = supabase
      .from(CHAT_MESSAGES_TABLE)
      .select(CHAT_MESSAGE_SELECT)
      .eq("thread_id", normalizedThreadId)
      .order("id", { ascending: true })
      .limit(CHAT_COLLECTION_PAGE_SIZE);
    if (messageIdCursor) query = query.gt("id", messageIdCursor);
    if (activityCut) query = query.lte("created_at", activityCut);
    const { data, error } = await query.returns<ChatMessageRow[]>();
    assertChatReadBindingCurrent(binding);
    if (error || !data) return [];
    for (const row of data) {
      const messageId = toText(row.id);
      if (messageId) rowsById.set(messageId, row);
    }
    if (data.length < CHAT_COLLECTION_PAGE_SIZE) break;
    const nextCursor = toText(data[data.length - 1]?.id);
    if (!nextCursor || nextCursor === messageIdCursor) return [];
    messageIdCursor = nextCursor;
  }
  const rows = Array.from(rowsById.values());
  const attachmentsByMessageId = await readSocialAttachmentsForSurfaces(
    "chat_message",
    rows.map((row) => toText(row.id)).filter(Boolean),
  );
  assertChatReadBindingCurrent(binding);
  return sortChatMessagesForThread(rows
    .map((row) => parseChatMessage(row, attachmentsByMessageId.get(toText(row.id)) ?? []))
    .filter(isDefined));
}

export async function getOrCreateDirectThread(target: ChatTargetIdentity): Promise<ChatThreadSummary> {
  const authority = await captureChatMutationAuthority();
  const currentUserId = authority.binding.userId;
  const targetUserId = toText(target.userId);
  if (!targetUserId) {
    throw new UserFacingError("chat_action", "Missing target user for Chi'lly Chat thread.");
  }
  if (targetUserId === currentUserId) {
    throw new UserFacingError("chat_action", "Use the Chi'lly Chat inbox for your own profile.");
  }

  logChatThread("direct_thread_start", {
    currentUserId,
    targetUserId,
    targetDisplayName: toText(target.displayName) || "",
    pairKey: buildDirectParticipantPairKey(currentUserId, targetUserId),
  });
  return openOrRepairDirectThreadWithRpc(target, authority);
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
  options: { mutationSubject?: AccountBoundSupabaseMutationSubject; isCurrent?: () => boolean } = {},
): Promise<ChatMessage> {
  const subject = options.mutationSubject ?? await captureAccountBoundSupabaseMutationSubject();
  const assertCurrent = () => {
    assertAccountBoundSupabaseMutationSubjectCurrent(subject);
    if (options.isCurrent && !options.isCurrent()) {
      throw new UserFacingError("chat_action", "This conversation is no longer open. Please try again.");
    }
  };
  assertCurrent();
  const currentUserId = subject.authority.userId;
  const client = createClient<Database>(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    global: { headers: { Authorization: `Bearer ${subject.accessToken}` } },
  });
  const normalizedThreadId = toText(threadId);
  const trimmedBody = toText(body);
  const hasAttachment = !!attachmentFile;
  const bodyForInsert = trimmedBody || (attachmentFile ? toText(attachmentFile.name) || "Attachment" : "");
  if (!normalizedThreadId || !bodyForInsert) {
    throw new UserFacingError("chat_action", "Message text is required.");
  }
  const thread = await getChatThread(normalizedThreadId, { reconcileCallState: false });
  assertCurrent();
  if (thread?.threadId !== normalizedThreadId || thread.currentMember?.userId !== currentUserId) {
    throw new UserFacingError("chat_action", "This Chi'lly Chat thread is unavailable.");
  }

  logChatInvite("send_message_start", {
    currentUserId,
    threadId: normalizedThreadId,
    bodyPreview: bodyForInsert.slice(0, 80),
    hasAttachment,
  });

  assertCurrent();
  const { data, error } = await client
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

  assertCurrent();
  const message = parseChatMessage(data);
  if (!message || message.threadId !== normalizedThreadId || message.senderUserId !== currentUserId) {
    logChatInvite("send_message_parse_failed", {
      currentUserId,
      threadId: normalizedThreadId,
    });
    throw new Error("Failed to parse Chi'lly Chat message.");
  }

  if (attachmentFile) {
    let attachment: SocialAttachment;
    try {
      assertCurrent();
      attachment = await createSocialAttachmentForSurface({
        surfaceType: "chat_message",
        surfaceId: message.id,
        file: attachmentFile,
        mutationSubject: subject,
        isCurrent: options.isCurrent,
      });
    } catch (attachmentError) {
      if (isSocialAttachmentOutcomeAmbiguous(attachmentError)) {
        throw new UserFacingError("attachment_parent_saved", "Your message was saved, but its attachment could not be confirmed. Refresh before retrying.");
      }
      try {
        const rollback = await client
          .from(CHAT_MESSAGES_TABLE)
          .delete()
          .eq("id", message.id)
          .eq("sender_user_id", currentUserId)
          .eq("thread_id", normalizedThreadId);
        if (rollback.error) throw rollback.error;
      } catch {
        throw new UserFacingError("attachment_parent_saved", "Your message was saved, but its attachment failed. Refresh before retrying.");
      }
      throw attachmentError;
    }
    // Once the child committed, a retired UI must not delete its parent.
    assertCurrent();
    message.attachments = [attachment];
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

export async function markChatThreadRead(threadId: string, readThrough?: string | null, callReadThrough?: string | null): Promise<void> {
  const messageThrough = Number.isFinite(Date.parse(readThrough ?? "")) ? readThrough : null;
  const callThrough = Number.isFinite(Date.parse(callReadThrough ?? "")) ? callReadThrough : null;
  if (!messageThrough && !callThrough) return;
  const authority = await captureChatMutationAuthority();
  const normalizedThreadId = toText(threadId);
  if (!normalizedThreadId) return;
  assertChatMutationAuthorityCurrent(authority);
  const { error } = await invokeBoundChatRpc(authority, "mark_chilly_chat_thread_read", {
    p_thread_id: normalizedThreadId, p_read_through: messageThrough, p_call_read_through: callThrough,
  });
  assertChatMutationAuthorityCurrent(authority);
  if (error) throw new UserFacingError("chat_action", "Unable to save the read status yet.");
}

export type ChatThreadCallCleanupResult = {
  cleared: boolean;
  reason: string;
  roomId?: string;
};

export async function clearEndedChatThreadCall(
  threadId: string,
  expectedRoomId?: string | null,
  expectedBinding?: AccountSessionAuthorityBinding,
  signal?: AbortSignal,
): Promise<ChatThreadCallCleanupResult> {
  assertChatReadCurrent(expectedBinding, signal);
  const authority = await captureChatMutationAuthority(expectedBinding?.userId, signal);
  // Capturing the frozen mutation token is asynchronous. Cancellation or a
  // session replacement during that capture must stop the cleanup dispatch.
  assertChatReadCurrent(expectedBinding, signal);
  if (expectedBinding && !sameAccountSessionAuthority(expectedBinding, authority.binding)) {
    throw new UserFacingError("chat_action", CHAT_ACCOUNT_CHANGED_MESSAGE);
  }
  const normalizedThreadId = toText(threadId);
  if (!normalizedThreadId) return { cleared: false, reason: "missing_thread" };
  const normalizedRoomId = formatCommunicationRoomCode(expectedRoomId);
  assertChatMutationAuthorityCurrent(authority);
  assertChatReadCurrent(expectedBinding, signal);
  // Once dispatched this account-bound write is not cancelled or rolled back
  // by a read deadline. Signal-owned inbox reads retain actual settlement;
  // existing call-control callers keep their prior bounded-wait behavior.
  const { data, error } = await invokeBoundChatRpc<unknown>(
    authority,
    "clear_stale_chilly_chat_thread_call",
    {
      p_thread_id: normalizedThreadId,
      p_expected_room_id: normalizedRoomId || null,
    },
    { retainTransportSettlement: !!signal },
  );
  assertChatMutationAuthorityCurrent(authority);
  if (error) throw new Error(error.message || "Unable to clear the ended Chi'lly Chat call.");
  const result = data && typeof data === "object" && !Array.isArray(data)
    ? data as Record<string, unknown>
    : null;
  const reason = toText(result?.reason);
  if (!result || typeof result.cleared !== "boolean" || !reason) {
    throw new Error("The Chi'lly Chat cleanup response was malformed.");
  }
  return {
    cleared: result.cleared,
    reason,
    roomId: toText(result.roomId) || undefined,
  };
}

export type ChatCallStartReceipt = {
  authority: AccountSessionAuthorityBinding;
  threadId: string;
  requestRoomId: string;
  invite: ChillyChatCallInvite;
  role: "caller" | "callee";
  delivery: ChillyChatCallInviteDelivery;
};

export type ChatThreadCallStartResult = {
  disposition: "ready";
  delivery: ChillyChatCallInviteDelivery | null;
  invite: ChillyChatCallInvite | null;
  role: "caller" | "callee";
  thread: ChatThreadSummary;
  roomId: string;
  callType: ChatCallType;
} | {
  disposition: "readback_pending";
  receipt: ChatCallStartReceipt;
};

export async function readChatCallStartRecovery(receipt: ChatCallStartReceipt) {
  assertChatReadBindingCurrent(receipt.authority);
  const thread = await getChatThread(receipt.threadId, { reconcileCallState: false });
  assertChatReadBindingCurrent(receipt.authority);
  const invite = await readChillyChatCallInvite(receipt.invite.id);
  assertChatReadBindingCurrent(receipt.authority);
  if (!thread || thread.threadId !== receipt.threadId
    || thread.currentMember?.userId !== receipt.authority.userId
    || !invite || invite.id !== receipt.invite.id || invite.threadId !== receipt.threadId
    || invite.communicationRoomId !== receipt.invite.communicationRoomId
    || invite.callType !== receipt.invite.callType
    || invite.callerUserId !== receipt.invite.callerUserId
    || invite.calleeUserId !== receipt.invite.calleeUserId) {
    throw new UserFacingError("chat_action", "The call's current state is still unavailable. Refresh call status to try again.");
  }
  const inviteIsActive = invite.status === "ringing" || invite.status === "accepted";
  // Separate reads can straddle a transition. An active invite without a thread
  // link is unresolved. A terminal invite with a remaining link is not: terminal
  // cleanup deliberately preserves rooms owned by another active invite. Keep
  // that raw link without claiming the remaining room is either active or ended.
  if (!thread.activeCommunicationRoomId && inviteIsActive) {
    throw new UserFacingError("chat_action", "The call is changing state. Refresh call status to try again.");
  }
  return { thread, invite };
}

export async function startChatThreadCall(threadId: string, mode: ChatCallType): Promise<ChatThreadCallStartResult> {
  const authority = captureChatReadBinding();
  const currentUserId = await getRequiredChatUserId();
  assertChatReadBindingCurrent(authority);
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
    throw new UserFacingError("chat_action", "Unable to load Chi'lly Chat thread.");
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
        disposition: "ready",
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

  if (!toText(thread.otherMember?.userId)) {
    logChatCall("thread_call_missing_callee", {
      currentUserId,
      threadId: thread.threadId,
      mode,
    });
    throw new UserFacingError("chat_action", "Unable to start Chi'lly Chat call. The receiver is unavailable.");
  }
  const candidate = await prepareChatCallRoomCandidate();
  assertChatReadBindingCurrent(authority);
  const roomId = toText(candidate.roomId);

  let delivery: ChillyChatCallInviteDelivery | null = null;
  let begunCall: BegunChillyChatCall;
  try {
    begunCall = await beginChillyChatCall({
      actorUserId: currentUserId,
      callType: mode,
      communicationRoomId: roomId,
      threadId: thread.threadId,
      createRoomCapturePolicy: candidate.capturePolicy,
    });
  } catch (inviteError) {
    // A definitive rejection rolls back allocation server-side. A lost or
    // malformed reply may hide a committed call: never End it speculatively.
    logChatCall("thread_call_invite_failed", {
      currentUserId,
      threadId: thread.threadId,
      roomId,
      mode,
      message: inviteError instanceof Error ? inviteError.message : "invite_failed",
    });
    if (inviteError && typeof inviteError === "object" && "message" in inviteError
      && String(inviteError.message).trim().toLowerCase() === "rate_limited") {
      throw new UserFacingError("chat_call_rate_limited", "Too many attempts. Wait a few minutes, then try again.");
    }
    throw new UserFacingError("chat_action", "Unable to confirm whether this Chi'lly Chat call was started. Refresh the thread before trying again.");
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
    logChatCall("thread_call_receiver_busy", {
      currentUserId,
      threadId: thread.threadId,
      roomId: begunCall.invite.communicationRoomId ?? roomId,
      mode: begunCall.invite.callType,
    });
  } else {
    logChatCall("thread_call_collision_reused", {
      currentUserId,
      threadId: thread.threadId,
      roomId: begunCall.invite.communicationRoomId ?? "",
      mode: begunCall.invite.callType,
      role: begunCall.role,
    });
  }

  try {
    const updated = await getChatThread(thread.threadId);
    if (!updated) throw new UserFacingError("chat_action", "Unable to refresh Chi'lly Chat call state.");

    logChatCall("thread_call_start_success", {
      currentUserId,
      threadId: updated.threadId,
      roomId,
      mode,
    });

    return {
      disposition: "ready",
      delivery,
      invite: begunCall.invite,
      role: begunCall.role,
      thread: updated,
      roomId: begunCall.invite.communicationRoomId ?? roomId,
      callType: begunCall.invite.callType,
    };
  } catch (readbackError) {
    logChatCall("thread_call_refresh_failed", {
      currentUserId,
      threadId: thread.threadId,
      roomId,
      mode,
    });
    // This receipt is only created after a positive begin response and a known
    // dispatch outcome. It is domain state, not customer copy or an error object.
    // A rejected/unknown begin response is not a confirmed receipt.
    if (begunCall.created && delivery) {
      return {
        disposition: "readback_pending",
        receipt: {
          authority, threadId: thread.threadId, requestRoomId: roomId,
          invite: begunCall.invite, role: begunCall.role, delivery,
        },
      };
    }
    throw readbackError;
  }
}

let inboxChannelSequence = 0;
export function subscribeToInbox(onChange: () => void) {
  const binding = getCurrentAccountSessionAuthoritySnapshot();
  const ownerKey = getNotificationActivityOwnerKey(binding);
  if (!ownerKey || !binding) return () => {};
  let active = true;
  const ownsSubscription = () => active && sameAccountSessionAuthority(binding, getCurrentAccountSessionAuthoritySnapshot());
  const notify = () => { if (ownsSubscription()) onChange(); };
  const stopActivity = subscribeToNotificationActivity(ownerKey, notify);
  const releaseActivityTransport = subscribeToNotificationActivityChanges(binding);
  const memberChanged = (payload: { new: Record<string, unknown> }) => {
    if (payload.new?.user_id === binding.userId) notify();
  };
  // RLS remains authoritative. Only recipient-filtered member INSERT/UPDATE
  // hints are needed; notification activity shares its existing transport.
  // DELETE payloads do not carry the same row-level authorization.
  const memberChannel = supabase.channel(`chat-inbox-members-${++inboxChannelSequence}`)
    .on("postgres_changes", { event: "INSERT", schema: "public", table: CHAT_THREAD_MEMBERS_TABLE, filter: `user_id=eq.${binding.userId}` }, memberChanged)
    .on("postgres_changes", { event: "UPDATE", schema: "public", table: CHAT_THREAD_MEMBERS_TABLE, filter: `user_id=eq.${binding.userId}` }, memberChanged)
    .subscribe(status => { if (status === "SUBSCRIBED") notify(); });
  return () => {
    active = false;
    stopActivity();
    releaseActivityTransport();
    void supabase.removeChannel(memberChannel).catch(() => {});
  };
}

let threadChannelSequence = 0;
export function subscribeToThread(threadId: string, onChange: () => void) {
  const normalizedThreadId = toText(threadId);
  const binding = getCurrentAccountSessionAuthoritySnapshot();
  if (!normalizedThreadId || !binding) return () => {};
  let active = true;
  const notify = () => {
    if (active && sameAccountSessionAuthority(binding, getCurrentAccountSessionAuthoritySnapshot())) onChange();
  };

  const channel = supabase
    .channel(`chat-thread-${normalizedThreadId}-${++threadChannelSequence}`)
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
        notify();
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
        notify();
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
        notify();
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
        notify();
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
        notify();
      },
    )
    .subscribe((status) => {
      logChatThread("thread_subscription_status", {
        threadId: normalizedThreadId,
        status,
      });
      // Both initial subscription and reconnect close the fetch/subscribe gap.
      if (status === "SUBSCRIBED") notify();
    });

  return () => {
    active = false;
    void supabase.removeChannel(channel).catch(() => {});
  };
}
