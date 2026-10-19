/** Durable client intents, not a distributed conflict-resolution protocol.
 * Clean caches never become writes. Server-side revisions/tombstones are needed
 * to order conflicting edits made by different devices while offline.
 * Ambiguous writes block automatic remote writes, including after restart.
 * Explicit retry sends the latest idempotent desired state best-effort. Its ack
 * proves that response arrived, not ordering against an earlier unknown request.
 * A server operation identity/reconciliation protocol is needed for that proof.
 */
export type CollectionSyncStatus = "synced" | "pending" | "unknown" | "local";
export class DefinitiveCollectionWriteError extends Error {}
type Intent<T> = { sequence: number; value: T | null };
type State<T> = {
  collectionVersion: 1;
  revision: number;
  base: Record<string, T>;
  pending: Record<string, Intent<T>>;
  // Persist before dispatch. A process exit or ambiguous response cannot safely
  // authorize retrying this request, even if a later read happens to match.
  unsettled: Record<string, number>;
};
type Options<T> = {
  key: string;
  remote: boolean;
  assertCurrent(): void;
  read(): Promise<unknown>;
  write(value: State<T>): Promise<boolean>;
  legacy(value: unknown): Record<string, T>;
  validValue(value: unknown): boolean;
  readRemote(): Promise<Record<string, T>>;
  writeRemote(id: string, value: T | null): Promise<void>;
  retryUnknownValue?(value: T | null): T | null;
};

const lanes = new Map<string, Promise<unknown>>();
const reads = new Map<string, number>();
function serial<T>(key: string, operation: () => Promise<T>): Promise<T> {
  const previous = lanes.get(key) ?? Promise.resolve();
  const next = previous.catch(() => undefined).then(operation);
  lanes.set(key, next);
  void next.then(() => { if (lanes.get(key) === next) lanes.delete(key); },
    () => { if (lanes.get(key) === next) lanes.delete(key); });
  return next;
}
const object = (value: unknown): value is Record<string, unknown> => (
  !!value && typeof value === "object" && !Array.isArray(value)
);
function visible<T>(state: State<T>): Record<string, T> {
  const result = { ...state.base };
  for (const [id, intent] of Object.entries(state.pending)) {
    if (intent.value === null) delete result[id];
    else result[id] = intent.value;
  }
  return result;
}

