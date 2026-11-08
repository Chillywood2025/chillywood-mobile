import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { Buffer } from 'node:buffer';
import { webcrypto } from 'node:crypto';
import * as objectSource from '../../ops/isolated-paid-video-worker/private-object.mjs';
import * as brokerSource from '../../ops/isolated-paid-video-worker/upload-broker.mjs';

// Actual gateway source with synthetic Auth, SQL and object responses. These
// portable boundary tests neither contact a provider nor qualify its behavior.
globalThis.crypto ??= webcrypto;
const ts = createRequire(import.meta.url)('typescript');
const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const shared = path.join(repo, 'supabase/functions/_shared');
const noNetwork = async () => { throw Error('unexpected_network_call'); };
function source(name, { overrides = {}, fetch = noNetwork } = {}) {
  const cache = new Map([
    [path.join(repo, 'ops/isolated-paid-video-worker/private-object.mjs'), objectSource],
    [path.join(repo, 'ops/isolated-paid-video-worker/upload-broker.mjs'), brokerSource],
  ]);
  const load = file => {
    if (cache.has(file)) return cache.get(file);
    const text = readFileSync(file, 'utf8');
    if (file.endsWith('.json')) return { default: JSON.parse(text) };
    const exports = {}; cache.set(file, exports);
    const compiled = ts.transpileModule(text, { reportDiagnostics: true,
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } });
    assert.deepEqual(compiled.diagnostics, []);
    new Function('exports', 'require', 'fetch', 'Deno', compiled.outputText)(exports, specifier => {
      if (Object.hasOwn(overrides, specifier)) return overrides[specifier];
      assert.ok(specifier.startsWith('.'), 'Unmocked external dependency: ' + specifier);
      return load(path.resolve(path.dirname(file), specifier));
    }, fetch, { env: { get: () => undefined } });
    return exports;
  };
  return load(path.join(shared, name));
}
const boundary = source('isolated-paid-video-boundary.ts');
const { createPaidVideoAuthoringHandler } = source('isolated-paid-video-authoring.ts');
const { createPaidVideoRangeHandler } = source('isolated-paid-video-range.ts');
const { createPaidVideoUploadHandler } = source('isolated-paid-video-upload.ts');
const { createPaidVideoRpc } = source('isolated-paid-video-rpc.ts');
const ids = Array.from({ length: 8 }, (_, i) => {
  const c = String(i + 1); return c.repeat(8) + '-' + c.repeat(4) + '-4' + c.repeat(3) + '-8' + c.repeat(3) + '-' + c.repeat(12);
});
const [user, session, requestId, resource, grant, asset, incarnation, route] = ids;
const digest = 'a'.repeat(64), resourceId = 'scv1_resource_' + resource, grantId = 'scv1_grant_' + grant;
const actor = () => ({ userId: user, sessionId: session, expiresAtMs: Date.now() + 60000 });
const authenticated = async () => ({ actor: actor(), authorization: 'Bearer synthetic-user' });
const input = (command = 'capability.read', payload = {}) => ({ protocol: 'isolated-paid-video-v2', command,
  requestId, expectedSessionId: session, configurationDigest: digest, payload });
const request = (body = input(), extra = {}) => new Request('https://synthetic.invalid/functions/v1/isolated-paid-video-authoring-v2', {
  method: 'POST', headers: { 'content-type': 'application/json' }, body: typeof body === 'string' ? body : JSON.stringify(body), ...extra,
});
const capability = () => ({ protocol: 'isolated-paid-video-v2', command: 'capability.read', requestId, status: 'ok',
  actor: { userId: user, accountId: user, sessionGeneration: session }, configurationDigest: digest,
  capabilityExpiresAtMs: Date.now() + 4000, data: { creatorEligible: true, uploadRouteAvailable: true,
    transferAvailable: true, checkoutAvailable: true, profile: { id: 'scpv-mp4-h264-aac-v1', maxBytes: 16777216,
      maxDurationMs: 60000, maxWidth: 1920, maxHeight: 1080, maxFramesPerSecond: 60, videoCodec: 'h264',
      pixelFormat: 'yuv420p', optionalAudioCodec: 'aac', maxAudioChannels: 2, maxAudioSampleRate: 48000 } } });
const token = claims => 'Bearer ' + [Buffer.from('{"alg":"HS256"}').toString('base64url'),
  Buffer.from(typeof claims === 'string' ? claims : JSON.stringify(claims)).toString('base64url'), 'syntheticSignature'].join('.');
