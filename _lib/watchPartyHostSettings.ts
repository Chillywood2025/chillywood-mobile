import { getCurrentAccountSessionAuthoritySnapshot, sameAccountSessionAuthority, type AccountSessionAuthorityBinding } from "./accountSessionAuthority";
import { captureAccountBoundSupabaseMutationSubject, invokeAccountBoundSupabaseMutationRpc } from "./accountBoundSupabaseMutation";
import { getOwnedPartyRoomForPreparation, getPartyRoom, type WatchPartyDiscoveryVisibility, type WatchPartyState } from "./watchParty";

export type WatchPartyHostSettings = {
  joinPolicy: WatchPartyState["joinPolicy"];
  discoveryVisibility: WatchPartyDiscoveryVisibility;
  discoveryPaused?: boolean;
  discoveryTitle: string | null;
};
export type WatchPartyHostSettingsResult = {
  room: WatchPartyState;
  authority: AccountSessionAuthorityBinding;
  ownerDiscoveryConsent: boolean;
  published: boolean;
  projectionId: string | null;
};
type Acknowledgement = {
  partyId: string; roomType: string; roomGeneration: string; settingsRevision: number;
  sourceType: string | null; sourceId: string | null; joinPolicy: string;
  visibility: string; discoveryPaused: boolean; title: string | null; startedAt: string | null;
  published: boolean; projectionId: string | null;
  ownerDiscoveryConsent?: boolean;
};

// Keep ownership until the actual transport settles, including after a sheet
// closes, backgrounds or unmounts. A new selection must never piggyback on an
// older selection's promise or escape through a new component instance.
const pending = new Set<string>();
const pendingListeners = new Set<() => void>();
export function subscribeToWatchPartyHostSettingsPending(listener: () => void) {
  pendingListeners.add(listener); return () => { pendingListeners.delete(listener); };
}
const notifyPending = () => { for (const listener of pendingListeners) listener(); };
class HostSettingsError extends Error {
  constructor(readonly publicMessage: string) { super("Room host settings unavailable"); }
}
export const getWatchPartyHostSettingsErrorMessage = (error: unknown) => error instanceof HostSettingsError ? error.publicMessage : null;
const operationKey = (room: WatchPartyState) => JSON.stringify([room.partyId, room.hostUserId, room.roomGeneration]);
export const isWatchPartyHostSettingsPending = (room: WatchPartyState) => pending.has(operationKey(room));

export const hasVersionedWatchPartyHostSettings = (room: WatchPartyState | null): room is WatchPartyState =>
  !!room?.roomGeneration && Number.isSafeInteger(room.hostSettingsRevision) && Number(room.hostSettingsRevision) >= 0
    && typeof room.discoveryPaused === "boolean";

export const isWatchPartyDiscoveryEnabled = (room: Pick<WatchPartyState, "discoveryVisibility" | "discoveryPaused">) =>
  room.discoveryVisibility !== "private" && room.discoveryPaused === false;

export function sameWatchPartyHostSettingsRoom(a: WatchPartyState | null, b: WatchPartyState | null) {
  return !!a && !!b && a.partyId === b.partyId && a.hostUserId === b.hostUserId
    && a.roomType === b.roomType && a.roomGeneration === b.roomGeneration
    && a.sourceType === b.sourceType && a.sourceId === b.sourceId && a.titleId === b.titleId;
}

export function applyWatchPartyHostSettingsReadback(current: WatchPartyState | null, readback: WatchPartyState) {
  if (!current?.isActive || !readback.isActive || !sameWatchPartyHostSettingsRoom(current, readback)
    || Number(current.hostSettingsRevision) > Number(readback.hostSettingsRevision)) return current;
  // Do not replace a newer playback, membership or heartbeat snapshot.
  return { ...current, joinPolicy: readback.joinPolicy, discoveryVisibility: readback.discoveryVisibility,
    discoveryTitle: readback.discoveryTitle, discoveryPaused: readback.discoveryPaused, discoveryStartedAt: readback.discoveryStartedAt,
    hostSettingsRevision: readback.hostSettingsRevision };
}

export async function readWatchPartyHostSettings(expected: WatchPartyState,
  authority: AccountSessionAuthorityBinding, isCurrent: () => boolean, preparation = false): Promise<WatchPartyState | null> {
  const current = () => isCurrent() && authority.state === "ACTIVE" && !authority.restoreOnly
    && sameAccountSessionAuthority(authority, getCurrentAccountSessionAuthoritySnapshot());
  if (!current() || !expected.isActive || expected.hostUserId !== authority.userId
    || !hasVersionedWatchPartyHostSettings(expected)) return null;
  const fresh = preparation && expected.roomType === "title"
    ? await getOwnedPartyRoomForPreparation(expected, authority) : await getPartyRoom(expected.partyId);
  return current() && fresh?.isActive && hasVersionedWatchPartyHostSettings(fresh)
    && sameWatchPartyHostSettingsRoom(expected, fresh) ? fresh : null;
}

