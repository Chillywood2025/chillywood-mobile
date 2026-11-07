#!/usr/bin/env node
// Actual local PostgreSQL schedules only. Synthetic provider authentication and
// readback fixtures do not qualify RevenueCat, a device, or a deployment target.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { Buffer } from 'node:buffer';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomUUID, webcrypto } from 'node:crypto';
import { fixtureApi } from './receipts.fixture.mjs';
import { BUYER, BUYER_SESSION, SELLER, SELLER_SESSION, createTestStoreCluster, installTestStoreV2Sql, createV2CommandApi,
  seedV2Qualified, seedV2Authority, legacyAuthoritySnapshot, V2_FIXTURE, v2Scope, sqlText, sqlJson, createV2SourceLoader,
  qualificationSources, createQualificationFixture } from './test-store-v2.fixture.mjs';
import { providerSources, createV2ProviderFixture } from './test-store-v2-provider.fixture.mjs';
import { receiptSources, createV2ReceiptFixture } from './test-store-v2-receipts.fixture.mjs';

globalThis.crypto ??= webcrypto;
assert.equal(process.argv.length, 4); assert.equal(process.argv[2], '--local-bin');
const here = path.dirname(fileURLToPath(import.meta.url)), bin = process.argv[3], repo = path.resolve(here, '../../..');
const dependencies = [...providerSources(repo), ...receiptSources(repo), ...qualificationSources(repo), path.join(here, 'test-store-v2-receipts.fixture.mjs')];
const install = installTestStoreV2Sql(here, dependencies), h = createTestStoreCluster(bin), q = h.q;
const api = createV2CommandApi(q), core = fixtureApi(q, h.runQuery), cases = [], startedAt = Date.now();
const provider = createV2ProviderFixture(q, repo, createV2SourceLoader(dependencies));
const receipts = createV2ReceiptFixture(q, api, repo), coreCases = [], checkoutCases = [];
const qualification = createQualificationFixture(q, repo, createV2SourceLoader(dependencies));
let captureCore = false;
let report, primaryFailure, cleanupFailure, engine;
const coreExpression = (command, payload, entry, requestId, actor = { userId: BUYER, sessionId: BUYER_SESSION }) => {
  const fullPayload = { protocol: 'sandbox-commerce-v1', requestId, ...payload };
  const role = `set role authenticated;set request.jwt.claims=${sqlText(JSON.stringify({ role: 'authenticated', sub: actor.userId, session_id: actor.sessionId }))};`;
  return role + `select public.${entry === 'history' ? 'isolated_sandbox_tips_v1' : 'isolated_sandbox_commerce_v1'}(`
    + `${sqlText(command)},${sqlJson(fullPayload)},${sqlText(actor.userId)},${sqlText(actor.sessionId)});`;
};
const coreCall = (command, payload, entry = 'history', requestId = randomUUID()) => {
  const actor = { userId: BUYER, sessionId: BUYER_SESSION };
  const response = JSON.parse(q(coreExpression(command, payload, entry, requestId, actor)));
  assert.equal(response.command, command); assert.equal(response.requestId, requestId);
  assert.equal(response.actor.userId, BUYER); assert.equal(response.actor.sessionGeneration, BUYER_SESSION);
  if (captureCore) coreCases.push({ command, requestId, actor, payload: { protocol: 'sandbox-commerce-v1', requestId, ...payload }, response });
  return response;
};
const prepare = () => {
  const resource = core.command('resource.create', { kind: 'creator_tip', title: 'Synthetic v2 provider tip' }, SELLER, SELLER_SESSION).data.resource;
  const offer = core.command('offer.publish', { resourceId: resource.id, expectedRevision: resource.revision,
    amountMinor: V2_FIXTURE.amountMinor, currency: 'usd' }, SELLER, SELLER_SESSION).data.offer;
  const shown = coreCall('offer.read', { offerId: offer.id }).data.offer;
  const quote = { offerId: shown.id, offerRevision: shown.revision, resourceId: shown.resourceId,
    resourceRevision: shown.resourceRevision, creatorId: shown.creatorId, kind: shown.kind, amountMinor: shown.amountMinor, currency: shown.currency };
  const requestId = randomUUID(), payload = { offerId: offer.id, expectedRevision: offer.revision };
  const response = coreCall('checkout.prepare', payload, 'commerce', requestId), intent = response.data.intent;
  const recovery = coreCall('request.read', { originalRequestId: requestId });
  assert.equal(intent.status, 'prepared'); assert.equal(intent.providerDispatchAllowed, false);
  const context = { ...v2Scope(), resource, offer, intent, quote, originalRequestId: requestId, rawIntentId: intent.id.replace('scv1_intent_', '') };
  assert.deepEqual(quote, JSON.parse(q(`select sandbox_commerce_v1.test_store_quote(i) from sandbox_commerce_v1.intents i where id='${context.rawIntentId}';`)));
  if (captureCore) checkoutCases.push({ command: 'checkout.prepare', actor: { userId: BUYER, accountId: BUYER, sessionGeneration: BUYER_SESSION, restoreOnly: false },
    quote, requestId, payload, response, recovery: { requestId: recovery.requestId, response: recovery } });
  return context;
};
const bind = (installationId = randomUUID()) => api.call('bind', { installationId }).result;
const allocatePayload = (customer, context) => ({ customerBindingId: customer.id, intentId: context.intent.id, expectedQuote: context.quote });
const allocate = (customer, context = prepare(), requestId = randomUUID()) => {
  const response = api.call('allocate', allocatePayload(customer, context), requestId);
  assert.equal(response.result.status, 'provisioning'); assert.equal(response.result.dispatchAllowed, false);
  context.customer = response.result.customer; context.allocation = response.result.allocation;
  context.reservation = response.result.reservation;
  assert.equal(context.allocation.registration, null); assert.deepEqual(context.allocation.quote, context.quote);
  assert.equal(context.reservation.activeAllocationId, context.allocation.id);
  return context;
};
const read = context => api.call('read', { intentId: context.intent.id });
const register = async context => {
  await provider.registerPlan(context.allocation);
  const current = read(context).result;
  assert.equal(current.status, 'offering_ready'); assert.ok(current.allocation.registration);
  context.allocation = current.allocation; context.customer = current.customer; context.reservation = current.reservation;
  return context;
};
const claim = (context, requestId = randomUUID()) => {
  const result = api.call('claim', { intentId: context.intent.id, dispatchId: context.allocation.dispatchId,
    registrationId: context.allocation.registration.id, expectedQuote: context.quote }, requestId);
  if (result.result.dispatchAllowed) context.claim = result.result;
  return result;
};
const awaitLease = context => {
  const seconds = Number(q(`select greatest(0,extract(epoch from (${sqlText(context.claim.authorityValidUntil)}::timestamptz-clock_timestamp())));`));
  assert.ok(Number.isFinite(seconds) && seconds <= 5, 'Dispatch lease exceeded the bounded contract');
  q(`select pg_sleep(${seconds + 0.02});`);
};
const rejectCommand = (command, payload, pattern, requestId = randomUUID(), actor, digest) =>
  h.rejects(api.servicePrefix + 'select ' + api.expression(command, payload, requestId, actor, digest) + ';', pattern);
const claimed = async () => {
  const context = await register(allocate(bind().customer));
  assert.equal(claim(context).result.dispatchAllowed, true); return context;
};
const purchase = async context => {
  const value = receipts.event(context), result = await receipts.ingest(value);
  assert.equal(receipts.effect(result.receiptId).projection.state, 'verified');
  assert.equal(read(context).result.status, 'verified'); context.purchase = value; return value;
};
const assertHeld = (...contexts) => {
  for (const context of contexts) assert.equal(read(context).result.status, 'held');
};
const release = (context, disposition = 'retain_unknown') => {
  const current = read(context).result;
  return api.call('advance', { intentId: context.intent.id, dispatchId: context.allocation.dispatchId,
    expectedReservationRevision: current.reservation.revision, disposition,
    expectedReceiptId: disposition === 'receipt_recorded' ? current.receipt.id : null });
};
const assertNoReceipt = context => assert.equal(q(`select count(*) from sandbox_commerce_v1.receipts where intent_id='${context.rawIntentId}';`), '0');
const cancellation = (context, initial, patch = {}) => receipts.event(context, { ...initial, id: randomUUID(),
  type: 'CANCELLATION', cancel_reason: 'CUSTOMER_SUPPORT', price_in_purchased_currency: -1.99,
  event_timestamp_ms: initial.event_timestamp_ms + 10, ...patch });
const seedQualification = () => {
  const c = qualification.connection;
  q(`insert into sandbox_commerce_v1.test_store_qualification_connections values('${c.connectionId}',1,
    ${sqlText(c.projectId)},${sqlText(c.appId)},${sqlText(c.authentication.keyVersion)},${sqlText(c.encryption.keyId)});`);
};
const qualificationTransition = (phase, caps = { entries: 32, deliveries: 64, bytes: 1048576 }) => JSON.parse(q(
  'set role sbx_v1_operator;select sandbox_commerce_v1.test_store_qualification_transition('
  + (phase === 'capturing' ? `${sqlText(phase)},'${qualification.connection.connectionId}',1,${caps.entries},${caps.deliveries},${caps.bytes}` : sqlText(phase)) + ');'));
