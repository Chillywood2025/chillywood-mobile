import assert from 'node:assert/strict';
import test from 'node:test';
import { createInspectionOriginReader, inspectionOriginConfig } from './content-inspection-private-origin.ts';

const env = {
  S3_PROVIDER: 'hetzner', S3_ENDPOINT: 'https://origin.example.invalid', S3_BUCKET: 'private-test',
  S3_REGION: 'test', S3_ACCESS_KEY_ID: 'synthetic-access', S3_SECRET_ACCESS_KEY: 'synthetic-secret',
};
const config = () => inspectionOriginConfig((key) => env[key]);
const binding = { provider: 's3', bucket: 'private-test', objectKey: 'synthetic-owner/source with space.mp4' };

test('only existing configured private providers are supported', () => {
  assert.equal(config().provider, 's3');
  assert.throws(() => inspectionOriginConfig(() => undefined), { code: 'private_origin_unavailable' });
  assert.throws(() => inspectionOriginConfig((key) => key === 'MEDIA_ORIGIN_PROVIDER' ? 'cloudflare_r2' : undefined), { code: 'private_origin_unavailable' });
  for (const endpoint of ['http://origin.example.invalid', 'https://user:pass@origin.example.invalid', 'https://origin.example.invalid/path']) {
    assert.throws(() => createInspectionOriginReader({ ...config(), endpoint }), { code: 'private_origin_unavailable' });
  }
});

test('private request signs exact range and validator and rejects redirects/caching', async () => {
  let observed;
  const read = createInspectionOriginReader(config(), async (url, options) => {
    observed = { url: new URL(url), options };
    return new Response(null, { status: 206 });
  });
  const result = await read(binding, 'GET', { range: 'bytes=0-9', 'if-match': '"exact"' }, new AbortController().signal);
  assert.equal(result.status, 206);
  assert.equal(observed.url.host, 'private-test.origin.example.invalid');
  assert.match(observed.url.pathname, /source%20with%20space.mp4$/);
  assert.equal(observed.url.searchParams.get('X-Amz-SignedHeaders'), 'host;if-match;range');
  assert.equal(observed.options.redirect, 'error');
  assert.equal(observed.options.cache, 'no-store');
});

test('wrong provider/bucket/path and injected headers cannot reach origin', async () => {
  let calls = 0;
  const read = createInspectionOriginReader(config(), async () => { calls++; return new Response(); });
  for (const change of [{ provider: 'supabase' }, { bucket: 'other' }, { objectKey: '../secret' }, { objectKey: '/absolute' }, { objectKey: 'bad\nkey' }]) {
    await assert.rejects(read({ ...binding, ...change }, 'HEAD', {}, new AbortController().signal), { code: 'unavailable_original' });
  }
  await assert.rejects(read(binding, 'GET', { authorization: 'injected' }, new AbortController().signal), { code: 'origin_request_invalid' });
  assert.equal(calls, 0);
});

test('provider errors cannot disclose signed URLs or internal details', async () => {
  const read = createInspectionOriginReader(config(), async (url) => { throw new Error(`failed ${url}`); });
  await assert.rejects(read(binding, 'HEAD', {}, new AbortController().signal), (error) => {
    assert.equal(error.message, 'private_origin_unavailable');
    assert.equal(error.message.includes('synthetic-access'), false);
    return true;
  });
});

test('retirement deadline caps signed URL lifetime and abort deadline', async () => {
  let observed;
  const deadline = Date.now() + 10500;
  const read = createInspectionOriginReader(config(), async (url, options) => {
    observed = { url: new URL(url), signal: options.signal };
    return new Response(null, { status: 206 });
  });
  const callerSignal = new AbortController().signal;
  await read({ ...binding, originReadExpiresAt: new Date(deadline).toISOString() }, 'GET', { range: 'bytes=0-9' }, callerSignal);
  const seconds = Number(observed.url.searchParams.get('X-Amz-Expires'));
  assert.ok(seconds > 0 && seconds <= 10);
  assert.notEqual(observed.signal, callerSignal);
  const stamp = observed.url.searchParams.get('X-Amz-Date');
  const signedAt = Date.parse(stamp.replace(/^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})Z$/, '$1-$2-$3T$4:$5:$6Z'));
  assert.ok(signedAt + seconds * 1000 <= deadline);
});

test('expired or malformed origin deadline cannot be signed or fetched', async () => {
  let calls = 0;
  const read = createInspectionOriginReader(config(), async () => { calls++; return new Response(); });
  for (const originReadExpiresAt of ['2000-01-01T00:00:00Z', 'invalid', new Date(Date.now() + 500).toISOString()]) {
    await assert.rejects(read({ ...binding, originReadExpiresAt }, 'HEAD', {}, new AbortController().signal), { code: 'media_retired_or_expired' });
  }
  assert.equal(calls, 0);
});
