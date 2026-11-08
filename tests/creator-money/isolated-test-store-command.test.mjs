import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { webcrypto } from 'node:crypto';
import { Buffer } from 'node:buffer';
import process from 'node:process';

// Synthetic HTTP/crypto fixtures. These do not qualify a provider or device.
globalThis.crypto ??= webcrypto;
const require = createRequire(import.meta.url), ts = require('typescript');
const functions = new URL('../../supabase/functions/', import.meta.url);
function load(path, overrides = {}, deno = { env: { get: () => undefined } }, cache = new Map()) {
  if (cache.has(path)) return cache.get(path);
  const api = {}; cache.set(path, api);
  const source = readFileSync(new URL(path, functions), 'utf8').replaceAll('import.meta.main', 'false');
  const compiled = ts.transpileModule(source, { reportDiagnostics: true, compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } });
  assert.deepEqual(compiled.diagnostics, []);
  new Function('exports', 'require', 'Deno', compiled.outputText)(api, specifier => {
    if (Object.hasOwn(overrides, specifier)) return overrides[specifier];
    return load(new URL(specifier, new URL(path, functions)).href.slice(functions.href.length), overrides, deno, cache);
  }, deno);
  return api;
}
const { createIsolatedTestStoreCommandHandler: handler } = load('_shared/isolated-test-store-command.ts');
const uid = '11111111-1111-4111-8111-111111111111', sid = '22222222-2222-4222-8222-222222222222', rid = '33333333-3333-4333-8333-333333333333';
const dispatch = '44444444-4444-4444-8444-444444444444', clock = Date.parse('2026-11-07T12:00:00.000Z');
const actor = () => ({ userId: uid, sessionId: sid });
const quote = () => ({ offerId: `scv1_offer_${uid}`, offerRevision: 1, resourceId: `scv1_resource_${uid}`, resourceRevision: 1,
  creatorId: rid, kind: 'creator_tip', amountMinor: 199, currency: 'usd' });
const allocation = () => ({ intentId: `scv1_intent_${uid}`, dispatchId: dispatch, providerAppUserId: `scv1_teststore_${uid}`,
  configurationDigest: 'a'.repeat(64), projectId: 'synthetic-project', appId: 'synthetic-app', productId: 'synthetic-tip',
  provider: 'revenuecat', store: 'TEST_STORE', sourceEnvironment: 'SANDBOX', providerScopeKey: '["revenuecat","synthetic-project","synthetic-app","TEST_STORE","SANDBOX"]',
  economicApplicationId: 'rc_test_store:synthetic-project:synthetic-app', quote: quote(), acceptPurchaseUntil: new Date(clock + 900000).toISOString() });
const body = (command = 'claim') => ({ protocol: 'isolated-test-store-v1', command, requestId: rid, expectedSessionId: sid, configurationDigest: 'a'.repeat(64),
  payload: command === 'read' ? { intentId: `scv1_intent_${uid}` } : command === 'report' ? { intentId: `scv1_intent_${uid}`, dispatchId: dispatch, outcome: 'sdk_unknown', transactionHint: null }
    : { intentId: `scv1_intent_${uid}`, ...(command === 'claim' ? { dispatchId: dispatch } : {}), expectedQuote: quote() } });
const result = (b = body(), patch = {}) => ({ protocol: b.protocol, command: b.command, requestId: b.requestId, actor: actor(), generation: 1, environment: 'sandbox',
  result: { status: b.command === 'claim' ? 'dispatch_claimed' : b.command === 'allocate' ? 'allocated' : 'pending', reason: 'synthetic_result', dispatchAllowed: b.command === 'claim',
    retryProviderMutation: false, grantsAccess: false, notPayable: true, allocation: allocation(), authorityValidUntil: b.command === 'claim' ? new Date(clock + 4000).toISOString() : null,
    receipt: null, ...patch } });
