import AsyncStorage from "@react-native-async-storage/async-storage";
import { IsolatedSandboxCommerceError } from "./isolatedSandboxCommerce";

/** Local recovery evidence only. No method initiates a provider purchase. */
type Row = Record<string, unknown>;
export type IsolatedSandboxTipCheckoutQuote = {
  offerId: string; offerRevision: number; resourceId: string; resourceRevision: number;
  creatorId: string; kind: "creator_tip"; amountMinor: number; currency: string;
};
export type IsolatedSandboxTipCheckoutStorage = {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<unknown>;
};
type Tombstone = {
  intentId: string; originalRequestId: string; originalSessionId: string;
  abandonedBySessionId: string; abandonedAt: string; proof: "undispatched_tombstone";
};
type Observation = {
  source: "direct" | "request.read" | "pre_dispatch"; observedSessionGeneration: string;
  intentId: string | null; status: "unknown" | "intent_prepared" | "abandoned" | "not_applied";
  abandonment: Tombstone | null;
};
export type IsolatedSandboxTipCheckoutAttempt = {
  readonly requestId: string; readonly userId: string; readonly sessionGeneration: string;
  readonly command: "checkout.prepare" | "checkout.abandon"; readonly prepareRequestId: string;
  readonly payload: Readonly<Row>; readonly quote: Readonly<IsolatedSandboxTipCheckoutQuote>;
  readonly intentId: string | null;
  readonly state: "prepared" | "unknown" | "intent_prepared" | "abandoned" | "not_applied";
  readonly result: Readonly<Observation> | null;
};
type ErrorCode = "invalid_request" | "invalid_response" | "storage_unavailable" | "storage_corrupt"
  | "request_conflict" | "unresolved_attempt" | "attempt_missing" | "dispatch_unavailable" | "abandonment_proof_required";
