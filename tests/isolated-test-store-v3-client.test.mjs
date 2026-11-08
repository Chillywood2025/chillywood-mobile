import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import { A, B, allocation, clone, contract, customer, digest, envelope, expected, load, payload, quote, registration, uuid, v1 } from "./helpers/isolated-test-store-v3-fixtures.mjs";

function fixture() {
  let current = A; const listeners = new Set(), calls = []; let respond = body => envelope(body.command, body.requestId, body.command === "bind" ? "customer_bound" : "offering_ready");
  const module = load("_lib/isolatedTestStoreV3.ts", {
    "react-native": { Platform: { OS: "ios" } }, "./supabase": { SUPABASE_URL: "https://fixture.invalid", SUPABASE_ANON_KEY: "public-fixture" },
    "./accountBoundSupabaseMutation": { captureAccountBoundSupabaseMutationSubject: async () => ({ authority: current, accessToken: "captured-session-token" }) },
    "./accountSessionAuthority": { getCurrentAccountSessionAuthoritySnapshot: () => current,
      sameAccountSessionAuthority: (a, b) => !!a && !!b && a.userId === b.userId && a.accountId === b.accountId && a.sessionGeneration === b.sessionGeneration && a.restoreOnly === b.restoreOnly,
      subscribeToAccountSessionAuthority(listener) { listeners.add(listener); return () => listeners.delete(listener); } },
    "./isolatedTestStoreContract": v1, "./isolatedTestStoreV3Contract": contract,
  }, { fetch: async (url, options) => { calls.push({ url, ...options }); return { ok: true, json: async () => respond(JSON.parse(options.body)) }; } });
  return { calls, capture: () => module.captureIsolatedTestStoreV3Client(current, digest), change(value) { current = value; for (const listener of listeners) listener(value); }, respond(fn) { respond = fn; } };
}

test("v3 uses exact captured Auth, separate endpoint and no automatic mutation replay", async () => {
  const f = fixture(), client = await f.capture();
  await client.request("bind", uuid(20), payload("bind"));
  assert.equal(f.calls[0].url, "https://fixture.invalid/functions/v1/isolated-sandbox-test-store-v3");
  assert.equal(f.calls[0].headers.Authorization, "Bearer captured-session-token");
  const body = JSON.parse(f.calls[0].body);
  assert.equal(body.protocol, "isolated-test-store-v3"); assert.equal(body.expectedSessionId, A.sessionGeneration); assert.equal("userId" in body, false);
  await assert.rejects(client.request("bind", uuid(20), payload("bind")), /invalid_request/u);
  assert.equal(f.calls.length, 1);
  await client.request("bind", uuid(21), payload("bind")); // explicit new provider-free bind recovers immutable owner
  assert.equal(f.calls.length, 2);
});

test("v1 ownership, non-USD and injected fields fail before sending", async () => {
  const f = fixture(), client = await f.capture();
  for (const p of [{ ...payload("allocate"), customerBindingId: `scv1_customer_${uuid(8)}` },
    { ...payload("allocate"), expectedQuote: { ...quote, currency: "eur" } }, { ...payload("allocate"), providerAppUserId: customer.providerAppUserId }]) {
    await assert.rejects(client.request("allocate", uuid(20), p), /invalid_request/u);
  }
  assert.equal(f.calls.length, 0);
});

test("all response ownership, provider and registration joins remain exact", () => {
  for (const mutate of [v => { v.protocol = "isolated-test-store-v1"; }, v => { v.generation = 2; }, v => { v.actor.sessionId = B.sessionGeneration; },
    v => { v.result.customer.buyerId = B.userId; }, v => { v.result.customer.providerAppUserId = customer.providerAppUserId.replace("scv3", "scv1"); },
    v => { v.result.customer.store = "APP_STORE"; }, v => { v.result.allocation.customerBindingId = `scv3_customer_${uuid(99)}`; },
    v => { v.result.allocation.registration.productId = "different_product"; }, v => { v.result.allocation.quote.currency = "eur"; },
    v => { v.result.grantsAccess = true; }, v => { v.result.retryProviderMutation = true; }, v => { v.result.reservation = null; },
    v => { v.result.allocation.registration = null; }, v => { v.result.customer.extra = "unmodeled"; }]) {
    const value = envelope(); mutate(value); assert.throws(() => contract.parseIsolatedTestStoreV3Result(value, expected()), /invalid_response/u);
  }
  const value = envelope("claim"); value.result.allocation.registration.id = `scv3_registration_${uuid(99)}`;
  assert.throws(() => contract.parseIsolatedTestStoreV3Result(value, expected("claim")), /invalid_response/u);
});

test("provider-free bind can recover exact current allocation but never buyer or installation adoption", () => {
  assert.equal(contract.parseIsolatedTestStoreV3Result(envelope("bind"), expected("bind")).result.allocation.id, allocation.id);
  const value = envelope("bind", uuid(20), "customer_bound");
  assert.equal(contract.parseIsolatedTestStoreV3Result(value, expected("bind")).result.reservation.activeAllocationId, null);
  value.result.customer.installationId = uuid(99);
  assert.throws(() => contract.parseIsolatedTestStoreV3Result(value, expected("bind")), /invalid_response/u);
});

