import { Platform } from "react-native";
import "react-native-get-random-values";
import { captureAccountBoundSupabaseMutationSubject } from "./accountBoundSupabaseMutation";
import { getCurrentAccountSessionAuthoritySnapshot, sameAccountSessionAuthority, subscribeToAccountSessionAuthority, type AccountSessionAuthorityBinding } from "./accountSessionAuthority";
import { SUPABASE_ANON_KEY, SUPABASE_URL } from "./supabase";
import { testStoreDigest, testStoreUuid } from "./isolatedTestStoreContract";
import { sameTestStoreV3Quote, validTestStoreV3Quote, testStoreV3Date, testStoreV3Id, type TestStoreV3Quote } from "./isolatedTestStoreV3Contract";

export const PAID_VIDEO_CHECKOUT_V3_PROTOCOL = "isolated-paid-video-checkout-v3" as const;
export type PaidVideoCheckoutV3Payloads = {
  offer: { offerId: string };
  prepare: { offerId: string; expectedQuote: TestStoreV3Quote };
  recover: { originalRequestId: string };
  history: { limit: number; cursor: string | null };
  abandon: { originalRequestId: string; originalSessionId: string; intentId: string; expectedQuote: TestStoreV3Quote };
  close_prepared: { customerBindingId: string; intentId: string; dispatchId: string; registrationId: string; originalSessionId: string; expectedReservationRevision: number; expectedQuote: TestStoreV3Quote };
  recover_close_prepared: { originalRequestId: string };
  resolve_playback: { intentId: string };
};
export type PaidVideoCheckoutV3Command = keyof PaidVideoCheckoutV3Payloads;
export type PaidVideoCheckoutV3Intent = Readonly<{ id: string; state: "prepared" | "provider_pending" | "verified" | "failed" | "expired";
  quote: TestStoreV3Quote; createdAt: string; expiresAt: string; receipt: null | { id: string; state: "verified" | "refunded" | "revoked" | "quarantined"; purchasedAt: string; originalTransactionId: string };
  grantId: string | null; dispatchAllowed: false; accessRequiresCurrentAuthorization: true; notPayable: true }>;
export type PaidVideoCheckoutV3Closure = Readonly<{ id: string; originalRequestId: string; originalSessionId: string; configurationDigest: string; closedAt: string;
  kind: "unallocated_preparation"; allocationAbsent: true; dispatchAbsent: true }>;
export type PaidVideoUnclaimedAllocationClosure = Readonly<{ id: string; kind: "unclaimed_allocation"; customerBindingId: string; allocationId: string;
  dispatchId: string; registrationId: string; originalSessionId: string; configurationDigest: string;
  previousReservationRevision: number; releasedReservationRevision: number; closedAt: string; claimAbsent: true }>;
export type PaidVideoCheckoutV3Data = {
  offer: { quote: TestStoreV3Quote; preparationAllowed: boolean };
  prepare: { intent: PaidVideoCheckoutV3Intent; replayed: boolean };
  recover: { originalRequestId: string; originalSessionId: string; originalPayload: PaidVideoCheckoutV3Payloads["prepare"]; intent: PaidVideoCheckoutV3Intent };
  history: { intents: PaidVideoCheckoutV3Intent[]; nextCursor: string | null };
  abandon: { intent: PaidVideoCheckoutV3Intent; closure: PaidVideoCheckoutV3Closure; replayed: boolean };
  close_prepared: { intent: PaidVideoCheckoutV3Intent; closure: PaidVideoUnclaimedAllocationClosure; replayed: boolean };
  recover_close_prepared: { originalRequestId: string; originalSessionId: string; originalPayload: PaidVideoCheckoutV3Payloads["close_prepared"];
    intent: PaidVideoCheckoutV3Intent; closure: PaidVideoUnclaimedAllocationClosure };
  resolve_playback: { intent: PaidVideoCheckoutV3Intent; currentGrantId: string | null; accessRequiresCurrentAuthorization: true };
};
export type PaidVideoCheckoutV3Actor = Readonly<{ userId: string; sessionId: string }>;
export type PaidVideoCheckoutV3Result<C extends PaidVideoCheckoutV3Command = PaidVideoCheckoutV3Command> = Readonly<{
  protocol: typeof PAID_VIDEO_CHECKOUT_V3_PROTOCOL; command: C; requestId: string; actor: PaidVideoCheckoutV3Actor;
  providerDispatchAllowed: false; grantsAccess: false; financialAuthority: false; notPayable: true;
}> & ({ status: "ok"; data: PaidVideoCheckoutV3Data[C] } | { status: "unknown"; data: { originalRequestId: string; intent: null; closure?: null } });
export class PaidVideoCheckoutV3Error extends Error {
  constructor(readonly code: "invalid_request" | "invalid_response" | "authority_retired" | "outcome_unknown", readonly requestId: string | null,
    readonly outcome: "not_sent" | "unknown") { super(`Paid Video checkout v3: ${code}.`); }
}
export function newPaidVideoCheckoutV3RequestId(): string {
  const bytes = new Uint8Array(16); globalThis.crypto.getRandomValues(bytes); bytes[6] = (bytes[6] & 15) | 64; bytes[8] = (bytes[8] & 63) | 128;
  const hex = Array.from(bytes, n => n.toString(16).padStart(2, "0")).join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}
