import AsyncStorage from "@react-native-async-storage/async-storage";
import {
  parseIsolatedTestStoreResult, sameTestStoreQuote, testStoreDigest, testStoreUuid,
  validTestStoreAllocation, validTestStorePayload, validTestStoreQuote,
  type TestStoreAllocation, type TestStoreCommand, type TestStorePayloads,
  type TestStoreQuote, type TestStoreResult, type TestStoreSdkOutcome,
} from "./isolatedTestStoreContract";

/** One fresh rehearsal per installation. Neither a receipt nor an SDK return
 * proves native quiescence, so this module deliberately has no release/reset. */
export const ISOLATED_TEST_STORE_RESERVATION_KEY = "@chillywood/sandbox-commerce-v1/test-store-native-reservation";
export type TestStoreAttemptStorage = { getItem(key: string): Promise<string | null>; setItem(key: string, value: string): Promise<unknown> };
type Row = Record<string, unknown>;
type MutationCommand = Exclude<TestStoreCommand, "read">;
export type TestStoreMutationRequest = {
  protocol: "isolated-test-store-v1"; command: MutationCommand; requestId: string;
  expectedSessionId: string; configurationDigest: string; payload: TestStorePayloads[MutationCommand];
};
export type TestStoreSend = (request: Readonly<TestStoreMutationRequest>, allocation: Readonly<TestStoreAllocation> | null) => Promise<unknown>;
export type TestStoreSdkObservation = { outcome: TestStoreSdkOutcome; transactionHint: string | null };
type Phase = "allocation_prepared" | "allocation_unknown" | "allocated" | "claim_unknown" | "sdk_reserved" | "sdk_unknown" | "pending" | "report_unknown" | "blocked";
type Observation = {
  command: TestStoreCommand; requestId: string; sessionId: string;
  status: TestStoreResult["result"]["status"]; reason: string;
  allocation: TestStoreAllocation | null; receipt: TestStoreResult["result"]["receipt"];
};
export type IsolatedTestStoreAttempt = {
  allocationRequestId: string; userId: string; sessionId: string; configurationDigest: string;
  intentId: string; quote: TestStoreQuote; phase: Phase; reconciled: boolean;
  requests: TestStoreMutationRequest[]; allocation: TestStoreAllocation | null;
  sdkObservation: TestStoreSdkObservation | null; observation: Observation | null;
  /** Historical receipt provenance; observation preserves known server holds. */
  receiptObservation: Observation | null;
};
type Reservation = {
  version: 1; userId: string; configurationDigest: string; allocationRequestId: string;
  sessionId: string; intentId: string; dispatchId: string | null;
};
type ErrorCode = "invalid_request" | "invalid_response" | "storage_unavailable" | "storage_corrupt"
  | "reservation_held" | "request_conflict" | "attempt_missing" | "capability_consumed"
  | "phase_unavailable" | "authority_expired" | "outcome_unknown";
export class IsolatedTestStoreJournalError extends Error {
  constructor(readonly code: ErrorCode) { super(`Isolated Test Store journal: ${code}.`); this.name = "IsolatedTestStoreJournalError"; }
}
const fail = (code: ErrorCode): never => { throw new IsolatedTestStoreJournalError(code); };
const row = (v: unknown): v is Row => !!v && typeof v === "object" && !Array.isArray(v);
const keys = (v: Row, names: readonly string[]) => Object.keys(v).length === names.length && names.every(k => Object.hasOwn(v, k));
const intent = (v: unknown): v is string => typeof v === "string" && v.startsWith("scv1_intent_") && testStoreUuid(v.slice(12));
const choice = (v: unknown, names: readonly string[]) => typeof v === "string" && names.includes(v);
const freeze = <T>(v: T): T => { if (v && typeof v === "object") { Object.values(v).forEach(freeze); Object.freeze(v); } return v; };
const copy = <T>(v: T): T => freeze(JSON.parse(JSON.stringify(v)) as T);
const canonical = (v: unknown): string => JSON.stringify(v, (_k, value: unknown) => row(value)
  ? Object.fromEntries(Object.keys(value).sort().map(k => [k, value[k]])) : value);
