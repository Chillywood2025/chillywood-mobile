import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import ts from 'typescript';

const source = readFileSync(new URL('../supabase/functions/_shared/brand-empty-test-origin.ts', import.meta.url), 'utf8');
const js = ts.transpileModule(source.replace(/^import .*;\n/gm, ''), {
  compilerOptions: {target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS},
}).outputText;
function loadModule(timer = setTimeout) {
  const exports = {};
  new Function('exports', 'createHash', 'setTimeout', 'clearTimeout', js)(exports, createHash, timer, clearTimeout);
  return exports;
}
const api = loadModule();
const EMPTY_SHA256 = createHash('sha256').update(new Uint8Array()).digest('hex');
const binding = Object.freeze({
  assetId: '00000000-0000-4000-8000-000000000001', ownerId: 'synthetic_official_owner',
  sourceCreatedAt: '2026-10-01T01:00:00Z', storageObjectId: '00000000-0000-4000-8000-000000000002',
  storageVersion: 'synthetic-version-1', provider: 'supabase', bucket: 'platform-brand-assets',
  objectKey: 'synthetic_official_owner/logo/empty-test.png',
});
const observation = Object.freeze({
  observationId: '00000000-0000-4000-8000-000000000003',
  observationToken: '00000000-0000-4000-8000-000000000004', binding,
});
const dispositionId = '00000000-0000-4000-8000-000000000005';
const signedUrl = `https://project.supabase.test/storage/v1/object/sign/${binding.bucket}/${binding.objectKey}?token=synthetic-private-token`;
const emptyResponse = (headers = {'content-length': '0'}) => new Response(new Uint8Array(), {headers});

function verifierFixture(options = {}, module = api) {
  const calls = [];
  let checks = 0;
  const verify = module.createBrandEmptyTestOriginVerifier({
    projectUrl: options.projectUrl ?? 'https://project.supabase.test',
    bindingCurrent: async actual => {
      calls.push('binding');
      assert.deepEqual(actual, binding);
      assert.equal(Object.isFrozen(actual), true);
      if (options.bindingError) throw Error('synthetic secret error');
      return ++checks !== options.denyCheck;
    },
    signedUrl: async actual => {
      calls.push('sign');
      assert.deepEqual(actual, binding);
      if (options.signError) throw Error('synthetic secret error');
      return options.url ?? signedUrl;
    },
    fetcher: async (url, init) => {
      calls.push('GET');
      assert.equal(String(url), signedUrl);
      assert.equal(init.method, 'GET');
      assert.equal(init.redirect, 'error');
      assert.equal(init.cache, 'no-store');
      assert.equal(init.signal instanceof AbortSignal, true);
      assert.deepEqual(init.headers, {'Accept-Encoding': 'identity'});
      assert.equal(new Headers(init.headers).has('range'), false);
      assert.equal(init.body, undefined);
      if (options.fetchError) throw Error('synthetic secret error');
      return options.response ? options.response() : emptyResponse();
    },
  });
  return {calls, verify};
}

test('complete empty 200 with explicit identity encoding yields only the typed measured result', async () => {
  const f = verifierFixture({response: () => emptyResponse({'content-length': '0', 'content-encoding': 'identity'})});
  const start = Date.now();
  const result = await f.verify(binding);
  assert.deepEqual(f.calls, ['binding', 'sign', 'GET', 'binding']);
  assert.deepEqual(result, {
    protocol: 'brand-empty-test-origin-v1', sha256: EMPTY_SHA256, sizeBytes: 0,
    httpStatus: 200, fullReadback: true, encoding: 'identity', completedAt: result.completedAt,
  });
  assert.equal(new Date(result.completedAt).toISOString(), result.completedAt);
  assert.ok(Date.parse(result.completedAt) >= start && Date.parse(result.completedAt) <= Date.now());
  for (const secret of [binding.ownerId, binding.objectKey, observation.observationToken, 'token=']) {
    assert.equal(JSON.stringify(result).includes(secret), false);
  }
});

