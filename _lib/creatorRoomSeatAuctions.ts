import { getCurrentAccountSessionAuthoritySnapshot, sameAccountSessionAuthority } from "./accountSessionAuthority";
import { captureAccountBoundSupabaseMutationSubject, invokeAccountBoundSupabaseMutationRpc } from "./accountBoundSupabaseMutation";
import { readPendingRoomAuctionCreation, withRoomAuctionCreationAttempt, type CreatorRoomAuctionCreationInput } from "./creatorRoomAuctionCreationAttempt";

export type CreatorRoomSeatAuction = {
  id: string; requestId: string; partyId: string; roomSessionId: string; claimId: string; sourceKind: "stage_reserved_seat" | "party_admission"; creatorId: string;
  startingAmountMinor: number; minIncrementMinor: number; highestAmountMinor: number | null;
  nextBidAmountMinor: number; myBidAmountMinor: number | null; awardAmountMinor: number | null;
  currency: "usd"; environment: "test" | "live";
  state: "open" | "awarded" | "payment_pending" | "fulfilled" | "expired" | "canceled" | "reconciliation_required";
  closesAt: string; paymentDeadline: string; latestCheckoutStartAt: string; serverNow: string; isHighestBidder: boolean; isWinner: boolean;
  terms: { roomSessionId: string; sourceKind: "stage_reserved_seat" | "party_admission";
    admissionIncluded: true; sameAccountRejoin: true; hostControlsMediaAndModeration: true;
    endsWhenCreatorEndsRoom: true; nonDelivery: "reconciliation_provider_refund_review"; automaticRefund: false };
};
const states = new Set(["open", "awarded", "payment_pending", "fulfilled", "expired", "canceled", "reconciliation_required"]);
const positive = (n: unknown) => Number.isSafeInteger(n) && Number(n) > 0;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
export function parseCreatorRoomSeatAuction(value: unknown): CreatorRoomSeatAuction {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Auction could not be verified.");
  const row = value as Record<string, unknown>;
  const terms = row.terms as Record<string, unknown> | null;
  if (!terms || !["stage_reserved_seat", "party_admission"].includes(String(row.sourceKind))
    || terms.sourceKind !== row.sourceKind || terms.roomSessionId !== row.roomSessionId
    || terms.admissionIncluded !== true || terms.sameAccountRejoin !== true || terms.hostControlsMediaAndModeration !== true
    || terms.endsWhenCreatorEndsRoom !== true || terms.nonDelivery !== "reconciliation_provider_refund_review"
    || terms.automaticRefund !== false) throw new Error("Reserved room terms could not be verified.");
  if (!["id", "partyId", "roomSessionId", "claimId", "creatorId"].every(k => typeof row[k] === "string" && !!row[k])
    || typeof row.requestId !== "string" || !UUID.test(row.requestId)
    || !["startingAmountMinor", "minIncrementMinor", "nextBidAmountMinor"].every(k => positive(row[k]))
    || !["highestAmountMinor", "myBidAmountMinor", "awardAmountMinor"].every(k => row[k] === null || positive(row[k]))
    || !["closesAt", "paymentDeadline", "latestCheckoutStartAt", "serverNow"].every(k => typeof row[k] === "string" && Number.isFinite(Date.parse(String(row[k]))))
    || row.currency !== "usd" || !["test", "live"].includes(String(row.environment)) || !states.has(String(row.state))
    || typeof row.isHighestBidder !== "boolean" || typeof row.isWinner !== "boolean") throw new Error("Auction could not be verified.");
  return row as unknown as CreatorRoomSeatAuction;
}

