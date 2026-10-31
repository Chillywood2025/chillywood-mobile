import { captureAccountBoundSupabaseMutationSubject, invokeAccountBoundSupabaseMutationRpc } from "./accountBoundSupabaseMutation";
import { getCurrentAccountSessionAuthoritySnapshot, sameAccountSessionAuthority } from "./accountSessionAuthority";
import { captureCreatorMoneyPurchaseAuthority, prepareCreatorMoneyPurchaseSubject, revalidateCreatorMoneyPurchaseSubject } from "./creatorMoneyPurchaseAuthority";
import { restoreRevenueCatPurchases } from "./revenuecat";
import type { CreatorPriceSourceType } from "./creatorSupportedPrices";

export type CreatorPurchaseStatus = "pending" | "paid_unfulfilled" | "reconciliation_required" | "active" | "upcoming" | "expired" | "refunded" | "revoked" | "failed" | "canceled" | "disputed" | "completed";
// Auction receipts are purchase history, not fixed-price store catalog offers.
export type CreatorPurchaseSourceType = CreatorPriceSourceType | "room_seat_auction";
export type CreatorPurchaseCursor = { createdAt: string; id: string };
export type CreatorPurchaseDestination = { kind: "creator_video" | "creator_event" | "watch_party" | "live_stage" | "creator_channel" | "vip_pass" | "channel_subscription"; id: string };
export type CreatorPurchaseRefund = { state: "none" | "partial" | "full"; amountMinor: number };
export type CreatorPurchase = {
  id: string; purchaseIntentId: string | null; sourceType: CreatorPurchaseSourceType; sourceId: string | null; creatorId: string | null;
  productType: string; productKey: string | null; title: string | null; status: CreatorPurchaseStatus;
  amountMinor: number | null; currency: string | null; createdAt: string; purchasedAt: string | null;
  // Absent on older servers/non-Stripe purchases; null means inconsistent
  // accounting requires review. Neither case establishes a refund amount.
  refund?: CreatorPurchaseRefund | null;
  startsAt: string | null; endsAt?: string | null; expiresAt: string | null; provider: string; environment: "sandbox" | "production" | "unknown";
  destination: CreatorPurchaseDestination | null;
  receipt: { providerEventId: string | null; originalTransactionId: string | null; verifiedAt: string | null; providerTransactionId?: string | null;
    reportedAmountMinor?: number | null; reportedCurrency?: string | null } | null;
  terms: Record<string, unknown>; termsAvailable: boolean; grantsAccess: false;
  refundEligibility?: { eligibility: "eligible"; status: "provider_review_required";
    reasons: ("event_canceled" | "event_no_show" | "material_schedule_change" | "event_replay_unavailable")[]; createdAt: string };
};
export type CreatorPurchasePage = {
  status: "resolved" | "unavailable"; subjectUserId: string | null; subjectSessionGeneration: string | null;
  items: CreatorPurchase[]; nextCursor: CreatorPurchaseCursor | null; fetchedAt: string | null;
};
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const record = (value: unknown): value is Record<string, unknown> => !!value && typeof value === "object" && !Array.isArray(value);
const text = (value: unknown): value is string => typeof value === "string" && !!value && value === value.trim() && !/[\u0000-\u001f\u007f]/u.test(value);
const timestamp = (value: unknown): value is string => text(value) && Number.isFinite(Date.parse(value));
const nullableTime = (value: unknown) => value === null || timestamp(value);
const nullableText = (value: unknown) => value === null || text(value);
const nullableUuid = (value: unknown) => value === null || (text(value) && UUID.test(value));
const statuses: readonly string[] = ["pending", "paid_unfulfilled", "reconciliation_required", "active", "upcoming", "expired", "refunded", "revoked", "failed", "canceled", "disputed", "completed"];
const sourceDestination: Record<CreatorPurchaseSourceType, CreatorPurchaseDestination["kind"] | null> = {
  paid_content: "creator_video", event: "creator_event", watch_party_live: "watch_party",
  live_watch_party_access: "live_stage", live_watch_party_seat: "live_stage", creator_tip: "creator_channel",
  channel_subscription: "channel_subscription", vip_pass: "vip_pass",
  room_seat_auction: null, // Exact room kind is checked against the server claim below.
};
const sourceProducts: Record<CreatorPurchaseSourceType, string> = {
  paid_content: "paid_content_access", event: "event_pass", watch_party_live: "watch_party_live_ticket",
  live_watch_party_access: "live_watch_party_access_pass", live_watch_party_seat: "live_watch_party_seat_pass",
  creator_tip: "creator_tip", channel_subscription: "channel_subscription", vip_pass: "vip_pass",
  room_seat_auction: "room_seat_pass",
};

