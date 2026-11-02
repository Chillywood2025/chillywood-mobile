import React, { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { useIsFocused } from "@react-navigation/native";
import { Pressable, Text, TextInput, View } from "react-native";
import { getCurrentAccountSessionAuthoritySnapshot, subscribeToAccountSessionAuthority } from "../../_lib/accountSessionAuthority";
import { cashoutDollarsToMinor } from "../../_lib/creatorCashoutExecution";
import { advanceSandboxCreatorCashout, cancelSandboxCreatorCashout, previewSandboxCreatorCashout, readSandboxCreatorCashoutHistory,
  submitSandboxCreatorCashout, SANDBOX_CASHOUT_STATUS, type SandboxCashoutQuote, type SandboxCashoutRecord } from "../../_lib/sandboxCreatorCashout";
import { CHILLYWOOD_VISUAL } from "../ui/chillywood-visual-system";

const snapshotKey = () => { const value = getCurrentAccountSessionAuthoritySnapshot(); return value && !value.restoreOnly ? JSON.stringify(value) : ""; };
const money = (value: number | null) => value === null ? "Unverified" : `$${(value / 100).toFixed(2)}`;
const authorityHeld = (row: SandboxCashoutRecord) => row.recoveryAuthorityRequired === true
  || row.qualificationStatus === "expired_or_revoked"
  || ["sandbox_recovery_authority_required", "sandbox_cashout_provider_qualification_required"].includes(row.ownerAction ?? "");
export function SandboxCreatorCashoutPanel() {
  const key = useSyncExternalStore(subscribeToAccountSessionAuthority, snapshotKey, () => ""), focused = useIsFocused();
  const generation = useRef(0), active = useRef(false), latch = useRef(false);
  const displayed = useRef<SandboxCashoutQuote | null>(null), displayedRows = useRef<SandboxCashoutRecord[]>([]);
  const [amount, setAmount] = useState("");
  const [method, setMethod] = useState<"scheduled" | "instant">("scheduled");
  const [state, setState] = useState<{key: string; quote: SandboxCashoutQuote | null; rows: SandboxCashoutRecord[]; busy: boolean; notice: string}>({key: "", quote: null, rows: [], busy: false, notice: ""});
  displayed.current = state.key === key && focused ? state.quote : null;
  displayedRows.current = state.key === key && focused ? state.rows : [];
  const retire = useCallback(() => { active.current = false; generation.current++; latch.current = false; displayed.current = null; displayedRows.current = []; }, []);
  useEffect(() => {
    generation.current++; active.current = !!key && focused; latch.current = false; displayed.current = null; displayedRows.current = [];
    setAmount(""); setMethod("scheduled"); setState({key, quote: null, rows: [], busy: false, notice: ""});
    return retire;
  }, [key, focused, retire]);
  const run = async (action: "quote" | "submit" | "history" | "advance" | "cancel", row?: SandboxCashoutRecord) => {
    if (!key || !focused || !active.current || snapshotKey() !== key || latch.current) return;
    if (action === "submit" && (!state.quote || displayed.current !== state.quote)) return;
    if ((action === "advance" || action === "cancel") && (!row || !displayedRows.current.includes(row))) return;
    if (action === "advance" && row && authorityHeld(row)) return;
    const ticket = ++generation.current, quote = displayed.current; latch.current = true;
    setState(old => ({...old, key, busy: true, notice: ""}));
    const current = () => active.current && generation.current === ticket && snapshotKey() === key;
    try {
      if (action === "quote") {
        const result = await previewSandboxCreatorCashout(cashoutDollarsToMinor(amount), method);
        if (current()) setState(old => ({...old, quote: result.ready ? result : null,
          notice: result.ready ? "Review this TEST quote. No provider payout has been sent." : "Test payout unavailable. Tester access, sandbox earnings and provider qualification must be verified."}));
      } else if (action === "history") {
        const rows = await readSandboxCreatorCashoutHistory();
        if (current()) setState(old => ({...old, rows, quote: null, notice: rows.length ? "" : "No test payout requests."}));
      } else {
        const result = action === "submit" && quote ? await submitSandboxCreatorCashout(quote)
          : action === "advance" && row ? await advanceSandboxCreatorCashout(row)
          : action === "cancel" && row ? await cancelSandboxCreatorCashout(row) : null;
        if (current() && result) setState(old => ({...old, quote: null, rows: [result, ...old.rows.filter(item => item.requestId !== result.requestId)],
          notice: action === "submit" ? "Test request reserved. Continue this request to run the provider test stages. No real money moves." : "Test status refreshed from the server. This is not a real bank deposit."}));
      }
    } catch (error) {
      if (current()) setState(old => ({...old, quote: null, notice: error instanceof Error ? error.message : "Test payout unresolved. Refresh test history before another request."}));
    } finally { if (current()) { latch.current = false; setState(old => ({...old, busy: false})); } }
  };
  if (!key || !focused) return null;
  const current = state.key === key ? state : null, busy = current?.busy === true;
  const text = {color: CHILLYWOOD_VISUAL.textMuted}, title = {color: CHILLYWOOD_VISUAL.textPrimary};
  const change = () => { displayed.current = null; generation.current++; latch.current = false; setState(old => ({...old, quote: null, busy: false, notice: ""})); };
  return <View testID="sandbox-creator-cashout" style={{padding: 12, gap: 10, borderWidth: 1, borderRadius: 12, borderColor: CHILLYWOOD_VISUAL.glassBorder}}>
    <Text accessibilityRole="header" style={title}>Internal test payouts — sandbox only</Text>
    <Text style={text}>For authorized internal testers only. Uses isolated sandbox earnings and a test connected account. No real charges, withdrawals or bank deposits. Live payouts remain off. A preview is not a payout.</Text>
    <Text style={text}>Sandbox earning fees, tax and net amounts use simulated test deductions, not actual provider charges or tax calculations. Test results do not prove live-account readiness.</Text>
    <TextInput accessibilityLabel="Test payout amount in dollars" value={amount} editable={!busy} keyboardType="decimal-pad" placeholder="Test amount in USD" placeholderTextColor={CHILLYWOOD_VISUAL.textMuted} style={{...title, padding: 10}} onChangeText={value => { change(); setAmount(value); }} />
    <View style={{flexDirection: "row", gap: 18}}>{(["scheduled", "instant"] as const).map(value => <Pressable key={value} accessibilityRole="radio" accessibilityState={{checked: method === value, disabled: busy}} disabled={busy} onPress={() => { change(); setMethod(value); }}><Text style={title}>{method === value ? "● " : "○ "}{value === "scheduled" ? "Test standard" : "Test instant"}</Text></Pressable>)}</View>
    <Pressable accessibilityRole="button" disabled={busy} onPress={() => void run("quote")}><Text style={{...title, paddingVertical: 10}}>Review test payout</Text></Pressable>
    {current?.quote ? <View style={{gap: 6}}>
      <Text style={text}>TEST requested: {money(current.quote.grossMinor)} · App fee: {money(current.quote.appFeeMinor)} · Quoted provider cost: {money(current.quote.expectedProviderFeeMinor)} · Test payout: {money(current.quote.bankMinor)}</Text>
      <Text style={text}>Costs are a test quote, not observed provider fees. Confirming reserves only sandbox earnings.</Text>
      <Pressable accessibilityRole="button" disabled={busy} onPress={() => void run("submit")}><Text style={{...title, paddingVertical: 10}}>Confirm sandbox request</Text></Pressable>
    </View> : null}
    {current?.notice ? <Text accessibilityLiveRegion="polite" style={text}>{current.notice}</Text> : null}
    <Pressable accessibilityRole="button" disabled={busy} onPress={() => void run("history")}><Text style={{...title, paddingVertical: 10}}>{busy ? "Checking test request…" : "Refresh test payout history"}</Text></Pressable>
    {current?.rows.map(row => <View key={row.requestId} style={{gap: 5}}>
      <Text style={title}>{SANDBOX_CASHOUT_STATUS[row.status] ?? "Test payout under reconciliation — no real money"}</Text>
      {row.recoveryAuthorityRequired === true || row.ownerAction === "sandbox_recovery_authority_required"
        ? <Text accessibilityLiveRegion="polite" style={text}>Test funds remain held. The original provider qualification expired or was revoked. An authorized operator must verify fresh, recovery-only authority for this exact execution, test account and transfer. This does not authorize a new payout. Do not submit another request.</Text>
        : authorityHeld(row) ? <Text accessibilityLiveRegion="polite" style={text}>Test payout is held because provider qualification expired or was revoked. An authorized operator must verify the test provider qualification before this request can advance. Qualification is not renewed automatically. Do not submit another payout.</Text> : null}
      <Text style={text}>TEST requested {money(row.grossMinor)} · Test payout {money(row.bankMinor)} · Observed test provider cost {money(row.observedProviderFeeMinor)}. Sandbox earning deductions remain simulated.</Text>
      {authorityHeld(row) ? <View><Text style={text}>Status refresh is read-only: it cannot dispatch a payout or return. Existing unknown provider attempts remain subject to reconciliation, not a replacement payout.</Text><Pressable accessibilityRole="button" disabled={busy} onPress={() => void run("history")}><Text style={{...title, paddingVertical: 10}}>Refresh held test payout status</Text></Pressable></View>
        : !["canceled", "returned", "paid"].includes(row.status) ? <Pressable accessibilityRole="button" disabled={busy} onPress={() => void run("advance", row)}><Text style={{...title, paddingVertical: 10}}>{["prepared", "funded"].includes(row.status) ? "Continue provider test payout" : "Reconcile this test payout"}</Text></Pressable> : null}
      {row.canCancel ? <Pressable accessibilityRole="button" disabled={busy} onPress={() => void run("cancel", row)}><Text style={{...title, paddingVertical: 10}}>Cancel test payout</Text></Pressable> : null}
    </View>)}
  </View>;
}
