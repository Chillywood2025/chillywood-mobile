import React, { useCallback, useRef, useState } from "react";
import { useFocusEffect } from "expo-router";
import { Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { useSession } from "../../_lib/session";
import { canUseCreatorSandboxTools } from "../../_lib/creatorEligibility";
import { getCurrentAccountSessionAuthoritySnapshot, sameAccountSessionAuthority } from "../../_lib/accountSessionAuthority";
import { CREATOR_US_REGIONS, creatorDeclarationErrorMessage, readCreatorEligibilityDeclaration, readCreatorPayoutLegalStatus, saveCreatorEligibilityDeclaration, type CreatorDeclarationReadback } from "../../_lib/creatorEligibilityDeclaration";

export function CreatorEligibilityDeclarationPanel() {
  const { authority } = useSession();
  const identity = JSON.stringify(authority);
  const lifecycle = useRef({ identity, active: false });
  if (lifecycle.current.identity !== identity) lifecycle.current = { identity, active: false };
  const lease = lifecycle.current;
  const [, rerender] = useState(0);
  const request = useRef(0), flight = useRef(false);
  const [busy, setBusy] = useState(false);
  const [adult, setAdult] = useState(false), [us, setUS] = useState(false), [region, setRegion] = useState("");
  const [saved, setSaved] = useState<{ identity: string; value: CreatorDeclarationReadback } | null>(null);
  const [notice, setNotice] = useState(""), [legal, setLegal] = useState("Payout terms: not yet checked.");
  const current = () => lifecycle.current === lease && lease.active && !!authority && !authority.restoreOnly
    && sameAccountSessionAuthority(authority, getCurrentAccountSessionAuthoritySnapshot());
  useFocusEffect(useCallback(() => {
    const focusedLease = lifecycle.current;
    focusedLease.active = true;
    // Settlement while away clears the transport lock, not inactive UI state.
    // Reflect that lock on return without releasing an outstanding operation.
    setBusy(flight.current);
    setSaved(null);
    setAdult(false); setUS(false); setRegion(""); setNotice(""); setLegal("Payout terms: not yet checked.");
    rerender(n => n + 1);
    return () => {
      focusedLease.active = false; request.current++;
      if (lifecycle.current.identity === identity) lifecycle.current = { identity, active: false };
    };
  }, [identity]));
  const run = async (save: boolean) => {
    if (!current() || !authority || flight.current) return;
    if (save && (!adult || !us || !CREATOR_US_REGIONS.includes(region))) return;
    flight.current = true; setBusy(true); setNotice("");
    const generation = ++request.current;
    const valid = () => current() && request.current === generation;
    try {
      const value = save ? await saveCreatorEligibilityDeclaration(authority, { declared18Plus: adult, residesInUS: us, regionCode: region }, valid)
        : await readCreatorEligibilityDeclaration(authority, valid);
      if (!valid()) return;
      setSaved({ identity, value });
      setNotice(value.declaration ? "Your age and residency declaration is recorded. This is a self-declaration, not identity verification or approval to receive money." : "No saved age and residency declaration was found.");
      try {
        const status = await readCreatorPayoutLegalStatus(authority, valid);
        if (valid()) setLegal(status);
      } catch { if (valid()) setLegal("Payout terms could not be checked. Refresh before proceeding."); }
    } catch (error) { if (valid()) setNotice(creatorDeclarationErrorMessage(error)); }
    finally { flight.current = false; if (lifecycle.current.active) setBusy(false); }
  };
  const value = saved?.identity === identity ? saved.value : null;
  const disabled = busy || !current();
  const cancel = () => {
    if (!current()) return;
    lifecycle.current = { identity, active: true };
    // A repeated empty-form cancel can leave every form value unchanged.
    // Render the new lease even then, so current controls retire the old one.
    rerender(n => n + 1);
    request.current++; setAdult(false); setUS(false); setRegion("");
    setNotice(flight.current ? "Form canceled. A submitted save may still complete. Refresh after it finishes to check saved information." : "Form canceled. Your previously saved declaration has not been removed.");
  };
  return <View style={styles.panel} testID="creator-eligibility-declaration-panel">
    <Text style={styles.title}>Creator eligibility</Text>
    <Text style={styles.body}>Eligible Premium creators can access creator tools automatically. Ordinary buyers can remain Free. No tester grant is needed for ordinary purchases.</Text>
    <Text style={styles.body}>Declare that you are at least 18 and live in a US state or Washington, DC. US territories are not eligible. Provider identity, tax, sanctions, bank, current terms, account restrictions, and platform availability are checked separately.</Text>
    {value?.declaration ? <Text style={styles.body}>Saved self-declaration: {value.declaration.regionCode}, US. Recorded {value.declaration.declaredAt}.</Text> : <Text style={styles.body}>Refresh to check saved eligibility information.</Text>}
    <Pressable testID="creator-declaration-adult" accessibilityRole="checkbox" accessibilityState={{ checked: adult, disabled }} disabled={disabled} style={styles.button} onPress={() => { if (current() && !flight.current) setAdult(!adult); }}><Text style={styles.body}>{adult ? "☑" : "☐"} I declare that I am 18 or older.</Text></Pressable>
    <Pressable testID="creator-declaration-us" accessibilityRole="checkbox" accessibilityState={{ checked: us, disabled }} disabled={disabled} style={styles.button} onPress={() => { if (current() && !flight.current) setUS(!us); }}><Text style={styles.body}>{us ? "☑" : "☐"} I declare that I reside in a US state or Washington, DC.</Text></Pressable>
    <TextInput testID="creator-declaration-region" accessibilityLabel="US state or DC two-letter code" placeholder="State or DC (e.g. CA)" placeholderTextColor="#9AA5B8" autoCapitalize="characters" autoCorrect={false} maxLength={2} value={region} editable={!disabled} style={styles.input} onChangeText={text => { if (current() && !flight.current) setRegion(text.trim().toUpperCase()); }} />
    <Text style={styles.body}>Use the two-letter postal code for your state, or DC. Territories are excluded.</Text>
    <View style={styles.actions}>
      <Pressable testID="creator-declaration-save" accessibilityRole="button" accessibilityState={{ disabled: disabled || !adult || !us || !CREATOR_US_REGIONS.includes(region), busy }} disabled={disabled || !adult || !us || !CREATOR_US_REGIONS.includes(region)} style={styles.button} onPress={() => void run(true)}><Text style={styles.body}>Save declaration</Text></Pressable>
      <Pressable testID="creator-declaration-refresh" accessibilityRole="button" accessibilityState={{ disabled, busy }} disabled={disabled} style={styles.button} onPress={() => void run(false)}><Text style={styles.body}>Refresh eligibility</Text></Pressable>
      <Pressable testID="creator-declaration-cancel" accessibilityRole="button" style={styles.button} onPress={cancel}><Text style={styles.body}>Cancel form</Text></Pressable>
    </View>
    {notice ? <Text style={styles.body} accessibilityLiveRegion="polite">{notice}</Text> : null}
    {current() && value?.eligibility && canUseCreatorSandboxTools(value.eligibility) && value.eligibility.state !== "VERIFIED"
      ? <Text style={styles.body}>Sandbox creator tools ready; live verification pending. Test activity does not authorize live charges, payable earnings, or payouts.</Text> : null}
    {value ? <Text style={styles.body}>Outstanding checks: {value.pending.length ? value.pending.join(", ") : "Review current provider and platform status before any money action."}</Text> : null}
    <Text style={styles.body}>{legal}</Text>
    <Text style={styles.body}>A saved declaration never enables live charges, payouts, or cashout by itself.</Text>
  </View>;
}
const styles = StyleSheet.create({ panel: { gap: 10, marginVertical: 16 }, title: { color: "#fff", fontSize: 18, fontWeight: "800" }, body: { color: "#C6CDDB", fontSize: 14, lineHeight: 21 },
  input: { minHeight: 48, padding: 12, borderWidth: 1, borderColor: "#737D90", borderRadius: 10, color: "#fff" },
  actions: { flexDirection: "row", flexWrap: "wrap", gap: 8 }, button: { minHeight: 48, padding: 12, backgroundColor: "#351D2C", borderRadius: 10, justifyContent: "center" } });
