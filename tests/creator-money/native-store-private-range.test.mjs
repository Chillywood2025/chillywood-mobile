import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { webcrypto } from 'node:crypto';
import * as objectSource from '../../ops/isolated-paid-video-worker/private-object.mjs';
import * as nativeObject from '../../ops/isolated-paid-video-worker/native-private-object.mjs';

// Actual gateway source with synthetic Auth, SQL and object responses. These
// portable boundary tests neither contact a provider nor qualify its behavior.
globalThis.crypto ??= webcrypto;
const ts = createRequire(import.meta.url)('typescript');
const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const shared = path.join(repo, 'supabase/functions/_shared');
const noNetwork = async () => { throw Error('unexpected_network_call'); };
function source(name, { overrides = {}, fetch = noNetwork } = {}) {
  const cache = new Map([
    [path.join(repo, 'ops/isolated-paid-video-worker/native-private-object.mjs'), nativeObject],
    [path.join(repo, 'ops/isolated-paid-video-worker/private-object.mjs'), objectSource],
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
const {createNativeStorePaidVideoRangeHandlerV1}=source('native-store-paid-video-range-v1.ts');
const ids = Array.from({ length: 8 }, (_, i) => {
  const c = String(i + 1); return c.repeat(8) + '-' + c.repeat(4) + '-4' + c.repeat(3) + '-8' + c.repeat(3) + '-' + c.repeat(12);
});
const [user, session, requestId, resource, grant, asset, incarnation, route] = ids;
const digest = 'a'.repeat(64), resourceId = 'scv1_resource_' + resource, grantId = 'scv1_grant_' + grant;
const actor = () => ({ userId: user, sessionId: session, expiresAtMs: Date.now() + 60000 });
const authenticated = async () => ({ actor: actor(), authorization: 'Bearer synthetic-user' });
const access = () => ({ protocol: 'nssv1-current-access-gateway-v1', actor: { userId: user, sessionGeneration: session }, resourceId, grantId,
  receiptId: 'synthetic-receipt', originalTransactionId: 'synthetic-original', allocationId: 'nssv1_allocation_synthetic', projectId: 'synthetic-project',
  validUntilMs: Date.now() + 4000, object: { provider: 's3', bucket: 'synthetic-media', routeId: route,
    objectKey: `sandbox-commerce-v1/${user}/${resourceId}/scv1_asset_${asset}/${incarnation}.mp4`, incarnation,
    expectedSha256: digest, expectedByteLength: 3, objectVersion: 'synthetic-version' },
  media: { assetId: 'scv1_asset_' + asset, incarnation, sha256: digest, byteLength: 3, resourceRevision: 1, profile: 'scpv-mp4-h264-aac-v1' } });
const rangeRequest = suffix => new Request('https://synthetic.invalid/native-store-paid-video-range-v1/' + resourceId + '/' + grantId + (suffix ?? ''),
  { headers: { 'x-chillywood-auth-session': session, range: 'bytes=0-2' } });
test('range checks exact authority twice; wrong actor or post-origin hold never releases bytes', async () => {
  let calls = 0, reads = 0, mode = 'success';
  const handler = createNativeStorePaidVideoRangeHandlerV1({ authenticate: authenticated,
    rpc: async (name, parameters, authorization) => {
      calls++; assert.equal(name, 'native_store_paid_video_access_v1'); assert.equal(authorization, null);
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


test('native range rejects client routing and TestStore authority',async()=>{
 let calls=0;
 const handler=createNativeStorePaidVideoRangeHandlerV1({authenticate:authenticated,rpc:async()=>{calls++;return {...access(),protocol:'scpv-current-access-gateway-v2'};},transport:{readRange:noNetwork}});
 for(const suffix of ['?objectKey=private','/extra','%2f'])assert.equal((await handler(rangeRequest(suffix))).status,400);
 assert.equal(calls,0);assert.equal((await handler(rangeRequest())).status,403);
});
test('native RPC permits only fixed native access name, never redirects or client supplied endpoint',async()=>{
 const {createNativeStorePaidVideoRpcV1}=source('native-store-paid-video-rpc-v1.ts');let calls=0;
 const rpc=createNativeStorePaidVideoRpcV1({url:'https://synthetic.invalid',anonKey:'synthetic-anon',serviceKey:'synthetic-service'},async(url,options)=>{calls++;assert.equal(new URL(url).pathname,'/rest/v1/rpc/native_store_paid_video_access_v1');assert.equal(options.redirect,'error');return new Response('{}');});
 await assert.rejects(rpc('isolated_paid_video_gateway_access_v2',{},null,Date.now()+4000));assert.equal(calls,0);
 await rpc('native_store_paid_video_access_v1',{},null,Date.now()+4000);assert.equal(calls,1);
});
test('native range runtime defaults off and also requires existing media gateway switch',async()=>{
 const {nativeStorePaidVideoRuntimeV1}=source('native-store-paid-video-runtime-v1.ts',{overrides:{'./isolated-paid-video-auth.ts':{authenticatePaidVideoRequest:noNetwork}}});
 for(const enabled of [undefined,'true']){
  const handler=nativeStorePaidVideoRuntimeV1(key=>key==='NATIVE_STORE_PAID_VIDEO_RANGE_V1_ENABLED'?enabled:undefined);
  assert.equal((await handler(rangeRequest())).status,503);
 }
});
