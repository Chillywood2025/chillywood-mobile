import { getRuntimeConfig } from "./runtimeConfig";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { captureNativeSandboxQuoteClient, NativeSandboxQuoteError, type NativeSandboxStore } from "./nativeStoreSandboxQuote";
import { readNativeSandboxAppEvidence } from "./nativeStoreSandboxProduct";
import { getCurrentAccountSessionAuthoritySnapshot, sameAccountSessionAuthority, subscribeToAccountSessionAuthority, type AccountSessionAuthorityBinding } from "./accountSessionAuthority";
import { canMakeRevenueCatPurchases, getRevenueCatAppUserId, readRevenueCatNonSubscriptionProducts, purchaseRevenueCatStoreProduct } from "./revenuecat";
import { isCreatorMoneyStoreQuoteMatch } from "./creatorMoneyStoreQuote";

// No normal screen invokes this dormant function. Only a first committed
// authenticated consume response can reach the existing purchase owner. Missing
// qualification remains blocked; this source does not seed or activate one.
type Storage = { getItem(key: string): Promise<string | null>; setItem(key: string, value: string): Promise<unknown> };
type Record = { version: 1; userId: string; selectionId: string; reservationId: string; quoteDigest: string; requestId: string; state: "consume_pending" | "consumed" | "sdk_started" };
const flights = new Set<string>();
const uuid = (v: unknown): v is string => typeof v === "string" && /^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/u.test(v);
const newId = () => { const b = new Uint8Array(16); crypto.getRandomValues(b); b[6] = (b[6] & 15) | 64; b[8] = (b[8] & 63) | 128; const h = [...b].map(v => v.toString(16).padStart(2, "0")).join(""); return `${h.slice(0,8)}-${h.slice(8,12)}-${h.slice(12,16)}-${h.slice(16,20)}-${h.slice(20)}`; };
const failure = () => new NativeSandboxQuoteError("outcome_unknown");
export async function dispatchPreparedNativeSandboxPurchase(authority: AccountSessionAuthorityBinding, offerId: string, store: NativeSandboxStore,
  selectionId: string, options: { storage?: Storage; deadlineMs?: number; recoverOnly?: boolean } = {}) {
  const expected = Object.freeze({ ...authority }), storage = options.storage ?? AsyncStorage, timeout = options.deadlineMs ?? 15000;
  if (!Number.isSafeInteger(timeout) || timeout < 1 || timeout > 15000 || store !== "APP_STORE" || (options.recoverOnly !== undefined && typeof options.recoverOnly !== "boolean")) throw failure();
  const recoverOnly = options.recoverOnly === true;
  const key = `@chillywood/native-store-dispatch:v1:${expected.userId}:${store}:${offerId}`;
  if (!recoverOnly && flights.has(key)) throw failure(); if (!recoverOnly) flights.add(key);
  let retired = false;
  const current = () => { if (retired || !sameAccountSessionAuthority(expected, getCurrentAccountSessionAuthoritySnapshot())) throw failure(); };
  const unsubscribe = subscribeToAccountSessionAuthority(v => { if (!sameAccountSessionAuthority(expected, v)) retired = true; });
  const bounded = async <T,>(promise: Promise<T>): Promise<T> => { let timer: ReturnType<typeof setTimeout>;
    try { return await Promise.race([promise, new Promise<never>((_r, reject) => { timer = setTimeout(() => reject(failure()), timeout); })]); }
    finally { clearTimeout(timer!); }
  };
  let client: Awaited<ReturnType<typeof captureNativeSandboxQuoteClient>> | null = null;
  let retainFlight = false;
  try {
    current(); client = await captureNativeSandboxQuoteClient(expected, offerId, store, { storage, deadlineMs: timeout }); current();
    const selected = (await client.recover()).data.selection; current();
    if (!selected || selected.id !== selectionId) throw failure();
    const raw = await bounded(storage.getItem(key)); current(); let saved: Record | null = null;
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
    // Local OS evidence is read here, never provided by a caller. It is app
    // evidence only, not a remotely attested build or IAP/account verification.
    const app = await readNativeSandboxAppEvidence(expected); current();
    if (app.status !== "observed" || app.evidence.environment !== "SANDBOX" || !app.evidence.unsignedNativeBuild || !app.evidence.unsignedNativeVersion) throw failure();
    if (await bounded(getRevenueCatAppUserId()) !== expected.userId) throw failure(); current();
    if (await bounded(canMakeRevenueCatPurchases()) !== true) throw failure(); current();
    const products = await bounded(readRevenueCatNonSubscriptionProducts([selected.quote.catalog.wireProductId])); current();
    if (!products || products.length !== 1 || !isCreatorMoneyStoreQuoteMatch(products[0], { productId: selected.quote.catalog.wireProductId, amountMinor: selected.quote.amountMinor, currency: selected.quote.currency })) throw failure();
    const product = JSON.parse(JSON.stringify(products[0])) as typeof products[0];
    if (metadata.platform !== "ios" || metadata.noChargeAccountScope !== "testflight_distribution" || metadata.nativeBuild !== app.evidence.unsignedNativeBuild
      || metadata.nativeVersion !== app.evidence.unsignedNativeVersion || metadata.nativeVersion !== app.evidence.signedAppVersion || metadata.sdkVersion !== "10.15.1") throw failure();
    const retained = await client.readPurchaseAttempt(); current();
    if (retained.status === "none") await client.retainPurchaseAttempt(selectionId);
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
    if (q.platform !== "ios" || q.noChargeAccountScope !== "testflight_distribution" || q.nativeBuild !== app.evidence.unsignedNativeBuild
      || q.nativeVersion !== app.evidence.unsignedNativeVersion || q.nativeVersion !== app.evidence.signedAppVersion || q.sdkVersion !== "10.15.1") throw failure();
    await bounded(storage.setItem(key, JSON.stringify({ ...saved, state: "consumed" }))); current();
    const retain = await client.createCallbackRetainer(selectionId, response.data.attempt); current();
    await bounded(storage.setItem(key, JSON.stringify({ ...saved, state: "sdk_started" }))); current();
    await purchaseRevenueCatStoreProduct(product, { authority: expected, retainPurchaseEvidence: retain });
    current(); return Object.freeze({ status: "callback_retained" as const, dispatchAllowed: false as const, settlementAllowed: false as const });
  } catch { throw failure(); }
  finally { client?.dispose(); unsubscribe(); if (!recoverOnly && !retainFlight) flights.delete(key); }
}
