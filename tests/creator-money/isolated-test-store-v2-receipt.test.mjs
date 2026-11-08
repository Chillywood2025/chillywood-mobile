import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { createHash, webcrypto } from 'node:crypto';
import { Buffer } from 'node:buffer';

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
const { parseTestStoreV2Observation: parse, createIsolatedTestStoreV2Handler: handler } = load('isolated-test-store-v2-receipt.ts');
const { authenticateRevenueCatEnvelope: seal, decryptRouterEnvelope: decryptOriginal, observeRevenueCatBytes } = load('revenuecat-router-envelope.ts');
const { createLosslessRouterEnvelope, decryptLosslessRouterEnvelope, isRepresentableUnicode } = load('revenuecat-lossless-envelope.ts');
const decrypt = (envelope, connection) => envelope.storageProtocol ? decryptLosslessRouterEnvelope(envelope, connection) : decryptOriginal(envelope, connection);
const encoder = new TextEncoder();
const id = '11111111-1111-4111-8111-111111111111', receiptId = '22222222-2222-4222-8222-222222222222';
const customerId = `scv2_teststore_${id}`, otherCustomer = `scv2_teststore_${receiptId}`;
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
  currency: 'USD', quantity: 1, presented_offering_id: 'synthetic_offering_lookup_one', ...patch,
} });
const raw = (patch = {}) => JSON.stringify(event(patch));
const observe = (patch = {}, c = config()) => parse(encoder.encode(raw(patch)), c);
const request = (body = raw(), c = config()) => new Request('https://synthetic.invalid/test-store', {
  method: 'POST', headers: { authorization: c.authentication.secret }, body,
});
const durable = (patch = {}) => ({ protocol: 'scv2-test-store-ingress-result-v1', receiptId,
  status: 'recorded', durable: true, acknowledgementAllowed: true, authorityGranted: false, financialAuthority: false, ...patch });
const held = observation => {
  assert.equal(observation.mode, 'hold'); assert.equal(observation.parseStatus, 'invalid');
  assert.equal(observation.classificationOnly, true); assert.equal(observation.authorityGranted, false);
  return observation;
};

test('only closed non-economic TEST with one exact customer identity is ignorable',()=>{
 const clean={api_version:'1.0',event:{id:'synthetic-probe',type:'TEST',app_id:config().appId,store:'TEST_STORE',environment:'SANDBOX',
  event_timestamp_ms:1794052801000,app_user_id:customerId,original_app_user_id:customerId,aliases:[customerId]}};
 const parsed=parse(encoder.encode(JSON.stringify(clean)),config());assert.equal(parsed.nonEconomicTest,true);assert.equal(parsed.mode,'hold');
 for(const change of [e=>e.event.original_app_user_id=otherCustomer,e=>e.event.aliases.push(otherCustomer),e=>e.event.product_id=null,
  e=>e.event.presented_offering_id=null,e=>e.event.transferred_from=[customerId],e=>e.event.unknown='value',e=>e.extra=true,
  e=>e.event.event_timestamp_ms=null,e=>e.event.id=null,e=>e.event.app_user_id='unknown']){
  const modified=structuredClone(clean);change(modified);assert.equal(parse(encoder.encode(JSON.stringify(modified)),config()).nonEconomicTest,false);
 }
});
test('authenticated TEST with economic or transfer context persists hold classification with all known identities',async()=>{
 const bytes=raw({type:'TEST',transferred_from:[customerId],transferred_to:[otherCustomer]});let stored;
 const fn=handler({connection:config,persist:async(_id,_revision,envelope,observation)=>{stored={envelope,observation};return durable();}});
 assert.equal((await fn(request(bytes))).status,200);assert.equal(stored.observation.nonEconomicTest,false);held(stored.observation);
 assert.deepEqual(stored.observation.transferredFrom,[customerId]);assert.deepEqual(stored.observation.transferredTo,[otherCustomer]);
 assert.equal(new TextDecoder().decode(await decrypt(stored.envelope,config())),bytes);
});
test('raw NUL and additional-field malformed Unicode retain known identities and force unresolved classification',()=>{
 for(const change of [e=>e.event.aliases=[customerId,'bad\u0000'],e=>e.event.presented_offering_id='bad\ud800',
  e=>e.event.cancel_reason='bad\udfff',e=>e.event.unknown={nested:'bad\ud800'},e=>e.event['bad\udfff']='value']){
  const value=event();change(value);const out=held(parse(encoder.encode(JSON.stringify(value)),config()));
  assert.ok(out.issues.includes('invalid_unicode_observation'));assert.equal(out.userId,customerId);assert.equal(out.nonEconomicTest,false);
 }
 assert.equal(observe({unknown:{unicode:'valid \ud83d\ude00',literal:'\\ud800'}}).mode,'tip_purchase');
});