export class IsolatedSandboxTipCheckoutJournalError extends Error {
  constructor(readonly code: ErrorCode) { super(`Isolated sandbox tip checkout journal: ${code}.`); this.name = "IsolatedSandboxTipCheckoutJournalError"; }
}
const fail = (code: ErrorCode): never => { throw new IsolatedSandboxTipCheckoutJournalError(code); };
const uuid = (v: unknown): v is string => typeof v === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u.test(v);
const row = (v: unknown): v is Row => !!v && typeof v === "object" && !Array.isArray(v);
const keys = (v: Row, list: readonly string[]) => Object.keys(v).length === list.length && list.every(k => Object.hasOwn(v, k));
const id = (v: unknown, kind: string): v is string => typeof v === "string" && v.startsWith(`scv1_${kind}_`) && uuid(v.slice(`scv1_${kind}_`.length));
const positive = (v: unknown) => typeof v === "number" && Number.isSafeInteger(v) && v > 0;
const choice = (v: unknown, options: readonly string[]) => typeof v === "string" && options.includes(v);
const timestamp = (v: unknown): v is string => typeof v === "string" && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,6})?(?:Z|[+-]\d{2}:\d{2})$/u.test(v) && Number.isFinite(Date.parse(v));
const freeze = <T>(v: T): T => { if (v && typeof v === "object") { Object.values(v).forEach(freeze); Object.freeze(v); } return v; };
const copy = <T>(v: T): T => freeze(JSON.parse(JSON.stringify(v)) as T);
const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);
const QUOTE_KEYS = ["offerId", "offerRevision", "resourceId", "resourceRevision", "creatorId", "kind", "amountMinor", "currency"];
function quote(value: unknown): IsolatedSandboxTipCheckoutQuote {
  if (!row(value) || !keys(value, QUOTE_KEYS) || !id(value.offerId, "offer") || !id(value.resourceId, "resource")
    || !positive(value.offerRevision) || !positive(value.resourceRevision) || !uuid(value.creatorId)
    || value.kind !== "creator_tip" || !positive(value.amountMinor) || typeof value.currency !== "string"
    || !/^[a-z]{3}$/u.test(value.currency)) return fail("invalid_request");
  return Object.fromEntries(QUOTE_KEYS.map(k => [k, value[k]])) as IsolatedSandboxTipCheckoutQuote;
}
function payload(attempt: IsolatedSandboxTipCheckoutAttempt): Row {
  return attempt.command === "checkout.prepare"
    ? { offerId: attempt.quote.offerId, expectedRevision: attempt.quote.offerRevision }
    : { intentId: attempt.payload.intentId, originalRequestId: attempt.prepareRequestId };
}
function tombstone(v: unknown, original: IsolatedSandboxTipCheckoutAttempt, intentId: string): v is Tombstone {
  return row(v) && keys(v, ["intentId", "originalRequestId", "originalSessionId", "abandonedBySessionId", "abandonedAt", "proof"])
    && v.intentId === intentId && v.originalRequestId === original.requestId && v.originalSessionId === original.sessionGeneration
    && uuid(v.abandonedBySessionId) && timestamp(v.abandonedAt) && v.proof === "undispatched_tombstone";
}
const sameTombstone = (a: Tombstone, b: Tombstone) => Object.keys(a).every(k => a[k as keyof Tombstone] === b[k as keyof Tombstone]);
function historyEntry(v: unknown, original: IsolatedSandboxTipCheckoutAttempt, currentSession: string): v is Row {
  const q = original.quote;
  if (!row(v) || !keys(v, ["id", "offerId", "offerRevision", "resourceId", "resourceRevision", "creatorId", "kind", "amountMinor", "currency", "status", "createdAt", "expiresAt",
    "originalSessionMatchesCurrent", "dispatchState", "receipt", "abandonment", "providerDispatchAllowed", "noDispatchProven"])
    || !id(v.id, "intent") || v.offerId !== q.offerId || v.resourceId !== q.resourceId || v.creatorId !== q.creatorId
    || v.kind !== "creator_tip" || !positive(v.amountMinor) || typeof v.currency !== "string" || !/^[a-z]{3}$/u.test(v.currency)
    || !positive(v.offerRevision) || !positive(v.resourceRevision)
    || !choice(v.status, ["prepared", "expired", "provider_pending", "verified", "failed", "abandoned"])
    || !timestamp(v.createdAt) || !timestamp(v.expiresAt) || Date.parse(v.expiresAt) < Date.parse(v.createdAt)
    || v.originalSessionMatchesCurrent !== (original.sessionGeneration === currentSession)
    || !choice(v.dispatchState, ["not_recorded", "claimed", "bound"]) || v.providerDispatchAllowed !== false
    || typeof v.noDispatchProven !== "boolean") return false;
  const receipt = v.receipt;
  if (receipt !== null && (!row(receipt) || !keys(receipt, ["id", "intentId", "status", "receiptType", "purchasedAt", "amountMinor", "currency", "grantsAccess", "notPayable"])
    || !id(receipt.id, "receipt") || receipt.intentId !== v.id || !choice(receipt.status, ["verified", "refunded", "revoked", "quarantined"])
    || receipt.receiptType !== "provider_verified" || !timestamp(receipt.purchasedAt) || receipt.amountMinor !== v.amountMinor
    || receipt.currency !== v.currency || receipt.grantsAccess !== false || receipt.notPayable !== true)) return false;
  if (v.abandonment !== null) return tombstone(v.abandonment, original, v.id) && v.status === "abandoned"
    && v.dispatchState === "not_recorded" && receipt === null && v.noDispatchProven === true;
  return v.noDispatchProven === false && v.status !== "abandoned";
}
function response(attempt: IsolatedSandboxTipCheckoutAttempt, original: IsolatedSandboxTipCheckoutAttempt, raw: unknown,
  recovery?: { requestId: string; sessionGeneration: string }): Observation {
  const session = recovery?.sessionGeneration ?? attempt.sessionGeneration;
  if (!row(raw) || !keys(raw, ["protocol", "environment", "command", "requestId", "actor", "status", "data"])
    || raw.protocol !== "sandbox-commerce-v1" || raw.environment !== "sandbox"
    || raw.command !== (recovery ? "request.read" : attempt.command) || raw.requestId !== (recovery?.requestId ?? attempt.requestId)
    || !row(raw.actor) || !keys(raw.actor, ["userId", "accountId", "sessionGeneration"])
    || raw.actor.userId !== attempt.userId || raw.actor.accountId !== attempt.userId || raw.actor.sessionGeneration !== session
    || !row(raw.data)) return fail("invalid_response");
  const data = raw.data;
  const unknown: Observation = { source: recovery ? "request.read" : "direct", observedSessionGeneration: session,
    intentId: null, status: "unknown", abandonment: null };
  if (raw.status !== "ok") {
    if (!choice(raw.status, ["held", "denied", "pending"]) || !keys(data, ["reason"])
      || typeof data.reason !== "string" || !/^[a-z][a-z0-9_]{0,95}$/u.test(data.reason)) return fail("invalid_response");
    return unknown;
  }
  let entry: Row;
  if (recovery) {
    if (!keys(data, ["resolution", "originalRequestId", "recordedCommand", "recordedSessionId", "recordedPayload", "resource", "offer", "entry", "declaration", "retryAllowed", "noDispatchProven"])
      || data.originalRequestId !== attempt.requestId || data.retryAllowed !== false || data.resource !== null || data.offer !== null || data.declaration !== null) return fail("invalid_response");
    if (data.resolution === "unknown" || data.resolution === "busy") {
      if ([data.recordedCommand, data.recordedSessionId, data.recordedPayload, data.entry].some(v => v !== null) || data.noDispatchProven !== false) return fail("invalid_response");
      return unknown;
    }
    const recorded = data.recordedPayload;
    if (data.resolution !== "found" || data.recordedCommand !== attempt.command || data.recordedSessionId !== attempt.sessionGeneration
      || !row(recorded) || !keys(recorded, ["protocol", "requestId", ...Object.keys(attempt.payload)])
      || recorded.protocol !== "sandbox-commerce-v1" || recorded.requestId !== attempt.requestId
      || Object.keys(attempt.payload).some(k => recorded[k] !== attempt.payload[k])
      || !historyEntry(data.entry, original, session) || data.noDispatchProven !== data.entry.noDispatchProven) return fail("invalid_response");
    entry = data.entry;
  } else if (attempt.command === "checkout.prepare") {
    const intent = data.intent;
    if (!keys(data, ["intent"]) || !row(intent) || !keys(intent, ["id", "offerId", "resourceId", "kind", "status", "providerDispatchAllowed"])
      || !id(intent.id, "intent") || intent.offerId !== attempt.quote.offerId || intent.resourceId !== attempt.quote.resourceId
      || intent.kind !== "creator_tip" || !choice(intent.status, ["prepared", "expired", "provider_pending", "verified", "failed"])
      || intent.providerDispatchAllowed !== false) return fail("invalid_response");
    // This response has IDs only. It cannot confirm the saved price/currency
    // or immutable revisions; only a fresh exact history projection can.
    return { ...unknown, intentId: intent.id };
  } else {
    if (!keys(data, ["entry", "abandonment", "noDispatchProven", "replacementAllowed", "retryAllowed"])
      || !historyEntry(data.entry, original, session) || data.noDispatchProven !== true || data.replacementAllowed !== true
      || data.retryAllowed !== false || data.entry.noDispatchProven !== true || data.entry.abandonment === null
      || !tombstone(data.abandonment, original, String(data.entry.id))
      || !sameTombstone(data.abandonment, data.entry.abandonment as Tombstone)) return fail("invalid_response");
    entry = data.entry;
  }
  if ((attempt.command === "checkout.abandon" && entry.id !== attempt.payload.intentId)
    || (original.result?.intentId && entry.id !== original.result.intentId)) return fail("invalid_response");
  const exactQuote = entry.offerRevision === original.quote.offerRevision && entry.resourceRevision === original.quote.resourceRevision
    && entry.amountMinor === original.quote.amountMinor && entry.currency === original.quote.currency;
  return { ...unknown, intentId: entry.id as string,
    status: entry.noDispatchProven ? "abandoned" : exactQuote ? "intent_prepared" : "unknown", abandonment: entry.abandonment as Tombstone | null };
}

