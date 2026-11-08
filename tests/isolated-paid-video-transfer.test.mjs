import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import test from "node:test";
import ts from "typescript";
import { objectVersionCorpus } from "./isolated-paid-video-object-version-corpus.mjs";
import { isS3ObjectVersion } from "../ops/isolated-paid-video-worker/private-object.mjs";
const uuid = n => `d0000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const A = { userId: uuid(1), accountId: uuid(1), sessionGeneration: uuid(2), restoreOnly: false }, B = { ...A, userId: uuid(3), accountId: uuid(3), sessionGeneration: uuid(4) };
const upload = { id: `scpv_upload_${uuid(10)}`, incarnation: uuid(11), expectedSha256: "a".repeat(64), expectedByteLength: 4 };
const binding = { userId: A.userId, sessionGeneration: A.sessionGeneration, originalSessionId: A.sessionGeneration, originalConfigurationDigest: "b".repeat(64), configurationDigest: "b".repeat(64), requestId: uuid(12), upload };
const copy = value => JSON.parse(JSON.stringify(value)), deferred = () => { let resolve; const promise = new Promise(done => { resolve = done; }); return { promise, resolve }; };
const receipt = c => ({ protocol: "scpv-object-receipt-v2", state: "recorded", uploadId: c.upload.id, userId: c.userId, originalSessionId: c.originalSessionId, originalConfigurationDigest: c.originalConfigurationDigest,
  requestId: c.requestId, transferId: uuid(14), incarnation: c.upload.incarnation, sha256: c.upload.expectedSha256, byteLength: c.upload.expectedByteLength, objectVersion: "version_1" });
const probe = c => ({ protocol: "scpv-upload-probe-v2", state: "observed", signature: "c".repeat(64), observationRaw: JSON.stringify({
  protocol: "scpv-object-observation-v2", userId: c.userId, sessionId: c.sessionGeneration, uploadId: c.upload.id, requestId: c.requestId, transferId: uuid(14),
  originalSessionId: c.originalSessionId, originalConfigurationDigest: c.originalConfigurationDigest, configurationDigest: c.configurationDigest, verifierId: uuid(15), incarnation: c.upload.incarnation,
  sha256: c.upload.expectedSha256, byteLength: c.upload.expectedByteLength, objectVersion: "version_1", checkedAtMs: c.now ?? Date.now(), expiresAtMs: (c.now ?? Date.now()) + 25000 }) });
function fixture() {
  let current = A, readWait = null, responseWait = null, available = true, stale = false, mismatch = false, failure = false;
  const calls = [], listeners = new Set(); let reply = () => ({ protocol: "scpv-transfer-v2", state: "acknowledged", uploadId: upload.id, requestId: binding.requestId, verificationRequired: true });
  const same = (a, b) => !!a && !!b && ["userId", "accountId", "sessionGeneration", "restoreOnly"].every(k => a[k] === b[k]);
  const isUuid = v => typeof v === "string" && /^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/u.test(v);
  const bindings = { "./supabase": { SUPABASE_URL: "https://isolated.invalid", SUPABASE_ANON_KEY: "public-fixture" },
    "./accountSessionAuthority": { getCurrentAccountSessionAuthoritySnapshot: () => current, sameAccountSessionAuthority: same,
      subscribeToAccountSessionAuthority(fn) { listeners.add(fn); return () => listeners.delete(fn); } },
    "./accountBoundSupabaseMutation": { async captureAccountBoundSupabaseMutationSubject() { return { authority: current, accessToken: "exact-current-token" }; } },
    "./isolatedPaidVideoV2": { paidVideoUuid: isUuid, paidVideoId: (v, kind) => typeof v === "string" && v.startsWith(kind === "upload" ? "scpv_upload_" : `scv1_${kind}_`) && isUuid(v.slice((kind === "upload" ? "scpv_upload_" : `scv1_${kind}_`).length)),
      newPaidVideoV2RequestId: () => uuid(30), async captureIsolatedPaidVideoV2Client() { return { configurationDigest: binding.configurationDigest, dispose() {}, async request(command, requestId, payload) {
        calls.push({ method: "READ_CAPABILITY", command, requestId, payload }); if (readWait) await readWait.promise;
        return { status: "ok", capabilityExpiresAtMs: Date.now() + (stale ? -1 : 4000), data: { upload: { ...upload, expectedSha256: mismatch ? "f".repeat(64) : upload.expectedSha256,
          transferAvailable: available, state: "reserved", expiresAt: new Date(Date.now() + 300000).toISOString() } } };
      } }; } } };
  const scope = { exports: {}, Error, Uint8Array, require(name) { assert.ok(name in bindings, name); return bindings[name]; }, fetch: async (url, options) => {
    calls.push({ method: options.method, url, headers: copy(options.headers), body: typeof options.body === "string" ? options.body : options.body ? [...options.body] : undefined });
    if (responseWait) await responseWait.promise; if (failure) throw Error("network loss"); return { ok: true, json: async () => reply(options.method) };
  } };
  vm.runInNewContext(ts.transpileModule(fs.readFileSync(new URL("../_lib/isolatedPaidVideoTransfer.ts", import.meta.url), "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText, scope);
  return { api: scope.exports, calls, change(value) { current = value; for (const fn of listeners) fn(value); }, reply(fn) { reply = fn; },
    unavailable() { available = false; }, stale() { stale = true; }, mismatch() { mismatch = true; }, fail() { failure = true; },
    delayRead() { readWait = deferred(); return readWait; }, delayResponse() { responseWait = deferred(); return responseWait; } };
}
test("opaque versions preserve server parity and one PUT requires an exact immutable capability", async () => {
  const { api } = fixture(), context = { ...binding, now: 100000 };
  for (const [objectVersion, valid] of objectVersionCorpus) {
    assert.equal(api.isPaidVideoS3ObjectVersion(objectVersion), valid);
    assert.equal(api.isPaidVideoS3ObjectVersion(objectVersion), isS3ObjectVersion(objectVersion));
    const value = { ...receipt(context), objectVersion }, signed = probe(context);
    const observation = { ...JSON.parse(signed.observationRaw), objectVersion };
    const observed = { ...signed, observationRaw: JSON.stringify(observation) };
    if (valid) {
      assert.equal(api.parsePaidVideoV2ObjectReceipt(value, context).objectVersion, objectVersion);
      assert.equal(JSON.parse(api.parsePaidVideoV2ProbeResponse(observed, context).observationRaw).objectVersion, objectVersion);
    } else {
      assert.throws(() => api.parsePaidVideoV2ObjectReceipt(value, context));
      assert.throws(() => api.parsePaidVideoV2ProbeResponse(observed, context));
    }
  }
  // Keep the original one-PUT capability and identity regression in this group.
  const f = fixture(), client = await f.api.capturePaidVideoV2TransferClient(A), wait = f.delayRead(), bytes = new Uint8Array([1, 2, 3, 4]);
  const pending = client.put(binding, bytes); bytes.fill(9); wait.resolve(); const result = await pending;
  assert.equal(result.state, "acknowledged"); assert.equal(result.verificationRequired, true); assert.deepEqual(f.calls.map(c => c.method), ["READ_CAPABILITY", "PUT"]);
  const sent = f.calls[1]; assert.deepEqual(sent.body, [1, 2, 3, 4]); assert.equal(sent.headers["Content-Length"], "4"); assert.equal(sent.headers["Content-Type"], "video/mp4");
  assert.equal(sent.headers.Authorization, "Bearer exact-current-token"); assert.equal(sent.headers["x-chillywood-request-id"], binding.requestId);
  assert.equal(sent.headers["x-chillywood-native-configuration"], binding.configurationDigest); assert.equal(sent.headers["x-chillywood-auth-session"], A.sessionGeneration);
  assert.equal(sent.url, `https://isolated.invalid/functions/v1/isolated-paid-video-upload-v2/${upload.id}`);
  await assert.rejects(client.put(binding, bytes), e => e.outcome === "not_sent"); assert.equal(f.calls.length, 2); client.dispose();
});
test("unavailable, expired, changed incarnation/bytes or foreign original session never enter PUT", async () => {
  for (const change of [f => f.unavailable(), f => f.stale(), f => f.mismatch()]) {
    const f = fixture(), client = await f.api.capturePaidVideoV2TransferClient(A); change(f);
    await assert.rejects(client.put(binding, new Uint8Array(4)), e => e.code === "capability_unavailable" && e.outcome === "not_sent");
    assert.equal(f.calls.some(c => c.method === "PUT"), false); client.dispose();
  }
  const f = fixture(), c = await f.api.capturePaidVideoV2TransferClient(A);
  await assert.rejects(c.put({ ...binding, originalSessionId: uuid(80) }, new Uint8Array(4)), e => e.outcome === "not_sent"); assert.equal(f.calls.length, 0); c.dispose();
});
test("network uncertainty consumes PUT forever in the old client and never claims uploaded bytes", async () => {
  const f = fixture(), c = await f.api.capturePaidVideoV2TransferClient(A); f.fail();
  await assert.rejects(c.put(binding, new Uint8Array(4)), e => e.outcome === "unknown");
  await assert.rejects(c.put(binding, new Uint8Array(4)), e => e.outcome === "not_sent"); assert.equal(f.calls.filter(x => x.method === "PUT").length, 1); c.dispose();
});
test("A to B to A before PUT permanently retires the owner; after PUT the outcome stays unknown", async () => {
  for (const stage of ["read", "put"]) {
    const f = fixture(), c = await f.api.capturePaidVideoV2TransferClient(A), wait = stage === "read" ? f.delayRead() : f.delayResponse();
    const pending = c.put(binding, new Uint8Array(4)); for (let i = 0; i < 5; i++) await Promise.resolve();
    f.change(B); f.change(A); wait.resolve(); await assert.rejects(pending, e => e.code === "authority_retired" && e.outcome === (stage === "read" ? "not_sent" : "unknown"));
    await assert.rejects(c.probe(binding)); c.dispose();
  }
});
test("fresh session recovery uses GET and the original transfer identity; signed probe cannot count as receipt", async () => {
  const f = fixture(), current = { ...A, sessionGeneration: uuid(50) }; f.change(current); const c = await f.api.capturePaidVideoV2TransferClient(current);
  const context = { ...binding, sessionGeneration: current.sessionGeneration }; f.reply(() => probe(context));
  const observed = await c.probe(context); assert.equal(observed.protocol, "scpv-upload-probe-v2"); assert.equal("objectVersion" in observed, false);
  assert.equal(f.calls[0].method, "GET"); assert.equal(f.calls[0].headers["x-chillywood-request-id"], binding.requestId);
  assert.equal(f.calls[0].headers["x-chillywood-auth-session"], current.sessionGeneration);
  f.reply(() => receipt(context)); const recorded = await c.reconcile(context, observed);
  assert.equal(recorded.originalSessionId, A.sessionGeneration); assert.equal(f.calls[1].method, "POST"); assert.deepEqual(JSON.parse(f.calls[1].body), { protocol: "scpv-reconcile-v2", observationRaw: observed.observationRaw, signature: observed.signature });
  await assert.rejects(c.reconcile(context, observed)); await c.probe(context); assert.equal(f.calls.at(-1).method, "GET"); c.dispose();
});
test("receipt validation rejects altered ownership, bytes, original session, identity and invented access", () => {
  const { api } = fixture(); assert.equal(api.parsePaidVideoV2ObjectReceipt(receipt(binding), binding).state, "recorded");
  for (const mutate of [v => { v.userId = B.userId; }, v => { v.originalSessionId = uuid(90); }, v => { v.incarnation = uuid(90); }, v => { v.sha256 = "f".repeat(64); },
    v => { v.byteLength++; }, v => { v.objectVersion = "null"; }, v => { v.requestId = uuid(90); }, v => { v.grantsAccess = true; }]) {
    const value = receipt(binding); mutate(value); assert.throws(() => api.parsePaidVideoV2ObjectReceipt(value, binding));
  }
});
test("probe validation binds current and original session, digest and bounded expiry without verifying HMAC locally", () => {
  const { api } = fixture(), context = { ...binding, now: 100000 }, value = probe(context);
  assert.equal(api.parsePaidVideoV2ProbeResponse(value, context).signature, value.signature);
  for (const mutate of [v => { v.sessionId = uuid(80); }, v => { v.originalSessionId = uuid(80); }, v => { v.configurationDigest = "f".repeat(64); },
    v => { v.expiresAtMs = context.now; }, v => { v.expiresAtMs = v.checkedAtMs + 30001; }, v => { v.bucket = "foreign"; }]) {
    const parsed = JSON.parse(value.observationRaw); mutate(parsed); assert.throws(() => api.parsePaidVideoV2ProbeResponse({ ...value, observationRaw: JSON.stringify(parsed) }, context));
  }
});
if (process.env.ISOLATED_PAID_VIDEO_V2_FIXTURE) test("actual gateway transfer, probe and receipt captures cross the strict parser with exact preserved upload tuple", () => {
  const { api } = fixture(), captures = JSON.parse(fs.readFileSync(process.env.ISOLATED_PAID_VIDEO_V2_FIXTURE, "utf8")).captures; let passed = 0, rejected = 0;
  for (const entry of captures.filter(x => x.kind === "upload")) {
    const author = captures.find(x => x.input?.command === "upload.reserve" && x.result.data.upload.id === entry.uploadId); assert.ok(author);
    const source = author.result.data.upload, observation = entry.result.observationRaw ? JSON.parse(entry.result.observationRaw) : null;
    const context = { userId: author.result.actor.userId, sessionGeneration: observation?.sessionId ?? author.result.actor.sessionGeneration,
      originalSessionId: observation?.originalSessionId ?? author.result.actor.sessionGeneration, originalConfigurationDigest: author.input.configurationDigest, configurationDigest: observation?.configurationDigest ?? author.input.configurationDigest,
      requestId: entry.requestId, upload: { id: source.id, incarnation: source.incarnation, expectedSha256: source.expectedSha256, expectedByteLength: source.expectedByteLength },
      ...(observation ? { now: observation.checkedAtMs } : {}) };
    const parser = entry.result.protocol === "scpv-transfer-v2" ? api.parsePaidVideoV2TransferResponse : entry.result.protocol === "scpv-upload-probe-v2" ? api.parsePaidVideoV2ProbeResponse : api.parsePaidVideoV2ObjectReceipt;
    if (entry.status === 200) { parser(entry.result, context); passed++; } else { assert.throws(() => parser(entry.result, context)); rejected++; }
  } assert.equal(passed, 8); assert.equal(rejected, 6);
});
