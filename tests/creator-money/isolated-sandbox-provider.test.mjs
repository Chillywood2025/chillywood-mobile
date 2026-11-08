import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';

// Synthetic boundary fixtures, not real provider receipts or delivery proof.
const require = createRequire(import.meta.url);
const ts = require('typescript');
const source = readFileSync(new URL('../../supabase/functions/_shared/isolated-sandbox-provider.ts', import.meta.url), 'utf8');
const api = {};
new Function('exports', ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText)(api);
const { classifySandboxProviderReceipt: classify, sandboxProviderScopeKey: scopeKey,
  validateSandboxProviderRegistry: validateRegistry } = api;

const owner = { subsystem: 'isolated_sandbox', generation: 1 };
const legacy = { subsystem: 'legacy', generation: 1 };
const rc = { provider: 'revenuecat', projectId: 'fixture-project', appId: 'fixture-app', store: 'APP_STORE', environment: 'SANDBOX' };
const stripe = { provider: 'stripe', platformAccountId: 'acct_fixture', store: 'STRIPE', environment: 'test' };
const buyer = '11111111-1111-4111-8111-111111111111';
const otherBuyer = '22222222-2222-4222-8222-222222222222';
const intent = '33333333-3333-4333-8333-333333333333';
const otherIntent = '44444444-4444-4444-8444-444444444444';
const stamp = '2026-11-07T12:00:00.000Z';
const eventStamp = '2026-11-07T12:00:01.000Z';
const productId = 'fixture.isolated.pass';
const originalTransactionId = 'fixture-original';
const rawBodySha256 = 'a'.repeat(64);

function fixture(scope = rc) {
  const registry = {
    schemaVersion: 1, coverage: 'complete_provider_namespace',
    products: [{ owner: { ...owner }, scope: { ...scope }, productId }], originals: [],
    routes: [{ owner: { ...owner }, scope: { ...scope },
      qualification: 'independently_verified_noninterfering',
      ownershipEvidenceSha256: 'b'.repeat(64), deliveryEvidenceSha256: 'c'.repeat(64), initiationEnabled: true }],
  };
  const receipt = { kind: 'purchase', scope: { ...scope }, providerEventId: 'fixture-event', rawBodySha256,
    providerEventType: scope.provider === 'stripe' ? 'payment_intent.succeeded' : 'NON_RENEWING_PURCHASE',
    eventType: scope.provider === 'stripe' ? 'payment_succeeded' : 'non_renewing_purchase',
    buyerId: buyer, originalTransactionId, providerEventAt: eventStamp, productId,
    providerTransactionId: 'fixture-transaction', intentId: null, purchasedAt: stamp,
    expiresAt: null, amountMinor: 99, currency: 'usd' };
  return { target: { ...owner }, endpointScope: { ...scope }, registry, receipt };
}
function bind(f) {
  f.registry.originals.push({ owner: { ...owner }, scope: { ...f.endpointScope }, productId,
    originalTransactionId, buyerId: buyer, intentId: intent });
  return f;
}
function terminal(f, eventType = 'refund') {
  f.receipt = { kind: 'terminal', scope: { ...f.endpointScope }, providerEventId: 'fixture-terminal', rawBodySha256,
    providerEventType: f.endpointScope.provider === 'stripe' ? 'charge.refunded' : eventType.toUpperCase(),
    buyerId: buyer, originalTransactionId, providerEventAt: eventStamp, productId: null,
    providerTransactionId: null, eventType, amountMinor: null, currency: null, refundedAmountMinor: null };
  return f;
}
function reason(f, expected) {
  const out = classify(f);
  assert.equal(out.disposition, 'reject'); assert.equal(out.reason, expected);
  assert.equal(out.grantsAuthority, false); return out;
}

test('exact native receipt is classified, never authenticated or granted', () => {
  const f = fixture(), out = classify(f);
  assert.equal(out.disposition, 'route'); assert.equal(out.environment, 'sandbox');
  assert.equal(out.provider, 'revenuecat'); assert.equal(out.store, 'app_store');
  assert.equal(out.providerScopeKey, scopeKey(rc)); assert.equal(out.intentId, null);
  assert.equal(out.classificationOnly, true); assert.equal(out.grantsAuthority, false);
  assert.equal(out.requiredAuthentication, 'edge_bound_provider_bytes');
  f.receipt.productId = 'changed'; f.target.generation = 8;
  assert.equal(out.receipt.productId, productId); assert.equal(out.owner.generation, 1);
});

test('exact Google and Stripe provenance become canonical sandbox only after scope match', () => {
  const google = classify(fixture({ ...rc, store: 'PLAY_STORE' }));
  assert.equal(google.provider, 'revenuecat'); assert.equal(google.store, 'google_play');
  const card = classify(fixture(stripe));
  assert.equal(card.provider, 'stripe'); assert.equal(card.store, 'stripe'); assert.equal(card.environment, 'sandbox');
});

