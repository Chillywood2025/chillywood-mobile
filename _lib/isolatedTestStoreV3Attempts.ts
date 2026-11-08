import AsyncStorage from "@react-native-async-storage/async-storage";
import { parseClosedPaidVideoCheckoutV3Attempt, type PaidVideoCheckoutV3Attempt } from "./isolatedPaidVideoCheckoutV3Attempts";
import { testStoreDigest, testStoreUuid } from "./isolatedTestStoreContract";
import { parseClosedTestStoreV3PreparedAttempt, type TestStoreV3PreparedCloseAttempt } from "./isolatedTestStoreV3PreparedClosures";
import {
  sameTestStoreV3Quote, validTestStoreV3Quote, type TestStoreV3Quote,
  parseIsolatedTestStoreV3Result, sameTestStoreV3Allocation, sameTestStoreV3Customer,
  testStoreV3Id,
  validTestStoreV3Allocation, validTestStoreV3Customer, validTestStoreV3NativeInvocation, validTestStoreV3NativePreparedClosure, validTestStoreV3Payload,
  type TestStoreV3Allocation, type TestStoreV3Command, type TestStoreV3Customer, type TestStoreV3NativeInvocation, type TestStoreV3NativePreparedClosure,
  type TestStoreV3Payloads, type TestStoreV3Receipt, type TestStoreV3Reservation, type TestStoreV3Result,
} from "./isolatedTestStoreV3Contract";

/** V3 is a separate installation journal. This key and its owner are never
 * cleared by advance, receipt confirmation, cancellation or a new Auth session. */
export const ISOLATED_TEST_STORE_V3_JOURNAL_KEY = "@chillywood/isolated-test-store-v3/installation-journal";
export type TestStoreV3AttemptStorage = { getItem(key: string): Promise<string | null>; setItem(key: string, value: string): Promise<unknown> };
type Mutation = Exclude<TestStoreV3Command, "read">;
export type TestStoreV3JournalRequest = {
  protocol: "isolated-test-store-v3"; command: TestStoreV3Command; requestId: string;
  expectedSessionId: string; configurationDigest: string; payload: TestStoreV3Payloads[TestStoreV3Command];
};
type Operation = { request: TestStoreV3JournalRequest; state: "prepared" | "unknown" | "observed"; response: TestStoreV3Result | null };
type Observation = { request: TestStoreV3JournalRequest; response: TestStoreV3Result };
type SavedAttempt = {
  allocationRequestId: string; sessionId: string; intentId: string; quote: TestStoreV3Quote;
  operations: Operation[]; allocation: TestStoreV3Allocation | null;
  observation: Observation | null; receiptObservation: Observation | null;
  nativePhase: "unprepared" | "prepared" | "reserved" | "invoking" | "unknown" | "completed" | "prepared_closed";
  nativeInvocation: TestStoreV3NativeInvocation | null; recoveryGeneration: number;
  nativePreparedClosure: TestStoreV3NativePreparedClosure | null; preparedRelease: TestStoreV3PreparedCloseAttempt | null;
  unallocatedRelease: PaidVideoCheckoutV3Attempt | null;
};
type Document = {
  version: 3; userId: string; installationId: string; configurationDigest: string;
  customer: TestStoreV3Customer | null; reservation: TestStoreV3Reservation | null;
  bindingOperations: Operation[]; bindingObservation: Observation | null; attempts: SavedAttempt[];
};
export type TestStoreV3JournalObservation = {
  command: TestStoreV3Command; requestId: string; sessionId: string;
  status: TestStoreV3Result["result"]["status"]; reason: string;
  customer: TestStoreV3Customer | null; allocation: TestStoreV3Allocation | null;
  reservation: TestStoreV3Reservation | null; receipt: TestStoreV3Receipt | null;
};
export type IsolatedTestStoreV3Attempt = {
  allocationRequestId: string; sessionId: string; intentId: string; quote: TestStoreV3Quote;
  operations: { command: TestStoreV3Command; requestId: string; sessionId: string; state: Operation["state"] }[];
  allocation: TestStoreV3Allocation | null; observation: TestStoreV3JournalObservation | null;
  receiptObservation: TestStoreV3JournalObservation | null; nativePhase: SavedAttempt["nativePhase"];
  nativeInvocation: TestStoreV3NativeInvocation | null;
  nativePreparedClosure: TestStoreV3NativePreparedClosure | null;
  /** Only initiation was released. An old purchase can remain unknown. */
  initiationReleased: boolean;
};
export type TestStoreV3JournalSend = (request: Readonly<TestStoreV3JournalRequest>) => Promise<unknown>;
export type TestStoreV3ReadInvocation = (dispatchId: string) => Promise<unknown>;
export type TestStoreV3Purchase = (call: (customer: Readonly<TestStoreV3Customer>, allocation: Readonly<TestStoreV3Allocation>, claim: Readonly<TestStoreV3Result>) => Promise<unknown>) => Promise<IsolatedTestStoreV3Attempt>;
type ErrorCode = "invalid_request" | "invalid_response" | "storage_unavailable" | "storage_corrupt" | "owner_conflict"
  | "request_conflict" | "attempt_missing" | "phase_unavailable" | "capability_consumed" | "authority_expired"
  | "outcome_unknown" | "native_completion_required" | "unknown_acknowledgement_required";
