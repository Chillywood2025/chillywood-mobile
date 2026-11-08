/** Preparation, exact unclaimed closure and history. No result grants playback. */
export type PaidVideoCheckoutV3 = "offer" | "prepare" | "recover" | "history" | "abandon" | "close_prepared" | "recover_close_prepared" | "resolve_playback";
export type PaidVideoCheckoutV3Actor = Readonly<{ userId: string; sessionId: string }>;
export type PaidVideoCheckoutV3Request = Readonly<{
  protocol: "isolated-paid-video-checkout-v3"; command: PaidVideoCheckoutV3; requestId: string;
  expectedSessionId: string; configurationDigest: string; payload: Readonly<Record<string, unknown>>;
}>;
export type PaidVideoCheckoutV3Execution = Readonly<{ actor: PaidVideoCheckoutV3Actor; request: PaidVideoCheckoutV3Request }>;
export type PaidVideoCheckoutV3Dependencies = {
  authenticate: (req: Request) => Promise<PaidVideoCheckoutV3Actor | null>;
  execute: (input: PaidVideoCheckoutV3Execution) => Promise<unknown>;
  now?: () => number;
};
type Row = Record<string, unknown>;
const row = (v: unknown): v is Row => !!v && typeof v === "object" && !Array.isArray(v);
const keys = (v: Row, names: readonly string[]) => Object.keys(v).length === names.length && names.every(k => Object.hasOwn(v, k));
const uuid = (v: unknown): v is string => typeof v === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u.test(v);
const digest = (v: unknown): v is string => typeof v === "string" && /^[0-9a-f]{64}$/u.test(v);
const id = (v: unknown, kind: string) => typeof v === "string" && v.startsWith(`scv1_${kind}_`) && uuid(v.slice(`scv1_${kind}_`.length));
const v3id = (v: unknown, kind: string) => typeof v === "string" && v.startsWith(`scv3_${kind}_`) && uuid(v.slice(`scv3_${kind}_`.length));
const text = (v: unknown, max = 200): v is string => typeof v === "string" && v.length > 0 && v.length <= max && v.trim() === v && !/[\u0000-\u001f\u007f]/u.test(v);
const positive = (v: unknown) => typeof v === "number" && Number.isSafeInteger(v) && v > 0;
const date = (v: unknown): v is string => typeof v === "string" && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,6})?(?:Z|[+-]\d{2}:\d{2})$/u.test(v) && Number.isFinite(Date.parse(v));
const choice = (v: unknown, values: readonly string[]) => typeof v === "string" && values.includes(v);
const quoteKeys = ["offerId", "offerRevision", "resourceId", "resourceRevision", "creatorId", "kind", "amountMinor", "currency", "asset"];
const assetKeys = ["id", "incarnation", "sha256", "byteLength", "resourceRevision", "profile"];
const quote = (v: unknown): v is Row => row(v) && keys(v, quoteKeys) && id(v.offerId, "offer") && positive(v.offerRevision)
  && id(v.resourceId, "resource") && positive(v.resourceRevision) && uuid(v.creatorId) && v.kind === "paid_content"
  && positive(v.amountMinor) && v.currency === "usd" && row(v.asset) && keys(v.asset, assetKeys)
  && id(v.asset.id, "asset") && uuid(v.asset.incarnation) && digest(v.asset.sha256) && positive(v.asset.byteLength)
  && Number(v.asset.byteLength) <= 16777216 && v.asset.resourceRevision === v.resourceRevision && v.asset.profile === "scpv-mp4-h264-aac-v1";
const sameQuote = (a: Row, b: Row) => quoteKeys.filter(k => k !== "asset").every(k => a[k] === b[k])
  && row(a.asset) && row(b.asset) && assetKeys.every(k => (a.asset as Row)[k] === (b.asset as Row)[k]);
