export type SharedParticipantRole = "host" | "speaker" | "listener";

export type SharedParticipantLocalState = {
  isMuted: boolean;
  role: SharedParticipantRole;
  isRemoved: boolean;
};

const TECHNICAL_NAME_PATTERN = /^(user[·\-\s]|viewer[·\-\s]|anon[\-\s])/i;
const UUID_LIKE_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

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

export const getParticipantRoleLabel = (state: SharedParticipantLocalState) => {
  if (state.isRemoved) return "Removed";
  if (state.role === "host") return "Host";
  if (state.role === "speaker") return "Speaker";
  return "Listener";
};

export const getLiveParticipantStatusText = (options: {
  isSpeaking: boolean;
  isRequesting: boolean;
  isMuted: boolean;
  role: "host" | "co-host" | "viewer";
}) => {
  if (options.isSpeaking) return "🎤 Speaking";
  if (options.isRequesting) return "✋ Requesting";
  if (options.isMuted) return "🔇 Muted";
  if (options.role === "host") return "👑 Host";
  if (options.role === "co-host") return "⭐ Co-host";
  return "👤 Member";
};

export const getParticipantMediaUri = (options: {
  isCurrentUser: boolean;
  myCameraPreviewUrl?: string;
  cameraPreviewUrl?: string;
  avatarUrl?: string;
}) => (options.isCurrentUser ? options.myCameraPreviewUrl || "" : "") || options.cameraPreviewUrl || options.avatarUrl || "";