export function parseCreatorPurchasePage(value: unknown, expectedUserId: string): Omit<CreatorPurchasePage, "status" | "subjectSessionGeneration"> | null {
  if (!record(value) || value.userId !== expectedUserId || !timestamp(value.fetchedAt) || !Array.isArray(value.items)) return null;
  const items: CreatorPurchase[] = [];
  const ids = new Set<string>();
  for (const entry of value.items) {
    if (!record(entry) || !text(entry.id) || !UUID.test(entry.id) || ids.has(entry.id)
      || !(entry.purchaseIntentId === null || (text(entry.purchaseIntentId) && UUID.test(entry.purchaseIntentId)))
      || !text(entry.sourceType) || !Object.hasOwn(sourceDestination, entry.sourceType)
      || !nullableUuid(entry.sourceId) || !nullableUuid(entry.creatorId)
      || !text(entry.productType) || !nullableText(entry.productKey) || !nullableText(entry.title)
      || !text(entry.status) || !statuses.includes(entry.status) || !timestamp(entry.createdAt)
      || !nullableTime(entry.purchasedAt) || !nullableTime(entry.startsAt) || !nullableTime(entry.expiresAt)
      || (entry.endsAt !== undefined && !nullableTime(entry.endsAt))
      || !text(entry.provider) || !["sandbox", "production", "unknown"].includes(String(entry.environment))
      || typeof entry.termsAvailable !== "boolean" || !record(entry.terms) || entry.grantsAccess !== false) return null;
    if (!(entry.amountMinor === null && entry.currency === null)
      && (!Number.isSafeInteger(entry.amountMinor) || Number(entry.amountMinor) < 0 || !text(entry.currency) || !/^[a-z]{3}$/u.test(entry.currency))) return null;
    const sourceType = entry.sourceType as CreatorPurchaseSourceType;
    if (entry.productType !== sourceProducts[sourceType]) return null;
    let destinationKind = sourceDestination[sourceType];
    if (sourceType === "room_seat_auction") {
      if (!entry.sourceId || !entry.creatorId || !entry.purchaseIntentId || entry.provider !== "stripe_room_auction") return null;
      // Unlinked review receipts may have no claim yet. They must never invent
      // a destination. When a claim is present, require its complete typed identity.
      const hasClaim = entry.terms.sourceKind !== undefined || entry.terms.claimId !== undefined || entry.terms.roomSessionId !== undefined;
      if (hasClaim) {
        if (!text(entry.terms.claimId) || !UUID.test(entry.terms.claimId)
          || !text(entry.terms.roomSessionId) || !UUID.test(entry.terms.roomSessionId)
          || !["stage_reserved_seat", "party_admission"].includes(String(entry.terms.sourceKind))) return null;
        destinationKind = entry.terms.sourceKind === "stage_reserved_seat" ? "live_stage" : "watch_party";
      } else if (entry.destination !== null) return null;
    }
    if (entry.refund !== undefined) {
      if (sourceType !== "creator_tip" || entry.provider !== "stripe_connect") return null;
      if (entry.refund === null) {
        if (!["reconciliation_required", "disputed"].includes(entry.status)) return null;
      } else {
        if (!record(entry.refund) || !["none", "partial", "full"].includes(String(entry.refund.state))
          || !Number.isSafeInteger(entry.amountMinor) || Number(entry.amountMinor) <= 0
          || !Number.isSafeInteger(entry.refund.amountMinor) || Number(entry.refund.amountMinor) < 0
          || Number(entry.refund.amountMinor) > Number(entry.amountMinor)) return null;
        const refunded = Number(entry.refund.amountMinor), charged = Number(entry.amountMinor);
        const extent = refunded === 0 ? "none" : refunded === charged ? "full" : "partial";
        if (entry.refund.state !== extent
          || (extent === "full" ? !["refunded", "disputed"].includes(entry.status) : entry.status === "refunded")) return null;
      }
    }
    if (entry.destination !== null) {
      if (!entry.sourceId || !entry.creatorId
        || (!entry.productKey && !(sourceType === "creator_tip" && entry.provider === "stripe_connect"))
        || !record(entry.destination) || entry.destination.kind !== destinationKind
        || !text(entry.destination.id) || entry.destination.id.length > 256) return null;
      const exactDestination = sourceType === "creator_tip" || sourceType === "vip_pass" || sourceType === "channel_subscription"
        ? entry.creatorId : sourceType === "paid_content" || sourceType === "event" ? entry.sourceId : null;
      if (exactDestination && entry.destination.id !== exactDestination) return null;
    }
    if (entry.receipt !== null && (!record(entry.receipt) || !nullableText(entry.receipt.providerEventId)
      || !nullableText(entry.receipt.originalTransactionId) || !nullableTime(entry.receipt.verifiedAt)
      || (entry.receipt.providerTransactionId !== undefined && !nullableText(entry.receipt.providerTransactionId)))) return null;
    if (record(entry.receipt) && (entry.receipt.reportedAmountMinor != null || entry.receipt.reportedCurrency != null)
      && (!Number.isSafeInteger(entry.receipt.reportedAmountMinor) || Number(entry.receipt.reportedAmountMinor) < 0
        || !text(entry.receipt.reportedCurrency) || !/^[a-z]{3}$/u.test(entry.receipt.reportedCurrency))) return null;
    if (entry.refundEligibility !== undefined && entry.refundEligibility !== null
      && (!record(entry.refundEligibility) || entry.refundEligibility.eligibility !== "eligible"
        || entry.refundEligibility.status !== "provider_review_required" || !timestamp(entry.refundEligibility.createdAt)
        || !Array.isArray(entry.refundEligibility.reasons) || entry.refundEligibility.reasons.length === 0
        || entry.refundEligibility.reasons.some(reason => !["event_canceled", "event_no_show", "material_schedule_change", "event_replay_unavailable"].includes(String(reason))))) return null;
    ids.add(entry.id);
    items.push(entry as unknown as CreatorPurchase);
  }
  const cursor = value.nextCursor;
  if (cursor !== null && (!record(cursor) || !timestamp(cursor.createdAt) || !text(cursor.id) || !UUID.test(cursor.id)
    || items.at(-1)?.id !== cursor.id || items.at(-1)?.createdAt !== cursor.createdAt)) return null;
  return { subjectUserId: expectedUserId, items, nextCursor: cursor as CreatorPurchaseCursor | null, fetchedAt: value.fetchedAt };
}