function payload(command: PaidVideoCheckoutV3, v: unknown): v is Row {
  if (!row(v)) return false;
  if (command === "offer") return keys(v, ["offerId"]) && id(v.offerId, "offer");
  if (command === "resolve_playback") return keys(v, ["intentId"]) && id(v.intentId, "intent");
  if (command === "prepare") return keys(v, ["offerId", "expectedQuote"]) && id(v.offerId, "offer") && quote(v.expectedQuote) && v.expectedQuote.offerId === v.offerId;
  if (command === "recover" || command === "recover_close_prepared") return keys(v, ["originalRequestId"]) && uuid(v.originalRequestId);
  if (command === "abandon") return keys(v, ["originalRequestId", "originalSessionId", "intentId", "expectedQuote"])
    && uuid(v.originalRequestId) && uuid(v.originalSessionId) && id(v.intentId, "intent") && quote(v.expectedQuote);
  if (command === "close_prepared") return keys(v, ["customerBindingId", "intentId", "dispatchId", "registrationId", "originalSessionId", "expectedReservationRevision", "expectedQuote"])
    && v3id(v.customerBindingId, "customer") && id(v.intentId, "intent") && uuid(v.dispatchId) && v3id(v.registrationId, "registration")
    && uuid(v.originalSessionId) && positive(v.expectedReservationRevision) && quote(v.expectedQuote);
  return keys(v, ["limit", "cursor"]) && positive(v.limit) && Number(v.limit) <= 25 && (v.cursor === null || id(v.cursor, "intent"));
}
class BoundaryError extends Error { constructor(readonly code: string, readonly status: number) { super(code); } }
function freeze<T>(v: T): T {
  if (v && typeof v === "object") { Object.values(v).forEach(freeze); Object.freeze(v); }
  return v;
}
// Bound both nesting and duplicate keys before JSON.parse can choose a value.
function strictJson(source: string): unknown {
  let i = 0, nodes = 0;
  const space = () => { while (/[\t\n\r ]/u.test(source[i] ?? "")) i++; };
  const string = (): string => {
    if (source[i] !== '"') throw Error("json");
    const start = i++;
    while (i < source.length) { if (source[i] === "\\") { i += 2; continue; }
      if (source[i++] === '"') return JSON.parse(source.slice(start, i)); }
    throw Error("json");
  };
  const value = (depth: number): void => {
    if (++nodes > 256 || depth > 8) throw Error("json"); space();
    if (source[i] === "{") {
      i++; space(); const seen = new Set<string>(); if (source[i] === "}") { i++; return; }
      for (;;) { const key = string(); if (seen.has(key)) throw Error("json"); seen.add(key); space();
        if (source[i++] !== ":") throw Error("json"); value(depth + 1); space();
        const end = source[i++]; if (end === "}") return; if (end !== ",") throw Error("json"); space(); }
    }
    if (source[i] === "[") {
      i++; space(); if (source[i] === "]") { i++; return; }
      for (;;) { value(depth + 1); space(); const end = source[i++]; if (end === "]") return; if (end !== ",") throw Error("json"); }
    }
    if (source[i] === '"') { string(); return; }
    const token = /^(?:true|false|null|-?(?:0|[1-9][0-9]*)(?:\.[0-9]+)?(?:[eE][+-]?[0-9]+)?)/u.exec(source.slice(i));
    if (!token) throw Error("json"); i += token[0].length;
  };
  value(0); space(); if (i !== source.length) throw Error("json"); return JSON.parse(source);
}
async function readRequest(req: Request, signal: AbortSignal): Promise<PaidVideoCheckoutV3Request> {
  const length = req.headers.get("content-length");
  if (length !== null && (!/^\d+$/u.test(length) || Number(length) > 8192)) throw new BoundaryError("paid_video_checkout_body_limit", 413);
  if (!req.body) throw new BoundaryError("paid_video_checkout_invalid_request", 400);
  const reader = req.body.getReader(), chunks: Uint8Array[] = []; let size = 0;
  const cancel = () => { void reader.cancel().catch(() => {}); };
  signal.addEventListener("abort", cancel, { once: true });
  try { for (;;) { if (signal.aborted) throw new BoundaryError("paid_video_checkout_outcome_unknown", 503);
    const next = await reader.read(); if (signal.aborted) throw new BoundaryError("paid_video_checkout_outcome_unknown", 503);
    if (next.done) break; size += next.value.byteLength;
    if (size > 8192) { void reader.cancel().catch(() => {}); throw new BoundaryError("paid_video_checkout_body_limit", 413); } chunks.push(next.value); }
  } finally { signal.removeEventListener("abort", cancel); reader.releaseLock(); }
  const bytes = new Uint8Array(size); let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
  let v: unknown;
  try { v = strictJson(new TextDecoder("utf-8", { fatal: true }).decode(bytes)); } catch { throw new BoundaryError("paid_video_checkout_invalid_request", 400); }
  if (!row(v) || !keys(v, ["protocol", "command", "requestId", "expectedSessionId", "configurationDigest", "payload"])
    || v.protocol !== "isolated-paid-video-checkout-v3" || !choice(v.command, ["offer", "prepare", "recover", "history", "abandon", "close_prepared", "recover_close_prepared", "resolve_playback"])
    || !uuid(v.requestId) || !uuid(v.expectedSessionId) || !digest(v.configurationDigest) || !payload(v.command as PaidVideoCheckoutV3, v.payload))
    throw new BoundaryError("paid_video_checkout_invalid_request", 400);
  return freeze(v as PaidVideoCheckoutV3Request);
}
function intent(v: unknown): v is Row {
  if (!row(v) || !keys(v, ["id", "state", "quote", "createdAt", "expiresAt", "receipt", "grantId", "dispatchAllowed", "accessRequiresCurrentAuthorization", "notPayable"])
    || !id(v.id, "intent") || !choice(v.state, ["prepared", "provider_pending", "verified", "failed", "expired"])
    || !quote(v.quote) || !date(v.createdAt) || !date(v.expiresAt) || Date.parse(v.expiresAt) <= Date.parse(v.createdAt)
    || v.dispatchAllowed !== false || v.accessRequiresCurrentAuthorization !== true || v.notPayable !== true) return false;
  if (v.receipt !== null && (!row(v.receipt) || !keys(v.receipt, ["id", "state", "purchasedAt", "originalTransactionId"])
    || !id(v.receipt.id, "receipt") || !choice(v.receipt.state, ["verified", "refunded", "revoked", "quarantined"])
    || !date(v.receipt.purchasedAt) || !text(v.receipt.originalTransactionId))) return false;
  // A retained grant ID is historical. The separate current-access boundary
  // rechecks refunds, holds, media identity and actor authority for each range.
  return v.grantId === null || (id(v.grantId, "grant") && row(v.receipt));
}
function unclaimedClosure(d: Row, p: Row, configurationDigest: string, buyerId: string): boolean {
  return intent(d.intent) && d.intent.id === p.intentId && d.intent.state === "expired" && d.intent.receipt === null && d.intent.grantId === null
    && quote(d.intent.quote) && quote(p.expectedQuote) && sameQuote(d.intent.quote, p.expectedQuote) && d.intent.quote.creatorId !== buyerId
    && row(d.closure) && keys(d.closure, ["id", "kind", "customerBindingId", "allocationId", "dispatchId", "registrationId", "originalSessionId", "configurationDigest", "previousReservationRevision", "releasedReservationRevision", "closedAt", "claimAbsent"])
    && uuid(d.closure.id) && d.closure.kind === "unclaimed_allocation" && d.closure.customerBindingId === p.customerBindingId
    && v3id(d.closure.allocationId, "allocation") && d.closure.dispatchId === p.dispatchId && d.closure.registrationId === p.registrationId
    && d.closure.originalSessionId === p.originalSessionId && d.closure.configurationDigest === configurationDigest
    && d.closure.previousReservationRevision === p.expectedReservationRevision && positive(d.closure.previousReservationRevision)
    && Number(d.closure.previousReservationRevision) < Number.MAX_SAFE_INTEGER && positive(d.closure.releasedReservationRevision)
    && d.closure.releasedReservationRevision === Number(d.closure.previousReservationRevision) + 1
    && date(d.closure.closedAt) && date(d.intent.createdAt) && Date.parse(d.closure.closedAt) >= Date.parse(d.intent.createdAt)
    && d.closure.claimAbsent === true;
}
/** Reject drift instead of manufacturing a successful preparation or current access. */
export function validatePaidVideoCheckoutV3Result(v: unknown, input: PaidVideoCheckoutV3Execution): void {
  const { actor, request } = input, invalid = () => { throw new BoundaryError("paid_video_checkout_outcome_unknown", 503); };
  if (!row(v) || !keys(v, ["protocol", "command", "requestId", "actor", "status", "data", "providerDispatchAllowed", "grantsAccess", "financialAuthority", "notPayable"])
    || v.protocol !== request.protocol || v.command !== request.command || v.requestId !== request.requestId
    || !row(v.actor) || !keys(v.actor, ["userId", "sessionId"]) || v.actor.userId !== actor.userId || v.actor.sessionId !== actor.sessionId
    || !choice(v.status, ["ok", "unknown"]) || !row(v.data) || v.providerDispatchAllowed !== false || v.grantsAccess !== false
    || v.financialAuthority !== false || v.notPayable !== true) return invalid();
  const d = v.data, p = request.payload;
  if (request.command === "offer") {
    if (v.status !== "ok" || !keys(d, ["quote", "preparationAllowed"]) || !quote(d.quote) || d.quote.offerId !== p.offerId
      || typeof d.preparationAllowed !== "boolean" || (d.preparationAllowed && d.quote.creatorId === actor.userId)) return invalid();
  } else if (request.command === "prepare") {
    if (v.status !== "ok" || !keys(d, ["intent", "replayed"]) || typeof d.replayed !== "boolean" || !intent(d.intent)
      || !quote(d.intent.quote) || !quote(p.expectedQuote) || !sameQuote(d.intent.quote, p.expectedQuote) || d.intent.quote.creatorId === actor.userId) return invalid();
  } else if (request.command === "recover") {
    if (d.originalRequestId !== p.originalRequestId) return invalid();
    if (v.status === "unknown") { if (!keys(d, ["originalRequestId", "intent"]) || d.intent !== null) return invalid(); }
    else if (!keys(d, ["originalRequestId", "originalSessionId", "originalPayload", "intent"]) || !uuid(d.originalSessionId)
      || !payload("prepare", d.originalPayload) || !intent(d.intent) || !quote(d.intent.quote)
      || !quote(d.originalPayload.expectedQuote) || !sameQuote(d.intent.quote, d.originalPayload.expectedQuote)
      || d.intent.quote.creatorId === actor.userId) return invalid();
  } else if (request.command === "abandon") {
    if (v.status !== "ok" || !keys(d, ["intent", "closure", "replayed"]) || typeof d.replayed !== "boolean"
      || !intent(d.intent) || d.intent.id !== p.intentId || d.intent.state !== "expired" || d.intent.receipt !== null || d.intent.grantId !== null
      || !quote(d.intent.quote) || !quote(p.expectedQuote) || !sameQuote(d.intent.quote, p.expectedQuote) || d.intent.quote.creatorId === actor.userId
      || !row(d.closure) || !keys(d.closure, ["id", "originalRequestId", "originalSessionId", "configurationDigest", "closedAt", "kind", "allocationAbsent", "dispatchAbsent"])
      || !uuid(d.closure.id) || d.closure.originalRequestId !== p.originalRequestId || d.closure.originalSessionId !== p.originalSessionId
      || d.closure.configurationDigest !== request.configurationDigest || !date(d.closure.closedAt)
      || !date(d.intent.createdAt) || Date.parse(d.closure.closedAt) < Date.parse(d.intent.createdAt) || d.closure.kind !== "unallocated_preparation"
      || d.closure.allocationAbsent !== true || d.closure.dispatchAbsent !== true) return invalid();
  } else if (request.command === "close_prepared") {
    if (v.status !== "ok" || !keys(d, ["intent", "closure", "replayed"]) || typeof d.replayed !== "boolean"
      || !unclaimedClosure(d, p, request.configurationDigest, actor.userId)) return invalid();
  } else if (request.command === "recover_close_prepared") {
    if (d.originalRequestId !== p.originalRequestId) return invalid();
    if (v.status === "unknown") {
      if (!keys(d, ["originalRequestId", "intent", "closure"]) || d.intent !== null || d.closure !== null) return invalid();
    } else if (!keys(d, ["originalRequestId", "originalSessionId", "originalPayload", "intent", "closure"])
      || !uuid(d.originalSessionId) || !payload("close_prepared", d.originalPayload)
      || !unclaimedClosure(d, d.originalPayload, request.configurationDigest, actor.userId)) return invalid();
  } else if (request.command === "resolve_playback") {
    if (v.status !== "ok" || !keys(d, ["intent", "currentGrantId", "accessRequiresCurrentAuthorization"])
      || !intent(d.intent) || d.intent.id !== p.intentId || !quote(d.intent.quote) || d.intent.quote.creatorId === actor.userId
      || (d.currentGrantId !== null && !id(d.currentGrantId, "grant")) || d.accessRequiresCurrentAuthorization !== true) return invalid();
  } else {
    if (v.status !== "ok" || !keys(d, ["intents", "nextCursor"]) || !Array.isArray(d.intents) || d.intents.length > Number(p.limit)
      || !d.intents.every(item => intent(item) && row(item.quote) && item.quote.creatorId !== actor.userId)
      || new Set(d.intents.map(item => item.id)).size !== d.intents.length
      || (p.cursor !== null && d.intents.some(item => item.id === p.cursor))) return invalid();
    for (let n = 1; n < d.intents.length; n++) {
      const previous = d.intents[n - 1], current = d.intents[n];
      if (Date.parse(previous.createdAt) < Date.parse(current.createdAt)
        || (previous.createdAt === current.createdAt && previous.id <= current.id)) return invalid();
    }
    if (d.nextCursor !== null && (d.intents.length !== p.limit || d.nextCursor !== d.intents.at(-1)?.id)) return invalid();
  }
}
const headers = { "content-type": "application/json", "cache-control": "no-store", "access-control-allow-origin": "*",
  "access-control-allow-headers": "authorization, apikey, content-type, x-client-info, x-chillywood-platform", "access-control-allow-methods": "POST, OPTIONS" };
