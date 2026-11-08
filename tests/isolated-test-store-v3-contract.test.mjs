import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import vm from "node:vm";
import ts from "typescript";

function load(relative, bindings = {}) {
  const scope = { exports: {}, require(name) { assert.ok(name in bindings, `Unmodeled import: ${name}`); return bindings[name]; } };
  vm.runInNewContext(ts.transpileModule(fs.readFileSync(new URL(`../${relative}`, import.meta.url), "utf8"), {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS },
  }).outputText, scope);
  return scope.exports;
}
const base = load("_lib/isolatedTestStoreContract.ts");
const contract = load("_lib/isolatedTestStoreV3Contract.ts", { "./isolatedTestStoreContract": base });
const uuid = n => `e0000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const clone = value => JSON.parse(JSON.stringify(value));
const actor = { userId: uuid(1), sessionId: uuid(2) }, digest = "b".repeat(64);
const quote = { offerId: `scv1_offer_${uuid(5)}`, offerRevision: 2, resourceId: `scv1_resource_${uuid(6)}`, resourceRevision: 3,
  creatorId: uuid(7), kind: "paid_content", amountMinor: 199, currency: "usd",
  asset: { id: `scv1_asset_${uuid(8)}`, incarnation: uuid(9), sha256: "a".repeat(64), byteLength: 1024, resourceRevision: 3, profile: "scpv-mp4-h264-aac-v1" } };
const customer = { id: `scv3_customer_${uuid(10)}`, buyerId: actor.userId, installationId: uuid(11), providerAppUserId: `scv3_teststore_${uuid(12)}`,
  configurationDigest: digest, projectId: "separate_project", appId: "test_store_app",
  providerScopeKey: JSON.stringify(["revenuecat", "separate_project", "test_store_app", "TEST_STORE", "SANDBOX"]),
  economicApplicationId: "rc_test_store:separate_project:test_store_app", provider: "revenuecat", store: "TEST_STORE", sourceEnvironment: "SANDBOX" };
const registration = { id: `scv3_registration_${uuid(13)}`, providerOfferingId: "provider_offering_id", offeringIdentifier: "intent_lookup_key",
  providerPackageId: "provider_package_id", packageIdentifier: "package_lookup_key", providerProductId: "provider_product_id", productId: "video_199" };
const allocation = { id: `scv3_allocation_${uuid(14)}`, intentId: `scv1_intent_${uuid(15)}`, dispatchId: uuid(16), customerBindingId: customer.id,
  configurationDigest: digest, productId: registration.productId, quote, acceptPurchaseUntil: "2030-01-01T00:00:00Z", registration };
const payload = command => clone({
  bind: { installationId: customer.installationId },
  allocate: { customerBindingId: customer.id, intentId: allocation.intentId, expectedQuote: quote },
  claim: { intentId: allocation.intentId, dispatchId: allocation.dispatchId, registrationId: registration.id, expectedQuote: quote },
  read: { intentId: allocation.intentId },
  report: { intentId: allocation.intentId, dispatchId: allocation.dispatchId, outcome: "sdk_success", transactionHint: null },
  advance: { intentId: allocation.intentId, dispatchId: allocation.dispatchId, expectedReservationRevision: 2, disposition: "retain_unknown", expectedReceiptId: null },
}[command]);
const expected = (command = "read") => ({ command, requestId: uuid(20), actor, configurationDigest: digest, payload: payload(command) });
function envelope(command = "read", status = "offering_ready") {
  return clone({ protocol: "isolated-test-store-v3", command, requestId: uuid(20), actor, generation: 1, environment: "sandbox",
    result: { status, reason: status, dispatchAllowed: false, retryProviderMutation: false, grantsAccess: false, notPayable: true,
      customer, allocation: status === "customer_bound" ? null : allocation,
      reservation: { revision: 2, activeAllocationId: status === "customer_bound" ? null : allocation.id }, authorityValidUntil: null, receipt: null } });
}
function invocation(state = "completed") {
  return clone({ protocol: "isolated-test-store-native-v3", invocationId: allocation.dispatchId, customerBindingId: customer.id,
    installationId: customer.installationId, buyerId: customer.buyerId, configurationDigest: digest, providerAppUserId: customer.providerAppUserId,
    allocationId: allocation.id, registrationId: registration.id, sessionId: actor.sessionId, quote,
    state, outcome: state === "completed" ? "sdk_cancelled" : null, transactionHint: null,
    completedAt: state === "completed" ? "2026-11-07T12:00:00Z" : null });
}
const parse = (value, command = value.command) => contract.parseIsolatedTestStoreV3Result(value, expected(command));
const receipt = state => ({ id: `scv1_receipt_${uuid(30)}`, state, providerTransactionId: "tx", originalTransactionId: "original", purchasedAt: "2026-11-07T12:00:00Z" });

test("v3 quote requires the exact immutable Paid Video asset profile and bounded byte length", () => {
  assert.equal(contract.validTestStoreV3Quote(quote), true);
  for (const mutate of [q => { q.kind = "creator_tip"; }, q => { q.currency = "eur"; }, q => { delete q.asset; },
    q => { q.asset.id = `scv3_asset_${uuid(8)}`; }, q => { q.asset.incarnation = "legacy-id"; }, q => { q.asset.sha256 = "A".repeat(64); },
    q => { q.asset.byteLength = 0; }, q => { q.asset.byteLength = 16777217; }, q => { q.asset.byteLength = 1.5; },
    q => { q.asset.resourceRevision = 4; }, q => { q.asset.profile = "unscanned_mp4"; }, q => { q.asset.url = "https://untrusted.invalid"; },
    q => { q.offerRevision = Number.MAX_SAFE_INTEGER + 1; }, q => { q.extra = true; }]) {
    const changed = clone(quote); mutate(changed); assert.equal(contract.validTestStoreV3Quote(changed), false);
  }
  assert.equal(contract.validTestStoreV3Quote({ ...quote, asset: { ...quote.asset, byteLength: 16777216 } }), true);
});

test("v3 quote equality compares all asset fields without adopting current mutable catalog metadata", () => {
  assert.equal(contract.sameTestStoreV3Quote(quote, clone(quote)), true);
  for (const [key, value] of Object.entries({ id: `scv1_asset_${uuid(99)}`, incarnation: uuid(99), sha256: "c".repeat(64), byteLength: 2048, resourceRevision: 4, profile: "different_profile" })) {
    const changed = clone(quote); changed.asset[key] = value;
    assert.equal(contract.sameTestStoreV3Quote(quote, changed), false, key);
  }
  for (const [key, value] of Object.entries({ offerId: `scv1_offer_${uuid(99)}`, offerRevision: 3, resourceId: `scv1_resource_${uuid(99)}`, resourceRevision: 4,
    creatorId: uuid(99), kind: "creator_tip", amountMinor: 299, currency: "eur" })) {
    assert.equal(contract.sameTestStoreV3Quote(quote, { ...quote, [key]: value }), false, key);
  }
});

test("v3 customer admission rejects legacy IDs and mismatched economic application scopes", () => {
  assert.equal(contract.validTestStoreV3Customer(customer), true);
  assert.equal(contract.validTestStoreV3Customer({ ...customer, providerScopeKey: customer.providerScopeKey.replaceAll(",", ", ") }), true);
  for (const mutate of [c => { c.id = c.id.replace("scv3", "scv2"); }, c => { c.providerAppUserId = c.providerAppUserId.replace("scv3", "scv2"); },
    c => { c.providerScopeKey = JSON.stringify(["revenuecat", c.projectId, "other_app", "TEST_STORE", "SANDBOX"]); },
    c => { c.providerScopeKey = JSON.stringify(["revenuecat", c.projectId, c.appId, "TEST_STORE", "SANDBOX", "extra"]); },
    c => { c.providerScopeKey = "scope_alias"; }, c => { c.economicApplicationId = "rc_test_store:other_project:test_store_app"; },
    c => { c.store = "APP_STORE"; }, c => { c.sourceEnvironment = "PRODUCTION"; }, c => { c.extra = true; }]) {
    const changed = clone(customer); mutate(changed); assert.equal(contract.validTestStoreV3Customer(changed), false);
  }
});

test("every v3 command has an exact payload and old generation identities never qualify", () => {
  for (const command of ["bind", "allocate", "claim", "read", "report", "advance"]) {
    assert.equal(contract.validTestStoreV3Payload(command, payload(command)), true);
    assert.equal(contract.validTestStoreV3Payload(command, { ...payload(command), providerAppUserId: customer.providerAppUserId }), false);
  }
  for (const [command, changed] of [
    ["allocate", { ...payload("allocate"), customerBindingId: customer.id.replace("scv3", "scv2") }],
    ["claim", { ...payload("claim"), registrationId: registration.id.replace("scv3", "scv2") }],
    ["allocate", { ...payload("allocate"), expectedQuote: { ...quote, asset: { ...quote.asset, incarnation: uuid(99), resourceRevision: 4 } } }],
    ["advance", { ...payload("advance"), disposition: "receipt_recorded" }],
    ["advance", { ...payload("advance"), expectedReceiptId: receipt("verified").id }],
    ["report", { ...payload("report"), outcome: "provider_verified" }],
  ]) assert.equal(contract.validTestStoreV3Payload(command, changed), false);
});

test("response parsing binds exact actor, immutable allocation and full reviewed asset quote", () => {
  assert.equal(parse(envelope("allocate")).result.allocation.id, allocation.id);
  for (const mutate of [v => { v.protocol = "isolated-test-store-v2"; }, v => { v.generation = 3; }, v => { v.actor.sessionId = uuid(99); },
    v => { v.result.customer.buyerId = uuid(99); }, v => { v.result.customer.configurationDigest = "c".repeat(64); },
    v => { v.result.allocation.customerBindingId = `scv3_customer_${uuid(99)}`; }, v => { v.result.allocation.registration.productId = "different_sku"; },
    v => { v.result.allocation.quote.asset.incarnation = uuid(99); }, v => { v.result.allocation.quote.asset.sha256 = "c".repeat(64); },
    v => { v.result.allocation.quote.asset.byteLength = 2048; }, v => { v.result.allocation.quote.asset.id = `scv1_asset_${uuid(99)}`; },
    v => { v.result.allocation.quote.resourceRevision = 4; v.result.allocation.quote.asset.resourceRevision = 4; },
    v => { v.result.grantsAccess = true; }, v => { v.result.retryProviderMutation = true; }, v => { v.result.notPayable = false; }]) {
    const changed = envelope("allocate"); mutate(changed); assert.throws(() => parse(changed), /invalid_response/u);
  }
});

test("native invocation evidence retains full quote across prepared, invoking, unknown and completed states", () => {
  for (const state of ["prepared", "invoking", "unknown", "completed"]) assert.equal(contract.validTestStoreV3NativeInvocation(invocation(state)), true);
  for (const mutate of [v => { delete v.quote; }, v => { delete v.quote.asset; }, v => { v.quote.asset.resourceRevision = 99; },
    v => { v.protocol = "isolated-test-store-native-v2"; }, v => { v.allocationId = v.allocationId.replace("scv3", "scv2"); },
    v => { v.sessionId = "old-account"; }, v => { v.state = "invoking"; }, v => { v.completedAt = null; }, v => { v.outcome = null; },
    v => { v.noCharge = true; }, v => { v.grantsAccess = true; }]) {
    const changed = invocation(); mutate(changed); assert.equal(contract.validTestStoreV3NativeInvocation(changed), false);
  }
  const pending = invocation("unknown"); pending.outcome = "sdk_failed";
  assert.equal(contract.validTestStoreV3NativeInvocation(pending), false);
});

test("native immutable identity equality includes the complete allocated asset", () => {
  assert.equal(contract.sameTestStoreV3Allocation(allocation, clone(allocation)), true);
  for (const mutate of [v => { v.quote.asset.incarnation = uuid(99); }, v => { v.quote.asset.sha256 = "c".repeat(64); },
    v => { v.quote.asset.byteLength++; }, v => { v.quote.resourceRevision++; v.quote.asset.resourceRevision++; },
    v => { v.registration.offeringIdentifier = "replacement_lookup"; }, v => { v.registration.providerOfferingId = "replacement_provider_object"; },
    v => { v.dispatchId = uuid(99); }]) {
    const changed = clone(allocation); mutate(changed); assert.equal(contract.sameTestStoreV3Allocation(allocation, changed), false);
  }
});

test("only an active fresh claim shape carries dispatch authority, never a read or replay", () => {
  const value = envelope("claim", "dispatch_claimed"); value.result.dispatchAllowed = true; value.result.authorityValidUntil = "2029-01-01T00:00:00Z";
  assert.equal(parse(value).result.dispatchAllowed, true);
  for (const mutate of [v => { v.command = "read"; }, v => { v.result.dispatchAllowed = false; v.result.authorityValidUntil = null; },
    v => { v.result.reservation.activeAllocationId = `scv3_allocation_${uuid(99)}`; }, v => { v.result.authorityValidUntil = "2031-01-01T00:00:00Z"; },
    v => { v.result.authorityValidUntil = null; }, v => { v.result.receipt = receipt("verified"); }]) {
    const changed = clone(value); mutate(changed); assert.throws(() => parse(changed), /invalid_response/u);
  }
});

test("negative and held receipt history never becomes access or synthetic proof", () => {
  for (const state of ["verified", "refunded", "revoked", "quarantined"]) {
    const value = envelope("read", "held"); value.result.receipt = receipt(state);
    assert.equal(parse(value).result.grantsAccess, false);
    if (state !== "quarantined") { value.result.status = state; assert.equal(parse(value).result.receipt.state, state); }
    value.result.status = "pending"; assert.throws(() => parse(value), /invalid_response/u);
  }
  for (const status of ["verified", "refunded", "revoked"]) assert.throws(() => parse(envelope("read", status)), /invalid_response/u);
});

test("advance confirms only a strictly newer reservation and cannot be manufactured by a read", () => {
  const value = envelope("advance", "released"); value.result.reservation = { revision: 3, activeAllocationId: null };
  assert.equal(parse(value).result.receipt, null);
  for (const mutate of [v => { v.command = "read"; }, v => { v.result.reservation.revision = 2; }, v => { v.result.reservation.activeAllocationId = allocation.id; }]) {
    const changed = clone(value); mutate(changed); assert.throws(() => parse(changed), /invalid_response/u);
  }
  const e = expected("advance"); e.payload.disposition = "receipt_recorded"; e.payload.expectedReceiptId = receipt("verified").id;
  assert.throws(() => contract.parseIsolatedTestStoreV3Result(value, e), /invalid_response/u);
  value.result.receipt = receipt("verified");
  assert.equal(contract.parseIsolatedTestStoreV3Result(value, e).result.receipt.id, e.payload.expectedReceiptId);
});

test("read-only bind may recover the exact active allocation but never adopt a different installation", () => {
  assert.equal(parse(envelope("bind")).result.allocation.id, allocation.id);
  assert.equal(parse(envelope("bind", "customer_bound")).result.reservation.activeAllocationId, null);
  const changed = envelope("bind"); changed.result.customer.installationId = uuid(99);
  assert.throws(() => parse(changed), /invalid_response/u);
  const held = envelope("read", "held"); held.result.customer = null; held.result.allocation = null; held.result.reservation = null;
  assert.equal(parse(held).result.dispatchAllowed, false);
  held.result.receipt = receipt("verified"); assert.throws(() => parse(held), /invalid_response/u);
});

test("provisioning cannot fabricate a registered offering and ready states require the exact registration", () => {
  const value = envelope("allocate", "provisioning"); value.result.allocation.registration = null;
  assert.equal(parse(value).result.status, "provisioning");
  value.result.allocation.registration = clone(registration); assert.throws(() => parse(value), /invalid_response/u);
  for (const status of ["offering_ready", "pending", "dispatch_claimed", "verified"]) {
    const changed = envelope("read", status); changed.result.allocation.registration = null;
    assert.throws(() => parse(changed), /invalid_response/u);
  }
  const changed = envelope("claim"); changed.result.allocation.registration.id = `scv3_registration_${uuid(99)}`;
  assert.throws(() => parse(changed), /invalid_response/u);
});

if (process.env.ISOLATED_TEST_STORE_V3_FIXTURE) test("actual PostgreSQL V3 command captures satisfy the strict client contract", () => {
  const fixture = JSON.parse(fs.readFileSync(process.env.ISOLATED_TEST_STORE_V3_FIXTURE, "utf8"));
  assert.equal(fixture.protocol, "isolated-test-store-v3"); assert.ok(fixture.cases.length > 0);
  for (const entry of fixture.cases) contract.parseIsolatedTestStoreV3Result(entry.response, entry);
  assert.ok(fixture.cases.some(entry => entry.response.result.dispatchAllowed === true));
  assert.ok(fixture.cases.some(entry => entry.command === "claim" && entry.response.result.dispatchAllowed === false));
});
