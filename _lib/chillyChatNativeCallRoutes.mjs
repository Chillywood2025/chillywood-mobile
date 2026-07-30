const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;
const NATIVE_REQUEST_KEY_PATTERN = /^[0-9a-f]{64}$/u;

const normalizeUuid = (value) => {
  const normalized = String(value ?? "").trim();
  return UUID_PATTERN.test(normalized) ? normalized.toLowerCase() : "";
};

const buildResolvedNativeCallRoute = (
  threadId,
  callInviteId,
  nativeCallAction,
) => {
  if (
    !threadId
    || !callInviteId
    || !["answer", "decline"].includes(nativeCallAction)
  ) {
    return null;
  }

  const params = new URLSearchParams({
    callInviteId,
    nativeCallAction,
  });
  if (nativeCallAction === "answer") params.set("openCall", "1");

  return {
    destination: `/chat/${encodeURIComponent(threadId)}?${params.toString()}`,
    requestKey: `${threadId}:${callInviteId}:${nativeCallAction}`,
  };
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

export const resolveChillyChatNativeCallRoute = (value) => {
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
  const callInviteId = normalizeUuid(parsedUrl.searchParams.get("callInviteId"));
  const nativeCallAction = String(
    parsedUrl.searchParams.get("nativeCallAction") ?? "",
  ).trim().toLowerCase();
  return buildResolvedNativeCallRoute(threadId, callInviteId, nativeCallAction);
};

export const resolveChillyChatNativeCallActionPayload = (value) => {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const threadId = normalizeUuid(value.threadId);
  const callInviteId = normalizeUuid(value.callInviteId);
  const nativeCallAction = String(value.nativeCallAction ?? "").trim().toLowerCase();
  const nativeRequestKey = String(value.requestKey ?? "").trim().toLowerCase();
  const createdAt = Number(value.createdAt);
  const schemaVersion = Number(value.schemaVersion);
  if (
    !NATIVE_REQUEST_KEY_PATTERN.test(nativeRequestKey)
    || !Number.isSafeInteger(createdAt)
    || createdAt <= 0
    || schemaVersion !== 1
  ) {
    return null;
  }
  return buildResolvedNativeCallRoute(threadId, callInviteId, nativeCallAction);
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
      if (listeners.size === 0) {
        bufferedRoute = route;
      } else {
        listeners.forEach((listener) => listener(route));
      }
      return true;
    },
    subscribe(listener) {
      listeners.add(listener);
      if (bufferedRoute) {
        const route = bufferedRoute;
        bufferedRoute = null;
        listener(route);
      }
      return () => {
        listeners.delete(listener);
      };
    },
  };
};
