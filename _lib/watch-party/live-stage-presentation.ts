export type LiveStageParticipantRole = "host" | "speaker" | "listener" | "viewer";

export type LiveStageParticipantStateLike = {
  role?: LiveStageParticipantRole | string | null;
  isMuted?: boolean | null;
  isRemoved?: boolean | null;
};

export type LiveStageParticipantLike = {
  userId?: string | null;
  role?: LiveStageParticipantRole | string | null;
  isSpeaking?: boolean | null;
  isMuted?: boolean | null;
};

export type LiveStageCommunityParticipantOptions<TParticipant extends LiveStageParticipantLike> = {
  participants: TParticipant[];
  actualVisualHeroParticipantId: string;
  participantStateById?: Record<string, LiveStageParticipantStateLike | undefined>;
  shouldUseViewerSelfHero: boolean;
  hostParticipantId?: string | null;
};

export type LiveStageSeatRequestState = {
  pendingById: Record<string, boolean>;
  versionById: Record<string, string>;
  closedVersionById: Record<string, string>;
};

export type LiveStageSeatRequestEvent = {
  participantId: string;
  pending: boolean;
  requestVersion?: string | number | null;
  requestedAt?: string | number | null;
};

export type LiveKitAuthorityRole = "host" | "speaker" | "viewer";

export type LiveKitAuthorityTarget = {
  participantRole: LiveKitAuthorityRole;
  canPublish: boolean;
};

export type LiveKitJoinContractLike = {
  roomName?: string | null;
  participantRole?: string | null;
  requestedGrants?: {
    canPublish?: boolean | null;
  } | null;
} | null | undefined;

const sanitizeIdentifier = (value: unknown) => String(value ?? "").trim();

export const shouldAutoStartAuthorizedNativeLiveKitMedia = (platform: string) => (
  ["android", "ios"].includes(sanitizeIdentifier(platform).toLowerCase())
);

export const shouldAutoStartLiveStageLocalMedia = shouldAutoStartAuthorizedNativeLiveKitMedia;

export const normalizeSeatRequestVersion = (...candidates: unknown[]) => {
  for (const candidate of candidates) {
    const normalized = sanitizeIdentifier(candidate);
    if (normalized) return normalized;
  }
  return "";
};

export const createSeatRequestVersion = (nowMillis = Date.now(), nonce = Math.random()) => {
  const safeNonce = Math.abs(Math.floor(nonce * 1_000_000)).toString(36);
  return `seat-${Math.max(0, Math.floor(nowMillis)).toString(36)}-${safeNonce}`;
};

export const emptyLiveStageSeatRequestState = (): LiveStageSeatRequestState => ({
  pendingById: {},
  versionById: {},
  closedVersionById: {},
});

export const applyLiveStageSeatRequestEvent = (
  state: LiveStageSeatRequestState,
  event: LiveStageSeatRequestEvent,
): LiveStageSeatRequestState => {
  const participantId = sanitizeIdentifier(event.participantId);
  if (!participantId) return state;

  if (!event.pending) {
    if (!state.pendingById[participantId] && !state.versionById[participantId] && !state.closedVersionById[participantId]) {
      return state;
    }
    const pendingById = { ...state.pendingById };
    const versionById = { ...state.versionById };
    const closedVersionById = { ...state.closedVersionById };
    delete pendingById[participantId];
    delete versionById[participantId];
    delete closedVersionById[participantId];
    return { pendingById, versionById, closedVersionById };
  }

  const previousVersion = state.versionById[participantId] ?? "";
  const requestVersion = normalizeSeatRequestVersion(event.requestVersion, event.requestedAt, previousVersion)
    || createSeatRequestVersion();
  const isNewRequest = previousVersion !== requestVersion;
  const pendingById = { ...state.pendingById, [participantId]: true };
  const versionById = { ...state.versionById, [participantId]: requestVersion };
  const closedVersionById = isNewRequest ? { ...state.closedVersionById } : state.closedVersionById;

  if (isNewRequest) {
    delete closedVersionById[participantId];
  }

  return { pendingById, versionById, closedVersionById };
};

