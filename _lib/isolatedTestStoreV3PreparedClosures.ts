import AsyncStorage from "@react-native-async-storage/async-storage";
import { parsePaidVideoCheckoutV3Result, validPaidVideoCheckoutV3Payload, type PaidVideoCheckoutV3Payloads, type PaidVideoCheckoutV3Result } from "./isolatedPaidVideoCheckoutV3";
import { testStoreDigest, testStoreUuid } from "./isolatedTestStoreContract";
import { sameTestStoreV3Quote, validTestStoreV3NativePreparedClosure, type TestStoreV3NativePreparedClosure } from "./isolatedTestStoreV3Contract";

type Payload = PaidVideoCheckoutV3Payloads["close_prepared"];
type Response = PaidVideoCheckoutV3Result<"close_prepared"> | PaidVideoCheckoutV3Result<"recover_close_prepared">;
type Storage = { getItem(key: string): Promise<string | null>; setItem(key: string, value: string): Promise<unknown> };
export type TestStoreV3PreparedCloseAttempt = Readonly<{ requestId: string; sessionId: string; payload: Payload; nativeClosure: TestStoreV3NativePreparedClosure;
  state: "prepared" | "unknown" | "closed"; observation: null | { requestId: string; sessionId: string; response: Response } }>;
type Document = { version: 1; userId: string; installationId: string; configurationDigest: string; attempts: TestStoreV3PreparedCloseAttempt[] };
const queues = new Map<string, Promise<void>>();
let failedPersistence = false;
const row = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);
const keys = (v: Record<string, unknown>, expected: string[]) => Object.keys(v).length === expected.length && expected.every(k => Object.hasOwn(v, k));
const copy = <T,>(v: T): T => JSON.parse(JSON.stringify(v)) as T;
const freeze = <T,>(v: T): T => { if (v && typeof v === "object") { Object.values(v).forEach(freeze); Object.freeze(v); } return v; };
const same = (a: unknown, b: unknown) => JSON.stringify(a, (_k, v) => row(v) ? Object.fromEntries(Object.entries(v).sort(([a], [b]) => a.localeCompare(b))) : v)
  === JSON.stringify(b, (_k, v) => row(v) ? Object.fromEntries(Object.entries(v).sort(([a], [b]) => a.localeCompare(b))) : v);
const unavailable = (): never => { throw new Error("isolated_test_store_v3_prepared_closure_unavailable"); };

export function parseClosedTestStoreV3PreparedAttempt(value: unknown, expected: { userId: string; installationId: string; configurationDigest: string }): TestStoreV3PreparedCloseAttempt {
  if (!row(value) || !keys(value, ["requestId", "sessionId", "payload", "nativeClosure", "state", "observation"]) || value.state !== "closed"
    || !testStoreUuid(value.requestId) || !testStoreUuid(value.sessionId) || !validPaidVideoCheckoutV3Payload("close_prepared", value.payload)
    || !validTestStoreV3NativePreparedClosure(value.nativeClosure) || !row(value.observation) || !keys(value.observation, ["requestId", "sessionId", "response"])
    || !testStoreUuid(value.observation.requestId) || !testStoreUuid(value.observation.sessionId)) return unavailable();
  const p = value.payload as Payload, n = value.nativeClosure.invocation;
  const o = value.observation as { requestId: string; sessionId: string; response: unknown };
  if (n.buyerId !== expected.userId || n.installationId !== expected.installationId || n.configurationDigest !== expected.configurationDigest
    || n.customerBindingId !== p.customerBindingId || n.invocationId !== p.dispatchId || n.registrationId !== p.registrationId
    || n.sessionId !== p.originalSessionId || !sameTestStoreV3Quote(n.quote, p.expectedQuote) || n.quote.creatorId === expected.userId) return unavailable();
  if (!row(o.response)) return unavailable();
  const recovery = o.response.command === "recover_close_prepared";
  const response = recovery
    ? parsePaidVideoCheckoutV3Result(o.response, { command: "recover_close_prepared", requestId: o.requestId, actor: { userId: expected.userId, sessionId: o.sessionId }, configurationDigest: expected.configurationDigest, payload: { originalRequestId: value.requestId } })
    : parsePaidVideoCheckoutV3Result(o.response, { command: "close_prepared", requestId: value.requestId, actor: { userId: expected.userId, sessionId: value.sessionId }, configurationDigest: expected.configurationDigest, payload: p });
  if (response.status !== "ok" || response.data.closure.allocationId !== n.allocationId
    || !recovery && (o.requestId !== value.requestId || o.sessionId !== value.sessionId)) return unavailable();
  if (recovery && (!("originalPayload" in response.data) || response.data.originalSessionId !== value.sessionId || !same(response.data.originalPayload, p))) return unavailable();
  return freeze(copy(value as unknown as TestStoreV3PreparedCloseAttempt));
}

