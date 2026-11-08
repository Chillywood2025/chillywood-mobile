import AsyncStorage from "@react-native-async-storage/async-storage";
import { IsolatedSandboxCommerceError, type IsolatedSandboxPayloads } from "./isolatedSandboxCommerce";

/** This journal records requests. It never grants account or payment authority. */
export type IsolatedSandboxTipAttemptPayloads = Pick<IsolatedSandboxPayloads,
  "creator.declare" | "offer.publish"> & {
  "resource.create": { kind: "creator_tip"; title: string };
  "offer.retire": { offerId: string; expectedRevision: number };
};
export type IsolatedSandboxTipAttemptCommand = keyof IsolatedSandboxTipAttemptPayloads;
export type IsolatedSandboxAttemptStorage = {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<unknown>;
};
type Row = Record<string, unknown>;
export type IsolatedSandboxTipAttempt = {
  readonly requestId: string;
  readonly userId: string;
  readonly sessionGeneration: string;
  readonly command: IsolatedSandboxTipAttemptCommand;
  readonly payload: Readonly<Row>;
  readonly state: "prepared" | "unknown" | "completed" | "not_applied";
  readonly result: Readonly<Row> | null;
};
export type IsolatedSandboxTipAttemptInput<C extends IsolatedSandboxTipAttemptCommand = IsolatedSandboxTipAttemptCommand> = {
  requestId: string; sessionGeneration: string; command: C; payload: IsolatedSandboxTipAttemptPayloads[C];
};
type ErrorCode = "invalid_request" | "invalid_response" | "storage_unavailable" | "storage_corrupt"
  | "request_conflict" | "unresolved_attempt" | "attempt_missing";
export class IsolatedSandboxAttemptJournalError extends Error {
  constructor(readonly code: ErrorCode) {
    super(`Isolated sandbox attempt journal: ${code}.`);
    this.name = "IsolatedSandboxAttemptJournalError";
  }
}
const fail = (code: ErrorCode): never => { throw new IsolatedSandboxAttemptJournalError(code); };
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u;
const uuid = (value: unknown): value is string => typeof value === "string" && UUID.test(value);
const row = (value: unknown): value is Row => !!value && typeof value === "object" && !Array.isArray(value);
const keys = (value: Row, required: readonly string[], optional: readonly string[] = []) =>
  required.every(key => Object.hasOwn(value, key)) && Object.keys(value).every(key => required.includes(key) || optional.includes(key));
const positive = (value: unknown) => typeof value === "number" && Number.isSafeInteger(value) && value > 0;
const id = (value: unknown, kind: "resource" | "offer") => typeof value === "string"
  && value.startsWith(`scv1_${kind}_`) && uuid(value.slice(`scv1_${kind}_`.length));
