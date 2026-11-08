import assert from "node:assert/strict";
import test from "node:test";
import { A, B, uuid, digest, quote, customer, allocation, clone, load, v1, contract, envelope } from "./helpers/isolated-test-store-v3-fixtures.mjs";

const indexKey = "@chillywood/isolated-test-store-v3/core-preparation-index";
const coreKey = user => `@chillywood/isolated-paid-video-checkout:v3:${user}:${digest}`;
const prefixed = request => `@chillywood/isolated-test-store-v3/core:${customer.installationId}:${digest}:${request}:${coreKey(A.userId)}`;
const epoch = Date.parse("2026-11-07T12:00:00Z"), requestId = uuid(100);
const input = (id = requestId, sessionId = A.sessionGeneration) => ({ requestId: id, sessionId, quote: clone(quote) });
function fixture() {
  const data = new Map(), writes = []; let writeHook = null, readHook = null, time = epoch;
  const storage = { async getItem(key) { await readHook?.(key); return data.get(key) ?? null; }, async setItem(key, value) {
    writes.push({ key, value }); await writeHook?.(key, value); data.set(key, value);
  } };
  const commerce = load("_lib/isolatedPaidVideoCheckoutV3.ts", { "react-native-get-random-values":{}, "./accountBoundSupabaseMutation": {}, "./supabase": {}, "react-native": { Platform: { OS: "ios" } }, "./accountSessionAuthority": {}, "./isolatedTestStoreContract":v1,"./isolatedTestStoreV3Contract":contract });
  const core = load("_lib/isolatedPaidVideoCheckoutV3Attempts.ts", { "@react-native-async-storage/async-storage": { default: storage }, "./isolatedPaidVideoCheckoutV3": commerce,"./isolatedTestStoreContract":v1,"./isolatedTestStoreV3Contract":contract });
  const closures = load("_lib/isolatedTestStoreV3PreparedClosures.ts", { "@react-native-async-storage/async-storage": { default: storage }, "./isolatedPaidVideoCheckoutV3": commerce, "./isolatedTestStoreContract": v1, "./isolatedTestStoreV3Contract": contract });
  const provider = load("_lib/isolatedTestStoreV3Attempts.ts", { "@react-native-async-storage/async-storage": { default: storage }, "./isolatedTestStoreContract": v1, "./isolatedTestStoreV3Contract": contract, "./isolatedTestStoreV3PreparedClosures": closures, "./isolatedPaidVideoCheckoutV3Attempts": core });
  const coordinator = load("_lib/isolatedTestStoreV3Preparations.ts", { "@react-native-async-storage/async-storage": { default: storage },
    "./isolatedPaidVideoCheckoutV3Attempts": core, "./isolatedTestStoreContract": v1, "./isolatedTestStoreV3Contract": contract, "./isolatedTestStoreV3Attempts": provider });
  const options = { userId: A.userId, configurationDigest: digest, installationId: customer.installationId, storage, now:()=>time };
  const create = (extra = {}) => coordinator.createIsolatedTestStoreV3Preparations({ ...options, ...extra });
  const journal = provider.createIsolatedTestStoreV3AttemptJournal({ ...options, now: () => time });
  return { data, writes, storage, commerce, core, provider, create, coordinator: create(), journal,
    writeHook(fn) { writeHook = fn; }, readHook(fn) { readHook = fn; }, time(v) { time = v; } };
}
function coreEnvelope(command,id,data,session=A.sessionGeneration,status="ok") {
  return {protocol:"isolated-paid-video-checkout-v3",command,requestId:id,actor:{userId:A.userId,sessionId:session},status,data,providerDispatchAllowed:false,grantsAccess:false,financialAuthority:false,notPayable:true};
}
function history(i=input(),{intentId=allocation.intentId,changes={}}={}) { return {id:intentId,quote:clone(i.quote),state:"prepared",createdAt:"2026-11-07T11:00:00Z",expiresAt:"2030-01-01T00:00:00Z",receipt:null,grantId:null,dispatchAllowed:false,accessRequiresCurrentAuthorization:true,notPayable:true,...changes}; }
function prepared(i=input(),intentId=allocation.intentId) { return coreEnvelope("prepare",i.requestId,{intent:history(i,{intentId}),replayed:false},i.sessionId); }
function recovery(i=input(),options={}) { const current=options.current??A.sessionGeneration,id=options.readId??uuid(101),found=options.found??true;
 return {binding:{requestId:id,sessionGeneration:current},response:coreEnvelope("recover",id,found?{originalRequestId:i.requestId,originalSessionId:i.sessionId,originalPayload:{offerId:i.quote.offerId,expectedQuote:clone(i.quote)},intent:history(i,options)}:{originalRequestId:i.requestId,intent:null},current,found?"ok":"unknown")};
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
  return { protocol: "isolated-test-store-native-v3", invocationId: allocation.dispatchId, customerBindingId: customer.id, installationId: customer.installationId,
    buyerId: A.userId, configurationDigest: digest, providerAppUserId: customer.providerAppUserId, allocationId: allocation.id,
    registrationId: allocation.registration.id, sessionId: A.sessionGeneration, quote, state: "completed", outcome: "sdk_success", transactionHint: null,
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
const blocked = e => e.message === "isolated_test_store_v3_preparation_unavailable";
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
  const mismatch = recovery(input(), { current: uuid(130), changes: { quote:{...quote,amountMinor:200} } });
  await assert.rejects(f.coordinator.reconcile(requestId, mismatch.response, mismatch.binding));
  assert.equal((await f.coordinator.list())[0].attempt.state, "unknown");
  const valid = recovery(input(), { current: uuid(130) }); await f.coordinator.reconcile(requestId, valid.response, valid.binding);
  const a = (await f.create().list())[0].attempt; assert.equal(a.state, "intent_prepared"); assert.equal(a.sessionGeneration, A.sessionGeneration);
  assert.equal(a.observedSessionGeneration, uuid(130));
  const wrong = recovery(); wrong.response.data.originalSessionId = uuid(131);
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
  await ticket.dispatch(async () => { sends++; throw new Error("lost"); });
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
  await ticket.dispatch(async () => { throw new f.commerce.PaidVideoCheckoutV3Error("authority_retired", requestId, "not_sent"); });
  assert.equal((await f.coordinator.list())[0].attempt.state, "not_applied");
  assert.equal((await f.coordinator.prepareNew(input(uuid(160)))).mayDispatch, true);
});

test("concurrent coordinator instances serialize the index and cannot create two initial core intents", async () => {
  const f = fixture(); await bind(f);
  const outcomes = await Promise.allSettled([f.coordinator.prepareNew(input()), f.create().prepareNew(input(uuid(170)))]);
  assert.equal(outcomes.filter(o => o.status === "fulfilled").length, 1); assert.equal((await f.coordinator.list()).length, 1);
});

test("stored index quote/session corruption cannot adopt a different valid core record", async () => {
  for (const field of ["quote", "sessionId"]) {
    const f = fixture(); await bind(f); await confirmed(f); const saved = JSON.parse(f.data.get(indexKey));
    if (field === "quote") saved.entries[0].quote.amountMinor++; else saved.entries[0].sessionId = uuid(171);
    f.data.set(indexKey, JSON.stringify(saved)); await assert.rejects(f.coordinator.list(), blocked);
  }
});
