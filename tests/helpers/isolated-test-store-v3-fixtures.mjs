import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import ts from "typescript";

export const uuid = n => `e0000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
export const A = { userId: uuid(1), accountId: uuid(1), sessionGeneration: uuid(2), state: "ACTIVE", restoreOnly: false };
export const B = { ...A, userId: uuid(3), accountId: uuid(3), sessionGeneration: uuid(4) };
export const digest = "b".repeat(64);
export const quote = { offerId: `scv1_offer_${uuid(5)}`, offerRevision: 2, resourceId: `scv1_resource_${uuid(6)}`, resourceRevision: 3, creatorId: uuid(7), kind: "paid_content", amountMinor: 199, currency: "usd", asset: {id:`scv1_asset_${uuid(70)}`,incarnation:uuid(71),sha256:"c".repeat(64),byteLength:1024,resourceRevision:3,profile:"scpv-mp4-h264-aac-v1"} };
export const customer = { id: `scv3_customer_${uuid(8)}`, buyerId: A.userId, installationId: uuid(9), providerAppUserId: `scv3_teststore_${uuid(10)}`, configurationDigest: digest, projectId: "separate_project", appId: "test_store_app", providerScopeKey: JSON.stringify(["revenuecat","separate_project","test_store_app","TEST_STORE","SANDBOX"]), economicApplicationId: "rc_test_store:separate_project:test_store_app", provider: "revenuecat", store: "TEST_STORE", sourceEnvironment: "SANDBOX" };
export const registration = { id: `scv3_registration_${uuid(11)}`, providerOfferingId: "offering_provider_id", offeringIdentifier: "intent_lookup_key", providerPackageId: "package_provider_id", packageIdentifier: "package_lookup_key", providerProductId: "product_provider_id", productId: "tip_199" };
export const allocation = { id: `scv3_allocation_${uuid(12)}`, intentId: `scv1_intent_${uuid(13)}`, dispatchId: uuid(14), customerBindingId: customer.id, configurationDigest: digest, productId: registration.productId, quote, acceptPurchaseUntil: "2030-01-01T00:00:00Z", registration };
export const clone = value => JSON.parse(JSON.stringify(value));
export const payload = command => ({
  bind: { installationId: customer.installationId }, allocate: { customerBindingId: customer.id, intentId: allocation.intentId, expectedQuote: quote },
  claim: { intentId: allocation.intentId, dispatchId: allocation.dispatchId, registrationId: registration.id, expectedQuote: quote },
  read: { intentId: allocation.intentId }, report: { intentId: allocation.intentId, dispatchId: allocation.dispatchId, outcome: "sdk_success", transactionHint: null },
  advance: { intentId: allocation.intentId, dispatchId: allocation.dispatchId, expectedReservationRevision: 2, disposition: "retain_unknown", expectedReceiptId: null },
})[command];
export function envelope(command = "read", requestId = uuid(20), status = "offering_ready") {
  return clone({ protocol: "isolated-test-store-v3", command, requestId, actor: { userId: A.userId, sessionId: A.sessionGeneration }, generation: 1, environment: "sandbox",
    result: { status, reason: status, dispatchAllowed: false, retryProviderMutation: false, grantsAccess: false, notPayable: true,
      customer, allocation: status === "customer_bound" ? null : allocation, reservation: { revision: 2, activeAllocationId: status === "customer_bound" ? null : allocation.id }, authorityValidUntil: null, receipt: null } });
}
export const expected = (command = "read", requestId = uuid(20)) => ({ command, requestId, actor: { userId: A.userId, sessionId: A.sessionGeneration }, configurationDigest: digest, payload: payload(command) });
export function load(relative, bindings = {}, globals = {}) {
  const scope = { exports: {}, ...globals, require(name) { assert.ok(name in bindings, `Unmodeled import: ${name}`); return bindings[name]; } };
  vm.runInNewContext(ts.transpileModule(fs.readFileSync(new URL(`../../${relative}`, import.meta.url), "utf8"), {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS },
  }).outputText, scope);
  return scope.exports;
}
export const v1 = load("_lib/isolatedTestStoreContract.ts");
export const contract = load("_lib/isolatedTestStoreV3Contract.ts", { "./isolatedTestStoreContract": v1 });
