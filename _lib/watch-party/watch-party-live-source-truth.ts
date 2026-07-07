export const PARTY_SEAT_REQUEST_MESSAGE_PREFIX = "__chillywood_party_seat_request_v1__:";
export const PARTY_SEAT_REQUEST_MESSAGE_TTL_MILLIS = 5 * 60 * 1000;

const sanitizeIdentifier = (value: unknown) => String(value ?? "").trim();

export type WatchPartySeatRequestMarker = {
  participantId: string;
  pending: boolean;
  sentAt: number;
  requestedAt: number;
  requestVersion: string;
};

export type WatchPartyLiveSeatRequestState = {
  pendingById: Record<string, boolean>;
  versionById: Record<string, string>;
  sentAtById: Record<string, number>;
  sourceById: Record<string, string>;
  closedVersionById: Record<string, string>;
};

export type WatchPartyLiveSeatRequestEvent = {
  participantId: string;
  pending: boolean;
  sentAt?: number | string | null;
  requestedAt?: number | string | null;
  requestId?: string | number | null;
  requestVersion?: string | number | null;
  source?: string | null;
};

export type WatchPartyLiveAuthorityRole = "host" | "speaker" | "viewer";

export type WatchPartyLiveAuthorityTarget = {
  participantRole: WatchPartyLiveAuthorityRole;
  canPublish: boolean;
};

export type WatchPartyLiveJoinContractLike = {
  roomName?: string | null;
  participantRole?: string | null;
  requestedGrants?: {
    canPublish?: boolean | null;
  } | null;
} | null | undefined;

export type WatchPartyLiveMediaSourceClassification = "real-media" | "fixture-or-proof" | "bundled-fallback" | "missing-source";

export const normalizeWatchPartySeatRequestVersion = (...candidates: unknown[]) => {
  for (const candidate of candidates) {
    const normalized = sanitizeIdentifier(candidate);
    if (normalized) return normalized;
  }
  return "";
};

const normalizeTimestampMillis = (...candidates: unknown[]) => {
  for (const candidate of candidates) {
    if (typeof candidate === "number" && Number.isFinite(candidate) && candidate > 0) return candidate;
    const parsed = Number(candidate);
    if (Number.isFinite(parsed) && parsed > 0) return parsed;
    const parsedDate = Date.parse(String(candidate ?? ""));
    if (Number.isFinite(parsedDate) && parsedDate > 0) return parsedDate;
  }
  return 0;
};

export const createWatchPartySeatRequestVersion = (nowMillis = Date.now(), nonce = Math.random()) => {
  const safeNow = Math.max(0, Math.floor(nowMillis));
  const safeNonce = Math.abs(Math.floor(nonce * 1_000_000)).toString(36);
  return `party-seat-${safeNow.toString(36)}-${safeNonce}`;
};

export const emptyWatchPartyLiveSeatRequestState = (): WatchPartyLiveSeatRequestState => ({
  pendingById: {},
  versionById: {},
  sentAtById: {},
  sourceById: {},
  closedVersionById: {},
});

export const encodePartySeatRequestMessage = (
  participantId: string,
  pending: boolean,
  options?: {
    requestId?: string | number | null;
    requestVersion?: string | number | null;
    sentAt?: number | string | null;
    requestedAt?: number | string | null;
  },
) => {
  const sentAt = normalizeTimestampMillis(options?.sentAt, options?.requestedAt) || Date.now();
  const requestVersion = normalizeWatchPartySeatRequestVersion(
    options?.requestVersion,
    options?.requestId,
    sentAt,
  );

  return `${PARTY_SEAT_REQUEST_MESSAGE_PREFIX}${JSON.stringify({
    participantId,
    pending,
    sentAt,
    requestedAt: sentAt,
    requestVersion,
  })}`;
};

export const decodePartySeatRequestMessage = (body: unknown): WatchPartySeatRequestMarker | null => {
  const raw = String(body ?? "").trim();
  if (!raw.startsWith(PARTY_SEAT_REQUEST_MESSAGE_PREFIX)) return null;
  try {
    const payload = JSON.parse(raw.slice(PARTY_SEAT_REQUEST_MESSAGE_PREFIX.length)) as {
      participantId?: unknown;
      pending?: unknown;
      sentAt?: unknown;
      requestedAt?: unknown;
      requestId?: unknown;
      requestVersion?: unknown;
    };
    const participantId = sanitizeIdentifier(payload.participantId);
    if (!participantId) return null;
    const sentAt = normalizeTimestampMillis(payload.sentAt, payload.requestedAt);
    const requestVersion = normalizeWatchPartySeatRequestVersion(
      payload.requestVersion,
      payload.requestId,
      payload.requestedAt,
      payload.sentAt,
    );
    return {
      participantId,
      pending: payload.pending === true,
      sentAt,
      requestedAt: normalizeTimestampMillis(payload.requestedAt, payload.sentAt),
      requestVersion,
    };
  } catch {
    return null;
  }
};

export const isWatchPartySeatRequestExpired = (
  sentAt: number,
  nowMillis = Date.now(),
  ttlMillis = PARTY_SEAT_REQUEST_MESSAGE_TTL_MILLIS,
) => sentAt > 0 && nowMillis - sentAt > ttlMillis;

