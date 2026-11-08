import AsyncStorage from "@react-native-async-storage/async-storage";
import { testStoreDigest, testStoreUuid } from "./isolatedTestStoreContract";
import { sameTestStoreV3Quote, validTestStoreV3Quote, type TestStoreV3Quote } from "./isolatedTestStoreV3Contract";
import { PaidVideoCheckoutV3Error, parsePaidVideoCheckoutV3Closure, parsePaidVideoCheckoutV3Intent, parsePaidVideoCheckoutV3Result, type PaidVideoCheckoutV3Closure, type PaidVideoCheckoutV3Intent, type PaidVideoCheckoutV3Payloads } from "./isolatedPaidVideoCheckoutV3";

export type PaidVideoCheckoutV3Storage = { getItem(key: string): Promise<string | null>; setItem(key: string, value: string): Promise<unknown> };
export type PaidVideoCheckoutV3Attempt = Readonly<{ command: "prepare"; requestId: string; userId: string; sessionGeneration: string; configurationDigest: string;
  quote: TestStoreV3Quote; state: "prepared" | "unknown" | "intent_prepared" | "observed" | "not_applied" | "closed";
  intentId: string | null; intent: PaidVideoCheckoutV3Intent | null; observedSessionGeneration: string | null;
  closure: PaidVideoCheckoutV3Closure | null; closureAttempts: { requestId: string; sessionGeneration: string; state: "prepared" | "unknown" | "recorded" }[] }>;
export type PaidVideoCheckoutV3AttemptInput = { requestId: string; sessionGeneration: string; quote: TestStoreV3Quote };
type Code = "invalid_request" | "invalid_response" | "request_conflict" | "unresolved_attempt" | "storage_unavailable" | "storage_corrupt" | "attempt_missing" | "capability_consumed";
export class PaidVideoCheckoutV3JournalError extends Error { constructor(readonly code: Code) { super(`Paid Video v3 preparation: ${code}.`); } }
const fail = (code: Code): never => { throw new PaidVideoCheckoutV3JournalError(code); };
type Row = Record<string, unknown>;
const row = (v: unknown): v is Row => !!v && typeof v === "object" && !Array.isArray(v);
const keys = (v: unknown, names: readonly string[]): v is Row => row(v) && Object.keys(v).sort().join(",") === [...names].sort().join(",");
const choice = (v: unknown, values: readonly string[]) => typeof v === "string" && values.includes(v);
function freeze<T>(v: T): T { if (v && typeof v === "object") { Object.values(v).forEach(freeze); Object.freeze(v); } return v; }
const copy = <T,>(v: T): T => freeze(JSON.parse(JSON.stringify(v)) as T);
/** A server tombstone, never a missing read or local refusal, can close an
 * allocation attempt that never acquired an allocation. Retain its full binding. */
export function parseClosedPaidVideoCheckoutV3Attempt(value: unknown, expected: { userId: string; configurationDigest: string }): PaidVideoCheckoutV3Attempt {
  if (!keys(value, ["command", "requestId", "userId", "sessionGeneration", "configurationDigest", "quote", "state", "intentId", "intent", "observedSessionGeneration", "closure", "closureAttempts"])
    || value.command !== "prepare" || value.state !== "closed" || value.userId !== expected.userId || value.configurationDigest !== expected.configurationDigest
    || !testStoreUuid(value.requestId) || !testStoreUuid(value.sessionGeneration) || !testStoreUuid(value.observedSessionGeneration)
    || !validTestStoreV3Quote(value.quote) || value.quote.creatorId === expected.userId
    || !Array.isArray(value.closureAttempts) || value.closureAttempts.length < 1 || value.closureAttempts.length > 64) return fail("invalid_response");
  const intent = parsePaidVideoCheckoutV3Intent(value.intent);
  parsePaidVideoCheckoutV3Closure(value.closure, { originalRequestId: value.requestId, originalSessionId: value.sessionGeneration, configurationDigest: expected.configurationDigest });
  if (intent.id !== value.intentId || intent.state !== "expired" || intent.receipt !== null || intent.grantId !== null
    || !sameTestStoreV3Quote(intent.quote, value.quote) || Date.parse((value.closure as PaidVideoCheckoutV3Closure).closedAt) < Date.parse(intent.createdAt)) return fail("invalid_response");
  const seen = new Set<string>();
  for (const action of value.closureAttempts) {
    if (!keys(action, ["requestId", "sessionGeneration", "state"]) || !testStoreUuid(action.requestId) || seen.has(action.requestId)
      || !testStoreUuid(action.sessionGeneration) || !choice(action.state, ["prepared", "unknown", "recorded"])) return fail("invalid_response");
    seen.add(action.requestId);
  }
  if (!value.closureAttempts.some(a => a.state === "recorded" && a.sessionGeneration === value.observedSessionGeneration)) return fail("invalid_response");
  return copy(value as unknown as PaidVideoCheckoutV3Attempt);
}
const queues = new Map<string, Promise<void>>(), poisoned = new Set<string>();
async function exclusive<T>(key: string, operation: () => Promise<T>) {
  const previous = queues.get(key) ?? Promise.resolve(); let release!: () => void;
  const next = new Promise<void>(resolve => { release = resolve; }); queues.set(key, next); await previous;
  try { return await operation(); } finally { release(); if (queues.get(key) === next) queues.delete(key); }
}
/** Preparation history is not permission to purchase. Direct replies retain
 * known intent identity; fresh original-request recovery must confirm the full
 * quote and asset before a separate allocation can be considered. */
