import React, { useCallback, useEffect, useRef, useState } from "react";
import { Text, TextInput, View } from "react-native";
import { getCurrentAccountSessionAuthoritySnapshot, sameAccountSessionAuthority } from "../../_lib/accountSessionAuthority";
import { createCreatorEventAuction, readCreatorEventAuctionCreationMode } from "../../_lib/creatorEventAuctions";
import { parseCreatorTipAmount } from "../../_lib/creatorTipAmount";
import { EventAuctionTimeInput } from "./event-auction-time-input";
import type { CreatorEventSummary } from "../../_lib/liveEvents";
import type { PaidCreatorEventOffer } from "../../_lib/paidCreatorEvents";
import { Action, styles } from "./event-auction-panel";

export function EventAuctionEditor({ event, offer }: { event: CreatorEventSummary; offer: PaidCreatorEventOffer | null }) {
  const [start, setStart] = useState(""); const [increment, setIncrement] = useState("1.00");
  const [close, setClose] = useState<string | null>(null); const [deadline, setDeadline] = useState<string | null>(null);
  const [review, setReview] = useState<Parameters<typeof createCreatorEventAuction>[0] | null>(null);
  const changeClose = useCallback((iso: string | null) => { setClose(iso); setReview(null); }, []);
  const changeDeadline = useCallback((iso: string | null) => { setDeadline(iso); setReview(null); }, []);
  const [busy, setBusy] = useState(false); const [notice, setNotice] = useState(""); const [saved, setSaved] = useState(false);
  const alive = useRef(true); const flight = useRef(false);
  useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);
  const save = async (confirm = false) => {
    if (flight.current || !offer?.termsRevisionId || saved) return;
    const authority = getCurrentAccountSessionAuthoritySnapshot();
    if (!authority || authority.userId !== event.hostUserId) { setNotice("Sign in as this event’s creator to create an auction."); return; }
    const current = () => alive.current && sameAccountSessionAuthority(authority, getCurrentAccountSessionAuthoritySnapshot());
    flight.current = true; setBusy(true); setNotice("");
    try {
      const startingAmountMinor = parseCreatorTipAmount(start); const minIncrementMinor = parseCreatorTipAmount(increment);
      if (!startingAmountMinor || !minIncrementMinor) throw new Error("Enter positive dollar amounts with no more than two decimal places.");
      const closesAt = close;
      const paymentDeadline = deadline;
      if (!closesAt || !paymentDeadline || Date.parse(paymentDeadline) <= Date.parse(closesAt)) throw new Error("Choose a payment deadline after the auction closes.");
      if (!event.startsAt || Date.parse(paymentDeadline) >= Date.parse(event.startsAt)) throw new Error("The winner’s payment deadline must be before the event starts.");
      if (Date.parse(paymentDeadline) - Date.parse(closesAt) <= 31 * 60_000) throw new Error("Choose a payment deadline more than 31 minutes after closing, so the winner has time to open checkout. Allowing at least an hour gives them more time.");
      if (Date.parse(paymentDeadline) - Date.parse(closesAt) > 24 * 60 * 60_000) throw new Error("This checkout supports payment deadlines up to 24 hours after the auction closes. Choose an earlier payment deadline.");
      const mode = confirm ? review?.environment : await readCreatorEventAuctionCreationMode();
      if (!current() || !mode) return;
      const input = { eventId: event.id, revisionId: offer.termsRevisionId, startingAmountMinor, minIncrementMinor, closesAt, paymentDeadline, environment: mode };
      if (!confirm) { setReview(input); return; }
      if (!review || JSON.stringify(review) !== JSON.stringify(input)) throw new Error("Review the updated auction terms before creating it.");
      await createCreatorEventAuction(review);
      if (current()) { setSaved(true); setNotice("Auction created. Open the event and refresh to review its current status. Bidding requires independently verified payment eligibility; creation does not activate payments."); }
    } catch (error) { if (current()) setNotice(error instanceof Error ? error.message : "Creation could not be confirmed. Check the event’s auctions before retrying."); }
    finally { flight.current = false; if (current()) setBusy(false); }
  };
  return <View style={styles.card} testID="event-auction-editor">
    <Text style={styles.title}>Auction one virtual ticket</Text>
    <Text style={styles.body}>Highest valid bid wins at the hard closing time. No bidding fees and no automatic charge. The winner pays separately before the deadline. No VIP, physical seat, speaking or host access.</Text>
    <Text style={styles.body}>Uses this event’s saved ticket and replay terms. Choose each date and time below in {event.timeZone}.</Text>
    {([["Starting price in USD", start, setStart], ["Minimum bid increase in USD", increment, setIncrement]] as const).map(([label, value, setter]) => <View key={label}><Text style={styles.body}>{label}</Text><TextInput accessibilityLabel={label} value={value} onChangeText={value => { setter(value); setReview(null); }} style={styles.input} editable={!busy && !saved} keyboardType="decimal-pad" /></View>)}
    <EventAuctionTimeInput label="Auction closes" timeZone={event.timeZone} disabled={busy || saved} onChange={changeClose} />
    <EventAuctionTimeInput label="Winner payment deadline" timeZone={event.timeZone} disabled={busy || saved} onChange={changeDeadline} />
    <Text style={styles.body}>Give your winner time to pay—allowing at least an hour after closing is recommended. Open checkout at least 31 minutes before the deadline: 30 minutes to pay, plus a minute to set it up. Payment must finish before the event starts.</Text>
    <Text style={styles.body}>For this checkout, choose a payment deadline more than 31 minutes and no more than 24 hours after closing.</Text>
    {!offer?.termsRevisionId ? <Text style={styles.body}>Publish saved ticket terms first. Auctions are unavailable until the exact ticket revision is verified.</Text> : null}
    <Text style={styles.body}>{offer?.status === "active" ? "Live auction authoring; payment eligibility remains separately gated." : "Test-only auction; not a live payment activation."}</Text>
    {review ? <View style={styles.card}><Text style={styles.title}>Review your auction</Text><Text style={styles.body}>{review.environment === "live" ? "Live auction: the winner may make a real payment after independent eligibility checks." : "Test auction: no real payment or payable earnings."}</Text><Text style={styles.body}>One virtual Event ticket · Starting bid ${(review.startingAmountMinor / 100).toFixed(2)} USD · Minimum increase ${(review.minIncrementMinor / 100).toFixed(2)} USD</Text>
      <Text style={styles.body}>Closes: {new Intl.DateTimeFormat(undefined, {dateStyle:"full", timeStyle:"long", timeZone:event.timeZone}).format(new Date(review.closesAt))}</Text>
      <Text style={styles.body}>Winner pays by: {new Intl.DateTimeFormat(undefined, {dateStyle:"full", timeStyle:"long", timeZone:event.timeZone}).format(new Date(review.paymentDeadline))}</Text>
      <Text style={styles.body}>Winner must open checkout by: {new Intl.DateTimeFormat(undefined, {dateStyle:"full", timeStyle:"long", timeZone:event.timeZone}).format(new Date(Date.parse(review.paymentDeadline) - 31 * 60_000))}</Text>
      <Text style={styles.body}>The winner has {Math.floor((Date.parse(review.paymentDeadline) - Date.parse(review.closesAt)) / 60_000) - 31} minutes after the auction closes to open checkout.{Date.parse(review.paymentDeadline) - Date.parse(review.closesAt) < 60 * 60_000 ? " This is a short window—consider giving them more time." : ""}</Text>
      <Text style={styles.body}>No bidding fee. No automatic charge. Review these dates carefully; the auction uses these exact terms.</Text>
      <Action label="Confirm and create ticket auction" disabled={busy || saved} onPress={() => void save(true)} /><Action label="Edit auction review" disabled={busy || saved} onPress={() => setReview(null)} /></View> : <Action label="Review ticket auction" disabled={busy || saved || !offer?.termsRevisionId} onPress={() => void save()} />}
    {notice ? <Text style={styles.body} accessibilityLiveRegion="polite">{notice}</Text> : null}
  </View>;
}
