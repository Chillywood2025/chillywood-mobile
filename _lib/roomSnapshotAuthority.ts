import type { WatchPartyRoomSnapshot } from './watchParty';

/** One mounted room/account lifetime. A missing initial membership may precede
 * admission; once join is required, only a current canonical membership keeps
 * room metadata and media authority alive. No previous roster is a fallback. */
export function createRoomSnapshotAuthority(options: {
  partyId: string;
  userId: string;
  retry?: number;
  current: () => boolean;
  unavailable: () => void;
  read: () => Promise<WatchPartyRoomSnapshot | null>;
}) {
  let retired = false;
  let joined = false;
  let established = false;
  let roomBinding: string | null = null;
  let sequence = options.retry ?? 0;
  let pending: Promise<WatchPartyRoomSnapshot | null> | null = null;
  const cleanups = new Set<() => void>();
  const current = () => !retired && options.current();
  const retire = () => {
    if (retired) return;
    retired = true;
    sequence += 1;
    for (const cleanup of cleanups) {
      try { cleanup(); } catch { /* Continue retiring the other owned resources. */ }
    }
    cleanups.clear();
    options.unavailable();
  };
  const read = async (): Promise<WatchPartyRoomSnapshot | null> => {
    if (!current()) return null;
    const request = ++sequence;
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      const snapshot = await Promise.race([
        options.read().catch(() => null),
        new Promise<null>(resolve => { timer = setTimeout(() => resolve(null), 12_000); }),
      ]);
      if (!current() || request !== sequence) return null;
      const member = snapshot?.memberships.find(row => row.userId === options.userId);
      const binding = snapshot ? JSON.stringify([
        snapshot.room.partyId, snapshot.room.roomGeneration, snapshot.room.roomType,
        snapshot.room.sourceType, snapshot.room.sourceId, snapshot.room.titleId, snapshot.room.hostUserId,
      ]) : null;
      const memberCurrent = !!member && member.partyId === options.partyId && !member.leftAt
        && (member.membershipState === 'active' || member.membershipState === 'reconnecting');
      if (!snapshot?.room.isActive || snapshot.room.partyId !== options.partyId
        || (roomBinding !== null && roomBinding !== binding) || (joined && !memberCurrent)) {
        retire();
        return null;
      }
      roomBinding = binding;
      return snapshot;
    } catch {
      if (current() && request === sequence) retire();
      return null;
    } finally { clearTimeout(timer); }
  };
  return {
    current,
    retire,
    // Effect replay may reuse an owner, but never its read or admission proof.
    activate() {
      if (retired && !established && options.current()) {
        retired = false;
        joined = false;
        pending = null;
        roomBinding = null;
        sequence += 1;
      }
    },
    own(cleanup: () => void) {
      established = true;
      if (!current()) cleanup(); else cleanups.add(cleanup);
    },
    requireMembership() {
      established = true;
      joined = true;
      // A pre-admission read cannot certify the result of the join attempt.
      sequence += 1;
      pending = null;
    },
    read(): Promise<WatchPartyRoomSnapshot | null> {
      if (!current()) return Promise.resolve(null);
      if (!pending) {
        const owned = read().finally(() => { if (pending === owned) pending = null; });
        pending = owned;
      }
      return pending;
    },
  };
}
