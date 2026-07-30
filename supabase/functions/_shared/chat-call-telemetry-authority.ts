type ChatCallInviteBindingRow = {
  accepted_at?: unknown;
  callee_user_id?: unknown;
  caller_user_id?: unknown;
  chat_call_media_provider?: unknown;
  communication_room_id?: unknown;
  status?: unknown;
  thread_id?: unknown;
};

type ResolveChatCallTelemetryBindingInput = {
  appUserId: unknown;
  callInviteId: unknown;
  clientCommunicationRoomId: unknown;
  invite: ChatCallInviteBindingRow | null | undefined;
  threadId: unknown;
};

type ResolveChatCallPreacceptTerminalCleanupInput = {
  appUserId: unknown;
  callInviteId: unknown;
  invite: ChatCallInviteBindingRow | null | undefined;
  stage: unknown;
  threadId: unknown;
};

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/iu;
const SHA256_HEX_PATTERN = /^[a-f0-9]{64}$/u;
const PREACCEPT_TERMINAL_STATUSES = new Set([
  "busy",
  "canceled",
  "declined",
  "missed",
]);
const PREACCEPT_TERMINAL_CLEANUP_STAGES = new Set([
  "cleanup_complete",
  "disconnected",
]);
const APPROVED_TELEMETRY_DIGEST_KEYS = new Set([
  "callinvitehash",
  "communicationroomhash",
  "roomruncorrelationhash",
  "threadhash",
  "user_hash",
]);
const toText = (value: unknown) => String(value ?? "").trim();

export const hasExactChatCallTelemetryIdentity = (
  callInviteId: unknown,
  threadId: unknown,
) =>
  UUID_PATTERN.test(toText(callInviteId)) &&
  UUID_PATTERN.test(toText(threadId));

export const isApprovedTelemetryDigest = (key: unknown, value: unknown) =>
  APPROVED_TELEMETRY_DIGEST_KEYS.has(toText(key).toLowerCase()) &&
  SHA256_HEX_PATTERN.test(toText(value));

export const resolveChatCallPreacceptTerminalCleanup = ({
  appUserId,
  callInviteId,
  invite,
  stage,
  threadId,
}: ResolveChatCallPreacceptTerminalCleanupInput) => {
  const normalizedAppUserId = toText(appUserId);
  const normalizedCallInviteId = toText(callInviteId).toLowerCase();
  const normalizedThreadId = toText(threadId).toLowerCase();
  const authoritativeCommunicationRoomId = toText(invite?.communication_room_id)
    .toUpperCase();
  const participantMatches =
    toText(invite?.caller_user_id) === normalizedAppUserId ||
    toText(invite?.callee_user_id) === normalizedAppUserId;
  const corroborated = hasExactChatCallTelemetryIdentity(
    normalizedCallInviteId,
    normalizedThreadId,
  ) &&
    !!authoritativeCommunicationRoomId &&
    toText(invite?.thread_id).toLowerCase() === normalizedThreadId &&
    toText(invite?.chat_call_media_provider).toLowerCase() === "livekit" &&
    !toText(invite?.accepted_at) &&
    PREACCEPT_TERMINAL_STATUSES.has(toText(invite?.status).toLowerCase()) &&
    PREACCEPT_TERMINAL_CLEANUP_STAGES.has(toText(stage).toLowerCase()) &&
    participantMatches;

  return {
    authoritativeCommunicationRoomId: corroborated
      ? authoritativeCommunicationRoomId
      : "",
    callInviteId: normalizedCallInviteId,
    corroborated,
    threadId: normalizedThreadId,
  };
};

export const resolveChatCallTelemetryBinding = ({
  appUserId,
  callInviteId,
  clientCommunicationRoomId,
  invite,
  threadId,
}: ResolveChatCallTelemetryBindingInput) => {
  const normalizedAppUserId = toText(appUserId);
  const normalizedCallInviteId = toText(callInviteId).toLowerCase();
  const normalizedThreadId = toText(threadId).toLowerCase();
  const authoritativeCommunicationRoomId = toText(invite?.communication_room_id)
    .toUpperCase();
  const normalizedClientCommunicationRoomId = toText(clientCommunicationRoomId)
    .toUpperCase();
  const participantMatches =
    toText(invite?.caller_user_id) === normalizedAppUserId ||
    toText(invite?.callee_user_id) === normalizedAppUserId;
  const clientRoomBindingCompatible = !normalizedClientCommunicationRoomId ||
    normalizedClientCommunicationRoomId === authoritativeCommunicationRoomId;
  const corroborated = hasExactChatCallTelemetryIdentity(
    normalizedCallInviteId,
    normalizedThreadId,
  ) &&
    !!authoritativeCommunicationRoomId &&
    clientRoomBindingCompatible &&
    toText(invite?.thread_id).toLowerCase() === normalizedThreadId &&
    toText(invite?.chat_call_media_provider).toLowerCase() === "livekit" &&
    !!toText(invite?.accepted_at) &&
    participantMatches;

  return {
    authoritativeCommunicationRoomId: corroborated
      ? authoritativeCommunicationRoomId
      : "",
    callInviteId: normalizedCallInviteId,
    corroborated,
    threadId: normalizedThreadId,
  };
};
