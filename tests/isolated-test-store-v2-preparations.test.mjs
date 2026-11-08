import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import { A, B, uuid, digest, quote, customer, allocation, clone, load, v1, contract, envelope } from "./helpers/isolated-test-store-v2-fixtures.mjs";

const indexKey = "@chillywood/isolated-test-store-v2/core-preparation-index";
const coreKey = user => `@chillywood/sandbox-commerce-v1/tip-checkout-attempts:${user}`;
const prefixed = request => `@chillywood/isolated-test-store-v2/core:${customer.installationId}:${digest}:${request}:${coreKey(A.userId)}`;
const epoch = Date.parse("2026-11-07T12:00:00Z"), requestId = uuid(100);
const input = (id = requestId, sessionId = A.sessionGeneration) => ({ requestId: id, sessionId, quote: clone(quote) });
function fixture() {
  const data = new Map(), writes = []; let writeHook = null, readHook = null, time = epoch;
  const storage = { async getItem(key) { await readHook?.(key); return data.get(key) ?? null; }, async setItem(key, value) {
    writes.push({ key, value }); await writeHook?.(key, value); data.set(key, value);
  } };
  const commerce = load("_lib/isolatedSandboxCommerce.ts", { "./accountBoundSupabaseMutation": {}, "./accountBoundSupabaseRpc.mjs": {}, "./supabase": {}, "react-native": { Platform: { OS: "ios" } }, "./accountSessionAuthority": {} });
  const core = load("_lib/isolatedSandboxTipCheckoutAttempts.ts", { "@react-native-async-storage/async-storage": { default: storage }, "./isolatedSandboxCommerce": commerce });
  const provider = load("_lib/isolatedTestStoreV2Attempts.ts", { "@react-native-async-storage/async-storage": { default: storage }, "./isolatedTestStoreContract": v1, "./isolatedTestStoreV2Contract": contract });
  const coordinator = load("_lib/isolatedTestStoreV2Preparations.ts", { "@react-native-async-storage/async-storage": { default: storage },
    "./isolatedSandboxTipCheckoutAttempts": core, "./isolatedTestStoreContract": v1, "./isolatedTestStoreV2Contract": contract, "./isolatedTestStoreV2Attempts": provider });
  const options = { userId: A.userId, configurationDigest: digest, installationId: customer.installationId, storage };
  const create = (extra = {}) => coordinator.createIsolatedTestStoreV2Preparations({ ...options, ...extra });
  const journal = provider.createIsolatedTestStoreV2AttemptJournal({ ...options, now: () => time });
  return { data, writes, storage, commerce, core, provider, create, coordinator: create(), journal,
    writeHook(fn) { writeHook = fn; }, readHook(fn) { readHook = fn; }, time(v) { time = v; } };
}
function coreEnvelope(command, id, data, session = A.sessionGeneration) {
  return { protocol: "sandbox-commerce-v1", environment: "sandbox", command, requestId: id,
    actor: { userId: A.userId, accountId: A.userId, sessionGeneration: session }, status: "ok", data };
}
function prepared(i = input(), intentId = allocation.intentId) {
  return coreEnvelope("checkout.prepare", i.requestId, { intent: { id: intentId, offerId: i.quote.offerId, resourceId: i.quote.resourceId,
    kind: "creator_tip", status: "prepared", providerDispatchAllowed: false } }, i.sessionId);
}
function history(i = input(), { current = A.sessionGeneration, intentId = allocation.intentId, tombstone = null, changes = {} } = {}) {
  return { id: intentId, ...clone(i.quote), status: tombstone ? "abandoned" : "prepared", createdAt: "2026-11-07T11:00:00Z", expiresAt: "2030-01-01T00:00:00Z",
    originalSessionMatchesCurrent: current === i.sessionId, dispatchState: "not_recorded", receipt: null, abandonment: tombstone,
    providerDispatchAllowed: false, noDispatchProven: !!tombstone, ...changes };
}
function recovery(i = input(), options = {}) {
  const current = options.current ?? A.sessionGeneration, id = options.readId ?? uuid(101), found = options.found ?? true;
  const entry = found ? history(i, { ...options, current }) : null;
  return { binding: { requestId: id, sessionGeneration: current }, response: coreEnvelope("request.read", id, {
    resolution: found ? "found" : "unknown", originalRequestId: i.requestId, recordedCommand: found ? "checkout.prepare" : null,
    recordedSessionId: found ? i.sessionId : null, recordedPayload: found ? { protocol: "sandbox-commerce-v1", requestId: i.requestId, offerId: i.quote.offerId, expectedRevision: i.quote.offerRevision } : null,
    resource: null, offer: null, declaration: null, entry, retryAllowed: false, noDispatchProven: !!entry?.noDispatchProven,
  }, current) };
}
async function bind(f) {
  const response = envelope("bind", uuid(110), "customer_bound"); response.result.reservation.revision = 1;
  await (await f.journal.prepareBinding({ requestId: uuid(110), sessionId: A.sessionGeneration })).execute(async () => response);
}
async function confirmed(f, i = input(), intentId = allocation.intentId) {
  const ticket = await f.coordinator.prepareNew(i); await ticket.dispatch(async () => prepared(i, intentId));
  const r = recovery(i, { intentId }); await f.coordinator.reconcile(i.requestId, r.response, r.binding); return ticket;
}
function native() {
  return { protocol: "isolated-test-store-native-v2", invocationId: allocation.dispatchId, customerBindingId: customer.id, installationId: customer.installationId,
    buyerId: A.userId, configurationDigest: digest, providerAppUserId: customer.providerAppUserId, allocationId: allocation.id,
    registrationId: allocation.registration.id, sessionId: A.sessionGeneration, state: "completed", outcome: "sdk_success", transactionHint: null,
    completedAt: new Date(epoch + 1_000).toISOString() };
}
async function providerCompleted(f) {
  await (await f.journal.prepareAllocation({ requestId: uuid(120), sessionId: A.sessionGeneration, intentId: allocation.intentId, quote })).execute(async () => envelope("allocate", uuid(120)));
  const claim = envelope("claim", uuid(121), "dispatch_claimed"); claim.result.dispatchAllowed = true; claim.result.authorityValidUntil = new Date(epoch + 4_000).toISOString();
  const ticket = await (await f.journal.prepareClaim({ requestId: uuid(121), sessionId: A.sessionGeneration, allocationId: allocation.id })).execute(async () => claim);
  await ticket.purchase(async () => native());
}
async function providerAdvanced(f) {
  f.time(epoch + 5_000);
  const ticket = await f.journal.prepareAdvance({ requestId: uuid(122), sessionId: A.sessionGeneration, allocationId: allocation.id,
    expectedReservationRevision: 2, acknowledgeUnknownOutcome: true }, async () => native());
  const response = envelope("advance", uuid(122), "released"); response.result.reservation = { revision: 3, activeAllocationId: null };
  await ticket.execute(async () => response);
}
const blocked = e => e.message === "isolated_test_store_v2_preparation_unavailable";
const tick = () => new Promise(resolve => setImmediate(resolve));