export async function readMyCreatorPurchases(cursor: CreatorPurchaseCursor | null = null,
  filter?: { sourceType: CreatorPurchaseSourceType; sourceId: string }): Promise<CreatorPurchasePage> {
  const authority = getCurrentAccountSessionAuthoritySnapshot();
  const unavailable: CreatorPurchasePage = { status: "unavailable", subjectUserId: authority?.userId ?? null,
    subjectSessionGeneration: authority?.sessionGeneration ?? null, items: [], nextCursor: null, fetchedAt: null };
  if (!authority || authority.restoreOnly || (cursor && (!UUID.test(cursor.id) || !timestamp(cursor.createdAt)))
    || (filter && (!Object.hasOwn(sourceDestination, filter.sourceType) || !UUID.test(filter.sourceId)))) return unavailable;
  try {
    const subject = await captureAccountBoundSupabaseMutationSubject(authority.userId);
    if (!sameAccountSessionAuthority(authority, subject.authority)) return unavailable;
    const response = await invokeAccountBoundSupabaseMutationRpc<unknown>(subject, "read_my_creator_purchases", {
      p_limit: 50, p_before_created_at: cursor?.createdAt ?? null, p_before_id: cursor?.id ?? null,
      ...(filter ? { p_source_type: filter.sourceType, p_source_id: filter.sourceId } : {}),
    });
    if (response.error || !sameAccountSessionAuthority(authority, getCurrentAccountSessionAuthoritySnapshot())) return unavailable;
    const page = parseCreatorPurchasePage(response.data, authority.userId);
    if (page && filter && page.items.some(item => item.sourceType !== filter.sourceType || item.sourceId !== filter.sourceId)) return unavailable;
    return page ? { ...page, status: "resolved", subjectSessionGeneration: authority.sessionGeneration } : unavailable;
  } catch { return unavailable; }
}

export const creatorPurchaseScope: Record<CreatorPurchaseSourceType, { title: string; includes: string }> = {
  paid_content: { title: "Paid Video", includes: "This exact video; current content and access rules still apply." },
  event: { title: "Event Pass", includes: "This exact event under the purchase terms. Replay is included only when stated." },
  watch_party_live: { title: "Party Room Pass", includes: "Entry to this exact Party Room. Speaking and host permissions are separate." },
  live_watch_party_access: { title: "Live Stage Pass", includes: "Viewer/listener entry to this exact Live Stage. A speaking seat is separate." },
  live_watch_party_seat: { title: "Live Stage Seat Pass", includes: "Eligibility to request a speaking seat. Host approval and required entry access remain separate." },
  creator_tip: { title: "Tip", includes: "Creator support only. No video, ticket, VIP, membership or other access is included." },
  channel_subscription: { title: "Platform Subscription", includes: "This creator's membership and ordinary Paid Videos while active. VIP, tickets and Premium are separate." },
  vip_pass: { title: "VIP Pass", includes: "30-day VIP for this creator. Ordinary video ownership, memberships, tickets and Premium are separate." },
  room_seat_auction: { title: "Room Auction Pass", includes: "This exact room session only, including entry and same-account rejoin. Host moderation and media controls remain separate; the pass ends when the creator ends the room." },
};