export class IsolatedTestStoreV3JournalError extends Error {
  constructor(readonly code: ErrorCode) { super(`Isolated Test Store v3 journal: ${code}.`); this.name = "IsolatedTestStoreV3JournalError"; }
}
const fail = (code: ErrorCode): never => { throw new IsolatedTestStoreV3JournalError(code); };
type Row = Record<string, unknown>;
const row = (v: unknown): v is Row => !!v && typeof v === "object" && !Array.isArray(v);
const keys = (v: Row, names: readonly string[]) => Object.keys(v).length === names.length && names.every(k => Object.hasOwn(v, k));
const choice = (v: unknown, names: readonly string[]) => typeof v === "string" && names.includes(v);
const freeze = <T>(v: T): T => { if (v && typeof v === "object") { Object.values(v).forEach(freeze); Object.freeze(v); } return v; };
const copy = <T>(v: T): T => JSON.parse(JSON.stringify(v)) as T;
const snapshot = <T>(v: T): T => freeze(copy(v));
const canonical = (v: unknown) => JSON.stringify(v, (_k, x: unknown) => row(x) ? Object.fromEntries(Object.keys(x).sort().map(k => [k, x[k]])) : x);
const same = (a: unknown, b: unknown) => canonical(a) === canonical(b);
const sameAllocationBase = (a: TestStoreV3Allocation, b: TestStoreV3Allocation) => sameTestStoreV3Allocation({ ...a, registration: null }, { ...b, registration: null });
const negative = (r: TestStoreV3Receipt | null | undefined) => !!r && r.state !== "verified";
const sameReceipt = (a: TestStoreV3Receipt, b: TestStoreV3Receipt) => a.id === b.id && a.providerTransactionId === b.providerTransactionId
  && a.originalTransactionId === b.originalTransactionId && a.purchasedAt === b.purchasedAt;
const queues = new Map<string, Promise<void>>();
let persistenceFailed = false;
async function serialized<T>(operation: () => Promise<T>) {
  const key = ISOLATED_TEST_STORE_V3_JOURNAL_KEY, previous = queues.get(key) ?? Promise.resolve();
  let release!: () => void; const current = new Promise<void>(resolve => { release = resolve; });
  queues.set(key, current); await previous;
  try { return await operation(); } finally { release(); if (queues.get(key) === current) queues.delete(key); }
}
function project(o: Observation | null): TestStoreV3JournalObservation | null {
  if (!o) return null;
  const { status, reason, customer, allocation, reservation, receipt } = o.response.result;
  return { command: o.response.command, requestId: o.response.requestId, sessionId: o.response.actor.sessionId, status, reason, customer, allocation, reservation, receipt };
}
function publicAttempt(a: SavedAttempt, d: Document): IsolatedTestStoreV3Attempt {
  const continuation = a.operations.some(o => o.state !== "prepared" && o.request.command === "advance"
    && !!d.reservation && d.reservation.revision > (o.request.payload as TestStoreV3Payloads["advance"]).expectedReservationRevision);
  const preparedRelease = a.preparedRelease?.observation?.response;
  const closedUnclaimed = preparedRelease?.status === "ok" && !!d.reservation && d.reservation.revision >= preparedRelease.data.closure.releasedReservationRevision;
  const initiationReleased = !!a.unallocatedRelease && d.bindingObservation?.response.result.status !== "held" && a.observation?.response.result.status !== "held"
    || (a.nativePhase === "completed" || a.nativePhase === "prepared_closed") && !!a.allocation && !!d.reservation
    && d.bindingObservation?.response.result.status !== "held" && a.observation?.response.result.status !== "held" && d.reservation.activeAllocationId !== a.allocation.id
    && (continuation || closedUnclaimed);
  return snapshot({ allocationRequestId: a.allocationRequestId, sessionId: a.sessionId, intentId: a.intentId, quote: a.quote,
    operations: a.operations.map(o => ({ command: o.request.command, requestId: o.request.requestId, sessionId: o.request.expectedSessionId, state: o.state })),
    allocation: a.allocation, observation: project(a.observation), receiptObservation: project(a.receiptObservation), nativePhase: a.nativePhase, nativeInvocation: a.nativeInvocation,
    nativePreparedClosure: a.nativePreparedClosure, initiationReleased });
}