test('missing content length is allowed only after a real zero-byte successful EOF', async () => {
  let ended = false;
  const f = verifierFixture({response: () => new Response(new ReadableStream({
    start(controller) {
      controller.enqueue(new Uint8Array());
      controller.enqueue(new Uint8Array());
      ended = true;
      controller.close();
    },
  }))});
  const result = await f.verify(binding);
  assert.equal(ended, true);
  assert.equal(result.sizeBytes, 0);
  assert.equal(result.sha256, EMPTY_SHA256);
  assert.deepEqual(f.calls, ['binding', 'sign', 'GET', 'binding']);
});

test('null body, missing objects, error responses, redirects, partial data and unknown encoding fail closed', async () => {
  const responses = [
    () => new Response(null),
    ...[204, 206, 301, 302, 304, 400, 403, 404, 500].map(status => () =>
      new Response([204, 304].includes(status) ? null : new Uint8Array(), {status, headers: {'content-length': '0'}})),
    () => emptyResponse({'content-length': '0', 'content-range': 'bytes */0'}),
    ...['gzip', 'br', 'deflate', 'unknown', 'identity, gzip', ''].map(encoding => () =>
      emptyResponse({'content-length': '0', 'content-encoding': encoding})),
  ];
  for (const response of responses) {
    const f = verifierFixture({response});
    await assert.rejects(f.verify(binding), error => error.message === 'brand_empty_origin_full_read_required');
    assert.deepEqual(f.calls, ['binding', 'sign', 'GET']);
  }
});

test('content length must be exactly zero when present, never a numeric coercion or metadata-only claim', async () => {
  for (const length of ['1', '-1', '00', '+0', '0.0', '0e0', '0, 0', 'NaN', 'no', '', '536870913']) {
    const f = verifierFixture({response: () => emptyResponse({'content-length': length})});
    await assert.rejects(f.verify(binding), error => error.message === 'brand_empty_origin_full_read_required');
    assert.deepEqual(f.calls, ['binding', 'sign', 'GET']);
  }
});

test('positive streamed bytes fail with or without a zero length header and cancel the body', async () => {
  for (const headers of [{}, {'content-length': '0'}]) {
    let cancelled = false;
    const f = verifierFixture({response: () => new Response(new ReadableStream({
      start(controller) { controller.enqueue(new Uint8Array([1])); },
      cancel() { cancelled = true; },
    }), {headers})});
    await assert.rejects(f.verify(binding), error => error.message === 'brand_empty_origin_read_failed');
    assert.equal(cancelled, true);
    assert.deepEqual(f.calls, ['binding', 'sign', 'GET']);
  }
});

test('truncated or failed streams, including failures after empty chunks, never become zero evidence', async () => {
  for (const headers of [{}, {'content-length': '0'}]) {
    let pulls = 0;
    const f = verifierFixture({response: () => new Response(new ReadableStream({
      pull(controller) {
        if (++pulls === 1) controller.enqueue(new Uint8Array());
        else controller.error(Error('synthetic private truncated-stream detail'));
      },
    }), {headers})});
    await assert.rejects(f.verify(binding), error => error.message === 'brand_empty_origin_read_failed');
    assert.deepEqual(f.calls, ['binding', 'sign', 'GET']);
  }
});

test('a stream without EOF times out even if cancellation never settles', async () => {
  let cancelled = false;
  const module = loadModule((callback, milliseconds) => {
    assert.equal(milliseconds, 120_000);
    return setTimeout(callback, 10);
  });
  const f = verifierFixture({response: () => new Response(new ReadableStream({
    cancel() { cancelled = true; return new Promise(() => {}); },
  }))}, module);
  await assert.rejects(f.verify(binding), error => error.message === 'brand_empty_origin_read_failed');
  assert.equal(cancelled, true);
  assert.deepEqual(f.calls, ['binding', 'sign', 'GET']);
});

test('fetch deadline also bounds a transport that never returns response headers', async () => {
  const module = loadModule(callback => setTimeout(callback, 10));
  let signal;
  const verify = module.createBrandEmptyTestOriginVerifier({
    projectUrl: 'https://project.supabase.test', bindingCurrent: async () => true,
    signedUrl: async () => signedUrl,
    fetcher: async (_url, init) => { signal = init.signal; return new Promise(() => {}); },
  });
  await assert.rejects(verify(binding), error => error.message === 'brand_empty_origin_read_failed');
  assert.equal(signal.aborted, true);
});

