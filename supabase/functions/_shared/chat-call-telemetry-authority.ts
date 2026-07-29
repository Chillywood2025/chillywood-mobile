type ChatCallInviteBindingRow = {
  accepted_at?: unknown;
  callee_user_id?: unknown;
  caller_user_id?: unknown;
  chat_call_media_provider?: unknown;
  communication_room_id?: unknown;
  thread_id?: unknown;
};

type ResolveChatCallTelemetryBindingInput = {
  appUserId: unknown;
  callInviteId: unknown;
  clientCommunicationRoomId: unknown;
  invite: ChatCallInviteBindingRow | null | undefined;
  threadId: unknown;
};

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/iu;
const toText = (value: unknown) => String(value ?? "").trim();

export const hasExactChatCallTelemetryIdentity = (
  callInviteId: unknown,
  threadId: unknown,
) =>
  UUID_PATTERN.test(toText(callInviteId)) &&
  UUID_PATTERN.test(toText(threadId));

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
