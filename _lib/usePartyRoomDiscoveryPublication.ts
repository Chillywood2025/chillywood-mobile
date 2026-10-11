import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AppState } from "react-native";
import { getCurrentAccountSessionAuthoritySnapshot, sameAccountSessionAuthority, subscribeToAccountSessionAuthority } from "./accountSessionAuthority";
import { useSession } from "./session";
import { publishPartyRoomDiscovery, type WatchPartyRoomMembership, type WatchPartyState } from "./watchParty";
import { takePartyRoomStartIntent } from "./partyRoomStartIntent";

type State = { status: "idle" | "pending" | "published" | "failed"; message: string };
const idle: State = { status: "idle", message: "Party listing has not been confirmed." };

export function usePartyRoomDiscoveryPublication({ room, membership, active, startIntent }: {
  room: WatchPartyState | null; membership: WatchPartyRoomMembership | null; active: boolean; startIntent: string;
}) {
  const { authority, authorityStatus } = useSession();
  const key = JSON.stringify([authority?.userId, authority?.accountId, authority?.sessionGeneration,
    authorityStatus, authority?.state, authority?.restoreOnly, room?.partyId, room?.hostUserId, room?.sourceType, room?.sourceId,
    room?.discoveryVisibility, room?.discoveryTitle, startIntent]);
  const owner = useMemo(() => ({ key, generation: 0, retired: false, claimed: false, attempted: false, running: false,
    authority: null as typeof authority, status: "idle" as State["status"] }), [key]);
  owner.authority = authority;
  const latest = useRef({ owner, room, membership, active });
  latest.current = { owner, room, membership, active };
  const [saved, setSaved] = useState<{ owner: typeof owner; state: State } | null>(null);
  const current = useCallback(() => {
    const now = latest.current, member = now.membership;
    // The server owns join authority; allow a small device/server clock skew
    // here so a freshly joined host is not rejected as being in the future.
    const membershipAge = member ? Date.now() - Date.parse(member.lastSeenAt) : NaN;
    return now.owner === owner && !owner.retired && now.active && AppState.currentState === "active"
      && !!authority && !authority.restoreOnly && authorityStatus === "active"
      && sameAccountSessionAuthority(authority, getCurrentAccountSessionAuthoritySnapshot())
      && !!now.room?.isActive && now.room.roomType === "title" && now.room.hostUserId === authority.userId
      && now.room.discoveryVisibility !== "private" && !!member && member.partyId === now.room.partyId
      && member.userId === authority.userId && member.role === "host" && member.membershipState === "active"
      && !member.leftAt && membershipAge >= -5_000 && membershipAge <= 45_000;
  }, [authority, authorityStatus, owner]);
  const save = useCallback((state: State) => {
    if (latest.current.owner === owner && !owner.retired) { owner.status = state.status; setSaved({ owner, state }); }
  }, [owner]);
  const begin = useCallback(async () => {
    if (!owner.claimed || owner.running || !current()) return;
    const expected = latest.current.room!;
    const generation = owner.generation;
    owner.running = true;
    save({ status: "pending", message: "Confirming your Party listing…" });
    try {
      const result = await publishPartyRoomDiscovery(expected).catch(() => null);
      if (!current() || generation !== owner.generation) return;
      save(result?.published && result.visibility === expected.discoveryVisibility
        ? { status: "published", message: result.visibility === "circle" ? "Circle Party listing confirmed." : "Public Party listing confirmed." }
        : { status: "failed", message: "Party listing not confirmed. Check your audience, content and access, then retry." });
    } finally {
      owner.running = false;
      if (generation !== owner.generation && latest.current.owner === owner && !owner.retired)
        save({ status: "failed", message: "Party listing interrupted. Retry while this room is open." });
    }
  }, [current, owner, save]);
  useEffect(() => {
    if (latest.current.owner === owner) owner.retired = false;
    const account = subscribeToAccountSessionAuthority(next => {
      if (!sameAccountSessionAuthority(owner.authority, next)) { owner.retired = true; owner.generation += 1; }
    });
    const app = AppState.addEventListener("change", state => {
      if (state !== "active") { owner.generation += 1; save({ status: "failed", message: "Party listing paused. Retry when you return." }); }
    });
    return () => { owner.retired = true; owner.generation += 1; account(); app.remove(); };
  }, [owner, save]);
  useEffect(() => {
    if (!active) owner.generation += 1;
    if (!current() || owner.attempted || !authority || !room) return;
    owner.attempted = true;
    owner.claimed = takePartyRoomStartIntent(startIntent, room, authority);
    if (owner.claimed) void begin();
    else if (startIntent) save({ status: "failed", message: "Start expired or was interrupted. Return to the waiting room and tap Start Party Room again." });
  }, [active, authority, begin, current, membership, owner, room, save, startIntent]);
  const state = saved?.owner === owner && current() ? saved.state : idle;
  return { ...state,
    message: room?.discoveryVisibility === "private" ? "Private Party · not listed in live feeds." : state.message,
    canRetry: state.status === "failed" && owner.claimed && !owner.running && current(),
    retry: () => { if (owner.status === "failed") return begin(); },
  };
}