test("only fresh claim on the exact active allocation can carry a purchase lease", () => {
  const value = envelope("claim", uuid(20), "dispatch_claimed"); value.result.dispatchAllowed = true; value.result.authorityValidUntil = "2029-01-01T00:00:00Z";
  assert.equal(contract.parseIsolatedTestStoreV3Result(value, expected("claim")).result.dispatchAllowed, true);
  for (const mutate of [v => { v.command = "read"; }, v => { v.result.reservation.activeAllocationId = `scv3_allocation_${uuid(99)}`; },
    v => { v.result.authorityValidUntil = "2031-01-01T00:00:00Z"; }, v => { v.result.dispatchAllowed = false; }]) {
    const changed = clone(value); mutate(changed);
    assert.throws(() => contract.parseIsolatedTestStoreV3Result(changed, expected(changed.command)), /invalid_response/u);
  }
});

test("retained pending outcome can coexist with a later slot; advance proves only reservation change", () => {
  const history = envelope("read", uuid(20), "pending"); history.result.reservation = { revision: 4, activeAllocationId: `scv3_allocation_${uuid(99)}` };
  assert.equal(contract.parseIsolatedTestStoreV3Result(history, expected()).result.status, "pending");
  const released = envelope("advance", uuid(20), "released"); released.result.reservation = { revision: 3, activeAllocationId: null };
  assert.equal(contract.parseIsolatedTestStoreV3Result(released, expected("advance")).result.receipt, null);
  for (const reservation of [{ revision: 2, activeAllocationId: null }, { revision: 3, activeAllocationId: allocation.id }]) {
    released.result.reservation = reservation;
    assert.throws(() => contract.parseIsolatedTestStoreV3Result(released, expected("advance")), /invalid_response/u);
  }
});

test("negative receipt history never becomes access or clears an explicit hold", () => {
  for (const state of ["verified", "refunded", "revoked", "quarantined"]) {
    const value = envelope("read", uuid(20), "held");
    value.result.receipt = { id: `scv1_receipt_${uuid(30)}`, state, providerTransactionId: "tx", originalTransactionId: "original", purchasedAt: "2026-11-07T12:00:00Z" };
    assert.equal(contract.parseIsolatedTestStoreV3Result(value, expected()).result.grantsAccess, false);
    value.command = "advance"; value.result.status = "released"; value.result.reservation = { revision: 3, activeAllocationId: null };
    if (state === "quarantined") assert.throws(() => contract.parseIsolatedTestStoreV3Result(value, expected("advance")), /invalid_response/u);
    else assert.equal(contract.parseIsolatedTestStoreV3Result(value, expected("advance")).result.receipt.state, state);
  }
});

test("A to B to A permanently retires old transport even when its response arrives late", async () => {
  const f = fixture(), client = await f.capture(); let resolve;
  f.respond(() => new Promise(done => { resolve = done; }));
  const pending = client.request("allocate", uuid(20), payload("allocate"));
  while (!resolve) await new Promise(done => setImmediate(done));
  f.change(B); f.change(A); resolve(envelope("allocate"));
  await assert.rejects(pending, error => error.outcome === "unknown");
  await assert.rejects(client.request("read", uuid(21), payload("read")), /authority_retired/u);
  assert.equal(f.calls.length, 1);
});

test("native completion is exact invocation evidence and cannot be forged by missing fields or a nonterminal state", () => {
  const native = { protocol: "isolated-test-store-native-v3", invocationId: allocation.dispatchId, customerBindingId: customer.id,
    installationId: customer.installationId, buyerId: customer.buyerId, configurationDigest: digest, providerAppUserId: customer.providerAppUserId,
    allocationId: allocation.id, registrationId: registration.id, sessionId: A.sessionGeneration, quote, state: "completed", outcome: "sdk_cancelled", transactionHint: null, completedAt: "2026-11-07T12:00:00Z" };
  assert.equal(contract.validTestStoreV3NativeInvocation(native), true);
  for (const mutate of [v => { v.state = "invoking"; }, v => { delete v.sessionId; }, v => { v.noCharge = true; }, v => { v.completedAt = null; }, v => { v.outcome = null; }]) {
    const changed = clone(native); mutate(changed); assert.equal(contract.validTestStoreV3NativeInvocation(changed), false);
  }
});

if (process.env.ISOLATED_TEST_STORE_V3_FIXTURE) test("fresh actual PostgreSQL v3 captures pass the strict client parser", () => {
  const fixture = JSON.parse(fs.readFileSync(process.env.ISOLATED_TEST_STORE_V3_FIXTURE, "utf8"));
  assert.equal(fixture.protocol, "isolated-test-store-v3"); assert.ok(fixture.cases.length > 0);
  for (const entry of fixture.cases) contract.parseIsolatedTestStoreV3Result(entry.response, entry);
});