test("the durable index precedes actual core mutation and preserves all original v1 namespaces", async () => {
  const f = fixture(); await bind(f); f.data.set(coreKey(A.userId), "unchanged-v1-journal");
  const ticket = await f.coordinator.prepareNew(input()); assert.equal(ticket.mayDispatch, true);
  const indexWrite = f.writes.findIndex(x => x.key === indexKey), coreWrite = f.writes.findIndex(x => x.key === prefixed(requestId));
  assert.ok(indexWrite >= 0 && coreWrite > indexWrite);
  await ticket.dispatch(async () => {
    assert.equal(JSON.parse(f.data.get(indexKey)).entries[0].requestId, requestId);
    assert.equal(JSON.parse(f.data.get(prefixed(requestId))).attempts[0].state, "unknown"); return prepared();
  });
  assert.equal((await f.coordinator.list())[0].attempt.state, "unknown");
  assert.equal(f.data.get(coreKey(A.userId)), "unchanged-v1-journal");
  assert.equal(f.data.has("@chillywood/sandbox-commerce-v1/test-store-native-reservation"), false);
});

test("only exact canonical economics and original session confirm the reviewed core quote", async () => {
  const f = fixture(); await bind(f); const ticket = await f.coordinator.prepareNew(input()); await ticket.dispatch(async () => prepared());
  const mismatch = recovery(input(), { current: uuid(130), changes: { amountMinor: 200 } });
  await f.coordinator.reconcile(requestId, mismatch.response, mismatch.binding);
  assert.equal((await f.coordinator.list())[0].attempt.state, "unknown");
  const valid = recovery(input(), { current: uuid(130) }); await f.coordinator.reconcile(requestId, valid.response, valid.binding);
  const a = (await f.create().list())[0].attempt; assert.equal(a.state, "intent_prepared"); assert.equal(a.sessionGeneration, A.sessionGeneration);
  assert.equal(a.result.observedSessionGeneration, uuid(130));
  const wrong = recovery(); wrong.response.data.recordedSessionId = uuid(131);
  await assert.rejects(f.coordinator.reconcile(requestId, wrong.response, wrong.binding));
});

