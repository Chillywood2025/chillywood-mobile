import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import test from "node:test";
import ts from "typescript";

const uuid = n => `b0000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const userId = uuid(1), sessionId = uuid(2), installationId = uuid(3), configurationDigest = "a".repeat(64);
const epoch = Date.parse("2026-11-07T12:00:00Z"), clone = v => JSON.parse(JSON.stringify(v));
const quote = { offerId: `scv1_offer_${uuid(4)}`, offerRevision: 2, resourceId: `scv1_resource_${uuid(5)}`, resourceRevision: 3,
  creatorId: uuid(6), kind: "creator_tip", amountMinor: 199, currency: "usd" };
const customer = { id: `scv2_customer_${uuid(7)}`, buyerId: userId, installationId, configurationDigest,
  providerAppUserId: `scv2_teststore_${uuid(8)}`, projectId: "fixture-project", appId: "fixture-app", providerScopeKey: "fixture-scope",
  economicApplicationId: "fixture-economic-app", provider: "revenuecat", store: "TEST_STORE", sourceEnvironment: "SANDBOX" };
function allocation(n = 0) {
  return { id: `scv2_allocation_${uuid(10 + n)}`, intentId: `scv1_intent_${uuid(11 + n)}`, dispatchId: uuid(12 + n), customerBindingId: customer.id,
    configurationDigest, productId: "fixture-tip", quote: clone(quote), acceptPurchaseUntil: new Date(epoch + 60_000).toISOString(),
    registration: { id: `scv2_registration_${uuid(13 + n)}`, providerOfferingId: `offering-${n}`, offeringIdentifier: `intent-${n}`,
      providerPackageId: `package-${n}`, packageIdentifier: `tip-${n}`, providerProductId: "provider-product", productId: "fixture-tip" } };
}
const first = allocation(), requestId = uuid(30), bindId = uuid(31), claimId = uuid(32), reportId = uuid(33), advanceId = uuid(34);
const receipt = state => ({ id: `scv1_receipt_${uuid(35)}`, state, providerTransactionId: "fixture-transaction", originalTransactionId: "fixture-original", purchasedAt: new Date(epoch).toISOString() });
function response(command, id, overrides = {}, sid = sessionId) {
  return { protocol: "isolated-test-store-v2", command, requestId: id, actor: { userId, sessionId: sid }, generation: 1, environment: "sandbox",
    result: { status: command === "bind" ? "customer_bound" : command === "allocate" ? "offering_ready" : command === "claim" ? "dispatch_claimed" : command === "advance" ? "released" : "pending",
      reason: "fixture", dispatchAllowed: command === "claim", retryProviderMutation: false, grantsAccess: false, notPayable: true,
      customer: clone(customer), allocation: command === "bind" ? null : clone(first),
      reservation: { revision: command === "bind" ? 1 : command === "advance" ? 3 : 2, activeAllocationId: ["bind", "advance"].includes(command) ? null : first.id },
      authorityValidUntil: command === "claim" ? new Date(epoch + 4_000).toISOString() : null, receipt: null, ...clone(overrides) } };
}
function native(x = first, overrides = {}) {
  return { protocol: "isolated-test-store-native-v2", invocationId: x.dispatchId, customerBindingId: customer.id, installationId,
    buyerId: userId, configurationDigest, providerAppUserId: customer.providerAppUserId, allocationId: x.id, registrationId: x.registration.id,
    sessionId, state: "completed", outcome: "sdk_success", transactionHint: "fixture-transaction", completedAt: new Date(epoch + 1_000).toISOString(), ...overrides };
}
function load(path, bindings) {
  const scope = { exports: {}, require(name) { assert.ok(name in bindings, name); return bindings[name]; } };
  vm.runInNewContext(ts.transpileModule(fs.readFileSync(new URL(path, import.meta.url), "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText, scope); return scope.exports;
}
const v1 = load("../_lib/isolatedTestStoreContract.ts", {});
const contract = load("../_lib/isolatedTestStoreV2Contract.ts", { "./isolatedTestStoreContract": v1 });
function module() {
  return load("../_lib/isolatedTestStoreV2Attempts.ts", { "@react-native-async-storage/async-storage": { default: {} },
    "./isolatedTestStoreContract": v1, "./isolatedTestStoreV2Contract": contract });
}
function fixture() {
  const loaded = module(), data = new Map(), writes = []; let hook = null, time = epoch;
  const storage = { async getItem(key) { return data.get(key) ?? null; }, async setItem(key, value) {
    writes.push({ key, value }); await hook?.(key, value); data.set(key, value);
  } };
  const create = (extra = {}) => loaded.createIsolatedTestStoreV2AttemptJournal({ userId, installationId, configurationDigest, storage, now: () => time, ...extra });
  const f = { loaded, data, storage, writes, create, journal: create(), hook(v) { hook = v; }, time(v) { time = v; },
    raw() { return JSON.parse(data.get(loaded.ISOLATED_TEST_STORE_V2_JOURNAL_KEY)); },
    mutate(fn) { const d = f.raw(); fn(d); data.set(loaded.ISOLATED_TEST_STORE_V2_JOURNAL_KEY, JSON.stringify(d)); } };
  return f;
}
const err = code => e => e.code === code;
const tick = () => new Promise(resolve => setImmediate(resolve));
async function bound(f) { return (await f.journal.prepareBinding({ requestId: bindId, sessionId })).execute(async () => response("bind", bindId)); }
async function allocated(f, overrides = {}) {
  await bound(f);
  return (await f.journal.prepareAllocation({ requestId, sessionId, intentId: first.intentId, quote })).execute(async () => response("allocate", requestId, overrides));
}
async function claimed(f) {
  await allocated(f);
  return (await f.journal.prepareClaim({ requestId: claimId, sessionId, allocationId: first.id })).execute(async () => response("claim", claimId));
}
async function completed(f, result = native()) { const c = await claimed(f); return c.purchase(async () => result); }
async function advance(f, id = advanceId, overrides = {}) {
  f.time(epoch + 5_000);
  const ticket = await f.journal.prepareAdvance({ requestId: id, sessionId, allocationId: first.id, expectedReservationRevision: 2, acknowledgeUnknownOutcome: true }, async () => native());
  return ticket.execute(async () => response("advance", id, overrides));
}

test("each explicit mutation and SDK invocation is durable before its callback and capability is one-use", async () => {
  const f = fixture(), calls = [];
  const b = await f.journal.prepareBinding({ requestId: bindId, sessionId });
  await b.execute(async r => { calls.push(r.command); assert.equal(f.raw().bindingOperations[0].state, "unknown"); return response("bind", bindId); });
  const a = await f.journal.prepareAllocation({ requestId, sessionId, intentId: first.intentId, quote });
  await a.execute(async r => { calls.push(r.command); assert.equal(f.raw().attempts[0].operations[0].state, "unknown"); return response("allocate", requestId); });
  const c = await f.journal.prepareClaim({ requestId: claimId, sessionId, allocationId: first.id });
  const claim = await c.execute(async r => { calls.push(r.command); assert.equal(f.raw().attempts[0].operations[1].state, "unknown"); return response("claim", claimId); });
  await claim.purchase(async (owner, saved, proof) => {
    calls.push("native"); assert.equal(f.raw().attempts[0].nativePhase, "invoking"); assert.deepEqual(clone(owner), customer);
    assert.deepEqual(clone(saved), first); assert.equal(proof.result.dispatchAllowed, true); assert.ok(Object.isFrozen(proof.result)); return native();
  });
  const report = await f.journal.prepareReport({ requestId: reportId, sessionId, allocationId: first.id });
  await report.execute(async r => { calls.push(r.command); assert.equal(f.raw().attempts[0].operations[2].state, "unknown"); return response("report", reportId); });
  for (const again of [() => b.execute(async () => {}), () => a.execute(async () => {}), () => c.execute(async () => {}), () => claim.purchase(async () => {}), () => report.execute(async () => {})]) await assert.rejects(again(), err("capability_consumed"));
  assert.deepEqual(calls, ["bind", "allocate", "claim", "native", "report"]);
  const visible = (await f.journal.list())[0]; assert.equal("dispatchAllowed" in visible.observation, false); assert.equal("authorityValidUntil" in visible.observation, false);
  assert.equal(visible.observation.receipt, null); assert.equal(visible.nativePhase, "completed");
});

test("explicit advance retains unknown old history and allows only a different new intent and Offering", async () => {
  const f = fixture(); await completed(f); const advanced = await advance(f);
  assert.equal(advanced.owner.reservation.activeAllocationId, null); assert.equal(advanced.attempt.observation.receipt, null);
  const second = allocation(100), id = uuid(150);
  await (await f.journal.prepareAllocation({ requestId: id, sessionId, intentId: second.intentId, quote })).execute(async () => response("allocate", id, { allocation: second, reservation: { revision: 4, activeAllocationId: second.id } }));
  await f.journal.reconcile({ requestId: uuid(151), sessionId, payload: { intentId: first.intentId } }, response("read", uuid(151), { reservation: { revision: 4, activeAllocationId: second.id } }));
  const rows = await f.create().list(); assert.equal(rows.length, 2); assert.equal(rows[0].observation.status, "pending");
  assert.equal(rows[0].observation.receipt, null); assert.equal(rows[1].allocation.registration.offeringIdentifier, "intent-100");
  assert.equal((await f.journal.readOwner()).customer.providerAppUserId, customer.providerAppUserId);
  await assert.rejects(f.journal.prepareAllocation({ requestId: uuid(152), sessionId, intentId: first.intentId, quote }), err("request_conflict"));
});

test("lost claim and restart never reconstruct SDK permission from a fresh read", async () => {
  const f = fixture(); await allocated(f); const ticket = await f.journal.prepareClaim({ requestId: claimId, sessionId, allocationId: first.id });
  await assert.rejects(ticket.execute(async () => { throw new Error("connection lost"); }), err("outcome_unknown"));
  const reopened = module().createIsolatedTestStoreV2AttemptJournal({ userId, installationId, configurationDigest, storage: f.storage, now: () => epoch });
  await reopened.reconcile({ requestId: uuid(50), sessionId, payload: { intentId: first.intentId } }, response("read", uuid(50)));
  assert.equal((await reopened.prepareClaim({ requestId: claimId, sessionId, allocationId: first.id })).execute, null);
  await assert.rejects(reopened.prepareClaim({ requestId: uuid(51), sessionId, allocationId: first.id }), err("phase_unavailable"));
  assert.equal((await reopened.list())[0].operations[1].state, "unknown");
});

test("lost allocation may adopt exact canonical result before a new explicit claim", async () => {
  const f = fixture(); await bound(f);
  const a = await f.journal.prepareAllocation({ requestId, sessionId, intentId: first.intentId, quote });
  await assert.rejects(a.execute(async () => { throw new Error("lost"); }), err("outcome_unknown"));
  assert.equal((await f.create().prepareAllocation({ requestId, sessionId, intentId: first.intentId, quote })).execute, null);
  await f.journal.reconcile({ requestId: uuid(52), sessionId, payload: { intentId: first.intentId } }, response("read", uuid(52), { status: "offering_ready" }));
  const c = await f.journal.prepareClaim({ requestId: claimId, sessionId, allocationId: first.id }); assert.equal(c.mayExecute, true);
  assert.equal(typeof (await c.execute(async () => response("claim", claimId))).purchase, "function");
});

test("lost binding permits a fresh explicit bind but never changes installation owner", async () => {
  const f = fixture(), firstBind = await f.journal.prepareBinding({ requestId: bindId, sessionId });
  await assert.rejects(firstBind.execute(async () => { throw new Error("lost"); }), err("outcome_unknown"));
  assert.equal((await f.create().prepareBinding({ requestId: bindId, sessionId })).execute, null);
  await (await f.journal.prepareBinding({ requestId: uuid(53), sessionId })).execute(async () => response("bind", uuid(53)));
  const changed = await f.journal.prepareBinding({ requestId: uuid(54), sessionId });
  await assert.rejects(changed.execute(async () => response("bind", uuid(54), { customer: { ...customer, providerAppUserId: `scv2_teststore_${uuid(55)}` } })), err("invalid_response"));
  assert.equal((await f.journal.readOwner()).customer.providerAppUserId, customer.providerAppUserId);
});

test("global owner marker serializes competing instances and redacts foreign users or profiles", async () => {
  const f = fixture(); const outcomes = await Promise.allSettled([f.journal.prepareBinding({ requestId: bindId, sessionId }), f.create({ userId: uuid(60) }).prepareBinding({ requestId: uuid(61), sessionId })]);
  assert.equal(outcomes.filter(r => r.status === "fulfilled").length, 1);
  for (const other of [f.create({ userId: uuid(60) }), f.create({ configurationDigest: "b".repeat(64) }), f.create({ installationId: uuid(62) })]) {
    assert.deepEqual(clone(await other.list()), []); assert.deepEqual(clone(await other.readOwner()), { reserved: true, ownedByCurrentScope: false, customer: null, reservation: null, bindingObservation: null });
    await assert.rejects(other.prepareBinding({ requestId: uuid(63), sessionId }), err("owner_conflict"));
  }
});

test("concurrent allocations cannot create two attempts before either server call", async () => {
  const f = fixture(); await bound(f);
  const outcomes = await Promise.allSettled([f.journal.prepareAllocation({ requestId, sessionId, intentId: first.intentId, quote }),
    f.create().prepareAllocation({ requestId: uuid(65), sessionId, intentId: allocation(100).intentId, quote })]);
  assert.equal(outcomes.filter(r => r.status === "fulfilled").length, 1); assert.equal((await f.journal.list()).length, 1);
});

test("unacknowledged writes never issue or retain a usable external-call capability", async () => {
  for (const stage of ["prepare", "execute", "purchase"]) {
    const f = fixture(); let run;
    if (stage === "prepare") run = () => f.journal.prepareBinding({ requestId: bindId, sessionId });
    else if (stage === "execute") { const t = await f.journal.prepareBinding({ requestId: bindId, sessionId }); run = () => t.execute(async () => { throw new Error("must not send"); }); }
    else { const t = await claimed(f); run = () => t.purchase(async () => { throw new Error("must not open"); }); }
    f.hook(async (key, value) => { f.data.set(key, value); throw new Error("committed but acknowledgement lost"); });
    await assert.rejects(run(), err("storage_unavailable")); f.hook(null);
    if (stage !== "prepare") await assert.rejects(run(), err("capability_consumed"));
    assert.equal((await f.journal.readOwner()).reserved, true);
  }
});

test("read reconciliation while a claim response is delayed retires its handoff even under the same session", async () => {
  const f = fixture(); await allocated(f); let finish;
  const t = await f.journal.prepareClaim({ requestId: claimId, sessionId, allocationId: first.id });
  const pending = t.execute(async () => new Promise(resolve => { finish = resolve; })); while (!finish) await tick();
  await f.journal.reconcile({ requestId: uuid(70), sessionId: uuid(71), payload: { intentId: first.intentId } }, response("read", uuid(70), {}, uuid(71)));
  finish(response("claim", claimId)); assert.equal((await pending).purchase, null);
  assert.equal((await f.journal.list())[0].sessionId, sessionId);
});

test("recovery never rebinds original actor and rejects wrong current-session envelopes", async () => {
  const f = fixture(); await allocated(f);
  await assert.rejects(f.journal.reconcile({ requestId: uuid(72), sessionId: uuid(73), payload: { intentId: first.intentId } }, response("read", uuid(72))), err("invalid_response"));
  await f.journal.reconcile({ requestId: uuid(72), sessionId: uuid(73), payload: { intentId: first.intentId } }, response("read", uuid(72), { status: "offering_ready" }, uuid(73)));
  assert.equal((await f.journal.list())[0].sessionId, sessionId); assert.equal((await f.journal.list())[0].observation.sessionId, uuid(73));
});

test("clock expiry before or during durable SDK reservation prevents native invocation", async () => {
  for (const during of [false, true]) {
    const f = fixture(), c = await claimed(f); let invoked = 0;
    if (during) f.hook(async (_key, raw) => { if (JSON.parse(raw).attempts[0]?.nativePhase === "invoking") f.time(epoch + 4_000); });
    else f.time(epoch + 4_000);
    await assert.rejects(c.purchase(async () => { invoked++; return native(); }), err("authority_expired")); assert.equal(invoked, 0);
  }
});

test("registration is a one-way extension of immutable allocation, never a replaceable Offering", async () => {
  const f = fixture(); await allocated(f, { status: "provisioning", allocation: { ...first, registration: null } });
  await assert.rejects(f.journal.prepareClaim({ requestId: claimId, sessionId, allocationId: first.id }), err("phase_unavailable"));
  await f.journal.reconcile({ requestId: uuid(80), sessionId, payload: { intentId: first.intentId } }, response("read", uuid(80), { status: "offering_ready" }));
  for (const changed of [{ ...first, dispatchId: uuid(81) }, { ...first, quote: { ...quote, amountMinor: 200 } },
    { ...first, registration: { ...first.registration, offeringIdentifier: "different" } }]) {
    await assert.rejects(f.journal.reconcile({ requestId: uuid(82), sessionId, payload: { intentId: first.intentId } }, response("read", uuid(82), { status: "offering_ready", allocation: changed })), err("invalid_response"));
  }
  assert.equal((await f.journal.list())[0].allocation.registration.offeringIdentifier, first.registration.offeringIdentifier);
});

test("only an exact completed durable native invocation permits advance preparation", async () => {
  const f = fixture(); await claimed(f); f.time(epoch + 5_000);
  const input = { requestId: advanceId, sessionId, allocationId: first.id, expectedReservationRevision: 2, acknowledgeUnknownOutcome: true };
  const invalid = [null, native(first, { state: "invoking", outcome: null, transactionHint: null, completedAt: null })];
  for (const key of ["invocationId", "customerBindingId", "installationId", "buyerId", "configurationDigest", "providerAppUserId", "allocationId", "registrationId", "sessionId"]) invalid.push(native(first, { [key]: key === "configurationDigest" ? "b".repeat(64) : uuid(90) }));
  for (const value of invalid) await assert.rejects(f.journal.prepareAdvance(input, async () => value), err("native_completion_required"));
  assert.equal((await f.journal.prepareAdvance(input, async () => native())).mayExecute, true);
});

test("unknown advance requires explicit acknowledgement and cannot precede original claim expiry", async () => {
  const f = fixture(); await completed(f);
  const input = { requestId: advanceId, sessionId, allocationId: first.id, expectedReservationRevision: 2, acknowledgeUnknownOutcome: true };
  await assert.rejects(f.journal.prepareAdvance(input, async () => native()), err("authority_expired"));
  f.time(epoch + 5_000);
  await assert.rejects(f.journal.prepareAdvance({ ...input, acknowledgeUnknownOutcome: false }, async () => native()), err("unknown_acknowledgement_required"));
  const t = await f.journal.prepareAdvance(input, async () => native()); assert.equal(t.request.payload.disposition, "retain_unknown"); assert.equal(t.request.payload.expectedReceiptId, null);
});

test("recorded receipt advance uses exact receipt and reservation CAS without claiming SDK quiescence", async () => {
  const f = fixture(); await completed(f); f.time(epoch + 5_000);
  await f.journal.reconcile({ requestId: uuid(100), sessionId, payload: { intentId: first.intentId } }, response("read", uuid(100), { status: "verified", receipt: receipt("verified") }));
  await assert.rejects(f.journal.prepareAdvance({ requestId: advanceId, sessionId, allocationId: first.id, expectedReservationRevision: 1, acknowledgeUnknownOutcome: false }, async () => native()), err("phase_unavailable"));
  const t = await f.journal.prepareAdvance({ requestId: advanceId, sessionId, allocationId: first.id, expectedReservationRevision: 2, acknowledgeUnknownOutcome: false }, async () => native());
  assert.equal(t.request.payload.disposition, "receipt_recorded"); assert.equal(t.request.payload.expectedReceiptId, receipt("verified").id);
  await t.execute(async () => response("advance", advanceId, { receipt: receipt("verified") }));
  assert.equal((await f.journal.readOwner()).reserved, true); assert.equal((await f.journal.list())[0].nativePhase, "completed");
});

test("lost advance remains unknown and read recovers only reservation facts", async () => {
  const f = fixture(); await completed(f); f.time(epoch + 5_000);
  const t = await f.journal.prepareAdvance({ requestId: advanceId, sessionId, allocationId: first.id, expectedReservationRevision: 2, acknowledgeUnknownOutcome: true }, async () => native());
  await assert.rejects(t.execute(async () => { throw new Error("lost"); }), err("outcome_unknown"));
  await f.create().reconcile({ requestId: uuid(103), sessionId, payload: { intentId: first.intentId } }, response("read", uuid(103), { reservation: { revision: 3, activeAllocationId: null } }));
  assert.equal((await f.journal.readOwner()).reservation.activeAllocationId, null);
  const a = (await f.journal.list())[0]; assert.equal(a.observation.status, "pending"); assert.equal(a.observation.receipt, null); assert.equal(a.operations.at(-1).state, "unknown");
  assert.equal(a.initiationReleased, true);
});

test("stale reservation reads cannot reclaim a released slot or overwrite newer active allocation", async () => {
  const f = fixture(); await completed(f); await advance(f);
  await f.journal.reconcile({ requestId: uuid(104), sessionId, payload: { intentId: first.intentId } }, response("read", uuid(104)));
  assert.equal((await f.journal.readOwner()).reservation.revision, 3); assert.equal((await f.journal.readOwner()).reservation.activeAllocationId, null);
  await assert.rejects(f.journal.reconcile({ requestId: uuid(105), sessionId, payload: { intentId: first.intentId } }, response("read", uuid(105), { reservation: { revision: 3, activeAllocationId: first.id } })), err("invalid_response"));
});

test("late positive observations cannot erase held or negative receipt history", async () => {
  const f = fixture(); await allocated(f);
  await f.journal.reconcile({ requestId: uuid(110), sessionId, payload: { intentId: first.intentId } }, response("read", uuid(110), { status: "verified", receipt: receipt("verified") }));
  await f.journal.reconcile({ requestId: uuid(111), sessionId, payload: { intentId: first.intentId } }, response("read", uuid(111), { status: "held", allocation: null, customer: null, reservation: null }));
  await f.journal.reconcile({ requestId: uuid(112), sessionId, payload: { intentId: first.intentId } }, response("read", uuid(112), { status: "verified", receipt: receipt("verified") }));
  assert.equal((await f.journal.list())[0].observation.status, "held"); assert.equal((await f.journal.list())[0].receiptObservation.receipt.state, "verified");
  await f.journal.reconcile({ requestId: uuid(113), sessionId, payload: { intentId: first.intentId } }, response("read", uuid(113), { status: "refunded", receipt: receipt("refunded") }));
  await f.journal.reconcile({ requestId: uuid(114), sessionId, payload: { intentId: first.intentId } }, response("read", uuid(114), { status: "verified", receipt: receipt("verified") }));
  assert.equal((await f.journal.list())[0].receiptObservation.receipt.state, "refunded"); assert.equal((await f.journal.list())[0].observation.status, "held");
});

test("receipt ownership and native completion are immutable across reads and restart", async () => {
  const f = fixture(); await completed(f);
  await f.journal.reconcileNative(first.id, async () => native());
  await assert.rejects(f.create().reconcileNative(first.id, async () => native(first, { outcome: "sdk_cancelled" })), err("invalid_response"));
  await f.journal.reconcile({ requestId: uuid(120), sessionId, payload: { intentId: first.intentId } }, response("read", uuid(120), { status: "verified", receipt: receipt("verified") }));
  await assert.rejects(f.journal.reconcile({ requestId: uuid(121), sessionId, payload: { intentId: first.intentId } }, response("read", uuid(121), { status: "verified", receipt: { ...receipt("verified"), originalTransactionId: "other" } })), err("invalid_response"));
});

test("storage corruption and secret-bearing fields fail closed without changing v1 records", async () => {
  for (const mutate of [d => { d.attempts[0].quote.amountMinor++; }, d => { d.attempts[0].operations[0].request.payload.accessToken = "forbidden"; },
    d => { d.attempts[0].nativePhase = "completed"; }, d => { d.customer.providerAppUserId = "anonymous"; }, d => { d.version = 1; }]) {
    const f = fixture(); f.data.set("@chillywood/sandbox-commerce-v1/test-store-native-reservation", "retained-v1"); await allocated(f); f.mutate(mutate);
    await assert.rejects(f.journal.list(), err("storage_corrupt")); assert.equal(f.data.get("@chillywood/sandbox-commerce-v1/test-store-native-reservation"), "retained-v1");
  }
});

test("a free server reservation alone cannot bypass native completion and explicit advance", async () => {
  for (const hasNativeCompletion of [false, true]) {
    const f = fixture(); if (hasNativeCompletion) await completed(f); else await allocated(f);
    await f.journal.reconcile({ requestId: uuid(130), sessionId, payload: { intentId: first.intentId } }, response("read", uuid(130), { reservation: { revision: 3, activeAllocationId: null } }));
    assert.equal((await f.journal.list())[0].initiationReleased, false);
    await assert.rejects(f.journal.prepareAllocation({ requestId: uuid(131), sessionId, intentId: allocation(100).intentId, quote }), err("phase_unavailable"));
  }
});

test("a prepared but unsent advance is not sufficient to declare initiation released", async () => {
  const f = fixture(); await completed(f); f.time(epoch + 5_000);
  const ticket = await f.journal.prepareAdvance({ requestId: advanceId, sessionId, allocationId: first.id, expectedReservationRevision: 2, acknowledgeUnknownOutcome: true }, async () => native());
  await f.journal.reconcile({ requestId: uuid(132), sessionId, payload: { intentId: first.intentId } }, response("read", uuid(132), { reservation: { revision: 3, activeAllocationId: null } }));
  assert.equal((await f.journal.list())[0].initiationReleased, false); let sent = 0;
  await assert.rejects(ticket.execute(async () => { sent++; }), err("phase_unavailable")); assert.equal(sent, 0);
});

test("a hold after preparation stops advance without erasing the original request or native completion", async () => {
  const f = fixture(); await completed(f); f.time(epoch + 5_000);
  const ticket = await f.journal.prepareAdvance({ requestId: advanceId, sessionId, allocationId: first.id, expectedReservationRevision: 2, acknowledgeUnknownOutcome: true }, async () => native());
  await f.journal.reconcile({ requestId: uuid(133), sessionId, payload: { intentId: first.intentId } }, response("read", uuid(133), { status: "held" }));
  let sent = 0; await assert.rejects(ticket.execute(async () => { sent++; }), err("phase_unavailable")); assert.equal(sent, 0);
  const a = (await f.journal.list())[0]; assert.equal(a.nativePhase, "completed"); assert.equal(a.initiationReleased, false);
  assert.equal(a.operations.at(-1).requestId, advanceId);
});

test("public read recovery cannot expose persisted dispatch authority or recreate native opportunity", async () => {
  const f = fixture(); await claimed(f);
  const visible = clone(await f.create().list()); const serialized = JSON.stringify(visible);
  assert.equal(serialized.includes("dispatchAllowed"), false); assert.equal(serialized.includes("authorityValidUntil"), false);
  assert.equal(serialized.includes("accessToken"), false);
  assert.equal((await f.create().prepareClaim({ requestId: claimId, sessionId, allocationId: first.id })).execute, null);
  assert.equal(visible[0].nativePhase, "reserved");
});

test("late native completion after read-only recovery records original history without changing server projection", async () => {
  const f = fixture(), c = await claimed(f); let finish;
  const pending = c.purchase(async () => new Promise(resolve => { finish = resolve; })); while (!finish) await tick();
  await f.journal.reconcile({ requestId: uuid(134), sessionId: uuid(135), payload: { intentId: first.intentId } }, response("read", uuid(134), { status: "held" }, uuid(135)));
  finish(native()); await pending;
  const a = (await f.journal.list())[0]; assert.equal(a.nativePhase, "completed"); assert.equal(a.nativeInvocation.sessionId, sessionId);
  assert.equal(a.observation.status, "held"); assert.equal(a.observation.sessionId, uuid(135)); assert.equal(a.initiationReleased, false);
});

test("stored raw response provenance cannot substitute a customer, registration, or invalid reservation ID", async () => {
  for (const corrupt of [d => { d.attempts[0].operations[0].response.result.customer.id = `scv2_customer_${uuid(140)}`; },
    d => { d.attempts[0].observation.response.result.allocation.registration.offeringIdentifier = "other"; },
    d => { d.reservation.activeAllocationId = "scv2_allocation_invalid"; }]) {
    const f = fixture(); await allocated(f); f.mutate(corrupt); await assert.rejects(f.journal.list(), err("storage_corrupt"));
  }
});

test("bind recovers untracked server history without inventing an original request or SDK capability", async () => {
  const f = fixture();
  await (await f.journal.prepareBinding({ requestId: bindId, sessionId })).execute(async () => response("bind", bindId, {
    status: "pending", allocation: first, reservation: { revision: 2, activeAllocationId: first.id },
  }));
  assert.equal((await f.journal.readOwner()).bindingObservation.allocation.intentId, first.intentId);
  assert.deepEqual(clone(await f.journal.list()), []);
  const updated = await f.create().reconcileBinding({ requestId: uuid(160), sessionId: uuid(161), payload: { intentId: first.intentId } },
    response("read", uuid(160), { status: "verified", receipt: receipt("verified") }, uuid(161)));
  assert.equal(updated.bindingObservation.receipt.state, "verified"); assert.equal(updated.bindingObservation.sessionId, uuid(161));
  assert.deepEqual(clone(await f.journal.list()), []);
  await assert.rejects(f.journal.prepareClaim({ requestId: claimId, sessionId, allocationId: first.id }), err("attempt_missing"));
  await assert.rejects(f.journal.prepareAllocation({ requestId, sessionId, intentId: first.intentId, quote }), err("phase_unavailable"));
});

test("bind or untracked-read holds remain visible and fence new initiation", async () => {
  const f = fixture(); await bound(f);
  await f.journal.reconcileBinding({ requestId: uuid(162), sessionId, payload: { intentId: first.intentId } }, response("read", uuid(162), {
    status: "held", allocation: null, reservation: { revision: 2, activeAllocationId: null },
  }));
  await (await f.journal.prepareBinding({ requestId: uuid(163), sessionId })).execute(async () => response("bind", uuid(163), { reservation: { revision: 2, activeAllocationId: null } }));
  assert.equal((await f.journal.readOwner()).bindingObservation.status, "held");
  await assert.rejects(f.journal.prepareAllocation({ requestId, sessionId, intentId: first.intentId, quote }), err("phase_unavailable"));
});

test("untracked recovery preserves a known negative receipt when an older positive read arrives", async () => {
  const f = fixture(); await bound(f);
  await f.journal.reconcileBinding({ requestId: uuid(164), sessionId, payload: { intentId: first.intentId } }, response("read", uuid(164), { status: "refunded", receipt: receipt("refunded") }));
  await f.journal.reconcileBinding({ requestId: uuid(165), sessionId, payload: { intentId: first.intentId } }, response("read", uuid(165), { status: "verified", receipt: receipt("verified") }));
  assert.equal((await f.journal.readOwner()).bindingObservation.receipt.state, "refunded");
  await assert.rejects(f.journal.reconcileBinding({ requestId: uuid(166), sessionId, payload: { intentId: first.intentId } }, response("read", uuid(166), {
    status: "refunded", receipt: { ...receipt("refunded"), originalTransactionId: "wrong" },
  })), err("invalid_response"));
});
test("a binding hold vetoes prepared, in-flight and issued claim capabilities and continuation", async () => {
  const hold = f => f.journal.reconcileBinding({ requestId: uuid(180), sessionId, payload: { intentId: first.intentId } },
    response("read", uuid(180), { status: "held", customer: null, allocation: null, reservation: null }));
  const prepared = fixture(); await allocated(prepared);
  const ticket = await prepared.journal.prepareClaim({ requestId: claimId, sessionId, allocationId: first.id }); await hold(prepared);
  await assert.rejects(ticket.execute(async () => { assert.fail("held claim sent"); }), err("phase_unavailable"));
  await assert.rejects(prepared.journal.prepareClaim({ requestId: uuid(181), sessionId, allocationId: first.id }), err("phase_unavailable"));
  const pending = fixture(); await allocated(pending); let finish;
  const waiting = (await pending.journal.prepareClaim({ requestId: claimId, sessionId, allocationId: first.id })).execute(() => new Promise(done => { finish = done; }));
  while (!finish) await tick(); await hold(pending); finish(response("claim", claimId));
  assert.equal((await waiting).purchase, null);
  const issued = fixture(), capability = await claimed(issued); await hold(issued);
  await assert.rejects(capability.purchase(async () => { assert.fail("held native purchase invoked"); }), err("phase_unavailable"));
  const continuing = fixture(); await completed(continuing); continuing.time(epoch + 5_000);
  const advanceTicket = await continuing.journal.prepareAdvance({ requestId: advanceId, sessionId, allocationId: first.id,
    expectedReservationRevision: 2, acknowledgeUnknownOutcome: true }, async () => native()); await hold(continuing);
  await assert.rejects(advanceTicket.execute(async () => { assert.fail("held advance sent"); }), err("phase_unavailable"));
  await assert.rejects(continuing.journal.prepareAdvance({ requestId: uuid(182), sessionId, allocationId: first.id,
    expectedReservationRevision: 2, acknowledgeUnknownOutcome: true }, async () => native()), err("phase_unavailable"));
  const released = fixture(); await completed(released); await advance(released); await hold(released);
  assert.equal((await released.journal.list())[0].initiationReleased, false);
  assert.equal((await released.journal.readOwner()).bindingObservation.status, "held");
});
