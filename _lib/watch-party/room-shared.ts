export type SharedParticipantRole = "host" | "speaker" | "listener";
export type SharedParticipantSeatLayer = "host" | "featured" | "seated" | "audience";

export type SharedRoomMode = "live" | "hybrid";

export type WaitingRoomParticipantEntry = {
  id: string;
  displayName: string;
  avatarUrl?: string;
  cameraPreviewUrl?: string;
  avatarLabelOverride?: string;
  isHost?: boolean;
  isSelf?: boolean;
  isActive?: boolean;
  isSpeaking?: boolean;
  statusText?: string;
  reactionEmoji?: string;
};

export const LIVE_WATCH_PARTY_LABEL = "Live Watch-Party";
export const PLAYER_WATCH_PARTY_SOURCE = "player-watch-party-live";

export type SharedRoomLabels = {
  watchPartyLabel: string;
  waitingRoomTitle: string;
  roomStatusLabel: string;
  roomCardLabel: string;
  roomCardTitle: string;
};

export type SharedRoomBranding = {
  watchPartyLabel?: string;
  liveWaitingRoomTitle?: string;
  partyWaitingRoomTitle?: string;
  liveRoomTitle?: string;
  partyRoomTitle?: string;
};

export type SharedParticipantIdentity = {
  id: string;
  userId: string;
  displayName: string;
  avatarUrl?: string;
  cameraPreviewUrl?: string;
  role: "host" | "viewer";
  isCurrentUser: boolean;
  isHost: boolean;
  isLive: boolean;
  isSpeaking: boolean;
  isMuted: boolean;
};

export type SharedParticipantLocalState = {
  isMuted: boolean;
  role: SharedParticipantRole;
  isRemoved: boolean;
};

const TECHNICAL_NAME_PATTERN = /^(user[·\-\s]|viewer[·\-\s]|anon[\-\s])/i;
const UUID_LIKE_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const LIVE_WAITING_ROOM_TITLE = "Live Waiting Room";
const PARTY_WAITING_ROOM_TITLE = "Party Waiting Room";
const LIVE_ROOM_TITLE = "Live Room";
const PARTY_ROOM_TITLE = "Party Room";
const LIVE_ROOM_CARD_LABEL = "LIVE ROOM";
const PARTY_ROOM_CARD_LABEL = "PARTY ROOM";

export const DEFAULT_SHARED_ROOM_BRANDING: Required<SharedRoomBranding> = {
  watchPartyLabel: LIVE_WATCH_PARTY_LABEL,
  liveWaitingRoomTitle: LIVE_WAITING_ROOM_TITLE,
  partyWaitingRoomTitle: PARTY_WAITING_ROOM_TITLE,
  liveRoomTitle: LIVE_ROOM_TITLE,
  partyRoomTitle: PARTY_ROOM_TITLE,
};

export const resolveIdentityName = (...candidates: unknown[]) => {
  for (const candidate of candidates) {
    const value = String(candidate ?? "").trim();
    if (!value) continue;
    if (UUID_LIKE_PATTERN.test(value)) continue;
    if (TECHNICAL_NAME_PATTERN.test(value)) continue;
    return value;
  }
  return "Guest";
};

export const buildParticipantProfileParams = (options: {
  userId?: unknown;
  displayName?: unknown;
  role?: unknown;
  isLive?: unknown;
  partyId?: unknown;
  mode?: unknown;
  source?: unknown;
  avatarUrl?: unknown;
  tagline?: unknown;
}) => {
  const userId = String(options.userId ?? "").trim();
  const partyId = String(options.partyId ?? "").trim();
  const mode = String(options.mode ?? "").trim();
  const source = String(options.source ?? "").trim();
  const avatarUrl = String(options.avatarUrl ?? "").trim();
  const tagline = String(options.tagline ?? "").trim();

  return {
    userId,
    displayName: resolveIdentityName(options.displayName, userId, "Participant"),
    role: options.role === "host" ? "host" : "viewer",
    isLive: !!options.isLive ? "1" : "0",
    ...(partyId ? { partyId } : {}),
    ...(mode ? { mode } : {}),
    ...(source ? { source } : {}),
    ...(avatarUrl ? { avatarUrl } : {}),
    ...(tagline ? { tagline } : {}),
  };
};

