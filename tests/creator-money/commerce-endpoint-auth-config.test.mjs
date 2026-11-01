import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHmac } from 'node:crypto';
import ts from 'typescript';

const root = 'supabase/functions/';
function load(file, { Deno = {}, modules = {} } = {}) {
  const module = { exports: {} };
  const require = name => {
    if (Object.hasOwn(modules, name)) return modules[name];
    if (name.startsWith('jsr:')) return {};
    throw Error(`Unexpected import: ${name}`);
  };
  const code = ts.transpileModule(readFileSync(root + file, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  new Function('require', 'module', 'exports', 'Deno', code)(require, module, module.exports, Deno);
  return module.exports;
}

test('commerce gateway configuration retains user JWTs on checkouts and explicit alternate authentication only on callbacks/workers', () => {
  const config = readFileSync('supabase/config.toml', 'utf8');
  for (const [name, expected] of Object.entries({
    'stripe-event-auction-checkout': true,
    'stripe-room-auction-checkout': true,
    'stripe-event-auction-webhook': false,
    'stripe-room-auction-webhook': false,
    'google-play-external-reporter': false,
  })) {
    const blocks = [...config.matchAll(/^\[functions\.([^\]]+)\]\s*\n([\s\S]*?)(?=^\[|$(?![\s\S]))/gm)]
      .filter(match => match[1] === name);
    assert.equal(blocks.length, 1, `${name} must have one unambiguous gateway section`);
    const values = [...blocks[0][2].matchAll(/^verify_jwt\s*=\s*(true|false)\s*$/gm)];
    assert.equal(values.length, 1, `${name} must explicitly specify its JWT behavior`);
    assert.equal(values[0][1], String(expected), name);
  }
});

test('both auction callbacks use real HMAC verification and reject another endpoint secret before privileged projection', async () => {
  const ids = {
    quote: '11111111-1111-4111-8111-111111111111', buyer: '22222222-2222-4222-8222-222222222222',
    creator: '33333333-3333-4333-8333-333333333333', auction: '44444444-4444-4444-8444-444444444444',
  };
  for (const kind of ['event', 'room']) {
    const key = `STRIPE_${kind.toUpperCase()}_AUCTION_WEBHOOK_SECRET`;
    const secret = `whsec_synthetic_${kind}_authentication_fixture`;
    const env = { [key]: secret, SUPABASE_URL: 'https://fixture.supabase.co', SUPABASE_SERVICE_ROLE_KEY: 'synthetic-only' };
    const calls = []; let handler;
    const Deno = { env: { get: name => env[name] }, serve: fn => { handler = fn; } };
    const stripe = load('_shared/stripe-connect.ts', { Deno, modules: {
      './exact-subject-authority.ts': load('_shared/exact-subject-authority.ts'),
      'npm:@supabase/supabase-js@2': { createClient: () => ({ rpc: async (name, args) => {
        calls.push({ name, args }); return { data: { status: 'fulfilled' }, error: null };
      } }) },
    } });
    const parser = load(`_shared/stripe-${kind}-auction-evidence.ts`, { modules: {
      './google-play-stripe-tax-evidence.ts': load('_shared/google-play-stripe-tax-evidence.ts'),
    } });
    load(`stripe-${kind}-auction-webhook/index.ts`, { Deno, modules: {
      '../_shared/stripe-connect.ts': stripe,
      [`../_shared/stripe-${kind}-auction-evidence.ts`]: parser,
    } });
    const now = Math.floor(Date.now() / 1000);
    const raw = JSON.stringify({ id: 'evt_AuthenticationFixture', type: 'checkout.session.completed',
      account: 'acct_fixture', livemode: false, created: now, data: { object: {
        id: 'cs_test_AuthenticationFixture', object: 'checkout.session', livemode: false,
        mode: 'payment', status: 'complete', payment_status: 'paid', payment_intent: 'pi_Fixture',
        amount_total: 237, amount_subtotal: 237, currency: 'usd', client_reference_id: ids.quote,
        metadata: { auction_quote_id: ids.quote, buyer_user_id: ids.buyer, creator_user_id: ids.creator,
          auction_id: ids.auction, provider_product_id: 'prod_Fixture', environment: 'test', rail: `stripe_${kind}_auction` },
      } } });
    const signature = (keyValue = secret, timestamp = now) => `t=${timestamp},v1=${createHmac('sha256', keyValue)
      .update(`${timestamp}.${raw}`).digest('hex')}`;
    const send = (body, header) => handler(new Request('https://fixture.invalid', {
      method: 'POST', body, headers: { authorization: 'Bearer synthetic-user-token', ...(header ? { 'stripe-signature': header } : {}) },
    }));
    for (const [body, header] of [
      [raw, null], [raw, signature('whsec_different_endpoint')], [raw + ' ', signature()],
      [raw, signature(secret, now - 302)], [raw, signature(secret, now + 302)],
      [raw, `t=${now},v1=not-hex`],
    ]) {
      assert.equal((await send(body, header)).status, 400, kind);
      assert.equal(calls.length, 0, 'rejected authentication cannot reach the service-role projection');
    }
    assert.equal((await send(raw, signature())).status, 200);
    assert.equal(calls.length, 1);
    assert.equal(calls[0].name, `process_stripe_${kind}_auction_receipt`);
    delete env[key];
    assert.equal((await send(raw, signature())).status, 503);
    assert.equal(calls.length, 1, 'missing signing configuration cannot process even previously valid signatures');
  }
});

test('reporter settings never bypass its dedicated credential or independently authorize Google calls', async () => {
  const secret = 'synthetic-reporter-credential-' + 'x'.repeat(40);
  const cases = [
    { auth: null, status: 401 },
    { auth: 'Bearer synthetic-user-JWT', status: 401 },
    { env: { GOOGLE_PLAY_EXTERNAL_REPORTER_WORKER_SECRET: undefined }, status: 401 },
    { env: { GOOGLE_PLAY_EXTERNAL_REPORTER_WORKER_SECRET: 'x'.repeat(31) }, auth: 'Bearer ' + 'x'.repeat(31), status: 401 },
    { env: { GOOGLE_PLAY_EXTERNAL_REPORTING_ENABLED: 'false' }, status: 503 },
    { env: { GOOGLE_PLAY_EXTERNAL_LICENSE_TEST_MODE: 'false' }, status: 503 },
    { env: { GOOGLE_PLAY_EXTERNAL_REPORTER_SERVICE_ACCOUNT_JSON: undefined }, status: 503 },
    { method: 'GET', status: 405 },
  ];
  for (const entry of cases) {
    const calls = []; let handler;
    const env = { GOOGLE_PLAY_EXTERNAL_REPORTER_WORKER_SECRET: secret, GOOGLE_PLAY_EXTERNAL_REPORTING_ENABLED: 'true',
      GOOGLE_PLAY_EXTERNAL_LICENSE_TEST_MODE: 'true', GOOGLE_PLAY_EXTERNAL_REPORTER_SERVICE_ACCOUNT_JSON: 'synthetic-only', ...entry.env };
    load('google-play-external-reporter/index.ts', { Deno: { serve: fn => { handler = fn; } }, modules: {
      '../_shared/stripe-connect.ts': {
        readOptionalEnv: name => env[name], jsonResponse: (status, body) => new Response(JSON.stringify(body), { status }),
        createAdminClient: () => { calls.push('admin'); throw Error('unexpected privileged client'); },
      },
      '../_shared/merch-observation-budget.ts': load('_shared/merch-observation-budget.ts'),
      '../_shared/google-refund-tax-reconciliation.ts': load('_shared/google-refund-tax-reconciliation.ts', { modules: {
        './stripe-refund-tax-evidence.ts': load('_shared/stripe-refund-tax-evidence.ts'),
      } }),
      '../_shared/google-play-reporter-oauth.ts': { googlePlayReporterAccessToken: async () => { calls.push('oauth'); throw Error('unexpected OAuth'); } },
      '../_shared/google-play-external-reporting.ts': { submitExternalReport: async () => { calls.push('provider'); throw Error('unexpected provider'); } },
    } });
    const auth = Object.hasOwn(entry, 'auth') ? entry.auth : `Bearer ${secret}`;
    const originalFetch = globalThis.fetch;
    globalThis.fetch = async () => { calls.push('transport'); throw Error('unexpected provider transport'); };
    try {
      const response = await handler(new Request('https://fixture.invalid', {
        method: entry.method ?? 'POST', headers: auth === null ? {} : { authorization: auth },
      }));
      assert.equal(response.status, entry.status);
      assert.deepEqual(calls, [], 'invalid credential/setup must stop before admin, OAuth or provider work');
    } finally { globalThis.fetch = originalFetch; }
  }
});
