import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { createHash, webcrypto } from 'node:crypto';

// Real local crypto over synthetic payloads; these are NOT provider delivery,
// Test Store schema qualification, installed-device or release evidence.
globalThis.crypto ??= webcrypto;
const require = createRequire(import.meta.url), ts = require('typescript'), cache = new Map();
const load = name => {
  if (cache.has(name)) return cache.get(name);
  const api = {}; cache.set(name, api);
  const source = readFileSync(new URL(`../../supabase/functions/_shared/${name}`, import.meta.url), 'utf8');
  const compiled = ts.transpileModule(source, { reportDiagnostics: true,
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } });
  assert.deepEqual(compiled.diagnostics, []);
  new Function('exports', 'require', compiled.outputText)(api, specifier => load(specifier.replace(/^\.\//u, '')));
  return api;
};
const { parseTestStoreObservation: parse, createIsolatedTestStoreHandler: handler } = load('isolated-test-store-contract.ts');
const { authenticateRevenueCatEnvelope: seal, decryptRouterEnvelope: decrypt, observeRevenueCatBytes } = load('revenuecat-router-envelope.ts');
const encoder = new TextEncoder();
const id = '11111111-1111-4111-8111-111111111111', receiptId = '22222222-2222-4222-8222-222222222222';
const customerId = `scv1_teststore_${id}`, otherCustomer = `scv1_teststore_${receiptId}`;
const config = () => ({ connectionId: id, connectionRevision: 1, projectId: 'synthetic-test-store-only-project',
  appId: 'synthetic-test-store-app', providerConfigurationDigest: 'a'.repeat(64),
  authentication: { method: 'shared_secret', keyVersion: 'synthetic-v1', secret: 'Bearer ' + 's'.repeat(40) },
  encryption: { keyId: 'synthetic-encryption-v1', key: new Uint8Array(32).fill(7) } });
const event = (patch = {}) => ({ api_version: '1.0', event: {
  id: 'synthetic-event', type: 'NON_RENEWING_PURCHASE', app_id: config().appId,
  store: 'TEST_STORE', environment: 'SANDBOX', event_timestamp_ms: 1794052801000,
  app_user_id: customerId, original_app_user_id: customerId, aliases: [],
  product_id: 'synthetic-tip-499', transaction_id: 'synthetic-transaction', original_transaction_id: 'synthetic-original',
  purchased_at_ms: 1794052800000, expiration_at_ms: null, price_in_purchased_currency: 4.99,
  currency: 'USD', quantity: 1, ...patch,
} });
const raw = (patch = {}) => JSON.stringify(event(patch));
const observe = (patch = {}, c = config()) => parse(encoder.encode(raw(patch)), c);
const request = (body = raw(), c = config()) => new Request('https://synthetic.invalid/test-store', {
  method: 'POST', headers: { authorization: c.authentication.secret }, body,
});
const durable = (patch = {}) => ({ protocol: 'scv1-test-store-ingress-result-v1', receiptId,
  status: 'recorded', durable: true, acknowledgementAllowed: true, authorityGranted: false, financialAuthority: false, ...patch });
const held = observation => {
  assert.equal(observation.mode, 'hold'); assert.equal(observation.parseStatus, 'invalid');
  assert.equal(observation.classificationOnly, true); assert.equal(observation.authorityGranted, false);
  return observation;
};

test('synthetic exact finite tip becomes classification only, with no buyer/session/intent claim', () => {
  const out = observe();
  assert.equal(out.mode, 'tip_purchase'); assert.equal(out.parseStatus, 'valid'); assert.deepEqual(out.issues, []);
  assert.equal(out.customerId, customerId); assert.equal(out.amountMinor, 499); assert.equal(out.currency, 'usd');
  assert.equal(out.quantity, 1); assert.equal(out.expiresAt, null); assert.equal(out.purchasedAt, '2026-11-07T12:00:00.000Z');
  assert.equal(out.classificationOnly, true); assert.equal(out.authorityGranted, false);
  for (const forbidden of ['buyerId', 'sessionId', 'intentId', 'verified', 'signatureVerified']) assert.equal(forbidden in out, false);
  assert.deepEqual(observe({ aliases: [customerId] }).issues, []);
  const withoutAliases = event(); delete withoutAliases.event.aliases;
  assert.equal(parse(encoder.encode(JSON.stringify(withoutAliases)), config()).mode, 'tip_purchase');
});
test('production, wrong app, other stores and coerced scope never become Test Store purchases', () => {
  for (const patch of [{ environment: 'PRODUCTION' }, { environment: 'sandbox' }, { environment: null },
    { store: 'APP_STORE' }, { store: 'PLAY_STORE' }, { store: 'test_store' }, { app_id: 'other-app' }, { app_id: null }]) {
    const out = held(observe(patch)); assert.equal(out.customerId, null);
    assert.equal(out.projectId, config().projectId); assert.equal(out.providerConfigurationDigest, config().providerConfigurationDigest);
  }
});
test('opaque v4 dispatch identity cannot be replaced by buyer IDs, aliases or first-customer guesses', () => {
  for (const patch of [{ app_user_id: id, original_app_user_id: id }, { app_user_id: null },
    { original_app_user_id: otherCustomer }, { aliases: [otherCustomer] }, { aliases: [customerId, customerId] },
    { aliases: null }, { aliases: customerId }, { aliases: [customerId, null] }, { appUserId: otherCustomer },
    { app_user_id: customerId.replace('-4111-', '-5111-') }, { app_user_id: `${customerId} ` }]) {
    const out = held(observe(patch)); assert.equal(out.customerId, null);
  }
});
test('authenticated malformed JSON and duplicate escaped keys remain project-level hold evidence', () => {
  const bodies = ['not-json', '{"api_version":"1.0","event":{"id":"a","id":"b"}}',
    raw().replace('"quantity":1', '"quantity":1,"quant\\u0069ty":2'),
    raw().replace('"price_in_purchased_currency":4.99', '"price_in_purchased_currency":4.99,"price_in_purchased_currency":1'),
    '['.repeat(26) + '0' + ']'.repeat(26)];
  for (const body of bodies) {
    const out = held(parse(encoder.encode(body), config())); assert.equal(out.projectId, config().projectId);
    assert.equal(out.amountMinor, null); assert.equal(out.customerId, null);
  }
  held(parse(new Uint8Array([255]), config()));
});
test('explicit quantity one and explicit null expiry are required; no SDK/provider default is invented', () => {
  for (const field of ['quantity', 'expiration_at_ms', 'price_in_purchased_currency', 'currency', 'purchased_at_ms']) {
    const body = event(); delete body.event[field]; held(parse(encoder.encode(JSON.stringify(body)), config()));
  }
  for (const patch of [{ quantity: null }, { quantity: '1' }, { quantity: 2 }, { quantity: 0 },
    { expiration_at_ms: 'null' }, { expiration_at_ms: 1794052900000 }]) held(observe(patch));
});
test('USD cents are exact decimal arithmetic, including ordinary fractional binary prices', () => {
  for (const [price, cents] of [[0.29, 29], [0.07, 7], [4.99, 499], [0.01, 1], [100, 10000]])
    assert.equal(observe({ price_in_purchased_currency: price }).amountMinor, cents);
  assert.equal(parse(encoder.encode(raw().replace('4.99', '499e-2')), config()).amountMinor, 499);
  for (const value of ['4.99', null, 0, -0.01, 0.001, Number.MAX_VALUE, Number.MAX_SAFE_INTEGER]) held(observe({ price_in_purchased_currency: value }));
  for (const currency of ['usd', 'EUR', null, 123]) held(observe({ currency }));
});
test('exact number lexemes reject JSON-rounding attacks on cents, timestamps and quantity', () => {
  for (const [needle, replacement] of [
    ['"price_in_purchased_currency":4.99', '"price_in_purchased_currency":0.0100000000000000000001'],
    ['"price_in_purchased_currency":4.99', '"price_in_purchased_currency":90071992547409.92'],
    ['"price_in_purchased_currency":4.99', '"price_in_purchased_currency":1e309'],
    ['"event_timestamp_ms":1794052801000', '"event_timestamp_ms":1794052801000.00000000001'],
    ['"purchased_at_ms":1794052800000', '"purchased_at_ms":1794052800000.00000000001'],
    ['"quantity":1', '"quantity":1.00000000000000000000001'],
  ]) held(parse(encoder.encode(raw().replace(needle, replacement)), config()));
});
test('nested numeric lookalikes and escaped field names cannot override the actual event quote', () => {
  const body = event({ subscriber_attributes: { price_in_purchased_currency: { value: '100' } },
    nested: { price_in_purchased_currency: 123, quantity: 99 }, list: [{ quantity: 2 }],
    metadata: { intentId: id, verified: true, buyerId: id }, verified: true });
  const text = JSON.stringify({ price_in_purchased_currency: 999, ...body }).replace('"price_in_purchased_currency":4.99', '"price_in_purchased_currenc\\u0079":4.99');
  const out = parse(encoder.encode(text), config()); assert.equal(out.mode, 'tip_purchase'); assert.equal(out.amountMinor, 499);
  assert.equal(out.authorityGranted, false); assert.equal('intentId' in out, false);
});
test('missing/invalid purchase identity or timestamps cannot become a finite purchase', () => {
  for (const patch of [{ id: null }, { event_id: 'conflicting-event' }, { product_id: null }, { transaction_id: null },
    { original_transaction_id: null }, { transaction_id: 123 }, { purchased_at_ms: 1794052802000 },
    { event_timestamp_ms: null }, { event_timestamp_ms: '1794052801000' }, { purchased_at_ms: -1 },
    { purchased_at_ms: 8640000000000001 }, { purchased_at_ms: 1.5 }, { cancel_reason: 'DEVELOPER_INITIATED' }]) held(observe(patch));
});
test('cancellation retains signed economics and reason but never declares a refund or grant', () => {
  const out = observe({ type: 'CANCELLATION', cancel_reason: 'DEVELOPER_INITIATED', price_in_purchased_currency: -4.99,
    product_id: null, transaction_id: null, purchased_at_ms: null, quantity: null });
  assert.equal(out.mode, 'cancellation'); assert.equal(out.amountMinor, -499); assert.equal(out.cancelReason, 'DEVELOPER_INITIATED');
  assert.equal(out.productId, null); assert.equal(out.transactionId, null); assert.equal(out.originalTransactionId, 'synthetic-original');
  assert.equal('refunded' in out, false); assert.equal(out.authorityGranted, false);
  assert.equal(observe({ type: 'CANCELLATION', cancel_reason: 'UNKNOWN' }).mode, 'cancellation');
  for (const patch of [{ cancel_reason: null }, { cancel_reason: {} }, { original_transaction_id: null }])
    held(observe({ type: 'CANCELLATION', ...patch }));
});
test('TRANSFER, unknown/refund names and all independently valid affected identities stay available for holds', () => {
  const out = held(observe({ type: 'TRANSFER', app_user_id: null, original_app_user_id: null,
    transferred_from: [customerId, null], transferred_to: [otherCustomer], aliases: [customerId, otherCustomer] }));
  assert.deepEqual(out.transferredFrom, [customerId]); assert.deepEqual(out.transferredTo, [otherCustomer]);
  assert.deepEqual(out.aliases, [customerId, otherCustomer]); assert.equal(out.projectId, config().projectId);
  for (const type of ['REFUND', 'REVOCATION', 'INITIAL_PURCHASE', 'TEST', 'unknown']) held(observe({ type }));
});
test('missing or malformed server configuration fails closed before persistence', async () => {
  let calls = 0;
  assert.equal((await handler({ persist: async () => { calls++; } })(request())).status, 503);
  for (const change of [{ appId: '' }, { providerConfigurationDigest: 'bad' }, { connectionRevision: 0 }, { projectId: '' }]) {
    const response = await handler({ connection: () => ({ ...config(), ...change }), persist: async () => { calls++; } })(request());
    assert.equal(response.status, 503);
  }
  assert.equal(calls, 0);
});
test('wrong authorization, signature-looking headers and unsupported methods never persist', async () => {
  let calls = 0;
  const run = handler({ connection: config, persist: async () => { calls++; return durable(); } });
  for (const headers of [{ authorization: 'wrong' }, { 'x-revenuecat-webhook-signature': 'synthetic' },
    { 'x-chillywood-webhook-secret': config().authentication.secret }])
    assert.equal((await run(new Request('https://synthetic.invalid', { method: 'POST', headers, body: raw() }))).status, 401);
  assert.equal((await run(new Request('https://synthetic.invalid', { method: 'GET' }))).status, 405);
  assert.equal(calls, 0);
});
test('synthetic authenticated exact bytes are encrypted, decrypted and independently normalized before persistence', async () => {
  const bytes = '\n' + raw() + '  ', c = config(); let captured;
  const response = await handler({ connection: () => c, persist: async (...args) => { captured = args; return durable(); } })(request(bytes, c));
  assert.equal(response.status, 200);
  const [connectionId, revision, envelope, observation] = captured;
  assert.equal(connectionId, c.connectionId); assert.equal(revision, 1);
  assert.equal(envelope.rawSha256, createHash('sha256').update(bytes).digest('hex'));
  assert.equal(new TextDecoder().decode(await decrypt(envelope, c)), bytes);
  assert.deepEqual(envelope.observation, observeRevenueCatBytes(encoder.encode(bytes)));
  assert.equal('mode' in envelope.observation, false); assert.equal(observation.mode, 'tip_purchase');
  assert.ok(Object.isFrozen(observation)); assert.ok(Object.isFrozen(observation.aliases)); assert.ok(Object.isFrozen(envelope));
  const publicBody = await response.json();
  assert.equal(publicBody.authorityGranted, false); assert.equal(publicBody.financialAuthority, false);
  assert.equal(publicBody.providerDispatchAllowed, false);
  for (const privateValue of [c.authentication.secret, customerId, c.projectId, 'synthetic-tip-499', envelope.encryption.ciphertext])
    assert.ok(!JSON.stringify(publicBody).includes(privateValue));
});
test('mutating server config while request bytes arrive cannot switch authenticated scope or keys', async () => {
  const c = config(), before = structuredClone(c); let resume, captured;
  const stream = new ReadableStream({ start(controller) { resume = () => { controller.enqueue(encoder.encode(raw())); controller.close(); }; } });
  const req = new Request('https://synthetic.invalid', { method: 'POST', headers: { authorization: c.authentication.secret }, body: stream, duplex: 'half' });
  const pending = handler({ connection: () => c, persist: async (...args) => { captured = args; return durable(); } })(req);
  c.appId = 'changed'; c.projectId = 'changed'; c.providerConfigurationDigest = 'b'.repeat(64); c.connectionRevision = 2;
  c.authentication.secret = 'Bearer ' + 'x'.repeat(40); c.encryption.key.fill(9); resume();
  assert.equal((await pending).status, 200); assert.equal(captured[1], 1);
  assert.equal(captured[3].providerConfigurationDigest, before.providerConfigurationDigest); assert.equal(captured[3].projectId, before.projectId);
  assert.equal(new TextDecoder().decode(await decrypt(captured[2], before)), raw());
});
test('authenticated malformed, live, foreign-app and transfer bytes persist as holds before acknowledgement', async () => {
  for (const bytes of ['not-json', raw({ environment: 'PRODUCTION' }), raw({ app_id: 'other-app' }), raw({ type: 'TRANSFER', transferred_to: [otherCustomer] })]) {
    let observation;
    const response = await handler({ connection: config, persist: async (_id, _revision, _envelope, observed) => {
      observation = observed; return durable();
    } })(request(bytes));
    assert.equal(response.status, 200); held(observation);
  }
});
test('only exact durable backend result permits acknowledgement; conflict is never acknowledged', async () => {
  for (const change of [{ protocol: 'wrong' }, { receiptId: 'not-a-uuid' }, { status: 'processed' }, { durable: false },
    { acknowledgementAllowed: 'true' }, { authorityGranted: true }, { financialAuthority: true },
    { status: 'conflict' }, { acknowledgementAllowed: false }]) {
    const response = await handler({ connection: config, persist: async () => durable(change) })(request());
    assert.equal(response.status, 503);
  }
  for (const result of [null, {}, undefined])
    assert.equal((await handler({ connection: config, persist: async () => result })(request())).status, 503);
  assert.equal((await handler({ connection: config, persist: async () => durable({ status: 'duplicate' }) })(request())).status, 200);
});
test('failure/uncertain persistence never acknowledges or exposes errors; late completion is not retried', async () => {
  const failed = await handler({ connection: config, persist: async () => { throw Error('private-raw-provider-details'); } })(request());
  assert.equal(failed.status, 503); assert.ok(!(await failed.text()).includes('private-raw-provider-details'));
  let resolvePersist, calls = 0, started = false;
  const originalTimer = globalThis.setTimeout;
  globalThis.setTimeout = (fn, delay, ...args) => originalTimer(fn, started && delay === 5000 ? 1 : delay, ...args);
  try {
    const response = await handler({ connection: config, persist: () => { calls++; started = true;
      return new Promise(resolve => { resolvePersist = resolve; });
    } })(request());
    assert.equal(response.status, 503); assert.equal((await response.json()).error, 'test_store_persistence_uncertain');
    resolvePersist(durable()); await Promise.resolve(); assert.equal(calls, 1);
  } finally { globalThis.setTimeout = originalTimer; }
});
test('concurrent synthetic deliveries preserve their separate raw hashes and configuration snapshots', async () => {
  const observations = [];
  const run = handler({ connection: config, persist: async (_id, _revision, envelope, observation) => {
    observations.push({ envelope, observation }); await Promise.resolve(); return durable();
  } });
  const bodies = [raw(), raw({ id: 'synthetic-second', app_user_id: otherCustomer, original_app_user_id: otherCustomer,
    transaction_id: 'second-transaction', original_transaction_id: 'second-original' })];
  assert.deepEqual((await Promise.all(bodies.map(bytes => run(request(bytes))))).map(response => response.status), [200, 200]);
  assert.equal(new Set(observations.map(o => o.envelope.rawSha256)).size, 2);
  assert.deepEqual(new Set(observations.map(o => o.observation.customerId)), new Set([customerId, otherCustomer]));
  for (const { envelope, observation } of observations)
    assert.deepEqual(parse(await decrypt(envelope, config()), config()), observation);
});
test('encrypted envelopes cannot be replayed with altered raw facts, project or connection revision', async () => {
  const c = config(), envelope = await seal(request(), c);
  for (const changed of [{ ...c, projectId: 'other' }, { ...c, connectionRevision: 2 }])
    await assert.rejects(decrypt(envelope, changed), /stored_envelope_mismatch/u);
  await assert.rejects(decrypt({ ...envelope, rawSha256: '0'.repeat(64) }, c), /stored_envelope_mismatch/u);
  await assert.rejects(decrypt({ ...envelope, observation: { ...envelope.observation, userId: otherCustomer } }, c), /stored_envelope_mismatch/u);
});