const same = (a: unknown, b: unknown) => canonical(a) === canonical(b);
type Receipt = NonNullable<TestStoreResult["result"]["receipt"]>;
const negativeReceipt = (v: Receipt | null | undefined) => !!v && v.state !== "verified";
const sameReceiptIdentity = (a: Receipt, b: Receipt) => a.id === b.id
  && a.providerTransactionId === b.providerTransactionId && a.originalTransactionId === b.originalTransactionId
  && a.purchasedAt === b.purchasedAt;
const validSdkObservation = (v: unknown): v is TestStoreSdkObservation => row(v) && keys(v, ["outcome", "transactionHint"])
  && choice(v.outcome, ["sdk_success", "sdk_cancelled", "sdk_failed", "sdk_unknown"])
  && (v.transactionHint === null || (typeof v.transactionHint === "string" && /^[A-Za-z0-9._:-]{1,200}$/u.test(v.transactionHint)));
const queues = new Map<string, Promise<void>>();
async function serialized<T>(operation: () => Promise<T>): Promise<T> {
  const key = ISOLATED_TEST_STORE_RESERVATION_KEY, previous = queues.get(key) ?? Promise.resolve();
  let release!: () => void; const current = new Promise<void>(resolve => { release = resolve; });
  queues.set(key, current); await previous;
  try { return await operation(); } finally { release(); if (queues.get(key) === current) queues.delete(key); }
}
function reservation(v: unknown): v is Reservation {
  return row(v) && keys(v, ["version", "userId", "configurationDigest", "allocationRequestId", "sessionId", "intentId", "dispatchId"])
    && v.version === 1 && testStoreUuid(v.userId) && testStoreDigest(v.configurationDigest)
    && testStoreUuid(v.allocationRequestId) && testStoreUuid(v.sessionId) && intent(v.intentId)
    && (v.dispatchId === null || testStoreUuid(v.dispatchId));
}
function envelope(a: IsolatedTestStoreAttempt, o: Observation): TestStoreResult {
  return { protocol: "isolated-test-store-v1", command: o.command, requestId: o.requestId,
    actor: { userId: a.userId, sessionId: o.sessionId }, generation: 1, environment: "sandbox",
    result: { status: o.status, reason: o.reason, allocation: o.allocation, receipt: o.receipt,
      dispatchAllowed: false, authorityValidUntil: null, retryProviderMutation: false, grantsAccess: false, notPayable: true } };
}
function validateAttempt(value: unknown, userId: string, configurationDigest: string): IsolatedTestStoreAttempt {
  if (!row(value) || !keys(value, ["allocationRequestId", "userId", "sessionId", "configurationDigest", "intentId", "quote", "phase", "reconciled", "requests", "allocation", "sdkObservation", "observation", "receiptObservation"])
    || value.userId !== userId || value.configurationDigest !== configurationDigest || !testStoreUuid(value.allocationRequestId)
    || !testStoreUuid(value.sessionId) || !intent(value.intentId) || !validTestStoreQuote(value.quote) || value.quote.creatorId === userId
    || !choice(value.phase, ["allocation_prepared", "allocation_unknown", "allocated", "claim_unknown", "sdk_reserved", "sdk_unknown", "pending", "report_unknown", "blocked"])
    || typeof value.reconciled !== "boolean" || !Array.isArray(value.requests) || value.requests.length < 1 || value.requests.length > 3) return fail("storage_corrupt");
  const a = value as IsolatedTestStoreAttempt;
  if (a.allocation !== null && (!validTestStoreAllocation(a.allocation) || a.allocation.intentId !== a.intentId
    || a.allocation.configurationDigest !== configurationDigest || !sameTestStoreQuote(a.allocation.quote, a.quote))) return fail("storage_corrupt");
  const seen = new Set<string>();
  for (const [index, r] of a.requests.entries()) {
    if (!row(r) || !keys(r, ["protocol", "command", "requestId", "expectedSessionId", "configurationDigest", "payload"])
      || r.protocol !== "isolated-test-store-v1" || r.command !== ["allocate", "claim", "report"][index]
      || !testStoreUuid(r.requestId) || seen.has(r.requestId) || r.expectedSessionId !== a.sessionId
      || r.configurationDigest !== configurationDigest || !validTestStorePayload(r.command, r.payload)
      || r.payload.intentId !== a.intentId || (index === 0 && r.requestId !== a.allocationRequestId)
      || ("expectedQuote" in r.payload && !sameTestStoreQuote(r.payload.expectedQuote, a.quote))
      || ("dispatchId" in r.payload && r.payload.dispatchId !== a.allocation?.dispatchId)) return fail("storage_corrupt");
    seen.add(r.requestId);
  }
  if ((["allocation_prepared", "allocation_unknown", "allocated"].includes(a.phase) && a.requests.length !== 1)
    || (["claim_unknown", "sdk_reserved", "sdk_unknown", "pending"].includes(a.phase) && a.requests.length !== 2)
    || (a.phase === "report_unknown" && a.requests.length !== 3)
    || (["allocated", "claim_unknown", "sdk_reserved", "sdk_unknown", "report_unknown"].includes(a.phase) && a.allocation === null)
    || (a.sdkObservation !== null && (!validSdkObservation(a.sdkObservation) || a.requests.length < 2))) return fail("storage_corrupt");
  if ((a.reconciled && a.phase !== "blocked")
    || (["allocation_prepared", "allocation_unknown"].includes(a.phase) && (a.allocation !== null || a.observation !== null || a.receiptObservation !== null))
    || (["pending", "report_unknown"].includes(a.phase) && a.sdkObservation === null)
    || (a.requests.length === 3 && (a.sdkObservation === null || !same(a.requests[2].payload,
      { intentId: a.intentId, dispatchId: a.allocation?.dispatchId, ...a.sdkObservation })))) return fail("storage_corrupt");
  for (const o of [a.observation, a.receiptObservation]) {
    if (o === null) continue;
    if (!row(o) || !keys(o, ["command", "requestId", "sessionId", "status", "reason", "allocation", "receipt"])
      || !testStoreUuid(o.sessionId) || !testStoreUuid(o.requestId)) return fail("storage_corrupt");
    const request = a.requests.find(r => r.requestId === o.requestId && r.command === o.command);
    if (o.command !== "read" && (!request || o.sessionId !== a.sessionId)) return fail("storage_corrupt");
    try { parseIsolatedTestStoreResult(envelope(a, o), { command: o.command, requestId: o.requestId,
      actor: { userId, sessionId: o.sessionId }, configurationDigest, payload: o.command === "read" ? { intentId: a.intentId } : request!.payload }); }
    catch { return fail("storage_corrupt"); }
    if (o.allocation && (!a.allocation || !same(o.allocation, a.allocation))) return fail("storage_corrupt");
  }
  const currentReceipt = a.observation?.receipt, retainedReceipt = a.receiptObservation?.receipt;
  if ((a.receiptObservation && (!retainedReceipt || !a.observation))
    || (currentReceipt && (!retainedReceipt || !sameReceiptIdentity(currentReceipt, retainedReceipt)))
    || (a.observation?.status === "verified" && negativeReceipt(retainedReceipt))) return fail("storage_corrupt");
  return a;
}