export const applyWatchPartySeatRequestEvent = (
  state: WatchPartyLiveSeatRequestState,
  event: WatchPartyLiveSeatRequestEvent,
): WatchPartyLiveSeatRequestState => {
  const participantId = sanitizeIdentifier(event.participantId);
  if (!participantId) return state;

  if (!event.pending) {
    const eventVersion = normalizeWatchPartySeatRequestVersion(
      event.requestVersion,
      event.requestId,
      event.requestedAt,
      event.sentAt,
    );
    const currentVersion = state.versionById[participantId] ?? "";
    if (currentVersion && !eventVersion) {
      return state;
    }
    if (currentVersion && eventVersion && currentVersion !== eventVersion) {
      return state;
    }
    if (
      !state.pendingById[participantId]
      && !state.versionById[participantId]
      && !state.sentAtById[participantId]
      && !state.sourceById[participantId]
      && !state.closedVersionById[participantId]
    ) {
      return state;
    }
    const pendingById = { ...state.pendingById };
    const versionById = { ...state.versionById };
    const sentAtById = { ...state.sentAtById };
    const sourceById = { ...state.sourceById };
    const closedVersionById = { ...state.closedVersionById };
    delete pendingById[participantId];
    delete versionById[participantId];
    delete sentAtById[participantId];
    delete sourceById[participantId];
    delete closedVersionById[participantId];
    return { pendingById, versionById, sentAtById, sourceById, closedVersionById };
  }

  const sentAt = normalizeTimestampMillis(event.sentAt, event.requestedAt) || Date.now();
  const previousVersion = state.versionById[participantId] ?? "";
  const requestVersion = normalizeWatchPartySeatRequestVersion(
    event.requestVersion,
    event.requestId,
    event.requestedAt,
    event.sentAt,
    previousVersion,
  ) || createWatchPartySeatRequestVersion(sentAt);
  const isNewRequest = previousVersion !== requestVersion;
  const closedVersionById = isNewRequest ? { ...state.closedVersionById } : state.closedVersionById;
  if (isNewRequest) {
    delete closedVersionById[participantId];
  }

  return {
    pendingById: { ...state.pendingById, [participantId]: true },
    versionById: { ...state.versionById, [participantId]: requestVersion },
    sentAtById: { ...state.sentAtById, [participantId]: sentAt },
    sourceById: { ...state.sourceById, [participantId]: sanitizeIdentifier(event.source) || state.sourceById[participantId] || "unknown" },
    closedVersionById,
  };
};

export const closeWatchPartySeatRequestReview = (
  state: WatchPartyLiveSeatRequestState,
  participantId: string,
): WatchPartyLiveSeatRequestState => {
  const normalizedParticipantId = sanitizeIdentifier(participantId);
  if (!normalizedParticipantId || !state.pendingById[normalizedParticipantId]) return state;
  const requestVersion = state.versionById[normalizedParticipantId] ?? "";
  if (!requestVersion) return state;
  if (state.closedVersionById[normalizedParticipantId] === requestVersion) return state;
  return {
    ...state,
    closedVersionById: {
      ...state.closedVersionById,
      [normalizedParticipantId]: requestVersion,
    },
  };
};

export const shouldAutoOpenWatchPartySeatRequestReview = (
  state: WatchPartyLiveSeatRequestState,
  participantId: string,
) => {
  const normalizedParticipantId = sanitizeIdentifier(participantId);
  if (!normalizedParticipantId || !state.pendingById[normalizedParticipantId]) return false;
  const requestVersion = state.versionById[normalizedParticipantId] ?? "";
  if (!requestVersion) return true;
  return state.closedVersionById[normalizedParticipantId] !== requestVersion;
};

export const resolveDesiredWatchPartyLiveAuthority = (options: {
  participantRole: WatchPartyLiveAuthorityRole;
  isMuted?: boolean | null;
}): WatchPartyLiveAuthorityTarget => ({
  participantRole: options.participantRole,
  canPublish: options.participantRole !== "viewer" && !options.isMuted,
});

export const watchPartyLiveContractMatchesDesiredAuthority = (
  contract: WatchPartyLiveJoinContractLike,
  desired: WatchPartyLiveAuthorityTarget,
  options?: { roomName?: string | null },
) => (
  !!contract
  && (!sanitizeIdentifier(options?.roomName) || contract.roomName === sanitizeIdentifier(options?.roomName))
  && contract.participantRole === desired.participantRole
  && contract.requestedGrants?.canPublish === desired.canPublish
);

export const canRenderWatchPartyParticipantSpecificTrack = (options: {
  participantId: string;
  localParticipantIdentity: string;
  trackParticipantIdentity?: string | null;
}) => {
  const participantId = sanitizeIdentifier(options.participantId);
  const localParticipantIdentity = sanitizeIdentifier(options.localParticipantIdentity);
  const trackParticipantIdentity = sanitizeIdentifier(options.trackParticipantIdentity);
  return !!participantId
    && !!trackParticipantIdentity
    && participantId !== localParticipantIdentity
    && trackParticipantIdentity === participantId;
};

export const classifyWatchPartyLiveMediaSource = (options: {
  sourceType?: string | null;
  sourceId?: string | null;
  displayName?: string | null;
  playbackUrl?: string | null;
  usedBundledFallback?: boolean | null;
}): WatchPartyLiveMediaSourceClassification => {
  if (options.usedBundledFallback) return "bundled-fallback";
  if (!sanitizeIdentifier(options.playbackUrl)) return "missing-source";
  const displayName = sanitizeIdentifier(options.displayName).toLowerCase();
  const sourceId = sanitizeIdentifier(options.sourceId).toLowerCase();
  if (
    displayName.includes("proof fixture")
    || displayName.includes("fixture")
    || sourceId.includes("fixture")
    || sourceId.includes("proof")
  ) {
    return "fixture-or-proof";
  }
  return "real-media";
};
