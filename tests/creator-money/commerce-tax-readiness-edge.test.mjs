import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

// The actual endpoint and shared adapter execute unchanged. Only network,
// authentication and database boundaries use explicit synthetic fixtures.
function load(file, modules = {}, extras = {}) {
  const context = { exports: {}, Response, Request, URL, URLSearchParams, AbortSignal,
    require: name => {
      if (name.startsWith('jsr:')) return {};
      assert.ok(Object.hasOwn(modules, name), `Unexpected import ${name}`);
      return modules[name];
    }, ...extras };
  vm.runInNewContext(ts.transpileModule(readFileSync(`supabase/functions/${file}`, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText, context);
  return context.exports;
}
const ids = Object.fromEntries(['buyer', 'session', 'quote', 'attempt', 'creator', 'auction', 'product']
  .map((key, i) => [key, `${i + 1}1111111-1111-4111-8111-111111111111`]));

test('actual readiness helper never promotes missing or malformed database evidence to ready', async () => {
  const { readCommerceTaxReadiness } = load('_shared/commerce-tax-readiness.ts');
  const input = { feature: 'event_auction', identityId: ids.quote, productId: 'prod_fixture',
    accountId: 'acct_platform', environment: 'test', permittedScope: 'worldwide' };
  for (const result of [{ data: null }, { error: { message: 'database unavailable' } },
    { data: false }, { data: {} }, { data: { ready: true } },
    { data: { ready: 'true', reason: 'tax_qualification_missing' } },
    { data: { ready: false, reason: 'tax_qualification_missing' } }]) {
    const client = { rpc: async () => result };
    const actual = await readCommerceTaxReadiness(client, input);
    assert.equal(actual.ready, false, JSON.stringify(result));
  }
});

test('actual helper preserves verified policy parameters and rejects incompatible auction pricing', async () => {
  const { readCommerceTaxReadiness, commerceTaxParameters } = load('_shared/commerce-tax-readiness.ts');
  const input = { feature: 'event_auction', identityId: ids.quote, productId: 'prod_fixture',
    accountId: 'acct_platform', environment: 'test', permittedScope: 'worldwide' };
  const policy = { ready: true, policyId: ids.product, taxBehavior: 'inclusive', taxCode: 'txcd_10000000',
    liabilityType: 'self', liabilityAccountId: null, collectionMode: 'automatic' };
  const calls = [];
  const client = { rpc: async (name, args) => { calls.push({ name, args }); return { data: policy }; } };
  const actual = await readCommerceTaxReadiness(client, input);
  assert.equal(actual.ready, true);
  assert.equal(calls[0].name, 'bind_commerce_tax_checkout_policy');
  assert.deepEqual(JSON.parse(JSON.stringify(calls[0].args)), { p_feature: input.feature, p_identity_id: input.identityId,
    p_product_id: input.productId, p_account_id: input.accountId, p_environment: input.environment, p_permitted_scope: input.permittedScope });
  const params = commerceTaxParameters(actual);
  assert.equal(params['automatic_tax[enabled]'], 'true');
  assert.equal(params['automatic_tax[liability][type]'], 'self');
  assert.equal(params['line_items[0][price_data][tax_behavior]'], 'inclusive');
  assert.equal(params['metadata[commerce_tax_policy_id]'], ids.product);
  for (const patch of [{ taxBehavior: 'exclusive' }, { policyId: 'unbound' }, { taxCode: '' },
    { liabilityType: 'account', liabilityAccountId: null }, { liabilityType: 'self', liabilityAccountId: 'acct_other' },
    { collectionMode: 'store_handled' }]) {
    assert.equal((await readCommerceTaxReadiness({ rpc: async () => ({ data: { ...policy, ...patch } }) }, input)).ready, false);
  }
  const verifiedNoCollection = commerceTaxParameters({ ...actual, collectionMode: 'verified_no_collection' });
  assert.equal(verifiedNoCollection['automatic_tax[enabled]'], 'false');
  assert.equal(verifiedNoCollection['automatic_tax[liability][type]'], undefined);
});

async function blockedCheckout(kind, { authenticated = true, taxResult = { ready: false, reason: 'tax_qualification_missing' },
  providerAccountId = 'acct_platform', sessionPatch = {} } = {}) {
  let handler;
  const calls = [], providerCalls = [], readinessCalls = [];
  const q = { startAuthorized: true, environment: 'test', buyerId: ids.buyer, quoteId: ids.quote,
    checkoutAttemptId: ids.attempt, routeKind: 'external_browser_checkout', platform: 'web', storefrontCountry: 'US',
    creatorId: ids.creator, auctionId: ids.auction, amountMinor: 1000, currency: 'usd',
    providerAccountId: 'acct_platform', recipientAccountId: 'acct_creator', settlementContractId: ids.quote,
    settlementPolicy: 'auction_platform_net_80_20_v1', chargePattern: 'platform_separate_transfer',
    financialAuthority: false, providerProductId: 'prod_fixture', expiresAt: new Date(Date.now() + 3600000).toISOString(),
    partyId: 'fixture-party', roomSessionId: ids.session, claimId: ids.quote, sourceKind: 'party_admission' };
  const product = { id: ids.product, provider: 'stripe_physical_goods', environment: 'sandbox', status: 'sandbox',
    is_physical_good: true, creates_digital_access: false, price_minor: 1000, currency: 'usd' };
  const query = { select() { return this; }, limit() { return this; }, eq() { return this; },
    update(values) { calls.push({ name: 'update_merch_order', values }); return this; },
    async maybeSingle() { return { data: product }; } };
  const client = { from: () => query, rpc: async (name, args) => {
    calls.push({ name, args });
    if (name === 'bind_commerce_tax_checkout_policy') { readinessCalls.push(args); return { data: taxResult }; }
    if (name.startsWith('prepare_creator_')) return { data: q };
    if (name === 'reserve_merch_checkout_for_actor_with_tracking') return { data: { id: ids.quote,
      priceMinor: 1000, currency: 'usd', title: 'Synthetic product', createdAt: new Date().toISOString() } };
    throw Error(`Unexpected database call ${name}`);
  } };
  const env = { STRIPE_AUCTION_PLATFORM_TEST_KEY: 'sk_test_fixture', STRIPE_AUCTION_PLATFORM_TEST_ACCOUNT_ID: 'acct_platform',
    STRIPE_EVENT_AUCTION_RETURN_URL: 'https://fixture.invalid/return', STRIPE_ROOM_AUCTION_RETURN_URL: 'https://fixture.invalid/return',
    STRIPE_MERCH_RECONCILIATION_ACCOUNT_ID: 'acct_platform' };
  const stripe = {
    authenticateRequest: async () => authenticated ? { user: { id: ids.buyer } } : { error: Response.json({ error: 'unauthorized' }, { status: 401 }) },
    createAdminClient: () => ({ configured: true, client }), createAuthClient: () => ({ supabaseUrl: 'https://fixture.supabase.test', supabaseAnonKey: 'synthetic' }),
    jsonResponse: (status, body) => Response.json(body, { status }), optionsResponse: () => new Response(), readOptionalEnv: key => env[key],
    userHasPlatformRole: async () => true, parseJsonPayload: async req => ({ value: await req.json() }),
    readStripeTestSecret: () => ({ configured: true, secret: 'sk_test_fixture' }), toText: value => typeof value === 'string' ? value : '',
    safeWriteAuditLog: async () => {}, sanitizeErrorMessage: value => String(value), notConfiguredPayload: () => ({}),
  };
  const tax = load('_shared/commerce-tax-readiness.ts');
  load(`stripe-${kind === 'merch' ? 'merch' : `${kind}-auction`}-checkout/index.ts`, {
    'npm:@supabase/supabase-js@2': { createClient: () => client }, '../_shared/stripe-connect.ts': stripe,
    '../_shared/commerce-tax-readiness.ts': tax,
    '../_shared/exact-subject-authority.ts': { readExactCurrentSessionAuthority: async () => ({ userId: ids.buyer, sessionGeneration: ids.session }),
      readExactBetaAccess: async () => true, parseExactCurrentSessionAuthority: () => ({ userId: ids.buyer, sessionGeneration: ids.session }) },
  }, { Deno: { serve: fn => { handler = fn; } }, fetch: async (url, options) => {
    if (url.includes('/rest/v1/rpc/')) return Response.json({});
    providerCalls.push({ url, method: options.method });
    if (url === 'https://api.stripe.com/v1/account') return Response.json({ object: 'account', id: providerAccountId });
    if (kind === 'merch' && taxResult.ready === true && url === 'https://api.stripe.com/v1/checkout/sessions') {
      assert.equal(options.method, 'POST');
      assert.equal(options.headers['Idempotency-Key'], `chillywood-merch-checkout-${ids.quote}`);
      const params = new URLSearchParams(options.body);
      assert.equal(params.get('automatic_tax[enabled]'), 'true');
      assert.equal(params.get('automatic_tax[liability][type]'), 'self');
      assert.equal(params.get('line_items[0][price_data][tax_behavior]'), 'inclusive');
      assert.equal(params.get('line_items[0][price_data][product_data][tax_code]'), taxResult.taxCode);
      assert.equal(params.get('metadata[commerce_tax_policy_id]'), taxResult.policyId);
      assert.equal(params.get('line_items[0][price_data][unit_amount]'), '1000');
      return Response.json({ object: 'checkout.session', id: 'cs_test_fixture', url: 'https://checkout.stripe.com/c/pay/cs_test_fixture',
        livemode: false, mode: 'payment', client_reference_id: ids.quote, currency: 'usd', amount_total: 1000, amount_subtotal: 1000,
        automatic_tax: { enabled: true, status: 'requires_location' }, metadata: { commerce_tax_policy_id: taxResult.policyId }, ...sessionPatch });
    }
    throw Error('Tax-unqualified checkout must not reach provider session creation');
  } });
  const body = kind === 'merch' ? { product_id: ids.product, attempt_id: ids.attempt, quantity: 1 }
    : { quote_id: ids.quote, attempt_id: ids.attempt };
  const response = await handler(new Request('https://fixture.invalid/checkout', { method: 'POST',
    headers: { authorization: 'Bearer synthetic' }, body: JSON.stringify(body) }));
  return { response, body: await response.json(), calls, providerCalls, readinessCalls };
}

test('merch: qualified synthetic checkout preserves inclusive price and exact reviewed provider parameters', async () => {
  const taxResult = { ready: true, policyId: ids.product, taxBehavior: 'inclusive', taxCode: 'txcd_99999999',
    collectionMode: 'automatic', liabilityType: 'self', liabilityAccountId: null };
  const result = await blockedCheckout('merch', { taxResult });
  assert.equal(result.body.checkoutCreated, true);
  assert.equal(result.body.orderId, ids.quote);
  assert.equal(result.body.liveMoneyAction, false);
  assert.equal(result.providerCalls.filter(call => call.method === 'POST').length, 1);
  assert.equal(result.calls.filter(call => call.name === 'update_merch_order').length, 1);
  for (const sessionPatch of [{ object: 'payment_intent' }, { livemode: true }, { client_reference_id: ids.buyer },
    { currency: 'eur' }, { amount_total: 1001 }, { amount_subtotal: 900 }, { automatic_tax: { enabled: false } },
    { metadata: { commerce_tax_policy_id: ids.auction } }]) {
    const denied = await blockedCheckout('merch', { taxResult, sessionPatch });
    assert.equal(denied.body.checkoutCreated, false, JSON.stringify(sessionPatch));
    assert.equal(denied.body.url, undefined);
    assert.equal(denied.calls.filter(call => call.name === 'update_merch_order').length, 0, 'unverified provider response cannot bind order');
  }
  const wrongAccount = await blockedCheckout('merch', { taxResult, providerAccountId: 'acct_other' });
  assert.equal(wrongAccount.body.checkoutCreated, false);
  assert.equal(wrongAccount.providerCalls.filter(call => call.method === 'POST').length, 0);
});

test('merch: exclusive pricing is explicitly unsupported before any provider request', async () => {
  const result = await blockedCheckout('merch', { taxResult: { ready: true, policyId: ids.product, taxBehavior: 'exclusive',
    taxCode: 'txcd_99999999', collectionMode: 'automatic', liabilityType: 'self', liabilityAccountId: null } });
  assert.equal(result.body.checkoutCreated, false);
  assert.equal(result.body.error, 'tax_pricing_behavior_unsupported');
  assert.equal(result.providerCalls.length, 0);
});

for (const kind of ['event', 'room', 'merch']) {
  test(`${kind}: actual endpoint blocks missing reviewed tax coverage before creating a Stripe session`, async () => {
    const result = await blockedCheckout(kind);
    assert.equal(result.body.checkoutCreated, false);
    assert.equal(result.body.checkoutUrl, undefined);
    assert.equal(result.readinessCalls.length, 1, 'execute actual tax readiness adapter, not unrelated early failure');
    assert.equal(result.providerCalls.filter(call => call.url.includes('/checkout/sessions')).length, 0);
    assert.match(JSON.stringify(result.body), /tax/);
  });
  test(`${kind}: unauthenticated request cannot consult or bind tax policy`, async () => {
    const result = await blockedCheckout(kind, { authenticated: false });
    assert.equal(result.response.status, 401);
    assert.equal(result.calls.length, 0);
    assert.equal(result.providerCalls.length, 0);
  });
}