type Row = Record<string, unknown>;
const row = (value: unknown): value is Row => !!value && typeof value === "object" && !Array.isArray(value);
const keys = (value: unknown, expected: readonly string[]): value is Row => row(value) && Object.keys(value).sort().join(",") === [...expected].sort().join(",");
const choice = (value: unknown, values: readonly string[]) => typeof value === "string" && values.includes(value);
const id = (value: unknown, kind: string): value is string => typeof value === "string" && value.startsWith(`scv1_${kind}_`) && testStoreUuid(value.slice(`scv1_${kind}_`.length));
const text = (value: unknown): value is string => typeof value === "string" && value.length > 0 && value.length <= 200 && value.trim() === value && !/[\u0000-\u001f\u007f]/u.test(value);
const micros = (value: string) => BigInt(Date.parse(value)) * 1000n + BigInt((/\.(\d{1,6})/u.exec(value)?.[1] ?? "").padEnd(6, "0").slice(3));
function freeze<T>(value: T): T { if (value && typeof value === "object") { Object.values(value).forEach(freeze); Object.freeze(value); } return value; }
const snapshot = <T,>(value: T): T => freeze(JSON.parse(JSON.stringify(value)) as T);
export function validPaidVideoCheckoutV3Payload(command: unknown, value: unknown): boolean {
  if (command === "offer") return keys(value, ["offerId"]) && id(value.offerId, "offer");
  if (command === "prepare") return keys(value, ["offerId", "expectedQuote"]) && id(value.offerId, "offer") && validTestStoreV3Quote(value.expectedQuote) && value.expectedQuote.offerId === value.offerId;
  if (command === "recover" || command === "recover_close_prepared") return keys(value, ["originalRequestId"]) && testStoreUuid(value.originalRequestId);
  if (command === "resolve_playback") return keys(value, ["intentId"]) && id(value.intentId, "intent");
  if (command === "close_prepared") return keys(value, ["customerBindingId", "intentId", "dispatchId", "registrationId", "originalSessionId", "expectedReservationRevision", "expectedQuote"])
    && testStoreV3Id(value.customerBindingId, "customer") && id(value.intentId, "intent") && testStoreUuid(value.dispatchId)
    && testStoreV3Id(value.registrationId, "registration") && testStoreUuid(value.originalSessionId)
    && typeof value.expectedReservationRevision === "number" && Number.isSafeInteger(value.expectedReservationRevision)
    && value.expectedReservationRevision > 0 && value.expectedReservationRevision < Number.MAX_SAFE_INTEGER && validTestStoreV3Quote(value.expectedQuote);
  if (command === "abandon") return keys(value, ["originalRequestId", "originalSessionId", "intentId", "expectedQuote"])
    && testStoreUuid(value.originalRequestId) && testStoreUuid(value.originalSessionId) && id(value.intentId, "intent") && validTestStoreV3Quote(value.expectedQuote);
  return command === "history" && keys(value, ["limit", "cursor"]) && typeof value.limit === "number" && Number.isSafeInteger(value.limit)
    && value.limit >= 1 && value.limit <= 25 && (value.cursor === null || id(value.cursor, "intent"));
}
function assert(condition: unknown): asserts condition { if (!condition) throw new PaidVideoCheckoutV3Error("invalid_response", null, "unknown"); }
export function parsePaidVideoCheckoutV3Closure(value: unknown, expected: { originalRequestId: string; originalSessionId: string; configurationDigest: string }): PaidVideoCheckoutV3Closure {
  assert(keys(value, ["id", "originalRequestId", "originalSessionId", "configurationDigest", "closedAt", "kind", "allocationAbsent", "dispatchAbsent"])
    && testStoreUuid(value.id) && value.originalRequestId === expected.originalRequestId && value.originalSessionId === expected.originalSessionId
    && value.configurationDigest === expected.configurationDigest && testStoreV3Date(value.closedAt) && value.kind === "unallocated_preparation"
    && value.allocationAbsent === true && value.dispatchAbsent === true);
  return snapshot(value as unknown as PaidVideoCheckoutV3Closure);
}
export function parsePaidVideoUnclaimedAllocationClosure(value: unknown, expected: PaidVideoCheckoutV3Payloads["close_prepared"], configurationDigest: string): PaidVideoUnclaimedAllocationClosure {
  assert(validPaidVideoCheckoutV3Payload("close_prepared", expected) && testStoreDigest(configurationDigest)
    && keys(value, ["id", "kind", "customerBindingId", "allocationId", "dispatchId", "registrationId", "originalSessionId", "configurationDigest", "previousReservationRevision", "releasedReservationRevision", "closedAt", "claimAbsent"])
    && testStoreUuid(value.id) && value.kind === "unclaimed_allocation" && value.customerBindingId === expected.customerBindingId
    && testStoreV3Id(value.allocationId, "allocation") && value.dispatchId === expected.dispatchId && value.registrationId === expected.registrationId
    && value.originalSessionId === expected.originalSessionId && value.configurationDigest === configurationDigest
    && value.previousReservationRevision === expected.expectedReservationRevision && value.releasedReservationRevision === expected.expectedReservationRevision + 1
    && testStoreV3Date(value.closedAt) && value.claimAbsent === true);
  return snapshot(value as unknown as PaidVideoUnclaimedAllocationClosure);
}
export function parsePaidVideoCheckoutV3Intent(value: unknown): PaidVideoCheckoutV3Intent {
  assert(keys(value, ["id", "state", "quote", "createdAt", "expiresAt", "receipt", "grantId", "dispatchAllowed", "accessRequiresCurrentAuthorization", "notPayable"])
    && id(value.id, "intent") && choice(value.state, ["prepared", "provider_pending", "verified", "failed", "expired"])
    && validTestStoreV3Quote(value.quote) && testStoreV3Date(value.createdAt) && testStoreV3Date(value.expiresAt) && micros(value.expiresAt) > micros(value.createdAt)
    && value.dispatchAllowed === false && value.accessRequiresCurrentAuthorization === true && value.notPayable === true);
  assert(value.receipt === null || keys(value.receipt, ["id", "state", "purchasedAt", "originalTransactionId"])
    && id(value.receipt.id, "receipt") && choice(value.receipt.state, ["verified", "refunded", "revoked", "quarantined"])
    && testStoreV3Date(value.receipt.purchasedAt) && text(value.receipt.originalTransactionId));
  assert(value.grantId === null || id(value.grantId, "grant") && value.receipt !== null);
  return snapshot(value as unknown as PaidVideoCheckoutV3Intent);
}
export function parsePaidVideoCheckoutV3Result<C extends PaidVideoCheckoutV3Command>(value: unknown, expected: {
  command: C; requestId: string; actor: PaidVideoCheckoutV3Actor; configurationDigest: string; payload: PaidVideoCheckoutV3Payloads[C];
}): PaidVideoCheckoutV3Result<C> {
  assert(validPaidVideoCheckoutV3Payload(expected.command, expected.payload) && testStoreUuid(expected.requestId) && testStoreDigest(expected.configurationDigest)
    && testStoreUuid(expected.actor.userId) && testStoreUuid(expected.actor.sessionId));
  assert(keys(value, ["protocol", "command", "requestId", "actor", "status", "data", "providerDispatchAllowed", "grantsAccess", "financialAuthority", "notPayable"])
    && value.protocol === PAID_VIDEO_CHECKOUT_V3_PROTOCOL && value.command === expected.command && value.requestId === expected.requestId
    && keys(value.actor, ["userId", "sessionId"]) && value.actor.userId === expected.actor.userId && value.actor.sessionId === expected.actor.sessionId
    && value.providerDispatchAllowed === false && value.grantsAccess === false && value.financialAuthority === false && value.notPayable === true);
  const data = value.data, payload = expected.payload as Row;
  if (value.status === "unknown") {
    assert((expected.command === "recover" && keys(data, ["originalRequestId", "intent"])
      || expected.command === "recover_close_prepared" && keys(data, ["originalRequestId", "intent", "closure"]) && data.closure === null)
      && data.originalRequestId === payload.originalRequestId && data.intent === null);
  } else {
    assert(value.status === "ok");
    if (expected.command === "offer") assert(keys(data, ["quote", "preparationAllowed"]) && validTestStoreV3Quote(data.quote) && data.quote.offerId === payload.offerId && typeof data.preparationAllowed === "boolean");
    else if (expected.command === "prepare") {
      assert(keys(data, ["intent", "replayed"]) && typeof data.replayed === "boolean"); const intent = parsePaidVideoCheckoutV3Intent(data.intent);
      assert(validTestStoreV3Quote(payload.expectedQuote) && sameTestStoreV3Quote(intent.quote, payload.expectedQuote) && intent.quote.creatorId !== expected.actor.userId);
    } else if (expected.command === "recover") {
      assert(keys(data, ["originalRequestId", "originalSessionId", "originalPayload", "intent"]) && data.originalRequestId === payload.originalRequestId
        && testStoreUuid(data.originalSessionId) && validPaidVideoCheckoutV3Payload("prepare", data.originalPayload));
      const intent = parsePaidVideoCheckoutV3Intent(data.intent), original = data.originalPayload as PaidVideoCheckoutV3Payloads["prepare"];
      assert(sameTestStoreV3Quote(intent.quote, original.expectedQuote) && intent.quote.creatorId !== expected.actor.userId);
    } else if (expected.command === "abandon") {
      assert(keys(data, ["intent", "closure", "replayed"]) && typeof data.replayed === "boolean");
      const intent = parsePaidVideoCheckoutV3Intent(data.intent), original = expected.payload as PaidVideoCheckoutV3Payloads["abandon"];
      const closure = parsePaidVideoCheckoutV3Closure(data.closure, { ...original, configurationDigest: expected.configurationDigest });
      assert(intent.id === original.intentId && sameTestStoreV3Quote(intent.quote, original.expectedQuote) && intent.quote.creatorId !== expected.actor.userId
        && intent.state === "expired" && intent.receipt === null && intent.grantId === null && micros(closure.closedAt) >= micros(intent.createdAt));
    } else if (expected.command === "resolve_playback") {
      assert(keys(data, ["intent", "currentGrantId", "accessRequiresCurrentAuthorization"]) && data.accessRequiresCurrentAuthorization === true
        && (data.currentGrantId === null || id(data.currentGrantId, "grant")));
      const intent = parsePaidVideoCheckoutV3Intent(data.intent);
      assert(intent.id === payload.intentId && intent.quote.creatorId !== expected.actor.userId);
    } else if (expected.command === "close_prepared" || expected.command === "recover_close_prepared") {
      const recovery = expected.command === "recover_close_prepared";
      assert(keys(data, recovery ? ["originalRequestId", "originalSessionId", "originalPayload", "intent", "closure"] : ["intent", "closure", "replayed"]));
      if (recovery) assert(data.originalRequestId === payload.originalRequestId && testStoreUuid(data.originalSessionId) && validPaidVideoCheckoutV3Payload("close_prepared", data.originalPayload));
      else assert(typeof data.replayed === "boolean");
      const original = (recovery ? data.originalPayload : expected.payload) as PaidVideoCheckoutV3Payloads["close_prepared"];
      const closure = parsePaidVideoUnclaimedAllocationClosure(data.closure, original, expected.configurationDigest), intent = parsePaidVideoCheckoutV3Intent(data.intent);
      assert(intent.id === original.intentId && sameTestStoreV3Quote(intent.quote, original.expectedQuote) && intent.quote.creatorId !== expected.actor.userId
        && intent.state === "expired" && intent.receipt === null && intent.grantId === null && micros(closure.closedAt) >= micros(intent.createdAt));
    } else {
      assert(keys(data, ["intents", "nextCursor"]) && Array.isArray(data.intents) && data.intents.length <= Number(payload.limit));
      const intents = data.intents.map(parsePaidVideoCheckoutV3Intent); assert(new Set(intents.map(i => i.id)).size === intents.length);
      assert(intents.every(i => i.quote.creatorId !== expected.actor.userId && i.id !== payload.cursor));
      for (let n = 1; n < intents.length; n++) assert(micros(intents[n - 1].createdAt) > micros(intents[n].createdAt)
        || micros(intents[n - 1].createdAt) === micros(intents[n].createdAt) && intents[n - 1].id > intents[n].id);
      assert(data.nextCursor === null || intents.length === payload.limit && data.nextCursor === intents.at(-1)?.id);
    }
  }
  return snapshot(value as unknown as PaidVideoCheckoutV3Result<C>);
}