test('invalid project configuration cannot initiate binding, signing or reading', () => {
  for (const projectUrl of ['bad', 'http://project.test', 'https://user:pass@project.test',
    'https://project.test/path', 'https://project.test/?q=1', 'https://project.test/#fragment']) {
    assert.throws(() => verifierFixture({projectUrl}), /brand_empty_origin_config_invalid/);
  }
});

test('invalid binding shape and noncanonical object keys cannot initiate transport', async () => {
  for (const patch of [{assetId: 'bad'}, {assetId: [binding.assetId]}, {storageObjectId: 'bad'},
    {ownerId: 'wrong-owner'}, {ownerId: {}}, {sourceCreatedAt: 'bad'}, {sourceCreatedAt: null},
    {storageVersion: ''}, {storageVersion: 'x'.repeat(257)}, {provider: 's3'}, {bucket: 'other'},
    {objectKey: 'synthetic_official_owner/../other'}, {objectKey: 'synthetic_official_owner/%2fsecret'},
    {objectKey: 'synthetic_official_owner//logo.png'}, {objectKey: 'synthetic_official_owner/./logo.png'},
    {objectKey: 'synthetic_official_owner/logo/'}, {objectKey: 1}, {objectKey: 'synthetic_official_owner/' + 'x'.repeat(1024)}]) {
    const f = verifierFixture();
    await assert.rejects(f.verify({...binding, ...patch}), /brand_empty_origin_binding_invalid/);
    assert.deepEqual(f.calls, []);
  }
  for (const malformed of [null, undefined, [], 'binding']) {
    const f = verifierFixture();
    await assert.rejects(f.verify(malformed), /brand_empty_origin_binding_invalid/);
    assert.deepEqual(f.calls, []);
  }
});

test('only the exact project, private sign route, key and single token are read', async () => {
  for (const url of [
    signedUrl.replace('project.supabase.test', 'other.supabase.test'),
    signedUrl.replace('https://', 'http://'),
    signedUrl.replace('https://', 'https://user:pass@'),
    signedUrl.replace('/object/sign/', '/object/public/'),
    signedUrl.replace('empty-test.png', 'other.png'),
    signedUrl + '#fragment', signedUrl + '&download=1', signedUrl + '&width=1',
    signedUrl + '&token=second', signedUrl.split('?')[0], signedUrl.split('?')[0] + '?token=',
  ]) {
    const f = verifierFixture({url});
    await assert.rejects(f.verify(binding), /brand_empty_origin_signed_url_invalid/);
    assert.deepEqual(f.calls, ['binding', 'sign']);
  }
});

test('generation checks run before signing and after complete EOF and fail closed', async () => {
  for (const denyCheck of [1, 2]) {
    const f = verifierFixture({denyCheck});
    await assert.rejects(f.verify(binding), /brand_empty_origin_binding_stale/);
    assert.deepEqual(f.calls, denyCheck === 1 ? ['binding'] : ['binding', 'sign', 'GET', 'binding']);
  }
});

test('binding, signing and fetch failures expose no provider detail or credentials', async () => {
  for (const [option, expected] of [['bindingError', 'brand_empty_origin_binding_stale'],
    ['signError', 'brand_empty_origin_signing_failed'], ['fetchError', 'brand_empty_origin_read_failed']]) {
    const f = verifierFixture({[option]: true});
    await assert.rejects(f.verify(binding), error => error.message === expected);
  }
});