export const buildSharedParticipantIdentity = (options: {
  userId?: unknown;
  role?: unknown;
  displayNameCandidates?: unknown[];
  avatarUrl?: unknown;
  cameraPreviewUrl?: unknown;
  currentUserId?: unknown;
  fallbackDisplayName?: unknown;
  isLive?: unknown;
  isSpeaking?: unknown;
  isMuted?: unknown;
}): SharedParticipantIdentity => {
  const userId = String(options.userId ?? "").trim();
  const role: "host" | "viewer" = options.role === "host" ? "host" : "viewer";
  const currentUserId = String(options.currentUserId ?? "").trim();
  const avatarUrl = String(options.avatarUrl ?? "").trim();
  const cameraPreviewUrl = String(options.cameraPreviewUrl ?? "").trim();

  return {
    id: userId,
    userId,
    displayName: resolveIdentityName(...(options.displayNameCandidates ?? []), options.fallbackDisplayName ?? "Guest"),
    avatarUrl: avatarUrl || undefined,
    cameraPreviewUrl: cameraPreviewUrl || undefined,
    role,
    isCurrentUser: !!userId && !!currentUserId && userId === currentUserId,
    isHost: role === "host",
    isLive: !!options.isLive,
    isSpeaking: !!options.isSpeaking,
    isMuted: !!options.isMuted,
  };
};

export const buildSharedRoomLabels = (options: {
  isLiveRoom: boolean;
  isPlayerWatchPartyLiveFlow?: boolean;
  branding?: SharedRoomBranding | null;
}): SharedRoomLabels => {
  const branding = {
    ...DEFAULT_SHARED_ROOM_BRANDING,
    ...(options.branding ?? {}),
  };
  const liveRoomTitle = String(branding.liveRoomTitle || LIVE_ROOM_TITLE).trim() || LIVE_ROOM_TITLE;
  const partyRoomTitle = String(branding.partyRoomTitle || PARTY_ROOM_TITLE).trim() || PARTY_ROOM_TITLE;

  return {
    watchPartyLabel: String(branding.watchPartyLabel || LIVE_WATCH_PARTY_LABEL).trim() || LIVE_WATCH_PARTY_LABEL,
    waitingRoomTitle: options.isPlayerWatchPartyLiveFlow
      ? String(branding.partyWaitingRoomTitle || PARTY_WAITING_ROOM_TITLE).trim() || PARTY_WAITING_ROOM_TITLE
      : String(branding.liveWaitingRoomTitle || LIVE_WAITING_ROOM_TITLE).trim() || LIVE_WAITING_ROOM_TITLE,
    roomStatusLabel: options.isLiveRoom ? liveRoomTitle : partyRoomTitle,
    roomCardLabel: options.isLiveRoom
      ? String(liveRoomTitle || LIVE_ROOM_CARD_LABEL).toUpperCase()
      : String(partyRoomTitle || PARTY_ROOM_CARD_LABEL).toUpperCase(),
    roomCardTitle: options.isLiveRoom ? liveRoomTitle : partyRoomTitle,
  };
};

export const getInitials = (displayName: string) => {
  const clean = String(displayName || "").trim();
  if (!clean) return "?";
  const words = clean.split(/\s+/).filter(Boolean);
  if (words.length >= 2) return `${words[0][0] ?? ""}${words[1][0] ?? ""}`.toUpperCase();
  return clean.slice(0, 2).toUpperCase();
};

export const deriveParticipantRole = (role: "host" | "viewer", isSpeaking: boolean) =>
  role === "host" ? "host" : isSpeaking ? "speaker" : "listener";

export const createDefaultParticipantState = (options: {
  role: "host" | "viewer";
  isSpeaking?: boolean;
  isMuted?: boolean;
}): SharedParticipantLocalState => ({
  isMuted: !!options.isMuted,
  role: deriveParticipantRole(options.role, !!options.isSpeaking),
  isRemoved: false,
});

export const mergeMissingParticipantStates = <T>(
  prev: Record<string, SharedParticipantLocalState>,
  participants: T[],
  getId: (participant: T) => string,
  createState: (participant: T) => SharedParticipantLocalState,
) => {
  let changed = false;
  const next = { ...prev };
  participants.forEach((participant) => {
    const id = getId(participant);
    if (!id || next[id]) return;
    next[id] = createState(participant);
    changed = true;
  });
  return changed ? next : prev;
};

