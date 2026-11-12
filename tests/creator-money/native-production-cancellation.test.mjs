import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import ts from 'typescript';
import { createClient } from '@supabase/supabase-js';

const compile = source => ts.transpileModule(source, { compilerOptions: {
  target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS,
} }).outputText;
const exports = {};
new Function('exports', compile(readFileSync('supabase/functions/_shared/creator-cashout-execution.ts', 'utf8')))(exports);
const { readCashoutBody } = exports;
const deferred = () => { let resolve; const promise = new Promise(r => { resolve = r; }); return { promise, resolve }; };
const receipt = { keyId: '12345678-1234-4234-8234-123456789abc', assertion: '{}', signatureSha256: 'a'.repeat(64) };

for (const kind of ['accounting-worker', 'receipt-verifier']) {
  function fixture({ enabled = true, fetcher } = {}) {
    let serve;
    const calls = [];
    const data = kind === 'accounting-worker' ? { status: 'complete', providerWrite: false }
      : { status: 'HELD', accessGranted: false, financialAuthority: false, payable: false };
    const client = createClient('https://synthetic.invalid', 'synthetic', {
      auth: { persistSession: false, autoRefreshToken: false },
      global: { fetch: async (url, init) => {
        calls.push({ url, init });
        if (fetcher) return fetcher(url, init, data);
        return new Response(JSON.stringify(data), { headers: { 'content-type': 'application/json' } });
      } },
    });
    const source = readFileSync(`supabase/functions/native-production-${kind}/index.ts`, 'utf8').replace(/^import .*;\n/gm, '');
    new Function('Deno', 'readOptionalEnv', 'jsonResponse', 'readCashoutBody', 'createAdminClient', compile(source))(
      { serve: fn => { serve = fn; } }, name => name === 'SUPABASE_SERVICE_ROLE_KEY' ? 'synthetic' : String(enabled),
      (status, body) => new Response(JSON.stringify(body), { status }), readCashoutBody,
      () => ({ configured: true, client }));
    return { calls, run(signal, body = JSON.stringify(kind === 'accounting-worker' ? {} : receipt)) {
      return serve(new Request('https://synthetic.invalid', { method: 'POST', headers: { Authorization: 'Bearer synthetic' }, body, signal, duplex: 'half' }));
    } };
  }
  test(`${kind}: pre-abort and disabled paths issue no transport`, async () => {
    const c = new AbortController(); c.abort();
    const f = fixture(); assert.equal((await f.run(c.signal)).status, 409); assert.equal(f.calls.length, 0);
    const off = fixture({ enabled: false }); assert.equal((await off.run(c.signal)).status, 200); assert.equal(off.calls.length, 0);
  });
  test(`${kind}: abort during real body read cancels stream before RPC`, async () => {
    const c = new AbortController(); let cancelled = false;
    const body = new ReadableStream({ cancel() { cancelled = true; } });
    const f = fixture(); const pending = f.run(c.signal, body); c.abort();
    assert.equal((await pending).status, 409); assert.equal(cancelled, true); assert.equal(f.calls.length, 0);
  });
  test(`${kind}: actual Supabase transport carries abort; late success stays unresolved`, async () => {
    const started = deferred(), finish = deferred(), c = new AbortController();
    const f = fixture({ fetcher: async (_url, init, data) => {
      assert.equal(init.signal.aborted, false); started.resolve(); await finish.promise;
      assert.equal(init.signal.aborted, true);
      return new Response(JSON.stringify(data), { headers: { 'content-type': 'application/json' } });
    } });
    const pending = f.run(c.signal); await started.promise; c.abort(); finish.resolve();
    assert.equal((await pending).status, 409); assert.equal(f.calls.length, 1);
  });
  test(`${kind}: real client success remains successful`, async () => {
    const f = fixture(); assert.equal((await f.run(new AbortController().signal)).status, 200); assert.equal(f.calls.length, 1);
  });
}