function serviceFixture(options = {}) {
  const calls = [];
  let reads = 0;
  const adminClient = {
    from: () => { throw Error('unrelated inventory access'); },
    rpc: async (name, args) => {
      calls.push({name, args});
      if (name === 'begin_platform_brand_empty_observation') {
        assert.deepEqual(args, {p_asset_id: binding.assetId});
        if (options.beginThrow) throw Error('synthetic private begin failure');
        return options.begin ?? {data: {...observation, binding: {...binding}}};
      }
      assert.equal(args.p_observation_id, observation.observationId);
      assert.equal(args.p_observation_token, observation.observationToken);
      if (name === 'read_platform_brand_empty_observation') {
        assert.deepEqual(Object.keys(args).sort(), ['p_observation_id', 'p_observation_token']);
        reads++;
        if (options.readThrow) throw Error('synthetic private read failure');
        return options.read ? options.read(reads) : {data: {...observation, binding: {...binding}}};
      }
      assert.equal(name, 'record_platform_brand_empty_disposition');
      assert.deepEqual(Object.keys(args).sort(), ['p_observation_id', 'p_observation_token', 'p_result']);
      assert.deepEqual(args.p_result, {
        protocol: 'brand-empty-test-origin-v1', sha256: EMPTY_SHA256, sizeBytes: 0,
        httpStatus: 200, fullReadback: true, encoding: 'identity', completedAt: args.p_result.completedAt,
      });
      assert.equal(new Date(args.p_result.completedAt).toISOString(), args.p_result.completedAt);
      if (options.recordThrow) throw Error('synthetic private record failure');
      return options.receipt ?? {data: {recorded: true, assetId: binding.assetId, dispositionId}};
    },
    storage: {from: bucket => {
      assert.equal(bucket, binding.bucket);
      return {createSignedUrl: async (key, seconds) => {
        calls.push({name: 'sign'});
        assert.equal(key, binding.objectKey);
        assert.equal(seconds, 120);
        return options.signed ?? {data: {signedUrl}};
      }};
    }},
  };
  const deps = {
    projectUrl: 'https://project.supabase.test', adminClient,
    fetcher: async (_url, init) => {
      calls.push({name: 'GET'});
      assert.equal(init.method, 'GET');
      assert.deepEqual(init.headers, {'Accept-Encoding': 'identity'});
      return options.response ? options.response() : emptyResponse();
    },
  };
  return {calls, deps, run: () => api.recordPlatformBrandEmptyTestDisposition(binding.assetId, deps)};
}

test('actual orchestration obtains private observation, rechecks both sides, then records measured evidence once', async () => {
  const f = serviceFixture();
  const result = await f.run();
  assert.deepEqual(f.calls.map(call => call.name), [
    'begin_platform_brand_empty_observation', 'read_platform_brand_empty_observation', 'sign', 'GET',
    'read_platform_brand_empty_observation', 'record_platform_brand_empty_disposition',
  ]);
  assert.deepEqual(result, {recorded: true, assetId: binding.assetId, dispositionId,
    evidenceKind: 'empty_test', scanEvidence: false, expiryActivated: false});
  for (const secret of [binding.ownerId, binding.objectKey, observation.observationToken, 'token=']) {
    assert.equal(JSON.stringify(result).includes(secret), false);
  }
});

test('orchestration rejects invalid asset and project before any RPC', async () => {
  for (const assetId of ['', 'bad', null, [binding.assetId]]) {
    const f = serviceFixture();
    await assert.rejects(api.recordPlatformBrandEmptyTestDisposition(assetId, f.deps), /brand_empty_origin_binding_invalid/);
    assert.deepEqual(f.calls, []);
  }
  const f = serviceFixture();
  await assert.rejects(api.recordPlatformBrandEmptyTestDisposition(binding.assetId,
    {...f.deps, projectUrl: 'http://project.test'}), /brand_empty_origin_config_invalid/);
  assert.deepEqual(f.calls, []);
});

test('missing authorization or malformed begin replies never sign, read or record', async () => {
  for (const begin of [{data: null}, {error: {message: 'private failure'}}, {data: []}, {data: 'wrong'},
    {data: {}}, {data: {...observation, observationId: 'wrong'}}, {data: {...observation, observationToken: 'wrong'}},
    {data: {...observation, binding: {...binding, assetId: dispositionId}}},
    {data: {...observation, binding: {...binding, storageVersion: ''}}}]) {
    const f = serviceFixture({begin});
    await assert.rejects(f.run(), /brand_empty_(observation|origin_binding)/);
    assert.deepEqual(f.calls.map(call => call.name), ['begin_platform_brand_empty_observation']);
  }
  const f = serviceFixture({beginThrow: true});
  await assert.rejects(f.run(), error => error.message === 'brand_empty_observation_unconfirmed');
  assert.equal(f.calls.length, 1);
});

