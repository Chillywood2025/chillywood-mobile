import React, { useEffect, useRef, useState } from "react";
import { ActivityIndicator, ImageBackground, Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useLocalSearchParams, useRouter, type Href } from "expo-router";
import { useSession } from "../../_lib/session";
import { type AccountSessionAuthorityBinding } from "../../_lib/accountSessionAuthority";
import { capturePaidVideoV2Actions, type PaidVideoV2Actions, type PaidVideoV2Presentation, type PaidVideoV2View } from "../../_lib/isolatedPaidVideoV2Actions";
import { type PaidVideoV2Upload } from "../../_lib/isolatedPaidVideoV2";
import { AppBackButton } from "../navigation/app-back-button";
import { IsolatedTestStoreV3Checkout } from "./isolated-test-store-v3-checkout";
import { formatPaidVideoOfferCode, parsePaidVideoOfferCode } from "../../_lib/isolatedPaidVideoOfferCode";
import { useMediaPicker } from "../../hooks/useMediaPicker";
import { readPaidVideoAuthoringProfile } from "../../_lib/paidVideoAuthoringProfile";

const path = (kind: "upload" | "offer" | "status", id: string) => `/sandbox-videos/${kind}/${encodeURIComponent(id)}` as Href;
const scalar = (value: string | string[] | undefined) => typeof value === "string" ? value : "";
const titles = { home: "Sandbox videos", studio: "Sandbox video studio", upload: "Sandbox video draft", offer: "Sandbox video offer", history: "Sandbox video history", status: "Sandbox video status" };
function Action({ children, testID, onPress, disabled = false }: { children: React.ReactNode; testID: string; onPress(): void; disabled?: boolean }) {
  return <Pressable testID={testID} accessibilityRole="button" accessibilityState={{ disabled }} disabled={disabled} onPress={onPress} style={[styles.action, disabled && styles.disabled]}><Text style={styles.actionText}>{children}</Text></Pressable>;
}
function Frame({ title, children, onBack }: { title: string; children: React.ReactNode; onBack?: () => void }) {
  const router = useRouter();
  return <ImageBackground source={require("../../assets/images/chillywood-branded-background.png")} style={styles.screen} resizeMode="cover"><View pointerEvents="none" style={styles.overlay} />
    <SafeAreaView style={styles.screen}><ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={styles.content}>
      <AppBackButton accessibilityLabel="Back from sandbox videos" testID="paid-video-back" onPress={() => { if (onBack) onBack(); else if (router.canGoBack()) router.back(); else router.replace("/(tabs)/my-list"); }} />
      <Text accessibilityRole="header" style={styles.heading}>{title}</Text>
      <Text style={styles.body}>Sandbox content only. No payable earnings, payouts or cashout. Buyers do not need Premium. Confirm the store’s test-payment details before approving a purchase.</Text>{children}
    </ScrollView></SafeAreaView></ImageBackground>;
}
function UploadSummary({ upload }: { upload: PaidVideoV2Upload }) {
  const scan = upload.state === "scan_pending" ? "Scan pending" : upload.state === "clean" && upload.bytesClean ? "Byte scan passed"
    : upload.state === "rejected" ? "File rejected" : upload.state === "retired" ? "Draft retired" : "Upload not verified";
  return <View style={styles.card}><Text accessibilityRole="header" style={styles.subheading}>{upload.title}</Text>
    <Text style={styles.body}>{scan} · Moderation: {upload.moderation}</Text>
    <Text style={styles.body}>{upload.expectedByteLength.toLocaleString()} expected bytes. Local file inspection does not establish server scan or playback access.</Text>
  </View>;
}
export function IsolatedPaidVideoV2Screen({ page }: { page: PaidVideoV2View["page"] }) {
  const { user, authority, isLoading } = useSession(); const router = useRouter();
  const params = useLocalSearchParams<{ uploadId?: string; offerId?: string; requestId?: string }>();
  const id = page === "upload" ? scalar(params.uploadId) : page === "offer" ? scalar(params.offerId) : scalar(params.requestId);
  if (isLoading) return <Frame title={titles[page]}><ActivityIndicator /><Text style={styles.body}>Checking your account…</Text></Frame>;
  if (!user || !authority || authority.restoreOnly || user.id !== authority.userId) return <Frame title={titles[page]}>
    <Text style={styles.body}>Sign in with an active account to read your own drafts and saved actions.</Text>
    <Action testID="paid-video-sign-in" onPress={() => router.push("/(auth)/login")}>Sign in</Action></Frame>;
  return <VideoSession key={`${page}:${id}:${authority.userId}:${authority.sessionGeneration}`} authority={authority} page={page} id={id} />;
}
function VideoSession({ authority, page, id }: { authority: AccountSessionAuthorityBinding; page: PaidVideoV2View["page"]; id: string }) {
  const authoringMode = readPaidVideoAuthoringProfile()?.mode;
  const nativeStore = authoringMode === "native";
  const { pickMedia, mediaPickerSheet } = useMediaPicker(`sandbox-video-v2:${page}:${id}`);
  const [capturedAuthority] = useState(() => Object.freeze({ ...authority }));
  const router = useRouter(); const [actions, setActions] = useState<PaidVideoV2Actions | null>(null);
  const [state, setState] = useState<PaidVideoV2Presentation | null>(null); const [connectionError, setConnectionError] = useState(false);
  const [connectionRevision, setConnectionRevision] = useState(0); const [title, setTitle] = useState(""); const [amount, setAmount] = useState("");
  const [offerCode, setOfferCode] = useState("");
  const [retirementReview, setRetirementReview] = useState<{ requestId: string; actions: PaidVideoV2Actions } | null>(null);
  const retirementOwner = useRef<typeof retirementReview>(null);
  const dismissRetirement = () => { retirementOwner.current = null; setRetirementReview(null); };
  useEffect(() => {
    retirementOwner.current = null; setRetirementReview(null);
    return () => { retirementOwner.current = null; };
  }, [actions, state?.retired]);
  useEffect(() => {
    // A new effect incarnation owns new closures. Cleanup never revives an old
    // owner after StrictMode replay or an observed account/session gap.
    let active = true; let owned: PaidVideoV2Actions | null = null; setActions(null); setState(null); setConnectionError(false);
    void capturePaidVideoV2Actions(capturedAuthority, { page, id }, value => { if (active) setState(value); }).then(value => {
      if (!active) { value.dispose(); return; } owned = value; setActions(value); void value.refresh();
    }).catch(() => { if (active) setConnectionError(true); });
    return () => { active = false; owned?.dispose(); };
  }, [capturedAuthority, page, id, connectionRevision]);
  const unavailable = !actions || !state || state.busy || state.retired;
  const unresolved = state?.attempts.some(a => a.state === "prepared" || a.state === "unknown") ?? false;
  const noMutation = unavailable || !state?.journalReady || unresolved;
  const safeRun = (run: (owner: PaidVideoV2Actions) => Promise<void>) => { if (actions) void run(actions); };
  const chooseVideoFile = () => safeRun(a => a.chooseFile(choose => pickMedia({ title: "Choose sandbox MP4", mediaKind: "video", sources: ["photos", "files"],
    pick: (source, operation) => choose(source, operation),
  })));
  const amountMinor = /^\d+(?:\.\d{1,2})?$/u.test(amount) ? Math.round(Number(amount) * 100) : 0;
  return <Frame title={titles[page]} onBack={retirementReview ? dismissRetirement : undefined}>
    {mediaPickerSheet}
    {nativeStore && retirementReview && !unavailable && <Modal testID="paid-video-retirement-review" visible transparent animationType="fade" onRequestClose={dismissRetirement}>
      <SafeAreaView style={styles.confirmationBackdrop}><ScrollView contentContainerStyle={styles.confirmationContent}><View style={styles.card} accessibilityViewIsModal>
        <Text accessibilityRole="header" style={styles.subheading}>Keep the original transfer unconfirmed?</Text>
        <Text style={styles.body}>The original transfer may still finish. This does not cancel it or change its server state. Its saved history and original-file verification remain available.</Text>
        <Text style={styles.body}>This only allows you to return to Studio and explicitly reserve a different upload with a new identity. Nothing is reserved, uploaded or retried now.</Text>
        <Action testID="paid-video-retirement-confirm" onPress={() => {
          const review = retirementOwner.current;
          if (!review || review !== retirementReview || review.actions !== actions) return;
          dismissRetirement();
          void review.actions.retireUnknownTransfer(review.requestId);
        }}>Keep unconfirmed; allow a new upload</Action>
        <Action testID="paid-video-retirement-cancel" onPress={dismissRetirement}>Cancel</Action>
      </View></ScrollView></SafeAreaView>
    </Modal>}
    <Action testID="paid-video-studio-link" onPress={() => router.push("/sandbox-videos/studio" as Href)}>Creator studio</Action>
    <Action testID="paid-video-history-link" onPress={() => router.push("/sandbox-videos/history" as Href)}>My drafts and saved actions</Action>
    <Text style={styles.body}>Upload availability is checked for your account and this build. Stored bytes still require scanning and moderation before publication.</Text>
    {state?.busy && <ActivityIndicator accessibilityLabel="Checking video status" />}
    {connectionError && <Text accessibilityLiveRegion="polite" style={styles.notice}>Sandbox videos are unavailable. This account view could not be verified.</Text>}
    {state?.notice && <Text accessibilityLiveRegion="polite" style={styles.notice}>{state.notice}</Text>}
    <Action testID="paid-video-refresh" disabled={!!state?.busy || !!state?.retired} onPress={() => { if (actions) void actions.refresh(); else setConnectionRevision(v => v + 1); }}>Refresh current status</Action>
    {state?.requestId && <Action testID="paid-video-action-status" disabled={unavailable} onPress={() => router.push(path("status", state.requestId!))}>Check saved action</Action>}
    {page === "home" && <View style={styles.card}>
      <Text accessibilityRole="header" style={styles.subheading}>Open a creator’s sandbox video</Text>
      <Text style={styles.body}>Ask the creator to share their published sandbox offer code. Buyers do not need Premium. Opening a code reads the current offer and never starts a purchase.</Text>
      <TextInput testID="paid-video-offer-code" accessibilityLabel="Sandbox video offer code" value={offerCode} onChangeText={setOfferCode}
        autoCapitalize="none" autoCorrect={false} maxLength={128} editable={!unavailable} placeholder="Paste sandbox offer code" placeholderTextColor="#a9b5c5" style={styles.input} />
      {!!offerCode && !parsePaidVideoOfferCode(offerCode) && <Text accessibilityLiveRegion="polite" style={styles.notice}>Use the complete sandbox offer code. Web addresses and other identifiers are not accepted.</Text>}
      <Action testID="paid-video-open-offer-code" disabled={unavailable || !parsePaidVideoOfferCode(offerCode)}
        onPress={() => safeRun(a => a.openOfferCode(offerCode, offerId => router.push(path("offer", offerId))))}>Open sandbox offer</Action>
    </View>}
    {(page === "home" || page === "studio") && <View style={styles.card}>
      <Text accessibilityRole="header" style={styles.subheading}>Creator access</Text>
      <Text style={styles.body}>{state?.capability ? state.capability.creatorEligible ? "Premium creator authoring is available for this account." : "Creator eligibility is not currently verified. Your retained history remains available." : "Creator access has not been verified."}</Text>
      <Text style={styles.body}>Selecting a file does not upload it. Use an MP4 up to 16 MiB and 60 seconds, H.264 video with optional AAC audio.</Text>
    </View>}
    {page === "studio" && <View style={styles.card}>
      <Text accessibilityRole="header" style={styles.subheading}>Prepare a draft</Text>
      <TextInput testID="paid-video-title" accessibilityLabel="Video title" value={title} onChangeText={setTitle} maxLength={200} editable={!unavailable} placeholder="Video title" placeholderTextColor="#a9b5c5" style={styles.input} />
      <Action testID="paid-video-select" disabled={unavailable} onPress={chooseVideoFile}>Choose MP4</Action>
      {state?.file && <Text style={styles.body}>{state.file.name} · {state.file.expectedByteLength.toLocaleString()} bytes inspected locally</Text>}
      <Action testID="paid-video-reserve" disabled={noMutation || !state?.file || !title.trim() || !state.capability?.creatorEligible || !state.capability.uploadRouteAvailable}
        onPress={() => safeRun(a => a.reserve(title))}>Save draft reservation</Action>
    </View>}
    {unresolved && <Text style={styles.notice}>A saved action is unresolved. Check its status before starting another action. Restarting does not resend it.</Text>}
    {(page === "studio" || page === "history") && <View>
      <Text accessibilityRole="header" style={styles.subheading}>Account drafts</Text>
      {state?.uploads.map(upload => <View key={upload.id}><UploadSummary upload={upload} /><Action testID={`paid-video-open-${upload.id}`} disabled={unavailable} onPress={() => router.push(path("upload", upload.id))}>Review draft</Action></View>)}
      <Action testID="paid-video-more" disabled={unavailable || !state?.nextCursor} onPress={() => safeRun(a => a.loadMore())}>Load more drafts</Action>
    </View>}
    {state?.upload && <><UploadSummary upload={state.upload} />
      {page !== "upload" && <Action testID="paid-video-open-upload" disabled={unavailable} onPress={() => router.push(path("upload", state.upload!.id))}>Review current draft</Action>}</>}
    {page === "upload" && <View style={styles.card}>
      <Action testID="paid-video-select-transfer" disabled={unavailable} onPress={chooseVideoFile}>Select matching MP4</Action>
      {state?.file && <Text style={styles.body}>{state.file.name} · {state.file.expectedByteLength.toLocaleString()} locally inspected bytes</Text>}
      <Action testID="paid-video-transfer" disabled={noMutation || !state?.transferReady || !state.file || !state.upload?.transferAvailable
        || state.file.expectedSha256 !== state.upload.expectedSha256 || state.file.expectedByteLength !== state.upload.expectedByteLength
        || state.transfers.some(t => t.upload.id === state.upload!.id && t.state !== "not_applied")}
        onPress={() => safeRun(a => a.transfer())}>Upload matching file once</Action>
      <Action testID="paid-video-finalize" disabled={noMutation || !state?.upload || !["reserved", "scan_pending"].includes(state.upload.state) || !state.transfers.some(t => t.upload.id === state.upload!.id && t.state === "recorded")} onPress={() => safeRun(a => a.finalize())}>Request scan finalization</Action>
      <TextInput testID="paid-video-price" accessibilityLabel="Test video price in US dollars" value={amount} onChangeText={setAmount} keyboardType="decimal-pad" editable={!noMutation} placeholder="Test price in USD" placeholderTextColor="#a9b5c5" style={styles.input} />
      <Action testID="paid-video-publish" disabled={noMutation || !Number.isSafeInteger(amountMinor) || amountMinor < 1 || amountMinor > 999999999
        || state?.upload?.state !== "clean" || !state.upload.bytesClean || state.upload.moderation !== "clear" || state.resource?.status !== "draft"}
        onPress={() => safeRun(a => a.publishOffer(amountMinor))}>Publish test offer</Action>
    </View>}
    {state?.offer && <View style={styles.card}>
      <Text accessibilityRole="header" style={styles.subheading}>Test offer · {state.offer.status}</Text>
      <Text style={styles.body}>{(state.offer.amountMinor / 100).toFixed(2)} {state.offer.currency.toUpperCase()}</Text>
      <Text style={styles.body}>A published offer does not establish a completed purchase or playback access.</Text>
      <Action testID="paid-video-offer-link" disabled={unavailable} onPress={() => router.push(path("offer", state.offer!.id))}>Review offer</Action>
      {nativeStore && !state.upload && <Action testID="paid-video-native-store-quote" disabled={unavailable || state.offer.status !== "published"}
        onPress={() => router.push(`/sandbox-videos/native-offer/${encodeURIComponent(state.offer!.id)}` as Href)}>Review native store sandbox quote</Action>}
      {nativeStore && !!state.upload && <Text style={styles.body}>Share the offer code with a different signed-in buyer. Your own account cannot buy this video.</Text>}
      <Action testID="paid-video-retire" disabled={noMutation || !state.upload || state.offer.status !== "published"} onPress={() => safeRun(a => a.retireOffer())}>Retire test offer</Action>
      {!!state.upload && state.offer.status === "published" && <>
        <Text style={styles.body}>Share this sandbox code with another signed-in test buyer. They can open it from Sandbox videos.</Text>
        <Text testID="paid-video-shared-offer-code" selectable style={styles.body}>{formatPaidVideoOfferCode(state.offer.id)}</Text>
        <Action testID="paid-video-share-offer" disabled={unavailable} onPress={() => safeRun(a => a.shareOffer())}>Share sandbox offer code</Action>
      </>}
    </View>}
    {(page === "upload" || page === "history") && <View>
      <Text accessibilityRole="header" style={styles.subheading}>Saved file transfers</Text>
      <Text style={styles.body}>An upload response is not stored-byte proof. Verification reads the original transfer; it never sends the file again.</Text>
      {state?.transfers.filter(t => page === "history" || t.upload.id === state.upload?.id).map(transfer => <View key={transfer.requestId} style={styles.card}>
        <Text style={styles.body}>{transfer.state === "recorded" ? "Exact object receipt recorded; scan and moderation still required" : transfer.state === "not_applied" ? "Transfer not sent"
          : transfer.state === "retired_unknown" ? "Original transfer still unconfirmed. It may still finish; it was not cancelled and will never be resent. Saved history and verification remain available." : "Stored bytes unconfirmed"}</Text>
        <Action testID={`paid-video-verify-${transfer.requestId}`} disabled={unavailable || transfer.state === "not_applied"} onPress={() => safeRun(a => a.verifyTransfer(transfer.requestId))}>Verify original stored file</Action>
        {nativeStore && (transfer.state === "prepared" || transfer.state === "unknown") && <Action testID={`paid-video-retire-transfer-${transfer.requestId}`}
          disabled={unavailable || !state.transferReady} onPress={() => {
            if (unavailable || !actions || !state.transferReady) return;
            const review = { requestId: transfer.requestId, actions };
            retirementOwner.current = review; setRetirementReview(review);
          }}>Review allowing a new upload</Action>}
      </View>)}
    </View>}
    {authoringMode === "test_store_v3" && (page === "offer" || page === "history") && <IsolatedTestStoreV3Checkout authority={capturedAuthority} offerId={page === "offer" ? id : null} />}
    {(page === "history" || page === "status") && <View>
      <Text accessibilityRole="header" style={styles.subheading}>Actions saved on this device</Text>
      <Text style={styles.body}>Recorded actions are acknowledgments, not proof of the current scan, moderation or offer state. Account drafts above come from the server.</Text>
      {state?.attempts.map(attempt => <View key={attempt.requestId} style={styles.card}>
        <Text style={styles.body}>{({ "upload.reserve": "Draft reservation", "upload.finalize": "Finalization request", "offer.publish": "Offer publication", "offer.retire": "Offer retirement" })[attempt.command]} · {attempt.state === "completed" ? "Recorded by server" : attempt.state === "not_applied" ? "Not applied" : "Unconfirmed"}</Text>
        <Action testID={`paid-video-recover-${attempt.requestId}`} disabled={unavailable} onPress={() => safeRun(a => a.recover(attempt.requestId))}>Read saved action status</Action>
      </View>)}
    </View>}
  </Frame>;
}
const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: "#08111d" }, overlay: { ...StyleSheet.absoluteFillObject, backgroundColor: "rgba(3,10,18,0.87)" },
  confirmationBackdrop: { flex: 1, padding: 20, backgroundColor: "rgba(3,10,18,0.87)" },
  confirmationContent: { flexGrow: 1, justifyContent: "center", maxWidth: 760, width: "100%", alignSelf: "center" },
  content: { padding: 20, paddingBottom: 48, gap: 14, maxWidth: 760, width: "100%", alignSelf: "center" },
  heading: { color: "#fff", fontSize: 28, fontWeight: "800" }, subheading: { color: "#fff", fontSize: 19, fontWeight: "700" },
  body: { color: "#dce6f2", fontSize: 16, lineHeight: 24 }, notice: { color: "#ffe0a1", fontSize: 16, lineHeight: 24 },
  card: { backgroundColor: "#142235", borderColor: "#31445b", borderWidth: 1, borderRadius: 14, padding: 16, gap: 12, marginBottom: 12 },
  action: { minHeight: 48, paddingHorizontal: 16, paddingVertical: 12, backgroundColor: "#2b547a", borderRadius: 10, justifyContent: "center" },
  actionText: { color: "#fff", fontSize: 16, fontWeight: "700" }, disabled: { opacity: 0.48 },
  input: { minHeight: 48, borderWidth: 1, borderColor: "#62758c", borderRadius: 8, color: "#fff", paddingHorizontal: 12, paddingVertical: 10, fontSize: 16 },
});
