import { CHILLYWOOD_VISUAL } from "../ui/chillywood-visual-system";
import { openCreatorExternalCheckout } from "../../_lib/openCreatorExternalCheckout";
import React, { useCallback, useEffect, useRef, useState } from "react";
import { ActivityIndicator, AppState, Platform, Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { useFocusEffect } from "expo-router";
import "react-native-get-random-values";
import { getAccountNavigationTreeKey, getCurrentAccountSessionAuthoritySnapshot, sameAccountSessionAuthority, subscribeToAccountSessionAuthority } from "../../_lib/accountSessionAuthority";
import { listCreatorEventAuctions, placeCreatorEventAuctionBid, readCreatorEventAuctionBidEligibility, type CreatorEventAuction } from "../../_lib/creatorEventAuctions";
import { formatCreatorTipAmountInput, parseCreatorTipAmount } from "../../_lib/creatorTipAmount";
import { createCreatorEventAuctionCheckout } from "../../_lib/creatorEventAuctionCheckout";
import { withGooglePlayExternalContentLink } from "../../_lib/google-play-external-content-links";
import { withGooglePlayAuctionBidEligibility } from "../../_lib/googlePlayAuctionBidEligibility";

const money = (n: number) => `$${formatCreatorTipAmountInput(n)} USD`;
// Retain the same idempotency identity across refresh/remount after an unknown
// network result. Equal bids never create a second commitment.
const bidRequests = new Map<string, string>();
const requestId = () => {
  const bytes = new Uint8Array(16); globalThis.crypto.getRandomValues(bytes);
  bytes[6] = (bytes[6] & 15) | 64; bytes[8] = (bytes[8] & 63) | 128;
  const h = [...bytes].map(n => n.toString(16).padStart(2, "0")).join("");
  return `${h.slice(0,8)}-${h.slice(8,12)}-${h.slice(12,16)}-${h.slice(16,20)}-${h.slice(20)}`;
};
export function EventAuctionPanel({ eventId }: { eventId: string }) {
  const [accountKey, setAccountKey] = useState(() => getAccountNavigationTreeKey(getCurrentAccountSessionAuthoritySnapshot()));
  useEffect(() => subscribeToAccountSessionAuthority(value => setAccountKey(getAccountNavigationTreeKey(value))), []);
  return <AuctionList key={`${eventId}:${accountKey}`} eventId={eventId} />;
}
function AuctionList({ eventId }: { eventId: string }) {
  const [rows, setRows] = useState<CreatorEventAuction[]>([]);
  const [busy, setBusy] = useState(false); const [error, setError] = useState("");
  const [visible, setVisible] = useState(false);
  const generation = useRef(0); const alive = useRef(true); const flight = useRef(false);
  const refresh = useCallback(async () => {
    if (flight.current) return;
    flight.current = true;
    const seq = ++generation.current; const authority = getCurrentAccountSessionAuthoritySnapshot();
    setBusy(true);
    try {
      const data = await listCreatorEventAuctions(eventId);
      if (alive.current && seq === generation.current && sameAccountSessionAuthority(authority, getCurrentAccountSessionAuthoritySnapshot())) { setRows(data); setError(""); }
    } catch { if (alive.current && seq === generation.current) setError("We couldn’t update this auction. Your draft is saved here. Refresh before bidding."); }
    finally { flight.current = false; if (alive.current && seq === generation.current) setBusy(false); }
  }, [eventId]);
  useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);
  useFocusEffect(useCallback(() => {
    let focused = true; let foreground = AppState.currentState === "active";
    const check = () => { if (focused && foreground) void refresh(); };
    setVisible(foreground); check(); const timer = setInterval(check, 15_000);
    const subscription = AppState.addEventListener("change", state => { foreground = state === "active"; setVisible(foreground); check(); });
    return () => { focused = false; setVisible(false); clearInterval(timer); subscription.remove(); };
  }, [refresh]));
  return <View style={styles.panel} testID="event-auction-panel">
    <Text style={styles.title}>Event ticket auctions</Text>
    <Text style={styles.body}>One virtual ticket per auction. No bidding fee. Only the winner pays, in a separate eligible checkout. A bid or award is not a ticket.</Text>
    {error ? <Text accessibilityLiveRegion="polite" style={styles.body}>{error}</Text> : null}
    {!busy && !error && !rows.length ? <Text style={styles.body}>No auctions are currently listed for this event.</Text> : null}
    {busy ? <ActivityIndicator accessibilityLabel="Refreshing auctions" /> : null}
    {rows.map(row => <AuctionCard key={row.id} auction={row} refresh={refresh} verified={!error} visible={visible} />)}
    <Action label="Refresh auctions" disabled={busy} onPress={() => void refresh()} />
    <Text style={styles.body}>Bids and payment status update automatically while this screen is open. You can also refresh anytime.</Text>
  </View>;
}
function AuctionCard({ auction: a, refresh, verified, visible }: { auction: CreatorEventAuction; refresh: () => Promise<void>; verified: boolean; visible: boolean }) {
  const [amount, setAmount] = useState(""); const [review, setReview] = useState<number | null>(null);
  const [busy, setBusy] = useState(false); const [notice, setNotice] = useState("");
  const alive = useRef(true); const flight = useRef(false);
  useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);
  const signature = `${a.state}:${a.highestAmountMinor}:${a.nextBidAmountMinor}:${a.termsRevisionId}:${verified}`;
  const latestSignature = useRef(signature); latestSignature.current = signature;
  const isVisible = useRef(visible); isVisible.current = visible;
  useEffect(() => { setReview(null); }, [signature]);
  const pay = async () => {
    if (flight.current || !verified || !visible) return;
    const authority = getCurrentAccountSessionAuthoritySnapshot();
    const current = () => alive.current && sameAccountSessionAuthority(authority, getCurrentAccountSessionAuthoritySnapshot());
    flight.current = true; setBusy(true); setNotice("");
    try {
      if (Platform.OS === "android") {
        await withGooglePlayExternalContentLink(async native => {
          if (!current() || !isVisible.current) throw new Error("Checkout was closed.");
          const checkout = await createCreatorEventAuctionCheckout(a, native);
          if (!current() || !isVisible.current) throw new Error("Checkout was closed.");
          if (checkout.platform !== "android" || checkout.launchStrategy !== "google_play_external_content_link") throw new Error("Checkout launch is unavailable.");
          return checkout;
        });
      } else {
        const checkout = await createCreatorEventAuctionCheckout(a);
        if (!current() || !isVisible.current) return;
        if (checkout.launchStrategy !== "system_browser" || checkout.platform !== Platform.OS || (Platform.OS !== "ios" && Platform.OS !== "web")) throw new Error("Checkout launch is unavailable.");
        await openCreatorExternalCheckout(checkout.url, () => current() && isVisible.current);
      }
      if (current()) { setNotice("Checkout opened in your browser. Return here to check payment status; opening checkout does not confirm a ticket."); await refresh(); }
    } catch { if (current()) setNotice("Payment checkout is unavailable, pending, or could not be verified. Refresh auction and purchase status before another attempt. No admission is granted here."); }
    finally { flight.current = false; if (current()) setBusy(false); }
  };
  const act = async (confirm: boolean) => {
    if (flight.current || !verified || !visible || a.state !== "open" || a.environment !== "test") return;
    const authority = getCurrentAccountSessionAuthoritySnapshot();
    const current = () => alive.current && sameAccountSessionAuthority(authority, getCurrentAccountSessionAuthoritySnapshot());
    const cents = confirm ? review : parseCreatorTipAmount(amount || formatCreatorTipAmountInput(a.nextBidAmountMinor));
    if (!cents || cents < a.nextBidAmountMinor) { setNotice(`Enter at least ${money(a.nextBidAmountMinor)} using no more than two decimal places.`); return; }
    flight.current = true; setBusy(true); setNotice("");
    try {
      if (!confirm) {
        const available = await withGooglePlayAuctionBidEligibility({ feature: "event_auction", creatorId: a.creatorId, sourceId: a.id, amountMinor: cents }, async () => {
          if (!current() || !isVisible.current || latestSignature.current !== signature) throw new Error("Bid review was closed.");
          return readCreatorEventAuctionBidEligibility(a.id, cents);
        });
        if (current() && isVisible.current && latestSignature.current === signature) { setReview(available ? cents : null); if (!available) setNotice("Bidding isn’t available for this account and amount right now. No charge was started."); }
      } else {
        const key = `${getAccountNavigationTreeKey(authority)}:${a.id}:${cents}`;
        const id = bidRequests.get(key) ?? requestId(); bidRequests.set(key, id);
        await withGooglePlayAuctionBidEligibility({ feature: "event_auction", creatorId: a.creatorId, sourceId: a.id, amountMinor: cents }, async capabilityId => {
          if (!current() || !isVisible.current || latestSignature.current !== signature) throw new Error("Bid confirmation was closed.");
          return placeCreatorEventAuctionBid(a.id, cents, id, capabilityId);
        });
        if (current()) { setReview(null); setNotice("Bid confirmed. Refresh to check whether you remain the highest bidder."); await refresh(); }
      }
    } catch { if (current()) { setReview(null); setNotice("This action could not be confirmed. Refresh to check your current bid before trying again. No payment is taken by bidding."); } }
    finally { flight.current = false; if (current()) setBusy(false); }
  };
  const remaining = Math.max(0, Math.ceil((Date.parse(a.closesAt) - Date.parse(a.serverNow)) / 60000));
  const time = (value: string) => `${new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short", timeZone: a.terms.timeZone }).format(new Date(value))} (${a.terms.timeZone})`;
  return <View style={styles.card} testID="event-auction-card">
    <Text style={styles.title}>{a.environment === "test" ? "Test auction · " : ""}One virtual Event ticket</Text>
    <Text style={styles.body}>{a.terms.title} · {time(a.terms.startsAt)}{a.terms.endsAt ? ` to ${time(a.terms.endsAt)}` : ""}</Text>
    <Text style={styles.body}>{a.terms.description || "Admission to this exact virtual event."} {a.terms.replayPolicy === "none" ? "Live-only; replay is not included." : `Replay from ${time(a.terms.replayAvailableAt!)} until ${time(a.terms.replayExpiresAt!)}.`}</Text>
    <Text style={styles.body}>These are the auction’s recorded ticket terms. Later listing changes do not rewrite them. Cancellation or material schedule changes remain subject to ticket policy and provider refund review.</Text>
    <Text style={styles.body}>{a.highestAmountMinor ? `Current highest bid: ${money(a.highestAmountMinor)}` : `Starting price: ${money(a.startingAmountMinor)}`}</Text>
    <Text style={styles.body}>Closes {time(a.closesAt)}. {a.state === "open" ? `${remaining} minutes remaining at last server refresh; refresh for the authoritative result.` : `Status: ${a.state.replaceAll("_", " ")}.`}</Text>
    {a.myBidAmountMinor ? <Text accessibilityLiveRegion="polite" style={styles.body}>{a.isHighestBidder ? "You were the highest bidder at the last refresh. This is not a ticket." : `You have been outbid. Your last bid: ${money(a.myBidAmountMinor)}.`}</Text> : null}
    {a.state === "open" && a.environment === "test" ? <>
      <Text style={styles.body}>Next minimum: {money(a.nextBidAmountMinor)} · Minimum increase: {money(a.minIncrementMinor)}</Text>
      <TextInput style={styles.input} value={amount} onChangeText={text => { setAmount(text); setReview(null); }} editable={!busy} keyboardType="decimal-pad" accessibilityLabel="Your auction bid in USD" placeholder={formatCreatorTipAmountInput(a.nextBidAmountMinor)} placeholderTextColor="#9AA5B8" />
      {review !== null ? <><Text style={styles.body}>Review: bid {money(review)} for one virtual ticket. If you win, open checkout by {time(a.latestCheckoutStartAt)} and pay by {time(a.paymentDeadline)}. No VIP, physical seat, speaking or host access. No charge now.</Text><Action label={`Confirm bid ${money(review)}`} disabled={busy || !verified || !visible} onPress={() => void act(true)} /><Action label="Cancel bid review" disabled={busy} onPress={() => setReview(null)} /></> : <Action label="Review bid" disabled={busy || !verified || !visible} onPress={() => void act(false)} />}
    </> : null}
    {a.state === "open" && a.environment === "live" ? <Text style={styles.body}>Live auction bidding is not activated. No bid or payment can be started here.</Text> : null}
    {a.isWinner && a.state === "awarded" ? <><Text style={styles.body}>You won. Open checkout by {time(a.latestCheckoutStartAt)} and pay {money(a.awardAmountMinor ?? a.highestAmountMinor ?? a.startingAmountMinor)} by {time(a.paymentDeadline)}. We’ll check that payment is available for your account before opening checkout. Winning alone does not grant admission.</Text>{a.environment === "test" && Date.parse(a.serverNow) < Date.parse(a.latestCheckoutStartAt) ? <Action label="Continue to eligible test payment" disabled={busy || !verified || !visible} onPress={() => void pay()} /> : <Text style={styles.body}>{a.environment === "test" ? "The time to open a new checkout has passed. Refresh to check any payment already started." : "Live auction payments are not activated."}</Text>}</> : null}
    {a.state === "payment_pending" || a.state === "reconciliation_required" ? <Text style={styles.body}>Payment is being checked. Do not start another checkout. Refresh for confirmation; admission stays subject to verified ticket access.</Text> : null}
    {a.state === "payment_pending" && a.isWinner && a.environment === "test" ? <>
      <Text style={styles.body}>If you closed checkout, you can check the same saved payment attempt. This cannot start a new quote or charge. An unknown provider outcome stays under review.</Text>
      <Action label="Resume existing checkout" disabled={busy || !verified || !visible} onPress={() => void pay()} />
    </> : null}
    {a.state === "fulfilled" ? <Text style={styles.body}>Payment was recorded. Refresh your Event Pass access or check My Tickets to verify admission.</Text> : null}
    {notice ? <Text style={styles.body} accessibilityLiveRegion="polite">{notice}</Text> : null}
  </View>;
}
export function Action({ label, disabled, onPress }: { label: string; disabled: boolean; onPress: () => void }) {
  return <Pressable accessibilityRole="button" accessibilityLabel={label} accessibilityState={{ disabled, busy: disabled }} disabled={disabled} onPress={onPress} style={[styles.button, disabled && { opacity: 0.45 }]}><Text style={styles.buttonText}>{label}</Text></Pressable>;
}
export const styles = StyleSheet.create({
  panel: { padding: 16, gap: 12, backgroundColor: CHILLYWOOD_VISUAL.glassBackground, borderColor: CHILLYWOOD_VISUAL.glassBorder, borderWidth: 1, borderRadius: 16 }, card: { padding: 12, gap: 10, borderWidth: 1, borderColor: CHILLYWOOD_VISUAL.controlBorder, borderRadius: 12 },
  title: { color: CHILLYWOOD_VISUAL.textPrimary, fontSize: 18, fontWeight: "800" }, body: { color: CHILLYWOOD_VISUAL.textMuted, fontSize: 14, lineHeight: 20 },
  input: { minHeight: 48, padding: 12, borderWidth: 1, borderColor: CHILLYWOOD_VISUAL.controlBorder, borderRadius: 10, backgroundColor: CHILLYWOOD_VISUAL.controlBackground, color: CHILLYWOOD_VISUAL.textPrimary },
  button: { minHeight: 48, padding: 12, backgroundColor: CHILLYWOOD_VISUAL.controlBackground, borderColor: CHILLYWOOD_VISUAL.controlBorder, borderWidth: 1, borderRadius: 10, justifyContent: "center" }, buttonText: { color: CHILLYWOOD_VISUAL.textPrimary, fontWeight: "800" },
});
