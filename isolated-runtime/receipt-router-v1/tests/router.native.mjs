#!/usr/bin/env node
// Disposable native PG17 proof. All payloads/credentials below are synthetic.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { randomUUID, createHash, webcrypto } from 'node:crypto';
import { spawn, spawnSync } from 'node:child_process';
globalThis.crypto ??= webcrypto;
assert.equal(process.argv.length, 4); assert.equal(process.argv[2], '--local-bin');
const bin = process.argv[3]; assert.ok(path.isAbsolute(bin));
const here = path.dirname(fileURLToPath(import.meta.url)), runtime = path.dirname(here), repo = path.resolve(runtime, '../..');
const sourceFiles = ['core.sql', 'holds.sql', 'ownership.sql', 'worker.sql', 'permissions-finalize.sql'];
const hashedPaths = [...sourceFiles.map(n => path.join(runtime, n)), fileURLToPath(import.meta.url),
  ...['envelope','planner','handler','worker'].map(n => path.join(repo, `supabase/functions/_shared/revenuecat-router-${n}.ts`))];
const sourceHashes = Object.fromEntries(hashedPaths.map(name => [path.relative(repo, name), createHash('sha256').update(fs.readFileSync(name)).digest('hex')]));
const require = createRequire(import.meta.url), ts = require('typescript'), cache = new Map();
const load = name => {
  if (cache.has(name)) return cache.get(name);
  const result = {}; cache.set(name, result);
  new Function('exports', 'require', ts.transpileModule(fs.readFileSync(path.join(repo, 'supabase/functions/_shared', name), 'utf8'),
    { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText)
    (result, s => load(s.replace(/^\.\//u, '')));
  return result;
};
const { authenticateRevenueCatEnvelope } = load('revenuecat-router-envelope.ts');
const { planRevenueCatObservation } = load('revenuecat-router-planner.ts');
const { runReceiptRouterWorker } = load('revenuecat-router-worker.ts');
const CONN = '11111111-1111-4111-8111-111111111111', BUYER = '22222222-2222-4222-8222-222222222222';
const OTHER = '33333333-3333-4333-8333-333333333333', SCOPE = '44444444-4444-4444-8444-444444444444';
const config = { connectionId: CONN, connectionRevision: 1, projectId: 'fixture-project',
  authentication: { method: 'shared_secret', keyVersion: 'fixture-auth-v1', secret: 'Bearer ' + 'a'.repeat(40) },
  encryption: { keyId: 'fixture-encryption-v1', key: new Uint8Array(32).fill(7) } };
const envelope = async (patch = {}, suffix = '') => {
  const raw = JSON.stringify({ api_version: '1.0', event: { id: 'fixture-event', type: 'NON_RENEWING_PURCHASE',
    app_id: 'fixture-app', store: 'APP_STORE', environment: 'SANDBOX', event_timestamp_ms: 1794052800000,
    app_user_id: BUYER, original_app_user_id: BUYER, aliases: [], product_id: 'fixture-tip',
    original_transaction_id: 'fixture-original', transaction_id: 'fixture-transaction', ...patch } }) + suffix;
  return authenticateRevenueCatEnvelope(new Request('https://fixture.invalid/provider', { method: 'POST',
    headers: { authorization: config.authentication.secret }, body: raw }), config);
};
const lit = s => "'" + String(s).replaceAll("'", "''") + "'", json = v => lit(JSON.stringify(v)) + '::jsonb';
const work = fs.mkdtempSync(path.join(os.tmpdir(), 'receipt-router-native-')), data = path.join(work, 'data');
const db = 'router_' + randomUUID().replaceAll('-', ''), port = '55453';
const env = Object.fromEntries(Object.entries(process.env).filter(([k]) => !k.startsWith('PG')));
const run = (tool, args, input) => spawnSync(path.join(bin, tool), args, { input, encoding: 'utf8', env, timeout: 30000, maxBuffer: 16 * 1024 * 1024 });
const invoke = (tool, args, input) => { const r = run(tool, args, input); assert.equal(r.status, 0, `${tool}: ${r.stderr}\n${r.error?.message ?? ''}`); return r.stdout.trim(); };
const args = name => ['-X', '-q', '-A', '-t', '-v', 'ON_ERROR_STOP=1', '-h', '127.0.0.1', '-p', port, '-U', 'postgres', '-d', name];
const q = sql => invoke('psql', args(db), sql), bad = (sql, pattern) => { const r = run('psql', args(db), sql); assert.notEqual(r.status, 0); assert.match(r.stderr, pattern); };
const service = `set role service_role;set request.jwt.claims='{"role":"service_role"}';`;
const rpc = expression => JSON.parse(q(service + 'select ' + expression + ';'));
const ingest = (e, revision = 1) => rpc(`public.receipt_router_ingest_v1('${CONN}',${revision},${json(e)})`);
const claim = () => rpc(`public.receipt_router_claim_v1('${randomUUID()}')`);
const complete = (j, p) => rpc(`public.receipt_router_complete_plan_v1('${j.eventId}','${j.lease}',${j.leaseGeneration},${json(p)})`);
const reset = () => q(`truncate receipt_router_v1.deliveries,receipt_router_v1.pending_holds,receipt_router_v1.plans,
  receipt_router_v1.jobs,receipt_router_v1.conflicts,receipt_router_v1.subjects,receipt_router_v1.original_admissions,receipt_router_v1.originals,
  receipt_router_v1.events,receipt_router_v1.receipts,receipt_router_v1.catalog,receipt_router_v1.scopes;
  truncate receipt_router_v1.connection_revocations;
  update receipt_router_v1.configuration set ingress_enabled=true,worker_enabled=true,catalog_revision=1,ownership_coverage='incomplete';`);
const catalog = () => q(`insert into receipt_router_v1.scopes values('${SCOPE}','fixture-project','fixture-app','APP_STORE','SANDBOX','fixture-bundle');
  insert into receipt_router_v1.catalog values('${SCOPE}','fixture-tip','isolated_sandbox',1);
  update receipt_router_v1.configuration set ownership_coverage='complete';`);
const bind = receipt => q(`insert into receipt_router_v1.originals values('${SCOPE}','fixture-bundle','APP_STORE','SANDBOX',
  'fixture-original','fixture-tip','isolated_sandbox',1,'${BUYER}','${randomUUID()}',1,'${receipt}');`);
const plan = j => planRevenueCatObservation(j.variants[0].envelope.observation, j.snapshot);
const sessions = new Set();
const startSession = name => {
  const child=spawn(path.join(bin,'psql'),args(db),{env:{...env,PGAPPNAME:name},stdio:['pipe','pipe','pipe']});sessions.add(child);
  let output='',errors='',exited=false;
  child.stdout.on('data',b=>{output+=b;});child.stderr.on('data',b=>{errors+=b;});
  const done=new Promise((resolve,reject)=>{child.once('error',reject);child.once('exit',code=>{exited=true;sessions.delete(child);resolve(code);});});
  return {child,done,output:()=>output,errors:()=>errors,exited:()=>exited};
};
const waitFor=async(predicate,message)=>{const deadline=Date.now()+1500;while(!predicate()&&Date.now()<deadline)await new Promise(resolve=>setTimeout(resolve,10));assert.ok(predicate(),message);};
const holdQuery=(subject=BUYER)=>`receipt_router_v1.read_hold('fixture-project','fixture-app','APP_STORE','SANDBOX','${subject}','legacy_premium',1,null)`;
const cases = [], cleanup = { sessionsClosed: false, clusterStopped: false, clusterNotRunningVerified: false, directoryRemoved: false };
const record = async (name, fn) => { reset(); await fn(); assert.equal(q("select count(*) from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relkind in ('r','p');"), '0'); cases.push(name); };
let initializationAttempted = false, initialized = false, startAttempted = false, started = false, report;
try {
  assert.match(invoke('postgres', ['--version']), /PostgreSQL\) 17\.6/u);
  initializationAttempted = true;
  invoke('initdb', ['-D', data, '-U', 'postgres', '--encoding=UTF8', '--no-locale', '--auth=trust']); initialized = true;
  startAttempted = true;
  invoke('pg_ctl', ['-D', data, '-w', '-t', '15', '-l', path.join(work, 'server.log'), '-o',
    `-c listen_addresses=127.0.0.1 -c unix_socket_directories='' -p ${port} -c max_prepared_transactions=0 -c autovacuum=off`, 'start']); started = true;
  invoke('psql', args('postgres'), `create database ${db};`);
  q(`create role anon nologin;create role authenticated nologin;create role service_role nologin;
    begin;${sourceFiles.map(n => fs.readFileSync(path.join(runtime, n), 'utf8')).join('\n')}commit;`);
  assert.equal(q('select worker_enabled from receipt_router_v1.configuration;'), 'f');
  assert.equal(q('select ingress_enabled from receipt_router_v1.configuration;'), 'f');
  assert.equal(q('select count(*) from receipt_router_v1.connections;'), '0');
  q(`insert into receipt_router_v1.connections values('${CONN}',1,'fixture-project','shared_secret','fixture-auth-v1','fixture-encryption-v1',true),
    ('${CONN}',2,'fixture-project','shared_secret','fixture-auth-v1','fixture-encryption-v1',false);`);

  await record('Fresh private owner, FORCE RLS, service-only wrappers and installer runtime revocation', async () => {
    assert.equal(q("select bool_and(relrowsecurity and relforcerowsecurity) from pg_class where relnamespace='receipt_router_v1'::regnamespace and relkind='r';"), 't');
    assert.equal(q("select rolcanlogin or rolsuper or rolbypassrls from pg_roles where rolname='receipt_router_v1_owner';"), 'f');
    assert.equal(q("select bool_or(inherit_option or set_option) from pg_auth_members where roleid='receipt_router_v1_owner'::regrole and member='postgres'::regrole;"), 'f');
    for (const role of ['anon', 'authenticated']) bad(`set role ${role};set request.jwt.claims='{"role":"service_role"}';select public.receipt_router_claim_v1('${BUYER}');`, /permission denied/u);
    bad('set role service_role;select * from receipt_router_v1.receipts;', /permission denied/u);
    bad(`set role service_role;set request.jwt.claims='{"role":"authenticated"}';select public.receipt_router_claim_v1('${BUYER}');`, /service_context_invalid/u);
    bad(service + `set transaction_timeout='10s';select public.receipt_router_claim_v1('${BUYER}');`, /service_context_invalid/u);
  });
  await record('Disabled connection refuses evidence; null authentication/parse status rejected', async () => {
    const e = await envelope();
    bad(service + `select public.receipt_router_ingest_v1('${CONN}',2,${json(e)});`, /connection_unavailable/u);
    for (const broken of [{ ...e, authentication: { ...e.authentication, method: null } }, { ...e, observation: { ...e.observation, parseStatus: null } }])
      bad(service + `select public.receipt_router_ingest_v1('${CONN}',1,${json(broken)});`, /envelope_invalid/u);
    assert.equal(q('select count(*) from receipt_router_v1.receipts;'), '0');
  });
  await record('Global ingress disable and append-only connection revocation provide explicit off paths', async () => {
    const e = await envelope();
    q('update receipt_router_v1.configuration set ingress_enabled=false;');
    bad(service + `select public.receipt_router_ingest_v1('${CONN}',1,${json(e)});`, /ingress_disabled/u);
    q(`update receipt_router_v1.configuration set ingress_enabled=true;insert into receipt_router_v1.connection_revocations(id,revision,reason) values('${CONN}',1,'fixture retirement');`);
    bad(service + `select public.receipt_router_ingest_v1('${CONN}',1,${json(e)});`, /connection_unavailable/u);
    bad('delete from receipt_router_v1.connection_revocations;', /evidence_immutable/u);
    assert.equal(q('select count(*) from receipt_router_v1.receipts;'), '0');
  });
  await record('Exact encrypted redelivery deduplicates parent while preserving every transport delivery', async () => {
    const e = await envelope(), a = ingest(e), second = await envelope();
    assert.notEqual(e.encryption.nonce, second.encryption.nonce);
    const b = ingest(second); assert.equal(a.receiptId, b.receiptId); assert.equal(b.status, 'duplicate');
    assert.equal(q('select count(*) from receipt_router_v1.receipts;'), '1'); assert.equal(q('select count(*) from receipt_router_v1.deliveries;'), '2');
    assert.equal(q("select envelope#>>'{encryption,nonce}' from receipt_router_v1.receipts;"), e.encryption.nonce);
    bad("update receipt_router_v1.receipts set raw_sha256=repeat('b',64);", /evidence_immutable/u);
    bad('delete from receipt_router_v1.subjects;', /evidence_immutable/u);
  });
  await record('Conflicting event bytes retain both parents and subjects, invalidate already claimed work', async () => {
    ingest(await envelope()); const old = claim(); assert.equal(old.status, 'leased');
    const other = ingest(await envelope({ app_user_id: OTHER, original_app_user_id: OTHER })); assert.equal(other.status, 'conflict');
    assert.equal(q('select count(*) from receipt_router_v1.receipts;'), '2');
    assert.equal(q('select count(distinct subject_id) from receipt_router_v1.pending_holds;'), '2');
    bad(service + `select public.receipt_router_complete_plan_v1('${old.eventId}','${old.lease}',${old.leaseGeneration},${json(plan(old))});`, /lease_stale/u);
    const next = claim(); assert.equal(next.conflicted, true); assert.equal(next.variants.length, 2);
  });
  await record('Productless transfer creates two scoped hold children with one exact parent hash', async () => {
    const e = await envelope({ type: 'TRANSFER', product_id: null, original_transaction_id: null, transaction_id: null,
      app_user_id: null, original_app_user_id: null, transferred_from: [BUYER], transferred_to: [OTHER] });
    ingest(e); assert.equal(q('select count(*) from receipt_router_v1.pending_holds;'), '2');
    assert.equal(q('select count(distinct r.raw_sha256) from receipt_router_v1.pending_holds h join receipt_router_v1.receipts r on r.id=h.evidence_receipt_id;'), '1');
    assert.equal(q(`select receipt_router_v1.has_pending_hold('fixture-project','${BUYER}','fixture-app','APP_STORE','SANDBOX','anything');`), 't');
    assert.equal(q(`select receipt_router_v1.has_pending_hold('different-project','${BUYER}','fixture-app','APP_STORE','SANDBOX','anything');`), 'f');
    assert.equal(q(`select receipt_router_v1.has_pending_hold('fixture-project','${randomUUID()}','fixture-app','APP_STORE','SANDBOX','anything');`), 'f');
  });
  await record('Conflicting direct identity aliases remain malformed and hold both evidenced UUID subjects', async () => {
    const e = await envelope({ type: 'EXPIRATION', appUserId: OTHER });
    assert.equal(e.observation.parseStatus, 'invalid'); const result = ingest(e); assert.equal(result.acknowledgementAllowed, false);
    assert.equal(q('select count(distinct subject_id) from receipt_router_v1.pending_holds;'), '2');
  });
  await record('Exact catalog/original ownership is append-only, cannot rebind across users or projects', async () => {
    const first = ingest(await envelope()); catalog(); bind(first.receiptId);
    bad(`update receipt_router_v1.originals set original_buyer_id='${OTHER}';`, /evidence_immutable/u);
    bad(`insert into receipt_router_v1.catalog values('${SCOPE}','fixture-tip','legacy_premium',1);`, /catalog_owner_conflict/u);
    q(`insert into receipt_router_v1.scopes values('${randomUUID()}','foreign-project','foreign-app','APP_STORE','SANDBOX','fixture-bundle');`);
    const second = q("select id from receipt_router_v1.scopes where project_id='foreign-project';");
    bad(`insert into receipt_router_v1.catalog values('${second}','fixture-tip','legacy_premium',1);`, /catalog_owner_conflict/u);
    q(`insert into receipt_router_v1.catalog values('${second}','fixture-tip','isolated_sandbox',1);`);
    bad(`insert into receipt_router_v1.originals values('${second}','fixture-bundle','APP_STORE','SANDBOX','fixture-original','fixture-tip',
      'isolated_sandbox',1,'${OTHER}','${randomUUID()}',1,'${first.receiptId}');`, /duplicate key/u);
  });
  await record('Mismatched terminal buyer preserves both reported and immutable original owner holds', async () => {
    const first = ingest(await envelope()); catalog(); bind(first.receiptId);
    ingest(await envelope({ id: 'terminal', type: 'EXPIRATION', app_user_id: OTHER, original_app_user_id: OTHER, product_id: null }));
    assert.equal(q('select count(distinct subject_id) from receipt_router_v1.pending_holds;'), '2');
  });
  await record('Atomic job claim excludes another worker; crashed lease expires with a new generation', async () => {
    ingest(await envelope()); const first = claim(); assert.equal(claim().status, 'idle');
    q("update receipt_router_v1.jobs set lease_until=clock_timestamp()-interval '1 second';");
    const next = claim(); assert.equal(next.leaseGeneration, first.leaseGeneration + 1); assert.notEqual(next.lease, first.lease);
    bad(service + `select public.receipt_router_defer_v1('${first.eventId}','${first.lease}',${first.leaseGeneration},'completion_unknown');`, /lease_stale/u);
    assert.equal(complete(next, plan(next)).status, 'plan_recorded');
  });
  await record('Concurrent worker skips an uncommitted claim row without waiting or double-claiming', async () => {
    ingest(await envelope());
    const child = spawn(path.join(bin, 'psql'), args(db), { env, stdio: ['pipe','pipe','pipe'] }); sessions.add(child);
    let output = '', error = '', exited = false;
    child.stdout.on('data', b => { output += b; }); child.stderr.on('data', b => { error += b; });
    const completion = new Promise((resolve, reject) => { child.once('error', reject); child.once('exit', code => { exited = true; sessions.delete(child); resolve(code); }); });
    try {
      child.stdin.write(`begin;${service}select public.receipt_router_claim_v1('${BUYER}');\n`);
      const deadline = Date.now()+2000;
      while (!output.trim() && !exited && Date.now()<deadline) await new Promise(resolve => setTimeout(resolve, 10));
      assert.ok(output.trim() && !exited, `claim setup missed bounded window: ${error}`);
      const j = JSON.parse(output.trim()); assert.equal(j.status, 'leased');
      const began = Date.now(); assert.equal(claim().status, 'idle'); assert.ok(Date.now()-began<1000);
      child.stdin.end('commit;\n'); assert.equal(await completion, 0, error);
      assert.equal(q('select lease_generation from receipt_router_v1.jobs;'), '1');
    } finally { if (!exited) { child.kill('SIGTERM'); await completion; } }
  });
  await record('No positive plan or invented subject can be persisted, even by service API', async () => {
    ingest(await envelope()); const j = claim(), p = plan(j);
    for (const patch of [{ grantsAuthority: true }, { providerDispatchAllowed: true }, { legacyProjectionAllowed: true }, { acknowledgementAllowed: true },
      { disposition: 'no_effect_test' }, { holdTargets: [{ subjectId: randomUUID(), evidenceRole: 'reported', owner: null, originalTransactionId: null }] }])
      bad(service + `select public.receipt_router_complete_plan_v1('${j.eventId}','${j.lease}',${j.leaseGeneration},${json({ ...p, ...patch })});`, /plan_(invalid|subject_invalid)|test_plan_invalid/u);
    assert.equal(q('select count(*) from receipt_router_v1.plans;'), '0');
  });
  await record('Plan completion is immutable evidence, no authority; ambiguous retry cannot duplicate completion', async () => {
    ingest(await envelope()); const j = claim(), result = complete(j, plan(j));
    assert.equal(result.authorityGranted, false); assert.equal(result.legacyEffectsEnforced, false); assert.equal(result.acknowledgementAllowed, false);
    assert.equal(q('select state from receipt_router_v1.jobs;'), 'reconciliation_pending');
    bad(service + `select public.receipt_router_complete_plan_v1('${j.eventId}','${j.lease}',${j.leaseGeneration},${json(plan(j))});`, /lease_stale/u);
    assert.equal(q('select count(*) from receipt_router_v1.plans;'), '1');
    bad('delete from receipt_router_v1.pending_holds;', /evidence_immutable/u);
  });
  await record('Actual SQL JSONB claim decrypts and completes through the real TypeScript worker', async () => {
    ingest(await envelope()); catalog();
    const deferred = [];
    const result = await runReceiptRouterWorker({ claim: async () => claim(), connection: () => config,
      complete: async (j,p) => complete(j,p), defer: async (_j,reason) => { deferred.push(reason); } }, BUYER);
    assert.equal(result.status, 'plan_recorded'); assert.deepEqual(deferred, []);
    assert.equal(q("select plan->>'disposition' from receipt_router_v1.plans;"), 'awaiting_binding');
  });
  await record('Missing key defer has bounded reason/backoff, cannot erase evidence or complete a lease', async () => {
    ingest(await envelope()); const j = claim();
    bad(service + `select public.receipt_router_defer_v1('${j.eventId}','${j.lease}',${j.leaseGeneration},'arbitrary private payload');`, /defer_reason_invalid/u);
    assert.equal(rpc(`public.receipt_router_defer_v1('${j.eventId}','${j.lease}',${j.leaseGeneration},'storage_key_unavailable')`).status, 'deferred');
    assert.equal(claim().status, 'idle'); assert.equal(q('select count(*) from receipt_router_v1.receipts;'), '1');
    assert.equal(q("select next_attempt_at>clock_timestamp() and next_attempt_at<clock_timestamp()+interval '1 hour' from receipt_router_v1.jobs;"), 't');
  });
  await record('Catalog revision change fences an in-flight plan; TEST has no commercial effect', async () => {
    const recorded = ingest(await envelope({ type: 'TEST' })); assert.equal(recorded.acknowledgementAllowed, true);
    const j = claim(); q('update receipt_router_v1.configuration set catalog_revision=2;');
    bad(service + `select public.receipt_router_complete_plan_v1('${j.eventId}','${j.lease}',${j.leaseGeneration},${json(plan(j))});`, /lease_stale/u);
    q("update receipt_router_v1.jobs set lease_until=clock_timestamp()-interval '1 second';");
    const next = claim(); assert.equal(plan(next).disposition, 'no_effect_test'); complete(next, plan(next));
    assert.equal(q('select count(*) from receipt_router_v1.pending_holds;'), '0');
  });
  await record('Scoped hold contract rejects null subjects, unqualified scope and public/service readers', async () => {
    catalog();
    const read = `receipt_router_v1.read_hold('fixture-project','fixture-app','APP_STORE','SANDBOX','${BUYER}','legacy_premium',1,null)`;
    assert.equal(JSON.parse(q(`select ${read};`)).state, 'clear');
    q("update receipt_router_v1.configuration set ownership_coverage='incomplete';");
    assert.equal(JSON.parse(q(`select ${read};`)).state, 'unavailable');
    bad("select receipt_router_v1.read_hold('fixture-project','fixture-app','APP_STORE','SANDBOX',null,'legacy_premium',1,null);", /hold_scope_required/u);
    for (const role of ['anon','authenticated','service_role']) bad(`set role ${role};select ${read};`, /permission denied/u);
  });
  await record('Generic seeded originals cannot narrow an unresolved negative without typed source admission', async () => {
    const first = ingest(await envelope()); catalog(); bind(first.receiptId);
    ingest(await envelope({ id: 'refund', type: 'REFUND', product_id: null }));
    for (const domain of ['legacy_premium','legacy_creator','isolated_sandbox']) {
      const r = JSON.parse(q(`select receipt_router_v1.read_hold('fixture-project','fixture-app','APP_STORE','SANDBOX','${BUYER}','${domain}',1,null);`));
      assert.equal(r.state, 'held'); assert.equal(r.reason, 'subject_scope_unresolved');
    }
    bad(service + `select receipt_router_v1.commit_original_from_source('${first.receiptId}','${SCOPE}','fixture-tip','fixture-original','${BUYER}',null,
      'legacy_premium_authenticated_replay_v1','${randomUUID()}','fixture-event',null,'fixture-scope');`, /permission denied/u);
  });
  await record('Uncommitted negative ingestion makes the scoped reader fail NOWAIT before granting clear', async () => {
    catalog();const e=await envelope({type:'TRANSFER',product_id:null,original_transaction_id:null,transaction_id:null,
      transferred_from:[BUYER],transferred_to:[OTHER]});
    const writer=startSession('router-negative-first-'+randomUUID());
    try{
      writer.child.stdin.write(`begin;${service}select public.receipt_router_ingest_v1('${CONN}',1,${json(e)});\n`);
      await waitFor(()=>!!writer.output().trim()||writer.exited(),'negative setup timed out');assert.equal(writer.exited(),false,writer.errors());
      bad(`select ${holdQuery()};`,/could not obtain lock/u);
      writer.child.stdin.end('commit;\n');assert.equal(await writer.done,0,writer.errors());
      assert.equal(JSON.parse(q(`select ${holdQuery()};`)).state,'held');
    }finally{if(!writer.exited()){writer.child.kill('SIGTERM');await writer.done;}}
  });
  await record('Admitted clear read fences a later negative insert until reader commit, then both subjects are held', async () => {
    catalog();const e=await envelope({type:'TRANSFER',product_id:null,original_transaction_id:null,transaction_id:null,
      transferred_from:[BUYER],transferred_to:[OTHER]});
    const reader=startSession('router-reader-first-'+randomUUID()),writerName='router-writer-after-'+randomUUID();let writer;
    try{
      reader.child.stdin.write(`begin;select receipt_router_v1.arm_source_import_context();select ${holdQuery()};\n`);
      await waitFor(()=>!!reader.output().trim()||reader.exited(),'reader setup timed out');
      assert.equal(reader.exited(),false,reader.errors());assert.equal(JSON.parse(reader.output().trim()).state,'clear');
      writer=startSession(writerName);writer.child.stdin.end(service+`select public.receipt_router_ingest_v1('${CONN}',1,${json(e)});\n`);
      await waitFor(()=>q(`select coalesce(bool_or(wait_event_type='Lock'),false) from pg_stat_activity where datname='${db}' and application_name=${lit(writerName)};`)==='t'||writer.exited(),'writer did not reach read fence');
      assert.equal(writer.exited(),false,writer.errors());assert.equal(writer.output().trim(),'');
      reader.child.stdin.end('commit;\n');assert.equal(await reader.done,0,reader.errors());assert.equal(await writer.done,0,writer.errors());
      for(const subject of [BUYER,OTHER])assert.equal(JSON.parse(q(`select ${holdQuery(subject)};`)).state,'held');
    }finally{
      for(const session of [writer,reader])if(session&&!session.exited()){session.child.kill('SIGTERM');await session.done;}
    }
  });
  await record('Malformed maximum-sized transfer retains every valid identity through durable SQL envelope bounds', async () => {
    catalog();const identities=Array.from({length:6600},()=>randomUUID());
    const e=await envelope({type:'TRANSFER',app_user_id:null,original_app_user_id:null,product_id:null,
      original_transaction_id:null,transaction_id:null,transferred_from:[...identities,null],transferred_to:[OTHER]});
    assert.ok(e.rawByteLength<=262144);assert.ok(JSON.stringify(e).length>524288);
    assert.equal(e.observation.parseStatus,'invalid');assert.equal(e.observation.transferredFrom.length,6600);
    const result=ingest(e);assert.equal(result.acknowledgementAllowed,false);
    assert.equal(q('select count(*) from receipt_router_v1.pending_holds;'),'6601');
    for(const subject of [identities[0],identities.at(-1),OTHER])assert.equal(JSON.parse(q(`select ${holdQuery(subject)};`)).state,'held');
  });
  await record('Duplicate sensitive fields preserve raw parent and make reporting project plus qualified economic aliases unavailable', async () => {
    catalog();const raw=`{"api_version":"1.0","event":{"id":"duplicate-sensitive","type":"REFUND","app_user_id":"${BUYER}","app_user_id":"${OTHER}","app_id":"fixture-app","store":"APP_STORE","environment":"SANDBOX","original_transaction_id":"fixture-original"}}`;
    const e=await authenticateRevenueCatEnvelope(new Request('https://fixture.invalid/provider',{method:'POST',headers:{authorization:config.authentication.secret},body:raw}),config);
    assert.equal(e.observation.parseStatus,'invalid');assert.equal(e.observation.userId,null);assert.equal(e.observation.appId,null);
    ingest(e);assert.equal(q('select count(*) from receipt_router_v1.pending_holds;'),'0');
    assert.equal(q('select count(*) from receipt_router_v1.receipts;'),'1');
    for(const subject of [BUYER,OTHER,randomUUID()]){const state=JSON.parse(q(`select ${holdQuery(subject)};`));
      assert.equal(state.state,'unavailable');assert.equal(state.reason,'unscopable_authenticated_evidence');}
    const alias=randomUUID();q(`insert into receipt_router_v1.scopes values('${alias}','alias-project','alias-app','APP_STORE','SANDBOX','fixture-bundle');`);
    const qualifiedAlias=JSON.parse(q(`select receipt_router_v1.read_hold('alias-project','alias-app','APP_STORE','SANDBOX','${BUYER}','legacy_premium',1,null);`));
    assert.equal(qualifiedAlias.state,'unavailable');assert.equal(qualifiedAlias.reason,'unscopable_authenticated_evidence');
    const foreign=randomUUID();q(`insert into receipt_router_v1.scopes values('${foreign}','unrelated-project','unrelated-app','APP_STORE','SANDBOX','unrelated-store-application');`);
    const unrelated=JSON.parse(q(`select receipt_router_v1.read_hold('unrelated-project','unrelated-app','APP_STORE','SANDBOX','${BUYER}','legacy_premium',1,null);`));
    assert.equal(unrelated.state,'clear');
    const unqualified=JSON.parse(q(`select receipt_router_v1.read_hold('unqualified-project','unrelated-app','APP_STORE','SANDBOX','${BUYER}','legacy_premium',1,null);`));
    assert.equal(unqualified.state,'unavailable');assert.equal(unqualified.reason,'scope_qualification_incomplete');
  });
  report = { kind: 'actual-local-postgresql-source-proof', postgres: '17.6', syntheticProviderEvidence: true,
    providerOrProductionCalls: false, actualProviderAuthenticationProven: false, legacyEnforcementProven: false,
    cases: cases.length, passed: cases, sourceHashes, cleanup };
} finally {
  for (const child of sessions) child.kill('SIGTERM');
  if (sessions.size) await Promise.all([...sessions].map(child => new Promise(resolve => child.once('exit', resolve))));
  cleanup.sessionsClosed = true;
  if (startAttempted) {
    const status = run('pg_ctl', ['-D', data, 'status']);
    if (status.status === 0) { invoke('pg_ctl', ['-D', data, '-m', 'immediate', '-w', '-t', '15', 'stop']); cleanup.clusterStopped = true; }
    else if (status.status !== 3) throw new Error('Unknown cluster status; preserved ' + work);
    else if (!started) throw new Error('Uncertain failed start; preserved ' + work);
    assert.equal(run('pg_ctl', ['-D', data, 'status']).status, 3); cleanup.clusterNotRunningVerified = true;
  } else if (initializationAttempted && !initialized) throw new Error('Initialization uncertain; preserved ' + work);
  fs.rmSync(work, { recursive: true, force: true }); cleanup.directoryRemoved = true;
}
assert.ok(report && cleanup.sessionsClosed && cleanup.clusterStopped && cleanup.clusterNotRunningVerified && cleanup.directoryRemoved);
console.log(JSON.stringify(report, null, 2));
