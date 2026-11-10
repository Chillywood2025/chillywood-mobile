import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { createR2WorkerRuntime } from './r2-runtime.mjs';
import { createR2IsolateAdmission } from './r2-admission.mjs';
import { createPrivateR2NativeTransport } from './r2-native.mjs';
import { validateR2GatewayToken, signR2Raw, verifyR2Raw, r2Digest, readR2Bytes } from './r2-protocol.mjs';
import { createR2GatewayClient } from './r2-http.mjs';
import { deliverNativeR2Range } from './r2-native-range.mjs';
import { validateR2ScanTicket, signR2ScanResult } from './r2-job.mjs';
import { completeR2ScannerResult, createR2ScannerRuntime, persistR2ScannerResult, superviseR2Scanner } from './r2-scanner-runtime.mjs';

const id = () => randomUUID(), now = 100000, key = new Uint8Array(32).fill(9), bytes = new Uint8Array([1, 2, 3]);
const sha = await r2Digest(bytes), user = id(), session = id(), resourceId = 'scv1_resource_' + id(), grantId = id();
const config = { origin: 'https://qualified.invalid', routeId: id(), bucket: 'qualified-r2', profileId: id(), keyId: id(), qualificationSha256: 'f'.repeat(64) };
const identity = { kind: 'r2-native-upload-v1', nativeVersion: 'accepted-upload', etag: 'e'.repeat(32) }, incarnation = id();
const object = { provider: 'cloudflare_r2', bucket: config.bucket, routeId: config.routeId,
  objectKey: `sandbox-commerce-v1/${user}/${resourceId}/scv1_asset_${id()}/${incarnation}.mp4`, incarnation, expectedSha256: sha, expectedByteLength: bytes.length, identity };
const token = () => ({ protocol: 'scpv-r2-gateway-token-v1', operation: 'range', keyId: config.keyId, profileId: config.profileId,
  qualificationSha256: config.qualificationSha256, bindingId: id(), uploadId: 'scpv_upload_' + id(), resourceId, requestId: id(), configurationDigest: 'a'.repeat(64),
  subject: { kind: 'session', userId: user, sessionGeneration: session }, object, range: { start: 0, end: 2 }, grantId, issuedAtMs: now, expiresAtMs: now + 4000 });
const ticket = () => ({ protocol: 'scpv-worker-ticket-r2-v1', ticketId: id(), uploadId: 'scpv_upload_' + id(), workerId: id(),
  qualificationSha256: config.qualificationSha256, profile: 'scpv-mp4-h264-aac-v1', issuedAt: new Date(now - 1).toISOString(), expiresAt: new Date(now + 500000).toISOString(), object });

test('aggregate admission holds full buffers, late PUT and pending cancellation across request factories', async () => {
  const admission = createR2IsolateAdmission({ responseDeadlineMs: 1000 }), denied = () => new Response(null, { status: 503 });
  const request = new Request(config.origin, { headers: { 'x-chillywood-r2-token': JSON.stringify({ operation: 'scan' }) } });
  let resolvePut, calls = 0;
  const held = await admission.run(request, lease => {
    calls++; lease.track(new Promise(resolve => { resolvePut = resolve; })); return Response.json({ state: 'unknown' });
  }, denied);
  await held.json();
  assert.equal((await admission.run(request, () => { calls++; return new Response('bad'); }, denied)).status, 503);
  assert.equal(calls, 1); resolvePut(); await Promise.resolve();
  const available = await admission.run(request, () => new Response(bytes), denied);
  assert.equal(available.status, 200);
  assert.equal((await admission.run(request, () => new Response('bad'), denied)).status, 503, 'Response bytes still retained');
  await available.arrayBuffer();
  const ranges = new Request(config.origin, { headers: { 'x-chillywood-r2-token': JSON.stringify({ operation: 'range' }) } });
  const heldRanges = await Promise.all(Array.from({ length: 4 }, () => admission.run(ranges, () => new Response(bytes), denied)));
  assert.equal((await admission.run(ranges, () => new Response('bad'), denied)).status, 503);
  await Promise.all(heldRanges.map(response => response.arrayBuffer()));
  let finishCancel;
  const source = new ReadableStream({ pull: () => new Promise(() => {}), cancel: () => new Promise(resolve => { finishCancel = resolve; }) });
  const incomplete = await admission.run(request, async lease => {
    const object = await lease.read(Promise.resolve({ body: source })); void object.body.cancel();
    return new Response(null);
  }, denied);
  assert.equal(incomplete.status, 200);
  assert.equal((await admission.run(request, () => new Response('bad'), denied)).status, 503, 'Unsettled cancel must retain budget');
  finishCancel(); await new Promise(resolve => setTimeout(resolve, 0));
  assert.equal((await admission.run(request, () => new Response(null), denied)).status, 200);
});

