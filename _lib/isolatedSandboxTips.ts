import "react-native-get-random-values";
import { Platform } from "react-native";
import { captureAccountBoundSupabaseMutationSubject } from "./accountBoundSupabaseMutation";
import { invokeAccountBoundSupabaseRpc } from "./accountBoundSupabaseRpc.mjs";
import { getCurrentAccountSessionAuthoritySnapshot, sameAccountSessionAuthority, subscribeToAccountSessionAuthority, type AccountSessionAuthorityBinding } from "./accountSessionAuthority";
import { captureIsolatedSandboxCommerceClient, IsolatedSandboxCommerceError, ISOLATED_SANDBOX_PRODUCT_KINDS, type IsolatedSandboxActor, type IsolatedSandboxPayloads, type IsolatedSandboxProductKind, type IsolatedSandboxResult } from "./isolatedSandboxCommerce";
import { SUPABASE_URL, SUPABASE_ANON_KEY } from "./supabase";

export const ISOLATED_TIPS_RPC = "isolated_sandbox_tips_v1";
export type TipCursor = { asOf: string; createdAt: string; id: string };
export type TipReadPayloads = {
  "capability.read": Record<string, never>;
  "studio.read": { cursor: TipCursor | null; limit: number };
  "offers.read": { resourceId: string; cursor: TipCursor | null; limit: number };
  "offer.read": { offerId: string };
  "history.read": { role: "buyer" | "creator"; cursor: TipCursor | null; limit: number };
  "status.read": { intentId: string | null; receiptId: string | null };
  "request.read": { originalRequestId: string };
};
export type TipLifecyclePayloads = {
  "offer.retire": { offerId: string; expectedRevision: number };
  "checkout.abandon": { intentId: string; originalRequestId: string };
};
export type TipCommand = keyof TipReadPayloads | keyof TipLifecyclePayloads;
export type TipPayloads = TipReadPayloads & TipLifecyclePayloads;
export type TipMutation = "creator.declare" | "resource.create" | "offer.publish";
export type TipMutationPayloads = Pick<IsolatedSandboxPayloads, TipMutation>;

export const tipUuid = (value: unknown): value is string => typeof value === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u.test(value);
export const tipId = (value: unknown, kind: "resource" | "offer" | "intent" | "receipt") => typeof value === "string" && value.startsWith(`scv1_${kind}_`) && tipUuid(value.slice(`scv1_${kind}_`.length));
export const newTipRequestId = () => {
  const bytes = new Uint8Array(16); globalThis.crypto.getRandomValues(bytes);
  bytes[6] = (bytes[6] & 15) | 64; bytes[8] = (bytes[8] & 63) | 128;
  const hex = [...bytes].map(byte => byte.toString(16).padStart(2, "0")).join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
};
type Row = Record<string, unknown>;
const row = (value: unknown): value is Row => !!value && typeof value === "object" && !Array.isArray(value);
const keys = (value: Row, required: string[], optional: string[] = []) => required.every(key => Object.hasOwn(value, key)) && Object.keys(value).every(key => required.includes(key) || optional.includes(key));
const isoDate = (value: unknown): value is string => typeof value === "string" && /^\d{4}-\d\d-\d\dT/u.test(value) && Number.isFinite(Date.parse(value));
const integer = (value: unknown): value is number => typeof value === "number" && Number.isSafeInteger(value) && value > 0;
const validCursor = (value: unknown): value is TipCursor | null => value === null || (row(value) && keys(value, ["asOf", "createdAt", "id"]) && isoDate(value.asOf) && isoDate(value.createdAt) && tipUuid(value.id) && Date.parse(value.createdAt) <= Date.parse(value.asOf));
const commandKeys: Record<TipCommand, string[]> = {
  "capability.read": [], "studio.read": ["cursor", "limit"], "offers.read": ["resourceId", "cursor", "limit"], "offer.read": ["offerId"],
  "history.read": ["role", "cursor", "limit"], "status.read": ["intentId", "receiptId"],
  "request.read": ["originalRequestId"], "offer.retire": ["offerId", "expectedRevision"], "checkout.abandon": ["intentId", "originalRequestId"],
};
function validPayload(command: TipCommand, value: unknown): value is Row {
  if (!row(value) || !Object.hasOwn(commandKeys, command) || !keys(value, commandKeys[command])) return false;
  if ("cursor" in value && (!validCursor(value.cursor) || !integer(value.limit) || value.limit > 50)) return false;
  if ("offerId" in value && !tipId(value.offerId, "offer")) return false;
  if ("resourceId" in value && !tipId(value.resourceId, "resource")) return false;
  if ("originalRequestId" in value && !tipUuid(value.originalRequestId)) return false;
  if (command === "history.read" && !["buyer", "creator"].includes(String(value.role))) return false;
  if (command === "status.read") return (value.receiptId === null && tipId(value.intentId, "intent")) || (value.intentId === null && tipId(value.receiptId, "receipt"));
  if (command === "offer.retire") return integer(value.expectedRevision);
  if (command === "checkout.abandon") return tipId(value.intentId, "intent");
  return true;
}

