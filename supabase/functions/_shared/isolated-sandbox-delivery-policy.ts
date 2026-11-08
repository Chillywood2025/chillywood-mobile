/**
 * Pure policy for a FUTURE isolated delivery resolver. This is not an HTTP
 * authorization adapter. Its inputs are NOT proof: a privileged resolver must
 * assemble them from current authenticated session, immutable receipt/ownership,
 * locked versioned resource and scan/room records, then recheck before issuance.
 * No handler imports this module. It signs nothing and returns no destination.
 *
 * Source contracts preserved here:
 * - _lib/creatorPurchases.ts: purchase history always grantsAccess=false.
 * - _shared/creator-video-object-authority.ts: exact owner/provider/object.
 * - media-storage/index.ts: immutable scan provenance and fresh delivery checks.
 * - _shared/watch-party-livekit-authority.ts: exact room generation/participant;
 *   seats are eligibility, never publish authority.
 * - _lib/creatorEventPlayback.ts: spectator proxy only, never raw HLS/room token.
 * - _lib/channelSubscriptions.ts and creatorVipPasses.ts: creator-specific scope.
 */
export const ISOLATED_DELIVERY_KINDS = [
  "creator_tip", "paid_content", "watch_party_live", "live_watch_party_access",
  "live_watch_party_seat", "event", "channel_subscription", "vip_pass",
  "physical_merch", "event_auction", "room_seat_auction:party_admission",
  "room_seat_auction:stage_reserved_seat",
] as const;
export type IsolatedDeliveryKind = typeof ISOLATED_DELIVERY_KINDS[number];
type Issuer = "receipt_reader" | "order_reader" | "membership_reader"
  | "media_signer" | "room_admission" | "seat_request" | "event_spectator_proxy";
export type IsolatedDeliveryPolicyDecision = {
  eligibleForIssuer: false; authorizationProof: false; grantsAccess: false;
  publishAllowed: false; reason: string;
} | {
  eligibleForIssuer: true; authorizationProof: false; grantsAccess: false;
  publishAllowed: false; reason: "complete_policy_facts"; issuer: Issuer;
  binding: {
    userId: string; sessionId: string; productId: string; productKind: IsolatedDeliveryKind;
    targetId: string; targetRevision: number; expiresAtMs: number;
  };
};

// This documents the data an authenticated resolver must obtain. It is not a
// capability that a caller can mint by satisfying a TypeScript interface.
export type IsolatedDeliveryResourceFacts = {
  namespace: "sandbox-commerce-v1"; id: string; revision: number;
  kind: IsolatedDeliveryKind; creatorId: string;
  state: "published" | "retained" | "draft" | "retired";
  moderation: "clear" | "held" | "removed"; quarantined: boolean;
  audience?: "paid" | "subscriber" | "vip";
};
export type IsolatedDeliveryFacts = {
  protocol: "sandbox-commerce-v1"; environment: "sandbox";
  authority: {
    userId: string; accountId: string; sessionId: string;
    accountActive: boolean; sessionActive: boolean; restoreOnly: boolean; legalCurrent: boolean;
    observedAtMs: number; validUntilMs: number;
  };
  request: { productId: string; productRevision: number; targetId: string; targetRevision: number; action: string };
  product: IsolatedDeliveryResourceFacts; target: IsolatedDeliveryResourceFacts;
  receipt: {
    namespace: "sandbox-commerce-v1"; id: string; productId: string; productRevision: number;
    kind: IsolatedDeliveryKind; buyerId: string; creatorId: string;
    verification: "provider_verified"; providerTestMode: boolean; ownership: "isolated";
    provider: "stripe" | "revenuecat"; providerScope: string; transactionId: string;
    state: "verified" | "refunded" | "revoked" | "quarantined";
  };
  // Mode-specific rows must originate from their own scoped resolvers. See the
  // exact field checks below; generic resource_bindings/grant.kind is not enough.
  grant?: Record<string, unknown>; creator?: Record<string, unknown>;
  asset?: Record<string, unknown>; inclusion?: Record<string, unknown>;
  room?: Record<string, unknown>; membership?: Record<string, unknown>;
  seat?: Record<string, unknown>; entry?: Record<string, unknown>;
  event?: Record<string, unknown>; award?: Record<string, unknown>; order?: Record<string, unknown>;
};