const member = (value: unknown, choices: readonly string[]) => typeof value === "string" && choices.includes(value);
const timestamp = (value: unknown) => typeof value === "string" && /^\d{4}-\d{2}-\d{2}T/u.test(value) && Number.isFinite(Date.parse(value));
const instantMicros = (value: unknown): bigint | null => {
  if (typeof value !== "string") return null;
  const match = /^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2})(?:\.(\d{1,6}))?(Z|[+-]\d{2}:\d{2})$/u.exec(value);
  if (!match) return null;
  const seconds = Date.parse(match[1] + match[3]);
  return Number.isFinite(seconds) ? BigInt(seconds) * 1000n + BigInt((match[2] ?? "").padEnd(6, "0")) : null;
};
const COMMAND_KEYS = {
  "creator.declare": ["declared18Plus", "countryCode", "regionCode", "declarationVersion"],
  "resource.create": ["kind", "title"],
  "offer.publish": ["resourceId", "amountMinor", "currency", "expectedRevision"],
  "offer.retire": ["offerId", "expectedRevision"],
} as const;
function command(value: unknown): value is IsolatedSandboxTipAttemptCommand {
  return typeof value === "string" && Object.hasOwn(COMMAND_KEYS, value);
}
function payloadFor(name: IsolatedSandboxTipAttemptCommand, value: unknown): Row {
  if (!row(value) || !keys(value, COMMAND_KEYS[name])) return fail("invalid_request");
  if (name === "creator.declare" && !(typeof value.declared18Plus === "boolean"
    && typeof value.countryCode === "string" && /^[A-Z]{2}$/u.test(value.countryCode)
    && (value.regionCode === null || (typeof value.regionCode === "string" && /^[A-Z0-9-]{1,12}$/u.test(value.regionCode)))
    && value.declarationVersion === "adult-us-creator-v1")) return fail("invalid_request");
  if (name === "resource.create" && !(value.kind === "creator_tip" && typeof value.title === "string"
    && value.title.trim() === value.title && value.title.length > 0 && value.title.length <= 160)) return fail("invalid_request");
  if (name === "offer.publish" && !(id(value.resourceId, "resource") && positive(value.amountMinor)
    && typeof value.currency === "string" && /^[a-z]{3}$/u.test(value.currency) && positive(value.expectedRevision))) return fail("invalid_request");
  if (name === "offer.retire" && !(id(value.offerId, "offer") && positive(value.expectedRevision))) return fail("invalid_request");
  // Construct only the canonical allowlist. Credentials, URLs, and provider
  // response objects never have a field in the journal's request format.
  return Object.fromEntries(COMMAND_KEYS[name].map(key => [key, value[key]]));
}
function frozen<T>(value: T): T {
  if (value && typeof value === "object") {
    Object.values(value).forEach(child => frozen(child)); Object.freeze(value);
  }
  return value;
}
const copy = <T>(value: T): T => frozen(JSON.parse(JSON.stringify(value)) as T);
const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);
const terminal = (attempt: IsolatedSandboxTipAttempt) => attempt.state === "completed" || attempt.state === "not_applied";
const publishNoEffect = (attempt: IsolatedSandboxTipAttempt, result: Row) => attempt.command === "offer.publish"
  && result.source === "direct" && result.status === "held" && row(result.data)
  && member(result.data.reason, ["mode_integration_unavailable", "provider_or_resource_binding_unavailable"]);
