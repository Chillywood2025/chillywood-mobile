import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { createHash, webcrypto, randomUUID } from 'node:crypto';
import { Buffer } from 'node:buffer';

// All provider/credential/qualification data below is fabricated. These tests
// exercise source transport and cryptography; they do not qualify RevenueCat.
globalThis.crypto ??= webcrypto;
const require = createRequire(import.meta.url), ts = require('typescript');
const source = readFileSync(new URL('../../supabase/functions/_shared/isolated-test-store-v2-provisioner.ts', import.meta.url), 'utf8');
const compiled = ts.transpileModule(source, { reportDiagnostics: true, compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } });
assert.deepEqual(compiled.diagnostics?.map(d => ({ code: d.code, message: ts.flattenDiagnosticMessageText(d.messageText, '\n') })), []);
const api = {}; new Function('exports', compiled.outputText)(api);
const { runProvisioningStep: step, reconcileProvisioningPages: reconcile, decryptProvisioningEvidence: decrypt, parseProvisioningResponse: parse } = api;
const clock = Date.parse('2026-11-07T12:00:00.000Z');
const planId = '11111111-1111-4111-8111-111111111111', connectionId = '22222222-2222-4222-8222-222222222222';
const origin = 'https://api.revenuecat.com', root = '/v2/projects/synthetic_project';
const canonical = value => JSON.stringify(value, (_key, v) => v && typeof v === 'object' && !Array.isArray(v)
  ? Object.fromEntries(Object.keys(v).sort().map(k => [k, v[k]])) : v);
const hash = value => createHash('sha256').update(canonical(value)).digest('hex');
const config = () => ({ enabled: true, qualification: 'qualified', connectionId, connectionRevision: 1,
  providerConfigurationDigest: 'a'.repeat(64), qualificationEvidenceSha256: 'b'.repeat(64), projectId: 'synthetic_project', appId: 'synthetic_app',
  credentialRef: 'synthetic-not-a-real-secret-reference', credentialVersion: 'synthetic-key-v1', secret: 'synthetic-secret-not-a-real-provider-key',
  encryption: { keyId: 'synthetic-storage-v1', key: new Uint8Array(32).fill(17) },
  limits: { timeoutMs: 100, maxResponseBytes: 65536, pageSize: 2, maxPages: 3, maxItems: 6 } });
const plan = () => ({ offeringLookupKey: 'scv2_offering_synthetic', offeringDisplayName: 'Synthetic isolated tip',
  packageLookupKey: 'scv2_package_synthetic', packageDisplayName: 'Synthetic tip package', providerOfferingId: 'ofrng_synthetic', providerPackageId: 'pk_synthetic',
  providerProductId: 'prod_synthetic', storeIdentifier: 'synthetic_tip_199', qualifiedProductType: 'one_time', qualifiedProductState: 'synthetic_qualified_state', qualifiedOneTimeConsumable: true });
const selection = (operation = 'create_offering', patch = {}) => ({ planId, operation, requestId: randomUUID(), cursor: null, ...patch });
const ticket = (s = selection(), patch = {}) => ({ ...s, protocol: api.PROVISIONER_PROTOCOL, ticketId: randomUUID(),
  connectionId, connectionRevision: 1, providerConfigurationDigest: 'a'.repeat(64), projectId: 'synthetic_project', appId: 'synthetic_app',
  credentialVersion: 'synthetic-key-v1', validUntil: new Date(clock + 4000).toISOString(), plan: plan(), ...patch });
const offering = (patch = {}) => ({ object: 'offering', id: 'ofrng_synthetic', lookup_key: plan().offeringLookupKey,
  display_name: plan().offeringDisplayName, project_id: 'synthetic_project', state: 'active', is_current: false, created_at: clock, ...patch });
const pkg = (patch = {}) => ({ object: 'package', id: 'pk_synthetic', lookup_key: plan().packageLookupKey,
  display_name: plan().packageDisplayName, position: 1, created_at: clock, ...patch });
const product = (patch = {}) => ({ object: 'product', id: 'prod_synthetic', store_identifier: plan().storeIdentifier,
  app_id: 'synthetic_app', state: plan().qualifiedProductState, type: 'one_time', one_time: { is_consumable: true }, ...patch });