test('incoming-body and late GET cancellation uncertainty cannot release aggregate allocation', async () => {
  const request = new Request(config.origin), denied = () => new Response(null, { status: 503 });
  for (const rejectCancel of [false, true]) {
    const admission = createR2IsolateAdmission(); let finishCancel, pulls = 0;
    const source = new ReadableStream({ pull: () => { pulls++; return new Promise(() => {}); },
      cancel: () => rejectCancel ? Promise.reject(Error('cancel failed')) : new Promise(resolve => { finishCancel = resolve; }) }, { highWaterMark: 0 });
    const result = await admission.run(request, async lease => {
      const body = lease.body(source); assert.equal(pulls, 0, 'Wrapping must not eagerly read input');
      await assert.rejects(readR2Bytes(body, 3, Date.now() + 20)); return new Response(null);
    }, denied);
    assert.equal(result.status, 200); assert.equal(pulls, 1);
    assert.equal((await admission.run(request, () => new Response(null), denied)).status, 503);
    if (!rejectCancel) {
      finishCancel(); await new Promise(resolve => setTimeout(resolve, 0));
      assert.equal((await admission.run(request, () => new Response(null), denied)).status, 200);
    }
  }
  const admission = createR2IsolateAdmission(); let resolveGet, observed, cancelGet;
  await admission.run(request, lease => {
    observed = lease.read(new Promise(resolve => { resolveGet = resolve; })); return new Response(null);
  }, denied);
  assert.equal((await admission.run(request, () => new Response(null), denied)).status, 503);
  resolveGet({ body: new ReadableStream({ cancel: () => new Promise(resolve => { cancelGet = resolve; }) }, { highWaterMark: 0 }) });
  const late = await observed; void late.body.cancel();
  assert.equal((await admission.run(request, () => new Response(null), denied)).status, 503);
  cancelGet(); await new Promise(resolve => setTimeout(resolve, 0));
  assert.equal((await admission.run(request, () => new Response(null), denied)).status, 200);
});

test('unread or final-chunk-only response keeps allocation until bounded settled cleanup', async () => {
  const request = new Request(config.origin), denied = () => new Response(null, { status: 503 });
  for (const readChunk of [false, true]) {
    const admission = createR2IsolateAdmission({ responseDeadlineMs: 25 }); let pulls = 0, cancels = 0;
    const source = new ReadableStream({ pull(controller) { pulls++; controller.enqueue(bytes); }, cancel() { cancels++; } }, { highWaterMark: 0 });
    const response = await admission.run(request, () => new Response(source), denied);
    assert.equal(pulls, 0, 'Wrapping must not eagerly read response');
    const reader = response.body.getReader();
    if (readChunk) assert.deepEqual((await reader.read()).value, bytes);
    assert.equal((await admission.run(request, () => new Response(null), denied)).status, 503);
    await new Promise(resolve => setTimeout(resolve, 40));
    await assert.rejects(reader.read(), /response_deadline/u); assert.equal(cancels, 1);
    assert.equal((await admission.run(request, () => new Response(null), denied)).status, 200);
  }
});

