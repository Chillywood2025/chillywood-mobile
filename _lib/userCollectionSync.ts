/** Durable client intents backed by server revisions and operation receipts.
 * Unknown writes retry the exact immutable request only on explicit user action.
 * Conflicts never rebase on refresh or automatic playback ticks. Legacy cached
 * pending intents have no server identity and require explicit reconciliation.
 */
export type CollectionSyncStatus = "synced" | "pending" | "unknown" | "conflict" | "local";
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
  write(value: State<T> | VersionedState<T>): Promise<boolean>;
  legacy(value: unknown): Record<string, T>;
  validValue(value: unknown): boolean;
  versioned: {
    operationId(): string;
    isEvent?(value: T | null): boolean;
    read(): Promise<{ values: Record<string, T>; revisions: Record<string, string> }>;
    write(id: string, request: VersionedIntent<T>): Promise<{ status: "applied" | "conflict"; revision: string; value: T | null }>;
  };
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
function visible<T>(state: Pick<State<T>, "base" | "pending">): Record<string, T> {
  const result = { ...state.base };
  for (const [id, intent] of Object.entries(state.pending)) {
    if (intent.value === null) delete result[id];
    else result[id] = intent.value;
  }
  return result;
}

export function createUserCollectionSync<T>(options: Options<T>) {
  return createVersionedUserCollectionSync(options);
}

export type VersionedIntent<T> = Intent<T> & { operationId: string; expectedRevision: string };
type VersionedState<T> = {
  collectionVersion: 2;
  revision: number;
  base: Record<string, T>;
  versions: Record<string, string>;
  pending: Record<string, VersionedIntent<T>>;
  unsettled: Record<string, VersionedIntent<T>>;
  conflicts: Record<string, boolean>;
  events: Record<string, VersionedIntent<T>[]>;
};
const serverRevision = (value: unknown): value is string => typeof value === "string" && /^(0|[1-9][0-9]{0,18})$/.test(value);
const operationUuid = (value: unknown) => typeof value === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);

