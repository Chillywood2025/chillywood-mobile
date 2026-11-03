import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

// Called by the real disposable SQL fixture immediately after a durable funding
// or payout claim. No modeled context: both adapter reads come from SQL RPCs.
export async function assertSandboxEdgeRecoveryFromSql({rpc, user, requestId, phase}) {
  const compile = source => ts.transpileModule(source, {compilerOptions: {target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS}}).outputText;
  const actual = await rpc('select public.get_sandbox_creator_cashout_execution_context($1)', [requestId]);
  assert.equal(actual.phase, phase);
  assert.equal(actual.environment, 'test');
  const seconds = Math.floor(Date.now() / 1000);
  assert.ok(Number.isFinite(actual.dispatchedAt) && Math.abs(seconds - actual.dispatchedAt) < 120,
    'SQL dispatchedAt must be Unix seconds, not milliseconds');
  const calls = [];
  const transport = async (url, options) => {
    calls.push({url, options});
    assert.equal(options.method, 'GET', 'an unknown durable dispatch can never POST again');
    assert.equal(options.headers.Authorization, 'Bearer rk_test_fixture');
    if (url.endsWith('/v1/account')) return Response.json({object: 'account', id: actual.platformAccountId});
    const parsed = new URL(url);
    assert.equal(parsed.pathname, phase === 'funding_unknown' ? '/v1/transfers' : '/v1/payouts');
    assert.equal(Number(parsed.searchParams.get('created[gte]')), Math.max(0, actual.dispatchedAt - 120));
    if (phase === 'funding_unknown') {
      assert.equal(parsed.searchParams.get('destination'), actual.accountId);
      assert.equal(options.headers['Stripe-Account'], undefined);
    } else assert.equal(options.headers['Stripe-Account'], actual.accountId);
    return Response.json({object: 'list', data: [], has_more: false});
  };
  const runtime = {exports: {}, URLSearchParams, AbortSignal, Date, Error, JSON, Number, RegExp, TextDecoder, Uint8Array, setTimeout, clearTimeout, fetch: transport};
  vm.runInNewContext(compile(fs.readFileSync('supabase/functions/_shared/creator-cashout-execution.ts', 'utf8')), runtime);
  const adapterRpc = (execute, name, args) => {
    assert.ok(['get_sandbox_creator_cashout_execution_context', 'get_my_sandbox_creator_cashout_execution'].includes(name),
      'empty unknown reconciliation must never claim or record a fabricated observation');
    return execute(`select public.${name}($1)`, [args.p_request_id]).then(data => ({data}));
  };
  let handler;
  const bindings = {
    createClient: () => ({rpc: (name, args) => adapterRpc(user, name, args)}),
    createAuthClient: () => ({supabaseUrl: 'https://fixture.supabase.co', supabaseAnonKey: 'anon'}),
    createAdminClient: () => ({configured: true, client: {rpc: (name, args) => adapterRpc(rpc, name, args)}}),
    jsonResponse: (status, body) => Response.json(body, {status}), optionsResponse: () => new Response(null, {status: 204}),
    readOptionalEnv: key => ({SANDBOX_CREATOR_CASHOUT_ENABLED: 'true', STRIPE_CASHOUT_TEST_KEY: 'rk_test_fixture'})[key],
    ...runtime.exports,
  };
  vm.runInNewContext(compile(fs.readFileSync('supabase/functions/sandbox-creator-cashout/index.ts', 'utf8')),
    {exports: {}, require: () => bindings, Deno: {serve: fn => {handler = fn;}}, Date, JSON, Error, Number});
  for (let replay = 0; replay < 2; replay++) {
    const response = await handler(new Request('https://fixture.invalid', {method: 'POST', headers: {Authorization: 'Bearer fixture-user'}, body: JSON.stringify({request_id: requestId})}));
    assert.equal(response.status, 200);
    const result = await response.json();
    assert.equal(result.status, phase, 'empty provider lookup retains unknown state on every replay');
    assert.equal(result.bankPaid, false);
    assert.equal(result.environment, 'test');
  }
  assert.equal(calls.length, 4, 'each replay only reads platform identity and exact isolated provider list');
}