test('separate production Worker factories share late-PUT admission before a second SQL claim', async () => {
  let finishPut, calls = 0, hang = true;
  const env = { PAID_VIDEO_R2_GATEWAY_V1_ENABLED: 'true', PAID_VIDEO_R2_AUTHORITY_ORIGIN: config.origin,
    PAID_VIDEO_R2_GATEWAY_RPC_TOKEN: ['e30', btoa(JSON.stringify({ role: 'sbx_v1_r2_gateway', profile_id: config.profileId })), 'synthetic'].join('.'),
    PAID_VIDEO_R2_AUTHORITY_ANON_KEY: 'synthetic-anon', PAID_VIDEO_R2_GATEWAY_ORIGIN: config.origin, PAID_VIDEO_R2_BUCKET: config.bucket,
    PAID_VIDEO_R2_ROUTE_ID: config.routeId, PAID_VIDEO_R2_PROFILE_ID: config.profileId, PAID_VIDEO_R2_QUALIFICATION_SHA256: config.qualificationSha256,
    PAID_VIDEO_R2_GATEWAY_KEY_ID: config.keyId, PAID_VIDEO_R2_GATEWAY_KEY_HEX: '09'.repeat(32),
    PAID_VIDEO_R2_VERIFIER_ID: id(), PAID_VIDEO_R2_VERIFIER_KEY_HEX: '08'.repeat(32),
    PAID_VIDEO_R2_MEDIA: { get: async () => null, put: () => hang ? new Promise(resolve => { finishPut = resolve; }) : Promise.resolve(null) } };
  const rpc = async (_url, options) => {
    calls++; const { p_token: t, p_phase: phase, p_outcome: outcome } = JSON.parse(options.body);
    return Response.json(phase === 'commit' ? { protocol: 'scpv-r2-commit-v1', bindingId: t.bindingId, state: outcome.state }
      : { protocol: 'scpv-r2-authority-v1', bindingId: t.bindingId, profileId: t.profileId, qualificationSha256: t.qualificationSha256,
        authorityDigest: 'a'.repeat(64), object: t.object, validUntilMs: t.expiresAtMs, dispatchAllowed: true });
  };
  const makeRequest = async ttl => {
    const issued = Date.now(), t = { ...token(), operation: 'upload', bindingId: id(), object: { ...object }, range: null, grantId: null, issuedAtMs: issued, expiresAtMs: issued + ttl };
    delete t.object.identity; const raw = JSON.stringify(t);
    return new Request(`${config.origin}/scpv-r2-gateway-v1/upload/${t.bindingId}`, { method: 'PUT', body: bytes,
      headers: { 'x-chillywood-r2-token': raw, authorization: 'R2-HMAC ' + await signR2Raw(raw, key), 'content-type': 'video/mp4', 'content-length': '3' } });
  };
  const factory = () => createR2WorkerRuntime(env, { waitUntil() {} }, { request: rpc });
  const first = await factory()(await makeRequest(100)); assert.equal(first.status, 503); await first.arrayBuffer();
  assert.ok(finishPut); const before = calls;
  const blocked = await factory()(await makeRequest(1000)); assert.equal(blocked.status, 503); await blocked.arrayBuffer(); assert.equal(calls, before);
  finishPut(null); hang = false; await new Promise(resolve => setTimeout(resolve, 0));
  const next = await factory()(await makeRequest(1000)); assert.equal(next.status, 200); await next.arrayBuffer(); assert.ok(calls > before);
});

test('outgoing deadline reports promptly but failed or stalled cancellation retains its permit', async () => {
  for (const rejectCancel of [false, true]) {
    const admission = createR2IsolateAdmission({ responseDeadlineMs: 20 }), request = new Request(config.origin);
    const denied = () => new Response(null, { status: 503 }); let finishCancel;
    const source = new ReadableStream({ pull: () => new Promise(() => {}),
      cancel: () => rejectCancel ? Promise.reject(Error('cleanup rejected')) : new Promise(resolve => { finishCancel = resolve; }) }, { highWaterMark: 0 });
    const response = await admission.run(request, () => new Response(source), denied);
    await assert.rejects(response.arrayBuffer(), /response_deadline/u);
    assert.equal((await admission.run(request, () => new Response(null), denied)).status, 503);
    if (!rejectCancel) {
      finishCancel(); await new Promise(resolve => setTimeout(resolve, 0));
      assert.equal((await admission.run(request, () => new Response(null), denied)).status, 200);
    }
  }
});

test('raw HMAC covers operation, route, grant and every typed identity field', async () => {
  const original = token(), raw = JSON.stringify(original, null, 1), signature = await signR2Raw(raw, key);
  assert.equal(await verifyR2Raw(raw, signature, key), true);
  for (const change of [{ grantId: id() }, { operation: 'probe' }, { profileId: id() }, { object: { ...object, identity: { ...identity, nativeVersion: 'replacement' } } }])
    assert.equal(await verifyR2Raw(JSON.stringify({ ...original, ...change }), signature, key), false);
  validateR2GatewayToken(original, now);
  for (const bad of [{ ...original, grantId: null }, { ...original, object: { ...object, objectVersion: 'fake' } },
    { ...original, range: { start: 0, end: 524288 } }, { ...original, issuedAtMs: now + 1 }, { ...original, expiresAtMs: now + 5001 },
    { ...original, subject: { kind: 'worker', workerId: id() } }]) assert.throws(() => validateR2GatewayToken(bad, now));
});

