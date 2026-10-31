import AsyncStorage from "@react-native-async-storage/async-storage";
import { Platform } from "react-native";
import { admitIosExternalCheckout } from "./iosExternalAdmission";
import { admitGooglePlayExternalCheckout } from "./googlePlayExternalAdmission";
import type { GooglePlayExternalCheckoutInput } from "./google-play-external-content-link-flow";
import "react-native-get-random-values";
import { captureAccountBoundSupabaseMutationSubject, invokeAccountBoundSupabaseMutationRpc } from "./accountBoundSupabaseMutation";
import { getCurrentAccountSessionAuthoritySnapshot, sameAccountSessionAuthority } from "./accountSessionAuthority";
import { supabase } from "./supabase";
import type { CreatorRoomSeatAuction } from "./creatorRoomSeatAuctions";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const attempts = new Set<string>();
const newId = () => {
  const bytes = new Uint8Array(16); globalThis.crypto.getRandomValues(bytes);
  bytes[6] = (bytes[6] & 15) | 64; bytes[8] = (bytes[8] & 63) | 128;
  const h = [...bytes].map(n => n.toString(16).padStart(2, "0")).join("");
  return `${h.slice(0,8)}-${h.slice(8,12)}-${h.slice(12,16)}-${h.slice(16,20)}-${h.slice(20)}`;
};
type RoomBinding = Pick<CreatorRoomSeatAuction, "partyId" | "roomSessionId" | "claimId" | "sourceKind" | "creatorId">;
type Attempt = RoomBinding & { quoteId: string; attemptId: string; buyerId: string; auctionId: string; amountMinor: number; currency: string; environment: string };
export type CreatorRoomSeatAuctionCheckoutLaunch = { url: string; launchStrategy: "system_browser" | "google_play_external_content_link"; platform: "ios" | "web" | "android" };

/** No provider operation on render, bid, award, or browser return. This explicit
 * winner action retains its exact attempt before invoking the checkout edge. */
