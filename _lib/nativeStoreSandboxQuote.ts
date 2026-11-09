import { validNativeTerminalData, type NativeStoreTerminal } from "../supabase/functions/_shared/native-store-sandbox-terminal-contract-v1";
import { validNativeDispatchData, type NativeDispatchQualification } from "../supabase/functions/_shared/native-store-sandbox-dispatch-contract-v1";
import AsyncStorage from "@react-native-async-storage/async-storage";
import "react-native-get-random-values";
import { captureAccountBoundSupabaseMutationSubject } from "./accountBoundSupabaseMutation";
import { getCurrentAccountSessionAuthoritySnapshot, sameAccountSessionAuthority, subscribeToAccountSessionAuthority, type AccountSessionAuthorityBinding } from "./accountSessionAuthority";
import { SUPABASE_URL, SUPABASE_ANON_KEY } from "./supabase";

// Preparation only. This module has no store SDK, payment, entitlement or media
// dispatch dependency. A recorded selection is not a purchase or access grant.
export const NATIVE_STORE_SANDBOX_PROTOCOL = "native-store-sandbox-command-v1" as const;
export type NativeSandboxStore = "APP_STORE" | "PLAY_STORE";
export type NativeSandboxQuote = {
  offerId: string; offerRevision: number; resourceId: string; resourceRevision: number;
  creatorId: string; kind: "paid_content"; amountMinor: number; currency: "usd";
  asset: { id: string; incarnation: string; sha256: string; byteLength: number; resourceRevision: number; profile: "scpv-mp4-h264-aac-v1" };
  catalog: { bindingId: string; revision: number; projectId: string; appId: string; store: NativeSandboxStore; environment: "SANDBOX"; wireProductId: string };
  quoteDigest: string;
};
export type NativeSandboxSelection = { id: string; originalRequestId: string; originalSessionGeneration: string; createdAt: string; quote: NativeSandboxQuote };
type Actor = { userId: string; accountId: string; sessionGeneration: string };
type Command = "cancel-preparation" | "terminal-recover" | "offer" | "prepare" | "recover" | "claim" | "claim-recover" | "reserve" | "reserve-recover";
export type NativeSandboxReservation = { id: string; selectionId: string; originalRequestId: string; originalSessionGeneration: string; createdAt: string; quoteDigest: string; state: "dispatch_reserved"; dispatchAllowed: false; providerQualified: false };
export type NativeSandboxClaim = { id: string; selectionId: string; originalRequestId: string; originalSessionGeneration: string; createdAt: string; transactionIdentifier: string; productIdentifier: string; evidence: "client_assertion"; settlementAllowed: false };
// originalSessionGeneration here records the local first attempt only. The
// authenticated server response retains the session of its first insertion,
// which may be a newer same-account session if that attempt never arrived.
export type NativeSandboxConsumedAttemptEvidence = { id: string; reservationId: string; selectionId: string; originalRequestId: string; originalSessionGeneration: string; quoteDigest: string; createdAt: string; state: "consumed"; dispatchAllowed: false; providerQualified: false };
type SavedClaim = { version: 1 | 2; consumedAttempt?: NativeSandboxConsumedAttemptEvidence; userId: string; prepareRequestId: string; quoteDigest: string; selectionId: string; originalRequestId: string; originalSessionGeneration: string; transactionIdentifier: string; productIdentifier: string };
type ReservedAttempt = { version: 1; state: "dispatch_reserved"; userId: string; attemptId: string; originalSessionGeneration: string; selectionId: string; prepareRequestId: string; quote: NativeSandboxQuote };
export type NativeSandboxResponse = { protocol: typeof NATIVE_STORE_SANDBOX_PROTOCOL; command: Command; requestId: string; actor: Actor;
  status: "ok" | "held" | "unknown"; data: { quote?: NativeSandboxQuote | null; selection?: NativeSandboxSelection | null; claim?: NativeSandboxClaim | null; reservation?: NativeSandboxReservation | null; terminal?: NativeStoreTerminal | null; reason: string | null };
  dispatchAllowed: false; correlation: "unsupported" };
