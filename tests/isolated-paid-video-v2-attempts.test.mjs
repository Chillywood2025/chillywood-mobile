import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import vm from "node:vm";
import { createRequire } from "node:module";
const ts = createRequire(import.meta.url)("typescript");
const compile = name => ts.transpileModule(fs.readFileSync(new URL(`../_lib/${name}.ts`, import.meta.url), "utf8"), {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, esModuleInterop: true },
}).outputText;
const clientSource = compile("isolatedPaidVideoV2"), journalSource = compile("isolatedPaidVideoV2Attempts");
const id = n => `b0000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const configurationDigest = "c".repeat(64), laterDigest = "d".repeat(64);
const userId = id(1), sessionGeneration = id(2), laterSession = id(3), otherUser = id(4), uploadId = `scpv_upload_${id(5)}`;
const resourceId = `scv1_resource_${id(6)}`, assetId = `scv1_asset_${id(7)}`, offerId = `scv1_offer_${id(8)}`;
const key = user => `@chillywood/isolated-paid-video-attempts:v2:${user}`;
const clone = value => JSON.parse(JSON.stringify(value));
const expected = code => error => { assert.equal(error.code, code); return true; };
function memory() { const values = new Map(); return { values, async getItem(k) { return values.get(k) ?? null; }, async setItem(k, v) { values.set(k, v); } }; }
function load(storage = memory()) {
  const client = { exports: {}, require: name => name === "react-native" ? { Platform: { OS: "ios" } } : {} };
  vm.runInNewContext(clientSource, client);
  const context = { exports: {}, require: name => name === "./isolatedPaidVideoV2" ? client.exports : storage };
  vm.runInNewContext(journalSource, context);
  return { ...context.exports, Error: client.exports.IsolatedPaidVideoV2Error, client: client.exports, storage,
    journal: context.exports.createIsolatedPaidVideoV2AttemptJournal({ userId }) };
}
const input = (requestId = id(100), extras = {}) => ({ requestId, sessionGeneration, configurationDigest, command: "upload.reserve",
  payload: { title: "A film", expectedSha256: "a".repeat(64), expectedByteLength: 2048 }, ...extras });
const upload = { id: uploadId, title: "A film", resourceId, assetId, incarnation: id(9), state: "reserved", expectedSha256: "a".repeat(64), expectedByteLength: 2048,
  bytesClean: false, moderation: "unreviewed", profile: "scpv-mp4-h264-aac-v1", expiresAt: "2027-01-01T00:00:00Z", transferAvailable: false, checkoutAvailable: false };
const offer = { id: offerId, resourceId, kind: "paid_content", revision: 1, status: "published", amountMinor: 199, currency: "usd", resourceRevision: 1,
  asset: { id: assetId, incarnation: id(9), sha256: "a".repeat(64), byteLength: 2048, resourceRevision: 1, profile: "scpv-mp4-h264-aac-v1" }, checkoutAvailable: false };
function response(request, data = { upload }, overrides = {}) {
  return clone({ protocol: "isolated-paid-video-v2", configurationDigest: request.configurationDigest, capabilityExpiresAtMs: Date.now() + 1000, command: request.command, requestId: request.requestId,
    actor: { userId, accountId: userId, sessionGeneration: request.sessionGeneration }, status: "ok", data, ...overrides });
}
function recovery(request, status = "ok") {
  const binding = { requestId: id(900), sessionGeneration: laterSession, configurationDigest: laterDigest };
  const data = status === "unknown" ? { recovery: { state: "unknown", originalRequestId: request.requestId } }
    : { recovery: { state: "recorded", originalRequestId: request.requestId, originalCommand: request.command,
      originalSessionGeneration: request.sessionGeneration, originalConfigurationDigest: request.configurationDigest, originalPayload: { protocol: "isolated-paid-video-v1", requestId: request.requestId, ...request.payload } },
      upload, ...(request.command.startsWith("offer.") ? { offer } : {}) };
  return { binding, result: response({ ...binding, command: "upload.recover" }, data, { status }) };
}

test("durable exact snapshot precedes the single dispatch opportunity and returns immutable records", async () => {
  const f = load(), request = input(); let release;
  const write = f.storage.setItem; f.storage.setItem = async (...args) => { await new Promise(resolve => { release = resolve; }); return write(...args); };
  let resolved = false; const pending = f.journal.prepare(request).then(value => { resolved = true; return value; });
  request.payload.title = "changed"; await new Promise(resolve => setImmediate(resolve)); assert.equal(resolved, false); release();
  const first = await pending; assert.equal(first.mayDispatch, true); assert.equal(first.attempt.payload.title, "A film");
  assert(Object.isFrozen(first.attempt.payload)); assert.equal(JSON.parse(f.storage.values.get(key(userId))).attempts[0].requestId, request.requestId);
  const again = await f.journal.prepare(input()); assert.equal(again.mayDispatch, false); assert.equal(again.stopBeforeDispatch, null);
});

test("same-account journal instances serialize and other accounts remain separate", async () => {
  const f = load(); const results = await Promise.all(Array.from({ length: 12 }, () => f.createIsolatedPaidVideoV2AttemptJournal({ userId }).prepare(input())));
  assert.equal(results.filter(result => result.mayDispatch).length, 1);
  assert.equal((await f.createIsolatedPaidVideoV2AttemptJournal({ userId: otherUser }).prepare(input())).mayDispatch, true);
  assert.equal(f.storage.values.size, 2);
});

test("restart and account A to B to A never recreate an old mutation or rebind its original session", async () => {
  const f = load(), request = input(); await f.journal.prepare(request); await f.journal.markUnknown(request.requestId);
  const reopened = load(f.storage); const old = await reopened.journal.prepare({ ...request, sessionGeneration: laterSession });
  assert.equal(old.mayDispatch, false); assert.equal(old.attempt.sessionGeneration, sessionGeneration);
  await reopened.createIsolatedPaidVideoV2AttemptJournal({ userId: otherUser }).prepare(input());
  const back = await reopened.journal.prepare(request); assert.equal(back.mayDispatch, false);
  await assert.rejects(reopened.journal.prepare(input(id(101))), expected("unresolved_attempt"));
  await assert.rejects(reopened.journal.prepare(input(id(100), { payload: { ...request.payload, expectedByteLength: 3000 } })), expected("request_conflict"));
});

test("filesystem-retained history survives a new module runtime without replaying a mutation", async () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "paid-video-journal-"));
  const storage = { async getItem(name) { try { return await fs.promises.readFile(path.join(directory, encodeURIComponent(name)), "utf8"); }
    catch (error) { if (error.code === "ENOENT") return null; throw error; } },
  async setItem(name, value) { await fs.promises.writeFile(path.join(directory, encodeURIComponent(name)), value, "utf8"); } };
  try {
    const first = load(storage), request = input(); await first.journal.prepare(request); await first.journal.markUnknown(request.requestId);
    const restarted = load(storage); assert.equal((await restarted.journal.prepare({ ...request, sessionGeneration: laterSession })).mayDispatch, false);
    const found = recovery(request); await restarted.journal.reconcile(request.requestId, found.result, found.binding);
    const again = load(storage), retained = (await again.journal.list())[0]; assert.equal(retained.state, "completed");
    assert.equal(retained.sessionGeneration, sessionGeneration); assert.equal((await again.journal.prepare(request)).mayDispatch, false);
  } finally { fs.rmSync(directory, { recursive: true, force: true }); }
});

test("request allowlists reject file bytes, paths, credentials, unknown commands and invalid primitives", async () => {
  const f = load();
  for (const payload of [{ ...input().payload, uri: "file:///private/movie.mp4" }, { ...input().payload, bytes: "private" },
    { ...input().payload, accessToken: "private" }, { ...input().payload, expectedByteLength: NaN }, { ...input().payload, expectedByteLength: 16777217 }])
    await assert.rejects(f.journal.prepare(input(id(100), { payload })), expected("invalid_request"));
  await assert.rejects(f.journal.prepare(input(id(100), { command: "upload.put", payload: {} })), expected("invalid_request"));
  assert.equal(f.storage.values.size, 0);
});

test("failed save, lost acknowledgement and bad readback poison all same-runtime writers without erasing retained evidence", async () => {
  for (const mode of ["reject", "commit-then-reject", "drop", "bad-readback"]) {
    const backing = memory(); let writes = 0, broken = true;
    const storage = { values: backing.values, async getItem(k) { return broken && mode === "bad-readback" && writes ? "invalid" : backing.getItem(k); },
      async setItem(k, v) { writes++; if (mode === "commit-then-reject" || mode === "bad-readback") await backing.setItem(k, v);
        if (broken && (mode === "reject" || mode === "commit-then-reject")) throw Error("private adapter detail"); } };
    const f = load(storage); await assert.rejects(f.journal.prepare(input()), expected("storage_unavailable")); broken = false;
    const observed = backing.values.get(key(userId)), count = writes;
    await assert.rejects(f.createIsolatedPaidVideoV2AttemptJournal({ userId }).prepare(input(id(101))), expected("storage_unavailable"));
    assert.equal(writes, count); assert.equal(backing.values.get(key(userId)), observed);
    if (observed) assert.equal((await load(backing).journal.prepare(input())).mayDispatch, false);
  }
});

test("failed completion readback cannot be followed by stale writes; a new runtime can read the retained acknowledgement", async () => {
  const backing = memory(); let failed = false, writes = 0;
  const storage = { async getItem(k) { if (failed) throw Error("readback"); return backing.getItem(k); }, async setItem(k, v) { writes++; await backing.setItem(k, v); if (writes === 2) failed = true; } };
  const f = load(storage), request = input(); await f.journal.prepare(request);
  await assert.rejects(f.journal.reconcile(request.requestId, response(request)), expected("storage_unavailable")); failed = false;
  const retained = backing.values.get(key(userId)); await assert.rejects(f.journal.prepare(input(id(101))), expected("storage_unavailable"));
  assert.equal(backing.values.get(key(userId)), retained); assert.equal(writes, 2);
  assert.equal((await load(backing).journal.list())[0].state, "completed");
});

test("corrupt histories, duplicate IDs and injected result fields fail closed with no repair write", async () => {
  for (const mutate of [raw => "{", raw => raw.replace(userId, otherUser), raw => raw.replace('"prepared"', '"completed"'),
    raw => { const v = JSON.parse(raw); v.attempts.push(v.attempts[0]); return JSON.stringify(v); },
    raw => raw.replace('"result":null', '"result":{"grantAccess":true}')]) {
    const f = load(); await f.journal.prepare(input()); const corrupt = mutate(f.storage.values.get(key(userId))); f.storage.values.set(key(userId), corrupt);
    await assert.rejects(f.journal.list(), expected("storage_corrupt")); await assert.rejects(f.journal.prepare(input(id(101))), expected("storage_corrupt"));
    assert.equal(f.storage.values.get(key(userId)), corrupt);
  }
});

test("all four mutation acknowledgements complete only their exact original actor and request", async () => {
  for (const [command, payload] of [["upload.reserve", input().payload], ["upload.finalize", { uploadId }],
    ["offer.publish", { uploadId, expectedRevision: 1, amountMinor: 199, currency: "usd" }], ["offer.retire", { offerId, expectedRevision: 1 }]]) {
    const f = load(), request = input(id(100), { command, payload }); await f.journal.prepare(request);
    const data = { upload, ...(command.startsWith("offer.") ? { offer } : {}) };
    const result = await f.journal.reconcile(request.requestId, response(request, data)); assert.equal(result.state, "completed");
    assert.equal(result.result.data.uploadId, uploadId); assert.equal("grantAccess" in result.result.data, false);
    assert.equal((await f.journal.markUnknown(request.requestId)).state, "completed"); assert.equal((await f.journal.prepare(request)).mayDispatch, false);
  }
  for (const mutate of [v => { v.actor.sessionGeneration = laterSession; }, v => { v.actor.userId = otherUser; }, v => { v.requestId = id(800); },
    v => { v.data.upload.expectedSha256 = "b".repeat(64); }, v => { v.configurationDigest = laterDigest; }, v => { v.data.uri = "private"; }]) {
    const f = load(), request = input(); await f.journal.prepare(request); const invalid = response(request); mutate(invalid);
    await assert.rejects(f.journal.reconcile(request.requestId, invalid), expected("invalid_response"));
    assert.equal((await f.journal.list())[0].state, "prepared");
  }
});

test("fresh-session recovery requires the exact original command, session and full canonical payload", async () => {
  for (const mutate of [v => { v.data.recovery.originalSessionGeneration = laterSession; }, v => { v.data.recovery.originalPayload.title = "changed"; },
    v => { v.data.recovery.originalRequestId = id(800); }, v => { v.data.recovery.originalCommand = "upload.finalize"; }, v => { v.actor.accountId = otherUser; }]) {
    const f = load(), request = input(); await f.journal.prepare(request); await f.journal.markUnknown(request.requestId);
    const recovered = recovery(request); mutate(recovered.result);
    await assert.rejects(f.journal.reconcile(request.requestId, recovered.result, recovered.binding), expected("invalid_response"));
    assert.equal((await f.journal.list())[0].state, "unknown");
  }
  const f = load(), request = input(); await f.journal.prepare(request); await f.journal.markUnknown(request.requestId);
  const recovered = recovery(request); recovered.result.data.recovery.originalPayload = Object.fromEntries(Object.entries(recovered.result.data.recovery.originalPayload).reverse());
  const result = await f.journal.reconcile(request.requestId, recovered.result, recovered.binding);
  assert.equal(result.state, "completed"); assert.equal(result.sessionGeneration, sessionGeneration); assert.equal(result.result.observedSessionGeneration, laterSession);
});

test("unknown recovery never clears the replacement block and old completion cannot be undone by a delayed unknown", async () => {
  const f = load(), request = input(); await f.journal.prepare(request); const unknown = recovery(request, "unknown");
  assert.equal((await f.journal.reconcile(request.requestId, unknown.result, unknown.binding)).state, "unknown");
  await assert.rejects(f.journal.prepare(input(id(101))), expected("unresolved_attempt"));
  const found = recovery(request); await f.journal.reconcile(request.requestId, found.result, found.binding);
  assert.equal((await f.journal.reconcile(request.requestId, unknown.result, unknown.binding)).state, "completed");
});

test("only the fresh first ticket accepts the two exact pre-effect held outcomes", async () => {
  for (const [command, payload, reason] of [["upload.reserve", input().payload, "immutable_upload_route_unavailable"],
    ["offer.publish", { uploadId, expectedRevision: 1, amountMinor: 199, currency: "usd" }, "protocol3_catalog_unavailable"]]) {
    for (const mode of ["fresh", "unknown", "restart", "reopen", "malformed"]) {
      const f = load(), request = input(id(100), { command, payload }); await f.journal.prepare(request);
      if (mode === "unknown") await f.journal.markUnknown(request.requestId);
      if (mode === "malformed") await assert.rejects(f.journal.reconcile(request.requestId, {}), expected("invalid_response"));
      const journal = mode === "restart" ? load(f.storage).journal : mode === "reopen" ? f.createIsolatedPaidVideoV2AttemptJournal({ userId }) : f.journal;
      const result = await journal.reconcile(request.requestId, response(request, { reason }, { status: "held" }));
      assert.equal(result.state, mode === "fresh" ? "not_applied" : "unknown");
      assert.equal((await journal.prepare(request)).mayDispatch, false);
      if (mode === "fresh") assert.equal((await journal.prepare(input(id(101), { command, payload }))).mayDispatch, true);
      else await assert.rejects(journal.prepare(input(id(101), { command, payload })), expected("unresolved_attempt"));
    }
  }
});

test("pre-send stop is class-bound, exact, single-use and revoked by any uncertainty or observed response", async () => {
  const f = load(), request = input(), first = await f.journal.prepare(request);
  await assert.rejects(first.stopBeforeDispatch({ code: "authority_retired", requestId: request.requestId, outcome: "not_sent" }), expected("invalid_response"));
  await assert.rejects(first.stopBeforeDispatch(new f.Error("authority_retired", request.requestId, "unknown")), expected("invalid_response"));
  assert.equal((await first.stopBeforeDispatch(new f.Error("authority_retired", request.requestId, "not_sent"))).state, "not_applied");
  await assert.rejects(first.stopBeforeDispatch(new f.Error("authority_retired", request.requestId, "not_sent")), expected("invalid_response"));
  for (const mode of ["unknown", "malformed"]) {
    const next = load(), ticket = await next.journal.prepare(request);
    if (mode === "unknown") await next.createIsolatedPaidVideoV2AttemptJournal({ userId }).markUnknown(request.requestId);
    else await assert.rejects(next.createIsolatedPaidVideoV2AttemptJournal({ userId }).reconcile(request.requestId, {}), expected("invalid_response"));
    await assert.rejects(ticket.stopBeforeDispatch(new next.Error("invalid_request", request.requestId, "not_sent")), expected("invalid_response"));
  }
});

test("the native configuration is immutable in durable original context and independently bound on recovery", async () => {
  const f = load(), request = input(); await f.journal.prepare(request); await f.journal.markUnknown(request.requestId);
  await assert.rejects(f.journal.prepare({ ...request, configurationDigest: laterDigest }), expected("request_conflict"));
  const wrong = recovery(request); wrong.result.data.recovery.originalConfigurationDigest = laterDigest;
  await assert.rejects(f.journal.reconcile(request.requestId, wrong.result, wrong.binding), expected("invalid_response"));
  const found = recovery(request), completed = await f.journal.reconcile(request.requestId, found.result, found.binding);
  assert.equal(completed.configurationDigest, configurationDigest); assert.equal(completed.result.observedConfigurationDigest, laterDigest);
  assert.equal((await f.journal.prepare(request)).mayDispatch, false);
});

if (process.env.ISOLATED_PAID_VIDEO_V2_CAPTURES) test("actual PostgreSQL v2 mutation and recovery captures bind both original and current native configurations", async () => {
  const captures = JSON.parse(fs.readFileSync(process.env.ISOLATED_PAID_VIDEO_V2_CAPTURES, "utf8")).captures;
  let count = 0;
  for (const capture of captures) {
    if (!capture.input || !["upload.reserve", "upload.finalize", "offer.publish", "offer.retire", "upload.recover"].includes(capture.input.command)) continue;
    const { input: wire, result: actual } = capture, f = load(), journal = f.createIsolatedPaidVideoV2AttemptJournal({ userId: actual.actor.userId });
    let request, binding;
    if (wire.command === "upload.recover") {
      const original = actual.data.recovery, { protocol: _protocol, requestId, ...payload } = original.originalPayload;
      request = { command: original.originalCommand, requestId, payload, sessionGeneration: original.originalSessionGeneration, configurationDigest: original.originalConfigurationDigest };
      binding = { requestId: wire.requestId, sessionGeneration: wire.expectedSessionId, configurationDigest: wire.configurationDigest };
    } else request = { command: wire.command, requestId: wire.requestId, payload: wire.payload, sessionGeneration: wire.expectedSessionId, configurationDigest: wire.configurationDigest };
    await journal.prepare(request); if (binding) await journal.markUnknown(request.requestId);
    const result = await journal.reconcile(request.requestId, actual, binding);
    assert.equal(result.state, "completed"); assert.equal(result.configurationDigest, request.configurationDigest);
    assert.equal(result.sessionGeneration, request.sessionGeneration); assert.equal((await journal.prepare(request)).mayDispatch, false); count++;
  }
  assert.equal(count, 6);
});
