#!/usr/bin/env node
// Native writer and schema-race proof for the two pure normalized-index helpers.
// Requires a separately prepared, small, source-replayed disposable fixture.
// This harness never creates/reuses the retained 1.7m-row benchmark database.
import assert from 'node:assert/strict';
import {readFileSync, writeFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {createHash, randomUUID} from 'node:crypto';
import {setTimeout as delay} from 'node:timers/promises';
import {performance} from 'node:perf_hooks';
import {brandReferenceNativeContainer,brandNativeSpawnSync,brandNativeSpawn,brandNativePreflight} from './helpers/brand-reference-native-target.mjs';

if (process.argv.includes('--help')) {
  console.log('BRAND_REFERENCE_NORMALIZED_FIXTURE=/absolute/manifest.json node tests/brand-reference-normalized-writers-native.mjs [--failure-tail]. The manifest must identify an isolated small native source replay with status=passed, syntheticOnly=true, kind=brand-normalized-small-source, container, database, sourceHashes. --failure-tail runs only the isolation and lock-timeout checks, without creating rows, roles or schema objects. No benchmark reuse, production connection, process cancellation or permission escalation.');
  process.exit(0);
}
const failureTail = process.argv.length === 3 && process.argv[2] === '--failure-tail';
assert.ok(process.argv.length === 2 || failureTail, 'no implicit test modes');
const fixturePath = process.env.BRAND_REFERENCE_NORMALIZED_FIXTURE;
assert.ok(fixturePath?.startsWith('/'), 'an explicit small-fixture manifest is required');
const fixture = JSON.parse(readFileSync(fixturePath, 'utf8'));
assert.equal(fixture.status, 'passed');
assert.equal(fixture.syntheticOnly, true);
assert.equal(fixture.kind, 'brand-normalized-small-source');
const {container, database} = fixture;
brandReferenceNativeContainer(container);
// A small copied database may share the existing isolated container. The
// retained benchmark database and every benchmark table remain excluded.
assert.match(database ?? '', /^brand_(?:guard|normalized)_[0-9]+_[0-9a-f]{12}$/);
assert.notEqual(database, 'brand_guard_90588_6b4c16fcf077');

const root = fileURLToPath(new URL('../', import.meta.url));
const reportRoot = fileURLToPath(new URL('../../', import.meta.url));
const migration = 'supabase/migrations/20261025141347_platform_brand_reference_candidate_indexes.sql';
const matcherMigration = 'supabase/migrations/20261025121430_platform_brand_reference_scan_performance.sql';
const source = readFileSync(root + migration, 'utf8');
const matcherSource = readFileSync(root + matcherMigration, 'utf8');
const sha = value => createHash('sha256').update(value).digest('hex');
const lit = value => `'${String(value).replaceAll("'", "''")}'`;
const pattern = value => '%' + value.replaceAll('!', '!!').replaceAll('%', '!%').replaceAll('_', '!_') + '%';
const suffix = randomUUID().replaceAll('-', '').slice(0, 12);
const table = 'brand_normalized_writer_' + suffix;
const index = 'brand_normalized_writer_gin_' + suffix;
const writer = 'brand_norm_writer_' + suffix;
const member = 'brand_norm_member_' + suffix;
const owner = 'brand_norm_owner_' + suffix;
const definer = 'brand_normalized_definer_' + suffix;
const invoker = 'brand_normalized_invoker_' + suffix;
const roles = [writer, member, owner];
const pureSignatures = [
  'private.platform_brand_index_jsonb_bytes_v1(jsonb)',
  'private.platform_brand_index_normalize_v1(text)',
];
const privateSignatures = [
  'private.platform_brand_retention_row_mentions(jsonb,text[],text,text)',
  'private.platform_brand_index_environment_v1()',
  'private.platform_brand_index_spec_v1(oid)',
  'private.platform_brand_index_expression_v1(oid)',
  'extensions.guard_platform_brand_index_helper_ddl_v1()',
];
const args = () => ['exec', '-i', container, 'psql', '-X', '-q', '-A', '-t', '-v', 'ON_ERROR_STOP=1', '-h', '/tmp', '-U', 'postgres', '-d', database];
// Server statement/idle deadlines bound the sessions. There is deliberately no
// child-process timeout, kill, pg_cancel_backend or pg_terminate_backend route.
const docker = (argv, input) => brandNativeSpawnSync(argv, {input, encoding: 'utf8', maxBuffer: 8 * 1024 * 1024});
const prefix = `\\set VERBOSITY verbose\nset statement_timeout='30s';set request.jwt.claims='{"role":"service_role"}';set request.jwt.claim.role='service_role';`;
const raw = sql => docker(args(), prefix + sql);
const q = sql => {
  const result = raw(sql);
  assert.equal(result.status, 0, result.stderr || result.error?.message);
  return result.stdout.trim();
};
const failure = (sql, state, message) => {
  const result = raw(sql);
  assert.notEqual(result.status, 0, 'expected native SQL error');
  assert.match(result.stderr, new RegExp(`ERROR:\\s+${state}:`));
  if (message) assert.match(result.stderr, message);
  return {sqlstate: state, error: result.stderr.trim()};
};
const reportPath = reportRoot + 'brand-reference-normalized-writers-' + suffix + '.json';
const report = {
  status: 'running', syntheticOnly: true, startedAt: new Date().toISOString(), mode: failureTail ? 'failure-tail-only' : 'complete-writer-suite',
  fixtureManifest: fixturePath, container, database, checks: [], writeMeasurements: [],
  migrationSHA256: sha(source), matcherSHA256: sha(matcherSource),
  harnessSHA256: sha(readFileSync(new URL(import.meta.url))), reportPath,
  qualification: 'Whole-table normalized candidates retain exact rechecking. The independent legacy oracle evaluates all non-seed controls (at most four); 3,599 fixed irrelevant seed documents are separately verified. No repeated legacy full-scan baseline.',
};
const checkpoint = phase => {
  report.phase = phase;
  report.updatedAt = new Date().toISOString();
  writeFileSync(reportPath, JSON.stringify(report, null, 2) + '\n');
  console.log(`${report.updatedAt} ${phase}`);
};
const pass = label => { report.checks.push(label); checkpoint('PASS ' + label); };
function body(text, name) {
  const match = text.match(new RegExp(`create (?:or replace )?function private\\.${name}\\([\\s\\S]*?as \\$\\$([\\s\\S]*?)\\$\\$;`));
  assert.ok(match, 'exact source body ' + name);
  return match[1];
}
function session(name, sql, {transaction = true} = {}) {
  const child = brandNativeSpawn(args(), {stdio: ['pipe', 'pipe', 'pipe']});
  let stdout = '', stderr = '';
  child.stdout.setEncoding('utf8'); child.stderr.setEncoding('utf8');
  child.stdout.on('data', value => stdout += value);
  child.stderr.on('data', value => stderr += value);
  child.stdin.on('error', () => {});
  const done = new Promise(resolve => {
    child.on('error', error => resolve({code: -1, stdout, stderr: error.message}));
    child.on('close', code => resolve({code, stdout, stderr}));
  });
  child.stdin.write(`${prefix}set application_name=${lit(name)};${transaction ? "begin;set local idle_in_transaction_session_timeout='45s';" : ''}${sql};\n`);
  return {child, done, out: () => stdout, err: () => stderr};
}
async function until(predicate, label, sessions = []) {
  const deadline = Date.now() + 20000;
  while (Date.now() < deadline) {
    if (predicate()) return;
    for (const item of sessions) assert.equal(item.child.exitCode, null, `${label}: ${item.err()}`);
    await delay(100);
  }
  throw Error('timeout: ' + label);
}
async function finishOwnSession(item, command = 'rollback') {
  if (!item) return;
  if (!item.child.stdin.writableEnded) item.child.stdin.end(`${command};\n\\q\n`);
  return item.done;
}
async function ordered(holderSQL, waiterSQL, verify, {rollback = false, releaseAfterWaiter = false} = {}) {
  const token = randomUUID().slice(0, 8);
  const holderName = 'brand_norm_holder_' + token;
  const waiterName = 'brand_norm_waiter_' + token;
  let holder, waiter;
  try {
    holder = session(holderName, holderSQL + ";select 'HOLDER_READY'");
    await until(() => holder.out().includes('HOLDER_READY'), 'holder ready', [holder]);
    waiter = session(waiterName, waiterSQL);
    waiter.child.stdin.end('commit;\n\\q\n');
    await until(() => q(`select exists(select 1 from pg_stat_activity w join pg_stat_activity h on h.application_name=${lit(holderName)} where w.datname=current_database() and w.application_name=${lit(waiterName)} and w.wait_event_type='Lock' and h.pid=any(pg_blocking_pids(w.pid)));`) === 't', 'independent backend lock wait', [holder, waiter]);
    if (releaseAfterWaiter) await waiter.done;
    const a = await finishOwnSession(holder, rollback ? 'rollback' : 'commit');
    const b = await waiter.done;
    assert.equal(a.code, 0, a.stderr); verify(b);
  } finally {
    // Closing only these psql input streams rolls back an unfinished transaction;
    // an active statement remains subject to its original server-side deadline.
    await finishOwnSession(holder);
    await finishOwnSession(waiter);
  }
}
const available = () => q(`select private.platform_brand_index_expression_v1('public.${table}'::regclass) is not null;`) === 't';
const register = () => q(`do $$ declare spec record; idx oid; begin
 select * into spec from private.platform_brand_index_spec_v1('public.${table}'::regclass);
 if not found then raise exception 'small writer table not index-eligible'; end if;
 execute format('create index ${index} on public.${table} using gin ((%s) extensions.gin_trgm_ops)',spec.scan_expression);
 idx:='public.${index}'::regclass;
 insert into private.platform_brand_reference_indexes_v1(table_oid,index_oid,row_schema,scan_expression,index_expression,environment)
 select 'public.${table}'::regclass,idx,spec.row_schema,spec.scan_expression,pg_get_expr(indexprs,indrelid,false),private.platform_brand_index_environment_v1() from pg_index where indexrelid=idx
 on conflict(table_oid) do update set index_oid=excluded.index_oid,row_schema=excluded.row_schema,scan_expression=excluded.scan_expression,index_expression=excluded.index_expression,environment=excluded.environment;
 end $$;`);
const candidateSQL = (needle, expr) => `((${expr}) like ${lit(pattern(needle))} escape '!' or (${expr})=${lit('!brand-reference-exact-fallback-v1!')})`;
const compare = (needle, expected) => {
  const expr = q(`select private.platform_brand_index_expression_v1('public.${table}'::regclass);`);
  assert.ok(expr, 'current registered expression');
  // The 3,599 immutable seed rows contain only fixed irrelevant literals. Keep
  // whole-table index candidate counts, but do not rerun the known expensive
  // legacy full-scan baseline for every writer operation. The independent old
  // oracle evaluates every non-seed control row (at most four).
  const result = JSON.parse(q(`with candidates as materialized (select * from public.${table} x where ${candidateSQL(needle, expr)}),
   controls as materialized (select * from public.${table} where unrelated is distinct from 'brand-writer-seed')
   select jsonb_build_object('candidateExact',(select count(*) from candidates x where private.platform_brand_retention_row_mentions(to_jsonb(x),(select private.deleted_media_locator_columns('public.${table}'::regclass))::text[],${lit(needle)},${lit(needle)})),
   'independentOld',(select count(*) from controls x where private.deleted_media_mentions(private.deleted_media_locator_document(to_jsonb(x),'public.${table}'::regclass),${lit(needle)}) or private.deleted_media_mentions(private.deleted_media_locator_document(to_jsonb(x),'public.${table}'::regclass),${lit(needle)})),
   'controlRows',(select count(*) from controls),'seedRows',(select count(*) from public.${table} where unrelated='brand-writer-seed'))::text;`));
  assert.ok(result.controlRows <= 4, 'bounded mutation-oracle control population');
  assert.equal(result.seedRows, 3599, 'fixed seed population preserved');
  delete result.controlRows;
  delete result.seedRows;
  assert.deepEqual(result, {candidateExact: expected, independentOld: expected});
};
const assetFixture = () => {
  const id = randomUUID(), key = `brand-normalized-writer-fixture/logo/${id}.png`;
  q(`alter table public.platform_brand_assets disable trigger queue_platform_brand_asset_scan_before;
   alter table public.platform_brand_assets disable trigger enqueue_platform_brand_asset_scan_after;
   insert into storage.objects(id,bucket_id,name,version,metadata) values(gen_random_uuid(),'platform-brand-assets',${lit(key)},'fixture-v1','{"size":23}');
   insert into public.platform_brand_assets(id,owner_user_id,asset_type,storage_object_key,storage_path,mime_type,file_size_bytes) values(${lit(id)},'brand-normalized-writer-fixture','logo',${lit(key)},${lit(key)},'image/png',23);
   alter table public.platform_brand_assets enable trigger queue_platform_brand_asset_scan_before;
   alter table public.platform_brand_assets enable trigger enqueue_platform_brand_asset_scan_after;`);
  return {id, key};
};
const remove = value => `update public.platform_brand_assets set deleted_at=clock_timestamp(),asset_state='archived' where id=${lit(value.id)}`;
const clear = value => `select private.platform_brand_retention_references_clear(${lit(value.id)})`;
async function isolationAndLockTimeout(value) {
  for (const isolation of ['repeatable read', 'serializable']) {
    failure(`begin isolation level ${isolation};${clear(value)};`, '25000', /brand_retention_read_committed_required/);
    pass(isolation + ' raises the unchanged 25000 isolation error');
  }
  await ordered('select private.platform_brand_retention_lock()', `set local lock_timeout='2s';${clear(value)}`, result => {
    assert.notEqual(result.code, 0); assert.match(result.stderr, /lock timeout/); pass('lock timeout remains an error, never clearance');
  }, {releaseAfterWaiter: true});
}
let setupComplete = false;
try {
  checkpoint('verify exact source and small native fixture before any write');
  assert.equal(fixture.sourceHashes[migration], sha(source));
  assert.equal(fixture.sourceHashes[matcherMigration], sha(matcherSource));
  report.runtime = brandNativePreflight(container);
  assert.equal(q("select count(*) from pg_class where relnamespace='public'::regnamespace and relname like 'brand_reference_perf_%';"), '0');
  assert.equal(q('show statement_timeout;'), '30s');
  report.installedBodySHA256 = {};
  for (const name of ['platform_brand_index_jsonb_bytes_v1', 'platform_brand_index_normalize_v1', 'platform_brand_index_spec_v1', 'platform_brand_index_environment_v1', 'platform_brand_index_expression_v1', 'platform_brand_retention_references_clear', 'platform_brand_retention_row_mentions']) {
    const expected = body(name === 'platform_brand_retention_row_mentions' ? matcherSource : source, name);
    const actual = JSON.parse(q(`select to_json(prosrc)::text from pg_proc where pronamespace='private'::regnamespace and proname=${lit(name)};`));
    assert.equal(actual, expected, name + ' installed source body'); report.installedBodySHA256[name] = sha(actual);
  }
  if (failureTail) {
    // The source-verified complete function obtains its original lock before
    // looking up the asset, so an absent UUID exercises these failures without
    // generating another asset or repeating writer/benchmark fixtures.
    const absent = {id: randomUUID()};
    assert.equal(q(`select count(*) from private.platform_brand_object_incarnations where asset_id=${lit(absent.id)};`), '0');
    await isolationAndLockTimeout(absent);
    report.status = 'passed'; checkpoint('bounded isolation/lock-timeout tail complete; no fixture mutation');
  } else {
  report.privateSchemaACLBefore = q("select coalesce(nspacl::text,'NULL') from pg_namespace where nspname='private';");
  report.publicSchemaACLBefore = q("select coalesce(nspacl::text,'NULL') from pg_namespace where nspname='public';");
  q(`begin;create role ${writer} nologin;create role ${member} nologin noinherit;create role ${owner} nologin noinherit;
   grant ${writer} to ${member};
   -- Fixture-owned roles need to name their explicitly granted test objects.
   -- No private schema access, CREATE privilege, or existing-role ACL changes.
   grant usage on schema public to ${writer},${member},${owner};
   create table public.${table}(id uuid primary key default gen_random_uuid(),media_url text,metadata jsonb default '{}',unrelated text,created_at timestamptz default timestamptz '2026-01-01 00:00:00+00',constraint writer_value_check check(media_url is distinct from 'forbidden'));
   insert into public.${table}(metadata,unrelated) select jsonb_build_object('status','ordinary','value','synthetic-'||n),'brand-writer-seed' from generate_series(1,3599) n;
   create trigger zzz_platform_brand_retention_reference before insert or update on public.${table} for each row execute function private.guard_platform_brand_retention_references();
   alter table public.${table} enable row level security;alter table public.${table} force row level security;
   create policy normalized_writer_fixture on public.${table} to authenticated,service_role,${writer},${owner} using(true) with check(true);
   grant select,insert,update,delete,truncate on public.${table} to authenticated,service_role,${writer},${owner};
   create function public.${definer}(p_value text) returns text language plpgsql security definer set search_path='' as $$begin insert into public.${table}(media_url) values(p_value);return current_user;end $$;
   create function public.${invoker}(p_value text) returns text language plpgsql security invoker set search_path='' as $$begin insert into public.${table}(media_url) values(p_value);return current_user;end $$;
   alter function public.${definer}(text) owner to ${owner};
   revoke all on function public.${definer}(text),public.${invoker}(text) from public,anon,authenticated,service_role;
   grant execute on function public.${definer}(text),public.${invoker}(text) to ${member};commit;`);
  setupComplete = true; register(); assert.ok(available());
  q(`analyze public.${table};`);
  report.seedProof = JSON.parse(q(`select jsonb_build_object('rows',count(*),'uniqueDocuments',count(distinct metadata),
   'exactFixedDocuments',count(*) filter(where metadata in(select jsonb_build_object('status','ordinary','value','synthetic-'||n) from generate_series(1,3599) n)),
   'allOtherFieldsExpected',bool_and(unrelated='brand-writer-seed' and media_url is null and created_at=timestamptz '2026-01-01 00:00:00+00'))::text from public.${table};`));
  assert.deepEqual(report.seedProof, {rows: 3599, uniqueDocuments: 3599, exactFixedDocuments: 3599, allOtherFieldsExpected: true});
  pass('small source-replayed fixture has an independently maintained normalized expression index');

  for (const role of ['anon', 'authenticated', 'service_role', ...roles]) {
    for (const signature of pureSignatures) assert.equal(q(`select has_function_privilege(${lit(role)},${lit(signature)},'EXECUTE');`), 't');
    for (const signature of privateSignatures) assert.equal(q(`select has_function_privilege(${lit(role)},${lit(signature)},'EXECUTE');`), 'f');
  }
  for (const signature of pureSignatures) {
    const attributes = JSON.parse(q(`select jsonb_build_object('volatility',provolatile,'definer',prosecdef,'strict',proisstrict,'parallel',proparallel,'leakproof',proleakproof,'cost',procost,'searchPath',proconfig,'publicExecute',(select count(*) from aclexplode(coalesce(proacl,acldefault('f',proowner))) a where a.grantee=0 and a.privilege_type='EXECUTE')) from pg_proc where oid=${lit(signature)}::regprocedure;`));
    assert.deepEqual(attributes, {volatility: 'i', definer: false, strict: false, parallel: 'u', leakproof: false, cost: 100, searchPath: ['search_path=""'], publicExecute: 1});
  }
  for (const role of roles) {
    assert.equal(q(`select has_schema_privilege(${lit(role)},'private','USAGE');`), 'f');
    assert.equal(q(`select has_table_privilege(${lit(role)},'private.platform_brand_reference_indexes_v1','SELECT');`), 'f');
  }
  report.directAccessFailure = failure(`set role ${writer};select private.platform_brand_index_normalize_v1('supplied%20input');`, '42501', /schema private/);
  pass('only two pure helpers gain PUBLIC EXECUTE; custom writers gain no private schema or table authority');

  const needle = 'native-normalized/writer-proof.png';
  const encoded = needle.replaceAll('/', '%252F');
  for (const role of ['authenticated', 'service_role', writer]) {
    const id = randomUUID();
    q(`set role ${role};insert into public.${table}(id,metadata) values(${lit(id)},jsonb_build_object('nested',${lit(encoded)}));reset role;`);
    compare(needle, 1);
    q(`set role ${role};update public.${table} set metadata='{"nested":"unrelated"}' where id=${lit(id)};reset role;`); compare(needle, 0);
    q(`set role ${role};update public.${table} set media_url=${lit(encoded)} where id=${lit(id)};reset role;`); compare(needle, 1);
    q(`set role ${role};delete from public.${table} where id=${lit(id)};reset role;`); compare(needle, 0);
    q(`begin;set local role ${role};insert into public.${table}(metadata) values(jsonb_build_object('nested',${lit(encoded)}));rollback;`); compare(needle, 0);
    failure(`set role ${role};insert into public.${table}(media_url,metadata) values('forbidden',jsonb_build_object('nested',${lit(encoded)}));`, '23514', /writer_value_check/); compare(needle, 0);
    pass(role + ' encoded INSERT/UPDATE/DELETE and rejected/rolled-back writes maintain exact candidate equivalence');
  }
  failure(`set role ${member};insert into public.${table}(media_url) values(${lit(needle)});`, '42501', /permission denied/);
  failure(`set role ${member};select public.${invoker}(${lit(needle)});`, '42501', /permission denied/);
  q(`set session authorization ${member};set role ${writer};insert into public.${table}(media_url) values(${lit(encoded)});reset role;reset session authorization;`); compare(needle, 1);
  q(`delete from public.${table} where media_url=${lit(encoded)};`);
  assert.equal(q(`set role ${member};select public.${definer}(${lit(encoded)});reset role;`), owner); compare(needle, 1);
  q(`delete from public.${table} where media_url=${lit(encoded)};`);
  pass('NOINHERIT denies direct/invoker writes, SET ROLE authorizes membership, and custom definer owner maintains the same index');

  // Independent plan evidence uses the natural planner without overrides.
  const expr = q(`select private.platform_brand_index_expression_v1('public.${table}'::regclass);`);
  const planSQL = `explain (analyze,buffers,format json) select count(*) from public.${table} x where ${candidateSQL(needle, expr)};`;
  const plan = JSON.parse(q(planSQL));
  const nodes = []; const visit = node => { nodes.push(node); for (const child of node.Plans ?? []) visit(child); }; visit(plan[0].Plan);
  assert.ok(nodes.some(node => node['Node Type'] === 'Bitmap Index Scan' && node['Index Name'] === index), 'native index maintenance proof actually reads the generated GIN');
  report.absentCandidatePlan = {sql: planSQL, result: plan};
  pass('natural native GIN plan reads the maintained index with zero absent-needle candidates');

  for (const [label, document, count] of [
    ['ordinary', "jsonb_build_object('value','ordinary writer cost')", 10],
    ['encoded', "jsonb_build_object('value','writer%252Fcost')", 10],
    ['near-byte-boundary', "jsonb_build_object('value',repeat('a',1048400))", 1],
  ]) {
    const started = performance.now();
    const result = JSON.parse(q(`begin;set local role authenticated;explain (analyze,buffers,format json) insert into public.${table}(metadata) select ${document} from generate_series(1,${count});rollback;`));
    report.writeMeasurements.push({label, rows: count, transaction: 'rolled back', clientElapsedMs: performance.now() - started, plan: result});
  }
  for (const role of ['authenticated', 'service_role', writer]) {
    q(`begin;set local role ${role};truncate public.${table};insert into public.${table}(media_url) values(${lit(encoded)});rollback;`); compare(needle, 0);
  }
  pass('ordinary/encoded/near-boundary writer costs recorded and authorized TRUNCATE rollback preserves index contents');

  for (const rollback of [false, true]) {
    const value = assetFixture();
    const encodedKey = value.key.replaceAll('/', '%252F');
    await ordered(`set local role ${writer};insert into public.${table}(media_url) values(${lit(encodedKey)})`, `${remove(value)};${clear(value)}`, result => {
      assert.equal(result.code, 0, result.stderr); assert.equal(result.stdout.trim(), rollback ? 't' : 'f');
      pass('encoded writer ' + (rollback ? 'rollback clears' : 'commit blocks') + ' after native retirement lock wait');
    }, {rollback});
    q(`delete from public.${table} where media_url=${lit(encodedKey)};`);
  }
  for (const rollback of [false, true]) {
    const value = assetFixture();
    await ordered(`${remove(value)};${clear(value)}`, `set local role ${writer};insert into public.${table}(media_url) values(${lit(value.key.replaceAll('/', '%252F'))})`, result => {
      if (rollback) assert.equal(result.code, 0, result.stderr);
      else { assert.notEqual(result.code, 0); assert.match(result.stderr, /brand_retained_reference_forbidden/); }
      pass('retirement ' + (rollback ? 'rollback permits' : 'commit rejects') + ' waiting encoded writer');
    }, {rollback});
    q(`delete from public.${table} where media_url=${lit(value.key.replaceAll('/', '%252F'))};`);
  }
  const retired = assetFixture(); q(remove(retired)); assert.equal(q(clear(retired)), 't');
  for (const rollback of [false, true]) {
    await ordered(`alter table public.${table} add column "ddl URL" text default ${lit(retired.key)}`, clear(retired), result => {
      assert.equal(result.code, 0, result.stderr); assert.equal(result.stdout.trim(), rollback ? 't' : 'f');
      pass('DDL-first ADD ' + (rollback ? 'rollback preserves normalized index' : 'commit exposes reference through exact fallback'));
    }, {rollback});
    if (!rollback) { q(`alter table public.${table} drop column "ddl URL";drop index public.${index};`); register(); }
    assert.ok(available());
  }
  await ordered(`lock table public.${table} in access share mode;select private.platform_brand_index_expression_v1('public.${table}'::regclass) is not null`, `alter table public.${table} rename column unrelated to renamed_unrelated`, result => { assert.equal(result.code, 0, result.stderr); });
  assert.equal(available(), false);
  q(`alter table public.${table} rename column renamed_unrelated to unrelated;`); assert.ok(available());
  pass('scan relation lock blocks RENAME; committed name mismatch falls back and rollback-compatible restoration revalidates');
  await ordered(`lock table public.${table} in access share mode`, `alter table public.${table} drop column unrelated cascade`, result => { assert.equal(result.code, 0, result.stderr); });
  assert.equal(available(), false);
  q(`alter table public.${table} add column unrelated text;`); register(); assert.ok(available());
  pass('scan relation lock blocks DROP and the lost dependent index cannot suppress exact fallback');
  for (const sql of [
    `alter table public.${table} alter column unrelated type varchar(300)`,
    `alter table public.${table} add column unsupported_array text[]`,
    `drop index public.${index}`,
  ]) assert.equal(q(`begin;${sql};select private.platform_brand_index_expression_v1('public.${table}'::regclass) is null;rollback;`), 't');
  assert.ok(available()); pass('type/unsupported-column/missing-index mutations fall back and transactional rollback restores validity');
  // A native concurrent build stopped by its own lock_timeout leaves a real
  // invalid index. No process/backend cancellation is needed or attempted.
  const invalidIndex = 'brand_norm_invalid_' + suffix;
  let invalidHolder, invalidBuilder;
  try {
    invalidHolder = session('brand_norm_invalid_holder_' + suffix, `insert into public.${table}(metadata) values('{}');select 'HOLDER_READY'`);
    await until(() => invalidHolder.out().includes('HOLDER_READY'), 'invalid-index writer ready', [invalidHolder]);
    const invalidExpression = q(`select private.platform_brand_index_expression_v1('public.${table}'::regclass);`);
    invalidBuilder = session('brand_norm_invalid_builder_' + suffix, `set lock_timeout='2s';create index concurrently ${invalidIndex} on public.${table} using gin ((${invalidExpression}) extensions.gin_trgm_ops)`, {transaction: false});
    invalidBuilder.child.stdin.end('\\q\n');
    const result = await invalidBuilder.done;
    assert.notEqual(result.code, 0); assert.match(result.stderr, /lock timeout/);
    assert.equal(q(`select indisvalid from pg_index where indexrelid='public.${invalidIndex}'::regclass;`), 'f');
    await finishOwnSession(invalidHolder);
    assert.equal(q(`begin;update private.platform_brand_reference_indexes_v1 set index_oid='public.${invalidIndex}'::regclass,index_expression=(select pg_get_expr(indexprs,indrelid,false) from pg_index where indexrelid='public.${invalidIndex}'::regclass) where table_oid='public.${table}'::regclass;select private.platform_brand_index_expression_v1('public.${table}'::regclass) is null;rollback;`), 't');
    pass('real lock-timeout-invalid GIN index cannot authorize the optimized path');
  } finally {
    await finishOwnSession(invalidHolder);
    await finishOwnSession(invalidBuilder);
    q(`drop index if exists public.${invalidIndex};`);
  }
  q(`create table public.brand_norm_unknown_${suffix}(id uuid,media_url text);`);
  assert.equal(q(clear(retired)), 'f');
  q(`drop table public.brand_norm_unknown_${suffix};`);
  pass('new unguarded locator table blocks clearance even when empty');
  q(`alter table public.${table} disable trigger zzz_platform_brand_retention_reference;`);
  assert.equal(q(clear(retired)), 'f');
  q(`alter table public.${table} enable trigger zzz_platform_brand_retention_reference;`);
  pass('normalized index never bypasses reference-trigger coverage');
  await isolationAndLockTimeout(retired);
  assert.equal(q("select coalesce(nspacl::text,'NULL') from pg_namespace where nspname='private';"), report.privateSchemaACLBefore);
  report.status = 'passed'; checkpoint('all focused native writer/ACL/maintenance/race checks passed');
  }
} catch (error) {
  report.status = 'failed'; report.error = error.message; checkpoint('stopped at first writer/ACL/race failure');
  throw error;
} finally {
  if (setupComplete) {
    try {
      q(`begin;delete from private.platform_brand_reference_indexes_v1 where table_oid='public.${table}'::regclass;
       drop function public.${definer}(text),public.${invoker}(text);drop table public.${table};
       revoke usage on schema public from ${writer},${member},${owner};
       revoke ${writer} from ${member};drop role ${member},${owner},${writer};commit;`);
      assert.equal(q("select coalesce(nspacl::text,'NULL') from pg_namespace where nspname='public';"), report.publicSchemaACLBefore, 'test-owned public schema grants fully removed');
      report.ownedObjectsRemoved = true;
    } catch (error) { report.cleanupError = error.message; report.status = 'failed'; }
  }
  report.completedAt = new Date().toISOString();
  writeFileSync(reportPath, JSON.stringify(report, null, 2) + '\n');
  console.log('Evidence: ' + reportPath);
}
assert.equal(report.status, 'passed', report.cleanupError ?? report.error ?? 'native writer checks incomplete');