const json = (status: number, value: unknown) => new Response(JSON.stringify(value), { status, headers });
export function createPaidVideoCheckoutV3Handler(deps: PaidVideoCheckoutV3Dependencies) {
  return async (req: Request): Promise<Response> => {
    if (req.method === "OPTIONS") return new Response(null, { status: 204, headers });
    if (req.method !== "POST") return json(405, { error: "paid_video_checkout_method_not_allowed", dispatchAllowed: false });
    const now = deps.now ?? Date.now, startedAt = now(), bodyController = new AbortController();
    let timer: ReturnType<typeof setTimeout> | undefined, expired = false, executed = false;
    const checkBudget = () => { const time = now(); if (expired || !Number.isFinite(time) || !Number.isFinite(startedAt) || time < startedAt || time - startedAt >= 5000)
      throw new BoundaryError("paid_video_checkout_outcome_unknown", 503); return time; };
    try {
      return await Promise.race([(async () => {
        const request = await readRequest(req, bodyController.signal); checkBudget();
        const authenticated = await deps.authenticate(req); checkBudget();
        if (!authenticated || !uuid(authenticated.userId) || !uuid(authenticated.sessionId)) throw new BoundaryError("paid_video_checkout_invalid_session", 401);
        const actor = freeze({ userId: authenticated.userId, sessionId: authenticated.sessionId });
        if (actor.sessionId !== request.expectedSessionId) throw new BoundaryError("paid_video_checkout_session_mismatch", 401);
        const input = freeze({ actor, request }); checkBudget(); executed = true;
        const result = structuredClone(await deps.execute(input)); checkBudget();
        validatePaidVideoCheckoutV3Result(result, input); return json(200, result);
      })(), new Promise<never>((_, reject) => { timer = setTimeout(() => { expired = true; bodyController.abort(); reject(new BoundaryError("paid_video_checkout_outcome_unknown", 503)); }, 5000); })]);
    } catch (error) {
      const safe = !executed && error instanceof BoundaryError ? error : new BoundaryError("paid_video_checkout_outcome_unknown", 503);
      return json(safe.status, { error: safe.code, outcome: executed ? "unknown" : "not_sent", dispatchAllowed: false, retryProviderMutation: false, grantsAccess: false, notPayable: true });
    } finally { clearTimeout(timer); bodyController.abort(); }
  };
}

