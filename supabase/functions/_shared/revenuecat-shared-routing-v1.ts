/** Optional composition at the EXISTING shared RevenueCat webhook. The legacy
 * consumer always runs. Native-only success never stands in for legacy work.
 * Route manifests are server-owned catalog inventories, not provider hints. */
import { authenticateRevenueCatEnvelope, bytesHex, decryptRouterEnvelope, observeRevenueCatBytes, RouterBoundaryError } from "./revenuecat-router-envelope.ts";
import { persistNativeStoreSandboxIntakeV1, type NativeStoreSandboxConnectionV1, type NativeStoreSandboxIntakeV1 } from "./native-store-sandbox-bridge-v1.ts";
import { selectNativeStoreIngressConnectionV1 } from "./native-store-runtime-config-v1.ts";

type Row = Record<string, unknown>;
const row = (v: unknown): v is Row => !!v && typeof v === "object" && !Array.isArray(v);
const keys = (v: unknown, names: string[]): v is Row => row(v) && Object.keys(v).length === names.length && names.every(k => Object.hasOwn(v, k));
const text = (v: unknown): v is string => typeof v === "string" && v.length > 0 && v.length <= 512 && v === v.trim()
  && !/[\u0000-\u001f\u007f\ud800-\udfff]/u.test(v);
const uuid = (v: unknown): v is string => typeof v === "string" && /^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/u.test(v);
const unavailable = () => new RouterBoundaryError("shared_routing_unavailable", 503);
export type SharedRouteV1 = Readonly<{ connection: NativeStoreSandboxConnectionV1; nativeProducts: readonly string[]; legacyProducts: readonly string[] }>;
export type RevenueCatLegacyObserverV1 = Readonly<{ nativeExcluded(rawSha256: string): void }>;
export type RevenueCatLegacyHandlerV1 = (request: Request, observer?: RevenueCatLegacyObserverV1) => Promise<Response>;

/** Reuse the immutable qualified authentication/encryption boundary rather than
 * changing its pinned source. The ephemeral envelope is never persisted, and
 * the authenticated bytes remain private to this handler. */
export async function readAuthenticatedRevenueCatBytes(request: Request, connection: NativeStoreSandboxConnectionV1): Promise<Uint8Array> {
  return decryptRouterEnvelope(await authenticateRevenueCatEnvelope(request, connection), connection);
}

/** Select active revisions explicitly. Retained old keys in CONNECTIONS_JSON
 * remain replay-only; never choose the newest revision by sorting. */
export function parseRevenueCatSharedRoutesV1(serialized: string | null | undefined,
  connections: readonly NativeStoreSandboxConnectionV1[]): readonly SharedRouteV1[] {
  if (typeof serialized !== "string" || serialized.length > 131072) throw unavailable();
  let value: unknown; try { value = JSON.parse(serialized); } catch { throw unavailable(); }
  if (!keys(value, ["routes"]) || !Array.isArray(value.routes) || value.routes.length < 1 || value.routes.length > 32) throw unavailable();
  const result: SharedRouteV1[] = [], scopes = new Set<string>();
  for (const route of value.routes) {
    if (!keys(route, ["connectionId", "connectionRevision", "nativeProducts", "legacyProducts"])) throw unavailable();
    for (const products of [route.nativeProducts, route.legacyProducts])
      if (!Array.isArray(products) || products.length > 256 || !products.every(text) || new Set(products).size !== products.length) throw unavailable();
    const native = route.nativeProducts as string[], legacy = route.legacyProducts as string[];
    if (!native.length && !legacy.length || native.some(p => legacy.includes(p)
      || p === "premium_subscription" || p.startsWith("premium_subscription:")
      || ["com.chillywood.premium.monthly", "com.chillywood.premium.yearly"].includes(p))) throw unavailable();
    const connection = selectNativeStoreIngressConnectionV1(connections, route.connectionId, route.connectionRevision);
    const first = result[0]?.connection;
    // A single shared header identifies one project. Cross-project manifests
    // cannot use a body app_id to select a more privileged authentication key.
    if (first && (connection.projectId !== first.projectId || connection.authentication.secret !== first.authentication.secret)) throw unavailable();
    const scope = JSON.stringify([connection.appId, connection.store]);
    if (scopes.has(scope)) throw unavailable(); scopes.add(scope);
    result.push(Object.freeze({ connection, nativeProducts: Object.freeze([...native]), legacyProducts: Object.freeze([...legacy]) }));
  }
  return Object.freeze(result);
}

