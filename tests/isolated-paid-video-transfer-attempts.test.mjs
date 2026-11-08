import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import vm from "node:vm";
import ts from "typescript";
import { objectVersionCorpus } from "./isolated-paid-video-object-version-corpus.mjs";
const compile = file => ts.transpileModule(fs.readFileSync(new URL(`../_lib/${file}.ts`, import.meta.url), "utf8"), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
}).outputText;
const clientSource = compile("isolatedPaidVideoV2"), transferSource = compile("isolatedPaidVideoTransfer"), journalSource = compile("isolatedPaidVideoTransferAttempts");
const id = n => `d0000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const userId = id(1), sessionGeneration = id(2), laterSession = id(3), otherUser = id(4), configurationDigest = "c".repeat(64), laterDigest = "d".repeat(64);
const upload = { id: `scpv_upload_${id(5)}`, incarnation: id(6), expectedSha256: "a".repeat(64), expectedByteLength: 4096 };
const clone = value => JSON.parse(JSON.stringify(value)), keyFor = user => `@chillywood/isolated-paid-video-transfers:v2:${user}`;
const input = (requestId = id(10), changes = {}) => ({ requestId, sessionGeneration, configurationDigest, upload: clone(upload), ...changes });
const binding = (changes = {}) => ({ sessionGeneration: laterSession, configurationDigest: laterDigest, ...changes });
const expected = code => error => { assert.equal(error.code, code); return true; };
function memory() { const values = new Map(); return { values, async getItem(k) { return values.get(k) ?? null; }, async setItem(k, v) { values.set(k, v); } }; }
function load(storage = memory()) {
  const api = { exports: {}, require: name => name === "react-native" ? { Platform: { OS: "ios" } } : {} }; vm.runInNewContext(clientSource, api);
  const transfer = { exports: {}, require: name => name === "./isolatedPaidVideoV2" ? api.exports : {} }; vm.runInNewContext(transferSource, transfer);
  const scope = { exports: {}, require: name => name === "./isolatedPaidVideoV2" ? api.exports : name === "./isolatedPaidVideoTransfer" ? transfer.exports : storage };
  vm.runInNewContext(journalSource, scope);
  return { ...scope.exports, Error: transfer.exports.IsolatedPaidVideoTransferError, storage,
    journal: scope.exports.createIsolatedPaidVideoTransferJournal({ userId }) };
}
const put = (request, state = "acknowledged") => ({ protocol: "scpv-transfer-v2", state, uploadId: request.upload.id, requestId: request.requestId, verificationRequired: true });
const receipt = (request, changes = {}) => ({ protocol: "scpv-object-receipt-v2", state: "recorded", uploadId: request.upload.id, userId,
  originalSessionId: request.sessionGeneration, originalConfigurationDigest: request.configurationDigest, requestId: request.requestId, transferId: id(20), incarnation: request.upload.incarnation,
  sha256: request.upload.expectedSha256, byteLength: request.upload.expectedByteLength, objectVersion: "private-version-1", ...changes });
function probe(request, current = binding(), changes = {}) {
  const now = current.now ?? Date.now(); const observation = { protocol: "scpv-object-observation-v2", userId, sessionId: current.sessionGeneration,
    uploadId: request.upload.id, requestId: request.requestId, transferId: id(20), originalSessionId: request.sessionGeneration,
    configurationDigest: current.configurationDigest, originalConfigurationDigest: request.configurationDigest, verifierId: id(21), incarnation: request.upload.incarnation, sha256: request.upload.expectedSha256,
    byteLength: request.upload.expectedByteLength, objectVersion: "private-version-1", checkedAtMs: now, expiresAtMs: now + 30_000, ...changes };
  return { protocol: "scpv-upload-probe-v2", state: "observed", observationRaw: JSON.stringify(observation), signature: "b".repeat(64) };
}

test("opaque version restart parity and one PUT opportunity require exact immutable persistence", async () => {
  for (const [objectVersion, valid] of objectVersionCorpus) {
    const f = load(), request = input(); await f.journal.prepare(request);
    if (valid) {
      await f.journal.recordProbe(request.requestId, probe(request, binding(), { objectVersion }), binding());
      const restarted = load(f.storage);
      assert.equal((await restarted.journal.list())[0].observation.objectVersion, objectVersion);
      await restarted.journal.recordReceipt(request.requestId, receipt(request, { objectVersion }), binding());
      const saved = (await load(f.storage).journal.list())[0];
      assert.equal(saved.receipt.objectVersion, objectVersion);
      assert.equal(saved.observation.objectVersion, objectVersion);
      assert.equal((await load(f.storage).journal.prepare(request)).mayPut, false);
    } else {
      await assert.rejects(f.journal.recordProbe(request.requestId, probe(request, binding(), { objectVersion }), binding()), expected("invalid_response"));
      await assert.rejects(f.journal.recordReceipt(request.requestId, receipt(request, { objectVersion }), binding()), expected("invalid_response"));
      // A tampered persisted observation must still fail on a fresh process.
      await f.journal.recordProbe(request.requestId, probe(request), binding());
      const document = JSON.parse(f.storage.values.get(keyFor(userId)));
      document.attempts[0].observation.objectVersion = objectVersion;
      f.storage.values.set(keyFor(userId), JSON.stringify(document));
      await assert.rejects(load(f.storage).journal.list(), expected("storage_corrupt"));
    }
  }
  // Keep the original persistence-before-dispatch regression in this group.
  const f = load(), request = input(); let release; const write = f.storage.setItem;
  f.storage.setItem = async (...args) => { await new Promise(done => { release = done; }); return write(...args); };
  let returned = false; const pending = f.journal.prepare(request).then(result => { returned = true; return result; }); request.upload.expectedByteLength++;
  await new Promise(done => setImmediate(done)); assert.equal(returned, false); release();
  const result = await pending; assert.equal(result.mayPut, true); assert.equal(result.attempt.upload.expectedByteLength, 4096); assert(Object.isFrozen(result.attempt.upload));
  assert.equal(JSON.parse(f.storage.values.get(keyFor(userId))).attempts[0].requestId, request.requestId);
  const repeated = await f.journal.prepare(input()); assert.equal(repeated.mayPut, false); assert.equal(repeated.stopBeforePut, null);
});

test("same-process concurrent owners serialize while different accounts have independent histories", async () => {
  const f = load(), results = await Promise.all(Array.from({ length: 10 }, () => f.createIsolatedPaidVideoTransferJournal({ userId }).prepare(input())));
  assert.equal(results.filter(r => r.mayPut).length, 1);
  assert.equal((await f.createIsolatedPaidVideoTransferJournal({ userId: otherUser }).prepare(input())).mayPut, true); assert.equal(f.storage.values.size, 2);
});

test("restart and A to B to A retain original session/configuration and cannot reissue an unknown PUT", async () => {
  const f = load(), request = input(); await f.journal.prepare(request); await f.journal.markUnknown(request.requestId);
  const restarted = load(f.storage), repeated = await restarted.journal.prepare({ ...request, sessionGeneration: laterSession });
  assert.equal(repeated.mayPut, false); assert.equal(repeated.attempt.sessionGeneration, sessionGeneration); assert.equal(repeated.attempt.configurationDigest, configurationDigest);
  await restarted.createIsolatedPaidVideoTransferJournal({ userId: otherUser }).prepare(input());
  assert.equal((await restarted.journal.prepare(request)).mayPut, false);
  await assert.rejects(restarted.journal.prepare(input(id(11))), expected("unresolved_attempt"));
  await assert.rejects(restarted.journal.prepare(input(id(10), { configurationDigest: laterDigest })), expected("request_conflict"));
  await assert.rejects(restarted.journal.prepare(input(id(10), { upload: { ...upload, incarnation: id(99) } })), expected("request_conflict"));
});

test("filesystem restart retains exact unknown transfer and recovers only through a bound server receipt", async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "paid-video-transfer-journal-"));
  const storage = { async getItem(k) { try { return await fs.promises.readFile(path.join(dir, encodeURIComponent(k)), "utf8"); } catch (error) { if (error.code === "ENOENT") return null; throw error; } },
    async setItem(k, v) { await fs.promises.writeFile(path.join(dir, encodeURIComponent(k)), v); } };
  try { const f = load(storage), request = input(); await f.journal.prepare(request); await f.journal.markUnknown(request.requestId);
    const fresh = load(storage); assert.equal((await fresh.journal.prepare(request)).mayPut, false);
    await fresh.journal.recordReceipt(request.requestId, receipt(request), binding());
    const after = load(storage), saved = (await after.journal.list())[0]; assert.equal(saved.state, "recorded"); assert.equal(saved.sessionGeneration, sessionGeneration);
    assert.equal((await after.journal.prepare(request)).mayPut, false);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test("PUT acknowledgement and signed-probe shape are not receipt, scan, grant or retry authority", async () => {
  const f = load(), request = input(); await f.journal.prepare(request);
  for (const state of ["unknown", "acknowledged", "exists_unverified"]) assert.equal((await f.journal.recordPut(request.requestId, put(request, state))).state, "unknown");
  const raw = probe(request), observed = await f.journal.recordProbe(request.requestId, raw, binding());
  assert.equal(observed.state, "unknown"); assert.equal(observed.receipt, null); assert.equal(observed.observation.transferId, id(20));
  const stored = f.storage.values.get(keyFor(userId)); assert.equal(stored.includes(raw.signature), false); assert.equal(stored.includes("observationRaw"), false);
  assert.equal(stored.includes("grantsAccess"), false); await assert.rejects(f.journal.prepare(input(id(11))), expected("unresolved_attempt"));
  const complete = await f.journal.recordReceipt(request.requestId, receipt(request), binding()); assert.equal(complete.state, "recorded");
  assert.equal((await f.journal.recordPut(request.requestId, put(request, "unknown"))).state, "recorded");
  assert.equal((await f.journal.markUnknown(request.requestId)).state, "recorded");
  await assert.rejects(f.journal.prepare(input(id(11))), expected("request_conflict"));
  assert.equal((await f.journal.prepare(input(id(11), { upload: { ...upload, id: `scpv_upload_${id(12)}` } }))).mayPut, true);
});

test("receipt and observation reject every wrong immutable field or current probe binding", async () => {
  for (const change of [{ userId: otherUser }, { originalSessionId: laterSession }, { originalConfigurationDigest: laterDigest }, { requestId: id(90) }, { uploadId: `scpv_upload_${id(90)}` },
    { incarnation: id(90) }, { sha256: "e".repeat(64) }, { byteLength: 4097 }, { objectVersion: "null" }, { signedUrl: "https://private.invalid" }]) {
    const f = load(), request = input(); await f.journal.prepare(request);
    await assert.rejects(f.journal.recordReceipt(request.requestId, receipt(request, change), binding()), expected("invalid_response"));
    assert.equal((await f.journal.list())[0].state, "prepared");
  }
  for (const change of [{ sessionId: sessionGeneration }, { configurationDigest }, { originalConfigurationDigest: laterDigest }, { originalSessionId: laterSession }, { userId: otherUser }, { expiresAtMs: 1 }, { checkedAtMs: Date.now() + 60_000 }]) {
    const f = load(), request = input(); await f.journal.prepare(request);
    await assert.rejects(f.journal.recordProbe(request.requestId, probe(request, binding(), change), binding()), expected("invalid_response"));
  }
});

test("conflicting object version or transfer identity cannot replace a retained observation or receipt", async () => {
  for (const change of [{ objectVersion: "replaced-version" }, { transferId: id(90) }]) {
    const f = load(), request = input(); await f.journal.prepare(request); await f.journal.recordProbe(request.requestId, probe(request), binding());
    await assert.rejects(f.journal.recordReceipt(request.requestId, receipt(request, change), binding()), expected("invalid_response"));
    await f.journal.recordReceipt(request.requestId, receipt(request), binding());
    await assert.rejects(f.journal.recordReceipt(request.requestId, receipt(request, change), binding()), expected("invalid_response"));
    await assert.rejects(f.journal.recordProbe(request.requestId, probe(request, binding(), change), binding()), expected("invalid_response"));
    assert.equal((await f.journal.list())[0].receipt.objectVersion, "private-version-1");
  }
});

test("older probe snapshots do not overwrite newer retained observations", async () => {
  const f = load(), request = input(), start = Date.now(); await f.journal.prepare(request);
  await f.journal.recordProbe(request.requestId, probe(request, binding({ now: start + 1000 })), binding({ now: start + 1000 }));
  const retained = await f.journal.recordProbe(request.requestId, probe(request, binding({ now: start })), binding({ now: start }));
  assert.equal(retained.observation.checkedAtMs, start + 1000);
});

test("fresh pre-send no-effect closure is class-bound, one-use and revoked by any reply or uncertainty", async () => {
  for (const code of ["invalid_request", "authority_retired", "capability_unavailable"]) {
    const f = load(), request = input(), first = await f.journal.prepare(request);
    await assert.rejects(first.stopBeforePut({ code, requestId: request.requestId, outcome: "not_sent" }), expected("invalid_response"));
    await assert.rejects(first.stopBeforePut(new f.Error(code, request.requestId, "unknown")), expected("invalid_response"));
    assert.equal((await first.stopBeforePut(new f.Error(code, request.requestId, "not_sent"))).state, "not_applied");
    await assert.rejects(first.stopBeforePut(new f.Error(code, request.requestId, "not_sent")), expected("invalid_response"));
    assert.equal((await f.journal.prepare(request)).mayPut, false); assert.equal((await f.journal.prepare(input(id(11)))).mayPut, true);
  }
  for (const mode of ["unknown", "malformed", "put"]) {
    const f = load(), request = input(), first = await f.journal.prepare(request);
    if (mode === "unknown") await f.journal.markUnknown(request.requestId);
    if (mode === "malformed") await assert.rejects(f.journal.recordReceipt(request.requestId, {}, binding()), expected("invalid_response"));
    if (mode === "put") await f.journal.recordPut(request.requestId, put(request));
    await assert.rejects(first.stopBeforePut(new f.Error("capability_unavailable", request.requestId, "not_sent")), expected("invalid_response"));
  }
});

test("failed save, partial commit or failed readback retires all same-runtime writers without repair", async () => {
  for (const mode of ["reject", "partial", "drop", "readback"]) {
    const backing = memory(); let broken = true, writes = 0;
    const storage = { async getItem(k) { if (broken && writes && mode === "readback") throw Error("readback"); return backing.getItem(k); },
      async setItem(k, v) { writes++; if (mode === "partial" || mode === "readback") await backing.setItem(k, v); if (broken && ["reject", "partial"].includes(mode)) throw Error("write"); } };
    const f = load(storage); await assert.rejects(f.journal.prepare(input()), expected("storage_unavailable")); const retained = backing.values.get(keyFor(userId)), count = writes; broken = false;
    await assert.rejects(f.createIsolatedPaidVideoTransferJournal({ userId }).prepare(input(id(11))), expected("storage_unavailable"));
    assert.equal(writes, count); assert.equal(backing.values.get(keyFor(userId)), retained);
    if (retained) assert.equal((await load(backing).journal.prepare(input())).mayPut, false);
  }
});

test("corrupt storage, duplicate transfers, injected secrets and invalid input fail closed", async () => {
  for (const change of [raw => "{", raw => raw.replace(userId, otherUser), raw => raw.replace('"prepared"', '"recorded"'),
    raw => { const v = JSON.parse(raw); v.attempts.push(v.attempts[0]); return JSON.stringify(v); },
    raw => raw.replace('"receipt":null', '"receipt":{"grantsAccess":true}')]) {
    const f = load(); await f.journal.prepare(input()); const invalid = change(f.storage.values.get(keyFor(userId))); f.storage.values.set(keyFor(userId), invalid);
    await assert.rejects(f.journal.list(), expected("storage_corrupt")); await assert.rejects(f.journal.prepare(input(id(11))), expected("storage_corrupt")); assert.equal(f.storage.values.get(keyFor(userId)), invalid);
  }
  const f = load(); for (const request of [{ ...input(), bytes: "private" }, { ...input(), upload: { ...upload, uri: "file:///private.mp4" } },
    input(id(10), { configurationDigest: "bad" }), input(id(10), { upload: { ...upload, expectedByteLength: 16_777_217 } })])
    await assert.rejects(f.journal.prepare(request), expected("invalid_request"));
  assert.equal(f.storage.values.size, 0);
});

test("lost receipt persistence acknowledgement retires writers while restart reads only the actually retained receipt", async () => {
  const backing = memory(); let writes = 0, broken = false;
  const storage = { async getItem(k) { if (broken) throw Error("readback lost"); return backing.getItem(k); },
    async setItem(k, value) { writes++; await backing.setItem(k, value); if (writes === 2) broken = true; } };
  const f = load(storage), request = input(); await f.journal.prepare(request);
  await assert.rejects(f.journal.recordReceipt(request.requestId, receipt(request), binding()), expected("storage_unavailable"));
  const retained = backing.values.get(keyFor(userId)); broken = false;
  await assert.rejects(f.createIsolatedPaidVideoTransferJournal({ userId }).prepare(input(id(11), { upload: { ...upload, id: `scpv_upload_${id(12)}` } })), expected("storage_unavailable"));
  assert.equal(writes, 2); assert.equal(backing.values.get(keyFor(userId)), retained);
  const restarted = load(backing), prior = (await restarted.journal.list())[0]; assert.equal(prior.state, "recorded");
  assert.equal(prior.receipt.requestId, request.requestId); assert.equal((await restarted.journal.prepare(request)).mayPut, false);
});

const retainedBinding = (request = input()) => ({ requestId: id(100), uploadId: request.upload.id, currentSessionGeneration: laterSession, currentConfigurationDigest: laterDigest });
function retainedResponse(request = input(), transfer = undefined) {
  const b = retainedBinding(request); return { protocol: "isolated-paid-video-v2", command: "upload.read", requestId: b.requestId,
    actor: { userId, accountId: userId, sessionGeneration: b.currentSessionGeneration }, status: "ok", configurationDigest: b.currentConfigurationDigest,
    capabilityExpiresAtMs: Date.now() + 1000, data: { upload: { ...request.upload, title: "Retained draft", resourceId: `scv1_resource_${id(30)}`, assetId: `scv1_asset_${id(31)}`,
      state: "reserved", bytesClean: false, moderation: "unreviewed", profile: "scpv-mp4-h264-aac-v1", expiresAt: "2027-01-01T00:00:00Z", transferAvailable: false, checkoutAvailable: false },
    transfer: transfer === undefined ? { requestId: request.requestId, originalSessionId: request.sessionGeneration, configurationDigest: request.configurationDigest } : transfer } };
}
test("new-device retained descriptor adoption creates only read-only unknown recovery without a fresh PUT opportunity", async () => {
  const f = load(), request = input(), adopted = await f.journal.adoptRetained(retainedResponse(request), retainedBinding(request));
  assert.equal(adopted.mayPut, false); assert.equal(adopted.stopBeforePut, null); assert.equal(adopted.attempt.state, "unknown");
  assert.equal(adopted.attempt.sessionGeneration, request.sessionGeneration); assert.equal(adopted.attempt.configurationDigest, request.configurationDigest);
  assert.equal((await f.journal.prepare(request)).mayPut, false); await assert.rejects(f.journal.prepare(input(id(11))), expected("unresolved_attempt"));
  const second = input(id(11), { upload: { ...upload, id: `scpv_upload_${id(12)}` } });
  assert.equal((await f.journal.adoptRetained(retainedResponse(second), retainedBinding(second))).mayPut, false);
  assert.equal((await f.journal.list()).length, 2);
  await f.journal.recordReceipt(request.requestId, receipt(request), binding()); assert.equal((await f.journal.list())[0].state, "recorded");
});
test("null retained descriptor gives no absence proof and wrong response/descriptor identity cannot overwrite history", async () => {
  const f = load(), request = input(); const empty = await f.journal.adoptRetained(retainedResponse(request, null), retainedBinding(request));
  assert.equal(empty.attempt, null); assert.equal(empty.mayPut, false); assert.equal(f.storage.values.size, 0);
  await f.journal.adoptRetained(retainedResponse(request), retainedBinding(request));
  for (const mutate of [v => { v.actor.userId = otherUser; }, v => { v.requestId = id(99); }, v => { v.data.upload.id = `scpv_upload_${id(99)}`; }]) {
    const wrong = retainedResponse(request); mutate(wrong); await assert.rejects(f.journal.adoptRetained(wrong, retainedBinding(request)), expected("invalid_response"));
  }
  for (const mutate of [v => { v.data.transfer.originalSessionId = laterSession; }, v => { v.data.transfer.configurationDigest = laterDigest; }, v => { v.data.upload.incarnation = id(99); }]) {
    const wrong = retainedResponse(request); mutate(wrong); await assert.rejects(f.journal.adoptRetained(wrong, retainedBinding(request)), expected("request_conflict"));
  }
  assert.equal((await f.journal.list())[0].sessionGeneration, sessionGeneration);
});
test("adopting the matching server descriptor revokes any unused local first-PUT closure", async () => {
  const f = load(), request = input(), first = await f.journal.prepare(request);
  const recovered = await f.journal.adoptRetained(retainedResponse(request), retainedBinding(request)); assert.equal(recovered.attempt.state, "unknown");
  await assert.rejects(first.stopBeforePut(new f.Error("authority_retired", request.requestId, "not_sent")), expected("invalid_response"));
  assert.equal((await f.journal.prepare(request)).mayPut, false);
});

if (process.env.ISOLATED_PAID_VIDEO_V2_CAPTURES) test("actual gateway unknown PUT, probe and immutable receipts traverse the durable journal without fabricated transfer success", async () => {
  const captures = JSON.parse(fs.readFileSync(process.env.ISOLATED_PAID_VIDEO_V2_CAPTURES, "utf8")).captures;
  const reservations = captures.filter(c => c.input?.command === "upload.reserve"), owners = new Map(); let positives = 0, rejected = 0;
  for (const c of captures.filter(c => c.kind === "upload")) {
    let owner = owners.get(c.uploadId);
    if (!owner) {
      const reserve = reservations.find(r => r.result.data.upload.id === c.uploadId); assert.ok(reserve); const u = reserve.result.data.upload;
      const request = { requestId: c.requestId, sessionGeneration: reserve.input.expectedSessionId, configurationDigest: reserve.input.configurationDigest,
        upload: { id: u.id, incarnation: u.incarnation, expectedSha256: u.expectedSha256, expectedByteLength: u.expectedByteLength } };
      const f = load(), journal = f.createIsolatedPaidVideoTransferJournal({ userId: reserve.result.actor.userId }); await journal.prepare(request);
      owner = { request, journal }; owners.set(c.uploadId, owner);
    }
    const { request, journal } = owner, current = { sessionGeneration: request.sessionGeneration, configurationDigest: request.configurationDigest };
    if (c.result.protocol === "scpv-transfer-v2") { assert.equal((await journal.recordPut(request.requestId, c.result)).state, "unknown"); positives++; }
    else if (c.result.protocol === "scpv-upload-probe-v2") { const parsed = JSON.parse(c.result.observationRaw); await journal.recordProbe(request.requestId, c.result,
      { sessionGeneration: parsed.sessionId, configurationDigest: parsed.configurationDigest, now: parsed.checkedAtMs }); positives++; }
    else if (c.result.protocol === "scpv-object-receipt-v2") { assert.equal((await journal.recordReceipt(request.requestId, c.result, current)).state, "recorded"); positives++; }
    else { await assert.rejects(journal.recordReceipt(request.requestId, c.result, current), expected("invalid_response")); await journal.markUnknown(request.requestId); rejected++; }
    assert.equal((await journal.prepare(request)).mayPut, false);
  }
  assert.equal(positives, 8); assert.equal(rejected, 6); assert.equal(owners.size, 2);
  assert.equal((await [...owners.values()][1].journal.list())[0].state, "unknown");
});
if (process.env.ISOLATED_PAID_VIDEO_V2_CAPTURES) test("actual owner transfer descriptor recovers missing local history and cross-profile receipt without any PUT", async () => {
  const captures = JSON.parse(fs.readFileSync(process.env.ISOLATED_PAID_VIDEO_V2_CAPTURES, "utf8")).captures;
  const retained = captures.find(c => c.input?.command === "upload.read" && c.result.data.transfer !== null); assert.ok(retained);
  const f = load(), journal = f.createIsolatedPaidVideoTransferJournal({ userId: retained.result.actor.userId });
  const adopted = await journal.adoptRetained(retained.result, { requestId: retained.input.requestId, uploadId: retained.input.payload.uploadId,
    currentSessionGeneration: retained.input.expectedSessionId, currentConfigurationDigest: retained.input.configurationDigest });
  assert.equal(adopted.mayPut, false); assert.equal(adopted.stopBeforePut, null); assert.equal(adopted.attempt.state, "unknown");
  const probe = captures.find(c => c.result?.protocol === "scpv-upload-probe-v2"
    && JSON.parse(c.result.observationRaw).configurationDigest !== adopted.attempt.configurationDigest); assert.ok(probe);
  const observation = JSON.parse(probe.result.observationRaw), current = { sessionGeneration: observation.sessionId, configurationDigest: observation.configurationDigest, now: observation.checkedAtMs };
  await journal.recordProbe(adopted.attempt.requestId, probe.result, current);
  const receipt = captures.find(c => c.result?.protocol === "scpv-object-receipt-v2" && c.result.uploadId === adopted.attempt.upload.id); assert.ok(receipt);
  const recorded = await journal.recordReceipt(adopted.attempt.requestId, receipt.result, current);
  assert.equal(recorded.state, "recorded"); assert.equal(recorded.configurationDigest, retained.result.data.transfer.configurationDigest);
  assert.equal((await journal.prepare({ requestId: recorded.requestId, sessionGeneration: recorded.sessionGeneration, configurationDigest: recorded.configurationDigest, upload: recorded.upload })).mayPut, false);
});
