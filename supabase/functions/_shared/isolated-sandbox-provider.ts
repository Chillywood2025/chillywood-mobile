/**
 * Classification only. This module does not authenticate a webhook, verify a
 * store receipt, or grant access. An Edge adapter must authenticate the raw
 * provider bytes, bind configured project/account/app identity, and persist
 * immutable ownership atomically before calling the service-only projector.
 * Authenticated removal evidence rejected here must be durably reconciled or
 * retried, never acknowledged and discarded while an existing grant survives.
 * Never expose this contract as a client receipt-verification endpoint.
 *
 * In particular, a second RevenueCat webhook is not delivery isolation: the
 * existing webhook can quarantine legacy authority before product routing.
 * Route qualification must independently close that delivery boundary.
 */
export type SandboxProviderScope =
  | { provider: "revenuecat"; projectId: string; appId: string;
      store: "APP_STORE" | "PLAY_STORE"; environment: "SANDBOX" }
  | { provider: "stripe"; platformAccountId: string; store: "STRIPE"; environment: "test" };

export type SandboxProviderOwner = { subsystem: string; generation: number };
export type SandboxProductOwnership = {
  owner: SandboxProviderOwner; scope: SandboxProviderScope; productId: string;
};
export type SandboxOriginalOwnership = SandboxProductOwnership & {
  originalTransactionId: string; buyerId: string; intentId: string;
};
export type SandboxProviderRoute = {
  owner: SandboxProviderOwner; scope: SandboxProviderScope;
  qualification: "unavailable" | "independently_verified_noninterfering";
  // Server-owned evidence references, not evidence supplied by a buyer.
  ownershipEvidenceSha256: string | null; deliveryEvidenceSha256: string | null;
  // Checkout admission only. Disabling initiation must not discard late receipts.
  initiationEnabled: boolean;
};
export type SandboxProviderOwnershipRegistry = {
  schemaVersion: 1;
  // Partial discovery can never establish exclusive ownership of a SKU.
  coverage: "incomplete" | "complete_provider_namespace";
  products: readonly SandboxProductOwnership[];
  originals: readonly SandboxOriginalOwnership[];
  routes: readonly SandboxProviderRoute[];
};

type ReceiptBase = {
  scope: SandboxProviderScope; providerEventId: string; rawBodySha256: string;
  providerEventType: string;
  buyerId: string; originalTransactionId: string; providerEventAt: string;
};
export type SandboxPurchaseReceipt = ReceiptBase & {
  kind: "purchase"; productId: string; providerTransactionId: string;
  eventType: "initial_purchase" | "non_renewing_purchase" | "renewal" | "payment_succeeded";
  // Null for RevenueCat unless an independently qualified provider binding exists.
  intentId: string | null; purchasedAt: string; expiresAt: string | null;
  amountMinor: number; currency: string;
};
export type SandboxTerminalReceipt = ReceiptBase & {
  kind: "terminal";
  eventType: "refund" | "revocation" | "expiration" | "cancellation" | "billing_issue" | "dispute";
  productId: string | null; providerTransactionId: string | null;
  amountMinor: number | null; currency: string | null;
  // Stripe refund events must preserve cumulative partial/full economics.
  refundedAmountMinor: number | null;
};
export type SandboxObservationReceipt = ReceiptBase & {
  kind: "observation";
  eventType: "scheduled_pause" | "product_change" | "extension" | "refund_reversed";
  productId: string | null;
};
export type SandboxUnsupportedReceipt = {
  kind: "transfer" | "unknown"; scope: SandboxProviderScope;
  providerEventId: string | null; rawBodySha256: string;
  buyerId: string | null; originalTransactionId: string | null;
};
export type SandboxNormalizedReceipt = SandboxPurchaseReceipt | SandboxTerminalReceipt
  | SandboxObservationReceipt | SandboxUnsupportedReceipt;

export type SandboxReceiptClassification = {
  classificationOnly: true; grantsAuthority: false;
  requiredAuthentication: "edge_bound_provider_bytes";
} & (
  | { disposition: "reject"; reason: string }
  | { disposition: "quarantine"; reason: string;
      quarantine: { owner: SandboxProviderOwner; providerScopeKey: string;
        buyerId: string | null; originalTransactionId: string | null; providerEventId: string | null } }
  | { disposition: "route"; owner: SandboxProviderOwner; environment: "sandbox";
      provider: "revenuecat" | "stripe";
      providerScopeKey: string; store: "app_store" | "google_play" | "stripe";
      productId: string; intentId: string | null;
      receipt: SandboxPurchaseReceipt | SandboxTerminalReceipt | SandboxObservationReceipt;
      requiresIndependentLifecycleProof: boolean }
);

