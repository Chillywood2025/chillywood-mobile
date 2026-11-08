import React, { useCallback, useEffect, useRef, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { getCurrentAccountSessionAuthoritySnapshot, sameAccountSessionAuthority, subscribeToAccountSessionAuthority, type AccountSessionAuthorityBinding } from "../../_lib/accountSessionAuthority";
import { type IsolatedSandboxTipCheckoutAttempt } from "../../_lib/isolatedSandboxTipCheckoutAttempts";
import { newTipRequestId } from "../../_lib/isolatedSandboxTips";
import { isIsolatedTestStoreFlavor, readIsolatedTestStoreBuild } from "../../_lib/isolatedTestStoreBuild";
import { captureIsolatedTestStoreClient, type IsolatedTestStoreClient } from "../../_lib/isolatedTestStore";
import { createIsolatedTestStoreAttemptJournal, type IsolatedTestStoreAttempt } from "../../_lib/isolatedTestStoreAttempts";
import { runIsolatedTestStoreRehearsal } from "../../_lib/isolatedTestStoreRehearsal";
import { isolatedTipMoney } from "./isolated-tip-receipt";

export function IsolatedTestStoreCheckout(props: { authority: AccountSessionAuthorityBinding; preparation: IsolatedSandboxTipCheckoutAttempt | null }) {
  if (!isIsolatedTestStoreFlavor()) return null;
  return <TestStoreSession key={`${props.authority.userId}:${props.authority.accountId}:${props.authority.sessionGeneration}:${props.authority.restoreOnly}`} {...props} />;
}
function TestStoreSession({ authority: incomingAuthority, preparation }: { authority: AccountSessionAuthorityBinding; preparation: IsolatedSandboxTipCheckoutAttempt | null }) {
  const [authority] = useState(() => Object.freeze({ ...incomingAuthority }));
  const [build] = useState(readIsolatedTestStoreBuild);
  const [journal] = useState(() => build ? createIsolatedTestStoreAttemptJournal({ userId: authority.userId, configurationDigest: build.configId }) : null);
  const [client, setClient] = useState<IsolatedTestStoreClient | null>(null);
  const [attempts, setAttempts] = useState<readonly IsolatedTestStoreAttempt[]>([]);
  const [reserved, setReserved] = useState(true); const [ready, setReady] = useState(false);
  const [reviewed, setReviewed] = useState(false); const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("Checking the dedicated Test Store connection…");
  const alive = useRef(true); const retired = useRef(false); const running = useRef(false); const readSequence = useRef(0); const localSequence = useRef(0); const incarnation = useRef(0);
  const current = useCallback(() => alive.current && !retired.current && sameAccountSessionAuthority(authority, getCurrentAccountSessionAuthoritySnapshot()), [authority]);
  const refreshLocal = useCallback(async () => {
    if (!journal) return null;
    const epoch = incarnation.current, sequence = ++localSequence.current;
    const [rows, reservation] = await Promise.all([journal.list(), journal.readGlobalReservation()]);
    if (!current() || epoch !== incarnation.current || sequence !== localSequence.current) return null;
    setAttempts(rows); setReserved(reservation.reserved); setReady(true); return rows;
  }, [current, journal]);
  useEffect(() => {
    const epochRef = incarnation, snapshotRef = localSequence;
    const epoch = ++incarnation.current; alive.current = true; let owned: IsolatedTestStoreClient | null = null;
    const active = () => epoch === incarnation.current && current();
    setClient(null); setReady(false);
    const unsubscribe = subscribeToAccountSessionAuthority(next => { if (!sameAccountSessionAuthority(authority, next)) { retired.current = true; localSequence.current++; setClient(null); setReady(false); setAttempts([]); setNotice("Your account session changed. Reopen this view to read retained status."); } });
    if (build) void captureIsolatedTestStoreClient(authority, build.configId).then(async value => {
      if (!active()) { value.dispose(); return; } owned = value; setClient(value); await refreshLocal();
      if (active()) setNotice("This dedicated DEBUG build can request one Test Store rehearsal. Server qualification is checked before the purchase simulation opens.");
    }).catch(() => { if (active()) { setReady(false); setNotice("Test Store is unavailable. Current account or saved recovery could not be verified."); } });
    else setNotice("Test Store is unavailable. This build has no qualified native DEBUG configuration.");
    return () => { if (epochRef.current === epoch) { alive.current = false; epochRef.current++; snapshotRef.current++; } owned?.dispose(); unsubscribe(); };
  }, [authority, build, current, refreshLocal]);
  useEffect(() => { setReviewed(false); }, [preparation?.requestId]);
  const start = async () => {
    if (!current() || !journal || !client || !ready || reserved || !reviewed || running.current || !preparation || preparation.state !== "intent_prepared") return;
    running.current = true; setBusy(true); setReviewed(false); setReserved(true);
    const timer = setTimeout(() => { if (current()) setNotice("The provider result is still unknown. Check status without reopening the simulation. The saved lock remains in place."); }, 15_000);
    try {
      const attempt = await runIsolatedTestStoreRehearsal({ authority, preparation, journal, client, nextRequestId: newTipRequestId, onSaved: async () => { await refreshLocal(); } });
      if (current()) setNotice(attempt.observation?.status === "held" ? "This attempt remains on server review hold. The SDK result does not clear that hold." : attempt.sdkObservation ? "The SDK step finished. Only a verified server receipt confirms the test purchase. Use Check provider status; this build will not open another attempt." : "The server or native checks did not confirm an SDK purchase step. Check this saved attempt; no purchase status has been established.");
    } catch { if (current()) setNotice("This attempt could not be confirmed. Read its saved status; do not repeat it or clear app storage. A missing receipt does not prove no purchase."); }
    finally { clearTimeout(timer); running.current = false; if (current()) { setBusy(false); await refreshLocal().catch(() => { setReady(false); }); } }
  };
  const recover = async (attempt: IsolatedTestStoreAttempt) => {
    if (!current() || !journal || !client) return;
    const sequence = ++readSequence.current;
    const applies = () => current() && sequence === readSequence.current;
    const requestId = newTipRequestId();
    try {
      const result = await client.request("read", requestId, { intentId: attempt.intentId });
      if (!current()) return;
      // Request-start order is not server snapshot order. Every authenticated
      // current-session negative must reach the monotonic journal. Retire any
      // older local snapshot before this new projection is persisted.
      localSequence.current += 1;
      await journal.reconcile({ allocationRequestId: attempt.allocationRequestId, readRequestId: requestId, sessionId: authority.sessionGeneration }, result);
      if (!current()) return;
      const rows = await refreshLocal(); const saved = rows?.find(row => row.allocationRequestId === attempt.allocationRequestId);
      if (!saved) return;
      const negative = saved.observation?.status === "held" || (saved.observation?.receipt && saved.observation.receipt.state !== "verified");
      if (applies() || (current() && negative)) setNotice(saved.observation?.status === "held" ? "The server has placed this attempt on review hold. A recorded receipt does not clear that hold or confirm current purchase status. The saved lock remains." : saved.observation?.receipt ? `The saved server receipt status is ${saved.observation.receipt.state}. It creates no Premium, access grant or payable earnings.` : "The server has not confirmed a receipt for this exact attempt. No mutation was repeated and the saved lock remains.");
    } catch { if (applies()) setNotice("Provider status is unavailable. The original attempt and lock are retained; no purchase conclusion was made."); }
  };
  return <View style={styles.card} testID="isolated-test-store-panel">
    <Text accessibilityRole="header" style={styles.title}>RevenueCat Test Store rehearsal</Text>
    <Text style={styles.text}>This is a RevenueCat purchase simulation, not an Apple or Google store payment. Live money, payouts and cashout stay off.</Text>
    <Text style={styles.text}>One provider attempt per installation. Cancellation, restart and receipt confirmation do not reset this limit. Repeated checkout is not yet qualified.</Text>
    <Text accessibilityLiveRegion="polite" style={styles.text}>{notice}</Text>
    {preparation?.state === "intent_prepared" ? <Text style={styles.text}>Reviewed tip: {isolatedTipMoney(preparation.quote.amountMinor, preparation.quote.currency)} · Recipient {preparation.quote.creatorId}</Text> : <Text style={styles.text}>First prepare a tip and confirm its reviewed quote through server status.</Text>}
    <Pressable testID="isolated-test-store-review" accessibilityRole="checkbox" accessibilityState={{ checked: reviewed, disabled: !ready || reserved || busy || preparation?.state !== "intent_prepared" }} disabled={!ready || reserved || busy || preparation?.state !== "intent_prepared"} onPress={() => setReviewed(v => !v)} style={styles.button}><Text style={styles.text}>I understand this opens a Test Store simulation</Text></Pressable>
    <Pressable testID="isolated-test-store-open" accessibilityRole="button" accessibilityState={{ disabled: !ready || reserved || busy || !reviewed }} disabled={!ready || reserved || busy || !reviewed} onPress={() => void start()} style={styles.button}><Text style={styles.text}>Check and open Test Store</Text></Pressable>
    {reserved && ready ? <Text style={styles.text}>This installation is reserved. Recovery reads remain available; another provider attempt will not open.</Text> : null}
    {attempts.map(attempt => <View key={attempt.allocationRequestId} style={styles.section}>
      <Text style={styles.text}>Saved provider attempt · {attempt.observation?.status === "held" ? "Server review hold" : attempt.observation?.receipt ? `Server receipt: ${attempt.observation.receipt.state}` : "Receipt unconfirmed"}</Text>
      {(!attempt.observation?.receipt || attempt.observation.status === "held") && attempt.receiptObservation?.receipt ? <Text style={styles.text}>Earlier server receipt: {attempt.receiptObservation.receipt.state}. This retained record does not clear the current hold or unavailable status.</Text> : null}
      <Text style={styles.text}>{isolatedTipMoney(attempt.quote.amountMinor, attempt.quote.currency)} · No access grant or payable balance.</Text>
      <Pressable testID={`isolated-test-store-recover-${attempt.allocationRequestId}`} accessibilityRole="button" onPress={() => void recover(attempt)} style={styles.button}><Text style={styles.text}>Check provider status</Text></Pressable>
    </View>)}
  </View>;
}
const styles = StyleSheet.create({ card: { padding: 16, gap: 10, backgroundColor: "#17171f", borderRadius: 12 }, title: { color: "#fff", fontSize: 20, fontWeight: "700" }, text: { color: "#eee", fontSize: 16, lineHeight: 23 }, button: { minHeight: 44, justifyContent: "center", padding: 10, borderWidth: 1, borderColor: "#777", borderRadius: 8 }, section: { gap: 8, paddingTop: 8 } });
