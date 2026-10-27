import React, { useCallback, useEffect, useRef, useState } from "react";
import { useFocusEffect, useRouter, type Href } from "expo-router";
import { ActivityIndicator, AppState, ImageBackground, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useSession } from "../_lib/session";
import { creatorPurchaseDestinationRoute, creatorPurchaseScope, creatorPurchasePresentation, readMyCreatorPurchases,
  restoreCreatorPurchaseLibrary, type CreatorPurchase, type CreatorPurchasePage } from "../_lib/creatorPurchases";
import { AppBackButton } from "../components/navigation/app-back-button";
import { CHILLYWOOD_VISUAL } from "../components/ui/chillywood-visual-system";

const filters = ["All", "Tickets & passes", "Videos", "Memberships", "Tips"] as const;
type Filter = typeof filters[number];
const dateLabel = (value: string) => new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short", timeZoneName: undefined }).format(new Date(value));
const termDate = (value: unknown): string | null => typeof value === "string" && Number.isFinite(Date.parse(value)) ? value : null;
const changedDate = (current: string | null | undefined, purchased: string | null) => current && (!purchased || Date.parse(current) !== Date.parse(purchased)) ? current : null;
const replayTermsLabel = (terms: Record<string, unknown>) => {
  const availableAt = termDate(terms.replayAvailableAt), expiresAt = termDate(terms.replayExpiresAt);
  if (terms.replayPolicy === "none") return "Replay is not included in these purchase terms.";
  if (terms.replayPolicy === "until_expiration") return expiresAt
    ? `Replay included${availableAt ? ` from ${dateLabel(availableAt)}` : ""} until ${dateLabel(expiresAt)} in the purchase terms. Current playback access is checked when opened.`
    : "Replay was listed with a time limit, but its original expiry is unavailable. Check the event or contact support before relying on replay access.";
  if (terms.replayPolicy === "indefinite") return `Replay included${availableAt ? ` from ${dateLabel(availableAt)}` : ""}, with no expiry specified in the purchase terms. Current playback access is checked when opened.`;
  return "Original replay terms are unavailable. This receipt does not establish replay access.";
};
const moneyLabel = (item: CreatorPurchase) => item.amountMinor === null || item.currency === null ? "Receipt amount unavailable"
  : new Intl.NumberFormat(undefined, { style: "currency", currency: item.currency.toUpperCase() }).format(item.amountMinor / 100);
const matches = (item: CreatorPurchase, filter: Filter) => filter === "All"
  || (filter === "Tickets & passes" && ["event", "watch_party_live", "live_watch_party_access", "live_watch_party_seat", "vip_pass"].includes(item.sourceType))
  || (filter === "Videos" && item.sourceType === "paid_content")
  || (filter === "Memberships" && item.sourceType === "channel_subscription")
  || (filter === "Tips" && item.sourceType === "creator_tip");

