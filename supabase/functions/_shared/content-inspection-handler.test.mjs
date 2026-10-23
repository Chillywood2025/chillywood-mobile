import assert from 'node:assert/strict';
import test from 'node:test';
import { createContentInspectionHandler } from './content-inspection-handler.ts';

const actorId = '11111111-1111-4111-8111-111111111111';
const session = '22222222-2222-4222-8222-222222222222';
const receipt = '33333333-3333-4333-8333-333333333333';
const authorizationId = '44444444-4444-4444-8444-444444444444';
const fingerprint = 'a'.repeat(32);
const publicOrigin = 'https://synthetic.example.invalid';
const endpoint = `${publicOrigin}/functions/v1/admin-content-inspection`;
const payload = { action: 'prepare_media', contextId: actorId, targetType: 'creator_video', targetId: session, reason: 'Review reported content', requestId: authorizationId };
const post = (body = payload) => new Request('https://synthetic.example.invalid/functions/v1/admin-content-inspection', {
  method: 'POST', headers: { Authorization: 'Bearer synthetic' }, body: JSON.stringify(body),
});
const get = () => new Request(`https://synthetic.example.invalid/functions/v1/admin-content-inspection?v=${fingerprint}`, {
  headers: { Authorization: 'Bearer synthetic', 'X-Inspection-Receipt': receipt, Range: 'bytes=3-9' },
});

function fixture(options = {}) {
  const calls = [];
  const ids = [];
  let authorizations = 0;
  let retirementChecks = 0;
  const rpc = async (name, args) => {
    calls.push(name);
    if (name === 'admin_prepare_content_inspection_media') return { data: {
      availability: 'ready', receiptId: receipt, storedVersion: fingerprint, mimeType: 'image/jpeg',
      sizeBytes: 100, expiresAt: new Date(Date.now() + 30000).toISOString(),
      objectKey: 'must-not-leak', signedUrl: 'must-not-leak',
    }, error: null };
    authorizations++;
    ids.push(args.p_request_id);
    assert.equal(args.p_receipt_id, receipt);
    assert.equal(args.p_expected_version, fingerprint);
    if (options.revoke && authorizations === 2) return { data: null, error: { code: '42501', message: 'revoked' } };
    if (options.auditFailure && authorizations === 2) return { data: null, error: { code: 'XX000', message: 'private sensitive audit failure details' } };
    return { data: { allowed: true, authorizationId, receiptId: receipt, storedVersion: fingerprint }, error: null };
  };
  const dependencies = {
    supabaseUrl: publicOrigin,
    authenticate: async () => { calls.push('authenticate'); return options.stale ? null : { userId: actorId, sessionGeneration: session, rpc }; },
    resolve: async (name, args) => {
      calls.push(name);
      if (name === 'check_deleted_media_retirement') {
        retirementChecks++;
        assert.deepEqual(args, { p_provider: 's3', p_bucket: 'private', p_object_key: 'synthetic/source', p_purpose: 'inspection' });
        if (options.retirementError) return { data: null, error: { message: 'private retirement error' } };
        if (options.retired || (options.lateRetired && retirementChecks === 4)) return { data: { allowed: false }, error: null };
        if (options.expired || (options.lateExpired && retirementChecks === 4)) return { data: { allowed: true, expiresAt: '2000-01-01T00:00:00Z' }, error: null };
        if (options.malformedExpiry) return { data: { allowed: true, expiresAt: 'not-a-date' }, error: null };
        return { data: { allowed: true }, error: null };
      }
      assert.deepEqual(args, { p_authorization_id: authorizationId, p_actor_id: actorId, p_session_generation: session });
      return { data: { provider: 's3', bucket: 'private', objectKey: 'synthetic/source', mimeType: 'image/jpeg', sizeBytes: 100, storedVersion: options.changed ? 'b'.repeat(32) : fingerprint }, error: null };
    },
    origin: async (_binding, method, headers) => {
      calls.push(method);
      if (method === 'HEAD') return new Response(null, { headers: { 'Content-Type': 'image/jpeg', 'Content-Length': '100', ETag: '"exact"' } });
      const match = /^bytes=(\d+)-(\d+)$/.exec(headers.range);
      const start = Number(match[1]); const end = Number(match[2]);
      const bytes = new Uint8Array(100); bytes.set([255, 216, 255]);
      return new Response(bytes.slice(start, end + 1), { status: 206, headers: {
        'Content-Type': 'image/jpeg', 'Content-Length': String(end - start + 1), 'Content-Range': `bytes ${start}-${end}/100`, ETag: '"exact"',
      } });
    },
  };
  return { dependencies, calls, ids, handler: createContentInspectionHandler(dependencies) };
}