const storageKey = (userId: string) => `@chillywood/isolated-sandbox-tip-attempts:v1:${userId}`;
// AsyncStorage is a single-process adapter without compare-and-swap. Every
// instance in this JS process uses this queue; reads always reopen storage.
// A second process must not share a concurrently writable adapter namespace.
const queues = new Map<string, Promise<void>>();
async function exclusive<T>(key: string, operation: () => Promise<T>): Promise<T> {
  const previous = queues.get(key) ?? Promise.resolve();
  let release!: () => void;
  const current = new Promise<void>(resolve => { release = resolve; });
  queues.set(key, current);
  await previous;
  try { return await operation(); }
  finally { release(); if (queues.get(key) === current) queues.delete(key); }
}
function actorMatches(value: unknown, attempt: IsolatedSandboxTipAttempt, sessionGeneration: string) {
  return row(value) && keys(value, ["userId", "accountId", "sessionGeneration"])
    && value.userId === attempt.userId && value.accountId === attempt.userId
    && value.sessionGeneration === sessionGeneration;
}
function richOffer(value: unknown): value is Row {
  return row(value) && keys(value, ["id", "resourceId", "creatorId", "kind", "title", "revision", "resourceRevision",
    "status", "amountMinor", "currency", "createdAt", "available", "checkoutConnected"])
    && id(value.id, "offer") && id(value.resourceId, "resource") && uuid(value.creatorId)
    && value.kind === "creator_tip" && typeof value.title === "string" && value.title.length <= 160
    && positive(value.revision) && positive(value.resourceRevision) && positive(value.amountMinor)
    && member(value.status, ["draft", "published", "retired"]) && typeof value.currency === "string"
    && /^[a-z]{3}$/u.test(value.currency) && timestamp(value.createdAt)
    && typeof value.available === "boolean" && value.checkoutConnected === false;
}
function richResource(value: unknown): value is Row {
  if (!(row(value) && keys(value, ["id", "creatorId", "kind", "title", "revision", "status", "createdAt", "offers", "offersNextCursor", "offersTruncated"])
    && id(value.id, "resource") && uuid(value.creatorId) && value.kind === "creator_tip"
    && typeof value.title === "string" && value.title.length <= 160 && positive(value.revision)
    && member(value.status, ["draft", "quarantined", "published", "retired"]) && timestamp(value.createdAt)
    && Array.isArray(value.offers) && value.offers.length <= 10 && value.offers.every(offer => richOffer(offer)
      && offer.resourceId === value.id && offer.creatorId === value.creatorId)
    && typeof value.offersTruncated === "boolean" && value.offersTruncated === (value.offersNextCursor !== null))) return false;
  const offers = value.offers as Row[]; const cursor = value.offersNextCursor;
  const cutoff = row(cursor) ? instantMicros(cursor.asOf) : null;
  const cursorAt = row(cursor) ? instantMicros(cursor.createdAt) : null;
  if (cursor !== null && (!row(cursor) || !keys(cursor, ["asOf", "createdAt", "id"])
    || !timestamp(cursor.asOf) || !timestamp(cursor.createdAt) || !uuid(cursor.id)
    || cutoff === null || cursorAt === null || cursorAt > cutoff
    || offers.length !== 10)) return false;
  for (let index = 0; index < offers.length; index += 1) {
    const offer = offers[index]; const previous = offers[index - 1];
    const at = instantMicros(offer.createdAt); const previousAt = previous ? instantMicros(previous.createdAt) : null;
    if (at === null || (cutoff !== null && at > cutoff)) return false;
    if (previous && (previousAt === null || at > previousAt
      || (at === previousAt && (offer.id as string) >= (previous.id as string)))) return false;
  }
  const last = offers.at(-1);
  return cursor === null || (row(cursor) && !!last && cursor.createdAt === last.createdAt
    && `scv1_offer_${cursor.id as string}` === last.id);
}
function validSuccess(attempt: IsolatedSandboxTipAttempt, data: unknown): data is Row {
  if (!row(data)) return false;
  if (attempt.command === "creator.declare") return keys(data, ["eligible"], ["declarationId"])
    && typeof data.eligible === "boolean" && (!Object.hasOwn(data, "declarationId") || uuid(data.declarationId));
  if (attempt.command === "resource.create") {
    const resource = data.resource;
    return keys(data, ["resource"]) && row(resource)
      && keys(resource, ["id", "kind", "creatorId", "revision", "status"])
      && id(resource.id, "resource") && resource.kind === "creator_tip" && resource.creatorId === attempt.userId
      && positive(resource.revision) && member(resource.status, ["draft", "quarantined", "published", "retired"]);
  }
  const offer = data.offer;
  if (attempt.command === "offer.retire") return keys(data, ["offer"]) && richOffer(offer)
    && offer.id === attempt.payload.offerId && offer.creatorId === attempt.userId && offer.status === "retired"
    && offer.available === false;
  if (!keys(data, ["offer"]) || !row(offer)
    || !keys(offer, ["id", "resourceId", "kind", "revision", "status", "amountMinor", "currency"])
    || !id(offer.id, "offer") || !id(offer.resourceId, "resource") || offer.kind !== "creator_tip"
    || !positive(offer.revision) || !positive(offer.amountMinor)
    || typeof offer.currency !== "string" || !/^[a-z]{3}$/u.test(offer.currency)) return false;
  return offer.resourceId === attempt.payload.resourceId
    && offer.amountMinor === attempt.payload.amountMinor && offer.currency === attempt.payload.currency
    && member(offer.status, ["draft", "published", "retired"]);
}
function acceptedResult(attempt: IsolatedSandboxTipAttempt, value: unknown, sessionGeneration: string): Row {
  if (!row(value) || !keys(value, ["protocol", "environment", "command", "requestId", "actor", "status", "data"])
    || value.protocol !== "sandbox-commerce-v1" || value.environment !== "sandbox"
    || value.command !== attempt.command || value.requestId !== attempt.requestId
    || !actorMatches(value.actor, attempt, sessionGeneration)) return fail("invalid_response");
  if (value.status === "ok") {
    if (!validSuccess(attempt, value.data)) return fail("invalid_response");
  } else if (!member(value.status, ["held", "denied", "pending"]) || !row(value.data)
    || !keys(value.data, ["reason"]) || typeof value.data.reason !== "string"
    || !/^[a-z][a-z0-9_]{0,95}$/u.test(value.data.reason)) return fail("invalid_response");
  return copy({ source: "direct", observedSessionGeneration: sessionGeneration, status: value.status, data: value.data });
}
function acceptedRecovery(attempt: IsolatedSandboxTipAttempt, value: unknown, binding: { requestId: string; sessionGeneration: string }): Row {
  if (!row(value) || !keys(value, ["protocol", "environment", "command", "requestId", "actor", "status", "data"])
    || value.protocol !== "sandbox-commerce-v1" || value.environment !== "sandbox" || value.command !== "request.read"
    || value.requestId !== binding.requestId || value.status !== "ok"
    || !actorMatches(value.actor, attempt, binding.sessionGeneration) || !row(value.data)) return fail("invalid_response");
  const data = value.data;
  if (!keys(data, ["resolution", "originalRequestId", "recordedCommand", "recordedSessionId", "recordedPayload",
    "resource", "offer", "entry", "declaration", "retryAllowed", "noDispatchProven"])
    || data.originalRequestId !== attempt.requestId || data.retryAllowed !== false || data.noDispatchProven !== false
    || data.entry !== null) return fail("invalid_response");
  if (data.resolution === "unknown" || data.resolution === "busy") {
    if ([data.recordedCommand, data.recordedSessionId, data.recordedPayload, data.resource, data.offer, data.declaration]
      .some(item => item !== null)) return fail("invalid_response");
    return copy({ source: "request.read", observedSessionGeneration: binding.sessionGeneration,
      status: "unknown", data: { reason: `recovery_${data.resolution}` } });
  }
  if (data.resolution !== "found" || data.recordedCommand !== attempt.command
    || data.recordedSessionId !== attempt.sessionGeneration || !row(data.recordedPayload)
    || !keys(data.recordedPayload, ["protocol", "requestId", ...COMMAND_KEYS[attempt.command]])
    || data.recordedPayload.protocol !== "sandbox-commerce-v1" || data.recordedPayload.requestId !== attempt.requestId) return fail("invalid_response");
  const { protocol: _protocol, requestId: _requestId, ...originalPayload } = data.recordedPayload;
  let canonical: Row;
  try { canonical = payloadFor(attempt.command, originalPayload); } catch { return fail("invalid_response"); }
  if (!same(canonical, attempt.payload)) return fail("invalid_response");
  if (attempt.command === "resource.create") {
    if (!richResource(data.resource) || data.resource.creatorId !== attempt.userId || data.offer !== null
      || data.declaration !== null) return fail("invalid_response");
  } else if (attempt.command === "offer.publish" || attempt.command === "offer.retire") {
    if (!richOffer(data.offer) || data.offer.creatorId !== attempt.userId || data.resource !== null || data.declaration !== null
      || (attempt.command === "offer.publish" ? data.offer.resourceId !== attempt.payload.resourceId
        || data.offer.amountMinor !== attempt.payload.amountMinor || data.offer.currency !== attempt.payload.currency
        : data.offer.id !== attempt.payload.offerId || data.offer.status !== "retired" || data.offer.available !== false)) return fail("invalid_response");
  } else {
    const declaration = data.declaration;
    if (data.resource !== null || data.offer !== null || !row(declaration)
      || !keys(declaration, ["declared18Plus", "countryCode", "regionCode", "declarationVersion", "updatedAt", "sessionId"])
      || !uuid(declaration.sessionId) || !timestamp(declaration.updatedAt)) return fail("invalid_response");
    const { updatedAt: _updatedAt, sessionId: _sessionId, ...fields } = declaration;
    try { payloadFor("creator.declare", fields); } catch { return fail("invalid_response"); }
  }
  // Retain a small local acknowledgement, not a reconstructed server envelope
  // or current eligibility claim. The UI must read current server state itself.
  return copy({ source: "request.read", observedSessionGeneration: binding.sessionGeneration,
    status: "ok", data: { requestRecorded: true } });
}
function storedResult(attempt: IsolatedSandboxTipAttempt, value: unknown): boolean {
  if (!row(value) || !keys(value, ["source", "observedSessionGeneration", "status", "data"])
    || !uuid(value.observedSessionGeneration) || !row(value.data)) return false;
  if (value.source === "direct") {
    if (value.observedSessionGeneration !== attempt.sessionGeneration) return false;
    if (value.status === "ok") return validSuccess(attempt, value.data);
    return member(value.status, ["held", "denied", "pending"]) && keys(value.data, ["reason"])
      && typeof value.data.reason === "string" && /^[a-z][a-z0-9_]{0,95}$/u.test(value.data.reason);
  }
  if (value.source === "pre_dispatch") return value.observedSessionGeneration === attempt.sessionGeneration
    && value.status === "not_applied" && keys(value.data, ["reason"])
    && member(value.data.reason, ["authority_retired", "invalid_request"]);
  return value.source === "request.read" && (value.status === "ok"
    ? keys(value.data, ["requestRecorded"]) && value.data.requestRecorded === true
    : value.status === "unknown" && keys(value.data, ["reason"]) && member(value.data.reason, ["recovery_unknown", "recovery_busy"]));
}
function parseStored(raw: string, userId: string): IsolatedSandboxTipAttempt[] {
  try {
    if (raw.length > 2_000_000) return fail("storage_corrupt");
    const value: unknown = JSON.parse(raw);
    if (!row(value) || !keys(value, ["version", "userId", "attempts"]) || value.version !== 1
      || value.userId !== userId || !Array.isArray(value.attempts)) return fail("storage_corrupt");
    const seen = new Set<string>(); let unresolved = 0;
    const attempts: IsolatedSandboxTipAttempt[] = value.attempts.map((entry: unknown) => {
      if (!row(entry) || !keys(entry, ["requestId", "userId", "sessionGeneration", "command", "payload", "state", "result"])
        || !uuid(entry.requestId) || seen.has(entry.requestId) || entry.userId !== userId || !uuid(entry.sessionGeneration)
        || !command(entry.command) || !member(entry.state, ["prepared", "unknown", "completed", "not_applied"])) return fail("storage_corrupt");
      const payload = payloadFor(entry.command, entry.payload);
      const attempt = { ...entry, payload } as IsolatedSandboxTipAttempt;
      if (entry.result !== null && !storedResult(attempt, entry.result)) return fail("storage_corrupt");
      if (entry.state === "completed" ? !row(entry.result) || entry.result.status !== "ok"
        : row(entry.result) && entry.result.status === "ok") return fail("storage_corrupt");
      if (entry.state === "not_applied") {
        if (!row(entry.result) || !(publishNoEffect(attempt, entry.result) || entry.result.source === "pre_dispatch")) return fail("storage_corrupt");
      } else if (row(entry.result) && entry.result.source === "pre_dispatch") return fail("storage_corrupt");
      if (!terminal(attempt)) unresolved += 1;
      seen.add(entry.requestId); return attempt;
    });
    if (unresolved > 1) return fail("storage_corrupt");
    return attempts;
  } catch { return fail("storage_corrupt"); }
}