const record = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);
const exactText = (v: unknown): v is string => typeof v === "string" && v.length > 0
  && v.length <= 512 && v === v.trim() && !/[\u0000-\u001f\u007f]/u.test(v);
const uuid = (v: unknown): v is string => typeof v === "string"
  && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u.test(v);
const hash = (v: unknown): v is string => typeof v === "string" && /^[a-f0-9]{64}$/u.test(v);
const instant = (v: unknown): v is string => typeof v === "string"
  && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/u.test(v)
  && Number.isFinite(Date.parse(v)) && new Date(v).toISOString() === v;
const minor = (v: unknown): v is number => typeof v === "number" && Number.isSafeInteger(v) && v >= 0;
const currency = (v: unknown): v is string => typeof v === "string" && /^[a-z]{3}$/u.test(v);
const nullable = (v: unknown, check: (value: unknown) => boolean) => v === null || check(v);
const keys = (v: Record<string, unknown>, expected: readonly string[]) => Object.keys(v).length === expected.length
  && expected.every(k => Object.hasOwn(v, k));
const ownerValid = (v: unknown): v is SandboxProviderOwner => record(v)
  && keys(v, ["subsystem", "generation"])
  && typeof v.subsystem === "string" && /^[a-z][a-z0-9_]{0,63}$/u.test(v.subsystem)
  && Number.isSafeInteger(v.generation) && Number(v.generation) > 0;
const ownerKey = (v: SandboxProviderOwner) => JSON.stringify([v.subsystem, v.generation]);

/** Exact source literals only: no production/test or store-name coercion. */
export function sandboxProviderScopeKey(value: unknown): string | null {
  if (!record(value)) return null;
  if (value.provider === "revenuecat"
    && keys(value, ["provider", "projectId", "appId", "store", "environment"])
    && exactText(value.projectId) && exactText(value.appId)
    && typeof value.store === "string" && ["APP_STORE", "PLAY_STORE"].includes(value.store) && value.environment === "SANDBOX") {
    return JSON.stringify([value.provider, value.projectId, value.appId, value.store, value.environment]);
  }
  if (value.provider === "stripe"
    && keys(value, ["provider", "platformAccountId", "store", "environment"])
    && typeof value.platformAccountId === "string" && /^acct_[A-Za-z0-9]+$/u.test(value.platformAccountId)
    && value.store === "STRIPE" && value.environment === "test") {
    return JSON.stringify([value.provider, value.platformAccountId, value.store, value.environment]);
  }
  return null;
}

function productValid(value: unknown): value is SandboxProductOwnership {
  return record(value) && ownerValid(value.owner) && sandboxProviderScopeKey(value.scope) !== null
    && exactText(value.productId);
}
const productKey = (value: SandboxProductOwnership) => JSON.stringify([sandboxProviderScopeKey(value.scope), value.productId]);
const originalKey = (scope: SandboxProviderScope, id: string) => JSON.stringify([sandboxProviderScopeKey(scope), id]);
const originalValid = (value: unknown): value is SandboxOriginalOwnership => record(value)
  && keys(value, ["owner", "scope", "productId", "originalTransactionId", "buyerId", "intentId"])
  && exactText(value.originalTransactionId) && uuid(value.buyerId) && uuid(value.intentId) && productValid(value);

/** Returns no executable capability. Registry must come from trusted storage. */
export function validateSandboxProviderRegistry(value: unknown): string | null {
  if (!record(value) || value.schemaVersion !== 1
    || typeof value.coverage !== "string" || !["incomplete", "complete_provider_namespace"].includes(value.coverage)
    || !Array.isArray(value.products) || !Array.isArray(value.originals) || !Array.isArray(value.routes)) return "registry_invalid";
  const products = new Map<string, SandboxProductOwnership>();
  for (const product of value.products) {
    if (!productValid(product) || !keys(product as unknown as Record<string, unknown>, ["owner", "scope", "productId"])) return "product_ownership_invalid";
    if (products.has(productKey(product))) return "product_ownership_ambiguous";
    products.set(productKey(product), product);
  }
  const originals = new Set<string>();
  for (const binding of value.originals) {
    if (!originalValid(binding)) return "original_ownership_invalid";
    const key = originalKey(binding.scope, binding.originalTransactionId);
    if (originals.has(key)) return "original_ownership_ambiguous";
    const product = products.get(productKey(binding));
    if (!product || ownerKey(product.owner) !== ownerKey(binding.owner)) return "original_product_ownership_mismatch";
    originals.add(key);
  }
  const routes = new Set<string>();
  for (const route of value.routes) {
    if (!record(route) || !keys(route, ["owner", "scope", "qualification", "ownershipEvidenceSha256", "deliveryEvidenceSha256", "initiationEnabled"])
      || !ownerValid(route.owner) || !sandboxProviderScopeKey(route.scope)
      || typeof route.initiationEnabled !== "boolean"
      || typeof route.qualification !== "string"
      || !["unavailable", "independently_verified_noninterfering"].includes(route.qualification)) return "provider_route_invalid";
    if (route.qualification === "independently_verified_noninterfering"
      ? !hash(route.ownershipEvidenceSha256) || !hash(route.deliveryEvidenceSha256)
      : route.ownershipEvidenceSha256 !== null || route.deliveryEvidenceSha256 !== null || route.initiationEnabled) return "provider_route_evidence_invalid";
    const key = JSON.stringify([ownerKey(route.owner), sandboxProviderScopeKey(route.scope)]);
    if (routes.has(key)) return "provider_route_ambiguous";
    routes.add(key);
  }
  return null;
}