// These tokens are deliberately unsigned fixtures. Only the injected Auth
// seam accepts them; decoding is never represented as real verification.
const token = (claims = { sub: uid, session_id: sid }) => 'Bearer ' + [Buffer.from('{"alg":"HS256"}').toString('base64url'), Buffer.from(JSON.stringify(claims)).toString('base64url'), 'syntheticSignature'].join('.');
const request = (b = body(), init = {}) => new Request('https://synthetic.invalid/command', { method: 'POST', headers: { authorization: token(), 'content-type': 'application/json' }, body: typeof b === 'string' ? b : JSON.stringify(b), ...init });
const run = async (b = body(), options = {}) => {
  let calls = 0;
  const fn = handler({ now: () => clock, authenticate: async () => actor(), execute: async () => { calls++; return result(b); }, ...options });
  const response = await fn(request(b)); return { response, value: await response.json(), calls };
};
test('all four exact commands preserve validated RPC projection without adding authority', async () => {
  for (const command of ['allocate', 'claim', 'read', 'report']) {
    const b = body(command), { response, value, calls } = await run(b);
    assert.equal(response.status, 200); assert.deepEqual(value, result(b)); assert.equal(calls, 1);
    assert.equal(response.headers.get('cache-control'), 'no-store');
  }
});
test('body cannot supply actor, provider identity, live mode or unsupported commands', async () => {
  for (const change of [b => b.actor = actor(), b => b.userId = uid, b => b.environment = 'live', b => b.command = 'cashout',
    b => b.configurationDigest = 'A'.repeat(64), b => b.requestId = 123, b => b.expectedSessionId = null,
    b => b.payload.providerAppUserId = allocation().providerAppUserId, b => b.payload.expectedQuote.currency = 'eur', b => b.payload.expectedQuote.amountMinor = '199']) {
    const b = body(); change(b); const out = await run(b); assert.equal(out.response.status, 400); assert.equal(out.calls, 0);
  }
});
test('duplicate keys, malformed JSON, invalid UTF-8 and nested overflow never reach authentication', async () => {
  let authenticated = 0;
  const fn = handler({ authenticate: async () => { authenticated++; return actor(); }, execute: async () => { throw Error('unexpected'); } });
  for (const raw of [JSON.stringify(body()).replace('"protocol":', '"protocol":"fake","protocol":'), '{', '{"a":' + '['.repeat(10) + '0' + ']'.repeat(10) + '}', new Uint8Array([255])]) {
    const response = await fn(new Request('https://synthetic.invalid', { method: 'POST', body: raw })); assert.equal(response.status, 400);
  }
  assert.equal(authenticated, 0);
});
test('8192-byte bound applies without Content-Length and rejects declared overflow', async () => {
  for (const req of [request(' '.repeat(8193)), request(body(), { headers: { 'content-length': '8193' } }), request(body(), { headers: { 'content-length': '-1' } })]) {
    const response = await handler({ authenticate: async () => { throw Error('unexpected'); }, execute: async () => {} })(req);
    assert.equal(response.status, 413);
  }
});
test('HTTP methods and CORS preflight never invoke authentication or execution', async () => {
  const fn = handler({ authenticate: async () => { throw Error('unexpected'); }, execute: async () => {} });
  assert.equal((await fn(new Request('https://synthetic.invalid', { method: 'GET' }))).status, 405);
  assert.equal((await fn(new Request('https://synthetic.invalid', { method: 'OPTIONS' }))).status, 204);
});
test('authentication and exact current session are mandatory', async () => {
  for (const auth of [null, { userId: uid, sessionId: rid }, { userId: uid }, { userId: 1, sessionId: sid }]) {
    const out = await run(body(), { authenticate: async () => auth }); assert.equal(out.response.status, 401); assert.equal(out.calls, 0);
  }
});
test('actor and nested payload are immutable snapshots across asynchronous execution', async () => {
  const authenticated = actor(); let seen;
  const out = await run(body(), { authenticate: async () => authenticated, execute: async input => {
    seen = input; authenticated.userId = rid;
    assert.ok(Object.isFrozen(input)); assert.ok(Object.isFrozen(input.actor)); assert.ok(Object.isFrozen(input.request.payload.expectedQuote));
    assert.throws(() => input.request.payload.expectedQuote.amountMinor = 1, TypeError);
    await Promise.resolve(); return result();
  } });
  assert.equal(out.response.status, 200); assert.equal(seen.actor.userId, uid);
});
test('RPC identity, sandbox scope, exact quote and immutable allocation are all checked', async () => {
  const changes = [v => v.actor.userId = rid, v => v.actor.sessionId = rid, v => v.requestId = uid, v => v.command = 'read', v => v.generation = 2,
    v => v.environment = 'live', v => v.result.allocation.store = 'APP_STORE', v => v.result.allocation.sourceEnvironment = 'PRODUCTION',
    v => v.result.allocation.provider = 'stripe', v => v.result.allocation.configurationDigest = 'b'.repeat(64),
    v => v.result.allocation.providerScopeKey = '["revenuecat","other-project","synthetic-app","TEST_STORE","SANDBOX"]',
    v => v.result.allocation.economicApplicationId = 'legacy', v => v.result.allocation.quote.amountMinor = 200,
    v => v.result.allocation.quote.offerRevision = 2, v => v.result.allocation.dispatchId = uid,
    v => v.result.allocation.intentId = `scv1_intent_${rid}`, v => v.result.allocation.providerAppUserId = uid,
    v => v.result.allocation.productId = '', v => v.result.allocation.quote.creatorId = uid, v => v.extra = true];
  for (const change of changes) { const v = result(); change(v); const out = await run(body(), { execute: async () => v });
    assert.equal(out.response.status, 503); assert.equal(out.value.outcome, 'unknown'); assert.equal(out.value.dispatchAllowed, false); }
});
test('scope validates exact array elements while preserving valid PostgreSQL whitespace serialization', async () => {
  const value = result(); value.result.allocation.providerScopeKey = '["revenuecat", "synthetic-project", "synthetic-app", "TEST_STORE", "SANDBOX"]';
  const out = await run(body(), { execute: async () => value }); assert.equal(out.response.status, 200); assert.deepEqual(out.value, value);
  for (const scope of ['["revenuecat","synthetic-project","synthetic-app","TEST_STORE","SANDBOX",null]',
    '["revenuecat","synthetic-project","synthetic-app","TEST_STORE","PRODUCTION"]', '{}', '["revenuecat","synthetic-project","synthetic-app","TEST_STORE",["SANDBOX"]]']) {
    const bad = result(); bad.result.allocation.providerScopeKey = scope;
    assert.equal((await run(body(), { execute: async () => bad })).response.status, 503);
  }
});
test('RPC cannot create live money, access, repeat dispatch or false terminal authority', async () => {
  for (const patch of [{ notPayable: false }, { grantsAccess: true }, { retryProviderMutation: true }, { status: 'verified' },
    { status: 'pending' }, { authorityValidUntil: null }, { allocation: null }, { dispatchAllowed: false }, { receipt: {} }]) {
    const out = await run(body(), { execute: async () => result(body(), patch) }); assert.equal(out.response.status, 503);
  }
  for (const command of ['allocate', 'read', 'report']) {
    const b = body(command), out = await run(b, { execute: async () => result(b, { dispatchAllowed: true, status: 'dispatch_claimed', authorityValidUntil: new Date(clock + 4000).toISOString() }) });
    assert.equal(out.response.status, 503);
  }
});
test('claim requires returned lease still current and at most five seconds without extending it', async () => {
  for (const until of [clock - 1, clock, clock + 5001]) {
    const out = await run(body(), { execute: async () => result(body(), { authorityValidUntil: new Date(until).toISOString() }) }); assert.equal(out.response.status, 503);
  }
  const v = result(); v.result.allocation.acceptPurchaseUntil = new Date(clock + 1000).toISOString();
  assert.equal((await run(body(), { execute: async () => v })).response.status, 503);
});
test('elapsed five-second budget and clock reversal prevent dispatch before or after RPC', async () => {
  for (const offset of [5000, -1]) {
    let n = clock, calls = 0;
    const out = await run(body(), { now: () => n, authenticate: async () => { n += offset; return actor(); }, execute: async () => { calls++; return result(); } });
    assert.equal(out.response.status, 503); assert.equal(calls, 0);
    n = clock;
    const after = await run(body(), { now: () => n, execute: async () => { calls++; n += offset; return result(); } });
    assert.equal(after.response.status, 503); assert.equal(after.value.outcome, 'unknown'); assert.equal(calls, 1);
  }
});
test('uncertain RPC failure has one execution and no private error detail', async () => {
  let calls = 0;
  const out = await run(body(), { execute: async () => { calls++; throw Error('synthetic-private-token'); } });
  assert.equal(out.response.status, 503); assert.equal(calls, 1); assert.equal(out.value.outcome, 'unknown');
  assert.equal(JSON.stringify(out.value).includes('synthetic-private-token'), false);
});
test('real timer bounds unresolved execution and never retries its uncertain result', async () => {
  let calls = 0, resolve;
  const start = performance.now();
  const out = await run(body(), { execute: () => { calls++; return new Promise(r => resolve = r); } });
  assert.equal(out.response.status, 503); assert.equal(out.value.outcome, 'unknown'); assert.equal(calls, 1);
  assert.ok(performance.now() - start >= 4900); assert.ok(performance.now() - start < 6500);
  resolve(result()); await new Promise(r => setImmediate(r)); assert.equal(calls, 1);
});
test('actual timer expiry during body or authentication cannot execute after the awaited work later resolves', async () => {
  let controller, resolveAuth, bodyAuthCalls = 0, bodyExecCalls = 0, authExecCalls = 0;
  const stream = new ReadableStream({ start(value) { controller = value; } });
  const bodyHandler = handler({ authenticate: async () => { bodyAuthCalls++; return actor(); }, execute: async () => { bodyExecCalls++; return result(); } });
  const authHandler = handler({ authenticate: () => new Promise(resolve => { resolveAuth = resolve; }), execute: async () => { authExecCalls++; return result(); } });
  const [bodyResponse, authResponse] = await Promise.all([
    bodyHandler(new Request('https://synthetic.invalid', { method: 'POST', body: stream, duplex: 'half' })), authHandler(request()),
  ]);
  for (const response of [bodyResponse, authResponse]) { assert.equal(response.status, 503); assert.equal((await response.json()).outcome, 'not_sent'); }
  controller.enqueue(new TextEncoder().encode(JSON.stringify(body()))); controller.close(); resolveAuth(actor());
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(bodyAuthCalls, 0); assert.equal(bodyExecCalls, 0); assert.equal(authExecCalls, 0);
});
test('retired initiation still permits held recovery with immutable historical receipt states', async () => {
  for (const state of ['verified', 'refunded', 'revoked', 'quarantined']) {
    const b = body('read'), receipt = { id: `scv1_receipt_${uid}`, state, providerTransactionId: 'synthetic-tx', originalTransactionId: 'synthetic-original', purchasedAt: new Date(clock).toISOString() };
    const expected = result(b, { status: 'held', receipt });
    const out = await run(b, { execute: async () => expected }); assert.equal(out.response.status, 200); assert.deepEqual(out.value, expected);
  }
  const b = body('read'); assert.equal((await run(b, { execute: async () => result(b, { status: 'unavailable', allocation: null }) })).response.status, 200);
});
test('terminal projection requires a matching receipt and rejects malformed or inconsistent state', async () => {
  for (const state of ['verified', 'refunded', 'revoked']) {
    const b = body('read'), v = result(b, { status: state, receipt: { id: `scv1_receipt_${uid}`, state, providerTransactionId: 'synthetic-tx', originalTransactionId: 'synthetic-original', purchasedAt: new Date(clock).toISOString() } });
    assert.equal((await run(b, { execute: async () => v })).response.status, 200);
    v.result.receipt.state = 'quarantined'; assert.equal((await run(b, { execute: async () => v })).response.status, 503);
  }
});
test('concurrent HTTP calls do not cache, manufacture or share SQL first-claim admission', async () => {
  let calls = 0;
  const fn = handler({ now: () => clock, authenticate: async () => actor(), execute: async () => {
    const first = calls++ === 0; await Promise.resolve(); return result(body(), first ? {} : { status: 'pending', dispatchAllowed: false, authorityValidUntil: null });
  } });
  const responses = await Promise.all([fn(request()), fn(request())]), values = await Promise.all(responses.map(r => r.json()));
  assert.equal(calls, 2); assert.equal(values.filter(v => v.result.dispatchAllowed).length, 1);
});

