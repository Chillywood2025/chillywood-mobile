import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { webcrypto } from 'node:crypto';
globalThis.crypto ??= webcrypto;
const ts = createRequire(import.meta.url)('typescript'), cache = new Map();
function load(name) {
  if (cache.has(name)) return cache.get(name);
  const api = {}; cache.set(name, api);
  new Function('exports', 'require', ts.transpileModule(readFileSync(new URL('../../supabase/functions/_shared/' + name, import.meta.url), 'utf8'),
    { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText)(api, s => load(s.replace(/^\.\//u, '')));
  return api;
}
const { processNativeStoreEffectV1: processEffect } = load('native-store-effect-worker-v1.ts');
const id = n => `d0000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
async function fixture(negative = false) {
  const config = { bridgeProtocol: 'native-store-sandbox-v1', connectionId: id(12), connectionRevision: 1,
    projectId: 'synthetic-project', appId: 'synthetic-app', store: 'APP_STORE', environment: 'SANDBOX',
    authentication: { method: 'shared_secret', keyVersion: 'synthetic-v1', secret: 'synthetic-not-a-real-secret-'.repeat(2) },
    encryption: { keyId: 'synthetic-key', key: new Uint8Array(32).fill(17) } };
  const event = { id: 'synthetic-event', type: negative ? 'CANCELLATION' : 'NON_RENEWING_PURCHASE', app_id: config.appId,
    store: config.store, environment: 'SANDBOX', app_user_id: id(1), original_app_user_id: id(1),
    transaction_id: 'synthetic-tx', original_transaction_id: 'synthetic-tx', product_id: 'synthetic-product',
    event_timestamp_ms: 1794139200000, purchased_at_ms: 1794139190000, price_in_purchased_currency: 1.99,
    currency: 'USD', quantity: 1, expiration_at_ms: null, ...(negative ? { cancel_reason: 'CUSTOMER_SUPPORT' } : {}) };
  const envelope = (await load('native-store-sandbox-bridge-v1.ts').prepareNativeStoreSandboxIntakeV1(new Request('https://local.invalid', {
    method: 'POST', headers: { authorization: config.authentication.secret }, body: JSON.stringify({ api_version: '1.0', event }) }), config)).envelope;
  const work = { rawReceiptId: id(13), claimId: negative ? null : id(2), protocolId: id(20), protocolRevision: 1 };
  const quote = { offerId: 'scv1_offer_' + id(6), offerRevision: 1, resourceId: 'scv1_resource_' + id(7), resourceRevision: 1,
    creatorId: id(8), kind: 'paid_content', amountMinor: 199, currency: 'usd',
    asset: { id: 'scv1_asset_' + id(9), incarnation: id(10), sha256: 'a'.repeat(64), byteLength: 100, resourceRevision: 1, profile: 'scpv-mp4-h264-aac-v1' },
    catalog: { bindingId: 'nssv1_catalog_' + id(11), revision: 1, projectId: config.projectId, appId: config.appId,
      store: config.store, environment: 'SANDBOX', wireProductId: event.product_id }, quoteDigest: 'b'.repeat(64) };
  const claim = { buyerId: id(1), selectionSessionGeneration: id(5), quote,
    claim: { id: 'nssv1_claim_' + id(2), selectionId: 'nssv1_selection_' + id(3), originalRequestId: id(4),
      originalSessionGeneration: id(5), createdAt: '2026-11-08T01:00:00Z', transactionIdentifier: event.transaction_id,
      productIdentifier: event.product_id, evidence: 'client_assertion', settlementAllowed: false } };
  const context = { protocol: 'native-store-effect-context-v1', raw: { rawReceiptId: work.rawReceiptId, rawSha256: envelope.rawSha256,
    rawByteLength: envelope.rawByteLength, connectionId: config.connectionId, connectionRevision: 1, projectId: config.projectId,
    appId: config.appId, store: config.store, environment: 'SANDBOX', intakeEnabled: true, originalRevisionRevoked: false,
    recordedAt: '2026-11-08T01:00:00Z', eventIds: [id(21)], conflicted: false, observation: envelope.observation },
    claim: negative ? null : claim,
    settlementProtocol: { id: work.protocolId, revision: 1, policy: 'exact_native_usd_consumable_v1', projectId: config.projectId,
      appId: config.appId, store: config.store, productId: event.product_id, connectionId: config.connectionId, connectionRevision: 1,
      scopeKey: JSON.stringify(['native-store-sandbox-v1', 'revenuecat', config.projectId, config.appId, config.store, 'SANDBOX']),
      platform: 'ios', nativeBuild: '43', nativeVersion: '1.0', signedAppVersion: '42.7', sdkVersion: '10.15.1' } };
  const journal = { protocol: 'native-store-sandbox-journal-read-v1', revoked: false,
    receipt: { id: work.rawReceiptId, project_id: config.projectId, connection_id: config.connectionId, connection_revision: 1,
      raw_sha256: envelope.rawSha256, raw_byte_length: envelope.rawByteLength, envelope },
    registry: { id: config.connectionId, revision: 1, project_id: config.projectId, app_id: config.appId, store: config.store,
      environment: 'SANDBOX', auth_key_version: config.authentication.keyVersion, storage_key_id: config.encryption.keyId } };
  const calls = [], result = { protocol: 'native-store-effect-result-v1', consumer: 'native-store-sandbox-v1', rawReceiptId: work.rawReceiptId,
    status: 'processed', effectKind: negative ? 'negative_applied' : 'positive_applied', allocationId: negative ? null : 'nssv1_allocation_' + id(76),
    grantId: negative ? null : 'scv1_grant_' + id(77), durable: true, acknowledgementAllowed: true, grantsAccess: false, financialAuthority: false, payable: false };
  const deps = { readContext: async () => context, readOriginalJournal: async () => journal,
    resolveOriginalConnection: async registry => { calls.push({ keyId: registry.storage_key_id }); return config; },
    applyEffect: async (item, projection) => { calls.push({ item, projection }); return result; } };
  return { work, context, journal, config, deps, calls, result };
}
test('original encrypted purchase and explicit claim reach exactly one effect call, never shared-hook acknowledgement', async () => {
  const f = await fixture(), r = await processEffect(f.work, f.deps);
  assert.equal(r.status, 'processed'); assert.equal(r.acknowledgementAllowed, false); assert.equal(r.grantsAccess, false);
  assert.equal(r.nativeConsumerEffect.consumer, 'native-store-sandbox-v1');
  const writes = f.calls.filter(c => c.projection); assert.equal(writes.length, 1);
  assert.deepEqual(writes[0].projection, { protocol: 'native-store-authenticated-effect-v1', rawSha256: f.journal.receipt.raw_sha256,
    kind: 'purchase', amountMinor: 199, currency: 'usd', purchasedAt: '2026-11-08T11:59:50.000Z', eventAt: '2026-11-08T12:00:00.000Z', quantity: 1, cancelReason: null });
  assert.equal(Object.isFrozen(writes[0].projection), true); assert.equal(JSON.stringify(r).includes('synthetic-tx'), false);
});
test('historical authenticated refund can reconcile original revoked/off evidence without a client claim', async () => {
  const f = await fixture(true); f.context.raw.originalRevisionRevoked = true; f.context.raw.intakeEnabled = false; f.journal.revoked = true;
  const r = await processEffect(f.work, f.deps); assert.equal(r.status, 'processed');
  assert.equal(f.calls.find(c => c.projection).projection.kind, 'refund'); assert.equal(r.nativeConsumerEffect.grantId, null);
});
test('unqualified, conflicting, substituted metadata/key/scope or buyer facts never call effects', async () => {
  for (const change of [f => { f.context.raw.conflicted = true; }, f => { f.context.settlementProtocol.id = id(99); },
    f => { f.context.settlementProtocol.productId = 'other'; }, f => { f.context.settlementProtocol.signedAppVersion = ''; },
    f => { f.context.raw.intakeEnabled = false; }, f => { f.journal.registry.revision = 2; }, f => { f.config.encryption.keyId = 'wrong'; },
    f => { f.config.encryption.key.fill(0); }, f => { f.context.claim.buyerId = id(99); }, f => { f.context.raw.observation.userId = id(99); }]) {
    const f = await fixture(); change(f); const r = await processEffect(f.work, f.deps);
    assert.equal(r.status, 'held'); assert.equal(f.calls.filter(c => c.projection).length, 0); assert.equal(r.acknowledgementAllowed, false);
  }
});
test('lost apply result and forged authority are unknown, with no automatic write retry', async () => {
  for (const mode of ['lost', 'forged', 'timeout']) {
    const f = await fixture(); let writes = 0;
    f.deps.applyEffect = async () => { writes++; if (mode === 'lost') throw Error('private database body must not escape');
      if (mode === 'timeout') await new Promise(r => setTimeout(r, 80)); return { ...f.result, grantsAccess: mode === 'forged' }; };
    const r = await processEffect(f.work, f.deps, { deadlineMs: mode === 'timeout' ? 50 : 15000 });
    assert.equal(r.status, 'unknown'); assert.equal(writes, 1); assert.equal(r.nativeConsumerEffect, null); assert.equal(r.acknowledgementAllowed, false);
  }
});
test('work and readbacks detach before asynchronous original key resolution', async () => {
  const f = await fixture(); let release, reached;
  const ready = new Promise(r => { reached = r; }); f.deps.resolveOriginalConnection = async () => { reached(); await new Promise(r => { release = r; }); return f.config; };
  const pending = processEffect(f.work, f.deps); await ready; f.work.claimId = id(99); f.context.claim.quote.amountMinor = 299;
  f.journal.receipt.raw_sha256 = 'f'.repeat(64); release(); const r = await pending;
  assert.equal(r.status, 'processed'); assert.equal(f.calls.find(c => c.projection).projection.amountMinor, 199);
});
test('event-loop blocking cannot turn an overdue dependency into a timely read or committed result', async () => {
  const block = () => Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 110);
  for (const phase of ['read', 'apply']) {
    const f = await fixture(); let writes = 0;
    if (phase === 'read') f.deps.readContext = async () => { block(); return f.context; };
    f.deps.applyEffect = async () => { writes++; block(); return f.result; };
    const result = await processEffect(f.work, f.deps, { deadlineMs: 70 });
    assert.equal(result.status, phase === 'apply' ? 'unknown' : 'held');
    assert.equal(writes, phase === 'apply' ? 1 : 0); assert.equal(result.acknowledgementAllowed, false); assert.equal(result.nativeConsumerEffect, null);
  }
});

test('SQL JSONB scope formatting is accepted without normalizing identifier contents or array structure', async () => {
  const f = await fixture();
  const scope = JSON.parse(f.context.settlementProtocol.scopeKey);
  f.context.settlementProtocol.scopeKey = JSON.stringify(scope).replaceAll(',', ', ');
  assert.equal((await processEffect(f.work, f.deps)).status, 'processed');
  for (const value of [JSON.stringify([...scope, 'extra']), JSON.stringify(scope.slice(1)),
    JSON.stringify({ scope }), JSON.stringify(scope.map((v, i) => i === 2 ? ` ${v}` : v)),
    JSON.stringify(scope.map((v, i) => i === 2 ? null : v)), '[invalid',
    JSON.stringify([scope[1], scope[0], ...scope.slice(2)])]) {
    const bad = await fixture(); bad.context.settlementProtocol.scopeKey = value;
    assert.equal((await processEffect(bad.work, bad.deps)).status, 'held');
    assert.equal(bad.calls.filter(c => c.projection).length, 0);
  }
});
test('persisted-parent routing uses only private candidate work and never chooses or retries ambiguous claims', async () => {
  const route = load('native-store-effect-worker-v1.ts').processPersistedNativeStoreReceiptV1;
  const f = await fixture(); let reads = 0;
  const candidate = { protocol: 'native-store-effect-candidate-v1', rawReceiptId: f.work.rawReceiptId,
    status: 'candidate', work: f.work, acknowledgementAllowed: false };
  const result = await route(f.work.rawReceiptId, { ...f.deps, readCandidate: async raw => {
    assert.equal(raw, f.work.rawReceiptId); reads++; return candidate;
  } });
  assert.equal(result.status, 'processed'); assert.equal(reads, 1); assert.equal(f.calls.filter(c => c.projection).length, 1);
  for (const change of [c => { c.status = 'held'; c.work = null; }, c => { c.rawReceiptId = id(99); },
    c => { c.work.rawReceiptId = id(99); }, c => { c.acknowledgementAllowed = true; }, c => { c.extra = 'ignored'; }]) {
    const bad = await fixture(), c = structuredClone({ ...candidate, work: bad.work }); change(c);
    const r = await route(bad.work.rawReceiptId, { ...bad.deps, readCandidate: async () => c });
    assert.equal(r.status, 'held'); assert.equal(bad.calls.length, 0); assert.equal(r.acknowledgementAllowed, false);
  }
});
test('blocking candidate discovery exhausts the shared deadline before any worker read or write', async () => {
  const route = load('native-store-effect-worker-v1.ts').processPersistedNativeStoreReceiptV1, f = await fixture();
  const result = await route(f.work.rawReceiptId, { ...f.deps, readCandidate: async () => {
    Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 110);
    return { protocol: 'native-store-effect-candidate-v1', rawReceiptId: f.work.rawReceiptId,
      status: 'candidate', work: f.work, acknowledgementAllowed: false };
  } }, { deadlineMs: 70 });
  assert.equal(result.status, 'held'); assert.equal(f.calls.length, 0);
});
