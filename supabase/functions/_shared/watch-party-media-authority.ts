const ACTIVE_MEMBERSHIP_STATES = new Set(["active", "reconnecting"]);
export const WATCH_PARTY_MEDIA_MEMBERSHIP_WINDOW_MS = 45_000;

export type WatchPartyMediaAuthorityInput = {
  actorUserId: unknown;
  blockedByHost: boolean;
  contentAccessAllowed: boolean;
  hostUserId: unknown;
  membership?: {
    lastSeenAt?: unknown;
    membershipState?: unknown;
    userId?: unknown;
  } | null;
  nowMillis?: number;
  restricted: boolean;
};

const text = (value: unknown) => String(value ?? "").trim();

export const canReadWatchPartyMedia = (
  input: WatchPartyMediaAuthorityInput,
) => {
  const actorUserId = text(input.actorUserId);
  const hostUserId = text(input.hostUserId);
  if (
    !actorUserId
    || !hostUserId
    || !input.contentAccessAllowed
    || input.restricted
    || input.blockedByHost
  ) {
    return false;
  }
  if (actorUserId === hostUserId) return true;

  const membershipUserId = text(input.membership?.userId);
  const membershipState = text(input.membership?.membershipState).toLowerCase();
  const lastSeenMillis = Date.parse(text(input.membership?.lastSeenAt));
  const nowMillis = Number.isFinite(input.nowMillis) ? Number(input.nowMillis) : Date.now();
  return membershipUserId === actorUserId
    && ACTIVE_MEMBERSHIP_STATES.has(membershipState)
    && Number.isFinite(lastSeenMillis)
    && lastSeenMillis <= nowMillis
    && nowMillis - lastSeenMillis <= WATCH_PARTY_MEDIA_MEMBERSHIP_WINDOW_MS;
};
