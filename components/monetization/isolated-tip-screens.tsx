import React, { useCallback, useEffect, useRef, useState } from "react";
import { useLocalSearchParams, useRouter, type Href } from "expo-router";
import { ActivityIndicator, AppState, ImageBackground, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useSession } from "../../_lib/session";
import { getCurrentAccountSessionAuthoritySnapshot, sameAccountSessionAuthority, subscribeToAccountSessionAuthority, type AccountSessionAuthorityBinding } from "../../_lib/accountSessionAuthority";
import { captureIsolatedTipClient, newTipRequestId, tipId, tipUuid, type IsolatedTipClient, type TipCommand, type TipData, type TipPayloads, type TipMutation, type TipCapability, type TipAttempt, type TipOffer, type TipResource } from "../../_lib/isolatedSandboxTips";
import { createIsolatedSandboxAttemptJournal, type IsolatedSandboxTipAttemptPayloads } from "../../_lib/isolatedSandboxTipAttempts";
import { createIsolatedSandboxTipCheckoutJournal, type IsolatedSandboxTipCheckoutAttempt, type IsolatedSandboxTipCheckoutQuote } from "../../_lib/isolatedSandboxTipCheckoutAttempts";
import { IsolatedSandboxCommerceError } from "../../_lib/isolatedSandboxCommerce";
import { AppBackButton } from "../navigation/app-back-button";
import { IsolatedTipReceipt, isolatedTipMoney } from "./isolated-tip-receipt";

type Page = "home" | "studio" | "offer" | "status" | "history";
type Notice = { message: string; requestId?: string };
const unavailable = "Sandbox tools are unavailable. The backend could not verify this view. Refresh to check again.";
const checkoutUnavailable = "Test checkout is not connected for this platform.";
const param = (value: string | string[] | undefined) => typeof value === "string" ? value : "";
const quoteForOffer = (offer: TipOffer): IsolatedSandboxTipCheckoutQuote => ({
  offerId: offer.id, offerRevision: offer.revision, resourceId: offer.resourceId,
  resourceRevision: offer.resourceRevision, creatorId: offer.creatorId, kind: "creator_tip",
  amountMinor: offer.amountMinor, currency: offer.currency,
});
function Action({ children, onPress, disabled = false, selected, testID }: { children: React.ReactNode; onPress(): void; disabled?: boolean; selected?: boolean; testID: string }) {
  return <Pressable testID={testID} accessibilityRole="button" accessibilityState={{ disabled, ...(selected !== undefined ? { selected } : {}) }} disabled={disabled} onPress={onPress} style={[styles.action, disabled && styles.disabled]}><Text style={styles.actionText}>{children}</Text></Pressable>;
}
function Frame({ title, children }: { title: string; children: React.ReactNode }) {
  const router = useRouter();
  return <ImageBackground source={require("../../assets/images/chillywood-branded-background.png")} style={styles.screen} resizeMode="cover">
    <View pointerEvents="none" style={styles.overlay} /><SafeAreaView style={styles.screen}><ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={styles.content}>
      <AppBackButton accessibilityLabel="Back from sandbox tips" testID="isolated-tip-back" onPress={() => { if (router.canGoBack()) router.back(); else router.replace("/(tabs)/my-list"); }} />
      <Text accessibilityRole="header" style={styles.heading}>{title}</Text>
      <Text style={styles.body}>Sandbox tips · Test support only. No payable earnings, payouts or cashout. Buying a tip does not require Premium.</Text>
      {children}
    </ScrollView></SafeAreaView>
  </ImageBackground>;
}

/** Exact session key remounts presentation; transport additionally retires on
 * every published authority gap, including an A→B→A transition between renders. */
export function IsolatedTipScreen({ page }: { page: Page }) {
  const { user, authority, isLoading } = useSession();
  const params = useLocalSearchParams<{ offerId?: string; intentId?: string; receiptId?: string; requestId?: string }>();
  const router = useRouter();
  const title = { home: "Sandbox tips", studio: "Sandbox tip studio", offer: "Sandbox tip offer", status: "Sandbox tip status", history: "Sandbox tip history" }[page];
  if (isLoading) return <Frame title={title}><ActivityIndicator /><Text style={styles.body}>Checking your account…</Text></Frame>;
  if (!user || !authority || authority.restoreOnly || authority.userId !== user.id) return <Frame title={title}><Text style={styles.body}>Sign in with an active account to use sandbox tools and read your own history.</Text><Action testID="isolated-tip-sign-in" onPress={() => router.push("/(auth)/login")}>Sign in</Action></Frame>;
  return <TipSession key={`${page}:${user.id}:${authority.sessionGeneration}:${param(params.offerId)}:${param(params.intentId)}:${param(params.receiptId)}:${param(params.requestId)}`} page={page} title={title} authority={authority} />;
}

