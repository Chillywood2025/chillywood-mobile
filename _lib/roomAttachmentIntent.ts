import type { WatchPartyRoomSnapshot } from './watchParty';

function admittedIdentity(snapshot: WatchPartyRoomSnapshot | null, userId: string): string | null {
  const room = snapshot?.room;
  const member = snapshot?.memberships.find(row => row.userId === userId);
  if (!room?.isActive || !room.partyId || !room.roomGeneration || !room.startedAt
    || !member || member.partyId !== room.partyId || !member.joinedAt || member.leftAt
    || !['active', 'reconnecting'].includes(member.membershipState)) return null;
  return JSON.stringify([room.partyId, room.roomGeneration, room.roomType, room.sourceType,
    room.sourceId, room.titleId, room.hostUserId, room.startedAt, room.contentAccessRule, member.joinedAt]);
}

/** Attachment selection is not room/media authority. A known native presentation
 * may outlive foreground resource retirement, but cannot apply a result until a
 * fresh foreground canonical read proves the same original admission identity.
 * In particular, a new foreground owner can never authorize a different source,
 * room generation or leave/rejoin lifetime for an old selection.
 */
export function createRoomAttachmentIntent(options: {
  snapshot: WatchPartyRoomSnapshot;
  userId: string;
  current: () => boolean;
  foreground: () => boolean;
  subscribeForeground: (listener: () => void) => () => void;
  read: () => Promise<WatchPartyRoomSnapshot | null>;
}) {
  const identity = admittedIdentity(options.snapshot, options.userId);
  if (!identity || !options.current() || !options.foreground()) return null;
  let retired = false;
  let nativeStarted = false;
  let verified = false;
  const retireListeners = new Set<() => void>();
  const identityCurrent = () => !retired && options.current();
  const current = () => identityCurrent() && (!verified || options.foreground());
  const retire = () => {
    retired = true;
    for (const listener of retireListeners) listener();
    retireListeners.clear();
  };
  const retainWhileHidden = () => current() && nativeStarted && !verified;
  const observe = (snapshot: WatchPartyRoomSnapshot | null) => {
    if (!identityCurrent() || admittedIdentity(snapshot, options.userId) !== identity) { retire(); return false; }
    return true;
  };
  return {
    current,
    identityCurrent,
    retire,
    retainWhileHidden,
    observe,
    async verifyBeforeMutation(): Promise<boolean> {
      if (!verified || !identityCurrent()) return false;
      let timeout: ReturnType<typeof setTimeout> | undefined;
      let stopWaiting: (() => void) | undefined;
      const retiredResult = new Promise<null>(resolve => {
        stopWaiting = () => resolve(null);
        retireListeners.add(stopWaiting);
        timeout = setTimeout(() => { retire(); resolve(null); }, 12_000);
      });
      try {
        // Explicit sends own their transport through background settlement.
        // They still re-prove this original logical admission, never adopt the
        // newest foreground owner or a different selected attachment.
        return observe(await Promise.race([options.read().catch(() => null), retiredResult]));
      } finally {
        clearTimeout(timeout);
        if (stopWaiting) retireListeners.delete(stopWaiting);
      }
    },
    beginNative() {
      if (!current() || !options.foreground()) return false;
      nativeStarted = true;
      return true;
    },
    async verifyBeforeApply(): Promise<boolean> {
      if (!current() || !nativeStarted) return false;
      let timeout: ReturnType<typeof setTimeout> | undefined;
      let stopWaiting: (() => void) | undefined;
      const retiredResult = new Promise<null>(resolve => {
        stopWaiting = () => resolve(null);
        retireListeners.add(stopWaiting);
        timeout = setTimeout(() => { retire(); resolve(null); }, 12_000);
      });
      try {
        while (current()) {
          if (!options.foreground()) {
            let unsubscribe = () => {};
            const foreground = new Promise<true>(resolve => {
              const check = () => { if (options.foreground()) resolve(true); };
              unsubscribe = options.subscribeForeground(check);
              check();
            });
            try { if (!(await Promise.race([foreground, retiredResult]))) return false; }
            finally { unsubscribe(); }
          }
          if (!current()) return false;
          const snapshot = await Promise.race([options.read().catch(() => null), retiredResult]);
          if (!current()) return false;
          // A second native/system interruption during the read requires a new
          // foreground read, never application of the background completion.
          if (!options.foreground()) continue;
          if (!observe(snapshot)) return false;
          verified = true;
          return true;
        }
        return false;
      } finally {
        clearTimeout(timeout);
        if (stopWaiting) retireListeners.delete(stopWaiting);
      }
    },
  };
}
