import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Text, TextInput, View } from "react-native";
import { getCurrentAccountSessionAuthoritySnapshot, sameAccountSessionAuthority } from "../../_lib/accountSessionAuthority";
import { createCreatorRoomSeatAuction, prepareCreatorRoomSeatAuction, readPendingCreatorRoomSeatAuction } from "../../_lib/creatorRoomSeatAuctions";
import { parseCreatorTipAmount } from "../../_lib/creatorTipAmount";
import { EventAuctionTimeInput } from "./event-auction-time-input";
import { Action, styles } from "./room-seat-auction-panel";

export function RoomSeatAuctionEditor({ partyId, creatorId, sourceKind }: { partyId: string; creatorId: string; sourceKind: "stage_reserved_seat" | "party_admission" }) {
  const timeZone = useMemo(() => Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC", []);
  const [start, setStart] = useState(""); const [increment, setIncrement] = useState("1.00");
  const [close, setClose] = useState<string | null>(null); const [deadline, setDeadline] = useState<string | null>(null);
  const [review, setReview] = useState<Parameters<typeof createCreatorRoomSeatAuction>[0] | null>(null);
  const changeClose = useCallback((iso: string | null) => { setClose(iso); setReview(null); }, []);
  const changeDeadline = useCallback((iso: string | null) => { setDeadline(iso); setReview(null); }, []);
  const [busy, setBusy] = useState(false); const [notice, setNotice] = useState(""); const [saved, setSaved] = useState(false);
  const [pending, setPending] = useState<Parameters<typeof createCreatorRoomSeatAuction>[0] | null>(null);
  const [pendingChecked, setPendingChecked] = useState(false);
  const alive = useRef(true); const flight = useRef(false);
  useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);
  const checkPending = useCallback(async () => {
    const authority = getCurrentAccountSessionAuthoritySnapshot();
    if (!authority || authority.restoreOnly || authority.userId !== creatorId) return;
    setPendingChecked(false);
    try {
      const previous = await readPendingCreatorRoomSeatAuction(partyId, sourceKind);
      if (alive.current && sameAccountSessionAuthority(authority, getCurrentAccountSessionAuthoritySnapshot())) {
        setPending(previous); setPendingChecked(true);
      }
    } catch {
      if (alive.current && sameAccountSessionAuthority(authority, getCurrentAccountSessionAuthoritySnapshot())) setNotice("The previous request could not be checked. Retry the request check before creating an auction.");
    }
  }, [partyId, creatorId, sourceKind]);
  useEffect(() => { void checkPending(); }, [checkPending]);
  const recover = async () => {
    if (!pending || flight.current) return;
    const authority = getCurrentAccountSessionAuthoritySnapshot();
    if (!authority || authority.restoreOnly || authority.userId !== creatorId) return;
    flight.current = true; setBusy(true);
    try {
      const row = await createCreatorRoomSeatAuction(pending);
      if (alive.current && sameAccountSessionAuthority(authority, getCurrentAccountSessionAuthoritySnapshot())) {
        setPending(null); setSaved(true); setReview(null);
        setNotice(`Previous auction request confirmed: ${row.state.replaceAll("_", " ")}. Refresh the room auctions to see its result. This check did not create an auction for a different room session.`);
      }
    } catch {
      if (alive.current && sameAccountSessionAuthority(authority, getCurrentAccountSessionAuthoritySnapshot())) setNotice("The previous creation is still unconfirmed. Its original room session and terms are retained. Check again before starting another.");
    } finally { flight.current = false; if (alive.current) setBusy(false); }
  };
  const save = async (confirm = false) => {
    if (flight.current || saved || pending || !pendingChecked) return;
    const authority = getCurrentAccountSessionAuthoritySnapshot();
    if (!authority || authority.restoreOnly || authority.userId !== creatorId) { setNotice("Sign in as this room’s creator to create an auction."); return; }
    const current = () => alive.current && sameAccountSessionAuthority(authority, getCurrentAccountSessionAuthoritySnapshot());
    flight.current = true; setBusy(true); setNotice("");
    try {
      const startingAmountMinor = parseCreatorTipAmount(start); const minIncrementMinor = parseCreatorTipAmount(increment);
      if (!startingAmountMinor || !minIncrementMinor) throw new Error("Enter positive dollar amounts with no more than two decimal places.");
      const closesAt = close;
      const paymentDeadline = deadline;
      if (!closesAt || !paymentDeadline || Date.parse(paymentDeadline) <= Date.parse(closesAt)) throw new Error("Choose a payment deadline after the auction closes.");
      if (Date.parse(paymentDeadline) - Date.parse(closesAt) <= 31 * 60_000) throw new Error("Choose a payment deadline more than 31 minutes after closing, so the winner has time to open checkout. Allowing at least an hour gives them more time.");
      if (Date.parse(paymentDeadline) - Date.parse(closesAt) > 24 * 60 * 60_000) throw new Error("This checkout supports payment deadlines up to 24 hours after the auction closes. Choose an earlier payment deadline.");
      const session = confirm ? review : await prepareCreatorRoomSeatAuction(partyId, sourceKind);
      if (!current()) return;
      if (!session) throw new Error("Review this room session before creating the auction.");
      const input = { partyId, sourceKind, roomSessionId: session.roomSessionId, startingAmountMinor, minIncrementMinor, closesAt, paymentDeadline, environment: session.environment };
      if (!confirm) { setReview(input); return; }
      if (!review || JSON.stringify(review) !== JSON.stringify(input)) throw new Error("Review the updated auction terms before creating it.");
      await createCreatorRoomSeatAuction(review);
      if (current()) { setSaved(true); setNotice("Auction created. Refresh this room to review its current status. Bidding requires independently verified payment eligibility; creation does not activate payments."); }
    } catch (error) {
      if (current()) {
        setNotice(error instanceof Error ? error.message : "Creation could not be confirmed. Check this room’s auctions before retrying.");
        if (confirm) await checkPending();
      }
    }
    finally { flight.current = false; if (current()) setBusy(false); }
  };
  return <View style={styles.card} testID="room-seat-auction-editor">
    <Text style={styles.title}>{sourceKind === "stage_reserved_seat" ? "Auction a reserved Stage guest spot" : "Auction Party Room admission"}</Text>
    <Text style={styles.body}>Highest valid bid wins at the hard closing time. No bidding fees and no automatic charge. The winner pays separately before the deadline. No VIP or host rights. Admission included, with same-account rejoining for this room session. The host controls media approval and moderation.</Text>
    <Text style={styles.body}>Reserved Stage spots and Party Room admission are separate rights. The reservation ends when the creator ends this room session. No automatic refund is promised if delivery needs review. Dates and times below use {timeZone}.</Text>
    {pending ? <View style={styles.card}>
      <Text style={styles.body}>A previous auction creation is unconfirmed. Check its original room session and terms before creating another auction. Reopening a room does not move this request to the new session.</Text>
      <Action label="Check previous room auction" disabled={busy} onPress={() => void recover()} />
    </View> : null}
    {!pendingChecked ? <Action label="Retry previous request check" disabled={busy} onPress={() => void checkPending()} /> : null}
    {([["Starting price in USD", start, setStart], ["Minimum bid increase in USD", increment, setIncrement]] as const).map(([label, value, setter]) => <View key={label}><Text style={styles.body}>{label}</Text><TextInput accessibilityLabel={label} value={value} onChangeText={value => { setter(value); setReview(null); }} style={styles.input} editable={!busy && !saved} keyboardType="decimal-pad" /></View>)}
    <EventAuctionTimeInput label="Auction closes" timeZone={timeZone} disabled={busy || saved} onChange={changeClose} />
    <EventAuctionTimeInput label="Winner payment deadline" timeZone={timeZone} disabled={busy || saved} onChange={changeDeadline} />
    <Text style={styles.body}>Give your winner time to pay—allowing at least an hour after closing is recommended. Open checkout at least 31 minutes before the deadline: 30 minutes to pay, plus a minute to set it up. The room must remain available for the promised session.</Text>
    <Text style={styles.body}>For this checkout, choose a payment deadline more than 31 minutes and no more than 24 hours after closing.</Text>
    <Text style={styles.body}>Test-only auction; not a live payment activation.</Text>
    {review ? <View style={styles.card}><Text style={styles.title}>Review your auction</Text><Text style={styles.body}>{review.environment === "live" ? "Live auction: the winner may make a real payment after independent eligibility checks." : "Test auction: no real payment or payable earnings."}</Text><Text style={styles.body}>One reserved room-session spot · Starting bid ${(review.startingAmountMinor / 100).toFixed(2)} USD · Minimum increase ${(review.minIncrementMinor / 100).toFixed(2)} USD</Text>
      <Text style={styles.body}>Closes: {new Intl.DateTimeFormat(undefined, {dateStyle:"full", timeStyle:"long", timeZone}).format(new Date(review.closesAt))} ({timeZone})</Text>
      <Text style={styles.body}>Winner pays by: {new Intl.DateTimeFormat(undefined, {dateStyle:"full", timeStyle:"long", timeZone}).format(new Date(review.paymentDeadline))} ({timeZone})</Text>
      <Text style={styles.body}>Winner must open checkout by: {new Intl.DateTimeFormat(undefined, {dateStyle:"full", timeStyle:"long", timeZone}).format(new Date(Date.parse(review.paymentDeadline) - 31 * 60_000))} ({timeZone})</Text>
      <Text style={styles.body}>The winner has {Math.floor((Date.parse(review.paymentDeadline) - Date.parse(review.closesAt)) / 60_000) - 31} minutes after the auction closes to open checkout.{Date.parse(review.paymentDeadline) - Date.parse(review.closesAt) < 60 * 60_000 ? " This is a short window—consider giving them more time." : ""}</Text>
      <Text style={styles.body}>No bidding fee. No automatic charge. Review these dates carefully; the auction uses these exact terms.</Text>
      <Action label="Confirm and create room auction" disabled={busy || saved || !!pending || !pendingChecked} onPress={() => void save(true)} /><Action label="Edit auction review" disabled={busy || saved} onPress={() => setReview(null)} /></View> : <Action label="Review room auction" disabled={busy || saved || !!pending || !pendingChecked} onPress={() => void save()} />}
    {notice ? <Text style={styles.body} accessibilityLiveRegion="polite">{notice}</Text> : null}
  </View>;
}
