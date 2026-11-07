#!/usr/bin/env node
// Actual tip-only source SQL against disposable PostgreSQL 17.6 fixtures.
// No provider/network/production proof is claimed by these synthetic receipts.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { BUYER, BUYER_SESSION, SELLER, fixtureApi, installSql, sqlJson, sqlText, syntheticHash } from './receipts.fixture.mjs';
import { runDispatchConcurrencyCases } from './receipts-dispatch.fixture.mjs';

assert.equal(process.argv.length, 4); assert.equal(process.argv[2], '--local-bin');
const bin = process.argv[3]; assert.ok(path.isAbsolute(bin));
const here = path.dirname(fileURLToPath(import.meta.url));
// Read/validate every source before creating a cluster; missing source is failure.
const install = installSql(here);
const work = fs.mkdtempSync(path.join(os.tmpdir(), 'sandbox-tip-receipts-native-'));
const data = path.join(work, 'data'), port = '55451', db = 'receipt_' + randomUUID().replaceAll('-', '');
const env = Object.fromEntries(Object.entries(process.env).filter(([key]) => !key.startsWith('PG')));
const args = database => ['-X', '-q', '-A', '-t', '-v', 'ON_ERROR_STOP=1', '-h', '127.0.0.1', '-p', port, '-U', 'postgres', '-d', database];
const run = (tool, toolArgs, input) => spawnSync(path.join(bin, tool), toolArgs,
  { input, encoding: 'utf8', env, timeout: 30000, maxBuffer: 8 * 1024 * 1024 });