export async function capturePaidVideoCheckoutV3Client(authority: AccountSessionAuthorityBinding, configurationDigest: string) {
  if (!authority || authority.restoreOnly || authority.userId !== authority.accountId || !testStoreUuid(authority.userId) || !testStoreUuid(authority.sessionGeneration)
    || !testStoreDigest(configurationDigest) || !sameAccountSessionAuthority(authority, getCurrentAccountSessionAuthoritySnapshot())) throw new PaidVideoCheckoutV3Error("authority_retired", null, "not_sent");
  const expected = Object.freeze({ ...authority }); let retired = false;
  const unsubscribe = subscribeToAccountSessionAuthority(value => { if (!sameAccountSessionAuthority(expected, value)) retired = true; });
  const current = (requestId: string | null, sent = false) => { if (retired || !sameAccountSessionAuthority(expected, getCurrentAccountSessionAuthoritySnapshot())) throw new PaidVideoCheckoutV3Error("authority_retired", requestId, sent ? "unknown" : "not_sent"); };
  let captured: Awaited<ReturnType<typeof captureAccountBoundSupabaseMutationSubject>>;
  try { captured = await captureAccountBoundSupabaseMutationSubject(expected.userId, { waitForReadSettlement: true });
    if (!sameAccountSessionAuthority(expected, captured.authority)) retired = true; current(null); }
  catch { unsubscribe(); throw new PaidVideoCheckoutV3Error("authority_retired", null, "not_sent"); }
  const actor = Object.freeze({ userId: expected.userId, sessionId: expected.sessionGeneration }), used = new Set<string>();
  return Object.freeze({ actor, configurationDigest, dispose() { retired = true; unsubscribe(); },
    async request<C extends PaidVideoCheckoutV3Command>(command: C, requestId: string, payload: PaidVideoCheckoutV3Payloads[C]): Promise<PaidVideoCheckoutV3Result<C>> {
      const mutation = command === "prepare" || command === "abandon" || command === "close_prepared";
      if (!testStoreUuid(requestId) || !validPaidVideoCheckoutV3Payload(command, payload) || mutation && used.has(requestId)) throw new PaidVideoCheckoutV3Error("invalid_request", requestId, "not_sent");
      current(requestId); const fields = snapshot(payload); if (mutation) used.add(requestId);
      try { const response = await fetch(`${SUPABASE_URL.replace(/\/+$/u, "")}/functions/v1/isolated-paid-video-checkout-v3`, {
        method: "POST", headers: { Authorization: `Bearer ${captured.accessToken}`, apikey: SUPABASE_ANON_KEY, "Content-Type": "application/json", "x-chillywood-platform": Platform.OS },
        body: JSON.stringify({ protocol: PAID_VIDEO_CHECKOUT_V3_PROTOCOL, command, requestId, expectedSessionId: actor.sessionId, configurationDigest, payload: fields }),
      }); current(requestId, true); if (!response.ok) throw new Error("unconfirmed"); const value: unknown = await response.json(); current(requestId, true);
      return parsePaidVideoCheckoutV3Result(value, { command, requestId, actor, configurationDigest, payload: fields }); }
      catch { current(requestId, true); throw new PaidVideoCheckoutV3Error("outcome_unknown", requestId, "unknown"); }
    },
  });
}
export type PaidVideoCheckoutV3Client = Awaited<ReturnType<typeof capturePaidVideoCheckoutV3Client>>;
