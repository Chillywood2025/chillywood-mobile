import AsyncStorage from "@react-native-async-storage/async-storage";
import { IsolatedPaidVideoV2Error, isPaidVideoV2Mutation, paidVideoId, paidVideoUuid,
  parsePaidVideoV2Response, validPaidVideoV2Payload, type PaidVideoV2Mutation, type PaidVideoV2Payloads } from "./isolatedPaidVideoV2";

export type IsolatedPaidVideoV2AttemptStorage = { getItem(key: string): Promise<string | null>; setItem(key: string, value: string): Promise<unknown> };
type Row = Record<string, unknown>;
export type IsolatedPaidVideoV2Attempt = Readonly<{ requestId: string; userId: string; sessionGeneration: string; configurationDigest: string;
  command: PaidVideoV2Mutation; payload: Readonly<Row>; state: "prepared" | "unknown" | "completed" | "not_applied"; result: Readonly<Row> | null }>;
export type IsolatedPaidVideoV2AttemptInput<C extends PaidVideoV2Mutation = PaidVideoV2Mutation> = {
  requestId: string; sessionGeneration: string; configurationDigest: string; command: C; payload: PaidVideoV2Payloads[C];
};
type Code = "invalid_request" | "invalid_response" | "request_conflict" | "unresolved_attempt" | "attempt_missing" | "storage_corrupt" | "storage_unavailable";
export class IsolatedPaidVideoV2AttemptJournalError extends Error {
  constructor(readonly code: Code) { super(`Isolated Paid Video journal: ${code}.`); this.name = "IsolatedPaidVideoV2AttemptJournalError"; }
}
const fail = (code: Code): never => { throw new IsolatedPaidVideoV2AttemptJournalError(code); };
const row = (value: unknown): value is Row => !!value && typeof value === "object" && !Array.isArray(value);
const keys = (value: unknown, names: readonly string[]): value is Row => row(value) && Object.keys(value).sort().join(",") === [...names].sort().join(",");
const digest = (value: unknown): value is string => typeof value === "string" && /^[a-f0-9]{64}$/u.test(value);
const member = (value: unknown, names: readonly string[]) => typeof value === "string" && names.includes(value);
function freeze<T>(value: T): T { if (value && typeof value === "object") { Object.values(value).forEach(freeze); Object.freeze(value); } return value; }
function copy<T>(value: T): T {
  const serialized = JSON.stringify(value, (_key, item) => {
    if (item === undefined || typeof item === "function" || typeof item === "symbol" || typeof item === "bigint" || (typeof item === "number" && !Number.isFinite(item))) throw new Error("Invalid JSON");
    return item;
  });
  if (serialized.length > 2_000_000) throw new Error("Journal bound");
  return freeze(JSON.parse(serialized) as T);
}
const canonical = (value: Row) => Object.fromEntries(Object.keys(value).sort().map(key => [key, value[key]]));
const same = (left: Row, right: Row) => JSON.stringify(canonical(left)) === JSON.stringify(canonical(right));
const terminal = (attempt: IsolatedPaidVideoV2Attempt) => attempt.state === "completed" || attempt.state === "not_applied";
const holdReason = (command: PaidVideoV2Mutation) => command === "upload.reserve" ? "immutable_upload_route_unavailable"
  : command === "offer.publish" ? "protocol3_catalog_unavailable" : null;