function TipSession({ page, title, authority }: { page: Page; title: string; authority: AccountSessionAuthorityBinding }) {
  const router = useRouter();
  const params = useLocalSearchParams<{ offerId?: string; intentId?: string; receiptId?: string; requestId?: string }>();
  const [client, setClient] = useState<IsolatedTipClient | null>(null);
  const [notice, setNotice] = useState<Notice | null>(null);
  const [busy, setBusy] = useState(false);
  const [revision, setRevision] = useState(0);
  const [connectionRevision, setConnectionRevision] = useState(0);
  const [data, setData] = useState<TipData[TipCommand] | null>(null);
  const [capability, setCapability] = useState<TipCapability | null>(null);
  const [journalReady, setJournalReady] = useState(false);
  const [journalEntries, setJournalEntries] = useState<Awaited<ReturnType<ReturnType<typeof createIsolatedSandboxAttemptJournal>["list"]>>>([]);
  const [checkoutReady, setCheckoutReady] = useState(false);
  const [checkoutEntries, setCheckoutEntries] = useState<readonly IsolatedSandboxTipCheckoutAttempt[]>([]);
  const [reviewedQuote, setReviewedQuote] = useState("");
  const alive = useRef(true); const retired = useRef(false); const generation = useRef(0); const mutationPending = useRef(false);
  const pagePending = useRef(false); const pageRequest = useRef(0);
  const [role, setRole] = useState<"buyer" | "creator">("buyer");
  const [draftTitle, setDraftTitle] = useState(""); const [country, setCountry] = useState(""); const [region, setRegion] = useState("");
  const [adult, setAdult] = useState<boolean | null>(null);
  const [journal] = useState(() => createIsolatedSandboxAttemptJournal({ userId: authority.userId }));
  const [checkoutJournal] = useState(() => createIsolatedSandboxTipCheckoutJournal({ userId: authority.userId }));
  const current = useCallback(() => alive.current && !retired.current && sameAccountSessionAuthority(authority, getCurrentAccountSessionAuthoritySnapshot()), [authority]);
  useEffect(() => subscribeToAccountSessionAuthority(value => { if (!sameAccountSessionAuthority(authority, value)) { retired.current = true; generation.current += 1; setData(null); setCapability(null); setJournalEntries([]); setJournalReady(false); setCheckoutEntries([]); setCheckoutReady(false); setReviewedQuote(""); setNotice({ message: "Your account session changed. Reopen this view to check current history." }); } }), [authority]);
  useEffect(() => {
    alive.current = true; let owned: IsolatedTipClient | null = null; let active = true;
    setNotice(null);
    void captureIsolatedTipClient(authority).then(value => {
      if (!active) { value.dispose(); return; } owned = value; setClient(value);
    }).catch(() => { if (active) setNotice({ message: unavailable }); });
    return () => { active = false; alive.current = false; generation.current += 1; owned?.dispose(); };
  }, [authority, connectionRevision]);
  useEffect(() => { const listener = AppState.addEventListener("change", value => { if (value === "active" && current()) setRevision(value => value + 1); }); return () => listener.remove(); }, [current]);
  const refresh = () => { if (current()) { setNotice(null); if (!client) setConnectionRevision(value => value + 1); else setRevision(value => value + 1); } };
  const read = useCallback(async <C extends TipCommand,>(command: C, payload: TipPayloads[C]) => {
    if (!client || !current()) return null;
    const result = await client.request(command, newTipRequestId(), payload);
    if (!current()) return null;
    if (result.status !== "ok") throw new Error("isolated_tip_read_unavailable");
    return result.data;
  }, [client, current]);

  // The dedicated status read is the only restart recovery operation. It never
  // replays the stored authoring/checkout mutation, even when a row is missing.
  useEffect(() => {
    if (!client) return;
    const sequence = ++generation.current; let active = true;
    const applies = () => active && current() && generation.current === sequence;
    setBusy(true); setData(null);
    const timer = setTimeout(() => { if (applies()) { setBusy(false); setNotice({ message: "The status check is taking longer than expected. Its outcome is unknown. You can check status again; do not repeat an unresolved action." }); } }, 15_000);
    const load = async () => {
      try { const entries = await journal.list(); if (applies()) { setJournalEntries(entries); setJournalReady(true); } }
      catch { if (applies()) { setJournalReady(false); setNotice({ message: "Saved actions could not be read. New actions are unavailable until local recovery is restored. Server history can still be checked." }); } }
      try { const entries = await checkoutJournal.list(); if (applies()) { setCheckoutEntries(entries); setCheckoutReady(true); } }
      catch { if (applies()) { setCheckoutReady(false); setNotice({ message: "Saved buyer attempts could not be read. New preparations and closure requests are unavailable. Server history can still be checked." }); } }
      if (page === "home" || page === "studio") {
        const capabilities = await read("capability.read", {}); if (applies()) setCapability(capabilities);
        return page === "home" ? capabilities : read("studio.read", { cursor: null, limit: 50 });
      }
      if (page === "offer") return read("offer.read", { offerId: param(params.offerId) });
      if (page === "history") return read("history.read", { role, cursor: null, limit: 50 });
      if (tipUuid(param(params.requestId))) {
        const requestId = newTipRequestId(); const original = param(params.requestId);
        const result = await client.request("request.read", requestId, { originalRequestId: original });
        if (result.status !== "ok") throw new Error("isolated_tip_read_unavailable");
        try { const local = await journal.list(); if (local.some(entry => entry.requestId === original)) await journal.reconcile(original, result, { requestId, sessionGeneration: authority.sessionGeneration }); }
        catch { if (applies()) { setJournalReady(false); setNotice({ message: "Server status was checked, but local recovery could not be updated. New actions remain unavailable." }); } }
        try {
          const local = await checkoutJournal.list();
          if (local.some(entry => entry.requestId === original)) await checkoutJournal.reconcile(original, result, { requestId, sessionGeneration: authority.sessionGeneration });
          const updated = await checkoutJournal.list(); if (applies()) setCheckoutEntries(updated);
        } catch { if (applies()) { setCheckoutReady(false); setNotice({ message: "Server status was checked, but buyer recovery could not be saved. New preparations and closure requests remain unavailable." }); } }
        return result.data;
      }
      return read("status.read", { intentId: tipId(param(params.intentId), "intent") ? param(params.intentId) : null, receiptId: tipId(param(params.receiptId), "receipt") ? param(params.receiptId) : null });
    };
    void load().then(value => { if (applies()) { setData(value); setBusy(false); } }).catch(() => { if (applies()) { setNotice({ message: unavailable }); setBusy(false); } }).finally(() => clearTimeout(timer));
    return () => { active = false; clearTimeout(timer); };
  }, [authority.sessionGeneration, client, current, journal, checkoutJournal, page, params.offerId, params.intentId, params.receiptId, params.requestId, read, revision, role]);

  const author = async (command: TipMutation, payload: IsolatedSandboxTipAttemptPayloads[TipMutation]) => {
    if (!client || !current() || mutationPending.current || !journalReady) return;
    mutationPending.current = true; setBusy(true); const requestId = newTipRequestId(); let saved = false;
    let prepared: Awaited<ReturnType<typeof journal.prepare>> | null = null;
    // A display deadline does not replace the still-running transport outcome.
    const timer = setTimeout(() => { if (saved && current()) setNotice({ message: "This action is still unconfirmed. Check its status without repeating it.", requestId }); }, 15_000);
    try {
      prepared = await journal.prepare<TipMutation>({ requestId, sessionGeneration: authority.sessionGeneration, command, payload });
      saved = prepared.mayDispatch;
      if (!prepared.mayDispatch) throw new Error("isolated_tip_previous_action_unresolved");
      if (!current()) throw new IsolatedSandboxCommerceError("authority_retired", requestId, "not_dispatched");
      const result = await client.author<TipMutation>(command, requestId, payload);
      // Exact validated response only. Pending/held results are not success.
      const settled = await journal.reconcile(requestId, result);
      if (!current()) return;
      setNotice({ message: settled.state === "not_applied" ? "The server did not apply this publication because its binding is unavailable. Your draft is retained. Refresh availability before choosing another action." : result.status === "ok" ? (command === "creator.declare" ? "Declaration saved. Current eligibility is checked by the server." : command === "resource.create" ? "Draft saved." : "Offer published. Test checkout remains unavailable.") : "The server has not completed this action. Check its status before repeating it.", ...(settled.state !== "not_applied" ? { requestId } : {}) });
      setRevision(value => value + 1);
    } catch (error) {
      let stopped = false;
      if (saved && prepared?.stopBeforeDispatch) { try { await prepared.stopBeforeDispatch(error); stopped = true; } catch { /* Transport uncertainty stays unresolved. */ } }
      if (saved && !stopped) await journal.markUnknown(requestId).catch(() => undefined);
      if (current()) setNotice(saved && !stopped ? { message: "This action could not be confirmed. Check status before repeating it. A missing receipt does not establish that no payment occurred.", requestId } : { message: "A new action was not sent. Saved actions must be resolved and local storage must be available before continuing." });
    } finally { clearTimeout(timer); mutationPending.current = false; if (current()) setBusy(false); }
  };
  const retire = async (offer: TipOffer) => {
    if (!client || !current() || mutationPending.current || !journalReady) return;
    mutationPending.current = true; setBusy(true); const requestId = newTipRequestId(); let saved = false;
    let prepared: Awaited<ReturnType<typeof journal.prepare>> | null = null;
    const timer = setTimeout(() => { if (saved && current()) setNotice({ message: "Retirement is still unconfirmed. Check its status without repeating it.", requestId }); }, 15_000);
    try {
      const payload = { offerId: offer.id, expectedRevision: offer.revision };
      prepared = await journal.prepare({ requestId, sessionGeneration: authority.sessionGeneration, command: "offer.retire", payload });
      saved = prepared.mayDispatch;
      if (!saved) throw new Error("isolated_tip_previous_action_unresolved");
      if (!current()) throw new IsolatedSandboxCommerceError("authority_retired", requestId, "not_dispatched");
      const result = await client.request("offer.retire", requestId, payload); await journal.reconcile(requestId, result);
      if (current()) { setNotice({ message: result.status === "ok" ? "Offer retired. Existing history remains available." : "Retirement is unconfirmed. Check action status.", requestId }); setRevision(value => value + 1); }
    } catch (error) { let stopped = false; if (saved && prepared?.stopBeforeDispatch) { try { await prepared.stopBeforeDispatch(error); stopped = true; } catch { /* Unknown remains sticky. */ } } if (saved && !stopped) await journal.markUnknown(requestId).catch(() => undefined); if (current()) setNotice(saved && !stopped ? { message: "Retirement could not be confirmed. Check status before repeating it.", requestId } : { message: "Retirement was not sent. Resolve saved actions and check local storage before continuing." }); }
    finally { clearTimeout(timer); mutationPending.current = false; if (current()) setBusy(false); }
  };
  const prepareBuyerAttempt = async (offer: TipOffer) => {
    if (!client || !current() || mutationPending.current || !checkoutReady || offer.kind !== "creator_tip"
      || !offer.available || offer.creatorId === authority.userId || reviewedQuote !== JSON.stringify(quoteForOffer(offer))) return;
    mutationPending.current = true; setBusy(true); setReviewedQuote("");
    const requestId = newTipRequestId(); let saved = false;
    const timer = setTimeout(() => { if (saved && current()) setNotice({ message: "Preparation is still unconfirmed. Read its status without repeating it or starting a replacement.", requestId }); }, 15_000);
    try {
      const pending = await checkoutJournal.prepare({ requestId, sessionGeneration: authority.sessionGeneration, quote: quoteForOffer(offer) });
      saved = pending.mayDispatch;
      if (!pending.mayDispatch || !pending.dispatch) throw new Error("isolated_tip_preparation_blocked");
      let settled = await pending.dispatch(async () => {
        if (!current()) throw new IsolatedSandboxCommerceError("authority_retired", requestId, "not_dispatched");
        return client.prepareCheckout(requestId, { offerId: offer.id, expectedRevision: offer.revision });
      });
      // The prepare response carries identity only. Confirm the reviewed
      // economics and both immutable revisions through a fresh canonical read.
      if (settled.intentId && current()) {
        const readId = newTipRequestId();
        const canonical = await client.request("request.read", readId, { originalRequestId: requestId });
        settled = await checkoutJournal.reconcile(requestId, canonical, { requestId: readId, sessionGeneration: authority.sessionGeneration });
      }
      if (current()) {
        setNotice({ message: settled.state === "not_applied" ? "This preparation was not sent. Reopen the current account view before choosing another action." : settled.state === "intent_prepared" ? "Preparation saved and reviewed quote confirmed. Actual purchase remains unavailable. Check this exact attempt before choosing another action." : settled.intentId ? "The attempt was recorded, but its reviewed quote could not be confirmed. Check status or request closure; do not prepare a replacement." : "Preparation outcome is unknown. Read status without repeating it or starting a replacement.", ...(settled.state !== "not_applied" ? { requestId } : {}) });
        setRevision(value => value + 1);
      }
    } catch {
      if (saved) await checkoutJournal.markUnknown(requestId).catch(() => undefined);
      if (current()) { setNotice(saved ? { message: "Preparation could not be confirmed. Read its status; missing evidence does not prove no payment or permit replacement.", requestId } : { message: "A new preparation was not sent. Resolve saved buyer attempts and check local storage first." }); setRevision(value => value + 1); }
    } finally { clearTimeout(timer); mutationPending.current = false; if (current()) setBusy(false); }
  };
  const closeBuyerAttempt = async (original: IsolatedSandboxTipCheckoutAttempt) => {
    if (!client || !current() || mutationPending.current || !checkoutReady || original.command !== "checkout.prepare" || !original.intentId) return;
    mutationPending.current = true; setBusy(true); let actionId: string | null = null;
    const timer = setTimeout(() => { if (actionId && current()) setNotice({ message: "Closure is unconfirmed. Check this saved action; do not repeat the closure request.", requestId: actionId }); }, 15_000);
    try {
      // Re-read the original request under the current session. This never
      // repeats preparation or treats an absent dispatch row as a no-charge proof.
      const readId = newTipRequestId();
      const result = await client.request("request.read", readId, { originalRequestId: original.requestId });
      const observation = await checkoutJournal.observeForAbandon(original.requestId, result, { requestId: readId, sessionGeneration: authority.sessionGeneration });
      const verified = observation.attempt;
      if (!current()) return;
      if (verified.state === "abandoned") { setNotice({ message: "The server already closed this exact attempt before dispatch. Other payments are not described by this proof." }); setRevision(value => value + 1); return; }
      const entry = result.status === "ok" && result.data.resolution === "found" ? result.data.entry : null;
      if (!observation.mayRequestAbandon || !entry || entry.id !== verified.intentId || entry.kind !== "creator_tip" || !["prepared", "expired"].includes(entry.status)
        || entry.dispatchState !== "not_recorded" || entry.receipt !== null || entry.abandonment !== null)
        throw new Error("isolated_tip_closure_unavailable");
      const requestId = newTipRequestId();
      const pending = await checkoutJournal.prepareAbandon({ requestId, sessionGeneration: authority.sessionGeneration, originalRequestId: original.requestId, intentId: entry.id });
      if (!pending.mayDispatch || !pending.dispatch) throw new Error("isolated_tip_closure_blocked");
      actionId = requestId;
      const settled = await pending.dispatch(async () => {
        if (!current()) throw new IsolatedSandboxCommerceError("authority_retired", requestId, "not_dispatched");
        return client.request("checkout.abandon", requestId, { intentId: entry.id, originalRequestId: original.requestId });
      });
      if (current()) {
        setNotice({ message: settled.state === "abandoned" ? "The server closed this exact attempt before dispatch. A new preparation requires a new explicit choice; this proof says nothing about other payments." : settled.state === "not_applied" ? "The closure request was not sent. The original preparation remains saved." : "Closure is unconfirmed. Read its status before another action.", ...(settled.state !== "not_applied" ? { requestId } : {}) });
        setRevision(value => value + 1);
      }
    } catch {
      if (actionId) await checkoutJournal.markUnknown(actionId).catch(() => undefined);
      if (current()) { setNotice(actionId ? { message: "Closure could not be confirmed. Read this exact action's status; no undispatched proof was established.", requestId: actionId } : { message: "This attempt could not be confirmed as available for closure. Check its current status. No payment or no-charge conclusion was made." }); setRevision(value => value + 1); }
    } finally { clearTimeout(timer); mutationPending.current = false; if (current()) setBusy(false); }
  };
  const navigate = (path: string) => { if (current()) router.push(path as Href); };
  const studio = page === "studio" && data ? data as TipData["studio.read"] : null;
  const selectedOffer = page === "offer" && data ? (data as TipData["offer.read"]).offer : null;
  const history = page === "history" && data && (data as TipData["history.read"]).role === role ? data as TipData["history.read"] : null;
  const recovery = page === "status" && tipUuid(param(params.requestId)) && data ? data as TipData["request.read"] : null;
  const statusEntry = page === "status" && data ? (recovery ? recovery.entry : (data as TipData["status.read"]).entry) : null;
  const unresolved = journalEntries.some(entry => entry.state !== "completed" && entry.state !== "not_applied");
  const mutationDisabled = busy || !journalReady || unresolved;
  const buyerUnresolved = checkoutEntries.some(entry => entry.command === "checkout.prepare" && entry.state !== "abandoned" && entry.state !== "not_applied");
  const buyerDisabled = busy || !checkoutReady || buyerUnresolved;
  const closable = statusEntry && statusEntry.kind === "creator_tip" && ["prepared", "expired"].includes(statusEntry.status)
    && statusEntry.dispatchState === "not_recorded" && statusEntry.receipt === null && statusEntry.abandonment === null
    ? checkoutEntries.find(entry => entry.command === "checkout.prepare" && entry.intentId === statusEntry.id && ["unknown", "intent_prepared"].includes(entry.state)) : undefined;
  const closurePending = closable && checkoutEntries.some(entry => entry.command === "checkout.abandon"
    && entry.prepareRequestId === closable.requestId && entry.state !== "not_applied");
  const loadMore = async () => {
    const cursor = history?.nextCursor ?? studio?.nextCursor;
    if (!cursor || busy || !client || pagePending.current) return;
    pagePending.current = true; const request = ++pageRequest.current;
    const sequence = generation.current; setBusy(true);
    const applies = () => current() && sequence === generation.current && request === pageRequest.current;
    const timer = setTimeout(() => { if (request === pageRequest.current) pagePending.current = false; if (applies()) { generation.current += 1; setBusy(false); setNotice({ message: "Older records could not be confirmed in time. Refresh status to check again." }); } }, 15_000);
    try {
      if (history) {
        const next = await read("history.read", { role, cursor, limit: 50 });
        if (next && applies()) { const existing = new Set(history.items.map(item => item.id)); setData({ ...next, items: [...history.items, ...next.items.filter(item => !existing.has(item.id))] }); }
      } else if (studio) {
        const next = await read("studio.read", { cursor, limit: 50 });
        if (next && applies()) { const existing = new Set(studio.resources.map(item => item.id)); setData({ ...next, resources: [...studio.resources, ...next.resources.filter(item => !existing.has(item.id))] }); }
      }
    } catch { if (applies()) setNotice({ message: "Older records could not be verified. Refresh status to try again." }); }
    finally { clearTimeout(timer); if (request === pageRequest.current) pagePending.current = false; if (applies()) setBusy(false); }
  };
  const loadMoreOffers = async (resource: TipResource) => {
    const cursor = resource.offersNextCursor;
    if (!cursor || !client || busy || pagePending.current) return;
    pagePending.current = true; const request = ++pageRequest.current; const sequence = generation.current; setBusy(true);
    const applies = () => current() && sequence === generation.current && request === pageRequest.current;
    const timer = setTimeout(() => { if (request === pageRequest.current) pagePending.current = false; if (applies()) { generation.current += 1; setBusy(false); setNotice({ message: "Older offers could not be confirmed in time. The current list may be incomplete. Refresh status to check again." }); } }, 15_000);
    try {
      const next = await read("offers.read", { resourceId: resource.id, cursor, limit: 50 });
      if (next && applies()) setData(previous => {
        if (!previous || !("resources" in previous)) return previous;
        return { ...previous, resources: previous.resources.map(item => {
          if (item.id !== next.resourceId) return item;
          const ids = new Set(item.offers.map(offer => offer.id));
          return { ...item, offers: [...item.offers, ...next.offers.filter(offer => !ids.has(offer.id))], offersNextCursor: next.nextCursor, offersTruncated: next.nextCursor !== null };
        }) };
      });
    } catch { if (applies()) setNotice({ message: "Older offers could not be verified. The current list may be incomplete. Refresh status to try again." }); }
    finally { clearTimeout(timer); if (request === pageRequest.current) pagePending.current = false; if (applies()) setBusy(false); }
  };
  const showOffer = (offer: TipOffer) => <View key={offer.id} style={styles.card} testID={`isolated-tip-offer-${offer.id}`}>
    <Text style={styles.title}>{offer.title}</Text><Text style={styles.body}>{isolatedTipMoney(offer.amountMinor, offer.currency)} · {offer.status}</Text>
    <Text style={styles.body}>Creator: {offer.creatorId}</Text><Text style={styles.body}>Revision {offer.revision}. {offer.available ? "Published. Test payments are unavailable." : "This offer is unavailable for new purchases."}</Text>
    <Action testID={`isolated-tip-view-${offer.id}`} onPress={() => navigate(`/sandbox-tips/offer/${offer.id}`)}>View offer</Action>
    {offer.kind !== "creator_tip" ? <Text style={styles.body}>This is a different product type. This view supports tip authoring only.</Text> : offer.creatorId === authority.userId && offer.status !== "retired" ? <Action testID={`isolated-tip-retire-${offer.id}`} disabled={mutationDisabled} onPress={() => void retire(offer)}>Retire offer</Action> : null}
  </View>;
  const showAttempt = (entry: TipAttempt) => <View key={entry.id} style={styles.card} testID={`isolated-tip-attempt-${entry.id}`}>
    {entry.kind !== "creator_tip" ? <Text style={styles.body}>This record belongs to a different product type. This tip view cannot present its receipt or determine its content access.</Text> : entry.receipt ? <IsolatedTipReceipt receipt={{ ...entry.receipt, creatorId: entry.creatorId, createdAt: entry.receipt.purchasedAt }} /> : <><Text style={styles.title}>{entry.status === "abandoned" ? "Attempt closed before dispatch" : "Test payment not confirmed"}</Text><Text style={styles.body}>{isolatedTipMoney(entry.amountMinor, entry.currency)} · {entry.status}</Text><Text style={styles.body}>Creator: {entry.creatorId}</Text><Text style={styles.body}>{entry.noDispatchProven ? "The server recorded that this exact isolated attempt was closed without a dispatch claim. This does not describe any other payment." : "No verified receipt is available for this attempt. Its state is not proof that no payment occurred."}</Text></>}
    <Text selectable style={styles.body}>Attempt reference: {entry.id}</Text>
    {!entry.originalSessionMatchesCurrent ? <Text style={styles.body}>Started in another session. This view can read its history; it cannot resume checkout.</Text> : null}
    <Action testID={`isolated-tip-status-${entry.id}`} onPress={() => navigate(`/sandbox-tips/status?intentId=${entry.id}`)}>Check status</Action>
  </View>;
  return <Frame title={title}>
    <View style={styles.actions}><Action testID="isolated-tip-home" onPress={() => navigate("/sandbox-tips")}>Overview</Action><Action testID="isolated-tip-studio" onPress={() => navigate("/sandbox-tips/studio")}>Tip studio</Action><Action testID="isolated-tip-history" onPress={() => navigate("/sandbox-tips/history")}>History</Action><Action testID="isolated-tip-refresh" disabled={busy} onPress={refresh}>Refresh status</Action></View>
    {busy ? <View accessibilityLiveRegion="polite"><ActivityIndicator /><Text style={styles.body}>Checking sandbox status…</Text></View> : null}
    {notice ? <View accessibilityLiveRegion="polite"><Text style={styles.body}>{notice.message}</Text>{notice.requestId ? <Action testID="isolated-tip-check-action" onPress={() => navigate(`/sandbox-tips/status?requestId=${notice.requestId}`)}>Check action status</Action> : null}</View> : null}
    <View style={styles.card}><Text style={styles.title}>Test checkout unavailable</Text><Text style={styles.body}>{checkoutUnavailable}</Text><Action testID="isolated-tip-checkout" disabled onPress={() => undefined}>Send test tip</Action></View>
    {data ? <View testID="isolated-tip-data" style={styles.section}>
      {(page === "home" || page === "studio") && capability ? <View style={styles.card}>
        <Text style={styles.title}>{capability.canAuthor ? "Creator authoring available" : "Creator authoring unavailable"}</Text>
        <Text style={styles.body}>{capability.canAuthor ? "Your current account can author sandbox offers." : capability.creatorReason === "premium_required" ? "Premium is required to author creator offers. Free accounts can view offers and their own history." : capability.creatorReason === "creator_eligibility_required" ? "Complete or correct your creator declaration below." : capability.creatorReason === "creator_legal_required" ? "Complete the existing creator legal acceptance flow before authoring." : capability.generationState !== "active" ? "New authoring is unavailable. Retained history can still be read." : "Current creator eligibility could not be confirmed."}</Text>
        {capability.declaration ? <Text style={styles.body}>Current declaration: {capability.declaration.declared18Plus ? "18 or older" : "Not confirmed 18 or older"}, {capability.declaration.countryCode}{capability.declaration.regionCode ? ` / ${capability.declaration.regionCode}` : ""}.</Text> : null}
        <Text style={styles.title}>Your creator declaration</Text><Text style={styles.body}>Give your current age and country information. This declaration does not accept legal terms or enable payment.</Text>
        <View style={styles.actions}><Action testID="isolated-tip-adult-yes" selected={adult === true} onPress={() => setAdult(true)}>I am 18 or older</Action><Action testID="isolated-tip-adult-no" selected={adult === false} onPress={() => setAdult(false)}>I am not 18 or older</Action></View>
        <TextInput testID="isolated-tip-country" accessibilityLabel="Two-letter country code" placeholder="Country code, e.g. US" placeholderTextColor="#AAB2C1" autoCapitalize="characters" maxLength={2} value={country} onChangeText={value => setCountry(value.toUpperCase())} style={styles.input} />
        <TextInput testID="isolated-tip-region" accessibilityLabel="State or region code" placeholder="State or region code" placeholderTextColor="#AAB2C1" autoCapitalize="characters" maxLength={12} value={region} onChangeText={value => setRegion(value.toUpperCase())} style={styles.input} />
        <Action testID="isolated-tip-declare" disabled={mutationDisabled || capability.generationState !== "active" || adult === null || !/^[A-Z]{2}$/u.test(country) || (region !== "" && !/^[A-Z0-9-]{1,12}$/u.test(region))} onPress={() => void author("creator.declare", { declared18Plus: adult === true, countryCode: country, regionCode: region || null, declarationVersion: "adult-us-creator-v1" })}>Save declaration</Action>
      </View> : null}
      {studio ? <>
        <View style={styles.card}><Text style={styles.title}>Create a tip draft</Text><TextInput testID="isolated-tip-title" accessibilityLabel="Tip offer title" placeholder="Offer title" placeholderTextColor="#AAB2C1" maxLength={160} value={draftTitle} onChangeText={setDraftTitle} style={styles.input} /><Action testID="isolated-tip-create" disabled={mutationDisabled || !capability?.canAuthor || !draftTitle.trim()} onPress={() => void author("resource.create", { kind: "creator_tip", title: draftTitle.trim() })}>Save draft</Action></View>
        {studio.resources.length === 0 ? <Text style={styles.body}>No drafts or offers in this account yet.</Text> : studio.resources.map(item => <View style={styles.card} key={item.id} testID={`isolated-tip-resource-${item.id}`}><Text style={styles.title}>{item.title}</Text><Text style={styles.body}>{item.kind === "creator_tip" ? "Tip" : item.kind} · {item.status} · Revision {item.revision}</Text>{item.offers.map(showOffer)}{item.offersTruncated ? <><Text style={styles.body}>Older offers are available. This is a partial offer list.</Text><Action testID={`isolated-tip-more-offers-${item.id}`} disabled={busy} onPress={() => void loadMoreOffers(item)}>Load older offers</Action></> : null}{item.kind === "creator_tip" && item.status === "draft" ? studio.catalog.length ? studio.catalog.map(price => <Action key={`${price.currency}:${price.amountMinor}`} testID={`isolated-tip-publish-${item.id}-${price.amountMinor}`} disabled={mutationDisabled || !capability?.canAuthor} onPress={() => void author("offer.publish", { resourceId: item.id as `scv1_resource_${string}`, expectedRevision: item.revision, amountMinor: price.amountMinor, currency: price.currency })}>Publish {isolatedTipMoney(price.amountMinor, price.currency)} offer</Action>) : <Text style={styles.body}>No qualified test prices are available. Your draft is saved; publication is unavailable.</Text> : null}</View>)}
        {studio.catalogTruncated ? <Text style={styles.body}>Only the first available prices are shown.</Text> : null}
        {studio.nextCursor ? <Action testID="isolated-tip-more" disabled={busy} onPress={() => void loadMore()}>Load older drafts</Action> : null}
      </> : null}
      {selectedOffer ? showOffer(selectedOffer) : null}
      {selectedOffer?.kind === "creator_tip" && selectedOffer.available && selectedOffer.creatorId !== authority.userId ? <View style={styles.card} testID="isolated-tip-buyer-review">
        <Text style={styles.title}>Review a test preparation</Text>
        <Text style={styles.body}>{isolatedTipMoney(selectedOffer.amountMinor, selectedOffer.currency)} · Recipient account: {selectedOffer.creatorId}</Text>
        <Text style={styles.body}>Offer revision {selectedOffer.revision} · Resource revision {selectedOffer.resourceRevision}</Text>
        <Text style={styles.body}>This saves an attempt for status and recovery. It does not open a purchase sheet. Actual purchase remains unavailable.</Text>
        <Action testID="isolated-tip-review-quote" disabled={buyerDisabled} selected={reviewedQuote === JSON.stringify(quoteForOffer(selectedOffer))} onPress={() => setReviewedQuote(value => value === JSON.stringify(quoteForOffer(selectedOffer)) ? "" : JSON.stringify(quoteForOffer(selectedOffer)))}>I reviewed this recipient and amount</Action>
        <Action testID="isolated-tip-prepare" disabled={buyerDisabled || reviewedQuote !== JSON.stringify(quoteForOffer(selectedOffer))} onPress={() => void prepareBuyerAttempt(selectedOffer)}>Save test preparation</Action>
        {buyerUnresolved ? <Text style={styles.body}>A saved buyer attempt still requires recovery or an authoritative undispatched closure before a replacement can be prepared.</Text> : null}
      </View> : null}
      {history ? <><View style={styles.actions}><Action testID="isolated-tip-history-buyer" selected={role === "buyer"} onPress={() => setRole("buyer")}>Sent support</Action><Action testID="isolated-tip-history-creator" selected={role === "creator"} onPress={() => setRole("creator")}>Received support</Action></View>{history.items.length ? history.items.map(showAttempt) : <Text testID="isolated-tip-empty" style={styles.body}>No test attempts in this history view.</Text>}{history.nextCursor ? <Action testID="isolated-tip-more" disabled={busy} onPress={() => void loadMore()}>Load older history</Action> : null}</> : null}
      {recovery ? <View style={styles.card}><Text style={styles.title}>{recovery.resolution === "found" ? "Saved action found" : "Action outcome unknown"}</Text><Text style={styles.body}>{recovery.resolution === "found" ? "The server found this original action. Current state is shown below. No action was repeated." : "The server could not establish the original outcome. Do not repeat the action or start a replacement based on a missing row."}</Text>{recovery.resource ? <Text style={styles.body}>{recovery.resource.title} · {recovery.resource.status}</Text> : null}{recovery.offer ? showOffer(recovery.offer) : null}{recovery.declaration ? <Text style={styles.body}>Current declaration: {recovery.declaration.declared18Plus ? "18 or older" : "Not confirmed 18 or older"} · {recovery.declaration.countryCode}</Text> : null}</View> : null}
      {statusEntry ? showAttempt(statusEntry) : null}
      {closable ? <View style={styles.card}>
        <Text style={styles.title}>Request closure of this unstarted attempt</Text>
        <Text style={styles.body}>The server will check again that this exact attempt has no dispatch claim or receipt. Only its confirmed closure permits a new preparation. This is not a refund or a statement about other payments.</Text>
        <Action testID="isolated-tip-abandon" disabled={busy || !checkoutReady || Boolean(closurePending)} onPress={() => void closeBuyerAttempt(closable)}>Close this unstarted attempt</Action>
        {closurePending ? <Text style={styles.body}>A closure request is already saved. Check that action instead of sending it again.</Text> : null}
      </View> : null}
    </View> : null}
    {journalEntries.length ? <View style={styles.card}><Text style={styles.title}>Saved actions</Text><Text style={styles.body}>Check unresolved actions before starting another. These local records are not payment receipts.</Text>{journalEntries.map(entry => <Action key={entry.requestId} testID={`isolated-tip-recover-${entry.requestId}`} onPress={() => navigate(`/sandbox-tips/status?requestId=${entry.requestId}`)}>Check saved action</Action>)}</View> : null}
    {checkoutEntries.length ? <View style={styles.card}><Text style={styles.title}>Saved buyer attempts</Text><Text style={styles.body}>These records preserve original requests across restarts and account sessions. They are not payment receipts. Checking status never repeats the saved mutation.</Text>{checkoutEntries.map(entry => <View key={entry.requestId} style={styles.section}>
      <Text style={styles.body}>{entry.command === "checkout.prepare" ? "Preparation" : "Closure request"} · {entry.state === "intent_prepared" ? "Reviewed quote confirmed; not a purchase" : entry.state === "abandoned" ? "Exact undispatched closure recorded" : entry.state === "not_applied" ? "Request not sent" : entry.intentId ? "Attempt recorded; reviewed quote unconfirmed" : "Outcome requires checking"}</Text>
      <Text style={styles.body}>Reviewed amount: {isolatedTipMoney(entry.quote.amountMinor, entry.quote.currency)} · Offer revision {entry.quote.offerRevision} · Resource revision {entry.quote.resourceRevision}</Text>
      <Action testID={`isolated-tip-buyer-recover-${entry.requestId}`} onPress={() => navigate(`/sandbox-tips/status?requestId=${entry.requestId}`)}>Check buyer action</Action>
    </View>)}</View> : null}
  </Frame>;
}
const styles = StyleSheet.create({
  screen: { flex: 1 }, overlay: { ...StyleSheet.absoluteFillObject, backgroundColor: "rgba(0,0,0,0.78)" }, content: { padding: 20, paddingBottom: 48, gap: 16 },
  heading: { color: "#fff", fontSize: 26, fontWeight: "900" }, title: { color: "#fff", fontSize: 18, fontWeight: "700" }, body: { color: "#D1D7E2", fontSize: 14, lineHeight: 21 },
  card: { gap: 10, padding: 16, borderWidth: 1, borderColor: "#5C6170", borderRadius: 14, backgroundColor: "rgba(20,20,30,0.8)" },
  actions: { flexDirection: "row", flexWrap: "wrap", gap: 10 }, action: { minHeight: 44, padding: 12, justifyContent: "center", borderRadius: 10, backgroundColor: "rgba(220,20,60,0.25)", borderWidth: 1, borderColor: "#DC143C" }, actionText: { color: "#fff", fontSize: 14, fontWeight: "700" }, disabled: { opacity: 0.5 },
  input: { minHeight: 44, color: "#fff", padding: 12, borderWidth: 1, borderColor: "#A0A7B5", borderRadius: 10 },
  section: { gap: 16 },
});
