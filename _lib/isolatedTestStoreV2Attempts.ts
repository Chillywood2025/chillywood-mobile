import AsyncStorage from "@react-native-async-storage/async-storage";
import { sameTestStoreQuote, testStoreDigest, testStoreUuid, validTestStoreQuote, type TestStoreQuote } from "./isolatedTestStoreContract";
import {
  parseIsolatedTestStoreV2Result, sameTestStoreV2Allocation, sameTestStoreV2Customer,
  testStoreV2Id,
  validTestStoreV2Allocation, validTestStoreV2Customer, validTestStoreV2NativeInvocation, validTestStoreV2Payload,
  type TestStoreV2Allocation, type TestStoreV2Command, type TestStoreV2Customer, type TestStoreV2NativeInvocation,
  type TestStoreV2Payloads, type TestStoreV2Receipt, type TestStoreV2Reservation, type TestStoreV2Result,
} from "./isolatedTestStoreV2Contract";

/** V2 is a separate installation journal. This key and its owner are never
 * cleared by advance, receipt confirmation, cancellation or a new Auth session. */
export const ISOLATED_TEST_STORE_V2_JOURNAL_KEY = "@chillywood/isolated-test-store-v2/installation-journal";
export type TestStoreV2AttemptStorage = { getItem(key: string): Promise<string | null>; setItem(key: string, value: string): Promise<unknown> };
type Mutation = Exclude<TestStoreV2Command, "read">;
export type TestStoreV2JournalRequest = {
  protocol: "isolated-test-store-v2"; command: TestStoreV2Command; requestId: string;
  expectedSessionId: string; configurationDigest: string; payload: TestStoreV2Payloads[TestStoreV2Command];
};
type Operation = { request: TestStoreV2JournalRequest; state: "prepared" | "unknown" | "observed"; response: TestStoreV2Result | null };
type Observation = { request: TestStoreV2JournalRequest; response: TestStoreV2Result };
type SavedAttempt = {
  allocationRequestId: string; sessionId: string; intentId: string; quote: TestStoreQuote;
  operations: Operation[]; allocation: TestStoreV2Allocation | null;
  observation: Observation | null; receiptObservation: Observation | null;
  nativePhase: "unprepared" | "reserved" | "invoking" | "unknown" | "completed";
  nativeInvocation: TestStoreV2NativeInvocation | null; recoveryGeneration: number;
};
type Document = {
  version: 2; userId: string; installationId: string; configurationDigest: string;
  customer: TestStoreV2Customer | null; reservation: TestStoreV2Reservation | null;
  bindingOperations: Operation[]; bindingObservation: Observation | null; attempts: SavedAttempt[];
};
export type TestStoreV2JournalObservation = {
  command: TestStoreV2Command; requestId: string; sessionId: string;
  status: TestStoreV2Result["result"]["status"]; reason: string;
  customer: TestStoreV2Customer | null; allocation: TestStoreV2Allocation | null;
  reservation: TestStoreV2Reservation | null; receipt: TestStoreV2Receipt | null;
};
export type IsolatedTestStoreV2Attempt = {
  allocationRequestId: string; sessionId: string; intentId: string; quote: TestStoreQuote;
  operations: { command: TestStoreV2Command; requestId: string; sessionId: string; state: Operation["state"] }[];
  allocation: TestStoreV2Allocation | null; observation: TestStoreV2JournalObservation | null;
  receiptObservation: TestStoreV2JournalObservation | null; nativePhase: SavedAttempt["nativePhase"];
  nativeInvocation: TestStoreV2NativeInvocation | null;
  /** Only initiation was released. An old purchase can remain unknown. */
  initiationReleased: boolean;
};
export type TestStoreV2JournalSend = (request: Readonly<TestStoreV2JournalRequest>) => Promise<unknown>;
export type TestStoreV2ReadInvocation = (dispatchId: string) => Promise<unknown>;
export type TestStoreV2Purchase = (call: (customer: Readonly<TestStoreV2Customer>, allocation: Readonly<TestStoreV2Allocation>, claim: Readonly<TestStoreV2Result>) => Promise<unknown>) => Promise<IsolatedTestStoreV2Attempt>;
type ErrorCode = "invalid_request" | "invalid_response" | "storage_unavailable" | "storage_corrupt" | "owner_conflict"
  | "request_conflict" | "attempt_missing" | "phase_unavailable" | "capability_consumed" | "authority_expired"
  | "outcome_unknown" | "native_completion_required" | "unknown_acknowledgement_required";
