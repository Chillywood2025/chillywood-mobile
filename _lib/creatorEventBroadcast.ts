import { runCurrentAccountBoundSupabaseMutationRpc } from "./accountBoundSupabaseMutation";
import { getCurrentAccountSessionAuthoritySnapshot, sameAccountSessionAuthority } from "./accountSessionAuthority";
import { buildCreatorEventSummary, parseCreatorEventRow, type CreatorEventSummary } from "./liveEvents";
import { requireLiveFirstPremium } from "./premiumWatchPartyAccess";

export type CreatorEventBroadcastPreparation = {
  creatorEventId: string; hostUserId: string; roomId: string; broadcastSessionId: string;
  state: "awaiting_operator_setup" | "broadcast_ready" | "room_closed"; canStart: boolean;
};
export class CreatorEventBroadcastPreparationError extends Error {}
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function prepareCreatorEventBroadcast(event: Pick<CreatorEventSummary, "id" | "hostUserId">): Promise<CreatorEventBroadcastPreparation> {
  const authority = getCurrentAccountSessionAuthoritySnapshot();
  const current = () => !!authority && authority.userId === event.hostUserId
    && sameAccountSessionAuthority(authority, getCurrentAccountSessionAuthoritySnapshot());
  if (!uuid.test(event.id) || !current()) throw new CreatorEventBroadcastPreparationError("Sign in with this event’s creator account before preparing its broadcast.");
  const access = await requireLiveFirstPremium({ accessKey: event.id });
  if (!current()) throw new CreatorEventBroadcastPreparationError("Your session changed. Refresh this event before continuing.");
  if (!access.allowed) throw new CreatorEventBroadcastPreparationError(access.featureDisabled
    ? "Live broadcasting is currently paused. Your event schedule and ticket records are preserved."
    : "Current Premium host access must be verified before preparing the broadcast. A ticket does not include host access.");
  const { data, error } = await runCurrentAccountBoundSupabaseMutationRpc<Record<string, unknown>>(
    "prepare_creator_event_broadcast", { p_creator_event_id: event.id }, event.hostUserId);
  if (!current() || error || !data || data.creatorEventId !== event.id || data.hostUserId !== event.hostUserId
    || typeof data.roomId !== "string" || !/^EVENT[A-F0-9]{32}$/.test(data.roomId)
    || typeof data.broadcastSessionId !== "string" || !uuid.test(data.broadcastSessionId)
    || !["awaiting_operator_setup", "broadcast_ready", "room_closed"].includes(String(data.state))
    || data.canStart !== (data.state === "broadcast_ready")
    || data.providerStarted !== false || data.mediaUrlReturned !== false || data.ticketAccessGranted !== false) {
    throw new CreatorEventBroadcastPreparationError("Broadcast preparation could not be confirmed. Refresh readiness to recover the same event room before continuing.");
  }
  return { creatorEventId: event.id, hostUserId: event.hostUserId, roomId: data.roomId,
    broadcastSessionId: data.broadcastSessionId, state: data.state as CreatorEventBroadcastPreparation["state"], canStart: data.canStart as boolean };
}

export async function readCreatorEventForHostRoom(roomId: string): Promise<CreatorEventSummary | null> {
  const authority = getCurrentAccountSessionAuthoritySnapshot();
  if (!authority || !roomId || roomId !== roomId.trim().toUpperCase()) throw new CreatorEventBroadcastPreparationError("This host room could not be verified.");
  const { data, error } = await runCurrentAccountBoundSupabaseMutationRpc<Record<string, unknown>>(
    "read_creator_event_for_host_room", { p_party_id: roomId }, authority.userId);
  if (!sameAccountSessionAuthority(authority, getCurrentAccountSessionAuthoritySnapshot()) || error || !data
    || data.userId !== authority.userId || data.roomId !== roomId) throw new CreatorEventBroadcastPreparationError("This event host context could not be verified. Refresh before continuing.");
  if (data.creatorEvent === null) return null;
  if (!data.creatorEvent || typeof data.creatorEvent !== "object" || Array.isArray(data.creatorEvent)) throw new CreatorEventBroadcastPreparationError("This event host context could not be verified.");
  const row = data.creatorEvent as Record<string, unknown>;
  if (row.host_user_id !== authority.userId || typeof row.id !== "string" || !uuid.test(row.id)) throw new CreatorEventBroadcastPreparationError("This event host context could not be verified.");
  const parsed = parseCreatorEventRow(row as unknown as Parameters<typeof parseCreatorEventRow>[0]);
  if (!parsed) throw new CreatorEventBroadcastPreparationError("This event host context could not be verified.");
  return buildCreatorEventSummary(parsed);
}
