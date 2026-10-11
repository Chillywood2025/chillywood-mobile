import { AppState } from "react-native";
import { getCurrentAccountSessionAuthoritySnapshot, sameAccountSessionAuthority, type AccountSessionAuthorityBinding } from "./accountSessionAuthority";
import type { WatchPartyState } from "./watchParty";

type Intent = { authority: AccountSessionAuthorityBinding; room: WatchPartyState; expiresAt: number };
const intents = new Map<string, Intent>();
let sequence = 0;
let subscription: ReturnType<typeof AppState.addEventListener> | null = null;
const clearSubscription = () => { if (!intents.size) { subscription?.remove(); subscription = null; } };

// A route parameter alone cannot manufacture a Start action. These short-lived,
// single-use intents exist only in this app process after the waiting button.
export function rememberPartyRoomStartIntent(room: WatchPartyState, authority: AccountSessionAuthorityBinding | null): string | null {
  if (!authority || authority.restoreOnly || authority.state !== "ACTIVE" || AppState.currentState !== "active"
    || !sameAccountSessionAuthority(authority, getCurrentAccountSessionAuthoritySnapshot())
    || room.hostUserId !== authority.userId || room.roomType !== "title" || !room.isActive
    || room.discoveryVisibility === "private" || !room.sourceId
    || (room.sourceType !== "platform_title" && room.sourceType !== "creator_video")) return null;
  for (const [key, value] of intents) if (value.expiresAt <= Date.now()) intents.delete(key);
  const key = `party-start-${Date.now()}-${++sequence}`;
  intents.set(key, { authority, room: { ...room }, expiresAt: Date.now() + 90_000 });
  subscription ??= AppState.addEventListener("change", state => {
    if (state !== "active") { intents.clear(); clearSubscription(); }
  });
  return key;
}

export function takePartyRoomStartIntent(key: string, room: WatchPartyState, authority: AccountSessionAuthorityBinding): boolean {
  const intent = intents.get(key);
  intents.delete(key); clearSubscription();
  return !!intent && intent.expiresAt > Date.now() && AppState.currentState === "active"
    && sameAccountSessionAuthority(intent.authority, authority)
    && sameAccountSessionAuthority(authority, getCurrentAccountSessionAuthoritySnapshot())
    && intent.room.partyId === room.partyId && intent.room.hostUserId === room.hostUserId
    && intent.room.sourceType === room.sourceType && intent.room.sourceId === room.sourceId
    && intent.room.discoveryVisibility === room.discoveryVisibility && intent.room.discoveryTitle === room.discoveryTitle;
}
