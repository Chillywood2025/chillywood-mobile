import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import { createRequire } from "node:module";

const ts = createRequire(import.meta.url)("typescript");
const compile = file => ts.transpileModule(fs.readFileSync(new URL(file, import.meta.url), "utf8"), {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, esModuleInterop: true },
}).outputText;
const commerce = { exports: {}, require: () => ({}) };
vm.runInNewContext(compile("../_lib/isolatedSandboxCommerce.ts"), commerce);
const { IsolatedSandboxCommerceError } = commerce.exports;
const compiled = compile("../_lib/isolatedSandboxTipCheckoutAttempts.ts");
const uuid = n => `a0000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const userId = uuid(1), creatorId = uuid(2), session = uuid(3), later = uuid(4), other = uuid(5);
const intentId = `scv1_intent_${uuid(6)}`, offerId = `scv1_offer_${uuid(7)}`, resourceId = `scv1_resource_${uuid(8)}`;
const quote = { offerId, offerRevision: 2, resourceId, resourceRevision: 3, creatorId, kind: "creator_tip", amountMinor: 199, currency: "usd" };
const key = user => `@chillywood/sandbox-commerce-v1/tip-checkout-attempts:${user}`;
const clone = v => JSON.parse(JSON.stringify(v));
const expected = code => error => { assert.equal(error.code, code); return true; };
function memory() {
  const values = new Map(); return { values, async getItem(k) { return values.get(k) ?? null; }, async setItem(k, v) { values.set(k, v); } };
}
function load(storage) {
  const context = { exports: {}, require: name => {
    if (name === "./isolatedSandboxCommerce") return commerce.exports;
    assert.equal(name, "@react-native-async-storage/async-storage"); return storage;
  } };
  vm.runInNewContext(compiled, context); return context.exports;
}
const input = (n = 100, s = session) => ({ requestId: uuid(n), sessionGeneration: s, quote: clone(quote) });
const envelope = (command, requestId, data, sessionGeneration = session, actor = userId) => ({
  protocol: "sandbox-commerce-v1", environment: "sandbox", command, requestId,
  actor: { userId: actor, accountId: actor, sessionGeneration }, status: "ok", data,
});
const prepared = (i = input()) => envelope("checkout.prepare", i.requestId, { intent: {
  id: intentId, offerId: i.quote.offerId, resourceId: i.quote.resourceId, kind: "creator_tip", status: "prepared", providerDispatchAllowed: false,
} }, i.sessionGeneration);
const tombstone = (i = input(), abandonedBySessionId = later) => ({ intentId, originalRequestId: i.requestId,
  originalSessionId: i.sessionGeneration, abandonedBySessionId, abandonedAt: "2026-11-07T12:00:00.123456Z", proof: "undispatched_tombstone" });
function entry(i = input(), current = later, proof = null) {
  return { id: intentId, offerId: i.quote.offerId, offerRevision: i.quote.offerRevision,
    resourceId: i.quote.resourceId, resourceRevision: i.quote.resourceRevision, creatorId: i.quote.creatorId, kind: "creator_tip",
    amountMinor: i.quote.amountMinor, currency: i.quote.currency, status: proof ? "abandoned" : "prepared",
    createdAt: "2026-11-07T11:00:00Z", expiresAt: "2026-11-07T11:15:00Z", originalSessionMatchesCurrent: current === i.sessionGeneration,
    dispatchState: "not_recorded", receipt: null, abandonment: proof, providerDispatchAllowed: false, noDispatchProven: !!proof };
}
function recovery(i = input(), options = {}) {
  const current = options.currentSession ?? later;
  const binding = { requestId: uuid(900), sessionGeneration: current };
  const resolution = options.resolution ?? "found", found = resolution === "found";
  const command = options.command ?? "checkout.prepare";
  const payload = command === "checkout.prepare" ? { offerId: i.quote.offerId, expectedRevision: i.quote.offerRevision }
    : { intentId, originalRequestId: options.originalRequestId };
  const data = { resolution, originalRequestId: i.requestId, recordedCommand: found ? command : null,
    recordedSessionId: found ? i.sessionGeneration : null,
    recordedPayload: found ? { protocol: "sandbox-commerce-v1", requestId: i.requestId, ...payload } : null,
    resource: null, offer: null, entry: found ? entry(options.original ?? i, current, options.proof ?? null) : null,
    declaration: null, retryAllowed: false, noDispatchProven: found && !!options.proof };
  return { binding, result: envelope("request.read", binding.requestId, data, current) };
}
async function observe(journal, i = input(), options = {}) {
  const r = recovery(i, options); return journal.observeForAbandon(i.requestId, r.result, r.binding);
}
async function setup() {
  const storage = memory(), api = load(storage), journal = api.createIsolatedSandboxTipCheckoutJournal({ userId });
  const ticket = await journal.prepare(input()); return { storage, api, journal, ticket };
}

test("persists immutable exact quote before transport; one-use opportunity cannot be reopened", async () => {
  const { storage, api, journal, ticket } = await setup(); let calls = 0;
  assert.equal(ticket.mayDispatch, true); assert.equal(ticket.attempt.intentId, null);
  assert.ok(Object.isFrozen(ticket.attempt.quote));
  await ticket.dispatch(async () => {
    calls++; const saved = JSON.parse(storage.values.get(key(userId))).attempts[0];
    assert.equal(saved.state, "unknown"); assert.deepEqual(saved.quote, quote); assert.deepEqual(saved.payload, { offerId, expectedRevision: 2 });
    return prepared();
  });
  assert.equal((await journal.list())[0].state, "unknown");
  assert.equal((await journal.list())[0].intentId, intentId);
  const r = recovery(); await journal.reconcile(input().requestId, r.result, r.binding);
  assert.equal((await journal.list())[0].state, "intent_prepared");
  await assert.rejects(ticket.dispatch(async () => { calls++; return prepared(); }), expected("dispatch_unavailable"));
  const reopened = await api.createIsolatedSandboxTipCheckoutJournal({ userId }).prepare(input(100, later));
  assert.equal(reopened.dispatch, null); assert.equal(reopened.mayDispatch, false); assert.equal(reopened.attempt.sessionGeneration, session);
  await assert.rejects(journal.prepare(input(101)), expected("unresolved_attempt")); assert.equal(calls, 1);
});

test("same namespace concurrent instances allocate once; changed body never reuses a request", async () => {
  const storage = memory(), api = load(storage);
  const results = await Promise.all(Array.from({ length: 12 }, () => api.createIsolatedSandboxTipCheckoutJournal({ userId }).prepare(input())));
  assert.equal(results.filter(r => r.mayDispatch).length, 1);
  const journal = api.createIsolatedSandboxTipCheckoutJournal({ userId });
  const changed = input(); changed.quote.amountMinor++;
  await assert.rejects(journal.prepare(changed), expected("request_conflict"));
  assert.equal((await journal.list()).length, 1);
});

test("storage failures and uncertain writes prevent callback; committed uncertain rows survive restart", async () => {
  for (const mode of ["reject", "commit_reject", "drop", "readback"]) {
    const backing = memory(); let writes = 0, calls = 0;
    const storage = { getItem: async k => mode === "readback" && writes ? "bad" : backing.getItem(k),
      setItem: async (k, v) => { writes++; if (mode === "commit_reject") await backing.setItem(k, v);
        if (mode === "reject" || mode === "commit_reject") throw Error("private storage failure"); } };
    const journal = load(storage).createIsolatedSandboxTipCheckoutJournal({ userId });
    await assert.rejects((async () => { const t = await journal.prepare(input()); await t.dispatch(async () => { calls++; }); })(), expected("storage_unavailable"));
    assert.equal(calls, 0);
    if (mode === "commit_reject") assert.equal((await load(backing).createIsolatedSandboxTipCheckoutJournal({ userId }).prepare(input())).mayDispatch, false);
  }
  const { storage, ticket } = await setup(); storage.setItem = async () => { throw Error("lost write"); }; let calls = 0;
  await assert.rejects(ticket.dispatch(async () => { calls++; }), expected("storage_unavailable")); assert.equal(calls, 0);
});

test("lost response stays unknown after restart; request-read busy/missing never permits replacement", async () => {
  const { storage, ticket } = await setup(); let calls = 0;
  await assert.rejects(ticket.dispatch(async () => { calls++; throw Error("lost response"); }));
  const journal = load(storage).createIsolatedSandboxTipCheckoutJournal({ userId });
  for (const resolution of ["unknown", "busy"]) {
    const r = recovery(input(), { resolution }); await journal.reconcile(input().requestId, r.result, r.binding);
    assert.equal((await journal.list())[0].state, "unknown");
    await assert.rejects(journal.prepare(input(101)), expected("unresolved_attempt"));
  }
  assert.equal((await journal.prepare(input())).dispatch, null); assert.equal(calls, 1);
});

test("A to B to A recovery uses current actor but retains original session and never sends", async () => {
  const { storage, api, journal } = await setup(); await journal.markUnknown(input().requestId);
  const B = api.createIsolatedSandboxTipCheckoutJournal({ userId: other }); await B.prepare(input());
  const A = load(storage).createIsolatedSandboxTipCheckoutJournal({ userId }); const r = recovery();
  await A.reconcile(input().requestId, r.result, r.binding);
  assert.equal((await A.list())[0].sessionGeneration, session); assert.equal((await A.list())[0].result.observedSessionGeneration, later);
  assert.equal((await B.list())[0].state, "prepared");
  await assert.rejects(A.prepare(input(101, later)), expected("unresolved_attempt"));
  const wrong = clone(r.result); wrong.actor.accountId = other;
  await assert.rejects(A.reconcile(input().requestId, wrong, r.binding), expected("invalid_response"));
});

test("successful prepare, expiry, failures and even a receipt never become no-dispatch proof", async () => {
  const { journal, ticket } = await setup(); await ticket.dispatch(async () => prepared());
  for (const status of ["expired", "failed", "provider_pending", "verified"]) {
    const r = recovery(); r.result.data.entry.status = status;
    if (status === "verified") r.result.data.entry.receipt = { id: `scv1_receipt_${uuid(80)}`, intentId, status: "verified",
      receiptType: "provider_verified", purchasedAt: "2026-11-07T11:01:00Z", amountMinor: 199, currency: "usd", grantsAccess: false, notPayable: true };
    await journal.reconcile(input().requestId, r.result, r.binding);
    assert.equal((await journal.list())[0].state, "intent_prepared");
    await assert.rejects(journal.prepare(input(101)), expected("unresolved_attempt"));
  }
});

test("explicit abandon is independently durable and exact tombstone releases only its original prepare", async () => {
  const { journal, ticket, storage } = await setup(); await ticket.dispatch(async () => prepared());
  await observe(journal);
  const close = { requestId: uuid(110), sessionGeneration: later, originalRequestId: input().requestId, intentId };
  const t = await journal.prepareAbandon(close); const proof = tombstone();
  const result = await t.dispatch(async () => {
    assert.equal(JSON.parse(storage.values.get(key(userId))).attempts[1].state, "unknown");
    return envelope("checkout.abandon", close.requestId, { entry: entry(input(), later, proof), abandonment: proof,
      noDispatchProven: true, replacementAllowed: true, retryAllowed: false }, later);
  });
  assert.equal(result.state, "abandoned"); assert.equal((await journal.list())[0].state, "abandoned");
  assert.equal((await journal.prepare(input(101, later))).mayDispatch, true);
  assert.equal((await journal.prepareAbandon(close)).mayDispatch, false);
  await journal.markUnknown(input().requestId); await journal.reconcile(input().requestId, prepared());
  assert.equal((await journal.list())[0].state, "abandoned");
});

test("lost abandon response is recovered by exact request read; neither abandon nor prepare auto-retries", async () => {
  const { journal, ticket, storage } = await setup(); await ticket.dispatch(async () => prepared());
  await observe(journal);
  const close = { requestId: uuid(110), sessionGeneration: later, originalRequestId: input().requestId, intentId };
  const t = await journal.prepareAbandon(close); await assert.rejects(t.dispatch(async () => { throw Error("lost close"); }));
  const restarted = load(storage).createIsolatedSandboxTipCheckoutJournal({ userId });
  assert.equal((await restarted.prepareAbandon(close)).mayDispatch, false);
  await assert.rejects(restarted.prepareAbandon({ ...close, requestId: uuid(111) }), expected("abandonment_proof_required"));
  assert.equal((await observe(restarted)).mayRequestAbandon, false);
  await assert.rejects(restarted.prepare(input(101)), expected("unresolved_attempt"));
  const r = recovery({ ...input(), requestId: close.requestId, sessionGeneration: later }, {
    command: "checkout.abandon", originalRequestId: input().requestId, original: input(), proof: tombstone(),
  });
  await restarted.reconcile(close.requestId, r.result, r.binding);
  assert.equal((await restarted.list())[0].state, "abandoned");
  assert.equal((await restarted.prepare(input(101, later))).mayDispatch, true);
});

test("strict transport validation rejects wrong identity, quote, coercion, URL, access and counterfeit tombstones", async () => {
  const directMutants = [r => { r.actor.sessionGeneration = later; }, r => { r.actor.userId = other; },
    r => { r.requestId = uuid(101); }, r => { r.data.intent.kind = "paid_content"; },
    r => { r.data.intent.providerDispatchAllowed = true; }, r => { r.data.intent.resourceId = `scv1_resource_${uuid(999)}`; },
    r => { r.data.intent.url = "https://example.invalid"; }, r => { r.status = "success"; }];
  for (const mutate of directMutants) {
    const { journal, ticket } = await setup(); const raw = prepared(); mutate(raw);
    await assert.rejects(ticket.dispatch(async () => raw), expected("invalid_response"));
    assert.equal((await journal.list())[0].state, "unknown");
  }
  const mutants = [r => { r.result.data.recordedSessionId = later; }, r => { r.result.data.recordedPayload.expectedRevision = "2"; },
    r => { r.result.data.entry.amountMinor = "200"; }, r => { r.result.data.entry.kind = "paid_content"; },
    r => { delete r.result.data.entry.offerRevision; }, r => { r.result.data.entry.resourceRevision = "3"; },
    r => { r.result.data.entry.originalSessionMatchesCurrent = true; }, r => { r.result.data.resource = {}; },
    r => { r.result.data.entry.abandonment.originalSessionId = later; }, r => { r.result.data.entry.abandonment.originalRequestId = uuid(99); },
    r => { r.result.data.entry.abandonment.intentId = `scv1_intent_${uuid(999)}`; }, r => { r.result.data.entry.dispatchState = "claimed"; },
    r => { r.result.data.noDispatchProven = false; }, r => { r.result.data.retryAllowed = true; }];
  for (const mutate of mutants) {
    const { journal, ticket } = await setup(); await ticket.dispatch(async () => prepared());
    const r = recovery(input(), { proof: tombstone() }); mutate(r);
    await assert.rejects(journal.reconcile(input().requestId, r.result, r.binding), expected("invalid_response"));
    await assert.rejects(journal.prepare(input(101)), expected("unresolved_attempt"));
  }
});

test("only fresh exact genuine not-dispatched errors release a local prepare, without a charge claim", async () => {
  for (const code of ["authority_retired", "invalid_request"]) {
    const { journal, ticket } = await setup();
    const error = new IsolatedSandboxCommerceError(code, input().requestId, "not_dispatched");
    const result = await ticket.dispatch(async () => { throw error; });
    assert.equal(result.state, "not_applied"); assert.equal(result.intentId, null); assert.equal(result.result.abandonment, null);
    assert.equal((await journal.prepare(input(101))).mayDispatch, true);
  }
  for (const error of [Object.assign(Error("fake"), { code: "authority_retired", requestId: input().requestId, outcome: "not_dispatched" }),
    new IsolatedSandboxCommerceError("authority_retired", uuid(555), "not_dispatched"),
    new IsolatedSandboxCommerceError("transport_unknown", input().requestId, "unknown")]) {
    const { journal, ticket } = await setup(); await assert.rejects(ticket.dispatch(async () => { throw error; }));
    assert.equal((await journal.list())[0].state, "unknown"); await assert.rejects(journal.prepare(input(101)), expected("unresolved_attempt"));
  }
});

test("invalid/corrupt storage and forbidden quote fields fail closed without deleting evidence", async () => {
  const { journal, storage } = await setup(); const original = storage.values.get(key(userId));
  for (const corrupt of ["{", original.replace(userId, other), original.replace('"state":"prepared"', '"state":"abandoned"'),
    original.replace('"currency":"usd"', '"currency":"usd","token":"secret"')]) {
    storage.values.set(key(userId), corrupt); await assert.rejects(journal.list(), expected("storage_corrupt"));
    assert.equal(storage.values.get(key(userId)), corrupt);
  }
  for (const q of [{ ...quote, amountMinor: "199" }, { ...quote, offerRevision: 0 }, { ...quote, creatorId: userId },
    { ...quote, kind: "paid_content" }, { ...quote, token: "secret" }, { ...quote, url: "https://example.invalid" }]) {
    await assert.rejects(load(memory()).createIsolatedSandboxTipCheckoutJournal({ userId }).prepare({ ...input(), quote: q }), expected("invalid_request"));
  }
});

test("session retirement before abandon transport allows only a new explicit action after fresh reconciliation", async () => {
  const { journal, ticket, storage } = await setup(); await ticket.dispatch(async () => prepared());
  await observe(journal, input(), { currentSession: session });
  const close = { requestId: uuid(110), sessionGeneration: session, originalRequestId: input().requestId, intentId };
  const first = await journal.prepareAbandon(close);
  const result = await first.dispatch(async () => { throw new IsolatedSandboxCommerceError("authority_retired", close.requestId, "not_dispatched"); });
  assert.equal(result.state, "not_applied");
  const current = load(storage).createIsolatedSandboxTipCheckoutJournal({ userId });
  assert.equal((await current.prepareAbandon({ ...close, sessionGeneration: later })).mayDispatch, false);
  await observe(current);
  const next = await current.prepareAbandon({ ...close, requestId: uuid(111), sessionGeneration: later });
  const proof = tombstone(); await next.dispatch(async () => envelope("checkout.abandon", uuid(111), {
    entry: entry(input(), later, proof), abandonment: proof, noDispatchProven: true, replacementAllowed: true, retryAllowed: false,
  }, later));
  assert.equal((await current.list()).length, 3);
  assert.equal((await current.list())[0].state, "abandoned");
  assert.equal((await current.prepare(input(101, later))).mayDispatch, true);
});

test("IDs-only preparation never confirms a quote; fresh full persisted tuple is required", async () => {
  const { journal, ticket } = await setup(); await ticket.dispatch(async () => prepared());
  assert.equal((await journal.list())[0].state, "unknown");
  for (const field of ["amountMinor", "currency", "offerRevision", "resourceRevision"]) {
    const r = recovery(); r.result.data.entry[field] = field === "currency" ? "eur" : r.result.data.entry[field] + 1;
    const observed = await journal.reconcile(input().requestId, r.result, r.binding);
    assert.equal(observed.state, "unknown"); assert.equal(observed.intentId, intentId);
    assert.deepEqual(clone(observed.quote), quote);
    await assert.rejects(journal.prepare(input(101)), expected("unresolved_attempt"));
  }
  const exact = recovery(); await journal.reconcile(input().requestId, exact.result, exact.binding);
  assert.equal((await journal.list())[0].state, "intent_prepared");
  await journal.reconcile(input().requestId, prepared());
  assert.equal((await journal.list())[0].state, "intent_prepared", "late IDs-only response cannot undo the fresh read");
});

test("mismatched price can be closed only with a fresh exact negative proof; saved quote never changes", async () => {
  const { journal, ticket, storage } = await setup(); await ticket.dispatch(async () => prepared());
  const close = { requestId: uuid(110), sessionGeneration: later, originalRequestId: input().requestId, intentId };
  await assert.rejects(journal.prepareAbandon(close), expected("abandonment_proof_required"));
  const r = recovery(); r.result.data.entry.amountMinor = 299; r.result.data.entry.offerRevision = 9;
  const observed = await journal.observeForAbandon(input().requestId, r.result, r.binding);
  assert.equal(observed.attempt.state, "unknown"); assert.equal(observed.mayRequestAbandon, true);
  assert.deepEqual(clone(observed.attempt.quote), quote);
  const restarted = load(storage).createIsolatedSandboxTipCheckoutJournal({ userId });
  await assert.rejects(restarted.prepareAbandon(close), expected("abandonment_proof_required"));
  await restarted.observeForAbandon(input().requestId, r.result, r.binding);
  const t = await restarted.prepareAbandon(close); const proof = tombstone();
  const closedEntry = entry(input(), later, proof); closedEntry.amountMinor = 299; closedEntry.offerRevision = 9;
  const result = await t.dispatch(async () => envelope("checkout.abandon", close.requestId, {
    entry: closedEntry, abandonment: proof, noDispatchProven: true, replacementAllowed: true, retryAllowed: false,
  }, later));
  assert.equal(result.state, "abandoned"); assert.deepEqual(clone(result.quote), quote);
  assert.equal((await restarted.prepare(input(101, later))).mayDispatch, true);
});

test("fresh close observation rejects dispatched, receipt-bearing, wrong-session or wrong-identity candidates", async () => {
  const { journal, ticket } = await setup(); await ticket.dispatch(async () => prepared());
  const close = { requestId: uuid(110), sessionGeneration: later, originalRequestId: input().requestId, intentId };
  for (const status of ["provider_pending", "verified", "failed"]) {
    const r = recovery(); r.result.data.entry.status = status;
    assert.equal((await journal.observeForAbandon(input().requestId, r.result, r.binding)).mayRequestAbandon, false);
    await assert.rejects(journal.prepareAbandon(close), expected("abandonment_proof_required"));
  }
  const claimed = recovery(); claimed.result.data.entry.dispatchState = "claimed";
  assert.equal((await journal.observeForAbandon(input().requestId, claimed.result, claimed.binding)).mayRequestAbandon, false);
  const receipted = recovery(); receipted.result.data.entry.receipt = { id: `scv1_receipt_${uuid(80)}`, intentId, status: "verified",
    receiptType: "provider_verified", purchasedAt: "2026-11-07T11:01:00Z", amountMinor: 199, currency: "usd", grantsAccess: false, notPayable: true };
  assert.equal((await journal.observeForAbandon(input().requestId, receipted.result, receipted.binding)).mayRequestAbandon, false);
  const wrong = recovery(); wrong.result.data.entry.creatorId = other;
  await assert.rejects(journal.observeForAbandon(input().requestId, wrong.result, wrong.binding), expected("invalid_response"));
  await observe(journal);
  await assert.rejects(journal.prepareAbandon({ ...close, sessionGeneration: session }), expected("abandonment_proof_required"));
});

test("contradictory cross-request tombstone cannot overwrite an established original proof", async () => {
  const { journal, ticket } = await setup(); await ticket.dispatch(async () => prepared()); await observe(journal);
  const close = { requestId: uuid(110), sessionGeneration: later, originalRequestId: input().requestId, intentId };
  const t = await journal.prepareAbandon(close); await assert.rejects(t.dispatch(async () => { throw Error("lost close"); }));
  const first = recovery(input(), { proof: tombstone() }); await journal.reconcile(input().requestId, first.result, first.binding);
  const before = clone(await journal.list());
  const conflicting = tombstone(); conflicting.abandonedAt = "2026-11-07T12:01:00Z";
  const second = recovery({ ...input(), requestId: close.requestId, sessionGeneration: later }, {
    command: "checkout.abandon", originalRequestId: input().requestId, original: input(), proof: conflicting,
  });
  await assert.rejects(journal.reconcile(close.requestId, second.result, second.binding), expected("invalid_response"));
  assert.deepEqual(clone(await journal.list()), before);
});

test("outer abandonment flags cannot supply a proof missing from the exact entry", async () => {
  const { journal, ticket } = await setup(); await ticket.dispatch(async () => prepared()); await observe(journal);
  const close = { requestId: uuid(110), sessionGeneration: later, originalRequestId: input().requestId, intentId };
  const t = await journal.prepareAbandon(close);
  await assert.rejects(t.dispatch(async () => envelope("checkout.abandon", close.requestId, {
    entry: entry(input(), later), abandonment: tombstone(), noDispatchProven: true, replacementAllowed: true, retryAllowed: false,
  }, later)), expected("invalid_response"));
  assert.equal((await journal.list())[1].state, "unknown");
  await assert.rejects(journal.prepare(input(101)), expected("unresolved_attempt"));
});

const nativeFixture = process.env.ISOLATED_SANDBOX_COMMAND_FIXTURE ?? process.env.ISOLATED_SANDBOX_NATIVE_FIXTURE;
test("actual PostgreSQL prepare capture passes journal when explicitly supplied", { skip: !nativeFixture }, async () => {
  const saved = JSON.parse(fs.readFileSync(nativeFixture, "utf8"));
  assert.ok(Array.isArray(saved.checkoutCases) && saved.checkoutCases.length > 0);
  for (const item of saved.checkoutCases) {
    const journal = load(memory()).createIsolatedSandboxTipCheckoutJournal({ userId: item.actor.userId });
    const t = await journal.prepare({ requestId: item.response.requestId, sessionGeneration: item.actor.sessionGeneration, quote: item.quote });
    const result = await t.dispatch(async () => item.response);
    assert.equal(result.state, "unknown"); assert.equal(result.intentId, item.response.data.intent.id);
  }
});

const nativeHistoryFixture = process.env.ISOLATED_SANDBOX_TIPS_FIXTURE ?? process.env.ISOLATED_TIPS_NATIVE_FIXTURES;
test("actual PostgreSQL fresh recovery confirms the same persisted full quote after IDs-only preparation", { skip: !nativeHistoryFixture }, async () => {
  const saved = JSON.parse(fs.readFileSync(nativeHistoryFixture, "utf8"));
  assert.ok(Array.isArray(saved.checkoutCases) && saved.checkoutCases.length > 0);
  for (const item of saved.checkoutCases) {
    const journal = load(memory()).createIsolatedSandboxTipCheckoutJournal({ userId: item.actor.userId });
    const t = await journal.prepare({ requestId: item.requestId, sessionGeneration: item.actor.sessionGeneration, quote: item.quote });
    const direct = await t.dispatch(async () => item.response);
    assert.equal(direct.state, "unknown"); assert.equal(direct.intentId, item.response.data.intent.id);
    const confirmed = await journal.reconcile(item.requestId, item.recovery.response, {
      requestId: item.recovery.requestId, sessionGeneration: item.recovery.response.actor.sessionGeneration,
    });
    assert.equal(confirmed.state, "intent_prepared"); assert.deepEqual(clone(confirmed.quote), item.quote);
    assert.equal(confirmed.intentId, direct.intentId);
  }
});