export type NativeSandboxSaved = { version: 1; userId: string; originalSessionGeneration: string; originalRequestId: string; quote: NativeSandboxQuote };
type Storage = { getItem(key: string): Promise<string | null>; setItem(key: string, value: string): Promise<unknown> };
type Row = Record<string, unknown>;
const row = (v: unknown): v is Row => !!v && typeof v === "object" && !Array.isArray(v);
const keys = (v: unknown, k: string[]): v is Row => row(v) && Object.keys(v).length === k.length && k.every(n => Object.hasOwn(v, n));
const uuid = (v: unknown): v is string => typeof v === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u.test(v);
const id = (v: unknown, prefix: string): v is string => typeof v === "string" && v.startsWith(prefix) && uuid(v.slice(prefix.length));
const integer = (v: unknown): v is number => typeof v === "number" && Number.isSafeInteger(v) && v > 0;
const text = (v: unknown): v is string => typeof v === "string" && v.length > 0 && v.length <= 512 && v.trim() === v && !/[\u0000-\u001f\u007f]/u.test(v)
  && !/[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/u.test(v);
// Match the claim endpoint's byte limit and scalar restrictions without relying
// on a TextEncoder polyfill being present in the native JS runtime.
const claimText = (v: unknown): v is string => text(v) && !/[\ud800-\udfff]/u.test(v)
  && [...v].reduce((bytes, ch) => { const point = ch.codePointAt(0)!; return bytes + (point < 128 ? 1 : point < 2048 ? 2 : point <= 0xffff ? 3 : 4); }, 0) <= 512;
const digest = (v: unknown): v is string => typeof v === "string" && /^[a-f0-9]{64}$/u.test(v);
export function validNativeSandboxQuote(v: unknown): v is NativeSandboxQuote {
  return keys(v, ["offerId", "offerRevision", "resourceId", "resourceRevision", "creatorId", "kind", "amountMinor", "currency", "asset", "catalog", "quoteDigest"])
    && id(v.offerId, "scv1_offer_") && integer(v.offerRevision) && id(v.resourceId, "scv1_resource_") && integer(v.resourceRevision)
    && uuid(v.creatorId) && v.kind === "paid_content" && integer(v.amountMinor) && v.currency === "usd" && digest(v.quoteDigest)
    && keys(v.asset, ["id", "incarnation", "sha256", "byteLength", "resourceRevision", "profile"])
    && id(v.asset.id, "scv1_asset_") && uuid(v.asset.incarnation) && digest(v.asset.sha256) && integer(v.asset.byteLength) && v.asset.byteLength <= 16777216
    && v.asset.resourceRevision === v.resourceRevision && v.asset.profile === "scpv-mp4-h264-aac-v1"
    && keys(v.catalog, ["bindingId", "revision", "projectId", "appId", "store", "environment", "wireProductId"])
    && id(v.catalog.bindingId, "nssv1_catalog_") && integer(v.catalog.revision) && text(v.catalog.projectId) && text(v.catalog.appId)
    && ["APP_STORE", "PLAY_STORE"].includes(String(v.catalog.store)) && v.catalog.environment === "SANDBOX" && text(v.catalog.wireProductId);
}
const validConsumedAttempt = (v: unknown): v is NativeSandboxConsumedAttemptEvidence => keys(v, ["id", "reservationId", "selectionId", "originalRequestId", "originalSessionGeneration", "quoteDigest", "createdAt", "state", "dispatchAllowed", "providerQualified"])
  && id(v.id, "nssv1_attempt_") && id(v.reservationId, "nssv1_reservation_") && id(v.selectionId, "nssv1_selection_")
  && uuid(v.originalRequestId) && uuid(v.originalSessionGeneration) && digest(v.quoteDigest) && typeof v.createdAt === "string"
  && /^\d{4}-\d\d-\d\dT/u.test(v.createdAt) && Number.isFinite(Date.parse(v.createdAt)) && v.state === "consumed" && v.dispatchAllowed === false && v.providerQualified === false;
const canonical = (v: unknown): string => JSON.stringify(v, (_k, x) => row(x) ? Object.fromEntries(Object.keys(x).sort().map(k => [k, x[k]])) : x);
function frozen<T>(v: T): T { if (v && typeof v === "object") { Object.values(v).forEach(frozen); Object.freeze(v); } return v; }
const copy = <T,>(v: T): T => frozen(JSON.parse(JSON.stringify(v)) as T);
export class NativeSandboxQuoteError extends Error {
  constructor(readonly code: "invalid_request" | "invalid_response" | "authority_retired" | "unavailable" | "outcome_unknown" | "saved_selection_requires_recovery") { super(`Native sandbox preparation: ${code}.`); }
}
const fail = (code: NativeSandboxQuoteError["code"]): never => { throw new NativeSandboxQuoteError(code); };
// A timed-out write may settle later. Do not let a second mounted owner replace
// its original request while this process remains alive, even if reads lag.
const preparingKeys = new Set<string>();
const newId = () => { const b = new Uint8Array(16); crypto.getRandomValues(b); b[6] = (b[6] & 15) | 64; b[8] = (b[8] & 63) | 128;
  const h = [...b].map(n => n.toString(16).padStart(2, "0")).join(""); return `${h.slice(0,8)}-${h.slice(8,12)}-${h.slice(12,16)}-${h.slice(16,20)}-${h.slice(20)}`; };
export function parseNativeSandboxResponse(value: unknown, expected: { actor: Actor; command: Command; requestId: string; offerId: string; store: NativeSandboxStore; saved?: NativeSandboxSaved; claim?: SavedClaim; initialClaim?: boolean; attempt?: ReservedAttempt; terminalSelectionId?: string }): NativeSandboxResponse {
  if (!keys(value, ["protocol", "command", "requestId", "actor", "status", "data", "dispatchAllowed", "correlation"])
    || value.protocol !== NATIVE_STORE_SANDBOX_PROTOCOL || value.command !== expected.command || value.requestId !== expected.requestId
    || !keys(value.actor, ["userId", "accountId", "sessionGeneration"]) || canonical(value.actor) !== canonical(expected.actor)
    || !["ok", "held", "unknown"].includes(String(value.status)) || value.status === "unknown" && expected.command !== "recover" && expected.command !== "claim-recover" && expected.command !== "reserve-recover" && expected.command !== "terminal-recover"
    || value.dispatchAllowed !== false || value.correlation !== "unsupported") return fail("invalid_response");
  const data = value.data;
  if (expected.command === "cancel-preparation" || expected.command === "terminal-recover") {
    if (!validNativeTerminalData(data, { command: expected.command, requestId: expected.requestId, selectionId: expected.terminalSelectionId, status: value.status, dispatchAllowed: value.dispatchAllowed })) return fail("invalid_response");
    return copy(value as unknown as NativeSandboxResponse);
  }
  if (expected.command === "reserve" || expected.command === "reserve-recover") {
    if (!keys(data, ["reservation", "reason"])) return fail("invalid_response");
    const r = data.reservation, a = expected.attempt;
    if (value.status === "held") {
      if (r !== null || !["reservation_terminal", "selection_terminal"].includes(String(data.reason))) return fail("invalid_response");
    } else if (value.status === "unknown") {
      if (r !== null || data.reason !== "reservation_unknown") return fail("invalid_response");
    } else if (value.status !== "ok" || !a || data.reason !== null
      || !keys(r, ["id", "selectionId", "originalRequestId", "originalSessionGeneration", "createdAt", "quoteDigest", "state", "dispatchAllowed", "providerQualified"])
      || !id(r.id, "nssv1_reservation_") || r.selectionId !== a.selectionId || r.originalRequestId !== a.attemptId || !uuid(r.originalSessionGeneration)
      || r.quoteDigest !== a.quote.quoteDigest || r.state !== "dispatch_reserved" || r.dispatchAllowed !== false || r.providerQualified !== false
      || typeof r.createdAt !== "string" || !/^\d{4}-\d\d-\d\dT/u.test(r.createdAt) || !Number.isFinite(Date.parse(r.createdAt))) return fail("invalid_response");
    return copy(value as unknown as NativeSandboxResponse);
  }
  if (expected.command === "claim" || expected.command === "claim-recover") {
    if (!keys(data, ["claim", "reason"])) return fail("invalid_response");
    const c = data.claim, s = expected.claim;
    if (value.status !== "ok") {
      if (c !== null || typeof data.reason !== "string" || !/^[a-z][a-z0-9_]{0,95}$/u.test(data.reason)) return fail("invalid_response");
    } else if (!s || data.reason !== null || !keys(c, ["id", "selectionId", "originalRequestId", "originalSessionGeneration", "createdAt", "transactionIdentifier", "productIdentifier", "evidence", "settlementAllowed"])
      || !id(c.id, "nssv1_claim_") || c.selectionId !== s.selectionId || c.originalRequestId !== s.originalRequestId || !uuid(c.originalSessionGeneration)
      || expected.initialClaim === true && c.originalSessionGeneration !== expected.actor.sessionGeneration
      || c.transactionIdentifier !== s.transactionIdentifier || c.productIdentifier !== s.productIdentifier || c.evidence !== "client_assertion" || c.settlementAllowed !== false
      || typeof c.createdAt !== "string" || !/^\d{4}-\d\d-\d\dT/u.test(c.createdAt) || !Number.isFinite(Date.parse(c.createdAt))) return fail("invalid_response");
    return copy(value as unknown as NativeSandboxResponse);
  }
  if (!keys(data, [expected.command === "offer" ? "quote" : "selection", "reason"])
    || !(data.reason === null || typeof data.reason === "string" && /^[a-z][a-z0-9_]{0,95}$/u.test(data.reason))) return fail("invalid_response");
  const selected = expected.command === "offer" ? data.quote : row(data.selection) ? data.selection.quote : null;
  if (selected !== null && (!validNativeSandboxQuote(selected) || selected.offerId !== expected.offerId || selected.catalog.store !== expected.store || selected.creatorId === expected.actor.userId)) return fail("invalid_response");
  if (expected.command !== "offer" && data.selection !== null) {
    const s = data.selection, saved = expected.saved;
    if (!saved || !keys(s, ["id", "originalRequestId", "originalSessionGeneration", "createdAt", "quote"])
      || !id(s.id, "nssv1_selection_") || s.originalRequestId !== saved.originalRequestId || s.originalSessionGeneration !== saved.originalSessionGeneration
      || typeof s.createdAt !== "string" || !/^\d{4}-\d\d-\d\dT/u.test(s.createdAt) || !Number.isFinite(Date.parse(s.createdAt))
      || canonical(s.quote) !== canonical(saved.quote)) return fail("invalid_response");
  }
  if (value.status === "ok" ? selected === null || data.reason !== null : selected !== null || data.reason === null) return fail("invalid_response");
  return copy(value as unknown as NativeSandboxResponse);
}

/** Each retained key belongs to one account/offer/store. Save BEFORE dispatch;
 * Unknown replies never permit a replacement prepare or purchase. Recovery
 * reads are separate from explicit resending of an identical saved assertion. */
export async function captureNativeSandboxQuoteClient(authority: AccountSessionAuthorityBinding, offerId: string, store: NativeSandboxStore,
  options: { storage?: Storage; deadlineMs?: number } = {}) {
  const expected = Object.freeze({ ...authority }), storage = options.storage ?? AsyncStorage, timeout = options.deadlineMs ?? 15000;
  if (!id(offerId, "scv1_offer_") || !["APP_STORE", "PLAY_STORE"].includes(store) || !Number.isSafeInteger(timeout) || timeout < 1 || timeout > 15000
    || expected.state !== "ACTIVE" || expected.restoreOnly || expected.userId !== expected.accountId || !uuid(expected.userId) || !uuid(expected.sessionGeneration)
    || !sameAccountSessionAuthority(expected, getCurrentAccountSessionAuthoritySnapshot())) return fail("authority_retired");
  let retired = false, busy = false; const controllers = new Set<AbortController>();
  const current = () => { if (retired || !sameAccountSessionAuthority(expected, getCurrentAccountSessionAuthoritySnapshot())) return fail("authority_retired"); };
  const unsubscribe = subscribeToAccountSessionAuthority(v => { if (!sameAccountSessionAuthority(expected, v)) { retired = true; controllers.forEach(c => c.abort()); } });
  const bounded = async <T,>(operation: (signal: AbortSignal) => Promise<T>): Promise<T> => {
    const controller = new AbortController(); controllers.add(controller); let timer: ReturnType<typeof setTimeout>;
    try { return await Promise.race([operation(controller.signal), new Promise<never>((_resolve, reject) => { timer = setTimeout(() => { controller.abort(); reject(new NativeSandboxQuoteError("unavailable")); }, timeout); })]); }
    finally { clearTimeout(timer!); controllers.delete(controller); }
  };
  let captured: Awaited<ReturnType<typeof captureAccountBoundSupabaseMutationSubject>>;
  try { captured = await bounded(signal => captureAccountBoundSupabaseMutationSubject(expected.userId, { waitForReadSettlement: true, signal }));
    if (!sameAccountSessionAuthority(expected, captured.authority)) retired = true; current(); }
  catch { retired = true; unsubscribe(); return fail("authority_retired"); }
  const actor = Object.freeze({ userId: expected.userId, accountId: expected.accountId, sessionGeneration: expected.sessionGeneration });
  const rootStorageKey = `@chillywood/native-store-quote:v1:${actor.userId}:${store}:${offerId}`;
  let storageKey = rootStorageKey, claimKey = `${storageKey}:claim`, cancellationKey = `${storageKey}:cancellation`, generationBound = false;
  let confirmedReservation: NativeSandboxReservation | null = null;
  let confirmedSelection: NativeSandboxSelection | null = null;
  const resolveGeneration = async () => {
    if (generationBound) return;
    const began = Date.now(), visited = new Set<string>();
    while (Date.now() - began <= timeout) {
      if (visited.has(storageKey)) return fail("unavailable"); visited.add(storageKey);
      const raw = await bounded(() => storage.getItem(`${storageKey}:successor`)); current();
      if (raw === null) { generationBound = true; return; }
      if (raw.length > 2048 || Date.now() - began > timeout) return fail("unavailable");
      let v: unknown; try { v = JSON.parse(raw); } catch { return fail("unavailable"); }
      if (!keys(v, ["version", "userId", "originalRequestId", "selectionId", "terminalId"]) || v.version !== 1 || v.userId !== actor.userId
        || !uuid(v.originalRequestId) || !id(v.selectionId, "nssv1_selection_") || !id(v.terminalId, "nssv1_terminal_")) return fail("unavailable");
      const oldRaw = await bounded(() => storage.getItem(storageKey)); current();
      if (!oldRaw || oldRaw.length > 16384) return fail("unavailable");
      const old = JSON.parse(oldRaw) as NativeSandboxSaved;
      if (old.userId !== actor.userId || old.originalRequestId !== v.originalRequestId || !validNativeSandboxQuote(old.quote) || old.quote.offerId !== offerId || old.quote.catalog.store !== store) return fail("unavailable");
      const recovered = await send("recover", { originalRequestId: old.originalRequestId }, old);
      if (recovered.data.selection?.id !== v.selectionId) return fail("unavailable");
      const terminal = await send("terminal-recover", { selectionId: v.selectionId }, undefined, undefined, false, undefined, { requestId: newId(), selectionId: v.selectionId });
      if (terminal.status !== "ok" || terminal.data.terminal?.id !== v.terminalId) return fail("unavailable");
      storageKey = `${rootStorageKey}:generation:${v.terminalId}`; claimKey = `${storageKey}:claim`; cancellationKey = `${storageKey}:cancellation`;
      confirmedSelection = null; confirmedReservation = null;
    }
    return fail("unavailable");
  };
  const readSaved = async (): Promise<NativeSandboxSaved | null> => {
    current(); await resolveGeneration(); const raw = await bounded(() => storage.getItem(storageKey)); current(); if (raw === null) return null;
    try { if (raw.length > 16384) return fail("unavailable"); const v: unknown = JSON.parse(raw);
      if (!keys(v, ["version", "userId", "originalSessionGeneration", "originalRequestId", "quote"]) || v.version !== 1 || v.userId !== actor.userId
        || !uuid(v.originalSessionGeneration) || !uuid(v.originalRequestId) || !validNativeSandboxQuote(v.quote)
        || v.quote.offerId !== offerId || v.quote.catalog.store !== store || v.quote.creatorId === actor.userId) return fail("unavailable");
      return copy(v as unknown as NativeSandboxSaved);
    } catch { return fail("unavailable"); }
  };
  const readClaim = async (saved: NativeSandboxSaved): Promise<SavedClaim | null> => {
    current(); const raw = await bounded(() => storage.getItem(claimKey)); current(); if (raw === null) return null;
    try { if (raw.length > 4096) return fail("unavailable"); const c: unknown = JSON.parse(raw);
      if (!row(c) || !keys(c, ["version", "userId", "prepareRequestId", "quoteDigest", "selectionId", "originalRequestId", "originalSessionGeneration", "transactionIdentifier", "productIdentifier", ...(c.version === 2 ? ["consumedAttempt"] : [])])
        || ![1, 2].includes(c.version as number) || c.userId !== actor.userId || c.prepareRequestId !== saved.originalRequestId || c.quoteDigest !== saved.quote.quoteDigest
        || !id(c.selectionId, "nssv1_selection_") || !uuid(c.originalRequestId) || !uuid(c.originalSessionGeneration)
        || !claimText(c.transactionIdentifier) || !claimText(c.productIdentifier) || c.productIdentifier !== saved.quote.catalog.wireProductId) return fail("unavailable");
      if (c.version === 2 && (!validConsumedAttempt(c.consumedAttempt) || c.consumedAttempt.selectionId !== c.selectionId
        || c.consumedAttempt.quoteDigest !== c.quoteDigest || c.consumedAttempt.originalSessionGeneration !== c.originalSessionGeneration)) return fail("unavailable");
      return copy(c as unknown as SavedClaim);
    } catch { return fail("unavailable"); }
  };
  // Device-local fence across offers using this SKU. AsyncStorage plus this
  // runtime's latch is NOT atomic across separate JS runtimes/devices, nor a
  // server admission lock. The authenticated reservation below supplies the
  // cross-device fence; a future dispatcher still needs provider qualification
  // and a durable pre-SDK transition. Neither record grants dispatch.
  const attemptScope = (quote: NativeSandboxQuote) => canonical([actor.userId, quote.catalog.projectId, quote.catalog.appId, quote.catalog.store, quote.catalog.environment, quote.catalog.wireProductId]);
  const attemptKey = (quote: NativeSandboxQuote) => `@chillywood/native-store-attempt:v1:${encodeURIComponent(attemptScope(quote))}`;
  const slotKeys = new Map<string, string>();
  const readAttempt = async (saved: NativeSandboxSaved, advance = false): Promise<ReservedAttempt | null> => {
    const root = attemptKey(saved.quote), began = Date.now(), visited = new Set<string>(); let key = root;
    while (Date.now() - began <= timeout) {
    if (visited.has(key)) return fail("unavailable"); visited.add(key);
    current(); if (Date.now() - began > timeout) return fail("unavailable"); const raw = await bounded(() => storage.getItem(key)); current(); if (raw === null) { slotKeys.set(root, key); return null; }
    try { if (raw.length > 16384) return fail("unavailable"); const v: unknown = JSON.parse(raw);
      if (!keys(v, ["version", "state", "userId", "attemptId", "originalSessionGeneration", "selectionId", "prepareRequestId", "quote"])
        || v.version !== 1 || v.state !== "dispatch_reserved" || v.userId !== actor.userId || !uuid(v.attemptId) || !uuid(v.originalSessionGeneration)
        || !id(v.selectionId, "nssv1_selection_") || !uuid(v.prepareRequestId) || !validNativeSandboxQuote(v.quote) || v.quote.creatorId === actor.userId
        || attemptScope(v.quote) !== attemptScope(saved.quote)) return fail("unavailable");
      const old = copy(v as unknown as ReservedAttempt), pointerKey = `${key}:successor`;
      // A client pinned to this original attempt must never follow its successor
      // into a slot reserved for a new selection, even after another owner advances.
      if (old.prepareRequestId === saved.originalRequestId) { slotKeys.set(root, key); return old; }
      const rawPointer = await bounded(() => storage.getItem(pointerKey)); current();
      if (rawPointer === null && (!advance || old.prepareRequestId === saved.originalRequestId)) { slotKeys.set(root, key); return old; }
      const terminal = (await send("terminal-recover", { selectionId: old.selectionId }, undefined, undefined, false, undefined, { requestId: newId(), selectionId: old.selectionId })).data.terminal;
      if (!terminal) { slotKeys.set(root, key); return old; }
      const pointer = JSON.stringify({ version: 1, userId: actor.userId, attemptId: old.attemptId, terminalId: terminal.id });
      if (rawPointer !== null && rawPointer !== pointer) return fail("unavailable");
      if (rawPointer === null) { if (!advance) return fail("unavailable"); await bounded(() => storage.setItem(pointerKey, pointer)); current(); }
      key = `${root}:generation:${terminal.id}`;
    } catch { return fail("unavailable"); }
    }
    return fail("unavailable");
  };
  const matchesAttempt = (attempt: ReservedAttempt, saved: NativeSandboxSaved, selectionId?: string) => attempt.prepareRequestId === saved.originalRequestId
    && canonical(attempt.quote) === canonical(saved.quote) && (selectionId === undefined || attempt.selectionId === selectionId);
  const send = async (command: Command, payload: unknown, saved?: NativeSandboxSaved, claim?: SavedClaim, initialClaim = false, attempt?: ReservedAttempt, terminalRequest?: {requestId:string;selectionId:string}): Promise<NativeSandboxResponse> => {
    current(); const requestId = terminalRequest?.requestId ?? (command === "prepare" ? saved!.originalRequestId : command === "claim" ? claim!.originalRequestId : command === "reserve" ? attempt!.attemptId : newId());
    try { const value = await bounded(async signal => {
      const response = await fetch(`${SUPABASE_URL.replace(/\/+$/u, "")}/functions/v1/native-store-sandbox-command-v1`, { method: "POST", signal,
        headers: { Authorization: `Bearer ${captured.accessToken}`, apikey: SUPABASE_ANON_KEY, "Content-Type": "application/json", "x-chillywood-platform": store === "APP_STORE" ? "ios" : "android" },
        body: JSON.stringify({ protocol: NATIVE_STORE_SANDBOX_PROTOCOL, command, requestId, payload }) });
      current(); if (!response.ok) return fail("unavailable"); const body = await response.text(); current(); if (body.length > 65536) return fail("invalid_response"); return JSON.parse(body) as unknown;
    }); current(); const parsed = parseNativeSandboxResponse(value, { actor, command, requestId, offerId, store, saved, claim, initialClaim, attempt, terminalSelectionId: terminalRequest?.selectionId });
      if (command === "prepare" || command === "recover") confirmedSelection = parsed.data.selection ?? null;
      if (command === "reserve" || command === "reserve-recover") confirmedReservation = parsed.data.reservation ?? null;
      return parsed; }
    catch { current(); return fail(command === "prepare" || command === "claim" || command === "reserve" || command === "cancel-preparation" ? "outcome_unknown" : "unavailable"); }
  };
  const exclusive = async <T,>(operation: () => Promise<T>): Promise<T> => { current(); if (busy) return fail("unavailable"); busy = true; try { return await operation(); } finally { busy = false; } };
  const terminalRequest = async (cancel: boolean) => {
    const selection = confirmedSelection; if (!selection) return fail("invalid_request");
    const saved = await readSaved(); if (!saved || saved.originalRequestId !== selection.originalRequestId) return fail("invalid_request");
    if (!cancel) return send("terminal-recover", { selectionId: selection.id }, undefined, undefined, false, undefined, { requestId: newId(), selectionId: selection.id });
    let requestId: string;
    const raw = await bounded(() => storage.getItem(cancellationKey)); current();
    if (raw !== null) {
      let v: unknown; try { v = JSON.parse(raw); } catch { return fail("unavailable"); }
      if (raw.length > 2048 || !keys(v, ["version", "userId", "selectionId", "requestId"]) || v.version !== 1 || v.userId !== actor.userId || v.selectionId !== selection.id || !uuid(v.requestId)) return fail("unavailable");
      requestId = v.requestId;
    } else {
      // An uncertain write retains this latch; do not replace its original UUID.
      if (preparingKeys.has(cancellationKey)) return fail("outcome_unknown"); preparingKeys.add(cancellationKey);
      requestId = newId();
      await bounded(() => storage.setItem(cancellationKey, JSON.stringify({ version: 1, userId: actor.userId, selectionId: selection.id, requestId }))); current();
    }
    return send("cancel-preparation", { selectionId: selection.id }, undefined, undefined, false, undefined, { requestId, selectionId: selection.id });
  };
  return Object.freeze({ actor, readSaved,
    recoverTerminal: () => exclusive(() => terminalRequest(false)),
    advanceAfterTerminal: () => exclusive(async () => {
      const selection = confirmedSelection; if (!selection) return fail("invalid_request");
      const result = await terminalRequest(false); current();
      const terminal = result.data.terminal; if (result.status !== "ok" || !terminal) return fail("invalid_request");
      const pointerKey = `${storageKey}:successor`, value = JSON.stringify({ version: 1, userId: actor.userId, originalRequestId: selection.originalRequestId, selectionId: selection.id, terminalId: terminal.id });
      const existing = await bounded(() => storage.getItem(pointerKey)); current();
      if (existing !== null && existing !== value) return fail("unavailable");
      // Deterministic same terminal pointer: late completion cannot replace a
      // later generation's records. Nothing in the original generation clears.
      if (existing === null) await bounded(() => storage.setItem(pointerKey, value)); current();
      retired = true; unsubscribe();
      return Object.freeze({ status: "successor_available" as const, dispatchAllowed: false as const });
    }),
    cancelPreparation: () => exclusive(() => terminalRequest(true)),
    dispose() { retired = true; unsubscribe(); controllers.forEach(c => c.abort()); },
    offer: () => exclusive(() => send("offer", { offerId, store })),
    prepare: (quote: NativeSandboxQuote) => exclusive(async () => {
      if (!validNativeSandboxQuote(quote) || quote.offerId !== offerId || quote.catalog.store !== store || quote.creatorId === actor.userId) return fail("invalid_request");
      const selected = copy(quote); await resolveGeneration(); if (preparingKeys.has(storageKey)) return fail("saved_selection_requires_recovery"); preparingKeys.add(storageKey);
      let retainGuard = false;
      try {
        if (await readSaved()) { retainGuard = true; return fail("saved_selection_requires_recovery"); }
        const saved: NativeSandboxSaved = { version: 1, userId: actor.userId, originalSessionGeneration: actor.sessionGeneration, originalRequestId: newId(), quote: selected };
        retainGuard = true; // Even a failed/timed-out write may settle later.
        await bounded(() => storage.setItem(storageKey, JSON.stringify(saved))); current();
        return await send("prepare", { offerId, store, expectedQuote: selected }, saved);
      } finally { if (!retainGuard) preparingKeys.delete(storageKey); }
    }),
    recover: () => exclusive(async () => { const saved = await readSaved(); if (!saved) return fail("invalid_request"); return send("recover", { originalRequestId: saved.originalRequestId }, saved); }),
    // Dormant prerequisite for a future qualified dispatcher. This reservation
    // does NOT admit dispatch, prove a purchase ran, or prove a test account.
    // No clearing/replacement API: a missing callback must not enable repurchase.
    retainPurchaseAttempt: (selectionId: string) => exclusive(async () => {
      const selection = confirmedSelection; if (!selection || selection.id !== selectionId) return fail("invalid_request");
      const saved = await readSaved(); if (!saved || saved.originalRequestId !== selection.originalRequestId || canonical(saved.quote) !== canonical(selection.quote)) return fail("invalid_request");
      if (await readAttempt(saved, true)) return fail("saved_selection_requires_recovery");
      const key = slotKeys.get(attemptKey(selection.quote)) ?? attemptKey(selection.quote); if (preparingKeys.has(key)) return fail("saved_selection_requires_recovery"); preparingKeys.add(key);
      let retainGuard = false;
      try {
        if (await readAttempt(saved)) { retainGuard = true; return fail("saved_selection_requires_recovery"); }
        const attempt: ReservedAttempt = { version: 1, state: "dispatch_reserved", userId: actor.userId, attemptId: newId(), originalSessionGeneration: actor.sessionGeneration,
          selectionId, prepareRequestId: saved.originalRequestId, quote: saved.quote };
        retainGuard = true; await bounded(() => storage.setItem(key, JSON.stringify(attempt))); current();
        await send("reserve", { selectionId }, saved, undefined, false, attempt);
        return Object.freeze({ status: "dispatch_reserved" as const, dispatchAllowed: false as const, providerQualified: false as const });
      } finally { if (!retainGuard) preparingKeys.delete(key); }
    }),
    recoverPurchaseAttempt: () => exclusive(async () => {
      const saved = await readSaved(); if (!saved) return fail("invalid_request"); const attempt = await readAttempt(saved);
      if (!attempt || !matchesAttempt(attempt, saved, confirmedSelection?.id)) return fail("invalid_request");
      return send("reserve-recover", { selectionId: attempt.selectionId }, saved, undefined, false, attempt);
    }),
    // Retry only this immutable reservation request, not an SDK purchase.
    retrySavedPurchaseReservation: () => exclusive(async () => {
      const saved = await readSaved(); if (!saved) return fail("invalid_request"); const attempt = await readAttempt(saved);
      if (!attempt || !matchesAttempt(attempt, saved, confirmedSelection?.id)) return fail("invalid_request");
      return send("reserve", { selectionId: attempt.selectionId }, saved, undefined, false, attempt);
    }),
    readPurchaseAttempt: () => exclusive(async () => {
      const saved = await readSaved(); if (!saved) return fail("invalid_request"); const attempt = await readAttempt(saved);
      let terminalSlot = false;
      if (attempt && !matchesAttempt(attempt, saved, confirmedSelection?.id)) {
        const response = await send("terminal-recover", { selectionId: attempt.selectionId }, undefined, undefined, false, undefined, { requestId: newId(), selectionId: attempt.selectionId });
        terminalSlot = response.status === "ok" && !!response.data.terminal;
      }
      return Object.freeze({ status: terminalSlot ? "terminal_slot_available" as const : !attempt ? preparingKeys.has(slotKeys.get(attemptKey(saved.quote)) ?? attemptKey(saved.quote)) ? "reservation_write_uncertain" as const : "none" as const : matchesAttempt(attempt, saved, confirmedSelection?.id) ? "dispatch_reserved" as const : "blocked_by_other_selection" as const,
        serverReservationConfirmed: !!attempt && confirmedReservation?.selectionId === attempt.selectionId,
        dispatchAllowed: false as const, providerQualified: false as const });
    }),
    // Internal authenticated admission read/consume for the dormant orchestrator.
    // No qualification, actor, build, or consumed-attempt object comes from caller.
    readDispatchQualification: () => exclusive(async () => {
      const selection = confirmedSelection; const requestId = newId();
      if (!selection) return fail("invalid_request");
      const command = "dispatch-qualification";
      const value = await bounded(async signal => {
        const response = await fetch(`${SUPABASE_URL.replace(/\/+$/u, "")}/functions/v1/native-store-sandbox-command-v1`, { method: "POST", signal,
          headers: { Authorization: `Bearer ${captured.accessToken}`, apikey: SUPABASE_ANON_KEY, "Content-Type": "application/json", "x-chillywood-platform": store === "APP_STORE" ? "ios" : "android" },
          body: JSON.stringify({ protocol: NATIVE_STORE_SANDBOX_PROTOCOL, command, requestId, payload: { selectionId: selection.id } }) });
        current(); if (!response.ok) return fail("outcome_unknown"); const body = await response.text(); current(); if (body.length > 65536) return fail("invalid_response"); return JSON.parse(body) as unknown;
      }); current();
      if (!keys(value, ["protocol", "command", "requestId", "actor", "status", "data", "dispatchAllowed", "correlation"])
        || value.protocol !== NATIVE_STORE_SANDBOX_PROTOCOL || value.command !== command || value.requestId !== requestId || canonical(value.actor) !== canonical(actor)
        || value.correlation !== "unsupported" || !validNativeDispatchData(value.data, { command, requestId, selectionId: selection.id, reservationId: undefined,
          sessionGeneration: actor.sessionGeneration, status: value.status, dispatchAllowed: value.dispatchAllowed })) return fail("invalid_response");
      const data = value.data as { qualification: NativeDispatchQualification | null; reason: string | null };
      const q = data.qualification, c = selection.quote.catalog;
      if (q && (q.quoteDigest !== selection.quote.quoteDigest || q.catalogBindingId !== c.bindingId || q.catalogRevision !== c.revision || q.projectId !== c.projectId
        || q.appId !== c.appId || q.store !== c.store || q.environment !== c.environment || q.wireProductId !== c.wireProductId)) return fail("invalid_response");
      return copy({ status: value.status as "ok" | "held", data, dispatchAllowed: false as const });
    }),
    readDispatchAdmission: (requestId: string, recoverOnly: boolean) => exclusive(async () => {
      const selection = confirmedSelection, reservation = confirmedReservation;
      if (!uuid(requestId) || typeof recoverOnly !== "boolean" || !selection || !reservation || reservation.selectionId !== selection.id) return fail("invalid_request");
      const command = recoverOnly ? "dispatch-recover" : "dispatch-consume";
      const value = await bounded(async signal => {
        const response = await fetch(`${SUPABASE_URL.replace(/\/+$/u, "")}/functions/v1/native-store-sandbox-command-v1`, { method: "POST", signal,
          headers: { Authorization: `Bearer ${captured.accessToken}`, apikey: SUPABASE_ANON_KEY, "Content-Type": "application/json", "x-chillywood-platform": store === "APP_STORE" ? "ios" : "android" },
          body: JSON.stringify({ protocol: NATIVE_STORE_SANDBOX_PROTOCOL, command, requestId, payload: { selectionId: selection.id, reservationId: reservation.id } }) });
        current(); if (!response.ok) return fail("outcome_unknown"); const body = await response.text(); current(); if (body.length > 65536) return fail("invalid_response"); return JSON.parse(body) as unknown;
      }); current();
      if (!keys(value, ["protocol", "command", "requestId", "actor", "status", "data", "dispatchAllowed", "correlation"])
        || value.protocol !== NATIVE_STORE_SANDBOX_PROTOCOL || value.command !== command || value.requestId !== requestId || canonical(value.actor) !== canonical(actor)
        || value.correlation !== "unsupported" || !validNativeDispatchData(value.data, { command, requestId, selectionId: selection.id, reservationId: reservation.id,
          sessionGeneration: actor.sessionGeneration, status: value.status, dispatchAllowed: value.dispatchAllowed })) return fail("invalid_response");
      const data = value.data as { attempt: NativeSandboxConsumedAttemptEvidence | null; qualification: NativeDispatchQualification | null; newlyConsumed: boolean; reason: string | null };
      const q = data.qualification, c = selection.quote.catalog;
      if (q && (q.quoteDigest !== selection.quote.quoteDigest || q.catalogBindingId !== c.bindingId || q.catalogRevision !== c.revision || q.projectId !== c.projectId
        || q.appId !== c.appId || q.store !== c.store || q.environment !== c.environment || q.wireProductId !== c.wireProductId)) return fail("invalid_response");
      return copy({ status: value.status as "ok" | "held" | "unknown", data, dispatchAllowed: value.dispatchAllowed === true });
    }),
    // No normal caller/issuer exists yet. The supplied consumed-attempt object
    // is retained evidence, NEVER provider admission or server attestation.
    // Capture this closure while its original account is active, before SDK work.
    createCallbackRetainer: (selectionId: string, consumedEvidence: NativeSandboxConsumedAttemptEvidence) => exclusive(async () => {
      const selected = confirmedSelection, reservation = confirmedReservation;
      if (!selected || selected.id !== selectionId || !reservation || reservation.selectionId !== selectionId
        || !validConsumedAttempt(consumedEvidence) || consumedEvidence.selectionId !== selectionId || consumedEvidence.reservationId !== reservation.id
        || consumedEvidence.quoteDigest !== selected.quote.quoteDigest || consumedEvidence.originalSessionGeneration !== actor.sessionGeneration) return fail("invalid_request");
      const consumedAttempt = copy(consumedEvidence), selection = copy(selected);
      if (preparingKeys.has(claimKey)) return fail("saved_selection_requires_recovery"); preparingKeys.add(claimKey);
      let retained = false;
      try {
        const saved = await readSaved(); if (!saved || saved.originalRequestId !== selection.originalRequestId || canonical(saved.quote) !== canonical(selection.quote)) return fail("invalid_request");
        const attempt = await readAttempt(saved); if (!attempt || !matchesAttempt(attempt, saved, selectionId) || attempt.attemptId !== reservation.originalRequestId) return fail("invalid_request");
        if (await readClaim(saved)) { retained = true; return fail("saved_selection_requires_recovery"); }
        const requestId = newId(); retained = true;
        let evidenceKey: string | null = null, persistence: Promise<void> | null = null;
        return (evidence: Readonly<{ productIdentifier: string; transactionIdentifier: string }>, originalAuthority: Readonly<AccountSessionAuthorityBinding>): Promise<void> => {
          // Deliberately no current(), authentication, send(), or SDK call here:
          // account retirement cannot discard evidence belonging to this owner.
          if (!sameAccountSessionAuthority(expected, originalAuthority) || !keys(evidence, ["productIdentifier", "transactionIdentifier"])
            || evidence.productIdentifier !== saved.quote.catalog.wireProductId || !claimText(evidence.productIdentifier) || !claimText(evidence.transactionIdentifier)) return Promise.reject(new NativeSandboxQuoteError("invalid_request"));
          const exact = canonical(evidence);
          if (persistence) return exact === evidenceKey ? persistence : Promise.reject(new NativeSandboxQuoteError("outcome_unknown"));
          evidenceKey = exact;
          const claim: SavedClaim = { version: 2, userId: actor.userId, prepareRequestId: saved.originalRequestId, quoteDigest: saved.quote.quoteDigest,
            selectionId, originalRequestId: requestId, originalSessionGeneration: actor.sessionGeneration, productIdentifier: evidence.productIdentifier,
            transactionIdentifier: evidence.transactionIdentifier, consumedAttempt };
          // Snapshot before awaiting storage; uncertainty retains the exact
          // promise/ID and never permits replacement or automatic retry.
          const raw = JSON.stringify(claim);
          persistence = bounded(() => storage.setItem(claimKey, raw)).then(() => undefined).catch(() => fail("outcome_unknown"));
          return persistence;
        };
      } finally { if (!retained) preparingKeys.delete(claimKey); }
    }),
    // Dormant callback sink, not a purchase dispatcher. Only whitelist the
    // transaction ID and exact product; never persist tokens or raw receipts.
    captureCallback: (selectionId: string, callback: unknown) => exclusive(async () => {
      const selection = confirmedSelection;
      if (!selection || selection.id !== selectionId || !row(callback) || callback.productIdentifier !== selection.quote.catalog.wireProductId
        || !row(callback.transaction) || callback.transaction.productIdentifier !== callback.productIdentifier || !claimText(callback.productIdentifier) || !claimText(callback.transaction.transactionIdentifier)) return fail("invalid_request");
      const transactionIdentifier = callback.transaction.transactionIdentifier, productIdentifier = selection.quote.catalog.wireProductId;
      if (preparingKeys.has(claimKey)) return fail("saved_selection_requires_recovery"); preparingKeys.add(claimKey);
      let retainGuard = false;
      try {
        const saved = await readSaved(); if (!saved || canonical(saved.quote) !== canonical(selection.quote) || saved.originalRequestId !== selection.originalRequestId) return fail("invalid_request");
        const attempt = await readAttempt(saved); if (!attempt || !matchesAttempt(attempt, saved, selectionId) || confirmedReservation?.selectionId !== selectionId || confirmedReservation.originalRequestId !== attempt.attemptId) return fail("invalid_request");
        if (await readClaim(saved)) { retainGuard = true; return fail("saved_selection_requires_recovery"); }
        const claim: SavedClaim = { version: 1, userId: actor.userId, prepareRequestId: saved.originalRequestId, quoteDigest: saved.quote.quoteDigest,
          selectionId, originalRequestId: newId(), originalSessionGeneration: actor.sessionGeneration, transactionIdentifier, productIdentifier };
        retainGuard = true;
        await bounded(() => storage.setItem(claimKey, JSON.stringify(claim))); current();
        return await send("claim", { selectionId, transactionIdentifier, productIdentifier }, saved, claim, true);
      } finally { if (!retainGuard) preparingKeys.delete(claimKey); }
    }),
    recoverClaim: () => exclusive(async () => { const saved = await readSaved(); if (!saved) return fail("invalid_request");
      const claim = await readClaim(saved); if (!claim) return fail("invalid_request"); return send("claim-recover", { selectionId: claim.selectionId }, saved, claim); }),
    // Explicit evidence resubmission only. Same immutable request and payload;
    // never starts a purchase or invents a replacement assertion after timeout.
    retrySavedClaim: () => exclusive(async () => { const saved = await readSaved(); if (!saved) return fail("invalid_request");
      const claim = await readClaim(saved); if (!claim) return fail("invalid_request");
      return send("claim", { selectionId: claim.selectionId, transactionIdentifier: claim.transactionIdentifier, productIdentifier: claim.productIdentifier }, saved, claim); }),
  });
}
export type NativeSandboxQuoteClient = Awaited<ReturnType<typeof captureNativeSandboxQuoteClient>>;
