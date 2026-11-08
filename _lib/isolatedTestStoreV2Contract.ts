import { sameTestStoreQuote, testStoreDigest, testStoreUuid, validTestStoreQuote, type TestStoreActor, type TestStoreQuote, type TestStoreSdkOutcome } from "./isolatedTestStoreContract";

/** V2 owns stable customers and registered per-intent Offerings. V1 records are
 * never accepted as customer, allocation, registration or native ownership. */
export type TestStoreV2Customer = {
  id: string; buyerId: string; installationId: string; providerAppUserId: string; configurationDigest: string;
  projectId: string; appId: string; providerScopeKey: string; economicApplicationId: string;
  provider: "revenuecat"; store: "TEST_STORE"; sourceEnvironment: "SANDBOX";
};
export type TestStoreV2Registration = {
  id: string; providerOfferingId: string; offeringIdentifier: string; providerPackageId: string;
  packageIdentifier: string; providerProductId: string; productId: string;
};
export type TestStoreV2Allocation = {
  id: string; intentId: string; dispatchId: string; customerBindingId: string; configurationDigest: string;
  productId: string; quote: TestStoreQuote; acceptPurchaseUntil: string; registration: TestStoreV2Registration | null;
};
export type TestStoreV2Receipt = {
  id: string; state: "verified" | "refunded" | "revoked" | "quarantined";
  providerTransactionId: string; originalTransactionId: string; purchasedAt: string;
};
export type TestStoreV2Reservation = { revision: number; activeAllocationId: string | null };
export type TestStoreV2Payloads = {
  bind: { installationId: string };
  allocate: { customerBindingId: string; intentId: string; expectedQuote: TestStoreQuote };
  claim: { intentId: string; dispatchId: string; registrationId: string; expectedQuote: TestStoreQuote };
  read: { intentId: string };
  report: { intentId: string; dispatchId: string; outcome: TestStoreSdkOutcome; transactionHint: string | null };
  advance: { intentId: string; dispatchId: string; disposition: "receipt_recorded" | "retain_unknown"; expectedReceiptId: string | null; expectedReservationRevision: number };
};
export type TestStoreV2Command = keyof TestStoreV2Payloads;
export type TestStoreV2Result = {
  protocol: "isolated-test-store-v2"; command: TestStoreV2Command; requestId: string; actor: TestStoreActor;
  generation: 1; environment: "sandbox";
  result: {
    status: "customer_bound" | "provisioning" | "offering_ready" | "dispatch_claimed" | "pending" | "verified" | "refunded" | "revoked" | "held" | "expired" | "unavailable" | "released";
    reason: string; dispatchAllowed: boolean; retryProviderMutation: false; grantsAccess: false; notPayable: true;
    customer: TestStoreV2Customer | null; allocation: TestStoreV2Allocation | null; reservation: TestStoreV2Reservation | null;
    authorityValidUntil: string | null; receipt: TestStoreV2Receipt | null;
  };
};
/** Local native completion is invocation evidence only, never a receipt,
 * no-charge assertion or proof that all SDK background work has ended. */