const baseKeys = ["kind", "scope", "providerEventId", "providerEventType", "rawBodySha256", "buyerId", "originalTransactionId", "providerEventAt"];
const revenueCatEvents: Record<string, string> = {
  INITIAL_PURCHASE: "initial_purchase", NON_RENEWING_PURCHASE: "non_renewing_purchase", RENEWAL: "renewal",
  REFUND: "refund", REVOCATION: "revocation", EXPIRATION: "expiration", CANCELLATION: "cancellation", BILLING_ISSUE: "billing_issue",
  SUBSCRIPTION_PAUSED: "scheduled_pause", PRODUCT_CHANGE: "product_change", SUBSCRIPTION_EXTENDED: "extension", REFUND_REVERSED: "refund_reversed",
};
const stripeEvents: Record<string, string> = {
  "checkout.session.completed": "payment_succeeded", "checkout.session.async_payment_succeeded": "payment_succeeded",
  "payment_intent.succeeded": "payment_succeeded", "charge.refunded": "refund", "charge.dispute.created": "dispute",
};
function receiptValid(value: unknown): value is SandboxNormalizedReceipt {
  if (!record(value) || !sandboxProviderScopeKey(value.scope) || !hash(value.rawBodySha256)) return false;
  if (value.kind === "transfer" || value.kind === "unknown") {
    return keys(value, ["kind", "scope", "providerEventId", "rawBodySha256", "buyerId", "originalTransactionId"])
      && nullable(value.providerEventId, exactText) && nullable(value.buyerId, uuid)
      && nullable(value.originalTransactionId, exactText);
  }
  const events = (value.scope as SandboxProviderScope).provider === "revenuecat" ? revenueCatEvents : stripeEvents;
  if (!exactText(value.providerEventId) || !exactText(value.providerEventType)
    || !Object.hasOwn(events, value.providerEventType) || events[value.providerEventType] !== value.eventType
    || !uuid(value.buyerId) || !exactText(value.originalTransactionId)
    || !instant(value.providerEventAt)) return false;
  if (value.kind === "purchase") {
    return keys(value, [...baseKeys, "eventType", "productId", "providerTransactionId", "intentId", "purchasedAt", "expiresAt", "amountMinor", "currency"])
      && typeof value.eventType === "string" && ["initial_purchase", "non_renewing_purchase", "renewal", "payment_succeeded"].includes(value.eventType)
      && exactText(value.productId) && exactText(value.providerTransactionId) && nullable(value.intentId, uuid)
      && instant(value.purchasedAt) && nullable(value.expiresAt, instant)
      && Date.parse(value.purchasedAt) <= Date.parse(value.providerEventAt)
      && (value.expiresAt === null || Date.parse(String(value.expiresAt)) > Date.parse(value.purchasedAt))
      && minor(value.amountMinor) && value.amountMinor > 0 && currency(value.currency);
  }
  if (value.kind === "terminal") {
    const economicsValid = (value.amountMinor === null && value.currency === null)
      || (minor(value.amountMinor) && currency(value.currency));
    return keys(value, [...baseKeys, "eventType", "productId", "providerTransactionId", "amountMinor", "currency", "refundedAmountMinor"])
      && typeof value.eventType === "string" && ["refund", "revocation", "expiration", "cancellation", "billing_issue", "dispute"].includes(value.eventType)
      && nullable(value.productId, exactText) && nullable(value.providerTransactionId, exactText) && economicsValid
      && (value.refundedAmountMinor === null || (value.eventType === "refund" && minor(value.amountMinor)
        && minor(value.refundedAmountMinor) && value.refundedAmountMinor > 0 && value.refundedAmountMinor <= value.amountMinor))
      && ((value.scope as SandboxProviderScope).provider !== "stripe" || value.eventType !== "refund" || value.refundedAmountMinor !== null);
  }
  return value.kind === "observation" && keys(value, [...baseKeys, "eventType", "productId"])
    && typeof value.eventType === "string" && ["scheduled_pause", "product_change", "extension", "refund_reversed"].includes(value.eventType)
    && nullable(value.productId, exactText);
}