test("two successive core intents require actual provider initiation release, not merely SDK completion", async () => {
  const f = fixture(); await bind(f); await confirmed(f); await providerCompleted(f);
  await assert.rejects(f.coordinator.prepareNew(input(uuid(140))), blocked);
  await providerAdvanced(f); assert.equal((await f.journal.list())[0].initiationReleased, true);
  const secondId = uuid(140), secondIntent = `scv1_intent_${uuid(141)}`;
  await confirmed(f, input(secondId), secondIntent);
  const rows = await f.create().list(); assert.equal(rows.length, 2); assert.equal(rows[0].attempt.intentId, allocation.intentId);
  assert.equal(rows[1].attempt.intentId, secondIntent); assert.equal(rows[0].attempt.state, "intent_prepared");
  assert.equal((await f.journal.list())[0].observation.receipt, null);
});

test("receipt-free server slot release cannot bypass original native and explicit-advance proof", async () => {
  const f = fixture(); await bind(f); await confirmed(f); await providerCompleted(f);
  const response = envelope("read", uuid(142), "pending"); response.result.reservation = { revision: 3, activeAllocationId: null };
  await f.journal.reconcile({ requestId: uuid(142), sessionId: A.sessionGeneration, payload: { intentId: allocation.intentId } }, response);
  assert.equal((await f.journal.list())[0].initiationReleased, false);
  await assert.rejects(f.coordinator.prepareNew(input(uuid(143))), blocked);
});

test("lost core response remains unknown after restart and neither original nor replacement ID redispatches", async () => {
  const f = fixture(); await bind(f); const ticket = await f.coordinator.prepareNew(input()); let sends = 0;
  await assert.rejects(ticket.dispatch(async () => { sends++; throw new Error("lost"); }));
  const reopened = f.create(); assert.equal((await reopened.list())[0].attempt.state, "unknown");
  await assert.rejects(reopened.prepareNew(input()), blocked); await assert.rejects(reopened.prepareNew(input(uuid(150))), blocked);
  const missing = recovery(input(), { found: false }); await reopened.reconcile(requestId, missing.response, missing.binding);
  await assert.rejects(reopened.prepareNew(input(uuid(151))), blocked); assert.equal(sends, 1);
});

test("index acknowledgement loss or partial core storage cannot produce another mutation opportunity", async () => {
  for (const mode of ["index-reject", "index-committed-reject", "core-reject"]) {
    const f = fixture(); await bind(f);
    f.writeHook(async (key, value) => {
      if ((mode.startsWith("index") && key === indexKey) || (mode === "core-reject" && key === prefixed(requestId))) {
        if (mode === "index-committed-reject") f.data.set(key, value); throw new Error("storage failure");
      }
    });
    await assert.rejects(f.coordinator.prepareNew(input())); f.writeHook(null);
    assert.equal(f.data.has(prefixed(requestId)), false);
    if (mode !== "index-reject") { assert.equal((await f.create().list())[0].attempt, null); await assert.rejects(f.create().prepareNew(input(uuid(152))), blocked); }
  }
});

test("foreign user, installation and profile cannot read or replace the permanent preparation index", async () => {
  const f = fixture(); await bind(f); await f.coordinator.prepareNew(input());
  for (const extra of [{ userId: B.userId }, { installationId: uuid(153) }, { configurationDigest: "c".repeat(64) }]) {
    const other = f.create(extra); await assert.rejects(other.list(), blocked); await assert.rejects(other.prepareNew(input(uuid(154))), blocked);
  }
});