function commandEdge({ auth = { user: { id: uid, sessionGeneration: sid } }, rpc, duringAuth } = {}) {
  const observed = { auth: [], rpc: [] };
  const shared = { createAuthClient: () => ({ supabaseUrl: 'https://synthetic.supabase.invalid', supabaseAnonKey: 'synthetic-anon' }),
    authenticateRequest: async (...args) => { observed.auth.push(args); await duringAuth?.(...args); return auth; },
    createAdminClient: () => ({ configured: true, client: { rpc: async (...args) => { observed.rpc.push(args); return rpc ? rpc(...args) : { data: result(body('read')), error: null }; } } }) };
  const api = load('isolated-sandbox-test-store-v1/index.ts', { '../_shared/stripe-connect.ts': shared }); return { ...api, observed };
}
test('actual command Edge derives actor from authenticated current-session result and calls only dedicated RPC', async () => {
  const { handler: fn, observed } = commandEdge(), req = request(body('read')), response = await fn(req);
  assert.equal(response.status, 200); assert.equal(observed.auth.length, 1); assert.notEqual(observed.auth[0][0], req);
  assert.equal(observed.auth[0][0].headers.get('authorization'), req.headers.get('authorization'));
  assert.deepEqual(observed.auth[0].slice(1), ['https://synthetic.supabase.invalid', 'synthetic-anon']);
  assert.deepEqual(observed.rpc, [['isolated_test_store_command_v1', { p_buyer_id: uid, p_session_id: sid, p_command: 'read', p_request_id: rid, p_configuration_digest: 'a'.repeat(64), p_payload: body('read').payload }]]);
});
test('actual command Edge binds authenticated token session A to readback A and rejects readback B even when body asks for B', async () => {
  const b = body('read'); b.expectedSessionId = rid;
  const { handler: fn, observed } = commandEdge({ auth: { user: { id: uid, sessionGeneration: rid } } });
  assert.equal((await fn(request(b, { headers: { authorization: token({ sub: uid, session_id: sid }) } }))).status, 401);
  assert.equal(observed.auth.length, 1); assert.equal(observed.rpc.length, 0);
});
test('actual command Edge rejects missing or malformed token session after successful mocked Auth verification', async () => {
  for (const authorization of [token({ sub: uid }), token({ sub: uid, session_id: null }), token({ sub: uid, session_id: 123 }), token({ sub: uid, session_id: 'bad' }), 'Bearer x.invalid.x', 'Bearer malformed']) {
    const { handler: fn, observed } = commandEdge();
    assert.equal((await fn(request(body('read'), { headers: { authorization } }))).status, 401); assert.equal(observed.rpc.length, 0);
  }
});
test('actual command Edge freezes the bearer before asynchronous authentication and claim extraction', async () => {
  const req = request(body('read'));
  const { handler: fn, observed } = commandEdge({ duringAuth: async frozen => {
    req.headers.set('authorization', token({ sub: uid, session_id: rid })); await Promise.resolve();
    assert.equal(frozen.headers.get('authorization'), token());
  } });
  assert.equal((await fn(req)).status, 200); assert.equal(observed.rpc.length, 1); assert.equal(observed.rpc[0][1].p_session_id, sid);
});
test('actual command Edge refuses auth errors, missing session and spoofed expected session before privileged RPC', async () => {
  for (const auth of [{ error: new Response(null, { status: 401 }) }, { user: { id: uid } }, { user: { id: uid, sessionGeneration: rid } }]) {
    const { handler: fn, observed } = commandEdge({ auth }); assert.equal((await fn(request(body('read')))).status, 401); assert.equal(observed.rpc.length, 0);
  }
});
test('actual command Edge treats returned database errors as uncertain and does not retry', async () => {
  const { handler: fn, observed } = commandEdge({ rpc: async () => ({ data: null, error: { message: 'synthetic-private-database-error' } }) });
  const response = await fn(request(body('read'))); assert.equal(response.status, 503); assert.equal(observed.rpc.length, 1);
  assert.equal((await response.text()).includes('synthetic-private'), false);
});
test('actual native SQL captures pass unchanged through the actual command Edge with exact authenticated actor and RPC arguments',
  { skip: !process.env.ISOLATED_TEST_STORE_FIXTURE }, async () => {
    // Canonical validation supplies the freshly generated native fixture. The
    // ordinary source-only suite explicitly skips this evidence-dependent case.
    // Auth transport is mocked; the real frozen-token session parser executes.
    const fixture = JSON.parse(readFileSync(process.env.ISOLATED_TEST_STORE_FIXTURE, 'utf8'));
    assert.equal(fixture.protocol, 'isolated-test-store-v1'); assert.equal(fixture.cases.length, 7);
    const actualNow = Date.now;
    try {
      for (const c of fixture.cases) {
        const frozenTime = c.response.result.authorityValidUntil ? Date.parse(c.response.result.authorityValidUntil) - 1000 : actualNow();
        Date.now = () => frozenTime;
        const authorization = token({ sub: c.actor.userId, session_id: c.actor.sessionId });
        const { handler: fn, observed } = commandEdge({ auth: { user: { id: c.actor.userId, sessionGeneration: c.actor.sessionId } },
          rpc: async (name, args) => {
            assert.equal(name, 'isolated_test_store_command_v1');
            assert.deepEqual(args, { p_buyer_id: c.actor.userId, p_session_id: c.actor.sessionId, p_command: c.command,
              p_request_id: c.requestId, p_configuration_digest: c.configurationDigest, p_payload: c.payload });
            return { data: c.response, error: null };
          } });
        const response = await fn(request({ protocol: 'isolated-test-store-v1', command: c.command, requestId: c.requestId,
          expectedSessionId: c.actor.sessionId, configurationDigest: c.configurationDigest, payload: c.payload }, { headers: { authorization } }));
        assert.equal(response.status, 200); assert.deepEqual(await response.json(), c.response);
        assert.equal(observed.auth.length, 1); assert.equal(observed.auth[0][0].headers.get('authorization'), authorization);
        assert.equal(observed.rpc.length, 1);
      }
    } finally { Date.now = actualNow; }
  });
