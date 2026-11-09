import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { webcrypto } from 'node:crypto';

// Synthetic bytes exercise actual authentication/encryption. Not provider proof.
globalThis.crypto ??= webcrypto;
const require = createRequire(import.meta.url), ts = require('typescript');
const root = new URL('../../supabase/functions/_shared/', import.meta.url), cache = new Map();
function load(name) {
  if (cache.has(name)) return cache.get(name);
  const api = {}; cache.set(name, api);
  const compiled = ts.transpileModule(readFileSync(new URL(name, root), 'utf8'), {
    reportDiagnostics: true, compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  });
  assert.deepEqual(compiled.diagnostics, []);
  new Function('exports', 'require', compiled.outputText)(api, specifier => load(specifier.replace(/^\.\//u, '')));
  return api;
}
const { prepareNativeStoreSandboxIntakeV1: prepare } = load('native-store-sandbox-bridge-v1.ts');
const { decryptLosslessRouterEnvelope: decrypt } = load('revenuecat-lossless-envelope.ts');
const config = (store = 'APP_STORE') => ({ bridgeProtocol: 'native-store-sandbox-v1',
  connectionId: '11111111-1111-4111-8111-111111111111', connectionRevision: 1,
  projectId: 'synthetic-project', appId: 'synthetic-app', store, environment: 'SANDBOX',
  authentication: { method: 'shared_secret', keyVersion: 'v1', secret: 'synthetic-secret-not-real-'.repeat(2) },
  encryption: { keyId: 'synthetic-key', key: new Uint8Array(32).fill(17) } });
const event = (patch = {}) => ({ id: 'synthetic-event', type: 'NON_RENEWING_PURCHASE', app_id: 'synthetic-app',
  store: 'APP_STORE', environment: 'SANDBOX', event_timestamp_ms: 1794139200000,
  app_user_id: 'synthetic-buyer', original_app_user_id: 'synthetic-buyer', aliases: [],
  product_id: 'synthetic-product', transaction_id: 'synthetic-transaction', original_transaction_id: 'synthetic-chain', ...patch });
const bytes = e => JSON.stringify({ api_version: '1.0', event: e });
const request = (body, c = config(), headers = {}) => new Request('https://local.invalid', {
  method: 'POST', headers: { authorization: c.authentication.secret, ...headers }, body,
});
const closed = result => {
  for (const field of ['durable', 'acknowledgementAllowed', 'dispatchAllowed', 'grantsAccess', 'financialAuthority']) assert.equal(result[field], false);
  assert.equal(result.correlation, 'unsupported');
  assert.ok(result.reasons.includes('native_store_correlation_unsupported'));
};

for (const store of ['APP_STORE', 'PLAY_STORE']) test(`${store}: authenticated intake is lossless but cannot grant or acknowledge`, async () => {
  const c = config(store), raw = bytes(event({ store, presented_offering_id: 'a-perfect-looking-offering', price: 1.99 }));
  const result = await prepare(request(raw, c), c);
  closed(result); assert.equal(result.disposition, 'purchase_unqualified');
  assert.equal(new TextDecoder().decode(await decrypt(result.envelope, c)), raw);
  assert.deepEqual(JSON.parse(result.scopeKey), ['native-store-sandbox-v1', 'revenuecat', c.projectId, c.appId, store, 'SANDBOX']);
  assert.equal(JSON.stringify(result).includes(c.authentication.secret), false);
});
test('wrong auth, method and bounded body fail before an intake result exists', async () => {
  const c = config();
  await assert.rejects(prepare(request(bytes(event()), c, { authorization: 'wrong' }), c), e => e.code === 'provider_authentication_failed');
  await assert.rejects(prepare(new Request('https://local.invalid'), c), e => e.code === 'method_not_allowed');
  await assert.rejects(prepare(request('x'.repeat(256 * 1024 + 1), c), c), e => e.code === 'body_limit');
});
test('V3, Test Store, production and unsupported configuration fail closed', async () => {
  for (const patch of [{ bridgeProtocol: 'isolated-test-store-v3' }, { store: 'TEST_STORE' }, { environment: 'PRODUCTION' }, { appId: '' }]) {
    await assert.rejects(prepare(request(bytes(event())), { ...config(), ...patch }), e => e.code === 'native_store_sandbox_configuration_unavailable');
  }
});
test('wrong app, store, environment, missing identity and Test Store identity require reconciliation', async () => {
  for (const patch of [{ app_id: 'another-app' }, { store: 'TEST_STORE' }, { store: 'PLAY_STORE' },
    { environment: 'PRODUCTION' }, { environment: null }, { product_id: null }, { app_user_id: null },
    { aliases: ['scv3_teststore_synthetic'] }, { event_timestamp_ms: null }]) {
    const result = await prepare(request(bytes(event(patch))), config());
    closed(result); assert.equal(result.disposition, 'reconciliation_required');
  }
});
test('productless transfer retains both sides, aliases and conflicting identities without narrower scope', async () => {
  const result = await prepare(request(bytes(event({ type: 'TRANSFER', product_id: null, app_id: null, store: null,
    environment: null, app_user_id: 'to', original_app_user_id: 'origin', aliases: ['alias'],
    appUserId: 'conflict', transferred_from: ['from', null], transferred_to: ['to'], transferredFrom: ['alternate'] }))), config());
  closed(result); assert.equal(result.disposition, 'reconciliation_required');
  assert.equal(result.reconciliationScope, 'project');
  assert.deepEqual(new Set(result.reconciliationSubjects), new Set(['to', 'origin', 'alias', 'conflict', 'from', 'alternate']));
});
test('malformed and duplicate-key bytes are retained, never converted to purchase candidates', async () => {
  for (const raw of ['not json', bytes(event()).replace('"APP_STORE"', '"APP_STORE","store":"PLAY_STORE"'),
    bytes(event({ app_user_id: '\ud800' }))]) {
    const result = await prepare(request(raw), config());
    closed(result); assert.equal(result.disposition, 'reconciliation_required');
    assert.equal(new TextDecoder().decode(await decrypt(result.envelope, config())), raw);
  }
});
test('terminal, unknown and TEST events never bypass reconciliation', async () => {
  for (const type of ['CANCELLATION', 'EXPIRATION', 'REFUND_REVERSED', 'RENEWAL', 'TEST', 'FUTURE_EVENT']) {
    const result = await prepare(request(bytes(event({ type }))), config());
    closed(result); assert.equal(result.disposition, 'reconciliation_required');
  }
});
test('changing caller configuration during a streamed request cannot change authenticated scope', async () => {
  const c = config(), saved = structuredClone(c); let controller;
  const stream = new ReadableStream({ start(value) { controller = value; } });
  const pending = prepare(new Request('https://local.invalid', { method: 'POST', body: stream, duplex: 'half',
    headers: { authorization: c.authentication.secret } }), c);
  c.projectId = 'wrong-project'; c.appId = 'wrong-app'; c.store = 'PLAY_STORE'; c.connectionRevision = 2;
  c.authentication.keyVersion = 'changed'; c.encryption.key.fill(99);
  controller.enqueue(new TextEncoder().encode(bytes(event()))); controller.close();
  const result = await pending; closed(result);
  assert.equal(result.projectId, saved.projectId); assert.equal(result.connectionRevision, 1);
  assert.equal(result.disposition, 'purchase_unqualified');
  assert.equal(new TextDecoder().decode(await decrypt(result.envelope, saved)), bytes(event()));
  await assert.rejects(decrypt(result.envelope, c));
});

const { snapshotNativeStoreSandboxCatalogV1: catalogSnapshot, compareNativeStoreSandboxCatalogV1: compareCatalog } = load('native-store-sandbox-catalog-v1.ts');
const uid = n => `e0000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const catalog = (store = 'APP_STORE') => ({ protocol: 'native-store-sandbox-catalog-v1',
  bindingId: `nssv1_catalog_${uid(1)}`, revision: 1, projectId: 'synthetic-project', appId: 'synthetic-app', store,
  environment: 'SANDBOX', wireProductId: 'synthetic-product', productType: 'one_time', basePlanId: null,
  resourceId: `scv1_resource_${uid(2)}`, resourceRevision: 1, creatorId: uid(3), amountMinor: 199, currency: 'usd', quantity: 1,
  asset: { id: `scv1_asset_${uid(4)}`, incarnation: uid(5), sha256: 'a'.repeat(64), byteLength: 100,
    resourceRevision: 1, profile: 'scpv-mp4-h264-aac-v1' } });
const report = c => ({ projectId: c.projectId, appId: c.appId, store: c.store, environment: c.environment, productId: c.wireProductId });
test('catalog pins both native stores and resource bytes without implying intent correlation', async () => {
  for (const store of ['APP_STORE', 'PLAY_STORE']) {
    const c = catalog(store), pinned = await catalogSnapshot(c);
    const result = await compareCatalog(c, pinned.digest, report(c));
    assert.equal(result.catalogMatches, true); assert.equal(result.correlation, 'unsupported');
    for (const field of ['dispatchAllowed', 'grantsAccess', 'financialAuthority']) assert.equal(result[field], false);
    assert.ok(Object.isFrozen(result.snapshot.binding.asset));
  }
});
test('catalog fingerprint is stable under key reordering but binds every resource, price and scope field', async () => {
  const c = catalog(), pinned = await catalogSnapshot(c);
  const reordered = Object.fromEntries(Object.entries(c).reverse());
  reordered.asset = Object.fromEntries(Object.entries(c.asset).reverse());
  assert.equal((await catalogSnapshot(reordered)).digest, pinned.digest);
  for (const patch of [{ bindingId: `nssv1_catalog_${uid(10)}` }, { revision: 2 }, { projectId: 'another-project' },
    { appId: 'another-app' }, { store: 'PLAY_STORE' }, { wireProductId: 'another-product' },
    { resourceId: `scv1_resource_${uid(11)}` }, { creatorId: uid(12) }, { amountMinor: 299 },
    { resourceRevision: 2, asset: { ...c.asset, resourceRevision: 2 } },
    ...[{ id: `scv1_asset_${uid(13)}` }, { incarnation: uid(14) }, { sha256: 'b'.repeat(64) }, { byteLength: 101 }].map(a => ({ asset: { ...c.asset, ...a } }))]) {
    const result = await compareCatalog({ ...c, ...patch }, pinned.digest, report(c));
    assert.equal(result.catalogMatches, false); assert.ok(result.reasons.includes('native_store_catalog_digest_mismatch'));
  }
});
test('catalog rejects non-finite prices, wrong namespace, plans, production and unknown authority fields', async () => {
  const c = catalog();
  for (const patch of [{ bindingId: `scv3_registration_${uid(1)}` }, { environment: 'PRODUCTION' }, { store: 'TEST_STORE' },
    { productType: 'subscription' }, { basePlanId: 'plan' }, { amountMinor: 1.99 }, { amountMinor: 0 },
    { amountMinor: Number.MAX_SAFE_INTEGER + 1 }, { currency: 'USD' }, { quantity: 2 }, { grantsAccess: true },
    { asset: { ...c.asset, resourceRevision: 2 } }, { asset: { ...c.asset, byteLength: 16777217 } },
    { asset: { ...c.asset, arbitrary: true } }]) {
    await assert.rejects(catalogSnapshot({ ...c, ...patch }), e => e.code === 'native_store_catalog_invalid');
  }
});
test('catalog scope and product comparison is exact: no colon parsing, case folding or whitespace repair', async () => {
  const c = catalog('PLAY_STORE'), pinned = await catalogSnapshot(c);
  for (const patch of [{ projectId: 'other-project' }, { appId: 'other-app' }, { store: 'APP_STORE' },
    { environment: 'PRODUCTION' }, { productId: `${c.wireProductId}:plan` }, { productId: `${c.wireProductId} ` },
    { productId: c.wireProductId.toUpperCase() }, { productId: null }]) {
    assert.equal((await compareCatalog(c, pinned.digest, { ...report(c), ...patch })).catalogMatches, false);
  }
  assert.equal((await compareCatalog(c, 'forged', report(c))).catalogMatches, false);
});
test('same SKU can quote different resources but cannot substitute a retained catalog digest', async () => {
  const first = catalog(), second = { ...catalog(), bindingId: `nssv1_catalog_${uid(20)}`, resourceId: `scv1_resource_${uid(21)}` };
  const pinned = await catalogSnapshot(first);
  assert.equal(first.wireProductId, second.wireProductId);
  assert.equal((await compareCatalog(second, pinned.digest, report(second))).catalogMatches, false);
  // Even matching the correct digest does NOT prove either resource was bought.
  assert.equal((await compareCatalog(first, pinned.digest, report(first))).grantsAccess, false);
});
test('catalog and observation detach before asynchronous hashing', async () => {
  const c = catalog(), pinned = await catalogSnapshot(c), observed = report(c);
  const pending = compareCatalog(c, pinned.digest, observed);
  c.amountMinor = 999; c.asset.sha256 = 'b'.repeat(64); observed.productId = 'another-product';
  const result = await pending;
  assert.equal(result.catalogMatches, true); assert.equal(result.snapshot.binding.amountMinor, 199);
  assert.equal(result.snapshot.binding.asset.sha256, 'a'.repeat(64));
});

const { persistNativeStoreSandboxIntakeV1: persistIntake } = load('native-store-sandbox-bridge-v1.ts');
const journalResult = (intake, patch = {}) => ({ protocol: 'native-store-sandbox-journal-result-v1', receiptId: uid(40),
  connectionId: intake.connectionId, connectionRevision: intake.connectionRevision, projectId: intake.projectId,
  rawSha256: intake.envelope.rawSha256, status: 'recorded', durable: true, correlation: 'unsupported',
  acknowledgementAllowed: false, dispatchAllowed: false, grantsAccess: false, financialAuthority: false, ...patch });
test('persistence is called once with frozen private intake and returns only exact durable no-authority result', async () => {
  let count = 0;
  const result = await persistIntake(request(bytes(event())), config(), async intake => {
    count++; assert.ok(Object.isFrozen(intake)); assert.ok(Object.isFrozen(intake.envelope.observation.aliases));
    return journalResult(intake);
  });
  assert.equal(count, 1); assert.equal(result.durable, true); assert.equal(result.grantsAccess, false);
  assert.equal(Object.hasOwn(result, 'envelope'), false); assert.equal(Object.hasOwn(result, 'reconciliationSubjects'), false);
});
test('uncertain database outcomes are not retried or falsely called durable', async () => {
  let count = 0;
  await assert.rejects(persistIntake(request(bytes(event())), config(), async () => { count++; throw Error('unknown-write-outcome'); }), /unknown-write-outcome/u);
  assert.equal(count, 1);
});
test('journal response must match exact scope/hash and cannot introduce acknowledgement or purchase authority', async () => {
  for (const patch of [{ connectionId: uid(41) }, { connectionRevision: 2 }, { projectId: 'other-project' },
    { rawSha256: 'f'.repeat(64) }, { receiptId: 'bad' }, { status: 'granted' }, { durable: false },
    { correlation: 'verified' }, { acknowledgementAllowed: true }, { dispatchAllowed: true }, { grantsAccess: true },
    { financialAuthority: true }, { privatePayload: {} }]) {
    await assert.rejects(persistIntake(request(bytes(event())), config(), async intake => journalResult(intake, patch)),
      e => e.code === 'native_store_journal_result_unavailable');
  }
});