const list = (path, items, next = undefined) => ({ object: 'list', items, url: origin + path, ...(next === undefined ? {} : { next_page: next }) });
const response = (body, status = 201, headers = {}) => new Response(typeof body === 'string' ? body : JSON.stringify(body), { status, headers: { 'content-type': 'application/json', ...headers } });
function fixture(options = {}) {
  const seenRequests = new Set(), usedPosts = new Set(), records = [], calls = [], tickets = [], claims = [];
  const cfg = options.config ?? config();
  const deps = {
    now: options.now ?? (() => clock),
    claim: options.claim ?? (async s => {
      claims.push(structuredClone(s));
      if (seenRequests.has(s.requestId) || (s.operation.startsWith('create_') || s.operation === 'attach_product') && usedPosts.has(s.operation))
        return { status: 'outcome_unknown' };
      seenRequests.add(s.requestId); if (s.operation.startsWith('create_') || s.operation === 'attach_product') usedPosts.add(s.operation);
      const t = ticket(s); options.changeTicket?.(t); tickets.push(t);
      return { status: 'send_permit_consumed', ticket: t };
    }),
    fetch: async (url, init) => { calls.push({ url, init }); return options.fetch ? options.fetch(url, init) : response(offering()); },
    record: async record => { records.push(structuredClone(record)); return options.record ? options.record(record)
      : { status: 'recorded', ticketId: record.ticketId, evidenceSha256: hash(record.evidence), ackAllowed: true }; },
  };
  return { cfg, deps, records, calls, tickets, claims };
}
test('all provider JSON strings and keys reject unrepresentable Unicode without losing exact encrypted bytes',async()=>{
 const malformed=['\ud800','\udfff','\u0000'];
 for(const bad of malformed) for(const change of [v=>v.items[0].display_name=bad,v=>v.items[0].lookup_key=bad,
  v=>v.items[0].state=bad,v=>v.items[0].unknown=bad,v=>v.items[0][bad]='value',v=>v.url+=bad]){
  const value=list(root+'/offerings?limit=2',[offering()]);change(value);const raw=JSON.stringify(value);
  const f=fixture({fetch:async()=>response(raw,200)}),result=await step(selection('list_offerings'),f.cfg,f.deps);
  assert.equal(result.status,'recorded');assert.equal(result.observation.kind,'invalid');assert.deepEqual(result.observation.items,[]);
  assert.equal(result.observation.issue,'unrepresentable_json_string');
  assert.equal(new TextDecoder().decode(await decrypt(f.records[0].evidence,f.records[0].observation,f.tickets[0],f.cfg)),raw);
 }
 const valid=list(root+'/offerings?limit=2',[offering({display_name:'valid \ud83d\ude00',unknown:'literal \\ud800'})]);
 assert.equal(parse(new TextEncoder().encode(JSON.stringify(valid)),200,ticket(selection('list_offerings')),2).kind,'list');
});
test('product attachment error and consumed-ticket strings cannot inject unrepresentable SQL observations',async()=>{
 for(const [operation,value,status] of [['read_product',product({store_identifier:'bad\ud800'}),200],
  ['list_package_products',list(root+'/packages/pk_synthetic/products?limit=2',[{product:product(),eligibility_criteria:'bad\udfff'}]),200],
  ['create_offering',{type:'error',message:'bad\u0000'},400]]){
  const f=fixture({fetch:async()=>response(value,status)}),out=await step(selection(operation),f.cfg,f.deps);
  assert.equal(out.status,'recorded');assert.equal(out.observation.kind,'invalid');
  assert.deepEqual(JSON.parse(new TextDecoder().decode(await decrypt(f.records[0].evidence,f.records[0].observation,f.tickets[0],f.cfg))),value);
 }
 for(const field of ['offeringLookupKey','offeringDisplayName','packageLookupKey','packageDisplayName','storeIdentifier','qualifiedProductState']){
  const f=fixture({changeTicket:t=>t.plan[field]='bad\ud800'});assert.equal((await step(selection(),f.cfg,f.deps)).status,'outcome_unknown');assert.equal(f.calls.length,0);
 }
});
test('disabled or unqualified configuration never consumes a ticket or invokes transport', async () => {
  for (const c of [null, { ...config(), enabled: false }, { ...config(), qualification: 'pending' }, { ...config(), qualificationEvidenceSha256: null },
    { ...config(), secret: '' }, { ...config(), limits: { ...config().limits, timeoutMs: 5001 } }]) {
    let called = 0; const result = await step(selection(), c, { claim: async () => { called++; }, record: async () => { called++; }, fetch: async () => { called++; } });
    assert.equal(result.status, 'unavailable'); assert.equal(called, 0);
  }
});
test('selector cannot inject URLs, credentials, live scope, cursor on a mutation, or unknown operations', async () => {
  for (const change of [s => s.url = 'https://evil.invalid', s => s.secret = 'injected', s => s.environment = 'live', s => s.operation = 'delete_offering',
    s => s.cursor = 'foreign', s => s.planId = 123, s => s.operation = { toString: () => 'create_offering' }]) {
    const f = fixture(), s = selection(); change(s); const result = await step(s, f.cfg, f.deps);
    assert.equal(result.status, 'unavailable'); assert.equal(f.claims.length, 0); assert.equal(f.calls.length, 0);
  }
});
test('exact documented three POST requests are reconstructed from consumed server tickets', async () => {
  for (const [operation, path, body, raw, status] of [
    ['create_offering', root + '/offerings', { lookup_key: plan().offeringLookupKey, display_name: plan().offeringDisplayName }, offering(), 201],
    ['create_package', root + '/offerings/ofrng_synthetic/packages', { lookup_key: plan().packageLookupKey, display_name: plan().packageDisplayName }, pkg(), 201],
    ['attach_product', root + '/packages/pk_synthetic/actions/attach_products', { products: [{ product_id: 'prod_synthetic', eligibility_criteria: 'all' }] }, pkg(), 200],
  ]) {
    const f = fixture({ fetch: async () => response(raw, status) }), out = await step(selection(operation), f.cfg, f.deps);
    assert.equal(out.status, 'recorded'); assert.equal(out.observation.kind, 'resource'); assert.equal(f.calls.length, 1);
    assert.equal(f.calls[0].url, origin + path); assert.equal(f.calls[0].init.method, 'POST'); assert.equal(f.calls[0].init.redirect, 'error');
    assert.deepEqual(JSON.parse(f.calls[0].init.body), body); assert.equal(f.calls[0].init.headers.authorization, `Bearer ${f.cfg.secret}`);
    assert.equal(out.retryProviderMutation, false); assert.equal(out.grantsAccess, false);
  }
});
test('all exact read routes omit bodies, encode cursor, and consume separate tickets', async () => {
  const cases = [
    ['read_offering', '/offerings/ofrng_synthetic', offering()], ['read_package', '/packages/pk_synthetic', pkg()], ['read_product', '/products/prod_synthetic', product()],
    ['list_offerings', '/offerings?limit=2&starting_after=prior', list(root + '/offerings?limit=2&starting_after=prior', [offering()])],
    ['list_packages', '/offerings/ofrng_synthetic/packages?limit=2&starting_after=prior', list(root + '/offerings/ofrng_synthetic/packages?limit=2&starting_after=prior', [pkg()])],
    ['list_package_products', '/packages/pk_synthetic/products?limit=2&starting_after=prior', list(root + '/packages/pk_synthetic/products?limit=2&starting_after=prior', [{ product: product(), eligibility_criteria: 'all' }])],
  ];
  for (const [operation, path, raw] of cases) {
    const f = fixture({ fetch: async () => response(raw, 200) });
    const out = await step(selection(operation, { cursor: operation.startsWith('list_') ? 'prior' : null }), f.cfg, f.deps);
    assert.equal(out.status, 'recorded'); assert.ok(['resource', 'list'].includes(out.observation.kind));
    assert.equal(f.calls[0].url, origin + root + path); assert.equal(f.calls[0].init.method, 'GET'); assert.equal(f.calls[0].init.body, undefined);
  }
});
test('ticket mismatch, expired lease and unsupported provider identities never reach fetch', async () => {
  for (const changeTicket of [t => t.protocol = 'v1', t => t.connectionId = planId, t => t.connectionRevision++, t => t.projectId = 'live_project',
    t => t.appId = 'live_app', t => t.providerConfigurationDigest = 'c'.repeat(64), t => t.credentialVersion = 'other', t => t.requestId = randomUUID(),
    t => t.operation = 'read_product', t => t.validUntil = new Date(clock).toISOString(), t => t.validUntil = new Date(clock + 5001).toISOString(),
    t => t.plan.providerProductId = 'prod/../../customers', t => t.plan.qualifiedProductType = { toString: () => 'one_time' }, t => t.extra = true]) {
    const f = fixture({ changeTicket }), result = await step(selection(), f.cfg, f.deps);
    assert.equal(result.status, 'outcome_unknown'); assert.equal(f.calls.length, 0);
  }
});
test('a consumed SQL mutation permit cannot be reused even with a new request ID', async () => {
  const f = fixture(), s = selection(); assert.equal((await step(s, f.cfg, f.deps)).status, 'recorded');
  assert.equal((await step(s, f.cfg, f.deps)).status, 'unavailable');
  assert.equal((await step(selection(), f.cfg, f.deps)).status, 'unavailable'); assert.equal(f.calls.length, 1);
});
test('PostgreSQL offset timestamp spelling preserves the same bounded send lease without normalizing invalid dates', async () => {
  for (const value of ['2026-11-07T12:00:04.000123+00:00', '2026-11-07T06:00:04.000123-06:00', '2026-11-07T17:30:04.000123+05:30']) {
    const f = fixture({ changeTicket: t => t.validUntil = value });
    assert.equal((await step(selection(), f.cfg, f.deps)).status, 'recorded'); assert.equal(f.calls.length, 1);
  }
  for (const value of ['2026-11-31T12:00:04.000Z', '2026-11-07T06:00:04.000-24:00', '2026-11-07T06:00:04.000-06:60']) {
    const bad = fixture({ changeTicket: t => t.validUntil = value });
    assert.equal((await step(selection(), bad.cfg, bad.deps)).status, 'outcome_unknown'); assert.equal(bad.calls.length, 0);
  }
});
test('lost claim response leaves outcome unknown with no speculative transport', async () => {
  let claimed = false;
  const f = fixture({ claim: async () => { claimed = true; throw Error('synthetic lost SQL response'); } });
  assert.equal((await step(selection(), f.cfg, f.deps)).status, 'outcome_unknown'); assert.equal(claimed, true); assert.equal(f.calls.length, 0);
});
test('claim timeout cannot launch a late provider request when the SQL promise resolves later', async () => {
  let resolveClaim;
  const f = fixture({ config: { ...config(), limits: { ...config().limits, timeoutMs: 10 } }, claim: () => new Promise(resolve => { resolveClaim = resolve; }) });
  const s = selection(); const result = await step(s, f.cfg, f.deps); assert.equal(result.reason, 'claim_outcome_unknown');
  resolveClaim({ status: 'send_permit_consumed', ticket: ticket(s) }); await new Promise(resolve => setTimeout(resolve, 15));
  assert.equal(f.calls.length, 0); assert.equal(f.records.length, 0);
});
test('real transport timeout aborts and records unknown without retrying the POST', async () => {
  let signal; const f = fixture({ config: { ...config(), limits: { ...config().limits, timeoutMs: 10 } }, fetch: (_url, init) => { signal = init.signal; return new Promise(() => {}); } });
  const result = await step(selection(), f.cfg, f.deps);
  assert.equal(f.calls.length, 1); assert.equal(signal.aborted, true); assert.equal(result.status, 'recorded');
  assert.equal(result.observation.kind, 'transport'); assert.equal(result.observation.issue, 'timeout');
  assert.equal(f.records[0].evidence.transportOutcome, 'timeout'); assert.equal(f.records[0].evidence.rawByteLength, 0);
});
test('partial body failure retains encrypted exact acquired bytes and cannot produce a positive fact', async () => {
  const partial = new TextEncoder().encode('{"object":');
  let pull = 0;
  const f = fixture({ fetch: async () => new Response(new ReadableStream({ pull(controller) { if (pull++ === 0) controller.enqueue(partial); else controller.error(Error('synthetic stream failure')); } }), { status: 201 }) });
  const result = await step(selection(), f.cfg, f.deps); assert.equal(result.observation.kind, 'transport');
  assert.equal(f.records[0].evidence.transportOutcome, 'body_incomplete');
  assert.deepEqual(await decrypt(f.records[0].evidence, f.records[0].observation, f.tickets[0], f.cfg), partial);
});
test('stream and byte limits preserve only bounded negative evidence', async () => {
  const f = fixture({ config: { ...config(), limits: { ...config().limits, maxResponseBytes: 16 } }, fetch: async () => response('x'.repeat(100)) });
  const result = await step(selection(), f.cfg, f.deps); assert.equal(result.observation.kind, 'transport');
  assert.equal(result.observation.issue, 'body_too_large'); assert.equal(f.records[0].evidence.rawByteLength, 16);
  assert.equal(new TextDecoder().decode(await decrypt(f.records[0].evidence, f.records[0].observation, f.tickets[0], f.cfg)), 'x'.repeat(16));
});
test('429, conflict, forbidden and server errors are retained without provider retry', async () => {
  for (const status of [400, 401, 403, 404, 409, 422, 423, 429, 500, 503]) {
    const f = fixture({ fetch: async () => response({ type: 'synthetic_provider_error', message: 'synthetic failure', retryable: true }, status, { 'retry-after': '30' }) });
    const result = await step(selection(), f.cfg, f.deps); assert.equal(result.observation.kind, 'provider_error'); assert.equal(f.calls.length, 1);
    assert.equal(f.records[0].evidence.responseHeaders['retry-after'], '30'); assert.equal(result.retryProviderMutation, false);
  }
});
test('lost durable evidence acknowledgement does not claim success or repeat the mutation', async () => {
  const f = fixture({ record: async () => { throw Error('synthetic lost storage acknowledgement'); } });
  const result = await step(selection(), f.cfg, f.deps); assert.equal(result.status, 'outcome_unknown'); assert.equal(result.reason, 'evidence_outcome_unknown');
  assert.equal(result.observation, null); assert.equal(f.calls.length, 1); assert.equal(f.records.length, 1);
});
test('wrong evidence hash, ticket, false acknowledgement or extra RPC fields are never accepted', async () => {
  for (const mutate of [v => v.evidenceSha256 = 'f'.repeat(64), v => v.ticketId = randomUUID(), v => v.ackAllowed = false, v => v.extra = true]) {
    const f = fixture({ record: async r => { const value = { status: 'recorded', ticketId: r.ticketId, evidenceSha256: hash(r.evidence), ackAllowed: true }; mutate(value); return value; } });
    assert.equal((await step(selection(), f.cfg, f.deps)).status, 'outcome_unknown'); assert.equal(f.calls.length, 1);
  }
});
test('record timeout remains unknown even if durable acknowledgement arrives later', async () => {
  let resolveRecord; const f = fixture({ config: { ...config(), limits: { ...config().limits, timeoutMs: 10 } }, record: () => new Promise(resolve => { resolveRecord = resolve; }) });
  const result = await step(selection(), f.cfg, f.deps); assert.equal(result.status, 'outcome_unknown');
  const record = f.records[0]; resolveRecord({ status: 'recorded', ticketId: record.ticketId, evidenceSha256: hash(record.evidence), ackAllowed: true });
  await new Promise(resolve => setTimeout(resolve, 15)); assert.equal(f.calls.length, 1); assert.equal(f.records.length, 1);
});
test('real AES-GCM evidence binds exact bytes, observation, request and connection without plaintext secret storage', async () => {
  const raw = JSON.stringify(offering(), null, 2), f = fixture({ fetch: async () => response(raw) });
  const result = await step(selection(), f.cfg, f.deps), r = f.records[0];
  assert.equal(result.status, 'recorded'); assert.equal(new TextDecoder().decode(await decrypt(r.evidence, r.observation, f.tickets[0], f.cfg)), raw);
  assert.equal(JSON.stringify(r).includes(f.cfg.secret), false); assert.equal(JSON.stringify(r).includes(raw), false);
  assert.equal(r.evidence.rawSha256, createHash('sha256').update(raw).digest('hex'));
  for (const mutate of [r => r.evidence.pathAndQuery += '?spoof=1', r => r.evidence.connectionRevision++, r => r.evidence.httpStatus = 200,
    r => r.observation.items[0].lookupKey = 'other', r => r.evidence.responseHeaders['retry-after'] = '1', r => r.evidence.encryption.nonce = 'AAAAAAAAAAAAAAAA']) {
    const changed = structuredClone(r); mutate(changed); await assert.rejects(decrypt(changed.evidence, changed.observation, f.tickets[0], f.cfg));
  }
  const retired = { ...f.cfg, enabled: false }; assert.equal(new TextDecoder().decode(await decrypt(r.evidence, r.observation, f.tickets[0], retired)), raw);
});
test('raw parser rejects duplicate keys, malformed UTF-8, nesting and ambiguous numeric coercions', () => {
  const t = ticket();
  for (const raw of [new Uint8Array([255]), new TextEncoder().encode('{"id":"a","id":"b"}'), new TextEncoder().encode('{"x":' + '['.repeat(30) + '0' + ']'.repeat(30) + '}'),
    new TextEncoder().encode(JSON.stringify(offering({ is_current: 'false' }))), new TextEncoder().encode(JSON.stringify(offering({ created_at: String(clock) }))),
    new TextEncoder().encode(JSON.stringify(offering({ id: 123 })))]) assert.equal(parse(raw, 201, t, 2).kind, 'invalid');
});
test('mismatched project, lookup, provider IDs, SKU, app, type and qualified product state fail closed', () => {
  for (const raw of [offering({ project_id: 'other' }), offering({ lookup_key: 'other' }), offering({ id: 'other' }), offering({ display_name: 'other' })]) {
    assert.equal(parse(new TextEncoder().encode(JSON.stringify(raw)), 201, ticket(), 2).kind, 'invalid');
  }
  for (const raw of [product({ app_id: 'other' }), product({ type: 'subscription' }), product({ store_identifier: 'other' }), product({ state: 'active' }), product({ one_time: null })]) {
    assert.equal(parse(new TextEncoder().encode(JSON.stringify(raw)), 200, ticket(selection('read_product')), 2).kind, 'invalid');
  }
});
test('input/config/ticket snapshots cannot change the dispatched request after claim', async () => {
  const c = config(), s = selection(); let resolveClaim, originalTicket;
  const f = fixture({ config: c, claim: () => new Promise(resolve => { resolveClaim = resolve; }) });
  const pending = step(s, c, f.deps);
  c.projectId = 'attacker'; c.secret = 'changed'; c.encryption.key.fill(0); c.limits.maxResponseBytes = 1; s.operation = 'read_product';
  originalTicket = ticket(selection('create_offering', { requestId: s.requestId }));
  resolveClaim({ status: 'send_permit_consumed', ticket: originalTicket });
  const result = await pending;
  assert.equal(result.status, 'recorded'); assert.equal(f.calls[0].url, origin + root + '/offerings');
  assert.equal(f.calls[0].init.headers.authorization, `Bearer ${config().secret}`);
  const originalConfig = config(); assert.ok(await decrypt(f.records[0].evidence, f.records[0].observation, originalTicket, originalConfig));
});
test('changing the original ticket during transport cannot change response expectations', async () => {
  let f;
  f = fixture({ fetch: async () => { f.tickets[0].plan.offeringLookupKey = 'spoofed'; f.tickets[0].projectId = 'other'; return response(offering()); } });
  const result = await step(selection(), f.cfg, f.deps);
  assert.equal(result.status, 'recorded'); assert.equal(result.observation.kind, 'resource');
  assert.equal(result.observation.items[0].lookupKey, plan().offeringLookupKey);
});
test('malicious pagination cannot send credentials to another origin, path, project or repeated cursor', async () => {
  for (const next of ['https://evil.invalid/v2/projects/synthetic_project/offerings?starting_after=ofrng_synthetic',
    origin + '/v2/projects/other/offerings?starting_after=ofrng_synthetic', origin + root + '/customers?starting_after=ofrng_synthetic',
    origin + root + '/offerings?starting_after=wrong', origin + root + '/offerings?starting_after=ofrng_synthetic&url=evil', null]) {
    const f = fixture({ fetch: async () => response(list(root + '/offerings', [offering()], next), 200) });
    const result = await reconcile({ planId, operation: 'list_offerings' }, f.cfg, f.deps);
    assert.equal(result.status, 'held'); assert.equal(f.calls.length, 1);
  }
});
test('multi-page reconciliation consumes a distinct read ticket per page and returns only a candidate fact', async () => {
  const f = fixture({ fetch: async url => url.includes('starting_after=')
    ? response(list(root + '/offerings?limit=2&starting_after=ofrng_other', [offering()]), 200)
    : response(list(root + '/offerings', [offering({ id: 'ofrng_other', lookup_key: 'unrelated' })], origin + root + '/offerings?limit=2&starting_after=ofrng_other'), 200) });
  const result = await reconcile({ planId, operation: 'list_offerings' }, f.cfg, f.deps);
  assert.equal(result.status, 'observed'); assert.equal(result.candidateId, 'ofrng_synthetic'); assert.equal(result.reason, 'candidate_requires_sql_readback');
  assert.equal(f.calls.length, 2); assert.equal(f.records.length, 2); assert.equal(new Set(f.claims.map(v => v.requestId)).size, 2);
  assert.equal(f.calls.every(v => v.init.method === 'GET'), true);
});
test('zero matches is unresolved and two matching lookup keys or repeated identities are held', async () => {
  for (const [items, expected] of [[[], 'unknown'], [[offering(), offering({ id: 'ofrng_second' })], 'held'], [[offering(), offering()], 'held']]) {
    const f = fixture({ fetch: async () => response(list(root + '/offerings', items), 200) });
    const result = await reconcile({ planId, operation: 'list_offerings' }, f.cfg, f.deps); assert.equal(result.status, expected); assert.equal(f.calls.length, 1);
  }
});
test('page and item budgets stop safely without any mutation retry', async () => {
  const c = config(); c.limits.maxPages = 1;
  const f = fixture({ config: c, fetch: async () => response(list(root + '/offerings', [offering()], origin + root + '/offerings?starting_after=ofrng_synthetic'), 200) });
  assert.equal((await reconcile({ planId, operation: 'list_offerings' }, c, f.deps)).reason, 'page_budget_exhausted'); assert.equal(f.calls.length, 1);
  const g = fixture({ config: { ...config(), limits: { ...config().limits, maxItems: 1 } }, fetch: async () => response(list(root + '/offerings', [offering(), offering({ id: 'other', lookup_key: 'unrelated' })]), 200) });
  assert.equal((await reconcile({ planId, operation: 'list_offerings' }, g.cfg, g.deps)).reason, 'item_budget_exhausted'); assert.equal(g.calls.length, 1);
});
test('immutable plan drift between pages consumes no second provider request', async () => {
  let claims = 0; const f = fixture({ changeTicket: t => { if (++claims > 1) t.plan.storeIdentifier = 'changed'; },
    fetch: async () => response(list(root + '/offerings', [offering({ id: 'other', lookup_key: 'unrelated' })], origin + root + '/offerings?starting_after=other'), 200) });
  const result = await reconcile({ planId, operation: 'list_offerings' }, f.cfg, f.deps);
  assert.equal(result.status, 'unknown'); assert.equal(f.calls.length, 1); assert.equal(claims, 2);
});
test('caller mutation while a page is pending cannot switch the reconciliation plan or collection', async () => {
  const input = { planId, operation: 'list_offerings' }; let release, pageStarted;
  const started = new Promise(resolve => { pageStarted = resolve; });
  const f = fixture({ fetch: async url => {
    if (url.includes('starting_after=')) return response(list(root + '/offerings?limit=2&starting_after=other', [offering()]), 200);
    pageStarted(); await new Promise(resolve => { release = resolve; });
    return response(list(root + '/offerings', [offering({ id: 'other', lookup_key: 'unrelated' })], origin + root + '/offerings?starting_after=other'), 200);
  } });
  const pending = reconcile(input, f.cfg, f.deps); await started;
  input.operation = 'list_package_products'; input.planId = randomUUID(); release();
  const result = await pending; assert.equal(result.status, 'observed'); assert.equal(f.calls.length, 2);
  assert.equal(f.calls.every(v => v.url.startsWith(origin + root + '/offerings?')), true);
  assert.equal(f.claims.every(v => v.planId === planId && v.operation === 'list_offerings'), true);
});
test('attachment reconciliation requires the exact qualified product with eligibility all', async () => {
  for (const [item, status] of [[{ product: product(), eligibility_criteria: 'all' }, 'observed'],
    [{ product: product({ id: 'other' }), eligibility_criteria: 'all' }, 'held'],
    [{ product: product(), eligibility_criteria: 'google_sdk_ge_6' }, 'held']]) {
    const f = fixture({ fetch: async () => response(list(root + '/packages/pk_synthetic/products', [item]), 200) });
    assert.equal((await reconcile({ planId, operation: 'list_package_products' }, f.cfg, f.deps)).status, status);
  }
});