export const buildOrderedParticipantsWithSelf = <T extends SharedParticipantIdentity>(options: {
  participants: T[];
  currentUserId: string;
  selfFallbackParticipant: T;
}) => {
  const seen = new Set<string>();
  const unique = [...options.participants].filter((participant) => {
    if (!participant.userId || seen.has(participant.userId)) return false;
    seen.add(participant.userId);
    return true;
  });

  const ordered = unique.sort((a, b) => {
    const aMe = a.userId === options.currentUserId ? 1 : 0;
    const bMe = b.userId === options.currentUserId ? 1 : 0;
    if (aMe !== bMe) return bMe - aMe;
    const aHost = a.role === "host" ? 1 : 0;
    const bHost = b.role === "host" ? 1 : 0;
    return bHost - aHost;
  });

  const hasResolvedSelf = !!options.currentUserId && ordered.some((participant) => participant.userId === options.currentUserId);
  const withSelf = hasResolvedSelf
    ? [...ordered]
    : [options.selfFallbackParticipant, ...ordered];

  const selfIndex = withSelf.findIndex((participant) => participant.userId === options.currentUserId);
  if (selfIndex > 0) {
    const [selfParticipant] = withSelf.splice(selfIndex, 1);
    return [selfParticipant, ...withSelf];
  }

  return withSelf;
};

export const computeDominantSpeakerId = <T>(
  participants: T[],
  getId: (participant: T) => string,
  isSpeaking: (participant: T) => boolean,
) => {
  for (const participant of participants) {
    if (isSpeaking(participant)) {
      return getId(participant);
    }
  }
  return "";
};

export const computeBottomStripParticipants = <T>(
  participants: T[],
  getId: (participant: T) => string,
  currentUserId: string,
) => {
  const hasCurrentInMainStrip = !!currentUserId && participants.some((participant) => getId(participant) === currentUserId);
  const seen = new Set<string>();
  return participants.filter((participant) => {
    const id = getId(participant);
    if (!id || seen.has(id)) return false;
    if (hasCurrentInMainStrip && id === currentUserId) return false;
    seen.add(id);
    return true;
  });
};

export const prioritizeParticipantStripOrder = <T extends { userId: string; isSpeaking?: boolean }>(
  participants: T[],
  featuredParticipantById: Record<string, boolean>,
  isSpeakingById: Record<string, boolean>,
) => {
  const prioritizeSpeaking = (list: T[]) => list
    .map((participant, index) => ({
      participant,
      index,
      isSpeakingNow: !!(isSpeakingById[participant.userId] || participant.isSpeaking),
    }))
    .sort((a, b) => {
      if (a.isSpeakingNow !== b.isSpeakingNow) return Number(b.isSpeakingNow) - Number(a.isSpeakingNow);
      return a.index - b.index;
    })
    .map((item) => item.participant);

  return [
    ...prioritizeSpeaking(participants.filter((participant) => !!featuredParticipantById[participant.userId])),
    ...prioritizeSpeaking(participants.filter((participant) => !featuredParticipantById[participant.userId])),
  ];
};

export const resolveSelectedParticipantContext = <T extends {
  userId: string;
  role: "host" | "viewer";
  isLive: boolean;
  isSpeaking: boolean;
  isMuted: boolean;
}>(options: {
  selectedParticipant: T | null;
  participantStateById: Record<string, SharedParticipantLocalState>;
  currentUserId: string;
}) => {
  const selectedParticipantUserId = String(options.selectedParticipant?.userId ?? "").trim();
  const selectedParticipantState = options.selectedParticipant
    ? (options.participantStateById[selectedParticipantUserId]
      ?? createDefaultParticipantState({
        role: options.selectedParticipant.role,
        isSpeaking: options.selectedParticipant.isSpeaking,
        isMuted: options.selectedParticipant.isMuted,
      }))
    : null;
  const isSelectedParticipantSelf = !!selectedParticipantUserId && selectedParticipantUserId === options.currentUserId;

  return {
    selectedParticipantUserId,
    selectedParticipantState,
    isSelectedParticipantSelf,
    canShowProfileAction: !!selectedParticipantUserId && !isSelectedParticipantSelf,
  };
};

export const getParticipantRoleLabel = (state: SharedParticipantLocalState) => {
  if (state.isRemoved) return "Removed";
  if (state.role === "host") return "Host";
  if (state.role === "speaker") return "Seated";
  return "Audience";
};

