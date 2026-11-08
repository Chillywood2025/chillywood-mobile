/** Strict client projection of the dedicated Test Store endpoint. No provider authority is created here. */
export type TestStoreQuote = { offerId: string; offerRevision: number; resourceId: string; resourceRevision: number; creatorId: string; kind: "creator_tip"; amountMinor: number; currency: string };
export type TestStoreAllocation = {
  intentId: string; dispatchId: string; providerAppUserId: string; configurationDigest: string;
  projectId: string; appId: string; productId: string; provider: "revenuecat"; store: "TEST_STORE"; sourceEnvironment: "SANDBOX";
  providerScopeKey: string; economicApplicationId: string; quote: TestStoreQuote; acceptPurchaseUntil: string;
};
export type TestStoreSdkOutcome = "sdk_success" | "sdk_cancelled" | "sdk_failed" | "sdk_unknown";
export type TestStorePayloads = {
  allocate: { intentId: string; expectedQuote: TestStoreQuote };
  claim: { intentId: string; dispatchId: string; expectedQuote: TestStoreQuote };
  read: { intentId: string };
  report: { intentId: string; dispatchId: string; outcome: TestStoreSdkOutcome; transactionHint: string | null };
};
export type TestStoreCommand = keyof TestStorePayloads;
export type TestStoreActor = { userId: string; sessionId: string };
export type TestStoreResult = {
  protocol: "isolated-test-store-v1"; command: TestStoreCommand; requestId: string; actor: TestStoreActor;
  generation: 1; environment: "sandbox";
  result: {
    status: "allocated" | "dispatch_claimed" | "pending" | "verified" | "refunded" | "revoked" | "held" | "expired" | "unavailable";
    reason: string; dispatchAllowed: boolean; retryProviderMutation: false; grantsAccess: false; notPayable: true;
    allocation: TestStoreAllocation | null; authorityValidUntil: string | null;
    receipt: { id: string; state: "verified" | "refunded" | "revoked" | "quarantined"; providerTransactionId: string; originalTransactionId: string; purchasedAt: string } | null;
  };
};
type Row = Record<string, unknown>;
const row = (v: unknown): v is Row => !!v && typeof v === "object" && !Array.isArray(v);
const keys = (v: Row, fields: readonly string[]) => Object.keys(v).length === fields.length && fields.every(k => Object.hasOwn(v, k));
export const testStoreUuid = (v: unknown): v is string => typeof v === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u.test(v);
export const testStoreDigest = (v: unknown): v is string => typeof v === "string" && /^[0-9a-f]{64}$/u.test(v);
const id = (v: unknown, kind: string) => typeof v === "string" && v.startsWith(`scv1_${kind}_`) && testStoreUuid(v.slice(`scv1_${kind}_`.length));
const string = (v: unknown, max = 200): v is string => typeof v === "string" && v.length > 0 && v.length <= max && v.trim() === v && !/[\u0000-\u001f\u007f]/u.test(v);
const integer = (v: unknown) => typeof v === "number" && Number.isSafeInteger(v) && v > 0;
const date = (v: unknown): v is string => typeof v === "string" && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,6})?(?:Z|[+-]\d{2}:\d{2})$/u.test(v) && Number.isFinite(Date.parse(v));
const choice = (v: unknown, values: readonly string[]) => typeof v === "string" && values.includes(v);
const QUOTE_KEYS = ["offerId", "offerRevision", "resourceId", "resourceRevision", "creatorId", "kind", "amountMinor", "currency"];
export const validTestStoreQuote = (v: unknown): v is TestStoreQuote => row(v) && keys(v, QUOTE_KEYS)
  && id(v.offerId, "offer") && integer(v.offerRevision) && id(v.resourceId, "resource") && integer(v.resourceRevision)
  && testStoreUuid(v.creatorId) && v.kind === "creator_tip" && integer(v.amountMinor) && typeof v.currency === "string" && /^[a-z]{3}$/u.test(v.currency);
export const sameTestStoreQuote = (a: TestStoreQuote, b: TestStoreQuote) => QUOTE_KEYS.every(k => a[k as keyof TestStoreQuote] === b[k as keyof TestStoreQuote]);
export const sameTestStoreAllocation = (a: TestStoreAllocation, b: TestStoreAllocation) =>
  sameTestStoreQuote(a.quote, b.quote) && ["intentId", "dispatchId", "providerAppUserId", "configurationDigest", "projectId", "appId", "productId", "provider", "store", "sourceEnvironment", "providerScopeKey", "economicApplicationId", "acceptPurchaseUntil"].every(k => a[k as keyof TestStoreAllocation] === b[k as keyof TestStoreAllocation]);