export function createIsolatedTestStoreV3AttemptJournal({ userId, installationId, configurationDigest, storage = AsyncStorage, now = Date.now }: {
  userId: string; installationId: string; configurationDigest: string; storage?: TestStoreV3AttemptStorage; now?: () => number;
}) {
  if (!testStoreUuid(userId) || !testStoreUuid(installationId) || !testStoreDigest(configurationDigest) || typeof now !== "function") return fail("invalid_request");
  const owned = (d: Document) => d.userId === userId && d.installationId === installationId && d.configurationDigest === configurationDigest;
  const before = (deadline: string, maxAhead?: number) => { const time = now(); return Number.isFinite(time) && time < Date.parse(deadline)
    && (maxAhead === undefined || Date.parse(deadline) - time <= maxAhead); };
  const operations = (d: Document) => [...d.bindingOperations, ...d.attempts.flatMap(a => a.operations)];
  const findAttempt = (d: Document, id: string) => d.attempts.find(a => a.allocation?.id === id || a.intentId === id || a.allocationRequestId === id) ?? fail("attempt_missing");
  function parse(request: TestStoreV3JournalRequest, response: unknown) {
    try { return copy(parseIsolatedTestStoreV3Result(response, { command: request.command, requestId: request.requestId,
      actor: { userId, sessionId: request.expectedSessionId }, configurationDigest, payload: request.payload })); }
    catch { return fail("invalid_response"); }
  }
  function validRequest(v: unknown): v is TestStoreV3JournalRequest {
    return row(v) && keys(v, ["protocol", "command", "requestId", "expectedSessionId", "configurationDigest", "payload"])
      && v.protocol === "isolated-test-store-v3" && testStoreUuid(v.requestId) && testStoreUuid(v.expectedSessionId)
      && v.configurationDigest === configurationDigest && validTestStoreV3Payload(v.command as TestStoreV3Command, v.payload);
  }
  function matchesNative(d: Document, a: SavedAttempt, v: unknown): v is TestStoreV3NativeInvocation {
    const c = d.customer, x = a.allocation, claim = a.operations.find(o => o.request.command === "claim");
    return validTestStoreV3NativeInvocation(v) && !!c && !!x?.registration && (v.state === "prepared" || !!claim)
      && v.invocationId === x.dispatchId && v.customerBindingId === c.id && v.installationId === installationId
      && v.buyerId === userId && v.configurationDigest === configurationDigest && v.providerAppUserId === c.providerAppUserId
      && v.allocationId === x.id && v.registrationId === x.registration.id && v.sessionId === a.sessionId
      && (!claim || v.sessionId === claim.request.expectedSessionId) && sameTestStoreV3Quote(v.quote, a.quote);
  }
  function adopt(d: Document, a: SavedAttempt | null, observation: Observation) {
    const r = observation.response.result;
    if (r.customer) {
      if (r.customer.installationId !== installationId || (d.customer && !sameTestStoreV3Customer(d.customer, r.customer))) return fail("invalid_response");
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
      if (a.unallocatedRelease) return fail("invalid_response");
      if (r.allocation.intentId !== a.intentId || !sameTestStoreV3Quote(r.allocation.quote, a.quote)
        || (a.allocation && (!sameAllocationBase(a.allocation, r.allocation)
          || (a.allocation.registration && r.allocation.registration && !sameTestStoreV3Allocation(a.allocation, r.allocation))))) return fail("invalid_response");
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
      || d.version !== 3 || !testStoreUuid(d.userId) || !testStoreUuid(d.installationId) || !testStoreDigest(d.configurationDigest)
      || !Array.isArray(d.bindingOperations) || !Array.isArray(d.attempts) || d.bindingOperations.length > 64 || d.attempts.length > 128) return fail("storage_corrupt");
    const value = d as Document;
    // Foreign data is redacted and cannot be adopted. Its permanent owner marker
    // still fences any mutation, even if its private payload is unreadable here.
    if (!owned(value)) return value;
    if (value.customer && (!validTestStoreV3Customer(value.customer) || value.customer.buyerId !== userId
      || value.customer.configurationDigest !== configurationDigest || value.customer.installationId !== installationId)) return fail("storage_corrupt");
    if (value.reservation && (!row(value.reservation) || !keys(value.reservation, ["revision", "activeAllocationId"])
      || !Number.isSafeInteger(value.reservation.revision) || value.reservation.revision < 1
      || (value.reservation.activeAllocationId !== null && !testStoreV3Id(value.reservation.activeAllocationId, "allocation")))) return fail("storage_corrupt");
    if (!!value.customer !== !!value.reservation) return fail("storage_corrupt");
    const requestIds = new Set<string>(), intents = new Set<string>();
    for (const op of operations(value)) {
      if (!row(op) || !keys(op, ["request", "state", "response"]) || !validRequest(op.request) || op.request.command === "read"
        || !choice(op.state, ["prepared", "unknown", "observed"]) || requestIds.has(op.request.requestId)
        || ((op.state === "observed") !== (op.response !== null))) return fail("storage_corrupt");
      requestIds.add(op.request.requestId);
      if (op.response) {
        try { parse(op.request, op.response); } catch { return fail("storage_corrupt"); }
        if (op.response.result.customer && (!value.customer || !sameTestStoreV3Customer(value.customer, op.response.result.customer))) return fail("storage_corrupt");
      }
    }
    if (value.bindingOperations.some(o => o.request.command !== "bind" || (o.request.payload as TestStoreV3Payloads["bind"]).installationId !== installationId)) return fail("storage_corrupt");
    if (value.bindingObservation) {
      const o = value.bindingObservation;
      if (!row(o) || !keys(o, ["request", "response"]) || !validRequest(o.request) || !["bind", "read"].includes(o.request.command)) return fail("storage_corrupt");
      try { parse(o.request, o.response); } catch { return fail("storage_corrupt"); }
      if (o.response.result.customer && (!value.customer || !sameTestStoreV3Customer(value.customer, o.response.result.customer))) return fail("storage_corrupt");
      if (o.request.command === "bind" && !value.bindingOperations.some(op => same(op.request, o.request) && same(op.response, o.response))) return fail("storage_corrupt");
    }
    for (const a of value.attempts) {
      // Historical records gain only empty recovery fields. Their old invocation
      // state is preserved; an absent field never becomes closure evidence.
      if (row(a) && !Object.hasOwn(a, "nativePreparedClosure") && !Object.hasOwn(a, "preparedRelease")) { a.nativePreparedClosure = null; a.preparedRelease = null; }
      if (row(a) && !Object.hasOwn(a, "unallocatedRelease")) a.unallocatedRelease = null;
      if (!row(a) || !keys(a, ["allocationRequestId", "sessionId", "intentId", "quote", "operations", "allocation", "observation", "receiptObservation", "nativePhase", "nativeInvocation", "recoveryGeneration", "nativePreparedClosure", "preparedRelease", "unallocatedRelease"])
        || !testStoreUuid(a.allocationRequestId) || !testStoreUuid(a.sessionId) || !validTestStoreV3Quote(a.quote) || a.quote.currency !== "usd"
        || !validTestStoreV3Payload("read", { intentId: a.intentId }) || intents.has(a.intentId) || a.quote.creatorId === userId
        || !Array.isArray(a.operations) || a.operations.length < 1 || a.operations.length > 64
        || !choice(a.nativePhase, ["unprepared", "prepared", "reserved", "invoking", "unknown", "completed", "prepared_closed"])
        || !Number.isSafeInteger(a.recoveryGeneration) || a.recoveryGeneration < 0) return fail("storage_corrupt");
      intents.add(a.intentId);
      if (a.unallocatedRelease) {
        try { parseClosedPaidVideoCheckoutV3Attempt(a.unallocatedRelease, { userId, configurationDigest }); } catch { return fail("storage_corrupt"); }
        if (a.unallocatedRelease.intentId !== a.intentId || a.unallocatedRelease.sessionGeneration !== a.sessionId
          || !sameTestStoreV3Quote(a.unallocatedRelease.quote, a.quote) || a.allocation || a.nativePhase !== "unprepared"
          || a.nativeInvocation || a.nativePreparedClosure || a.preparedRelease || a.receiptObservation
          || a.operations.some(o => o.request.command !== "allocate")) return fail("storage_corrupt");
      }
      const first = a.operations[0];
      if (first.request.command !== "allocate" || first.request.requestId !== a.allocationRequestId || first.request.expectedSessionId !== a.sessionId
        || a.operations.some(o => o.request.command === "bind" || !("intentId" in o.request.payload) || o.request.payload.intentId !== a.intentId)
        || a.operations.filter(o => o.request.command === "claim").length > 1) return fail("storage_corrupt");
      if (a.allocation && (!validTestStoreV3Allocation(a.allocation) || a.allocation.intentId !== a.intentId
        || a.allocation.configurationDigest !== configurationDigest || a.allocation.customerBindingId !== value.customer?.id
        || !sameTestStoreV3Quote(a.allocation.quote, a.quote))) return fail("storage_corrupt");
      for (const op of a.operations) {
        const p = op.request.payload;
        if (("expectedQuote" in p && !sameTestStoreV3Quote(p.expectedQuote, a.quote))
          || ("dispatchId" in p && p.dispatchId !== a.allocation?.dispatchId)
          || ("customerBindingId" in p && p.customerBindingId !== value.customer?.id)
          || ("registrationId" in p && p.registrationId !== a.allocation?.registration?.id)) return fail("storage_corrupt");
        const x = op.response?.result.allocation;
        if (x && (!a.allocation || !sameAllocationBase(a.allocation, x)
          || (x.registration && !sameTestStoreV3Allocation(a.allocation, x)))) return fail("storage_corrupt");
      }
      for (const o of [a.observation, a.receiptObservation]) {
        if (!o) continue;
        if (!row(o) || !keys(o, ["request", "response"]) || !validRequest(o.request)) return fail("storage_corrupt");
        try { parse(o.request, o.response); } catch { return fail("storage_corrupt"); }
        if (!("intentId" in o.request.payload) || o.request.payload.intentId !== a.intentId
          || (o.response.result.customer && (!value.customer || !sameTestStoreV3Customer(value.customer, o.response.result.customer)))
          || (o.response.result.allocation && (!a.allocation || !sameAllocationBase(a.allocation, o.response.result.allocation)
            || (o.response.result.allocation.registration && !sameTestStoreV3Allocation(a.allocation, o.response.result.allocation))))) return fail("storage_corrupt");
        if (o.request.command !== "read" && !a.operations.some(op => same(op.request, o.request) && same(op.response, o.response))) return fail("storage_corrupt");
      }
      if (a.receiptObservation && !a.receiptObservation.response.result.receipt) return fail("storage_corrupt");
      const retained = a.receiptObservation?.response.result.receipt, shown = a.observation?.response.result.receipt;
      if ((retained && shown && !sameReceipt(retained, shown)) || (negative(retained) && a.observation?.response.result.status === "verified")) return fail("storage_corrupt");
      if (a.nativeInvocation && !matchesNative(value, a, a.nativeInvocation)) return fail("storage_corrupt");
      if (a.nativePreparedClosure && (!validTestStoreV3NativePreparedClosure(a.nativePreparedClosure) || !matchesNative(value, a, a.nativePreparedClosure.invocation))) return fail("storage_corrupt");
      if ((a.nativePhase === "completed") !== (a.nativeInvocation?.state === "completed")
        || (a.nativePhase === "prepared_closed") !== !!a.nativePreparedClosure || a.nativePreparedClosure && a.nativeInvocation !== null
        || a.nativePhase === "prepared" && a.nativeInvocation?.state !== "prepared"
        || (["reserved", "invoking", "unknown", "completed"].includes(a.nativePhase) && !a.operations.some(o => o.request.command === "claim"))) return fail("storage_corrupt");
      if (a.preparedRelease) {
        try { parseClosedTestStoreV3PreparedAttempt(a.preparedRelease, { userId, installationId, configurationDigest }); } catch { return fail("storage_corrupt"); }
        if (!a.nativePreparedClosure || !same(a.preparedRelease.nativeClosure, a.nativePreparedClosure) || a.preparedRelease.payload.intentId !== a.intentId
          || !sameTestStoreV3Quote(a.preparedRelease.payload.expectedQuote, a.quote) || a.preparedRelease.nativeClosure.invocation.allocationId !== a.allocation?.id
          || a.preparedRelease.observation?.response.status !== "ok" || !value.reservation
          || value.reservation.revision < a.preparedRelease.observation.response.data.closure.releasedReservationRevision) return fail("storage_corrupt");
      }
    }
    return value;
  }
  async function read() {
    let raw: string | null; try { raw = await storage.getItem(ISOLATED_TEST_STORE_V3_JOURNAL_KEY); } catch { return fail("storage_unavailable"); }
    if (raw === null) return null;
    try { if (raw.length > 1_500_000) return fail("storage_corrupt"); return validate(JSON.parse(raw)); } catch { return fail("storage_corrupt"); }
  }
  async function current() { const d = await read(); if (!d) return fail("attempt_missing"); if (!owned(d)) return fail("owner_conflict"); return d; }
  async function write(d: Document) {
    if (persistenceFailed) return fail("storage_unavailable");
    const raw = JSON.stringify(d); if (raw.length > 1_500_000) return fail("storage_unavailable");
    try { await storage.setItem(ISOLATED_TEST_STORE_V3_JOURNAL_KEY, raw); if (await storage.getItem(ISOLATED_TEST_STORE_V3_JOURNAL_KEY) !== raw) return fail("storage_unavailable"); }
    catch { persistenceFailed = true; return fail("storage_unavailable"); }
  }
  function request<C extends Mutation>(command: C, requestId: string, sessionId: string, payload: TestStoreV3Payloads[C]): TestStoreV3JournalRequest {
    if (!testStoreUuid(requestId) || !testStoreUuid(sessionId) || !validTestStoreV3Payload(command, payload)) return fail("invalid_request");
    return copy({ protocol: "isolated-test-store-v3", command, requestId, expectedSessionId: sessionId, configurationDigest, payload });
  }
  const owner = (d: Document) => snapshot({ reserved: true, ownedByCurrentScope: owned(d), customer: owned(d) ? d.customer : null,
    reservation: owned(d) ? d.reservation : null, bindingObservation: owned(d) ? project(d.bindingObservation) : null });
  function nativeCompleted(d: Document, a: SavedAttempt, v: unknown) {
    if (a.nativePreparedClosure || !matchesNative(d, a, v) || v.state !== "completed") return fail("native_completion_required");
    if (a.nativeInvocation?.state === "completed" && !same(a.nativeInvocation, v)) return fail("invalid_response");
    a.nativeInvocation = copy(v); a.nativePhase = "completed";
  }
  function nativeObserved(d: Document, a: SavedAttempt, v: unknown) {
    if (validTestStoreV3NativePreparedClosure(v)) {
      if (!matchesNative(d, a, v.invocation) || a.nativePhase === "completed" || a.nativePreparedClosure && !same(a.nativePreparedClosure, v)) return fail("invalid_response");
      a.nativePreparedClosure = copy(v); a.nativeInvocation = null; a.nativePhase = "prepared_closed"; a.recoveryGeneration++; return;
    }
    if (a.nativePreparedClosure || !matchesNative(d, a, v)) return fail("invalid_response");
    if (v.state === "completed") { nativeCompleted(d, a, v); return; }
    if (a.nativePhase === "completed") return fail("invalid_response");
    a.nativeInvocation = copy(v); a.nativePhase = v.state; a.recoveryGeneration++;
  }
  function purchaseCapability(id: string, claim: TestStoreV3Result, recoveryGeneration: number): TestStoreV3Purchase {
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
        else if (a.nativePhase !== "completed" && a.nativePhase !== "prepared_closed") a.nativePhase = "unknown";
        await write(d); return publicAttempt(a, d);
      });
    };
  }
  async function prepare(d: Document, a: SavedAttempt | null, r: TestStoreV3JournalRequest) {
    const existing = operations(d).find(o => o.request.requestId === r.requestId);
    if (existing) {
      if (!same(existing.request, r)) return fail("request_conflict");
      return { mayExecute: false, request: snapshot(existing.request), execute: null };
    }
    if ((a ? a.operations : d.bindingOperations).length >= 64) return fail("storage_unavailable");
    const op: Operation = { request: r, state: "prepared", response: null };
    (a ? a.operations : d.bindingOperations).push(op); await write(d);
    const preparedGeneration = a?.recoveryGeneration ?? 0;
    let consumed = false;
    const execute = async (send: TestStoreV3JournalSend) => {
      if (consumed) return fail("capability_consumed"); consumed = true;
      const generation = await serialized(async () => {
        const latest = await current(), attempt = a ? findAttempt(latest, a.intentId) : null;
        const stored = operations(latest).find(o => o.request.requestId === r.requestId);
        if (!stored || stored.state !== "prepared") return fail("phase_unavailable");
        if (attempt?.unallocatedRelease) return fail("phase_unavailable");
        if (["allocate", "claim", "advance"].includes(r.command) && latest.bindingObservation?.response.result.status === "held") return fail("phase_unavailable");
        if (attempt && r.command === "claim" && (attempt.nativePreparedClosure || !["unprepared", "prepared"].includes(attempt.nativePhase)
          || attempt.recoveryGeneration !== preparedGeneration || !attempt.allocation || attempt.observation?.response.result.status !== "offering_ready"
          || latest.reservation?.activeAllocationId !== attempt.allocation.id || !before(attempt.allocation.acceptPurchaseUntil))) return fail("phase_unavailable");
        if (attempt && r.command === "advance" && (latest.reservation?.activeAllocationId !== attempt.allocation?.id
          || latest.reservation?.revision !== (r.payload as TestStoreV3Payloads["advance"]).expectedReservationRevision
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
          && !attempt.nativePreparedClosure && ["unprepared", "prepared"].includes(attempt.nativePhase)
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
        const d = existing ?? { version: 3 as const, userId, installationId, configurationDigest, customer: null, reservation: null, bindingOperations: [], bindingObservation: null, attempts: [] };
        return prepare(d, null, request("bind", requestId, sessionId, { installationId }));
      });
    },
    async prepareAllocation({ requestId, sessionId, intentId, quote }: { requestId: string; sessionId: string; intentId: string; quote: TestStoreV3Quote }) {
      return serialized(async () => {
        const d = await current(); if (!d.customer) return fail("phase_unavailable");
        const r = request("allocate", requestId, sessionId, { customerBindingId: d.customer.id, intentId, expectedQuote: quote });
        const old = d.attempts.find(a => a.intentId === intentId);
        if (old) { if (old.allocationRequestId !== requestId) return fail("request_conflict"); return prepare(d, old, r); }
        if (d.bindingObservation?.response.result.status === "held" || d.reservation?.activeAllocationId !== null
          || d.attempts.some(a => !publicAttempt(a, d).initiationReleased)) return fail("phase_unavailable");
        if (quote.currency !== "usd" || quote.creatorId === userId || d.attempts.length >= 128) return fail("invalid_request");
        const a: SavedAttempt = { allocationRequestId: requestId, sessionId, intentId, quote: copy(quote), operations: [], allocation: null,
          observation: null, receiptObservation: null, nativePhase: "unprepared", nativeInvocation: null, recoveryGeneration: 0, nativePreparedClosure: null, preparedRelease: null, unallocatedRelease: null };
        d.attempts.push(a); return prepare(d, a, r);
      });
    },
    async prepareClaim({ requestId, sessionId, allocationId }: { requestId: string; sessionId: string; allocationId: string }) {
      return serialized(async () => {
        const d = await current(), a = findAttempt(d, allocationId), x = a.allocation;
        if (!x?.registration || sessionId !== a.sessionId || a.nativePreparedClosure || d.bindingObservation?.response.result.status === "held") return fail("phase_unavailable");
        const r = request("claim", requestId, sessionId, { intentId: a.intentId, dispatchId: x.dispatchId, registrationId: x.registration.id, expectedQuote: a.quote });
        if (a.operations.some(o => o.request.command === "claim" && o.request.requestId !== requestId)) return fail("phase_unavailable");
        if (!operations(d).some(o => o.request.requestId === requestId) && (!["unprepared", "prepared"].includes(a.nativePhase) || a.observation?.response.result.status !== "offering_ready"
          || d.reservation?.activeAllocationId !== x.id || !before(x.acceptPurchaseUntil))) return fail("phase_unavailable");
        return prepare(d, a, r);
      });
    },
    async recordUnallocatedRelease(value: unknown) {
      let proof: PaidVideoCheckoutV3Attempt;
      try { proof = parseClosedPaidVideoCheckoutV3Attempt(value, { userId, configurationDigest }); } catch { return fail("invalid_response"); }
      return serialized(async () => {
        const d = await current(), a = findAttempt(d, proof.intentId!);
        if (proof.sessionGeneration !== a.sessionId || !sameTestStoreV3Quote(proof.quote, a.quote) || a.allocation
          || a.nativePhase !== "unprepared" || a.nativeInvocation || a.nativePreparedClosure || a.preparedRelease || a.receiptObservation
          || a.operations.some(o => o.request.command !== "allocate")
          || a.unallocatedRelease && !same(a.unallocatedRelease.closure, proof.closure)) return fail("invalid_response");
        a.unallocatedRelease = copy(proof); a.recoveryGeneration++;
        await write(d); return publicAttempt(a, d);
      });
    },
    async reconcile({ requestId, sessionId, payload }: { requestId: string; sessionId: string; payload: TestStoreV3Payloads["read"] }, response: unknown) {
      const r: TestStoreV3JournalRequest = copy({ protocol: "isolated-test-store-v3", command: "read", requestId, expectedSessionId: sessionId, configurationDigest, payload });
      const parsed = parse(r, response);
      return serialized(async () => { const d = await current(), a = findAttempt(d, (r.payload as TestStoreV3Payloads["read"]).intentId); a.recoveryGeneration++;
        adopt(d, a, { request: r, response: parsed }); await write(d); return publicAttempt(a, d); });
    },
    /** Untracked server history can be displayed after bind recovery. It never
     * fabricates an original request/session or constructs a SavedAttempt. */
    async reconcileBinding({ requestId, sessionId, payload }: { requestId: string; sessionId: string; payload: TestStoreV3Payloads["read"] }, response: unknown) {
      const r: TestStoreV3JournalRequest = copy({ protocol: "isolated-test-store-v3", command: "read", requestId, expectedSessionId: sessionId, configurationDigest, payload });
      const parsed = parse(r, response);
      return serialized(async () => { const d = await current(); if (!d.customer) return fail("phase_unavailable");
        adopt(d, null, { request: r, response: parsed }); await write(d); return owner(d); });
    },
    async reconcileNative(allocationId: string, readInvocation: TestStoreV3ReadInvocation) {
      const dispatch = await serialized(async () => { const d = await current(), a = findAttempt(d, allocationId); return a.allocation?.dispatchId ?? fail("phase_unavailable"); });
      const value = await readInvocation(dispatch);
      return serialized(async () => { const d = await current(), a = findAttempt(d, allocationId); nativeObserved(d, a, value); await write(d); return publicAttempt(a, d); });
    },
    async recordPreparedRelease(allocationId: string, value: unknown) {
      let release: TestStoreV3PreparedCloseAttempt;
      try { release = parseClosedTestStoreV3PreparedAttempt(value, { userId, installationId, configurationDigest }); } catch { return fail("invalid_response"); }
      return serialized(async () => {
        const d = await current(), a = findAttempt(d, allocationId), response = release.observation!.response;
        if (response.status !== "ok" || !a.allocation || !d.reservation || a.allocation.id !== release.nativeClosure.invocation.allocationId
          || a.intentId !== release.payload.intentId || !sameTestStoreV3Quote(a.quote, release.payload.expectedQuote)
          || a.preparedRelease && !same(a.preparedRelease.observation!.response.data.closure, response.data.closure)) return fail("invalid_response");
        nativeObserved(d, a, release.nativeClosure);
        const closure = response.data.closure;
        if (d.reservation.revision < closure.releasedReservationRevision) {
          if (d.reservation.revision !== closure.previousReservationRevision || d.reservation.activeAllocationId !== a.allocation.id) return fail("invalid_response");
          d.reservation = { revision: closure.releasedReservationRevision, activeAllocationId: null };
        } else if (d.reservation.activeAllocationId === a.allocation.id) return fail("invalid_response");
        a.preparedRelease = copy(release); await write(d); return publicAttempt(a, d);
      });
    },
    async prepareReport({ requestId, sessionId, allocationId }: { requestId: string; sessionId: string; allocationId: string }) {
      return serialized(async () => { const d = await current(), a = findAttempt(d, allocationId), n = a.nativeInvocation;
        if (!n || n.state !== "completed" || !a.allocation || n.outcome === null) return fail("native_completion_required");
        if (a.operations.some(o => o.request.command === "report" && o.request.requestId !== requestId)) return fail("phase_unavailable");
        return prepare(d, a, request("report", requestId, sessionId, { intentId: a.intentId, dispatchId: a.allocation.dispatchId, outcome: n.outcome, transactionHint: n.transactionHint })); });
    },
    async prepareAdvance({ requestId, sessionId, allocationId, expectedReservationRevision, acknowledgeUnknownOutcome }: {
      requestId: string; sessionId: string; allocationId: string; expectedReservationRevision: number; acknowledgeUnknownOutcome: boolean;
    }, readInvocation: TestStoreV3ReadInvocation) {
      const dispatch = await serialized(async () => { const d = await current(), a = findAttempt(d, allocationId); return a.allocation?.dispatchId ?? fail("phase_unavailable"); });
      const value = await readInvocation(dispatch);
      return serialized(async () => {
        const d = await current(), a = findAttempt(d, allocationId);
        try { nativeObserved(d, a, value); } catch { return fail("native_completion_required"); }
        if (a.nativePhase !== "completed" && a.nativePhase !== "prepared_closed") return fail("native_completion_required");
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