export class IsolatedTestStoreV2JournalError extends Error {
  constructor(readonly code: ErrorCode) { super(`Isolated Test Store v2 journal: ${code}.`); this.name = "IsolatedTestStoreV2JournalError"; }
}
const fail = (code: ErrorCode): never => { throw new IsolatedTestStoreV2JournalError(code); };
type Row = Record<string, unknown>;
const row = (v: unknown): v is Row => !!v && typeof v === "object" && !Array.isArray(v);
const keys = (v: Row, names: readonly string[]) => Object.keys(v).length === names.length && names.every(k => Object.hasOwn(v, k));
const choice = (v: unknown, names: readonly string[]) => typeof v === "string" && names.includes(v);
const freeze = <T>(v: T): T => { if (v && typeof v === "object") { Object.values(v).forEach(freeze); Object.freeze(v); } return v; };
const copy = <T>(v: T): T => JSON.parse(JSON.stringify(v)) as T;
const snapshot = <T>(v: T): T => freeze(copy(v));
const canonical = (v: unknown) => JSON.stringify(v, (_k, x: unknown) => row(x) ? Object.fromEntries(Object.keys(x).sort().map(k => [k, x[k]])) : x);
const same = (a: unknown, b: unknown) => canonical(a) === canonical(b);
const sameAllocationBase = (a: TestStoreV2Allocation, b: TestStoreV2Allocation) => sameTestStoreV2Allocation({ ...a, registration: null }, { ...b, registration: null });
const negative = (r: TestStoreV2Receipt | null | undefined) => !!r && r.state !== "verified";
const sameReceipt = (a: TestStoreV2Receipt, b: TestStoreV2Receipt) => a.id === b.id && a.providerTransactionId === b.providerTransactionId
  && a.originalTransactionId === b.originalTransactionId && a.purchasedAt === b.purchasedAt;
const queues = new Map<string, Promise<void>>();
async function serialized<T>(operation: () => Promise<T>) {
  const key = ISOLATED_TEST_STORE_V2_JOURNAL_KEY, previous = queues.get(key) ?? Promise.resolve();
  let release!: () => void; const current = new Promise<void>(resolve => { release = resolve; });
  queues.set(key, current); await previous;
  try { return await operation(); } finally { release(); if (queues.get(key) === current) queues.delete(key); }
}
function project(o: Observation | null): TestStoreV2JournalObservation | null {
  if (!o) return null;
  const { status, reason, customer, allocation, reservation, receipt } = o.response.result;
  return { command: o.response.command, requestId: o.response.requestId, sessionId: o.response.actor.sessionId, status, reason, customer, allocation, reservation, receipt };
}
function publicAttempt(a: SavedAttempt, d: Document): IsolatedTestStoreV2Attempt {
  const initiationReleased = a.nativePhase === "completed" && !!a.allocation && !!d.reservation
    && d.bindingObservation?.response.result.status !== "held" && a.observation?.response.result.status !== "held" && d.reservation.activeAllocationId !== a.allocation.id
    && a.operations.some(o => o.state !== "prepared" && o.request.command === "advance"
      && d.reservation!.revision > (o.request.payload as TestStoreV2Payloads["advance"]).expectedReservationRevision);
  return snapshot({ allocationRequestId: a.allocationRequestId, sessionId: a.sessionId, intentId: a.intentId, quote: a.quote,
    operations: a.operations.map(o => ({ command: o.request.command, requestId: o.request.requestId, sessionId: o.request.expectedSessionId, state: o.state })),
    allocation: a.allocation, observation: project(a.observation), receiptObservation: project(a.receiptObservation), nativePhase: a.nativePhase, nativeInvocation: a.nativeInvocation, initiationReleased });
}