export async function setWatchPartyHostSettings(expected: WatchPartyState, settings: WatchPartyHostSettings,
  authority: AccountSessionAuthorityBinding, isCurrent: () => boolean = () => true,
  options: { publish?: boolean; preparation?: boolean; allowOwnerDiscovery?: boolean } = {}): Promise<WatchPartyHostSettingsResult | null> {
  // Compatibility callers use private for Off. Preserve the previously chosen
  // audience rather than weakening Circle entry as a side effect of hiding.
  if (settings.discoveryVisibility === "private" && expected.discoveryVisibility !== "private") {
    settings = { ...settings, discoveryVisibility: expected.discoveryVisibility, discoveryPaused: true };
  }
  if (!hasVersionedWatchPartyHostSettings(expected) || !["open", "locked"].includes(settings.joinPolicy)
    || !["public", "circle", "private"].includes(settings.discoveryVisibility)) return null;
  const key = operationKey(expected);
  if (pending.has(key)) return null;
  pending.add(key); notifyPending();
  try {
    const fresh = await readWatchPartyHostSettings(expected, authority, isCurrent, options.preparation);
    if (!fresh || fresh.hostSettingsRevision !== expected.hostSettingsRevision
      || fresh.joinPolicy !== expected.joinPolicy || fresh.discoveryVisibility !== expected.discoveryVisibility
      || fresh.discoveryTitle !== expected.discoveryTitle || fresh.discoveryPaused !== expected.discoveryPaused) return null;
    const subject = await captureAccountBoundSupabaseMutationSubject(expected.hostUserId);
    if (!isCurrent() || !sameAccountSessionAuthority(authority, subject.authority)) return null;
    const title = String(settings.discoveryTitle ?? "").trim() || null;
    const paused = settings.discoveryPaused ?? expected.discoveryPaused;
    if (typeof paused !== "boolean") return null;
    const allowOwnerDiscovery = options.publish !== false && !paused && settings.discoveryVisibility !== "private" && options.allowOwnerDiscovery === true;
    const expectedRevision = Number(expected.hostSettingsRevision) + (expected.joinPolicy !== settings.joinPolicy
      || expected.discoveryVisibility !== settings.discoveryVisibility || expected.discoveryTitle !== title
      || expected.discoveryPaused !== paused ? 1 : 0);
    const { data, error } = await invokeAccountBoundSupabaseMutationRpc<Acknowledgement>(subject,
      "set_watch_party_room_host_settings", {
        p_party_id: expected.partyId, p_expected_room_generation: expected.roomGeneration,
        p_expected_settings_revision: expected.hostSettingsRevision, p_session_generation: authority.sessionGeneration,
        p_join_policy: settings.joinPolicy, p_discovery_visibility: settings.discoveryVisibility, p_discovery_title: title,
        p_discovery_paused: paused,
        p_expected_source_type: expected.sourceType, p_expected_source_id: expected.sourceId,
        p_publish: options.publish !== false,
        p_allow_owner_discovery: allowOwnerDiscovery,
      }, { retainTransportSettlement: true });
    if (isCurrent() && error?.message?.includes("room_owner_circle_unavailable")) {
      throw new HostSettingsError("No current eligible Circle members can see this owner room. Choose Public or keep discovery off.");
    }
    if (isCurrent() && error?.message?.includes("room_owner_discovery_title_required")) {
      throw new HostSettingsError("Add a room title before enabling owner discovery. Your private profile name is not used.");
    }
    if (!isCurrent() || !sameAccountSessionAuthority(authority, getCurrentAccountSessionAuthoritySnapshot())
      || error || !data || data.partyId !== expected.partyId || data.roomType !== expected.roomType
      || data.roomGeneration !== expected.roomGeneration || data.sourceType !== expected.sourceType || data.sourceId !== expected.sourceId
      || !Number.isSafeInteger(data.settingsRevision) || data.settingsRevision !== expectedRevision
      || data.joinPolicy !== settings.joinPolicy || data.visibility !== settings.discoveryVisibility || data.title !== title
      || data.discoveryPaused !== paused
      || typeof data.published !== "boolean" || (data.startedAt !== null && !Number.isFinite(Date.parse(data.startedAt)))
      || (allowOwnerDiscovery && data.ownerDiscoveryConsent !== true)
      || (paused && data.ownerDiscoveryConsent === true)
      || (data.published && (settings.discoveryVisibility === "private" || paused || !data.startedAt || !data.projectionId))) return null;
    return { room: { ...fresh, joinPolicy: settings.joinPolicy, discoveryVisibility: settings.discoveryVisibility,
      discoveryTitle: title, discoveryPaused: paused, discoveryStartedAt: data.startedAt, hostSettingsRevision: data.settingsRevision },
      published: data.published, projectionId: data.projectionId, authority, ownerDiscoveryConsent: data.ownerDiscoveryConsent === true };
  } finally { pending.delete(key); notifyPending(); }
}
