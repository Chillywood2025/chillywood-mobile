import {
  authenticateRevenueCatEnvelope, decryptRouterEnvelope, MAX_RECEIPT_BYTES, observeRevenueCatBytes,
  RouterBoundaryError, type RouterConnection, type RouterEnvelope, type RouterObservation,
} from "./revenuecat-router-envelope.ts";

/** Dedicated, server-owned Test Store configuration. A connection revision must
 * immutably identify this app/configuration digest in the persistence adapter.
 * The inherited envelope AAD binds the connection revision and project; the
 * backend must also compare this digest to its stored qualified configuration.
 */
export type TestStoreConnection = RouterConnection & { appId: string; providerConfigurationDigest: string };
export type TestStoreObservation = RouterObservation & {
  protocol: "scv1-test-store-observation-v1"; projectId: string; providerConfigurationDigest: string;
  mode: "tip_purchase" | "cancellation" | "hold"; customerId: string | null;
  purchasedAt: string | null; expiresAt: string | null; amountMinor: number | null;
  currency: "usd" | null; quantity: 1 | null; cancelReason: string | null;
  classificationOnly: true; authorityGranted: false;
};
export type TestStoreIngestResult = {
  protocol: "scv1-test-store-ingress-result-v1"; receiptId: string;
  status: "recorded" | "duplicate" | "conflict"; durable: true;
  acknowledgementAllowed: boolean; authorityGranted: false; financialAuthority: false;
};
export type TestStoreHandlerDependencies = {
  connection?: () => TestStoreConnection | null;
  persist: (connectionId: string, revision: number, envelope: RouterEnvelope,
    observation: TestStoreObservation) => Promise<TestStoreIngestResult>;
};
const exactText = (value: unknown): value is string => typeof value === "string"
  && value.length > 0 && value.length <= 512 && value === value.trim() && !/[\u0000-\u001f\u007f]/u.test(value);
const uuid = (value: unknown): value is string => typeof value === "string"
  && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u.test(value);
