import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import test from "node:test";
import ts from "typescript";

const uuid = n => `a0000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const userId = uuid(1), sessionId = uuid(2), configurationDigest = "a".repeat(64);
const intentId = `scv1_intent_${uuid(3)}`, requestId = uuid(4), claimId = uuid(5), reportId = uuid(6);
const quote = { offerId: `scv1_offer_${uuid(7)}`, offerRevision: 2, resourceId: `scv1_resource_${uuid(8)}`, resourceRevision: 3, creatorId: uuid(9), kind: "creator_tip", amountMinor: 199, currency: "usd" };
const epoch = Date.parse("2026-11-07T12:00:00Z");
const allocation = { intentId, dispatchId: uuid(10), providerAppUserId: `scv1_teststore_${uuid(11)}`, configurationDigest, projectId: "fixture-project", appId: "fixture-app", productId: "fixture-test-tip", provider: "revenuecat", store: "TEST_STORE", sourceEnvironment: "SANDBOX", providerScopeKey: "fixture-test-store", economicApplicationId: "fixture-economic-app", quote, acceptPurchaseUntil: new Date(epoch + 60_000).toISOString() };
const input = { requestId, sessionId, intentId, quote };
const clone = v => JSON.parse(JSON.stringify(v));
const plain = v => JSON.parse(JSON.stringify(v));
const accountKey = (user = userId, digest = configurationDigest) => `@chillywood/sandbox-commerce-v1/test-store-attempts:${user}:${digest}`;
const receipt = state => ({ id: `scv1_receipt_${uuid(12)}`, state, providerTransactionId: "fixture-transaction", originalTransactionId: "fixture-original", purchasedAt: new Date(epoch).toISOString() });
function response(command, id, overrides = {}, actorSession = sessionId) {
  return { protocol: "isolated-test-store-v1", command, requestId: id, actor: { userId, sessionId: actorSession }, generation: 1, environment: "sandbox", result: { status: command === "allocate" ? "allocated" : command === "claim" ? "dispatch_claimed" : "pending", reason: "fixture", dispatchAllowed: command === "claim", retryProviderMutation: false, grantsAccess: false, notPayable: true, allocation: clone(allocation), authorityValidUntil: command === "claim" ? new Date(epoch + 4_000).toISOString() : null, receipt: null, ...overrides } };
}
function load(path, bindings) {
  const scope = { exports: {}, require(name) { assert.ok(name in bindings, name); return bindings[name]; } };
  const js = ts.transpileModule(fs.readFileSync(new URL(path, import.meta.url), "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  vm.runInNewContext(js, scope); return scope.exports;
}
const contract = load("../_lib/isolatedTestStoreContract.ts", {});
function module() { return load("../_lib/isolatedTestStoreAttempts.ts", { "@react-native-async-storage/async-storage": { default: { getItem() { throw new Error("default storage forbidden in local fixture"); } } }, "./isolatedTestStoreContract": contract }); }
function storage() {
  const data = new Map(); const writes = []; let hook = null;
  return { data, writes, setHook(fn) { hook = fn; }, async getItem(key) { return data.get(key) ?? null; }, async setItem(key, value) { writes.push({ key, value }); if (hook) await hook(key, value); data.set(key, value); } };
}
function fixture() {
  const loaded = module(), store = storage(); let time = epoch;
  const create = (options = {}) => loaded.createIsolatedTestStoreAttemptJournal({ userId, configurationDigest, storage: store, now: () => time, ...options });
  return { loaded, store, create, journal: create(), time(value) { time = value; }, raw() { return JSON.parse(store.data.get(accountKey())).attempt; }, mutate(fn) { const data = JSON.parse(store.data.get(accountKey())); fn(data); store.data.set(accountKey(), JSON.stringify(data)); } };
}
async function allocated(f) { const ticket = await f.journal.prepareAllocation(input); return ticket.allocate(async () => response("allocate", requestId)); }
async function claimed(f, reply = response("claim", claimId)) { const ticket = await allocated(f); return ticket.claim({ requestId: claimId }, async () => reply); }
const err = code => error => error.code === code;
const tick = () => new Promise(resolve => setImmediate(resolve));

test("fresh pipeline durably reserves device before any callback, dispatches once and preserves exact claim", async () => {
  const f = fixture(), calls = []; const initial = await f.journal.prepareAllocation(input);
  assert.equal(initial.mayAllocate, true); assert.equal(f.raw().phase, "allocation_prepared");
  const a = await initial.allocate(async (request, receivedAllocation) => {
    calls.push("allocate"); assert.equal(f.raw().phase, "allocation_unknown"); assert.equal(receivedAllocation, null);
    assert.equal((await f.journal.readGlobalReservation()).reserved, true); assert.deepEqual(plain(request.payload), { intentId, expectedQuote: quote });
    assert.ok(Object.isFrozen(request.payload.expectedQuote)); return response("allocate", requestId);
  });
  const freshClaim = response("claim", claimId);
  const c = await a.claim({ requestId: claimId }, async (request, saved) => {
    calls.push("setup+claim"); assert.equal(f.raw().phase, "claim_unknown"); assert.equal(f.raw().requests[1].requestId, claimId);
    assert.equal((await f.journal.readGlobalReservation()).owner.dispatchId, allocation.dispatchId);
    assert.deepEqual(plain(saved), allocation); assert.deepEqual(plain(request.payload), { intentId, dispatchId: allocation.dispatchId, expectedQuote: quote }); return freshClaim;
  });
  freshClaim.result.authorityValidUntil = new Date(epoch + 60_000).toISOString(); // caller cannot widen captured proof
  const p = await c.purchase(async (saved, capturedClaim) => {
    calls.push("purchase"); assert.equal(f.raw().phase, "sdk_unknown"); assert.deepEqual(plain(saved), allocation);
    assert.equal(capturedClaim.result.authorityValidUntil, new Date(epoch + 4_000).toISOString()); assert.ok(Object.isFrozen(capturedClaim.result));
    return { outcome: "sdk_success", transactionHint: "fixture-transaction" };
  });
  assert.equal(p.attempt.phase, "pending"); assert.equal(p.attempt.observation.receipt, null);
  await p.report({ requestId: reportId }, async request => { calls.push("report"); assert.equal(f.raw().phase, "report_unknown"); assert.equal(request.payload.outcome, "sdk_success"); return response("report", reportId); });
  for (const replay of [() => initial.allocate(async () => {}), () => a.claim({ requestId: uuid(30) }, async () => {}), () => c.purchase(async () => {}), () => p.report({ requestId: uuid(31) }, async () => {})]) await assert.rejects(replay(), err("capability_consumed"));
  assert.deepEqual(calls, ["allocate", "setup+claim", "purchase", "report"]);
  assert.equal((await f.journal.readGlobalReservation()).reserved, true); assert.equal((await f.journal.list()).length, 1);
});

test("global reservation spans accounts and configurations without revealing another account's metadata", async () => {
  const f = fixture(); await f.journal.prepareAllocation(input);
  for (const journal of [f.create({ userId: uuid(20) }), f.create({ configurationDigest: "b".repeat(64) })]) {
    assert.deepEqual(plain(await journal.list()), []);
    assert.deepEqual(plain(await journal.readGlobalReservation()), { reserved: true, ownedByCurrentScope: false, owner: null });
    await assert.rejects(journal.prepareAllocation({ ...input, requestId: uuid(21), sessionId: uuid(22) }), err("reservation_held"));
  }
  const reopened = f.create(); const old = await reopened.prepareAllocation({ ...input, sessionId: uuid(23) });
  assert.equal(old.mayAllocate, false); assert.equal(old.allocate, null); assert.equal(old.attempt.sessionId, sessionId);
});

test("concurrent instances serialize initial device ownership before either backend can run", async () => {
  const f = fixture(); const result = await Promise.allSettled([f.journal.prepareAllocation(input), f.create({ userId: uuid(20) }).prepareAllocation({ ...input, requestId: uuid(21) })]);
  assert.equal(result.filter(r => r.status === "fulfilled").length, 1); assert.equal(result.filter(r => r.status === "rejected" && r.reason.code === "reservation_held").length, 1);
  const repeated = await f.create().prepareAllocation(input); assert.equal(repeated.mayAllocate, false);
});

test("initial write failure or unacknowledged marker never produces a callback capability", async () => {
  for (const mode of ["reject", "committed-reject", "readback-drop", "account-reject"]) {
    const f = fixture(); let reads = 0;
    if (mode === "readback-drop") { const get = f.store.getItem.bind(f.store); f.store.getItem = async key => { const value = await get(key); if (value !== null && ++reads === 1) return null; return value; }; }
    f.store.setHook(async (key, value) => {
      if (mode === "committed-reject") { f.store.data.set(key, value); throw new Error("lost acknowledgement"); }
      if (mode === "reject" || (mode === "account-reject" && key === accountKey())) throw new Error("write rejected");
    });
    await assert.rejects(f.journal.prepareAllocation(input), err("storage_unavailable"));
    if (mode !== "reject") { f.store.setHook(null); await assert.rejects(f.create({ userId: uuid(20) }).prepareAllocation({ ...input, requestId: uuid(21) }), err("reservation_held")); }
  }
});

test("write failure before allocation, native setup, SDK or report always prevents that callback", async () => {
  for (const stage of ["allocate", "claim", "purchase", "report"]) {
    const f = fixture(); let ticket;
    if (stage === "allocate") ticket = await f.journal.prepareAllocation(input);
    if (stage === "claim") ticket = await allocated(f);
    if (stage === "purchase" || stage === "report") ticket = await claimed(f);
    if (stage === "report") ticket = await ticket.purchase(async () => ({ outcome: "sdk_success", transactionHint: null }));
    f.store.setHook(async () => { throw new Error("storage offline"); }); let calls = 0; const callback = async () => { calls++; };
    const run = () => stage === "allocate" ? ticket.allocate(callback) : stage === "claim" ? ticket.claim({ requestId: claimId }, callback) : stage === "purchase" ? ticket.purchase(callback) : ticket.report({ requestId: reportId }, callback);
    await assert.rejects(run(), err("storage_unavailable")); assert.equal(calls, 0); f.store.setHook(null);
    await assert.rejects(run(), err("capability_consumed"));
  }
});

test("allocation and claim lost responses survive reload as unknown with no resumed mutation", async () => {
  for (const stage of ["allocate", "claim"]) {
    const f = fixture(); const ticket = stage === "allocate" ? await f.journal.prepareAllocation(input) : await allocated(f); let calls = 0;
    const callback = async () => { calls++; throw new Error("lost response"); };
    await assert.rejects(stage === "allocate" ? ticket.allocate(callback) : ticket.claim({ requestId: claimId }, callback), err("outcome_unknown"));
    const reloaded = module().createIsolatedTestStoreAttemptJournal({ userId, configurationDigest, storage: f.store, now: () => epoch });
    const restored = await reloaded.prepareAllocation(input); assert.equal(restored.allocate, null); assert.equal(restored.mayAllocate, false);
    assert.equal(restored.attempt.phase, stage === "allocate" ? "allocation_unknown" : "claim_unknown"); assert.equal(calls, 1);
  }
});

test("reload during unresolved SDK promise cannot create a second SDK opportunity", async () => {
  const f = fixture(), c = await claimed(f); let finish, calls = 0;
  const pending = c.purchase(async () => { calls++; return new Promise(resolve => { finish = resolve; }); });
  while (!finish) await tick();
  assert.equal(f.raw().phase, "sdk_unknown"); const restored = await f.create().prepareAllocation(input); assert.equal(restored.allocate, null);
  await assert.rejects(f.create({ userId: uuid(20) }).prepareAllocation({ ...input, requestId: uuid(21) }), err("reservation_held"));
  finish({ outcome: "sdk_cancelled", transactionHint: null }); const next = await pending;
  assert.equal(next.attempt.phase, "pending"); assert.equal(calls, 1); assert.equal((await f.journal.readGlobalReservation()).reserved, true);
});

test("SDK success, failure, cancellation, throw and malformed responses all remain pending without access", async () => {
  for (const outcome of ["sdk_success", "sdk_failed", "sdk_cancelled", "sdk_unknown", "throw", "malformed"]) {
    const f = fixture(), c = await claimed(f);
    const p = await c.purchase(async () => { if (outcome === "throw") throw new Error("SDK transport"); return outcome === "malformed" ? { outcome: "sdk_success", transactionHint: "https://secret.invalid/token" } : { outcome, transactionHint: null }; });
    assert.equal(p.attempt.phase, "pending"); assert.equal(p.attempt.observation.receipt, null);
    assert.equal(p.attempt.sdkObservation.outcome, ["throw", "malformed"].includes(outcome) ? "sdk_unknown" : outcome);
    assert.equal((await f.journal.readGlobalReservation()).reserved, true); assert.equal("grantsAccess" in p.attempt, false);
  }
});

test("report lost response is retained and never retried after reopening", async () => {
  const f = fixture(), c = await claimed(f), p = await c.purchase(async () => ({ outcome: "sdk_success", transactionHint: null }));
  await assert.rejects(p.report({ requestId: reportId }, async () => { throw new Error("response lost"); }), err("outcome_unknown"));
  assert.equal((await f.create().list())[0].phase, "report_unknown"); assert.equal((await f.create().prepareAllocation(input)).allocate, null);
  assert.equal((await f.journal.readGlobalReservation()).reserved, true);
});

test("response actor, configuration, quote and immutable allocation mismatches cannot create capabilities", async () => {
  for (const mutate of [v => { v.actor.userId = uuid(20); }, v => { v.actor.sessionId = uuid(21); }, v => { v.result.allocation.configurationDigest = "b".repeat(64); }, v => { v.result.allocation.quote.amountMinor++; }, v => { v.result.allocation.quote.offerRevision++; }, v => { v.result.allocation.intentId = `scv1_intent_${uuid(30)}`; }, v => { v.result.allocation.provider = "other"; }, v => { v.result.grantsAccess = true; }]) {
    const f = fixture(), initial = await f.journal.prepareAllocation(input), reply = response("allocate", requestId); mutate(reply);
    await assert.rejects(initial.allocate(async () => reply), err("invalid_response")); assert.equal(f.raw().phase, "allocation_unknown");
  }
  for (const key of ["dispatchId", "providerAppUserId", "projectId", "appId", "productId", "providerScopeKey", "economicApplicationId", "acceptPurchaseUntil"]) {
    const f = fixture(), a = await allocated(f), reply = response("claim", claimId);
    reply.result.allocation[key] = key === "dispatchId" ? uuid(40) : key === "providerAppUserId" ? `scv1_teststore_${uuid(40)}` : key === "acceptPurchaseUntil" ? new Date(epoch + 70_000).toISOString() : "other";
    await assert.rejects(a.claim({ requestId: claimId }, async () => reply), err("invalid_response")); assert.equal(f.raw().phase, "claim_unknown");
  }
});

test("expired, widened, invalid clock and read-only claim results never admit SDK dispatch", async () => {
  for (const options of [{ expiry: epoch - 1 }, { expiry: epoch + 5_001 }, { expiry: epoch + 4_000, time: NaN }, { expiry: null }]) {
    const f = fixture(), a = await allocated(f); if ("time" in options) f.time(options.time);
    const reply = response("claim", claimId, options.expiry === null ? { dispatchAllowed: false, authorityValidUntil: null } : { authorityValidUntil: new Date(options.expiry).toISOString() });
    if (Number.isNaN(options.time)) { let calls = 0; await assert.rejects(a.claim({ requestId: claimId }, async () => { calls++; return reply; }), err("authority_expired")); assert.equal(calls, 0); }
    else { const c = await a.claim({ requestId: claimId }, async () => reply); assert.equal(c.purchase, null); }
  }
});

test("lease checked both before and after persistence prevents delayed SDK invocation", async () => {
  for (const stage of ["before", "during"]) {
    const f = fixture(), c = await claimed(f); let calls = 0;
    if (stage === "before") f.time(epoch + 4_000);
    else f.store.setHook(async (_key, raw) => { if (JSON.parse(raw).attempt?.phase === "sdk_unknown") f.time(epoch + 4_000); });
    await assert.rejects(c.purchase(async () => { calls++; return { outcome: "sdk_success", transactionHint: null }; }), err("authority_expired")); assert.equal(calls, 0);
    assert.equal((await f.journal.readGlobalReservation()).reserved, true);
  }
  const f = fixture(), a = await allocated(f); let calls = 0;
  f.store.setHook(async (_key, raw) => { if (JSON.parse(raw).attempt?.phase === "claim_unknown") f.time(epoch + 60_000); });
  await assert.rejects(a.claim({ requestId: claimId }, async () => { calls++; }), err("authority_expired"));
  assert.equal(calls, 0); assert.equal(f.raw().phase, "claim_unknown");
});

test("fresh read after session change reconciles only exact owned intent and never regenerates dispatch", async () => {
  const f = fixture(), c = await claimed(f); const newSession = uuid(22), readId = uuid(23);
  const value = response("read", readId, { status: "verified", receipt: receipt("verified") }, newSession);
  const observed = await f.journal.reconcile({ allocationRequestId: requestId, readRequestId: readId, sessionId: newSession }, value);
  assert.equal(observed.reconciled, true); assert.equal(observed.observation.receipt.state, "verified"); assert.equal(observed.sessionId, sessionId);
  let calls = 0; await assert.rejects(c.purchase(async () => { calls++; }), err("phase_unavailable")); assert.equal(calls, 0);
  assert.equal((await f.journal.readGlobalReservation()).reserved, true); assert.equal((await f.create().prepareAllocation(input)).allocate, null);
  const wrong = response("read", uuid(24), {}, newSession);
  await assert.rejects(f.journal.reconcile({ allocationRequestId: requestId, readRequestId: uuid(24), sessionId }, wrong), err("invalid_response"));
});

test("verified, refunded, revoked and quarantined reads retain receipt without releasing native reservation", async () => {
  const f = fixture(); await allocated(f);
  for (const [index, state] of ["verified", "refunded", "revoked", "quarantined"].entries()) {
    const id = uuid(50 + index), value = response("read", id, { status: state === "quarantined" ? "held" : state, receipt: receipt(state) });
    const saved = await f.journal.reconcile({ allocationRequestId: requestId, readRequestId: id, sessionId }, value);
    assert.equal(saved.observation.receipt.state, state); assert.equal((await f.journal.readGlobalReservation()).reserved, true);
  }
  const absentId = uuid(60); await f.journal.reconcile({ allocationRequestId: requestId, readRequestId: absentId, sessionId }, response("read", absentId, { status: "unavailable", allocation: null }));
  assert.equal((await f.journal.list())[0].observation.status, "held");
  assert.equal((await f.journal.list())[0].observation.receipt.state, "quarantined");
  assert.equal((await f.journal.list())[0].receiptObservation.receipt.state, "quarantined");
  for (const key of ["id", "providerTransactionId", "originalTransactionId", "purchasedAt"]) {
    const id = uuid(61), changed = receipt("verified"); changed[key] = key === "id" ? `scv1_receipt_${uuid(62)}` : key === "purchasedAt" ? new Date(epoch + 1).toISOString() : "other";
    await assert.rejects(f.journal.reconcile({ allocationRequestId: requestId, readRequestId: id, sessionId }, response("read", id, { status: "verified", receipt: changed })), err("invalid_response"));
  }
});

test("read reconciliation while allocation, claim or SDK is pending closes further capability handoff", async () => {
  for (const stage of ["allocate", "claim", "purchase"]) {
    const f = fixture(); let ticket = stage === "allocate" ? await f.journal.prepareAllocation(input) : stage === "claim" ? await allocated(f) : await claimed(f); let finish;
    const callback = async () => new Promise(resolve => { finish = resolve; });
    const pending = stage === "allocate" ? ticket.allocate(callback) : stage === "claim" ? ticket.claim({ requestId: claimId }, callback) : ticket.purchase(callback);
    while (!finish) await tick(); const id = uuid(70);
    await f.journal.reconcile({ allocationRequestId: requestId, readRequestId: id, sessionId }, response("read", id));
    finish(stage === "purchase" ? { outcome: "sdk_success", transactionHint: null } : response(stage, stage === "allocate" ? requestId : claimId));
    const returned = await pending; assert.equal(returned[stage === "allocate" ? "claim" : stage === "claim" ? "purchase" : "report"], null);
    assert.equal(returned.attempt.reconciled, true); assert.equal(returned.attempt.phase, "blocked");
  }
});

test("storage corruption, wrong owner, impossible lifecycle and secret-bearing fields fail closed", async () => {
  for (const mutate of [v => { v.userId = uuid(20); }, v => { v.attempt.userId = uuid(20); }, v => { v.attempt.requests[0].payload.accessToken = "forbidden"; }, v => { v.attempt.phase = "pending"; }, v => { v.attempt.configurationDigest = "b".repeat(64); }, v => { v.attempt.reconciled = true; }, v => { v.attempt.quote.amountMinor = "199"; }]) {
    const f = fixture(); await f.journal.prepareAllocation(input); f.mutate(mutate); await assert.rejects(f.journal.list(), err("storage_corrupt"));
  }
  for (const value of ["not-json", JSON.stringify({ version: 1, userId, token: "forbidden" })]) {
    const f = fixture(); f.store.data.set(f.loaded.ISOLATED_TEST_STORE_RESERVATION_KEY, value);
    await assert.rejects(f.journal.prepareAllocation(input), err("storage_corrupt")); await assert.rejects(f.journal.readGlobalReservation(), err("storage_corrupt"));
  }
});

test("saved report payload must agree with saved SDK observation and body reuse is rejected", async () => {
  const f = fixture(), c = await claimed(f), p = await c.purchase(async () => ({ outcome: "sdk_cancelled", transactionHint: null }));
  await p.report({ requestId: reportId }, async () => response("report", reportId));
  f.mutate(v => { v.attempt.requests[2].payload.outcome = "sdk_success"; }); await assert.rejects(f.journal.list(), err("storage_corrupt"));
  const other = fixture(); await other.journal.prepareAllocation(input);
  await assert.rejects(other.journal.prepareAllocation({ ...input, quote: { ...quote, amountMinor: 299 } }), err("request_conflict"));
  await assert.rejects(other.journal.prepareAllocation({ ...input, requestId: uuid(80) }), err("request_conflict"));
});

test("late report completion cannot overwrite the newer retained recovery receipt", async () => {
  const f = fixture(), c = await claimed(f), p = await c.purchase(async () => ({ outcome: "sdk_success", transactionHint: null }));
  let finish; const pending = p.report({ requestId: reportId }, async () => new Promise(resolve => { finish = resolve; }));
  while (!finish) await tick(); const id = uuid(81);
  await f.journal.reconcile({ allocationRequestId: requestId, readRequestId: id, sessionId }, response("read", id, { status: "refunded", receipt: receipt("refunded") }));
  finish(response("report", reportId, { status: "verified", receipt: receipt("verified") }));
  const result = await pending; assert.equal(result.observation.status, "refunded"); assert.equal(result.observation.command, "read");
  assert.equal((await f.journal.readGlobalReservation()).reserved, true);
});

test("journal inputs exclude self-tips, legacy IDs, coercions and unexpected fields before storage", async () => {
  for (const changed of [{ ...input, intentId: uuid(3) }, { ...input, sessionId: "session" }, { ...input, quote: { ...quote, creatorId: userId } }, { ...input, quote: { ...quote, amountMinor: "199" } }, { ...input, token: "forbidden" }]) {
    const f = fixture(); await assert.rejects(f.journal.prepareAllocation(changed), err("invalid_request")); assert.equal(f.store.writes.length, 0);
  }
});

test("latest null-receipt hold stays visible while historical receipt retains its own provenance", async () => {
  const f = fixture(); await allocated(f); const verifiedId = uuid(90);
  const verified = response("read", verifiedId, { status: "verified", receipt: receipt("verified") });
  await f.journal.reconcile({ allocationRequestId: requestId, readRequestId: verifiedId, sessionId }, verified);
  for (const [index, status] of ["held", "unavailable", "pending"].entries()) {
    const id = uuid(91 + index), value = response("read", id, { status, allocation: status === "pending" ? clone(allocation) : null, receipt: null });
    const saved = await f.journal.reconcile({ allocationRequestId: requestId, readRequestId: id, sessionId }, value);
    assert.equal(saved.observation.status, "held"); assert.equal(saved.observation.requestId, uuid(91)); assert.equal(saved.observation.receipt, null);
    assert.equal(saved.receiptObservation.status, "verified"); assert.equal(saved.receiptObservation.requestId, verifiedId);
    assert.deepEqual(plain(saved.receiptObservation.receipt), verified.result.receipt);
    assert.equal((await f.create().list())[0].observation.status, "held");
    assert.equal((await f.journal.readGlobalReservation()).reserved, true);
  }
  // The retained reference still constrains a future receipt after an absent projection.
  const id = uuid(95), changed = { ...receipt("verified"), id: `scv1_receipt_${uuid(96)}` };
  await assert.rejects(f.journal.reconcile({ allocationRequestId: requestId, readRequestId: id, sessionId }, response("read", id, { status: "verified", receipt: changed })), err("invalid_response"));
});

test("canonical held projections override verified and refunded receipt state without release", async () => {
  for (const state of ["verified", "refunded", "revoked", "quarantined"]) {
    const f = fixture(); await allocated(f); const id = uuid(100);
    const value = response("read", id, { status: "held", receipt: receipt(state) });
    const saved = await f.journal.reconcile({ allocationRequestId: requestId, readRequestId: id, sessionId }, value);
    assert.equal(saved.observation.status, "held"); assert.equal(saved.observation.receipt.state, state);
    assert.equal(saved.receiptObservation.status, "held"); assert.equal((await f.create().list())[0].observation.status, "held");
    assert.equal((await f.journal.readGlobalReservation()).reserved, true);
    assert.equal((await f.create().prepareAllocation(input)).allocate, null);
  }
});

test("delayed verified reads across instances cannot replace an observed held/null projection", async () => {
  const f = fixture(); await allocated(f); const second = f.create();
  const oldId = uuid(110), heldId = uuid(111);
  const old = response("read", oldId, { status: "verified", receipt: receipt("verified") });
  let deliver; const delayedHttp = new Promise(resolve => { deliver = resolve; });
  const oldCompletion = delayedHttp.then(value => f.journal.reconcile({ allocationRequestId: requestId, readRequestId: oldId, sessionId }, value));
  const held = response("read", heldId, { status: "held", allocation: null, receipt: null });
  await second.reconcile({ allocationRequestId: requestId, readRequestId: heldId, sessionId }, held);
  deliver(old); const saved = await oldCompletion;
  assert.equal(saved.observation.status, "held"); assert.equal(saved.observation.requestId, heldId); assert.equal(saved.observation.receipt, null);
  assert.equal(saved.receiptObservation.status, "verified"); assert.equal(saved.receiptObservation.requestId, oldId);
  const reopened = module().createIsolatedTestStoreAttemptJournal({ userId, configurationDigest, storage: f.store });
  assert.equal((await reopened.list())[0].observation.status, "held"); assert.equal((await reopened.prepareAllocation(input)).allocate, null);
  assert.equal((await reopened.readGlobalReservation()).reserved, true);
});

test("refunded revoked and quarantined receipts cannot become verified through reordered reads", async () => {
  for (const state of ["refunded", "revoked", "quarantined"]) {
    const f = fixture(); await allocated(f); const negativeId = uuid(120), oldId = uuid(121);
    const negative = response("read", negativeId, { status: state === "quarantined" ? "held" : state, receipt: receipt(state) });
    await f.create().reconcile({ allocationRequestId: requestId, readRequestId: negativeId, sessionId }, negative);
    const verified = response("read", oldId, { status: "verified", receipt: receipt("verified") });
    const saved = await f.journal.reconcile({ allocationRequestId: requestId, readRequestId: oldId, sessionId }, verified);
    assert.equal(saved.observation.status, negative.result.status); assert.equal(saved.observation.requestId, negativeId);
    assert.equal(saved.receiptObservation.receipt.state, state); assert.equal(saved.receiptObservation.requestId, negativeId);
    assert.equal((await f.create().list())[0].receiptObservation.receipt.state, state);
    // A stronger current hold may still be observed without replacing negative receipt provenance.
    const holdId = uuid(122), hold = response("read", holdId, { status: "held", receipt: receipt("verified") });
    const held = await f.journal.reconcile({ allocationRequestId: requestId, readRequestId: holdId, sessionId }, hold);
    assert.equal(held.observation.status, "held"); assert.equal(held.observation.requestId, holdId);
    assert.equal(held.receiptObservation.receipt.state, state); assert.equal((await f.create().list())[0].observation.status, "held");
    assert.equal((await f.journal.readGlobalReservation()).reserved, true);
  }
});

test("a null projection cannot erase a negative receipt before a late verified response", async () => {
  const f = fixture(); await allocated(f); const refundedId = uuid(130), unavailableId = uuid(131), staleId = uuid(132);
  await f.journal.reconcile({ allocationRequestId: requestId, readRequestId: refundedId, sessionId }, response("read", refundedId, { status: "refunded", receipt: receipt("refunded") }));
  const unavailable = await f.journal.reconcile({ allocationRequestId: requestId, readRequestId: unavailableId, sessionId }, response("read", unavailableId, { status: "unavailable", allocation: null }));
  assert.equal(unavailable.observation.status, "unavailable"); assert.equal(unavailable.receiptObservation.receipt.state, "refunded");
  const saved = await f.create().reconcile({ allocationRequestId: requestId, readRequestId: staleId, sessionId }, response("read", staleId, { status: "verified", receipt: receipt("verified") }));
  assert.equal(saved.observation.status, "unavailable"); assert.equal(saved.observation.requestId, unavailableId);
  assert.equal(saved.receiptObservation.requestId, refundedId);
  f.mutate(v => { v.attempt.observation = { ...v.attempt.receiptObservation, status: "verified", receipt: receipt("verified") }; });
  await assert.rejects(f.journal.list(), err("storage_corrupt"));
});

test("an authoritative late mutation hold is retained even after a verified recovery read", async () => {
  const f = fixture(), c = await claimed(f), p = await c.purchase(async () => ({ outcome: "sdk_success", transactionHint: null }));
  let deliver; const pending = p.report({ requestId: reportId }, async () => new Promise(resolve => { deliver = resolve; }));
  while (!deliver) await tick(); const id = uuid(135);
  await f.journal.reconcile({ allocationRequestId: requestId, readRequestId: id, sessionId }, response("read", id, { status: "verified", receipt: receipt("verified") }));
  deliver(response("report", reportId, { status: "held", allocation: null, receipt: null }));
  const saved = await pending; assert.equal(saved.observation.status, "held"); assert.equal(saved.observation.command, "report");
  assert.equal(saved.receiptObservation.requestId, id); assert.equal((await f.create().list())[0].observation.status, "held");
});

if (process.env.ISOLATED_TEST_STORE_FIXTURE) test("actual PostgreSQL same-attempt command envelopes qualify journal handoff and recovery without provider execution", async () => {
  const captured = JSON.parse(fs.readFileSync(process.env.ISOLATED_TEST_STORE_FIXTURE, "utf8"));
  assert.equal(captured.protocol, "isolated-test-store-v1"); assert.equal(captured.cases.length, 7);
  const [allocate, claim, pendingRead, sdkReport, verifiedRead, historicalClaim, historicalReport] = captured.cases;
  assert.deepEqual(captured.cases.map(c => c.command), ["allocate", "claim", "read", "report", "read", "claim", "report"]);
  const capturedClock = Date.parse(claim.response.result.authorityValidUntil) - 1_000; assert.ok(Number.isFinite(capturedClock));
  const preparation = { requestId: allocate.requestId, sessionId: allocate.actor.sessionId, intentId: allocate.payload.intentId, quote: allocate.payload.expectedQuote };
  const seen = new Set();
  const send = item => async request => {
    assert.equal(request.command, item.command); assert.equal(request.requestId, item.requestId);
    assert.equal(request.expectedSessionId, item.actor.sessionId); assert.equal(request.configurationDigest, item.configurationDigest);
    assert.deepEqual(plain(request.payload), item.payload); seen.add(item.requestId); return item.response;
  };
  async function fresh() {
    const store = storage(), journal = module().createIsolatedTestStoreAttemptJournal({ userId: allocate.actor.userId, configurationDigest: allocate.configurationDigest, storage: store, now: () => capturedClock });
    const initial = await journal.prepareAllocation(preparation), a = await initial.allocate(send(allocate)); return { journal, a };
  }
  const main = await fresh(), c = await main.a.claim({ requestId: claim.requestId }, send(claim));
  const p = await c.purchase(async (_allocation, proof) => {
    assert.deepEqual(plain(proof), claim.response);
    return { outcome: sdkReport.payload.outcome, transactionHint: sdkReport.payload.transactionHint };
  });
  await p.report({ requestId: sdkReport.requestId }, send(sdkReport));
  const verified = await main.journal.reconcile({ allocationRequestId: allocate.requestId, readRequestId: verifiedRead.requestId, sessionId: verifiedRead.actor.sessionId }, verifiedRead.response);
  seen.add(verifiedRead.requestId); assert.equal(verified.observation.status, "verified"); assert.equal((await main.journal.readGlobalReservation()).reserved, true);
  // A recovery read at the captured pre-report point closes an outstanding SDK opportunity.
  const recovered = await fresh(), rc = await recovered.a.claim({ requestId: claim.requestId }, send(claim));
  const pending = await recovered.journal.reconcile({ allocationRequestId: allocate.requestId, readRequestId: pendingRead.requestId, sessionId: pendingRead.actor.sessionId }, pendingRead.response);
  seen.add(pendingRead.requestId); assert.equal(pending.observation.status, "pending");
  await assert.rejects(rc.purchase(async () => { assert.fail("recovery cannot dispatch SDK"); }), err("phase_unavailable"));
  // Historical claim/report captures cannot restore provider authority.
  const historical = await fresh(), hc = await historical.a.claim({ requestId: historicalClaim.requestId }, send(historicalClaim));
  assert.equal(hc.purchase, null); assert.equal(hc.attempt.observation.status, "verified");
  const reportBranch = await fresh(), bc = await reportBranch.a.claim({ requestId: claim.requestId }, send(claim));
  const bp = await bc.purchase(async () => ({ outcome: historicalReport.payload.outcome, transactionHint: historicalReport.payload.transactionHint }));
  const reported = await bp.report({ requestId: historicalReport.requestId }, send(historicalReport));
  assert.equal(reported.observation.status, "verified"); assert.equal((await reportBranch.journal.readGlobalReservation()).reserved, true);
  assert.equal(seen.size, 7);
});
