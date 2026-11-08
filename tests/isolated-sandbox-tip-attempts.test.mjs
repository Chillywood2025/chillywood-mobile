import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import fsp from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import vm from "node:vm";
import { createRequire } from "node:module";

const ts = createRequire(import.meta.url)("typescript");
const source = fs.readFileSync(new URL("../_lib/isolatedSandboxTipAttempts.ts", import.meta.url), "utf8");
const compiled = ts.transpileModule(source, { compilerOptions: {
  target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, esModuleInterop: true,
} }).outputText;
const commerceContext = { exports: {}, require: () => ({}) };
vm.runInNewContext(ts.transpileModule(fs.readFileSync(new URL("../_lib/isolatedSandboxCommerce.ts", import.meta.url), "utf8"), {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS },
}).outputText, commerceContext);
const { IsolatedSandboxCommerceError } = commerceContext.exports;
const uuid = n => `a0000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const userId = uuid(1), sessionGeneration = uuid(2), laterSession = uuid(3), otherUser = uuid(4);
const resourceId = `scv1_resource_${uuid(5)}`, offerId = `scv1_offer_${uuid(6)}`;
const key = user => `@chillywood/isolated-sandbox-tip-attempts:v1:${user}`;
const clone = value => JSON.parse(JSON.stringify(value));
const expected = code => error => { assert.equal(error.code, code); return true; };
function load(storage) {
  const context = { exports: {}, require: name => {
    if (name === "./isolatedSandboxCommerce") return commerceContext.exports;
    assert.equal(name, "@react-native-async-storage/async-storage"); return storage;
  } };
  vm.runInNewContext(compiled, context); return context.exports;
}
function memory() {
  const values = new Map();
  return { values, async getItem(key) { return values.get(key) ?? null; }, async setItem(key, value) { values.set(key, value); } };
}
const prepare = (requestId = uuid(100), overrides = {}) => ({ requestId, sessionGeneration,
  command: "resource.create", payload: { kind: "creator_tip", title: "Support my work" }, ...overrides });
const baseOffer = { id: offerId, resourceId, kind: "creator_tip", revision: 1, status: "published", amountMinor: 199, currency: "usd" };
const richOffer = { ...baseOffer, creatorId: userId, title: "Support my work", resourceRevision: 1,
  createdAt: "2026-11-07T00:00:00Z", available: true, checkoutConnected: false };
const resource = { id: resourceId, kind: "creator_tip", creatorId: userId, revision: 1, status: "draft" };
const richResource = { ...resource, title: "Support my work", createdAt: "2026-11-07T00:00:00Z", offers: [], offersNextCursor: null, offersTruncated: false };
function response(input, data = { resource }, options = {}) {
  return { protocol: "sandbox-commerce-v1", environment: "sandbox", command: input.command, requestId: input.requestId,
    actor: { userId, accountId: userId, sessionGeneration: input.sessionGeneration }, status: "ok", data: clone(data), ...options };
}
function recovery(input, resolution = "found") {
  const binding = { requestId: uuid(901), sessionGeneration: laterSession };
  const found = resolution === "found";
  const data = { resolution, originalRequestId: input.requestId, recordedCommand: found ? input.command : null,
    recordedSessionId: found ? input.sessionGeneration : null,
    recordedPayload: found ? { protocol: "sandbox-commerce-v1", requestId: input.requestId, ...input.payload } : null,
    resource: found && input.command === "resource.create" ? richResource : null,
    offer: found && input.command === "offer.publish" ? richOffer : found && input.command === "offer.retire"
      ? { ...richOffer, status: "retired", available: false } : null,
    entry: null, declaration: found && input.command === "creator.declare"
      ? { ...input.payload, updatedAt: "2026-11-07T00:00:00Z", sessionId: input.sessionGeneration } : null,
    retryAllowed: false, noDispatchProven: false };
  return { binding, outcome: { protocol: "sandbox-commerce-v1", environment: "sandbox", command: "request.read",
    requestId: binding.requestId, actor: { userId, accountId: userId, sessionGeneration: binding.sessionGeneration }, status: "ok", data } };
}

test("persist-before-return, deep immutable request, one dispatch opportunity, and account namespace", async () => {
  const storage = memory(), api = load(storage), journal = api.createIsolatedSandboxAttemptJournal({ userId });
  const input = prepare(); const promise = journal.prepare(input); input.payload.title = "Changed after call";
  const result = await promise;
  assert.equal(result.mayDispatch, true); assert.equal(result.attempt.payload.title, "Support my work");
  assert.ok(Object.isFrozen(result.attempt.payload));
  assert.equal(JSON.parse(storage.values.get(key(userId))).attempts[0].requestId, input.requestId);
  const same = await api.createIsolatedSandboxAttemptJournal({ userId }).prepare(prepare());
  assert.equal(same.mayDispatch, false);
  const another = await api.createIsolatedSandboxAttemptJournal({ userId: otherUser }).prepare(prepare());
  assert.equal(another.mayDispatch, true); assert.equal(another.attempt.userId, otherUser);
  assert.equal(storage.values.size, 2);
});

test("multiple journal instances serialize the same namespace and permit one initial caller only", async () => {
  const storage = memory(), api = load(storage);
  const results = await Promise.all(Array.from({ length: 15 }, () => api.createIsolatedSandboxAttemptJournal({ userId,
    storage: { getItem: storage.getItem.bind(storage), setItem: storage.setItem.bind(storage) } }).prepare(prepare())));
  assert.equal(results.filter(result => result.mayDispatch).length, 1);
  assert.equal((await api.createIsolatedSandboxAttemptJournal({ userId }).list()).length, 1);
});

test("unresolved attempt blocks new identity, amount, rail, or quote and preserves old session", async () => {
  const journal = load(memory()).createIsolatedSandboxAttemptJournal({ userId });
  const input = prepare(uuid(100), { command: "offer.publish", payload: { resourceId, amountMinor: 199, currency: "usd", expectedRevision: 1 } });
  await journal.prepare(input); await journal.markUnknown(input.requestId);
  await assert.rejects(journal.prepare({ ...input, requestId: uuid(101) }), expected("unresolved_attempt"));
  await assert.rejects(journal.prepare({ ...input, payload: { ...input.payload, amountMinor: 299 } }), expected("request_conflict"));
  await assert.rejects(journal.prepare({ ...input, command: "checkout.prepare", payload: { offerId, expectedRevision: 1 } }), expected("invalid_request"));
  const reopened = await journal.prepare({ ...input, sessionGeneration: laterSession });
  assert.equal(reopened.mayDispatch, false); assert.equal(reopened.attempt.sessionGeneration, sessionGeneration);
});

test("exact allowlists exclude credentials, checkout URLs, provider blobs, non-tip products, and malformed primitives", async () => {
  const storage = memory(), journal = load(storage).createIsolatedSandboxAttemptJournal({ userId });
  for (const payload of [
    { kind: "creator_tip", title: "Tip", accessToken: "private" },
    { kind: "creator_tip", title: "Tip", checkoutUrl: "https://private.invalid" },
    { kind: "creator_tip", title: "Tip", provider: { raw: "private" } },
    { kind: "paid_content", title: "Tip" }, { kind: "creator_tip", title: 3 },
  ]) await assert.rejects(journal.prepare(prepare(uuid(100), { payload })), expected("invalid_request"));
  for (const payload of [
    { resourceId, amountMinor: "199", currency: "usd", expectedRevision: 1 },
    { resourceId, amountMinor: NaN, currency: "usd", expectedRevision: 1 },
    { resourceId, amountMinor: 199, currency: "USD", expectedRevision: 1 },
    { resourceId: uuid(5), amountMinor: 199, currency: "usd", expectedRevision: 1 },
  ]) await assert.rejects(journal.prepare(prepare(uuid(100), { command: "offer.publish", payload })), expected("invalid_request"));
  assert.equal(storage.values.size, 0);
});

test("failed, uncertain, and mismatching storage writes never permit transport", async () => {
  for (const mode of ["reject", "commit-then-reject", "drop", "wrong-readback"]) {
    const backing = memory(); let writes = 0, dispatches = 0;
    const storage = { async getItem(name) { return mode === "wrong-readback" && writes ? "unexpected" : backing.getItem(name); },
      async setItem(name, value) { writes += 1;
        if (mode === "commit-then-reject") await backing.setItem(name, value);
        if (mode === "reject" || mode === "commit-then-reject") throw new Error("Private adapter detail");
      } };
    const journal = load(storage).createIsolatedSandboxAttemptJournal({ userId });
    await assert.rejects((async () => { const next = await journal.prepare(prepare()); if (next.mayDispatch) dispatches += 1; })(), expected("storage_unavailable"));
    assert.equal(dispatches, 0);
    if (mode === "commit-then-reject") assert.equal((await load(backing).createIsolatedSandboxAttemptJournal({ userId }).prepare(prepare())).mayDispatch, false);
  }
});

test("corrupt or unreadable stored journals fail closed without erasing evidence", async () => {
  const storage = memory(), journal = load(storage).createIsolatedSandboxAttemptJournal({ userId });
  await journal.prepare(prepare()); const original = storage.values.get(key(userId));
  const broken = ["{", "null", JSON.stringify({ version: 1, userId, attempts: "no" }),
    original.replace(userId, otherUser), original.replace('"prepared"', '"completed"'),
    original.replace('"title":"Support my work"', '"title":"Support my work","token":"private"')];
  for (const raw of broken) {
    storage.values.set(key(userId), raw);
    await assert.rejects(journal.list(), expected("storage_corrupt"));
    await assert.rejects(journal.prepare(prepare(uuid(101))), expected("storage_corrupt"));
    assert.equal(storage.values.get(key(userId)), raw);
  }
  const unavailable = load({ async getItem() { throw new Error("Private storage error"); }, async setItem() {} }).createIsolatedSandboxAttemptJournal({ userId });
  await assert.rejects(unavailable.prepare(prepare()), expected("storage_unavailable"));
});

test("strict direct acknowledgements finish only the exact original authoring request", async () => {
  for (const modify of [value => { value.actor.userId = otherUser; }, value => { value.actor.accountId = otherUser; },
    value => { value.actor.sessionGeneration = laterSession; }, value => { value.requestId = uuid(999); },
    value => { value.command = "offer.publish"; }, value => { value.data.resource.creatorId = otherUser; },
    value => { value.data.checkoutUrl = "https://private.invalid"; }, value => { value.environment = "production"; }]) {
    const journal = load(memory()).createIsolatedSandboxAttemptJournal({ userId }), input = prepare();
    await journal.prepare(input); const result = response(input); modify(result);
    await assert.rejects(journal.reconcile(input.requestId, result), expected("invalid_response"));
    assert.equal((await journal.list())[0].state, "prepared");
  }
  const journal = load(memory()).createIsolatedSandboxAttemptJournal({ userId }), input = prepare();
  await journal.prepare(input); await journal.reconcile(input.requestId, response(input));
  assert.equal((await journal.list())[0].state, "completed");
  assert.equal((await journal.prepare(prepare(uuid(101)))).mayDispatch, true);
  assert.equal((await journal.prepare(input)).mayDispatch, false);
});

test("A to B to A and late callbacks retain original records without adopting fresh session", async () => {
  const storage = memory(), api = load(storage), oldA = api.createIsolatedSandboxAttemptJournal({ userId });
  const input = prepare(); await oldA.prepare(input);
  const B = api.createIsolatedSandboxAttemptJournal({ userId: otherUser }); await B.prepare(prepare());
  const newA = api.createIsolatedSandboxAttemptJournal({ userId });
  const recovered = recovery(input); await newA.reconcile(input.requestId, recovered.outcome, recovered.binding);
  const next = prepare(uuid(101), { sessionGeneration: laterSession }); await newA.prepare(next);
  await oldA.markUnknown(input.requestId); await oldA.reconcile(input.requestId, response(input));
  const records = await newA.list();
  assert.equal(records[0].sessionGeneration, sessionGeneration); assert.equal(records[0].state, "completed");
  assert.equal(records[0].result.observedSessionGeneration, laterSession);
  assert.equal(records[1].sessionGeneration, laterSession); assert.equal(records[1].state, "prepared");
  assert.equal((await B.list())[0].state, "prepared");
});

test("unknown, busy, held, denied, and pending never authorize replacement or prove no charge", async () => {
  const journal = load(memory()).createIsolatedSandboxAttemptJournal({ userId }), input = prepare(); await journal.prepare(input);
  for (const status of ["held", "denied", "pending"]) {
    await journal.reconcile(input.requestId, response(input, { reason: "not_available" }, { status }));
    await assert.rejects(journal.prepare(prepare(uuid(101))), expected("unresolved_attempt"));
  }
  for (const resolution of ["unknown", "busy"]) {
    const r = recovery(input, resolution); await journal.reconcile(input.requestId, r.outcome, r.binding);
    assert.equal((await journal.list())[0].state, "unknown");
    await assert.rejects(journal.prepare(prepare(uuid(101))), expected("unresolved_attempt"));
    const falseProof = clone(r.outcome); falseProof.data.noDispatchProven = true;
    await assert.rejects(journal.reconcile(input.requestId, falseProof, r.binding), expected("invalid_response"));
  }
  await assert.rejects(journal.reconcile(input.requestId, null), expected("invalid_response"));
  assert.equal("abandon" in journal, false); assert.equal("remove" in journal, false);
});

test("recovery requires exact read binding, original request, canonical payload, and original session", async () => {
  for (const modify of [r => { r.outcome.requestId = uuid(777); }, r => { r.outcome.actor.sessionGeneration = sessionGeneration; },
    r => { r.outcome.data.recordedSessionId = laterSession; }, r => { r.outcome.data.recordedCommand = "creator.declare"; },
    r => { r.outcome.data.recordedPayload.title = "Different request"; }, r => { r.outcome.data.originalRequestId = uuid(777); },
    r => { r.outcome.data.recordedPayload.provider = "other-rail"; }, r => { r.outcome.data.resource.creatorId = otherUser; },
    r => { r.outcome.data.retryAllowed = true; }, r => { r.outcome.data.entry = { receipt: null }; }]) {
    const journal = load(memory()).createIsolatedSandboxAttemptJournal({ userId }), input = prepare(); await journal.prepare(input);
    const r = clone(recovery(input)); modify(r);
    await assert.rejects(journal.reconcile(input.requestId, r.outcome, r.binding), expected("invalid_response"));
    assert.equal((await journal.list())[0].state, "prepared");
  }
});

test("all four supported authoring commands reconcile from current-session read-only recovery", async () => {
  const inputs = [prepare(), prepare(uuid(101), { command: "creator.declare", payload: { declared18Plus: true, countryCode: "US", regionCode: null, declarationVersion: "adult-us-creator-v1" } }),
    prepare(uuid(102), { command: "offer.publish", payload: { resourceId, amountMinor: 199, currency: "usd", expectedRevision: 1 } }),
    prepare(uuid(103), { command: "offer.retire", payload: { offerId, expectedRevision: 1 } })];
  const journal = load(memory()).createIsolatedSandboxAttemptJournal({ userId });
  for (const input of inputs) {
    await journal.prepare(input); await journal.markUnknown(input.requestId);
    const r = recovery(input); await journal.reconcile(input.requestId, r.outcome, r.binding);
  }
  const attempts = await journal.list(); assert.equal(attempts.length, 4);
  assert.ok(attempts.every(item => item.state === "completed" && item.sessionGeneration === sessionGeneration));
  assert.ok(attempts.every(item => item.result.observedSessionGeneration === laterSession));
});

test("offer retirement accepts its strict current-rich projection and does not enable checkout", async () => {
  const journal = load(memory()).createIsolatedSandboxAttemptJournal({ userId });
  const input = prepare(uuid(100), { command: "offer.retire", payload: { offerId, expectedRevision: 1 } }); await journal.prepare(input);
  const valid = { ...richOffer, status: "retired", available: false };
  await assert.rejects(journal.reconcile(input.requestId, response(input, { offer: { ...valid, checkoutConnected: true } })), expected("invalid_response"));
  await assert.rejects(journal.reconcile(input.requestId, response(input, { offer: { ...valid, amountMinor: "199" } })), expected("invalid_response"));
  await journal.reconcile(input.requestId, response(input, { offer: valid }));
  assert.equal((await journal.list())[0].state, "completed");
});

test("direct declaration and offer acknowledgement bind exact saved quote and remain recoverable", async () => {
  const storage = memory(), journal = load(storage).createIsolatedSandboxAttemptJournal({ userId });
  const declaration = prepare(uuid(100), { command: "creator.declare", payload: {
    declared18Plus: false, countryCode: "US", regionCode: null, declarationVersion: "adult-us-creator-v1",
  } });
  await journal.prepare(declaration);
  await journal.reconcile(declaration.requestId, response(declaration, { eligible: false, declarationId: uuid(700) }));
  const publish = prepare(uuid(101), { command: "offer.publish", payload: { resourceId, amountMinor: 199, currency: "usd", expectedRevision: 1 } });
  await journal.prepare(publish);
  for (const change of [{ amountMinor: 200 }, { currency: "eur" }, { resourceId: `scv1_resource_${uuid(888)}` }, { kind: "paid_content" }]) {
    await assert.rejects(journal.reconcile(publish.requestId, response(publish, { offer: { ...baseOffer, ...change } })), expected("invalid_response"));
  }
  await journal.reconcile(publish.requestId, response(publish, { offer: baseOffer }));
  const records = await load(storage).createIsolatedSandboxAttemptJournal({ userId }).list();
  assert.equal(records.length, 2); assert.ok(records.every(attempt => attempt.state === "completed"));
  assert.equal(records[0].result.data.eligible, false); assert.equal(records[1].payload.amountMinor, 199);
});

test("only fresh source-proven no-effect publish holds are terminal without claiming success", async () => {
  for (const reason of ["mode_integration_unavailable", "provider_or_resource_binding_unavailable"]) {
    const storage = memory(), journal = load(storage).createIsolatedSandboxAttemptJournal({ userId });
    const input = prepare(uuid(100), { command: "offer.publish", payload: { resourceId, amountMinor: 199, currency: "usd", expectedRevision: 1 } });
    await journal.prepare(input);
    const result = await journal.reconcile(input.requestId, response(input, { reason }, { status: "held" }));
    assert.equal(result.state, "not_applied"); assert.equal(result.result.status, "held");
    assert.equal((await journal.prepare(input)).mayDispatch, false);
    assert.equal((await load(storage).createIsolatedSandboxAttemptJournal({ userId }).list())[0].state, "not_applied");
    assert.equal((await journal.prepare(prepare(uuid(101)))).mayDispatch, true);
  }
});

test("reopened, replay-held, and previously unknown attempts cannot use fresh rejection handling", async () => {
  const input = prepare(uuid(100), { command: "offer.publish", payload: { resourceId, amountMinor: 199, currency: "usd", expectedRevision: 1 } });
  for (const mode of ["reopened", "unknown", "replay-held"]) {
    const storage = memory(); let journal = load(storage).createIsolatedSandboxAttemptJournal({ userId }); await journal.prepare(input);
    if (mode === "reopened") journal = load(storage).createIsolatedSandboxAttemptJournal({ userId });
    if (mode === "unknown") await journal.markUnknown(input.requestId);
    const reason = mode === "replay-held" ? "resource_unavailable" : "mode_integration_unavailable";
    await journal.reconcile(input.requestId, response(input, { reason }, { status: "held" }));
    assert.equal((await journal.list())[0].state, "unknown");
    await assert.rejects(journal.prepare(prepare(uuid(101))), expected("unresolved_attempt"));
  }
});

test("one-use pre-send stop requires exact real client error and cannot clear unknown or reopened request", async () => {
  for (const code of ["authority_retired", "invalid_request"]) {
    const storage = memory(), journal = load(storage).createIsolatedSandboxAttemptJournal({ userId }); const input = prepare();
    const prepared = await journal.prepare(input);
    assert.equal((await journal.prepare(input)).stopBeforeDispatch, null);
    const error = new IsolatedSandboxCommerceError(code, input.requestId, "not_dispatched");
    assert.equal((await prepared.stopBeforeDispatch(error)).state, "not_applied");
    await assert.rejects(prepared.stopBeforeDispatch(error), expected("invalid_response"));
    assert.equal((await load(storage).createIsolatedSandboxAttemptJournal({ userId }).list())[0].state, "not_applied");
    assert.equal((await journal.prepare(prepare(uuid(101)))).mayDispatch, true);
  }
  for (const error of [
    { name: "IsolatedSandboxCommerceError", code: "authority_retired", requestId: uuid(100), outcome: "not_dispatched" },
    new IsolatedSandboxCommerceError("request_conflict", uuid(100), "not_dispatched"),
    new IsolatedSandboxCommerceError("authority_retired", uuid(999), "not_dispatched"),
    new IsolatedSandboxCommerceError("authority_retired", uuid(100), "unknown"),
  ]) {
    const journal = load(memory()).createIsolatedSandboxAttemptJournal({ userId }); const prepared = await journal.prepare(prepare());
    await assert.rejects(prepared.stopBeforeDispatch(error), expected("invalid_response"));
    assert.equal((await journal.list())[0].state, "prepared");
  }
  const journal = load(memory()).createIsolatedSandboxAttemptJournal({ userId }); const prepared = await journal.prepare(prepare());
  await journal.markUnknown(uuid(100));
  await assert.rejects(prepared.stopBeforeDispatch(new IsolatedSandboxCommerceError("authority_retired", uuid(100), "not_dispatched")), expected("invalid_response"));
  assert.equal((await journal.list())[0].state, "unknown");
  const invalidJournal = load(memory()).createIsolatedSandboxAttemptJournal({ userId }); const initial = await invalidJournal.prepare(prepare());
  await assert.rejects(invalidJournal.reconcile(uuid(100), { malformed: true }), expected("invalid_response"));
  await assert.rejects(initial.stopBeforeDispatch(new IsolatedSandboxCommerceError("authority_retired", uuid(100), "not_dispatched")), expected("invalid_response"));
});

test("resource recovery validates bounded preview, exact truncation cursor, strict ordering and ownership", async () => {
  const input = prepare();
  const preview = () => {
    const value = clone(recovery(input)); const offers = Array.from({ length: 10 }, (_, index) => ({
      ...richOffer, id: `scv1_offer_${uuid(800 - index)}`,
    }));
    value.outcome.data.resource = { ...richResource, offers, offersTruncated: true,
      offersNextCursor: { asOf: "2026-11-07T00:00:01Z", createdAt: offers.at(-1).createdAt, id: offers.at(-1).id.slice("scv1_offer_".length) } };
    return value;
  };
  const journal = load(memory()).createIsolatedSandboxAttemptJournal({ userId }); await journal.prepare(input);
  const valid = preview(); await journal.reconcile(input.requestId, valid.outcome, valid.binding);
  assert.equal((await journal.list())[0].state, "completed");
  const micros = preview(); micros.outcome.data.resource.offers.forEach((offer, index) => {
    offer.id = `scv1_offer_${uuid(810 + index)}`;
    offer.createdAt = `2026-11-07T00:00:00.${String(100 - index).padStart(6, "0")}Z`;
  });
  micros.outcome.data.resource.offersNextCursor.id = uuid(819);
  micros.outcome.data.resource.offersNextCursor.createdAt = micros.outcome.data.resource.offers.at(-1).createdAt;
  const preciseJournal = load(memory()).createIsolatedSandboxAttemptJournal({ userId }); await preciseJournal.prepare(input);
  await preciseJournal.reconcile(input.requestId, micros.outcome, micros.binding);
  assert.equal((await preciseJournal.list())[0].state, "completed");
  for (const modify of [r => { delete r.offersNextCursor; }, r => { r.offersTruncated = false; },
    r => { r.offersNextCursor.id = uuid(999); }, r => { r.offersNextCursor.createdAt = "2026-11-07T00:00:00.001Z"; },
    r => { r.offersNextCursor.asOf = "2026-11-06T23:59:59Z"; }, r => { r.offers.push(r.offers[0]); },
    r => { r.offers.pop(); }, r => { r.offers.reverse(); }, r => { r.offers[1] = r.offers[0]; },
    r => { r.offers[0].creatorId = otherUser; }, r => { r.offersNextCursor.url = "https://private.invalid"; }]) {
    const broken = preview(); modify(broken.outcome.data.resource);
    const candidate = load(memory()).createIsolatedSandboxAttemptJournal({ userId }); await candidate.prepare(input);
    await assert.rejects(candidate.reconcile(input.requestId, broken.outcome, broken.binding), expected("invalid_response"));
  }
});

test("durable file-backed AsyncStorage contract survives fresh runtime reopen and read-only recovery", async t => {
  const directory = await fsp.mkdtemp(path.join(os.tmpdir(), "isolated-tip-journal-"));
  t.after(() => fsp.rm(directory, { recursive: true, force: true }));
  const file = path.join(directory, "storage.json"); let mutationCalls = 0;
  const openStorage = () => ({
    async getItem(name) { try { return JSON.parse(await fsp.readFile(file, "utf8"))[name] ?? null; }
      catch (error) { if (error.code === "ENOENT") return null; throw error; } },
    async setItem(name, value) {
      let values = {}; try { values = JSON.parse(await fsp.readFile(file, "utf8")); } catch (error) { if (error.code !== "ENOENT") throw error; }
      values[name] = value; const handle = await fsp.open(`${file}.next`, "w");
      try { await handle.writeFile(JSON.stringify(values)); await handle.sync(); } finally { await handle.close(); }
      await fsp.rename(`${file}.next`, file);
    },
  });
  const first = load(openStorage()).createIsolatedSandboxAttemptJournal({ userId }); const input = prepare();
  if ((await first.prepare(input)).mayDispatch) mutationCalls += 1;
  await first.markUnknown(input.requestId);
  // New module VM, new adapter object, and disk read: no in-memory attempt cache.
  const reopened = load(openStorage()).createIsolatedSandboxAttemptJournal({ userId });
  assert.equal((await reopened.list())[0].state, "unknown");
  if ((await reopened.prepare({ ...input, sessionGeneration: laterSession })).mayDispatch) mutationCalls += 1;
  assert.equal(mutationCalls, 1);
  await assert.rejects(reopened.prepare(prepare(uuid(101))), expected("unresolved_attempt"));
  const r = recovery(input); await reopened.reconcile(input.requestId, r.outcome, r.binding);
  const final = load(openStorage()).createIsolatedSandboxAttemptJournal({ userId });
  assert.equal((await final.list())[0].state, "completed");
  assert.equal((await final.prepare(input)).mayDispatch, false);
  assert.equal(mutationCalls, 1);
  assert.doesNotMatch(await fsp.readFile(file, "utf8"), /accessToken|checkoutUrl|providerTransaction|Authorization/u);
});
