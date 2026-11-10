import { getRuntimeConfig } from "./runtimeConfig";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { captureNativeSandboxQuoteClient, NativeSandboxQuoteError, type NativeSandboxStore } from "./nativeStoreSandboxQuote";
import { readNativeSandboxAppEvidence } from "./nativeStoreSandboxProduct";
import { getCurrentAccountSessionAuthoritySnapshot, sameAccountSessionAuthority, subscribeToAccountSessionAuthority, type AccountSessionAuthorityBinding } from "./accountSessionAuthority";
import { canMakeRevenueCatPurchases, getRevenueCatAppUserId, readRevenueCatNonSubscriptionProducts, purchaseRevenueCatStoreProduct } from "./revenuecat";
import { isCreatorMoneyStoreQuoteMatch } from "./creatorMoneyStoreQuote";
import { captureNativePlayTestSheetContext } from "./nativeStorePlayTestHandoff";
import type { NativeDispatchQualification } from "../supabase/functions/_shared/native-store-sandbox-dispatch-contract-v1";

// The explicit normal-screen action requires a first committed authenticated
// consume response before it can reach the existing purchase owner. Missing
// qualification remains blocked; this source does not seed or activate one.
type Storage = { getItem(key: string): Promise<string | null>; setItem(key: string, value: string): Promise<unknown> };
type Record = { version: 1; userId: string; selectionId: string; reservationId: string; quoteDigest: string; requestId: string; state: "consume_pending" | "consumed" | "sdk_started" };
const flights = new Set<string>();
const uuid = (v: unknown): v is string => typeof v === "string" && /^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/u.test(v);
const newId = () => { const b = new Uint8Array(16); crypto.getRandomValues(b); b[6] = (b[6] & 15) | 64; b[8] = (b[8] & 63) | 128; const h = [...b].map(v => v.toString(16).padStart(2, "0")).join(""); return `${h.slice(0,8)}-${h.slice(8,12)}-${h.slice(12,16)}-${h.slice(16,20)}-${h.slice(20)}`; };
const failure = () => new NativeSandboxQuoteError("outcome_unknown");
export async function dispatchPreparedNativeSandboxPurchase(authority: AccountSessionAuthorityBinding, offerId: string, store: NativeSandboxStore,
  selectionId: string, options: { storage?: Storage; deadlineMs?: number; recoverOnly?: boolean; playTestSheetAcknowledged?: boolean; isPlayHandoffVisible?: () => boolean } = {}) {
  const expected = Object.freeze({ ...authority }), storage = options.storage ?? AsyncStorage, timeout = options.deadlineMs ?? 15000;
  if (!Number.isSafeInteger(timeout) || timeout < 1 || timeout > 15000 || !["APP_STORE", "PLAY_STORE"].includes(store) || (options.recoverOnly !== undefined && typeof options.recoverOnly !== "boolean")
    || (options.playTestSheetAcknowledged !== undefined && typeof options.playTestSheetAcknowledged !== "boolean")
    || (options.isPlayHandoffVisible !== undefined && typeof options.isPlayHandoffVisible !== "function")) throw failure();
  const recoverOnly = options.recoverOnly === true;
  // This acknowledgment is awareness, NEVER proof of a Google account or test
  // instrument. Only new buyer-scoped server handoff admission can open Play.
  if (store === "PLAY_STORE" && !recoverOnly && (options.playTestSheetAcknowledged !== true || !options.isPlayHandoffVisible?.())) return Object.freeze({ status: "blocked" as const,
    reason: "play_test_sheet_confirmation_required", dispatchAllowed: false as const });
  const key = `@chillywood/native-store-dispatch:v2:${expected.userId}:${store}:${offerId}:${selectionId}`;
  if (!recoverOnly && flights.has(key)) throw failure(); if (!recoverOnly) flights.add(key);
  let retired = false;
  let play: ReturnType<typeof captureNativePlayTestSheetContext> | null = null;
  const current = () => { if (retired || !sameAccountSessionAuthority(expected, getCurrentAccountSessionAuthoritySnapshot()) || play && !options.isPlayHandoffVisible?.()) throw failure(); play?.assertCurrent(); };
  const unsubscribe = subscribeToAccountSessionAuthority(v => { if (!sameAccountSessionAuthority(expected, v)) retired = true; });
  const bounded = async <T,>(promise: Promise<T>): Promise<T> => { let timer: ReturnType<typeof setTimeout>;
    try { return await Promise.race([promise, new Promise<never>((_r, reject) => { timer = setTimeout(() => reject(failure()), timeout); })]); }
    finally { clearTimeout(timer!); }
  };
  let client: Awaited<ReturnType<typeof captureNativeSandboxQuoteClient>> | null = null;
  let retainFlight = false;
  try {
    if (store === "PLAY_STORE" && !recoverOnly) play = captureNativePlayTestSheetContext(expected);
    current(); client = await captureNativeSandboxQuoteClient(expected, offerId, store, { storage, deadlineMs: timeout }); current();
    const selected = (await client.recover()).data.selection; current();
    if (!selected || selected.id !== selectionId) throw failure();
    let raw = await bounded(storage.getItem(key)); current();
    if (raw === null) {
      const legacy = await bounded(storage.getItem(`@chillywood/native-store-dispatch:v1:${expected.userId}:${store}:${offerId}`)); current();
      if (legacy !== null) { if (legacy.length > 4096) throw failure(); const old = JSON.parse(legacy); if (old.selectionId === selectionId) raw = legacy; }
    }
    let saved: Record | null = null;
    if (raw !== null) {
      if (raw.length > 4096) throw failure(); const v = JSON.parse(raw);
      if (!v || typeof v !== "object" || Array.isArray(v) || Object.keys(v).sort().join(",") !== "quoteDigest,requestId,reservationId,selectionId,state,userId,version"
        || v.version !== 1 || v.userId !== expected.userId || v.selectionId !== selectionId || typeof v.reservationId !== "string" || !v.reservationId.startsWith("nssv1_reservation_") || !uuid(v.reservationId.slice(18))
        || v.quoteDigest !== selected.quote.quoteDigest || !uuid(v.requestId) || !["consume_pending", "consumed", "sdk_started"].includes(v.state)) throw failure();
      saved = v as Record;
    }
    if (recoverOnly) {
      if (!saved) throw failure();
      const reservation = (await client.recoverPurchaseAttempt()).data.reservation; current();
      if (!reservation || reservation.id !== saved.reservationId) throw failure();
      return await client.readDispatchAdmission(saved.requestId, true);
    }
    if (saved && saved.state !== "consume_pending") throw failure();
    // Existing build gate is a restriction, never no-charge proof or activation.
    if (getRuntimeConfig().revenueCat.appStorePurchasesEnabled !== true) return Object.freeze({ status: "blocked" as const, reason: "build_purchase_disabled", dispatchAllowed: false as const });
    const discovered = await client.readDispatchQualification(); current();
    if (discovered.status !== "ok" || !discovered.data.qualification) return Object.freeze({ status: "blocked" as const, reason: discovered.data.reason ?? "qualification_unavailable", dispatchAllowed: false as const });
    const metadata = discovered.data.qualification;
    if (store === "PLAY_STORE" && !("handoffMode" in metadata)) return Object.freeze({ status: "blocked" as const,
      reason: "platform_no_charge_proof_unsupported", dispatchAllowed: false as const });
    // Local OS evidence is read here, never provided by a caller. It is app
    // evidence only, not a remotely attested build or IAP/account verification.
    const app = store === "APP_STORE" ? await readNativeSandboxAppEvidence(expected) : null; current();
    const matchesQualification = (q: NativeDispatchQualification) => q.sdkVersion === "10.15.1" && (store === "APP_STORE"
      ? q.store === "APP_STORE" && q.noChargeAccountScope === "testflight_distribution" && app?.status === "observed"
        && app.evidence.environment === "SANDBOX" && !!app.evidence.unsignedNativeBuild && !!app.evidence.unsignedNativeVersion
        && q.nativeBuild === app.evidence.unsignedNativeBuild && q.nativeVersion === app.evidence.unsignedNativeVersion && q.signedAppVersion === app.evidence.signedAppVersion
      : q.store === "PLAY_STORE" && "handoffMode" in q && !!play && q.handoffMode === "play_test_sheet_handoff_v1"
        && q.automaticNoChargeProof === false && q.userStoreConfirmationRequired === true && q.buyerId === expected.userId
        && q.sessionGeneration === expected.sessionGeneration && Date.parse(q.enrollmentExpiresAt) > Date.now()
        && q.nativeBuild === play.nativeBuild && q.nativeVersion === play.nativeVersion);
    if (!matchesQualification(metadata)) throw failure();
    if (await bounded(getRevenueCatAppUserId()) !== expected.userId) throw failure(); current();
    if (await bounded(canMakeRevenueCatPurchases()) !== true) throw failure(); current();
    const products = await bounded(readRevenueCatNonSubscriptionProducts([selected.quote.catalog.wireProductId])); current();
    if (!products || products.length !== 1 || !isCreatorMoneyStoreQuoteMatch(products[0], { productId: selected.quote.catalog.wireProductId, amountMinor: selected.quote.amountMinor, currency: selected.quote.currency })) throw failure();
    const product = JSON.parse(JSON.stringify(products[0])) as typeof products[0];
    const retained = await client.readPurchaseAttempt(); current();
    if (retained.status === "none" || retained.status === "terminal_slot_available") await client.retainPurchaseAttempt(selectionId);
    else if (retained.status !== "dispatch_reserved") throw failure();
    current(); const reservation = (await client.recoverPurchaseAttempt()).data.reservation; current();
    if (!reservation || reservation.selectionId !== selectionId || saved && saved.reservationId !== reservation.id) throw failure();
    if (!saved) {
      saved = { version: 1, userId: expected.userId, selectionId, reservationId: reservation.id, quoteDigest: selected.quote.quoteDigest, requestId: newId(), state: "consume_pending" };
      retainFlight = true; await bounded(storage.setItem(key, JSON.stringify(saved))); current();
    }
    // Once sending, an uncertain committed response cannot be replayed to buy.
    retainFlight = true;
    const response = await client.readDispatchAdmission(saved.requestId, false); current();
    if (!response.dispatchAllowed || !response.data.attempt || !response.data.qualification) {
      // A known no-admission response may be explicitly checked again with the
      // SAME persisted request; server first-consume uniqueness stays decisive.
      retainFlight = false;
      return Object.freeze({ status: "blocked" as const, reason: response.data.reason ?? "already_consumed", dispatchAllowed: false as const });
    }
    const q = response.data.qualification;
    if (!matchesQualification(q) || q.id !== metadata.id || q.revision !== metadata.revision) throw failure();
    await bounded(storage.setItem(key, JSON.stringify({ ...saved, state: "consumed" }))); current();
    const retain = await client.createCallbackRetainer(selectionId, response.data.attempt); current();
    await bounded(storage.setItem(key, JSON.stringify({ ...saved, state: "sdk_started" }))); current();
    await purchaseRevenueCatStoreProduct(product, { authority: expected, retainPurchaseEvidence: retain,
      // The purchase owner can wait in its identity queue and authority reads.
      // Keep the observer alive through those waits; then recheck synchronously
      // at the actual SDK boundary, including enrollment expiry. Google's UI
      // may background the app only AFTER this point. The original owner keeps
      // post-launch callback retention independent from screen/lifecycle state.
      assertPurchaseLaunchAllowed: () => {
        current(); if (!matchesQualification(q)) throw failure();
        play?.dispose(); play = null;
      } });
    current(); return Object.freeze({ status: "callback_retained" as const, dispatchAllowed: false as const, settlementAllowed: false as const });
  } catch { throw failure(); }
  finally { play?.dispose(); client?.dispose(); unsubscribe(); if (!recoverOnly && !retainFlight) flights.delete(key); }
}