export default function PurchasesScreen() {
  const router = useRouter();
  const { user, authority, isLoading: sessionLoading } = useSession();
  const accountKey = `${user?.id ?? ""}:${authority?.sessionGeneration ?? ""}`;
  const accountRef = useRef(accountKey); accountRef.current = accountKey;
  const generationRef = useRef(0);
  const restoreRef = useRef(false);
  const pageInFlightRef = useRef(false);
  const [snapshot, setSnapshot] = useState<{ key: string; page: CreatorPurchasePage | null }>({ key: "", page: null });
  const [loading, setLoading] = useState(true);
  const [paging, setPaging] = useState(false);
  const [restoring, setRestoring] = useState(false);
  const [filter, setFilter] = useState<Filter>("All");
  const [notice, setNotice] = useState<{ key: string; text: string } | null>(null);
  const page = snapshot.key === accountKey ? snapshot.page : null;
  const canRead = !!user?.id && !!authority && !authority.restoreOnly;

  const refresh = useCallback(async () => {
    const key = accountKey, generation = ++generationRef.current;
    setLoading(true);
    setSnapshot({ key, page: null });
    if (!canRead || sessionLoading) { setLoading(false); return; }
    const result = await readMyCreatorPurchases();
    if (accountRef.current !== key || generationRef.current !== generation) return;
    if (result.subjectUserId !== user?.id || result.subjectSessionGeneration !== authority?.sessionGeneration) {
      setSnapshot({ key, page: { ...result, status: "unavailable", items: [], nextCursor: null } });
    } else setSnapshot({ key, page: result });
    setLoading(false);
  }, [accountKey, authority?.sessionGeneration, canRead, sessionLoading, user?.id]);
  useFocusEffect(useCallback(() => { void refresh(); return () => { generationRef.current += 1; }; }, [refresh]));
  useEffect(() => {
    const subscription = AppState.addEventListener("change", state => { if (state === "active") void refresh(); });
    return () => subscription.remove();
  }, [refresh]);

  const loadMore = async () => {
    if (!page?.nextCursor || page.status !== "resolved" || pageInFlightRef.current) return;
    pageInFlightRef.current = true;
    const key = accountKey, generation = generationRef.current, cursor = page.nextCursor;
    setPaging(true);
    try {
      const result = await readMyCreatorPurchases(cursor);
      if (accountRef.current !== key || generationRef.current !== generation) return;
      if (result.status !== "resolved" || result.subjectUserId !== user?.id
        || result.subjectSessionGeneration !== authority?.sessionGeneration
        || (result.nextCursor?.id === cursor.id && result.nextCursor.createdAt === cursor.createdAt)) {
        setNotice({ key, text: "Older purchases could not be loaded. Refresh status and try again." }); return;
      }
      const ids = new Set(page.items.map(item => item.id));
      setSnapshot({ key, page: { ...result, items: [...page.items, ...result.items.filter(item => !ids.has(item.id))] } });
    } finally { pageInFlightRef.current = false; setPaging(false); }
  };
  const restore = async () => {
    if (restoreRef.current || !canRead) return;
    restoreRef.current = true; setRestoring(true);
    const key = accountKey;
    try {
      const result = await restoreCreatorPurchaseLibrary();
      if (accountRef.current !== key) return;
      setNotice({ key, text: result.message });
      await refresh();
    } finally { restoreRef.current = false; setRestoring(false); }
  };
  const shown = (page?.items ?? []).filter(item => matches(item, filter));
  return <ImageBackground source={require("../assets/images/chillywood-branded-background.png")} style={styles.screen} resizeMode="cover">
    <View pointerEvents="none" style={styles.overlay} />
    <SafeAreaView style={styles.screen}>
      <ScrollView contentContainerStyle={styles.content}>
        <AppBackButton testID="purchases-back" accessibilityLabel="Back to Library" onPress={() => {
          if (router.canGoBack()) router.back(); else router.replace("/(tabs)/my-list");
        }} />
        <Text style={styles.heading}>Purchases &amp; My Tickets</Text>
        <Text style={styles.body}>Your receipts, tickets, passes, memberships and tips. Premium is separate. Open an item to check current access; a receipt alone does not grant entry.</Text>
        {!canRead && !sessionLoading ? <View style={styles.card}>
          <Text style={styles.title}>Sign in to view your purchases</Text>
          <Text style={styles.body}>Purchase history is available only for the verified account that made the purchase.</Text>
          <Pressable accessibilityRole="button" testID="purchases-sign-in" style={styles.button} onPress={() => router.push("/(auth)/login")}><Text style={styles.buttonText}>Sign in</Text></Pressable>
        </View> : <>
          <View style={styles.actions}>
            <Pressable accessibilityRole="button" testID="purchases-refresh" disabled={loading} accessibilityState={{ disabled: loading }} style={styles.button} onPress={() => void refresh()}><Text style={styles.buttonText}>Refresh status</Text></Pressable>
            <Pressable accessibilityRole="button" testID="purchases-restore" disabled={restoring || !canRead} accessibilityState={{ disabled: restoring || !canRead }} style={styles.button} onPress={() => void restore()}><Text style={styles.buttonText}>{restoring ? "Restoring…" : "Restore store purchases"}</Text></Pressable>
          </View>
          {notice?.key === accountKey ? <Text style={styles.body} accessibilityLiveRegion="polite">{notice.text}</Text> : null}
          {loading || sessionLoading || snapshot.key !== accountKey ? <View accessibilityLiveRegion="polite" style={styles.card}><ActivityIndicator color="#DC143C" /><Text style={styles.body}>Checking purchase history…</Text></View>
            : page?.status !== "resolved" ? <View style={styles.card} testID="purchases-error"><Text style={styles.title} accessibilityRole="alert">Purchase history could not be verified</Text><Text style={styles.body}>Refresh status to try again. Do not repeat a purchase while its payment is unknown.</Text></View>
              : <>
                <View style={styles.actions}>{filters.map(value => <Pressable key={value} testID={`purchases-filter-${value}`} accessibilityRole="button" accessibilityState={{ selected: filter === value }} style={[styles.filter, filter === value && styles.selected]} onPress={() => setFilter(value)}><Text style={styles.buttonText}>{value}</Text></Pressable>)}</View>
                {shown.length === 0 ? <View testID="purchases-empty" style={styles.card}><Text style={styles.title}>No purchases in this view</Text><Text style={styles.body}>{page.items.length ? "Choose another filter or load older purchases." : "Completed and pending creator purchases will appear here. If you purchased on another device, restore store purchases and refresh."}</Text></View> : shown.map(item => {
                  const status = creatorPurchasePresentation(item), scope = creatorPurchaseScope[item.sourceType];
                  const terms = item.terms;
                  const purchasedStart = item.termsAvailable ? termDate(terms.startsAt) : null;
                  const purchasedEnd = item.termsAvailable ? termDate(terms.endsAt) : null;
                  const currentStart = changedDate(item.startsAt, purchasedStart);
                  const currentEnd = changedDate(item.endsAt, purchasedEnd);
                  return <View key={item.id} style={styles.card} testID={`purchase-${item.id}`}>
                    <Text style={styles.kind}>{scope.title}{item.environment === "sandbox" ? " · Sandbox" : item.environment === "unknown" ? " · Environment unverified" : ""}</Text>
                    <Text style={styles.title}>{item.title ?? scope.title}</Text>
                    <Text style={styles.price}>Purchase price: {moneyLabel(item)}</Text>
                    {item.sourceType === "creator_tip" && item.provider === "stripe_connect" ? <Text testID={`purchase-refund-${item.id}`} style={styles.meta}>
                      {item.refund ? `Provider-reported refund: ${item.refund.state === "none" ? "None" : item.refund.state === "partial" ? "Partial" : "Full"} · ${moneyLabel({ ...item, amountMinor: item.refund.amountMinor })} of ${moneyLabel(item)}` : "Refund amount unavailable. Check the provider receipt or contact support."}
                    </Text> : null}
                    {item.receipt?.reportedAmountMinor != null && item.receipt.reportedCurrency ? <Text style={styles.meta}>Provider-reported amount: {moneyLabel({ ...item, amountMinor: item.receipt.reportedAmountMinor, currency: item.receipt.reportedCurrency })}</Text> : null}
                    <Text style={styles.status}>{item.sourceType === "event" && item.status === "completed" ? "Event ended" : status.label}</Text>
                    <Text style={styles.body}>{item.sourceType === "event" && item.status === "completed" ? "The show has ended. Replay is available only when included in the purchase terms and currently authorized." : status.detail}</Text>
                    {item.refundEligibility ? <Text style={styles.body}>Eligible for refund review because the show was canceled, missed or materially rescheduled. Provider review is required; a refund has not been confirmed.</Text> : null}
                    <Text style={styles.body}>{scope.includes}</Text>
                    <Text style={styles.meta}>Recorded {dateLabel(item.createdAt)} · times shown in your device timezone</Text>
                    {item.sourceType !== "event" && item.startsAt ? <Text style={styles.meta}>Access starts {dateLabel(item.startsAt)}</Text> : null}
                    {item.expiresAt ? <Text style={styles.meta}>Access expires {dateLabel(item.expiresAt)}</Text> : null}
                    {item.termsAvailable ? <View>
                      <Text style={styles.meta}>Recorded purchase terms</Text>
                      {typeof terms.includeText === "string" && terms.includeText.trim() ? <Text style={styles.body}>Includes at purchase: {terms.includeText}</Text> : <Text style={styles.meta}>Original inclusion details are unavailable.</Text>}
                      {item.sourceType === "event" ? <>
                        {purchasedStart ? <Text testID={`purchase-original-start-${item.id}`} style={styles.meta}>Purchased start: {dateLabel(purchasedStart)}</Text> : <Text style={styles.meta}>Original start time is unavailable.</Text>}
                        {purchasedEnd ? <Text testID={`purchase-original-end-${item.id}`} style={styles.meta}>Purchased end: {dateLabel(purchasedEnd)}</Text> : <Text style={styles.meta}>Original end time is unavailable.</Text>}
                        {typeof terms.timeZone === "string" ? <Text style={styles.meta}>Purchased show timezone: {terms.timeZone}</Text> : null}
                        <Text testID={`purchase-replay-terms-${item.id}`} style={styles.meta}>{replayTermsLabel(terms)}</Text>
                      </> : null}
                    </View> : <Text style={styles.meta}>Original detailed terms are unavailable for this historical receipt.</Text>}
                    {item.sourceType === "event" && currentStart ? <Text testID={`purchase-current-start-${item.id}`} style={styles.meta}>Current scheduled start: {dateLabel(currentStart)}{purchasedStart ? " · changed since purchase" : " · original time unavailable"}</Text> : null}
                    {item.sourceType === "event" && currentEnd ? <Text testID={`purchase-current-end-${item.id}`} style={styles.meta}>Current scheduled end: {dateLabel(currentEnd)}{purchasedEnd ? " · changed since purchase" : " · original time unavailable"}</Text> : null}
                    <Text selectable style={styles.meta}>Receipt reference: {item.purchaseIntentId ?? item.id}</Text>
                    <View style={styles.actions}>
                      {!status.pending && item.destination ? <Pressable testID={`purchase-open-${item.id}`} accessibilityRole="button" accessibilityLabel={`View ${item.title ?? scope.title}`} style={styles.button} onPress={() => {
                        if (accountRef.current === accountKey && item.destination) router.push(creatorPurchaseDestinationRoute(item.destination) as Href);
                      }}><Text style={styles.buttonText}>View item</Text></Pressable> : null}
                      <Pressable testID={`purchase-support-${item.id}`} accessibilityRole="button" accessibilityLabel={`Get help with ${scope.title}`} style={styles.button} onPress={() => router.push("/support")}><Text style={styles.buttonText}>Get help</Text></Pressable>
                    </View>
                  </View>;
                })}
                {page.nextCursor ? <Pressable testID="purchases-load-more" accessibilityRole="button" disabled={paging} accessibilityState={{ disabled: paging }} style={styles.button} onPress={() => void loadMore()}><Text style={styles.buttonText}>{paging ? "Loading…" : "Load older purchases"}</Text></Pressable> : null}
              </>}
        </>}
      </ScrollView>
    </SafeAreaView>
  </ImageBackground>;
}

