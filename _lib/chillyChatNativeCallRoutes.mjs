const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;
const NATIVE_REQUEST_KEY_PATTERN = /^[0-9a-f]{64}$/u;
const TRUSTED_ANDROID_ACTIONS = new Set(["answer", "decline"]);

const normalizeUuid = (value) => {
  const normalized = String(value ?? "").trim();
  return UUID_PATTERN.test(normalized) ? normalized.toLowerCase() : "";
};

const readChatThreadId = (parsedUrl) => {
  const segments = parsedUrl.pathname
    .split("/")
    .map((segment) => segment.trim())
    .filter(Boolean);
  if (parsedUrl.hostname.toLowerCase() === "chat") {
    return segments.length === 1 ? normalizeUuid(segments[0]) : "";
  }
  if (!parsedUrl.hostname && segments[0]?.toLowerCase() === "chat") {
    return segments.length === 2 ? normalizeUuid(segments[1]) : "";
  }
  return "";
};

const parseChillyChatUrl = (value) => {
  const normalized = String(value ?? "").trim();
  if (!normalized) return null;
  let parsedUrl;
  try {
    parsedUrl = new URL(normalized);
  } catch {
    return null;
  }
  if (
    parsedUrl.protocol.toLowerCase() !== "chillywoodmobile:"
    || parsedUrl.username
    || parsedUrl.password
    || parsedUrl.port
    || parsedUrl.hash
  ) {
    return null;
  }
  const threadId = readChatThreadId(parsedUrl);
  return threadId ? { parsedUrl, threadId } : null;
};

const buildNavigationOnlyRoute = (threadId) => ({
  destination: `/chat/${encodeURIComponent(threadId)}`,
  requestKey: `navigation:${threadId}`,
  threadId,
});

export const resolveChillyChatNativeCallRoute = (value) => {
  const parsed = parseChillyChatUrl(value);
  return parsed ? buildNavigationOnlyRoute(parsed.threadId) : null;
};

export const resolveChillyChatNativeCallActionPayload = (value) => {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const threadId = normalizeUuid(value.threadId);
  const callInviteId = normalizeUuid(value.callInviteId);
  const nativeCallAction = String(value.nativeCallAction ?? "").trim().toLowerCase();
  const requestKey = String(value.requestKey ?? "").trim().toLowerCase();
  const createdAt = Number(value.createdAt);
  const captureGeneration = Number(value.captureGeneration);
  const schemaVersion = Number(value.schemaVersion);
  if (
    !threadId
    || !callInviteId
    || !TRUSTED_ANDROID_ACTIONS.has(nativeCallAction)
    || !NATIVE_REQUEST_KEY_PATTERN.test(requestKey)
    || !Number.isSafeInteger(createdAt)
    || createdAt <= 0
    || !Number.isSafeInteger(captureGeneration)
    || captureGeneration <= 0
    || captureGeneration === createdAt
    || schemaVersion !== 2
  ) {
    return null;
  }
  return {
    callInviteId,
    captureGeneration,
    createdAt,
    nativeCallAction,
    requestKey,
    schemaVersion,
    threadId,
  };
};

export const resolveAuthoritativeNativeCallDecline = (input) => {
  const invite = input?.invite;
  const expectedInviteId = normalizeUuid(input?.expectedInviteId);
  const expectedThreadId = normalizeUuid(input?.expectedThreadId);
  const currentUserId = normalizeUuid(input?.currentUserId);
  if (
    !invite
    || typeof invite !== "object"
    || Array.isArray(invite)
    || !expectedInviteId
    || !expectedThreadId
    || !currentUserId
    || normalizeUuid(invite.id) !== expectedInviteId
    || normalizeUuid(invite.threadId) !== expectedThreadId
    || normalizeUuid(invite.calleeUserId) !== currentUserId
    || normalizeUuid(invite.callerUserId) === currentUserId
    || invite.status !== "declined"
  ) {
    return null;
  }
  return invite;
};

export const redirectChillyChatNativeCallSystemPath = (value) => (
  resolveChillyChatNativeCallRoute(value)?.destination ?? String(value ?? "")
);

export const createChillyChatNativeCallRouteBuffer = () => {
  let bufferedRoute = null;
  const listeners = new Set();
  return {
    capture(value) {
      const route = resolveChillyChatNativeCallRoute(value);
      if (!route) return false;
      if (listeners.size === 0) bufferedRoute = route;
      else listeners.forEach((listener) => listener(route));
      return true;
    },
    subscribe(listener) {
      listeners.add(listener);
      if (bufferedRoute) {
        const route = bufferedRoute;
        bufferedRoute = null;
        listener(route);
      }
      return () => listeners.delete(listener);
    },
  };
};