const claims = () => ({ sub: user, session_id: session, role: 'authenticated', exp: Math.floor(Date.now() / 1000) + 60 });

test('bounded JSON rejects duplicate nested keys, malformed bytes, excessive depth and oversized bodies', async () => {
  for (const text of ['{"a":{"b":1,"b":2}}', '{', '['.repeat(18) + '0' + ']'.repeat(18)])
    assert.throws(() => boundary.strictPaidVideoJson(text));
  assert.deepEqual(boundary.strictPaidVideoJson('{"literal":"\\u0000"}'), { literal: '\u0000' });
  for (const [body, headers, status] of [[new Uint8Array([255]), {}, 400], ['abc', { 'content-length': '101' }, 413], ['a'.repeat(101), {}, 413]]) {
    const req = new Request('https://synthetic.invalid', { method: 'POST', headers, body });
    await assert.rejects(boundary.readPaidVideoJson(req, 100, Date.now() + 1000), error => error.status === status);
  }
});

test('real stalled JSON read cancels its reader and releases the stream lock', async () => {
  let cancelled = 0;
  const stream = new ReadableStream({ cancel() { cancelled++; } });
  const req = new Request('https://synthetic.invalid', { method: 'POST', body: stream, duplex: 'half' });
  await assert.rejects(boundary.readPaidVideoJson(req, 100, Date.now() + 40), /paid_video_deadline/u);
  assert.equal(cancelled, 1); assert.equal(stream.locked, false);
});

test('authoring rejects duplicate input and session mismatch before SQL; accepted parameters are frozen', async () => {
  let authCalls = 0, sqlCalls = 0;
  const handler = createPaidVideoAuthoringHandler({ authenticate: async () => { authCalls++; return authenticated(); },
    rpc: async (name, parameters, authorization) => {
      sqlCalls++; assert.equal(name, 'isolated_paid_video_v2'); assert.equal(authorization, 'Bearer synthetic-user');
      assert.equal(parameters.p_expected_account_id, user); assert.equal(parameters.p_expected_session_generation, session);
      assert.throws(() => { parameters.p_payload.requestId = user; }); return capability();
    } });
  assert.equal((await handler(request('{"protocol":"isolated-paid-video-v2","protocol":"bad"}'))).status, 400);
  assert.equal(authCalls, 0); assert.equal(sqlCalls, 0);
  assert.equal((await handler(request({ ...input(), expectedSessionId: requestId }))).status, 401); assert.equal(sqlCalls, 0);
  const response = await handler(request()); assert.equal(response.status, 200); assert.equal(sqlCalls, 1);
  assert.equal(response.headers.get('cache-control'), 'private, no-store, max-age=0');
  assert.equal((await response.json()).data.transferAvailable, true);
});

test('late authentication cannot dispatch, and an uncertain mutation is not retried or exposed', async () => {
  let clock = 0, sqlCalls = 0;
  const late = createPaidVideoAuthoringHandler({ now: () => clock, authenticate: async () => {
    clock = 5001; return { actor: { userId: user, sessionId: session, expiresAtMs: 90000 }, authorization: 'Bearer synthetic' };
  }, rpc: async () => { sqlCalls++; return null; } });
  assert.equal((await late(request())).status, 503); assert.equal(sqlCalls, 0);
  const uncertain = createPaidVideoAuthoringHandler({ authenticate: authenticated, rpc: async () => { sqlCalls++; throw Error('private-provider-detail'); } });
  const response = await uncertain(request(input('upload.reserve', { title: 'Synthetic', expectedSha256: digest, expectedByteLength: 3 })));
  assert.equal(response.status, 503); assert.deepEqual(await response.json(), { protocol: 'isolated-paid-video-v2-error', status: 'unknown', requestId });
  assert.equal(sqlCalls, 1);
});

test('authoring suppresses mismatched or overlong response capabilities and additional storage fields', async () => {
  for (const change of [v => { v.actor.userId = requestId; }, v => { v.configurationDigest = 'b'.repeat(64); },
    v => { v.requestId = user; }, v => { v.capabilityExpiresAtMs = Date.now() + 60000; }, v => { v.data.bucket = 'private'; }]) {
    const result = capability(); change(result);
    const handler = createPaidVideoAuthoringHandler({ authenticate: authenticated, rpc: async () => result });
    const response = await handler(request()); assert.equal(response.status, 503); assert.equal(JSON.stringify(await response.json()).includes('private'), false);
  }
});

