#!/usr/bin/env node
// Actual PostgreSQL source proof. Provider bodies, keys and qualification rows
// are synthetic local fixtures, never real RevenueCat or installed-device proof.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { randomUUID, webcrypto } from 'node:crypto';
import { fixtureApi } from './receipts.fixture.mjs';
import { BUYER, BUYER_SESSION, SELLER, SELLER_SESSION, sqlText, sqlJson, syntheticHash,
  installTestStoreSql, createTestStoreCluster } from './test-store.fixture.mjs';

globalThis.crypto ??= webcrypto;
assert.equal(process.argv.length, 4); assert.equal(process.argv[2], '--local-bin');
const bin = process.argv[3], here = path.dirname(fileURLToPath(import.meta.url));
const repo = path.resolve(here, '../../..'), shared = path.join(repo, 'supabase/functions/_shared');
const envelopePath = path.join(shared, 'revenuecat-router-envelope.ts');
const contractPath = path.join(shared, 'isolated-test-store-contract.ts');
const install = installTestStoreSql(here, [envelopePath, contractPath]);
const require = createRequire(import.meta.url), ts = require('typescript'), modules = new Map();
function load(file) {
  assert.ok([envelopePath, contractPath].includes(file), 'Unreviewed source import');
  if (modules.has(file)) return modules.get(file);
  const exports = {}; modules.set(file, exports);
  const javascript = ts.transpileModule(fs.readFileSync(file, 'utf8'),
    { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  new Function('exports', 'require', javascript)(exports, name => load(path.resolve(path.dirname(file), name)));
  return exports;
}
const transport = load(envelopePath), contract = load(contractPath);
const h = createTestStoreCluster(bin), q = h.q, api = fixtureApi(q, h.runQuery);
const connection = {
  connectionId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', connectionRevision: 1,
  projectId: 'synthetic-test-store-project', appId: 'synthetic-test-store-app',
  providerConfigurationDigest: syntheticHash('provider-configuration'),
  authentication: { method: 'shared_secret', keyVersion: 'synthetic-auth-v1', secret: 'Bearer ' + 'x'.repeat(40) },
  encryption: { keyId: 'synthetic-storage-v1', key: new Uint8Array(32).fill(11) },
};
const configurationDigest = syntheticHash('dedicated-native-profile');
const scopeKey = JSON.stringify(['revenuecat', connection.projectId, connection.appId, 'TEST_STORE', 'SANDBOX']);
const scope = { provider: 'revenuecat', providerScopeKey: scopeKey, store: 'test_store', sourceEnvironment: 'SANDBOX',
  semanticContract: 'rc_test_store_tip_v1', productId: 'fixture.isolated.test_store.tip', amountMinor: 199 };
const captures = [], cases = [];
let capture = false, report, primaryFailure, cleanupFailure, engine;
const startedAt = Date.now();
const service = expression => JSON.parse(q(api.servicePrefix + 'select ' + expression + ';'));
const expression = (command, payload, requestId = randomUUID(), actor = { userId: BUYER, sessionId: BUYER_SESSION }, digest = configurationDigest) =>
  `public.isolated_test_store_command_v1(${sqlText(actor.userId)},${sqlText(actor.sessionId)},${sqlText(command)},${sqlText(requestId)},${sqlText(digest)},${sqlJson(payload)})`;
function call(command, payload, requestId = randomUUID(), actor = { userId: BUYER, sessionId: BUYER_SESSION }, digest = configurationDigest) {
  const response = service(expression(command, payload, requestId, actor, digest));
  assert.equal(response.protocol, 'isolated-test-store-v1'); assert.equal(response.command, command);
  assert.equal(response.requestId, requestId); assert.deepEqual(response.actor, actor);
  assert.equal(response.environment, 'sandbox'); assert.equal(response.generation, 1);
  assert.equal(response.result.grantsAccess, false); assert.equal(response.result.notPayable, true);
  assert.equal(response.result.retryProviderMutation, false);
  if (capture) captures.push({ command, requestId, actor, configurationDigest: digest, payload, response });
  return response;
}
const actualQuote = intentId => JSON.parse(q(`select sandbox_commerce_v1.test_store_quote(i) from sandbox_commerce_v1.intents i where id=${sqlText(intentId.replace('scv1_intent_', ''))};`));
const allocate = context => call('allocate', { intentId: context.intent.id, expectedQuote: actualQuote(context.intent.id) });
const claim = context => call('claim', { intentId: context.intent.id, dispatchId: context.allocation.dispatchId,
  expectedQuote: actualQuote(context.intent.id) });
const read = context => call('read', { intentId: context.intent.id });
function prepare() {
  const context = api.prepare(scope);
  context.quote = actualQuote(context.intent.id);
  return context;
}
function ready() {
  const context = prepare(), allocated = allocate(context);
  assert.equal(allocated.result.status, 'allocated'); assert.equal(allocated.result.dispatchAllowed, false);
  context.allocation = allocated.result.allocation;
  assert.match(context.allocation.providerAppUserId, /^scv1_teststore_[a-f0-9-]{36}$/u);
  assert.notEqual(context.allocation.providerAppUserId, BUYER);
  assert.equal(context.allocation.providerScopeKey, scopeKey);
  assert.equal(context.allocation.economicApplicationId, `rc_test_store:${connection.projectId}:${connection.appId}`);
  assert.deepEqual(context.allocation.quote, context.quote);
  const claimed = claim(context); assert.equal(claimed.result.status, 'dispatch_claimed');
  assert.equal(claimed.result.dispatchAllowed, true);
  assert.ok(Date.parse(claimed.result.authorityValidUntil) > Date.now() - 1000);
  return context;
}
function event(context, patch = {}) {
  const millis = Number(q('select floor(extract(epoch from clock_timestamp())*1000)::bigint;')) + 2;
  const transaction = 'test_synthetic_' + randomUUID();
  return { id: randomUUID(), type: 'NON_RENEWING_PURCHASE', app_id: connection.appId, store: 'TEST_STORE', environment: 'SANDBOX',
    app_user_id: context.allocation.providerAppUserId, original_app_user_id: context.allocation.providerAppUserId, aliases: [],
    product_id: scope.productId, transaction_id: transaction, original_transaction_id: transaction,
    purchased_at_ms: millis, event_timestamp_ms: millis + 1, expiration_at_ms: null,
    price_in_purchased_currency: 1.99, currency: 'USD', quantity: 1, ...patch };
}
async function evidence(value, rawOverride) {
  const raw = rawOverride ?? JSON.stringify({ api_version: '1.0', event: value });
  const envelope = await transport.authenticateRevenueCatEnvelope(new Request('https://fixture.invalid/test-store', {
    method: 'POST', headers: { authorization: connection.authentication.secret }, body: raw,
  }), connection);
  const decrypted = await transport.decryptRouterEnvelope(envelope, connection);
  const observation = contract.parseTestStoreObservation(decrypted, connection);
  return { envelope, observation, raw };
}
const ingestEvidence = value => service(`public.isolated_test_store_ingest_v1(${sqlText(connection.connectionId)},1,${sqlJson(value.envelope)},${sqlJson(value.observation)})`);
const ingest = async (value, rawOverride) => ingestEvidence(await evidence(value, rawOverride));
const verifiedCount = () => Number(q("select count(*) from sandbox_commerce_v1.receipts where state='verified';"));
function seed() {
  q(`select authority_fixture.reset();
    insert into auth.users(id,email_confirmed_at,raw_app_meta_data) values('${BUYER}',clock_timestamp(),'{}');
    insert into auth.sessions values('${BUYER_SESSION}','${BUYER}',clock_timestamp()+interval '1 hour');
    insert into public.wave1_legal_acceptances select '${BUYER}','${BUYER_SESSION}',document_key,version,market,capability,'member',null
      from public.wave1_legal_document_versions where capability='account';
    update sandbox_commerce_v1.lifecycle set state='active';
    insert into sandbox_commerce_v1.test_store_connections(id,revision,project_id,app_id,provider_configuration_digest,
      auth_key_version,storage_key_id,scope_key,economic_application_id,qualified,ownership_evidence_sha256,delivery_evidence_sha256,lifecycle_evidence_sha256,refund_contract)
    values('${connection.connectionId}',1,${sqlText(connection.projectId)},${sqlText(connection.appId)},${sqlText(connection.providerConfigurationDigest)},
      '${connection.authentication.keyVersion}','${connection.encryption.keyId}',${sqlText(scopeKey)},${sqlText(`rc_test_store:${connection.projectId}:${connection.appId}`)},true,
      ${sqlText(syntheticHash('ownership'))},${sqlText(syntheticHash('delivery'))},${sqlText(syntheticHash('lifecycle'))},'cancellation_customer_support_full_tip_v1');
    insert into sandbox_commerce_v1.test_store_native_profiles(configuration_digest,connection_id,connection_revision,platform,application_id,
      public_sdk_key_sha256,storage_namespace,qualified,native_evidence_sha256)
    values(${sqlText(configurationDigest)},'${connection.connectionId}',1,'ios','fixture.dedicated.debug',${sqlText(syntheticHash('public-key'))},
      'fixture-dedicated-test-store',true,${sqlText(syntheticHash('native'))});
    update sandbox_commerce_v1.test_store_controls set connection_id='${connection.connectionId}',connection_revision=1,ingress_enabled=true,initiation_enabled=true;
    insert into sandbox_commerce_v1.provider_routes(provider,scope_key,store,source_environment,semantic_contract,qualification_state,
      ownership_evidence_sha256,delivery_evidence_sha256,adapter_evidence_sha256,initiation_enabled)
    values('revenuecat',${sqlText(scopeKey)},'test_store','SANDBOX','rc_test_store_tip_v1','qualified',
      ${sqlText(syntheticHash('ownership'))},${sqlText(syntheticHash('delivery'))},${sqlText(syntheticHash('adapter'))},true);
    insert into sandbox_commerce_v1.catalog values('${randomUUID()}','creator_tip','revenuecat',${sqlText(scopeKey)},'test_store',${sqlText(scope.productId)},199,'usd');`);
}
async function record(name, execute, seeded = true) {
  h.freshDatabase(); if (seeded) seed(); await execute();
  assert.equal(q('select count(*) from sandbox_commerce_v1.grants;'), '0', 'Tip flow cannot create access grants');
  assert.equal(q(`select count(*) from public.user_entitlements where user_id='${BUYER}';`), '0', 'Test Store cannot grant buyer Premium');
  assert.equal(q('select count(*) from sandbox_commerce_v1.test_store_call_context;'), '0', 'Private call context leaked after RPC');
  cases.push(name);
}

try {
  engine = h.start(install.sql);
  await record('Fresh installation has no qualified provider/native rows and all Test Store ingress/initiation disabled', () => {
    assert.equal(q('select ingress_enabled,initiation_enabled from sandbox_commerce_v1.test_store_controls;'), 'f|f');
    assert.equal(q('select count(*) from sandbox_commerce_v1.test_store_connections;'), '0');
    assert.equal(q('select count(*) from sandbox_commerce_v1.test_store_native_profiles;'), '0');
    assert.equal(q('select state from sandbox_commerce_v1.lifecycle;'), 'disabled');
  }, false);
  await record('Actual allocate/claim/report/read responses bind a free buyer and exact quote while SDK success remains pending', async () => {
    capture = true;
    const context = ready();
    assert.equal(read(context).result.status, 'pending');
    assert.equal(call('report', { intentId: context.intent.id, dispatchId: context.allocation.dispatchId,
      outcome: 'sdk_success', transactionHint: 'untrusted-callback-transaction' }).result.status, 'pending');
    assert.equal(verifiedCount(), 0);
    const purchase = event(context), result = await ingest(purchase);
    assert.equal(result.status, 'recorded'); assert.equal(result.authorityGranted, false);
    const settled = read(context); assert.equal(settled.result.status, 'verified');
    assert.equal(settled.result.receipt.providerTransactionId, purchase.transaction_id);
    assert.equal(settled.result.receipt.originalTransactionId, purchase.original_transaction_id);
    assert.equal(claim(context).result.dispatchAllowed, false);
    assert.equal(call('report', { intentId: context.intent.id, dispatchId: context.allocation.dispatchId,
      outcome: 'sdk_cancelled', transactionHint: null }).result.status, 'verified');
    capture = false;
  });
  await record('Webhook before native callback records durable exact tip truth and subsequent cancellation report cannot erase it', async () => {
    const context = ready(), purchase = event(context); await ingest(purchase);
    assert.equal(read(context).result.status, 'verified');
    for (const outcome of ['sdk_failed', 'sdk_unknown', 'sdk_cancelled', 'sdk_success']) {
      assert.equal(call('report', { intentId: context.intent.id, dispatchId: context.allocation.dispatchId, outcome, transactionHint: null }).result.status, 'verified');
    }
    assert.equal(verifiedCount(), 1);
  });
  await record('Concurrent same-SKU intents bind by distinct immutable opaque dispatch subjects, never a nearest candidate', async () => {
    const first = ready(), second = ready();
    assert.notEqual(first.allocation.providerAppUserId, second.allocation.providerAppUserId);
    const one = event(first), two = event(second); await ingest(two); await ingest(one);
    assert.equal(read(first).result.receipt.providerTransactionId, one.transaction_id);
    assert.equal(read(second).result.receipt.providerTransactionId, two.transaction_id);
    assert.equal(verifiedCount(), 2);
  });
  await record('Exact bytes may be delivered with fresh encryption without duplicating or conflicting with the first receipt', async () => {
    const context = ready(), purchase = event(context), first = await evidence(purchase), second = await evidence(purchase);
    assert.equal(first.envelope.rawSha256, second.envelope.rawSha256);
    assert.notEqual(first.envelope.encryption.nonce, second.envelope.encryption.nonce);
    assert.equal(ingestEvidence(first).status, 'recorded'); assert.equal(ingestEvidence(second).status, 'duplicate');
    assert.equal(q('select count(*) from sandbox_commerce_v1.test_store_ingress;'), '1');
    assert.equal(q('select count(*) from sandbox_commerce_v1.test_store_deliveries;'), '2');
    assert.equal(read(context).result.status, 'verified'); assert.equal(verifiedCount(), 1);
  });
  await record('Same provider event with different authenticated bytes preserves evidence and holds the existing receipt', async () => {
    const context = ready(), purchase = event(context); await ingest(purchase);
    const conflict = await ingest({ ...purchase, price_in_purchased_currency: 2.99 });
    assert.equal(conflict.status, 'conflict'); assert.equal(read(context).result.status, 'held');
    assert.equal(q('select count(*) from sandbox_commerce_v1.test_store_ingress;'), '2'); assert.equal(verifiedCount(), 0);
  });
  await record('Original ownership reused by another dispatch holds both the admitted owner and attempted new owner', async () => {
    const first = ready(), second = ready(), purchase = event(first); await ingest(purchase);
    await ingest(event(second, { original_transaction_id: purchase.original_transaction_id }));
    assert.equal(read(first).result.status, 'held'); assert.equal(read(second).result.status, 'held');
    assert.equal(q('select count(*) from sandbox_commerce_v1.receipts;'), '1'); assert.equal(verifiedCount(), 0);
  });
  await record('Contradictory original and transaction ownership holds both proven owners and the reported dispatch under one parent', async () => {
    const first = ready(), second = ready(), attempted = ready(), one = event(first), two = event(second);
    await ingest(one); await ingest(two); assert.equal(verifiedCount(), 2);
    const contradictory = event(attempted, { original_transaction_id: one.original_transaction_id, transaction_id: two.transaction_id });
    await ingest(contradictory);
    for (const context of [first, second, attempted]) assert.equal(read(context).result.status, 'held');
    assert.equal(q(`select count(distinct holds.dispatch_id) from sandbox_commerce_v1.test_store_holds holds
      join sandbox_commerce_v1.test_store_ingress parent on parent.id=holds.ingress_id
      where parent.provider_event_id=${sqlText(contradictory.id)} and not holds.scope_wide;`), '3');
    assert.equal(q(`select count(distinct holds.ingress_id) from sandbox_commerce_v1.test_store_holds holds
      join sandbox_commerce_v1.test_store_ingress parent on parent.id=holds.ingress_id
      where parent.provider_event_id=${sqlText(contradictory.id)};`), '1');
    assert.equal(q('select count(*) from sandbox_commerce_v1.receipts;'), '2');
    assert.equal(q(`select count(*) from sandbox_commerce_v1.receipts where intent_id=${sqlText(attempted.rawIntentId)};`), '0');
    assert.equal(verifiedCount(), 0);
  });
  await record('Qualified cancellation preserves provider event type, becomes monotonic refund and cannot be resurrected', async () => {
    const context = ready(), purchase = event(context); await ingest(purchase);
    await ingest({ ...purchase, id: randomUUID(), type: 'CANCELLATION', price_in_purchased_currency: -1.99,
      cancel_reason: 'CUSTOMER_SUPPORT', event_timestamp_ms: purchase.event_timestamp_ms + 1000 });
    assert.equal(read(context).result.status, 'refunded');
    assert.equal(q("select payload->>'providerEventType' from sandbox_commerce_v1.receipt_ingress where payload->>'eventType'='refund';"), 'CANCELLATION');
    await ingest({ ...purchase, id: randomUUID(), event_timestamp_ms: purchase.event_timestamp_ms + 2000 });
    assert.equal(read(context).result.status, 'refunded'); assert.equal(verifiedCount(), 0);
  });
  await record('Cancellation before purchase prevents later authenticated completion from creating verified truth', async () => {
    const context = ready(), purchase = event(context);
    await ingest({ ...purchase, id: randomUUID(), type: 'CANCELLATION', price_in_purchased_currency: -1.99,
      cancel_reason: 'CUSTOMER_SUPPORT', event_timestamp_ms: purchase.event_timestamp_ms + 1000 });
    await ingest(purchase); assert.equal(read(context).result.status, 'refunded'); assert.equal(verifiedCount(), 0);
  });
  await record('A productless transfer retains both opaque identities and holds only their isolated allocations', async () => {
    const first = ready(), second = ready(), unaffected = ready();
    await ingest({ id: randomUUID(), type: 'TRANSFER', event_timestamp_ms: Date.now(),
      transferred_from: [first.allocation.providerAppUserId], transferred_to: [second.allocation.providerAppUserId] });
    assert.equal(read(first).result.status, 'held'); assert.equal(read(second).result.status, 'held');
    assert.equal(read(unaffected).result.status, 'pending');
    assert.equal(q('select count(*) from sandbox_commerce_v1.test_store_holds where scope_wide;'), '0');
  });
  await record('Unscopable authenticated evidence pauses the dedicated project without inventing an Auth-user hold', async () => {
    const context = ready();
    await ingest(null, '{"api_version":"1.0","event":{"id":"duplicate-sensitive","type":"NON_RENEWING_PURCHASE","app_user_id":"a","app_user_id":"b"}}');
    assert.equal(read(context).result.status, 'held');
    assert.equal(q('select count(*) from sandbox_commerce_v1.test_store_holds where scope_wide and dispatch_id is null;'), '1');
    assert.equal(q(`select count(*) from public.user_entitlements where user_id='${BUYER}';`), '0');
  });
  await record('Missing event type and scope remain project-unresolved even when one opaque customer is known', async () => {
    const known = ready(), other = ready();
    const legacySnapshot = () => q(`select jsonb_build_object(
      'entitlements',(select coalesce(jsonb_agg(to_jsonb(e) order by to_jsonb(e)::text),'[]'::jsonb) from public.user_entitlements e),
      'grants',(select coalesce(jsonb_agg(to_jsonb(g) order by to_jsonb(g)::text),'[]'::jsonb) from public.access_grants g));`);
    const before = legacySnapshot();
    await ingest({ id: randomUUID(), event_timestamp_ms: Date.now(),
      app_user_id: known.allocation.providerAppUserId, original_app_user_id: known.allocation.providerAppUserId, aliases: [] });
    assert.equal(read(known).result.status, 'held'); assert.equal(read(other).result.status, 'held');
    assert.equal(q(`select count(*) from sandbox_commerce_v1.test_store_holds where project_id=${sqlText(connection.projectId)}
      and scope_wide and dispatch_id is null;`), '1');
    assert.equal(legacySnapshot(), before, 'Ambiguous Test Store evidence must not mutate legacy Premium or access grants');
    assert.equal(verifiedCount(), 0);
  });
  for (const [name, patch] of [
    ['live environment', { environment: 'PRODUCTION' }], ['Apple store alias', { store: 'APP_STORE' }],
    ['wrong app', { app_id: 'another-app' }], ['missing exact price', { price_in_purchased_currency: null }],
    ['merged dispatch aliases', { aliases: ['unowned-other-customer'] }], ['unknown lifecycle', { type: 'REFUND' }],
    ['nonrefund cancellation reason', { type: 'CANCELLATION', price_in_purchased_currency: -1.99, cancel_reason: 'UNSUBSCRIBE' }],
  ]) await record(`Authenticated ${name} cannot project a positive tip and remains durably held`, async () => {
    const context = ready(); await ingest(event(context, patch));
    assert.equal(read(context).result.status, 'held'); assert.equal(verifiedCount(), 0);
    assert.equal(q('select count(*) from sandbox_commerce_v1.test_store_ingress;'), '1');
  });
  await record('Direct generic dispatch/normalized receipt APIs cannot bypass the private authenticated Test Store source frame', () => {
    const context = prepare(); context.allocation = allocate(context).result.allocation;
    h.rejects(api.servicePrefix + `select public.isolated_sandbox_begin_dispatch_v1(${sqlText(context.intent.id)},${sqlText(context.allocation.dispatchId)});`, /sandbox_test_store_dispatch_source_required/u);
    claim(context);
    const forged = api.receipt({ ...context, dispatchId: context.allocation.dispatchId }, {
      buyerId: BUYER, intentId: context.rawIntentId, dispatchId: context.allocation.dispatchId,
    });
    h.rejects(api.servicePrefix + `select public.isolated_sandbox_ingest_receipt_v1(${sqlJson(forged)});`, /sandbox_test_store_receipt_source_required/u);
    assert.equal(verifiedCount(), 0);
  });
  await record('One-use claim replay and all SDK-only outcomes remain pending without a second dispatch capability', () => {
    const context = prepare(); context.allocation = allocate(context).result.allocation;
    const request = randomUUID(), payload = { intentId: context.intent.id, dispatchId: context.allocation.dispatchId, expectedQuote: context.quote };
    assert.equal(call('claim', payload, request).result.dispatchAllowed, true);
    assert.equal(call('claim', payload, request).result.dispatchAllowed, false);
    assert.equal(call('claim', payload).result.dispatchAllowed, false);
    for (const outcome of ['sdk_cancelled', 'sdk_failed', 'sdk_unknown', 'sdk_success'])
      assert.equal(call('report', { intentId: context.intent.id, dispatchId: context.allocation.dispatchId, outcome, transactionHint: null }).result.status, 'pending');
    assert.equal(q('select count(*) from sandbox_commerce_v1.dispatch_attempts;'), '1'); assert.equal(verifiedCount(), 0);
  });
  await record('Exact buyer, original session, immutable quote, native profile and request identity are enforced', () => {
    const context = prepare(), quote = context.quote;
    const request = randomUUID(), payload = { intentId: context.intent.id, expectedQuote: quote };
    context.allocation = call('allocate', payload, request).result.allocation;
    const badCalls = [
      expression('allocate', { ...payload, expectedQuote: { ...quote, amountMinor: 100 } }),
      expression('allocate', payload, randomUUID(), { userId: SELLER, sessionId: SELLER_SESSION }),
      expression('claim', { intentId: context.intent.id, dispatchId: randomUUID(), expectedQuote: quote }),
      expression('read', { intentId: context.intent.id }, randomUUID(), undefined, syntheticHash('foreign-profile')),
      expression('read', { intentId: context.intent.id }, request),
    ];
    for (const callSql of badCalls) h.rejects(api.servicePrefix + 'select ' + callSql + ';', /test_store|sandbox/u);
    const newSession = randomUUID(); q(`insert into auth.sessions values('${newSession}','${BUYER}',clock_timestamp()+interval '1 hour');
      insert into public.wave1_legal_acceptances select '${BUYER}','${newSession}',document_key,version,market,capability,'member',null
      from public.wave1_legal_document_versions where capability='account';`);
    h.rejects(api.servicePrefix + 'select ' + expression('claim', { intentId: context.intent.id, dispatchId: context.allocation.dispatchId,
      expectedQuote: quote }, randomUUID(), { userId: BUYER, sessionId: newSession }) + ';', /test_store_original_session_required/u);
    assert.equal(call('read', { intentId: context.intent.id }, randomUUID(), { userId: BUYER, sessionId: newSession }).result.status, 'allocated');
  });
  await record('Disabled ingress/initiation and retired lifecycle prevent new dispatch while original outcome can still be read', async () => {
    const context = prepare(); context.allocation = allocate(context).result.allocation;
    q('update sandbox_commerce_v1.test_store_controls set initiation_enabled=false;');
    assert.equal(claim(context).result.dispatchAllowed, false);
    q('update sandbox_commerce_v1.test_store_controls set ingress_enabled=false;');
    const e = await evidence(event(context));
    h.rejects(api.servicePrefix + `select public.isolated_test_store_ingest_v1('${connection.connectionId}',1,${sqlJson(e.envelope)},${sqlJson(e.observation)});`, /test_store_ingress_disabled/u);
    q("update sandbox_commerce_v1.lifecycle set state='retired';");
    assert.equal(read(context).result.dispatchAllowed, false);
    assert.equal(q('select count(*) from sandbox_commerce_v1.dispatch_attempts;'), '0');
  });
  await record('Previously admitted receipt completes after seller Premium expiry and generation retirement without new authority', async () => {
    const context = ready(), purchase = event(context);
    q("update public.user_entitlements set expires_at=clock_timestamp()-interval '1 day';update public.access_grants set expires_at=clock_timestamp()-interval '1 day';update sandbox_commerce_v1.lifecycle set state='retired';");
    await ingest(purchase); assert.equal(read(context).result.status, 'verified'); assert.equal(verifiedCount(), 1);
  });
  await record('Provider purchase outside the immutable admitted window remains held', async () => {
    const context = ready(), purchase = event(context);
    await ingest({ ...purchase, purchased_at_ms: purchase.purchased_at_ms - 3600000 });
    assert.equal(read(context).result.status, 'held'); assert.equal(verifiedCount(), 0);
  });
  await record('Concurrent own takedown/ingress locks fail without waiting and leave no partially claimed dispatch', async () => {
    const context = prepare(); context.allocation = allocate(context).result.allocation;
    const writer = await h.held(`begin;update sandbox_commerce_v1.resources set status='quarantined' where id='${context.resource.id.replace('scv1_resource_', '')}';`);
    try { h.rejects(api.servicePrefix + 'select ' + expression('claim', { intentId: context.intent.id,
      dispatchId: context.allocation.dispatchId, expectedQuote: context.quote }) + ';', /could not obtain lock/u); }
    finally { await writer.finish('rollback'); }
    assert.equal(q('select count(*) from sandbox_commerce_v1.dispatch_attempts;'), '0');
    claim(context);
    const reader = await h.held('begin;lock table sandbox_commerce_v1.test_store_holds in share mode;');
    try { const e = await evidence(event(context)); h.rejects(api.servicePrefix + `select public.isolated_test_store_ingest_v1('${connection.connectionId}',1,${sqlJson(e.envelope)},${sqlJson(e.observation)});`, /could not obtain lock/u); }
    finally { await reader.finish('rollback'); }
    assert.equal(q('select count(*) from sandbox_commerce_v1.test_store_ingress;'), '0');
  });
  await record('Authority expiry during final request persistence rolls back the dispatch before the outer transaction cap', () => {
    const context = prepare(); context.allocation = allocate(context).result.allocation;
    q(`create function authority_fixture.delay_test_store_request() returns trigger language plpgsql as $$begin perform pg_sleep(1.5);return new;end$$;
      create trigger fixture_request_delay before insert on sandbox_commerce_v1.test_store_requests
      for each row execute function authority_fixture.delay_test_store_request();
      update auth.sessions set not_after=clock_timestamp()+interval '1 second' where id='${BUYER_SESSION}';`);
    const started = Date.now();
    const rejected = h.rejects(api.servicePrefix + 'select ' + expression('claim', { intentId: context.intent.id,
      dispatchId: context.allocation.dispatchId, expectedQuote: context.quote }) + ';', /sandbox_authority_expired|test_store_dispatch_lease_expired/u);
    assert.doesNotMatch(rejected.stderr, /transaction timeout/u);
    assert.ok(Date.now() - started >= 1200 && Date.now() - started < 4500, 'Missed the bounded authority-before-transaction-cap schedule');
    assert.equal(q('select count(*) from sandbox_commerce_v1.dispatch_attempts;'), '0');
    assert.equal(q("select state from sandbox_commerce_v1.intents;"), 'prepared');
  });
  await record('Runtime roles cannot access private provider evidence, spoof service execution or mutate immutable source bindings', () => {
    const context = ready();
    for (const role of ['anon', 'authenticated']) {
      h.rejects(`set role ${role};set request.jwt.claims='{"role":"service_role"}';select ${expression('read', { intentId: context.intent.id })};`, /permission denied/u);
    }
    for (const role of ['anon', 'authenticated', 'service_role'])
      h.rejects(`set role ${role};select * from sandbox_commerce_v1.test_store_allocations;`, /permission denied/u);
    h.rejects(`set role service_role;set request.jwt.claims='{"role":"authenticated"}';select ${expression('read', { intentId: context.intent.id })};`, /sandbox_provider_service_required/u);
    h.rejects("update sandbox_commerce_v1.test_store_connections set project_id='different';", /sandbox_test_store_evidence_immutable/u);
    h.rejects('truncate sandbox_commerce_v1.test_store_allocations cascade;', /sandbox_test_store_evidence_immutable/u);
    assert.equal(q("select count(*) from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='sandbox_commerce_v1' and c.relkind='r' and (not c.relrowsecurity or not c.relforcerowsecurity);"), '0');
  });
  install.assertUnchanged();
  report = { status: 'passed', kind: 'isolated-test-store-native-source-proof', engine, caseCount: cases.length, cases,
    sourceHashes: install.sourceHashes, fixtureAdaptation: install.fixtureAdaptation,
    syntheticProviderEvidence: true, actualProviderAuthenticationProven: false, actualDeviceBehaviorProven: false,
    providerOrProductionCalls: false, durationMs: Date.now() - startedAt };
} catch (error) { primaryFailure = error; h.captureFailure(); }
finally { try { await h.close(); } catch (error) { cleanupFailure = error; } }
if (primaryFailure || cleanupFailure) {
  process.stderr.write('TEST_STORE_NATIVE_DIAGNOSTICS ' + JSON.stringify(h.diagnostics(primaryFailure, cleanupFailure)) + '\n');
  throw primaryFailure ?? cleanupFailure;
}
assert.ok(report); assert.ok(cases.length > 0); assert.ok(Object.values(h.cleanup).every(Boolean));
if (process.env.ISOLATED_TEST_STORE_FIXTURE) {
  assert.ok(path.isAbsolute(process.env.ISOLATED_TEST_STORE_FIXTURE), 'Capture destination must be an explicit absolute path');
  fs.writeFileSync(process.env.ISOLATED_TEST_STORE_FIXTURE, JSON.stringify({ protocol: 'isolated-test-store-v1', cases: captures }, null, 2) + '\n');
}
console.log(JSON.stringify({ ...report, cleanup: h.cleanup }, null, 2));
