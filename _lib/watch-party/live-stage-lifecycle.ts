/** One owner per pending entry. Returning/backing out invalidates late responses. */
export function createLiveStageEntryOwner() {
  let generation = 0;
  let ownerKey = "";
  let active: number | null = null;
  return {
    bind(key: string) {
      if (key === ownerKey) return;
      ownerKey = key;
      generation += 1;
      active = null;
    },
    begin() {
      if (!ownerKey || active !== null) return null;
      active = ++generation;
      return active;
    },
    isCurrent(ticket: number) { return active === ticket && generation === ticket; },
    finish(ticket: number) { if (active === ticket) active = null; },
    invalidate() { generation += 1; active = null; },
  };
}

export function shouldRefreshLiveStageContract(options: {
  hasContract: boolean;
  isExpired: boolean;
  matchesAuthority: boolean;
}) {
  return !options.hasContract || options.isExpired || !options.matchesAuthority;
}

/** The native host hero renders the host, independently of card selection. */
export function resolveLiveStageHeroId(options: {
  currentUserId: string;
  isHost: boolean;
  useSelfHero: boolean;
  selectedParticipantId?: string;
  hostParticipantId?: string;
}) {
  if (options.isHost || options.useSelfHero) return options.currentUserId;
  return options.selectedParticipantId || options.hostParticipantId || options.currentUserId;
}

export function getLiveStageRefreshDelay(expiresInMillis: number | null, skewMillis: number) {
  if (expiresInMillis === null) return 0;
  return Math.max(0, Math.min(2_147_000_000, expiresInMillis - skewMillis));
}

/** A refresh must not replace an insert/delete delivered while its read was pending. */
export function canApplyLiveStageCommentSnapshot(startRevision: number, currentRevision: number) {
  return startRevision === currentRevision;
}

export function parseLiveStageReaction(payload: Record<string, unknown>, options: {
  partyId: string;
  currentUserId: string;
  reactionsEnabled: boolean;
  isActiveMember: (id: string) => boolean;
  now?: number;
}) {
  const userId = typeof payload.userId === "string" ? payload.userId.trim() : "";
  const emoji = typeof payload.emoji === "string" ? payload.emoji.trim() : "";
  const sentAt = Number(payload.sentAt);
  const now = options.now ?? Date.now();
  if (!options.reactionsEnabled || payload.partyId !== options.partyId || !userId
    || userId === options.currentUserId || !options.isActiveMember(userId)
    || !emoji || emoji.length > 32 || !Number.isFinite(sentAt)
    || Math.abs(now - sentAt) > 15_000) return null;
  return emoji;
}
