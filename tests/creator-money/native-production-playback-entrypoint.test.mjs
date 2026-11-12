import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import ts from 'typescript';

const entry = path.resolve('supabase/functions/native-production-paid-video-playback/index.ts');
const buyer = '11111111-1111-4111-8111-111111111111';
const session = '22222222-2222-4222-8222-222222222222';
const admission = '33333333-3333-4333-8333-333333333333';
const qualification = '44444444-4444-4444-8444-444444444444';
const video = '55555555-5555-4555-8555-555555555555';
const grant = '66666666-6666-4666-8666-666666666666';
const sourceVersion = '77777777-7777-4777-8777-777777777777';
const etag = '"' + 'a'.repeat(32) + '"';
const entrySource = readFileSync(entry, 'utf8');

// Load the actual Deno entrypoint and every local implementation. Only the
// external Supabase client, environment and HTTP boundary are synthetic.
function fixture({ enabled = true, authenticated = true, oldWiring = false,
  originEtag = etag, changedAuthority = false, onOrigin } = {}) {
  const calls = { auth: 0, rpc: [], origin: [] };
  const environment = {
    NATIVE_PRODUCTION_PLAYBACK_ENABLED: String(enabled),
    SUPABASE_URL: 'https://authority.example.invalid', SUPABASE_ANON_KEY: 'synthetic-anon',
    SUPABASE_SERVICE_ROLE_KEY: 'synthetic-service', S3_PROVIDER: 'hetzner',
    S3_ENDPOINT: 'https://origin.example.invalid', S3_BUCKET: 'private-test',
    S3_REGION: 'test', S3_ACCESS_KEY_ID: 'synthetic-access', S3_SECRET_ACCESS_KEY: 'synthetic-secret',
  };
  const client = {
    auth: {
      getClaims: async () => { calls.auth++; return { data: { claims: authenticated ? { sub: buyer, session_id: session } : {} } }; },
      getUser: async () => ({ data: { user: { id: buyer } } }),
    },
    rpc: async (name, args) => {
      calls.rpc.push({ name, args });
      if (name === 'record_native_production_checkout_preflight') return { data: {
        protocol: 'native-production-preflight-v1', status: 'READY', admissionId: admission, dispatchAllowed: false,
      } };
      assert.ok(['resolve_native_production_checkout_preflight', 'resolve_native_production_paid_video_origin'].includes(name));
      return { data: {
        protocol: name.includes('preflight') ? 'native-production-preflight-v1' : 'native-production-origin-v1',
        buyerId: buyer, sessionId: session, admissionId: admission, qualificationId: qualification,
        videoId: video, grantId: grant, sourceVersionId: sourceVersion, provider: 's3', bucket: 'private-test',
        objectKey: 'synthetic/source.mp4', generation: changedAuthority && calls.rpc.length > 1 ? '"' + 'b'.repeat(32) + '"' : etag,
        assetSha256: 'c'.repeat(64), byteLength: 8, validUntilMs: Date.now() + 4500,
      } };
    },
  };
  const request = async (url, options) => {
    calls.origin.push({ url: new URL(url), options });
    assert.ok(options.signal instanceof AbortSignal, 'actual HTTP boundary receives AbortSignal');
    if (onOrigin) await onOrigin(options);
    if (options.signal.aborted) throw new DOMException('Aborted', 'AbortError');
    return new Response(options.method === 'HEAD' ? null : new Uint8Array(8), {
      status: options.method === 'HEAD' ? 200 : 206,
      headers: { etag: originEtag, 'content-type': 'video/mp4', 'content-length': '8',
        ...(options.method === 'GET' ? { 'content-range': 'bytes 0-7/8' } : {}) },
    });
  };
  let handler;
  const deno = { env: { get: name => environment[name] }, serve: value => { assert.equal(handler, undefined); handler = value; } };
  const cache = new Map();
  const load = filename => {
    if (cache.has(filename)) return cache.get(filename).exports;
    const module = { exports: {} }; cache.set(filename, module);
    let source = readFileSync(filename, 'utf8');
    if (filename === entry && oldWiring) {
      const fixed = '(binding,method,headers,signal)';
      assert.ok(source.includes(fixed), 'mutation targets the real fixed adapter');
      source = source.replace(fixed, '(binding,method,signal,headers)');
    }
    const require = specifier => {
      if (specifier === 'npm:@supabase/supabase-js@2') return { createClient: () => client };
      assert.ok(specifier.startsWith('.') && specifier.endsWith('.ts'), `unmodeled import: ${specifier}`);
      return load(path.resolve(path.dirname(filename), specifier));
    };
    const compiled = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS } }).outputText;
    new Function('exports', 'module', 'require', 'Deno', 'fetch', compiled)(module.exports, module, require, deno, request);
    return module.exports;
  };
  load(entry);
  assert.equal(typeof handler, 'function');
  const run = ({ preflight = false, signal } = {}) => handler(new Request(
    `https://edge.example.invalid/functions/v1/native-production-paid-video-playback/${preflight ? 'preflight/' + admission : video + '/' + grant}`, {
      method: preflight ? 'POST' : 'GET', signal,
      headers: { Authorization: 'Bearer synthetic-user', 'X-Chillywood-Auth-Session': session,
        ...(preflight ? { 'content-type': 'application/json' } : { Range: 'bytes=0-7' }) },
      ...(preflight ? { body: JSON.stringify({ configurationSha256: 'd'.repeat(64) }) } : {}),
    }));
  return { run, calls };
}