test('all typed generation fields and observation credentials are rechecked before and after the read', async () => {
  const patches = [
    {binding: {...binding, assetId: dispositionId}},
    {binding: {...binding, ownerId: 'another_owner', objectKey: 'another_owner/logo/empty-test.png'}},
    {binding: {...binding, sourceCreatedAt: '2026-10-02T01:00:00Z'}},
    {binding: {...binding, storageObjectId: dispositionId}},
    {binding: {...binding, storageVersion: 'replaced-generation'}},
    {binding: {...binding, provider: 's3'}}, {binding: {...binding, bucket: 'another-bucket'}},
    {binding: {...binding, objectKey: 'synthetic_official_owner/logo/another.png'}},
    {observationId: dispositionId}, {observationToken: dispositionId},
  ];
  for (const check of [1, 2]) {
    for (const patch of patches) {
      const f = serviceFixture({read: reads => ({data: {...observation, ...(reads === check ? patch : {})}})});
      await assert.rejects(f.run(), error => error.message === 'brand_empty_origin_binding_stale');
      assert.equal(f.calls.some(call => call.name === 'GET'), check === 2);
      assert.equal(f.calls.some(call => call.name === 'record_platform_brand_empty_disposition'), false);
    }
  }
});

test('archived-source, delegation, snapshot and metadata rejection from SQL fails closed on either recheck', async () => {
  for (const check of [1, 2]) {
    for (const failed of [{data: null}, {data: []}, {data: {}}, {error: {message: 'private SQL reason'}}]) {
      const f = serviceFixture({read: reads => reads === check ? failed : {data: observation}});
      await assert.rejects(f.run(), error => error.message === 'brand_empty_origin_binding_stale');
      assert.equal(f.calls.some(call => call.name === 'record_platform_brand_empty_disposition'), false);
    }
  }
  const f = serviceFixture({readThrow: true});
  await assert.rejects(f.run(), error => error.message === 'brand_empty_origin_binding_stale');
  assert.equal(f.calls.some(call => call.name === 'sign'), false);
});

test('signing and origin failures never call the disposition writer', async () => {
  for (const options of [{signed: {error: {message: 'private signing error'}}},
    {signed: {data: null}}, {signed: {data: {signedUrl: 'https://other.test/?token=bad'}}},
    {response: () => new Response('positive', {headers: {'content-length': '0'}})},
    {response: () => new Response('missing', {status: 404})},
    {response: () => new Response(null)}]) {
    const f = serviceFixture(options);
    await assert.rejects(f.run(), /brand_empty_origin_/);
    assert.equal(f.calls.some(call => call.name === 'record_platform_brand_empty_disposition'), false);
  }
});

test('uncertain or malformed record acknowledgement fails without retry or false recorded output', async () => {
  for (const receipt of [{data: null}, {data: []}, {error: {message: 'private failure'}},
    {data: {recorded: 'true', assetId: binding.assetId, dispositionId}},
    {data: {recorded: true, assetId: dispositionId, dispositionId}},
    {data: {recorded: true, assetId: binding.assetId}},
    {data: {recorded: true, assetId: binding.assetId, dispositionId: 'bad'}}]) {
    const f = serviceFixture({receipt});
    await assert.rejects(f.run(), /brand_empty_(observation_unconfirmed|disposition_not_confirmed)/);
    assert.equal(f.calls.filter(call => call.name === 'record_platform_brand_empty_disposition').length, 1);
  }
  const f = serviceFixture({recordThrow: true});
  await assert.rejects(f.run(), error => error.message === 'brand_empty_observation_unconfirmed');
  assert.equal(f.calls.filter(call => call.name === 'record_platform_brand_empty_disposition').length, 1);
});

