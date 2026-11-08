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
import { readNativeSandboxDeviceProduct } from "../../_lib/nativeStoreSandboxProduct";

// Normal-app, any active account. No admin role or second RevenueCat SDK owner.
// Prepares/reconciles a selection and explicitly reads the device catalog.
// Never invokes purchase or restore, and catalog matches grant no authority.
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
  const [reservationMessage, setReservationMessage] = useState<string | null>(null), [reservationReadable, setReservationReadable] = useState(false);
  const describeAttempt = (status: string) => status === "dispatch_reserved"
    ? "A reservation request is saved on this device. Its server status has not been checked. This is not proof that a purchase ran."
    : status === "blocked_by_other_selection" ? "This store product has a retained request for another selection. Keep that request; do not start a replacement purchase."
    : status === "reservation_write_uncertain" ? "The reservation request's local save is unconfirmed. Keep this request; do not start a replacement purchase." : null;
  const owner = useRef<{ client: NativeSandboxQuoteClient; active: boolean; pending: boolean } | null>(null);
  useEffect(() => {
    let active = true; let local: typeof owner.current = null;
    owner.current = null; setBusy(true); setQuote(null); setSelection(null); setSaved(false); setReservationMessage(null); setReservationReadable(false);
    void captureNativeSandboxQuoteClient(expected, offerId, store).then(async client => {
      if (!active) { client.dispose(); return; }
      local = { client, active: true, pending: true }; owner.current = local;
      const retained = await client.readSaved(); if (!active) return;
      setSaved(!!retained);
      if (retained) { const attempt = await client.readPurchaseAttempt(); if (!active) return; setReservationMessage(describeAttempt(attempt.status)); setReservationReadable(attempt.status === "dispatch_reserved"); setQuote(retained.quote); setMessage("A selection request is saved. Read its server status before doing anything else."); return; }
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
    void (mode === "prepare" ? local.client.prepare(quote!) : local.client.recover()).then(async result => {
      if (!local.active) return;
      const value = result.data.selection ?? null; setSelection(value); if (value) setQuote(value.quote);
      if (value) {
        try { const attempt = await local.client.readPurchaseAttempt(); if (!local.active) return;
          setReservationReadable(attempt.status === "dispatch_reserved"); setReservationMessage(attempt.serverReservationConfirmed
            ? "The server has this exact reservation. No store purchase or test-account qualification is confirmed." : describeAttempt(attempt.status));
        } catch { if (!local.active) return; setReservationReadable(false); setReservationMessage("The retained reservation could not be read. Keep the saved request; do not start a replacement purchase."); }
      }
      setMessage(value ? "Your exact selection is recorded. Store purchase and playback are not enabled by this preparation."
        : "The selection is not confirmed. Keep this saved request and check status later; do not start a replacement.");
    }).catch(() => { if (local.active) setMessage("The result is unconfirmed. Keep the saved request and read status; no store purchase was started by this screen."); })
      .finally(() => { local.pending = false; if (local.active) setBusy(false); });
  };
  const readReservation = () => {
    const local = owner.current; if (!local?.active || local.pending || !selection || !reservationReadable) return;
    local.pending = true; setBusy(true);
    void local.client.recoverPurchaseAttempt().then(result => {
      if (!local.active) return;
      setReservationMessage(result.status === "ok"
        ? "The server has this exact reservation. No store purchase or test-account qualification is confirmed."
        : "The saved reservation is not confirmed on the server. Keep the original request; do not start a replacement purchase.");
    }).catch(() => { if (local.active) setReservationMessage("Reservation status could not be confirmed. Keep the original request; do not start a replacement purchase."); })
      .finally(() => { local.pending = false; if (local.active) setBusy(false); });
  };
  const checkDeviceProduct = () => {
    const local = owner.current; if (!local?.active || local.pending || !quote) return;
    local.pending = true; setBusy(true);
    void readNativeSandboxDeviceProduct(expected, quote).then(result => {
      if (!local.active) return;
      setMessage(result.status === "matched"
        ? "This device's store product and price match the server quote. This does not verify a test account or enable a purchase."
        : result.reason === "sdk_account_unavailable" ? "The store SDK account could not be matched to your current account. No purchase was started."
        : result.reason === "payments_unavailable" ? "This device is not reporting store payment capability. No purchase was started."
        : "This device's store product and price could not be matched. No purchase was started.");
    }).catch(() => { if (local.active) setMessage("Store availability could not be read. No purchase was started."); })
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
    {reservationMessage && <Text testID="native-sandbox-reservation-status" accessibilityLiveRegion="polite" style={styles.body}>{reservationMessage}</Text>}
    {reservationReadable && <Button id="native-sandbox-reservation-recover" disabled={busy || !selection || !owner.current} action={readReservation}>Read saved reservation status</Button>}
    <Button id="native-sandbox-refresh" disabled={busy} action={() => setRevision(n => n + 1)}>Reconnect and read status</Button>
    <Button id="native-sandbox-check-product" disabled={busy || !quote || !owner.current} action={checkDeviceProduct}>Check device store availability</Button>
    <Text style={styles.body}>Native one-time receipt correlation still needs qualification. A displayed price, saved selection or SDK result is not proof of paid access.</Text>
  </View>;
}
const styles = StyleSheet.create({ screen: { flex: 1 }, overlay: { ...StyleSheet.absoluteFillObject, backgroundColor: "rgba(0,0,0,0.76)" },
  content: { padding: 20, paddingBottom: 48, gap: 16, maxWidth: 760, width: "100%", alignSelf: "center" },
  heading: { color: CHILLYWOOD_VISUAL.textPrimary, fontSize: 26, fontWeight: "900" }, body: { color: CHILLYWOOD_VISUAL.textMuted, fontSize: 16, lineHeight: 24 },
  card: { padding: 16, gap: 14, backgroundColor: CHILLYWOOD_VISUAL.glassBackground, borderColor: CHILLYWOOD_VISUAL.glassBorder, borderWidth: 1, borderRadius: 16 },
  button: { minHeight: 48, padding: 14, backgroundColor: CHILLYWOOD_VISUAL.controlBackground, borderColor: CHILLYWOOD_VISUAL.controlBorder, borderWidth: 1, borderRadius: 10 },
  buttonText: { color: CHILLYWOOD_VISUAL.textPrimary, fontSize: 16, fontWeight: "700" }, disabled: { opacity: 0.45 } });