function authHelper(result = { user: { id: user, sessionGeneration: session } }, observe = () => {}) {
  return source('isolated-paid-video-auth.ts', { overrides: { './stripe-connect.ts': {
    createAuthClient: () => ({ supabaseUrl: 'https://synthetic.invalid', supabaseAnonKey: 'synthetic-anon' }),
    authenticateRequest: async req => { observe(req); return result; },
  } } }).authenticatePaidVideoRequest;
}
test('actual auth helper binds the verified immutable bearer, exact session, role and expiry', async () => {
  const bearer = token(claims()); let observed;
  const req = new Request('https://synthetic.invalid', { method: 'POST', headers: { authorization: bearer, 'x-ignored': 'not-forwarded' } });
  const verified = await authHelper(undefined, frozen => { observed = frozen; req.headers.set('authorization', token({ ...claims(), sub: requestId })); })(req);
  assert.equal(verified.actor.userId, user); assert.equal(verified.actor.sessionId, session); assert.equal(verified.authorization, bearer);
  assert.equal(observed.headers.get('authorization'), bearer); assert.equal(observed.headers.has('x-ignored'), false);
  assert.ok(Object.isFrozen(verified) && Object.isFrozen(verified.actor));
  for (const change of [c => { c.sub = requestId; }, c => { c.session_id = requestId; }, c => { c.role = 'service_role'; },
    c => { c.exp = 1; }, c => { c.exp = 1.5; }, c => { c.exp = Number.MAX_SAFE_INTEGER; }]) {
    const c = claims(); change(c);
    assert.equal(await authHelper()(new Request('https://synthetic.invalid', { headers: { authorization: token(c) } })), null);
  }
  const duplicate = JSON.stringify(claims()).replace('"sub":', '"sub":"' + requestId + '","sub":');
  assert.equal(await authHelper()(new Request('https://synthetic.invalid', { headers: { authorization: token(duplicate) } })), null);
});

test('auth helper does not decode authority before successful verification or accept malformed bearer', async () => {
  let calls = 0; const authenticate = authHelper({ error: 'synthetic rejection' }, () => { calls++; });
  for (const value of ['', 'Bearer bad', 'Basic abc', 'Bearer ' + 'x'.repeat(8200)])
    assert.equal(await authenticate(new Request('https://synthetic.invalid', { headers: { authorization: value } })), null);
  assert.equal(calls, 0);
  assert.equal(await authenticate(new Request('https://synthetic.invalid', { headers: { authorization: token(claims()) } })), null);
  assert.equal(calls, 1);
});

const access = () => ({ protocol: 'scpv-current-access-gateway-v2', actor: { userId: user, sessionGeneration: session }, resourceId, grantId,
  receiptId: 'synthetic-receipt', originalTransactionId: 'synthetic-original', customerId: 'synthetic-customer', projectId: 'synthetic-project',
  validUntilMs: Date.now() + 4000, object: { provider: 's3', bucket: 'synthetic-media', routeId: route,
    objectKey: `sandbox-commerce-v1/${user}/${resourceId}/scv1_asset_${asset}/${incarnation}.mp4`, incarnation,
    expectedSha256: digest, expectedByteLength: 3, objectVersion: 'synthetic-version' },
  media: { assetId: 'scv1_asset_' + asset, incarnation, sha256: digest, byteLength: 3, resourceRevision: 1, profile: 'scpv-mp4-h264-aac-v1' } });
const rangeRequest = suffix => new Request('https://synthetic.invalid/isolated-paid-video-range-v1/' + resourceId + '/' + grantId + (suffix ?? ''),
  { headers: { 'x-chillywood-auth-session': session, range: 'bytes=0-2' } });
