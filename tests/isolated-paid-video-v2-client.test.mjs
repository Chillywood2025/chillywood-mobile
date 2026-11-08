import assert from "node:assert/strict";
import test from "node:test";
import fs from "node:fs";
import vm from "node:vm";
import ts from "typescript";
const uuid = n => `a0000000-0000-4000-8000-${String(n).padStart(12, "0")}`, clone = value => JSON.parse(JSON.stringify(value));
const A = { userId: uuid(1), accountId: uuid(1), sessionGeneration: uuid(2), restoreOnly: false };
const B = { userId: uuid(3), accountId: uuid(3), sessionGeneration: uuid(4), restoreOnly: false };
const actor = a => ({ userId: a.userId, accountId: a.accountId, sessionGeneration: a.sessionGeneration });
const deferred = () => { let resolve; const promise = new Promise(done => { resolve = done; }); return { promise, resolve }; };
function fixture() {
  let nativeAvailable = true; let current = A, transport = null, captureWait = null; const listeners = new Set(), calls = [];
  const same = (a, b) => !!a && !!b && ["userId", "accountId", "sessionGeneration", "restoreOnly"].every(k => a[k] === b[k]);
  const bindings = { "./isolatedTestStoreV3Build": { readIsolatedTestStoreV3Build: () => nativeAvailable ? {configId:"a".repeat(64)} : null }, "react-native-get-random-values": {}, "react-native": { Platform: { OS: "ios" } }, "./supabase": { SUPABASE_URL: "https://isolated.invalid", SUPABASE_ANON_KEY: "public-source-fixture" },
    "./accountSessionAuthority": { getCurrentAccountSessionAuthoritySnapshot: () => current, sameAccountSessionAuthority: same,
      subscribeToAccountSessionAuthority(fn) { listeners.add(fn); return () => listeners.delete(fn); } },
    "./accountBoundSupabaseMutation": { async captureAccountBoundSupabaseMutationSubject() { if (captureWait) await captureWait.promise; return { authority: current, accessToken: "captured-fixture-token" }; } } };
  const scope = { exports: {}, Error, require(name) { assert.ok(name in bindings, `Unmodeled import ${name}`); return bindings[name]; }, fetch: async (url, options) => {
    const body = JSON.parse(options.body); calls.push({ url, options, body }); assert.ok(transport, "Transport must be modeled explicitly"); return transport(body);
  } };
  vm.runInNewContext(ts.transpileModule(fs.readFileSync(new URL("../_lib/isolatedPaidVideoV2.ts", import.meta.url), "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText, scope);
  return { api: scope.exports, calls, unavailable() { nativeAvailable=false; },
    change(value) { current = value; for (const listener of listeners) listener(value); }, setTransport(fn) { transport = fn; },
    delayCapture() { captureWait = deferred(); return captureWait; },
  };
}
function capability(api, requestId, expected = A) { return { protocol: "isolated-paid-video-v2", command: "capability.read", requestId, status: "ok", actor: actor(expected), configurationDigest: "a".repeat(64), capabilityExpiresAtMs: Date.now()+4000,
  data: { creatorEligible: true, uploadRouteAvailable: false, transferAvailable: false, checkoutAvailable: false, profile: clone(api.PAID_VIDEO_PROFILE) } }; }
const payload = { title: "Private sample", expectedSha256: "a".repeat(64), expectedByteLength: 100 };
function held(requestId, expected = A) { return { protocol: "isolated-paid-video-v2", command: "upload.reserve", requestId, status: "held", actor: actor(expected), configurationDigest: "a".repeat(64), capabilityExpiresAtMs: Date.now()+4000, data: { reason: "immutable_upload_route_unavailable" } }; }

test("Paid Video requests reject legacy identities, extra authority and unsupported byte profiles before transport", async () => {
  const f = fixture(), c = await f.api.captureIsolatedPaidVideoV2Client(A);
  for (const p of [{ ...payload, signedUrl: "https://foreign.invalid" }, { ...payload, expectedByteLength: 16777217 }, { ...payload, expectedSha256: "bad" }, { ...payload, title: " " }])
    await assert.rejects(c.request("upload.reserve", uuid(10), p), e => e.outcome === "not_sent");
  await assert.rejects(c.request("upload.finalize", uuid(11), { uploadId: "legacy-video-123" }));
  await assert.rejects(c.request("offer.publish", uuid(12), { uploadId: `scpv_upload_${uuid(9)}`, expectedRevision: 1, amountMinor: true, currency: "usd" }));
  assert.equal(f.calls.length, 0); c.dispose();
});
test("exact token/session transport sends only the new authoring envelope and never retries a used mutation", async () => {
  const f = fixture(), c = await f.api.captureIsolatedPaidVideoV2Client(A); f.setTransport(body => ({ ok: true, json: async () => held(body.requestId) }));
  const response = await c.request("upload.reserve", uuid(10), payload); assert.equal(response.status, "held");
  assert.equal(f.calls[0].url, "https://isolated.invalid/functions/v1/isolated-paid-video-authoring-v2");
  assert.equal(f.calls[0].options.headers.Authorization, "Bearer captured-fixture-token");
  assert.deepEqual(f.calls[0].body, { protocol: "isolated-paid-video-v2", command: "upload.reserve", requestId: uuid(10), expectedSessionId: A.sessionGeneration, configurationDigest: "a".repeat(64), payload });
  await assert.rejects(c.request("upload.reserve", uuid(10), payload)); assert.equal(f.calls.length, 1); c.dispose();
});
test("lost mutation response remains unknown and no automatic same-ID or replacement request is sent", async () => {
  const f = fixture(), c = await f.api.captureIsolatedPaidVideoV2Client(A); f.setTransport(async () => { throw Error("response lost"); });
  await assert.rejects(c.request("upload.reserve", uuid(10), payload), e => e.outcome === "unknown");
  await assert.rejects(c.request("upload.reserve", uuid(10), payload), e => e.outcome === "not_sent");
  assert.equal(f.calls.length, 1); c.dispose();
});
test("A to B to A permanently retires old client while a new current capture may read retained history", async () => {
  const f = fixture(), old = await f.api.captureIsolatedPaidVideoV2Client(A); f.change(B); f.change(A);
  await assert.rejects(old.request("capability.read", uuid(10), {}), e => e.code === "authority_retired"); assert.equal(f.calls.length, 0);
  const fresh = await f.api.captureIsolatedPaidVideoV2Client(A); f.setTransport(body => ({ ok: true, json: async () => capability(f.api, body.requestId) }));
  const read = await fresh.request("capability.read", uuid(11), {}); assert.equal(read.data.transferAvailable, false); old.dispose(); fresh.dispose();
});
test("authority transitions during capture or response parsing cannot publish a stale success", async () => {
  const before = fixture(), wait = before.delayCapture(); const capturing = before.api.captureIsolatedPaidVideoV2Client(A); before.change(B); before.change(A); wait.resolve();
  await assert.rejects(capturing, e => e.code === "authority_retired"); assert.equal(before.calls.length, 0);
  const f = fixture(), c = await f.api.captureIsolatedPaidVideoV2Client(A), response = deferred();
  f.setTransport(body => ({ ok: true, json: async () => { await response.promise; return capability(f.api, body.requestId); } }));
  const pending = c.request("capability.read", uuid(10), {}); await Promise.resolve(); f.change(B); f.change(A); response.resolve();
  await assert.rejects(pending, e => e.outcome === "unknown"); c.dispose();
});
test("strict protocol rejects invented availability, grants, actor swaps and unknown result fields", () => {
  const { api } = fixture(), context = { command: "capability.read", requestId: uuid(10), actor: actor(A), configurationDigest: "a".repeat(64), payload: {} };
  assert.equal(api.parsePaidVideoV2Response(capability(api, uuid(10)), context).status, "ok");
  for (const mutate of [v => { v.data.transferAvailable = "true"; }, v => { v.configurationDigest = "b".repeat(64); }, v => { v.data.grantsAccess = true; },
    v => { v.actor = actor(B); }, v => { v.protocol = "sandbox-commerce-v1"; }, v => { v.data.profile.maxBytes++; }]) {
    const value = capability(api, uuid(10)); mutate(value); assert.throws(() => api.parsePaidVideoV2Response(value, context));
  }
});
test("missing recovery row remains explicitly unknown with no inferred no-effect or upload proof", () => {
  const { api } = fixture(), requestId = uuid(10), originalRequestId = uuid(11);
  const value = { protocol: "isolated-paid-video-v2", command: "upload.recover", requestId, actor: actor(A), configurationDigest: "a".repeat(64), capabilityExpiresAtMs: 0, status: "unknown", data: { recovery: { state: "unknown", originalRequestId } } };
  const result = api.parsePaidVideoV2Response(value, { command: "upload.recover", requestId, actor: actor(A), configurationDigest: "a".repeat(64), payload: { originalRequestId } });
  assert.equal(result.status, "unknown"); assert.equal("upload" in result.data, false);
  value.data.recovery.noDispatchProven = true; assert.throws(() => api.parsePaidVideoV2Response(value, { command: "upload.recover", requestId, actor: actor(A), configurationDigest: "a".repeat(64), payload: { originalRequestId } }));
});

test("V3 native build evidence is required before authoring transport capture", async () => {
  const f=fixture();f.unavailable();await assert.rejects(f.api.captureIsolatedPaidVideoV2Client(A));assert.equal(f.calls.length,0);
});
if(process.env.ISOLATED_PAID_VIDEO_V2_FIXTURE) test("actual v2 gateway authoring responses preserve capability/profile and original request configuration",()=>{
 const {api}=fixture(),capture=JSON.parse(fs.readFileSync(process.env.ISOLATED_PAID_VIDEO_V2_FIXTURE,"utf8"));let count=0;
 for(const entry of capture.captures){if(!entry.input)continue; const input=entry.input,result=entry.result;
 const context={command:input.command,requestId:input.requestId,payload:input.payload,actor:result.actor,configurationDigest:input.configurationDigest,now:Math.max(0,result.capabilityExpiresAtMs-4000)};
 assert.equal(api.parsePaidVideoV2Response(result,context).command,input.command);count++;
 const altered=clone(result);altered.configurationDigest="f".repeat(64);assert.throws(()=>api.parsePaidVideoV2Response(altered,context));
 if(input.command==="upload.recover"&&result.status==="ok"){assert.equal(result.data.recovery.originalPayload.protocol,"isolated-paid-video-v1");assert.match(result.data.recovery.originalConfigurationDigest,/^[a-f0-9]{64}$/u);}
 } assert.equal(count,17);
});