test('prepare exposes safe descriptor only, with noncredential version URL', async () => {
  const { handler, calls } = fixture();
  const response = await handler(post());
  const body = await response.json();
  assert.equal(response.status, 200);
  assert.equal(body.availability, 'ready');
  assert.equal(body.receiptId, receipt);
  assert.equal(body.objectKey, undefined);
  assert.equal(body.signedUrl, undefined);
  assert.equal(body.streamUrl, `${endpoint}?v=${fingerprint}`);
  assert.equal(body.streamUrl.includes(receipt), false);
  assert.deepEqual(calls, ['authenticate', 'admin_prepare_content_inspection_media']);
});

test('prepare derives public endpoint only from trusted configuration, not runtime URL or forwarded headers', async () => {
  for (const supabaseUrl of [publicOrigin, `${publicOrigin}/`, 'https://another-project.supabase.co', 'https://custom-api.example.invalid']) {
    for (const runtimeUrl of [endpoint, 'http://edge-runtime:9000/admin-content-inspection', `https://internal.invalid/rewritten/path?v=${'b'.repeat(32)}#untrusted-fragment`]) {
      const { dependencies, calls } = fixture();
      dependencies.supabaseUrl = supabaseUrl;
      const response = await createContentInspectionHandler(dependencies)(new Request(runtimeUrl, {
        method: 'POST', headers: {
          Authorization: 'Bearer synthetic', Host: 'attacker.invalid',
          Forwarded: 'host=attacker.invalid;proto=http', 'X-Forwarded-Host': 'attacker.invalid',
          'X-Forwarded-Proto': 'http', 'X-Forwarded-Prefix': '/attacker-path',
        }, body: JSON.stringify(payload),
      }));
      assert.equal(response.status, 200);
      const body = await response.json();
      assert.equal(body.streamUrl, `${new URL(supabaseUrl).origin}/functions/v1/admin-content-inspection?v=${fingerprint}`);
      const stream = new URL(body.streamUrl);
      assert.equal(stream.username, ''); assert.equal(stream.password, ''); assert.equal(stream.hash, '');
      assert.deepEqual(calls, ['authenticate', 'admin_prepare_content_inspection_media']);
    }
  }
});

test('missing, unsafe or noncanonical public configuration fails closed before receipt creation', async () => {
  for (const supabaseUrl of [undefined, '', 'not-a-url', '//fixture.invalid', 'http://edge-runtime:9000',
    'https://user:password@fixture.invalid', 'https://@fixture.invalid', `${publicOrigin}/path`, `${publicOrigin}/a/..`,
    `${publicOrigin}?token=private`, `${publicOrigin}#private`, `${publicOrigin}?`, `${publicOrigin}#`,
    ` ${publicOrigin}`, `${publicOrigin}\n`, `${publicOrigin}//`]) {
    const { dependencies, calls } = fixture();
    dependencies.supabaseUrl = supabaseUrl;
    const response = await createContentInspectionHandler(dependencies)(post());
    assert.equal(response.status, 503, String(supabaseUrl));
    assert.deepEqual(await response.json(), { error: 'content_inspection_unavailable' });
    assert.deepEqual(calls, ['authenticate']);
  }
});

test('request query cannot inject stream credentials or duplicate version and never reaches authorization', async () => {
  for (const query of [`?v=${fingerprint}&v=${fingerprint}`, `?v=${fingerprint}&token=private`, `?receipt=${receipt}`, '?redirect=https://attacker.invalid']) {
    const { handler, calls } = fixture();
    const response = await handler(new Request(`${endpoint}${query}`, { method: 'POST', body: JSON.stringify(payload) }));
    assert.equal(response.status, 400);
    assert.deepEqual(await response.json(), { error: 'invalid_request' });
    assert.deepEqual(calls, []);
  }
});

test('only a canonical database version is returned, never request-supplied or credential-bearing version', async () => {
  for (const storedVersion of ['a'.repeat(31), 'a'.repeat(65), 'A'.repeat(32), `${fingerprint}&token=private`, '%61'.repeat(32), null]) {
    const { dependencies, calls } = fixture();
    const authenticate = dependencies.authenticate;
    dependencies.authenticate = async request => {
      const actor = await authenticate(request);
      const prepare = actor.rpc;
      actor.rpc = async (name, args) => { const result = await prepare(name, args); result.data.storedVersion = storedVersion; return result; };
      return actor;
    };
    const response = await createContentInspectionHandler(dependencies)(post());
    assert.equal(response.status, 503);
    assert.deepEqual(await response.json(), { error: 'content_inspection_unavailable' });
    assert.deepEqual(calls, ['authenticate', 'admin_prepare_content_inspection_media']);
  }
});

