import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import test from "node:test";
import ts from "typescript";
import { capturedPurchaseChain } from "./helpers/isolated-test-store-v3-fixtures.mjs";

const uuid = n => `b0000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const userId = uuid(1), sessionId = uuid(2), installationId = uuid(3), configurationDigest = "a".repeat(64);
const epoch = Date.parse("2026-11-07T12:00:00Z"), clone = v => JSON.parse(JSON.stringify(v));
const quote = { offerId: `scv1_offer_${uuid(4)}`, offerRevision: 2, resourceId: `scv1_resource_${uuid(5)}`, resourceRevision: 3,
  creatorId: uuid(6), kind: "paid_content", amountMinor: 199, currency: "usd", asset:{id:`scv1_asset_${uuid(200)}`,incarnation:uuid(201),sha256:"c".repeat(64),byteLength:1024,resourceRevision:3,profile:"scpv-mp4-h264-aac-v1"} };
const customer = { id: `scv3_customer_${uuid(7)}`, buyerId: userId, installationId, configurationDigest,
  providerAppUserId: `scv3_teststore_${uuid(8)}`, projectId: "fixture-project", appId: "fixture-app", providerScopeKey:JSON.stringify(["revenuecat","fixture-project","fixture-app","TEST_STORE","SANDBOX"]),
  economicApplicationId:"rc_test_store:fixture-project:fixture-app", provider: "revenuecat", store: "TEST_STORE", sourceEnvironment: "SANDBOX" };
function allocation(n = 0) {
  return { id: `scv3_allocation_${uuid(10 + n)}`, intentId: `scv1_intent_${uuid(11 + n)}`, dispatchId: uuid(12 + n), customerBindingId: customer.id,
    configurationDigest, productId: "fixture-tip", quote: clone(quote), acceptPurchaseUntil: new Date(epoch + 60_000).toISOString(),
    registration: { id: `scv3_registration_${uuid(13 + n)}`, providerOfferingId: `offering-${n}`, offeringIdentifier: `intent-${n}`,
      providerPackageId: `package-${n}`, packageIdentifier: `tip-${n}`, providerProductId: "provider-product", productId: "fixture-tip" } };
}
const first = allocation(), requestId = uuid(30), bindId = uuid(31), claimId = uuid(32), reportId = uuid(33), advanceId = uuid(34);
const receipt = state => ({ id: `scv1_receipt_${uuid(35)}`, state, providerTransactionId: "fixture-transaction", originalTransactionId: "fixture-original", purchasedAt: new Date(epoch).toISOString() });
function response(command, id, overrides = {}, sid = sessionId) {
  return { protocol: "isolated-test-store-v3", command, requestId: id, actor: { userId, sessionId: sid }, generation: 1, environment: "sandbox",
    result: { status: command === "bind" ? "customer_bound" : command === "allocate" ? "offering_ready" : command === "claim" ? "dispatch_claimed" : command === "advance" ? "released" : "pending",
      reason: "fixture", dispatchAllowed: command === "claim", retryProviderMutation: false, grantsAccess: false, notPayable: true,
      customer: clone(customer), allocation: command === "bind" ? null : clone(first),
      reservation: { revision: command === "bind" ? 1 : command === "advance" ? 3 : 2, activeAllocationId: ["bind", "advance"].includes(command) ? null : first.id },
      authorityValidUntil: command === "claim" ? new Date(epoch + 4_000).toISOString() : null, receipt: null, ...clone(overrides) } };
}
function native(x = first, overrides = {}) {
  return { protocol: "isolated-test-store-native-v3", invocationId: x.dispatchId, customerBindingId: customer.id, installationId,
    buyerId: userId, configurationDigest, providerAppUserId: customer.providerAppUserId, allocationId: x.id, registrationId: x.registration.id,
    sessionId, quote:x.quote, state: "completed", outcome: "sdk_success", transactionHint: "fixture-transaction", completedAt: new Date(epoch + 1_000).toISOString(), ...overrides };
}
function load(path, bindings) {
  const scope = { exports: {}, require(name) { assert.ok(name in bindings, name); return bindings[name]; } };
  vm.runInNewContext(ts.transpileModule(fs.readFileSync(new URL(path, import.meta.url), "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText, scope); return scope.exports;
}
const v1 = load("../_lib/isolatedTestStoreContract.ts", {});
const contract = load("../_lib/isolatedTestStoreV3Contract.ts", { "./isolatedTestStoreContract": v1 });
const core = load("../_lib/isolatedPaidVideoCheckoutV3.ts", { "react-native": {}, "react-native-get-random-values": {}, "./accountBoundSupabaseMutation": {}, "./accountSessionAuthority": {}, "./supabase": {}, "./isolatedTestStoreContract": v1, "./isolatedTestStoreV3Contract": contract });
const closures = load("../_lib/isolatedTestStoreV3PreparedClosures.ts", { "@react-native-async-storage/async-storage": { default: {} }, "./isolatedPaidVideoCheckoutV3": core, "./isolatedTestStoreContract": v1, "./isolatedTestStoreV3Contract": contract });
const coreJournal = load("../_lib/isolatedPaidVideoCheckoutV3Attempts.ts", { "@react-native-async-storage/async-storage": { default: {} }, "./isolatedPaidVideoCheckoutV3": core, "./isolatedTestStoreContract": v1, "./isolatedTestStoreV3Contract": contract });
function module() {
  return load("../_lib/isolatedTestStoreV3Attempts.ts", { "@react-native-async-storage/async-storage": { default: {} },
    "./isolatedTestStoreContract": v1, "./isolatedTestStoreV3Contract": contract, "./isolatedTestStoreV3PreparedClosures": closures, "./isolatedPaidVideoCheckoutV3Attempts": coreJournal });
}
function fixture() {
  const loaded = module(), data = new Map(), writes = []; let hook = null, time = epoch;
  const storage = { async getItem(key) { return data.get(key) ?? null; }, async setItem(key, value) {
    writes.push({ key, value }); await hook?.(key, value); data.set(key, value);
  } };
  const create = (extra = {}) => loaded.createIsolatedTestStoreV3AttemptJournal({ userId, installationId, configurationDigest, storage, now: () => time, ...extra });
  const f = { loaded, data, storage, writes, create, journal: create(), hook(v) { hook = v; }, time(v) { time = v; },
    raw() { return JSON.parse(data.get(loaded.ISOLATED_TEST_STORE_V3_JOURNAL_KEY)); },
    mutate(fn) { const d = f.raw(); fn(d); data.set(loaded.ISOLATED_TEST_STORE_V3_JOURNAL_KEY, JSON.stringify(d)); } };
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
test("a native prepared tombstone revokes a claim ticket before send without corrupting retained history",async()=>{
  const f=fixture();await allocated(f);const prepared=native(first,{state:"prepared",outcome:null,transactionHint:null,completedAt:null});
  await f.journal.reconcileNative(first.id,async()=>prepared);
  const ticket=await f.journal.prepareClaim({requestId:claimId,sessionId,allocationId:first.id});
  const closure={protocol:"isolated-test-store-native-prepared-closure-v3",state:"prepared_closed",invocation:prepared,closedAt:new Date(epoch+1000).toISOString()};
  await f.journal.reconcileNative(first.id,async()=>closure);let sends=0;
  await assert.rejects(ticket.execute(async()=>{sends++;return response("claim",claimId);}),err("phase_unavailable"));
  assert.equal(sends,0);assert.equal((await f.create().list())[0].nativePhase,"prepared_closed");
  await assert.rejects(f.journal.prepareClaim({requestId:uuid(901),sessionId,allocationId:first.id}),err("phase_unavailable"));
});
test("native closure while a claim response is pending retains the claim but never creates purchase permission",async()=>{
  const f=fixture();await allocated(f);const prepared=native(first,{state:"prepared",outcome:null,transactionHint:null,completedAt:null});
  await f.journal.reconcileNative(first.id,async()=>prepared);const ticket=await f.journal.prepareClaim({requestId:claimId,sessionId,allocationId:first.id});
  let finish;const pending=ticket.execute(async()=>new Promise(resolve=>{finish=resolve;}));while(!finish)await tick();
  const closure={protocol:"isolated-test-store-native-prepared-closure-v3",state:"prepared_closed",invocation:prepared,closedAt:new Date(epoch+1000).toISOString()};
  await f.journal.reconcileNative(first.id,async()=>closure);finish(response("claim",claimId));const result=await pending;
  assert.equal(result.purchase,null);const saved=(await f.create().list())[0];assert.equal(saved.nativePhase,"prepared_closed");assert.equal(saved.initiationReleased,false);
  assert.equal(saved.operations.find(o=>o.command==="claim").state,"observed");assert.deepEqual(clone(saved.nativePreparedClosure),closure);
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
  const reopened = module().createIsolatedTestStoreV3AttemptJournal({ userId, installationId, configurationDigest, storage: f.storage, now: () => epoch });
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

function closedPreparation() {
  return { command:"prepare", requestId:uuid(700), userId, sessionGeneration:sessionId, configurationDigest, quote:clone(quote), state:"closed",
    intentId:first.intentId, intent:{id:first.intentId,state:"expired",quote:clone(quote),createdAt:new Date(epoch).toISOString(),expiresAt:new Date(epoch+60_000).toISOString(),receipt:null,grantId:null,dispatchAllowed:false,accessRequiresCurrentAuthorization:true,notPayable:true},
    observedSessionGeneration:sessionId, closure:{id:uuid(701),originalRequestId:uuid(700),originalSessionId:sessionId,configurationDigest,closedAt:new Date(epoch+1000).toISOString(),kind:"unallocated_preparation",allocationAbsent:true,dispatchAbsent:true},
    closureAttempts:[{requestId:uuid(702),sessionGeneration:sessionId,state:"recorded"}] };
}
test("only bound server unallocated closure releases refused/unknown allocation, retaining history after restart",async()=>{
  for(const lost of [false,true]) {
    const f=fixture();await bound(f);const ticket=await f.journal.prepareAllocation({requestId,sessionId,intentId:first.intentId,quote});
    if(lost)await assert.rejects(ticket.execute(async()=>{throw Error("lost");}),err("outcome_unknown"));
    else await ticket.execute(async()=>response("allocate",requestId,{status:"unavailable",reason:"allocation_missing",allocation:null,reservation:{revision:1,activeAllocationId:null}}));
    await f.journal.reconcile({requestId:uuid(703),sessionId,payload:{intentId:first.intentId}},response("read",uuid(703),{status:"unavailable",reason:"allocation_missing",allocation:null,reservation:{revision:1,activeAllocationId:null}}));
    assert.equal((await f.journal.list())[0].initiationReleased,false);
    await assert.rejects(f.journal.prepareAllocation({requestId:uuid(704),sessionId,intentId:allocation(100).intentId,quote}),err("phase_unavailable"));
    await f.journal.recordUnallocatedRelease(closedPreparation());
    assert.equal((await f.create().list())[0].initiationReleased,true);
    assert.equal((await f.create().list())[0].allocation,null);
    assert.equal((await f.create().prepareAllocation({requestId:uuid(704),sessionId,intentId:allocation(100).intentId,quote})).mayExecute,true);
    assert.equal((await f.create().list()).length,2);
    await assert.rejects(f.journal.prepareAllocation({requestId:uuid(705),sessionId,intentId:first.intentId,quote}),err("request_conflict"));
  }
});
test("unallocated closure fences unsent allocation ticket and rejects a contradictory delayed allocation response",async()=>{
  const f=fixture();await bound(f);const ticket=await f.journal.prepareAllocation({requestId,sessionId,intentId:first.intentId,quote});
  await f.journal.recordUnallocatedRelease(closedPreparation());let calls=0;
  await assert.rejects(ticket.execute(async()=>{calls++;return response("allocate",requestId);}),err("phase_unavailable"));assert.equal(calls,0);
  const g=fixture();await bound(g);const pendingTicket=await g.journal.prepareAllocation({requestId,sessionId,intentId:first.intentId,quote});let finish;
  const pending=pendingTicket.execute(async()=>new Promise(resolve=>{finish=resolve;}));while(!finish)await tick();
  await g.journal.recordUnallocatedRelease(closedPreparation());finish(response("allocate",requestId));await assert.rejects(pending,err("invalid_response"));
  assert.equal((await g.create().list())[0].allocation,null);assert.equal((await g.create().list())[0].initiationReleased,true);
});
test("unallocated release rejects altered binding, absent proof, allocated or native history",async()=>{
  const f=fixture();await bound(f);await f.journal.prepareAllocation({requestId,sessionId,intentId:first.intentId,quote});
  for(const edit of [p=>p.userId=uuid(900),p=>p.configurationDigest="f".repeat(64),p=>p.sessionGeneration=uuid(901),p=>p.intentId=allocation(100).intentId,p=>p.quote.amountMinor++,p=>p.closure=null,p=>p.closure.dispatchAbsent=false,p=>p.closureAttempts[0].state="unknown"]) {
    const proof=closedPreparation();edit(proof);await assert.rejects(f.journal.recordUnallocatedRelease(proof));
  }
  assert.equal((await f.journal.list())[0].initiationReleased,false);
  for(const setup of [allocated,claimed,completed]) {const g=fixture();await setup(g);await assert.rejects(g.journal.recordUnallocatedRelease(closedPreparation()),err("invalid_response"));}
});

test("lost binding permits a fresh explicit bind but never changes installation owner", async () => {
  const f = fixture(), firstBind = await f.journal.prepareBinding({ requestId: bindId, sessionId });
  await assert.rejects(firstBind.execute(async () => { throw new Error("lost"); }), err("outcome_unknown"));
  assert.equal((await f.create().prepareBinding({ requestId: bindId, sessionId })).execute, null);
  await (await f.journal.prepareBinding({ requestId: uuid(53), sessionId })).execute(async () => response("bind", uuid(53)));
  const changed = await f.journal.prepareBinding({ requestId: uuid(54), sessionId });
  await assert.rejects(changed.execute(async () => response("bind", uuid(54), { customer: { ...customer, providerAppUserId: `scv3_teststore_${uuid(55)}` } })), err("invalid_response"));
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
  for (const corrupt of [d => { d.attempts[0].operations[0].response.result.customer.id = `scv3_customer_${uuid(140)}`; },
    d => { d.attempts[0].observation.response.result.allocation.registration.offeringIdentifier = "other"; },
    d => { d.reservation.activeAllocationId = "scv3_allocation_invalid"; }]) {
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

test("native completion cannot substitute a different immutable video incarnation", async () => {
  const f = fixture(), claimedTicket = await claimed(f), wrong = native(); wrong.quote = clone(wrong.quote); wrong.quote.asset.incarnation = uuid(210);
  const saved = await claimedTicket.purchase(async () => wrong); assert.equal(saved.nativePhase, "unknown");
  await assert.rejects(f.journal.prepareAdvance({ requestId: advanceId, sessionId, allocationId: first.id, expectedReservationRevision: 2, acknowledgeUnknownOutcome: true }, async () => wrong), err("native_completion_required"));
});
if (process.env.ISOLATED_TEST_STORE_V3_FIXTURE) test("actual PostgreSQL v3 allocation and claim traverse durable full-asset journal without synthetic receipt authority", async () => {
  const capture = JSON.parse(fs.readFileSync(process.env.ISOLATED_TEST_STORE_V3_FIXTURE, "utf8"));
  const { b, a, r, c } = capturedPurchaseChain(capture.cases);
  assert.throws(() => capturedPurchaseChain([a,r,c]), /complete same-actor/u);
  const mismatched=clone(b);mismatched.configurationDigest="f".repeat(64);
  assert.throws(() => capturedPurchaseChain([mismatched,a,r,c]), /complete same-actor/u);
  const data = new Map(), storage = { async getItem(k) { return data.get(k) ?? null; }, async setItem(k,v) { data.set(k,v); } };
  const j = module().createIsolatedTestStoreV3AttemptJournal({ userId: b.actor.userId, installationId: b.payload.installationId,
    configurationDigest: b.configurationDigest, storage, now: () => Date.parse(c.response.result.authorityValidUntil) - 1000 });
  const apply = (ticket,e) => ticket.execute(async sent => { assert.equal(sent.requestId,e.requestId); assert.deepEqual(clone(sent.payload),e.payload); return e.response; });
  await apply(await j.prepareBinding({ requestId:b.requestId, sessionId:b.actor.sessionId }),b);
  await apply(await j.prepareAllocation({ requestId:a.requestId, sessionId:a.actor.sessionId, intentId:a.payload.intentId, quote:a.payload.expectedQuote }),a);
  await j.reconcile({ requestId:r.requestId, sessionId:r.actor.sessionId, payload:r.payload },r.response);
  const claimed = await apply(await j.prepareClaim({ requestId:c.requestId, sessionId:c.actor.sessionId, allocationId:c.response.result.allocation.id }),c);
  assert.equal(typeof claimed.purchase,"function"); assert.equal((await j.list())[0].observation.receipt,null);
  const reopened = module().createIsolatedTestStoreV3AttemptJournal({ userId:b.actor.userId,installationId:b.payload.installationId,configurationDigest:b.configurationDigest,storage });
  assert.equal((await reopened.prepareClaim({requestId:c.requestId,sessionId:c.actor.sessionId,allocationId:c.response.result.allocation.id})).purchase,undefined);
  assert.deepEqual(clone((await reopened.list())[0].quote.asset),a.payload.expectedQuote.asset);
});