const env = () => ({ TEST_STORE_INGRESS_ENABLED: 'true', TEST_STORE_CONNECTION_ID: uid, TEST_STORE_CONNECTION_REVISION: '1',
  TEST_STORE_PROJECT_ID: 'synthetic-project', TEST_STORE_APP_ID: 'synthetic-app', TEST_STORE_PROVIDER_CONFIGURATION_DIGEST: 'a'.repeat(64),
  TEST_STORE_AUTH_KEY_VERSION: 'synthetic-auth-v1', TEST_STORE_AUTHORIZATION_VALUE: 'Bearer ' + 's'.repeat(40),
  TEST_STORE_STORAGE_KEY_ID: 'synthetic-storage-v1', TEST_STORE_STORAGE_KEY_BASE64: Buffer.alloc(32, 7).toString('base64') });
const providerBody = () => JSON.stringify({ api_version: '1.0', event: { id: 'synthetic-event', type: 'NON_RENEWING_PURCHASE', app_id: 'synthetic-app', store: 'TEST_STORE', environment: 'SANDBOX',
  app_user_id: `scv1_teststore_${uid}`, original_app_user_id: `scv1_teststore_${uid}`, aliases: [], event_timestamp_ms: clock, purchased_at_ms: clock,
  expiration_at_ms: null, product_id: 'synthetic-tip', transaction_id: 'synthetic-tx', original_transaction_id: 'synthetic-original', price_in_purchased_currency: 1.99, currency: 'USD', quantity: 1 } });