test('R2 read deadline cannot be extended by a never-settling stream cancellation', async () => {
  const hanging = new ReadableStream({ pull: () => new Promise(() => {}), cancel: () => new Promise(() => {}) });
  const transport = createPrivateR2NativeTransport({ bucket: config.bucket, routeId: config.routeId,
    binding: { put: async () => null, get: async () => ({ key: object.objectKey, size: bytes.length,
      httpMetadata: { contentType: 'video/mp4' }, version: identity.nativeVersion, etag: identity.etag,
      range: { offset: 0, length: bytes.length }, body: hanging }) } });
  const started = Date.now();
  await assert.rejects(transport.readRange(object, { start: 0, end: 2 }, started + 20), /deadline_expired/u);
  assert.ok(Date.now() - started < 500, 'cleanup must not wait for an unbounded cancel');
});

test('Worker and scanner cannot use broad service credentials or implicit activation', async () => {
  let calls = 0;
  const off = createR2WorkerRuntime({}, {}, { request: async () => { calls++; throw Error('no'); } });
  assert.equal((await off(new Request(config.origin))).status, 503); assert.equal(calls, 0);
  const jwt = ['e30', btoa(JSON.stringify({ role: 'service_role' })), 'synthetic'].join('.');
  assert.throws(() => createR2ScannerRuntime({ authorityOrigin: config.origin, anonKey: 'anon', rpcToken: jwt,
    workerId: id(), workerKey: key, gateway: config }));
});

test('native allocation range cannot accept Test Store customer authority and rechecks after bytes', async () => {
  const actor = { userId: user, sessionGeneration: session }, authority = { protocol: 'nssv1-current-access-r2-v1', actor,
    resourceId, grantId, receiptId: 'receipt', originalTransactionId: 'original', allocationId: 'allocation', projectId: 'project', validUntilMs: now + 4000, object };
  for (const changed of ['customer', 'allocation', 'session', 'version', 'none']) {
    let calls = 0, reads = 0;
    const authorize = async () => {
      calls++; const value = structuredClone(authority);
      if (changed === 'customer') { delete value.allocationId; value.customerId = 'not-native'; }
      if (calls === 2 && changed === 'allocation') value.allocationId = 'other';
      if (calls === 2 && changed === 'session') value.actor.sessionGeneration = id();
      if (calls === 2 && changed === 'version') value.object.identity.nativeVersion = 'replacement';
      return value;
    };
    const execute = () => deliverNativeR2Range({ actor, resourceId, grantId, rangeHeader: null, authorize,
      transport: { readRange: async () => { reads++; return bytes; } }, now: () => now });
    if (changed === 'none') { const result = await execute(); assert.equal(result.status, 206); assert.equal(calls, 2); }
    else await assert.rejects(execute());
    if (changed === 'customer') assert.equal(reads, 0);
  }
});

test('scanner tickets and signed results carry accepted identity, never latest/S3 discovery', async () => {
  const t = ticket(); validateR2ScanTicket(t, now);
  assert.throws(() => validateR2ScanTicket({ ...t, object: { ...object, identity: undefined } }, now));
  assert.throws(() => validateR2ScanTicket({ ...t, object: { ...object, objectVersion: 'invented' } }, now));
  const result = { protocol: 'scpv-byte-scan-v1', profile: t.profile, sha256: sha, byteLength: 3, moderation: 'unreviewed', verdict: 'clean' };
  const signed = await signR2ScanResult({ ticket: t, key, result, now });
  assert.equal(await verifyR2Raw(signed.raw, signed.signature, key), true); assert.deepEqual(JSON.parse(signed.raw).object.identity, identity);
  await assert.rejects(signR2ScanResult({ ticket: t, key, result: { ...result, sha256: '0'.repeat(64) }, now }));
  await assert.rejects(signR2ScanResult({ ticket: t, key, result, now: Date.parse(t.expiresAt) }));
  assert.ok(await signR2ScanResult({ ticket: t, key, result: { ...result, verdict: 'rejected' }, now: Date.parse(t.expiresAt) + 1 }));
});