const keyFor = (userId: string) => `@chillywood/isolated-paid-video-attempts:v2:${userId}`;
// AsyncStorage has no cross-process CAS. All same-process account instances use
// this queue. Do not share the writable namespace across concurrent JS processes.
const queues = new Map<string, Promise<void>>();
const poisoned = new Set<string>();
const fresh = new Map<string, { token: symbol; owner: symbol }>();
const ticketKey = (key: string, requestId: string) => `${key}:${requestId}`;
async function exclusive<T>(key: string, fn: () => Promise<T>): Promise<T> {
  const prior = queues.get(key) ?? Promise.resolve(); let release!: () => void;
  const next = new Promise<void>(resolve => { release = resolve; }); queues.set(key, next); await prior;
  try { return await fn(); } finally { release(); if (queues.get(key) === next) queues.delete(key); }
}
function payload(command: PaidVideoV2Mutation, value: unknown): Row {
  if (!validPaidVideoV2Payload(command, value) || !row(value)) return fail("invalid_request");
  return canonical(value);
}
function validResult(attempt: IsolatedPaidVideoV2Attempt, value: unknown): boolean {
  if (!keys(value, ["source", "status", "observedSessionGeneration", "observedConfigurationDigest", "data"]) || !paidVideoUuid(value.observedSessionGeneration) || !digest(value.observedConfigurationDigest)) return false;
  if (value.source === "pre_dispatch") return value.status === "not_applied" && value.observedSessionGeneration === attempt.sessionGeneration && value.observedConfigurationDigest === attempt.configurationDigest
    && keys(value.data, ["reason"]) && member(value.data.reason, ["invalid_request", "authority_retired"]);
  if (!member(value.source, ["direct", "upload.recover"]) || (value.source === "direct" && (value.observedSessionGeneration !== attempt.sessionGeneration || value.observedConfigurationDigest !== attempt.configurationDigest))) return false;
  if (value.status === "ok") return keys(value.data, ["requestRecorded", "uploadId", "offerId"]) && value.data.requestRecorded === true
    && paidVideoId(value.data.uploadId, "upload") && ((attempt.command === "offer.publish" || attempt.command === "offer.retire")
      ? paidVideoId(value.data.offerId, "offer") : value.data.offerId === null)
    && ((attempt.command === "upload.finalize" || attempt.command === "offer.publish") ? value.data.uploadId === attempt.payload.uploadId : true)
    && (attempt.command === "offer.retire" ? value.data.offerId === attempt.payload.offerId : true);
  return keys(value.data, ["reason"]) && (value.source === "direct"
    ? value.status === "held" && holdReason(attempt.command) !== null && value.data.reason === holdReason(attempt.command)
    : value.status === "unknown" && value.data.reason === "recovery_unknown");
}
function parseStored(raw: string, userId: string): IsolatedPaidVideoV2Attempt[] {
  try {
    if (raw.length > 2_000_000) return fail("storage_corrupt");
    const value: unknown = JSON.parse(raw);
    if (!keys(value, ["version", "userId", "attempts"]) || value.version !== 2 || value.userId !== userId || !Array.isArray(value.attempts)
      || value.attempts.length > 1000) return fail("storage_corrupt");
    const seen = new Set<string>(); let unresolved = 0;
    const attempts = value.attempts.map((entry: unknown) => {
      if (!keys(entry, ["requestId", "userId", "sessionGeneration", "configurationDigest", "command", "payload", "state", "result"]) || !paidVideoUuid(entry.requestId)
        || seen.has(entry.requestId) || entry.userId !== userId || !paidVideoUuid(entry.sessionGeneration) || !digest(entry.configurationDigest) || !isPaidVideoV2Mutation(entry.command)
        || !member(entry.state, ["prepared", "unknown", "completed", "not_applied"])) return fail("storage_corrupt");
      const attempt = { ...entry, payload: payload(entry.command, entry.payload) } as IsolatedPaidVideoV2Attempt;
      if (entry.result !== null && !validResult(attempt, entry.result)) return fail("storage_corrupt");
      if (entry.state === "completed" ? !row(entry.result) || entry.result.status !== "ok" : row(entry.result) && entry.result.status === "ok") return fail("storage_corrupt");
      if (entry.state === "not_applied") {
        if (!row(entry.result) || !(entry.result.source === "pre_dispatch" || (entry.result.source === "direct" && entry.result.status === "held"))) return fail("storage_corrupt");
      } else if (row(entry.result) && entry.result.source === "pre_dispatch") return fail("storage_corrupt");
      if (entry.state === "prepared" && entry.result !== null) return fail("storage_corrupt");
      if (!terminal(attempt)) unresolved++; seen.add(entry.requestId); return attempt;
    });
    if (unresolved > 1) return fail("storage_corrupt");
    return attempts;
  } catch { return fail("storage_corrupt"); }
}

