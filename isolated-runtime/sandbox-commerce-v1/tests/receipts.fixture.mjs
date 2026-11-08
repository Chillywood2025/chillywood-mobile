// Disposable native receipt fixture. This does not represent provider setup,
// provider-authenticated payloads, Supabase bootstrap or production state.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createHash, randomUUID } from 'node:crypto';

export const SELLER = '11111111-1111-4111-8111-111111111111';
export const SELLER_SESSION = '22222222-2222-4222-8222-222222222222';
export const BUYER = '66666666-6666-4666-8666-666666666666';
export const BUYER_SESSION = '77777777-7777-4777-8777-777777777777';
export const sqlText = value => `'${String(value).replaceAll("'", "''")}'`;
export const sqlJson = value => `${sqlText(JSON.stringify(value))}::jsonb`;
export const syntheticHash = value => createHash('sha256').update(`synthetic-receipt-fixture:${value}`).digest('hex');

export function installSql(here) {
  const declaration = 'create table sandbox_commerce_v1.declarations(user_id uuid primary key,session_id uuid,\n'
    + ' declared_18_plus boolean,country_code text,region_code text,declaration_version text,updated_at timestamptz);';
  const original = fs.readFileSync(path.join(here, 'authority.fixture.sql'), 'utf8');
  assert.equal(original.split(declaration).length, 2, 'Exact fixture declarations CREATE changed; re-review adaptation');
  const files = ['core.sql', 'premium-authority.sql', 'authority.sql', 'commands.sql', 'receipts.sql', 'permissions-finalize.sql'];
  const source = Object.fromEntries(files.map(file => [file, fs.readFileSync(path.join(here, '..', file), 'utf8')]));
  return {
    sql: 'begin;create role anon nologin;create role authenticated nologin;create role service_role nologin;'
      // Deliberately hostile legacy default ACL: fresh-role creation must avoid it.
      + 'alter default privileges for role postgres grant execute on functions to authenticated;'
      + source['core.sql']
      + fs.readFileSync(path.join(here, 'premium-authority.fixture.sql'), 'utf8')
      + original.replace(declaration, '-- Exact declarations table is supplied by the real core.sql above.')
      + source['premium-authority.sql'] + source['authority.sql'] + source['commands.sql'] + source['receipts.sql']
      + source['permissions-finalize.sql'] + 'commit;',
    sourceHashes: Object.fromEntries(files.map(file => [file, createHash('sha256').update(source[file]).digest('hex')])),
    fixtureAdaptation: 'Removed exactly one minimum-fixture declarations CREATE; real core declarations table is used unchanged.',
  };
}

export const providerScopes = {
  app_store: { provider: 'revenuecat', providerScopeKey: JSON.stringify(['revenuecat', 'fixture-project', 'fixture-app', 'APP_STORE', 'SANDBOX']),
    store: 'app_store', sourceEnvironment: 'SANDBOX', semanticContract: 'rc_app_store_tip_v1', amountMinor: 99 },
  google_play: { provider: 'revenuecat', providerScopeKey: JSON.stringify(['revenuecat', 'fixture-project', 'fixture-play-app', 'PLAY_STORE', 'SANDBOX']),
    store: 'google_play', sourceEnvironment: 'SANDBOX', semanticContract: 'rc_google_play_tip_v1', amountMinor: 99 },
  stripe: { provider: 'stripe', providerScopeKey: JSON.stringify(['stripe', 'acct_fixture', 'STRIPE', 'test']),
    store: 'stripe', sourceEnvironment: 'test', semanticContract: 'stripe_platform_tip_v1', amountMinor: 199 },
};