const serviceKey = 'synthetic-service-role-key-not-a-real-credential';
const workerRequest = (body = { protocol: 'isolated-test-store-v2-provision-worker', planId }, authorization = `Bearer ${serviceKey}`) =>
  new Request('https://synthetic.invalid/internal-worker', { method: 'POST', headers: { authorization }, body: typeof body === 'string' ? body : JSON.stringify(body) });
test('internal worker is default-off and authenticates the exact service credential before any RPC', async () => {
  let calls = 0;
  const deps = { ...fixture().deps, next: async () => { calls++; return { status: 'registered' }; } };
  assert.equal((await api.createProvisioningWorker(() => null, () => serviceKey, deps)(workerRequest())).status, 503);
  const handler = api.createProvisioningWorker(config, () => serviceKey, deps);
  for (const auth of ['', 'Bearer synthetic-user-jwt', serviceKey, `bearer ${serviceKey}`, `Bearer ${serviceKey}extra`])
    assert.equal((await handler(workerRequest(undefined, auth))).status, 401);
  assert.equal(calls, 0);
  assert.equal((await handler(workerRequest())).status, 200); assert.equal(calls, 1);
});
test('internal worker accepts only a plan ID envelope, rejecting arbitrary selectors and duplicate keys', async () => {
  let calls = 0; const handler = api.createProvisioningWorker(config, () => serviceKey, { ...fixture().deps, next: async () => { calls++; return { status: 'registered' }; } });
  for (const body of [{ protocol: 'v1', planId }, { protocol: 'isolated-test-store-v2-provision-worker', planId, operation: 'create_offering' },
    { protocol: 'isolated-test-store-v2-provision-worker', planId, url: 'https://evil.invalid' },
    `{"protocol":"isolated-test-store-v2-provision-worker","planId":"${planId}","planId":"${connectionId}"}`, 'x'.repeat(2049)])
    assert.equal((await handler(workerRequest(body))).status, 400);
  assert.equal(calls, 0);
});
test('server-selected worker step records evidence then accepts only the exact terminal SQL result', async () => {
  const f = fixture(); let nextCalls = 0;
  const handler = api.createProvisioningWorker(() => f.cfg, () => serviceKey, { ...f.deps, next: async id => {
    assert.equal(id, planId); return ++nextCalls === 1 ? { status: 'step', selector: selection() } : { status: 'registered' };
  } });
  const result = await handler(workerRequest()); assert.equal(result.status, 200);
  assert.deepEqual(await result.json(), { protocol: 'isolated-test-store-v2-provision-worker', status: 'registered', steps: 1, retryProviderMutation: false, grantsAccess: false });
  assert.equal(f.calls.length, 1); assert.equal(f.records.length, 1); assert.equal(nextCalls, 2);
});
test('worker never follows a mismatched selector, extra terminal fields or an uncertain next RPC', async () => {
  for (const next of [async () => ({ status: 'step', selector: selection('read_product', { planId: connectionId }) }),
    async () => ({ status: 'registered', fakeAuthority: true }), async () => { throw Error('private SQL error'); }]) {
    const f = fixture(), handler = api.createProvisioningWorker(() => f.cfg, () => serviceKey, { ...f.deps, next });
    const result = await handler(workerRequest()); assert.equal(result.status, 503); assert.equal(f.calls.length, 0); assert.equal(f.claims.length, 0);
    assert.equal((await result.text()).includes('private SQL'), false);
  }
});
test('eight-step worker cap cannot turn the next selector into a ninth provider request', async () => {
  const f = fixture({ fetch: async () => response(product(), 200) }); let nextCalls = 0;
  const handler = api.createProvisioningWorker(() => f.cfg, () => serviceKey, { ...f.deps, next: async () => { nextCalls++; return { status: 'step', selector: selection('read_product') }; } });
  const result = await handler(workerRequest()); assert.equal(result.status, 202); assert.equal((await result.json()).steps, 8);
  assert.equal(f.calls.length, 8); assert.equal(nextCalls, 9);
});
test('worker halts immediately on transport or storage uncertainty without asking SQL for another operation', async () => {
  for (const options of [{ fetch: async () => { throw Error('synthetic reset'); } }, { record: async () => { throw Error('synthetic storage loss'); } }]) {
    const f = fixture(options); let nextCalls = 0;
    const handler = api.createProvisioningWorker(() => f.cfg, () => serviceKey, { ...f.deps, next: async () => { nextCalls++; return { status: 'step', selector: selection() }; } });
    const result = await handler(workerRequest()); assert.equal(result.status, 503); assert.equal(f.calls.length, 1); assert.equal(nextCalls, 1);
  }
});
function edge(environment = {}, rpc = async () => ({ status: 'registered' }), providerFetch = async () => { throw Error('unexpected synthetic provider call'); }) {
  const edgeSource = readFileSync(new URL('../../supabase/functions/isolated-test-store-provisioner-v2/index.ts', import.meta.url), 'utf8').replaceAll('import.meta.main', 'false');
  const output = ts.transpileModule(edgeSource, { reportDiagnostics: true, compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } });
  assert.deepEqual(output.diagnostics?.map(d => d.code), []);
  const exports = {}, calls = [];
  new Function('exports', 'require', 'Deno', 'fetch', output.outputText)(exports, specifier => {
    if (specifier === '../_shared/isolated-test-store-v2-provisioner.ts') return api;
    assert.equal(specifier, '../_shared/stripe-connect.ts');
    return { createAdminClient: () => ({ configured: true, client: { rpc: async (name, args) => { calls.push({ name, args }); return { data: await rpc(name, args), error: null }; } } }) };
  }, { env: { get: name => environment[name] } }, providerFetch);
  return { ...exports, calls };
}
const workerEnv = () => ({ TEST_STORE_V2_PROVISIONING_ENABLED: 'true', TEST_STORE_V2_CONNECTION_ID: connectionId,
  TEST_STORE_V2_CONNECTION_REVISION: '1', TEST_STORE_V2_PROJECT_ID: config().projectId, TEST_STORE_V2_APP_ID: config().appId,
  TEST_STORE_V2_PROVIDER_CONFIGURATION_DIGEST: config().providerConfigurationDigest,
  TEST_STORE_V2_PROVISIONING_QUALIFICATION_SHA256: config().qualificationEvidenceSha256,
  TEST_STORE_V2_PROVIDER_CREDENTIAL_REF: config().credentialRef, TEST_STORE_V2_PROVIDER_CREDENTIAL_VERSION: config().credentialVersion,
  TEST_STORE_V2_PROVIDER_CREDENTIAL_SECRET: config().secret, TEST_STORE_V2_STORAGE_KEY_ID: config().encryption.keyId,
  TEST_STORE_V2_STORAGE_KEY_BASE64: Buffer.from(config().encryption.key).toString('base64'), SUPABASE_SERVICE_ROLE_KEY: serviceKey });