export function createIsolatedTestStoreV2AttemptJournal({ userId, installationId, configurationDigest, storage = AsyncStorage, now = Date.now }: {
  userId: string; installationId: string; configurationDigest: string; storage?: TestStoreV2AttemptStorage; now?: () => number;
}) {
  if (!testStoreUuid(userId) || !testStoreUuid(installationId) || !testStoreDigest(configurationDigest) || typeof now !== "function") return fail("invalid_request");
  const owned = (d: Document) => d.userId === userId && d.installationId === installationId && d.configurationDigest === configurationDigest;
  const before = (deadline: string, maxAhead?: number) => { const time = now(); return Number.isFinite(time) && time < Date.parse(deadline)
    && (maxAhead === undefined || Date.parse(deadline) - time <= maxAhead); };
  const operations = (d: Document) => [...d.bindingOperations, ...d.attempts.flatMap(a => a.operations)];
  const findAttempt = (d: Document, id: string) => d.attempts.find(a => a.allocation?.id === id || a.intentId === id || a.allocationRequestId === id) ?? fail("attempt_missing");
  function parse(request: TestStoreV2JournalRequest, response: unknown) {
    try { return copy(parseIsolatedTestStoreV2Result(response, { command: request.command, requestId: request.requestId,
      actor: { userId, sessionId: request.expectedSessionId }, configurationDigest, payload: request.payload })); }
    catch { return fail("invalid_response"); }
  }
  function validRequest(v: unknown): v is TestStoreV2JournalRequest {
    return row(v) && keys(v, ["protocol", "command", "requestId", "expectedSessionId", "configurationDigest", "payload"])
      && v.protocol === "isolated-test-store-v2" && testStoreUuid(v.requestId) && testStoreUuid(v.expectedSessionId)
      && v.configurationDigest === configurationDigest && validTestStoreV2Payload(v.command as TestStoreV2Command, v.payload);
  }
  function matchesNative(d: Document, a: SavedAttempt, v: unknown): v is TestStoreV2NativeInvocation {
    const c = d.customer, x = a.allocation, claim = a.operations.find(o => o.request.command === "claim");
    return validTestStoreV2NativeInvocation(v) && !!c && !!x?.registration && !!claim
      && v.invocationId === x.dispatchId && v.customerBindingId === c.id && v.installationId === installationId
      && v.buyerId === userId && v.configurationDigest === configurationDigest && v.providerAppUserId === c.providerAppUserId
      && v.allocationId === x.id && v.registrationId === x.registration.id && v.sessionId === claim.request.expectedSessionId;
  }
  function adopt(d: Document, a: SavedAttempt | null, observation: Observation) {
    const r = observation.response.result;
    if (r.customer) {
      if (r.customer.installationId !== installationId || (d.customer && !sameTestStoreV2Customer(d.customer, r.customer))) return fail("invalid_response");
      d.customer ??= r.customer;
    }
    if (r.reservation) {
      if (d.reservation?.revision === r.reservation.revision && d.reservation.activeAllocationId !== r.reservation.activeAllocationId) return fail("invalid_response");
      if (!d.reservation || r.reservation.revision > d.reservation.revision) d.reservation = r.reservation;
    }
    if (!a) {
      const previous = d.bindingObservation;
      const priorIntent = previous && ("intentId" in previous.request.payload ? previous.request.payload.intentId : previous.response.result.allocation?.intentId);
      const nextIntent = "intentId" in observation.request.payload ? observation.request.payload.intentId : r.allocation?.intentId;
      const priorReceipt = previous?.response.result.receipt;
      if (priorIntent && priorIntent === nextIntent && priorReceipt && r.receipt && !sameReceipt(priorReceipt, r.receipt)) return fail("invalid_response");
      const stickyNegative = priorIntent === nextIntent && negative(priorReceipt) && !negative(r.receipt) && r.status !== "held";
      if ((previous?.response.result.status !== "held" || r.status === "held") && !stickyNegative) d.bindingObservation = observation;
      return;
    }
    if (r.allocation) {
      if (r.allocation.intentId !== a.intentId || !sameTestStoreQuote(r.allocation.quote, a.quote)
        || (a.allocation && (!sameAllocationBase(a.allocation, r.allocation)
          || (a.allocation.registration && r.allocation.registration && !sameTestStoreV2Allocation(a.allocation, r.allocation))))) return fail("invalid_response");
      if (!a.allocation || (!a.allocation.registration && r.allocation.registration)) a.allocation = r.allocation;
    }
    const oldReceipt = a.receiptObservation?.response.result.receipt;
    if (oldReceipt && r.receipt && !sameReceipt(oldReceipt, r.receipt)) return fail("invalid_response");
    const previous = a.observation?.response.result;
    const stickyHold = previous?.status === "held" && r.status !== "held";
    const stalePositive = negative(oldReceipt) && !negative(r.receipt);
    if (!stickyHold && !stalePositive) a.observation = observation;
    if (r.receipt && !(negative(oldReceipt) && !negative(r.receipt))) a.receiptObservation = observation;
  }
  function validate(d: unknown): Document {
    if (!row(d) || !keys(d, ["version", "userId", "installationId", "configurationDigest", "customer", "reservation", "bindingOperations", "bindingObservation", "attempts"])
      || d.version !== 2 || !testStoreUuid(d.userId) || !testStoreUuid(d.installationId) || !testStoreDigest(d.configurationDigest)
      || !Array.isArray(d.bindingOperations) || !Array.isArray(d.attempts) || d.bindingOperations.length > 64 || d.attempts.length > 128) return fail("storage_corrupt");
    const value = d as Document;
    // Foreign data is redacted and cannot be adopted. Its permanent owner marker
    // still fences any mutation, even if its private payload is unreadable here.
    if (!owned(value)) return value;
    if (value.customer && (!validTestStoreV2Customer(value.customer) || value.customer.buyerId !== userId
      || value.customer.configurationDigest !== configurationDigest || value.customer.installationId !== installationId)) return fail("storage_corrupt");
    if (value.reservation && (!row(value.reservation) || !keys(value.reservation, ["revision", "activeAllocationId"])
      || !Number.isSafeInteger(value.reservation.revision) || value.reservation.revision < 1
      || (value.reservation.activeAllocationId !== null && !testStoreV2Id(value.reservation.activeAllocationId, "allocation")))) return fail("storage_corrupt");
    if (!!value.customer !== !!value.reservation) return fail("storage_corrupt");
    const requestIds = new Set<string>(), intents = new Set<string>();
    for (const op of operations(value)) {
      if (!row(op) || !keys(op, ["request", "state", "response"]) || !validRequest(op.request) || op.request.command === "read"
        || !choice(op.state, ["prepared", "unknown", "observed"]) || requestIds.has(op.request.requestId)
        || ((op.state === "observed") !== (op.response !== null))) return fail("storage_corrupt");
      requestIds.add(op.request.requestId);
      if (op.response) {
        try { parse(op.request, op.response); } catch { return fail("storage_corrupt"); }
        if (op.response.result.customer && (!value.customer || !sameTestStoreV2Customer(value.customer, op.response.result.customer))) return fail("storage_corrupt");
      }
    }
    if (value.bindingOperations.some(o => o.request.command !== "bind" || (o.request.payload as TestStoreV2Payloads["bind"]).installationId !== installationId)) return fail("storage_corrupt");
    if (value.bindingObservation) {
      const o = value.bindingObservation;
      if (!row(o) || !keys(o, ["request", "response"]) || !validRequest(o.request) || !["bind", "read"].includes(o.request.command)) return fail("storage_corrupt");
      try { parse(o.request, o.response); } catch { return fail("storage_corrupt"); }
      if (o.response.result.customer && (!value.customer || !sameTestStoreV2Customer(value.customer, o.response.result.customer))) return fail("storage_corrupt");
      if (o.request.command === "bind" && !value.bindingOperations.some(op => same(op.request, o.request) && same(op.response, o.response))) return fail("storage_corrupt");
    }
    for (const a of value.attempts) {
      if (!row(a) || !keys(a, ["allocationRequestId", "sessionId", "intentId", "quote", "operations", "allocation", "observation", "receiptObservation", "nativePhase", "nativeInvocation", "recoveryGeneration"])
        || !testStoreUuid(a.allocationRequestId) || !testStoreUuid(a.sessionId) || !validTestStoreQuote(a.quote) || a.quote.currency !== "usd"
        || !validTestStoreV2Payload("read", { intentId: a.intentId }) || intents.has(a.intentId) || a.quote.creatorId === userId
        || !Array.isArray(a.operations) || a.operations.length < 1 || a.operations.length > 64
        || !choice(a.nativePhase, ["unprepared", "reserved", "invoking", "unknown", "completed"])
        || !Number.isSafeInteger(a.recoveryGeneration) || a.recoveryGeneration < 0) return fail("storage_corrupt");
      intents.add(a.intentId);
      const first = a.operations[0];
      if (first.request.command !== "allocate" || first.request.requestId !== a.allocationRequestId || first.request.expectedSessionId !== a.sessionId
        || a.operations.some(o => o.request.command === "bind" || !("intentId" in o.request.payload) || o.request.payload.intentId !== a.intentId)
        || a.operations.filter(o => o.request.command === "claim").length > 1) return fail("storage_corrupt");
      if (a.allocation && (!validTestStoreV2Allocation(a.allocation) || a.allocation.intentId !== a.intentId
        || a.allocation.configurationDigest !== configurationDigest || a.allocation.customerBindingId !== value.customer?.id
        || !sameTestStoreQuote(a.allocation.quote, a.quote))) return fail("storage_corrupt");
      for (const op of a.operations) {
        const p = op.request.payload;
        if (("expectedQuote" in p && !sameTestStoreQuote(p.expectedQuote, a.quote))
          || ("dispatchId" in p && p.dispatchId !== a.allocation?.dispatchId)
          || ("customerBindingId" in p && p.customerBindingId !== value.customer?.id)
          || ("registrationId" in p && p.registrationId !== a.allocation?.registration?.id)) return fail("storage_corrupt");
        const x = op.response?.result.allocation;
        if (x && (!a.allocation || !sameAllocationBase(a.allocation, x)
          || (x.registration && !sameTestStoreV2Allocation(a.allocation, x)))) return fail("storage_corrupt");
      }
      for (const o of [a.observation, a.receiptObservation]) {
        if (!o) continue;
        if (!row(o) || !keys(o, ["request", "response"]) || !validRequest(o.request)) return fail("storage_corrupt");
        try { parse(o.request, o.response); } catch { return fail("storage_corrupt"); }
        if (!("intentId" in o.request.payload) || o.request.payload.intentId !== a.intentId
          || (o.response.result.customer && (!value.customer || !sameTestStoreV2Customer(value.customer, o.response.result.customer)))
          || (o.response.result.allocation && (!a.allocation || !sameAllocationBase(a.allocation, o.response.result.allocation)
            || (o.response.result.allocation.registration && !sameTestStoreV2Allocation(a.allocation, o.response.result.allocation))))) return fail("storage_corrupt");
        if (o.request.command !== "read" && !a.operations.some(op => same(op.request, o.request) && same(op.response, o.response))) return fail("storage_corrupt");
      }
      if (a.receiptObservation && !a.receiptObservation.response.result.receipt) return fail("storage_corrupt");
      const retained = a.receiptObservation?.response.result.receipt, shown = a.observation?.response.result.receipt;
      if ((retained && shown && !sameReceipt(retained, shown)) || (negative(retained) && a.observation?.response.result.status === "verified")) return fail("storage_corrupt");
      if (a.nativeInvocation && !matchesNative(value, a, a.nativeInvocation)) return fail("storage_corrupt");
      if ((a.nativePhase === "completed") !== (a.nativeInvocation?.state === "completed")
        || (a.nativePhase !== "unprepared" && !a.operations.some(o => o.request.command === "claim"))) return fail("storage_corrupt");
    }
    return value;
  }
  async function read() {
    let raw: string | null; try { raw = await storage.getItem(ISOLATED_TEST_STORE_V2_JOURNAL_KEY); } catch { return fail("storage_unavailable"); }
    if (raw === null) return null;
    try { if (raw.length > 1_500_000) return fail("storage_corrupt"); return validate(JSON.parse(raw)); } catch { return fail("storage_corrupt"); }
  }
  async function current() { const d = await read(); if (!d) return fail("attempt_missing"); if (!owned(d)) return fail("owner_conflict"); return d; }
  async function write(d: Document) {
    const raw = JSON.stringify(d); if (raw.length > 1_500_000) return fail("storage_unavailable");
    try { await storage.setItem(ISOLATED_TEST_STORE_V2_JOURNAL_KEY, raw); if (await storage.getItem(ISOLATED_TEST_STORE_V2_JOURNAL_KEY) !== raw) return fail("storage_unavailable"); }
    catch { return fail("storage_unavailable"); }
  }
  function request<C extends Mutation>(command: C, requestId: string, sessionId: string, payload: TestStoreV2Payloads[C]): TestStoreV2JournalRequest {
    if (!testStoreUuid(requestId) || !testStoreUuid(sessionId) || !validTestStoreV2Payload(command, payload)) return fail("invalid_request");
    return copy({ protocol: "isolated-test-store-v2", command, requestId, expectedSessionId: sessionId, configurationDigest, payload });
  }
  const owner = (d: Document) => snapshot({ reserved: true, ownedByCurrentScope: owned(d), customer: owned(d) ? d.customer : null,
    reservation: owned(d) ? d.reservation : null, bindingObservation: owned(d) ? project(d.bindingObservation) : null });
  function nativeCompleted(d: Document, a: SavedAttempt, v: unknown) {
    if (!matchesNative(d, a, v) || v.state !== "completed") return fail("native_completion_required");
    if (a.nativeInvocation?.state === "completed" && !same(a.nativeInvocation, v)) return fail("invalid_response");
    a.nativeInvocation = copy(v); a.nativePhase = "completed";
  }
  function purchaseCapability(id: string, claim: TestStoreV2Result, recoveryGeneration: number): TestStoreV2Purchase {
    let consumed = false;
    return async call => {
      if (consumed) return fail("capability_consumed"); consumed = true;
      const captured = await serialized(async () => {
        const d = await current(), a = findAttempt(d, id);
        if (a.nativePhase !== "reserved" || a.recoveryGeneration !== recoveryGeneration || !d.customer || !a.allocation
          || d.bindingObservation?.response.result.status === "held" || d.reservation?.activeAllocationId !== a.allocation.id || a.observation?.response.result.status === "held") return fail("phase_unavailable");
        if (!claim.result.authorityValidUntil || !before(claim.result.authorityValidUntil, 5_000)) return fail("authority_expired");
        a.nativePhase = "invoking"; await write(d);
        if (!before(claim.result.authorityValidUntil, 5_000)) return fail("authority_expired");
        return { customer: snapshot(d.customer), allocation: snapshot(a.allocation) };
      });
      let invocation: unknown;
      try { invocation = await call(captured.customer, captured.allocation, snapshot(claim)); } catch { invocation = null; }
      return serialized(async () => {
        const d = await current(), a = findAttempt(d, id);
        if (matchesNative(d, a, invocation) && invocation.state === "completed") nativeCompleted(d, a, invocation);
        else if (a.nativePhase !== "completed") a.nativePhase = "unknown";
        await write(d); return publicAttempt(a, d);
      });
    };
  }
  async function prepare(d: Document, a: SavedAttempt | null, r: TestStoreV2JournalRequest) {
    const existing = operations(d).find(o => o.request.requestId === r.requestId);
    if (existing) {
      if (!same(existing.request, r)) return fail("request_conflict");
      return { mayExecute: false, request: snapshot(existing.request), execute: null };
    }
    if ((a ? a.operations : d.bindingOperations).length >= 64) return fail("storage_unavailable");
    const op: Operation = { request: r, state: "prepared", response: null };
    (a ? a.operations : d.bindingOperations).push(op); await write(d);
    let consumed = false;
    const execute = async (send: TestStoreV2JournalSend) => {
      if (consumed) return fail("capability_consumed"); consumed = true;
      const generation = await serialized(async () => {
        const latest = await current(), attempt = a ? findAttempt(latest, a.intentId) : null;
        const stored = operations(latest).find(o => o.request.requestId === r.requestId);
        if (!stored || stored.state !== "prepared") return fail("phase_unavailable");
        if (["allocate", "claim", "advance"].includes(r.command) && latest.bindingObservation?.response.result.status === "held") return fail("phase_unavailable");
        if (attempt && r.command === "claim" && (!attempt.allocation || attempt.observation?.response.result.status !== "offering_ready"
          || latest.reservation?.activeAllocationId !== attempt.allocation.id || !before(attempt.allocation.acceptPurchaseUntil))) return fail("phase_unavailable");
        if (attempt && r.command === "advance" && (latest.reservation?.activeAllocationId !== attempt.allocation?.id
          || latest.reservation?.revision !== (r.payload as TestStoreV2Payloads["advance"]).expectedReservationRevision
          || attempt.observation?.response.result.status === "held")) return fail("phase_unavailable");
        stored.state = "unknown"; await write(latest);
        if (attempt?.allocation && r.command === "claim" && !before(attempt.allocation.acceptPurchaseUntil)) return fail("authority_expired");
        return attempt?.recoveryGeneration ?? 0;
      });
      let raw: unknown; try { raw = await send(snapshot(r)); } catch { return fail("outcome_unknown"); }
      const response = parse(r, raw);
      return serialized(async () => {
        const latest = await current(), attempt = a ? findAttempt(latest, a.intentId) : null;
        const stored = operations(latest).find(o => o.request.requestId === r.requestId)!;
        stored.response = response; stored.state = "observed";
        adopt(latest, attempt, { request: r, response });
        const freshClaim = attempt && r.command === "claim" && response.result.dispatchAllowed && response.result.authorityValidUntil
          && before(response.result.authorityValidUntil, 5_000) && attempt.recoveryGeneration === generation
          && latest.bindingObservation?.response.result.status !== "held" && attempt.observation?.response.result.status !== "held";
        if (freshClaim) attempt.nativePhase = "reserved";
        await write(latest);
        return { owner: owner(latest), attempt: attempt ? publicAttempt(attempt, latest) : null,
          purchase: freshClaim ? purchaseCapability(attempt.intentId, snapshot(response), generation) : null };
      });
    };
    return { mayExecute: true, request: snapshot(r), execute };
  }
  return Object.freeze({
    async readOwner() { return serialized(async () => { const d = await read(); return d ? owner(d) : { reserved: false, ownedByCurrentScope: false, customer: null, reservation: null, bindingObservation: null }; }); },
    async list() { return serialized(async () => { const d = await read(); return d && owned(d) ? d.attempts.map(a => publicAttempt(a, d)) : []; }); },
    async prepareBinding({ requestId, sessionId }: { requestId: string; sessionId: string }) {
      return serialized(async () => {
        const existing = await read(); if (existing && !owned(existing)) return fail("owner_conflict");
        const d = existing ?? { version: 2 as const, userId, installationId, configurationDigest, customer: null, reservation: null, bindingOperations: [], bindingObservation: null, attempts: [] };
        return prepare(d, null, request("bind", requestId, sessionId, { installationId }));
      });
    },
    async prepareAllocation({ requestId, sessionId, intentId, quote }: { requestId: string; sessionId: string; intentId: string; quote: TestStoreQuote }) {
      return serialized(async () => {
        const d = await current(); if (!d.customer) return fail("phase_unavailable");
        const r = request("allocate", requestId, sessionId, { customerBindingId: d.customer.id, intentId, expectedQuote: quote });
        const old = d.attempts.find(a => a.intentId === intentId);
        if (old) { if (old.allocationRequestId !== requestId) return fail("request_conflict"); return prepare(d, old, r); }
        if (d.bindingObservation?.response.result.status === "held" || d.reservation?.activeAllocationId !== null
          || d.attempts.some(a => !publicAttempt(a, d).initiationReleased)) return fail("phase_unavailable");
        if (quote.currency !== "usd" || quote.creatorId === userId || d.attempts.length >= 128) return fail("invalid_request");
        const a: SavedAttempt = { allocationRequestId: requestId, sessionId, intentId, quote: copy(quote), operations: [], allocation: null,
          observation: null, receiptObservation: null, nativePhase: "unprepared", nativeInvocation: null, recoveryGeneration: 0 };
        d.attempts.push(a); return prepare(d, a, r);
      });
    },
    async prepareClaim({ requestId, sessionId, allocationId }: { requestId: string; sessionId: string; allocationId: string }) {
      return serialized(async () => {
        const d = await current(), a = findAttempt(d, allocationId), x = a.allocation;
        if (!x?.registration || d.bindingObservation?.response.result.status === "held") return fail("phase_unavailable");
        const r = request("claim", requestId, sessionId, { intentId: a.intentId, dispatchId: x.dispatchId, registrationId: x.registration.id, expectedQuote: a.quote });
        if (a.operations.some(o => o.request.command === "claim" && o.request.requestId !== requestId)) return fail("phase_unavailable");
        if (!operations(d).some(o => o.request.requestId === requestId) && (a.observation?.response.result.status !== "offering_ready"
          || d.reservation?.activeAllocationId !== x.id || !before(x.acceptPurchaseUntil))) return fail("phase_unavailable");
        return prepare(d, a, r);
      });
    },
    async reconcile({ requestId, sessionId, payload }: { requestId: string; sessionId: string; payload: TestStoreV2Payloads["read"] }, response: unknown) {
      const r: TestStoreV2JournalRequest = copy({ protocol: "isolated-test-store-v2", command: "read", requestId, expectedSessionId: sessionId, configurationDigest, payload });
      const parsed = parse(r, response);
      return serialized(async () => { const d = await current(), a = findAttempt(d, (r.payload as TestStoreV2Payloads["read"]).intentId); a.recoveryGeneration++;
        adopt(d, a, { request: r, response: parsed }); await write(d); return publicAttempt(a, d); });
    },
    /** Untracked server history can be displayed after bind recovery. It never
     * fabricates an original request/session or constructs a SavedAttempt. */
    async reconcileBinding({ requestId, sessionId, payload }: { requestId: string; sessionId: string; payload: TestStoreV2Payloads["read"] }, response: unknown) {
      const r: TestStoreV2JournalRequest = copy({ protocol: "isolated-test-store-v2", command: "read", requestId, expectedSessionId: sessionId, configurationDigest, payload });
      const parsed = parse(r, response);
      return serialized(async () => { const d = await current(); if (!d.customer) return fail("phase_unavailable");
        adopt(d, null, { request: r, response: parsed }); await write(d); return owner(d); });
    },
    async reconcileNative(allocationId: string, readInvocation: TestStoreV2ReadInvocation) {
      const dispatch = await serialized(async () => { const d = await current(), a = findAttempt(d, allocationId); return a.allocation?.dispatchId ?? fail("phase_unavailable"); });
      const value = await readInvocation(dispatch);
      return serialized(async () => { const d = await current(), a = findAttempt(d, allocationId); nativeCompleted(d, a, value); await write(d); return publicAttempt(a, d); });
    },
    async prepareReport({ requestId, sessionId, allocationId }: { requestId: string; sessionId: string; allocationId: string }) {
      return serialized(async () => { const d = await current(), a = findAttempt(d, allocationId), n = a.nativeInvocation;
        if (!n || n.state !== "completed" || !a.allocation || n.outcome === null) return fail("native_completion_required");
        if (a.operations.some(o => o.request.command === "report" && o.request.requestId !== requestId)) return fail("phase_unavailable");
        return prepare(d, a, request("report", requestId, sessionId, { intentId: a.intentId, dispatchId: a.allocation.dispatchId, outcome: n.outcome, transactionHint: n.transactionHint })); });
    },
    async prepareAdvance({ requestId, sessionId, allocationId, expectedReservationRevision, acknowledgeUnknownOutcome }: {
      requestId: string; sessionId: string; allocationId: string; expectedReservationRevision: number; acknowledgeUnknownOutcome: boolean;
    }, readInvocation: TestStoreV2ReadInvocation) {
      const dispatch = await serialized(async () => { const d = await current(), a = findAttempt(d, allocationId); return a.allocation?.dispatchId ?? fail("phase_unavailable"); });
      const value = await readInvocation(dispatch);
      return serialized(async () => {
        const d = await current(), a = findAttempt(d, allocationId); nativeCompleted(d, a, value);
        if (!a.allocation || d.bindingObservation?.response.result.status === "held" || d.reservation?.activeAllocationId !== a.allocation.id || d.reservation.revision !== expectedReservationRevision
          || a.observation?.response.result.status === "held") return fail("phase_unavailable");
        const receipt = a.observation?.response.result.receipt;
        if (!receipt && acknowledgeUnknownOutcome !== true) return fail("unknown_acknowledgement_required");
        const claim = a.operations.find(o => o.request.command === "claim")?.response;
        if (claim?.result.authorityValidUntil && before(claim.result.authorityValidUntil)) return fail("authority_expired");
        return prepare(d, a, request("advance", requestId, sessionId, { intentId: a.intentId, dispatchId: a.allocation.dispatchId,
          expectedReservationRevision, disposition: receipt ? "receipt_recorded" : "retain_unknown", expectedReceiptId: receipt?.id ?? null }));
      });
    },
  });
}