const invoke = (tool, toolArgs, input) => {
  const out = run(tool, toolArgs, input);
  assert.equal(out.status, 0, `${tool}: ${out.stderr}\n${out.error?.message ?? ''}`);
  return out.stdout.trim();
};
const q = sql => invoke('psql', args(db), sql);
const runQuery = sql => run('psql', args(db), sql);
const api = fixtureApi(q, runQuery);
const cases = [];
const recordCase = (name, execute) => { execute(); assert.equal(api.counts().grants, 0, 'Tips must never create grants'); cases.push(name); };
const noVerified = () => assert.equal(q("select count(*) from sandbox_commerce_v1.receipts where state='verified';"), '0');
const expectReceiptDenial = receipt => {
  const out = runQuery(api.servicePrefix + `select public.isolated_sandbox_ingest_receipt_v1(${sqlJson(receipt)});`);
  if (out.status === 0) {
    const result = JSON.parse(out.stdout.trim());
    assert.ok(['pending', 'quarantined'].includes(result.status), JSON.stringify(result));
    assert.equal(result.grantsAccess, false); assert.equal(result.notPayable, true);
  } else assert.match(out.stderr, /sandbox|receipt|provider|intent|permission/iu);
  noVerified();
};
const ready = (name = 'app_store') => {
  api.reset(); const context = api.prepare(api.seedCatalog(name));
  const dispatch = api.beginDispatch(context);
  assert.equal(dispatch.status, 'dispatch_claimed'); assert.equal(dispatch.dispatchAllowed, true);
  const receipt = api.receipt(context);
  if (name === 'stripe') assert.equal(api.bindDispatch(context, receipt.providerTransactionId).status, 'provider_bound');
  return { context, receipt };
};
const processed = receipt => {
  const result = api.invokeReceipt(receipt);
  assert.equal(result.status, 'processed', JSON.stringify(result));
  assert.equal(result.grantsAccess, false); assert.equal(result.notPayable, true);
  assert.equal(api.state(receipt).state, 'verified'); return result;
};
let started = false, startAttempted = false, initializationAttempted = false, initialized = false, report;
const cleanup = { sessionsClosed: false, clusterStopped: false, clusterNotRunningVerified: false, directoryRemoved: false };
const began = Date.now();
try {
  const version = invoke('postgres', ['--version']); assert.match(version, /PostgreSQL\) 17\.6/u);
  initializationAttempted = true;
  invoke('initdb', ['-D', data, '-U', 'postgres', '--encoding=UTF8', '--no-locale', '--auth=trust']);
  initialized = true;
  startAttempted = true;
  invoke('pg_ctl', ['-D', data, '-w', '-t', '15', '-l', path.join(work, 'server.log'), '-o',
    `-c listen_addresses=127.0.0.1 -c unix_socket_directories='' -p ${port} -c max_prepared_transactions=0 -c autovacuum=off`, 'start']);
  started = true;
  invoke('psql', args('postgres'), `create database ${db};`);
  q(install.sql);
  q(`do $$declare t regclass;begin foreach t in array array['auth.users'::regclass,'auth.sessions'::regclass,
    'public.wave1_legal_acceptances'::regclass,'public.user_entitlements'::regclass] loop
    execute format('alter table %s enable row level security',t);
    execute format('alter table %s force row level security',t);end loop;end$$;`);

  recordCase('Service-only wrappers reject authenticated claims spoofing and direct runtime table access', () => {
    const { context, receipt } = ready();
    for (const role of ['anon', 'authenticated']) {
      for (const expression of [
        `public.isolated_sandbox_begin_dispatch_v1(${sqlText(context.intent.id)},${sqlText(randomUUID())})`,
        `public.isolated_sandbox_bind_dispatch_v1(${sqlText(context.intent.id)},${sqlText(context.dispatchId)},'pi_fixture')`,
        `public.isolated_sandbox_ingest_receipt_v1(${sqlJson(receipt)})`,
      ]) {
        const out = runQuery(`set role ${role};set request.jwt.claims='{"role":"service_role"}';select ${expression};`);
        assert.notEqual(out.status, 0); assert.match(out.stderr, /permission denied/u);
      }
    }
    const wrongClaims = runQuery(`set role service_role;set request.jwt.claims='{"role":"authenticated"}';select public.isolated_sandbox_ingest_receipt_v1(${sqlJson(receipt)});`);
    assert.notEqual(wrongClaims.status, 0);
    const direct = runQuery('set role service_role;select * from sandbox_commerce_v1.receipts;');
    assert.notEqual(direct.status, 0); assert.match(direct.stderr, /permission denied/u);
    noVerified();
  });
  for (const name of ['app_store', 'google_play', 'stripe']) recordCase(`Actual ${name} dispatched tip receipt records provider truth for a free buyer without access grants`, () => {
    const { receipt } = ready(name); const result = processed(receipt);
    assert.ok(result.receiptId); assert.equal(api.counts().receipts, 1);
    assert.equal(q(`select count(*) from public.user_entitlements where user_id='${BUYER}';`), '0');
  });
  recordCase('A dispatch claim is one-use; uncertain retries and changed attempt IDs never resend', () => {
    const { context } = ready();
    const again = api.beginDispatch(context); assert.equal(again.dispatchAllowed, false);
    assert.equal(again.status, 'provider_outcome_unknown');
    const changed = runQuery(api.servicePrefix + `select public.isolated_sandbox_begin_dispatch_v1(${sqlText(context.intent.id)},${sqlText(randomUUID())});`);
    if (changed.status === 0) assert.equal(JSON.parse(changed.stdout.trim()).dispatchAllowed, false);
    else assert.match(changed.stderr, /sandbox|dispatch|conflict/iu);
    assert.equal(q(`select count(*) from sandbox_commerce_v1.dispatch_attempts where intent_id='${context.rawIntentId}';`), '1');
  });
  recordCase('Prepared intent without provider dispatch cannot consume a purchase receipt', () => {
    api.reset(); const context = api.prepare(api.seedCatalog()); expectReceiptDenial(api.receipt(context));
    assert.equal(api.counts().receipts, 0);
  });
  recordCase('Exact economics and provider scope are required, including real sandbox mode', () => {
    for (const patch of [{ amountMinor: 100 }, { currency: 'eur' }, { buyerId: SELLER }, { providerEventId: 123 },
      { productId: 'fixture.other-product' }, { providerScopeKey: 'foreign-provider-scope' },
      { sourceEnvironment: 'PRODUCTION' }, { environment: 'production' }, { expiresAt: '2099-01-01T00:00:00.000Z' }]) {
      const { receipt } = ready(); expectReceiptDenial({ ...receipt, ...patch });
    }
  });
  recordCase('Native tip intake rejects initial/renewal and other active receipt semantics', () => {
    for (const patch of [{ eventType: 'renewal', providerEventType: 'RENEWAL' },
      { eventType: 'initial_purchase', providerEventType: 'INITIAL_PURCHASE' },
      { eventType: 'non_renewing_purchase', providerEventType: 'INITIAL_PURCHASE' }]) {
      const { receipt } = ready(); expectReceiptDenial({ ...receipt, ...patch });
    }
  });
  recordCase('Stripe requires exact settled platform test PaymentIntent and frozen transaction binding', () => {
    for (const patch of [{ providerStatus: 'processing' }, { providerAmountReceivedMinor: 198 },
      { providerLivemode: true }, { providerConnectedAccountId: 'acct_foreign' },
      { providerObjectType: 'checkout.session', providerEventType: 'checkout.session.completed' },
      { providerTransactionId: 'pi_unbound', originalTransactionId: 'pi_unbound' }]) {
      const { receipt } = ready('stripe'); expectReceiptDenial({ ...receipt, ...patch });
    }
  });
  recordCase('Stripe binding is immutable; known session cannot be rebound to another payment', () => {
    const { context, receipt } = ready('stripe');
    assert.equal(api.bindDispatch(context, receipt.providerTransactionId).status, 'provider_bound');
    const changed = runQuery(api.servicePrefix + `select public.isolated_sandbox_bind_dispatch_v1(${sqlText(context.intent.id)},${sqlText(context.dispatchId)},'pi_other');`);
    assert.notEqual(changed.status, 0); processed(receipt);
  });
  recordCase('Two eligible RevenueCat pending candidates never resolve by newest/oldest intent', () => {
    const { context } = ready(); const other = api.prepare(context);
    assert.equal(api.beginDispatch(other).dispatchAllowed, true);
    expectReceiptDenial(api.receipt(context)); assert.equal(api.counts().receipts, 0);
  });
  recordCase('Exact event replay is idempotent and changed authenticated bytes quarantine without overwriting ingress', () => {
    const { receipt } = ready(); const first = processed(receipt);
    const duplicate = api.invokeReceipt(receipt); assert.equal(duplicate.status, 'processed'); assert.equal(duplicate.duplicate, true);
    assert.equal(duplicate.receiptId, first.receiptId); assert.equal(api.counts().receipts, 1);
    const before = q(`select payload::text from sandbox_commerce_v1.receipt_ingress where event_id=${sqlText(receipt.providerEventId)};`);
    const changed = api.invokeReceipt({ ...receipt, rawBodySha256: syntheticHash('changed-bytes') });
    assert.equal(changed.status, 'quarantined'); assert.equal(api.state(receipt).state, 'quarantined');
    assert.equal(q(`select payload::text from sandbox_commerce_v1.receipt_ingress where event_id=${sqlText(receipt.providerEventId)};`), before);
  });
  recordCase('Original transaction cannot be relabeled to a second tip or provider transaction', () => {
    const { context, receipt } = ready(); processed(receipt);
    const second = api.prepare(context); api.beginDispatch(second);
    const conflict = api.receipt(second, { originalTransactionId: receipt.originalTransactionId });
    const result = api.invokeReceipt(conflict); assert.equal(result.status, 'quarantined');
    assert.equal(api.state(receipt).state, 'quarantined'); assert.equal(api.counts().receipts, 1);
  });
  recordCase('One intent cannot receive a second independently charged original transaction', () => {
    const { context, receipt } = ready();
    Object.assign(receipt, { intentId: context.rawIntentId, dispatchId: context.dispatchId }); processed(receipt);
    const conflict = api.receipt(context, { intentId: context.rawIntentId, dispatchId: context.dispatchId });
    const result = api.invokeReceipt(conflict); assert.equal(result.status, 'quarantined');
    assert.equal(api.counts().receipts, 1);
    assert.equal(q("select count(*) from sandbox_commerce_v1.original_states where state='quarantined';"), '1');
    assert.equal(api.state(conflict).state, 'quarantined');
    assert.equal(api.state(receipt).state, 'verified', 'Unverified RC intent hint cannot quarantine another original');
  });
  recordCase('Terminal-before-initial creates durable own-transaction tombstone and prevents later verification', () => {
    const { receipt } = ready(); const refund = api.terminal(receipt);
    const first = api.invokeReceipt(refund); assert.ok(['processed', 'quarantined', 'pending'].includes(first.status));
    assert.ok(api.state(receipt)); assert.notEqual(api.state(receipt).state, 'verified');
    api.invokeReceipt(receipt); noVerified(); assert.notEqual(api.state(receipt).state, 'verified');
  });
  recordCase('Already-dispatched purchase completes after retirement and seller Premium loss', () => {
    const { context, receipt } = ready(); const unstarted = api.prepare(context);
    q("set role sbx_v1_operator;select sandbox_commerce_v1.transition('active','retired');");
    q(`delete from public.user_entitlements where user_id='${SELLER}';`);
    processed(receipt);
    const denied = runQuery(api.servicePrefix + `select public.isolated_sandbox_begin_dispatch_v1(${sqlText(unstarted.intent.id)},${sqlText(unstarted.dispatchId)});`);
    assert.notEqual(denied.status, 0); assert.match(denied.stderr, /sandbox_generation_inactive/u);
  });
  recordCase('Partial Stripe refunds preserve cumulative economics and quarantine instead of claiming full refund', () => {
    const { receipt } = ready('stripe'); processed(receipt);
    for (const refundedAmountMinor of [20, 40, 20]) {
      const result = api.invokeReceipt(api.terminal(receipt, 'refund', { refundedAmountMinor }));
      assert.equal(result.status, 'quarantined'); assert.equal(api.state(receipt).state, 'quarantined');
      assert.notEqual(q('select state from sandbox_commerce_v1.receipts;'), 'refunded');
    }
    assert.equal(api.state(receipt).refunded_minor, 40);
  });
  recordCase('Full refund/revocation is monotonic; later purchase envelopes cannot reopen the tip', () => {
    for (const kind of ['refund', 'revocation']) {
      const { receipt } = ready(); processed(receipt); api.invokeReceipt(api.terminal(receipt, kind));
      assert.equal(api.state(receipt).state, kind === 'refund' ? 'refunded' : 'revoked');
      api.invokeReceipt({ ...receipt, providerEventId: `late-positive-${randomUUID()}`,
        rawBodySha256: syntheticHash(randomUUID()), providerEventAt: new Date(Date.parse(receipt.providerEventAt) + 2000).toISOString() });
      assert.equal(api.state(receipt).state, kind === 'refund' ? 'refunded' : 'revoked'); noVerified();
    }
  });
  recordCase('Unknown lifecycle quarantines its owned original only, preserving another tip and shared Premium', () => {
    const { context, receipt } = ready(); processed(receipt);
    const secondContext = api.prepare(context); api.beginDispatch(secondContext); const second = api.receipt(secondContext); processed(second);
    const result = api.invokeReceipt(api.terminal(receipt, 'unknown', { providerEventType: 'UNKNOWN_LIFECYCLE', refundedAmountMinor: null }));
    assert.equal(result.status, 'quarantined'); assert.equal(api.state(receipt).state, 'quarantined');
    assert.equal(api.state(second).state, 'verified');
    assert.equal(q(`select count(*) from public.user_entitlements where user_id='${SELLER}' and status='active';`), '1');
    assert.equal(q('select count(*) from public.revenuecat_terminal_authority_quarantines;'), '0');
  });
  recordCase('Receipt history remains account-bound and confirms tips grant no access', () => {
    const { receipt } = ready(); const result = processed(receipt);
    const read = api.command('receipt.read', { receiptId: `scv1_receipt_${result.receiptId}` });
    assert.equal(read.data.grantsAccess, false); assert.equal(read.data.receipt.kind, 'creator_tip');
    const other = runQuery(api.actorPrefix(SELLER, '22222222-2222-4222-8222-222222222222')
      + `select public.isolated_sandbox_commerce_v1('receipt.read',${sqlJson({ protocol: 'sandbox-commerce-v1', requestId: randomUUID(), receiptId: `scv1_receipt_${result.receiptId}` })},'${SELLER}','22222222-2222-4222-8222-222222222222');`);
    assert.notEqual(other.status, 0);
  });
  const dispatchProof = await runDispatchConcurrencyCases({ q, runQuery, api, bin, args: args(db), env });
  cases.push(...dispatchProof.cases);
  assert.equal(api.counts().grants, 0);
  report = { status: 'passed', engine: version, caseCount: cases.length, cases, sourceHashes: install.sourceHashes,
    dispatchConcurrencyEvidence: dispatchProof.evidence,
    fixtureAdaptation: install.fixtureAdaptation,
    scope: 'Real local SQL and actual source authority/command/receipt functions on synthetic minimum tables and synthetic normalized receipts. No provider authentication, Supabase Auth gateway, app, production or release proof.',
    fixtureLifecycleReset: 'Privileged disposable-fixture resets reactivate the lifecycle between independent cases; product operator transition remains forward-only.' };
} finally {
  // Never remove a possibly-live data directory after an uncertain bootstrap/start.
  assert.ok(!initializationAttempted || initialized, 'Failed bootstrap may have delayed descendants; preserve directory');
  if (startAttempted) {
    let status = run('pg_ctl', ['-D', data, 'status']);
    if (status.status === 0) {
      invoke('pg_ctl', ['-D', data, '-m', 'immediate', '-w', '-t', '15', 'stop']); cleanup.clusterStopped = true;
      status = run('pg_ctl', ['-D', data, 'status']);
    } else if (started && status.status === 3) cleanup.clusterStopped = true;
    assert.equal(status.status, 3, 'Local cluster status uncertain; preserve directory');
    assert.ok(started, 'Failed start may have delayed descendants; preserve directory');
    cleanup.clusterNotRunningVerified = true;
  } else { cleanup.clusterStopped = true; cleanup.clusterNotRunningVerified = true; }
  // Cluster shutdown proves spawned client/server sessions cannot remain active.
  cleanup.sessionsClosed = cleanup.clusterNotRunningVerified;
  fs.rmSync(work, { recursive: true }); cleanup.directoryRemoved = true;
}
assert.ok(report); process.stdout.write(JSON.stringify({ ...report, durationMs: Date.now() - began, cleanup }, null, 2) + '\n');
