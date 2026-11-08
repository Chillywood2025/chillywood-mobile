import { testStoreDigest, testStoreUuid, type TestStoreActor, type TestStoreSdkOutcome } from "./isolatedTestStoreContract";

export type TestStoreV3Asset = { id: string; incarnation: string; sha256: string; byteLength: number; resourceRevision: number; profile: "scpv-mp4-h264-aac-v1" };
export type TestStoreV3Quote = { offerId: string; offerRevision: number; resourceId: string; resourceRevision: number; creatorId: string; kind: "paid_content"; amountMinor: number; currency: "usd"; asset: TestStoreV3Asset };
/** V3 owns stable customers and registered per-intent Offerings. V1 records are
 * never accepted as customer, allocation, registration or native ownership. */
export type TestStoreV3Customer = {
  id: string; buyerId: string; installationId: string; providerAppUserId: string; configurationDigest: string;
  projectId: string; appId: string; providerScopeKey: string; economicApplicationId: string;
  provider: "revenuecat"; store: "TEST_STORE"; sourceEnvironment: "SANDBOX";
};
export type TestStoreV3Registration = {
  id: string; providerOfferingId: string; offeringIdentifier: string; providerPackageId: string;
  packageIdentifier: string; providerProductId: string; productId: string;
};
export type TestStoreV3Allocation = {
  id: string; intentId: string; dispatchId: string; customerBindingId: string; configurationDigest: string;
  productId: string; quote: TestStoreV3Quote; acceptPurchaseUntil: string; registration: TestStoreV3Registration | null;
};
export type TestStoreV3Receipt = {
  id: string; state: "verified" | "refunded" | "revoked" | "quarantined";
  providerTransactionId: string; originalTransactionId: string; purchasedAt: string;
};
export type TestStoreV3Reservation = { revision: number; activeAllocationId: string | null };
export type TestStoreV3Payloads = {
  bind: { installationId: string };
  allocate: { customerBindingId: string; intentId: string; expectedQuote: TestStoreV3Quote };
  claim: { intentId: string; dispatchId: string; registrationId: string; expectedQuote: TestStoreV3Quote };
  read: { intentId: string };
  report: { intentId: string; dispatchId: string; outcome: TestStoreSdkOutcome; transactionHint: string | null };
  advance: { intentId: string; dispatchId: string; disposition: "receipt_recorded" | "retain_unknown"; expectedReceiptId: string | null; expectedReservationRevision: number };
};
export type TestStoreV3Command = keyof TestStoreV3Payloads;
export type TestStoreV3Result = {
  protocol: "isolated-test-store-v3"; command: TestStoreV3Command; requestId: string; actor: TestStoreActor;
  generation: 1; environment: "sandbox";
  result: {
    status: "customer_bound" | "provisioning" | "offering_ready" | "dispatch_claimed" | "pending" | "verified" | "refunded" | "revoked" | "held" | "expired" | "unavailable" | "released";
    reason: string; dispatchAllowed: boolean; retryProviderMutation: false; grantsAccess: false; notPayable: true;
    customer: TestStoreV3Customer | null; allocation: TestStoreV3Allocation | null; reservation: TestStoreV3Reservation | null;
    authorityValidUntil: string | null; receipt: TestStoreV3Receipt | null;
  };
};
/** Local native completion is invocation evidence only, never a receipt,
 * no-charge assertion or proof that all SDK background work has ended. */
export type TestStoreV3NativeInvocation = {
  protocol: "isolated-test-store-native-v3"; invocationId: string; customerBindingId: string;
  installationId: string; buyerId: string; configurationDigest: string; providerAppUserId: string;
  allocationId: string; registrationId: string; sessionId: string; quote: TestStoreV3Quote;
  state: "prepared" | "invoking" | "completed" | "unknown";
  outcome: TestStoreSdkOutcome | null; transactionHint: string | null; completedAt: string | null;
};
/** Durable local evidence that this prepared handle can never invoke the SDK.
 * The server separately decides whether an allocation was ever claimed. */
