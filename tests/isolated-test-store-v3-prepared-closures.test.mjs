import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import vm from "node:vm";
import ts from "typescript";

const id = n => `d1000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const clone = value => JSON.parse(JSON.stringify(value));
const scope = { userId: id(1), installationId: id(2), configurationDigest: "a".repeat(64) };
const quote = { offerId: `scv1_offer_${id(3)}`, offerRevision: 1, resourceId: `scv1_resource_${id(4)}`, resourceRevision: 2,
  creatorId: id(5), kind: "paid_content", amountMinor: 199, currency: "usd", asset: { id: `scv1_asset_${id(6)}`, incarnation: id(7),
    sha256: "b".repeat(64), byteLength: 614400, resourceRevision: 2, profile: "scpv-mp4-h264-aac-v1" } };
const payload = { customerBindingId: `scv3_customer_${id(8)}`, intentId: `scv1_intent_${id(9)}`, dispatchId: id(10),
  registrationId: `scv3_registration_${id(11)}`, originalSessionId: id(12), expectedReservationRevision: 3, expectedQuote: quote };
const nativeClosure = { protocol: "isolated-test-store-native-prepared-closure-v3", state: "prepared_closed", closedAt: "2026-11-07T12:00:01Z",
  invocation: { protocol: "isolated-test-store-native-v3", invocationId: payload.dispatchId, customerBindingId: payload.customerBindingId,
    installationId: scope.installationId, buyerId: scope.userId, configurationDigest: scope.configurationDigest, providerAppUserId: `scv3_teststore_${id(13)}`,
    allocationId: `scv3_allocation_${id(14)}`, registrationId: payload.registrationId, sessionId: payload.originalSessionId, quote,
    state: "prepared", outcome: null, transactionHint: null, completedAt: null } };
const input = (requestId = id(20), sessionId = id(21)) => clone({ requestId, sessionId, payload, nativeClosure });
const intent = { id: payload.intentId, state: "expired", quote, createdAt: "2026-11-07T12:00:00Z", expiresAt: "2026-11-07T12:01:00Z",
  receipt: null, grantId: null, dispatchAllowed: false, accessRequiresCurrentAuthorization: true, notPayable: true };
const serverClosure = { id: id(22), kind: "unclaimed_allocation", customerBindingId: payload.customerBindingId,
  allocationId: nativeClosure.invocation.allocationId, dispatchId: payload.dispatchId, registrationId: payload.registrationId,
  originalSessionId: payload.originalSessionId, configurationDigest: scope.configurationDigest, previousReservationRevision: 3,
  releasedReservationRevision: 4, closedAt: "2026-11-07T12:00:02Z", claimAbsent: true };
const envelope = (command, requestId, sessionId, data, status = "ok") => clone({ protocol: "isolated-paid-video-checkout-v3", command, requestId,
  actor: { userId: scope.userId, sessionId }, providerDispatchAllowed: false, grantsAccess: false, financialAuthority: false, notPayable: true, status, data });
const direct = (request = input()) => envelope("close_prepared", request.requestId, request.sessionId, { intent, closure: serverClosure, replayed: false });
const recoveryBinding = () => ({ requestId: id(30), sessionId: id(31) });
const recovered = (request = input(), binding = recoveryBinding()) => envelope("recover_close_prepared", binding.requestId, binding.sessionId,
  { originalRequestId: request.requestId, originalSessionId: request.sessionId, originalPayload: request.payload, intent, closure: serverClosure });
const unknown = (request = input(), binding = recoveryBinding()) => envelope("recover_close_prepared", binding.requestId, binding.sessionId,
  { originalRequestId: request.requestId, intent: null, closure: null }, "unknown");
function memory() { const data = new Map(); return { data, async getItem(key) { return data.get(key) ?? null; }, async setItem(key, value) { data.set(key, value); } }; }
function load(storage = memory()) {
  const cache = new Map(), unavailable = () => { throw Error("No Auth, SDK or network in this journal test"); };
  const imports = { "@react-native-async-storage/async-storage": storage, "react-native-get-random-values": {}, "react-native": { Platform: { OS: "ios" } },
    "./accountBoundSupabaseMutation": { captureAccountBoundSupabaseMutationSubject: unavailable }, "./accountSessionAuthority": {}, "./supabase": {} };
  const module = name => {
    if (cache.has(name)) return cache.get(name);
    const context = { exports: {}, Error, require(key) {
      if (Object.hasOwn(imports, key)) return imports[key];
      assert.ok(key.startsWith("./isolated"), `Unmodeled import ${key}`); return module(key.slice(2));
    } };
    vm.runInNewContext(ts.transpileModule(fs.readFileSync(new URL(`../_lib/${name}.ts`, import.meta.url), "utf8"), {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
    }).outputText, context);
    cache.set(name, context.exports); return context.exports;
  };
  const core = module("isolatedPaidVideoCheckoutV3"), journal = module("isolatedTestStoreV3PreparedClosures");
  return { core, ...journal, storage, journal: journal.createTestStoreV3PreparedClosureJournal({ ...scope, storage }),
    create: options => journal.createTestStoreV3PreparedClosureJournal({ ...scope, storage, ...options }) };
}
const directContext = (request = input()) => ({ command: "close_prepared", requestId: request.requestId,
  actor: { userId: scope.userId, sessionId: request.sessionId }, configurationDigest: scope.configurationDigest, payload: request.payload });
const deferred = () => { let resolve; const promise = new Promise(done => { resolve = done; }); return { promise, resolve }; };

test("server prepared closure requires exact CAS, original identity, asset and explicit claim absence", () => {
  const f = load(); assert.equal(f.core.parsePaidVideoCheckoutV3Result(direct(), directContext()).status, "ok");
  for (const mutate of [v => { v.providerDispatchAllowed = true; }, v => { v.grantsAccess = true; }, v => { v.financialAuthority = true; },
    v => { v.actor.userId = id(80); }, v => { v.actor.sessionId = id(80); }, v => { v.protocol = "isolated-test-store-v3"; },
    v => { v.data.closure.claimAbsent = false; }, v => { delete v.data.closure.claimAbsent; }, v => { v.data.closure.previousReservationRevision++; },
    v => { v.data.closure.releasedReservationRevision++; }, v => { v.data.closure.customerBindingId = `scv3_customer_${id(80)}`; },
    v => { v.data.closure.dispatchId = id(80); }, v => { v.data.closure.registrationId = `scv3_registration_${id(80)}`; },
    v => { v.data.closure.originalSessionId = id(80); }, v => { v.data.closure.configurationDigest = "c".repeat(64); },
    v => { v.data.closure.kind = "unallocated_preparation"; }, v => { v.data.closure.noCharge = true; },
    v => { v.data.intent.state = "provider_pending"; }, v => { v.data.intent.quote.asset.sha256 = "c".repeat(64); },
    v => { v.data.intent.quote.asset.incarnation = id(80); }, v => { v.data.intent.id = `scv1_intent_${id(80)}`; },
    v => { v.data.closure.closedAt = "2026-11-07T11:59:59Z"; }]) {
    const value = direct(); mutate(value); assert.throws(() => f.core.parsePaidVideoCheckoutV3Result(value, directContext()));
  }
  for (const changed of [{ ...payload, expectedReservationRevision: 0 }, { ...payload, expectedReservationRevision: Number.MAX_SAFE_INTEGER }, { ...payload, nativeClosure },
    { ...payload, expectedQuote: { ...quote, asset: { ...quote.asset, byteLength: 0 } } }]) assert.equal(f.core.validPaidVideoCheckoutV3Payload("close_prepared", changed), false);
});

test("native closure alone never becomes a closed server attempt or SDK completion", async () => {
  const f = load(), request = input(), prepared = await f.journal.prepare(request);
  assert.equal(prepared.attempt.state, "prepared"); assert.equal(prepared.attempt.observation, null);
  assert.throws(() => f.parseClosedTestStoreV3PreparedAttempt(prepared.attempt, scope));
  await assert.rejects(f.journal.reconcile(request.requestId, request.nativeClosure));
  assert.equal((await f.journal.list())[0].state, "prepared");
  for (const mutate of [v => { v.nativeClosure.protocol = "isolated-test-store-native-v3"; }, v => { v.nativeClosure.invocation.state = "completed"; },
    v => { v.nativeClosure.invocation.outcome = "sdk_cancelled"; }, v => { v.nativeClosure.invocation.sessionId = id(80); },
    v => { v.nativeClosure.invocation.installationId = id(80); }, v => { v.nativeClosure.invocation.configurationDigest = "d".repeat(64); },
    v => { v.nativeClosure.invocation.buyerId = id(80); }, v => { v.nativeClosure.invocation.registrationId = `scv3_registration_${id(80)}`; },
    v => { v.nativeClosure.invocation.quote.asset.byteLength++; }, v => { v.nativeClosure.noCharge = true; }]) {
    const value = input(id(81)); mutate(value); await assert.rejects(load().journal.prepare(value));
  }
});

test("dispatch is unavailable until exact immutable persistence and readback finish", async () => {
  const storage = memory(), wait = deferred(); let writes = 0, returned = false;
  const set = storage.setItem; storage.setItem = async (...args) => { writes++; await wait.promise; return set(...args); };
  const f = load(storage), request = input(), pending = f.journal.prepare(request).then(value => { returned = true; return value; });
  request.payload.expectedQuote.asset.sha256 = "e".repeat(64);
  await new Promise(done => setImmediate(done)); assert.equal(returned, false); assert.equal(writes, 1); wait.resolve();
  const ticket = await pending; assert.equal(ticket.mayDispatch, true); assert.equal(ticket.attempt.payload.expectedQuote.asset.sha256, quote.asset.sha256);
  assert.ok(Object.isFrozen(ticket.attempt.nativeClosure.invocation.quote.asset));
  let sends = 0; const result = await ticket.dispatch(async exact => { sends++; assert.deepEqual(clone(exact), payload);
    assert.equal(JSON.parse([...storage.data.values()][0]).attempts[0].state, "unknown"); return direct(); });
  assert.equal(result.state, "closed"); assert.equal(sends, 1); await assert.rejects(ticket.dispatch(async () => { sends++; return direct(); }));
  assert.equal(sends, 1); assert.equal(f.parseClosedTestStoreV3PreparedAttempt(result, scope).state, "closed");
});

test("lost response and restart retain unknown without reissuing the old closure request", async () => {
  const storage = memory(), f = load(storage), request = input(), ticket = await f.journal.prepare(request); let sends = 0;
  await assert.rejects(ticket.dispatch(async () => { sends++; throw Error("response lost"); }));
  const restarted = load(storage), prior = await restarted.journal.prepare(request);
  assert.equal(prior.mayDispatch, false); assert.equal(prior.dispatch, null); assert.equal(prior.attempt.state, "unknown");
  const binding = recoveryBinding(); await restarted.journal.reconcile(request.requestId, unknown(request, binding), binding);
  assert.equal((await restarted.journal.list())[0].state, "unknown"); assert.equal(sends, 1);
  assert.throws(() => restarted.parseClosedTestStoreV3PreparedAttempt((storage.data.size && clone(prior.attempt)), scope));
});

test("new explicit same-tuple re-ack uses a new ID and preserves the earlier unknown history", async () => {
  const f = load(), first = input(), ticket = await f.journal.prepare(first); await assert.rejects(ticket.dispatch(async () => { throw Error("lost"); }));
  const second = input(id(40), id(41)), next = await f.journal.prepare(second); assert.equal(next.mayDispatch, true);
  const result = await next.dispatch(async () => direct(second)); assert.equal(result.state, "closed");
  const history = await f.journal.list(); assert.equal(history.length, 2); assert.equal(history[0].state, "unknown");
  assert.equal(history[0].sessionId, first.sessionId); assert.equal(history[1].sessionId, second.sessionId);
  assert.equal(history[1].nativeClosure.invocation.sessionId, first.payload.originalSessionId);
  assert.equal((await f.journal.prepare(input(id(42), id(43)))).mayDispatch, false);
  const changed = input(id(44)); changed.payload.expectedReservationRevision++;
  await assert.rejects(f.journal.prepare(changed));
});

test("fresh-session recovery binds exact original payload and operation session before closing", async () => {
  const f = load(), request = input(); await f.journal.prepare(request); const binding = recoveryBinding();
  for (const mutate of [v => { v.actor.sessionId = request.sessionId; }, v => { v.data.originalSessionId = payload.originalSessionId; },
    v => { v.data.originalPayload.expectedReservationRevision++; v.data.closure.previousReservationRevision++; v.data.closure.releasedReservationRevision++; },
    v => { v.data.originalPayload.originalSessionId = id(80); v.data.closure.originalSessionId = id(80); },
    v => { v.data.originalPayload.expectedQuote.asset.sha256 = "c".repeat(64); v.data.intent.quote.asset.sha256 = "c".repeat(64); },
    v => { v.data.originalRequestId = id(80); }, v => { v.data.closure.allocationId = `scv3_allocation_${id(80)}`; }]) {
    const response = recovered(request, binding); mutate(response); await assert.rejects(f.journal.reconcile(request.requestId, response, binding));
    assert.equal((await f.journal.list())[0].state, "prepared");
  }
  const closed = await f.journal.reconcile(request.requestId, recovered(request, binding), binding);
  assert.equal(closed.sessionId, request.sessionId); assert.equal(closed.observation.sessionId, binding.sessionId);
  assert.equal(f.parseClosedTestStoreV3PreparedAttempt(closed, scope).state, "closed");
});

test("closed proof stays immutable under later missing recovery and rejects a contradictory closure", async () => {
  const f = load(), request = input(); await f.journal.prepare(request); const closed = await f.journal.reconcile(request.requestId, direct(request));
  const binding = recoveryBinding(); assert.deepEqual(clone(await f.journal.reconcile(request.requestId, unknown(request, binding), binding)), clone(closed));
  const conflict = recovered(request, binding); conflict.data.closure.id = id(80);
  await assert.rejects(f.journal.reconcile(request.requestId, conflict, binding));
  assert.deepEqual(clone((await f.journal.list())[0]), clone(closed));
});

test("failed preparation or dispatch persistence poisons runtime writers without invoking transport", async () => {
  for (const target of [1, 2]) for (const mode of ["before", "after", "readback", "drop"]) {
    const backing = memory(); let writes = 0, broken = true, sends = 0;
    const storage = { async getItem(key) { if (broken && writes === target && mode === "readback") throw Error("readback"); return backing.getItem(key); },
      async setItem(key, value) { writes++; if (broken && writes === target && mode === "before") throw Error("save");
        if (!(broken && writes === target && mode === "drop")) await backing.setItem(key, value);
        if (broken && writes === target && mode === "after") throw Error("lost acknowledgement"); } };
    const f = load(storage), request = input();
    if (target === 1) await assert.rejects(f.journal.prepare(request));
    else { const ticket = await f.journal.prepare(request); await assert.rejects(ticket.dispatch(async () => { sends++; return direct(request); })); }
    const retained = [...backing.data.values()][0], count = writes; broken = false;
    await assert.rejects(f.create().prepare(input(id(80)))); assert.equal(writes, count); assert.equal(sends, 0);
    assert.equal([...backing.data.values()][0], retained);
    if (retained) assert.equal((await load(backing).journal.prepare(request)).mayDispatch, false);
  }
});

test("lost closure receipt persistence retains only actual disk proof after restart", async () => {
  const backing = memory(); let writes = 0, broken = false;
  const storage = { async getItem(key) { if (broken) throw Error("lost readback"); return backing.getItem(key); },
    async setItem(key, value) { writes++; await backing.setItem(key, value); if (writes === 3) broken = true; } };
  const f = load(storage), request = input(), ticket = await f.journal.prepare(request);
  await assert.rejects(ticket.dispatch(async () => direct(request))); broken = false;
  const recoveredJournal = load(backing), closed = (await recoveredJournal.journal.list())[0];
  assert.equal(closed.state, "closed"); assert.equal(recoveredJournal.parseClosedTestStoreV3PreparedAttempt(closed, scope).state, "closed");
  assert.equal((await recoveredJournal.journal.prepare(request)).mayDispatch, false);
  const changed = input(id(80)); changed.payload.intentId = `scv1_intent_${id(81)}`;
  await assert.rejects(f.journal.prepare(changed)); assert.equal(writes, 3);
});

test("same-runtime duplicate preparation issues one capability and rejects account or tuple rebinding", async () => {
  const f = load(), request = input(); const tickets = await Promise.all([f.journal.prepare(request), f.create().prepare(request)]);
  assert.equal(tickets.filter(value => value.mayDispatch).length, 1);
  await assert.rejects(f.create({ userId: id(80) }).list());
  for (const mutate of [v => { v.sessionId = id(80); }, v => { v.payload.dispatchId = id(80); }, v => { v.nativeClosure.closedAt = "2026-11-07T12:00:03Z"; }]) {
    const value = input(); mutate(value); await assert.rejects(f.journal.prepare(value));
  }
});

test("corrupt stored closure observation cannot be promoted to bound release proof", async () => {
  for (const mutate of [v => { v.attempts[0].observation.requestId = id(80); }, v => { v.attempts[0].observation.sessionId = id(80); },
    v => { v.attempts[0].nativeClosure.invocation.allocationId = `scv3_allocation_${id(80)}`; }, v => { v.userId = id(80); }]) {
    const f = load(), request = input(); await f.journal.prepare(request); await f.journal.reconcile(request.requestId, direct(request));
    const [key, raw] = [...f.storage.data][0], corrupted = JSON.parse(raw); mutate(corrupted); f.storage.data.set(key, JSON.stringify(corrupted));
    assert.throws(() => f.parseClosedTestStoreV3PreparedAttempt(corrupted.attempts[0], { ...scope, userId: corrupted.userId }));
    await assert.rejects(f.journal.list());
  }
});

test("filesystem restart retains native tombstone and requires an exact server recovery to release", async () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "prepared-close-journal-"));
  const storage = { async getItem(key) { try { return await fs.promises.readFile(path.join(directory, encodeURIComponent(key)), "utf8"); } catch (error) { if (error.code === "ENOENT") return null; throw error; } },
    async setItem(key, value) { await fs.promises.writeFile(path.join(directory, encodeURIComponent(key)), value); } };
  try {
    const first = load(storage), request = input(), ticket = await first.journal.prepare(request); await assert.rejects(ticket.dispatch(async () => { throw Error("lost"); }));
    const restarted = load(storage); assert.equal((await restarted.journal.prepare(request)).mayDispatch, false);
    const binding = recoveryBinding(), result = await restarted.journal.reconcile(request.requestId, recovered(request, binding), binding);
    assert.equal(result.state, "closed"); const third = load(storage), saved = (await third.journal.list())[0];
    assert.equal(saved.nativeClosure.invocation.sessionId, request.nativeClosure.invocation.sessionId);
    assert.equal(third.parseClosedTestStoreV3PreparedAttempt(saved, scope).state, "closed");
  } finally { fs.rmSync(directory, { recursive: true, force: true }); }
});

if (process.env.ISOLATED_PAID_VIDEO_PREPARED_CLOSURE_CAPTURES) test("actual PostgreSQL closure and recovery responses pass the strict parser and durable journal", async () => {
  const file = process.env.ISOLATED_PAID_VIDEO_PREPARED_CLOSURE_CAPTURES, raw = fs.readFileSync(file, "utf8"), cases = JSON.parse(raw);
  assert.equal(cases.length, 8); const f = load();
  for (const entry of cases) {
    const { actor, request } = entry.input;
    assert.equal(request.expectedSessionId, actor.sessionId);
    assert.equal(f.core.parsePaidVideoCheckoutV3Result(entry.result, { command: request.command, requestId: request.requestId,
      actor, configurationDigest: request.configurationDigest, payload: request.payload }).status, entry.result.status);
  }
  const closes = cases.filter(entry => entry.input.request.command === "close_prepared"), first = closes[0], second = closes.find(entry => entry.input.request.requestId !== first.input.request.requestId);
  assert.ok(second); assert.notEqual(first.input.actor.sessionId, second.input.actor.sessionId);
  assert.deepEqual(first.input.request.payload, second.input.request.payload);
  assert.deepEqual(first.result.data.closure, second.result.data.closure);
  const actualScope = { userId: first.input.actor.userId, installationId: id(70), configurationDigest: first.input.request.configurationDigest };
  const exact = first.input.request.payload, proof = first.result.data.closure;
  // Server responses below are unchanged SQL output. This native record is an
  // explicit local model, not a captured device event or native attestation.
  const modeledNative = { protocol: "isolated-test-store-native-prepared-closure-v3", state: "prepared_closed", closedAt: proof.closedAt,
    invocation: { protocol: "isolated-test-store-native-v3", invocationId: exact.dispatchId, customerBindingId: exact.customerBindingId,
      installationId: actualScope.installationId, buyerId: actualScope.userId, configurationDigest: actualScope.configurationDigest,
      providerAppUserId: `scv3_teststore_${id(71)}`, allocationId: proof.allocationId, registrationId: exact.registrationId,
      sessionId: exact.originalSessionId, quote: exact.expectedQuote, state: "prepared", outcome: null, transactionHint: null, completedAt: null } };
  const operation = entry => ({ requestId: entry.input.request.requestId, sessionId: entry.input.actor.sessionId,
    payload: entry.input.request.payload, nativeClosure: modeledNative });
  const journal = f.create(actualScope), original = operation(first);
  await journal.prepare(original);
  const missing = cases.filter(entry => entry.result.status === "unknown"); assert.equal(missing.length, 2);
  for (const entry of missing) {
    assert.equal(entry.input.request.payload.originalRequestId, original.requestId);
    const result = await journal.reconcile(original.requestId, entry.result, { requestId: entry.input.request.requestId, sessionId: entry.input.actor.sessionId });
    assert.equal(result.state, "unknown");
  }
  assert.equal((await journal.prepare(original)).mayDispatch, false);
  const reack = await journal.prepare(operation(second)); assert.equal(reack.mayDispatch, true);
  const closed = await reack.dispatch(async sent => { assert.deepEqual(clone(sent), second.input.request.payload); return second.result; });
  assert.equal(closed.state, "closed"); assert.equal((await journal.list())[0].state, "unknown");
  assert.equal(f.parseClosedTestStoreV3PreparedAttempt(closed, actualScope).state, "closed");
  const restarted = load(f.storage).create(actualScope);
  for (const entry of cases.filter(entry => entry.input.request.command === "recover_close_prepared" && entry.result.status === "ok")) {
    const result = await restarted.reconcile(entry.input.request.payload.originalRequestId, entry.result,
      { requestId: entry.input.request.requestId, sessionId: entry.input.actor.sessionId });
    assert.equal(result.state, "closed"); assert.equal(result.nativeClosure.invocation.sessionId, exact.originalSessionId);
    assert.equal(f.parseClosedTestStoreV3PreparedAttempt(result, actualScope).state, "closed");
  }
  const replay = closes.find(entry => entry.input.request.requestId === original.requestId && entry.result.data.replayed === true);
  assert.ok(replay); assert.equal((await restarted.reconcile(original.requestId, replay.result)).state, "closed");
  assert.equal((await restarted.list()).length, 2); assert.equal((await restarted.prepare(original)).mayDispatch, false);
  assert.equal(fs.readFileSync(file, "utf8"), raw);
});