export function createIsolatedSandboxAttemptJournal({ userId, storage = AsyncStorage }: {
  userId: string; storage?: IsolatedSandboxAttemptStorage;
}) {
  if (!uuid(userId)) return fail("invalid_request");
  const key = storageKey(userId);
  // These capabilities exist only for this exact first local preparation.
  // They cannot be reconstructed by remount, recovery, or a new account session.
  const fresh = new Map<string, symbol>();
  async function read(): Promise<IsolatedSandboxTipAttempt[]> {
    let raw: string | null;
    try { raw = await storage.getItem(key); } catch { return fail("storage_unavailable"); }
    return raw === null ? [] : parseStored(raw, userId);
  }
  async function write(attempts: IsolatedSandboxTipAttempt[]) {
    const raw = JSON.stringify({ version: 1, userId, attempts });
    if (raw.length > 2_000_000) return fail("storage_unavailable");
    // A resolved setItem followed by an exact readback is required before a
    // new request can leave this module. An uncertain write never permits send.
    try {
      await storage.setItem(key, raw);
      if (await storage.getItem(key) !== raw) return fail("storage_unavailable");
    } catch { return fail("storage_unavailable"); }
  }
  return Object.freeze({
    async prepare<C extends IsolatedSandboxTipAttemptCommand>(input: IsolatedSandboxTipAttemptInput<C>) {
      if (!row(input) || !keys(input, ["requestId", "sessionGeneration", "command", "payload"])
        || !uuid(input.requestId) || !uuid(input.sessionGeneration) || !command(input.command)) return fail("invalid_request");
      // Snapshot before waiting for storage, including the original session.
      const attempt: IsolatedSandboxTipAttempt = copy({ requestId: input.requestId, userId,
        sessionGeneration: input.sessionGeneration, command: input.command,
        payload: payloadFor(input.command, input.payload), state: "prepared", result: null });
      return exclusive(key, async () => {
        const attempts = await read();
        const existing = attempts.find(item => item.requestId === attempt.requestId);
        if (existing) {
          if (existing.command !== attempt.command || !same(existing.payload, attempt.payload)) return fail("request_conflict");
          // A new JWT may inspect this record, but must never adopt its session
          // or gain permission to repeat a mutation by reopening the journal.
          return Object.freeze({ attempt: copy(existing), mayDispatch: false, stopBeforeDispatch: null });
        }
        if (attempts.some(item => !terminal(item))) return fail("unresolved_attempt");
        await write([...attempts, attempt]);
        const token = Symbol(); fresh.set(attempt.requestId, token);
        const stopBeforeDispatch = async (error: unknown) => {
          if (!(error instanceof IsolatedSandboxCommerceError) || error.requestId !== attempt.requestId
            || error.outcome !== "not_dispatched" || !member(error.code, ["authority_retired", "invalid_request"])) return fail("invalid_response");
          const reason = error.code;
          return exclusive(key, async () => {
            if (fresh.get(attempt.requestId) !== token) return fail("invalid_response");
            fresh.delete(attempt.requestId);
            const current = await read(); const index = current.findIndex(item => item.requestId === attempt.requestId);
            if (index < 0 || current[index].state !== "prepared"
              || current[index].sessionGeneration !== attempt.sessionGeneration
              || current[index].command !== attempt.command || !same(current[index].payload, attempt.payload)) return fail("invalid_response");
            current[index] = { ...current[index], state: "not_applied", result: {
              source: "pre_dispatch", observedSessionGeneration: attempt.sessionGeneration,
              status: "not_applied", data: { reason },
            } };
            await write(current); return copy(current[index]);
          });
        };
        return Object.freeze({ attempt: copy(attempt), mayDispatch: true, stopBeforeDispatch });
      });
    },
    async list(): Promise<readonly IsolatedSandboxTipAttempt[]> { return exclusive(key, async () => copy(await read())); },
    async markUnknown(requestId: string) {
      if (!uuid(requestId)) return fail("invalid_request");
      fresh.delete(requestId);
      return exclusive(key, async () => {
        const attempts = await read(); const index = attempts.findIndex(item => item.requestId === requestId);
        if (index < 0) return fail("attempt_missing");
        const prior = attempts[index];
        // A late old callback cannot undo an already validated completion.
        if (prior.state === "prepared") { attempts[index] = { ...prior, state: "unknown" }; await write(attempts); }
        return copy(attempts[index]);
      });
    },
    async reconcile(requestId: string, serverOutcome: unknown, recoveryBinding?: { requestId: string; sessionGeneration: string }) {
      if (!uuid(requestId)) return fail("invalid_request");
      // Observing any server response (even a malformed one) means the local
      // pre-send-stop capability can no longer be used.
      const freshToken = fresh.get(requestId); fresh.delete(requestId);
      if (recoveryBinding !== undefined && (!row(recoveryBinding) || !keys(recoveryBinding, ["requestId", "sessionGeneration"])
        || !uuid(recoveryBinding.requestId) || !uuid(recoveryBinding.sessionGeneration))) return fail("invalid_request");
      // Call only after the transport's exact-session validation. This module
      // additionally checks request/actor/quote and never retains raw replies.
      let snapshot: unknown;
      try { snapshot = copy(serverOutcome); } catch { return fail("invalid_response"); }
      const binding = recoveryBinding === undefined ? undefined : copy(recoveryBinding);
      return exclusive(key, async () => {
        const attempts = await read(); const index = attempts.findIndex(item => item.requestId === requestId);
        if (index < 0) return fail("attempt_missing");
        const prior = attempts[index];
        const result = binding ? acceptedRecovery(prior, snapshot, binding) : acceptedResult(prior, snapshot, prior.sessionGeneration);
        // Authoring acknowledgements never prove an unknown payment was
        // undispatched. No checkout or abandon command is admitted here.
        if (terminal(prior)) return copy(prior);
        // Only the exact first local operation can use these two source-proven
        // pre-insert authoring holds. A replay or prior uncertainty cannot.
        const notApplied = !binding && prior.state === "prepared" && freshToken !== undefined && publishNoEffect(prior, result);
        attempts[index] = { ...prior, state: result.status === "ok" ? "completed" : notApplied ? "not_applied" : "unknown", result };
        await write(attempts); return copy(attempts[index]);
      });
    },
  });
}