test('production, lowercase or invented environment and store aliases never coerce to sandbox', () => {
  for (const environment of ['PRODUCTION', 'production', 'sandbox', 'test', null]) {
    assert.equal(scopeKey({ ...rc, environment }), null);
  }
  for (const environment of ['live', 'sandbox', false, 'TEST']) assert.equal(scopeKey({ ...stripe, environment }), null);
  assert.equal(scopeKey({ ...rc, store: 'MAC_APP_STORE' }), null);
  assert.equal(scopeKey({ ...rc, store: { toString: () => 'APP_STORE' } }), null);
  assert.equal(scopeKey({ ...stripe, platformAccountId: { toString: () => 'acct_fixture' } }), null);
  assert.equal(scopeKey({ ...stripe, platformAccountId: 'acct_fixture ', environment: 'test' }), null);
  assert.equal(scopeKey({ ...rc, projectId: 'fixture\u0000project' }), null);
});

test('project, app, store and platform account changes cannot cross an endpoint scope', () => {
  for (const delta of [{ projectId: 'other' }, { appId: 'other' }, { store: 'PLAY_STORE' }]) {
    const f = fixture(); Object.assign(f.receipt.scope, delta); reason(f, 'provider_scope_mismatch');
  }
  const f = fixture(stripe); f.receipt.scope.platformAccountId = 'acct_other'; reason(f, 'provider_scope_mismatch');
});

test('client verification assertions and malformed economic/time identities cannot confer authority', () => {
  for (const patch of [{ signatureVerified: true }, { verified: true }, { amountMinor: 1.5 },
    { amountMinor: 0 }, { currency: 'USD' }, { buyerId: 'anonymous' }, { providerEventId: ' event' },
    { rawBodySha256: 'a'.repeat(63) }, { purchasedAt: '2026-02-30T12:00:00.000Z' },
    { purchasedAt: '2026-11-07T12:00:02.000Z' }, { expiresAt: stamp }, { providerTransactionId: '' }]) {
    const f = fixture(); Object.assign(f.receipt, patch); reason(f, 'receipt_invalid');
  }
});

test('partial ownership inventory is not proof that a SKU is exclusive', () => {
  const f = fixture(); f.registry.coverage = 'incomplete'; reason(f, 'ownership_coverage_incomplete');
});

test('same-SKU legacy and new ownership, including duplicate same-owner records, fail closed', () => {
  for (const secondOwner of [legacy, owner]) {
    const f = fixture(); f.registry.products.push({ owner: { ...secondOwner }, scope: { ...rc }, productId });
    reason(f, 'product_ownership_ambiguous');
  }
});

test('a SKU exclusively owned by legacy never routes into the new subsystem', () => {
  const f = fixture(); f.registry.products[0].owner = { ...legacy }; reason(f, 'product_not_owned');
});

test('ambiguous original transaction identity fails before any lifecycle dispatch', () => {
  const f = bind(fixture()); f.registry.originals.push({ ...f.registry.originals[0], intentId: otherIntent });
  reason(f, 'original_ownership_ambiguous');
});

test('a durable original binding must retain product owner and valid intent identity', () => {
  const f = bind(fixture()); f.registry.originals[0].owner = { ...legacy };
  reason(f, 'original_product_ownership_mismatch');
  const bad = bind(fixture()); bad.registry.originals[0].intentId = null;
  reason(bad, 'original_ownership_invalid');
});

test('unavailable delivery route remains unavailable even with matching products', () => {
  const f = fixture(); Object.assign(f.registry.routes[0], { qualification: 'unavailable',
    ownershipEvidenceSha256: null, deliveryEvidenceSha256: null, initiationEnabled: false });
  reason(f, 'provider_route_unavailable');
  f.registry.routes[0].initiationEnabled = true; reason(f, 'provider_route_evidence_invalid');
  f.registry.routes = []; reason(f, 'provider_route_unavailable');
});

test('route qualification requires both evidence references and unique route ownership', () => {
  const f = fixture(); f.registry.routes[0].deliveryEvidenceSha256 = null;
  reason(f, 'provider_route_evidence_invalid');
  const duplicate = fixture(); duplicate.registry.routes.push({ ...duplicate.registry.routes[0] });
  reason(duplicate, 'provider_route_ambiguous');
});

test('productless terminal receipt recovers only immutable original ownership', () => {
  const f = terminal(bind(fixture())); const out = classify(f);
  assert.equal(out.disposition, 'route'); assert.equal(out.productId, productId);
  assert.equal(out.intentId, intent); assert.equal(out.receipt.productId, null);
});

test('productless terminal without ownership is quarantined in this module only', () => {
  const out = classify(terminal(fixture()));
  assert.equal(out.disposition, 'quarantine'); assert.equal(out.reason, 'original_ownership_missing');
  assert.deepEqual(out.quarantine.owner, owner); assert.equal(out.quarantine.buyerId, buyer);
  assert.equal(out.quarantine.originalTransactionId, originalTransactionId);
  assert.equal(out.quarantine.providerScopeKey, scopeKey(rc)); assert.equal(out.grantsAuthority, false);
});