export function creatorPurchaseStatusPresentation(status: CreatorPurchaseStatus) {
  const presentation: Record<CreatorPurchaseStatus, { label: string; detail: string; pending: boolean }> = {
    pending: { label: "Pending", detail: "Payment is still being checked. Refresh status before trying another purchase.", pending: true },
    paid_unfulfilled: { label: "Payment received · access pending", detail: "Payment was recorded but delivery is not confirmed. Do not purchase this item again; check status or contact support.", pending: true },
    reconciliation_required: { label: "Needs review", detail: "This purchase needs verification. Access and any refund are not yet confirmed. Do not purchase again while it is reviewed.", pending: true },
    active: { label: "Active", detail: "Open the item to verify current entry or playback access.", pending: false },
    upcoming: { label: "Upcoming", detail: "Your purchase is recorded for a future show. Entry opens according to the event terms.", pending: false },
    expired: { label: "Expired", detail: "This access period has ended. The receipt remains in your history.", pending: false },
    refunded: { label: "Refunded", detail: "The provider reports this purchase refunded. It no longer provides access.", pending: false },
    revoked: { label: "Revoked", detail: "This purchase no longer provides access. Contact support if this is unexpected.", pending: false },
    failed: { label: "Failed", detail: "This attempt did not confirm access. Review the item and store history before another attempt.", pending: false },
    canceled: { label: "Canceled", detail: "This purchase or booking was canceled. Cancellation does not itself confirm a refund.", pending: false },
    disputed: { label: "Disputed", detail: "This purchase is under dispute review. Access and final financial outcome must be confirmed.", pending: true },
    completed: { label: "Completed", detail: "This transaction is recorded. Its receipt does not grant unrelated access.", pending: false },
  };
  return presentation[status];
}

export function creatorPurchasePresentation(item: CreatorPurchase) {
  const base = creatorPurchaseStatusPresentation(item.status);
  if (item.sourceType !== "creator_tip" || item.provider !== "stripe_connect" || item.status === "disputed") return base;
  if (item.status === "refunded" && item.refund === undefined) return {
    label: "Refund reported", detail: "A refund was reported, but its amount is unavailable. Check the provider receipt for the refunded amount. Tips do not include access.", pending: false,
  };
  if (item.refund?.state === "full" && item.status === "refunded") return {
    label: "Fully refunded", detail: "The provider reports the full original charge refunded. Tips do not include access.", pending: false,
  };
  if (item.refund?.state === "partial" && item.status === "completed") return {
    label: "Partially refunded", detail: "The provider reports part of this tip refunded. The original charge and cumulative refund are shown separately. Tips do not include access.", pending: false,
  };
  return base;
}

export function creatorPurchaseDestinationRoute(destination: CreatorPurchaseDestination) {
  switch (destination.kind) {
    case "creator_video": return { pathname: "/player/[id]", params: { id: destination.id, source: "creator-video" } };
    case "creator_event": return { pathname: "/event/[eventId]", params: { eventId: destination.id } };
    case "watch_party": return { pathname: "/watch-party/[partyId]", params: { partyId: destination.id } };
    case "live_stage": return { pathname: "/watch-party/live-stage/[partyId]", params: { partyId: destination.id } };
    case "vip_pass": return { pathname: "/vip-pass/[creatorId]", params: { creatorId: destination.id } };
    case "channel_subscription": return { pathname: "/channel-subscription/[creatorId]", params: { creatorId: destination.id } };
    case "creator_channel": return { pathname: "/channel/[userId]", params: { userId: destination.id } };
  }
}

export async function restoreCreatorPurchaseLibrary(): Promise<{ ok: boolean; message: string }> {
  try {
    const initiatingAuthority = captureCreatorMoneyPurchaseAuthority();
    const subject = await prepareCreatorMoneyPurchaseSubject(initiatingAuthority);
    if (!subject) return { ok: false, message: "Sign in again before restoring purchases." };
    await restoreRevenueCatPurchases({ authority: subject.authority });
    if (!await revalidateCreatorMoneyPurchaseSubject(subject)) return { ok: false, message: "The account changed during restore. Check purchases on the current account." };
    return { ok: true, message: "Store restore finished. Only verified purchases are shown below; some updates may still be processing." };
  } catch {
    return { ok: false, message: "Restore could not be confirmed. Your existing purchases remain in your history; refresh before trying again." };
  }
}