/** Local request evidence only: no Auth, transfer, scan, payment or grant authority.
 * Callers must fence their exact session before/after awaits and before transport.
 * A failed write/readback retires writes for this account for this JS runtime;
 * restart can read only what the storage adapter actually retained. */
export function createIsolatedPaidVideoV2AttemptJournal({ userId, storage = AsyncStorage }: { userId: string; storage?: IsolatedPaidVideoV2AttemptStorage }) {
  if (!paidVideoUuid(userId)) return fail("invalid_request"); const key = keyFor(userId), owner = Symbol();
  async function read() {
    let raw: string | null; try { raw = await storage.getItem(key); } catch { return fail("storage_unavailable"); }
    return raw === null ? [] : parseStored(raw, userId);
  }
  async function write(attempts: IsolatedPaidVideoV2Attempt[]) {
    if (poisoned.has(key)) return fail("storage_unavailable");
    try {
      const raw = JSON.stringify({ version: 2, userId, attempts }); parseStored(raw, userId);
      await storage.setItem(key, raw); if (await storage.getItem(key) !== raw) return fail("storage_unavailable");
    } catch { poisoned.add(key); return fail("storage_unavailable"); }
  }
  return Object.freeze({
    async prepare<C extends PaidVideoV2Mutation>(input: IsolatedPaidVideoV2AttemptInput<C>) {
      if (!keys(input, ["requestId", "sessionGeneration", "configurationDigest", "command", "payload"]) || !paidVideoUuid(input.requestId)
        || !paidVideoUuid(input.sessionGeneration) || !digest(input.configurationDigest) || !isPaidVideoV2Mutation(input.command)) return fail("invalid_request");
      const attempt: IsolatedPaidVideoV2Attempt = copy({ requestId: input.requestId, userId, sessionGeneration: input.sessionGeneration, configurationDigest: input.configurationDigest,
        command: input.command, payload: payload(input.command, input.payload), state: "prepared", result: null });
      return exclusive(key, async () => {
        if (poisoned.has(key)) return fail("storage_unavailable");
        const attempts = await read(), prior = attempts.find(item => item.requestId === attempt.requestId);
        if (prior) {
          if (prior.configurationDigest !== attempt.configurationDigest || prior.command !== attempt.command || !same(prior.payload, attempt.payload)) return fail("request_conflict");
          return Object.freeze({ attempt: copy(prior), mayDispatch: false, stopBeforeDispatch: null });
        }
        if (attempts.some(item => !terminal(item))) return fail("unresolved_attempt");
        await write([...attempts, attempt]); const id = ticketKey(key, attempt.requestId), token = Symbol(); fresh.set(id, { token, owner });
        const stopBeforeDispatch = async (error: unknown) => {
          if (!(error instanceof IsolatedPaidVideoV2Error) || error.requestId !== attempt.requestId || error.outcome !== "not_sent"
            || !member(error.code, ["invalid_request", "authority_retired"])) return fail("invalid_response");
          return exclusive(key, async () => {
            if (fresh.get(id)?.token !== token) return fail("invalid_response"); fresh.delete(id);
            const items = await read(), index = items.findIndex(item => item.requestId === attempt.requestId), current = items[index];
            if (!current || current.state !== "prepared" || current.sessionGeneration !== attempt.sessionGeneration
              || current.configurationDigest !== attempt.configurationDigest || current.command !== attempt.command || !same(current.payload, attempt.payload)) return fail("invalid_response");
            items[index] = { ...current, state: "not_applied", result: { source: "pre_dispatch", status: "not_applied",
              observedSessionGeneration: attempt.sessionGeneration, observedConfigurationDigest: attempt.configurationDigest, data: { reason: error.code } } };
            await write(items); return copy(items[index]);
          });
        };
        return Object.freeze({ attempt: copy(attempt), mayDispatch: true, stopBeforeDispatch });
      });
    },
    async list(): Promise<readonly IsolatedPaidVideoV2Attempt[]> { return exclusive(key, async () => copy(await read())); },
    async markUnknown(requestId: string) {
      if (!paidVideoUuid(requestId)) return fail("invalid_request"); fresh.delete(ticketKey(key, requestId));
      return exclusive(key, async () => {
        const items = await read(), index = items.findIndex(item => item.requestId === requestId); if (index < 0) return fail("attempt_missing");
        if (items[index].state === "prepared") { items[index] = { ...items[index], state: "unknown" }; await write(items); }
        return copy(items[index]);
      });
    },
    async reconcile(requestId: string, response: unknown, recoveryBinding?: { requestId: string; sessionGeneration: string; configurationDigest: string }) {
      if (!paidVideoUuid(requestId)) return fail("invalid_request");
      const id = ticketKey(key, requestId), ticket = fresh.get(id), token = ticket?.owner === owner ? ticket.token : undefined; fresh.delete(id);
      if (recoveryBinding !== undefined && (!keys(recoveryBinding, ["requestId", "sessionGeneration", "configurationDigest"]) || !paidVideoUuid(recoveryBinding.requestId)
        || !paidVideoUuid(recoveryBinding.sessionGeneration) || !digest(recoveryBinding.configurationDigest))) return fail("invalid_request");
      let snapshot: unknown; try { snapshot = copy(response); } catch { return fail("invalid_response"); }
      const binding = recoveryBinding && copy(recoveryBinding);
      return exclusive(key, async () => {
        const items = await read(), index = items.findIndex(item => item.requestId === requestId); if (index < 0) return fail("attempt_missing");
        const prior = items[index], session = binding?.sessionGeneration ?? prior.sessionGeneration;
        const configurationDigest = binding?.configurationDigest ?? prior.configurationDigest;
        let result: Row;
        try {
          const actor = { userId, accountId: userId, sessionGeneration: session };
          const parsed = binding ? parsePaidVideoV2Response(snapshot, { command: "upload.recover", requestId: binding.requestId, actor, configurationDigest, payload: { originalRequestId: requestId } })
            : parsePaidVideoV2Response(snapshot, { command: prior.command, requestId, actor, configurationDigest, payload: prior.payload as PaidVideoV2Payloads[PaidVideoV2Mutation] });
          if (parsed.status === "ok") {
            const data = parsed.data as Row;
            if (binding) {
              const recovery = data.recovery as Row;
              if (recovery.originalCommand !== prior.command || recovery.originalSessionGeneration !== prior.sessionGeneration
                || recovery.originalConfigurationDigest !== prior.configurationDigest
                || !row(recovery.originalPayload) || !same(recovery.originalPayload, { protocol: "isolated-paid-video-v1", requestId, ...prior.payload })) return fail("invalid_response");
            }
            const upload = data.upload as Row, offer = data.offer as Row | undefined;
            result = { source: binding ? "upload.recover" : "direct", status: "ok", observedSessionGeneration: session, observedConfigurationDigest: configurationDigest,
              data: { requestRecorded: true, uploadId: upload.id, offerId: offer?.id ?? null } };
          } else result = { source: binding ? "upload.recover" : "direct", status: parsed.status, observedSessionGeneration: session, observedConfigurationDigest: configurationDigest,
            data: { reason: parsed.status === "held" ? parsed.data.reason : "recovery_unknown" } };
          if (!validResult(prior, result)) return fail("invalid_response");
        } catch { return fail("invalid_response"); }
        if (terminal(prior)) return copy(prior);
        // SQL checks recorded replays before either held branch. Only this first
        // prepared ticket can accept a direct, pre-effect held response; prior
        // uncertainty and fresh-session recovery can never infer non-execution.
        const notApplied = !binding && token !== undefined && prior.state === "prepared" && result.status === "held";
        items[index] = { ...prior, state: result.status === "ok" ? "completed" : notApplied ? "not_applied" : "unknown", result };
        await write(items); return copy(items[index]);
      });
    },
  });
}