async function rpc(name: string, args: Record<string, unknown>): Promise<unknown> {
  const authority = getCurrentAccountSessionAuthoritySnapshot();
  if (!authority || authority.restoreOnly) throw new Error("Sign in to an active account to use auctions.");
  const subject = await captureAccountBoundSupabaseMutationSubject(authority.userId);
  const result = await invokeAccountBoundSupabaseMutationRpc<unknown>(subject, name, args);
  if (!sameAccountSessionAuthority(authority, getCurrentAccountSessionAuthoritySnapshot())) throw new Error("Your account changed. Refresh before continuing.");
  if (!result || result.error) throw new Error("Auction could not be confirmed. Refresh before trying again.");
  return result.data;
}
export async function listCreatorRoomSeatAuctions(partyId: string): Promise<CreatorRoomSeatAuction[]> {
  const data = await rpc("list_creator_room_seat_auctions", { p_party_id: partyId });
  if (!Array.isArray(data)) throw new Error("Auctions could not be verified.");
  const rows = data.map(parseCreatorRoomSeatAuction);
  if (rows.some(row => row.partyId !== partyId)) throw new Error("Auction room does not match.");
  return rows;
}
export async function readCreatorRoomSeatAuction(id: string) {
  const row = parseCreatorRoomSeatAuction(await rpc("read_creator_room_seat_auction", { p_auction_id: id }));
  if (row.id !== id) throw new Error("Auction does not match.");
  return row;
}
export async function readCreatorRoomSeatAuctionBidEligibility(id: string, amount: number): Promise<boolean> {
  if (!positive(amount)) return false;
  const data = await rpc("read_creator_room_seat_auction_bid_eligibility", { p_auction_id: id, p_amount_minor: amount });
  return !!data && typeof data === "object" && (data as Record<string, unknown>).available === true;
}
export async function placeCreatorRoomSeatAuctionBid(id: string, amount: number, requestId: string, capabilityId: string | null) {
  if (!positive(amount)) throw new Error("Enter an exact amount in dollars and cents.");
  const row = parseCreatorRoomSeatAuction(await rpc("place_creator_room_seat_auction_bid", {
    p_auction_id: id, p_amount_minor: amount, p_request_id: requestId, p_capability_id: capabilityId,
  }));
  if (row.id !== id) throw new Error("Auction does not match.");
  return row;
}
export async function prepareCreatorRoomSeatAuction(partyId: string, sourceKind: CreatorRoomAuctionCreationInput["sourceKind"]) {
  const data = await rpc("prepare_creator_room_seat_auction", { p_party_id: partyId });
  const row = data && typeof data === "object" ? data as Record<string, unknown> : null;
  if (!row || row.partyId !== partyId || row.sourceKind !== sourceKind || typeof row.roomSessionId !== "string"
    || !UUID.test(row.roomSessionId) || typeof row.serverNow !== "string" || !Number.isFinite(Date.parse(row.serverNow))) {
    throw new Error("This room session could not be verified. Refresh before reviewing an auction.");
  }
  return { roomSessionId: row.roomSessionId, serverNow: row.serverNow };
}
export async function readPendingCreatorRoomSeatAuction(partyId: string, sourceKind: CreatorRoomAuctionCreationInput["sourceKind"]) {
  const authority = getCurrentAccountSessionAuthoritySnapshot();
  if (!authority || authority.restoreOnly) throw new Error("Sign in to check this creator request.");
  const input = await readPendingRoomAuctionCreation(authority.userId, partyId, sourceKind);
  if (!sameAccountSessionAuthority(authority, getCurrentAccountSessionAuthoritySnapshot())) throw new Error("Account changed while checking the request.");
  return input;
}
export async function createCreatorRoomSeatAuction(input: CreatorRoomAuctionCreationInput) {
  const authority = getCurrentAccountSessionAuthoritySnapshot();
  if (!authority || authority.restoreOnly) throw new Error("Sign in as the room creator.");
  return withRoomAuctionCreationAttempt(authority.userId, input, async requestId => {
    if (!sameAccountSessionAuthority(authority, getCurrentAccountSessionAuthoritySnapshot())) throw new Error("Account changed before creating the auction.");
    const row = parseCreatorRoomSeatAuction(await rpc("create_creator_room_seat_auction", {
      p_party_id: input.partyId, p_source_kind: input.sourceKind,
      p_starting_amount_minor: input.startingAmountMinor, p_min_increment_minor: input.minIncrementMinor,
      p_closes_at: input.closesAt, p_payment_deadline: input.paymentDeadline, p_environment: input.environment,
      p_request_id: requestId, p_expected_room_session_id: input.roomSessionId,
    }));
    if (row.partyId !== input.partyId || row.sourceKind !== input.sourceKind || row.creatorId !== authority.userId
      || row.roomSessionId !== input.roomSessionId || row.requestId !== requestId
      || row.startingAmountMinor !== input.startingAmountMinor || row.minIncrementMinor !== input.minIncrementMinor
      || Date.parse(row.closesAt) !== Date.parse(input.closesAt) || Date.parse(row.paymentDeadline) !== Date.parse(input.paymentDeadline)
      || row.environment !== input.environment) throw new Error("Created auction terms could not be verified. Check the previous request before trying again.");
    return row;
  });
}
