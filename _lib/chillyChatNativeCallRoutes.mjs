const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;

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
