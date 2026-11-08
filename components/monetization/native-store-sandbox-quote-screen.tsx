import React, { useEffect, useRef, useState } from "react";
import { ActivityIndicator, ImageBackground, Platform, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useSession } from "../../_lib/session";
import { type AccountSessionAuthorityBinding } from "../../_lib/accountSessionAuthority";
import { isIsolatedTestStoreV3Flavor } from "../../_lib/isolatedTestStoreV3Build";
import { isIsolatedTestStoreFlavor } from "../../_lib/isolatedTestStoreBuild";
import { isIsolatedTestStoreV2Flavor } from "../../_lib/isolatedTestStoreV2Build";
import { captureNativeSandboxQuoteClient, type NativeSandboxQuote, type NativeSandboxQuoteClient, type NativeSandboxSelection, type NativeSandboxStore } from "../../_lib/nativeStoreSandboxQuote";
import { AppBackButton } from "../navigation/app-back-button";
import { CHILLYWOOD_VISUAL } from "../ui/chillywood-visual-system";

// Normal-app, any active account. No admin role or second RevenueCat SDK owner.
// This screen prepares/reconciles a selection only; it never invokes a store.
export function NativeStoreSandboxQuoteScreen() {
  const { user, authority, isLoading } = useSession(); const router = useRouter();
  const params = useLocalSearchParams<{ offerId?: string }>(); const offerId = typeof params.offerId === "string" ? params.offerId : "";
  const store = Platform.OS === "ios" ? "APP_STORE" : Platform.OS === "android" ? "PLAY_STORE" : null;
  return <ImageBackground source={require("../../assets/images/chillywood-branded-background.png")} resizeMode="cover" style={styles.screen}>
    <View pointerEvents="none" style={styles.overlay} />
    <SafeAreaView style={styles.screen}><ScrollView contentContainerStyle={styles.content}>
    <AppBackButton accessibilityLabel="Back from store sandbox preparation" testID="native-sandbox-back" onPress={() => { if (router.canGoBack()) router.back(); else router.replace("/(tabs)/my-list"); }} />
    <Text accessibilityRole="header" style={styles.heading}>Store sandbox preparation</Text>
    <Text style={styles.body}>Review and save a test selection. No store purchase is started here. This does not unlock playback or create payable earnings.</Text>
    {isLoading ? <ActivityIndicator /> : !user || !authority || authority.restoreOnly || authority.state !== "ACTIVE" || user.id !== authority.userId
      ? <Text style={styles.body}>Sign in with an active account to prepare your own selection.</Text>
      : !store || isIsolatedTestStoreFlavor() || isIsolatedTestStoreV2Flavor() || isIsolatedTestStoreV3Flavor() ? <Text style={styles.body}>Use the normal internal iOS or Android app for this store preparation. Test Store debug purchases use their separate flow.</Text>
      : <QuoteSession key={`${offerId}:${store}:${authority.userId}:${authority.sessionGeneration}`} offerId={offerId} store={store} authority={authority} />}
  </ScrollView></SafeAreaView></ImageBackground>;
}
function Button({ id, children, disabled, action }: { id: string; children: React.ReactNode; disabled: boolean; action(): void }) {
  return <Pressable testID={id} accessibilityRole="button" accessibilityState={{ disabled }} disabled={disabled} onPress={action} style={[styles.button, disabled && styles.disabled]}><Text style={styles.buttonText}>{children}</Text></Pressable>;
}
function QuoteSession({ offerId, store, authority }: { offerId: string; store: NativeSandboxStore; authority: AccountSessionAuthorityBinding }) {
  const [expected] = useState(() => Object.freeze({ ...authority }));
  const [revision, setRevision] = useState(0), [busy, setBusy] = useState(true), [quote, setQuote] = useState<NativeSandboxQuote | null>(null);
  const [selection, setSelection] = useState<NativeSandboxSelection | null>(null), [saved, setSaved] = useState(false), [message, setMessage] = useState("Loading the exact store quote…");
  const owner = useRef<{ client: NativeSandboxQuoteClient; active: boolean; pending: boolean } | null>(null);
  useEffect(() => {
    let active = true; let local: typeof owner.current = null;
    owner.current = null; setBusy(true); setQuote(null); setSelection(null); setSaved(false);
    void captureNativeSandboxQuoteClient(expected, offerId, store).then(async client => {
      if (!active) { client.dispose(); return; }
      local = { client, active: true, pending: true }; owner.current = local;
      const retained = await client.readSaved(); if (!active) return;
      setSaved(!!retained);
      if (retained) { setQuote(retained.quote); setMessage("A selection request is saved. Read its server status before doing anything else."); return; }
      const result = await client.offer(); if (!active) return;
      setQuote(result.data.quote ?? null); setMessage(result.status === "ok" ? "Review the exact quote below. Saving a selection is not a purchase." : "This store offer is not ready for preparation yet.");
    }).catch(() => { if (active) setMessage("Store preparation could not be read. No purchase was started by this screen."); })
      .finally(() => { if (active) { if (local) local.pending = false; setBusy(false); } });
    return () => { active = false; if (local) { local.active = false; local.client.dispose(); } if (owner.current === local) owner.current = null; };
  }, [expected, offerId, store, revision]);
  const run = (mode: "prepare" | "recover") => {
    const local = owner.current; if (!local?.active || local.pending || mode === "prepare" && (!quote || saved)) return;
    local.pending = true; setBusy(true);
    // Retain the recovery state even if the local save or remote reply becomes
    // uncertain. Never expose another prepare button after an attempted write.
    if (mode === "prepare") setSaved(true);
    void (mode === "prepare" ? local.client.prepare(quote!) : local.client.recover()).then(result => {
      if (!local.active) return;
      const value = result.data.selection ?? null; setSelection(value); if (value) setQuote(value.quote);
      setMessage(value ? "Your exact selection is recorded. Store purchase and playback are not enabled by this preparation."
        : "The selection is not confirmed. Keep this saved request and check status later; do not start a replacement.");
    }).catch(() => { if (local.active) setMessage("The result is unconfirmed. Keep the saved request and read status; no store purchase was started by this screen."); })
      .finally(() => { local.pending = false; if (local.active) setBusy(false); });
  };
  return <View style={styles.card}>
    {busy && <ActivityIndicator testID="native-sandbox-loading" />}
    <Text accessibilityLiveRegion="polite" style={styles.body}>{message}</Text>
    {quote && <><Text testID="native-sandbox-price" style={styles.heading}>{(quote.amountMinor / 100).toFixed(2)} USD</Text>
      <Text style={styles.body}>{quote.catalog.store === "APP_STORE" ? "Apple App Store" : "Google Play"} sandbox · {quote.catalog.wireProductId}</Text>
      <Text style={styles.body}>Offer revision {quote.offerRevision} · content revision {quote.resourceRevision}</Text></>}
    <Button id="native-sandbox-prepare" disabled={busy || !quote || saved || !!selection || !owner.current} action={() => run("prepare")}>Save test selection</Button>
    <Button id="native-sandbox-recover" disabled={busy || !saved || !owner.current} action={() => run("recover")}>Read saved selection status</Button>
    <Button id="native-sandbox-refresh" disabled={busy} action={() => setRevision(n => n + 1)}>Reconnect and read status</Button>
    <Text style={styles.body}>Native one-time receipt correlation still needs qualification. A displayed price, saved selection or SDK result is not proof of paid access.</Text>
  </View>;
}
const styles = StyleSheet.create({ screen: { flex: 1 }, overlay: { ...StyleSheet.absoluteFillObject, backgroundColor: "rgba(0,0,0,0.76)" },
  content: { padding: 20, paddingBottom: 48, gap: 16, maxWidth: 760, width: "100%", alignSelf: "center" },
  heading: { color: CHILLYWOOD_VISUAL.textPrimary, fontSize: 26, fontWeight: "900" }, body: { color: CHILLYWOOD_VISUAL.textMuted, fontSize: 16, lineHeight: 24 },
  card: { padding: 16, gap: 14, backgroundColor: CHILLYWOOD_VISUAL.glassBackground, borderColor: CHILLYWOOD_VISUAL.glassBorder, borderWidth: 1, borderRadius: 16 },
  button: { minHeight: 48, padding: 14, backgroundColor: CHILLYWOOD_VISUAL.controlBackground, borderColor: CHILLYWOOD_VISUAL.controlBorder, borderWidth: 1, borderRadius: 10 },
  buttonText: { color: CHILLYWOOD_VISUAL.textPrimary, fontSize: 16, fontWeight: "700" }, disabled: { opacity: 0.45 } });