function webhookEdge(values = env(), response = { protocol: 'scv1-test-store-ingress-result-v1', receiptId: rid, status: 'recorded', durable: true, acknowledgementAllowed: true, authorityGranted: false, financialAuthority: false }) {
  const calls = [];
  const api = load('isolated-test-store-revenuecat-webhook-v1/index.ts', { '../_shared/stripe-connect.ts': {
    createAdminClient: () => ({ configured: true, client: { rpc: async (...args) => { calls.push(args); return { data: response, error: null }; } } }) } }, { env: { get: key => values[key] } });
  return { ...api, calls };
}
test('actual webhook Edge encrypts authenticated exact bytes and sends only dedicated connection-bound RPC', async () => {
  const { handler: fn, calls } = webhookEdge();
  const response = await fn(request(providerBody(), { headers: { authorization: env().TEST_STORE_AUTHORIZATION_VALUE } }));
  assert.equal(response.status, 200); assert.equal(calls.length, 1); assert.equal(calls[0][0], 'isolated_test_store_ingest_v1');
  const args = calls[0][1]; assert.equal(args.p_connection_id, uid); assert.equal(args.p_connection_revision, 1);
  assert.equal(args.p_observation.mode, 'tip_purchase'); assert.equal(args.p_observation.providerConfigurationDigest, 'a'.repeat(64));
  assert.ok(args.p_envelope.encryption.ciphertext); assert.equal(JSON.stringify(args.p_envelope).includes('Bearer '), false);
});
test('actual webhook Edge defaults off and never falls back to legacy activation or secrets', async () => {
  for (const change of [v => delete v.TEST_STORE_INGRESS_ENABLED, v => v.TEST_STORE_INGRESS_ENABLED = 'TRUE', v => delete v.TEST_STORE_AUTHORIZATION_VALUE,
    v => v.TEST_STORE_CONNECTION_REVISION = '1e0', v => v.TEST_STORE_STORAGE_KEY_BASE64 = 'invalid', v => delete v.TEST_STORE_PROVIDER_CONFIGURATION_DIGEST]) {
    const values = env(); change(values); values.RECEIPT_ROUTER_INGRESS_ENABLED = 'true'; values.REVENUECAT_WEBHOOK_SECRET = env().TEST_STORE_AUTHORIZATION_VALUE;
    const { handler: fn, calls } = webhookEdge(values); assert.equal((await fn(request(providerBody(), { headers: { authorization: env().TEST_STORE_AUTHORIZATION_VALUE } }))).status, 503); assert.equal(calls.length, 0);
  }
});
test('actual webhook Edge rejects unauthenticated bytes and withholds ack on non-durable persistence', async () => {
  const { handler: fn, calls } = webhookEdge(); assert.equal((await fn(request(providerBody()))).status, 401); assert.equal(calls.length, 0);
  const bad = webhookEdge(env(), { durable: false });
  assert.equal((await bad.handler(request(providerBody(), { headers: { authorization: env().TEST_STORE_AUTHORIZATION_VALUE } }))).status, 503); assert.equal(bad.calls.length, 1);
});
