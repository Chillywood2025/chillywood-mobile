import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AppState } from "react-native";
import { getCurrentAccountSessionAuthoritySnapshot, sameAccountSessionAuthority, subscribeToAccountSessionAuthority } from "./accountSessionAuthority";
import { useSession } from "./session";
import { publishPartyRoomDiscovery, type WatchPartyRoomMembership, type WatchPartyState } from "./watchParty";
import { takePartyRoomStartIntent } from "./partyRoomStartIntent";
import { sameWatchPartyHostSettingsRoom, type WatchPartyHostSettingsResult } from "./watchPartyHostSettings";

type State = { status: "idle" | "pending" | "published" | "failed"; message: string };
const idle: State = { status: "idle", message: "Party listing has not been confirmed." };

export function usePartyRoomDiscoveryPublication({ room, membership, active, startIntent, confirmedHostSettings }: {
  room: WatchPartyState | null; membership: WatchPartyRoomMembership | null; active: boolean; startIntent: string;
  confirmedHostSettings?: WatchPartyHostSettingsResult | null;
}) {
  const { authority, authorityStatus } = useSession();
  const key = JSON.stringify([authority?.userId, authority?.accountId, authority?.sessionGeneration,
    authorityStatus, authority?.state, authority?.restoreOnly, room?.partyId, room?.hostUserId, room?.sourceType, room?.sourceId,
    room?.discoveryVisibility, room?.discoveryPaused, room?.discoveryTitle, room?.roomGeneration, room?.hostSettingsRevision, startIntent]);
  const owner = useMemo(() => ({ key, generation: 0, retired: false, claimed: false, attempted: false, running: false,
    // Consent-only owner publication may acknowledge the same settings revision.
    // It still replaces an earlier failed Start/publication lifetime.
    receipt: confirmedHostSettings, authority: null as typeof authority, status: "idle" as State["status"] }), [key, confirmedHostSettings]);
  owner.authority = authority;
  const latest = useRef({ owner, room, membership, active });
  latest.current = { owner, room, membership, active };
  const [saved, setSaved] = useState<{ owner: typeof owner; state: State } | null>(null);
  const confirmed = !!confirmedHostSettings && sameAccountSessionAuthority(confirmedHostSettings.authority, authority)
    && sameWatchPartyHostSettingsRoom(confirmedHostSettings.room, room)
    && confirmedHostSettings.room.hostSettingsRevision === room?.hostSettingsRevision
    && confirmedHostSettings.room.discoveryVisibility === room?.discoveryVisibility
    && confirmedHostSettings.room.discoveryPaused === room?.discoveryPaused
    && confirmedHostSettings.room.discoveryTitle === room?.discoveryTitle;
  const current = useCallback(() => {
    const now = latest.current, member = now.membership;
    // The server owns join authority; allow a small device/server clock skew
    // here so a freshly joined host is not rejected as being in the future.
    const membershipAge = member ? Date.now() - Date.parse(member.lastSeenAt) : NaN;
    return now.owner === owner && !owner.retired && now.active && AppState.currentState === "active"
      && !!authority && !authority.restoreOnly && authorityStatus === "active"
      && sameAccountSessionAuthority(authority, getCurrentAccountSessionAuthoritySnapshot())
      && !!now.room?.isActive && now.room.roomType === "title" && now.room.hostUserId === authority.userId
      && now.room.discoveryVisibility !== "private" && now.room.discoveryPaused === false && !!member && member.partyId === now.room.partyId
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
      const result = await publishPartyRoomDiscovery(expected, current).catch(() => null);
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
    if (confirmed) {
      owner.attempted = true; owner.claimed = true;
      if (confirmedHostSettings?.published) save({ status: "published", message: room.discoveryVisibility === "circle" ? "Circle Party listing confirmed." : "Public Party listing confirmed." });
      else save({ status: "failed", message: "Settings saved. Party listing not confirmed; retry while this room is active." });
      return;
    }
    owner.attempted = true;
    owner.claimed = takePartyRoomStartIntent(startIntent, room, authority);
    if (owner.claimed) void begin();
    else if (startIntent) save({ status: "failed", message: "Start expired or was interrupted. Return to the waiting room and tap Start Party Room again." });
  }, [active, authority, begin, confirmed, confirmedHostSettings, current, membership, owner, room, save, startIntent]);
  const state = saved?.owner === owner && current() ? saved.state : idle;
  return { ...state,
    message: room && room.discoveryVisibility !== "private" && typeof room.discoveryPaused !== "boolean"
      ? "Party listing status could not be verified. Reload this room before changing discovery."
      : room?.discoveryVisibility === "private" || room?.discoveryPaused !== false
      ? `Discovery off · not listed. ${room?.discoveryVisibility === "circle" ? "Circle-only entry is unchanged." : "Room-entry rules still apply."}` : state.message,
    canRetry: state.status === "failed" && owner.claimed && !owner.running && current(),
    retry: () => { if (owner.status === "failed") return begin(); },
  };
}