export function createPaidVideoCheckoutV3Journal({ userId, configurationDigest, storage = AsyncStorage, now = Date.now }: {
  userId: string; configurationDigest: string; storage?: PaidVideoCheckoutV3Storage; now?(): number;
}) {
  if (!testStoreUuid(userId) || !testStoreDigest(configurationDigest)) return fail("invalid_request");
  const key = `@chillywood/isolated-paid-video-checkout:v3:${userId}:${configurationDigest}`;
  function validate(value: unknown): PaidVideoCheckoutV3Attempt[] {
    if (!keys(value, ["version", "userId", "configurationDigest", "attempts"]) || value.version !== 3 || value.userId !== userId
      || value.configurationDigest !== configurationDigest || !Array.isArray(value.attempts) || value.attempts.length > 128) return fail("storage_corrupt");
    const seen = new Set<string>();
    return value.attempts.map((v: unknown) => {
      if (!keys(v, ["command", "requestId", "userId", "sessionGeneration", "configurationDigest", "quote", "state", "intentId", "intent", "observedSessionGeneration", "closure", "closureAttempts"])
        || v.command !== "prepare" || !testStoreUuid(v.requestId) || seen.has(v.requestId) || v.userId !== userId || !testStoreUuid(v.sessionGeneration)
        || v.configurationDigest !== configurationDigest || !validTestStoreV3Quote(v.quote) || v.quote.creatorId === userId
        || !choice(v.state, ["prepared", "unknown", "intent_prepared", "observed", "not_applied", "closed"])
        || !(v.observedSessionGeneration === null || testStoreUuid(v.observedSessionGeneration))) return fail("storage_corrupt");
      seen.add(v.requestId);
      if (v.intent !== null) {
        const intent = parsePaidVideoCheckoutV3Intent(v.intent); if (v.intentId !== intent.id || !sameTestStoreV3Quote(intent.quote, v.quote)) return fail("storage_corrupt");
      } else if (v.intentId !== null || v.observedSessionGeneration !== null) return fail("storage_corrupt");
      if (v.state === "prepared" || v.state === "not_applied") { if (v.intent !== null) return fail("storage_corrupt"); }
      if ((v.state === "intent_prepared" || v.state === "observed") && (v.intent === null || v.observedSessionGeneration === null)) return fail("storage_corrupt");
      if (!Array.isArray(v.closureAttempts) || v.closureAttempts.length > 64) return fail("storage_corrupt");
      const actionIds = new Set<string>();
      for (const action of v.closureAttempts) {
        if (!keys(action, ["requestId", "sessionGeneration", "state"]) || !testStoreUuid(action.requestId) || actionIds.has(action.requestId)
          || !testStoreUuid(action.sessionGeneration) || !choice(action.state, ["prepared", "unknown", "recorded"]) || v.intent === null) return fail("storage_corrupt");
        actionIds.add(action.requestId);
      }
      if (v.closure !== null) {
        parsePaidVideoCheckoutV3Closure(v.closure, { originalRequestId: v.requestId, originalSessionId: v.sessionGeneration, configurationDigest });
        if (v.state !== "closed" || !row(v.intent) || v.intent.state !== "expired" || v.intent.receipt !== null || v.intent.grantId !== null
          || !v.closureAttempts.some(a => a.state === "recorded")) return fail("storage_corrupt");
      } else if (v.state === "closed" || v.closureAttempts.some(a => a.state === "recorded")) return fail("storage_corrupt");
      return v as unknown as PaidVideoCheckoutV3Attempt;
    });
  }
  async function read() {
    let raw: string | null; try { raw = await storage.getItem(key); } catch { return fail("storage_unavailable"); }
    if (raw === null) return [];
    try { if (raw.length > 1_500_000) return fail("storage_corrupt"); return validate(JSON.parse(raw)); } catch { return fail("storage_corrupt"); }
  }
  async function write(items: PaidVideoCheckoutV3Attempt[]) {
    if (poisoned.has(key)) return fail("storage_unavailable");
    try { const raw = JSON.stringify({ version: 3, userId, configurationDigest, attempts: items }); validate(JSON.parse(raw));
      await storage.setItem(key, raw); if (await storage.getItem(key) !== raw) return fail("storage_unavailable"); }
    catch { poisoned.add(key); return fail("storage_unavailable"); }
  }
  async function update(requestId: string, operation: (prior: PaidVideoCheckoutV3Attempt) => PaidVideoCheckoutV3Attempt) {
    return exclusive(key, async () => { const items = await read(), index = items.findIndex(a => a.requestId === requestId); if (index < 0) return fail("attempt_missing");
      const next = operation(items[index]); if (next !== items[index]) { items[index] = next; await write(items); } return copy(items[index]); });
  }
  function retain(prior: PaidVideoCheckoutV3Attempt, intent: PaidVideoCheckoutV3Intent, observedSession: string, confirmed: boolean): PaidVideoCheckoutV3Attempt {
    if (!sameTestStoreV3Quote(intent.quote, prior.quote) || prior.intentId !== null && prior.intentId !== intent.id) return fail("invalid_response");
    if (prior.closure) return prior;
    if (prior.intent?.receipt && intent.receipt && (prior.intent.receipt.id !== intent.receipt.id || prior.intent.receipt.originalTransactionId !== intent.receipt.originalTransactionId
      || prior.intent.receipt.purchasedAt !== intent.receipt.purchasedAt)) return fail("invalid_response");
    if (prior.intent?.receipt && (!intent.receipt || prior.intent.receipt.state !== "verified" && intent.receipt.state === "verified")) return prior;
    if (prior.intent && prior.intent.state !== "prepared" && intent.state === "prepared") return prior;
    const ready = confirmed && intent.state === "prepared" && intent.receipt === null && Date.parse(intent.expiresAt) > now();
    return { ...prior, intentId: intent.id, intent, observedSessionGeneration: observedSession,
      state: prior.closureAttempts.length ? "unknown" : ready ? "intent_prepared" : confirmed ? "observed" : "unknown" };
  }
  return Object.freeze({
    list: async () => exclusive(key, async () => copy(await read())),
    async prepare(input: PaidVideoCheckoutV3AttemptInput) {
      if (!keys(input, ["requestId", "sessionGeneration", "quote"]) || !testStoreUuid(input.requestId) || !testStoreUuid(input.sessionGeneration)
        || !validTestStoreV3Quote(input.quote) || input.quote.creatorId === userId) return fail("invalid_request");
      const attempt: PaidVideoCheckoutV3Attempt = copy({ ...input, command: "prepare", userId, configurationDigest, state: "prepared", intentId: null, intent: null, observedSessionGeneration: null, closure: null, closureAttempts: [] });
      return exclusive(key, async () => {
        if (poisoned.has(key)) return fail("storage_unavailable"); const items = await read(), old = items.find(a => a.requestId === input.requestId);
        if (old) { if (!sameTestStoreV3Quote(old.quote, attempt.quote) || old.sessionGeneration !== attempt.sessionGeneration) return fail("request_conflict"); return { attempt: copy(old), mayDispatch: false, dispatch: null }; }
        if (items.some(a => a.state !== "not_applied" && a.state !== "closed")) return fail("unresolved_attempt");
        await write([...items, attempt]); let consumed = false;
        const dispatch = async (send: () => Promise<unknown>) => {
          if (consumed) return fail("capability_consumed"); consumed = true;
          await update(attempt.requestId, prior => { if (prior.state !== "prepared") return fail("capability_consumed"); return { ...prior, state: "unknown" }; });
          let raw: unknown;
          try { raw = await send(); }
          catch (error) {
            if (error instanceof PaidVideoCheckoutV3Error && error.requestId === attempt.requestId && error.outcome === "not_sent" && choice(error.code, ["authority_retired", "invalid_request"]))
              return update(attempt.requestId, prior => prior.intentId === null && prior.state === "unknown" ? { ...prior, state: "not_applied" } : prior);
            return update(attempt.requestId, prior => prior);
          }
          let result; try { result = parsePaidVideoCheckoutV3Result(raw, { command: "prepare", requestId: attempt.requestId,
            actor: { userId, sessionId: attempt.sessionGeneration }, configurationDigest, payload: { offerId: attempt.quote.offerId, expectedQuote: attempt.quote } }); }
          catch { return update(attempt.requestId, prior => prior); }
          if (result.status !== "ok") return update(attempt.requestId, prior => prior);
          return update(attempt.requestId, prior => retain(prior, result.data.intent, attempt.sessionGeneration, false));
        };
        return { attempt: copy(attempt), mayDispatch: true, dispatch };
      });
    },
    async reconcile(requestId: string, value: unknown, binding: { requestId: string; sessionGeneration: string }) {
      if (!testStoreUuid(requestId) || !keys(binding, ["requestId", "sessionGeneration"]) || !testStoreUuid(binding.requestId) || !testStoreUuid(binding.sessionGeneration)) return fail("invalid_request");
      let result; try { result = parsePaidVideoCheckoutV3Result(copy(value), { command: "recover", requestId: binding.requestId,
        actor: { userId, sessionId: binding.sessionGeneration }, configurationDigest, payload: { originalRequestId: requestId } }); } catch { return fail("invalid_response"); }
      return update(requestId, prior => {
        if (result.status === "unknown") return prior.state === "prepared" ? { ...prior, state: "unknown" } : prior;
        if (result.data.originalSessionId !== prior.sessionGeneration || result.data.originalPayload.offerId !== prior.quote.offerId
          || !sameTestStoreV3Quote(result.data.originalPayload.expectedQuote, prior.quote) || prior.state === "not_applied") return fail("invalid_response");
        return retain(prior, result.data.intent, binding.sessionGeneration, true);
      });
    },
    async prepareAbandon(input: { requestId: string; sessionGeneration: string; originalRequestId: string }) {
      const expected = copy(input);
      if (!keys(expected, ["requestId", "sessionGeneration", "originalRequestId"]) || !testStoreUuid(expected.requestId)
        || !testStoreUuid(expected.sessionGeneration) || !testStoreUuid(expected.originalRequestId)) return fail("invalid_request");
      return exclusive(key, async () => {
        const items = await read(), index = items.findIndex(a => a.requestId === expected.originalRequestId), prior = items[index];
        if (!prior || !prior.intentId || !prior.intent || prior.intent.receipt || !["prepared", "expired"].includes(prior.intent.state)
          || prior.observedSessionGeneration !== expected.sessionGeneration || prior.state === "not_applied") return fail("unresolved_attempt");
        if (prior.closure || prior.closureAttempts.some(a => a.requestId === expected.requestId)) return { attempt: copy(prior), mayDispatch: false, dispatch: null };
        if (items.some(a => a.requestId === expected.requestId || a.closureAttempts.some(c => c.requestId === expected.requestId)) || prior.closureAttempts.length >= 64) return fail("request_conflict");
        const payload: PaidVideoCheckoutV3Payloads["abandon"] = copy({ originalRequestId: prior.requestId, originalSessionId: prior.sessionGeneration, intentId: prior.intentId, expectedQuote: prior.quote });
        const prepared = { ...prior, closureAttempts: [...prior.closureAttempts, { requestId: expected.requestId, sessionGeneration: expected.sessionGeneration, state: "prepared" as const }] };
        items[index] = prepared; await write(items); let consumed = false;
        return { attempt: copy(prepared), mayDispatch: true, dispatch: async (send: (payload: PaidVideoCheckoutV3Payloads["abandon"]) => Promise<unknown>) => {
          if (consumed) return fail("capability_consumed"); consumed = true;
          await update(prior.requestId, current => {
            if (current.closure || current.closureAttempts.find(a => a.requestId === expected.requestId)?.state !== "prepared") return fail("capability_consumed");
            return { ...current, state: "unknown", closureAttempts: current.closureAttempts.map(a => a.requestId === expected.requestId ? { ...a, state: "unknown" } : a) };
          });
          let response;
          try { response = parsePaidVideoCheckoutV3Result(await send(payload), { command: "abandon", requestId: expected.requestId,
            actor: { userId, sessionId: expected.sessionGeneration }, configurationDigest, payload }); }
          catch { return update(prior.requestId, current => current); }
          if (response.status !== "ok") return update(prior.requestId, current => current);
          const data = response.data;
          return update(prior.requestId, current => {
            if (current.closure && Object.keys(current.closure).some(k => current.closure![k as keyof PaidVideoCheckoutV3Closure] !== data.closure[k as keyof PaidVideoCheckoutV3Closure])) return fail("invalid_response");
            return { ...current, intent: data.intent, state: "closed", observedSessionGeneration: expected.sessionGeneration, closure: data.closure,
              closureAttempts: current.closureAttempts.map(a => a.requestId === expected.requestId ? { ...a, state: "recorded" } : a) };
          });
        } };
      });
    },
  });
}