const legacyEventTypes = new Set(["INITIAL_PURCHASE", "RENEWAL", "CANCELLATION", "UNCANCELLATION", "NON_RENEWING_PURCHASE",
  "EXPIRATION", "BILLING_ISSUE", "SUBSCRIPTION_PAUSED", "SUBSCRIPTION_EXTENDED", "PRODUCT_CHANGE", "REFUND_REVERSED"]);
function classify(raw: Uint8Array, routes: readonly SharedRouteV1[]) {
  const observation = observeRevenueCatBytes(raw);
  const route = routes.find(r => r.connection.appId === observation.appId && r.connection.store === observation.store);
  const held = { kind: "held" as const, connection: route?.connection ?? routes[0].connection };
  // An exact production environment belongs only to the existing consumer,
  // including its malformed-identity quarantine and transfer/removal paths.
  // Duplicate-key/unparseable JSON has no trusted observation environment.
  if (observation.environment === "PRODUCTION") return { ...held, kind: "legacy" as const };
  if (observation.parseStatus !== "valid" || observation.issues.length || !route
    || observation.transferredFrom.length || observation.transferredTo.length || observation.eventType === "TRANSFER") return held;
  if (observation.environment !== "SANDBOX" || !observation.productId || !observation.eventType
    || !legacyEventTypes.has(observation.eventType)) return held;
  if (route.legacyProducts.includes(observation.productId)) return { ...held, kind: "legacy" as const };
  if (!route.nativeProducts.includes(observation.productId)) return held;
  // Native consumables have no Premium/subscription consumer. A product alias
  // or entitlement signal is mixed evidence, never an excuse to omit a consumer.
  const event = JSON.parse(new TextDecoder().decode(raw)).event as Row;
  for (const key of ["entitlement_ids", "entitlement_id", "entitlements"])
    if (Object.hasOwn(event, key) && event[key] !== null && !(Array.isArray(event[key]) && event[key].length === 0)) return held;
  if (Object.hasOwn(event, "product_identifier") || Object.hasOwn(event, "productIdentifier")) return held;
  if (!["NON_RENEWING_PURCHASE", "CANCELLATION"].includes(observation.eventType)) return held;
  return { ...held, kind: "native" as const, eventType: observation.eventType };
}

/** Worker result still says shared ACK=false. Only this composition can combine
 * its exact durable native effect with the independent legacy exclusion proof. */
function completed(value: unknown, receiptId: string, eventType: string): boolean {
  if (!keys(value, ["protocol", "rawReceiptId", "acknowledgementAllowed", "grantsAccess", "financialAuthority", "payable", "status", "nativeConsumerEffect"])
    || value.protocol !== "native-store-effect-worker-result-v1" || value.rawReceiptId !== receiptId || value.status !== "processed"
    || value.acknowledgementAllowed !== false || value.grantsAccess !== false || value.financialAuthority !== false || value.payable !== false) return false;
  const effect = value.nativeConsumerEffect;
  if (!keys(effect, ["protocol", "consumer", "rawReceiptId", "status", "effectKind", "allocationId", "grantId", "durable", "acknowledgementAllowed", "grantsAccess", "financialAuthority", "payable"])
    || effect.protocol !== "native-store-effect-result-v1" || effect.consumer !== "native-store-sandbox-v1" || effect.rawReceiptId !== receiptId
    || effect.durable !== true || effect.acknowledgementAllowed !== true || effect.grantsAccess !== false || effect.financialAuthority !== false || effect.payable !== false) return false;
  if (effect.effectKind === "positive_applied") return eventType === "NON_RENEWING_PURCHASE" && ["processed", "already_processed"].includes(effect.status as string)
    && typeof effect.allocationId === "string" && effect.allocationId.startsWith("nssv1_allocation_") && uuid(effect.allocationId.slice(17))
    && typeof effect.grantId === "string" && effect.grantId.startsWith("scv1_grant_") && uuid(effect.grantId.slice(11));
  if (effect.allocationId !== null || effect.grantId !== null) return false;
  return eventType === "CANCELLATION" && effect.effectKind === "negative_applied" && ["processed", "already_processed"].includes(effect.status as string)
    || eventType === "NON_RENEWING_PURCHASE" && effect.effectKind === "purchase_tombstoned" && ["purchase_tombstoned", "already_processed"].includes(effect.status as string);
}
const response = (acknowledged = false, status = 503) => Response.json({ status: acknowledged ? "processed" : "shared_processing_held",
  acknowledgementAllowed: acknowledged, retryable: !acknowledged, reconciliationComplete: false,
  dispatchAllowed: false, grantsAccess: false, financialAuthority: false, payable: false },
  { status, headers: { "cache-control": "no-store" } });