const queues = new Map<string, Promise<void>>();
async function exclusive<T>(key: string, operation: () => Promise<T>): Promise<T> {
  const previous = queues.get(key) ?? Promise.resolve(); let release!: () => void;
  const current = new Promise<void>(resolve => { release = resolve; }); queues.set(key, current); await previous;
  try { return await operation(); } finally { release(); if (queues.get(key) === current) queues.delete(key); }
}
function parse(raw: string, userId: string): IsolatedSandboxTipCheckoutAttempt[] {
  try {
    if (raw.length > 2_000_000) return fail("storage_corrupt");
    const v: unknown = JSON.parse(raw);
    if (!row(v) || !keys(v, ["version", "userId", "attempts"]) || v.version !== 1 || v.userId !== userId || !Array.isArray(v.attempts)) return fail("storage_corrupt");
    const seen = new Map<string, IsolatedSandboxTipCheckoutAttempt>(); const abandoned = new Set<string>(); let unresolved = 0;
    return v.attempts.map((a: unknown) => {
      if (!row(a) || !keys(a, ["requestId", "userId", "sessionGeneration", "command", "prepareRequestId", "payload", "quote", "intentId", "state", "result"])
        || !uuid(a.requestId) || seen.has(a.requestId) || a.userId !== userId || !uuid(a.sessionGeneration) || !uuid(a.prepareRequestId)
        || !choice(a.command, ["checkout.prepare", "checkout.abandon"]) || !choice(a.state, ["prepared", "unknown", "intent_prepared", "abandoned", "not_applied"])
        || !row(a.payload)) return fail("storage_corrupt");
      const attempt = { ...a, quote: quote(a.quote) } as IsolatedSandboxTipCheckoutAttempt;
      if (attempt.quote.creatorId === userId || !same(payload(attempt), a.payload)) return fail("storage_corrupt");
      const original = attempt.command === "checkout.prepare" ? attempt : seen.get(attempt.prepareRequestId);
      if (!original || original.command !== "checkout.prepare" || original.prepareRequestId !== original.requestId
        || !same(original.quote, attempt.quote)) return fail("storage_corrupt");
      if (attempt.command === "checkout.abandon") {
        if (!id(attempt.payload.intentId, "intent") || !original.result?.intentId || original.result.intentId !== attempt.payload.intentId
          || (attempt.state !== "not_applied" && abandoned.has(original.requestId))) return fail("storage_corrupt");
        if (attempt.state !== "not_applied") abandoned.add(original.requestId);
      } else if (attempt.state !== "abandoned" && attempt.state !== "not_applied" && ++unresolved > 1) return fail("storage_corrupt");
      const r = attempt.result;
      if (r !== null) {
        if (!row(r) || !keys(r, ["source", "observedSessionGeneration", "intentId", "status", "abandonment"])
          || !choice(r.source, ["direct", "request.read", "pre_dispatch"]) || !uuid(r.observedSessionGeneration)
          || (r.source !== "request.read" && r.observedSessionGeneration !== attempt.sessionGeneration)
          || r.status !== attempt.state || !choice(r.status, ["unknown", "intent_prepared", "abandoned", "not_applied"])
          || (choice(r.status, ["intent_prepared", "abandoned"]) ? !id(r.intentId, "intent") : r.status === "unknown" ? r.intentId !== null && !id(r.intentId, "intent") : r.intentId !== null)
          || (r.status === "intent_prepared" && r.source !== "request.read")
          || (attempt.command === "checkout.abandon" && r.intentId !== null && r.intentId !== attempt.payload.intentId)
          || (r.source === "pre_dispatch") !== (r.status === "not_applied")
          || (r.status === "abandoned" ? !tombstone(r.abandonment, original, String(r.intentId)) : r.abandonment !== null)) return fail("storage_corrupt");
      } else if (!choice(attempt.state, ["prepared", "unknown"])) return fail("storage_corrupt");
      if (attempt.intentId !== (r?.intentId ?? null)) return fail("storage_corrupt");
      seen.set(attempt.requestId, attempt); return attempt;
    });
  } catch { return fail("storage_corrupt"); }
}