export function createUserCollectionSync<T>(options: Options<T>) {
  const local = <R>(operation: () => Promise<R>) => serial(`local:${options.key}`, operation);
  async function load(): Promise<State<T>> {
    options.assertCurrent();
    const raw = await options.read();
    options.assertCurrent();
    if (object(raw) && "collectionVersion" in raw) {
      if (raw.collectionVersion !== 1 || !object(raw.base) || !object(raw.pending)
        || !Number.isSafeInteger(raw.revision) || Number(raw.revision) < 0
        || !Object.values(raw.base).every(options.validValue)
        || (raw.unsettled !== undefined && (!object(raw.unsettled)
          || !Object.entries(raw.unsettled).every(([id, sequence]) => Number.isSafeInteger(sequence)
            && Number(sequence) > 0 && Number(sequence) <= Number(raw.revision)
            && Object.hasOwn(raw.pending as object, id))))
        || !Object.values(raw.pending).every(intent => object(intent)
          && Number.isSafeInteger(intent.sequence) && Number(intent.sequence) > 0
          && Number(intent.sequence) <= Number(raw.revision)
          && (intent.value === null || options.validValue(intent.value)))) {
        throw new Error("Saved collection data could not be read safely.");
      }
      return { ...raw, unsettled: raw.unsettled ?? {} } as State<T>;
    }
    // Legacy state remains available offline but is never presumed to be an edit.
    return { collectionVersion: 1, revision: 0, base: options.legacy(raw), pending: {}, unsettled: {} };
  }
  async function save(state: State<T>) {
    options.assertCurrent();
    if (!await options.write(state)) throw new Error("Your changes could not be saved on this device. Please try again.");
    options.assertCurrent();
  }
  async function snapshot() {
    return local(async () => {
      const state = await load();
      return { values: visible(state), syncStatus: (!options.remote ? "local"
        : Object.keys(state.unsettled).length ? "unknown"
          : Object.keys(state.pending).length ? "pending" : "synced") as CollectionSyncStatus };
    });
  }
  async function flush(id: string, retryUnknown = false) {
    return serial(`remote:${options.key}:${id}`, async () => {
      if (!options.remote) return;
      const intent = await local(async () => {
        const state = await load();
        if ((state.unsettled[id] && !retryUnknown) || !state.pending[id]) return undefined;
        const next = state.pending[id];
        if (state.unsettled[id] && retryUnknown) {
          next.value = options.retryUnknownValue?.(next.value) ?? next.value;
          next.sequence = ++state.revision;
        }
        state.unsettled[id] = next.sequence;
        state.revision += 1;
        await save(state);
        return next;
      });
      if (!intent) return;
      try {
        options.assertCurrent();
        await options.writeRemote(id, intent.value);
        options.assertCurrent();
      } catch (error) {
        options.assertCurrent();
        if (error instanceof DefinitiveCollectionWriteError) {
          await local(async () => {
            const state = await load();
            delete state.unsettled[id];
            state.revision += 1;
            await save(state);
          });
        }
        return;
      }
      await local(async () => {
        const current = await load();
        // A late acknowledgement must not remove a newer opposite intent.
        delete current.unsettled[id];
        if (intent.value === null) delete current.base[id];
        else current.base[id] = intent.value;
        if (current.pending[id]?.sequence === intent.sequence) delete current.pending[id];
        current.revision += 1;
        await save(current);
      });
    });
  }
  async function change(id: string, desired: T | null | ((current: T | undefined) => T | null)) {
    await local(async () => {
      const state = await load();
      const value = typeof desired === "function"
        ? (desired as (current: T | undefined) => T | null)(visible(state)[id]) : desired;
      if (value !== null && !options.validValue(value)) throw new Error("The collection change is invalid.");
      state.revision += 1;
      if (options.remote) state.pending[id] = { sequence: state.revision, value };
      else if (value === null) delete state.base[id];
      else state.base[id] = value;
      await save(state);
    });
    await flush(id);
    return snapshot();
  }
  async function refresh(request?: { retryUnknown?: boolean }) {
    if (!options.remote) return { ...await snapshot(), readStatus: "local" as const };
    const ticket = (reads.get(options.key) ?? 0) + 1;
    reads.set(options.key, ticket);
    const pendingIds = await local(async () => Object.keys((await load()).pending));
    await Promise.all(pendingIds.map(id => flush(id, request?.retryUnknown === true)));
    const revision = await local(async () => (await load()).revision);
    let remote: Record<string, T>;
    try {
      options.assertCurrent();
      remote = await options.readRemote();
      options.assertCurrent();
      if (!Object.values(remote).every(options.validValue)) throw new Error("The remote collection is invalid.");
    } catch {
      options.assertCurrent();
      const result = await snapshot();
      return { ...result, readStatus: "offline" as const };
    }
    await local(async () => {
      const state = await load();
      // A read begun before a mutation/ack, or superseded by another read, is stale.
      if (state.revision !== revision || reads.get(options.key) !== ticket) return;
      state.base = remote;
      state.revision += 1;
      await save(state);
    });
    return { ...await snapshot(), readStatus: "fresh" as const };
  }
  async function replaceLocal(values: Record<string, T>) {
    if (!Object.values(values).every(options.validValue)) throw new Error("The collection change is invalid.");
    await local(async () => {
      const state = await load();
      // Cache-only compatibility API: never discard unsent intents or upload it.
      state.base = values;
      state.revision += 1;
      await save(state);
    });
  }
  return { snapshot, change, refresh, replaceLocal };
}