test("input is captured before awaited storage so caller mutation cannot change quote, request or session", async () => {
  const f = fixture(); await bind(f); let release, waiting = false;
  f.readHook(async key => { if (key === indexKey && !waiting) { waiting = true; await new Promise(resolve => { release = resolve; }); } });
  const mutable = input(), pending = f.coordinator.prepareNew(mutable); while (!release) await tick();
  mutable.quote.amountMinor = 999; mutable.requestId = uuid(155); mutable.sessionId = uuid(156); release();
  const ticket = await pending; assert.equal(ticket.attempt.requestId, requestId); assert.equal(ticket.attempt.quote.amountMinor, 199);
  assert.equal(ticket.attempt.sessionGeneration, A.sessionGeneration); assert.equal((await f.coordinator.list())[0].quote.amountMinor, 199);
});

test("binding holds prevent even the initial core intent mutation", async () => {
  const f = fixture(); await bind(f);
  const hold = envelope("bind", uuid(157), "held"); hold.result.allocation = null; hold.result.reservation.activeAllocationId = null;
  await (await f.journal.prepareBinding({ requestId: uuid(157), sessionId: A.sessionGeneration })).execute(async () => hold);
  await assert.rejects(f.coordinator.prepareNew(input()), blocked); assert.equal(f.data.has(indexKey), false);
});

test("exact transport not-dispatched proof safely permits a new core request without provider advance", async () => {
  const f = fixture(); await bind(f); const ticket = await f.coordinator.prepareNew(input());
  await ticket.dispatch(async () => { throw new f.commerce.IsolatedSandboxCommerceError("authority_retired", requestId, "not_dispatched"); });
  assert.equal((await f.coordinator.list())[0].attempt.state, "not_applied");
  assert.equal((await f.coordinator.prepareNew(input(uuid(160)))).mayDispatch, true);
});

test("undispatched closure requires fresh core observation and exact immutable tombstone", async () => {
  const f = fixture(); await bind(f); await confirmed(f);
  const abandonId = uuid(161);
  await assert.rejects(f.coordinator.prepareAbandon({ requestId: abandonId, sessionId: A.sessionGeneration, originalRequestId: requestId, intentId: allocation.intentId }));
  const read = recovery(); await f.coordinator.observeForAbandon(requestId, read.response, read.binding);
  const ticket = await f.coordinator.prepareAbandon({ requestId: abandonId, sessionId: A.sessionGeneration, originalRequestId: requestId, intentId: allocation.intentId });
  const tombstone = { intentId: allocation.intentId, originalRequestId: requestId, originalSessionId: A.sessionGeneration,
    abandonedBySessionId: A.sessionGeneration, abandonedAt: new Date(epoch).toISOString(), proof: "undispatched_tombstone" };
  await ticket.dispatch(async () => coreEnvelope("checkout.abandon", abandonId, { entry: history(input(), { tombstone }),
    abandonment: tombstone, noDispatchProven: true, replacementAllowed: true, retryAllowed: false }));
  assert.equal((await f.coordinator.list())[0].attempt.state, "abandoned");
  assert.equal((await f.coordinator.prepareNew(input(uuid(162)))).mayDispatch, true);
});

test("concurrent coordinator instances serialize the index and cannot create two initial core intents", async () => {
  const f = fixture(); await bind(f);
  const outcomes = await Promise.allSettled([f.coordinator.prepareNew(input()), f.create().prepareNew(input(uuid(170)))]);
  assert.equal(outcomes.filter(o => o.status === "fulfilled").length, 1); assert.equal((await f.coordinator.list()).length, 1);
});

test("abandonment preparation captures the exact request and session before the owner read", async () => {
  const f = fixture(); await bind(f); await confirmed(f);
  const read = recovery(); await f.coordinator.observeForAbandon(requestId, read.response, read.binding);
  let release, waiting = false;
  f.readHook(async key => { if (key === indexKey && !waiting) { waiting = true; await new Promise(resolve => { release = resolve; }); } });
  const mutable = { requestId: uuid(172), sessionId: A.sessionGeneration, originalRequestId: requestId, intentId: allocation.intentId };
  const pending = f.coordinator.prepareAbandon(mutable); while (!release) await tick();
  mutable.requestId = uuid(173); mutable.sessionId = uuid(174); mutable.intentId = `scv1_intent_${uuid(175)}`; release();
  const ticket = await pending;
  assert.equal(ticket.attempt.requestId, uuid(172)); assert.equal(ticket.attempt.sessionGeneration, A.sessionGeneration);
  assert.equal(ticket.attempt.payload.intentId, allocation.intentId);
});