test('actual worker Edge has no default-on or legacy/receipt secret fallback', async () => {
  for (const env of [{}, { ...workerEnv(), TEST_STORE_V2_PROVISIONING_ENABLED: 'false' },
    { ...workerEnv(), TEST_STORE_V2_PROVIDER_CREDENTIAL_SECRET: undefined, TEST_STORE_V2_AUTHORIZATION_VALUE: config().secret },
    { ...workerEnv(), TEST_STORE_V2_STORAGE_KEY_BASE64: 'bad' }, { ...workerEnv(), TEST_STORE_V2_CONNECTION_REVISION: '01' }]) {
    const f = edge(env); assert.equal((await f.handler(workerRequest())).status, 503); assert.equal(f.calls.length, 0);
  }
  const f = edge(workerEnv()); assert.equal((await f.handler(workerRequest(undefined, 'Bearer fake-user-jwt'))).status, 401); assert.equal(f.calls.length, 0);
});
test('actual worker Edge maps only approved next/claim/record RPCs and authenticated fixed-origin transport', async () => {
  let nextCalls = 0, issued, recorded, fetched = 0;
  const f = edge(workerEnv(), async (name, args) => {
    if (name.endsWith('_next_v1')) { assert.deepEqual(args, { p_plan_id: planId }); return ++nextCalls === 1 ? { status: 'step', selector: selection() } : { status: 'registered' }; }
    if (name.endsWith('_claim_v1')) {
      assert.deepEqual(Object.keys(args).sort(), ['p_cursor', 'p_operation', 'p_plan_id', 'p_request_id']);
      issued = ticket({ planId: args.p_plan_id, operation: args.p_operation, requestId: args.p_request_id, cursor: args.p_cursor }, { validUntil: new Date(Date.now() + 4000).toISOString() });
      return { status: 'send_permit_consumed', ticket: issued };
    }
    assert.equal(name, 'isolated_test_store_v2_provisioning_record_v1');
    assert.deepEqual(Object.keys(args).sort(), ['p_evidence', 'p_observation', 'p_ticket_id']); recorded = args;
    return { status: 'recorded', ticketId: args.p_ticket_id, evidenceSha256: hash(args.p_evidence), ackAllowed: true };
  }, async (url, init) => { fetched++; assert.equal(url, origin + root + '/offerings'); assert.equal(init.redirect, 'error');
    assert.equal(init.headers.authorization, `Bearer ${config().secret}`); return response(offering()); });
  const result = await f.handler(workerRequest()); assert.equal(result.status, 200); assert.equal(fetched, 1);
  assert.deepEqual(f.calls.map(v => v.name), ['isolated_test_store_v2_provisioning_next_v1', 'isolated_test_store_v2_provisioning_claim_v1',
    'isolated_test_store_v2_provisioning_record_v1', 'isolated_test_store_v2_provisioning_next_v1']);
  const c = config(); c.limits.pageSize = 100; c.limits.maxResponseBytes = 262144;
  assert.deepEqual(JSON.parse(new TextDecoder().decode(await decrypt(recorded.p_evidence, recorded.p_observation, issued, c))), offering());
});