export type TestStoreV3NativePreparedClosure = {
  protocol: "isolated-test-store-native-prepared-closure-v3";
  state: "prepared_closed"; invocation: TestStoreV3NativeInvocation; closedAt: string;
};
export type TestStoreV3NativeRecord = TestStoreV3NativeInvocation | TestStoreV3NativePreparedClosure;
type Row = Record<string, unknown>;
const row = (v: unknown): v is Row => !!v && typeof v === "object" && !Array.isArray(v);
const keys = (v: Row, expected: readonly string[]) => Object.keys(v).length === expected.length && expected.every(k => Object.hasOwn(v, k));
const text = (v: unknown, max = 200): v is string => typeof v === "string" && v.length > 0 && v.length <= max && v.trim() === v && !/[\u0000-\u001f\u007f]/u.test(v);
const integer = (v: unknown): v is number => typeof v === "number" && Number.isSafeInteger(v) && v > 0;
const choice = (v: unknown, values: readonly string[]) => typeof v === "string" && values.includes(v);
export const testStoreV3Id = (v: unknown, kind: "customer" | "allocation" | "registration"): v is string => typeof v === "string" && v.startsWith(`scv3_${kind}_`) && testStoreUuid(v.slice(`scv3_${kind}_`.length));
const oldId = (v: unknown, kind: "intent" | "receipt" | "offer" | "resource" | "asset"): v is string => typeof v === "string" && v.startsWith(`scv1_${kind}_`) && testStoreUuid(v.slice(`scv1_${kind}_`.length));
export const testStoreV3Date = (v: unknown): v is string => typeof v === "string" && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,6})?(?:Z|[+-]\d{2}:\d{2})$/u.test(v) && Number.isFinite(Date.parse(v));
const uid = (v: unknown): v is string => typeof v === "string" && /^scv3_teststore_[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u.test(v);
export const validTestStoreV3Quote = (v: unknown): v is TestStoreV3Quote => row(v)
  && keys(v, ["offerId", "offerRevision", "resourceId", "resourceRevision", "creatorId", "kind", "amountMinor", "currency", "asset"])
  && oldId(v.offerId, "offer") && integer(v.offerRevision) && oldId(v.resourceId, "resource") && integer(v.resourceRevision)
  && testStoreUuid(v.creatorId) && v.kind === "paid_content" && integer(v.amountMinor) && v.currency === "usd"
  && row(v.asset) && keys(v.asset, ["id", "incarnation", "sha256", "byteLength", "resourceRevision", "profile"])
  && oldId(v.asset.id, "asset") && testStoreUuid(v.asset.incarnation) && testStoreDigest(v.asset.sha256)
  && integer(v.asset.byteLength) && v.asset.byteLength <= 16_777_216 && v.asset.resourceRevision === v.resourceRevision
  && v.asset.profile === "scpv-mp4-h264-aac-v1";
export const sameTestStoreV3Quote = (a: TestStoreV3Quote, b: TestStoreV3Quote) =>
  ["offerId", "offerRevision", "resourceId", "resourceRevision", "creatorId", "kind", "amountMinor", "currency"].every(k => a[k as keyof TestStoreV3Quote] === b[k as keyof TestStoreV3Quote])
  && ["id", "incarnation", "sha256", "byteLength", "resourceRevision", "profile"].every(k => a.asset[k as keyof TestStoreV3Asset] === b.asset[k as keyof TestStoreV3Asset]);
function scope(v: Row): boolean {
  try { return JSON.stringify(JSON.parse(String(v.providerScopeKey))) === JSON.stringify(["revenuecat", v.projectId, v.appId, "TEST_STORE", "SANDBOX"])
    && v.economicApplicationId === "rc_test_store:" + v.projectId + ":" + v.appId; } catch { return false; }
}
export const validTestStoreV3Customer = (v: unknown): v is TestStoreV3Customer => row(v)
  && keys(v, ["id", "buyerId", "installationId", "providerAppUserId", "configurationDigest", "projectId", "appId", "providerScopeKey", "economicApplicationId", "provider", "store", "sourceEnvironment"])
  && testStoreV3Id(v.id, "customer") && testStoreUuid(v.buyerId) && testStoreUuid(v.installationId) && uid(v.providerAppUserId)
  && testStoreDigest(v.configurationDigest) && text(v.projectId) && text(v.appId) && text(v.providerScopeKey, 500) && text(v.economicApplicationId, 500)
  && v.provider === "revenuecat" && v.store === "TEST_STORE" && v.sourceEnvironment === "SANDBOX" && scope(v);
export const validTestStoreV3Registration = (v: unknown): v is TestStoreV3Registration => row(v)
  && keys(v, ["id", "providerOfferingId", "offeringIdentifier", "providerPackageId", "packageIdentifier", "providerProductId", "productId"])
  && testStoreV3Id(v.id, "registration") && ["providerOfferingId", "offeringIdentifier", "providerPackageId", "packageIdentifier", "providerProductId", "productId"].every(k => text(v[k]));
export const validTestStoreV3Allocation = (v: unknown): v is TestStoreV3Allocation => row(v)
  && keys(v, ["id", "intentId", "dispatchId", "customerBindingId", "configurationDigest", "productId", "quote", "acceptPurchaseUntil", "registration"])
  && testStoreV3Id(v.id, "allocation") && oldId(v.intentId, "intent") && testStoreUuid(v.dispatchId) && testStoreV3Id(v.customerBindingId, "customer")
  && testStoreDigest(v.configurationDigest) && text(v.productId) && validTestStoreV3Quote(v.quote) && testStoreV3Date(v.acceptPurchaseUntil)
  && (v.registration === null || (validTestStoreV3Registration(v.registration) && v.registration.productId === v.productId));
export const validTestStoreV3Receipt = (v: unknown): v is TestStoreV3Receipt => row(v)
  && keys(v, ["id", "state", "providerTransactionId", "originalTransactionId", "purchasedAt"])
  && oldId(v.id, "receipt") && choice(v.state, ["verified", "refunded", "revoked", "quarantined"])
  && text(v.providerTransactionId) && text(v.originalTransactionId) && testStoreV3Date(v.purchasedAt);
export const validTestStoreV3NativeInvocation = (v: unknown): v is TestStoreV3NativeInvocation => row(v)
  && keys(v, ["protocol", "invocationId", "customerBindingId", "installationId", "buyerId", "configurationDigest", "providerAppUserId", "allocationId", "registrationId", "sessionId", "quote", "state", "outcome", "transactionHint", "completedAt"])
  && v.protocol === "isolated-test-store-native-v3" && testStoreUuid(v.invocationId) && testStoreV3Id(v.customerBindingId, "customer")
  && testStoreUuid(v.installationId) && testStoreUuid(v.buyerId) && testStoreDigest(v.configurationDigest) && uid(v.providerAppUserId)
  && testStoreV3Id(v.allocationId, "allocation") && testStoreV3Id(v.registrationId, "registration") && testStoreUuid(v.sessionId) && validTestStoreV3Quote(v.quote)
  && choice(v.state, ["prepared", "invoking", "completed", "unknown"])
  && (v.state === "completed" ? choice(v.outcome, ["sdk_success", "sdk_cancelled", "sdk_failed", "sdk_unknown"])
    && (v.transactionHint === null || text(v.transactionHint)) && testStoreV3Date(v.completedAt)
    : v.outcome === null && v.transactionHint === null && v.completedAt === null);
export const validTestStoreV3NativePreparedClosure = (v: unknown): v is TestStoreV3NativePreparedClosure => row(v)
  && keys(v, ["protocol", "state", "invocation", "closedAt"])
  && v.protocol === "isolated-test-store-native-prepared-closure-v3" && v.state === "prepared_closed"
  && validTestStoreV3NativeInvocation(v.invocation) && v.invocation.state === "prepared" && testStoreV3Date(v.closedAt);
const sameFields = <T extends object>(a: T, b: T, fields: readonly (keyof T)[]) => fields.every(k => a[k] === b[k]);
export const sameTestStoreV3Customer = (a: TestStoreV3Customer, b: TestStoreV3Customer) => sameFields(a, b, ["id", "buyerId", "installationId", "providerAppUserId", "configurationDigest", "projectId", "appId", "providerScopeKey", "economicApplicationId", "provider", "store", "sourceEnvironment"]);
export const sameTestStoreV3Registration = (a: TestStoreV3Registration, b: TestStoreV3Registration) => sameFields(a, b, ["id", "providerOfferingId", "offeringIdentifier", "providerPackageId", "packageIdentifier", "providerProductId", "productId"]);
export const sameTestStoreV3Allocation = (a: TestStoreV3Allocation, b: TestStoreV3Allocation) => sameFields(a, b, ["id", "intentId", "dispatchId", "customerBindingId", "configurationDigest", "productId", "acceptPurchaseUntil"])
  && sameTestStoreV3Quote(a.quote, b.quote) && (a.registration === null ? b.registration === null : b.registration !== null && sameTestStoreV3Registration(a.registration, b.registration));

export function validTestStoreV3Payload<C extends TestStoreV3Command>(command: C, v: unknown): v is TestStoreV3Payloads[C] {
  if (!row(v)) return false;
  if (command === "bind") return keys(v, ["installationId"]) && testStoreUuid(v.installationId);
  if (!oldId(v.intentId, "intent")) return false;
  if (command === "allocate") return keys(v, ["customerBindingId", "intentId", "expectedQuote"]) && testStoreV3Id(v.customerBindingId, "customer") && validTestStoreV3Quote(v.expectedQuote);
  if (command === "read") return keys(v, ["intentId"]);
  if (!testStoreUuid(v.dispatchId)) return false;
  if (command === "claim") return keys(v, ["intentId", "dispatchId", "registrationId", "expectedQuote"]) && testStoreV3Id(v.registrationId, "registration") && validTestStoreV3Quote(v.expectedQuote);
  if (command === "report") return keys(v, ["intentId", "dispatchId", "outcome", "transactionHint"])
    && choice(v.outcome, ["sdk_success", "sdk_cancelled", "sdk_failed", "sdk_unknown"]) && (v.transactionHint === null || text(v.transactionHint));
  return command === "advance" && keys(v, ["intentId", "dispatchId", "disposition", "expectedReceiptId", "expectedReservationRevision"])
    && integer(v.expectedReservationRevision) && ((v.disposition === "receipt_recorded" && oldId(v.expectedReceiptId, "receipt"))
      || (v.disposition === "retain_unknown" && v.expectedReceiptId === null));
}

export function parseIsolatedTestStoreV3Result<C extends TestStoreV3Command>(value: unknown, expected: {
  command: C; requestId: string; actor: TestStoreActor; configurationDigest: string; payload: TestStoreV3Payloads[C];
}): TestStoreV3Result {
  const invalid = (): never => { throw new Error("isolated_test_store_v3_invalid_response"); };
  if (!validTestStoreV3Payload(expected.command, expected.payload) || !testStoreUuid(expected.requestId) || !testStoreDigest(expected.configurationDigest)
    || !testStoreUuid(expected.actor.userId) || !testStoreUuid(expected.actor.sessionId) || !row(value)
    || !keys(value, ["protocol", "command", "requestId", "actor", "generation", "environment", "result"])
    || value.protocol !== "isolated-test-store-v3" || value.command !== expected.command || value.requestId !== expected.requestId
    || value.generation !== 1 || value.environment !== "sandbox" || !row(value.actor) || !keys(value.actor, ["userId", "sessionId"])
    || value.actor.userId !== expected.actor.userId || value.actor.sessionId !== expected.actor.sessionId || !row(value.result)) return invalid();
  const r = value.result;
  if (!keys(r, ["status", "reason", "dispatchAllowed", "retryProviderMutation", "grantsAccess", "notPayable", "customer", "allocation", "reservation", "authorityValidUntil", "receipt"])
    || !choice(r.status, ["customer_bound", "provisioning", "offering_ready", "dispatch_claimed", "pending", "verified", "refunded", "revoked", "held", "expired", "unavailable", "released"])
    || !text(r.reason) || typeof r.dispatchAllowed !== "boolean" || r.retryProviderMutation !== false || r.grantsAccess !== false || r.notPayable !== true) return invalid();
  if (r.customer === null) {
    if (!choice(r.status, ["held", "unavailable"]) || r.allocation !== null || r.reservation !== null) return invalid();
  } else {
    if (!validTestStoreV3Customer(r.customer) || r.customer.buyerId !== expected.actor.userId || r.customer.configurationDigest !== expected.configurationDigest
      || !row(r.reservation) || !keys(r.reservation, ["revision", "activeAllocationId"]) || !integer(r.reservation.revision)
      || (r.reservation.activeAllocationId !== null && !testStoreV3Id(r.reservation.activeAllocationId, "allocation"))) return invalid();
    if ("installationId" in expected.payload && r.customer.installationId !== expected.payload.installationId) return invalid();
    if ("customerBindingId" in expected.payload && r.customer.id !== expected.payload.customerBindingId) return invalid();
  }
  if (r.allocation !== null) {
    if (!validTestStoreV3Allocation(r.allocation) || !validTestStoreV3Customer(r.customer)
      || r.allocation.configurationDigest !== expected.configurationDigest || r.allocation.customerBindingId !== r.customer.id
      || r.allocation.quote.creatorId === expected.actor.userId) return invalid();
    if ("intentId" in expected.payload && r.allocation.intentId !== expected.payload.intentId) return invalid();
    if ("dispatchId" in expected.payload && r.allocation.dispatchId !== expected.payload.dispatchId) return invalid();
    if ("expectedQuote" in expected.payload && (!validTestStoreV3Quote(expected.payload.expectedQuote) || !sameTestStoreV3Quote(r.allocation.quote, expected.payload.expectedQuote))) return invalid();
    if ("registrationId" in expected.payload && r.allocation.registration?.id !== expected.payload.registrationId) return invalid();
    if (r.status === "provisioning" && r.allocation.registration !== null) return invalid();
    if (choice(r.status, ["offering_ready", "dispatch_claimed", "pending", "verified", "refunded", "revoked"]) && r.allocation.registration === null) return invalid();
    if (r.status === "released" && (r.reservation as TestStoreV3Reservation).activeAllocationId === r.allocation.id) return invalid();
  } else if (!choice(r.status, ["customer_bound", "held", "unavailable"])) return invalid();
  if (r.status === "customer_bound" && (expected.command !== "bind" || !r.customer || r.allocation !== null || (r.reservation as TestStoreV3Reservation).activeAllocationId !== null)) return invalid();
  if (r.dispatchAllowed) {
    if (expected.command !== "claim" || r.status !== "dispatch_claimed" || !r.allocation || !testStoreV3Date(r.authorityValidUntil)
      || Date.parse(r.authorityValidUntil) > Date.parse((r.allocation as TestStoreV3Allocation).acceptPurchaseUntil) || r.receipt !== null
      || (r.reservation as TestStoreV3Reservation).activeAllocationId !== (r.allocation as TestStoreV3Allocation).id) return invalid();
  } else if (r.authorityValidUntil !== null) return invalid();
  if (r.status === "dispatch_claimed" && !r.dispatchAllowed) return invalid();
  if (r.status === "released" && expected.command !== "advance") return invalid();
  if (r.receipt !== null) {
    if (!r.allocation || !validTestStoreV3Receipt(r.receipt) || (r.receipt.state === "quarantined" && r.status !== "held")
      || (r.status !== "held" && r.status !== "released" && r.status !== r.receipt.state)) return invalid();
  } else if (choice(r.status, ["verified", "refunded", "revoked"])) return invalid();
  if (expected.command === "advance" && r.status === "released") {
    const p = expected.payload as TestStoreV3Payloads["advance"];
    if (!r.reservation || (r.reservation as TestStoreV3Reservation).revision <= p.expectedReservationRevision
      || (p.disposition === "receipt_recorded" && (!r.receipt || (r.receipt as TestStoreV3Receipt).id !== p.expectedReceiptId))) return invalid();
  }
  return value as TestStoreV3Result;
}