test("stored index quote/session corruption cannot adopt a different valid core record", async () => {
  for (const field of ["quote", "sessionId"]) {
    const f = fixture(); await bind(f); await confirmed(f); const saved = JSON.parse(f.data.get(indexKey));
    if (field === "quote") saved.entries[0].quote.amountMinor++; else saved.entries[0].sessionId = uuid(171);
    f.data.set(indexKey, JSON.stringify(saved)); await assert.rejects(f.coordinator.list(), blocked);
  }
});

if (process.env.ISOLATED_TEST_STORE_V2_FIXTURE) test("actual PostgreSQL core and v2 two-cycle captures traverse durable preparation, receipt and continuation journals", async () => {
  const capture = JSON.parse(fs.readFileSync(process.env.ISOLATED_TEST_STORE_V2_FIXTURE, "utf8"));
  assert.equal(capture.protocol, "isolated-test-store-v2"); assert.ok(capture.checkoutCases?.length >= 2);
  const binding = capture.cases.find(e => e.command === "bind" && e.response.result.status === "customer_bound"); assert.ok(binding);
  const savedCustomer = binding.response.result.customer, actor = binding.actor;
  const data = new Map(), storage = { async getItem(key) { return data.get(key) ?? null; }, async setItem(key, value) { data.set(key, value); } };
  const commerce = load("_lib/isolatedSandboxCommerce.ts", { "./accountBoundSupabaseMutation": {}, "./accountBoundSupabaseRpc.mjs": {}, "./supabase": {}, "react-native": { Platform: { OS: "ios" } }, "./accountSessionAuthority": {} });
  const core = load("_lib/isolatedSandboxTipCheckoutAttempts.ts", { "@react-native-async-storage/async-storage": { default: storage }, "./isolatedSandboxCommerce": commerce });
  const provider = load("_lib/isolatedTestStoreV2Attempts.ts", { "@react-native-async-storage/async-storage": { default: storage }, "./isolatedTestStoreContract": v1, "./isolatedTestStoreV2Contract": contract });
  const coordinatorModule = load("_lib/isolatedTestStoreV2Preparations.ts", { "@react-native-async-storage/async-storage": { default: storage }, "./isolatedSandboxTipCheckoutAttempts": core,
    "./isolatedTestStoreContract": v1, "./isolatedTestStoreV2Contract": contract, "./isolatedTestStoreV2Attempts": provider });
  const scope = { userId: actor.userId, installationId: savedCustomer.installationId, configurationDigest: binding.configurationDigest, storage };
  let clock = Date.now(), nativeCallbacks = 0;
  const journal = provider.createIsolatedTestStoreV2AttemptJournal({ ...scope, now: () => clock });
  const coordinator = coordinatorModule.createIsolatedTestStoreV2Preparations(scope);
  const apply = async (ticket, actual) => ticket.execute(async request => {
    assert.equal(request.command, actual.command); assert.equal(request.requestId, actual.requestId);
    assert.equal(request.expectedSessionId, actual.actor.sessionId); assert.deepEqual(clone(request.payload), actual.payload);
    return actual.response;
  });
  await apply(await journal.prepareBinding({ requestId: binding.requestId, sessionId: actor.sessionId }), binding);
  const actualAllocations = capture.cases.filter(e => e.command === "allocate" && e.response.result.allocation?.customerBindingId === savedCustomer.id);
  assert.ok(actualAllocations.length >= 2);
  for (const allocateCapture of actualAllocations.slice(0, 2)) {
    const intentId = allocateCapture.payload.intentId, entries = capture.cases.filter(e => e.payload.intentId === intentId);
    const preparation = capture.checkoutCases.find(e => e.response.data.intent.id === intentId); assert.ok(preparation);
    const ready = entries.find(e => e.command === "read" && e.response.result.status === "offering_ready");
    const claim = entries.find(e => e.command === "claim" && e.response.result.dispatchAllowed === true);
    const reported = entries.find(e => e.command === "report"), verified = entries.find(e => e.command === "read" && e.response.result.status === "verified");
    const advanced = entries.find(e => e.command === "advance" && e.response.result.status === "released");
    assert.ok(ready && claim && reported && verified && advanced);
    clock = Date.parse(claim.response.result.authorityValidUntil) - 1_000;
    assert.equal(preparation.actor.userId, actor.userId); assert.equal(preparation.actor.sessionGeneration, actor.sessionId);
    assert.deepEqual(preparation.quote, allocateCapture.payload.expectedQuote);
    const coreTicket = await coordinator.prepareNew({ requestId: preparation.requestId, sessionId: actor.sessionId, quote: preparation.quote });
    await coreTicket.dispatch(async () => preparation.response);
    assert.equal((await coordinator.list()).find(e => e.requestId === preparation.requestId).attempt.state, "unknown");
    const confirmed = await coordinator.reconcile(preparation.requestId, preparation.recovery.response,
      { requestId: preparation.recovery.requestId, sessionGeneration: actor.sessionId });
    assert.equal(confirmed.state, "intent_prepared"); assert.deepEqual(clone(confirmed.quote), preparation.quote);
    await apply(await journal.prepareAllocation({ requestId: allocateCapture.requestId, sessionId: actor.sessionId, intentId, quote: confirmed.quote }), allocateCapture);
    await journal.reconcile({ requestId: ready.requestId, sessionId: actor.sessionId, payload: ready.payload }, ready.response);
    const allocation = ready.response.result.allocation;
    const claimTicket = await journal.prepareClaim({ requestId: claim.requestId, sessionId: actor.sessionId, allocationId: allocation.id });
    const permission = await apply(claimTicket, claim); assert.equal(typeof permission.purchase, "function");
    // This models only native completion; every economic response above/below
    // is a captured SQL envelope. No provider or installed-device proof follows.
    const completed = { protocol: "isolated-test-store-native-v2", invocationId: allocation.dispatchId,
      customerBindingId: savedCustomer.id, installationId: savedCustomer.installationId, buyerId: actor.userId,
      configurationDigest: binding.configurationDigest, providerAppUserId: savedCustomer.providerAppUserId,
      allocationId: allocation.id, registrationId: allocation.registration.id, sessionId: actor.sessionId,
      state: "completed", outcome: reported.payload.outcome, transactionHint: reported.payload.transactionHint, completedAt: new Date(clock).toISOString() };
    await permission.purchase(async (customerValue, allocationValue) => {
      nativeCallbacks++; assert.equal(customerValue.providerAppUserId, savedCustomer.providerAppUserId); assert.deepEqual(clone(allocationValue), allocation);
      assert.equal((await journal.list()).find(a => a.intentId === intentId).nativePhase, "invoking"); return completed;
    });
    await apply(await journal.prepareReport({ requestId: reported.requestId, sessionId: actor.sessionId, allocationId: allocation.id }), reported);
    assert.equal((await journal.list()).find(a => a.intentId === intentId).observation.receipt, null);
    await journal.reconcile({ requestId: verified.requestId, sessionId: actor.sessionId, payload: verified.payload }, verified.response);
    assert.equal((await journal.list()).find(a => a.intentId === intentId).observation.receipt.state, "verified");
    clock = Date.parse(claim.response.result.authorityValidUntil) + 1;
    await apply(await journal.prepareAdvance({ requestId: advanced.requestId, sessionId: actor.sessionId, allocationId: allocation.id,
      expectedReservationRevision: advanced.payload.expectedReservationRevision, acknowledgeUnknownOutcome: false }, async () => completed), advanced);
    assert.equal((await journal.list()).find(a => a.intentId === intentId).initiationReleased, true);
    await assert.rejects(claimTicket.execute(async () => { assert.fail("old claim repeated"); }), e => e.code === "capability_consumed");
  }
  const restarted = provider.createIsolatedTestStoreV2AttemptJournal({ ...scope, now: () => clock });
  const retained = await restarted.list(); assert.equal(retained.length, 2); assert.equal(nativeCallbacks, 2);
  assert.equal(new Set(retained.map(a => a.allocation.registration.offeringIdentifier)).size, 2);
  assert.equal(new Set(retained.map(a => a.intentId)).size, 2); assert.ok(retained.every(a => a.initiationReleased && a.observation.receipt.state === "verified"));
  assert.equal((await restarted.readOwner()).customer.providerAppUserId, savedCustomer.providerAppUserId);
  assert.equal((await coordinatorModule.createIsolatedTestStoreV2Preparations(scope).list()).length, 2);
});