test('synthetic exact finite tip becomes classification only, with no buyer/session/intent claim', () => {
  const out = observe();
  assert.equal(out.mode, 'tip_purchase'); assert.equal(out.parseStatus, 'valid'); assert.deepEqual(out.issues, []);
  assert.equal(out.presentedOfferingId, 'synthetic_offering_lookup_one');
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
test('opaque v4 stable customer identity cannot be replaced by buyer IDs, aliases or first-customer guesses', () => {
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
    assert.equal(response.status, 503); assert.equal((await response.json()).error, 'test_store_v2_persistence_uncertain');
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

test('v2 retains the exact Offering wire value without guessing lookup versus provider object identity', () => {
  for (const value of ['synthetic_lookup', 'ofrng_synthetic_provider_id', 'MixedCase-Lookup_1']) {
    const out = observe({ presented_offering_id: value });
    assert.equal(out.presentedOfferingId, value); assert.equal(out.mode, 'tip_purchase');
    assert.equal(out.protocol, 'scv2-test-store-observation-v1'); assert.equal(out.authorityGranted, false);
  }
  held(observe({ app_user_id: `scv1_teststore_${id}`, original_app_user_id: `scv1_teststore_${id}` }));
});
test('missing or malformed initial Offering context cannot be repaired by hints or nested fields', () => {
  for (const value of [undefined, null, '', ' lookup', 'lookup ', 123, {}, [], 'x'.repeat(513), 'bad\nlookup']) {
    const body = event({ presented_offering_id: value, metadata: { presented_offering_id: 'client-picked', verified: true },
      subscriber_attributes: { presented_offering_id: { value: 'mutable-user-hint' } },
      nested: { presented_offering_id: 'nested-context' }, intent_id: id, transaction_hint: 'callback' });
    const out = held(parse(encoder.encode(JSON.stringify(body)), config()));
    assert.equal(out.presentedOfferingId, null); assert.equal(out.userId, customerId);
    assert.equal(out.originalTransactionId, 'synthetic-original');
  }
});
test('alternate Offering fields never override or supplement canonical context', () => {
  for (const alias of ['presentedOfferingId', 'presentedOfferingID', 'presented_offering_identifier']) {
    for (const canonical of [undefined, null, 'synthetic_offering_lookup_one']) {
      const out = held(observe({ presented_offering_id: canonical, [alias]: 'synthetic_offering_lookup_one' }));
      assert.equal(out.presentedOfferingId, null); assert.equal(out.userId, customerId);
      assert.ok(out.issues.includes('test_store_v2_offering_alias_unsupported'));
    }
  }
});
test('duplicate or escaped duplicate Offering keys remain unscopable raw negative evidence', () => {
  for (const extra of ['"presented_offering_id":"other"', '"presented_offering_id":"synthetic_offering_lookup_one"',
    '"presented_offering_\\u0069d":"other"']) {
    const body = raw().replace('"presented_offering_id":"synthetic_offering_lookup_one"',
      '"presented_offering_id":"synthetic_offering_lookup_one",' + extra);
    const out = held(parse(encoder.encode(body), config()));
    assert.equal(out.presentedOfferingId, null); assert.equal(out.userId, null);
    assert.equal(out.projectId, config().projectId); assert.ok(out.issues.includes('duplicate_json_key'));
  }
});
test('an escaped canonical key retains its exact value and ignores independent nested lookalikes', () => {
  const body = JSON.stringify(event({ nested: { presented_offering_id: 'not-canonical' } }))
    .replace('"presented_offering_id":"synthetic_offering_lookup_one"', '"presented_offering_\\u0069d":"synthetic_offering_lookup_one"');
  const out = parse(encoder.encode(body), config()); assert.equal(out.mode, 'tip_purchase');
  assert.equal(out.presentedOfferingId, 'synthetic_offering_lookup_one');
});
test('terminal cancellation may preserve absent Offering context for qualified original recovery without repairing it', () => {
  const out = observe({ type: 'CANCELLATION', presented_offering_id: null, cancel_reason: 'CUSTOMER_SUPPORT', price_in_purchased_currency: -4.99 });
  assert.equal(out.mode, 'cancellation'); assert.equal(out.presentedOfferingId, null);
  assert.equal(out.originalTransactionId, 'synthetic-original'); assert.equal(out.authorityGranted, false);
  held(observe({ type: 'CANCELLATION', presented_offering_id: 123, cancel_reason: 'CUSTOMER_SUPPORT' }));
});
test('same customer and SKU with concurrent different Offerings retains independent exact authenticated contexts', async () => {
  const observations = [];
  const run = handler({ connection: config, persist: async (_id, _revision, envelope, observation) => {
    observations.push({ envelope, observation }); return durable();
  } });
  const bodies = ['offering_one', 'offering_two'].map(presented_offering_id => raw({ presented_offering_id }));
  assert.deepEqual((await Promise.all(bodies.map(body => run(request(body))))).map(response => response.status), [200, 200]);
  assert.deepEqual(new Set(observations.map(x => x.observation.presentedOfferingId)), new Set(['offering_one', 'offering_two']));
  for (const { envelope, observation } of observations) {
    assert.equal(observation.customerId, customerId); assert.equal(observation.productId, 'synthetic-tip-499');
    assert.deepEqual(parse(await decrypt(envelope, config()), config()), observation);
  }
});

const env = () => ({ TEST_STORE_V2_INGRESS_ENABLED: 'true', TEST_STORE_V2_CONNECTION_ID: id, TEST_STORE_V2_CONNECTION_REVISION: '1',
  TEST_STORE_V2_PROJECT_ID: config().projectId, TEST_STORE_V2_APP_ID: config().appId,
  TEST_STORE_V2_PROVIDER_CONFIGURATION_DIGEST: config().providerConfigurationDigest,
  TEST_STORE_V2_AUTH_KEY_VERSION: config().authentication.keyVersion, TEST_STORE_V2_AUTHORIZATION_VALUE: config().authentication.secret,
  TEST_STORE_V2_STORAGE_KEY_ID: config().encryption.keyId, TEST_STORE_V2_STORAGE_KEY_BASE64: Buffer.from(config().encryption.key).toString('base64') });
function edge(values = env(), rpcResult = { data: durable(), error: null }) {
  const observed = [];
  const source = readFileSync(new URL('../../supabase/functions/isolated-test-store-revenuecat-webhook-v2/index.ts', import.meta.url), 'utf8')
    .replaceAll('import.meta.main', 'false');
  const compiled = ts.transpileModule(source, { reportDiagnostics: true,
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } });
  assert.deepEqual(compiled.diagnostics, []);
  const exports = {}, admin = { createAdminClient: () => ({ configured: true, client: { rpc: async (...args) => {
    observed.push(args); return rpcResult;
  } } }) };
  new Function('exports', 'require', 'Deno', compiled.outputText)(exports, specifier => {
    if (specifier === '../_shared/stripe-connect.ts') return admin;
    assert.equal(specifier, '../_shared/isolated-test-store-v2-receipt.ts'); return load('isolated-test-store-v2-receipt.ts');
  }, { env: { get: name => values[name] } });
  return { ...exports, observed };
}
test('actual v2 webhook wrapper is default-off and cannot fall back to v1 configuration or secret', async () => {
  const old = Object.fromEntries(Object.entries(env()).map(([key, value]) => [key.replace('TEST_STORE_V2_', 'TEST_STORE_'), value]));
  for (const values of [{}, old, { ...env(), TEST_STORE_V2_INGRESS_ENABLED: 'false' },
    { ...old, TEST_STORE_V2_INGRESS_ENABLED: 'true' }]) {
    const { handler: run, observed } = edge(values); assert.equal((await run(request())).status, 503); assert.equal(observed.length, 0);
  }
});
test('actual v2 webhook calls only its dedicated raw-evidence RPC with exact authenticated context', async () => {
  const { handler: run, observed } = edge(); assert.equal((await run(request())).status, 200);
  assert.equal(observed.length, 1); assert.equal(observed[0][0], 'isolated_test_store_ingest_v2');
  const args = observed[0][1]; assert.deepEqual(Object.keys(args).sort(), ['p_connection_id', 'p_connection_revision', 'p_envelope', 'p_observation']);
  assert.equal(args.p_connection_id, id); assert.equal(args.p_connection_revision, 1);
  assert.equal(args.p_observation.protocol, 'scv2-test-store-observation-v1');
  assert.equal(args.p_observation.presentedOfferingId, 'synthetic_offering_lookup_one');
  assert.equal(new TextDecoder().decode(await decrypt(args.p_envelope, config())), raw());
});
test('actual v2 webhook rejects bad credential encoding, revision, authentication and v1 result protocol', async () => {
  for (const patch of [{ TEST_STORE_V2_CONNECTION_REVISION: '01' }, { TEST_STORE_V2_CONNECTION_REVISION: '9007199254740992' },
    { TEST_STORE_V2_STORAGE_KEY_BASE64: 'invalid' }, { TEST_STORE_V2_STORAGE_KEY_BASE64: Buffer.alloc(31).toString('base64') },
    { TEST_STORE_V2_PROVIDER_CONFIGURATION_DIGEST: 'bad' }]) {
    const { handler: run, observed } = edge({ ...env(), ...patch });
    assert.equal((await run(request())).status, 503); assert.equal(observed.length, 0);
  }
  const wrongSecret = edge(); assert.equal((await wrongSecret.handler(request(raw(), { ...config(), authentication: { secret: 'old-v1-secret' } }))).status, 401);
  assert.equal(wrongSecret.observed.length, 0);
  const oldAck = edge(env(), { data: durable({ protocol: 'scv1-test-store-ingress-result-v1' }), error: null });
  assert.equal((await oldAck.handler(request())).status, 503);
});
test('actual v2 webhook treats database failure as uncertain without retry or private detail leakage', async () => {
  const { handler: run, observed } = edge(env(), { data: null, error: { message: 'synthetic-private-provider-body' } });
  const response = await run(request()); assert.equal(response.status, 503); assert.equal(observed.length, 1);
  assert.equal((await response.text()).includes('synthetic-private-provider-body'), false);
});

test('unpaired Unicode identities retain representable siblings and can never classify positive', () => {
  for (const invalid of ['\ud800', '\udc00']) {
    const out = held(observe({ app_user_id: invalid, original_app_user_id: customerId,
      aliases: [customerId, invalid, otherCustomer], transferred_from: [invalid, customerId], transferred_to: [otherCustomer] }));
    assert.equal(out.userId, null); assert.equal(out.originalUserId, customerId);
    assert.deepEqual(out.aliases, [customerId, otherCustomer]); assert.deepEqual(out.transferredFrom, [customerId]);
    assert.deepEqual(out.transferredTo, [otherCustomer]); assert.ok(out.issues.includes('invalid_unicode_observation'));
    for (const field of ['presented_offering_id', 'cancel_reason']) held(observe({ [field]: invalid }));
    const visit = value => { if (typeof value === 'string') assert.equal(isRepresentableUnicode(value), true);
      else if (value && typeof value === 'object') Object.values(value).forEach(visit); };
    visit(out);
  }
});
test('lossless economic storage reconstructs exact raw bytes and original AAD after JSONB-style ordering', async () => {
  for (const invalid of ['\ud800', '\udc00']) {
    const bytes = raw({ app_user_id: invalid, aliases: [customerId, invalid, otherCustomer], extra: { z: '😀', a: '\\ud800', quote: '"' } });
    let saved;
    const response = await handler({ connection: config, persist: async (_id, _revision, envelope, observation) => {
      saved = { envelope, observation }; return durable();
    } })(request(bytes));
    assert.equal(response.status, 200); held(saved.observation);
    assert.equal(saved.envelope.storageProtocol, 'rc-router-lossless-envelope-v1');
    const reorder = value => Array.isArray(value) ? value.map(reorder) : value && typeof value === 'object'
      ? Object.fromEntries(Object.keys(value).sort().reverse().map(key => [key, reorder(value[key])])) : value;
    const persisted = JSON.parse(JSON.stringify(reorder(saved.envelope)));
    assert.equal(new TextDecoder().decode(await decryptLosslessRouterEnvelope(persisted, config())), bytes);
    assert.equal((await response.json()).authorityGranted, false);
  }
});
test('lossless wrapper rejects changed original observation or sanitized identities', async () => {
  const sealed = await seal(request(raw({ aliases: [customerId, '\ud800'] })), config());
  const envelope = await createLosslessRouterEnvelope(sealed);
  await assert.rejects(decryptLosslessRouterEnvelope({ ...envelope, originalObservationSha256: '0'.repeat(64) }, config()), /lossless_storage_invalid/u);
  await assert.rejects(decryptLosslessRouterEnvelope({ ...envelope, observation: { ...envelope.observation, userId: otherCustomer } }, config()), /lossless_storage_invalid/u);
  await assert.rejects(decryptLosslessRouterEnvelope({ ...envelope, originalObservationBase64: 'A'.repeat(1398108) }, config()), /lossless_storage_invalid/u);
});