const styles = StyleSheet.create({
  screen: { flex: 1 }, overlay: { ...StyleSheet.absoluteFillObject, backgroundColor: "rgba(0,0,0,0.76)" },
  content: { padding: 20, paddingBottom: 48, gap: 16 }, heading: { color: "#fff", fontSize: 26, fontWeight: "900" },
  body: { color: "#C6CDDB", fontSize: 14, lineHeight: 21 }, title: { color: "#fff", fontSize: 18, fontWeight: "800" },
  card: { gap: 10, padding: 16, borderWidth: 1, borderColor: "rgba(255,255,255,0.18)", borderRadius: 16, backgroundColor: CHILLYWOOD_VISUAL.glassBackground },
  kind: { color: "#F2C25B", fontSize: 12, fontWeight: "700" }, price: { color: "#fff", fontSize: 22, fontWeight: "800" },
  status: { color: "#FF91A3", fontSize: 15, fontWeight: "800" }, meta: { color: "#B6C0D0", fontSize: 12, lineHeight: 18 },
  actions: { flexDirection: "row", flexWrap: "wrap", gap: 10 }, button: { minHeight: 44, paddingHorizontal: 14, paddingVertical: 12, justifyContent: "center", borderRadius: 10, backgroundColor: "rgba(220,20,60,0.25)", borderWidth: 1, borderColor: "#DC143C", alignSelf: "flex-start" },
  buttonText: { color: "#fff", fontSize: 13, fontWeight: "700" }, filter: { minHeight: 44, padding: 12, borderRadius: 12, borderWidth: 1, borderColor: "#5C6170" }, selected: { borderColor: "#DC143C", backgroundColor: "rgba(220,20,60,0.25)" },
});