test('range checks exact authority twice; wrong actor or post-origin hold never releases bytes', async () => {
  let calls = 0, reads = 0, mode = 'success';
  const handler = createPaidVideoRangeHandler({ authenticate: authenticated,
    rpc: async (name, parameters, authorization) => {
      calls++; assert.equal(name, 'isolated_paid_video_gateway_access_v2'); assert.equal(authorization, null);
      assert.equal(parameters.p_user_id, user); const value = access();
      if (mode === 'wrong') value.actor.userId = requestId;
      if (mode === 'wrong-asset') value.media.assetId = 'scv1_asset_' + user;
      if (mode === 'expired') value.validUntilMs = Date.now() - 1;
      if (mode === 'metadata-change' && calls === 2) value.media.resourceRevision = 2;
      if (mode === 'loss' && calls === 2) throw Error('held_after_origin'); return value;
    }, transport: { readRange: async () => { reads++; return Uint8Array.of(1, 2, 3); } } });
  let response = await handler(rangeRequest()); assert.equal(response.status, 206); assert.equal(calls, 2); assert.equal(reads, 1);
  assert.equal(response.headers.get('content-range'), 'bytes 0-2/3'); assert.equal(response.headers.get('cache-control'), 'private, no-store, max-age=0');
  assert.equal(response.headers.get('x-chillywood-media-protocol'), 'scpv-range-metadata-v2');
  assert.equal(response.headers.get('x-chillywood-asset-id'), 'scv1_asset_' + asset);
  assert.equal(response.headers.get('x-chillywood-sha256'), digest);
  assert.ok(Number(response.headers.get('x-chillywood-authorized-until-ms')) > Date.now());
  assert.match(response.headers.get('access-control-expose-headers'), /X-Chillywood-Authorized-Until-Ms/u);
  assert.deepEqual([...new Uint8Array(await response.arrayBuffer())], [1, 2, 3]);
  mode = 'wrong'; calls = 0; reads = 0; response = await handler(rangeRequest()); assert.equal(response.status, 403); assert.equal(reads, 0);
  mode = 'loss'; calls = 0; reads = 0; response = await handler(rangeRequest()); assert.equal(response.status, 403); assert.equal(reads, 1);
  assert.deepEqual(await response.json(), { protocol: 'scpv-range-v1', status: 'unavailable' });
  for (const rejected of ['wrong-asset', 'expired', 'metadata-change']) {
    mode = rejected; calls = 0; reads = 0; response = await handler(rangeRequest()); assert.equal(response.status, 403);
    assert.equal(reads, rejected === 'metadata-change' ? 1 : 0);
    assert.equal(response.headers.get('x-chillywood-asset-id'), null);
  }
});

test('range and upload reject client routing or session changes before private RPC or object access', async () => {
  let calls = 0; const rpc = async () => { calls++; throw Error('unexpected_rpc'); };
  const range = createPaidVideoRangeHandler({ authenticate: authenticated, rpc, transport: { readRange: noNetwork } });
  for (const suffix of ['?objectKey=private', '/extra', '%2f']) assert.equal((await range(rangeRequest(suffix))).status, 400);
  const upload = createPaidVideoUploadHandler({ authenticate: authenticated, rpc,
    transport: { writeOnce: noNetwork, readForScan: noNetwork }, verifier: { id: route, key: new Uint8Array(32) } });
  const response = await upload(new Request('https://synthetic.invalid/isolated-paid-video-upload-v2/scpv_upload_' + asset,
    { headers: { 'x-chillywood-auth-session': requestId, 'x-chillywood-request-id': requestId, 'x-chillywood-native-configuration': digest } }));
  assert.equal(response.status, 401); assert.equal(calls, 0);
});

const rpcConfig = { url: 'https://synthetic.invalid', anonKey: 'synthetic-anon', serviceKey: 'synthetic-service' };
test('RPC allowlist fixes method, destination and credential class with no redirects or retry', async () => {
  const calls = []; const rpc = createPaidVideoRpc(rpcConfig, async (url, init) => { calls.push({ url: String(url), init }); return new Response('{"ok":true}'); });
  assert.deepEqual(await rpc('isolated_paid_video_v2', { input: 'synthetic' }, 'Bearer synthetic-user', Date.now() + 1000), { ok: true });
  assert.deepEqual(await rpc('isolated_paid_video_probe_v2', {}, null, Date.now() + 1000), { ok: true });
  assert.equal(calls[0].url, 'https://synthetic.invalid/rest/v1/rpc/isolated_paid_video_v2');
  assert.equal(calls[0].init.method, 'POST'); assert.equal(calls[0].init.redirect, 'error');
  assert.equal(calls[0].init.headers.apikey, 'synthetic-anon'); assert.equal(calls[0].init.headers.authorization, 'Bearer synthetic-user');
  assert.equal(calls[1].init.headers.apikey, 'synthetic-service'); assert.equal(calls[1].init.headers.authorization, 'Bearer synthetic-service');
  assert.equal(calls[0].init.signal.aborted, false);
  await assert.rejects(rpc('table_or_other_rpc', {}, null, Date.now() + 1000), /paid_video_rpc_unavailable/u);
  await assert.rejects(rpc('isolated_paid_video_v2', {}, null, Date.now() - 1), /paid_video_deadline/u); assert.equal(calls.length, 2);
  for (const url of ['http://remote.invalid', 'https://user:secret@synthetic.invalid', 'https://synthetic.invalid/path', 'https://synthetic.invalid/?q=1', 'https://synthetic.invalid/#x'])
    assert.throws(() => createPaidVideoRpc({ ...rpcConfig, url }), /paid_video_runtime_unavailable/u);
});

