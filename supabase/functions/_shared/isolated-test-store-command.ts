/** HTTP boundary only. SQL owns one-use dispatch admission and receipt authority. */
export type TestStoreCommand = "allocate" | "claim" | "read" | "report";
export type TestStoreActor = Readonly<{ userId: string; sessionId: string }>;
export type TestStoreCommandRequest = Readonly<{
  protocol: "isolated-test-store-v1"; command: TestStoreCommand; requestId: string;
  expectedSessionId: string; configurationDigest: string; payload: Readonly<Record<string, unknown>>;
}>;
export type TestStoreExecution = Readonly<{ actor: TestStoreActor; request: TestStoreCommandRequest }>;
export type TestStoreCommandDependencies = {
  authenticate: (req: Request) => Promise<TestStoreActor | null>;
  execute: (input: TestStoreExecution) => Promise<unknown>;
  now?: () => number;
};
type Row = Record<string, unknown>;
const row = (v: unknown): v is Row => !!v && typeof v === "object" && !Array.isArray(v);
const keys = (v: Row, names: readonly string[]) => Object.keys(v).length === names.length && names.every(k => Object.hasOwn(v, k));
const uuid = (v: unknown): v is string => typeof v === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u.test(v);
const digest = (v: unknown): v is string => typeof v === "string" && /^[0-9a-f]{64}$/u.test(v);
const id = (v: unknown, kind: string) => typeof v === "string" && v.startsWith(`scv1_${kind}_`) && uuid(v.slice(`scv1_${kind}_`.length));
const text = (v: unknown, max = 200): v is string => typeof v === "string" && v.length > 0 && v.length <= max && v.trim() === v && !/[\u0000-\u001f\u007f]/u.test(v);
const positive = (v: unknown) => typeof v === "number" && Number.isSafeInteger(v) && v > 0;
const date = (v: unknown): v is string => typeof v === "string" && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,6})?(?:Z|[+-]\d{2}:\d{2})$/u.test(v) && Number.isFinite(Date.parse(v));
const choice = (v: unknown, values: readonly string[]) => typeof v === "string" && values.includes(v);
const quoteKeys = ["offerId", "offerRevision", "resourceId", "resourceRevision", "creatorId", "kind", "amountMinor", "currency"];
const quote = (v: unknown): v is Row => row(v) && keys(v, quoteKeys) && id(v.offerId, "offer") && positive(v.offerRevision)
  && id(v.resourceId, "resource") && positive(v.resourceRevision) && uuid(v.creatorId) && v.kind === "creator_tip" && positive(v.amountMinor) && v.currency === "usd";