test('HTTP adapter binds metadata and refuses redirects, extra bodies and unqualified profiles without retry', async () => {
  const t = token(), envelope = { raw: JSON.stringify(t), signature: 'c'.repeat(64) };
  for (const mode of ['ok', 'identity', 'encoding', 'range', 'profile', 'redirect']) {
    let calls = 0;
    const client = createR2GatewayClient(config, { now: () => now, request: async (_url, options) => {
      calls++; assert.equal(options.redirect, 'error');
      return new Response(bytes, { status: mode === 'redirect' ? 302 : 206, headers: { 'content-type': 'video/mp4', 'content-length': '3',
        'content-range': mode === 'range' ? 'bytes 1-3/4' : 'bytes 0-2/3', 'x-chillywood-r2-identity': JSON.stringify(mode === 'identity' ? { ...identity, nativeVersion: 'replacement' } : identity),
        ...(mode === 'encoding' ? { 'content-encoding': 'gzip' } : {}) } });
    } });
    const value = mode === 'profile' ? { ...envelope, raw: JSON.stringify({ ...t, profileId: id() }) } : envelope;
    if (mode === 'ok') assert.deepEqual((await client.execute(value, null, now + 4000)).bytes, bytes);
    else await assert.rejects(client.execute(value, null, now + 4000));
    assert.equal(calls, mode === 'profile' ? 0 : 1);
  }
});

test('supervisor runs one job at a time, backs off idle polls and stops on uncertainty', async () => {
  const directory = await fs.mkdtemp('/tmp/scpv-r2-supervisor-'); await fs.chmod(directory, 0o700);
  const resultPath = path.join(directory, 'pending.json'), controller = new AbortController(), waits = []; let calls = 0;
  try {
    const result = await superviseR2Scanner({ resultPath, signal: controller.signal, maxJobs: 1,
      sleep: async ms => { waits.push(ms); }, runtime: { next: async () => {
        calls++; if (calls < 4) return null;
        await fs.writeFile(resultPath, '{}', { flag: 'wx', mode: 0o600 }); return { ticketId: id() };
      } } });
    assert.deepEqual(waits, [30000, 60000, 120000]); assert.equal(result.jobs, 1);
    assert.equal((await fs.readdir(directory)).length, 1); assert.ok((await fs.readdir(directory))[0].includes('.completed-'));
    let attempted = 0;
    await assert.rejects(superviseR2Scanner({ resultPath, signal: controller.signal, runtime: { next: async () => { attempted++; throw Error('uncertain'); } } }));
    assert.equal(attempted, 1);
    let continuousJobs = 0; const continuous = new AbortController();
    const beyondBatch = await superviseR2Scanner({ resultPath, signal: continuous.signal, sleep: async () => {}, runtime: { next: async () => {
      continuousJobs++; await fs.writeFile(resultPath, '{}', { flag: 'wx', mode: 0o600 });
      if (continuousJobs === 101) continuous.abort(); return { ticketId: id() };
    } } });
    assert.equal(beyondBatch.jobs, 101); assert.equal(beyondBatch.stopped, true);
    controller.abort(); assert.equal((await superviseR2Scanner({ resultPath, signal: controller.signal, runtime: {} })).jobs, 0);
  } finally { await fs.rm(directory, { recursive: true }); }
});

test('pending scanner evidence is exclusive and completion cannot clobber retained results', async () => {
  const directory = await fs.mkdtemp('/tmp/scpv-r2-durable-'); await fs.chmod(directory, 0o700);
  const file = path.join(directory, 'pending.json'), ticketId = id();
  try {
    await persistR2ScannerResult(file, { state: 'pending' });
    await assert.rejects(persistR2ScannerResult(file, { state: 'replacement' }));
    await fs.writeFile(`${file}.completed-${ticketId}`, 'existing', { flag: 'wx', mode: 0o600 });
    await assert.rejects(completeR2ScannerResult(file, ticketId));
    assert.equal(await fs.readFile(`${file}.completed-${ticketId}`, 'utf8'), 'existing');
    assert.deepEqual(JSON.parse(await fs.readFile(file, 'utf8')), { state: 'pending' });
    const next = id(); await completeR2ScannerResult(file, next);
    await assert.rejects(fs.stat(file)); assert.deepEqual(JSON.parse(await fs.readFile(`${file}.completed-${next}`, 'utf8')), { state: 'pending' });
    const source = await fs.readFile(new URL('./r2-scanner-runtime.mjs', import.meta.url), 'utf8');
    assert.match(source, /await handle\.sync\(\);[\s\S]*await syncPrivateDirectory\(file\);/u);
    assert.ok(source.indexOf('await persistR2ScannerResult(resultPath') < source.indexOf("const completion = await rpc('native_paid_video_r2_worker_v1'"));
  } finally { await fs.rm(directory, { recursive: true }); }
});