type Row = Record<string, unknown>;
const row = (value: unknown): Row => value && typeof value === "object" && !Array.isArray(value) ? value as Row : {};
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u;
const uuid = (value: unknown): value is string => typeof value === "string" && UUID.test(value);
const id = (value: unknown, type: string): value is string => typeof value === "string"
  && value.startsWith(`scv1_${type}_`) && uuid(value.slice(`scv1_${type}_`.length));
const member = (value: unknown, values: readonly string[]) => typeof value === "string" && values.includes(value);
const positive = (value: unknown): value is number => typeof value === "number" && Number.isSafeInteger(value) && value > 0;
const time = (value: unknown): value is number => typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
const text = (value: unknown, max = 160): value is string => typeof value === "string" && value.length > 0
  && value.length <= max && value.trim() === value && !/[\u0000-\u001f\u007f]/u.test(value);
const NS = "sandbox-commerce-v1";
const deny = (reason: string): IsolatedDeliveryPolicyDecision => Object.freeze({
  eligibleForIssuer: false, authorizationProof: false, grantsAccess: false, publishAllowed: false, reason,
});
const safeResource = (r: Row) => r.namespace === NS && id(r.id, "resource") && positive(r.revision)
  && member(r.kind, ISOLATED_DELIVERY_KINDS) && uuid(r.creatorId);
const consumable = (r: Row) => member(r.state, ["published", "retained"])
  && r.moderation === "clear" && r.quarantined === false;

/** Evaluates policy predicates only. A positive result is useful exclusively
 * inside an authenticated issuer after trusted fact retrieval; never accept
 * this result or its inputs from app/request JSON as authorization evidence.
 */