export const closeLiveStageSeatRequestSheet = (
  state: LiveStageSeatRequestState,
  participantId: string,
): LiveStageSeatRequestState => {
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

export const shouldAutoOpenLiveStageSeatRequest = (
  state: LiveStageSeatRequestState,
  participantId: string,
) => {
  const normalizedParticipantId = sanitizeIdentifier(participantId);
  if (!normalizedParticipantId || !state.pendingById[normalizedParticipantId]) return false;
  const requestVersion = state.versionById[normalizedParticipantId] ?? "";
  if (!requestVersion) return true;
  return state.closedVersionById[normalizedParticipantId] !== requestVersion;
};

export const resolveActualVisualHeroParticipantId = (options: {
  isHost: boolean;
  currentUserParticipantId: string;
  shouldUseViewerSelfHero: boolean;
  heroParticipantId?: string | null;
}) => {
  const currentUserParticipantId = sanitizeIdentifier(options.currentUserParticipantId);
  if (options.shouldUseViewerSelfHero) return currentUserParticipantId;
  const heroParticipantId = sanitizeIdentifier(options.heroParticipantId);
  if (heroParticipantId) return heroParticipantId;
  return options.isHost ? currentUserParticipantId : "";
};

const roleFromParticipant = (participant: LiveStageParticipantLike, state?: LiveStageParticipantStateLike) => (
  sanitizeIdentifier(state?.role || participant.role) || (participant.isSpeaking ? "speaker" : "listener")
);

export const buildLiveStageCommunityParticipants = <TParticipant extends LiveStageParticipantLike>(
  options: LiveStageCommunityParticipantOptions<TParticipant>,
) => {
  const actualVisualHeroParticipantId = sanitizeIdentifier(options.actualVisualHeroParticipantId);
  const nextParticipants = options.participants.filter((participant) => {
    const participantId = sanitizeIdentifier(participant.userId);
    if (!participantId) return false;
    if (participantId === actualVisualHeroParticipantId) return false;
    const participantState = options.participantStateById?.[participantId];
    if (participantState?.isRemoved) return false;
    return true;
  });

  if (!options.shouldUseViewerSelfHero) return nextParticipants;

  const hostParticipantId = sanitizeIdentifier(options.hostParticipantId);
  if (!hostParticipantId) return nextParticipants;
  const hostEntry = nextParticipants.find((participant) => sanitizeIdentifier(participant.userId) === hostParticipantId);
  if (!hostEntry) return nextParticipants;
  return [
    hostEntry,
    ...nextParticipants.filter((participant) => sanitizeIdentifier(participant.userId) !== hostParticipantId),
  ];
};

export const getLiveStagePrimaryRoleLabel = (options: {
  participant?: LiveStageParticipantLike | null;
  state?: LiveStageParticipantStateLike | null;
  isRequesting?: boolean;
  seatState?: "eligible" | "requested" | "rejected" | "approved" | null;
}) => {
  const role = roleFromParticipant(options.participant ?? {}, options.state ?? undefined);
  const isRemoved = !!options.state?.isRemoved;
  if (isRemoved) return "Removed";
  if ((options.isRequesting || options.seatState === "requested") && role !== "host" && role !== "speaker") return "Seat requested";
  if (role === "host") return "Host";
  if (role === "speaker") return "Approved speaker";
  if (options.seatState === "rejected") return "Rejected";
  if (options.seatState === "eligible" || options.seatState === "approved") return "Seat eligible";
  return "Viewer";
};

export const resolveDesiredLiveKitAuthority = (options: {
  participantRole: LiveKitAuthorityRole;
  isMuted?: boolean;
}): LiveKitAuthorityTarget => {
  const canPublish = options.participantRole !== "viewer" && !options.isMuted;
  return {
    participantRole: options.participantRole,
    canPublish,
  };
};

export const liveKitContractMatchesDesiredAuthority = (
  contract: LiveKitJoinContractLike,
  desired: LiveKitAuthorityTarget,
) => (
  !!contract
  && contract.participantRole === desired.participantRole
  && contract.requestedGrants?.canPublish === desired.canPublish
);

export const canUseLiveStageRenderableContract = (
  contract: LiveKitJoinContractLike,
  options: {
    roomName?: string | null;
    isExpired?: boolean;
  },
) => {
  if (!contract || options.isExpired) return false;
  const contractRoomName = sanitizeIdentifier(contract.roomName);
  const expectedRoomName = sanitizeIdentifier(options.roomName);
  if (!contractRoomName || !expectedRoomName) return false;
  return contractRoomName === expectedRoomName;
};

export const shouldShowLiveStageJoinUnavailable = (options: {
  unavailable?: unknown | null;
  hasRenderableContract: boolean;
}) => !!options.unavailable && !options.hasRenderableContract;

export const canRenderParticipantSpecificLiveKitTrack = (options: {
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

export const canRenderLocalParticipantLiveKitTrack = (options: {
  participantId: string;
  localParticipantIdentity: string;
  trackParticipantIdentity?: string | null;
  publishLocalCamera: boolean;
}) => {
  const participantId = sanitizeIdentifier(options.participantId);
  const localParticipantIdentity = sanitizeIdentifier(options.localParticipantIdentity);
  const trackParticipantIdentity = sanitizeIdentifier(options.trackParticipantIdentity);
  return options.publishLocalCamera
    && !!participantId
    && participantId === localParticipantIdentity
    && trackParticipantIdentity === localParticipantIdentity;
};