// Data validators below deliberately reject unqualified payment continuations,
// synthetic receipts and unknown fields instead of treating them as success.
export type TipDeclaration = { declared18Plus: boolean; countryCode: string; regionCode: string | null; declarationVersion: "adult-us-creator-v1"; updatedAt: string; sessionId: string };
export type TipOffer = { id: string; resourceId: string; creatorId: string; kind: IsolatedSandboxProductKind; title: string; revision: number; resourceRevision: number; status: "draft" | "published" | "retired"; amountMinor: number; currency: string; createdAt: string; available: boolean; checkoutConnected: false };
export type TipResource = { id: string; creatorId: string; kind: IsolatedSandboxProductKind; title: string; revision: number; status: "draft" | "quarantined" | "published" | "retired"; createdAt: string; offers: TipOffer[]; offersNextCursor: TipCursor | null; offersTruncated: boolean };
export type TipCatalogItem = { kind: "creator_tip"; amountMinor: number; currency: string; publicationAvailable: true; checkoutConnected: false };
export type TipReceipt = { id: string; intentId: string; status: "verified" | "refunded" | "revoked" | "quarantined"; receiptType: "provider_verified"; purchasedAt: string; amountMinor: number; currency: string; grantsAccess: false; notPayable: true };
export type TipAbandonment = { intentId: string; originalRequestId: string; originalSessionId: string; abandonedBySessionId: string; abandonedAt: string; proof: "undispatched_tombstone" };
export type TipAttempt = { id: string; offerId: string; resourceId: string; creatorId: string; kind: IsolatedSandboxProductKind; amountMinor: number; currency: string; status: "prepared" | "expired" | "provider_pending" | "verified" | "failed" | "abandoned"; createdAt: string; expiresAt: string; originalSessionMatchesCurrent: boolean; dispatchState: "not_recorded" | "claimed" | "bound"; receipt: TipReceipt | null; abandonment: TipAbandonment | null; providerDispatchAllowed: false; noDispatchProven: boolean };
export type TipCapability = { generationState: "disabled" | "active" | "retired"; canAuthor: boolean; creatorEligible: boolean; creatorReason: "eligible" | "premium_required" | "creator_eligibility_required" | "creator_legal_required" | "creator_restricted" | "financial_controls_unavailable"; canReadHistory: true; canRetireOwnOffers: true; checkoutConnected: false; declaration: TipDeclaration | null };
export type TipRecovery = { resolution: "found" | "busy" | "unknown"; originalRequestId: string; recordedCommand: string | null; recordedSessionId: string | null; recordedPayload: Row | null; resource: TipResource | null; offer: TipOffer | null; entry: TipAttempt | null; declaration: TipDeclaration | null; retryAllowed: false; noDispatchProven: boolean };
export type TipData = {
  "capability.read": TipCapability;
  "studio.read": { resources: TipResource[]; nextCursor: TipCursor | null; catalog: TipCatalogItem[]; catalogTruncated: boolean };
  "offers.read": { resourceId: string; offers: TipOffer[]; nextCursor: TipCursor | null };
  "offer.read": { offer: TipOffer }; "offer.retire": { offer: TipOffer };
  "history.read": { role: "buyer" | "creator"; items: TipAttempt[]; nextCursor: TipCursor | null };
  "status.read": { entry: TipAttempt }; "request.read": TipRecovery;
  "checkout.abandon": { entry: TipAttempt; abandonment: TipAbandonment; noDispatchProven: true; replacementAllowed: true; retryAllowed: false };
};
export type TipResult<C extends TipCommand> = {
  protocol: "sandbox-commerce-v1"; environment: "sandbox"; command: C; requestId: string; actor: IsolatedSandboxActor;
} & ({ status: "ok"; data: TipData[C] } | { status: "denied" | "held" | "pending"; data: { reason: string } });

