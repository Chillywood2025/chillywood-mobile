import { resolveApplicationRoute } from "./appLinks";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;

export const normalizeChatMessageId = (value: unknown) => (
  typeof value === "string" && UUID.test(value) ? value.toLowerCase() : null
);

export type NotificationMessageTarget = {
  notificationType?: unknown;
  targetEntityId?: unknown;
  targetContext?: unknown;
};

/** Message IDs select presentation within a thread; they never grant access. */
export function resolveNotificationMessagePath(value: unknown, target?: NotificationMessageTarget) {
  const route = resolveApplicationRoute(value);
  if (!route || target?.notificationType !== "chat_message") return route;
  const [pathname, query = ""] = route.split("?");
  const threadId = normalizeChatMessageId(pathname.startsWith("/chat/") ? pathname.slice(6) : null);
  const context = target.targetContext;
  if (!threadId || !context || typeof context !== "object" || Array.isArray(context)) return route;
  const { threadId: contextThreadId, messageId } = context as Record<string, unknown>;
  if (normalizeChatMessageId(target.targetEntityId) !== threadId
    || normalizeChatMessageId(contextThreadId) !== threadId) return route;
  const id = normalizeChatMessageId(messageId);
  if (!id) return route;
  const params = new URLSearchParams(query);
  // A message notification must not transform a call entry or replace an
  // independently supplied message target.
  if ([...params.keys()].some((key) => !["from", "source", "messageId"].includes(key))) return route;
  if (params.has("messageId") && params.get("messageId")?.toLowerCase() !== id) return route;
  params.set("messageId", id);
  return resolveApplicationRoute(`${pathname}?${params.toString()}`);
}