test('real playback entrypoint signs conditional HEAD, preserves deadline and records only verified preflight', async () => {
  const f = fixture(), response = await f.run({ preflight: true });
  assert.equal(response.status, 200);
  assert.equal((await response.json()).status, 'READY');
  assert.equal(f.calls.origin.length, 1);
  const { url, options } = f.calls.origin[0];
  assert.equal(options.method, 'HEAD');
  assert.deepEqual(options.headers, { 'if-match': etag });
  assert.equal(url.searchParams.get('X-Amz-SignedHeaders'), 'host;if-match');
  assert.equal(options.redirect, 'error');
  assert.equal(options.cache, 'no-store');
  assert.equal(options.signal.aborted, true, 'handler closes its deadline signal after completion');
  assert.deepEqual(f.calls.rpc.map(x => x.name), ['resolve_native_production_checkout_preflight',
    'resolve_native_production_checkout_preflight', 'record_native_production_checkout_preflight']);
});

test('real playback entrypoint signs exact range and If-Match and returns current authorized bytes', async () => {
  const f = fixture(), response = await f.run();
  assert.equal(response.status, 206);
  assert.equal((await response.arrayBuffer()).byteLength, 8);
  const { url, options } = f.calls.origin[0];
  assert.deepEqual(options.headers, { 'if-match': etag, range: 'bytes=0-7' });
  assert.equal(url.searchParams.get('X-Amz-SignedHeaders'), 'host;if-match;range');
  assert.equal(response.headers.get('content-range'), 'bytes 0-7/8');
  assert.equal(f.calls.rpc.length, 2);
});

test('old entrypoint argument order fails the real private reader before HTTP for HEAD and range', async () => {
  assert.match(entrySource, /\(binding,method,headers,signal\)/);
  for (const preflight of [true, false]) {
    const f = fixture({ oldWiring: true }), response = await f.run({ preflight });
    assert.equal(response.status, 403);
    assert.equal(f.calls.origin.length, 0);
    assert.equal(f.calls.rpc.length, 1);
  }
});

test('disabled and unauthenticated entrypoint cannot access the origin', async () => {
  for (const config of [{ enabled: false }, { authenticated: false }]) {
    const f = fixture(config), response = await f.run();
    assert.equal(response.status, config.enabled === false ? 503 : 403);
    assert.equal(f.calls.origin.length, 0);
    assert.equal(f.calls.rpc.length, 0);
  }
});

test('origin identity mismatch and authority change never deliver bytes or record successful preflight', async () => {
  for (const config of [{ originEtag: '"wrong"' }, { changedAuthority: true }]) {
    for (const preflight of [true, false]) {
      const f = fixture(config), response = await f.run({ preflight });
      assert.equal(response.status, 403);
      assert.equal((await response.json()).status, 'unavailable');
      assert.equal(f.calls.origin.length, 1);
      assert.equal(f.calls.rpc.length, config.changedAuthority ? 2 : 1);
      assert.ok(!f.calls.rpc.some(x => x.name === 'record_native_production_checkout_preflight'));
    }
  }
});

test('incoming cancellation before origin dispatch prevents HTTP', async () => {
  const controller = new AbortController(); controller.abort();
  const f = fixture(), response = await f.run({ signal: controller.signal });
  assert.equal(response.status, 403);
  assert.equal(f.calls.origin.length, 0);
});

test('incoming cancellation reaches actual origin HTTP signal and cannot record or return paid media', async () => {
  for (const preflight of [true, false]) {
    const controller = new AbortController();
    const observed = [];
    const f = fixture({ onOrigin: options => {
      observed.push(options.signal.aborted);
      controller.abort();
      observed.push(options.signal.aborted);
    } });
    const response = await f.run({ preflight, signal: controller.signal });
    assert.equal(response.status, 403);
    assert.equal(f.calls.origin.length, 1);
    assert.deepEqual(observed, [false, true]);
    assert.ok(!f.calls.rpc.some(x => x.name === 'record_native_production_checkout_preflight'));
  }
});