test('RPC failures cancel private error bodies; duplicate or stalled replies fail without retry', async () => {
  let cancelled = 0, calls = 0;
  const rpc = createPaidVideoRpc(rpcConfig, async () => { calls++; return new Response(new ReadableStream({ cancel() { cancelled++; } }), { status: 502 }); });
  await assert.rejects(rpc('isolated_paid_video_v2', {}, null, Date.now() + 1000), /paid_video_backend_unavailable/u);
  assert.equal(calls, 1); assert.equal(cancelled, 1);
  const duplicate = createPaidVideoRpc(rpcConfig, async () => new Response('{"ok":true,"ok":false}'));
  await assert.rejects(duplicate('isolated_paid_video_v2', {}, null, Date.now() + 1000), /paid_video_invalid_request/u);
  const stalled = new ReadableStream({ cancel() { cancelled++; } });
  const slow = createPaidVideoRpc(rpcConfig, async () => new Response(stalled));
  await assert.rejects(slow('isolated_paid_video_v2', {}, null, Date.now() + 40), /paid_video_deadline/u);
  assert.equal(cancelled, 2); assert.equal(stalled.locked, false);
});

test('runtime remains unavailable unless explicitly enabled with complete distinct server configuration', async () => {
  const { paidVideoRuntime } = source('isolated-paid-video-runtime.ts', { overrides: {
    './isolated-paid-video-auth.ts': { authenticatePaidVideoRequest: authenticated },
  } });
  const settings = { PAID_VIDEO_GATEWAY_V2_ENABLED: 'true', SUPABASE_URL: rpcConfig.url, SUPABASE_ANON_KEY: rpcConfig.anonKey,
    SUPABASE_SERVICE_ROLE_KEY: rpcConfig.serviceKey, PAID_VIDEO_S3_ROUTE_ID: route, PAID_VIDEO_S3_BUCKET: 'synthetic-media',
    PAID_VIDEO_S3_REGION: 'us-east-1', PAID_VIDEO_S3_ACCESS_KEY_ID: 'A'.repeat(20), PAID_VIDEO_S3_SECRET_ACCESS_KEY: 's'.repeat(40),
    PAID_VIDEO_UPLOAD_VERIFIER_ID: incarnation, PAID_VIDEO_UPLOAD_VERIFIER_KEY_HEX: '7'.repeat(64) };
  for (const kind of ['authoring', 'upload', 'range']) {
    for (const enabled of [undefined, 'false', 'TRUE']) {
      const handler = paidVideoRuntime(kind, key => key === 'PAID_VIDEO_GATEWAY_V2_ENABLED' ? enabled : settings[key]);
      assert.equal((await handler(new Request('https://synthetic.invalid'))).status, 503);
    }
    const handler = paidVideoRuntime(kind, key => key === 'SUPABASE_SERVICE_ROLE_KEY' ? undefined : settings[key]);
    assert.equal((await handler(new Request('https://synthetic.invalid'))).status, 503);
  }
  for (const change of [{ PAID_VIDEO_UPLOAD_VERIFIER_KEY_HEX: 'bad' }, { PAID_VIDEO_UPLOAD_VERIFIER_ID: 'bad' }, { PAID_VIDEO_S3_REGION: 'client-host.invalid' }]) {
    const values = { ...settings, ...change }, handler = paidVideoRuntime('upload', key => values[key]);
    assert.equal((await handler(new Request('https://synthetic.invalid'))).status, 503);
  }
  for (const [kind, endpoint] of [['authoring', 'isolated-paid-video-authoring-v2'], ['upload', 'isolated-paid-video-upload-v2/scpv_upload_' + asset], ['range', 'isolated-paid-video-range-v1/' + resourceId + '/' + grantId]]) {
    const handler = paidVideoRuntime(kind, key => settings[key]);
    assert.equal((await handler(new Request('https://synthetic.invalid/' + endpoint, { method: 'OPTIONS' }))).status, 204);
  }
});