/** Server CAS orders acknowledged state; an unknown request is never rebased. */
function createVersionedUserCollectionSync<T>(options: Options<T>) {
  const protocol = options.versioned!;
  const local = <R>(operation: () => Promise<R>) => serial(`local:${options.key}`, operation);
  const validIntent = (intent: unknown): intent is VersionedIntent<T> => object(intent)
    && Number.isSafeInteger(intent.sequence) && Number(intent.sequence) > 0
    && operationUuid(intent.operationId) && serverRevision(intent.expectedRevision)
    && (intent.value === null || options.validValue(intent.value));
  async function load(): Promise<VersionedState<T>> {
    options.assertCurrent();
    const raw = await options.read();
    options.assertCurrent();
    if (object(raw) && raw.collectionVersion === 2) {
      if (!Number.isSafeInteger(raw.revision) || Number(raw.revision) < 0 || !object(raw.base)
        || !Object.values(raw.base).every(options.validValue) || !object(raw.versions)
        || !Object.values(raw.versions).every(serverRevision) || !object(raw.pending)
        || !Object.values(raw.pending).every(validIntent) || !object(raw.unsettled)
        || !Object.values(raw.unsettled).every(validIntent) || !object(raw.conflicts)
        || !Object.values(raw.conflicts).every(value => value === true)
        || Object.keys(raw.pending).some(id => ["__proto__", "prototype", "constructor"].includes(id))
        || Object.keys(raw.unsettled).some(id => !Object.hasOwn(raw.pending as object, id))
        || Object.keys(raw.conflicts).some(id => !Object.hasOwn(raw.pending as object, id))
        || (raw.events !== undefined && (!object(raw.events) || !Object.entries(raw.events).every(([id, events]) =>
          !["__proto__", "prototype", "constructor"].includes(id) && Array.isArray(events)
          && events.every((event, index) => validIntent(event) && event.sequence <= Number(raw.revision)
            && (index === 0 || event.sequence > events[index - 1].sequence)))))
        || !Object.values(raw.pending).every(intent => Number((intent as VersionedIntent<T>).sequence) <= Number(raw.revision))
        || !Object.values(raw.unsettled).every(intent => Number((intent as VersionedIntent<T>).sequence) <= Number(raw.revision))) {
        throw new Error("Saved collection data could not be read safely.");
      }
      return { ...raw, events: raw.events ?? {} } as unknown as VersionedState<T>;
    }
    const state: VersionedState<T> = { collectionVersion: 2, revision: 0, base: {}, versions: {}, pending: {}, unsettled: {}, conflicts: {}, events: {} };
    if (object(raw) && "collectionVersion" in raw) {
      if (raw.collectionVersion !== 1 || !object(raw.base) || !object(raw.pending)
        || !Number.isSafeInteger(raw.revision) || Number(raw.revision) < 0
        || !Object.values(raw.base).every(options.validValue)
        || (raw.unsettled !== undefined && (!object(raw.unsettled) || !Object.entries(raw.unsettled).every(([id, sequence]) =>
          Object.hasOwn(raw.pending as object, id) && Number.isSafeInteger(sequence) && Number(sequence) > 0 && Number(sequence) <= Number(raw.revision))))) {
        throw new Error("Saved collection data could not be read safely.");
      }
      state.base = raw.base as Record<string, T>;
      // Old writes had no server operation identity. Preserve the desired local
      // state but never turn it into a fresh write on refresh or app upgrade.
      for (const [id, intent] of Object.entries(raw.pending)) {
        if (["__proto__", "prototype", "constructor"].includes(id)
          || !object(intent) || !Number.isSafeInteger(intent.sequence) || Number(intent.sequence) <= 0
          || Number(intent.sequence) > Number(raw.revision)
          || !(intent.value === null || options.validValue(intent.value))) throw new Error("Saved collection data could not be read safely.");
        state.pending[id] = { sequence: ++state.revision, value: intent.value as T | null,
          operationId: protocol.operationId(), expectedRevision: "0" };
        state.conflicts[id] = true;
      }
    } else state.base = options.legacy(raw);
    return state;
  }
  async function save(state: VersionedState<T>) {
    options.assertCurrent();
    if (!await options.write(state)) throw new Error("Your changes could not be saved on this device. Please try again.");
    options.assertCurrent();
  }
  const status = (state: VersionedState<T>): CollectionSyncStatus => !options.remote ? "local"
    : Object.keys(state.unsettled).length ? "unknown" : Object.keys(state.conflicts).length ? "conflict"
      : Object.keys(state.pending).length || Object.keys(state.events).length ? "pending" : "synced";
  async function snapshot() {
    return local(async () => { const state = await load(); return { values: visible(state), syncStatus: status(state) }; });
  }
  async function flush(id: string, retryUnknown = false) {
    return serial(`remote:${options.key}:${id}`, async () => {
      if (!options.remote) return;
      for (;;) {
        const request = await local(async () => {
          const state = await load();
          if (state.conflicts[id] || (state.unsettled[id] && !retryUnknown)) return undefined;
          const next = state.unsettled[id] ?? state.events[id]?.[0] ?? state.pending[id];
          if (!next) return undefined;
          state.unsettled[id] = { ...next };
          state.revision++;
          await save(state);
          return { ...next };
        });
        if (!request) return;
        let receipt: Awaited<ReturnType<typeof protocol.write>>;
        try {
          options.assertCurrent();
          receipt = await protocol.write(id, request);
          options.assertCurrent();
          if (!receipt || !["applied", "conflict"].includes(receipt.status) || !serverRevision(receipt.revision)
            || !(receipt.value === null || options.validValue(receipt.value))) throw new Error("Invalid collection receipt.");
          if (receipt.status === "applied" && BigInt(receipt.revision) !== BigInt(request.expectedRevision) + 1n) {
            throw new Error("Invalid collection receipt revision.");
          }
        } catch (error) {
          options.assertCurrent();
          if (error instanceof DefinitiveCollectionWriteError) await local(async () => {
            const state = await load();
            // A rejected predecessor may have been replaced locally. Its newer
            // successor keeps the original observed server revision, never a read rebase.
            delete state.unsettled[id]; state.revision++; await save(state);
          });
          return;
        }
        await local(async () => {
          const state = await load();
          delete state.unsettled[id];
          state.versions[id] = receipt.revision;
          if (receipt.value === null) delete state.base[id]; else state.base[id] = receipt.value;
          if (receipt.status === "conflict") state.conflicts[id] = true;
          else {
            if (state.events[id]?.[0]?.operationId === request.operationId) state.events[id].shift();
            if (state.events[id]?.length) state.events[id][0].expectedRevision = receipt.revision;
            else delete state.events[id];
            if (state.pending[id]?.sequence === request.sequence) delete state.pending[id];
            else if (state.pending[id]) state.pending[id].expectedRevision = receipt.revision;
          }
          state.revision++; await save(state);
        });
        if (receipt.status === "conflict") return;
        // Only an exact receipt releases the successor; no blind retry loop.
        retryUnknown = false;
      }
    });
  }
  async function change(id: string, desired: T | null | ((current: T | undefined) => T | null)) {
    if (!id || ["__proto__", "prototype", "constructor"].includes(id)) throw new Error("The collection title is invalid.");
    await local(async () => {
      const state = await load();
      const value = typeof desired === "function" ? (desired as (current: T | undefined) => T | null)(visible(state)[id]) : desired;
      if (value !== null && !options.validValue(value)) throw new Error("The collection change is invalid.");
      state.revision++;
      if (options.remote) {
        const intent = { sequence: state.revision, value, operationId: protocol.operationId(), expectedRevision: state.pending[id]?.expectedRevision ?? state.versions[id] ?? "0" };
        state.pending[id] = intent;
        // Playback starts are events, not replaceable progress snapshots. Keep
        // every unsent start even when a later tick replaces the visible value.
        if (protocol.isEvent?.(value)) (state.events[id] ??= []).push({ ...intent });
      }
      else if (value === null) delete state.base[id]; else state.base[id] = value;
      await save(state);
    });
    await flush(id);
    return snapshot();
  }
  async function refresh(request?: { retryUnknown?: boolean; useAccountVersion?: boolean }) {
    if (!options.remote) return { ...await snapshot(), readStatus: "local" as const };
    const ticket = (reads.get(options.key) ?? 0) + 1; reads.set(options.key, ticket);
    const ids = await local(async () => { const s = await load(); return [...new Set([...Object.keys(s.pending), ...Object.keys(s.unsettled), ...Object.keys(s.events)])]; });
    await Promise.all(ids.map(id => flush(id, request?.retryUnknown === true)));
    const revision = await local(async () => (await load()).revision);
    let remote: Awaited<ReturnType<typeof protocol.read>>;
    try {
      options.assertCurrent(); remote = await protocol.read(); options.assertCurrent();
      if (!remote || !object(remote.values) || !object(remote.revisions) || !Object.values(remote.values).every(options.validValue)
        || !Object.values(remote.revisions).every(serverRevision)
        || Object.keys(remote.values).some(id => !serverRevision(remote.revisions[id]))) throw new Error("Invalid collection read.");
    } catch {
      options.assertCurrent(); return { ...await snapshot(), readStatus: "offline" as const };
    }
    await local(async () => {
      const state = await load();
      if (state.revision !== revision || reads.get(options.key) !== ticket) return;
      state.base = remote.values; state.versions = remote.revisions;
      if (request?.useAccountVersion) for (const id of Object.keys(state.conflicts)) {
        if (state.unsettled[id]) continue;
        delete state.pending[id]; delete state.conflicts[id]; delete state.events[id];
      }
      state.revision++; await save(state);
    });
    return { ...await snapshot(), readStatus: "fresh" as const };
  }
  async function replaceLocal(values: Record<string, T>) {
    if (!Object.values(values).every(options.validValue)) throw new Error("The collection change is invalid.");
    await local(async () => { const state = await load(); state.base = values; state.revision++; await save(state); });
  }
  return { snapshot, change, refresh, replaceLocal };
}
