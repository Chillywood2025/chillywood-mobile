import React, { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { useIsFocused } from "@react-navigation/native";
import { Pressable, Text, View } from "react-native";
import { getCurrentAccountSessionAuthoritySnapshot, subscribeToAccountSessionAuthority } from "../../_lib/accountSessionAuthority";
import { advanceSandboxPrefundedTip, cancelSandboxPrefundedTip, readSandboxPrefundedTipState,
  refreshSandboxPrefundedTip, reviewSandboxPrefundedTip, submitSandboxPrefundedTip,
  type SandboxPrefundedTipSource, type SandboxPrefundedTipQuote, type SandboxPrefundedTipRecord } from "../../_lib/sandboxPrefundedTipCashout";
import { CHILLYWOOD_VISUAL } from "../ui/chillywood-visual-system";

const snapshotKey = () => { const s = getCurrentAccountSessionAuthoritySnapshot(); return s && !s.restoreOnly ? JSON.stringify(s) : ""; };
const money = (n: number | null) => n === null ? "Unverified" : `$${(n / 100).toFixed(2)}`;
const labels: Record<string, string> = {
  test_tip_received: "Test tip received — provider credit not verified",
  pending_provider_availability: "Test tip pending provider availability or qualification",
  eligible_test_cashout: "Eligible test tip cashout — review before reserving",
  ready: "Test tip payout reserved — no payout sent", payout_unknown: "Test tip payout unresolved — reconcile this request",
  payout_pending: "Test tip payout processing", paid: "Provider reports test tip payout paid — no real bank deposit",
  return_pending: "Test tip return pending provider evidence", returned: "Test tip return reconciled",
  canceled: "Test tip request canceled", needs_review: "Test tip provider/accounting review required",
};
type State = { key: string; access: "checking" | "allowed" | "denied"; until: number; busy: boolean; notice: string;
  sources: SandboxPrefundedTipSource[]; rows: SandboxPrefundedTipRecord[]; quote: SandboxPrefundedTipQuote | null };
const empty = (key: string): State => ({key, access: "checking", until: 0, busy: false, notice: "", sources: [], rows: [], quote: null});

/** Nested in the existing authorized sandbox panel; never a public tip control.
 * It independently checks exact tester/session authority for every operation. */
export function SandboxPrefundedTipPanel() {
  const key = useSyncExternalStore(subscribeToAccountSessionAuthority, snapshotKey, () => ""), focused = useIsFocused();
  const [state, setState] = useState<State>(() => empty(key));
  const active = useRef(false), generation = useRef(0), latch = useRef(false), pending = useRef<number | null>(null);
  const displayed = useRef<{sources: SandboxPrefundedTipSource[]; rows: SandboxPrefundedTipRecord[]; quote: SandboxPrefundedTipQuote | null}>({sources: [], rows: [], quote: null});
  const allowed = state.key === key && focused && state.access === "allowed" && state.until > Date.now();
  displayed.current = allowed ? state : {sources: [], rows: [], quote: null};
  const retire = useCallback(() => { active.current = false; generation.current++; latch.current = false; pending.current = null; displayed.current = {sources: [], rows: [], quote: null}; }, []);
  useEffect(() => {
    active.current = !!key && focused; const ticket = ++generation.current; latch.current = false; setState(empty(key));
    if (active.current) void readSandboxPrefundedTipState().then(data => {
      if (active.current && generation.current === ticket && snapshotKey() === key)
        setState({...empty(key), ...data, access: "allowed", until: Date.now() + 30000});
    }).catch(() => {
      if (active.current && generation.current === ticket && snapshotKey() === key)
        setState({...empty(key), access: "denied", notice: "Internal test tip access could not be verified for this session."});
    });
    return retire;
  }, [key, focused, retire]);
  useEffect(() => {
    if (state.access !== "allowed" || state.key !== key) return;
    const timer = setTimeout(() => {
      generation.current++; displayed.current = {sources: [], rows: [], quote: null};
      setState(old => ({...old, access: "denied", until: 0, sources: [], rows: [], quote: null, busy: latch.current,
        notice: "Test tip access verification expired. An in-flight request may still be processing; refresh the original history."}));
    }, Math.max(0, state.until - Date.now()));
    return () => clearTimeout(timer);
  }, [key, state.key, state.access, state.until]);
  const run = async (action: "history" | "receipt" | "review" | "submit" | "advance" | "cancel", item?: SandboxPrefundedTipSource | SandboxPrefundedTipRecord) => {
    if (!key || !focused || !active.current || snapshotKey() !== key || latch.current) return;
    if (action !== "history" && !allowed) return;
    if (["review", "receipt"].includes(action) && (!item || !displayed.current.sources.includes(item as SandboxPrefundedTipSource))) return;
    if (["advance", "cancel"].includes(action) && (!item || !displayed.current.rows.includes(item as SandboxPrefundedTipRecord))) return;
    const quote = displayed.current.quote;
    if (action === "submit" && (!quote || state.quote !== quote)) return;
    const ticket = ++generation.current; latch.current = true; pending.current = ticket;
    setState(old => ({...old, busy: true, notice: ""}));
    const current = () => active.current && generation.current === ticket && snapshotKey() === key;
    try {
      const data = await readSandboxPrefundedTipState();
      if (!current()) return;
      if (action === "review") {
        // Re-read canonical eligibility before displaying a new quote. Never
        // replace an already displayed quote silently during confirmation.
        const fresh = data.sources.find(s => s.tipId === (item as SandboxPrefundedTipSource).tipId);
        if (!fresh) throw Error("Test tip is no longer eligible. Refresh test history.");
        const next = reviewSandboxPrefundedTip(fresh);
        if (current()) setState(old => ({...old, ...data, quote: next, access: "allowed", until: Date.now() + 30000,
          notice: "Review this test tip quote. No payout has been sent."}));
      } else if (action === "history") {
        setState(old => ({...old, ...data, quote: null, access: "allowed", until: Date.now() + 30000, notice: data.sources.length ? "" : "No eligible received test tips yet."}));
      } else {
        if (action === "receipt") await refreshSandboxPrefundedTip(item as SandboxPrefundedTipSource);
        else if (action === "submit") await submitSandboxPrefundedTip(quote!);
        else if (action === "advance") await advanceSandboxPrefundedTip(item as SandboxPrefundedTipRecord);
        else await cancelSandboxPrefundedTip(item as SandboxPrefundedTipRecord);
        if (!current()) return;
        const refreshed = await readSandboxPrefundedTipState();
        if (current()) setState(old => ({...old, ...refreshed, quote: null, access: "allowed", until: Date.now() + 30000,
          notice: action === "submit" ? "Test tip request reserved. Continue this same request; no real bank deposit." : "Test tip facts refreshed. Provider test status is not a real bank deposit."}));
      }
    } catch (error) {
      if (current()) { displayed.current = {sources: [], rows: [], quote: null}; setState(old => ({...old, quote: null, sources: [], rows: [], access: "denied", until: 0,
        notice: error instanceof Error ? error.message : "Test tip status unresolved. Refresh the original request."})); }
    } finally {
      if (pending.current === ticket) { pending.current = null; latch.current = false; if (active.current && snapshotKey() === key) setState(old => ({...old, busy: false})); }
    }
  };
  if (!key || !focused) return null;
  const text = {color: CHILLYWOOD_VISUAL.textMuted}, title = {color: CHILLYWOOD_VISUAL.textPrimary};
  const busy = state.key === key && state.busy;
  if (!allowed) return <View testID="sandbox-prefunded-tip-access"><Text style={text} accessibilityLiveRegion="polite">{state.key === key ? state.notice || "Checking internal test tip access…" : "Checking internal test tip access…"}</Text>
    {state.access === "denied" ? <Pressable accessibilityRole="button" disabled={busy} onPress={() => void run("history")}><Text style={title}>Check internal test tip access</Text></Pressable> : null}</View>;
  return <View testID="sandbox-prefunded-tip-section" style={{gap: 10, paddingTop: 14, borderTopWidth: 1, borderColor: CHILLYWOOD_VISUAL.glassBorder}}>
    <Text accessibilityRole="header" style={title}>Received custom test tips — payout only</Text>
    <Text style={text}>These tips already funded the test connected account. No second funding transfer is created. One verified tip per standard USD test payout. Live payouts remain off.</Text>
    <Text style={text}>Creator payout is net of applicable qualified costs, not the gross tip. Separate billing treatment requires an independently verified, approved cost-ownership policy; platform billing alone does not mean the platform absorbs it. Unknown costs remain held, not assumed zero.</Text>
    <Pressable accessibilityRole="button" disabled={busy} onPress={() => void run("history")}><Text style={title}>Refresh received test tips</Text></Pressable>
    {state.notice ? <Text style={text} accessibilityLiveRegion="polite">{state.notice}</Text> : null}
    {state.sources.map(s => <View key={s.tipId} style={{gap: 5}}>
      <Text style={title}>{labels[s.status]}</Text><Text style={text}>Buyer-selected test tip {money(s.amountMinor)} · {s.status === "eligible_test_cashout" ? `Verified available source net ${money(s.availableMinor)}` : "Available payout net not yet qualified"}</Text>
      <Pressable accessibilityRole="button" disabled={busy} onPress={() => void run("receipt", s)}><Text style={title}>Verify this test tip with provider</Text></Pressable>
      {s.status === "eligible_test_cashout" ? <Pressable accessibilityRole="button" disabled={busy} onPress={() => void run("review", s)}><Text style={title}>Review this test tip payout</Text></Pressable> : null}
    </View>)}
    {state.quote ? <View style={{gap: 5}}><Text style={text}>TEST connected source net {money(state.quote.availableMinor)} · Connected payout cost {money(state.quote.connectedFeeMinor)} · Test payout {money(state.quote.bankMinor)}. Separate billing is platform-absorbed only under the independently verified approved policy for this quote, not assumed zero.</Text>
      <Pressable accessibilityRole="button" disabled={busy} onPress={() => void run("submit")}><Text style={title}>Confirm this test tip request</Text></Pressable></View> : null}
    {state.rows.map(r => <View key={r.requestId} style={{gap: 5}}><Text style={title}>{labels[r.status]}</Text>
      <Text style={text}>Test payout {money(r.bankMinor)} · Qualified connected payout cost {money(r.connectedFeeMinor)}. No real bank deposit.</Text>
      {r.sourceHeld || r.qualificationStatus !== "current" ? <Text style={text}>Test tip source or qualification is held. No replacement payout; refresh or reconcile this original request.</Text> : null}
      {!["canceled", "returned"].includes(r.status) && !(r.status === "ready" && (r.sourceHeld || r.qualificationStatus !== "current"))
        ? <Pressable accessibilityRole="button" disabled={busy} onPress={() => void run("advance", r)}><Text style={title}>{r.status === "ready" ? "Continue this test tip payout" : "Reconcile this test tip payout"}</Text></Pressable> : null}
      {r.canCancel ? <Pressable accessibilityRole="button" disabled={busy} onPress={() => void run("cancel", r)}><Text style={title}>Cancel this undispatched test tip request</Text></Pressable> : null}
    </View>)}
  </View>;
}
