import React, { useCallback, useEffect, useRef, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { useIsFocused } from "@react-navigation/native";
import { getCurrentAccountSessionAuthoritySnapshot, sameAccountSessionAuthority, subscribeToAccountSessionAuthority, type AccountSessionAuthorityBinding } from "../../_lib/accountSessionAuthority";
import { captureIsolatedTestStoreV3Actions, type IsolatedTestStoreV3Actions } from "../../_lib/isolatedTestStoreV3Actions";
import { type PaidVideoCheckoutV3Data, type PaidVideoCheckoutV3Intent } from "../../_lib/isolatedPaidVideoCheckoutV3";
import { isIsolatedTestStoreV3Flavor } from "../../_lib/isolatedTestStoreV3Build";
import { IsolatedPaidVideoPlayer } from "./isolated-paid-video-player";
import { sameTestStoreV3Quote } from "../../_lib/isolatedTestStoreV3Contract";

type Snapshot = Awaited<ReturnType<IsolatedTestStoreV3Actions["snapshot"]>>;
function Action({ id, children, onPress, disabled = false }: { id: string; children: React.ReactNode; onPress(): void; disabled?: boolean }) {
  return <Pressable testID={id} accessibilityRole="button" accessibilityState={{ disabled }} disabled={disabled} onPress={onPress} style={[styles.button, disabled && styles.disabled]}><Text style={styles.text}>{children}</Text></Pressable>;
}
function Check({ id, children, checked, disabled, onPress }: { id: string; children: React.ReactNode; checked: boolean; disabled: boolean; onPress(): void }) {
  return <Pressable testID={id} accessibilityRole="checkbox" accessibilityState={{ checked, disabled }} disabled={disabled} onPress={onPress} style={[styles.button, disabled && styles.disabled]}><Text style={styles.text}>{checked ? "✓ " : "○ "}{children}</Text></Pressable>;
}
export function IsolatedTestStoreV3Checkout({ authority, offerId = null }: { authority: AccountSessionAuthorityBinding; offerId?: string | null }) {
  if (!isIsolatedTestStoreV3Flavor()) return null;
  return <Session key={`${authority.userId}:${authority.accountId}:${authority.sessionGeneration}:${authority.restoreOnly}:${offerId}`} authority={authority} offerId={offerId} />;
}
function Session({ authority: incoming, offerId }: { authority: AccountSessionAuthorityBinding; offerId: string | null }) {
  const [authority] = useState(() => Object.freeze({ ...incoming })), focused = useIsFocused();
  const [actions, setActions] = useState<IsolatedTestStoreV3Actions | null>(null), [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const [offer, setOffer] = useState<PaidVideoCheckoutV3Data["offer"] | null>(null), [history, setHistory] = useState<readonly PaidVideoCheckoutV3Intent[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [selectedIntent, setSelectedIntent] = useState<{ intent: PaidVideoCheckoutV3Intent; currentGrantId: string } | null>(null);
  const [playbackNotice, setPlaybackNotice] = useState<string | null>(null);
  const [notice, setNotice] = useState("Checking this dedicated test installation…"), [busy, setBusy] = useState(false);
  const [reviewedQuote, setReviewedQuote] = useState(""), [reviewedPurchase, setReviewedPurchase] = useState("");
  const [unknownAcknowledged, setUnknownAcknowledged] = useState<readonly string[]>([]);
  const alive = useRef(true), retired = useRef(false), running = useRef(false), incarnation = useRef(0), localSequence = useRef(0);
  const current = useCallback(() => alive.current && !retired.current && sameAccountSessionAuthority(authority, getCurrentAccountSessionAuthoritySnapshot()), [authority]);
  const refreshLocal = useCallback(async (source: IsolatedTestStoreV3Actions) => {
    const epoch = incarnation.current, sequence = ++localSequence.current, value = await source.snapshot();
    if (!current() || incarnation.current !== epoch || sequence !== localSequence.current) return;
    setSnapshot(value);
  }, [current]);
  useEffect(() => {
    // Capture the stable counter objects, not their changing values. Cleanup
    // invalidates only this incarnation; it never revives an auth-retired owner.
    const generation = incarnation, snapshots = localSequence;
    const epoch = ++generation.current; alive.current = true; let owned: IsolatedTestStoreV3Actions | null = null;
    const active = () => epoch === generation.current && current();
    running.current = true; setBusy(true); setActions(null); setSnapshot(null); setOffer(null); setHistory([]); setSelectedIntent(null);
    const unsubscribe = subscribeToAccountSessionAuthority(value => { if (!sameAccountSessionAuthority(authority, value)) {
      retired.current = true; localSequence.current++; setActions(null); setSnapshot(null); setOffer(null); setHistory([]); setSelectedIntent(null);
      setReviewedQuote(""); setReviewedPurchase(""); setNotice("Your account session changed. Reopen to read retained history. The native buyer identity was not switched.");
    } });
    void captureIsolatedTestStoreV3Actions(authority).then(async value => {
      if (!active()) { value.dispose(); return; } owned = value; setActions(value); await refreshLocal(value); if (!active()) return;
      if (offerId) { const response = await value.readOffer(offerId); if (active() && response.status === "ok") setOffer(response.data); }
      const response = await value.history(); if (active() && response.status === "ok") { setHistory(response.data.intents); setNextCursor(response.data.nextCursor); }
      if (active()) setNotice(value.nativeProcessRetired ? "This process can read retained history after an account change. New native purchases are unavailable."
        : "Review the exact test video and price before preparation. Preparing or checking history does not purchase anything.");
    }).catch(() => { if (active()) setNotice("Video checkout is unavailable. The current account, native profile or server connection could not be verified."); })
      .finally(() => { if (active()) { running.current = false; setBusy(false); } });
    return () => { if (generation.current === epoch) { alive.current = false; generation.current++; snapshots.current++; } owned?.dispose(); unsubscribe(); };
  }, [authority, current, offerId, refreshLocal]);
  const run = async (operation: (source: IsolatedTestStoreV3Actions, active: () => boolean) => Promise<void>, message: string) => {
    if (!actions || !current() || running.current) return;
    const epoch = incarnation.current, active = () => epoch === incarnation.current && current();
    running.current = true; setBusy(true); setNotice(message); localSequence.current++;
    try { await operation(actions, active); if (active()) setNotice("Saved status updated. Native completion, provider receipt and current playback access are checked separately."); }
    catch { if (active()) setNotice("The action could not be confirmed. Read saved status before continuing. No old purchase or unresolved preparation is automatically repeated."); }
    finally { if (active()) { try { await refreshLocal(actions); } catch { if (active()) setNotice("Saved state could not be read. Keep app storage and check again before another action."); }
      if (active()) { running.current = false; setBusy(false); } } }
  };
  const owner = snapshot?.owner, held = owner?.bindingObservation?.status === "held", disabled = !actions || !current() || busy;
  const nativeUnavailable = disabled || !!actions?.nativeProcessRetired || held;
  const pendingPreparation = snapshot?.preparations.some(({ attempt }) => attempt?.state !== "closed" && attempt?.state !== "not_applied"
    && (!attempt?.intentId || !snapshot.attempts.some(saved => saved.intentId === attempt.intentId && saved.initiationReleased))) ?? false;
  const quoteKey = offer ? JSON.stringify(offer.quote) : "";
  const selected = selectedIntent;
  const currentGrantHistory = selected && history.find(intent => intent.grantId === selected.currentGrantId);
  const currentGrantAttempt = currentGrantHistory && snapshot?.attempts.find(attempt => attempt.intentId === currentGrantHistory.id);
  const playbackBlocked = !!held || currentGrantAttempt?.observation?.status === "held"
    || !!currentGrantHistory?.receipt && currentGrantHistory.receipt.state !== "verified";
  return <View style={styles.panel} testID="paid-video-v3-checkout">
    <Text accessibilityRole="header" style={styles.heading}>Sandbox video purchases</Text>
    <Text style={styles.text}>Dedicated Test Store only. No payable earnings, payouts or cashout. Buying a video does not require Premium.</Text>
    <Text accessibilityLiveRegion="polite" style={styles.notice}>{notice}</Text>
    {held && <Text style={styles.notice}>Current provider evidence is held. New purchases and playback remain unavailable.</Text>}
    <Action id="paid-video-v3-bind" disabled={nativeUnavailable || !!owner?.customer} onPress={() => { void run(async source => { await source.bind(); }, "Checking the installation’s fixed buyer identity…"); }}>Connect this test installation</Action>
    <Action id="paid-video-v3-refresh" disabled={disabled} onPress={() => { void run(async (source, active) => {
      if (offerId) { const value = await source.readOffer(offerId); if (active()) { setOffer(value.status === "ok" ? value.data : null); setReviewedQuote(""); } }
      const result = await source.history(); if (active() && result.status === "ok") { setHistory(result.data.intents); setNextCursor(result.data.nextCursor); }
    }, "Reading current video offer and purchase history…"); }}>Read current offer and history</Action>
    {offer && <View style={styles.card}>
      <Text accessibilityRole="header" style={styles.heading}>Review test price</Text>
      <Text style={styles.text}>{(offer.quote.amountMinor / 100).toFixed(2)} {offer.quote.currency.toUpperCase()} · private MP4 video</Text>
      <Text style={styles.text}>The reviewed video version and price are retained together. A changed version requires a new review.</Text>
      {!offer.preparationAllowed && <Text style={styles.notice}>The server has not enabled preparation for this offer.</Text>}
      <Check id="paid-video-v3-review" checked={reviewedQuote === quoteKey} disabled={nativeUnavailable || !offer.preparationAllowed}
        onPress={() => setReviewedQuote(reviewedQuote === quoteKey ? "" : quoteKey)}>I reviewed this test video and price</Check>
      {pendingPreparation && <Text style={styles.notice}>A saved preparation still needs recovery, an explicit unallocated closure, or confirmed continuation before a new preparation.</Text>}
      <Action id="paid-video-v3-prepare" disabled={nativeUnavailable || pendingPreparation || !owner?.customer || owner.reservation?.activeAllocationId !== null || !offer.preparationAllowed || reviewedQuote !== quoteKey}
        onPress={() => { const reviewed = offer.quote; setReviewedQuote(""); void run(async source => { await source.prepareQuote(reviewed); }, "Saving the reviewed video preparation before sending it…"); }}>Prepare reviewed test purchase</Action>
    </View>}
    {snapshot?.preparations.map(preparation => <View key={preparation.requestId} style={styles.card}>
      <Text style={styles.text}>Saved preparation · {preparation.attempt?.state === "intent_prepared" ? "Exact video and price confirmed" : preparation.attempt?.state === "closed" ? "Unallocated preparation closed by server" : preparation.attempt?.state === "not_applied" ? "Not applied" : "Read status before continuing"}</Text>
      <Action id={`paid-video-v3-recover-${preparation.requestId}`} disabled={disabled} onPress={() => { void run(async source => { await source.recoverPreparation(preparation.requestId); }, "Reading the original preparation…"); }}>Read preparation status</Action>
      <Action id={`paid-video-v3-allocate-${preparation.requestId}`} disabled={nativeUnavailable || preparation.attempt?.state !== "intent_prepared" || preparation.sessionId !== authority.sessionGeneration
        || snapshot.attempts.some(attempt => attempt.intentId === preparation.attempt?.intentId)}
        onPress={() => { void run(async source => { await source.allocate(preparation); }, "Requesting the exact registered test offer…"); }}>Request registered test offer</Action>
      <Action id={`paid-video-v3-close-${preparation.requestId}`} disabled={disabled || !preparation.attempt?.intentId || preparation.attempt.state === "closed" || preparation.attempt.state === "not_applied"
        || snapshot.attempts.some(attempt => attempt.intentId === preparation.attempt?.intentId && (attempt.allocation !== null || attempt.nativePhase !== "unprepared"))}
        onPress={() => { void run(async source => { await source.closePreparation(preparation); }, "Checking that this exact preparation was never allocated before closing it…"); }}>Close unallocated preparation</Action>
    </View>)}
    {snapshot?.attempts.map(attempt => {
      const allocation = attempt.allocation, status = held ? "held" : attempt.observation?.status ?? "unknown";
      const purchaseKey = JSON.stringify([allocation, attempt.quote]), alreadyClaimed = attempt.operations.some(operation => operation.command === "claim");
      const canPurchase = !nativeUnavailable && attempt.sessionId === authority.sessionGeneration && attempt.nativePhase === "unprepared"
        && status === "offering_ready" && !!allocation?.registration && !alreadyClaimed && owner?.reservation?.activeAllocationId === allocation.id;
      const nativeCanContinue = attempt.nativePhase === "completed" || attempt.nativePhase === "prepared_closed";
      return <View key={attempt.allocationRequestId} style={styles.card}>
        <Text accessibilityRole="header" style={styles.heading}>Test purchase · {status}</Text>
        <Text style={styles.text}>Native window: {attempt.nativePhase}. A closed or canceled window does not establish a provider receipt.</Text>
        {attempt.nativePhase === "prepared" && <Text style={styles.notice}>A native Package was reserved before purchase invocation. Close that exact unused reservation before requesting a different purchase.</Text>}
        {attempt.nativePhase === "prepared_closed" && <Text style={styles.notice}>The old native Package can no longer be invoked. Server claim status and any earlier unknown result are checked separately.</Text>}
        <Action id={`paid-video-v3-status-${attempt.intentId}`} disabled={disabled} onPress={() => { void run(async source => { await source.recover(attempt); }, "Reading independent provider status…"); }}>Read purchase status</Action>
        <Check id={`paid-video-v3-purchase-review-${attempt.intentId}`} checked={reviewedPurchase === purchaseKey} disabled={!canPurchase}
          onPress={() => setReviewedPurchase(reviewedPurchase === purchaseKey ? "" : purchaseKey)}>Open the exact registered Test Store purchase window</Check>
        <Action id={`paid-video-v3-purchase-${attempt.intentId}`} disabled={!canPurchase || reviewedPurchase !== purchaseKey}
          onPress={() => { setReviewedPurchase(""); void run(async (source, active) => { await source.purchase(attempt, () => { if (active()) setNotice("The native test window opened. Independent provider confirmation is still required."); }); }, "Rechecking the exact native Package and one-use purchase claim…"); }}>Open Test Store purchase</Action>
        <Action id={`paid-video-v3-close-native-${attempt.intentId}`} disabled={nativeUnavailable || attempt.initiationReleased || !["prepared", "prepared_closed"].includes(attempt.nativePhase)}
          onPress={() => { void run(async source => { await source.closePreparedAllocation(attempt); }, "Closing only the unused native Package, then independently checking that the server never claimed this allocation…"); }}>Close unused native reservation</Action>
        {!attempt.initiationReleased && <>
          <Check id={`paid-video-v3-unknown-${attempt.intentId}`} checked={unknownAcknowledged.includes(attempt.intentId)} disabled={nativeUnavailable || !nativeCanContinue}
            onPress={() => setUnknownAcknowledged(values => values.includes(attempt.intentId) ? values.filter(id => id !== attempt.intentId) : [...values, attempt.intentId])}>Keep any unresolved earlier result in history when allowing another preparation</Check>
          <Action id={`paid-video-v3-advance-${attempt.intentId}`} disabled={nativeUnavailable || !nativeCanContinue}
            onPress={() => { void run(async source => { await source.advance(attempt, unknownAcknowledged.includes(attempt.intentId)); }, "Checking native completion and the server reservation before continuing…"); }}>Check whether another preparation is allowed</Action>
        </>}
      </View>;
    })}
    {snapshot?.preparedClosures.map(closure => <View key={closure.requestId} style={styles.card}>
      <Text style={styles.text}>{closure.state === "closed" ? "Server confirmed this exact allocation was unclaimed and fenced future claims." : "Server closure is unconfirmed. Missing recovery never establishes that no claim happened."}</Text>
      <Action id={`paid-video-v3-recover-native-close-${closure.requestId}`} disabled={disabled}
        onPress={() => { void run(async source => { await source.recoverPreparedClosure(closure.requestId); }, "Reading the original server closure without resending it…"); }}>Read original closure status</Action>
    </View>)}
    <Text accessibilityRole="header" style={styles.heading}>Server purchase history</Text>
    <Text style={styles.text}>A receipt is historical evidence. Current playback is authorized separately for each private range request.</Text>
    {playbackNotice && <Text accessibilityLiveRegion="polite" style={styles.notice}>{playbackNotice}</Text>}
    {history.map(intent => <View key={intent.id} style={styles.card}>
      <Text style={styles.text}>{(intent.quote.amountMinor / 100).toFixed(2)} {intent.quote.currency.toUpperCase()} · {intent.receipt?.state ?? intent.state}</Text>
      <Action id={`paid-video-v3-playback-${intent.id}`} disabled={disabled || held}
        onPress={() => { setSelectedIntent(null); setPlaybackNotice("Current video access has not been verified."); void run(async (source, active) => {
          const response = await source.resolvePlayback(intent.id);
          if (!active()) return;
          if (response.status !== "ok" || !sameTestStoreV3Quote(intent.quote, response.data.intent.quote)) throw new Error("playback_resolution_unavailable");
          if (!response.data.currentGrantId) { setPlaybackNotice("No current playback grant is available for this exact video. Your purchase history is retained."); return; }
          setPlaybackNotice(null);
          setSelectedIntent({ intent: response.data.intent, currentGrantId: response.data.currentGrantId });
        }, "Resolving your current grant for this exact video. A historical receipt’s grant may no longer be selected…"); }}>Check current private playback</Action>
    </View>)}
    <Action id="paid-video-v3-more-history" disabled={disabled || !nextCursor} onPress={() => { void run(async (source, active) => {
      const response = await source.history(nextCursor); if (!active() || response.status !== "ok") return;
      setHistory(prior => [...new Map([...prior, ...response.data.intents].map(intent => [intent.id, intent])).values()]); setNextCursor(response.data.nextCursor);
    }, "Reading retained purchase history…"); }}>Load more purchases</Action>
    {selected && <IsolatedPaidVideoPlayer key={`${selected.intent.id}:${selected.currentGrantId}:${JSON.stringify(selected.intent.quote)}`} authority={authority}
      selection={{ resourceId: selected.intent.quote.resourceId, grantId: selected.currentGrantId, quote: selected.intent.quote }} focused={focused} blocked={playbackBlocked} />}
  </View>;
}
const styles = StyleSheet.create({ panel: { gap: 12, paddingVertical: 16 }, card: { gap: 10, padding: 14, backgroundColor: "#142235", borderRadius: 12 },
  heading: { color: "#fff", fontSize: 19, fontWeight: "700" }, text: { color: "#dce6f2", fontSize: 16, lineHeight: 24 }, notice: { color: "#ffe0a1", fontSize: 16, lineHeight: 24 },
  button: { minHeight: 48, justifyContent: "center", padding: 12, backgroundColor: "#2b547a", borderRadius: 8 }, disabled: { opacity: 0.45 } });