const choice = (value: unknown, options: readonly string[]) => typeof value === "string" && options.includes(value);
const title = (value: unknown) => typeof value === "string" && value.trim() === value && value.length > 0 && value.length <= 160;
const currency = (value: unknown) => typeof value === "string" && /^[a-z]{3}$/u.test(value);
const kind = (value: unknown) => choice(value, ISOLATED_SANDBOX_PRODUCT_KINDS);
function declaration(value: unknown): value is TipDeclaration {
  return row(value) && keys(value, ["declared18Plus", "countryCode", "regionCode", "declarationVersion", "updatedAt", "sessionId"])
    && typeof value.declared18Plus === "boolean" && typeof value.countryCode === "string" && /^[A-Z]{2}$/u.test(value.countryCode)
    && (value.regionCode === null || (typeof value.regionCode === "string" && /^[A-Z0-9-]{1,12}$/u.test(value.regionCode)))
    && value.declarationVersion === "adult-us-creator-v1" && isoDate(value.updatedAt) && tipUuid(value.sessionId);
}
function offer(value: unknown): value is TipOffer {
  return row(value) && keys(value, ["id", "resourceId", "creatorId", "kind", "title", "revision", "resourceRevision", "status", "amountMinor", "currency", "createdAt", "available", "checkoutConnected"])
    && tipId(value.id, "offer") && tipId(value.resourceId, "resource") && tipUuid(value.creatorId) && kind(value.kind) && title(value.title)
    && integer(value.revision) && integer(value.resourceRevision) && choice(value.status, ["draft", "published", "retired"])
    && integer(value.amountMinor) && currency(value.currency) && isoDate(value.createdAt) && typeof value.available === "boolean"
    && (!value.available || value.status === "published") && value.checkoutConnected === false;
}
function resource(value: unknown): value is TipResource {
  return row(value) && keys(value, ["id", "creatorId", "kind", "title", "revision", "status", "createdAt", "offers", "offersNextCursor", "offersTruncated"])
    && tipId(value.id, "resource") && tipUuid(value.creatorId) && kind(value.kind) && title(value.title) && integer(value.revision)
    && choice(value.status, ["draft", "quarantined", "published", "retired"]) && isoDate(value.createdAt) && Array.isArray(value.offers)
    && value.offers.every(item => offer(item) && item.resourceId === value.id && item.creatorId === value.creatorId && item.kind === value.kind)
    && pageCursor(value.offersNextCursor, value.offers, { cursor: null, limit: 10 }) && value.offersTruncated === (value.offersNextCursor !== null)
    && (!value.offersTruncated || value.offers.length === 10);
}
function receipt(value: unknown): value is TipReceipt {
  return row(value) && keys(value, ["id", "intentId", "status", "receiptType", "purchasedAt", "amountMinor", "currency", "grantsAccess", "notPayable"])
    && tipId(value.id, "receipt") && tipId(value.intentId, "intent") && choice(value.status, ["verified", "refunded", "revoked", "quarantined"])
    && value.receiptType === "provider_verified" && isoDate(value.purchasedAt) && integer(value.amountMinor) && currency(value.currency)
    && value.grantsAccess === false && value.notPayable === true;
}
function abandonment(value: unknown): value is TipAbandonment {
  return row(value) && keys(value, ["intentId", "originalRequestId", "originalSessionId", "abandonedBySessionId", "abandonedAt", "proof"])
    && tipId(value.intentId, "intent") && tipUuid(value.originalRequestId) && tipUuid(value.originalSessionId) && tipUuid(value.abandonedBySessionId)
    && isoDate(value.abandonedAt) && value.proof === "undispatched_tombstone";
}
function attempt(value: unknown): value is TipAttempt {
  if (!row(value) || !keys(value, ["id", "offerId", "resourceId", "creatorId", "kind", "amountMinor", "currency", "status", "createdAt", "expiresAt", "originalSessionMatchesCurrent", "dispatchState", "receipt", "abandonment", "providerDispatchAllowed", "noDispatchProven"])) return false;
  if (!tipId(value.id, "intent") || !tipId(value.offerId, "offer") || !tipId(value.resourceId, "resource") || !tipUuid(value.creatorId) || !kind(value.kind)
    || !integer(value.amountMinor) || !currency(value.currency) || !choice(value.status, ["prepared", "expired", "provider_pending", "verified", "failed", "abandoned"])
    || !isoDate(value.createdAt) || !isoDate(value.expiresAt) || Date.parse(value.expiresAt) < Date.parse(value.createdAt)
    || typeof value.originalSessionMatchesCurrent !== "boolean" || !choice(value.dispatchState, ["not_recorded", "claimed", "bound"]) || value.providerDispatchAllowed !== false || typeof value.noDispatchProven !== "boolean") return false;
  if (value.receipt !== null && (!receipt(value.receipt) || value.receipt.intentId !== value.id || value.receipt.amountMinor !== value.amountMinor || value.receipt.currency !== value.currency)) return false;
  if (value.abandonment !== null && (!abandonment(value.abandonment) || value.abandonment.intentId !== value.id || value.status !== "abandoned" || value.dispatchState !== "not_recorded" || value.receipt !== null)) return false;
  // Recipient creators see the abandoned state but not the buyer's original
  // Auth session/request identifiers. Only populated exact proof permits true.
  return value.noDispatchProven === (value.abandonment !== null);
}
function pageCursor(value: unknown, items: { id: string; createdAt: string }[], payload: Row) {
  if (!validCursor(value) || items.length > Number(payload.limit) || new Set(items.map(item => item.id)).size !== items.length) return false;
  // Date.parse alone truncates PostgreSQL microseconds. Preserve the fraction
  // when validating stable keyset advancement, including equal-millisecond rows.
  const time = (date: string) => BigInt(Date.parse(date)) * 1_000_000n + BigInt((date.match(/\.(\d+)/u)?.[1] ?? "").padEnd(9, "0").slice(3, 9) || "0");
  const tuple = (item: { id: string; createdAt: string }) => ({ at: time(item.createdAt), id: item.id.slice(item.id.lastIndexOf("_") + 1) });
  let previous = payload.cursor ? tuple(payload.cursor as TipCursor) : null;
  for (const item of items) {
    const next = tuple(item);
    if (previous && (next.at > previous.at || (next.at === previous.at && next.id >= previous.id))) return false;
    if (value && next.at > time(value.asOf)) return false;
    previous = next;
  }
  if (value === null) return true;
  const last = items.at(-1);
  return !!last && value.id === last.id.slice(last.id.lastIndexOf("_") + 1) && value.createdAt === last.createdAt && (!payload.cursor || (value.asOf === (payload.cursor as TipCursor).asOf && (value.id !== (payload.cursor as TipCursor).id || value.createdAt !== (payload.cursor as TipCursor).createdAt)));
}
function recordedPayload(command: unknown, value: unknown, requestId: unknown) {
  if (!row(value) || value.protocol !== "sandbox-commerce-v1" || value.requestId !== requestId) return false;
  const base = ["protocol", "requestId"];
  if (command === "creator.declare") return keys(value, [...base, "declared18Plus", "countryCode", "regionCode", "declarationVersion"])
    && typeof value.declared18Plus === "boolean" && typeof value.countryCode === "string" && /^[A-Z]{2}$/u.test(value.countryCode)
    && (value.regionCode === null || (typeof value.regionCode === "string" && /^[A-Z0-9-]{1,12}$/u.test(value.regionCode))) && value.declarationVersion === "adult-us-creator-v1";
  if (command === "resource.create") return keys(value, [...base, "kind", "title"]) && kind(value.kind) && title(value.title);
  if (command === "offer.publish") return keys(value, [...base, "resourceId", "amountMinor", "currency", "expectedRevision"]) && tipId(value.resourceId, "resource") && integer(value.amountMinor) && currency(value.currency) && integer(value.expectedRevision);
  if (command === "checkout.prepare") return keys(value, [...base, "offerId", "expectedRevision"]) && tipId(value.offerId, "offer") && integer(value.expectedRevision);
  if (command === "offer.retire" || command === "checkout.abandon") { const { protocol: _protocol, requestId: _requestId, ...payload } = value; return validPayload(command, payload); }
  return false;
}
function validData(command: TipCommand, value: unknown, payload: Row, actor: IsolatedSandboxActor): value is Row {
  if (!row(value)) return false;
  if (command === "capability.read") return keys(value, ["generationState", "canAuthor", "creatorEligible", "creatorReason", "canReadHistory", "canRetireOwnOffers", "checkoutConnected", "declaration"])
    && choice(value.generationState, ["disabled", "active", "retired"]) && typeof value.canAuthor === "boolean" && typeof value.creatorEligible === "boolean"
    && choice(value.creatorReason, ["eligible", "premium_required", "creator_eligibility_required", "creator_legal_required", "creator_restricted", "financial_controls_unavailable"])
    && (!value.canAuthor || (value.creatorEligible && value.generationState === "active")) && value.canReadHistory === true && value.canRetireOwnOffers === true && value.checkoutConnected === false && (value.declaration === null || declaration(value.declaration));
  if (command === "studio.read") return keys(value, ["resources", "nextCursor", "catalog", "catalogTruncated"]) && Array.isArray(value.resources)
    && value.resources.every(item => resource(item) && item.creatorId === actor.userId) && pageCursor(value.nextCursor, value.resources, payload)
    && Array.isArray(value.catalog) && value.catalog.length <= 100 && value.catalog.every(item => row(item) && keys(item, ["kind", "amountMinor", "currency", "publicationAvailable", "checkoutConnected"]) && item.kind === "creator_tip" && integer(item.amountMinor) && currency(item.currency) && item.publicationAvailable === true && item.checkoutConnected === false) && typeof value.catalogTruncated === "boolean";
  if (command === "offers.read") return keys(value, ["resourceId", "offers", "nextCursor"]) && value.resourceId === payload.resourceId && tipId(value.resourceId, "resource") && Array.isArray(value.offers)
    && value.offers.every(item => offer(item) && item.resourceId === payload.resourceId && item.creatorId === actor.userId) && pageCursor(value.nextCursor, value.offers, payload);
  if (command === "offer.read" || command === "offer.retire") return keys(value, ["offer"]) && offer(value.offer) && value.offer.id === payload.offerId && (command !== "offer.retire" || (value.offer.creatorId === actor.userId && value.offer.status === "retired" && !value.offer.available));
  if (command === "history.read") return keys(value, ["role", "items", "nextCursor"]) && value.role === payload.role && Array.isArray(value.items)
    && value.items.every(item => attempt(item) && (payload.role !== "creator" || item.creatorId === actor.userId)) && pageCursor(value.nextCursor, value.items, payload);
  if (command === "status.read") return keys(value, ["entry"]) && attempt(value.entry) && (payload.intentId === null ? value.entry.receipt?.id === payload.receiptId : value.entry.id === payload.intentId);
  if (command === "checkout.abandon") return keys(value, ["entry", "abandonment", "noDispatchProven", "replacementAllowed", "retryAllowed"]) && attempt(value.entry) && abandonment(value.abandonment)
    && value.entry.id === payload.intentId && value.abandonment.intentId === payload.intentId && value.abandonment.originalRequestId === payload.originalRequestId
    && value.entry.abandonment !== null && Object.keys(value.abandonment).every(key => value.entry && (value.entry as TipAttempt).abandonment?.[key as keyof TipAbandonment] === (value.abandonment as TipAbandonment)[key as keyof TipAbandonment])
    && value.entry.noDispatchProven && value.noDispatchProven === true && value.replacementAllowed === true && value.retryAllowed === false;
  if (command === "request.read") {
    if (!keys(value, ["resolution", "originalRequestId", "recordedCommand", "recordedSessionId", "recordedPayload", "resource", "offer", "entry", "declaration", "retryAllowed", "noDispatchProven"]) || !choice(value.resolution, ["found", "busy", "unknown"]) || value.originalRequestId !== payload.originalRequestId || value.retryAllowed !== false || typeof value.noDispatchProven !== "boolean") return false;
    if (value.resolution !== "found") return [value.recordedCommand, value.recordedSessionId, value.recordedPayload, value.resource, value.offer, value.entry, value.declaration].every(item => item === null) && value.noDispatchProven === false;
    if (!(tipUuid(value.recordedSessionId) && recordedPayload(value.recordedCommand, value.recordedPayload, value.originalRequestId)
      && (value.resource === null || (resource(value.resource) && value.resource.creatorId === actor.userId))
      && (value.offer === null || (offer(value.offer) && value.offer.creatorId === actor.userId)) && (value.entry === null || attempt(value.entry))
      && (value.declaration === null || declaration(value.declaration)) && value.noDispatchProven === (value.entry !== null && value.entry.noDispatchProven))) return false;
    const original = value.recordedPayload as Row;
    if (value.recordedCommand === "creator.declare") return value.declaration !== null && value.resource === null && value.offer === null && value.entry === null;
    if (value.recordedCommand === "resource.create") return value.resource !== null && value.resource.kind === original.kind && value.offer === null && value.entry === null && value.declaration === null;
    if (value.recordedCommand === "offer.publish") return value.offer !== null && value.offer.resourceId === original.resourceId && value.offer.amountMinor === original.amountMinor && value.offer.currency === original.currency && value.resource === null && value.entry === null && value.declaration === null;
    if (value.recordedCommand === "offer.retire") return value.offer !== null && value.offer.id === original.offerId && value.offer.status === "retired" && !value.offer.available && value.resource === null && value.entry === null && value.declaration === null;
    if (value.recordedCommand === "checkout.prepare") return value.entry !== null && value.entry.offerId === original.offerId && value.resource === null && value.offer === null && value.declaration === null;
    if (value.recordedCommand === "checkout.abandon") return value.entry !== null && value.entry.id === original.intentId && value.entry.abandonment?.originalRequestId === original.originalRequestId && value.entry.noDispatchProven && value.resource === null && value.offer === null && value.declaration === null;
    return false;
  }
  return false;
}
export function parseIsolatedTipResult<C extends TipCommand>(value: unknown, command: C, requestId: string, payload: TipPayloads[C], actor: IsolatedSandboxActor): TipResult<C> {
  const fail = () => { throw new IsolatedSandboxCommerceError("invalid_response", requestId, "unknown"); };
  if (!row(value) || !keys(value, ["protocol", "environment", "command", "requestId", "actor", "status", "data"]) || value.protocol !== "sandbox-commerce-v1" || value.environment !== "sandbox" || value.command !== command || value.requestId !== requestId || !row(value.actor) || !keys(value.actor, ["userId", "accountId", "sessionGeneration"]) || !Object.entries(actor).every(([key, item]) => value.actor && (value.actor as Row)[key] === item)) return fail();
  if (value.status === "ok") { if (!validData(command, value.data, payload as Row, actor)) return fail(); }
  else if (!["denied", "held", "pending"].includes(String(value.status)) || !row(value.data) || !keys(value.data, ["reason"]) || typeof value.data.reason !== "string" || !/^[a-z][a-z0-9_]{0,159}$/u.test(value.data.reason)) return fail();
  const deepFreeze = (item: unknown): unknown => { if (item && typeof item === "object") { Object.values(item).forEach(deepFreeze); Object.freeze(item); } return item; };
  return deepFreeze(value) as TipResult<C>;
}
export type IsolatedTipClient = {
  actor: Readonly<IsolatedSandboxActor>; dispose(): void;
  request<C extends TipCommand>(command: C, requestId: string, payload: TipPayloads[C]): Promise<TipResult<C>>;
  author<C extends TipMutation>(command: C, requestId: string, payload: IsolatedSandboxPayloads[C]): Promise<IsolatedSandboxResult<C>>;
};
export async function captureIsolatedTipClient(expected: AccountSessionAuthorityBinding): Promise<IsolatedTipClient> {
  if (!tipUuid(expected?.userId) || !tipUuid(expected.sessionGeneration) || expected.accountId !== expected.userId || expected.restoreOnly || !sameAccountSessionAuthority(expected, getCurrentAccountSessionAuthoritySnapshot())) throw new IsolatedSandboxCommerceError("authority_retired", null, "not_dispatched");
  const authority = Object.freeze({ ...expected }); let retired = false;
  const unsubscribe = subscribeToAccountSessionAuthority(current => { if (!sameAccountSessionAuthority(authority, current)) retired = true; });
  const assertCurrent = (requestId: string | null, dispatched = false) => { if (retired || !sameAccountSessionAuthority(authority, getCurrentAccountSessionAuthoritySnapshot())) throw new IsolatedSandboxCommerceError("authority_retired", requestId, dispatched ? "unknown" : "not_dispatched"); };
  let captured: Awaited<ReturnType<typeof captureAccountBoundSupabaseMutationSubject>>;
  let commerce: Awaited<ReturnType<typeof captureIsolatedSandboxCommerceClient>> | undefined;
  try {
    captured = await captureAccountBoundSupabaseMutationSubject(authority.userId, { waitForReadSettlement: true });
    if (!sameAccountSessionAuthority(authority, captured.authority)) retired = true;
    assertCurrent(null); commerce = await captureIsolatedSandboxCommerceClient(authority); assertCurrent(null);
  } catch { commerce?.dispose(); unsubscribe(); throw new IsolatedSandboxCommerceError("authority_retired", null, "not_dispatched"); }
  const boundCommerce = commerce;
  const actor = Object.freeze({ userId: authority.userId, accountId: authority.accountId, sessionGeneration: authority.sessionGeneration });
  const pending = new Set<string>(); const bodies = new Map<string, string>();
  return Object.freeze({ actor,
    dispose() { retired = true; unsubscribe(); boundCommerce.dispose(); },
    async author<C extends TipMutation>(command: C, requestId: string, payload: IsolatedSandboxPayloads[C]) { assertCurrent(requestId); const result = await boundCommerce.request<C>(command, requestId, payload); assertCurrent(requestId, true); return result; },
    async request<C extends TipCommand>(command: C, requestId: string, payload: TipPayloads[C]): Promise<TipResult<C>> {
      if (!tipUuid(requestId) || !validPayload(command, payload)) throw new IsolatedSandboxCommerceError("invalid_request", requestId, "not_dispatched");
      assertCurrent(requestId);
      const body: Row = { protocol: "sandbox-commerce-v1", requestId }; for (const key of commandKeys[command]) body[key] = (payload as Row)[key];
      const fingerprint = JSON.stringify([command, body]);
      if (pending.has(requestId) || (bodies.has(requestId) && bodies.get(requestId) !== fingerprint)) throw new IsolatedSandboxCommerceError("request_conflict", requestId, "not_dispatched");
      bodies.set(requestId, fingerprint); pending.add(requestId);
      try {
        const response = await invokeAccountBoundSupabaseRpc({ supabaseUrl: SUPABASE_URL, anonKey: SUPABASE_ANON_KEY, accessToken: captured.accessToken, functionName: ISOLATED_TIPS_RPC, clientPlatform: Platform.OS, args: { p_command: command, p_payload: body, p_expected_account_id: actor.accountId, p_expected_session_generation: actor.sessionGeneration } });
        assertCurrent(requestId, true);
        if (response.error) throw new IsolatedSandboxCommerceError("outcome_unknown", requestId, "unknown");
        return parseIsolatedTipResult(response.data, command, requestId, payload, actor);
      } catch (error) { assertCurrent(requestId, true); if (error instanceof IsolatedSandboxCommerceError) throw error; throw new IsolatedSandboxCommerceError("outcome_unknown", requestId, "unknown"); }
      finally { pending.delete(requestId); }
    },
  });
}