const boundary = { classificationOnly: true, grantsAuthority: false, requiredAuthentication: "edge_bound_provider_bytes" } as const;
const supportedReceipt = (receipt: SandboxNormalizedReceipt): receipt is SandboxPurchaseReceipt | SandboxTerminalReceipt | SandboxObservationReceipt =>
  receipt.kind === "purchase" || receipt.kind === "terminal" || receipt.kind === "observation";

export function classifySandboxProviderReceipt(input: {
  target: SandboxProviderOwner;
  endpointScope: SandboxProviderScope;
  registry: SandboxProviderOwnershipRegistry;
  receipt: unknown;
}): SandboxReceiptClassification {
  const reject = (reason: string): SandboxReceiptClassification => ({ ...boundary, disposition: "reject", reason });
  if (!ownerValid(input.target)) return reject("target_invalid");
  const scopeKey = sandboxProviderScopeKey(input.endpointScope);
  if (!scopeKey) return reject("endpoint_scope_invalid");
  const registryError = validateSandboxProviderRegistry(input.registry);
  if (registryError) return reject(registryError);
  if (!receiptValid(input.receipt)) return reject("receipt_invalid");
  const receipt = input.receipt;
  if (sandboxProviderScopeKey(receipt.scope) !== scopeKey) return reject("provider_scope_mismatch");
  const quarantine = (reason: string, known?: SandboxOriginalOwnership): SandboxReceiptClassification => ({
    ...boundary, disposition: "quarantine", reason,
    quarantine: { owner: { ...input.target }, providerScopeKey: scopeKey,
      buyerId: known?.buyerId ?? receipt.buyerId, originalTransactionId: receipt.originalTransactionId,
      providerEventId: receipt.providerEventId },
  });
  if (!supportedReceipt(receipt)) return quarantine("unsupported_lifecycle_requires_module_reconciliation");
  if (input.registry.coverage !== "complete_provider_namespace") return reject("ownership_coverage_incomplete");
  const route = input.registry.routes.find(r => ownerKey(r.owner) === ownerKey(input.target)
    && sandboxProviderScopeKey(r.scope) === scopeKey);
  if (!route || route.qualification !== "independently_verified_noninterfering") return reject("provider_route_unavailable");
  const binding = input.registry.originals.find(b => originalKey(b.scope, b.originalTransactionId)
    === originalKey(receipt.scope, receipt.originalTransactionId));
  if (binding && ownerKey(binding.owner) !== ownerKey(input.target)) return reject("original_owner_mismatch");
  if (binding && binding.buyerId !== receipt.buyerId) return quarantine("original_buyer_mismatch", binding);
  if (binding && receipt.productId !== null && binding.productId !== receipt.productId) return quarantine("original_product_mismatch", binding);
  if (receipt.kind !== "purchase" && !binding) return quarantine("original_ownership_missing");
  if (receipt.kind === "purchase" && receipt.eventType === "renewal" && !binding) return quarantine("renewal_original_ownership_missing");
  const productId = binding?.productId ?? receipt.productId;
  const product = input.registry.products.find(p => sandboxProviderScopeKey(p.scope) === scopeKey && p.productId === productId);
  if (!product || ownerKey(product.owner) !== ownerKey(input.target)) return reject("product_not_owned");
  if (receipt.kind === "purchase") {
    if (binding && receipt.intentId !== null && binding.intentId !== receipt.intentId) return reject("original_intent_mismatch");
    // A provider receipt may arrive after checkout admission was disabled.
    // Only SQL's exact previously admitted intent can authorize fulfillment;
    // this classifier neither starts checkout nor grants a new capability.
  }
  const rc = receipt.scope.provider === "revenuecat";
  const apple = receipt.scope.store === "APP_STORE";
  return { ...boundary, disposition: "route", owner: { ...product.owner }, environment: "sandbox",
    provider: rc ? "revenuecat" : "stripe",
    providerScopeKey: scopeKey, store: rc ? apple ? "app_store" : "google_play" : "stripe",
    productId: product.productId, intentId: binding?.intentId ?? (receipt.kind === "purchase" ? receipt.intentId : null),
    receipt: structuredClone(receipt), requiresIndependentLifecycleProof: receipt.kind === "observation" };
}
