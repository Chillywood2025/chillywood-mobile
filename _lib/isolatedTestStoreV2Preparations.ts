import AsyncStorage from "@react-native-async-storage/async-storage";
import { createIsolatedSandboxTipCheckoutJournal, type IsolatedSandboxTipCheckoutAttempt, type IsolatedSandboxTipCheckoutStorage } from "./isolatedSandboxTipCheckoutAttempts";
import { sameTestStoreQuote, testStoreDigest, testStoreUuid, type TestStoreQuote } from "./isolatedTestStoreContract";
import { validTestStoreV2Quote } from "./isolatedTestStoreV2Contract";
import { createIsolatedTestStoreV2AttemptJournal } from "./isolatedTestStoreV2Attempts";

/** The original core quote journal deliberately permits one unresolved intent.
 * V2 reuses its exact confirmation/tombstone rules in separate per-attempt
 * namespaces, and requires an authentic v2 continuation before the next one. */
type Entry = { requestId: string; sessionId: string; quote: TestStoreQuote };
type Index = { version: 2; userId: string; configurationDigest: string; installationId: string; entries: Entry[] };
export type TestStoreV2Preparation = Entry & { attempt: IsolatedSandboxTipCheckoutAttempt | null };
const INDEX_KEY = "@chillywood/isolated-test-store-v2/core-preparation-index";
const queues = new Map<string, Promise<void>>();
async function exclusive<T>(operation: () => Promise<T>) {
  const previous = queues.get(INDEX_KEY) ?? Promise.resolve(); let release!: () => void;
  const next = new Promise<void>(resolve => { release = resolve; }); queues.set(INDEX_KEY, next); await previous;
  try { return await operation(); } finally { release(); if (queues.get(INDEX_KEY) === next) queues.delete(INDEX_KEY); }
}
const row = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);
const keys = (v: Record<string, unknown>, expected: string[]) => Object.keys(v).length === expected.length && expected.every(k => Object.hasOwn(v, k));
const copy = <T>(v: T): T => JSON.parse(JSON.stringify(v)) as T;
const fail = (): never => { throw new Error("isolated_test_store_v2_preparation_unavailable"); };
export function createIsolatedTestStoreV2Preparations({ userId, configurationDigest, installationId, storage = AsyncStorage }: {
  userId: string; configurationDigest: string; installationId: string; storage?: IsolatedSandboxTipCheckoutStorage;
}) {
  if (!testStoreUuid(userId) || !testStoreDigest(configurationDigest) || !testStoreUuid(installationId)) return fail();
  const provider = createIsolatedTestStoreV2AttemptJournal({ userId, installationId, configurationDigest, storage });
  const cores = new Map<string, ReturnType<typeof createIsolatedSandboxTipCheckoutJournal>>();
  async function read(): Promise<Index | null> {
    const raw = await storage.getItem(INDEX_KEY); if (raw === null) return null;
    if (typeof raw !== "string" || raw.length > 200_000) return fail();
    let value: unknown; try { value = JSON.parse(raw); } catch { return fail(); }
    if (!row(value) || !keys(value, ["version", "userId", "configurationDigest", "installationId", "entries"])
      || value.version !== 2 || value.userId !== userId || value.configurationDigest !== configurationDigest || value.installationId !== installationId
      || !Array.isArray(value.entries) || value.entries.length > 128) return fail();
    const seen = new Set<string>();
    for (const entry of value.entries) {
      if (!row(entry) || !keys(entry, ["requestId", "sessionId", "quote"]) || !testStoreUuid(entry.requestId) || seen.has(entry.requestId)
        || !testStoreUuid(entry.sessionId) || !validTestStoreV2Quote(entry.quote) || entry.quote.creatorId === userId) return fail();
      seen.add(entry.requestId);
    }
    return value as Index;
  }
  const core = (requestId: string) => {
    const existing = cores.get(requestId); if (existing) return existing;
    const prefix = `@chillywood/isolated-test-store-v2/core:${installationId}:${configurationDigest}:${requestId}:`;
    const journal = createIsolatedSandboxTipCheckoutJournal({ userId, storage: {
      getItem: key => storage.getItem(prefix + key), setItem: (key, value) => storage.setItem(prefix + key, value),
    } });
    cores.set(requestId, journal); return journal;
  };
  async function entries(index: Index | null): Promise<TestStoreV2Preparation[]> {
    return Promise.all((index?.entries ?? []).map(async entry => {
      const rows = await core(entry.requestId).list();
      const attempt = rows.find(a => a.command === "checkout.prepare" && a.requestId === entry.requestId) ?? null;
      if (attempt && (attempt.sessionGeneration !== entry.sessionId || !sameTestStoreQuote(attempt.quote, entry.quote))) return fail();
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
    async prepareNew(input: { requestId: string; sessionId: string; quote: TestStoreQuote }) {
      const expected = copy(input);
      if (!row(expected) || !keys(expected, ["requestId", "sessionId", "quote"]) || !testStoreUuid(expected.requestId)
        || !testStoreUuid(expected.sessionId) || !validTestStoreV2Quote(expected.quote) || expected.quote.creatorId === userId) return fail();
      return exclusive(async () => {
        const index = await read() ?? { version: 2 as const, userId, configurationDigest, installationId, entries: [] };
        if (index.entries.some(e => e.requestId === expected.requestId)) return fail(); // no index entry can recreate a send ticket
        const [owner, providerAttempts, previous] = await Promise.all([provider.readOwner(), provider.list(), entries(index)]);
        if (!owner.ownedByCurrentScope || !owner.customer || !owner.reservation || owner.reservation.activeAllocationId !== null
          || owner.bindingObservation?.status === "held" || index.entries.length >= 128) return fail();
        for (const { attempt } of previous) {
          if (attempt?.state === "abandoned" || attempt?.state === "not_applied") continue;
          if (!attempt || !attempt.intentId || !providerAttempts.some(a => a.intentId === attempt.intentId && a.initiationReleased)) return fail();
        }
        index.entries.push(expected);
        const encoded = JSON.stringify(index); await storage.setItem(INDEX_KEY, encoded);
        if (await storage.getItem(INDEX_KEY) !== encoded) return fail();
        return core(expected.requestId).prepare({ requestId: expected.requestId, sessionGeneration: expected.sessionId, quote: expected.quote });
      });
    },
    async reconcile(requestId: string, response: unknown, binding: { requestId: string; sessionGeneration: string }) {
      const snapshot = copy(response), expected = copy(binding);
      await exclusive(() => ownedEntry(requestId)); return core(requestId).reconcile(requestId, snapshot, expected);
    },
    async observeForAbandon(requestId: string, response: unknown, binding: { requestId: string; sessionGeneration: string }) {
      const snapshot = copy(response), expected = copy(binding);
      await exclusive(() => ownedEntry(requestId)); return core(requestId).observeForAbandon(requestId, snapshot, expected);
    },
    async prepareAbandon(input: { requestId: string; sessionId: string; originalRequestId: string; intentId: string }) {
      const expected = copy(input);
      await exclusive(() => ownedEntry(expected.originalRequestId));
      return core(expected.originalRequestId).prepareAbandon({ requestId: expected.requestId, sessionGeneration: expected.sessionId, originalRequestId: expected.originalRequestId, intentId: expected.intentId });
    },
  });
}