const endpoint = ts.transpileModule(readFileSync(new URL('../supabase/functions/media-object-storage-migration/index.ts', import.meta.url), 'utf8')
  .replace(/^import .*;\n/gm, ''), {compilerOptions: {target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None}}).outputText;
function handlerFixture(options = {}) {
  const f = serviceFixture(options);
  const token = 'synthetic-empty-test-operator-token-for-disposable-tests';
  const env = {
    MEDIA_OBJECT_MIGRATION_OPERATOR_TOKEN_SHA256: createHash('sha256').update(token).digest('hex'),
    SUPABASE_URL: f.deps.projectUrl, SUPABASE_SERVICE_ROLE_KEY: 'synthetic-not-a-key',
  };
  const handler = new Function('Deno', 'createClient', 'crypto', 'recordPlatformBrandEmptyTestDisposition',
    endpoint + ';return handler;')(
    {env: {get: key => env[key]}, serve: () => {}}, () => f.deps.adminClient, globalThis.crypto,
    (assetId, deps) => api.recordPlatformBrandEmptyTestDisposition(assetId, {...deps, fetcher: f.deps.fetcher}));
  return {...f, request: (payload, authorized = true) => handler(new Request('https://edge.test', {
    method: 'POST', headers: {'x-media-object-migration-token': authorized ? token : 'wrong'}, body: JSON.stringify(payload),
  }))};
}
const payload = {action: 'record_brand_empty_test_disposition', assetId: binding.assetId};

test('actual endpoint preserves operator authorization and only exposes selected disposition confirmation', async () => {
  const f = handlerFixture();
  assert.equal((await f.request(payload, false)).status, 401);
  assert.deepEqual(f.calls, []);
  const response = await f.request(payload);
  assert.equal(response.status, 200);
  const result = await response.json();
  assert.equal(result.recorded, true);
  assert.equal(result.evidenceKind, 'empty_test');
  assert.equal(result.dispositionId, dispositionId);
  assert.equal(result.scanEvidence, false);
  assert.equal(result.expiryActivated, false);
  for (const secret of [binding.ownerId, binding.objectKey, observation.observationToken, 'token=', 'synthetic-not-a-key']) {
    assert.equal(JSON.stringify(result).includes(secret), false);
  }
  assert.equal(f.calls.filter(call => call.name === 'record_platform_brand_empty_disposition').length, 1);
  assert.equal(f.calls.some(call => /receipt|retention_proof|delete|expiry|scan/.test(call.name)), false);
});

test('endpoint rejects caller evidence, tokens, bindings, arbitrary targets and malformed IDs before any RPC', async () => {
  const invalid = [
    {action: payload.action}, {...payload, assetId: null}, {...payload, assetId: [binding.assetId]}, {...payload, assetId: 'bad'},
    ...['sha256', 'sizeBytes', 'httpStatus', 'fullReadback', 'completedAt', 'encoding', 'protocol',
      'observationId', 'observationToken', 'binding', 'p_result', 'scanReceiptId', 'ownerId', 'objectKey', 'signedUrl', 'assetIds']
      .map(key => ({...payload, [key]: 'caller-claimed-evidence'})),
  ];
  for (const body of invalid) {
    const f = handlerFixture();
    assert.equal((await f.request(body)).status, 400);
    assert.deepEqual(f.calls, []);
  }
});

test('endpoint returns only sanitized failure on blocked admission and uncertain registration, never retries', async () => {
  for (const options of [{begin: {data: null}}, {readThrow: true}, {recordThrow: true},
    {receipt: {data: {recorded: true, assetId: 'wrong', dispositionId}}}]) {
    const f = handlerFixture(options);
    const response = await f.request(payload);
    assert.equal(response.status, 409);
    const result = await response.json();
    assert.equal(result.error, 'brand_empty_disposition_not_confirmed');
    assert.equal(result.recorded, undefined);
    assert.equal(JSON.stringify(result).includes('private'), false);
    assert.ok(f.calls.filter(call => call.name === 'record_platform_brand_empty_disposition').length <= 1);
  }
});
