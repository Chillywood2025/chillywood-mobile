/** HTTP boundary only. SQL owns one-use dispatch admission and receipt authority. */
export type TestStoreV3Command = "bind" | "allocate" | "claim" | "read" | "report" | "advance";
export type TestStoreV3Actor = Readonly<{ userId: string; sessionId: string }>;
export type TestStoreV3CommandRequest = Readonly<{
  protocol: "isolated-test-store-v3"; command: TestStoreV3Command; requestId: string;
  expectedSessionId: string; configurationDigest: string; payload: Readonly<Record<string, unknown>>;
}>;
export type TestStoreV3Execution = Readonly<{ actor: TestStoreV3Actor; request: TestStoreV3CommandRequest }>;
export type TestStoreV3CommandDependencies = {
  authenticate: (req: Request) => Promise<TestStoreV3Actor | null>;
  execute: (input: TestStoreV3Execution) => Promise<unknown>;
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
const asset = (v: unknown): v is Row => row(v) && keys(v, assetKeys) && id(v.id, "asset") && uuid(v.incarnation)
  && digest(v.sha256) && positive(v.byteLength) && Number(v.byteLength) <= 16777216 && positive(v.resourceRevision)
  && v.profile === "scpv-mp4-h264-aac-v1";
const quote = (v: unknown): v is Row => row(v) && keys(v, quoteKeys) && id(v.offerId, "offer") && positive(v.offerRevision)
  && id(v.resourceId, "resource") && positive(v.resourceRevision) && uuid(v.creatorId) && v.kind === "paid_content" && positive(v.amountMinor) && v.currency === "usd"
  && asset(v.asset) && v.asset.resourceRevision === v.resourceRevision;
const sameQuote = (a: Row, b: Row) => quoteKeys.filter(k => k !== "asset").every(k => a[k] === b[k])
  && row(a.asset) && row(b.asset) && assetKeys.every(k => (a.asset as Row)[k] === (b.asset as Row)[k]);
export { quote as isPaidVideoQuoteV3, sameQuote as samePaidVideoQuoteV3 };
function payload(command: TestStoreV3Command, v: unknown): v is Row {
  if (!row(v)) return false;
  if (command === "bind") return keys(v, ["installationId"]) && uuid(v.installationId);
  if (!id(v.intentId, "intent")) return false;
  if (command === "allocate") return keys(v, ["customerBindingId", "intentId", "expectedQuote"]) && v3id(v.customerBindingId, "customer") && quote(v.expectedQuote);
  if (command === "claim") return keys(v, ["intentId", "dispatchId", "registrationId", "expectedQuote"]) && uuid(v.dispatchId) && v3id(v.registrationId, "registration") && quote(v.expectedQuote);
  if (command === "read") return keys(v, ["intentId"]);
  if (command === "advance") return keys(v, ["intentId", "dispatchId", "expectedReservationRevision", "disposition", "expectedReceiptId"])
    && uuid(v.dispatchId) && positive(v.expectedReservationRevision)
    && ((v.disposition === "receipt_recorded" && id(v.expectedReceiptId, "receipt")) || (v.disposition === "retain_unknown" && v.expectedReceiptId === null));
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
async function readRequest(req: Request, signal: AbortSignal): Promise<TestStoreV3CommandRequest> {
  const length = req.headers.get("content-length");
  if (length !== null && (!/^\d+$/u.test(length) || Number(length) > 8192)) throw new BoundaryError("test_store_body_limit", 413);
  if (!req.body) throw new BoundaryError("test_store_invalid_request", 400);
  const reader = req.body.getReader(), chunks: Uint8Array[] = []; let size = 0;
  const cancel = () => { void reader.cancel().catch(() => {}); };
  signal.addEventListener("abort", cancel, { once: true });
  try { for (;;) { if (signal.aborted) throw new BoundaryError("test_store_outcome_unknown", 503);
    const next = await reader.read(); if (signal.aborted) throw new BoundaryError("test_store_outcome_unknown", 503);
    if (next.done) break; size += next.value.byteLength;
    if (size > 8192) { void reader.cancel().catch(() => {}); throw new BoundaryError("test_store_body_limit", 413); } chunks.push(next.value); }
  } finally { signal.removeEventListener("abort", cancel); reader.releaseLock(); }
  const bytes = new Uint8Array(size); let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
  let v: unknown;
  try { v = strictJson(new TextDecoder("utf-8", { fatal: true }).decode(bytes)); } catch { throw new BoundaryError("test_store_invalid_request", 400); }
  if (!row(v) || !keys(v, ["protocol", "command", "requestId", "expectedSessionId", "configurationDigest", "payload"])
    || v.protocol !== "isolated-test-store-v3" || !choice(v.command, ["bind", "allocate", "claim", "read", "report", "advance"])
    || !uuid(v.requestId) || !uuid(v.expectedSessionId) || !digest(v.configurationDigest) || !payload(v.command as TestStoreV3Command, v.payload))
    throw new BoundaryError("test_store_invalid_request", 400);
  return freeze(v as TestStoreV3CommandRequest);
}
/** Validate SQL's complete current projection; this never manufactures receipt authority. */
export function validateTestStoreV3CommandResult(v: unknown, input: TestStoreV3Execution, completedAt: number): void {
  const { actor, request } = input, invalid = () => { throw new BoundaryError("test_store_outcome_unknown", 503); };
  if (!row(v) || !keys(v, ["protocol", "command", "requestId", "actor", "generation", "environment", "result"])
    || v.protocol !== request.protocol || v.command !== request.command || v.requestId !== request.requestId || v.generation !== 1 || v.environment !== "sandbox"
    || !row(v.actor) || !keys(v.actor, ["userId", "sessionId"]) || v.actor.userId !== actor.userId || v.actor.sessionId !== actor.sessionId || !row(v.result)) return invalid();
  const r = v.result;
  if (!keys(r, ["status", "reason", "dispatchAllowed", "retryProviderMutation", "grantsAccess", "notPayable", "customer", "allocation", "reservation", "authorityValidUntil", "receipt"])
    || !choice(r.status, ["customer_bound", "provisioning", "offering_ready", "dispatch_claimed", "pending", "verified", "refunded", "revoked", "held", "expired", "unavailable", "released"])
    || !text(r.reason) || typeof r.dispatchAllowed !== "boolean" || r.retryProviderMutation !== false || r.grantsAccess !== false || r.notPayable !== true) return invalid();
  const c = r.customer, a = r.allocation, reservation = r.reservation;
  if (c === null) {
    if (!choice(r.status, ["held", "unavailable"]) || a !== null || reservation !== null) return invalid();
  } else {
    if (!row(c) || !keys(c, ["id", "buyerId", "installationId", "providerAppUserId", "configurationDigest", "projectId", "appId", "providerScopeKey", "economicApplicationId", "provider", "store", "sourceEnvironment"])
      || !v3id(c.id, "customer") || c.buyerId !== actor.userId || !uuid(c.installationId) || typeof c.providerAppUserId !== "string"
      || !/^scv3_teststore_[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u.test(c.providerAppUserId)
      || c.configurationDigest !== request.configurationDigest || !text(c.projectId) || !text(c.appId)
      || c.provider !== "revenuecat" || c.store !== "TEST_STORE" || c.sourceEnvironment !== "SANDBOX"
      || !exactScope(c.providerScopeKey, c.projectId, c.appId) || c.economicApplicationId !== `rc_test_store:${c.projectId}:${c.appId}`
      || !row(reservation) || !keys(reservation, ["revision", "activeAllocationId"]) || !positive(reservation.revision)
      || (reservation.activeAllocationId !== null && !v3id(reservation.activeAllocationId, "allocation"))
      || ("installationId" in request.payload && c.installationId !== request.payload.installationId)
      || ("customerBindingId" in request.payload && c.id !== request.payload.customerBindingId)) return invalid();
  }
  if (a !== null) {
    if (!row(a) || !row(c) || !row(reservation) || !keys(a, ["id", "intentId", "dispatchId", "customerBindingId", "configurationDigest", "productId", "quote", "acceptPurchaseUntil", "registration"])
      || !v3id(a.id, "allocation") || !id(a.intentId, "intent") || !uuid(a.dispatchId) || a.customerBindingId !== c.id
      || a.configurationDigest !== request.configurationDigest || !text(a.productId) || !quote(a.quote) || a.quote.creatorId === actor.userId || !date(a.acceptPurchaseUntil)
      || ("intentId" in request.payload && a.intentId !== request.payload.intentId)
      || ("dispatchId" in request.payload && a.dispatchId !== request.payload.dispatchId)
      || ("expectedQuote" in request.payload && (!quote(request.payload.expectedQuote) || !sameQuote(a.quote, request.payload.expectedQuote)))) return invalid();
    const registration = a.registration;
    if (registration !== null && (!row(registration) || !keys(registration, ["id", "providerOfferingId", "offeringIdentifier", "providerPackageId", "packageIdentifier", "providerProductId", "productId"])
      || !v3id(registration.id, "registration") || !["providerOfferingId", "offeringIdentifier", "providerPackageId", "packageIdentifier", "providerProductId", "productId"].every(k => text(registration[k]))
      || registration.productId !== a.productId)) return invalid();
    if (("registrationId" in request.payload && (!row(registration) || registration.id !== request.payload.registrationId))
      || (r.status === "provisioning" && registration !== null)
      || (choice(r.status, ["offering_ready", "dispatch_claimed", "pending", "verified", "refunded", "revoked"]) && registration === null)
      || (r.status === "released" && reservation.activeAllocationId === a.id)) return invalid();
  } else if (!choice(r.status, ["customer_bound", "held", "unavailable"])) return invalid();
  if (r.status === "customer_bound" && (request.command !== "bind" || !row(c) || a !== null || !row(reservation) || reservation.activeAllocationId !== null)) return invalid();
  if (r.dispatchAllowed) {
    if (request.command !== "claim" || r.status !== "dispatch_claimed" || !row(a) || !row(reservation) || reservation.activeAllocationId !== a.id
      || !date(a.acceptPurchaseUntil) || !date(r.authorityValidUntil) || Date.parse(r.authorityValidUntil) <= completedAt
      || Date.parse(r.authorityValidUntil) > completedAt + 5000 || Date.parse(r.authorityValidUntil) > Date.parse(a.acceptPurchaseUntil) || r.receipt !== null) return invalid();
  } else if (r.authorityValidUntil !== null || r.status === "dispatch_claimed") return invalid();
  if (r.receipt !== null) {
    const receipt = r.receipt;
    if (!a || !row(receipt) || !keys(receipt, ["id", "state", "providerTransactionId", "originalTransactionId", "purchasedAt"])
      || !id(receipt.id, "receipt") || !choice(receipt.state, ["verified", "refunded", "revoked", "quarantined"])
      || !text(receipt.providerTransactionId) || !text(receipt.originalTransactionId) || !date(receipt.purchasedAt)
      || (receipt.state === "quarantined" && r.status !== "held")
      || (r.status !== "held" && r.status !== "released" && r.status !== receipt.state)) return invalid();
  } else if (choice(r.status, ["verified", "refunded", "revoked"])) return invalid();
  if (r.status === "released") {
    if (request.command !== "advance" || !row(reservation) || !positive(request.payload.expectedReservationRevision)
      || Number(reservation.revision) <= Number(request.payload.expectedReservationRevision)
      || (request.payload.disposition === "receipt_recorded" && (!row(r.receipt) || r.receipt.id !== request.payload.expectedReceiptId))) return invalid();
  }
}
const headers = { "content-type": "application/json", "cache-control": "no-store", "access-control-allow-origin": "*",
  "access-control-allow-headers": "authorization, apikey, content-type, x-client-info, x-chillywood-platform", "access-control-allow-methods": "POST, OPTIONS" };
const json = (status: number, value: unknown) => new Response(JSON.stringify(value), { status, headers });
export function createIsolatedTestStoreV3CommandHandler(deps: TestStoreV3CommandDependencies) {
  return async (req: Request): Promise<Response> => {
    if (req.method === "OPTIONS") return new Response(null, { status: 204, headers });
    if (req.method !== "POST") return json(405, { error: "test_store_method_not_allowed", dispatchAllowed: false });
    const now = deps.now ?? Date.now, startedAt = now(), bodyController = new AbortController();
    let timer: ReturnType<typeof setTimeout> | undefined, expired = false, executed = false;
    const checkBudget = () => { const time = now(); if (expired || !Number.isFinite(time) || !Number.isFinite(startedAt) || time < startedAt || time - startedAt >= 5000)
      throw new BoundaryError("test_store_outcome_unknown", 503); return time; };
    try {
      return await Promise.race([(async () => {
        const request = await readRequest(req, bodyController.signal); checkBudget();
        const authenticated = await deps.authenticate(req); checkBudget();
        if (!authenticated || !uuid(authenticated.userId) || !uuid(authenticated.sessionId)) throw new BoundaryError("test_store_invalid_session", 401);
        const actor = freeze({ userId: authenticated.userId, sessionId: authenticated.sessionId });
        if (actor.sessionId !== request.expectedSessionId) throw new BoundaryError("test_store_session_mismatch", 401);
        const input = freeze({ actor, request }); checkBudget(); executed = true;
        const result = structuredClone(await deps.execute(input)); const completedAt = checkBudget();
        validateTestStoreV3CommandResult(result, input, completedAt); return json(200, result);
      })(), new Promise<never>((_, reject) => { timer = setTimeout(() => { expired = true; bodyController.abort(); reject(new BoundaryError("test_store_outcome_unknown", 503)); }, 5000); })]);
    } catch (error) {
      const safe = !executed && error instanceof BoundaryError ? error : new BoundaryError("test_store_outcome_unknown", 503);
      return json(safe.status, { error: safe.code, outcome: executed ? "unknown" : "not_sent", dispatchAllowed: false, retryProviderMutation: false, grantsAccess: false, notPayable: true });
    } finally { clearTimeout(timer); bodyController.abort(); }
  };
}
