import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { webcrypto } from 'node:crypto';
import { Buffer } from 'node:buffer';

// Real local authentication/encryption over synthetic bytes. No provider,
// installed-device, behavioral qualification or target evidence is claimed.
globalThis.crypto ??= webcrypto;
const require = createRequire(import.meta.url), ts = require('typescript'), cache = new Map();
const compile = source => {
  const c = ts.transpileModule(source, { reportDiagnostics: true,
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } });
  assert.deepEqual((c.diagnostics ?? []).map(d => ts.flattenDiagnosticMessageText(d.messageText, '\n')), []); return c.outputText;
};
const load = name => {
  if (cache.has(name)) return cache.get(name);
  const api = {}; cache.set(name, api);
  const source = readFileSync(new URL(`../../supabase/functions/_shared/${name}`, import.meta.url), 'utf8');
  new Function('exports', 'require', compile(source))(api, s => load(s.replace(/^\.\//u, ''))); return api;
};
const { observeQualificationBytes: observe, createQualificationHandler: handler,
  decryptQualificationEnvelope: decrypt, reconstructQualificationEnvelope: reconstruct } = load('isolated-test-store-qualification.ts');
const { observeRevenueCatBytes, MAX_RECEIPT_BYTES } = load('revenuecat-router-envelope.ts');
const id = '11111111-1111-4111-8111-111111111111', entryId = '22222222-2222-4222-8222-222222222222';
const config = () => ({ connectionId: id, connectionRevision: 1, projectId: 'synthetic-qualification-project', appId: 'synthetic-qualification-app',
  authentication: { method: 'shared_secret', keyVersion: 'synthetic-qualification-auth', secret: 'Bearer ' + 'q'.repeat(40) },
  encryption: { keyId: 'synthetic-qualification-key', key: new Uint8Array(32).fill(11) } });
const event = patch => ({ api_version: '1.0', event: { id: 'synthetic-event', type: 'NON_RENEWING_PURCHASE',
  app_id: config().appId, store: 'TEST_STORE', environment: 'SANDBOX', event_timestamp_ms: 1794052801000,
  app_user_id: `scq_teststore_${id}`, original_app_user_id: `scq_teststore_${id}`, aliases: [],
  product_id: 'synthetic-tip', transaction_id: 'synthetic-tx', original_transaction_id: 'synthetic-original', ...patch } });
const raw = patch => JSON.stringify(event(patch));
const bytes = value => new TextEncoder().encode(value);
const parse = patch => observe(bytes(raw(patch)), config());
const req = (body = raw(), c = config()) => new Request('https://synthetic.invalid/qualification', {
  method: 'POST', headers: { authorization: c.authentication.secret }, body });
const ack = patch => ({ protocol: 'test-store-qualification-result-v1', entryId, status: 'captured', phase: 'capturing',
  durable: true, acknowledgementAllowed: true, behavioralQualificationGranted: false, authorityGranted: false, ...patch });

test('synthetic known economic lineage yields exclusion keys only, no authority or economic quote', () => {
  const out = parse(); assert.equal(out.economicLineageUnknown, false); assert.equal(out.scopedOriginalTransactionId, 'synthetic-original');
  assert.equal(out.scopedTransactionId, 'synthetic-tx'); assert.deepEqual(out.customerIds, [`scq_teststore_${id}`]);
  assert.equal(out.qualificationOnly, true); assert.equal(out.authorityGranted, false);
  for (const k of ['amountMinor', 'intentId', 'buyerId', 'verified', 'grantsAccess']) assert.equal(k in out, false);
  const { protocol, projectId, configuredAppId, scopedOriginalTransactionId, scopedTransactionId, customerIds,
    economicLineageUnknown, qualificationOnly, authorityGranted, ...common } = out;
  assert.equal(protocol, 'test-store-qualification-observation-v1'); assert.equal(projectId, config().projectId);
  assert.equal(configuredAppId, config().appId); assert.ok(scopedOriginalTransactionId && scopedTransactionId && customerIds.length);
  assert.equal(economicLineageUnknown || authorityGranted, false); assert.equal(qualificationOnly, true);
  assert.deepEqual(common, observeRevenueCatBytes(bytes(raw())));
});
test('qualification never requires an invented customer namespace to retain independent identities', () => {
  const out = parse({ app_user_id: 'old-customer', original_app_user_id: 'old-customer' });
  assert.equal(out.economicLineageUnknown, false); assert.deepEqual(out.customerIds, ['old-customer']);
});
test('productless complete terminal lineage retains exact original and transaction exclusions', () => {
  const out = parse({ type: 'CANCELLATION', product_id: null });
  assert.equal(out.economicLineageUnknown, false); assert.equal(out.scopedOriginalTransactionId, 'synthetic-original');
});
test('missing one economic key preserves the other but blocks project promotion', () => {
  const out = parse({ original_transaction_id: null }); assert.equal(out.economicLineageUnknown, true);
  assert.equal(out.scopedOriginalTransactionId, null); assert.equal(out.scopedTransactionId, 'synthetic-tx');
});
test('unknown types and TRANSFER preserve all independently valid subjects and remain unresolved', () => {
  for (const type of ['TRANSFER', 'FUTURE_UNKNOWN']) {
    const out = parse({ type, aliases: ['alias'], transferred_from: ['before'], transferred_to: ['after'] });
    assert.equal(out.economicLineageUnknown, true); assert.deepEqual(out.customerIds, ['after', 'alias', 'before', `scq_teststore_${id}`]);
  }
});
test('invalid alias lists retain valid identities without claiming scoped economic keys', () => {
  const out = parse({ aliases: ['known-alias', null], appUserId: 'conflicting-customer' });
  assert.equal(out.parseStatus, 'invalid'); assert.equal(out.economicLineageUnknown, true);
  assert.deepEqual(out.customerIds, ['conflicting-customer', 'known-alias', `scq_teststore_${id}`]);
  assert.equal(out.scopedOriginalTransactionId, null); assert.equal(out.scopedTransactionId, null);
});
test('retained Unicode customer identities use PostgreSQL C UTF-8 ordering', () => {
  const out = parse({ aliases: ['\uE000', '\u{1F600}'] });
  assert.deepEqual(out.customerIds, [`scq_teststore_${id}`, '\uE000', '\u{1F600}']);
});
test('wrong app, store and live environment remain unresolved and cannot yield scoped economic keys', () => {
  for (const patch of [{ app_id: 'other' }, { store: 'APP_STORE' }, { environment: 'PRODUCTION' }, { store: null }]) {
    const out = parse(patch); assert.equal(out.economicLineageUnknown, true);
    assert.equal(out.scopedOriginalTransactionId, null); assert.equal(out.scopedTransactionId, null); assert.equal(out.customerIds.length, 1);
  }
});
test('genuine empty TEST shape is non-economic, while TEST carrying transaction data remains unresolved', () => {
  assert.equal(parse({ type: 'TEST', original_transaction_id: null, transaction_id: null, product_id: null }).economicLineageUnknown, false);
  assert.equal(parse({ type: 'TEST' }).economicLineageUnknown, true);
});
test('malformed JSON, duplicate keys and invalid UTF-8 are bounded recordable unresolved evidence', () => {
  for (const body of [bytes('not JSON'), bytes('{"event":{},"event":{}}'), new Uint8Array([255])]) {
    const out = observe(body, config()); assert.equal(out.parseStatus, 'invalid'); assert.equal(out.economicLineageUnknown, true);
    assert.deepEqual(out.customerIds, []);
  }
  assert.throws(() => observe(new Uint8Array(MAX_RECEIPT_BYTES + 1), config()), /qualification_body_limit/u);
});
test('default-off and invalid configured identity cannot reach persistence', async () => {
  let n = 0;
  for (const c of [null, { ...config(), connectionRevision: 0 }, { ...config(), appId: '' },
    { ...config(), encryption: { keyId: 'key', key: new Uint8Array(31) } }]) {
    const response = await handler({ connection: () => c, persist: async () => { n++; return ack(); } })(req());
    assert.equal(response.status, 503);
  }
  assert.equal(n, 0);
});
test('unauthenticated or oversized transport cannot be acknowledged or persisted', async () => {
  let n = 0; const run = handler({ connection: config, persist: async () => { n++; return ack(); } });
  assert.equal((await run(req(raw(), { authentication: { secret: 'wrong' } }))).status, 401);
  assert.equal((await run(req('x'.repeat(MAX_RECEIPT_BYTES + 1)))).status, 413); assert.equal(n, 0);
});
test('real local crypto preserves exact bytes and original common observation before one persistence call', async () => {
  const body = ' \n' + raw() + '\n'; let n = 0;
  const response = await handler({ connection: config, persist: async (connectionId, revision, envelope, observation) => {
    n++; assert.equal(connectionId, id); assert.equal(revision, 1);
    assert.equal(new TextDecoder().decode(await decrypt(envelope, config())), body);
    assert.deepEqual(envelope.observation, observeRevenueCatBytes(bytes(body)));
    assert.deepEqual(observation, observe(bytes(body), config()));
    assert.ok(Object.isFrozen(envelope.observation) && Object.isFrozen(observation.customerIds)); return ack();
  } })(req(body));
  assert.equal(response.status, 200); assert.equal(n, 1);
  const result = await response.json(); assert.equal(result.economicProjectionAllowed, false);
  assert.equal(result.behavioralQualificationGranted, false); assert.equal(result.authorityGranted, false);
});
test('authenticated malformed bytes can receive durable record-only acknowledgement', async () => {
  let seen;
  const response = await handler({ connection: config, persist: async (_id, _revision, _envelope, observation) => {
    seen = observation; return ack();
  } })(req('malformed')); assert.equal(response.status, 200); assert.equal(seen.economicLineageUnknown, true);
});
test('lone high and low surrogate observations retain exact encrypted raw bytes through ASCII storage', async () => {
  for (const identity of ['\ud800', '\udfff']) {
    const body = raw({ app_user_id: identity, original_app_user_id: identity }); let stored;
    const response = await handler({ connection: config, persist: async (_id, _revision, envelope, observation) => {
      stored = JSON.parse(JSON.stringify(envelope)); assert.equal(observation.economicLineageUnknown, true);
      assert.equal(observation.parseStatus, 'invalid'); assert.equal(observation.userId, null);
      assert.ok(observation.issues.includes('invalid_unicode_observation')); return ack();
    } })(req(body));
    assert.equal(response.status, 200); assert.equal(new TextDecoder().decode(await decrypt(stored, config())), body);
    assert.equal((await reconstruct(stored)).observation.userId, identity);
    assert.equal(stored.observation.userId, null); assert.equal(stored.storageProtocol, 'test-store-qualification-envelope-v1');
  }
});
test('mixed valid and invalid Unicode subjects retain every representable independent identity', () => {
  const out = parse({ aliases: ['valid-alias', '\ud800', '\udfff', '\u{1F600}'], original_app_user_id: 'valid-original' });
  assert.deepEqual(out.customerIds, [`scq_teststore_${id}`, 'valid-alias', 'valid-original', '\u{1F600}']);
  assert.equal(out.economicLineageUnknown, true); assert.equal(out.scopedOriginalTransactionId, null);
});
test('storage JSON key reordering preserves raw escaping while summary/hash tampering fails review', async () => {
  const body = ' \n' + raw({ aliases: ['valid', '\ud800'] }).replace('synthetic-event', 'synthetic-ev\\u0065nt') + '\n'; let stored;
  assert.equal((await handler({ connection: config, persist: async (_id, _revision, envelope) => {
    stored = JSON.parse(JSON.stringify(envelope)); return ack();
  } })(req(body))).status, 200);
  const reordered = Object.fromEntries(Object.entries(stored).reverse());
  reordered.observation = Object.fromEntries(Object.entries(reordered.observation).reverse());
  assert.equal(new TextDecoder().decode(await decrypt(reordered, config())), body);
  for (const bad of [{ ...stored, originalObservationSha256: 'a'.repeat(64) },
    { ...stored, observation: { ...stored.observation, userId: 'wrong' } },
    { ...stored, originalObservationBase64: stored.originalObservationBase64 + '\n' }])
    await assert.rejects(decrypt(bad, config()), /qualification_storage_invalid/u);
});
test('accepted raw-byte boundary includes observation/base64 expansion without silent truncation', async () => {
  const value = event({ aliases: Array.from({ length: 100 }, (_v, i) => `${i}-` + 'x'.repeat(500)) }); value.extra = '';
  value.extra = 'x'.repeat(MAX_RECEIPT_BYTES - Buffer.byteLength(JSON.stringify(value)));
  const body = JSON.stringify(value); assert.equal(Buffer.byteLength(body), MAX_RECEIPT_BYTES); let stored;
  const response = await handler({ connection: config, persist: async (_id, _revision, envelope, observation) => {
    stored = envelope; assert.equal(observation.customerIds.length, 101);
    assert.ok(Buffer.byteLength(JSON.stringify(envelope)) < 4194304); return ack();
  } })(req(body));
  assert.equal(response.status, 200); assert.equal(new TextDecoder().decode(await decrypt(stored, config())), body);
});
test('strict durable result validation rejects false authority, malformed status and accidental economic response', async () => {
  for (const result of [null, ack({ durable: false }), ack({ authorityGranted: true }), ack({ behavioralQualificationGranted: true }),
    ack({ status: null }), ack({ status: { toString: () => 'captured' } }), ack({ phase: 'sealed' }), ack({ extra: true }),
    ack({ entryId: 'bad' }), ack({ protocol: 'scv2-test-store-ingress-result-v1' })]) {
    let n = 0; assert.equal((await handler({ connection: config, persist: async () => { n++; return result; } })(req())).status, 503); assert.equal(n, 1);
  }
});
test('sealed exact retry and captured conflict acknowledge evidence without claiming qualification', async () => {
  for (const result of [ack({ phase: 'sealed', status: 'sealed_duplicate' }), ack({ status: 'conflict' }), ack({ status: 'duplicate' })]) {
    const response = await handler({ connection: config, persist: async () => result })(req());
    assert.equal(response.status, 200); assert.equal((await response.json()).authorityGranted, false);
  }
});
test('uncertain storage never retries or leaks private failure detail', async () => {
  let n = 0; const response = await handler({ connection: config, persist: async () => { n++; throw Error('private synthetic payload'); } })(req());
  assert.equal(response.status, 503); assert.equal(n, 1); assert.equal((await response.text()).includes('private synthetic payload'), false);
});
test('pending request retains immutable configured identity and encryption key', async () => {
  const c = config(); let release, observed;
  const body = new ReadableStream({ start(controller) { release = () => { controller.enqueue(bytes(raw())); controller.close(); }; } });
  const pending = handler({ connection: () => c, persist: async (connectionId, revision, envelope, observation) => {
    observed = { connectionId, revision, envelope, observation }; return ack();
  } })(new Request('https://synthetic.invalid', { method: 'POST', headers: { authorization: c.authentication.secret }, body, duplex: 'half' }));
  await new Promise(resolve => setImmediate(resolve)); c.projectId = 'changed'; c.appId = 'changed'; c.encryption.key.fill(33); c.connectionRevision = 2;
  release(); assert.equal((await pending).status, 200); assert.equal(observed.revision, 1);
  assert.equal(observed.observation.projectId, config().projectId); assert.equal(new TextDecoder().decode(await decrypt(observed.envelope, config())), raw());
});

const env = () => ({ TEST_STORE_QUALIFICATION_ENABLED: 'true', TEST_STORE_QUALIFICATION_CONNECTION_ID: id,
  TEST_STORE_QUALIFICATION_CONNECTION_REVISION: '1', TEST_STORE_QUALIFICATION_PROJECT_ID: config().projectId,
  TEST_STORE_QUALIFICATION_APP_ID: config().appId, TEST_STORE_QUALIFICATION_AUTH_KEY_VERSION: config().authentication.keyVersion,
  TEST_STORE_QUALIFICATION_AUTHORIZATION_VALUE: config().authentication.secret, TEST_STORE_QUALIFICATION_STORAGE_KEY_ID: config().encryption.keyId,
  TEST_STORE_QUALIFICATION_STORAGE_KEY_BASE64: Buffer.from(config().encryption.key).toString('base64') });
const edge = (values = env(), result = { data: ack(), error: null }) => {
  const source = readFileSync(new URL('../../supabase/functions/isolated-test-store-qualification-v1/index.ts', import.meta.url), 'utf8').replaceAll('import.meta.main', 'false');
  const exports = {}, calls = [];
  new Function('exports', 'require', 'Deno', compile(source))(exports, specifier => {
    if (specifier.endsWith('/stripe-connect.ts')) return { createAdminClient: () => ({ configured: true,
      client: { rpc: async (name, args) => { calls.push({ name, args }); return result; } } }) };
    return load(specifier.split('/').at(-1));
  }, { env: { get: key => values[key] } }); return { handler: exports.handler, calls };
};
test('actual qualification Edge stays disabled with only legacy or v2 environment configured', async () => {
  const e = edge({ TEST_STORE_V2_INGRESS_ENABLED: 'true', TEST_STORE_INGRESS_ENABLED: 'true' });
  assert.equal((await e.handler(req())).status, 503); assert.deepEqual(e.calls, []);
});
test('actual qualification Edge calls only record-only service RPC with exact encrypted context', async () => {
  const e = edge(); assert.equal((await e.handler(req())).status, 200); assert.equal(e.calls.length, 1);
  const { name, args } = e.calls[0]; assert.equal(name, 'isolated_test_store_qualification_ingest_v1');
  assert.deepEqual(Object.keys(args).sort(), ['p_connection_id', 'p_connection_revision', 'p_envelope', 'p_observation']);
  assert.equal(args.p_connection_id, id); assert.equal(args.p_connection_revision, 1);
  assert.equal(new TextDecoder().decode(await decrypt(args.p_envelope, config())), raw());
  assert.equal(args.p_observation.qualificationOnly, true);
});
test('actual qualification Edge rejects malformed revision/key and treats database errors as unknown', async () => {
  for (const patch of [{ TEST_STORE_QUALIFICATION_CONNECTION_REVISION: '01' }, { TEST_STORE_QUALIFICATION_CONNECTION_REVISION: '9007199254740992' },
    { TEST_STORE_QUALIFICATION_STORAGE_KEY_BASE64: 'invalid' }, { TEST_STORE_QUALIFICATION_STORAGE_KEY_BASE64: Buffer.alloc(31).toString('base64') }]) {
    const e = edge({ ...env(), ...patch }); assert.equal((await e.handler(req())).status, 503); assert.equal(e.calls.length, 0);
  }
  const e = edge(env(), { data: null, error: { message: 'private synthetic failure' } });
  const response = await e.handler(req()); assert.equal(response.status, 503); assert.equal(e.calls.length, 1);
  assert.equal((await response.text()).includes('private synthetic failure'), false);
});