export type TestStoreV2NativeInvocation = {
  protocol: "isolated-test-store-native-v2"; invocationId: string; customerBindingId: string;
  installationId: string; buyerId: string; configurationDigest: string; providerAppUserId: string;
  allocationId: string; registrationId: string; sessionId: string;
  state: "prepared" | "invoking" | "completed" | "unknown";
  outcome: TestStoreSdkOutcome | null; transactionHint: string | null; completedAt: string | null;
};
type Row = Record<string, unknown>;
const row = (v: unknown): v is Row => !!v && typeof v === "object" && !Array.isArray(v);
const keys = (v: Row, expected: readonly string[]) => Object.keys(v).length === expected.length && expected.every(k => Object.hasOwn(v, k));
const text = (v: unknown, max = 200): v is string => typeof v === "string" && v.length > 0 && v.length <= max && v.trim() === v && !/[\u0000-\u001f\u007f]/u.test(v);
const integer = (v: unknown): v is number => typeof v === "number" && Number.isSafeInteger(v) && v > 0;
const choice = (v: unknown, values: readonly string[]) => typeof v === "string" && values.includes(v);
export const testStoreV2Id = (v: unknown, kind: "customer" | "allocation" | "registration"): v is string => typeof v === "string" && v.startsWith(`scv2_${kind}_`) && testStoreUuid(v.slice(`scv2_${kind}_`.length));
const oldId = (v: unknown, kind: "intent" | "receipt"): v is string => typeof v === "string" && v.startsWith(`scv1_${kind}_`) && testStoreUuid(v.slice(`scv1_${kind}_`.length));
export const testStoreV2Date = (v: unknown): v is string => typeof v === "string" && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,6})?(?:Z|[+-]\d{2}:\d{2})$/u.test(v) && Number.isFinite(Date.parse(v));
const uid = (v: unknown): v is string => typeof v === "string" && /^scv2_teststore_[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u.test(v);
export const validTestStoreV2Quote = (v: unknown): v is TestStoreQuote => validTestStoreQuote(v) && v.currency === "usd";
export const validTestStoreV2Customer = (v: unknown): v is TestStoreV2Customer => row(v)
  && keys(v, ["id", "buyerId", "installationId", "providerAppUserId", "configurationDigest", "projectId", "appId", "providerScopeKey", "economicApplicationId", "provider", "store", "sourceEnvironment"])
  && testStoreV2Id(v.id, "customer") && testStoreUuid(v.buyerId) && testStoreUuid(v.installationId) && uid(v.providerAppUserId)
  && testStoreDigest(v.configurationDigest) && text(v.projectId) && text(v.appId) && text(v.providerScopeKey, 500) && text(v.economicApplicationId, 500)
  && v.provider === "revenuecat" && v.store === "TEST_STORE" && v.sourceEnvironment === "SANDBOX";
export const validTestStoreV2Registration = (v: unknown): v is TestStoreV2Registration => row(v)
  && keys(v, ["id", "providerOfferingId", "offeringIdentifier", "providerPackageId", "packageIdentifier", "providerProductId", "productId"])
  && testStoreV2Id(v.id, "registration") && ["providerOfferingId", "offeringIdentifier", "providerPackageId", "packageIdentifier", "providerProductId", "productId"].every(k => text(v[k]));
export const validTestStoreV2Allocation = (v: unknown): v is TestStoreV2Allocation => row(v)
  && keys(v, ["id", "intentId", "dispatchId", "customerBindingId", "configurationDigest", "productId", "quote", "acceptPurchaseUntil", "registration"])
  && testStoreV2Id(v.id, "allocation") && oldId(v.intentId, "intent") && testStoreUuid(v.dispatchId) && testStoreV2Id(v.customerBindingId, "customer")
  && testStoreDigest(v.configurationDigest) && text(v.productId) && validTestStoreV2Quote(v.quote) && testStoreV2Date(v.acceptPurchaseUntil)
  && (v.registration === null || (validTestStoreV2Registration(v.registration) && v.registration.productId === v.productId));
export const validTestStoreV2Receipt = (v: unknown): v is TestStoreV2Receipt => row(v)
  && keys(v, ["id", "state", "providerTransactionId", "originalTransactionId", "purchasedAt"])
  && oldId(v.id, "receipt") && choice(v.state, ["verified", "refunded", "revoked", "quarantined"])
  && text(v.providerTransactionId) && text(v.originalTransactionId) && testStoreV2Date(v.purchasedAt);
export const validTestStoreV2NativeInvocation = (v: unknown): v is TestStoreV2NativeInvocation => row(v)
  && keys(v, ["protocol", "invocationId", "customerBindingId", "installationId", "buyerId", "configurationDigest", "providerAppUserId", "allocationId", "registrationId", "sessionId", "state", "outcome", "transactionHint", "completedAt"])
  && v.protocol === "isolated-test-store-native-v2" && testStoreUuid(v.invocationId) && testStoreV2Id(v.customerBindingId, "customer")
  && testStoreUuid(v.installationId) && testStoreUuid(v.buyerId) && testStoreDigest(v.configurationDigest) && uid(v.providerAppUserId)
  && testStoreV2Id(v.allocationId, "allocation") && testStoreV2Id(v.registrationId, "registration") && testStoreUuid(v.sessionId)
  && choice(v.state, ["prepared", "invoking", "completed", "unknown"])
  && (v.state === "completed" ? choice(v.outcome, ["sdk_success", "sdk_cancelled", "sdk_failed", "sdk_unknown"])
    && (v.transactionHint === null || text(v.transactionHint)) && testStoreV2Date(v.completedAt)
    : v.outcome === null && v.transactionHint === null && v.completedAt === null);
const sameFields = <T extends object>(a: T, b: T, fields: readonly (keyof T)[]) => fields.every(k => a[k] === b[k]);
export const sameTestStoreV2Customer = (a: TestStoreV2Customer, b: TestStoreV2Customer) => sameFields(a, b, ["id", "buyerId", "installationId", "providerAppUserId", "configurationDigest", "projectId", "appId", "providerScopeKey", "economicApplicationId", "provider", "store", "sourceEnvironment"]);
export const sameTestStoreV2Registration = (a: TestStoreV2Registration, b: TestStoreV2Registration) => sameFields(a, b, ["id", "providerOfferingId", "offeringIdentifier", "providerPackageId", "packageIdentifier", "providerProductId", "productId"]);
export const sameTestStoreV2Allocation = (a: TestStoreV2Allocation, b: TestStoreV2Allocation) => sameFields(a, b, ["id", "intentId", "dispatchId", "customerBindingId", "configurationDigest", "productId", "acceptPurchaseUntil"])
  && sameTestStoreQuote(a.quote, b.quote) && (a.registration === null ? b.registration === null : b.registration !== null && sameTestStoreV2Registration(a.registration, b.registration));

export function validTestStoreV2Payload<C extends TestStoreV2Command>(command: C, v: unknown): v is TestStoreV2Payloads[C] {
  if (!row(v)) return false;
  if (command === "bind") return keys(v, ["installationId"]) && testStoreUuid(v.installationId);
  if (!oldId(v.intentId, "intent")) return false;
  if (command === "allocate") return keys(v, ["customerBindingId", "intentId", "expectedQuote"]) && testStoreV2Id(v.customerBindingId, "customer") && validTestStoreV2Quote(v.expectedQuote);
  if (command === "read") return keys(v, ["intentId"]);
  if (!testStoreUuid(v.dispatchId)) return false;
  if (command === "claim") return keys(v, ["intentId", "dispatchId", "registrationId", "expectedQuote"]) && testStoreV2Id(v.registrationId, "registration") && validTestStoreV2Quote(v.expectedQuote);
  if (command === "report") return keys(v, ["intentId", "dispatchId", "outcome", "transactionHint"])
    && choice(v.outcome, ["sdk_success", "sdk_cancelled", "sdk_failed", "sdk_unknown"]) && (v.transactionHint === null || text(v.transactionHint));
  return command === "advance" && keys(v, ["intentId", "dispatchId", "disposition", "expectedReceiptId", "expectedReservationRevision"])
    && integer(v.expectedReservationRevision) && ((v.disposition === "receipt_recorded" && oldId(v.expectedReceiptId, "receipt"))
      || (v.disposition === "retain_unknown" && v.expectedReceiptId === null));
}

export function parseIsolatedTestStoreV2Result<C extends TestStoreV2Command>(value: unknown, expected: {
  command: C; requestId: string; actor: TestStoreActor; configurationDigest: string; payload: TestStoreV2Payloads[C];
}): TestStoreV2Result {
  const invalid = (): never => { throw new Error("isolated_test_store_v2_invalid_response"); };
  if (!validTestStoreV2Payload(expected.command, expected.payload) || !testStoreUuid(expected.requestId) || !testStoreDigest(expected.configurationDigest)
    || !testStoreUuid(expected.actor.userId) || !testStoreUuid(expected.actor.sessionId) || !row(value)
    || !keys(value, ["protocol", "command", "requestId", "actor", "generation", "environment", "result"])
    || value.protocol !== "isolated-test-store-v2" || value.command !== expected.command || value.requestId !== expected.requestId
    || value.generation !== 1 || value.environment !== "sandbox" || !row(value.actor) || !keys(value.actor, ["userId", "sessionId"])
    || value.actor.userId !== expected.actor.userId || value.actor.sessionId !== expected.actor.sessionId || !row(value.result)) return invalid();
  const r = value.result;
  if (!keys(r, ["status", "reason", "dispatchAllowed", "retryProviderMutation", "grantsAccess", "notPayable", "customer", "allocation", "reservation", "authorityValidUntil", "receipt"])
    || !choice(r.status, ["customer_bound", "provisioning", "offering_ready", "dispatch_claimed", "pending", "verified", "refunded", "revoked", "held", "expired", "unavailable", "released"])
    || !text(r.reason) || typeof r.dispatchAllowed !== "boolean" || r.retryProviderMutation !== false || r.grantsAccess !== false || r.notPayable !== true) return invalid();
  if (r.customer === null) {
    if (!choice(r.status, ["held", "unavailable"]) || r.allocation !== null || r.reservation !== null) return invalid();
  } else {
    if (!validTestStoreV2Customer(r.customer) || r.customer.buyerId !== expected.actor.userId || r.customer.configurationDigest !== expected.configurationDigest
      || !row(r.reservation) || !keys(r.reservation, ["revision", "activeAllocationId"]) || !integer(r.reservation.revision)
      || (r.reservation.activeAllocationId !== null && !testStoreV2Id(r.reservation.activeAllocationId, "allocation"))) return invalid();
    if ("installationId" in expected.payload && r.customer.installationId !== expected.payload.installationId) return invalid();
    if ("customerBindingId" in expected.payload && r.customer.id !== expected.payload.customerBindingId) return invalid();
  }
  if (r.allocation !== null) {
    if (!validTestStoreV2Allocation(r.allocation) || !validTestStoreV2Customer(r.customer)
      || r.allocation.configurationDigest !== expected.configurationDigest || r.allocation.customerBindingId !== r.customer.id
      || r.allocation.quote.creatorId === expected.actor.userId) return invalid();
    if ("intentId" in expected.payload && r.allocation.intentId !== expected.payload.intentId) return invalid();
    if ("dispatchId" in expected.payload && r.allocation.dispatchId !== expected.payload.dispatchId) return invalid();
    if ("expectedQuote" in expected.payload && (!validTestStoreV2Quote(expected.payload.expectedQuote) || !sameTestStoreQuote(r.allocation.quote, expected.payload.expectedQuote))) return invalid();
    if ("registrationId" in expected.payload && r.allocation.registration?.id !== expected.payload.registrationId) return invalid();
    if (r.status === "provisioning" && r.allocation.registration !== null) return invalid();
    if (choice(r.status, ["offering_ready", "dispatch_claimed", "pending", "verified", "refunded", "revoked"]) && r.allocation.registration === null) return invalid();
    if (r.status === "released" && (r.reservation as TestStoreV2Reservation).activeAllocationId === r.allocation.id) return invalid();
  } else if (!choice(r.status, ["customer_bound", "held", "unavailable"])) return invalid();
  if (r.status === "customer_bound" && (expected.command !== "bind" || !r.customer || r.allocation !== null || (r.reservation as TestStoreV2Reservation).activeAllocationId !== null)) return invalid();
  if (r.dispatchAllowed) {
    if (expected.command !== "claim" || r.status !== "dispatch_claimed" || !r.allocation || !testStoreV2Date(r.authorityValidUntil)
      || Date.parse(r.authorityValidUntil) > Date.parse((r.allocation as TestStoreV2Allocation).acceptPurchaseUntil) || r.receipt !== null
      || (r.reservation as TestStoreV2Reservation).activeAllocationId !== (r.allocation as TestStoreV2Allocation).id) return invalid();
  } else if (r.authorityValidUntil !== null) return invalid();
  if (r.receipt !== null) {
    if (!r.allocation || !validTestStoreV2Receipt(r.receipt) || (r.receipt.state === "quarantined" && r.status !== "held")
      || (r.status !== "held" && r.status !== "released" && r.status !== r.receipt.state)) return invalid();
  } else if (choice(r.status, ["verified", "refunded", "revoked"])) return invalid();
  if (expected.command === "advance" && r.status === "released") {
    const p = expected.payload as TestStoreV2Payloads["advance"];
    if (!r.reservation || (r.reservation as TestStoreV2Reservation).revision <= p.expectedReservationRevision
      || (p.disposition === "receipt_recorded" && (!r.receipt || (r.receipt as TestStoreV2Receipt).id !== p.expectedReceiptId))) return invalid();
  }
  return value as TestStoreV2Result;
}
