import React, { useCallback, useEffect, useRef, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { getCurrentAccountSessionAuthoritySnapshot, sameAccountSessionAuthority, subscribeToAccountSessionAuthority, type AccountSessionAuthorityBinding } from "../../_lib/accountSessionAuthority";
import { type TipOffer } from "../../_lib/isolatedSandboxTips";
import { captureIsolatedTestStoreV2Actions, type IsolatedTestStoreV2Actions } from "../../_lib/isolatedTestStoreV2Actions";
import { isIsolatedTestStoreV2Flavor } from "../../_lib/isolatedTestStoreV2Build";
import { type IsolatedTestStoreV2Attempt } from "../../_lib/isolatedTestStoreV2Attempts";
import { isolatedTipMoney } from "./isolated-tip-receipt";

type Snapshot = Awaited<ReturnType<IsolatedTestStoreV2Actions["snapshot"]>>;
function Action({ id, children, onPress, disabled = false }: { id: string; children: React.ReactNode; onPress(): void; disabled?: boolean }) {
  return <Pressable testID={id} accessibilityRole="button" accessibilityState={{ disabled }} disabled={disabled} onPress={onPress} style={styles.button}><Text style={styles.text}>{children}</Text></Pressable>;
}
function Check({ id, children, checked, disabled = false, onPress }: { id: string; children: React.ReactNode; checked: boolean; disabled?: boolean; onPress(): void }) {
  return <Pressable testID={id} accessibilityRole="checkbox" accessibilityState={{ checked, disabled }} disabled={disabled} onPress={onPress} style={styles.button}><Text style={styles.text}>{children}</Text></Pressable>;
}
export function IsolatedTestStoreV2Checkout(props: { authority: AccountSessionAuthorityBinding; offer: TipOffer | null }) {
  if (!isIsolatedTestStoreV2Flavor()) return null;
  return <Session key={`${props.authority.userId}:${props.authority.accountId}:${props.authority.sessionGeneration}:${props.authority.restoreOnly}`} {...props} />;
}
function Session({ authority: incomingAuthority, offer }: { authority: AccountSessionAuthorityBinding; offer: TipOffer | null }) {
  const [authority] = useState(() => Object.freeze({ ...incomingAuthority }));
  const [actions, setActions] = useState<IsolatedTestStoreV2Actions | null>(null), [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const [busy, setBusy] = useState(false), [notice, setNotice] = useState("Checking this dedicated DEBUG installation…");
  const [reviewedQuote, setReviewedQuote] = useState(""), [reviewedPurchase, setReviewedPurchase] = useState("");
  const [unknownAcknowledged, setUnknownAcknowledged] = useState<string[]>([]);
  const [recoveryAvailable, setRecoveryAvailable] = useState(true); const recoveryAllowed = useRef(true);
  const [recovering, setRecovering] = useState(false); const recoveryCount = useRef(0);
  const alive = useRef(true), retired = useRef(false), running = useRef(false), localSequence = useRef(0), incarnation = useRef(0);
  const current = useCallback(() => alive.current && !retired.current && sameAccountSessionAuthority(authority, getCurrentAccountSessionAuthoritySnapshot()), [authority]);
  const refresh = useCallback(async (source: IsolatedTestStoreV2Actions) => {
    const epoch = incarnation.current, sequence = ++localSequence.current; const value = await source.snapshot();
    if (!current() || epoch !== incarnation.current || sequence !== localSequence.current) return null;
    setSnapshot(value); return value;
  }, [current]);
  useEffect(() => {
    const epochRef = incarnation, snapshotRef = localSequence;
    const epoch = ++incarnation.current; alive.current = true; let owned: IsolatedTestStoreV2Actions | null = null;
    const active = () => epoch === incarnation.current && current();
    running.current = false; recoveryCount.current = 0; recoveryAllowed.current = true;
    setActions(null); setBusy(false); setRecovering(false); setRecoveryAvailable(true);
    const unsubscribe = subscribeToAccountSessionAuthority(next => {
      if (!sameAccountSessionAuthority(authority, next)) {
        retired.current = true; localSequence.current++; setSnapshot(null); setActions(null); setReviewedQuote(""); setReviewedPurchase("");
        setNotice("Your account session changed. Reopen this view to read retained history. The native buyer identity has not changed.");
      }
    });
    void captureIsolatedTestStoreV2Actions(authority).then(async value => {
      if (!active()) { value.dispose(); return; }
      owned = value; setActions(value); await refresh(value);
      if (active()) setNotice(value.nativeProcessRetired ? "This process is recovery-only after an account change. Provider identity switching is unavailable." : "Connect this installation, review a tip, then wait for its exact registered Offering. No purchase happens during preparation.");
    }).catch(() => { if (active()) setNotice("Test Store v2 is unavailable. The native profile, current account or saved installation could not be verified."); });
    return () => { if (epochRef.current === epoch) { alive.current = false; epochRef.current++; snapshotRef.current++; } owned?.dispose(); unsubscribe(); };
  }, [authority, current, refresh]);
  const run = async (operation: (value: IsolatedTestStoreV2Actions, epoch: number) => Promise<unknown>, pending: string) => {
    if (!actions || !current() || running.current || recoveryCount.current > 0) return;
    const epoch = incarnation.current, active = () => epoch === incarnation.current && current();
    running.current = true; recoveryAllowed.current = false; setRecoveryAvailable(false); setBusy(true); setNotice(pending); localSequence.current++;
    try { await operation(actions, epoch); if (active()) setNotice("Saved state updated. Review the status below; native completion and receipt confirmation are separate."); }
    catch (error) { if (active()) setNotice(error instanceof Error && error.message === "isolated_test_store_v2_package_unavailable"
      ? "The exact registered Package is not available in the native cache yet. Check status and explicitly try the lookup later. This lookup did not send a new claim."
      : "The action could not be confirmed. Check saved status. No old purchase was repeated, and no missing receipt was treated as no charge."); }
    finally { if (active()) { running.current = false; recoveryAllowed.current = true; setBusy(false); setRecoveryAvailable(true); await refresh(actions).catch(() => { if (active()) setNotice("Saved state is unavailable. Keep app storage and check again before another action."); }); } }
  };
  const allowNativeRecovery = (epoch: number) => { if (epoch === incarnation.current && current() && running.current) { recoveryAllowed.current = true; setRecoveryAvailable(true); } };
  const recover = async (attempt: IsolatedTestStoreV2Attempt) => {
    if (!actions || !current() || !recoveryAllowed.current) return;
    const epoch = incarnation.current, active = () => epoch === incarnation.current && current();
    recoveryCount.current++; setRecovering(true); localSequence.current++;
    try { await actions.recover(attempt); if (active()) await refresh(actions); }
    catch { if (active()) setNotice("Current status is unavailable. Original requests, native ownership and earlier receipt history remain saved."); }
    finally { if (epoch === incarnation.current) { recoveryCount.current--; if (current()) setRecovering(recoveryCount.current > 0); } }
  };
  const quote = offer?.kind === "creator_tip" && offer.available && offer.currency === "usd" && offer.creatorId !== authority.userId ? {
    offerId: offer.id, offerRevision: offer.revision, resourceId: offer.resourceId, resourceRevision: offer.resourceRevision,
    creatorId: offer.creatorId, kind: "creator_tip" as const, amountMinor: offer.amountMinor, currency: offer.currency,
  } : null;
  const quoteKey = quote ? JSON.stringify(quote) : "";
  const owner = snapshot?.owner, activeId = owner?.reservation?.activeAllocationId;
  const uncontinuedPreparation = snapshot?.preparations.some(p => p.attempt?.state !== "abandoned" && p.attempt?.state !== "not_applied"
    && !snapshot.attempts.some(a => a.intentId === p.attempt?.intentId && a.initiationReleased));
  const mutationBusy = busy || recovering;
  const canPrepare = !!actions && !!owner?.customer && owner.bindingObservation?.status !== "held" && activeId === null && !uncontinuedPreparation && !mutationBusy && !actions.nativeProcessRetired;
  return <View style={styles.card} testID="isolated-test-store-v2-panel">
    <Text accessibilityRole="header" style={styles.title}>Registered Test Store checkout</Text>
    <Text style={styles.text}>RevenueCat Test Store simulation only. This does not charge Apple or Google. Live money, payouts and cashout stay off. Buying a tip does not require Premium.</Text>
    <Text style={styles.text}>This installation keeps one buyer identity. Each new tip uses a separate intent and registered Offering. Restart and account changes never replay an old purchase.</Text>
    <Text accessibilityLiveRegion="polite" style={styles.text}>{notice}</Text>
    <Action id="isolated-test-store-v2-bind" disabled={!actions || mutationBusy} onPress={() => void run(a => a.bind(), "Checking this installation's immutable server binding…")}>{owner?.customer ? "Check installation binding" : "Connect Test Store installation"}</Action>
    {owner?.bindingObservation?.status === "held" ? <Text style={styles.text}>This installation has a server review hold. Earlier receipt history remains saved, but purchase and continuation are unavailable.</Text> : null}
    {owner?.bindingObservation?.allocation && !snapshot?.attempts.some(a => a.allocation?.id === owner.bindingObservation?.allocation?.id) ? <View style={styles.section}>
      <Text style={styles.title}>Retained server attempt</Text>
      <Text style={styles.text}>{isolatedTipMoney(owner.bindingObservation.allocation.quote.amountMinor, owner.bindingObservation.allocation.quote.currency)} · {owner.bindingObservation.status}</Text>
      <Text style={styles.text}>This server record has no matching local mutation journal. It is read-only; no original claim or purchase permission will be reconstructed.</Text>
      <Action id="isolated-test-store-v2-recover-binding" disabled={mutationBusy} onPress={() => void run(a => a.recoverBinding(), "Reading the exact retained server attempt…")}>Read retained attempt</Action>
    </View> : null}
    {quote ? <View style={styles.section}>
      <Text style={styles.title}>Review this tip</Text><Text style={styles.text}>{isolatedTipMoney(quote.amountMinor, quote.currency)} · Recipient {quote.creatorId}</Text>
      <Text style={styles.text}>Offer revision {quote.offerRevision} · Resource revision {quote.resourceRevision}</Text>
      <Check id="isolated-test-store-v2-review-quote" checked={reviewedQuote === quoteKey} disabled={!canPrepare} onPress={() => setReviewedQuote(v => v === quoteKey ? "" : quoteKey)}>I reviewed the recipient, amount and versions</Check>
      <Action id="isolated-test-store-v2-prepare-quote" disabled={!canPrepare || reviewedQuote !== quoteKey} onPress={() => { setReviewedQuote(""); void run(a => a.prepareQuote(quote), "Saving the exact reviewed quote before preparing an intent…"); }}>Prepare a new tip</Action>
    </View> : <Text style={styles.text}>Open an available USD tip offer to review a new purchase.</Text>}
    {snapshot?.preparations.map(p => {
      const linked = snapshot.attempts.find(a => a.intentId === p.attempt?.intentId);
      return <View style={styles.section} key={p.requestId}>
        <Text style={styles.text}>Saved quote · {p.attempt?.state === "intent_prepared" ? "Exact server quote confirmed" : p.attempt?.state === "abandoned" ? "Undispatched closure recorded" : p.attempt?.state === "not_applied" ? "Request not sent" : "Outcome requires recovery"}</Text>
        <Text style={styles.text}>{isolatedTipMoney(p.quote.amountMinor, p.quote.currency)} · No purchase receipt is implied.</Text>
        <Action id={`isolated-test-store-v2-recover-quote-${p.requestId}`} onPress={() => void run(a => a.recoverPreparation(p.requestId), "Reading the original quote request without repeating it…")} disabled={mutationBusy}>Check quote preparation</Action>
        {p.attempt?.state === "intent_prepared" && !linked ? <Action id={`isolated-test-store-v2-allocate-${p.requestId}`} disabled={mutationBusy || activeId !== null} onPress={() => void run(a => a.allocate(p), "Requesting a separate registered Offering for this exact intent…")}>Request an Offering for this tip</Action> : null}
        {p.attempt?.intentId && !linked && ["unknown", "intent_prepared"].includes(p.attempt.state) ? <Action id={`isolated-test-store-v2-close-quote-${p.requestId}`} disabled={mutationBusy} onPress={() => void run(a => a.closePreparation(p), "Requesting exact server proof that this intent never dispatched…")}>Request undispatched closure</Action> : null}
      </View>;
    })}
    {snapshot?.attempts.map(attempt => {
      const allocation = attempt.allocation, held = owner?.bindingObservation?.status === "held" || attempt.observation?.status === "held", receipt = attempt.observation?.receipt;
      const canPurchase = !!allocation?.registration && attempt.observation?.status === "offering_ready" && activeId === allocation.id
        && owner?.bindingObservation?.status !== "held" && !attempt.operations.some(o => o.command === "claim") && !actions?.nativeProcessRetired;
      const canAdvance = !!allocation && attempt.nativePhase === "completed" && activeId === allocation.id && !held
        && !attempt.operations.some(o => o.command === "advance");
      const ack = unknownAcknowledged.includes(attempt.allocationRequestId);
      return <View style={styles.section} key={attempt.allocationRequestId} testID={`isolated-test-store-v2-attempt-${attempt.allocationRequestId}`}>
        <Text style={styles.title}>{held ? "Server review hold" : receipt ? `Server receipt: ${receipt.state}` : attempt.observation?.status === "provisioning" ? "Offering registration pending" : "Receipt unconfirmed"}</Text>
        <Text style={styles.text}>{isolatedTipMoney(attempt.quote.amountMinor, attempt.quote.currency)} · Recipient {attempt.quote.creatorId}</Text>
        {(!receipt || held) && attempt.receiptObservation?.receipt ? <Text style={styles.text}>Earlier server receipt: {attempt.receiptObservation.receipt.state}. It does not clear a current hold or unavailable status.</Text> : null}
        <Text style={styles.text}>{attempt.nativePhase === "completed" ? "Native invocation completion is saved. It is not receipt or no-charge evidence." : attempt.nativePhase === "unprepared" ? "No native completion is recorded." : "The native invocation has not been confirmed complete. Another purchase cannot open."}</Text>
        <Action id={`isolated-test-store-v2-recover-${attempt.allocationRequestId}`} disabled={!recoveryAvailable} onPress={() => void recover(attempt)}>Check provider and native status</Action>
        {canPurchase ? <>
          <Check id={`isolated-test-store-v2-review-purchase-${attempt.allocationRequestId}`} checked={reviewedPurchase === attempt.allocationRequestId} disabled={mutationBusy} onPress={() => setReviewedPurchase(v => v === attempt.allocationRequestId ? "" : attempt.allocationRequestId)}>I want to open this exact Test Store simulation</Check>
          <Action id={`isolated-test-store-v2-purchase-${attempt.allocationRequestId}`} disabled={mutationBusy || reviewedPurchase !== attempt.allocationRequestId} onPress={() => { setReviewedPurchase(""); void run((a, epoch) => a.purchase(attempt, () => allowNativeRecovery(epoch)), "Checking the exact native Package and requesting a fresh one-use claim…"); }}>Open reviewed Test Store purchase</Action>
        </> : null}
        {canAdvance ? <>
          {!receipt ? <Check id={`isolated-test-store-v2-acknowledge-${attempt.allocationRequestId}`} checked={ack} disabled={mutationBusy} onPress={() => setUnknownAcknowledged(v => ack ? v.filter(id => id !== attempt.allocationRequestId) : [...v, attempt.allocationRequestId])}>I understand the previous outcome is still unknown. A new tip is separate and could create additional support; it will not retry or cancel this one.</Check> : <Text style={styles.text}>The recorded receipt remains in history. Continuing only releases the slot for a separate new tip.</Text>}
          <Action id={`isolated-test-store-v2-advance-${attempt.allocationRequestId}`} disabled={mutationBusy || (!receipt && !ack)} onPress={() => void run(a => a.advance(attempt, ack), "Requesting a version-checked continuation while retaining the original outcome…")}>Keep history and allow a new tip</Action>
        </> : null}
        {attempt.initiationReleased ? <Text style={styles.text}>The initiation slot was released. The receipt or unknown outcome remains in history.</Text> : null}
      </View>;
    })}
  </View>;
}
const styles = StyleSheet.create({ card: { padding: 16, gap: 12, backgroundColor: "#17171f", borderRadius: 12 }, title: { color: "#fff", fontSize: 20, fontWeight: "700" }, text: { color: "#eee", fontSize: 16, lineHeight: 23 }, button: { minHeight: 44, justifyContent: "center", padding: 10, borderWidth: 1, borderColor: "#777", borderRadius: 8 }, section: { gap: 10, paddingTop: 12 } });