export function createIsolatedTestStoreAttemptJournal({ userId, configurationDigest, storage = AsyncStorage, now = Date.now }: {
  userId: string; configurationDigest: string; storage?: TestStoreAttemptStorage; now?: () => number;
}) {
  if (!testStoreUuid(userId) || !testStoreDigest(configurationDigest) || typeof now !== "function") return fail("invalid_request");
  const before = (deadline: string, maxAhead?: number) => {
    const currentTime = now(), expiry = Date.parse(deadline);
    return Number.isFinite(currentTime) && Number.isFinite(expiry) && currentTime < expiry
      && (maxAhead === undefined || expiry - currentTime <= maxAhead);
  };
  const accountKey = `@chillywood/sandbox-commerce-v1/test-store-attempts:${userId}:${configurationDigest}`;
  const readJson = async (key: string) => {
    let raw: string | null; try { raw = await storage.getItem(key); } catch { return fail("storage_unavailable"); }
    if (raw === null) return null;
    try { if (typeof raw !== "string" || raw.length > 100_000) return fail("storage_corrupt"); return JSON.parse(raw) as unknown; }
    catch { return fail("storage_corrupt"); }
  };
  const writeJson = async (key: string, value: unknown) => {
    const raw = JSON.stringify(value); if (raw.length > 100_000) return fail("storage_unavailable");
    try { await storage.setItem(key, raw); if (await storage.getItem(key) !== raw) return fail("storage_unavailable"); }
    catch { return fail("storage_unavailable"); }
  };
  async function readReservation() { const v = await readJson(ISOLATED_TEST_STORE_RESERVATION_KEY); if (v === null) return null; if (!reservation(v)) return fail("storage_corrupt"); return v; }
  async function readAttempt() {
    const v = await readJson(accountKey); if (v === null) return null;
    if (!row(v) || !keys(v, ["version", "userId", "configurationDigest", "attempt"])
      || v.version !== 1 || v.userId !== userId || v.configurationDigest !== configurationDigest) return fail("storage_corrupt");
    return validateAttempt(v.attempt, userId, configurationDigest);
  }
  const writeAttempt = (attempt: IsolatedTestStoreAttempt) => writeJson(accountKey, { version: 1, userId, configurationDigest, attempt });
  function owns(r: Reservation | null, a: IsolatedTestStoreAttempt) {
    return !!r && r.userId === userId && r.configurationDigest === configurationDigest && r.allocationRequestId === a.allocationRequestId
      && r.sessionId === a.sessionId && r.intentId === a.intentId && (r.dispatchId === null || r.dispatchId === a.allocation?.dispatchId);
  }
  async function current(id: string, phase?: Phase) {
    const a = await readAttempt(); if (!a || a.allocationRequestId !== id) return fail("attempt_missing");
    if (!owns(await readReservation(), a)) return fail("reservation_held");
    if (phase && (a.phase !== phase || a.reconciled || a.receiptObservation)) return fail("phase_unavailable");
    return a;
  }
  const request = <C extends MutationCommand>(a: IsolatedTestStoreAttempt, command: C, requestId: string, payload: TestStorePayloads[C]): TestStoreMutationRequest => {
    if (!testStoreUuid(requestId) || a.requests.some(r => r.requestId === requestId) || !validTestStorePayload(command, payload)) return fail("invalid_request");
    return copy({ protocol: "isolated-test-store-v1", command, requestId, expectedSessionId: a.sessionId, configurationDigest, payload });
  };
  function parse(a: IsolatedTestStoreAttempt, command: TestStoreCommand, requestId: string, payload: TestStorePayloads[TestStoreCommand], sessionId: string, value: unknown) {
    let result: TestStoreResult;
    try { result = parseIsolatedTestStoreResult(copy(value), { command, requestId, payload, actor: { userId, sessionId }, configurationDigest }); }
    catch { return fail("invalid_response"); }
    const allocation = result.result.allocation;
    if (allocation && (!sameTestStoreQuote(allocation.quote, a.quote) || (a.allocation && !same(a.allocation, allocation)))) return fail("invalid_response");
    const oldReceipt = a.receiptObservation?.receipt, receipt = result.result.receipt;
    if (oldReceipt && receipt && !sameReceiptIdentity(oldReceipt, receipt)) return fail("invalid_response");
    return result;
  }
  async function observed(a: IsolatedTestStoreAttempt, result: TestStoreResult, phase: Phase) {
    const allocation = result.result.allocation ?? a.allocation;
    const observation: Observation = { command: result.command, requestId: result.requestId, sessionId: result.actor.sessionId,
      status: result.result.status, reason: result.result.reason, allocation: result.result.allocation, receipt: result.result.receipt };
    // Keep the current server projection separate from historical receipt
    // provenance. A null-receipt hold must immediately replace a prior verified
    // status without constructing a response the server never returned.
    const lateMutation = a.reconciled && result.command !== "read" && a.observation
      && observation.status !== "held" && !negativeReceipt(observation.receipt);
    // V1 holds have no clearing operation. Completion order cannot revoke an
    // observed hold or resurrect a refunded/revoked/quarantined receipt. Keep
    // actual prior projections instead of fabricating a stronger response.
    const knownHold = a.observation?.status === "held" && observation.status !== "held";
    const negativeResurrection = negativeReceipt(a.receiptObservation?.receipt)
      && observation.receipt?.state === "verified";
    const retainProjection = lateMutation || knownHold || (negativeResurrection && observation.status !== "held");
    const next = { ...a, phase, allocation, observation: retainProjection ? a.observation : observation,
      receiptObservation: !lateMutation && !negativeResurrection && observation.receipt ? observation : a.receiptObservation };
    await writeAttempt(next);
    const marker = await readReservation(); if (!owns(marker, next)) return fail("reservation_held");
    if (allocation && marker!.dispatchId === null) await writeJson(ISOLATED_TEST_STORE_RESERVATION_KEY, { ...marker, dispatchId: allocation.dispatchId });
    return next;
  }
  const once = () => { let used = false; return () => { if (used) return fail("capability_consumed"); used = true; }; };
  const notReusable = (a: IsolatedTestStoreAttempt) => Object.freeze({ attempt: copy(a), mayAllocate: false, allocate: null });
  function reportTicket(a: IsolatedTestStoreAttempt) {
    const consume = once();
    return Object.freeze({ attempt: copy(a), report: async ({ requestId }: { requestId: string }, send: TestStoreSend) => {
      consume(); if (typeof send !== "function") return fail("invalid_request");
      const pending = await serialized(async () => {
        const saved = await current(a.allocationRequestId, "pending");
        if (!saved.allocation || !saved.sdkObservation) return fail("phase_unavailable");
        const r = request(saved, "report", requestId, { intentId: saved.intentId, dispatchId: saved.allocation.dispatchId, ...saved.sdkObservation });
        const next = { ...saved, phase: "report_unknown" as const, requests: [...saved.requests, r] }; await writeAttempt(next); return { next, r };
      });
      let raw: unknown; try { raw = await send(pending.r, copy(pending.next.allocation)); } catch { return fail("outcome_unknown"); }
      return serialized(async () => { const saved = await current(a.allocationRequestId);
        const result = parse(saved, "report", requestId, pending.r.payload, a.sessionId, raw); return copy(await observed(saved, result, "blocked")); });
    } });
  }
  function purchaseTicket(a: IsolatedTestStoreAttempt, claim: TestStoreResult) {
    const consume = once();
    const validatedClaim = copy(claim), authorityValidUntil = validatedClaim.result.authorityValidUntil!;
    return Object.freeze({ attempt: copy(a), purchase: async (runSdk: (allocation: Readonly<TestStoreAllocation>, claim: Readonly<TestStoreResult>) => Promise<TestStoreSdkObservation>) => {
      consume(); if (typeof runSdk !== "function") return fail("invalid_request");
      const saved = await serialized(async () => { const v = await current(a.allocationRequestId, "sdk_reserved");
        if (!before(authorityValidUntil, 5_000)) return fail("authority_expired");
        const next = { ...v, phase: "sdk_unknown" as const }; await writeAttempt(next); return next; });
      if (!before(authorityValidUntil, 5_000)) return fail("authority_expired");
      let outcome: TestStoreSdkObservation;
      try { const value = await runSdk(copy(saved.allocation!), validatedClaim); outcome = validSdkObservation(value) ? copy(value) : { outcome: "sdk_unknown", transactionHint: null }; }
      catch { outcome = { outcome: "sdk_unknown", transactionHint: null }; }
      return serialized(async () => { const v = await current(a.allocationRequestId);
        const next = { ...v, phase: v.reconciled ? "blocked" as const : "pending" as const, sdkObservation: outcome }; await writeAttempt(next);
        return v.reconciled ? Object.freeze({ attempt: copy(next), report: null }) : reportTicket(next); });
    } });
  }
  function claimTicket(a: IsolatedTestStoreAttempt) {
    const consume = once();
    return Object.freeze({ attempt: copy(a), claim: async ({ requestId }: { requestId: string }, sendSetupAndClaim: TestStoreSend) => {
      consume(); if (typeof sendSetupAndClaim !== "function") return fail("invalid_request");
      const pending = await serialized(async () => { const v = await current(a.allocationRequestId, "allocated");
        if (!v.allocation || !before(v.allocation.acceptPurchaseUntil)) return fail("authority_expired");
        const r = request(v, "claim", requestId, { intentId: v.intentId, dispatchId: v.allocation.dispatchId, expectedQuote: v.quote });
        const next = { ...v, phase: "claim_unknown" as const, requests: [...v.requests, r] }; await writeAttempt(next); return { next, r }; });
      if (!before(pending.next.allocation!.acceptPurchaseUntil)) return fail("authority_expired");
      let raw: unknown; try { raw = await sendSetupAndClaim(pending.r, copy(pending.next.allocation)); } catch { return fail("outcome_unknown"); }
      return serialized(async () => { const v = await current(a.allocationRequestId);
        const parsed = parse(v, "claim", requestId, pending.r.payload, a.sessionId, raw);
        const fresh = !v.reconciled && parsed.result.status === "dispatch_claimed" && parsed.result.dispatchAllowed
          && !!parsed.result.authorityValidUntil && before(parsed.result.authorityValidUntil, 5_000);
        const next = await observed(v, parsed, fresh ? "sdk_reserved" : "blocked");
        return fresh ? purchaseTicket(next, parsed) : Object.freeze({ attempt: copy(next), purchase: null }); });
    } });
  }
  return Object.freeze({
    async prepareAllocation(input: { requestId: string; sessionId: string; intentId: string; quote: TestStoreQuote }) {
      if (!row(input) || !keys(input, ["requestId", "sessionId", "intentId", "quote"]) || !testStoreUuid(input.requestId)
        || !testStoreUuid(input.sessionId) || !intent(input.intentId) || !validTestStoreQuote(input.quote) || input.quote.creatorId === userId) return fail("invalid_request");
      const inputCopy = copy(input);
      return serialized(async () => {
        const old = await readAttempt(), marker = await readReservation();
        if (old) {
          if (old.allocationRequestId !== inputCopy.requestId || old.intentId !== inputCopy.intentId || !sameTestStoreQuote(old.quote, inputCopy.quote)) return fail("request_conflict");
          return notReusable(old);
        }
        if (marker) return fail("reservation_held");
        const a: IsolatedTestStoreAttempt = { allocationRequestId: inputCopy.requestId, userId, sessionId: inputCopy.sessionId,
          configurationDigest, intentId: inputCopy.intentId, quote: inputCopy.quote, phase: "allocation_prepared", reconciled: false,
          requests: [], allocation: null, sdkObservation: null, observation: null, receiptObservation: null };
        a.requests = [request(a, "allocate", inputCopy.requestId, { intentId: a.intentId, expectedQuote: a.quote })];
        // Marker first: any partial cross-key write leaves the entire device
        // reserved. No capability exists until both writes are read back.
        await writeJson(ISOLATED_TEST_STORE_RESERVATION_KEY, { version: 1, userId, configurationDigest,
          allocationRequestId: a.allocationRequestId, sessionId: a.sessionId, intentId: a.intentId, dispatchId: null });
        await writeAttempt(a); const consume = once();
        return Object.freeze({ attempt: copy(a), mayAllocate: true, allocate: async (send: TestStoreSend) => {
          consume(); if (typeof send !== "function") return fail("invalid_request");
          const pending = await serialized(async () => { const v = await current(a.allocationRequestId, "allocation_prepared");
            const next = { ...v, phase: "allocation_unknown" as const }; await writeAttempt(next); return next; });
          let raw: unknown; try { raw = await send(copy(pending.requests[0]), null); } catch { return fail("outcome_unknown"); }
          return serialized(async () => { const v = await current(a.allocationRequestId);
            const parsed = parse(v, "allocate", a.allocationRequestId, pending.requests[0].payload, a.sessionId, raw);
            const fresh = !v.reconciled && parsed.result.status === "allocated" && parsed.result.allocation !== null && !parsed.result.dispatchAllowed;
            const next = await observed(v, parsed, fresh ? "allocated" : "blocked");
            return fresh ? claimTicket(next) : Object.freeze({ attempt: copy(next), claim: null }); });
        } });
      });
    },
    async reconcile(binding: { allocationRequestId: string; readRequestId: string; sessionId: string }, value: unknown) {
      if (!row(binding) || !keys(binding, ["allocationRequestId", "readRequestId", "sessionId"])
        || !testStoreUuid(binding.allocationRequestId) || !testStoreUuid(binding.readRequestId) || !testStoreUuid(binding.sessionId)) return fail("invalid_request");
      const bound = copy(binding); let snapshot: unknown; try { snapshot = copy(value); } catch { return fail("invalid_response"); }
      return serialized(async () => { const v = await current(bound.allocationRequestId);
        const result = parse(v, "read", bound.readRequestId, { intentId: v.intentId }, bound.sessionId, snapshot);
        return copy(await observed({ ...v, reconciled: true }, result, "blocked")); });
    },
    list: async () => serialized(async () => { const a = await readAttempt(); return copy(a ? [a] : []); }),
    readGlobalReservation: async () => serialized(async () => {
      const marker = await readReservation();
      if (!marker) return Object.freeze({ reserved: false, ownedByCurrentScope: false, owner: null });
      const ownedByCurrentScope = marker.userId === userId && marker.configurationDigest === configurationDigest;
      return Object.freeze({ reserved: true, ownedByCurrentScope, owner: ownedByCurrentScope ? copy(marker) : null });
    }),
  });
}
