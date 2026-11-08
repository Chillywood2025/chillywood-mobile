import assert from "node:assert/strict";
import test from "node:test";
import { A, B, allocation, clone, contract, customer, digest, envelope, load, uuid } from "./helpers/isolated-test-store-v3-fixtures.mjs";
const completion = (a, state = "prepared") => ({ protocol: "isolated-test-store-native-v3", invocationId: a.dispatchId,
  customerBindingId: customer.id, installationId: customer.installationId, buyerId: customer.buyerId, configurationDigest: digest,
  providerAppUserId: customer.providerAppUserId, allocationId: a.id, registrationId: a.registration.id, sessionId: A.sessionGeneration, quote:a.quote,
  state, outcome: state === "completed" ? "sdk_success" : null, transactionHint: null, completedAt: state === "completed" ? new Date().toISOString() : null });
function fixture() {
  let current = A, pending = null, snapshot = { configId: digest, projectId: customer.projectId, appId: customer.appId };
  const listeners = new Set(), calls = [];
  const module = load("_lib/isolatedTestStoreV3Sdk.ts", {
    "./accountSessionAuthority": { getCurrentAccountSessionAuthoritySnapshot: () => current,
      sameAccountSessionAuthority: (a, b) => !!a && !!b && a.userId === b.userId && a.accountId === b.accountId && a.sessionGeneration === b.sessionGeneration && a.restoreOnly === b.restoreOnly,
      subscribeToAccountSessionAuthority(listener) { listeners.add(listener); return () => listeners.delete(listener); } },
    "./isolatedTestStoreV3Contract": contract,
    "./isolatedTestStoreV3Build": {
      readIsolatedTestStoreV3Build: () => snapshot,
      bindIsolatedTestStoreV3NativeCustomer: async (c, session) => { calls.push(["bind", c.providerAppUserId, session]); },
      prepareIsolatedTestStoreV3NativePackage: async (c, a, session) => { calls.push(["prepare", a.registration.offeringIdentifier, session]); return { status: "prepared", handleId: uuid(50), invocation: completion(a) }; },
      purchaseIsolatedTestStoreV3NativePackage: async (_handle, _customer, a) => { calls.push(["purchase", a.dispatchId]); if (pending) await pending; return completion(a, "completed"); },
      retireIsolatedTestStoreV3NativeSession: async sid => { calls.push(["retire", sid]); },
    },
  });
  return { calls, capture: (c = customer) => module.captureIsolatedTestStoreV3Sdk(current, c),
    change(v) { current = v; for (const listener of listeners) listener(v); }, setBuild(v) { snapshot = v; }, hold(p) { pending = p; } };
}
const claim = a => { const value = envelope("claim", uuid(20), "dispatch_claimed"); value.result.allocation = clone(a); value.result.dispatchAllowed = true; value.result.authorityValidUntil = new Date(Date.now() + 4_000).toISOString(); return value; };

test("same pinned buyer can explicitly prepare distinct native packages without SDK identity switching", async () => {
  const f = fixture(), sdk = await f.capture();
  await sdk.prepare(allocation); assert.equal((await sdk.purchase(claim(allocation))).state, "completed");
  const second = clone(allocation); second.id = `scv3_allocation_${uuid(60)}`; second.dispatchId = uuid(61); second.intentId = `scv1_intent_${uuid(62)}`;
  second.registration.id = `scv3_registration_${uuid(63)}`; second.registration.offeringIdentifier = "fresh_second_intent";
  await sdk.prepare(second); await sdk.purchase(claim(second));
  assert.deepEqual(f.calls.map(c => c[0]), ["bind", "prepare", "purchase", "prepare", "purchase"]);
  assert.equal(f.calls[1][1], allocation.registration.offeringIdentifier); assert.equal(f.calls[3][1], "fresh_second_intent");
});
test("old purchase handle is consumed once, and dispose never rebuilds it", async () => {
  const f = fixture(), sdk = await f.capture(); await sdk.prepare(allocation); await sdk.purchase(claim(allocation));
  await assert.rejects(sdk.purchase(claim(allocation)), /unavailable/u); sdk.dispose();
  await assert.rejects(sdk.prepare(allocation), /unavailable/u);
  const fresh = await f.capture(); await assert.rejects(fresh.purchase(claim(allocation)), /unavailable/u);
  assert.equal(f.calls.filter(c => c[0] === "purchase").length, 1);
});
test("the process authority observer survives screen disposal and permanently retires A to B to A", async () => {
  const f = fixture(), sdk = await f.capture(); sdk.dispose(); f.change(B); f.change(A);
  await assert.rejects(f.capture(), /unavailable/u);
  assert.equal(f.calls.filter(c => c[0] === "retire").length, 1);
});
test("native completion after an Auth gap cannot revive the captured JavaScript operation", async () => {
  const f = fixture(), sdk = await f.capture(); await sdk.prepare(allocation); let done;
  f.hold(new Promise(resolve => { done = resolve; })); const pending = sdk.purchase(claim(allocation)); f.change(B); f.change(A); done();
  await assert.rejects(pending, /unavailable/u); await assert.rejects(f.capture(), /unavailable/u);
  assert.equal(f.calls.filter(c => c[0] === "purchase").length, 1);
});
test("wrong build, customer or unregistered allocation fails before native selection", async () => {
  const f = fixture(); f.setBuild(null); await assert.rejects(f.capture(), /unavailable/u); assert.deepEqual(f.calls, []);
  const g = fixture(); await assert.rejects(g.capture({ ...customer, buyerId: B.userId }), /unavailable/u); assert.deepEqual(g.calls, []);
  const sdk = await g.capture(); await assert.rejects(sdk.prepare({ ...allocation, registration: null }), /unavailable/u);
  assert.equal(g.calls.filter(c => c[0] === "prepare").length, 0);
});