export function createRevenueCatSharedHandlerV1(deps: {
  routes(): readonly SharedRouteV1[] | null;
  legacy: RevenueCatLegacyHandlerV1;
  persist(intake: NativeStoreSandboxIntakeV1): Promise<unknown>;
  reconcile(receiptId: string, deadlineMs: number): Promise<unknown>;
  readSharedBytes?(request: Request, connection: NativeStoreSandboxConnectionV1): Promise<Uint8Array>;
}) {
  const io = Object.freeze({ ...deps });
  return async (request: Request): Promise<Response> => {
    if (request.method !== "POST") return io.legacy(request);
    let routes: readonly SharedRouteV1[] | null;
    try { routes = structuredClone(io.routes()); } catch {
      // Misconfiguration must not suppress existing terminal cleanup. It also
      // cannot acknowledge work that may be required by the native consumer.
      try { await io.legacy(request); } catch { /* remain held */ }
      return response();
    }
    if (routes === null) return io.legacy(request);
    const deadline = performance.now() + 45000;
    const bounded = async <T,>(call: () => Promise<T>, cap: number): Promise<T> => {
      const budget = Math.min(cap, deadline - performance.now()); if (budget <= 0) throw unavailable();
      const end = performance.now() + budget; let timer: ReturnType<typeof setTimeout>;
      try {
        const value = await Promise.race([call(), new Promise<never>((_r, reject) => { timer = setTimeout(() => reject(unavailable()), budget); })]);
        if (performance.now() >= end) throw unavailable(); return value;
      } finally { clearTimeout(timer!); }
    };
    try {
      const raw = await bounded(() => (io.readSharedBytes ?? readAuthenticatedRevenueCatBytes)(request, routes[0].connection), 6000);
      const decision = classify(raw, routes), headers = new Headers(request.headers);
      const copy = () => new Request(request.url, { method: "POST", headers, body: new Uint8Array(raw) });
      if (decision.kind === "legacy") return io.legacy(copy());
      const nativeHeaders = new Headers(headers);
      nativeHeaders.set("authorization", decision.connection.authentication.secret);
      nativeHeaders.delete("x-chillywood-webhook-secret");
      const nativeRequest = () => new Request(request.url, { method: "POST", headers: nativeHeaders, body: new Uint8Array(raw) });
      const rawSha256 = bytesHex(new Uint8Array(await crypto.subtle.digest("SHA-256", new Uint8Array(raw))));
      let excluded = false, observerActive = true, intakeActive = true;
      const intakeDeadline = Math.min(deadline, performance.now() + 10000);
      // Run BOTH required paths, including legacy revocation/quarantine when
      // native storage is unavailable. A private callback, not response JSON,
      // proves the legacy atomic dispatcher durably found no matching consumer.
      const observer: RevenueCatLegacyObserverV1 = { nativeExcluded: hash => {
        if (observerActive && hash === rawSha256) excluded = true;
      } };
      const legacy = bounded(() => io.legacy(copy(), decision.kind === "native" ? observer : undefined), 15000)
        .finally(() => { observerActive = false; });
      const intake = bounded(() => persistNativeStoreSandboxIntakeV1(nativeRequest(), decision.connection, value => {
        if (!intakeActive || performance.now() >= intakeDeadline) throw unavailable();
        return io.persist(value);
      }), 10000).finally(() => { intakeActive = false; });
      const [legacyResult, journal] = await Promise.allSettled([legacy, intake]);
      if (decision.kind !== "native" || legacyResult.status !== "fulfilled" || !legacyResult.value.ok || !excluded
        || journal.status !== "fulfilled" || journal.value.status === "conflict") return response();
      const result = await bounded(() => io.reconcile(journal.value.receiptId, Math.max(1, Math.min(15000, Math.floor(deadline - performance.now())))), 15000);
      return completed(result, journal.value.receiptId, decision.eventType) ? response(true, 200) : response();
    } catch (error) {
      return response(false, error instanceof RouterBoundaryError && error.status < 500 ? error.status : 503);
    }
  };
}
