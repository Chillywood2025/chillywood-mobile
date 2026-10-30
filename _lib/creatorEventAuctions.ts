import { getCurrentAccountSessionAuthoritySnapshot, sameAccountSessionAuthority } from "./accountSessionAuthority";
import { captureAccountBoundSupabaseMutationSubject, invokeAccountBoundSupabaseMutationRpc } from "./accountBoundSupabaseMutation";

export type CreatorEventAuction = {
  id: string; creatorEventId: string; offerId: string; termsRevisionId: string; creatorId: string;
  startingAmountMinor: number; minIncrementMinor: number; highestAmountMinor: number | null;
  nextBidAmountMinor: number; myBidAmountMinor: number | null; awardAmountMinor: number | null;
  currency: "usd"; environment: "test" | "live";
  state: "open" | "awarded" | "payment_pending" | "fulfilled" | "expired" | "canceled" | "reconciliation_required";
  closesAt: string; paymentDeadline: string; latestCheckoutStartAt: string; serverNow: string; isHighestBidder: boolean; isWinner: boolean;
  terms: { title: string; description: string | null; startsAt: string; endsAt: string | null; timeZone: string;
    attendance: "virtual"; replayPolicy: "none" | "until_expiration"; replayAvailableAt: string | null; replayExpiresAt: string | null };
};
const states = new Set(["open", "awarded", "payment_pending", "fulfilled", "expired", "canceled", "reconciliation_required"]);
const positive = (n: unknown) => Number.isSafeInteger(n) && Number(n) > 0;
export function parseCreatorEventAuction(value: unknown): CreatorEventAuction {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Auction could not be verified.");
  const row = value as Record<string, unknown>;
  const terms = row.terms as Record<string, unknown> | null;
  if (!terms || terms.attendance !== "virtual" || typeof terms.title !== "string" || !terms.title
    || (terms.description !== null && typeof terms.description !== "string")
    || typeof terms.startsAt !== "string" || !Number.isFinite(Date.parse(terms.startsAt))
    || !["none", "until_expiration"].includes(String(terms.replayPolicy))
    || typeof terms.timeZone !== "string") throw new Error("Auction ticket terms could not be verified.");
  try { new Intl.DateTimeFormat(undefined, { timeZone: terms.timeZone }).format(0); } catch { throw new Error("Auction time zone could not be verified."); }
  for (const key of ["endsAt", "replayAvailableAt", "replayExpiresAt"]) {
    if (terms[key] !== null && (typeof terms[key] !== "string" || !Number.isFinite(Date.parse(String(terms[key]))))) throw new Error("Auction schedule could not be verified.");
  }
  if (terms.replayPolicy === "until_expiration" && (!terms.replayAvailableAt || !terms.replayExpiresAt
    || Date.parse(String(terms.replayExpiresAt)) <= Date.parse(String(terms.replayAvailableAt)))) throw new Error("Auction replay terms could not be verified.");
  if (!["id", "creatorEventId", "offerId", "termsRevisionId", "creatorId"].every(k => typeof row[k] === "string" && !!row[k])
    || !["startingAmountMinor", "minIncrementMinor", "nextBidAmountMinor"].every(k => positive(row[k]))
    || !["highestAmountMinor", "myBidAmountMinor", "awardAmountMinor"].every(k => row[k] === null || positive(row[k]))
    || !["closesAt", "paymentDeadline", "latestCheckoutStartAt", "serverNow"].every(k => typeof row[k] === "string" && Number.isFinite(Date.parse(String(row[k]))))
    || row.currency !== "usd" || !["test", "live"].includes(String(row.environment)) || !states.has(String(row.state))
    || typeof row.isHighestBidder !== "boolean" || typeof row.isWinner !== "boolean") throw new Error("Auction could not be verified.");
  return row as unknown as CreatorEventAuction;
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
export async function listCreatorEventAuctions(eventId: string): Promise<CreatorEventAuction[]> {
  const data = await rpc("list_creator_event_auctions", { p_creator_event_id: eventId });
  if (!Array.isArray(data)) throw new Error("Auctions could not be verified.");
  const rows = data.map(parseCreatorEventAuction);
  if (rows.some(row => row.creatorEventId !== eventId)) throw new Error("Auction event does not match.");
  return rows;
}
export async function readCreatorEventAuction(id: string) {
  const row = parseCreatorEventAuction(await rpc("read_creator_event_auction", { p_auction_id: id }));
  if (row.id !== id) throw new Error("Auction does not match.");
  return row;
}
export async function readCreatorEventAuctionBidEligibility(id: string, amount: number): Promise<boolean> {
  if (!positive(amount)) return false;
  const data = await rpc("read_creator_event_auction_bid_eligibility", { p_auction_id: id, p_amount_minor: amount });
  return !!data && typeof data === "object" && (data as Record<string, unknown>).available === true;
}
export async function placeCreatorEventAuctionBid(id: string, amount: number, requestId: string, capabilityId: string | null) {
  if (!positive(amount)) throw new Error("Enter an exact amount in dollars and cents.");
  const row = parseCreatorEventAuction(await rpc("place_creator_event_auction_bid", {
    p_auction_id: id, p_amount_minor: amount, p_request_id: requestId, p_capability_id: capabilityId,
  }));
  if (row.id !== id) throw new Error("Auction does not match.");
  return row;
}
export async function createCreatorEventAuction(input: {
  eventId: string; revisionId: string; startingAmountMinor: number; minIncrementMinor: number;
  closesAt: string; paymentDeadline: string; environment: "test" | "live";
}) {
  const row = parseCreatorEventAuction(await rpc("create_creator_event_auction", {
    p_creator_event_id: input.eventId, p_expected_revision_id: input.revisionId,
    p_starting_amount_minor: input.startingAmountMinor, p_min_increment_minor: input.minIncrementMinor,
    p_closes_at: input.closesAt, p_payment_deadline: input.paymentDeadline, p_environment: input.environment,
  }));
  if (row.creatorEventId !== input.eventId || row.termsRevisionId !== input.revisionId
    || row.startingAmountMinor !== input.startingAmountMinor || row.minIncrementMinor !== input.minIncrementMinor
    || Date.parse(row.closesAt) !== Date.parse(input.closesAt) || Date.parse(row.paymentDeadline) !== Date.parse(input.paymentDeadline)
    || row.environment !== input.environment) throw new Error("Created auction terms could not be verified. Refresh before trying again.");
  return row;
}