const customer = (value: unknown): value is string => typeof value === "string"
  && /^scv1_teststore_[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u.test(value);
const record = (value: unknown): value is Record<string, unknown> => !!value && typeof value === "object" && !Array.isArray(value);

function snapshotConnection(value: TestStoreConnection): TestStoreConnection {
  if (!value || !uuid(value.connectionId) || !Number.isSafeInteger(value.connectionRevision) || value.connectionRevision < 1
    || !exactText(value.projectId) || !exactText(value.appId) || typeof value.providerConfigurationDigest !== "string"
    || !/^[a-f0-9]{64}$/u.test(value.providerConfigurationDigest) || value.authentication?.method !== "shared_secret"
    || !exactText(value.authentication.keyVersion) || typeof value.authentication.secret !== "string"
    || value.authentication.secret.length < 32 || value.authentication.secret.length > 4096
    || /[\r\n]/u.test(value.authentication.secret) || !exactText(value.encryption?.keyId)
    || !(value.encryption.key instanceof Uint8Array) || value.encryption.key.length !== 32)
    throw new RouterBoundaryError("test_store_configuration_unavailable", 503);
  return { connectionId: value.connectionId, connectionRevision: value.connectionRevision,
    projectId: value.projectId, appId: value.appId, providerConfigurationDigest: value.providerConfigurationDigest,
    authentication: { ...value.authentication }, encryption: { ...value.encryption, key: new Uint8Array(value.encryption.key) } };
}

// The shared parser has already validated JSON structure, duplicate keys and
// limits. Retain exact scalar tokens only at event.<field>, so JSON.parse cannot
// round a fractional cent or oversized integer into an acceptable value.
function eventScalarTokens(text: string): Map<string, string> {
  let offset = 0;
  const tokens = new Map<string, string>();
  const space = () => { while (/\s/u.test(text[offset] ?? "")) offset++; };
  const string = (): string => {
    const start = offset++;
    while (offset < text.length) {
      if (text[offset] === "\\") { offset += 2; continue; }
      if (text[offset++] === '"') return JSON.parse(text.slice(start, offset)) as string;
    }
    throw Error("invalid_json");
  };
  const value = (path: string[]): void => {
    space(); const start = offset;
    if (text[offset] === "{") {
      offset++; space();
      if (text[offset] === "}") { offset++; return; }
      for (;;) { const key = string(); space(); offset++; value([...path, key]); space();
        if (text[offset++] === "}") return; space(); }
    }
    if (text[offset] === "[") {
      offset++; space();
      if (text[offset] === "]") { offset++; return; }
      for (;;) { value([...path, "[]"]); space(); if (text[offset++] === "]") return; space(); }
    }
    if (text[offset] === '"') string();
    else { const token = /^(?:true|false|null|-?(?:0|[1-9][0-9]*)(?:\.[0-9]+)?(?:[eE][+-]?[0-9]+)?)/u.exec(text.slice(offset));
      if (!token) throw Error("invalid_json"); offset += token[0].length; }
    if (path.length === 2 && path[0] === "event") tokens.set(path[1], text.slice(start, offset));
  };
  value([]); return tokens;
}
function scaledInteger(token: string | undefined, places: number): number | null {
  if (!token || token.length > 80) return null;
  const match = /^(-?)(0|[1-9][0-9]*)(?:\.([0-9]+))?(?:[eE]([+-]?[0-9]+))?$/u.exec(token);
  if (!match) return null;
  const fraction = match[3] ?? "", exponent = Number(match[4] ?? 0);
  if (!Number.isSafeInteger(exponent) || Math.abs(exponent) > 80) return null;
  const shift = places + exponent - fraction.length;
  let integer = BigInt(match[2] + fraction);
  if (Math.abs(shift) > 160) return null;
  if (shift >= 0) integer *= 10n ** BigInt(shift);
  else { const divisor = 10n ** BigInt(-shift); if (integer % divisor !== 0n) return null; integer /= divisor; }
  if (match[1] === "-") integer = -integer;
  if (integer > BigInt(Number.MAX_SAFE_INTEGER) || integer < BigInt(Number.MIN_SAFE_INTEGER)) return null;
  return Number(integer);
}

/** Classification only: neither this parser nor client-supplied fields confer
 * authentication, ownership, session authority, financial authority or access.
 * Unsupported/malformed authenticated bytes are preserved for a project hold.
 */
export function parseTestStoreObservation(raw: Uint8Array, configuration: TestStoreConnection): TestStoreObservation {
  const connection = snapshotConnection(configuration);
  if (!(raw instanceof Uint8Array) || raw.byteLength > MAX_RECEIPT_BYTES)
    throw new RouterBoundaryError("test_store_body_limit", 413);
  const common = observeRevenueCatBytes(raw), issues = [...common.issues];
  const out: TestStoreObservation = { ...common, issues, protocol: "scv1-test-store-observation-v1",
    projectId: connection.projectId, providerConfigurationDigest: connection.providerConfigurationDigest,
    mode: "hold", customerId: null, purchasedAt: null, expiresAt: null, amountMinor: null,
    currency: null, quantity: null, cancelReason: null, classificationOnly: true, authorityGranted: false };
  const issue = (reason: string) => { if (!issues.includes(reason)) issues.push(reason); };
  if (common.appId !== connection.appId) issue("test_store_app_mismatch");
  if (common.store !== "TEST_STORE") issue("test_store_store_required");
  if (common.environment !== "SANDBOX") issue("test_store_sandbox_required");
  const identityValid = customer(common.userId) && common.originalUserId === common.userId
    && common.aliases.every(alias => alias === common.userId) && common.conflictingUserIds.length === 0
    && !common.issues.some(reason => ["invalid_aliases", "duplicate_aliases"].includes(reason));
  if (!identityValid) issue("test_store_dispatch_identity_required");
  if (identityValid && common.appId === connection.appId && common.store === "TEST_STORE" && common.environment === "SANDBOX")
    out.customerId = common.userId;
  if (common.transferredFrom.length || common.transferredTo.length) issue("test_store_transfer_requires_reconciliation");
  if (!common.eventAt) issue("test_store_event_time_required");
  if (!["NON_RENEWING_PURCHASE", "CANCELLATION"].includes(common.eventType ?? "")) issue("test_store_lifecycle_requires_reconciliation");
  if (common.issues.some(reason => ["invalid_json", "duplicate_json_key", "json_structure_limit", "invalid_event_envelope"].includes(reason))) {
    out.parseStatus = "invalid"; return out;
  }
  const text = new TextDecoder("utf-8", { fatal: true }).decode(raw);
  const parsed: unknown = JSON.parse(text);
  if (!record(parsed) || !record(parsed.event)) { issue("invalid_event_envelope"); out.parseStatus = "invalid"; return out; }
  const event = parsed.event, tokens = eventScalarTokens(text);
  const instant = (field: string): string | null => {
    const millis = typeof event[field] === "number" ? scaledInteger(tokens.get(field), 0) : null;
    if (millis === null || millis <= 0 || !Number.isFinite(new Date(millis).getTime())) { issue(`invalid_${field}`); return null; }
    return new Date(millis).toISOString();
  };
  // Recheck the original numeric lexeme as well as the common parsed timestamp.
  out.eventAt = instant("event_timestamp_ms");
  if (event.purchased_at_ms !== undefined && event.purchased_at_ms !== null) out.purchasedAt = instant("purchased_at_ms");
  if (event.expiration_at_ms !== undefined && event.expiration_at_ms !== null) out.expiresAt = instant("expiration_at_ms");
  if (event.price_in_purchased_currency !== undefined && event.price_in_purchased_currency !== null) {
    out.amountMinor = typeof event.price_in_purchased_currency === "number" ? scaledInteger(tokens.get("price_in_purchased_currency"), 2) : null;
    if (out.amountMinor === null) issue("test_store_price_invalid");
  }
  if (event.currency === "USD") out.currency = "usd";
  else if (event.currency !== undefined && event.currency !== null) issue("test_store_currency_invalid");
  if (typeof event.quantity === "number" && scaledInteger(tokens.get("quantity"), 0) === 1) out.quantity = 1;
  else if (event.quantity !== undefined && event.quantity !== null) issue("test_store_quantity_invalid");
  if (event.cancel_reason !== undefined && event.cancel_reason !== null) {
    if (exactText(event.cancel_reason)) out.cancelReason = event.cancel_reason;
    else issue("test_store_cancel_reason_invalid");
  }
  if (common.eventType === "NON_RENEWING_PURCHASE") {
    if (!common.productId || !common.transactionId || !common.originalTransactionId) issue("test_store_purchase_identity_required");
    if (!out.purchasedAt || !out.eventAt || Date.parse(out.purchasedAt) > Date.parse(out.eventAt)) issue("test_store_purchase_time_invalid");
    if (event.expiration_at_ms !== null) issue("test_store_finite_purchase_required");
    if (out.amountMinor === null || out.amountMinor <= 0 || out.currency !== "usd") issue("test_store_quote_required");
    if (out.quantity !== 1) issue("test_store_explicit_quantity_required");
    if (event.cancel_reason !== undefined && event.cancel_reason !== null) issue("test_store_purchase_cancel_reason_conflict");
  } else if (common.eventType === "CANCELLATION") {
    // A cancellation is evidence only. The backend must recover immutable
    // original ownership and qualify the reason/economics before any refund.
    if (!common.originalTransactionId) issue("test_store_terminal_original_required");
    if (!out.cancelReason) issue("test_store_cancel_reason_required");
  }
  out.parseStatus = issues.length ? "invalid" : "valid";
  if (!issues.length) out.mode = common.eventType === "NON_RENEWING_PURCHASE" ? "tip_purchase" : "cancellation";
  return out;
}

function freezeTree<T>(value: T): T {
  if (value && typeof value === "object") { Object.values(value).forEach(freezeTree); Object.freeze(value); }
  return value;
}
const json = (status: number, body: Record<string, unknown>) => new Response(JSON.stringify(body), {
  status, headers: { "content-type": "application/json", "cache-control": "no-store" },
});
export function createIsolatedTestStoreHandler(deps: TestStoreHandlerDependencies) {
  return async (req: Request): Promise<Response> => {
    try {
      const configured = deps.connection?.() ?? null;
      if (!configured) throw new RouterBoundaryError("test_store_configuration_unavailable", 503);
      const connection = snapshotConnection(configured);
      const envelope = await authenticateRevenueCatEnvelope(req, connection);
      const raw = await decryptRouterEnvelope(envelope, connection);
      const observation = parseTestStoreObservation(raw, connection);
      // Keep the inherited observation unchanged. Additional facts are derived
      // from those very same decrypted bytes, never from a client callback.
      freezeTree(envelope); freezeTree(observation);
      let timer: ReturnType<typeof setTimeout> | undefined;
      let result: TestStoreIngestResult;
      try { result = await Promise.race([
        deps.persist(connection.connectionId, connection.connectionRevision, envelope, observation),
        new Promise<never>((_, reject) => { timer = setTimeout(() => reject(new RouterBoundaryError("test_store_persistence_uncertain", 503)), 5000); }),
      ]); } finally { clearTimeout(timer); }
      if (!result || result.protocol !== "scv1-test-store-ingress-result-v1" || !uuid(result.receiptId)
        || !["recorded", "duplicate", "conflict"].includes(result.status) || result.durable !== true
        || typeof result.acknowledgementAllowed !== "boolean" || result.authorityGranted !== false || result.financialAuthority !== false)
        throw new RouterBoundaryError("test_store_persistence_result_invalid", 503);
      // Only the atomic backend can confirm the projection or namespace hold
      // is durable. Parsing, authenticated bytes, and SDK returns cannot do so.
      const acknowledge = result.status !== "conflict" && result.acknowledgementAllowed;
      return json(acknowledge ? 200 : 503, { status: acknowledge ? "recorded" : "recorded_processing_unavailable",
        receiptId: result.receiptId, durable: true, retryable: !acknowledge,
        authorityGranted: false, financialAuthority: false, providerDispatchAllowed: false });
    } catch (error) {
      const safe = error instanceof RouterBoundaryError ? error : new RouterBoundaryError("test_store_ingress_unavailable", 503);
      return json(safe.status, { error: safe.code, authorityGranted: false, financialAuthority: false, providerDispatchAllowed: false });
    }
  };
}
