import React, { useEffect, useRef, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { captureQualification } from "./native";

function Button({ id, label, disabled, onPress }) {
  return <Pressable testID={id} accessibilityRole="button" accessibilityState={{ disabled: !!disabled }} disabled={disabled} onPress={onPress} style={styles.button}><Text style={styles.text}>{label}</Text></Pressable>;
}
export default function App() {
  const [client, setClient] = useState(null), [state, setState] = useState(null), [busy, setBusy] = useState(false), [prepared, setPrepared] = useState(null);
  const [message, setMessage] = useState("Checking the compiled record-only DEBUG profile…");
  const epoch = useRef(0), running = useRef(false), readSequence = useRef(0);
  useEffect(() => {
    const generation = ++epoch.current; let owned;
    try {
      owned = captureQualification(); setClient(owned);
      void owned.inspect().then(value => { if (generation === epoch.current) { setState(value); setMessage("No provider receipt has been verified by this app."); } })
        .catch(() => { if (generation === epoch.current) setMessage("Unavailable: use the reviewed standalone DEBUG native profile. Expo Go and Release are unsupported."); });
    } catch { setMessage("Unavailable: the separate qualification native module is missing."); }
    const epochRef = epoch;
    return () => { if (generation === epochRef.current) epochRef.current++; owned?.dispose(); };
  }, []);
  const refresh = async () => {
    if (!client) return; const generation = epoch.current, sequence = ++readSequence.current;
    try { const value = await client.inspect(); if (generation === epoch.current && sequence === readSequence.current) setState(value); }
    catch { if (generation === epoch.current) setMessage("Local evidence is unavailable. Preserve this installation; do not retry an old SDK invocation."); }
  };
  const run = async operation => {
    if (!client || running.current) return; const generation = epoch.current; running.current = true; setBusy(true); readSequence.current++;
    try { const notice = await operation(client); if (generation === epoch.current) setMessage(typeof notice === "string" ? notice : "Local SDK evidence updated. This is not authenticated receipt, no-charge, or commerce qualification evidence."); }
    catch { if (generation === epoch.current) setMessage("Outcome unavailable. Read retained local evidence. Unknown native work is not retried or reset."); }
    finally { if (generation === epoch.current) { running.current = false; setBusy(false); await refresh(); } }
  };
  return <ScrollView testID="scq-app" contentContainerStyle={styles.screen}>
    <Text accessibilityRole="header" style={styles.title}>Record-only Test Store qualification</Text>
    <Text style={styles.text}>RevenueCat Test Store simulation in a separate DEBUG app. No Chi&apos;llywood account, Premium, purchase grant, live money, payout or cashout is connected here.</Text>
    <Text style={styles.text}>Each scenario is a local observation label. Only the separate receiver can record authenticated provider bytes; sealing evidence never enables commerce.</Text>
    <Text accessibilityLiveRegion="polite" style={styles.text}>{message}</Text>
    <Button id="scq-refresh" label="Read retained local evidence" disabled={!client} onPress={() => void refresh()} />
    <Button id="scq-configure" label="Configure this fixed qualification identity" disabled={!state || busy || state.closed || state.configured} onPress={() => void run(c => c.configure())} />
    {state?.closed ? <Text style={styles.text}>New attempts are permanently stopped in this installation. Existing SDK work may still finish. The receiver must be sealed separately.</Text> : null}
    {state?.activeInvocationId ? <Text style={styles.text}>A native record remains active. A restart or missing callback does not permit another attempt.</Text> : null}
    {state?.scenarios.map(scenario => <View key={scenario.id} style={styles.card}>
      <Text style={styles.title}>{scenario.label}</Text><Text style={styles.text}>{(scenario.amountMinor / 100).toFixed(2)} USD · {scenario.productId}</Text>
      <Text style={styles.text}>Offering: {scenario.offeringIdentifier} · Intended observation: {scenario.intendedAction === "cancel" ? "choose Cancel in the native modal" : "complete the Test Store simulation"}.</Text>
      <Button id={`scq-prepare-${scenario.id}`} label="Inspect the exact native Package" disabled={busy || !state.configured || state.closed || state.activeInvocationId !== null} onPress={() => void run(async c => {
        const value = await c.prepare(scenario.id); setPrepared(value); if (!value) return "The exact Package is unavailable in native Offerings. No SDK purchase was invoked.";
      })} />
    </View>)}
    {prepared ? <Button id="scq-purchase" label="Open this reviewed Test Store simulation" disabled={busy || state?.closed} onPress={() => { const current = prepared; setPrepared(null); void run(c => c.purchase(current.invocationId)); }} /> : null}
    {state?.records.map(record => <View key={record.invocationId} style={styles.card}>
      <Text style={styles.text}>{record.state} · {record.outcome ?? "No completion observed"}</Text>
      <Text style={styles.text}>Scenario {record.scenarioId} · {record.offeringIdentifier}</Text>
      <Text style={styles.text}>This record grants no access and does not prove that no transaction occurred.</Text>
    </View>)}
    <Button id="scq-seal" label="Permanently stop new local attempts" disabled={!state || state.closed || busy} onPress={() => { setPrepared(null); void run(c => c.seal()); }} />
  </ScrollView>;
}
const styles = StyleSheet.create({ screen: { padding: 24, gap: 14, backgroundColor: "#15151c", flexGrow: 1 }, title: { fontSize: 21, fontWeight: "700", color: "#fff" }, text: { color: "#eee", fontSize: 16, lineHeight: 23 }, button: { padding: 14, minHeight: 44, borderWidth: 1, borderColor: "#888", borderRadius: 8 }, card: { gap: 8, padding: 14, borderWidth: 1, borderColor: "#555", borderRadius: 10 } });