const qualificationGate = (raw = null, event = null, original = null, transaction = null, customer = null, project = V2_FIXTURE.projectId) =>
  q('select sandbox_commerce_v1.test_store_qualification_gate(' + [project, raw, event, original, transaction, customer]
    .map(value => value === null ? 'null' : sqlText(value)).join(',') + ');');
const qualificationEvent = (patch = {}) => {
  const customer = `scv2_teststore_${randomUUID()}`, transaction = `qualification-${randomUUID()}`;
  return { id: randomUUID(), type: 'NON_RENEWING_PURCHASE', app_id: V2_FIXTURE.appId,
    store: 'TEST_STORE', environment: 'SANDBOX', app_user_id: customer, original_app_user_id: customer,
    aliases: [], product_id: V2_FIXTURE.productId, transaction_id: transaction, original_transaction_id: transaction,
    event_timestamp_ms: Date.now(), ...patch };
};
const assertNoEconomics = () => {
  for (const table of ['intents', 'dispatch_attempts', 'receipts', 'grants', 'test_store_v2_customers', 'test_store_v2_plans',
    'test_store_v2_customer_candidates', 'test_store_v2_tickets', 'test_store_v2_registrations', 'test_store_v2_original_bindings']) {
    assert.equal(q(`select count(*) from sandbox_commerce_v1.${table};`), '0', 'Qualification wrote economic table ' + table);
  }
};
async function record(name, execute, seeded = false, prepareFixture = null) {
  h.freshDatabase(); provider.reset(); if (seeded) seedV2Qualified(q);
  if (prepareFixture) prepareFixture(q);
  const legacyBefore = legacyAuthoritySnapshot(q);
  await execute();
  assert.equal(legacyAuthoritySnapshot(q), legacyBefore, 'V2 changed legacy Premium/access authority');
  assert.equal(q('select count(*) from sandbox_commerce_v1.grants;'), '0', 'Tips cannot create access grants');
  assert.equal(q(`select count(*) from public.user_entitlements where user_id='${BUYER}';`), '0', 'Free buyer gained Premium');
  assert.equal(q('select count(*) from sandbox_commerce_v1.test_store_allocations;'), '0', 'V2 must not plant a v1 allocation');
  assert.equal(q('select count(*) from sandbox_commerce_v1.test_store_call_context;'), '0', 'V2 must not leak v1 call context');
  cases.push(name);
  process.stderr.write(`V2_NATIVE_CASE ${cases.length}: ${name}\n`);
}