/** Native closure only establishes that this exact app-owned invocation never
 * began. The separate authenticated server closure proves claim absence and
 * fences future claims. Neither a missing row nor a native tombstone replaces it. */
export function createTestStoreV3PreparedClosureJournal({ userId, installationId, configurationDigest, storage = AsyncStorage }: {
  userId: string; installationId: string; configurationDigest: string; storage?: Storage;
}) {
  if (!testStoreUuid(userId) || !testStoreUuid(installationId) || !testStoreDigest(configurationDigest)) return unavailable();
  const key = `@chillywood/isolated-test-store-v3/prepared-closures:${installationId}:${configurationDigest}`;
  async function exclusive<T>(operation: () => Promise<T>) {
    const prior = queues.get(key) ?? Promise.resolve(); let release!: () => void;
    const next = new Promise<void>(done => { release = done; }); queues.set(key, next); await prior;
    try { return await operation(); } finally { release(); if (queues.get(key) === next) queues.delete(key); }
  }
  function bound(attempt: Pick<TestStoreV3PreparedCloseAttempt, "payload" | "nativeClosure">) {
    const p = attempt.payload, c = attempt.nativeClosure;
    if (!validPaidVideoCheckoutV3Payload("close_prepared", p) || !validTestStoreV3NativePreparedClosure(c)) return false;
    const n = c.invocation;
    return n.buyerId === userId && n.installationId === installationId && n.configurationDigest === configurationDigest
      && n.customerBindingId === p.customerBindingId && n.invocationId === p.dispatchId && n.registrationId === p.registrationId
      && n.sessionId === p.originalSessionId && sameTestStoreV3Quote(n.quote, p.expectedQuote) && n.quote.creatorId !== userId;
  }
  function observed(attempt: TestStoreV3PreparedCloseAttempt, value: unknown, binding?: { requestId: string; sessionId: string }): Response {
    const response = binding
      ? parsePaidVideoCheckoutV3Result(value, { command: "recover_close_prepared", requestId: binding.requestId, actor: { userId, sessionId: binding.sessionId }, configurationDigest, payload: { originalRequestId: attempt.requestId } })
      : parsePaidVideoCheckoutV3Result(value, { command: "close_prepared", requestId: attempt.requestId, actor: { userId, sessionId: attempt.sessionId }, configurationDigest, payload: attempt.payload });
    if (response.status === "ok") {
      if (response.command === "recover_close_prepared") {
        const data = response.data as PaidVideoCheckoutV3Result<"recover_close_prepared">["data"];
        if (!("originalPayload" in data) || data.originalSessionId !== attempt.sessionId || !same(data.originalPayload, attempt.payload)) return unavailable();
      }
      if (response.data.closure.allocationId !== attempt.nativeClosure.invocation.allocationId) return unavailable();
    }
    return response;
  }
  async function read(): Promise<Document> {
    const raw = await storage.getItem(key);
    if (raw === null) return { version: 1, userId, installationId, configurationDigest, attempts: [] };
    if (raw.length > 750_000) return unavailable();
    const value: unknown = JSON.parse(raw);
    if (!row(value) || !keys(value, ["version", "userId", "installationId", "configurationDigest", "attempts"]) || value.version !== 1 || value.userId !== userId
      || value.installationId !== installationId || value.configurationDigest !== configurationDigest || !Array.isArray(value.attempts) || value.attempts.length > 128) return unavailable();
    const seen = new Set<string>(), intents = new Map<string, TestStoreV3PreparedCloseAttempt>();
    for (const item of value.attempts) {
      if (!row(item) || !keys(item, ["requestId", "sessionId", "payload", "nativeClosure", "state", "observation"]) || !testStoreUuid(item.requestId)
        || !testStoreUuid(item.sessionId) || seen.has(item.requestId) || !["prepared", "unknown", "closed"].includes(String(item.state))) return unavailable();
      const a = item as unknown as TestStoreV3PreparedCloseAttempt;
      const prior = intents.get(a.payload.intentId);
      if (!bound(a) || prior && (!same(prior.payload, a.payload) || !same(prior.nativeClosure, a.nativeClosure))) return unavailable();
      seen.add(a.requestId); intents.set(a.payload.intentId, a);
      if (a.observation) {
        if (!row(a.observation) || !keys(a.observation, ["requestId", "sessionId", "response"]) || !testStoreUuid(a.observation.requestId) || !testStoreUuid(a.observation.sessionId)) return unavailable();
        const binding = a.observation.response.command === "recover_close_prepared" ? a.observation : undefined;
        const parsed = observed(a, a.observation.response, binding);
        if ((a.state === "closed") !== (parsed.status === "ok")) return unavailable();
        if (!binding && (a.observation.requestId !== a.requestId || a.observation.sessionId !== a.sessionId)) return unavailable();
        if (a.state === "closed") parseClosedTestStoreV3PreparedAttempt(a, { userId, installationId, configurationDigest });
      } else if (a.state === "closed") return unavailable();
    }
    return value as unknown as Document;
  }
  async function write(value: Document) {
    if (failedPersistence) return unavailable(); const raw = JSON.stringify(value);
    try { await storage.setItem(key, raw); if (await storage.getItem(key) !== raw) throw Error("readback"); }
    catch { failedPersistence = true; return unavailable(); }
  }
  async function reconcile(requestId: string, response: unknown, binding?: { requestId: string; sessionId: string }) {
    const value = copy(response), expected = binding && copy(binding);
    return exclusive(async () => {
      const d = await read(), index = d.attempts.findIndex(a => a.requestId === requestId); if (index < 0) return unavailable();
      const a = d.attempts[index], parsed = observed(a, value, expected);
      // A later unavailable/missing read cannot erase an immutable closure.
      if (a.state === "closed") {
        if (parsed.status === "ok" && !same(a.observation!.response.data.closure, parsed.data.closure)) return unavailable();
        return freeze(copy(a));
      }
      const next: TestStoreV3PreparedCloseAttempt = { ...a, state: parsed.status === "ok" ? "closed" : "unknown",
        observation: { requestId: expected?.requestId ?? requestId, sessionId: expected?.sessionId ?? a.sessionId, response: parsed } };
      d.attempts[index] = next; await write(d); return freeze(copy(next));
    });
  }
  return Object.freeze({
    list: () => exclusive(async () => freeze(copy((await read()).attempts))),
    reconcile,
    async prepare(input: { requestId: string; sessionId: string; payload: Payload; nativeClosure: TestStoreV3NativePreparedClosure }) {
      const expected = copy(input);
      if (!row(expected) || !keys(expected, ["requestId", "sessionId", "payload", "nativeClosure"]) || !testStoreUuid(expected.requestId) || !testStoreUuid(expected.sessionId) || !bound(expected)) return unavailable();
      return exclusive(async () => {
        const d = await read(), existingId = d.attempts.find(a => a.requestId === expected.requestId);
        const existing = d.attempts.filter(a => a.payload.intentId === expected.payload.intentId);
        if (existing.some(a => !same(a.payload, expected.payload) || !same(a.nativeClosure, expected.nativeClosure))) return unavailable();
        const completed = existing.find(a => a.state === "closed");
        if (existingId) {
          if (!same(existingId.payload, expected.payload) || !same(existingId.nativeClosure, expected.nativeClosure) || existingId.sessionId !== expected.sessionId) return unavailable();
          return { attempt: freeze(copy(existingId)), mayDispatch: false, dispatch: null };
        }
        if (completed) return { attempt: freeze(copy(completed)), mayDispatch: false, dispatch: null };
        if (d.attempts.length >= 128 || failedPersistence) return unavailable();
        const attempt: TestStoreV3PreparedCloseAttempt = { ...expected, state: "prepared", observation: null }; d.attempts.push(attempt); await write(d);
        let used = false;
        return { attempt: freeze(copy(attempt)), mayDispatch: true, dispatch: async (send: (payload: Payload) => Promise<unknown>) => {
          if (used) return unavailable(); used = true;
          await exclusive(async () => { const latest = await read(), index = latest.attempts.findIndex(a => a.requestId === expected.requestId);
            if (index < 0 || latest.attempts[index].state !== "prepared") return unavailable();
            latest.attempts[index] = { ...latest.attempts[index], state: "unknown" }; await write(latest); });
          return reconcile(expected.requestId, await send(freeze(copy(expected.payload))));
        } };
      });
    },
  });
}
