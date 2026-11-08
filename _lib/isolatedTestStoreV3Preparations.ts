import AsyncStorage from "@react-native-async-storage/async-storage";
import { createPaidVideoCheckoutV3Journal, type PaidVideoCheckoutV3Attempt, type PaidVideoCheckoutV3Storage } from "./isolatedPaidVideoCheckoutV3Attempts";
import { testStoreDigest, testStoreUuid } from "./isolatedTestStoreContract";
import { validTestStoreV3Quote, sameTestStoreV3Quote, type TestStoreV3Quote } from "./isolatedTestStoreV3Contract";
import { createIsolatedTestStoreV3AttemptJournal } from "./isolatedTestStoreV3Attempts";

/** Full-asset preparations use a distinct V3 journal. A subsequent intent
 * requires explicit provider continuation; unknown preparation is never a
 * cancellation/no-charge proof. */
type Entry = { requestId: string; sessionId: string; quote: TestStoreV3Quote };
type Index = { version: 3; userId: string; configurationDigest: string; installationId: string; entries: Entry[] };
export type TestStoreV3Preparation = Entry & { attempt: PaidVideoCheckoutV3Attempt | null };
const INDEX_KEY = "@chillywood/isolated-test-store-v3/core-preparation-index";
const queues = new Map<string, Promise<void>>();
let persistenceFailed = false;
async function exclusive<T>(operation: () => Promise<T>) {
  const previous = queues.get(INDEX_KEY) ?? Promise.resolve(); let release!: () => void;
  const next = new Promise<void>(resolve => { release = resolve; }); queues.set(INDEX_KEY, next); await previous;
  try { return await operation(); } finally { release(); if (queues.get(INDEX_KEY) === next) queues.delete(INDEX_KEY); }
}
const row = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);
const keys = (v: Record<string, unknown>, expected: string[]) => Object.keys(v).length === expected.length && expected.every(k => Object.hasOwn(v, k));
const copy = <T>(v: T): T => JSON.parse(JSON.stringify(v)) as T;
const fail = (): never => { throw new Error("isolated_test_store_v3_preparation_unavailable"); };
export function createIsolatedTestStoreV3Preparations({ userId, configurationDigest, installationId, storage = AsyncStorage, now = Date.now }: {
  userId: string; configurationDigest: string; installationId: string; storage?: PaidVideoCheckoutV3Storage; now?(): number;
}) {
  if (!testStoreUuid(userId) || !testStoreDigest(configurationDigest) || !testStoreUuid(installationId)) return fail();
  const provider = createIsolatedTestStoreV3AttemptJournal({ userId, installationId, configurationDigest, storage });
  const cores = new Map<string, ReturnType<typeof createPaidVideoCheckoutV3Journal>>();
  async function read(): Promise<Index | null> {
    const raw = await storage.getItem(INDEX_KEY); if (raw === null) return null;
    if (typeof raw !== "string" || raw.length > 200_000) return fail();
    let value: unknown; try { value = JSON.parse(raw); } catch { return fail(); }
    if (!row(value) || !keys(value, ["version", "userId", "configurationDigest", "installationId", "entries"])
      || value.version !== 3 || value.userId !== userId || value.configurationDigest !== configurationDigest || value.installationId !== installationId
      || !Array.isArray(value.entries) || value.entries.length > 128) return fail();
    const seen = new Set<string>();
    for (const entry of value.entries) {
      if (!row(entry) || !keys(entry, ["requestId", "sessionId", "quote"]) || !testStoreUuid(entry.requestId) || seen.has(entry.requestId)
        || !testStoreUuid(entry.sessionId) || !validTestStoreV3Quote(entry.quote) || entry.quote.creatorId === userId) return fail();
      seen.add(entry.requestId);
    }
    return value as Index;
  }
  const core = (requestId: string) => {
    const existing = cores.get(requestId); if (existing) return existing;
    const prefix = `@chillywood/isolated-test-store-v3/core:${installationId}:${configurationDigest}:${requestId}:`;
    const journal = createPaidVideoCheckoutV3Journal({ userId, configurationDigest, now, storage: {
      getItem: key => storage.getItem(prefix + key), setItem: (key, value) => storage.setItem(prefix + key, value),
    } });
    cores.set(requestId, journal); return journal;
  };
  async function entries(index: Index | null): Promise<TestStoreV3Preparation[]> {
    return Promise.all((index?.entries ?? []).map(async entry => {
      const rows = await core(entry.requestId).list();
      const attempt = rows.find(a => a.command === "prepare" && a.requestId === entry.requestId) ?? null;
      if (attempt && (attempt.sessionGeneration !== entry.sessionId || !sameTestStoreV3Quote(attempt.quote, entry.quote))) return fail();
      return { ...copy(entry), attempt };
    }));
  }
  async function ownedEntry(requestId: string) {
    if (!testStoreUuid(requestId)) return fail();
    const index = await read(), entry = index?.entries.find(a => a.requestId === requestId);
    if (!entry) return fail(); return { index: index!, entry };
  }
  return Object.freeze({
    async list() { return exclusive(async () => entries(await read())); },
    async prepareNew(input: { requestId: string; sessionId: string; quote: TestStoreV3Quote }) {
      const expected = copy(input);
      if (!row(expected) || !keys(expected, ["requestId", "sessionId", "quote"]) || !testStoreUuid(expected.requestId)
        || !testStoreUuid(expected.sessionId) || !validTestStoreV3Quote(expected.quote) || expected.quote.creatorId === userId) return fail();
      return exclusive(async () => {
        if (persistenceFailed) return fail();
        const index = await read() ?? { version: 3 as const, userId, configurationDigest, installationId, entries: [] };
        if (index.entries.some(e => e.requestId === expected.requestId)) return fail(); // no index entry can recreate a send ticket
        const [owner, providerAttempts, previous] = await Promise.all([provider.readOwner(), provider.list(), entries(index)]);
        if (!owner.ownedByCurrentScope || !owner.customer || !owner.reservation || owner.reservation.activeAllocationId !== null
          || owner.bindingObservation?.status === "held" || index.entries.length >= 128) return fail();
        for (const { attempt } of previous) {
          if (attempt?.state === "not_applied" || attempt?.state === "closed") continue;
          if (!attempt || !attempt.intentId || !providerAttempts.some(a => a.intentId === attempt.intentId && a.initiationReleased)) return fail();
        }
        index.entries.push(expected);
        const encoded = JSON.stringify(index);
        try { await storage.setItem(INDEX_KEY, encoded); if (await storage.getItem(INDEX_KEY) !== encoded) throw Error("readback"); }
        catch { persistenceFailed = true; return fail(); }
        return core(expected.requestId).prepare({ requestId: expected.requestId, sessionGeneration: expected.sessionId, quote: expected.quote });
      });
    },
    async reconcile(requestId: string, response: unknown, binding: { requestId: string; sessionGeneration: string }) {
      const snapshot = copy(response), expected = copy(binding);
      await exclusive(() => ownedEntry(requestId)); return core(requestId).reconcile(requestId, snapshot, expected);
    },
    async prepareAbandon(input: { requestId: string; sessionId: string; originalRequestId: string }) {
      const expected = copy(input);
      if (!row(expected) || !keys(expected, ["requestId", "sessionId", "originalRequestId"]) || !testStoreUuid(expected.requestId)
        || !testStoreUuid(expected.sessionId) || !testStoreUuid(expected.originalRequestId)) return fail();
      await exclusive(() => ownedEntry(expected.originalRequestId));
      return core(expected.originalRequestId).prepareAbandon({ requestId: expected.requestId, sessionGeneration: expected.sessionId, originalRequestId: expected.originalRequestId });
    },
  });
}