export async function createCreatorRoomSeatAuctionCheckout(auction: CreatorRoomSeatAuction, native?: GooglePlayExternalCheckoutInput): Promise<CreatorRoomSeatAuctionCheckoutLaunch> {
  if (Platform.OS !== "ios" && Platform.OS !== "web" && !(Platform.OS === "android" && native)) throw new Error("Auction checkout requires the approved native Google Play flow on Android.");
  const authority = getCurrentAccountSessionAuthoritySnapshot();
  if (!authority || authority.restoreOnly || !auction.isWinner || !["awarded", "payment_pending"].includes(auction.state) || !auction.awardAmountMinor
    || auction.environment !== "test") throw new Error("Eligible winner checkout is unavailable. Refresh auction status.");
  const room: RoomBinding = { partyId: auction.partyId, roomSessionId: auction.roomSessionId, claimId: auction.claimId,
    sourceKind: auction.sourceKind, creatorId: auction.creatorId };
  if (!room.partyId || !UUID.test(room.roomSessionId) || !UUID.test(room.claimId) || !UUID.test(room.creatorId)
    || !["stage_reserved_seat", "party_admission"].includes(room.sourceKind)) throw new Error("Reserved room-session terms could not be verified.");
  const matchesRoom = (value: Record<string, unknown>) => Object.entries(room).every(([field, expected]) => value[field] === expected);
  const key = `@chillywood:room-auction-checkout:v1:${authority.userId}:${auction.id}`;
  // Retain prior-session records for reconciliation. A replacement session
  // must request a server quote; only the server may supersede an unstarted
  // quote, and it rejects replacement of any started/uncertain checkout.
  const storageKey = `${key}:session:${authority.sessionGeneration}`;
  if (attempts.has(key)) throw new Error("Checkout is already being checked. Refresh before trying again.");
  attempts.add(key);
  try {
    const subject = await captureAccountBoundSupabaseMutationSubject(authority.userId);
    const current = () => sameAccountSessionAuthority(authority, getCurrentAccountSessionAuthoritySnapshot());
    if (!current() || !sameAccountSessionAuthority(authority, subject.authority)) throw new Error("Account changed before checkout.");
    const capabilityId = Platform.OS === "android" && native ? await admitGooglePlayExternalCheckout(subject, {
      feature: "room_seat_auction", creatorId: auction.creatorId, amountMinor: auction.awardAmountMinor, sourceId: auction.id,
    }, native) : Platform.OS === "ios" ? await admitIosExternalCheckout(subject, {
      feature: "room_seat_auction", creatorId: auction.creatorId, amountMinor: auction.awardAmountMinor, sourceId: auction.id,
    }) : null;
    const raw = await AsyncStorage.getItem(storageKey);
    if (auction.state === "payment_pending" && raw === null) throw new Error("The existing checkout is not saved for this account session. Check purchase status; do not start another payment.");
    let attempt: Attempt;
    if (raw !== null) {
      attempt = JSON.parse(raw);
      if (!attempt || !UUID.test(attempt.quoteId) || !UUID.test(attempt.attemptId) || attempt.auctionId !== auction.id
        || attempt.buyerId !== authority.userId || attempt.amountMinor !== auction.awardAmountMinor || attempt.currency !== auction.currency
        || attempt.environment !== auction.environment || !matchesRoom(attempt)) throw new Error("Saved checkout cannot be verified. Refresh purchase status; do not start another payment.");
    } else {
      const result = await invokeAccountBoundSupabaseMutationRpc<Record<string, unknown>>(subject, "create_creator_room_seat_auction_award_quote", { p_auction_id: auction.id, p_capability_id: capabilityId });
      const quote = result.data;
      if (result.error || !quote || !UUID.test(String(quote.id)) || quote.auctionId !== auction.id || quote.state !== "awarded"
        || quote.checkoutStarted !== false || typeof quote.expiresAt !== "string" || !Number.isFinite(Date.parse(quote.expiresAt))
        || quote.amountMinor !== auction.awardAmountMinor || quote.currency !== auction.currency || quote.environment !== auction.environment
        || !matchesRoom(quote)) throw new Error("An eligible payment quote could not be verified. No checkout was started.");
      attempt = { quoteId: String(quote.id), attemptId: newId(), buyerId: authority.userId, auctionId: auction.id,
        amountMinor: auction.awardAmountMinor, currency: auction.currency, environment: auction.environment, ...room };
      if (!current()) throw new Error("Account changed before checkout.");
      await AsyncStorage.setItem(storageKey, JSON.stringify(attempt));
    }
    if (!current()) throw new Error("Account changed before checkout.");
    const controller = new AbortController(); const timeout = setTimeout(() => controller.abort(), 20_000);
    let response;
    try {
      response = await supabase.functions.invoke("stripe-room-auction-checkout", {
        signal: controller.signal, headers: { Authorization: `Bearer ${subject.accessToken}`, "x-chillywood-platform": Platform.OS },
        body: { quote_id: attempt.quoteId, attempt_id: attempt.attemptId, ...(native ?? {}) },
      });
    } finally { clearTimeout(timeout); }
    if (!current() || response.error) throw new Error("Checkout outcome is unknown. Refresh auction and purchase status before continuing.");
    const data = response.data;
    if (!data || data.status !== "checkout_ready" || data.checkoutCreated !== true || data.liveMoneyAction !== false
      || data.routeKind !== (Platform.OS === "android" ? "android_external_content_link" : "external_browser_checkout")
      || data.launchStrategy !== (Platform.OS === "android" ? "google_play_external_content_link" : "system_browser")
      || data.platform !== Platform.OS || data.storefrontCountry !== "US"
      || Object.entries(attempt).some(([field, value]) => data[field] !== value)) throw new Error("Checkout is pending or unavailable. Refresh auction and purchase status; do not start another payment.");
    const url = new URL(String(data.checkoutUrl));
    if (url.origin !== "https://checkout.stripe.com" || url.username || url.password || !/^\/(?:c\/)?pay\//u.test(url.pathname)) throw new Error("Checkout link could not be verified. Refresh purchase status.");
    return { url: url.toString(), launchStrategy: Platform.OS === "android" ? "google_play_external_content_link" : "system_browser", platform: Platform.OS };
  } finally { attempts.delete(key); }
}
