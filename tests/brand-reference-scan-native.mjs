#!/usr/bin/env node
// Native PostgreSQL, synthetic data only. No source database is copied or read.
// Use a dedicated network-disabled brand-ref-perf-* container with no mounts.
import assert from 'node:assert/strict';
import {spawn, spawnSync} from 'node:child_process';
import {createHash, randomUUID} from 'node:crypto';
import {readFileSync, writeFileSync} from 'node:fs';
import {setTimeout as delay} from 'node:timers/promises';
import {referenceScanFixtureSQL, referenceScanEquivalenceSQL, referenceScanErrors, sqlLiteral as lit} from './helpers/brand-reference-scan-corpus.mjs';
import {brandReferenceNativeContainer} from './helpers/brand-reference-native-target.mjs';

if (process.argv.includes('--help')) {
  console.log('BRAND_REFERENCE_TEST_CONTAINER=brand-ref-perf-... node tests/brand-reference-scan-native.mjs [--races-only|--optimized-only] [--output=/absolute/report.json]. Requires a dedicated local, network-disabled PostgreSQL container with no mounts, /tmp socket and track_functions=all. Creates and drops a fresh synthetic database; never copies an existing database. optimized-only preserves a separately recorded baseline failure instead of repeating it.');
  process.exit(0);
}
assert.ok(process.argv.slice(2).every(arg => ['--races-only','--optimized-only'].includes(arg) || /^--output=\//.test(arg)), 'only explicit test modes and an absolute report path are accepted');
const racesOnly = process.argv.includes('--races-only');
const optimizedOnly = process.argv.includes('--optimized-only');
assert.ok(!(racesOnly && optimizedOnly), 'choose one test mode');
const output = process.argv.find(arg => arg.startsWith('--output='))?.slice(9);
const container = brandReferenceNativeContainer();
if (process.env.DOCKER_HOST) assert.match(process.env.DOCKER_HOST, /^(unix|npipe):\/\//);
const database = `brand_reference_${process.pid}_${randomUUID().replaceAll('-', '').slice(0,12)}`;
const rows = 429749;
const read = name => readFileSync(`supabase/migrations/${name}.sql`, 'utf8');
const reference = read('20261020141554_deleted_media_reference_retirement');
const normalized = read('20261020201310_deleted_content_stage_recovery');
const previous = read('20261025114152_platform_brand_empty_test_disposition');
const candidate = read('20261025121430_platform_brand_reference_scan_performance');
const lifecycle = read('20261021134043_platform_brand_exact_retention_lifecycle');
const global = read('20261025033057_platform_brand_global_retention_integration');
const retention = read('20261020141458_deleted_content_retention');
const fn = (source, name) => {
  const start = source.search(new RegExp(`create (?:or replace )?function private\\.${name}\\(`, 'i'));
  const end = source.indexOf('$$;', start) + 3;
  assert.ok(start >= 0 && end > start, `actual definition required: ${name}`);
  return source.slice(start, end);
};
const table = (source, name) => {
  const start = source.indexOf(`create table private.${name} (`);
  const end = source.indexOf('\n);', start) + 3;
  assert.ok(start >= 0 && end > start, `actual table required: ${name}`);
  return source.slice(start, end);
};
const docker = (args, input, timeout = 600000) => spawnSync('docker', args, {input, encoding:'utf8', maxBuffer:32*1024*1024, timeout});
const ok = (result, label) => {
  assert.equal(result.status, 0, `${label}: ${result.error?.message || result.stderr}`);
  return result.stdout.trim();
};
const args = (db = database) => ['exec','-i',container,'psql','-X','-q','-A','-t','-v','ON_ERROR_STOP=1','-h','/tmp','-U','postgres','-d',db];
const query = (sql, db = database) => ok(docker(args(db), `set statement_timeout='8min';set time zone 'UTC';${sql}\n`), 'synthetic SQL');
const json = sql => JSON.parse(query(sql));
const sha256 = value => createHash('sha256').update(value).digest('hex');
const report = {database, container, syntheticOnly:true, status:'running', startedAt:new Date().toISOString(), mode:racesOnly?'races-only':optimizedOnly?'optimized-only':'complete', checks:[], plans:{}, benchmark:{}, sources:{
  harnessSHA256:sha256(readFileSync(new URL(import.meta.url))),
  candidateMigrationSHA256:sha256(candidate), previousMigrationSHA256:sha256(previous),
  sharedReferenceMigrationSHA256:sha256(reference), sharedNormalizerMigrationSHA256:sha256(normalized),
  corpusSHA256:sha256(readFileSync(new URL('./helpers/brand-reference-scan-corpus.mjs',import.meta.url))),
}, limitations:[
  'Synthetic local PostgreSQL timing is not production or archive-runner latency evidence.',
  'Host resource contention can affect elapsed time; plan shape and execution counts are asserted independently.',
  'Writer tests execute the actual current latch and generic guard in a minimal fixture, not the full claim/removal RPC stack; existing full Brand regression remains required.',
]};
const checkpoint = () => {
  report.updatedAt = new Date().toISOString();
  if (output) writeFileSync(output,JSON.stringify(report,null,2)+'\n');
};
const pass = label => { report.checks.push(label); console.log(`PASS ${label}`); checkpoint(); };
let created = false;
const active = new Set();
function session(name, sql, finish = false) {
  const child = spawn('docker', args(), {stdio:['pipe','pipe','pipe']});
  let stdout = '', stderr = '';
  child.stdout.setEncoding('utf8'); child.stderr.setEncoding('utf8');
  child.stdout.on('data', s => stdout += s); child.stderr.on('data', s => stderr += s);
  child.stdin.on('error', () => {});
  const done = new Promise(resolve => {
    child.on('error', e => resolve({code:-1,stdout,stderr:e.message}));
    child.on('close', code => resolve({code,stdout,stderr}));
  });
  const result = {child, done, name, output:()=>stdout, error:()=>stderr}; active.add(result);
  child.stdin.write(`set application_name=${lit(name)};set statement_timeout='45s';set idle_in_transaction_session_timeout='60s';begin;${sql};\n`);
  if (finish) child.stdin.end('commit;\n\\q\n');
  return result;
}
async function until(test, label, sessions = []) {
  const end = Date.now() + 25000;
  while (Date.now() < end) {
    if (test()) return;
    for (const s of sessions) assert.equal(s.child.exitCode, null, `${label}: ${s.error()}`);
    await delay(100);
  }
  throw Error(`timed out waiting for observed ${label}`);
}
async function ordered(label, first, second, verify, {rollback=false, afterQueue=''} = {}) {
  const suffix = `${process.pid}_${report.checks.length}`;
  const holder = session(`brand-ref-holder-${suffix}`, `${first};select 'HOLDER_READY'`);
  await until(() => holder.output().includes('HOLDER_READY'), 'holder', [holder]);
  const waiter = session(`brand-ref-waiter-${suffix}`, second, true);
  await until(() => query(`select count(*) from pg_stat_activity w join pg_stat_activity h on h.application_name=${lit(holder.name)} where w.datname=current_database() and w.application_name=${lit(waiter.name)} and w.wait_event_type='Lock' and h.pid=any(pg_blocking_pids(w.pid));`) === '1', 'independent backend lock queue', [holder,waiter]);
  if (afterQueue) query(afterQueue);
  holder.child.stdin.end(`${rollback?'rollback':'commit'};\n\\q\n`);
  const [h,w] = await Promise.all([holder.done,waiter.done]);
  active.delete(holder); active.delete(waiter);
  assert.equal(h.code,0,h.stderr); verify(w); pass(label);
}
const succeeded = r => assert.equal(r.code,0,r.stderr);
const denied = (r, pattern) => {
  assert.notEqual(r.code,0,'must fail closed');
  assert.doesNotMatch(r.stderr,/deadlock detected|statement timeout|lock timeout/);
  assert.match(r.stderr,pattern);
};
const dynamic = (source, relation, oid) => {
  const body = fn(source,'platform_brand_retention_references_clear');
  const template = body.match(/execute format\('(select exists\(select 1 from public\.%I[^']+)'/)[1];
  const values = [relation,'true',oid,oid]; let i = 0;
  const result = template.replace(/%[Is]/g, () => values[i++]);
  assert.ok(i === 3 || i === 4); return result;
};
const statsSQL = `select coalesce(jsonb_object_agg(funcname,calls),'{}'::jsonb)::text from pg_stat_user_functions where schemaname='private'`;
const allNodes = plan => [plan, ...(plan.Plans || []).flatMap(allNodes)];
try {
  report.phase = 'container and synthetic database initialization'; checkpoint();
  console.log('Checking dedicated local container and creating fresh synthetic database...');
  assert.match(ok(docker(['context','inspect','--format','{{.Endpoints.docker.Host}}']),'local Docker context'), /^(unix|npipe):\/\//);
  const properties = JSON.parse(ok(docker(['inspect','--format','{"network":{{json .HostConfig.NetworkMode}},"mounts":{{json .Mounts}},"labels":{{json .Config.Labels}}}',container]),'dedicated container properties'));
  assert.equal(properties.network,'none');
  assert.deepEqual(properties.mounts,[],'no host or existing-volume mounts');
  assert.equal(properties.labels?.['com.supabase.cli.project'],undefined,'must not target a shared Supabase container');
  // Only server metadata is queried in postgres; all application work uses a new DB.
  report.version = query('select version();','postgres');
  assert.equal(query("select current_setting('track_functions');",'postgres'),'all');
  query(`create database ${database} template template0;`,'postgres'); created = true;
  query(`create schema private;${['deleted_media_locator_columns','deleted_media_locator_document'].map(n=>fn(reference,n)).join('\n')}
    ${fn(normalized,'deleted_media_normalize_locator')}
    ${['deleted_media_mentions','deleted_media_reference_identity'].map(n=>fn(reference,n)).join('\n')}
    ${fn(candidate,'platform_brand_retention_row_mentions')}
    ${referenceScanFixtureSQL}`);
  console.log('Running native shared adversarial corpus...');
  const equivalence = json(`select jsonb_agg(t)::text from (${referenceScanEquivalenceSQL()}) t`);
  assert.ok(equivalence.length > 300);
  assert.deepEqual(equivalence.filter(row => !row.equivalent || !row.expected_matches),[]);
  report.equivalenceCases = equivalence.length; pass('native adversarial Boolean and SQL NULL equivalence');
  for (const {document,label,table:relation} of referenceScanErrors) {
    const tableOID = relation ? `${lit(relation)}::regclass::oid` : '0::oid';
    const expressions = [
      `private.deleted_media_mentions(private.deleted_media_locator_document(${lit(document)}::jsonb,${tableOID}),'brand/logo.png') or private.deleted_media_mentions(private.deleted_media_locator_document(${lit(document)}::jsonb,${tableOID}),'storage/brand/logo.png')`,
      `private.platform_brand_retention_row_mentions(${lit(document)}::jsonb,private.deleted_media_locator_columns(${tableOID}),'brand/logo.png','storage/brand/logo.png')`,
    ];
    const errors = expressions.map(expression => {
      const result = docker(args(), `\\set VERBOSITY verbose\nselect ${expression};`);
      assert.notEqual(result.status,0,label); return result.stderr.match(/ERROR:\s+([0-9A-Z]{5}):\s+([^\n]+)/)?.slice(1);
    });
    assert.ok(errors[0]); assert.deepEqual(errors[0],errors[1],label);
  }
  pass('native scalar/array JSON errors preserve SQLSTATE and message');
  if (!racesOnly) {
  report.phase = 'synthetic fixture loading'; checkpoint();
  // Only this generated synthetic audit fixture is unlogged, to avoid local WAL
  // setup contention. No durability setting or existing table is changed.
  query(`create unlogged table public.livekit_routing_audit(id bigint primary key,created_at timestamptz not null,event_type text not null,metadata jsonb not null,unrelated text);
    create index livekit_routing_audit_created_at on public.livekit_routing_audit(created_at);
    insert into public.livekit_routing_audit select n,timestamptz '2026-01-01 00:00:00+00'+n*interval '1 second','route_decision',
      jsonb_build_object('status','routed','route','primary','transport','webrtc','session','synthetic-'||n,'latencyMs',n%90,'attempt',1,'region','local','details',repeat('synthetic routing status ',3)),
      'brand/logo.png' from generate_series(1,${rows}) n;
    vacuum analyze public.livekit_routing_audit;`);
  report.fixture = json(`select jsonb_build_object('rows',count(*),'totalBytes',pg_total_relation_size('public.livekit_routing_audit'),'heapBytes',pg_relation_size('public.livekit_routing_audit'),'meanMetadataBytes',round(avg(pg_column_size(metadata)),2),'locatorColumns',private.deleted_media_locator_columns('public.livekit_routing_audit'::regclass),'indexes',(select jsonb_agg(indexdef order by indexname) from pg_indexes where schemaname='public' and tablename='livekit_routing_audit'))::text from public.livekit_routing_audit`);
  assert.equal(report.fixture.rows,rows); assert.deepEqual(report.fixture.locatorColumns,['metadata']);
  assert.equal(report.fixture.indexes.length,2);
  assert.equal(query("select relpersistence from pg_class where oid='public.livekit_routing_audit'::regclass"),'u');
  report.fixture.unlogged = true; checkpoint();
  console.log(`Synthetic audit fixture: ${JSON.stringify(report.fixture)}`);
  const oid = query("select 'public.livekit_routing_audit'::regclass::oid");
  if (optimizedOnly) {
    report.benchmark.baseline = 'Not rerun in this optimized-only measurement; consult the separately retained failed baseline report.';
    report.plans.oldEstimated = json(`prepare old_reference_scan(text,text) as ${dynamic(previous,'livekit_routing_audit',oid)};
      explain (format json) execute old_reference_scan('brand/logo.png','storage/brand/logo.png');`)[0];
    checkpoint();
  }
  for (const [label,source] of optimizedOnly?[['new',candidate]]:[['old',previous],['new',candidate]]) {
    query('select pg_stat_reset();');
    report.phase = `${label} full-absence EXPLAIN ANALYZE`; checkpoint();
    console.log(`Running ${label} full-absence EXPLAIN ANALYZE over ${rows} rows...`);
    const sql = dynamic(source,'livekit_routing_audit',oid);
    const plan = json(`prepare reference_scan(text,text) as ${sql};
      explain (analyze,buffers,format json) execute reference_scan('brand/logo.png','storage/brand/logo.png');`)[0];
    report.plans[label] = plan;
    // The EXPLAIN backend exits before this separate backend reads flushed stats.
    const stats = json(statsSQL);
    const nodes = allNodes(plan.Plan);
    const scan = nodes.find(node => node['Relation Name'] === 'livekit_routing_audit');
    assert.equal(scan['Rows Removed by Filter'],rows); assert.equal(scan['Actual Rows'],0); assert.equal(scan['Actual Loops'],1);
    assert.equal(stats.deleted_media_normalize_locator ?? 0,label==='old'?2*rows:0,
      'percent-free candidate rows use the identity fastpath without shared-normalizer calls');
    if (label === 'new') {
      assert.equal(stats.deleted_media_locator_columns,1);
      assert.equal(stats.platform_brand_retention_row_mentions,rows);
      const discovery = nodes.filter(node => node['Parent Relationship']==='InitPlan' && node['Node Type']==='Result');
      assert.equal(discovery.length,1); assert.equal(discovery[0]['Actual Loops'],1);
    } else assert.ok(stats.deleted_media_locator_columns >= 2*rows);
    report.benchmark[label] = {sql,executionMs:plan['Execution Time'],planningMs:plan['Planning Time'],functionCalls:stats};
    checkpoint();
    console.log(`${label}: ${JSON.stringify(report.benchmark[label])}`);
  }
  if (!optimizedOnly) report.benchmark.speedup = report.benchmark.old.executionMs/report.benchmark.new.executionMs;
  pass('native full scan: one column-discovery InitPlan, one matcher per row, no shared normalization for percent-free rows');
  }
  query('create table public.brand_ddl_fixture(id int,metadata jsonb,unrelated text);insert into public.brand_ddl_fixture values(1,\'{"value":"other"}\',\'brand/logo.png\');');
  const ddlOID = query("select 'public.brand_ddl_fixture'::regclass::oid");
  const scanDDL = dynamic(candidate,'brand_ddl_fixture',ddlOID).replaceAll('$1',"'brand/logo.png'").replaceAll('$2',"'storage/brand/logo.png'");
  assert.equal(query(scanDDL),'f');
  await ordered('ordinary scan relation lock blocks ADD COLUMN until commit',scanDDL,'alter table public.brand_ddl_fixture add column future_media_url text',succeeded,{
    afterQueue:`do $$begin if not exists(select 1 from pg_locks l join pg_stat_activity a on a.pid=l.pid where a.datname=current_database() and a.application_name like 'brand-ref-holder-%' and l.relation='public.brand_ddl_fixture'::regclass and l.mode='AccessShareLock' and l.granted) then raise exception 'ordinary relation lock missing';end if;end$$;`,
  });
  query("update public.brand_ddl_fixture set future_media_url='brand/logo.png'");
  assert.equal(query(scanDDL),'t'); pass('next statement discovers added locator column and its reference');
  await ordered('ordinary scan relation lock blocks RENAME COLUMN until commit',scanDDL,'alter table public.brand_ddl_fixture rename column future_media_url to ordinary_text',succeeded);
  assert.equal(query(scanDDL),'f'); pass('renamed nonlocator column is excluded by fresh exact discovery');
  query('alter table public.brand_ddl_fixture rename column ordinary_text to future_media_url');
  await ordered('ordinary scan relation lock blocks DROP COLUMN until commit',scanDDL,'alter table public.brand_ddl_fixture drop column future_media_url',succeeded);
  assert.equal(query(scanDDL),'f'); pass('dropped locator column is absent from next statement');
  const oldScanDDL = dynamic(previous,'brand_ddl_fixture',ddlOID).replaceAll('$1',"'brand/logo.png'").replaceAll('$2',"'storage/brand/logo.png'");
  const bothScans = `select 'NEW:'||(${scanDDL})::text;select 'OLD:'||(${oldScanDDL})::text`;
  await ordered('DDL-first committed ADD blocks scan then both predicates see new reference',
    "alter table public.brand_ddl_fixture add column committed_media_url text;update public.brand_ddl_fixture set committed_media_url='brand/logo.png'",
    bothScans,r=>{succeeded(r);assert.match(r.stdout,/NEW:true/);assert.match(r.stdout,/OLD:true/);});
  assert.equal(query(scanDDL),'t');
  assert.ok(json("select to_jsonb(private.deleted_media_locator_columns('public.brand_ddl_fixture'::regclass))::text").includes('committed_media_url'));
  query('alter table public.brand_ddl_fixture drop column committed_media_url');
  await ordered('DDL-first rolled-back ADD blocks scan then both predicates see no reference',
    "alter table public.brand_ddl_fixture add column rolledback_uri text;update public.brand_ddl_fixture set rolledback_uri='brand/logo.png'",
    bothScans,r=>{succeeded(r);assert.match(r.stdout,/NEW:false/);assert.match(r.stdout,/OLD:false/);},{rollback:true});
  assert.equal(query(scanDDL),'f');
  assert.deepEqual(json("select to_jsonb(private.deleted_media_locator_columns('public.brand_ddl_fixture'::regclass))::text"),['metadata']);
  pass('DDL commit and rollback leave fresh per-statement locator discovery');
  // These are actual source definitions, with only their minimal data dependencies.
  query(`${table(lifecycle,'platform_brand_object_incarnations')}${table(lifecycle,'platform_brand_expiry_claims')}
    ${table(retention,'deleted_media_reference_fence')}insert into private.deleted_media_reference_fence values(true,false);
    ${fn(retention,'deleted_media_reference_fence_armed')}${fn(global,'platform_brand_retention_lock')}
    ${fn(lifecycle,'guard_platform_brand_retention_references')}
    create table public.brand_writer_fixture(id int,metadata jsonb);
    create trigger brand_writer_guard before insert or update on public.brand_writer_fixture for each row execute function private.guard_platform_brand_retention_references();
    insert into private.platform_brand_object_incarnations(asset_id,owner_id,source_created_at,provider,bucket,object_key,storage_path,removed_at,retain_until)
      values('10000000-0000-4000-8000-000000000001','synthetic-owner','2026-01-01','supabase','platform-brand-assets','brand/logo.png','storage/brand/logo.png','2026-01-02','2026-02-01');`);
  const writerOID = query("select 'public.brand_writer_fixture'::regclass::oid");
  const scanWriter = dynamic(candidate,'brand_writer_fixture',writerOID).replaceAll('$1',"'brand/logo.png'").replaceAll('$2',"'storage/brand/logo.png'");
  await ordered('actual guard waits behind scan latch then denies retained reference',`select private.platform_brand_retention_lock();${scanWriter}`,"insert into public.brand_writer_fixture values(1,'{\"nested\":\"brand/logo.png\"}')",r=>denied(r,/brand_retained_reference_forbidden/));
  await ordered('actual guard permits unrelated writer after scan releases latch',`select private.platform_brand_retention_lock();${scanWriter}`,"insert into public.brand_writer_fixture values(2,'{\"nested\":\"unrelated\"}')",succeeded);
  query('update private.platform_brand_object_incarnations set removed_at=null,retain_until=null');
  await ordered('scan waits for actual writer guard then observes committed reference',"insert into public.brand_writer_fixture values(3,'{\"nested\":\"brand/logo.png\"}')",`select private.platform_brand_retention_lock();select 'REFERENCE:'||(${scanWriter})::text`,r=>{succeeded(r);assert.match(r.stdout,/REFERENCE:true/);});
  await ordered('rolled-back writer leaves no reference after serialization',"insert into public.brand_writer_fixture values(4,'{\"nested\":\"different/key\"}')",`select private.platform_brand_retention_lock();select 'ROW:'||count(*) from public.brand_writer_fixture where id=4`,r=>{succeeded(r);assert.match(r.stdout,/ROW:0/);},{rollback:true});
  for (const isolation of ['repeatable read','serializable']) {
    const result = docker(args(),`begin isolation level ${isolation};select private.platform_brand_retention_lock();`);
    assert.notEqual(result.status,0);assert.match(result.stderr,/brand_retention_read_committed_required/);
  }
  pass('actual lock rejects both unsupported transaction isolation levels');
  report.status = 'passed'; report.phase = 'complete';
  pass('native validation complete');
} catch (error) {
  report.status = 'failed'; report.error = error.message; checkpoint(); throw error;
} finally {
  if (created) {
    for (const s of active) { s.child.stdin.end('rollback;\n\\q\n'); }
    if (active.size) await Promise.all([...active].map(s=>s.done));
    query(`drop database ${database} with (force);`,'postgres');
    report.disposableDatabaseDropped = true;
  }
  checkpoint();
}
console.log(JSON.stringify({version:report.version,fixture:report.fixture,benchmark:report.benchmark,equivalenceCases:report.equivalenceCases,checks:report.checks.length,disposableDatabaseDropped:report.disposableDatabaseDropped},null,2));