test('arbitrary path/URL/owner fields and unsupported targets are rejected', async () => {
  for (const addition of [{ bucket: 'injected' }, { objectKey: 'injected' }, { url: 'https://injected.invalid' }, { actorId }, { targetType: 'arbitrary_table' }, { action: 'export' }]) {
    const { handler, calls } = fixture();
    assert.equal((await handler(post({ ...payload, ...addition }))).status, 400);
    assert.deepEqual(calls, ['authenticate']);
  }
});

test('every range authenticates and reauthorizes after bytes, before delivery', async () => {
  const { handler, calls, ids } = fixture();
  const response = await handler(get());
  assert.equal(response.status, 206);
  assert.equal((await response.arrayBuffer()).byteLength, 7);
  assert.deepEqual(calls, ['authenticate', 'admin_authorize_content_inspection_media', 'admin_resolve_content_inspection_media',
    'check_deleted_media_retirement', 'HEAD', 'check_deleted_media_retirement', 'GET', 'check_deleted_media_retirement', 'GET',
    'check_deleted_media_retirement', 'admin_authorize_content_inspection_media']);
  assert.equal(new Set(ids).size, 2);
});

test('revocation and audit failure at final authorization return only safe JSON error', async () => {
  for (const options of [{ revoke: true }, { auditFailure: true }]) {
    const { handler } = fixture(options);
    const response = await handler(get());
    assert.equal(response.status, options.revoke ? 403 : 503);
    assert.equal(response.headers.get('Content-Type'), 'application/json');
    const text = await response.text();
    assert.equal(text.includes('private sensitive'), false);
    assert.equal(text.includes('synthetic/source'), false);
  }
});

test('stale session and replaced binding never fetch an origin', async () => {
  for (const options of [{ stale: true }, { changed: true }]) {
    const { handler, calls } = fixture(options);
    assert.equal((await handler(get())).status, options.stale ? 401 : 409);
    assert.equal(calls.includes('HEAD'), false);
  }
});

test('missing RPC and disabled database fail closed before origin', async () => {
  for (const error of [{ code: 'PGRST202', message: 'missing function' }, { code: '42501', message: 'content_inspection_disabled' }]) {
    const { dependencies, calls } = fixture();
    dependencies.authenticate = async () => ({ userId: actorId, sessionGeneration: session, rpc: async () => ({ data: null, error }) });
    const response = await createContentInspectionHandler(dependencies)(post());
    assert.equal(response.status, 503);
    assert.equal(calls.includes('HEAD'), false);
  }
});

test('receipt is never accepted from a URL, and cannot replace authentication', async () => {
  const { handler, calls } = fixture();
  const response = await handler(new Request(`https://synthetic.example.invalid/?receipt=${receipt}&v=${fingerprint}`));
  assert.equal(response.status, 400);
  assert.deepEqual(calls, []);
  const unauthenticated = fixture({ stale: true });
  assert.equal((await unauthenticated.handler(get())).status, 401);
});

test('expired, retired, malformed or failed retirement checks never reach origin', async () => {
  for (const options of [{ expired: true }, { retired: true }, { malformedExpiry: true }, { retirementError: true }]) {
    const { handler, calls } = fixture(options);
    const response = await handler(get());
    assert.equal(response.status, options.retirementError ? 503 : 403);
    assert.equal(calls.includes('HEAD'), false);
    assert.equal((await response.text()).includes('private retirement error'), false);
  }
});

test('late retirement or expiry after origin fetch blocks all response bytes', async () => {
  for (const options of [{ lateRetired: true }, { lateExpired: true }]) {
    const { handler, calls } = fixture(options);
    const response = await handler(get());
    assert.equal(response.status, 403);
    assert.equal(response.headers.get('Content-Type'), 'application/json');
    assert.equal(calls.filter((name) => name === 'GET').length, 2);
    assert.equal(calls.at(-1), 'check_deleted_media_retirement');
    assert.deepEqual(await response.json(), { error: 'media_retired_or_expired' });
  }
});


test('revocation while final retirement fence waits prevents buffered-byte delivery', async () => {
  const options = {};
  const { dependencies, calls } = fixture(options);
  const originalResolve = dependencies.resolve;
  let releaseFence;
  let enterFence;
  const blocked = new Promise(resolve => { enterFence = resolve; });
  const released = new Promise(resolve => { releaseFence = resolve; });
  let fences = 0;
  dependencies.resolve = async (name, args) => {
    if (name === 'check_deleted_media_retirement' && ++fences === 4) {
      enterFence();
      await released;
    }
    return originalResolve(name, args);
  };
  const pending = createContentInspectionHandler(dependencies)(get());
  await blocked;
  options.revoke = true;
  releaseFence();
  const response = await pending;
  assert.equal(response.status, 403);
  assert.equal(response.headers.get('Content-Type'), 'application/json');
  assert.equal(calls.at(-1), 'admin_authorize_content_inspection_media');
  assert.equal((await response.text()).includes('synthetic/source'), false);
});
