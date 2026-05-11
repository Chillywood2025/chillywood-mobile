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

export const buildLandingWaitingRoomEntries = (options: {
  isSelfHost: boolean;
  showHostChip: boolean;
}) => {
  const entries: WaitingRoomParticipantEntry[] = [
    {
      id: "you",
      displayName: options.isSelfHost ? "You · Host" : "You",
      avatarLabelOverride: "Y",
      isSelf: true,
      isActive: true,
    },
  ];

  if (options.showHostChip) {
    entries.push({
      id: "host",
      displayName: "Host",
      avatarLabelOverride: "👑",
      isHost: true,
    });
  }

  entries.push({
    id: "guests",
    displayName: "Guests",
    avatarLabelOverride: "+",
  });

  return entries;
};