export function evaluateIsolatedSandboxDeliveryPolicy(input: unknown, nowMs = Date.now()): IsolatedDeliveryPolicyDecision {
  const f = row(input), a = row(f.authority), q = row(f.request), p = row(f.product), target = row(f.target), receipt = row(f.receipt);
  if (f.protocol !== NS || f.environment !== "sandbox" || !time(nowMs)) return deny("invalid_protocol");
  if (!uuid(a.userId) || a.accountId !== a.userId || !uuid(a.sessionId)
    || a.accountActive !== true || a.sessionActive !== true || a.restoreOnly !== false || a.legalCurrent !== true
    || !time(a.observedAtMs) || !time(a.validUntilMs) || a.observedAtMs > nowMs || a.observedAtMs < nowMs - 5000
    || a.validUntilMs <= nowMs || a.validUntilMs > a.observedAtMs + 5000) return deny("current_session_facts_required");
  if (!safeResource(p) || !safeResource(target) || p.id !== q.productId || p.revision !== q.productRevision
    || target.id !== q.targetId || target.revision !== q.targetRevision || target.creatorId !== p.creatorId) return deny("exact_resource_version_required");
  if (receipt.namespace !== NS || !id(receipt.id, "receipt") || receipt.productId !== p.id || receipt.productRevision !== p.revision
    || receipt.kind !== p.kind || receipt.buyerId !== a.userId || receipt.creatorId !== p.creatorId
    || receipt.verification !== "provider_verified" || receipt.providerTestMode !== true || receipt.ownership !== "isolated"
    || !member(receipt.provider, ["stripe", "revenuecat"]) || !text(receipt.providerScope) || !text(receipt.transactionId, 256)
    || !member(receipt.state, ["verified", "refunded", "revoked", "quarantined"])) return deny("exact_provider_receipt_required");
  let expires = a.validUntilMs;
  const eligible = (issuer: Issuer): IsolatedDeliveryPolicyDecision => Object.freeze({
    eligibleForIssuer: true, authorizationProof: false, grantsAccess: false, publishAllowed: false,
    reason: "complete_policy_facts", issuer,
    binding: Object.freeze({ userId: a.userId as string, sessionId: a.sessionId as string,
      productId: p.id as string, productKind: p.kind as IsolatedDeliveryKind,
      targetId: target.id as string, targetRevision: target.revision as number, expiresAtMs: expires }),
  });
  const sameTarget = target.id === p.id && target.revision === p.revision && target.kind === p.kind;
  // History survives takedown, refund and creator Premium expiry. These readers
  // expose only the exact buyer's retained purchase/order record, not content.
  if (p.kind === "creator_tip") {
    return sameTarget && q.action === "read_tip_receipt" ? eligible("receipt_reader") : deny("tip_has_no_access_destination");
  }
  if (p.kind === "physical_merch") {
    const order = row(f.order);
    if (!sameTarget || q.action !== "read_test_order" || !id(order.id, "order") || order.buyerId !== a.userId
      || order.productId !== p.id || order.productRevision !== p.revision || order.receiptId !== receipt.id
      || order.environment !== "sandbox" || order.fulfillmentMode !== "test_only" || order.shipmentDispatched !== false
      || !id(order.variantId, "variant") || !text(order.sku) || !positive(order.quantity) || !id(order.reservationId, "reservation")
      || !member(order.inventoryState, ["allocated", "released"])
      || !member(order.state, ["paid", "test_fulfilled", "canceled", "refunded", "quarantined"])) return deny("exact_test_order_required");
    return eligible("order_reader");
  }
  const creator = row(f.creator), grant = row(f.grant);
  if (!consumable(p) || !consumable(target) || creator.userId !== p.creatorId || creator.accountActive !== true
    || creator.moderation !== "clear" || creator.viewerBlocked !== false) return deny("resource_safety_required");
  // Current seller Premium and financial enablement are deliberately absent:
  // delivery of retained rights is distinct from eligibility to make new sales.
  if (receipt.state !== "verified" || !id(grant.id, "grant") || grant.namespace !== NS || grant.buyerId !== a.userId
    || grant.productId !== p.id || grant.productRevision !== p.revision || grant.kind !== p.kind
    || grant.creatorId !== p.creatorId || grant.receiptId !== receipt.id || grant.revoked !== false || grant.quarantined !== false
    || !time(grant.startsAtMs) || grant.startsAtMs > nowMs
    || (grant.expiresAtMs !== null && (!time(grant.expiresAtMs) || grant.expiresAtMs <= nowMs))) return deny("current_exact_grant_required");
  if (time(grant.expiresAtMs)) expires = Math.min(expires, grant.expiresAtMs);

  const checkAsset = (purpose: "video" | "event_replay") => {
    const asset = row(f.asset), scan = row(asset.scan);
    if (asset.namespace !== NS || !id(asset.id, "asset") || asset.ownerId !== target.creatorId
      || asset.resourceId !== target.id || asset.resourceRevision !== target.revision || asset.purpose !== purpose
      || !member(asset.provider, ["s3", "cloudflare_r2", "supabase_storage"]) || !text(asset.bucket)
      || !uuid(asset.incarnation) || !text(asset.objectVersion, 256) || !text(asset.objectKey, 1024)
      || !asset.objectKey.startsWith(`${NS}/${target.creatorId}/${target.id}/${asset.id}/`)
      || asset.objectKey.split("/").some((part) => !part || part === "." || part === "..")
      || /[\\%?#]/u.test(asset.objectKey) || typeof asset.sha256 !== "string" || !/^[0-9a-f]{64}$/u.test(asset.sha256)
      || !positive(asset.byteLength) || asset.immutable !== true || asset.retained !== true || asset.deleted !== false
      || scan.assetId !== asset.id || scan.incarnation !== asset.incarnation || scan.sha256 !== asset.sha256
      || scan.provider !== asset.provider || scan.bucket !== asset.bucket || scan.objectKey !== asset.objectKey || scan.objectVersion !== asset.objectVersion
      || scan.byteLength !== asset.byteLength || scan.state !== "clean" || scan.quarantined !== false
      || !text(scan.scannerVersion) || !time(scan.completedAtMs) || scan.completedAtMs > nowMs) return false;
    return true;
  };
  if (p.kind === "paid_content" || p.kind === "channel_subscription" || p.kind === "vip_pass") {
    const membership = p.kind !== "paid_content";
    if (membership && !time(grant.expiresAtMs)) return deny("finite_membership_period_required");
    if (p.kind === "vip_pass" && (grant.expiresAtMs as number) - (grant.startsAtMs as number) > 30 * 24 * 60 * 60 * 1000) return deny("vip_duration_exceeded");
    if (membership && sameTarget && q.action === "read_membership") return eligible("membership_reader");
    if (q.action !== "play_video" || target.kind !== "paid_content") return deny("video_destination_required");
    if (!membership && (!sameTarget || target.audience !== "paid")) return deny("exact_paid_video_required");
    if (membership) {
      const inclusion = row(f.inclusion);
      if (inclusion.namespace !== NS || inclusion.productId !== p.id || inclusion.productRevision !== p.revision
        || inclusion.targetId !== target.id || inclusion.targetRevision !== target.revision || inclusion.creatorId !== p.creatorId
        || inclusion.active !== true || inclusion.audience !== (p.kind === "vip_pass" ? "vip" : "subscriber")
        || inclusion.vipOnly !== (p.kind === "vip_pass")
        || (p.kind === "vip_pass" ? target.audience !== "vip" : !member(target.audience, ["paid", "subscriber"]))) return deny("explicit_content_inclusion_required");
    }
    return checkAsset("video") ? eligible("media_signer") : deny("immutable_clean_asset_required");
  }
  const auction = p.kind === "event_auction" || String(p.kind).startsWith("room_seat_auction:");
  if (auction) {
    const award = row(f.award), claim = row(award.claim);
    if (!id(award.id, "award") || award.namespace !== NS || award.productId !== p.id || award.productRevision !== p.revision
      || award.targetId !== target.id || award.targetRevision !== target.revision || award.buyerId !== a.userId
      || award.creatorId !== p.creatorId || award.kind !== p.kind || award.receiptId !== receipt.id
      || award.grantId !== grant.id || award.state !== "settled" || award.revoked !== false
      || !id(award.lotId, "lot") || !id(award.claimId, "claim") || award.claimState !== "consumed"
      || award.termsRevision !== grant.termsRevision || !positive(award.termsRevision)
      || !time(award.settledAtMs) || award.settledAtMs > nowMs || !time(award.claimDeadlineMs)
      || award.settledAtMs > award.claimDeadlineMs || claim.namespace !== NS || claim.id !== award.claimId
      || claim.lotId !== award.lotId || claim.productId !== p.id || claim.targetId !== target.id || claim.targetRevision !== target.revision
      || claim.buyerId !== a.userId || claim.receiptId !== receipt.id || claim.grantId !== grant.id || claim.kind !== p.kind
      || claim.state !== "consumed" || claim.deadlineMs !== award.claimDeadlineMs || !time(claim.consumedAtMs)
      || claim.consumedAtMs > nowMs || claim.consumedAtMs > award.claimDeadlineMs) return deny("settled_exact_award_required");
  }
  if (p.kind === "event" || p.kind === "event_auction") {
    const event = row(f.event);
    if (q.action !== "watch_event" || (p.kind === "event" ? !sameTarget : target.kind !== "event")
      || event.namespace !== NS || event.resourceId !== target.id || event.resourceRevision !== target.revision
      || !uuid(event.generation) || grant.eventGeneration !== event.generation || event.creatorId !== p.creatorId || event.termsRevision !== grant.termsRevision
      || !positive(event.termsRevision) || event.canceled !== false || event.moderation !== "clear"
      || !time(event.accessStartsAtMs) || event.accessStartsAtMs > nowMs || !time(event.accessEndsAtMs)
      || event.accessEndsAtMs <= nowMs || !time(grant.expiresAtMs)) return deny("current_event_terms_required");
    expires = Math.min(expires, event.accessEndsAtMs);
    if (auction && (row(f.award).eventGeneration !== event.generation || row(row(f.award).claim).eventGeneration !== event.generation)) return deny("award_event_generation_required");
    if (event.state === "replay") {
      if (grant.replayAllowed !== true || !time(grant.replayStartsAtMs) || grant.replayStartsAtMs > nowMs
        || !time(grant.replayEndsAtMs) || grant.replayEndsAtMs <= nowMs || event.replayAvailable !== true) return deny("purchased_replay_terms_required");
      expires = Math.min(expires, grant.replayEndsAtMs);
      return row(f.asset).eventGeneration === event.generation && checkAsset("event_replay")
        ? eligible("event_spectator_proxy") : deny("immutable_clean_replay_required");
    }
    if (event.state !== "live" || event.providerNamespace !== NS || event.broadcastGeneration !== event.generation
      || event.providerRoomName !== `scv1-event-${target.id}-${event.generation}` || !id(event.outputId, "output")
      || event.outputState !== "active" || event.audience !== "spectator" || event.fullRoomTokenAllowed !== false) return deny("isolated_live_event_output_required");
    return eligible("event_spectator_proxy");
  }
  const room = row(f.room), membership = row(f.membership);
  const seatMode = p.kind === "live_watch_party_seat" || p.kind === "room_seat_auction:stage_reserved_seat";
  const partyMode = p.kind === "watch_party_live" || p.kind === "room_seat_auction:party_admission";
  if (!member(p.kind, ["watch_party_live", "live_watch_party_access", "live_watch_party_seat", "room_seat_auction:party_admission", "room_seat_auction:stage_reserved_seat"])
    || q.action !== (seatMode ? "request_seat" : "join_room") || (!auction && !seatMode && !sameTarget)
    || ((auction || seatMode) && target.kind !== (partyMode ? "watch_party_live" : "live_watch_party_access"))) return deny("exact_room_destination_required");
  if (room.namespace !== NS || room.resourceId !== target.id || room.resourceRevision !== target.revision
    || room.creatorId !== p.creatorId || !uuid(room.generation) || room.state !== "open" || room.moderation !== "clear"
    || room.providerNamespace !== NS || room.providerRoomName !== `scv1-room-${target.id}-${room.generation}`
    || grant.roomGeneration !== room.generation || !time(room.endsAtMs) || room.endsAtMs <= nowMs
    || !time(grant.expiresAtMs) || membership.namespace !== NS || membership.resourceId !== target.id
    || membership.resourceRevision !== target.revision
    || membership.roomGeneration !== room.generation || membership.userId !== a.userId || membership.sessionId !== a.sessionId
    || membership.providerIdentity !== a.userId || membership.state !== "admitted" || membership.banned !== false
    || !time(membership.validUntilMs) || membership.validUntilMs <= nowMs) return deny("current_isolated_room_membership_required");
  expires = Math.min(expires, room.endsAtMs, membership.validUntilMs);
  if (auction && (row(f.award).roomGeneration !== room.generation || row(row(f.award).claim).roomGeneration !== room.generation)) return deny("award_room_generation_required");
  if (seatMode) {
    const seat = row(f.seat), entry = row(f.entry);
    if (seat.namespace !== NS || !id(seat.id, "seat") || seat.resourceId !== target.id || seat.roomGeneration !== room.generation
      || seat.resourceRevision !== target.revision || seat.productId !== p.id || seat.productRevision !== p.revision
      || seat.buyerId !== a.userId || seat.grantId !== grant.id || seat.state !== "reserved" || seat.revoked !== false
      || entry.namespace !== NS || !id(entry.grantId, "grant") || entry.grantId === grant.id || entry.userId !== a.userId
      || entry.resourceId !== target.id || entry.roomGeneration !== room.generation || entry.sessionId !== a.sessionId
      || entry.resourceRevision !== target.revision
      || entry.state !== "admitted" || entry.revoked !== false || !time(entry.validUntilMs) || entry.validUntilMs <= nowMs) return deny("separate_entry_and_seat_required");
    expires = Math.min(expires, entry.validUntilMs);
    return eligible("seat_request");
  }
  return eligible("room_admission");
}
