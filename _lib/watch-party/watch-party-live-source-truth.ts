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

export type WatchPartyLiveParticipantRole = "host" | "co-host" | "viewer";
export type WatchPartyLiveParticipantStageRole = "host" | "speaker" | "listener";

export type WatchPartyLiveRosterParticipant = {
  id: string;
  liveKitIdentity?: string | null;
  name: string;
  role: WatchPartyLiveParticipantRole;
  stageRole: WatchPartyLiveParticipantStageRole;
  muted?: boolean | null;
  canSpeak?: boolean | null;
  isRequestingToSpeak?: boolean | null;
  avatarUrl?: string | null;
  cameraPreviewUrl?: string | null;
};

export type WatchPartyLiveParticipantRosterEntry = {
  identity: string;
  participantId: string;
  label: string;
  role: "host" | "speaker" | "viewer";
  canPublish: boolean;
  isRequestingToSpeak: boolean;
  isCurrentUser: boolean;
  identityAliases: string[];
  avatarUrl: string | null;
};

export type WatchPartyLiveSharedPlaybackRenderProbe = {
  isSharedPartyPlayback: boolean;
  platform?: string | null;
  sourceClassification?: WatchPartyLiveMediaSourceClassification | null;
  playbackUrlPresent?: boolean | null;
  usedBundledFallback?: boolean | null;
  shouldBePlaying?: boolean | null;
  sourceLoadFired?: boolean | null;
  durationMillis?: number | null;
  positionMillis?: number | null;
  lastProgressAtMillis?: number | null;
  sessionStartedAtMillis?: number | null;
  nowMillis?: number | null;
  recoveryCount?: number | null;
  maxRecoveries?: number | null;
  watchdogTimeoutMillis?: number | null;
  renderWatchdogActive?: boolean | null;
  visualPlaybackObserved?: boolean | null;
};

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

const normalizeIdentityList = (...values: unknown[]) => {
  const seen = new Set<string>();
  const identities: string[] = [];
  values.forEach((value) => {
    if (Array.isArray(value)) {
      value.forEach((entry) => {
        const normalized = sanitizeIdentifier(entry);
        if (!normalized || seen.has(normalized)) return;
        seen.add(normalized);
        identities.push(normalized);
      });
      return;
    }
    const normalized = sanitizeIdentifier(value);
    if (!normalized || seen.has(normalized)) return;
    seen.add(normalized);
    identities.push(normalized);
  });
  return identities;
};

export const buildWatchPartyLiveParticipantRoster = (options: {
  participants: WatchPartyLiveRosterParticipant[];
  currentUserId?: string | null;
  currentLiveKitIdentity?: string | null;
  currentIdentityAliases?: string[];
  showRequestIndicators?: boolean | null;
}): WatchPartyLiveParticipantRosterEntry[] => {
  const currentIdentityAliases = normalizeIdentityList(
    options.currentUserId,
    options.currentLiveKitIdentity,
    options.currentIdentityAliases ?? [],
  );
  const currentIdentitySet = new Set(currentIdentityAliases);
  const seenParticipantIds = new Set<string>();

  return options.participants.reduce<WatchPartyLiveParticipantRosterEntry[]>((entries, participant) => {
    const participantId = sanitizeIdentifier(participant.id);
    if (!participantId || seenParticipantIds.has(participantId)) return entries;
    seenParticipantIds.add(participantId);

    const liveKitIdentity = sanitizeIdentifier(participant.liveKitIdentity);
    const identity = liveKitIdentity || participantId;
    const identityAliases = normalizeIdentityList(identity, participantId, liveKitIdentity);
    const isCurrentUser = identityAliases.some((entry) => currentIdentitySet.has(entry));
    const role: WatchPartyLiveParticipantRosterEntry["role"] = participant.role === "host"
      ? "host"
      : participant.canSpeak || participant.stageRole === "speaker"
        ? "speaker"
        : "viewer";
    const label = isCurrentUser
      ? "You"
      : sanitizeIdentifier(participant.name) || (role === "host" ? "Host" : "Guest");
    const avatarUrl = sanitizeIdentifier(participant.cameraPreviewUrl) || sanitizeIdentifier(participant.avatarUrl) || null;

    entries.push({
      identity,
      participantId,
      label,
      role,
      canPublish: role !== "viewer" && !participant.muted,
      isRequestingToSpeak: !!options.showRequestIndicators && !!participant.isRequestingToSpeak && role === "viewer",
      isCurrentUser,
      identityAliases,
      avatarUrl,
    });
    return entries;
  }, []);
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

const normalizePositiveMillis = (value: unknown) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
};

export const hasWatchPartyLiveConcretePlaybackProgress = (
  probe: Pick<WatchPartyLiveSharedPlaybackRenderProbe, "sourceLoadFired" | "durationMillis" | "positionMillis" | "lastProgressAtMillis">,
) => {
  const durationMillis = normalizePositiveMillis(probe.durationMillis);
  const positionMillis = normalizePositiveMillis(probe.positionMillis);
  const lastProgressAtMillis = normalizePositiveMillis(probe.lastProgressAtMillis);
  return probe.sourceLoadFired === true && durationMillis > 0 && (positionMillis > 0 || lastProgressAtMillis > 0);
};

export const shouldTriggerWatchPartyLiveSharedPlaybackRecovery = (
  probe: WatchPartyLiveSharedPlaybackRenderProbe,
) => {
  if (!probe.isSharedPartyPlayback) return false;
  if (sanitizeIdentifier(probe.platform).toLowerCase() !== "android") return false;
  if (probe.sourceClassification !== "real-media") return false;
  if (probe.playbackUrlPresent !== true || probe.usedBundledFallback === true) return false;
  if (probe.shouldBePlaying !== true) return false;
  if (hasWatchPartyLiveConcretePlaybackProgress(probe)) return false;

  const nowMillis = normalizePositiveMillis(probe.nowMillis) || Date.now();
  const sessionStartedAtMillis = normalizePositiveMillis(probe.sessionStartedAtMillis);
  const elapsedMillis = sessionStartedAtMillis > 0 ? nowMillis - sessionStartedAtMillis : 0;
  const watchdogTimeoutMillis = normalizePositiveMillis(probe.watchdogTimeoutMillis) || 4500;
  if (elapsedMillis < watchdogTimeoutMillis) return false;

  const maxRecoveries = Math.max(1, Math.floor(Number(probe.maxRecoveries ?? 2)));
  const recoveryCount = Math.max(0, Math.floor(Number(probe.recoveryCount ?? 0)));
  return recoveryCount < maxRecoveries;
};

export const canCloseWatchPartyLiveActualPlaybackProof = (
  probe: WatchPartyLiveSharedPlaybackRenderProbe,
) => (
  probe.isSharedPartyPlayback
  && probe.sourceClassification === "real-media"
  && probe.playbackUrlPresent === true
  && probe.usedBundledFallback !== true
  && hasWatchPartyLiveConcretePlaybackProgress(probe)
  && probe.renderWatchdogActive !== true
  && probe.visualPlaybackObserved === true
);