export function createIsolatedSandboxTipCheckoutJournal({ userId, storage = AsyncStorage }: {
  userId: string; storage?: IsolatedSandboxTipCheckoutStorage;
}) {
  if (!uuid(userId)) return fail("invalid_request");
  const key = `@chillywood/sandbox-commerce-v1/tip-checkout-attempts:${userId}`;
  // Fresh read capabilities are never restored from storage or inferred from
  // a prior confirmed quote. The backend still performs its final atomic CAS.
  const closeCapabilities = new Map<string, { intentId: string; sessionGeneration: string }>();
  async function read() {
    let raw: string | null; try { raw = await storage.getItem(key); } catch { return fail("storage_unavailable"); }
    return raw === null ? [] : parse(raw, userId);
  }
  async function write(attempts: IsolatedSandboxTipCheckoutAttempt[]) {
    const raw = JSON.stringify({ version: 1, userId, attempts });
    if (raw.length > 2_000_000) return fail("storage_unavailable");
    try { await storage.setItem(key, raw); if (await storage.getItem(key) !== raw) return fail("storage_unavailable"); }
    catch { return fail("storage_unavailable"); }
  }
  async function reconcile(requestId: string, value: unknown, recoveryBinding?: { requestId: string; sessionGeneration: string }) {
    if (!uuid(requestId) || (recoveryBinding !== undefined && (!row(recoveryBinding) || !keys(recoveryBinding, ["requestId", "sessionGeneration"])
      || !uuid(recoveryBinding.requestId) || !uuid(recoveryBinding.sessionGeneration)))) return fail("invalid_request");
    let snapshot: unknown; try { snapshot = copy(value); } catch { return fail("invalid_response"); }
    const recovery = recoveryBinding ? copy(recoveryBinding) : undefined;
    return exclusive(key, async () => {
      const rows = await read(); const index = rows.findIndex(a => a.requestId === requestId); if (index < 0) return fail("attempt_missing");
      const prior = rows[index]; const originalIndex = rows.findIndex(a => a.requestId === prior.prepareRequestId); const original = rows[originalIndex];
      const result = response(prior, original, snapshot, recovery);
      closeCapabilities.delete(original.requestId);
      if (prior.result?.intentId && result.intentId && prior.result.intentId !== result.intentId) return fail("invalid_response");
      if (result.abandonment && ((original.result?.abandonment && !sameTombstone(original.result.abandonment, result.abandonment))
        || (prior.result?.abandonment && !sameTombstone(prior.result.abandonment, result.abandonment)))) return fail("invalid_response");
      // Late, uncertain reads cannot erase established identity or a tombstone.
      if (prior.state === "abandoned" || prior.state === "not_applied" || (result.status === "unknown" && !result.intentId && prior.result?.intentId)
        || (result.source === "direct" && result.status === "unknown" && prior.state === "intent_prepared")) return copy(prior);
      rows[index] = { ...prior, state: result.status, intentId: result.intentId, result };
      if (result.status === "abandoned" && index !== originalIndex) rows[originalIndex] = { ...original, state: "abandoned",
        intentId: result.intentId, result: { ...result, source: "request.read" } };
      await write(rows); return copy(rows[index]);
    });
  }
  async function markUnknown(requestId: string) {
    if (!uuid(requestId)) return fail("invalid_request");
    return exclusive(key, async () => {
      const rows = await read(); const index = rows.findIndex(a => a.requestId === requestId); if (index < 0) return fail("attempt_missing");
      closeCapabilities.delete(rows[index].prepareRequestId);
      if (rows[index].state === "prepared") { rows[index] = { ...rows[index], state: "unknown" }; await write(rows); }
      return copy(rows[index]);
    });
  }
  async function add(make: (rows: IsolatedSandboxTipCheckoutAttempt[]) => IsolatedSandboxTipCheckoutAttempt) {
    return exclusive(key, async () => {
      const rows = await read(); const a = make(rows); const existing = rows.find(item => item.requestId === a.requestId);
      if (existing) {
        if (existing.command !== a.command || !same(existing.payload, a.payload) || !same(existing.quote, a.quote)) return fail("request_conflict");
        return Object.freeze({ attempt: copy(existing), mayDispatch: false, dispatch: null });
      }
      if (a.command === "checkout.prepare" && rows.some(item => item.command === "checkout.prepare" && item.state !== "abandoned" && item.state !== "not_applied")) return fail("unresolved_attempt");
      if (a.command === "checkout.abandon" && rows.some(item => item.command === "checkout.abandon"
        && item.prepareRequestId === a.prepareRequestId && item.state !== "not_applied")) return fail("unresolved_attempt");
      await write([...rows, a]); let used = false;
      const dispatch = async (send: () => Promise<unknown>) => {
        if (used || typeof send !== "function") return fail("dispatch_unavailable"); used = true;
        await exclusive(key, async () => {
          const current = await read(); const index = current.findIndex(item => item.requestId === a.requestId);
          if (index < 0 || current[index].state !== "prepared") return fail("dispatch_unavailable");
          current[index] = { ...current[index], state: "unknown" }; await write(current);
        });
        // The supplied current-session client must perform its own exact actor
        // fence before transport. Errors remain uncertain; no callback is retried.
        let outcome: unknown;
        try { outcome = await send(); }
        catch (error) {
          if (!(error instanceof IsolatedSandboxCommerceError) || error.requestId !== a.requestId
            || error.outcome !== "not_dispatched" || !choice(error.code, ["authority_retired", "invalid_request"])) throw error;
          return exclusive(key, async () => {
            const rows = await read(); const index = rows.findIndex(item => item.requestId === a.requestId);
            if (index < 0 || rows[index].state !== "unknown" || rows[index].result !== null) throw error;
            rows[index] = { ...rows[index], state: "not_applied", result: { source: "pre_dispatch",
              observedSessionGeneration: a.sessionGeneration, status: "not_applied", intentId: null, abandonment: null } };
            await write(rows); return copy(rows[index]);
          });
        }
        return reconcile(a.requestId, outcome);
      };
      return Object.freeze({ attempt: copy(a), mayDispatch: true, dispatch });
    });
  }
  return Object.freeze({
    async prepare(input: { requestId: string; sessionGeneration: string; quote: IsolatedSandboxTipCheckoutQuote }) {
      if (!row(input) || !keys(input, ["requestId", "sessionGeneration", "quote"]) || !uuid(input.requestId) || !uuid(input.sessionGeneration)) return fail("invalid_request");
      const q = quote(input.quote); if (q.creatorId === userId) return fail("invalid_request");
      const a: IsolatedSandboxTipCheckoutAttempt = copy({ requestId: input.requestId, userId, sessionGeneration: input.sessionGeneration,
        command: "checkout.prepare", prepareRequestId: input.requestId, payload: { offerId: q.offerId, expectedRevision: q.offerRevision }, quote: q, intentId: null, state: "prepared", result: null });
      return add(() => a);
    },
    async prepareAbandon(input: { requestId: string; sessionGeneration: string; originalRequestId: string; intentId: string }) {
      if (!row(input) || !keys(input, ["requestId", "sessionGeneration", "originalRequestId", "intentId"])
        || !uuid(input.requestId) || !uuid(input.sessionGeneration) || !uuid(input.originalRequestId) || !id(input.intentId, "intent")
        || input.requestId === input.originalRequestId) return fail("invalid_request");
      const snapshot = copy(input);
      return add(rows => {
        const original = rows.find(a => a.requestId === snapshot.originalRequestId && a.command === "checkout.prepare");
        if (!original || original.result?.intentId !== snapshot.intentId) return fail("attempt_missing");
        const existing = rows.find(a => a.requestId === snapshot.requestId);
        if (!existing && original.state === "abandoned") return fail("unresolved_attempt");
        if (!existing) {
          const capability = closeCapabilities.get(original.requestId); closeCapabilities.delete(original.requestId);
          if (!capability || capability.intentId !== snapshot.intentId || capability.sessionGeneration !== snapshot.sessionGeneration)
            return fail("abandonment_proof_required");
        }
        return copy({ requestId: snapshot.requestId, userId, sessionGeneration: snapshot.sessionGeneration,
          command: "checkout.abandon", prepareRequestId: original.requestId,
          payload: { intentId: snapshot.intentId, originalRequestId: original.requestId }, quote: original.quote, intentId: null, state: "prepared", result: null });
      });
    },
    async observeForAbandon(originalRequestId: string, serverResponse: unknown, binding: { requestId: string; sessionGeneration: string }) {
      // reconcile validates the exact read actor, original canonical request,
      // original session and resource/creator identity. Price/revision mismatch
      // stays unknown; a negative closure never adopts the server's new quote.
      if (!uuid(originalRequestId) || !row(binding) || !keys(binding, ["requestId", "sessionGeneration"])
        || !uuid(binding.requestId) || !uuid(binding.sessionGeneration)) return fail("invalid_request");
      let snapshot: unknown; try { snapshot = copy(serverResponse); } catch { return fail("invalid_response"); }
      const bound = copy(binding);
      await reconcile(originalRequestId, snapshot, bound);
      return exclusive(key, async () => {
        const rows = await read(); const original = rows.find(a => a.requestId === originalRequestId && a.command === "checkout.prepare");
        if (!original) return fail("attempt_missing");
        const observed = response(original, original, snapshot, bound);
        const data = row(snapshot) && row(snapshot.data) ? snapshot.data : null;
        const candidate = data && row(data.entry) ? data.entry : null;
        const mayRequestAbandon = original.state !== "abandoned" && original.state !== "not_applied" && !!observed.intentId
          && observed.intentId === original.intentId && !!candidate && choice(candidate.status, ["prepared", "expired"])
          && candidate.dispatchState === "not_recorded" && candidate.receipt === null && candidate.abandonment === null
          && !rows.some(a => a.command === "checkout.abandon" && a.prepareRequestId === originalRequestId && a.state !== "not_applied");
        closeCapabilities.delete(originalRequestId);
        if (mayRequestAbandon) closeCapabilities.set(originalRequestId, { intentId: observed.intentId!, sessionGeneration: bound.sessionGeneration });
        return Object.freeze({ attempt: copy(original), mayRequestAbandon });
      });
    },
    list: async (): Promise<readonly IsolatedSandboxTipCheckoutAttempt[]> => exclusive(key, async () => copy(await read())),
    markUnknown, reconcile,
  });
}