export const validTestStoreAllocation = (v: unknown): v is TestStoreAllocation => row(v)
  && keys(v, ["intentId", "dispatchId", "providerAppUserId", "configurationDigest", "projectId", "appId", "productId", "provider", "store", "sourceEnvironment", "providerScopeKey", "economicApplicationId", "quote", "acceptPurchaseUntil"])
  && id(v.intentId, "intent") && testStoreUuid(v.dispatchId) && typeof v.providerAppUserId === "string"
  && /^scv1_teststore_[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u.test(v.providerAppUserId)
  && testStoreDigest(v.configurationDigest) && string(v.projectId) && string(v.appId) && string(v.productId) && v.provider === "revenuecat"
  && v.store === "TEST_STORE" && v.sourceEnvironment === "SANDBOX" && string(v.providerScopeKey, 500) && string(v.economicApplicationId, 500)
  && validTestStoreQuote(v.quote) && date(v.acceptPurchaseUntil);
export function validTestStorePayload<C extends TestStoreCommand>(command: C, v: unknown): v is TestStorePayloads[C] {
  if (!row(v) || !id(v.intentId, "intent")) return false;
  if (command === "allocate") return keys(v, ["intentId", "expectedQuote"]) && validTestStoreQuote(v.expectedQuote);
  if (command === "claim") return keys(v, ["intentId", "dispatchId", "expectedQuote"]) && testStoreUuid(v.dispatchId) && validTestStoreQuote(v.expectedQuote);
  if (command === "read") return keys(v, ["intentId"]);
  return command === "report" && keys(v, ["intentId", "dispatchId", "outcome", "transactionHint"]) && testStoreUuid(v.dispatchId)
    && choice(v.outcome, ["sdk_success", "sdk_cancelled", "sdk_failed", "sdk_unknown"]) && (v.transactionHint === null || string(v.transactionHint, 200));
}
export function parseIsolatedTestStoreResult<C extends TestStoreCommand>(value: unknown, expected: {
  command: C; requestId: string; actor: TestStoreActor; configurationDigest: string; payload: TestStorePayloads[C];
}): TestStoreResult {
  const invalid = (): never => { throw new Error("isolated_test_store_invalid_response"); };
  if (!validTestStorePayload(expected.command, expected.payload) || !testStoreUuid(expected.requestId) || !testStoreDigest(expected.configurationDigest)
    || !testStoreUuid(expected.actor.userId) || !testStoreUuid(expected.actor.sessionId)
    || !row(value) || !keys(value, ["protocol", "command", "requestId", "actor", "generation", "environment", "result"])
    || value.protocol !== "isolated-test-store-v1" || value.command !== expected.command || value.requestId !== expected.requestId
    || value.generation !== 1 || value.environment !== "sandbox" || !row(value.actor) || !keys(value.actor, ["userId", "sessionId"])
    || value.actor.userId !== expected.actor.userId || value.actor.sessionId !== expected.actor.sessionId || !row(value.result)) return invalid();
  const result = value.result;
  if (!keys(result, ["status", "reason", "dispatchAllowed", "retryProviderMutation", "grantsAccess", "notPayable", "allocation", "authorityValidUntil", "receipt"])
    || !choice(result.status, ["allocated", "dispatch_claimed", "pending", "verified", "refunded", "revoked", "held", "expired", "unavailable"])
    || !string(result.reason, 200) || typeof result.dispatchAllowed !== "boolean" || result.retryProviderMutation !== false || result.grantsAccess !== false || result.notPayable !== true) return invalid();
  if (result.allocation !== null) {
    if (!validTestStoreAllocation(result.allocation) || result.allocation.intentId !== expected.payload.intentId
      || result.allocation.configurationDigest !== expected.configurationDigest) return invalid();
    if ("dispatchId" in expected.payload && result.allocation.dispatchId !== expected.payload.dispatchId) return invalid();
    if ("expectedQuote" in expected.payload && (!validTestStoreQuote(expected.payload.expectedQuote)
      || !sameTestStoreQuote(result.allocation.quote, expected.payload.expectedQuote))) return invalid();
  } else if (!["held", "unavailable"].includes(result.status as string)) return invalid();
  if (result.dispatchAllowed) {
    if (expected.command !== "claim" || result.status !== "dispatch_claimed" || !result.allocation || !date(result.authorityValidUntil)
      || Date.parse(result.authorityValidUntil) > Date.parse((result.allocation as TestStoreAllocation).acceptPurchaseUntil) || result.receipt !== null) return invalid();
  } else if (result.authorityValidUntil !== null) return invalid();
  if (result.receipt !== null) {
    const receipt = result.receipt;
    if (!result.allocation || !row(receipt) || !keys(receipt, ["id", "state", "providerTransactionId", "originalTransactionId", "purchasedAt"])
      || !id(receipt.id, "receipt") || !choice(receipt.state, ["verified", "refunded", "revoked", "quarantined"])
      || !string(receipt.providerTransactionId) || !string(receipt.originalTransactionId) || !date(receipt.purchasedAt)
      || (result.status !== "held" && (receipt.state === "quarantined" || result.status !== receipt.state))) return invalid();
  } else if (["verified", "refunded", "revoked"].includes(result.status as string)) return invalid();
  return value as TestStoreResult;
}