try {
  engine = h.start(install.sql);
  await record('Additive installation preserves empty v1 history and a disabled lifecycle', () => {
    assert.equal(q('select state from sandbox_commerce_v1.lifecycle;'), 'disabled');
    assert.equal(q('select ingress_enabled,initiation_enabled from sandbox_commerce_v1.test_store_controls;'), 'f|f');
    assert.equal(q('select count(*) from sandbox_commerce_v1.test_store_connections;'), '0');
  });
  await record('Every additive v2 table forces RLS and denies direct runtime table access', () => {
    const names = JSON.parse(q("select coalesce(jsonb_agg(c.relname order by c.relname),'[]'::jsonb) from pg_class c"
      + " join pg_namespace n on n.oid=c.relnamespace where n.nspname='sandbox_commerce_v1'"
      + " and c.relkind='r' and c.relname like 'test_store_v2_%';"));
    assert.ok(names.length > 0, 'No actual v2 tables were installed');
    assert.equal(q("select count(*) from pg_class c join pg_namespace n on n.oid=c.relnamespace"
      + " where n.nspname='sandbox_commerce_v1' and c.relkind='r' and c.relname like 'test_store_v2_%'"
      + ' and (not c.relrowsecurity or not c.relforcerowsecurity);'), '0');
    for (const name of names) {
      assert.match(name, /^test_store_v2_[a-z_]+$/u);
      for (const role of ['anon', 'authenticated', 'service_role']) {
        h.rejects(`set role ${role};select * from sandbox_commerce_v1.${name};`, /permission denied/u);
      }
    }
  });
  await record('Actual command boundary cannot be called through a spoofed service claim by public runtime actors', () => {
    const expression = api.expression('bind', { installationId: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc' });
    for (const role of ['anon', 'authenticated']) {
      h.rejects(`set role ${role};set request.jwt.claims='{"role":"service_role"}';select ${expression};`, /permission denied/u);
    }
  });
  await record('Stable customer bind is immutable across requests and cannot switch the installation to another buyer', () => {
    const installationId = randomUUID(), requestId = randomUUID();
    const first = api.call('bind', { installationId }, requestId).result;
    assert.equal(first.status, 'customer_bound'); assert.equal(first.allocation, null);
    assert.equal(first.reservation.activeAllocationId, null); assert.equal(first.reservation.revision, 1);
    assert.match(first.customer.id, /^scv2_customer_[a-f0-9-]{36}$/u);
    assert.match(first.customer.providerAppUserId, /^scv2_teststore_[a-f0-9-]{36}$/u);
    assert.equal(first.customer.buyerId, BUYER); assert.equal(first.customer.installationId, installationId);
    assert.deepEqual(api.call('bind', { installationId }, requestId).result.customer, first.customer);
    assert.deepEqual(bind(installationId).customer, first.customer);
    rejectCommand('bind', { installationId }, /test_store_v2_installation_immutable/u, randomUUID(), { userId: SELLER, sessionId: SELLER_SESSION });
    assert.equal(q('select count(*) from sandbox_commerce_v1.test_store_v2_customers;'), '1');
    assert.equal(q('select count(*) from sandbox_commerce_v1.test_store_v2_tickets;'), '0');
  }, true);
  await record('Binding rejects caller-selected provider identities and same-request content changes', () => {
    const installationId = randomUUID(), requestId = randomUUID(); api.call('bind', { installationId }, requestId);
    rejectCommand('bind', { installationId, providerAppUserId: `scv2_teststore_${randomUUID()}` }, /test_store_v2_command_shape_invalid/u);
    rejectCommand('bind', { installationId: randomUUID() }, /test_store_v2_request_conflict/u, requestId);
    rejectCommand('bind', { installationId: null }, /test_store_v2_installation_invalid/u);
    assert.equal(q('select count(*) from sandbox_commerce_v1.test_store_v2_customers;'), '1');
  }, true);
  await record('Actual admitted quote creates one immutable Offering plan and an occupied reservation', () => {
    const customer = bind().customer, context = prepare(), requestId = randomUUID();
    rejectCommand('allocate', { ...allocatePayload(customer, context), expectedQuote: { ...context.quote, amountMinor: 200 } }, /test_store_v2_quote_conflict/u);
    assert.equal(q('select count(*) from sandbox_commerce_v1.test_store_v2_allocations;'), '0');
    allocate(customer, context, requestId);
    assert.deepEqual(api.call('allocate', allocatePayload(customer, context), requestId).result.allocation, context.allocation);
    assert.deepEqual(bind(customer.installationId).allocation, context.allocation);
    rejectCommand('allocate', allocatePayload(customer, prepare()), /test_store_v2_reservation_occupied/u);
    assert.equal(q('select count(*) from sandbox_commerce_v1.test_store_v2_plans;'), '1');
    assert.equal(q('select count(*) from sandbox_commerce_v1.test_store_v2_registrations;'), '0');
    assert.equal(q('select count(*) from sandbox_commerce_v1.dispatch_attempts;'), '0');
  }, true);
  await record('A held reservation lock refuses allocation without waiting or partial plan creation', async () => {
    const customer = bind().customer, context = prepare(), customerId = customer.id.replace('scv2_customer_', '');
    const writer = await h.held(`begin;update sandbox_commerce_v1.test_store_v2_reservations set revision=revision where customer_id='${customerId}';`);
    try { rejectCommand('allocate', allocatePayload(customer, context), /could not obtain lock/u); }
    finally { await writer.finish('rollback'); }
    assert.equal(q('select count(*) from sandbox_commerce_v1.test_store_v2_plans;'), '0');
    allocate(customer, context);
  }, true);
  await record('Explicit unclaimed release preserves the first plan and replay cannot release a newer reservation', () => {
    const customer = bind().customer, first = allocate(customer), requestId = randomUUID();
    const payload = { intentId: first.intent.id, dispatchId: first.allocation.dispatchId,
      expectedReservationRevision: first.reservation.revision, disposition: 'retain_unknown', expectedReceiptId: null };
    const released = api.call('advance', payload, requestId).result;
    assert.equal(released.status, 'released'); assert.equal(released.reservation.activeAllocationId, null);
    assert.equal(released.reservation.revision, first.reservation.revision + 1); assert.equal(read(first).result.status, 'expired');
    const second = allocate(customer); assert.notEqual(second.allocation.id, first.allocation.id);
    const replay = api.call('advance', payload, requestId).result;
    assert.equal(replay.reservation.activeAllocationId, second.allocation.id);
    assert.equal(replay.reservation.revision, second.reservation.revision);
    assert.equal(q('select count(*) from sandbox_commerce_v1.test_store_v2_releases;'), '1');
    assert.equal(q('select count(distinct offering_lookup_key) from sandbox_commerce_v1.test_store_v2_plans;'), '2');
    assert.equal(q('select count(distinct provider_app_user_id) from sandbox_commerce_v1.test_store_v2_customers;'), '1');
  }, true);
  await record('Retirement preserves exact buyer history while blocking new customer binding and new allocation', () => {
    const customer = bind().customer, context = allocate(customer);
    q("update sandbox_commerce_v1.lifecycle set state='retired';update sandbox_commerce_v1.test_store_v2_controls set initiation_enabled=false;");
    assert.equal(bind(customer.installationId).allocation.id, context.allocation.id);
    assert.equal(read(context).result.dispatchAllowed, false);
    rejectCommand('bind', { installationId: randomUUID() }, /sandbox_generation_inactive/u);
  }, true);
  await record('A fresh current session may read history but cannot claim the original session allocation', () => {
    const context = allocate(bind().customer), session = randomUUID();
    q(`insert into auth.sessions values('${session}','${BUYER}',clock_timestamp()+interval '1 hour');
      insert into public.wave1_legal_acceptances select user_id,'${session}',document_key,document_version,market,capability,role_key,invalidated_at
      from public.wave1_legal_acceptances where user_id='${BUYER}' and session_generation='${BUYER_SESSION}';`);
    const currentActor = { userId: BUYER, sessionId: session };
    const recovered = api.call('read', { intentId: context.intent.id }, randomUUID(), currentActor);
    assert.equal(recovered.result.allocation.id, context.allocation.id); assert.equal(recovered.result.dispatchAllowed, false);
    rejectCommand('claim', { intentId: context.intent.id, dispatchId: context.allocation.dispatchId,
      registrationId: `scv2_registration_${randomUUID()}`, expectedQuote: context.quote }, /test_store_v2_original_session_required/u, randomUUID(), currentActor);
  }, true);
  await record('V2 rejects a dedicated project already owned by a v1 connection', () => {
    q(`insert into sandbox_commerce_v1.test_store_connections(id,revision,project_id,app_id,scope_key,economic_application_id,
      provider_configuration_digest,auth_key_version,storage_key_id)
      values('${randomUUID()}',1,${sqlText(V2_FIXTURE.projectId)},${sqlText(V2_FIXTURE.appId)},${sqlText(v2Scope().providerScopeKey)},
        ${sqlText(`rc_test_store:${V2_FIXTURE.projectId}:${V2_FIXTURE.appId}`)},${sqlText(V2_FIXTURE.providerConfigurationDigest)},'synthetic-v1','synthetic-v1');`);
    rejectCommand('bind', { installationId: randomUUID() }, /test_store_v2_project_has_v1_owner/u);
    assert.equal(q('select count(*) from sandbox_commerce_v1.test_store_v2_customers;'), '0');
  }, true);
  await record('Two actual same-customer Offering cycles preserve raw receipt ownership and core noDispatch truth', async () => {
    api.capture(true); captureCore = true;
    const customer = bind().customer, contexts = [];
    for (let cycle = 0; cycle < 2; cycle++) {
      const context = await register(allocate(customer)); contexts.push(context);
      const claimRequest = randomUUID();
      assert.equal(claim(context, claimRequest).result.dispatchAllowed, true);
      const replayed = claim(context, claimRequest).result;
      assert.equal(replayed.dispatchAllowed, false); assert.equal(replayed.status, 'pending');
      h.rejects(coreExpression('checkout.abandon', { intentId: context.intent.id, originalRequestId: context.originalRequestId },
        'history', randomUUID()), /sandbox_undispatched_abandonment_unavailable/u);
      assert.equal(q(`select count(*) from sandbox_commerce_v1.intent_abandonments where intent_id='${context.rawIntentId}';`), '0');
      const pending = read(context).result; assert.equal(pending.status, 'pending');
      assert.equal(api.call('report', { intentId: context.intent.id, dispatchId: context.allocation.dispatchId,
        outcome: 'sdk_success', transactionHint: 'untrusted-v2-callback' }).result.status, 'pending');
      const purchase = receipts.event(context); context.purchase = purchase;
      const ingested = await receipts.ingest(purchase); assert.equal(ingested.durable, true); assert.equal(ingested.authorityGranted, false);
      const settled = read(context).result; assert.equal(settled.status, 'verified');
      assert.equal(settled.receipt.providerTransactionId, purchase.transaction_id);
      assert.equal(settled.receipt.originalTransactionId, purchase.original_transaction_id);
      awaitLease(context);
      const released = api.call('advance', { intentId: context.intent.id, dispatchId: context.allocation.dispatchId,
        expectedReservationRevision: settled.reservation.revision, disposition: 'receipt_recorded', expectedReceiptId: settled.receipt.id });
      assert.equal(released.result.status, 'released'); assert.equal(released.result.reservation.activeAllocationId, null);
      assert.equal(read(context).result.status, 'verified');
    }
    assert.equal(contexts[0].customer.providerAppUserId, contexts[1].customer.providerAppUserId);
    assert.notEqual(contexts[0].allocation.registration.offeringIdentifier, contexts[1].allocation.registration.offeringIdentifier);
    assert.equal(q("select count(*) from sandbox_commerce_v1.receipts where state='verified';"), '2');
    assert.equal(q('select count(*) from sandbox_commerce_v1.test_store_v2_registrations;'), '2');
    assert.equal(provider.calls.filter(call => call.method === 'POST').length, 6);
    api.capture(false); captureCore = false;
  }, true);
  await record('Service normalized receipts and null observation discriminators cannot bypass raw v2 provenance', async () => {
    const context = await claimed();
    const normalized = core.receipt(context, { intentId: context.rawIntentId, dispatchId: context.allocation.dispatchId });
    h.rejects(api.servicePrefix + `select public.isolated_sandbox_ingest_receipt_v1(${sqlJson(normalized)});`,
      /sandbox_test_store_receipt_source_required/u);
    h.rejects(api.servicePrefix + `select sandbox_commerce_v1.test_store_v2_apply_tip('${randomUUID()}','${randomUUID()}',false);`, /permission denied/u);
    const value = await receipts.evidence(receipts.event(context));
    for (const field of ['mode', 'parseStatus', 'nonEconomicTest']) {
      const mutated = structuredClone(value); mutated.observation[field] = null;
      assert.throws(() => receipts.ingestEvidence(mutated), /test_store_v2_observation_invalid/u);
    }
    assert.equal(q('select count(*) from sandbox_commerce_v1.test_store_v2_ingress;'), '0');
    assertNoReceipt(context);
  }, true);
  await record('Exact bytes and transaction time are idempotent while event-byte and purchased-time conflicts hold their owners', async () => {
    const a = await claimed(), initial = await purchase(a);
    const again = await receipts.ingest(initial); assert.equal(again.status, 'duplicate');
    assert.equal(q('select count(*) from sandbox_commerce_v1.test_store_v2_ingress;'), '1');
    assert.equal(q('select count(*) from sandbox_commerce_v1.test_store_v2_deliveries;'), '2');
    const sameTime = await receipts.ingest({ ...initial, id: randomUUID(), event_timestamp_ms: initial.event_timestamp_ms + 5 });
    assert.equal(receipts.effect(sameTime.receiptId).projection.state, 'verified');
    const timeConflict = await receipts.ingest({ ...initial, id: randomUUID(), purchased_at_ms: initial.purchased_at_ms + 1,
      event_timestamp_ms: initial.event_timestamp_ms + 10 });
    assert.equal(receipts.effect(timeConflict.receiptId).projectionReason, 'test_store_v2_projection_conflict'); assertHeld(a);
    assert.equal(Number(q(`select floor(extract(epoch from purchased_at)*1000)::bigint from sandbox_commerce_v1.receipts where intent_id='${a.rawIntentId}';`)), initial.purchased_at_ms);
    const b = await claimed(), other = await purchase(b);
    const bytesConflict = await receipts.ingest({ ...other, price_in_purchased_currency: 2.00 });
    assert.equal(bytesConflict.status, 'conflict'); assertHeld(b);
    assert.equal(q('select count(*) from sandbox_commerce_v1.receipts;'), '2');
  }, true);
  await record('Qualified refund before purchase persists through retirement and cannot resurrect as verified', async () => {
    const context = await claimed(), initial = receipts.event(context);
    const refund = await receipts.ingest(cancellation(context, initial));
    assert.equal(receipts.effect(refund.receiptId).projection.state, 'refunded'); assertNoReceipt(context);
    q("update sandbox_commerce_v1.lifecycle set state='retired';update sandbox_commerce_v1.test_store_v2_controls set initiation_enabled=false,provisioning_enabled=false;");
    const late = await receipts.ingest(initial);
    assert.equal(receipts.effect(late.receiptId).projection.state, 'refunded');
    assert.equal(read(context).result.status, 'refunded');
    assert.equal(q("select count(*) from sandbox_commerce_v1.receipts where state='verified';"), '0');
    rejectCommand('bind', { installationId: randomUUID() }, /sandbox_generation_inactive/u);
  }, true);
  await record('Known productless transfer fences both customers and future intents without holding a third customer', async () => {
    const a = allocate(bind().customer), b = allocate(bind().customer), c = allocate(bind().customer);
    assert.equal(release(a).result.status, 'released'); assert.equal(release(b).result.status, 'released');
    assert.equal(release(c).result.status, 'released');
    const transfer = await receipts.ingest({ id: randomUUID(), type: 'TRANSFER',
      event_timestamp_ms: Date.now(), transferred_from: [a.customer.providerAppUserId], transferred_to: [b.customer.providerAppUserId] });
    assert.equal(receipts.effect(transfer.receiptId).projectionReason, 'test_store_v2_registered_correlation_missing');
    assertHeld(a, b); assert.equal(read(c).result.status, 'expired');
    rejectCommand('allocate', allocatePayload(a.customer, prepare()), /test_store_v2_initiation_held/u);
    rejectCommand('allocate', allocatePayload(b.customer, prepare()), /test_store_v2_initiation_held/u);
    allocate(c.customer);
    assert.equal(q("select count(*) from sandbox_commerce_v1.test_store_v2_holds where scope='project';"), '0');
    assert.equal(q("select count(distinct customer_id) from sandbox_commerce_v1.test_store_v2_holds where scope='customer';"), '2');
  }, true);
  await record('Unscopable authenticated evidence and unknown transfer identities create only dedicated-project hold rows', async () => {
    const a = allocate(bind().customer), b = allocate(bind().customer);
    const missing = await receipts.ingest({ id: randomUUID(), app_user_id: a.customer.providerAppUserId,
      original_app_user_id: a.customer.providerAppUserId, aliases: [], event_timestamp_ms: Date.now() });
    assertHeld(a, b);
    assert.equal(q(`select count(*) from sandbox_commerce_v1.test_store_v2_holds where ingress_id='${missing.receiptId}' and scope='project' and customer_id is null and allocation_id is null;`), '1');
    const unknown = await receipts.ingest({ id: randomUUID(), type: 'TRANSFER', event_timestamp_ms: Date.now(),
      transferred_from: [a.customer.providerAppUserId], transferred_to: [`scv2_teststore_${randomUUID()}`] });
    assert.equal(q(`select count(*) from sandbox_commerce_v1.test_store_v2_holds where ingress_id='${unknown.receiptId}' and scope='project';`), '1');
    assert.equal(q(`select count(*) from sandbox_commerce_v1.test_store_v2_holds where project_id<>${sqlText(V2_FIXTURE.projectId)};`), '0');
  }, true);
  await record('Contradictory original transaction and Offering references retain every independently known customer', async () => {
    const a = await claimed(), ea = await purchase(a), b = await claimed(), eb = await purchase(b), c = await claimed();
    const conflicting = await receipts.ingest(receipts.event(c, { original_transaction_id: ea.original_transaction_id,
      transaction_id: eb.transaction_id }));
    assert.equal(receipts.effect(conflicting.receiptId).projectionReason, 'test_store_v2_original_reused');
    assertHeld(a, b, c); assertNoReceipt(c);
    assert.equal(q(`select count(distinct customer_id) from sandbox_commerce_v1.test_store_v2_holds where ingress_id='${conflicting.receiptId}' and scope='customer';`), '3');
    assert.equal(q("select count(*) from sandbox_commerce_v1.test_store_v2_holds where scope='project';"), '0');
  }, true);
  await record('Contradictory terminal Offering cannot narrow away its other owner', async () => {
    const a = await claimed(), initial = await purchase(a), b = await claimed();
    const conflict = await receipts.ingest(cancellation(a, initial, { presented_offering_id: b.allocation.registration.offeringIdentifier }));
    assertHeld(a, b); assertNoReceipt(b);
    assert.equal(q(`select count(distinct customer_id) from sandbox_commerce_v1.test_store_v2_holds where ingress_id='${conflict.receiptId}' and scope='customer';`), '2');
    assert.equal(q(`select count(*) from sandbox_commerce_v1.test_store_v2_holds where ingress_id='${conflict.receiptId}' and scope='original';`), '0');
  }, true);
  await record('Negative evidence before original admission backfills the true owner without erasing the reported identity', async () => {
    const a = await claimed(), b = allocate(bind().customer), initial = receipts.event(a);
    const negative = await receipts.ingest({ ...initial, id: randomUUID(), type: 'REFUND', presented_offering_id: null,
      app_user_id: b.customer.providerAppUserId, original_app_user_id: b.customer.providerAppUserId });
    assert.equal(read(a).result.status, 'pending'); assertHeld(b);
    const admitted = await receipts.ingest(initial);
    assert.equal(receipts.effect(admitted.receiptId).projectionReason, 'test_store_v2_prior_negative_evidence');
    assertHeld(a, b); assertNoReceipt(a);
    assert.equal(q(`select count(distinct customer_id) from sandbox_commerce_v1.test_store_v2_holds where ingress_id='${negative.receiptId}' and scope='customer';`), '2');
    assert.equal(q('select count(*) from sandbox_commerce_v1.test_store_v2_original_bindings;'), '1');
  }, true);
  await record('Terminal immutable-original recovery leaves a newer slot intact while late old work never selects it', async () => {
    const old = await claimed(), initial = await purchase(old); awaitLease(old);
    assert.equal(release(old, 'receipt_recorded').result.status, 'released');
    const newer = allocate(old.customer);
    const terminal = await receipts.ingest(cancellation(old, initial, { presented_offering_id: null }));
    assert.equal(receipts.effect(terminal.receiptId).projection.state, 'refunded');
    assert.equal(read(old).result.status, 'refunded'); assert.equal(read(newer).result.status, 'provisioning');
    assert.equal(read(old).result.reservation.activeAllocationId, newer.allocation.id);
    assertNoReceipt(newer);
  }, true);
  await record('Missing Offering and live-store evidence cannot select a current same-SKU candidate', async () => {
    const a = await claimed(), noOffering = await receipts.ingest(receipts.event(a, { presented_offering_id: null }));
    assert.equal(receipts.effect(noOffering.receiptId).projectionReason, 'test_store_v2_registered_correlation_missing');
    assertHeld(a); assertNoReceipt(a);
    const b = await claimed(), wrongEnvironment = await receipts.ingest(receipts.event(b, { environment: 'PRODUCTION' }));
    assert.equal(receipts.effect(wrongEnvironment.receiptId).projectionReason, 'test_store_v2_identity_or_scope_unqualified');
    assertHeld(b); assertNoReceipt(b);
    assert.equal(q('select count(*) from sandbox_commerce_v1.test_store_v2_original_bindings;'), '0');
  }, true);
  await record('Hold writers quote takedown and a post-write authority deadline reject claims without partial dispatches', async () => {
    const context = await register(allocate(bind().customer));
    const payload = { intentId: context.intent.id, dispatchId: context.allocation.dispatchId,
      registrationId: context.allocation.registration.id, expectedQuote: context.quote };
    const writer = await h.held('begin;lock table sandbox_commerce_v1.test_store_v2_holds in row exclusive mode;');
    try { rejectCommand('claim', payload, /could not obtain lock/u); } finally { await writer.finish('rollback'); }
    q(`update sandbox_commerce_v1.resources set status='quarantined' where id='${context.resource.id.replace('scv1_resource_', '')}';`);
    rejectCommand('claim', payload, /test_store_v2_quote_or_source_changed/u);
    assert.equal(q('select count(*) from sandbox_commerce_v1.dispatch_attempts;'), '0');
    const deadline = await register(allocate(bind().customer));
    q(`create function public.fixture_v2_after_claim() returns trigger language plpgsql as $$ begin
      raise notice 'fixture_v2_after_dispatch_insert_reached';perform pg_sleep(1.5);return new;end;$$;
      create trigger fixture_v2_after_claim after insert on sandbox_commerce_v1.dispatch_attempts for each row execute function public.fixture_v2_after_claim();
      update auth.sessions set not_after=clock_timestamp()+interval '1 second' where id='${BUYER_SESSION}';`);
    const expired = rejectCommand('claim', { intentId: deadline.intent.id, dispatchId: deadline.allocation.dispatchId,
      registrationId: deadline.allocation.registration.id, expectedQuote: deadline.quote }, /sandbox_authority_expired|test_store_v2_dispatch_expired/u);
    assert.match(expired.stderr, /^NOTICE:\s+fixture_v2_after_dispatch_insert_reached\s*$/mu,
      'Fixture missed the post-insert deadline window; an initial authority rejection is not this proof');
    assert.equal(q('select count(*) from sandbox_commerce_v1.dispatch_attempts;'), '0');
    assert.equal(q(`select state from sandbox_commerce_v1.intents where id='${deadline.rawIntentId}';`), 'prepared');
  }, true);
  await record('Consumed mutation response loss and durable acknowledgement loss recover through reads without resending', async () => {
    for (const [operation, fault] of [['create_offering', 'response_lost'], ['create_package', 'response_lost'], ['attach_product', 'storage_ack_lost']]) {
      const context = allocate(bind().customer), planId = provider.planFor(context.allocation);
      provider.setFault(planId, operation, fault);
      const stopped = await provider.runWorker(planId);
      assert.equal(stopped.result.status, 'outcome_unknown');
      assert.equal(q(`select count(*) from sandbox_commerce_v1.test_store_v2_registrations where plan_id='${planId}';`), '0');
      const consumed = [...provider.tickets.values()].find(ticket => ticket.planId === planId && ticket.operation === operation);
      assert.ok(consumed, 'Expected the lost operation to have consumed its actual SQL ticket');
      const noResend = await provider.runStep(planId, operation);
      assert.equal(noResend.status, 'unavailable', 'A consumed mutation cannot obtain a new send permit');
      const registered = await provider.registerPlan(context.allocation);
      assert.ok(registered.registration); assert.equal(provider.states.get(planId).postCounts[operation], 1);
      const mutation = provider.calls.filter(call => call.planId === planId && call.operation === operation);
      assert.equal(mutation.length, 1);
      assert.equal(q(`select count(*) from sandbox_commerce_v1.test_store_v2_tickets where plan_id='${planId}' and operation=${sqlText(operation)};`), '1');
      const attach = [...provider.tickets.values()].find(ticket => ticket.planId === planId && ticket.operation === 'attach_product');
      assert.ok(attach);
      assert.equal(q(`select r.package_evidence<>${sqlText(consumed.ticketId)}::uuid and pt.consumed_at>at.consumed_at
        from sandbox_commerce_v1.test_store_v2_registrations r
        join sandbox_commerce_v1.test_store_v2_tickets pt on pt.id=r.package_evidence
        join sandbox_commerce_v1.test_store_v2_tickets at on at.id=${sqlText(attach.ticketId)}::uuid where r.plan_id='${planId}';`), 't');
    }
    assert.equal(q('select count(*) from sandbox_commerce_v1.test_store_v2_registrations;'), '3');
    assert.equal(q('select count(*) from sandbox_commerce_v1.dispatch_attempts;'), '0');
  }, true);
  await record('Shared project capacity and credential rate gates refuse concurrent work before any send permit', async () => {
    const customer = bind().customer, context = prepare();
    const held = await h.held(`begin;select pg_advisory_xact_lock(hashtextextended(${sqlText('test-store-v2-capacity:' + V2_FIXTURE.projectId)},683));`);
    try { rejectCommand('allocate', allocatePayload(customer, context), /test_store_v2_capacity_busy/u); }
    finally { await held.finish('rollback'); }
    assert.equal(q('select count(*) from sandbox_commerce_v1.test_store_v2_plans;'), '0');
    allocate(customer, context); const planId = provider.planFor(context.allocation);
    q('update sandbox_commerce_v1.test_store_v2_controls set max_active_plans=1;');
    rejectCommand('allocate', allocatePayload(bind().customer, prepare()), /test_store_v2_capacity_unavailable/u);
    const rate = await h.held(`begin;select pg_advisory_xact_lock(hashtextextended(${sqlText('test-store-v2-rate:' + V2_FIXTURE.credentialRef)},683));`);
    try {
      const blocked = await provider.runStep(planId, 'list_offerings');
      assert.notEqual(blocked.status, 'recorded'); assert.equal(provider.calls.length, 0);
    } finally { await rate.finish('rollback'); }
    q('update sandbox_commerce_v1.test_store_v2_controls set requests_per_minute=1;');
    const first = await provider.runStep(planId, 'list_offerings'); assert.equal(first.status, 'recorded');
    const capped = await provider.runStep(planId, 'create_offering'); assert.notEqual(capped.status, 'recorded');
    assert.equal(provider.calls.length, 1); assert.equal(provider.calls[0].method, 'GET');
    assert.equal(q('select count(*) from sandbox_commerce_v1.test_store_v2_tickets;'), '1');
  }, true);
  await record('An uncertain SDK report and explicit release preserve old receipt ownership and the newer slot', async () => {
    const old = await claimed(), raw = receipts.event(old);
    assert.equal(api.call('report', { intentId: old.intent.id, dispatchId: old.allocation.dispatchId,
      outcome: 'sdk_cancelled', transactionHint: null }).result.status, 'pending');
    rejectCommand('advance', { intentId: old.intent.id, dispatchId: old.allocation.dispatchId,
      expectedReservationRevision: old.reservation.revision, disposition: 'retain_unknown', expectedReceiptId: null }, /test_store_v2_old_dispatch_lease_active/u);
    awaitLease(old); const advanceRequest = randomUUID(), oldPayload = { intentId: old.intent.id, dispatchId: old.allocation.dispatchId,
      expectedReservationRevision: old.reservation.revision, disposition: 'retain_unknown', expectedReceiptId: null };
    assert.equal(api.call('advance', oldPayload, advanceRequest).result.status, 'released');
    const newer = allocate(old.customer), oldEvent = await receipts.ingest(raw);
    assert.equal(receipts.effect(oldEvent.receiptId).projection.state, 'verified');
    assert.equal(read(old).result.status, 'verified'); assert.equal(read(newer).result.status, 'provisioning');
    const stale = api.call('advance', oldPayload, advanceRequest).result;
    assert.equal(stale.reservation.activeAllocationId, newer.allocation.id);
    assert.equal(stale.reservation.revision, newer.reservation.revision); assertNoReceipt(newer);
    assert.equal(q('select count(*) from sandbox_commerce_v1.test_store_v2_releases;'), '1');
  }, true);
  await record('Qualification installs disabled with zero budgets and private forced-RLS history', async () => {
    assert.equal(q('select phase,max_entries,max_deliveries,max_total_bytes from sandbox_commerce_v1.test_store_qualification_controls;'), 'disabled|0|0|0');
    const names = ['connections', 'controls', 'entries', 'deliveries', 'exclusions', 'conflicts'];
    for (const suffix of names) {
      const name = 'sandbox_commerce_v1.test_store_qualification_' + suffix;
      assert.equal(q(`select relrowsecurity and relforcerowsecurity from pg_class where oid=${sqlText(name)}::regclass;`), 't');
      for (const role of ['anon', 'authenticated', 'service_role', 'sbx_v1_operator']) {
        assert.equal(q(`select has_table_privilege(${sqlText(role)},${sqlText(name)},'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER');`), 'f');
      }
    }
    const value = await qualification.evidence({ id: randomUUID(), type: 'TEST' });
    assert.throws(() => qualification.ingest(value), /qualification_capture_unavailable/u);
    for (const role of ['anon', 'authenticated', 'sbx_v1_operator']) {
      h.rejects(`set role ${role};set request.jwt.claims='{"role":"service_role"}';select ${qualification.expression(value)};`, /permission denied/u);
    }
    for (const role of ['anon', 'authenticated', 'service_role']) {
      h.rejects(`set role ${role};select sandbox_commerce_v1.test_store_qualification_transition('sealed');`, /permission denied/u);
    }
    assertNoEconomics();
  });
  await record('Authenticated qualification capture keeps exact encrypted bytes and exclusions without economic projections', async () => {
    seedQualification(); const started = qualificationTransition('capturing');
    assert.equal(started.behavioralQualificationGranted, false); assert.equal(started.economicProjectionAllowed, false);
    assert.equal(qualificationGate(), 'capture_active');
    assert.equal(qualificationGate(null, null, null, null, null, 'unrelated-project'), 'not_qualification');
    const event = qualificationEvent(), captured = await qualification.capture(event);
    assert.equal(captured.status, 200); assert.equal(captured.result.status, 'captured');
    const stored = JSON.parse(q(`select envelope from sandbox_commerce_v1.test_store_qualification_entries where id='${captured.result.entryId}';`));
    assert.deepEqual(stored, captured.persisted.envelope);
    assert.equal(new TextDecoder().decode(await qualification.decrypt(stored)), captured.prepared.raw);
    assert.equal(q(`select lineage_unknown from sandbox_commerce_v1.test_store_qualification_entries where id='${captured.result.entryId}';`), 'f');
    assert.equal(q('select count(*) from sandbox_commerce_v1.test_store_qualification_exclusions;'), '5');
    const duplicate = await qualification.capture(event); assert.equal(duplicate.result.status, 'duplicate');
    assert.equal(duplicate.result.entryId, captured.result.entryId);
    assert.equal(q('select count(*) from sandbox_commerce_v1.test_store_qualification_entries;'), '1');
    assert.equal(q('select count(*) from sandbox_commerce_v1.test_store_qualification_deliveries;'), '2');
    assertNoEconomics();
  });
  await record('Qualification count caps and append-only sealing retain exact retries without reopening capture', async () => {
    seedQualification(); qualificationTransition('capturing', { entries: 1, deliveries: 2, bytes: 1048576 });
    const event = { id: randomUUID(), type: 'TEST' }, first = await qualification.capture(event);
    assert.equal(first.status, 200); assert.equal((await qualification.capture(event)).result.status, 'duplicate');
    assert.throws(() => qualification.ingest(first.prepared), /qualification_capacity_exhausted/u);
    const next = await qualification.evidence({ id: randomUUID(), type: 'TEST' });
    assert.throws(() => qualification.ingest(next), /qualification_capacity_exhausted/u);
    for (const suffix of ['connections', 'entries', 'deliveries', 'exclusions']) {
      h.rejects(`delete from sandbox_commerce_v1.test_store_qualification_${suffix};`, /test_store_v2_evidence_immutable/u);
      h.rejects(`truncate sandbox_commerce_v1.test_store_qualification_${suffix} cascade;`, /test_store_v2_evidence_immutable/u);
    }
    h.rejects('update sandbox_commerce_v1.test_store_qualification_controls set max_entries=2;', /qualification_transition_forbidden/u);
    const seal = qualificationTransition('sealed'); assert.match(seal.sealSha256, /^[a-f0-9]{64}$/u);
    assert.equal(seal.behavioralQualificationGranted, false); assert.equal(seal.economicProjectionAllowed, false);
    const retry = await qualification.capture(event); assert.equal(retry.result.status, 'sealed_duplicate');
    assert.equal(retry.result.entryId, first.result.entryId);
    assert.equal(q('select count(*) from sandbox_commerce_v1.test_store_qualification_deliveries;'), '2');
    assert.equal(q('select seal_sha256 from sandbox_commerce_v1.test_store_qualification_controls;'), seal.sealSha256);
    assert.throws(() => qualification.ingest(next), /qualification_capture_sealed/u);
    assert.throws(() => qualificationTransition('capturing'), /qualification_transition_forbidden/u);
    assert.throws(() => qualificationTransition('sealed'), /qualification_transition_forbidden/u);
    assertNoEconomics();
  });
  await record('Qualification byte budget and independently recomputed observations reject before durable acknowledgement', async () => {
    seedQualification(); qualificationTransition('capturing', { entries: 2, deliveries: 2, bytes: 1 });
    const value = await qualification.evidence(qualificationEvent());
    const tampered = structuredClone({ envelope: value.envelope, observation: value.observation });
    tampered.observation.authorityGranted = true;
    assert.throws(() => qualification.ingest(tampered), /qualification_normalization_mismatch/u);
    for (const [field, replacement] of [['originalObservationBase64', 'AAAA'], ['originalObservationSha256', '0'.repeat(64)]]) {
      const changed = structuredClone({ envelope: value.envelope, observation: value.observation }); changed.envelope[field] = replacement;
      assert.throws(() => qualification.ingest(changed), /qualification_original_observation_invalid/u);
    }
    const summary = structuredClone({ envelope: value.envelope, observation: value.observation });
    summary.envelope.observation.userId = 'invented-summary-identity';
    assert.throws(() => qualification.ingest(summary), /qualification_original_normalization_mismatch/u);
    const oversized = structuredClone({ envelope: value.envelope, observation: value.observation }), bytes = Buffer.alloc(1048577, 0x61);
    oversized.envelope.originalObservationBase64 = bytes.toString('base64');
    oversized.envelope.originalObservationSha256 = Buffer.from(await crypto.subtle.digest('SHA-256', bytes)).toString('hex');
    assert.throws(() => qualification.ingest(oversized), /qualification_original_observation_invalid/u);
    const rejected = await qualification.capture(qualificationEvent());
    assert.equal(rejected.status, 503); assert.equal(rejected.result.durable, undefined);
    assert.throws(() => qualification.ingest(value), /qualification_capacity_exhausted/u);
    assert.equal(q('select count(*) from sandbox_commerce_v1.test_store_qualification_entries;'), '0');
    assert.equal(q('select count(*) from sandbox_commerce_v1.test_store_qualification_deliveries;'), '0');
    assertNoEconomics();
  });
  await record('Sealed clean qualification history excludes raw event original transaction and customer replay', async () => {
    seedQualification(); qualificationTransition('capturing');
    const event = qualificationEvent(), captured = await qualification.capture(event);
    assert.equal(captured.status, 200); qualificationTransition('sealed');
    assert.equal(qualificationGate(captured.prepared.envelope.rawSha256), 'qualification_replay');
    assert.equal(qualificationGate(null, event.id), 'qualification_event_conflict');
    assert.equal(qualificationGate(null, null, event.original_transaction_id), 'qualification_economic_history');
    assert.equal(qualificationGate(null, null, null, event.transaction_id), 'qualification_economic_history');
    assert.equal(qualificationGate(null, null, null, null, event.app_user_id), 'qualification_economic_history');
    assert.equal(qualificationGate(null, randomUUID(), 'unseen-original', 'unseen-transaction', 'unseen-customer'), 'not_qualification');
    assertNoEconomics();
    seedV2Qualified(q, { seedAuthority: false });
    const context = await claimed();
    const exactReplay = await receipts.ingest(event);
    assert.equal(receipts.effect(exactReplay.receiptId).projectionReason, 'test_store_v2_qualification_history_only');
    assert.equal(q(`select status from sandbox_commerce_v1.test_store_v2_effects where ingress_id='${exactReplay.receiptId}';`), 'ignored');
    assert.equal(read(context).result.status, 'pending');
    const replayedHistory = await receipts.evidence(receipts.event(context, { original_transaction_id: event.original_transaction_id }));
    const excluded = receipts.ingestEvidence(replayedHistory);
    assert.equal(receipts.effect(excluded.receiptId).projectionReason, 'test_store_v2_qualification_economic_history');
    assertHeld(context);
    assertNoReceipt(context);
    assert.equal(q('select count(*) from sandbox_commerce_v1.test_store_v2_ingress;'), '2');
    assert.equal(q('select count(*) from sandbox_commerce_v1.test_store_v2_original_bindings;'), '0');
  }, false, seedV2Authority);
  await record('Conflicting qualification bytes remain immutable unresolved history after sealing', async () => {
    seedQualification(); qualificationTransition('capturing');
    const event = qualificationEvent(), first = await qualification.capture(event);
    const conflict = await qualification.capture({ ...event, extra_fixture_field: 'different authenticated bytes' });
    assert.equal(first.status, 200); assert.equal(conflict.status, 200); assert.equal(conflict.result.status, 'conflict');
    assert.equal(q('select count(*) from sandbox_commerce_v1.test_store_qualification_entries;'), '2');
    assert.equal(q('select count(*) from sandbox_commerce_v1.test_store_qualification_conflicts;'), '1');
    h.rejects('delete from sandbox_commerce_v1.test_store_qualification_conflicts;', /test_store_v2_evidence_immutable/u);
    qualificationTransition('sealed'); assert.equal(qualificationGate(), 'qualification_unresolved');
    assert.equal(qualificationGate(null, null, null, null, null, 'unrelated-project'), 'not_qualification');
    assertNoEconomics();
  });
  await record('Malformed and transferred qualification identities are durably retained without invented ownership', async () => {
    seedQualification(); qualificationTransition('capturing');
    const malformed = await qualification.capture('{"event":{"id":"duplicate-fixture","type":"TEST","app_id":"a","app_id":"b"}}');
    assert.equal(malformed.status, 200);
    assert.equal(malformed.prepared.observation.economicLineageUnknown, true);
    assert.deepEqual(malformed.prepared.observation.customerIds, []);
    const transfer = await qualification.capture({ id: randomUUID(), type: 'TRANSFER', transferred_from: ['\u{1f600}', '\ue000'], transferred_to: ['ordinary'] });
    assert.equal(transfer.status, 200);
    assert.deepEqual(transfer.prepared.observation.customerIds, ['ordinary', '\ue000', '\u{1f600}']);
    assert.equal(q("select count(*) from sandbox_commerce_v1.test_store_qualification_exclusions where kind='customer';"), '3');
    assert.equal(q("select count(*) from sandbox_commerce_v1.test_store_qualification_exclusions where kind in ('original','transaction');"), '0');
    for (const [id, invalid] of [['high', '\\ud800'], ['low', '\\udc00']]) {
      const escapedLiteral = JSON.stringify('literal-\\ud800');
      const raw = '{ "api_version" : "1.0", "event" : { "transferred_to" : ["valid-target"], "type" : "TRANSFER",'
        + ` "app_user_id" : "${invalid}", "original_app_user_id" : "valid-original",`
        + ` "aliases" : ["valid-sibling","${invalid}",${escapedLiteral}], "id" : "surrogate-${id}-\\u0061" } }`;
      const result = await qualification.capture(raw); assert.equal(result.status, 200);
      assert.equal(result.prepared.observation.parseStatus, 'invalid');
      assert.equal(result.prepared.observation.economicLineageUnknown, true);
      assert.deepEqual(result.prepared.observation.customerIds, ['literal-\\ud800', 'valid-original', 'valid-sibling', 'valid-target']);
      const stored = JSON.parse(q(`select envelope from sandbox_commerce_v1.test_store_qualification_entries where id='${result.result.entryId}';`));
      assert.equal(stored.observation.userId, null);
      assert.deepEqual(stored.observation.aliases, ['valid-sibling', 'literal-\\ud800']);
      assert.equal(new TextDecoder().decode(await qualification.decrypt(stored)), raw);
      assert.equal(stored.originalObservationBase64, result.persisted.envelope.originalObservationBase64);
    }
    qualificationTransition('sealed'); assert.equal(qualificationGate(), 'qualification_unresolved');
    h.rejects(`select sandbox_commerce_v1.test_store_v2_scope_exclusive(${sqlText(V2_FIXTURE.projectId)});`, /test_store_v2_qualification_not_ready/u);
    assertNoEconomics();
  });
  await record('Qualification capture refuses existing economic ownership and nonwaits on namespace writers', async () => {
    seedQualification();
    const writer = await h.held('begin;lock table sandbox_commerce_v1.test_store_v2_connections in row exclusive mode;');
    try { assert.throws(() => qualificationTransition('capturing'), /could not obtain lock/u); }
    finally { await writer.finish('rollback'); }
    assert.equal(q('select phase from sandbox_commerce_v1.test_store_qualification_controls;'), 'disabled');
    seedV2Qualified(q, { seedAuthority: false });
    assert.throws(() => qualificationTransition('capturing'), /qualification_economic_project_already_configured/u);
    assert.equal(q('select phase from sandbox_commerce_v1.test_store_qualification_controls;'), 'disabled');
    assert.equal(q('select count(*) from sandbox_commerce_v1.test_store_qualification_entries;'), '0');
  }, false, seedV2Authority);
  await record('Active qualification capture cannot initiate or ingest economic receipts through a synthetic configured route', async () => {
    seedQualification(); qualificationTransition('capturing'); seedV2Qualified(q, { seedAuthority: false });
    rejectCommand('bind', { installationId: randomUUID() }, /test_store_v2_qualification_not_ready/u);
    const raw = await receipts.evidence(qualificationEvent());
    assert.throws(() => receipts.ingestEvidence(raw), /test_store_v2_qualification_capture_active/u);
    assert.equal(q('select count(*) from sandbox_commerce_v1.test_store_v2_ingress;'), '0');
    assertNoEconomics();
  }, false, seedV2Authority);
  await record('A synthetically excluded candidate stays durably blocked across same and new bind requests', async () => {
    seedQualification(); qualificationTransition('capturing');
    const captured = await qualification.capture({ id: randomUUID(), type: 'TEST' });
    assert.equal(captured.status, 200); qualificationTransition('sealed'); seedV2Qualified(q, { seedAuthority: false });
    const deliveryId = q(`select id from sandbox_commerce_v1.test_store_qualification_deliveries where entry_id='${captured.result.entryId}';`);
    // Explicit disposable collision injection: the real command generates and
    // persists its candidate unchanged. Only this fixture adds an exclusion for
    // that candidate, referencing a real captured parent/delivery. This is not
    // provider qualification evidence, nor a replacement UUID/command function.
    q(`create function public.fixture_v2_candidate_collision() returns trigger language plpgsql as $$ begin
      insert into sandbox_commerce_v1.test_store_qualification_exclusions(project_id,kind,key,entry_id,delivery_id)
        values(new.project_id,'customer',new.provider_app_user_id,'${captured.result.entryId}','${deliveryId}');
      return new;end;$$;
      create trigger fixture_v2_candidate_collision after insert on sandbox_commerce_v1.test_store_v2_customer_candidates
        for each row execute function public.fixture_v2_candidate_collision();`);
    const installationId = randomUUID(), firstRequest = randomUUID();
    api.capture(true);
    const first = api.call('bind', { installationId }, firstRequest).result;
    const same = api.call('bind', { installationId }, firstRequest).result;
    const next = api.call('bind', { installationId }, randomUUID()).result;
    api.capture(false);
    assert.deepEqual(same, first); assert.deepEqual(next, first);
    assert.equal(first.status, 'held'); assert.equal(first.reason, 'test_store_v2_customer_qualification_excluded');
    assert.equal(first.dispatchAllowed, false); assert.equal(first.retryProviderMutation, false);
    for (const key of ['customer', 'allocation', 'reservation', 'receipt', 'authorityValidUntil']) assert.equal(first[key], null);
    const candidate = JSON.parse(q('select to_jsonb(c) from sandbox_commerce_v1.test_store_v2_customer_candidates c;'));
    assert.equal(candidate.installation_id, installationId); assert.equal(candidate.buyer_id, BUYER);
    assert.equal(qualificationGate(null, null, null, null, candidate.provider_app_user_id), 'qualification_economic_history');
    assert.equal(q('select count(*) from sandbox_commerce_v1.test_store_v2_customer_candidates;'), '1');
    assert.equal(q('select count(*) from sandbox_commerce_v1.test_store_v2_requests;'), '2');
    for (const table of ['customers', 'reservations', 'allocations', 'plans', 'tickets']) {
      assert.equal(q(`select count(*) from sandbox_commerce_v1.test_store_v2_${table};`), '0');
    }
    assert.equal(q('select count(*) from sandbox_commerce_v1.dispatch_attempts;'), '0');
    assert.equal(q('select count(*) from sandbox_commerce_v1.receipts;'), '0');
    rejectCommand('bind', { installationId }, /test_store_v2_installation_immutable/u, randomUUID(), { userId: SELLER, sessionId: SELLER_SESSION });
    h.rejects('delete from sandbox_commerce_v1.test_store_v2_customer_candidates;', /test_store_v2_evidence_immutable/u);
    h.rejects("update sandbox_commerce_v1.test_store_v2_customer_candidates set provider_app_user_id='scv2_teststore_aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';", /test_store_v2_evidence_immutable/u);
  }, false, seedV2Authority);
  await record('Authenticated malformed Unicode negatives durably veto every retained current owner and preserve exact encrypted bytes', async () => {
    const first = await claimed(), initial = await purchase(first), second = await claimed(), third = await claimed();
    for (const invalid of ['\ud800', '\udc00', '\u0000']) {
      const event = cancellation(first, initial, { app_user_id: invalid, original_app_user_id: first.customer.providerAppUserId,
        aliases: [first.customer.providerAppUserId, invalid, second.customer.providerAppUserId],
        extra_fixture: { z: '😀', a: 'literal-\\ud800', quote: '"' } });
      const raw = JSON.stringify({ api_version: '1.0', event }).replace('"type":', '"ty\\u0070e":');
      const captured = await receipts.capture(raw); assert.equal(captured.status, 200);
      assert.equal(captured.result.authorityGranted, false); assert.equal(captured.result.financialAuthority, false);
      assert.equal(captured.prepared.observation.mode, 'hold'); assert.equal(captured.prepared.observation.parseStatus, 'invalid');
      assert.equal(captured.prepared.observation.userId, null);
      assert.deepEqual(captured.prepared.observation.aliases, [first.customer.providerAppUserId, second.customer.providerAppUserId]);
      assert.ok(captured.prepared.observation.issues.includes('invalid_unicode_observation'));
      const stored = JSON.parse(q(`select envelope from sandbox_commerce_v1.test_store_v2_ingress where id='${captured.result.receiptId}';`));
      assert.equal(stored.storageProtocol, 'rc-router-lossless-envelope-v1');
      assert.equal(new TextDecoder().decode(await receipts.decrypt(stored)), raw);
      assert.equal(stored.originalObservationBase64, captured.prepared.envelope.originalObservationBase64);
      assert.equal(q(`select status from sandbox_commerce_v1.test_store_v2_effects where ingress_id='${captured.result.receiptId}';`), 'held');
      assertHeld(first, second, third); assertNoReceipt(second); assertNoReceipt(third);
      assert.equal(q(`select count(*) from sandbox_commerce_v1.test_store_v2_holds where ingress_id='${captured.result.receiptId}' and scope='project' and project_id=${sqlText(V2_FIXTURE.projectId)};`), '1');
      assert.equal(read(first).result.receipt.state, 'quarantined');
    }
    assert.equal(q('select count(*) from sandbox_commerce_v1.receipts;'), '1');
    assert.equal(q('select count(*) from sandbox_commerce_v1.test_store_v2_original_bindings;'), '1');
  }, true);
  await record('Malformed initial receipt cannot grant and forged lossless summaries cannot erase its invalidity', async () => {
    const context = await claimed();
    const value = await receipts.evidence(receipts.event(context, { aliases: [context.customer.providerAppUserId, '\ud800'], presented_offering_id: '\udc00' }));
    const forged = structuredClone(value); forged.observation.parseStatus = 'valid'; forged.observation.issues = []; forged.observation.mode = 'tip_purchase';
    assert.throws(() => receipts.ingestEvidence(forged), /test_store_v2_observation_derivation_invalid/u);
    const summary = structuredClone(value); summary.envelope.observation.userId = 'invented-summary';
    assert.throws(() => receipts.ingestEvidence(summary), /test_store_v2_lossless_normalization_mismatch/u);
    const digest = structuredClone(value); digest.envelope.originalObservationSha256 = '0'.repeat(64);
    assert.throws(() => receipts.ingestEvidence(digest), /qualification_original_observation_invalid/u);
    assert.equal(q('select count(*) from sandbox_commerce_v1.test_store_v2_ingress;'), '0');
    const captured = await receipts.capture(value.raw); assert.equal(captured.status, 200);
    assert.equal(captured.prepared.observation.presentedOfferingId, null);
    assert.equal(captured.prepared.observation.mode, 'hold'); assertHeld(context); assertNoReceipt(context);
    assert.equal(q('select count(*) from sandbox_commerce_v1.test_store_v2_original_bindings;'), '0');
    const stored = JSON.parse(q(`select envelope from sandbox_commerce_v1.test_store_v2_ingress where id='${captured.result.receiptId}';`));
    assert.equal(new TextDecoder().decode(await receipts.decrypt(stored)), value.raw);
  }, true);
  await record('Only a closed one-identity non-economic TEST is ignored; contradictory probe identities hold both owners', async () => {
    const a=await claimed(), b=await claimed();
    const clean={id:randomUUID(),type:'TEST',app_id:V2_FIXTURE.appId,store:'TEST_STORE',environment:'SANDBOX',
      event_timestamp_ms:Date.now(),app_user_id:a.customer.providerAppUserId,original_app_user_id:a.customer.providerAppUserId,aliases:[a.customer.providerAppUserId]};
    const accepted=await receipts.capture(JSON.stringify({api_version:'1.0',event:clean}));
    assert.equal(accepted.status,200);assert.equal(accepted.prepared.observation.nonEconomicTest,true);
    assert.equal(q(`select status from sandbox_commerce_v1.test_store_v2_effects where ingress_id='${accepted.result.receiptId}';`),'ignored');
    assert.equal(q('select count(*) from sandbox_commerce_v1.test_store_v2_holds;'),'0');assertNoReceipt(a);assertNoReceipt(b);
    const contradictory=await receipts.evidence({...clean,id:randomUUID(),original_app_user_id:b.customer.providerAppUserId,aliases:[a.customer.providerAppUserId,b.customer.providerAppUserId]});
    assert.equal(contradictory.observation.nonEconomicTest,false);
    // A privileged derived flag cannot erase contradictory authenticated identity facts.
    contradictory.observation.nonEconomicTest=true;
    const denied=receipts.ingestEvidence(contradictory);
    assert.equal(q(`select status from sandbox_commerce_v1.test_store_v2_effects where ingress_id='${denied.receiptId}';`),'held');
    assertHeld(a,b);assertNoReceipt(a);assertNoReceipt(b);
  }, true);
  await record('Economic TEST transfer retains exact bytes and holds its known original owner plus unresolved project', async () => {
    const a=await claimed(), initial=await purchase(a), b=await claimed();
    const raw=JSON.stringify({api_version:'1.0',event:{...initial,id:randomUUID(),type:'TEST',
      transferred_from:[a.customer.providerAppUserId],transferred_to:[`scv2_teststore_${randomUUID()}`]}});
    const captured=await receipts.capture(raw);assert.equal(captured.status,200);assert.equal(captured.prepared.observation.nonEconomicTest,false);
    assert.equal(q(`select status from sandbox_commerce_v1.test_store_v2_effects where ingress_id='${captured.result.receiptId}';`),'held');
    assert.equal(q(`select count(*) from sandbox_commerce_v1.test_store_v2_holds where ingress_id='${captured.result.receiptId}' and scope='project';`),'1');
    assertHeld(a,b);assertNoReceipt(b);assert.equal(read(a).result.receipt.state,'quarantined');
    assert.equal(q('select count(*) from sandbox_commerce_v1.receipts;'),'1');
    const stored=JSON.parse(q(`select envelope from sandbox_commerce_v1.test_store_v2_ingress where id='${captured.result.receiptId}';`));
    assert.equal(new TextDecoder().decode(await receipts.decrypt(stored)),raw);
  }, true);
  await record('Unrepresentable Offering inventory persists exact encrypted response and holds plan plus dedicated project', async () => {
    const a=allocate(bind().customer), b=allocate(bind().customer), planId=provider.planFor(a.allocation);
    const raw=JSON.stringify({object:'list',url:`https://api.revenuecat.com/v2/projects/${V2_FIXTURE.projectId}/offerings?limit=100`,items:[{
      object:'offering',id:'ofrng_malformed',lookup_key:'bad\udfff',display_name:'bad\ud800',project_id:V2_FIXTURE.projectId,
      state:'active',is_current:false,created_at:Date.now(),unknown:'bad\u0000'}]});
    const out=await provider.source.runProvisioningStep({planId,operation:'list_offerings',requestId:randomUUID(),cursor:null},provider.config,
      {...provider.deps,fetch:async()=>new Response(raw,{status:200,headers:{'content-type':'application/json'}})});
    assert.equal(out.status,'recorded');assert.equal(out.observation.kind,'invalid');
    const stored=JSON.parse(q(`select jsonb_build_object('evidence',evidence,'observation',observation) from sandbox_commerce_v1.test_store_v2_transport_evidence where ticket_id='${out.ticketId}';`));
    assert.equal(new TextDecoder().decode(await provider.source.decryptProvisioningEvidence(stored.evidence,stored.observation,provider.tickets.get(out.ticketId),provider.config)),raw);
    assert.equal(q(`select count(*) from sandbox_commerce_v1.test_store_v2_holds where ticket_id='${out.ticketId}' and scope='plan';`),'1');
    assert.equal(q(`select count(*) from sandbox_commerce_v1.test_store_v2_holds where ticket_id='${out.ticketId}' and scope='project' and reason='project_inventory_unresolved';`),'1');
    assertHeld(a,b);assertNoReceipt(a);assertNoReceipt(b);assert.equal(q('select count(*) from sandbox_commerce_v1.test_store_v2_registrations;'),'0');
  }, true);
  await record('Unrepresentable known resource response retains evidence and blocks its plan without inventing project inventory uncertainty', async () => {
    const a=allocate(bind().customer), b=allocate(bind().customer), planId=provider.planFor(a.allocation);
    assert.equal((await provider.runStep(planId,'list_offerings')).status,'recorded');
    const raw=JSON.stringify({object:'offering',id:'ofrng_malformed',lookup_key:'bad\udfff',display_name:'bad\ud800'});
    const out=await provider.source.runProvisioningStep({planId,operation:'create_offering',requestId:randomUUID(),cursor:null},provider.config,
      {...provider.deps,fetch:async()=>new Response(raw,{status:201,headers:{'content-type':'application/json'}})});
    assert.equal(out.status,'recorded');assert.equal(out.observation.kind,'invalid');
    const stored=JSON.parse(q(`select jsonb_build_object('evidence',evidence,'observation',observation) from sandbox_commerce_v1.test_store_v2_transport_evidence where ticket_id='${out.ticketId}';`));
    assert.equal(new TextDecoder().decode(await provider.source.decryptProvisioningEvidence(stored.evidence,stored.observation,provider.tickets.get(out.ticketId),provider.config)),raw);
    assertHeld(a);assert.equal(read(b).result.status,'provisioning');
    assert.equal(q('select count(*) from sandbox_commerce_v1.test_store_v2_holds where scope=\'project\';'),'0');
    assertNoReceipt(a);assertNoReceipt(b);
  }, true);
  await record('Unrepresentable additional-only raw fields cannot escape the dedicated project fence or create a positive receipt', async () => {
    const a=await claimed(), b=await claimed();
    for(const patch of [{presented_offering_id:'bad\ud800'},{unknown:{nested:'bad\u0000'}},{['bad\udfff']:'unknown-key'}]){
      const raw=JSON.stringify({api_version:'1.0',event:receipts.event(a,patch)}),captured=await receipts.capture(raw);
      assert.equal(captured.status,200);assert.ok(captured.prepared.observation.issues.includes('invalid_unicode_observation'));
      assert.equal(captured.prepared.observation.userId,a.customer.providerAppUserId);assert.equal(captured.prepared.observation.mode,'hold');
      assert.equal(q(`select count(*) from sandbox_commerce_v1.test_store_v2_holds where ingress_id='${captured.result.receiptId}' and scope='project';`),'1');
      const stored=JSON.parse(q(`select envelope from sandbox_commerce_v1.test_store_v2_ingress where id='${captured.result.receiptId}';`));
      assert.equal(new TextDecoder().decode(await receipts.decrypt(stored)),raw);assertHeld(a,b);assertNoReceipt(a);assertNoReceipt(b);
    }
  }, true);
} catch (error) { primaryFailure = error; h.captureFailure(); }
finally { try { await h.close(); } catch (error) { cleanupFailure = error; } }
if (primaryFailure || cleanupFailure) {
  process.stderr.write('TEST_STORE_V2_NATIVE_DIAGNOSTICS ' + JSON.stringify({ ...h.diagnostics(primaryFailure, cleanupFailure),
    completedCases: cases, sourceHashes: install.sourceHashes }) + '\n');
  throw primaryFailure ?? cleanupFailure;
}
install.assertUnchanged();
assert.ok(cases.length > 1); assert.ok(Object.values(h.cleanup).every(Boolean));
report = { status: 'passed', kind: 'isolated-test-store-v2-native-source-proof', engine, caseCount: cases.length, cases,
  sourceHashes: install.sourceHashes, fixtureAdaptation: install.fixtureAdaptation,
  syntheticProviderEvidence: true, actualProviderAuthenticationProven: false, actualDeviceBehaviorProven: false,
  providerOrProductionCalls: false, durationMs: Date.now() - startedAt, cleanup: h.cleanup };
if (process.env.ISOLATED_TEST_STORE_V2_FIXTURE) {
  assert.ok(path.isAbsolute(process.env.ISOLATED_TEST_STORE_V2_FIXTURE));
  assert.ok(api.captures.length > 0, 'No actual SQL command responses were captured');
  fs.writeFileSync(process.env.ISOLATED_TEST_STORE_V2_FIXTURE, JSON.stringify({ protocol: 'isolated-test-store-v2', cases: api.captures,
    coreCases, checkoutCases }, null, 2) + '\n');
}
console.log(JSON.stringify(report, null, 2));
