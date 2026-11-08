import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { Buffer } from 'node:buffer';
import { webcrypto, createHash } from 'node:crypto';
const require = createRequire(import.meta.url), ts = require('typescript');
globalThis.crypto ??= webcrypto;
const cache = new Map();
const load = name => {
  if (cache.has(name)) return cache.get(name);
  const result = {}; cache.set(name, result);
  const source = readFileSync(new URL(`../../supabase/functions/_shared/${name}`, import.meta.url), 'utf8');
  new Function('exports', 'require', ts.transpileModule(source, { compilerOptions: {
    module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022,
  } }).outputText)(result, specifier => load(specifier.replace(/^\.\//u, '')));
  return result;
};
const boundary = load('revenuecat-router-envelope.ts'), planner = load('revenuecat-router-planner.ts');
const { createReceiptRouterHandler } = load('revenuecat-router-handler.ts');
const { runReceiptRouterWorker } = load('revenuecat-router-worker.ts');
const connectionId = '11111111-1111-4111-8111-111111111111', buyer = '22222222-2222-4222-8222-222222222222';
const other = '33333333-3333-4333-8333-333333333333', intent = '44444444-4444-4444-8444-444444444444';
const config = () => ({ connectionId, connectionRevision: 1, projectId: 'fixture-project',
  authentication: { method: 'shared_secret', keyVersion: 'fixture-auth-v1', secret: 'Bearer ' + 'a'.repeat(40) },
  encryption: { keyId: 'fixture-encryption-v1', key: new Uint8Array(32).fill(7) } });
const event = (patch = {}) => ({ api_version: '1.0', event: { id: 'fixture-event', type: 'NON_RENEWING_PURCHASE',
  app_id: 'fixture-app', store: 'APP_STORE', environment: 'SANDBOX', event_timestamp_ms: 1794052800000,
  app_user_id: buyer, original_app_user_id: buyer, aliases: [], product_id: 'fixture-tip',
  original_transaction_id: 'fixture-original', transaction_id: 'fixture-transaction', ...patch } });
const body = (patch = {}) => JSON.stringify(event(patch));
const request = (raw = body(), c = config()) => new Request('https://fixture.invalid/provider', {
  method: 'POST', headers: { authorization: c.authentication.secret }, body: raw,
});
const scope = { projectId: 'fixture-project', appId: 'fixture-app', store: 'APP_STORE', environment: 'SANDBOX', storeAppIdentity: 'fixture-bundle' };
const owner = { domain: 'isolated_sandbox', generation: 1 };
const snapshot = () => ({ revision: 1, coverage: 'complete', projectId: 'fixture-project', scopes: [{ ...scope }],
  catalog: [{ scope: { ...scope }, productId: 'fixture-tip', owner: { ...owner } }], originals: [] });
const observe = raw => boundary.observeRevenueCatBytes(new TextEncoder().encode(raw));
const bind = s => { s.originals.push({ scope: { ...scope }, productId: 'fixture-tip', owner: { ...owner },
  originalTransactionId: 'fixture-original', originalBuyerId: buyer, intentId: intent, revision: 1 }); return s; };

async function workerFixture(patch = {}) {
  const envelope = await boundary.authenticateRevenueCatEnvelope(request(), config());
  const job = { protocol: 'rc-router-job-v1', status: 'leased', eventId: connectionId, lease: intent, leaseGeneration: 1,
    leaseUntil: new Date(Date.now() + 30000).toISOString(), conflicted: false, authorityGranted: false,
    variants: [{ receiptId: intent, connectionId, connectionRevision: 1, projectId: scope.projectId, envelope }], snapshot: snapshot(), ...patch };
  const completed = [], deferred = [];
  const deps = { claim: async () => job, connection: config,
    complete: async (_, plan) => { completed.push(plan); return { status: 'plan_recorded', authorityGranted: false,
      legacyEffectsEnforced: false, acknowledgementAllowed: false }; },
    defer: async (_, reason) => { deferred.push(reason); } };
  return { job, deps, completed, deferred };
}
test('worker decrypts actual sealed local bytes and records only a no-authority plan', async () => {
  const { deps, completed, deferred } = await workerFixture();
  assert.equal((await runReceiptRouterWorker(deps, buyer)).status, 'plan_recorded');
  assert.equal(completed.length, 1); assert.equal(deferred.length, 0);
  assert.equal(completed[0].disposition, 'awaiting_binding'); assert.equal(completed[0].grantsAuthority, false);
});
test('worker missing revision key and ciphertext tampering defer without completing or exposing provider data', async () => {
  for (const mode of ['key', 'ciphertext']) {
    const { deps, job, completed, deferred } = await workerFixture();
    if (mode === 'key') deps.connection = () => null;
    else job.variants[0].envelope.rawSha256 = '0'.repeat(64);
    const result = await runReceiptRouterWorker(deps, buyer);
    assert.equal(result.status, 'pending'); assert.equal(completed.length, 0); assert.equal(deferred.length, 1);
  }
});
test('worker conflicting variants cannot select a winning positive owner or acknowledge', async () => {
  const { deps, job, completed } = await workerFixture();
  const envelope = await boundary.authenticateRevenueCatEnvelope(request(body({ type: 'TRANSFER', transferred_from: [buyer], transferred_to: [other] })), config());
  job.conflicted = true; job.variants.push({ ...job.variants[0], envelope });
  await runReceiptRouterWorker(deps, buyer);
  assert.equal(completed[0].reason, 'authenticated_event_bytes_conflict'); assert.equal(completed[0].owner, null);
  assert.equal(completed[0].acknowledgementAllowed, false);
  assert.ok(completed[0].holdTargets.some(t => t.subjectId === buyer));
  assert.ok(completed[0].holdTargets.some(t => t.subjectId === other));
});
test('worker ambiguous completion only attempts fenced defer and never treats the error as a grant', async () => {
  const { deps, deferred } = await workerFixture();
  deps.complete = async () => { throw new Error('private receipt details'); };
  const result = await runReceiptRouterWorker(deps, buyer);
  assert.equal(result.status, 'pending'); assert.deepEqual(deferred, ['completion_unknown']);
  assert.ok(!JSON.stringify(result).includes('private receipt details'));
});

test('synthetic authenticated bytes are encrypted and exactly replayable, not provider/live proof', async () => {
  const raw = '\n' + body() + '  ', c = config(), sealed = await boundary.authenticateRevenueCatEnvelope(request(raw, c), c);
  assert.equal(sealed.rawSha256, createHash('sha256').update(raw).digest('hex'));
  assert.equal(sealed.rawByteLength, Buffer.byteLength(raw)); assert.equal(sealed.observation.parseStatus, 'valid');
  assert.equal(new TextDecoder().decode(await boundary.decryptRouterEnvelope(sealed, c)), raw);
  assert.ok(!JSON.stringify(sealed).includes(c.authentication.secret)); assert.ok(!JSON.stringify(sealed).includes(raw));
  const retry = await boundary.authenticateRevenueCatEnvelope(request(raw, c), c);
  assert.equal(retry.rawSha256, sealed.rawSha256); assert.notEqual(retry.encryption.nonce, sealed.encryption.nonce);
});
test('wrong shared Authorization and alternate client-secret header never reach persistence', async () => {
  let calls = 0;
  const handler = createReceiptRouterHandler({ connection: config, persist: async () => { calls++; } });
  const req = new Request('https://fixture.invalid/provider', { method: 'POST', headers: { 'x-chillywood-webhook-secret': config().authentication.secret }, body: body() });
  const response = await handler(req); assert.equal(response.status, 401); assert.equal(calls, 0);
  assert.equal((await response.json()).error, 'provider_authentication_failed');
});
test('unqualified HMAC configuration is rejected; signature-looking headers are not authorization', async () => {
  const c = config(); c.authentication.method = 'hmac_sha256';
  await assert.rejects(boundary.authenticateRevenueCatEnvelope(request(), c), /router_configuration_unavailable/u);
  const req = new Request('https://fixture.invalid/provider', { method: 'POST',
    headers: { 'x-revenuecat-webhook-signature': 't=1794052800,v1=' + 'a'.repeat(64) }, body: body() });
  await assert.rejects(boundary.authenticateRevenueCatEnvelope(req, config()), /provider_authentication_failed/u);
});
test('ciphertext is bound to stored hash, connection, project, encryption and auth revisions', async () => {
  const c = config(), sealed = await boundary.authenticateRevenueCatEnvelope(request(), c);
  for (const changed of [{ ...c, connectionRevision: 2 }, { ...c, projectId: 'different' },
    { ...c, authentication: { ...c.authentication, keyVersion: 'changed' } }])
    await assert.rejects(boundary.decryptRouterEnvelope(sealed, changed), /stored_envelope_mismatch/u);
  await assert.rejects(boundary.decryptRouterEnvelope({ ...sealed, rawSha256: 'b'.repeat(64) }, c), /stored_envelope_mismatch/u);
  await assert.rejects(boundary.decryptRouterEnvelope({ ...sealed, observation: { ...sealed.observation, userId: other } }, c), /stored_envelope_mismatch/u);
  const reordered = JSON.parse(JSON.stringify(sealed, (_key, value) => value && typeof value === 'object' && !Array.isArray(value)
    ? Object.fromEntries(Object.keys(value).sort().map(k => [k, value[k]])) : value));
  assert.equal(new TextDecoder().decode(await boundary.decryptRouterEnvelope(reordered, c)), body());
});
test('duplicate JSON keys, conflicting event IDs, invalid UTF8 and malformed bodies are preserved as invalid observations', () => {
  assert.ok(observe('{"api_version":"1.0","event":{"id":"a","id":"b","type":"TRANSFER"}}').issues.includes('duplicate_json_key'));
  assert.equal(observe(body({ event_id: 'conflict' })).eventId, null);
  assert.ok(observe(body({ aliases: [buyer, buyer] })).issues.includes('duplicate_aliases'));
  assert.equal(boundary.observeRevenueCatBytes(new Uint8Array([255])).parseStatus, 'invalid');
  assert.equal(observe('not-json').parseStatus, 'invalid');
  const conflict = observe(body({ appUserId: other }));
  assert.equal(conflict.parseStatus, 'invalid'); assert.deepEqual(conflict.conflictingUserIds, [buyer, other]);
  assert.deepEqual(new Set(planner.planRevenueCatObservation(conflict, snapshot()).holdTargets.map(t => t.subjectId)), new Set([buyer, other]));
});
test('body limit and nesting limits bound authenticated untrusted input', async () => {
  await assert.rejects(boundary.authenticateRevenueCatEnvelope(request('x'.repeat(boundary.MAX_RECEIPT_BYTES + 1)), config()), /body_limit/u);
  assert.ok(observe('['.repeat(26) + '0' + ']'.repeat(26)).issues.includes('json_structure_limit'));
});
test('durable ingress never acknowledges real events as protected; exact TEST alone can acknowledge', async () => {
  const persist = async () => ({ protocol: 'rc-router-ingress-result-v1', receiptId: connectionId, status: 'recorded', acknowledgementAllowed: true,
    authorityGranted: false, legacyEffectsEnforced: false });
  const handler = createReceiptRouterHandler({ connection: config, persist });
  const response = await handler(request()); assert.equal(response.status, 503);
  const result = await response.json(); assert.equal(result.durable, true); assert.equal(result.legacyEffectsEnforced, false);
  assert.equal((await handler(request(body({ type: 'TEST' })))).status, 200);
  const bad = createReceiptRouterHandler({ connection: config, persist: async () => ({ ...await persist(), authorityGranted: true }) });
  assert.equal((await bad(request())).status, 503);
});
test('missing config/persistence failure is unavailable and no exception detail or payload escapes', async () => {
  assert.equal((await createReceiptRouterHandler({ connection: () => null, persist: async () => assert.fail() })(request())).status, 503);
  const response = await createReceiptRouterHandler({ connection: config, persist: async () => { throw Error('private-provider-body'); } })(request());
  assert.equal(response.status, 503); assert.ok(!(await response.text()).includes('private-provider-body'));
});
test('exclusive initial owner is only a candidate requiring atomic admitted-intent binding', () => {
  const plan = planner.planRevenueCatObservation(observe(body()), snapshot());
  assert.equal(plan.disposition, 'awaiting_binding'); assert.deepEqual(plan.owner, owner);
  assert.equal(plan.grantsAuthority, false); assert.equal(plan.providerDispatchAllowed, false); assert.equal(plan.legacyProjectionAllowed, false);
});
test('incomplete/colliding catalog and wrong app/environment never default-forward to legacy', () => {
  const incomplete = snapshot(); incomplete.coverage = 'incomplete';
  assert.equal(planner.planRevenueCatObservation(observe(body()), incomplete).reason, 'ownership_coverage_incomplete');
  const collision = snapshot(); collision.catalog.push({ ...collision.catalog[0], owner: { domain: 'legacy_creator', generation: 1 } });
  assert.equal(planner.planRevenueCatObservation(observe(body()), collision).reason, 'catalog_owner_missing_or_ambiguous');
  for (const patch of [{ app_id: 'different' }, { environment: 'PRODUCTION' }, { store: 'TEST_STORE' }])
    assert.equal(planner.planRevenueCatObservation(observe(body(patch)), snapshot()).reason, 'event_scope_missing_or_ambiguous');
});
test('productless terminal follows immutable original owner; mismatched buyer creates exact holds for both identities', () => {
  const s = bind(snapshot()), terminal = observe(body({ type: 'REFUND', product_id: null }));
  assert.equal(planner.planRevenueCatObservation(terminal, s).disposition, 'owner_candidate');
  assert.equal(planner.planRevenueCatObservation(terminal, snapshot()).reason, 'terminal_original_binding_missing');
  const mismatch = planner.planRevenueCatObservation({ ...terminal, userId: other }, s);
  assert.equal(mismatch.reason, 'original_identity_mismatch');
  assert.deepEqual(new Set(mismatch.holdTargets.map(h => h.subjectId)), new Set([buyer, other]));
});
test('productless transfer retains both sides and bound originals without source-Premium guessing or target grants', () => {
  const observation = observe(body({ type: 'TRANSFER', app_user_id: null, product_id: null, original_transaction_id: null,
    transaction_id: null, transferred_from: [buyer], transferred_to: [other] }));
  const plan = planner.planRevenueCatObservation(observation, bind(snapshot()));
  assert.equal(plan.disposition, 'reconciliation_required'); assert.equal(plan.owner, null);
  assert.deepEqual(new Set(plan.holdTargets.map(h => h.subjectId)), new Set([buyer, other]));
  assert.equal(plan.holdTargets.filter(h => h.originalTransactionId === 'fixture-original').length, 1);
  assert.equal(plan.acknowledgementAllowed, false); assert.equal(plan.grantsAuthority, false);
});
test('unscopable authenticated removal is unresolved rather than a fabricated global quarantine', () => {
  const p = planner.planRevenueCatObservation(observe(body({ type: 'TRANSFER', app_user_id: null, store: null,
    transferred_from: ['$RCAnonymousID:fixture'], transferred_to: [] })), snapshot());
  assert.equal(p.disposition, 'unresolved_scope'); assert.deepEqual(p.holdTargets, []); assert.equal(p.acknowledgementAllowed, false);
});
test('malformed transfer lists retain valid siblings, oversized identities and unsupported aliases as negative evidence', () => {
  const malformed=observe(body({type:'TRANSFER',transferred_from:[buyer,null],transferred_to:[other],transferredFrom:[intent]}));
  assert.equal(malformed.parseStatus,'invalid');assert.deepEqual(malformed.transferredFrom,[buyer,intent]);
  assert.deepEqual(new Set(planner.planRevenueCatObservation(malformed,snapshot()).holdTargets.map(t=>t.subjectId)),new Set([buyer,other,intent]));
  const many=Array.from({length:150},(_,i)=>`00000000-0000-4000-8000-${String(i).padStart(12,'0')}`);
  const large=observe(body({type:'TRANSFER',transferred_from:many,transferred_to:[other]}));
  assert.equal(large.parseStatus,'invalid');assert.deepEqual(large.transferredFrom,many);
  assert.equal(planner.planRevenueCatObservation(large,snapshot()).holdTargets.filter(t=>t.evidenceRole==='source').length,150);
});