export function fixtureApi(q, runQuery) {
  const parse = sql => JSON.parse(q(sql));
  const actorPrefix = (user, session, role = 'authenticated') => `set role ${role};set request.jwt.claims=${sqlText(JSON.stringify({ role, sub: user, session_id: session }))};`;
  const servicePrefix = "set role service_role;set request.jwt.claims='{" + '"role":"service_role"' + "}';";
  const command = (command, payload, user = BUYER, session = BUYER_SESSION) => parse(actorPrefix(user, session)
    + `select public.isolated_sandbox_commerce_v1(${sqlText(command)},${sqlJson({ protocol: 'sandbox-commerce-v1', requestId: randomUUID(), ...payload })},${sqlText(user)},${sqlText(session)});`);
  const service = expression => parse(servicePrefix + 'select ' + expression + ';');
  const invokeReceipt = receipt => service(`public.isolated_sandbox_ingest_receipt_v1(${sqlJson(receipt)})`);
  const rejectReceipt = receipt => {
    const result = runQuery(servicePrefix + `select public.isolated_sandbox_ingest_receipt_v1(${sqlJson(receipt)});`);
    assert.notEqual(result.status, 0, 'Invalid receipt unexpectedly succeeded');
    return result;
  };
  const reset = () => {
    // Only this disposable schema is reset. It is never an operator reset API.
    const ownTables = q("select string_agg(format('%I.%I',schemaname,tablename),',') from pg_tables where schemaname='sandbox_commerce_v1' and tablename<>'lifecycle';");
    assert.ok(ownTables); q(`truncate ${ownTables};select authority_fixture.reset();
      insert into auth.users(id,email_confirmed_at,raw_app_meta_data) values('${BUYER}',clock_timestamp(),'{}');
      insert into auth.sessions values('${BUYER_SESSION}','${BUYER}',clock_timestamp()+interval '1 hour');
      insert into public.wave1_legal_acceptances
        select '${BUYER}','${BUYER_SESSION}',document_key,version,market,capability,'member',null
        from public.wave1_legal_document_versions where capability='account';
      update sandbox_commerce_v1.lifecycle set state='active',changed_at=clock_timestamp();`);
    assert.equal(q(`select count(*) from public.user_entitlements where user_id='${BUYER}';`), '0');
  };
  const seedCatalog = (name = 'app_store') => {
    const scope = providerScopes[name], catalogId = randomUUID();
    assert.ok(scope); const productId = `fixture.isolated.tip.${name}`;
    q(`insert into sandbox_commerce_v1.provider_routes(provider,scope_key,store,source_environment,semantic_contract,
      qualification_state,ownership_evidence_sha256,delivery_evidence_sha256,adapter_evidence_sha256,initiation_enabled)
      values(${sqlText(scope.provider)},${sqlText(scope.providerScopeKey)},${sqlText(scope.store)},${sqlText(scope.sourceEnvironment)},
      ${sqlText(scope.semanticContract)},'qualified',${sqlText(syntheticHash('ownership'))},${sqlText(syntheticHash('delivery'))},${sqlText(syntheticHash('adapter'))},true);
      insert into sandbox_commerce_v1.catalog(id,kind,provider,scope_key,store,product_id,amount_minor,currency)
      values('${catalogId}','creator_tip',${sqlText(scope.provider)},${sqlText(scope.providerScopeKey)},${sqlText(scope.store)},${sqlText(productId)},${scope.amountMinor},'usd');`);
    return { ...scope, productId };
  };
  const prepare = scope => {
    const resource = command('resource.create', { kind: 'creator_tip', title: 'Synthetic provider tip' }, SELLER, SELLER_SESSION).data.resource;
    const offer = command('offer.publish', { resourceId: resource.id, expectedRevision: resource.revision,
      amountMinor: scope.amountMinor, currency: 'usd' }, SELLER, SELLER_SESSION).data.offer;
    assert.ok(offer); const intent = command('checkout.prepare', { offerId: offer.id, expectedRevision: offer.revision }).data.intent;
    assert.equal(intent.status, 'prepared');
    assert.equal(intent.providerDispatchAllowed, false);
    return { ...scope, resource, offer, intent, rawIntentId: intent.id.replace(/^scv1_intent_/u, ''), dispatchId: randomUUID() };
  };
  const beginDispatch = context => service(`public.isolated_sandbox_begin_dispatch_v1(${sqlText(context.intent.id)},${sqlText(context.dispatchId)})`);
  const bindDispatch = (context, transactionId) => service(`public.isolated_sandbox_bind_dispatch_v1(${sqlText(context.intent.id)},${sqlText(context.dispatchId)},${sqlText(transactionId)})`);
  const receipt = (context, patch = {}) => {
    const suffix = randomUUID().replaceAll('-', '');
    // Provider timestamps are synthetic; a small post-dispatch value avoids
    // microsecond-to-millisecond truncation preceding dispatched_at.
    const databaseMillis = Number(q('select floor(extract(epoch from clock_timestamp())*1000)::bigint;'));
    assert.ok(Number.isSafeInteger(databaseMillis));
    const purchasedAt = new Date(databaseMillis + 2).toISOString(), providerEventAt = new Date(databaseMillis + 3).toISOString();
    const isStripe = context.provider === 'stripe';
    const transaction = isStripe ? `pi_fixture${suffix}` : `fixture-transaction-${suffix}`;
    return { provider: context.provider, providerScopeKey: context.providerScopeKey, store: context.store,
      sourceEnvironment: context.sourceEnvironment, environment: 'sandbox',
      providerEventId: `fixture-event-${suffix}`, providerEventType: isStripe ? 'payment_intent.succeeded' : 'NON_RENEWING_PURCHASE',
      eventType: isStripe ? 'payment_succeeded' : 'non_renewing_purchase', rawBodySha256: syntheticHash(suffix),
      buyerId: BUYER, intentId: isStripe ? context.rawIntentId : null, dispatchId: isStripe ? context.dispatchId : null,
      providerTransactionId: transaction, originalTransactionId: transaction, productId: context.productId,
      purchasedAt, expiresAt: null, amountMinor: context.amountMinor, currency: 'usd', refundedAmountMinor: null,
      providerEventAt, providerObjectType: isStripe ? 'payment_intent' : null, providerStatus: isStripe ? 'succeeded' : null,
      providerAmountReceivedMinor: isStripe ? context.amountMinor : null, providerLivemode: isStripe ? false : null,
      providerConnectedAccountId: null, ...patch };
  };
  const terminal = (initial, kind = 'refund', patch = {}) => ({ ...initial,
    providerEventId: `terminal-${randomUUID()}`, rawBodySha256: syntheticHash(randomUUID()),
    eventType: kind, providerEventType: initial.provider === 'stripe' ? kind === 'dispute' ? 'charge.dispute.created' : 'charge.refunded' : kind === 'revocation' ? 'REVOCATION' : 'REFUND',
    productId: null, purchasedAt: null, expiresAt: null,
    refundedAmountMinor: kind === 'refund' && initial.provider === 'stripe' ? initial.amountMinor : null,
    providerEventAt: new Date(Date.parse(initial.providerEventAt) + 1000).toISOString(),
    providerObjectType: initial.provider === 'stripe' ? kind === 'refund' ? 'charge' : kind === 'dispute' ? 'dispute' : null : null,
    providerStatus: null, providerAmountReceivedMinor: null,
    providerLivemode: initial.provider === 'stripe' ? false : null,
    ...patch });
  const state = original => parse(`select coalesce((select to_jsonb(s) from sandbox_commerce_v1.original_states s
    where provider=${sqlText(original.provider)} and scope_key=${sqlText(original.providerScopeKey)}
      and store=${sqlText(original.store)} and original_transaction_id=${sqlText(original.originalTransactionId)}),'null'::jsonb);`);
  const counts = () => parse(`select jsonb_build_object('receipts',(select count(*) from sandbox_commerce_v1.receipts),
    'ingress',(select count(*) from sandbox_commerce_v1.receipt_ingress),
    'grants',(select count(*) from sandbox_commerce_v1.grants));`);
  return { actorPrefix, servicePrefix, command, service, invokeReceipt, rejectReceipt, reset, seedCatalog,
    prepare, beginDispatch, bindDispatch, receipt, terminal, state, counts };
}