test('terminal buyer/product mismatch quarantines only known ownership; foreign generation cannot be claimed', () => {
  const f = terminal(bind(fixture())); f.receipt.buyerId = otherBuyer;
  const mismatch = classify(f); assert.equal(mismatch.disposition, 'quarantine');
  assert.equal(mismatch.reason, 'original_buyer_mismatch'); assert.equal(mismatch.quarantine.buyerId, buyer);
  const changed = terminal(bind(fixture())); changed.receipt.productId = 'different';
  assert.equal(classify(changed).disposition, 'quarantine'); assert.equal(classify(changed).reason, 'original_product_mismatch');
  const old = terminal(bind(fixture())); old.target.generation = 2;
  old.registry.routes.push({ ...old.registry.routes[0], owner: { ...old.target } });
  reason(old, 'original_owner_mismatch');
});

test('purchase retry cannot relabel an already-bound transaction to another intent', () => {
  const f = bind(fixture()); f.receipt.intentId = otherIntent; reason(f, 'original_intent_mismatch');
  f.receipt.intentId = null; assert.equal(classify(f).intentId, intent);
});

test('disabling new checkout preserves late receipts and historical lifecycle classification', () => {
  const f = fixture(); f.registry.routes[0].initiationEnabled = false;
  const late = classify(f); assert.equal(late.disposition, 'route'); assert.equal(late.grantsAuthority, false);
  const existing = terminal(bind(f)); assert.equal(classify(existing).disposition, 'route');
});

test('transfer and unknown events cannot invoke legacy or global quarantine', () => {
  for (const kind of ['transfer', 'unknown']) {
    const f = fixture(); f.registry.coverage = 'incomplete';
    f.receipt = { kind, scope: { ...rc }, providerEventId: null, rawBodySha256,
      buyerId: null, originalTransactionId: null };
    const out = classify(f); assert.equal(out.disposition, 'quarantine');
    assert.deepEqual(out.quarantine.owner, owner); assert.equal(out.quarantine.providerScopeKey, scopeKey(rc));
    assert.equal(out.grantsAuthority, false); assert.equal(Object.hasOwn(out.quarantine, 'global'), false);
  }
});

test('lifecycle observations require independent proof and never reopen rights themselves', () => {
  for (const eventType of ['scheduled_pause', 'product_change', 'extension', 'refund_reversed']) {
    const f = bind(fixture()); f.receipt = { kind: 'observation', scope: { ...rc }, providerEventId: 'lifecycle',
      providerEventType: { scheduled_pause: 'SUBSCRIPTION_PAUSED', product_change: 'PRODUCT_CHANGE', extension: 'SUBSCRIPTION_EXTENDED', refund_reversed: 'REFUND_REVERSED' }[eventType],
      rawBodySha256, buyerId: buyer, originalTransactionId, providerEventAt: eventStamp, productId: null, eventType };
    const out = classify(f); assert.equal(out.disposition, 'route');
    assert.equal(out.requiresIndependentLifecycleProof, true); assert.equal(out.grantsAuthority, false);
  }
});

test('renewal keeps its event identity and cannot consume a fresh pending intent', () => {
  const f = fixture(); f.receipt.eventType = 'renewal'; f.receipt.providerEventType = 'RENEWAL';
  const missing = classify(f); assert.equal(missing.disposition, 'quarantine');
  assert.equal(missing.reason, 'renewal_original_ownership_missing');
  bind(f); const out = classify(f); assert.equal(out.disposition, 'route');
  assert.equal(out.receipt.eventType, 'renewal'); assert.equal(out.receipt.providerEventType, 'RENEWAL');
  f.receipt.eventType = 'initial_purchase'; reason(f, 'receipt_invalid');
  const unsupported = fixture(); unsupported.receipt.providerEventType = 'UNCANCELLATION'; reason(unsupported, 'receipt_invalid');
});

test('Stripe refund keeps cumulative amount and rejects missing or impossible refund economics', () => {
  const f = terminal(bind(fixture(stripe))); Object.assign(f.receipt, { amountMinor: 99, currency: 'usd', refundedAmountMinor: 20 });
  const out = classify(f); assert.equal(out.disposition, 'route'); assert.equal(out.receipt.refundedAmountMinor, 20);
  assert.equal(out.receipt.amountMinor, 99);
  for (const refundedAmountMinor of [null, 0, 100, 2.5]) {
    f.receipt.refundedAmountMinor = refundedAmountMinor; reason(f, 'receipt_invalid');
  }
});

test('malformed registry and cross-provider originals fail closed rather than guessing', () => {
  assert.equal(validateRegistry(null), 'registry_invalid');
  const f = terminal(bind(fixture())); f.registry.originals[0].scope = { ...stripe };
  reason(f, 'original_product_ownership_mismatch');
  const endpoint = fixture(); endpoint.endpointScope.environment = 'PRODUCTION'; reason(endpoint, 'endpoint_scope_invalid');
});