const sameQuote = (a: Row, b: Row) => quoteKeys.every(k => a[k] === b[k]);
function payload(command: TestStoreCommand, v: unknown): v is Row {
  if (!row(v) || !id(v.intentId, "intent")) return false;
  if (command === "allocate") return keys(v, ["intentId", "expectedQuote"]) && quote(v.expectedQuote);
  if (command === "claim") return keys(v, ["intentId", "dispatchId", "expectedQuote"]) && uuid(v.dispatchId) && quote(v.expectedQuote);
  if (command === "read") return keys(v, ["intentId"]);
  return keys(v, ["intentId", "dispatchId", "outcome", "transactionHint"]) && uuid(v.dispatchId)
    && choice(v.outcome, ["sdk_success", "sdk_cancelled", "sdk_failed", "sdk_unknown"]) && (v.transactionHint === null || text(v.transactionHint));
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
function exactScope(value: unknown, projectId: string, appId: string): boolean {
  if (!text(value, 500)) return false;
  try {
    const parsed: unknown = strictJson(value), expected = ["revenuecat", projectId, appId, "TEST_STORE", "SANDBOX"];
    return Array.isArray(parsed) && parsed.length === expected.length && expected.every((part, index) => parsed[index] === part);
  } catch { return false; }
}
async function readRequest(req: Request): Promise<TestStoreCommandRequest> {
  const length = req.headers.get("content-length");
  if (length !== null && (!/^\d+$/u.test(length) || Number(length) > 8192)) throw new BoundaryError("test_store_body_limit", 413);
  if (!req.body) throw new BoundaryError("test_store_invalid_request", 400);
  const reader = req.body.getReader(), chunks: Uint8Array[] = []; let size = 0;
  try { for (;;) { const next = await reader.read(); if (next.done) break; size += next.value.byteLength;
    if (size > 8192) { void reader.cancel().catch(() => {}); throw new BoundaryError("test_store_body_limit", 413); } chunks.push(next.value); }
  } finally { reader.releaseLock(); }
  const bytes = new Uint8Array(size); let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
  let v: unknown;
  try { v = strictJson(new TextDecoder("utf-8", { fatal: true }).decode(bytes)); } catch { throw new BoundaryError("test_store_invalid_request", 400); }
  if (!row(v) || !keys(v, ["protocol", "command", "requestId", "expectedSessionId", "configurationDigest", "payload"])
    || v.protocol !== "isolated-test-store-v1" || !choice(v.command, ["allocate", "claim", "read", "report"])
    || !uuid(v.requestId) || !uuid(v.expectedSessionId) || !digest(v.configurationDigest) || !payload(v.command as TestStoreCommand, v.payload))
    throw new BoundaryError("test_store_invalid_request", 400);
  return freeze(v as TestStoreCommandRequest);
}
function validateResult(v: unknown, input: TestStoreExecution, completedAt: number): void {
  const { actor, request } = input, invalid = () => { throw new BoundaryError("test_store_outcome_unknown", 503); };
  if (!row(v) || !keys(v, ["protocol", "command", "requestId", "actor", "generation", "environment", "result"])
    || v.protocol !== request.protocol || v.command !== request.command || v.requestId !== request.requestId || v.generation !== 1 || v.environment !== "sandbox"
    || !row(v.actor) || !keys(v.actor, ["userId", "sessionId"]) || v.actor.userId !== actor.userId || v.actor.sessionId !== actor.sessionId || !row(v.result)) return invalid();
  const r = v.result;
  if (!keys(r, ["status", "reason", "dispatchAllowed", "retryProviderMutation", "grantsAccess", "notPayable", "allocation", "authorityValidUntil", "receipt"])
    || !choice(r.status, ["allocated", "dispatch_claimed", "pending", "verified", "refunded", "revoked", "held", "expired", "unavailable"])
    || !text(r.reason) || typeof r.dispatchAllowed !== "boolean" || r.retryProviderMutation !== false || r.grantsAccess !== false || r.notPayable !== true) return invalid();
  const a = r.allocation;
  if (a !== null) {
    if (!row(a) || !keys(a, ["intentId", "dispatchId", "providerAppUserId", "configurationDigest", "projectId", "appId", "productId", "provider", "store", "sourceEnvironment", "providerScopeKey", "economicApplicationId", "quote", "acceptPurchaseUntil"])
      || a.intentId !== request.payload.intentId || !uuid(a.dispatchId) || typeof a.providerAppUserId !== "string"
      || !/^scv1_teststore_[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u.test(a.providerAppUserId)
      || a.configurationDigest !== request.configurationDigest || !text(a.projectId) || !text(a.appId) || !text(a.productId)
      || a.provider !== "revenuecat" || a.store !== "TEST_STORE" || a.sourceEnvironment !== "SANDBOX" || !quote(a.quote) || !date(a.acceptPurchaseUntil)
      || !exactScope(a.providerScopeKey, a.projectId, a.appId)
      || a.economicApplicationId !== `rc_test_store:${a.projectId}:${a.appId}`
      || ("dispatchId" in request.payload && a.dispatchId !== request.payload.dispatchId)
      || ("expectedQuote" in request.payload && (!quote(request.payload.expectedQuote) || !sameQuote(a.quote, request.payload.expectedQuote)))) return invalid();
  } else if (!choice(r.status, ["held", "unavailable"])) return invalid();
  if (r.dispatchAllowed) {
    if (request.command !== "claim" || r.status !== "dispatch_claimed" || !row(a) || !date(a.acceptPurchaseUntil) || !date(r.authorityValidUntil)
      || Date.parse(r.authorityValidUntil) <= completedAt || Date.parse(r.authorityValidUntil) > completedAt + 5000
      || Date.parse(r.authorityValidUntil) > Date.parse(a.acceptPurchaseUntil) || r.receipt !== null) return invalid();
  } else if (r.authorityValidUntil !== null || r.status === "dispatch_claimed") return invalid();
  if (r.receipt !== null) {
    const receipt = r.receipt;
    if (!a || !row(receipt) || !keys(receipt, ["id", "state", "providerTransactionId", "originalTransactionId", "purchasedAt"])
      || !id(receipt.id, "receipt") || !choice(receipt.state, ["verified", "refunded", "revoked", "quarantined"])
      || !text(receipt.providerTransactionId) || !text(receipt.originalTransactionId) || !date(receipt.purchasedAt)
      || (r.status !== "held" && (receipt.state === "quarantined" || r.status !== receipt.state))) return invalid();
  } else if (choice(r.status, ["verified", "refunded", "revoked"])) return invalid();
}
const headers = { "content-type": "application/json", "cache-control": "no-store", "access-control-allow-origin": "*",
  "access-control-allow-headers": "authorization, apikey, content-type, x-client-info, x-chillywood-platform", "access-control-allow-methods": "POST, OPTIONS" };
const json = (status: number, value: unknown) => new Response(JSON.stringify(value), { status, headers });
export function createIsolatedTestStoreCommandHandler(deps: TestStoreCommandDependencies) {
  return async (req: Request): Promise<Response> => {
    if (req.method === "OPTIONS") return new Response(null, { status: 204, headers });
    if (req.method !== "POST") return json(405, { error: "test_store_method_not_allowed", dispatchAllowed: false });
    const now = deps.now ?? Date.now, startedAt = now(); let timer: ReturnType<typeof setTimeout> | undefined, expired = false, executed = false;
    const checkBudget = () => { const time = now(); if (expired || !Number.isFinite(time) || !Number.isFinite(startedAt) || time < startedAt || time - startedAt >= 5000)
      throw new BoundaryError("test_store_outcome_unknown", 503); return time; };
    try {
      return await Promise.race([(async () => {
        const request = await readRequest(req); checkBudget();
        const authenticated = await deps.authenticate(req); checkBudget();
        if (!authenticated || !uuid(authenticated.userId) || !uuid(authenticated.sessionId)) throw new BoundaryError("test_store_invalid_session", 401);
        const actor = freeze({ userId: authenticated.userId, sessionId: authenticated.sessionId });
        if (actor.sessionId !== request.expectedSessionId) throw new BoundaryError("test_store_session_mismatch", 401);
        const input = freeze({ actor, request }); checkBudget(); executed = true;
        const result = structuredClone(await deps.execute(input)); const completedAt = checkBudget();
        validateResult(result, input, completedAt); return json(200, result);
      })(), new Promise<never>((_, reject) => { timer = setTimeout(() => { expired = true; reject(new BoundaryError("test_store_outcome_unknown", 503)); }, 5000); })]);
    } catch (error) {
      const safe = !executed && error instanceof BoundaryError ? error : new BoundaryError("test_store_outcome_unknown", 503);
      return json(safe.status, { error: safe.code, outcome: executed ? "unknown" : "not_sent", dispatchAllowed: false, retryProviderMutation: false, grantsAccess: false, notPayable: true });
    } finally { clearTimeout(timer); }
  };
}