export const getParticipantSeatLayer = (options: {
  state: SharedParticipantLocalState;
  isFeatured?: boolean;
}) => {
  if (options.state.role === "host") return "host" as SharedParticipantSeatLayer;
  if (options.isFeatured) return "featured" as SharedParticipantSeatLayer;
  if (options.state.role === "speaker") return "seated" as SharedParticipantSeatLayer;
  return "audience" as SharedParticipantSeatLayer;
};

export const canRequestSeat = (state: SharedParticipantLocalState) =>
  !state.isRemoved && state.role !== "host" && state.role !== "speaker";

export const getParticipantLayerLabel = (options: {
  state: SharedParticipantLocalState;
  isFeatured?: boolean;
  isRequesting?: boolean;
}) => {
  if (options.state.isRemoved) return "Removed";
  if (options.isRequesting && canRequestSeat(options.state)) return "Seat request pending";

  const layer = getParticipantSeatLayer({
    state: options.state,
    isFeatured: options.isFeatured,
  });

  switch (layer) {
    case "host":
      return "Host";
    case "featured":
      return "Featured";
    case "seated":
      return "Seated";
    case "audience":
    default:
      return "Audience";
  }
};

export const getLiveParticipantStatusText = (options: {
  isSpeaking: boolean;
  isRequesting: boolean;
  isMuted: boolean;
  role: "host" | "co-host" | "viewer";
  canSpeak?: boolean;
  isFeatured?: boolean;
}) => {
  if (options.isSpeaking) return "🎤 Speaking";
  if (options.isRequesting) return "✋ Requesting seat";
  if (options.role === "host") return "👑 Host";
  if (options.role === "co-host") return "⭐ Co-host";
  if (options.isFeatured) return "✨ Featured";
  if (options.canSpeak) return options.isMuted ? "🔇 Seated muted" : "🎙️ Seated";
  if (options.isMuted) return "🔇 Audience muted";
  return "👥 Audience";
};

type PresenceParticipantLike = {
  userId: string;
  role: "host" | "viewer";
  displayName: string;
  avatarUrl?: string;
  cameraPreviewUrl?: string;
};

export const shouldShowHostControls = (isHost: boolean, isLiveRoom: boolean) => isHost && !isLiveRoom;

export const buildPartyRoomParticipantEntries = (options: {
  participants: PresenceParticipantLike[];
  currentUserId: string;
  currentUsername?: string;
  participantReactionById?: Record<string, { emoji: string }>;
  maxVisible?: number;
}) => {
  const seen = new Set<string>();
  const rows = options.participants.filter((participant) => {
    if (!participant.userId || seen.has(participant.userId)) return false;
    seen.add(participant.userId);
    return true;
  });

  const maxVisible = options.maxVisible ?? 7;
  const visible = rows.slice(0, maxVisible).map<WaitingRoomParticipantEntry>((participant) => {
    const isSelf = !!options.currentUserId && participant.userId === options.currentUserId;
    return {
      id: participant.userId,
      displayName: isSelf ? (options.currentUsername || "You") : participant.displayName,
      avatarUrl: participant.avatarUrl,
      cameraPreviewUrl: participant.cameraPreviewUrl,
      isHost: participant.role === "host",
      isSelf,
      isActive: isSelf,
      statusText: participant.role === "host" ? "host" : "in room",
      reactionEmoji: options.participantReactionById?.[participant.userId]?.emoji,
    };
  });

  return {
    visible,
    overflowCount: Math.max(0, rows.length - maxVisible),
    totalCount: rows.length,
  };
};

export const getParticipantMediaUri = (options: {
  isCurrentUser: boolean;
  myCameraPreviewUrl?: string;
  cameraPreviewUrl?: string;
  avatarUrl?: string;
}) => (options.isCurrentUser ? options.myCameraPreviewUrl || "" : "") || options.cameraPreviewUrl || options.avatarUrl || "";

export const normalizeSharedRoomMode = (value: unknown, fallback: SharedRoomMode = "live"): SharedRoomMode => {
  const normalized = String(value ?? "").trim().toLowerCase();
  if (normalized === "hybrid" || normalized === "watch-party-live" || normalized === "watch_party_live") {
    return "hybrid";
  }
  if (normalized === "live" || normalized === "live-first" || normalized === "live_first") {
    return "live";
  }
  return fallback;
};
