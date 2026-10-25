#!/usr/bin/env node
import {createBrandGuardCloneRestorer} from './lib/brand-guard-clone-restore.mjs';
// Native PostgreSQL only: independent backends, complete migrated LOCAL clones.
// Synthetic SQL scanner results are not engine/byte/provider evidence. The
// separate worker tests exercise the trusted scanner boundary, not attestation.
import assert from 'node:assert/strict';
import {spawn, spawnSync} from 'node:child_process';
import {randomUUID} from 'node:crypto';
import {readFileSync, readdirSync} from 'node:fs';
import {setTimeout as delay} from 'node:timers/promises';

if (process.argv.includes('--help')) {
  console.log('After local Supabase reset: archived Brand native PostgreSQL proof in disposable local clones only. --negative-control removes NOWAIT only in a clone, requires an observed independent row wait and timeout, then restores it. No remote URL, credential arguments, provider calls or PGlite concurrency claim.');
  process.exit(0);
}
const negativeControl = process.argv.includes('--negative-control');
assert.deepEqual(process.argv.slice(2), negativeControl ? ['--negative-control'] : [], 'no database URL or credentials accepted');
const project = readFileSync('supabase/config.toml', 'utf8').match(/^project_id\s*=\s*"([A-Za-z0-9_.-]{1,200})"/m)?.[1];
assert.ok(project);
const container = process.env.SUPABASE_DB_CONTAINER || `supabase_db_${project}`;
assert.match(container, /^supabase_db_[A-Za-z0-9_.-]{1,200}$/);
const cloneGuardRestore = createBrandGuardCloneRestorer({container});
const lit = value => `'${String(value).replaceAll("'", "''")}'`;
const json = value => `${lit(JSON.stringify(value))}::jsonb`;
const redact = value => String(value).replaceAll(/[A-Za-z0-9_-]{40,}/g, '<redacted>')
  .replaceAll(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi, '<synthetic-id>');
const claims = `set request.jwt.claims='{"role":"service_role"}';set request.jwt.claim.role='service_role';`;
const docker = (args, input, encoding = 'utf8') => spawnSync('docker', args, {input, encoding, maxBuffer: 256 * 1024 * 1024, timeout: 120000});
const ok = (result, label) => {
  assert.equal(result.status, 0, `${label}: ${redact(result.error?.message || result.stderr)}`);
  return result.stdout;
};
let database, cloned = false, sourceRows, sourceCatalog, checks = 0, observedQueues = 0;
const args = (db = database) => ['exec', '-i', container, 'psql', '-X', '-q', '-A', '-t', '-v', 'ON_ERROR_STOP=1', '-U', 'postgres', '-d', db];
const query = (sql, db = database) => ok(docker(args(db), `${db === 'postgres' ? 'set default_transaction_read_only=on;' : claims}set time zone 'UTC';set statement_timeout='15s';${sql}`), 'local query').trim();
const admin = (command, input, encoding = 'utf8') => docker(['exec', ...(input === undefined ? [] : ['-i']), container,
  'sh', '-lc', 'PGPASSWORD="$POSTGRES_PASSWORD" exec "$@"', 'archived-brand-admin', ...command], input, encoding);

// Hash every row, not just counts, in every relevant user-owned schema table.
// Only aggregate fingerprints leave the source database, never its row data.
function rowFingerprint(db) {
  const tables = JSON.parse(query(`select coalesce(json_agg(format('%I.%I',n.nspname,c.relname) order by n.nspname,c.relname),'[]')
    from pg_class c join pg_namespace n on n.oid=c.relnamespace
    where n.nspname in ('auth','storage','public','private') and c.relkind in ('r','p');`, db));
  return JSON.parse(query(`select jsonb_object_agg(name,fingerprint) from (${tables.map(table => `select ${lit(table)} name,
    md5(coalesce(string_agg(md5(to_jsonb(x)::text),'' order by md5(to_jsonb(x)::text)),'')) fingerprint from ${table} x`).join(' union all ')}) all_tables;`, db));
}
const catalogFingerprint = `select jsonb_build_object(
  'functions',(select md5(string_agg(p.oid::text||':'||pg_get_functiondef(p.oid)||':'||coalesce(p.proacl::text,''),'' order by p.oid))
    from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname in ('public','private') and p.prokind='f'),
  'triggers',(select md5(string_agg(t.oid::text||':'||pg_get_triggerdef(t.oid)||':'||t.tgenabled::text,'' order by t.oid))
    from pg_trigger t join pg_class c on c.oid=t.tgrelid join pg_namespace n on n.oid=c.relnamespace
    where not t.tgisinternal and n.nspname in ('public','private','storage','auth')),
  'relations',(select md5(string_agg(c.oid::text||':'||c.relrowsecurity::text||':'||c.relforcerowsecurity::text||':'||coalesce(c.relacl::text,''),'' order by c.oid))
    from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname in ('public','private','storage','auth')),
  'policies',(select md5(coalesce(string_agg(to_jsonb(p)::text,'' order by p.oid),'')) from pg_policy p))::text;`;
const guardFingerprint = `select jsonb_build_object(
  'functions',(select md5(string_agg(p.oid::text||':'||pg_get_functiondef(p.oid),'' order by p.oid)) from pg_proc p where p.oid=any(array[
    'private.guard_platform_brand_retention_references()'::regprocedure,'private.guard_deleted_content_secondary_coverage()'::regprocedure,
    'public.claim_media_scan_jobs(integer,text)'::regprocedure,'public.complete_media_scan_job(uuid,text,text,text,text,text,text,integer)'::regprocedure,
    'public.begin_media_scan_byte_observation(uuid,text,integer)'::regprocedure,'public.record_media_scan_byte_receipt(uuid,uuid,text,text,bigint)'::regprocedure])),
  'triggers',(select md5(string_agg(pg_get_triggerdef(t.oid)||':'||t.tgenabled::text,'' order by t.tgrelid,t.tgname)) from pg_trigger t
    where not t.tgisinternal and t.tgrelid=any(array['public.media_scan_jobs'::regclass,'public.platform_brand_assets'::regclass,
      'public.video_renditions'::regclass,'public.media_renditions'::regclass,'public.media_transcode_jobs'::regclass,'storage.objects'::regclass])))::text;`;
const succeeded = result => assert.equal(result.code, 0, redact(result.stderr));
const denied = (result, pattern) => {
  assert.notEqual(result.code, 0, 'operation must refuse');
  assert.doesNotMatch(result.stderr, /deadlock detected|statement timeout|lock timeout/i, 'watchdog/deadlock is not a positive NOWAIT result');
  assert.match(result.stderr, pattern);
};
function refuse(sql, pattern) {
  const r = docker(args(), `\\set VERBOSITY verbose\n${claims}set statement_timeout='3s';${sql};`);
  denied({code: r.status, stderr: String(r.stderr)}, pattern); checks++;
}
function session(name, sql, finish = false, timeout = '35s') {
  const child = spawn('docker', args(), {stdio: ['pipe', 'pipe', 'pipe']});
  let stdout = '', stderr = '';
  child.stdout.setEncoding('utf8'); child.stderr.setEncoding('utf8');
  child.stdout.on('data', value => { stdout += value; }); child.stderr.on('data', value => { stderr += value; });
  child.stdin.on('error', () => {});
  const done = new Promise(resolve => {
    child.on('error', error => resolve({code: -1, stdout, stderr: error.message}));
    child.on('close', code => resolve({code, stdout, stderr}));
  });
  child.stdin.write(`\\set VERBOSITY verbose\n${claims}set application_name=${lit(name)};begin isolation level read committed;
    set local time zone 'UTC';set local statement_timeout=${lit(timeout)};set local idle_in_transaction_session_timeout='45s';${sql};\n`);
  if (finish) child.stdin.end('commit;\n\\q\n');
  return {child, done, output: () => stdout, status: () => ({code: child.exitCode, stdout, stderr})};
}
async function until(predicate, label, sessions = []) {
  const deadline = Date.now() + 20000;
  while (Date.now() < deadline) {
    if (predicate()) return;
    for (const s of sessions) if (s.status().code !== null) throw Error(`${label}: backend exited: ${redact(s.status().stderr)}`);
    await delay(25); // Polling only. Lock order is established by pg_blocking_pids.
  }
  throw Error(`timeout: ${label}`);
}
async function terminate(name, value) {
  if (!value || value.child.exitCode !== null) return;
  query(`select pg_terminate_backend(pid) from pg_stat_activity where datname=current_database() and application_name=${lit(name)} and pid<>pg_backend_pid();`);
  value.child.kill('SIGTERM'); await Promise.race([value.done, delay(1000)]);
}
const blocking = (holder, waiter) => `select count(*) from pg_stat_activity w join pg_stat_activity h
  on h.datname=w.datname and h.application_name=${lit(holder)} where w.datname=current_database()
  and w.application_name=${lit(waiter)} and w.wait_event_type='Lock' and h.pid=any(pg_blocking_pids(w.pid));`;
async function ordered(first, second, verify = succeeded, {label, fenceFirst = false, advisoryWait = false, afterQueue = '', rollback = false} = {}) {
  const hn = `archive-holder-${process.pid}-${checks}`, wn = `archive-waiter-${process.pid}-${checks}`;
  let h, w;
  try {
    h = session(hn, `${first};select 'HOLDER_READY'`);
    await until(() => h.output().includes('HOLDER_READY'), `${label}: holder ready`, [h]);
    w = session(wn, second, true);
    await until(() => query(blocking(hn, wn)) === '1', `${label}: observed independent backend queue`, [h, w]);
    observedQueues++;
    if (fenceFirst || advisoryWait) assert.equal(query(`select count(*) from pg_locks l join pg_stat_activity a on a.pid=l.pid
      where a.datname=current_database() and a.application_name=${lit(wn)} and l.locktype='advisory'
      and l.classid=176214 and l.objid=30 and l.objsubid=2 and ${fenceFirst ? '' : 'not '}l.granted;`), fenceFirst ? '0' : '1',
    fenceFirst ? 'fence SHARE before Brand advisory 30' : 'row writer really queues on advisory 30');
    h.child.stdin.end(`${afterQueue};${rollback ? 'rollback' : 'commit'};\n\\q\n`);
    const [a, b] = await Promise.all([h.done, w.done]); succeeded(a); verify(b, a); checks++;
  } finally { await terminate(wn, w); await terminate(hn, h); }
}
async function rowContention(lock, operation, verify, negative = false) {
  const hn = `archive-row-${process.pid}-${checks}`, wn = `archive-probe-${process.pid}-${checks}`;
  let h, w;
  try {
    h = session(hn, `${lock};select 'HOLDER_READY'`);
    await until(() => h.output().includes('HOLDER_READY'), 'row owner ready', [h]);
    w = session(wn, operation, true, '3s');
    if (negative) {
      await until(() => query(blocking(hn, wn)) === '1', 'negative control observed independent backend row wait', [h, w]);
      assert.equal(query(`select count(*) from pg_locks l join pg_stat_activity a on a.pid=l.pid where a.datname=current_database()
        and a.application_name=${lit(wn)} and not l.granted and l.locktype in ('transactionid','tuple');`), '1');
      observedQueues++;
    }
    verify(await w.done);
    assert.equal(h.child.exitCode, null, 'holder remains locked through refusal');
    h.child.stdin.end('rollback;\n\\q\n'); succeeded(await h.done); checks++;
  } finally { await terminate(wn, w); await terminate(hn, h); }
}
function dropClone() {
  if (!cloned) return;
  ok(docker(['exec', container, 'dropdb', '-U', 'postgres', '--if-exists', '--force', database]), 'drop generated clone'); cloned = false;
}
function restoreClone(dump, phase) {
  database = `archived_brand_${phase}_${process.pid}_${randomUUID().replaceAll('-', '').slice(0, 12)}`;
  assert.match(database, /^archived_brand_(unarmed|armed|negative)_[0-9]+_[a-f0-9]{12}$/);
  ok(docker(['exec', container, 'createdb', '-U', 'postgres', '-T', 'template0', database]), 'create generated clone'); cloned = true;
  ok(docker(args(), 'create schema vault;create extension supabase_vault with schema vault;'), 'initialize clone');
  ok(admin(['psql', '-X', '-q', '-v', 'ON_ERROR_STOP=1', '-U', 'supabase_admin', '-d', database], cloneGuardRestore.prepare(dump, database), null), 'restore complete schema');
}

const worker = 'archived-native-fixture';
const clean = {status: 'clean', sha256: 'a'.repeat(64), sizeBytes: 23, scannerProvider: 'clamav', scannerVersion: 'ClamAV synthetic native SQL',
  signatureVersion: 'synthetic-signatures/1', exitCode: 0, durationMs: 1, findingName: null, errorCode: null, fullReadback: true};
const request = f => `select public.request_platform_brand_archived_verification(${lit(f.id)},${json(f.binding)})`;
const claim = (ids, w = worker) => `select public.claim_platform_brand_archived_verification(array[${ids.map(lit).join(',')}]::uuid[],${lit(w)})`;
const attemptArgs = a => `${lit(a.attemptId)},${lit(a.claimToken)},${lit(a.workerId)}`;
const read = a => `select public.read_platform_brand_archived_verification_attempt(${attemptArgs(a)})`;
const record = (a, result = clean) => `select public.record_platform_brand_archived_verification_result(${attemptArgs(a)},${json(result)})`;
const seal = (a, result) => `select public.seal_platform_brand_archived_verification(${attemptArgs(a)},${lit(result)})`;
const parsed = sql => JSON.parse(query(sql));
const rows = (table, condition) => query(`select count(*) from ${table} where ${condition}`);
function fixture({normalJob = false, due = false} = {}) {
  const id = randomUUID(), objectId = randomUUID(), key = `archived_native_fixture/logo/${id}.png`;
  // Historical no-job fixture only: the ordinary enqueue hooks are restored
  // atomically BEFORE removal or any verifier operation. No protocol guard is
  // disabled. Failure rolls back the trigger state with the transaction.
  query(`begin;
    ${normalJob ? '' : 'alter table public.platform_brand_assets disable trigger queue_platform_brand_asset_scan_before;alter table public.platform_brand_assets disable trigger enqueue_platform_brand_asset_scan_after;'}
    insert into storage.objects(id,bucket_id,name,version,metadata) values(${lit(objectId)},'platform-brand-assets',${lit(key)},'fixture-v1','{"size":23}');
    insert into public.platform_brand_assets(id,owner_user_id,asset_type,storage_object_key,storage_path,mime_type,file_size_bytes,scan_status)
      values(${lit(id)},'archived_native_fixture','logo',${lit(key)},${lit(key)},'image/png',23,'manual_review');
    ${normalJob ? '' : 'alter table public.platform_brand_assets enable trigger queue_platform_brand_asset_scan_before;alter table public.platform_brand_assets enable trigger enqueue_platform_brand_asset_scan_after;'}
    update public.platform_brand_assets set deleted_at=clock_timestamp(),asset_state='archived' where id=${lit(id)};
    commit;`);
  // Explicit synthetic conservative legacy clock; no protocol operation moves
  // this clock. Time travel is complete and immutability restored before request.
  query(`begin;alter table private.platform_brand_object_incarnations disable trigger brand_retention_immutable;
    update private.platform_brand_object_incarnations set removed_at=removed_at${due ? "-interval '721 hours'" : "+interval '1 day'"},
      retain_until=retain_until${due ? "-interval '721 hours'" : "+interval '1 day'"},removal_clock='legacy_unknown_conservative_observation' where asset_id=${lit(id)};
    alter table private.platform_brand_object_incarnations enable trigger brand_retention_immutable;commit;`);
  return {id, objectId, key, binding: parsed(`select public.read_platform_brand_retention_binding(${lit(id)})`)};
}
function staged(stage = 'attempt', options) {
  const f = fixture(options); f.request = query(request(f));
  if (stage !== 'request') {
    f.attempt = parsed(claim([f.request])).attempts[0]; assert.ok(f.attempt);
    if (['result', 'sealed'].includes(stage)) f.result = parsed(record(f.attempt)).resultId;
    if (stage === 'sealed') f.receipt = parsed(seal(f.attempt, f.result)).receiptId;
  }
  return f;
}
const unchanged = f => query(`select jsonb_build_object('source',(select to_jsonb(a) from public.platform_brand_assets a where id=${lit(f.id)}),
  'incarnation',(select to_jsonb(i) from private.platform_brand_object_incarnations i where asset_id=${lit(f.id)}),
  'jobs',(select coalesce(jsonb_agg(j),'[]') from public.media_scan_jobs j where target_table='platform_brand_assets' and target_id=${lit(f.id)}),
  'claims',(select coalesce(jsonb_agg(c),'[]') from private.platform_brand_expiry_claims c where asset_id=${lit(f.id)}))::text;`);
function expireAttempt(a) {
  query(`begin;alter table private.platform_brand_archived_attempts disable trigger archived_evidence_immutable;
    update private.platform_brand_archived_attempts set claimed_at=claimed_at-interval '21 minutes',expires_at=expires_at-interval '21 minutes' where id=${lit(a.attemptId)};
    alter table private.platform_brand_archived_attempts enable trigger archived_evidence_immutable;commit;`);
}
const expectNowait = sql => `do $expected$ begin begin ${sql};raise exception 'unexpected_row_lock_acquisition';
  exception when sqlstate '55P03' then null;end;end $expected$;select 'ROW_NOWAIT_DENIED'`;

try {
  if (process.env.DOCKER_HOST) assert.match(process.env.DOCKER_HOST, /^(unix|npipe):\/\//, 'remote Docker forbidden');
  assert.match(ok(docker(['context', 'inspect', '--format', '{{.Endpoints.docker.Host}}']), 'local Docker required').trim(), /^(unix|npipe):\/\//);
  assert.ok(ok(docker(['ps', '--filter', 'label=com.supabase.cli.project', '--format', '{{.Names}}']), 'local CLI discovery').split('\n').includes(container));
  assert.deepEqual(parsedSourceVersions(), readdirSync('supabase/migrations').filter(name => /^\d+_.+\.sql$/.test(name)).map(name => name.split('_')[0]).sort(), 'complete reset checkout schema required');
  sourceRows = rowFingerprint('postgres'); sourceCatalog = query(catalogFingerprint, 'postgres');
  const dump = admin(['pg_dump', '-U', 'supabase_admin', '--exclude-extension=pg_cron', '--exclude-extension=supabase_vault', '--exclude-extension=pg_graphql',
    '--exclude-schema=cron', '--exclude-schema=realtime', '--exclude-schema=_realtime', '--exclude-schema=vault', '--exclude-schema=graphql', '--exclude-schema=graphql_public', 'postgres'], undefined, null);
  ok(dump, 'read-only source dump');
  for (const phase of negativeControl ? ['negative'] : ['unarmed', 'armed']) {
    restoreClone(dump.stdout, phase);
    const catalogBefore = query(catalogFingerprint), guardsBefore = query(guardFingerprint);
    assert.equal(query('select not archived_verification_enabled and not expiry_enabled and not batch_enabled and not version_delete_verified from private.platform_brand_retention_settings'), 't');
    if (phase === 'armed') {
      query(readFileSync('tests/fixtures/deleted-content-local-qualification.sql', 'utf8'));
      query('update private.deleted_content_retention_settings set activation_ready=true,capture_enabled=true;update private.deleted_content_retention_settings set capture_enabled=false,media_staging_enabled=false,text_expiry_enabled=false,media_expiry_enabled=false;');
    }
    assert.equal(query('select armed from private.deleted_media_reference_fence'), phase === 'armed' ? 't' : 'f');
    query('update private.platform_brand_retention_settings set archived_verification_enabled=true');
    if (negativeControl) {
      const f = staged(), signature = 'private.platform_brand_archived_snapshot(uuid,boolean)';
      const original = query(`select pg_get_functiondef(${lit(signature)}::regprocedure)`);
      assert.match(original, /for share nowait/i);
      try {
        assert.equal(cloned, true);
        query(original.replace(/for share nowait/gi, 'for share'));
        for (const lock of [`select id from public.platform_brand_assets where id=${lit(f.id)} for update`,
          `select id from storage.objects where id=${lit(f.objectId)} for update`]) {
          await rowContention(lock, read(f.attempt), result => {
            assert.notEqual(result.code, 0, 'regressed reader cannot return before held row releases');
            assert.match(result.stderr, /57014/); assert.match(result.stderr, /canceling statement due to statement timeout/);
            assert.doesNotMatch(result.stderr, /deadlock detected/);
          }, true);
        }
      } finally { query(original); }
      assert.equal(query(`select pg_get_functiondef(${lit(signature)}::regprocedure)`), original, 'negative control clone definition restored');
      await rowContention(`select id from public.platform_brand_assets where id=${lit(f.id)} for update`, read(f.attempt), result => {
        succeeded(result); assert.equal(JSON.parse(result.stdout).status, 'unavailable');
      });
      assert.equal(rows('private.platform_brand_archived_results', `attempt_id=${lit(f.attempt.attemptId)}`), '0');
    } else {
      // Each of the five entry points queues on the global fence before owning
      // advisory 30, both unarmed and permanently armed. Reverse order proves
      // a running verifier holds the fence SHARE until its transaction ends.
      const fence = 'select armed from private.deleted_media_reference_fence where singleton for update';
      for (const name of ['request', 'claim', 'read', 'record', 'seal']) {
        for (const reverse of [false, true]) {
          const f = name === 'request' ? fixture() : staged(name === 'claim' ? 'request' : name === 'seal' ? 'result' : 'attempt');
          const operation = name === 'request' ? request(f) : name === 'claim' ? claim([f.request]) : name === 'read' ? read(f.attempt) : name === 'record' ? record(f.attempt) : seal(f.attempt, f.result);
          await ordered(reverse ? operation : fence, reverse ? fence : operation, succeeded,
            {label: `${phase}: ${name} global fence ${reverse ? 'after' : 'before'}`, fenceFirst: !reverse});
        }
      }
      // Duplicate claim, result and seal races use real independently blocked
      // transactions, not simultaneous promises or elapsed-time assumptions.
      {
        const f = staged('request'), before = unchanged(f);
        await ordered(claim([f.request]), claim([f.request], 'competing-worker'), result => {
          succeeded(result); assert.deepEqual(JSON.parse(result.stdout).attempts, []);
        }, {label: 'duplicate claim'});
        assert.equal(rows('private.platform_brand_archived_attempts', `request_id=${lit(f.request)}`), '1');
        const a = parsed(`select jsonb_build_object('attemptId',id,'claimToken',claim_token,'workerId',worker_id) from private.platform_brand_archived_attempts where request_id=${lit(f.request)}`);
        for (const sizeBytes of [0, 22, 24]) refuse(record(a, {...clean, sizeBytes}), /archived_brand_scanner_result_invalid/);
        await ordered(record(a), record(a), (result, holder) => {
          succeeded(result); assert.deepEqual(JSON.parse(result.stdout), JSON.parse(holder.stdout.split('\n')[0]));
        }, {label: 'duplicate result'});
        const resultId = query(`select id from private.platform_brand_archived_results where attempt_id=${lit(a.attemptId)}`);
        await ordered(record(a), record(a, {...clean, sha256: 'b'.repeat(64)}), result => denied(result, /archived_brand_result_immutable_conflict/), {label: 'conflicting result'});
        // Result acknowledgment survives a missing receipt/response. Reclaim is
        // refused while its lease lives; seal/replay recover exact immutable IDs.
        assert.deepEqual(parsed(claim([f.request], 'recovery-worker')).attempts, []);
        assert.equal(rows('private.platform_brand_archived_receipts', `result_id=${lit(resultId)}`), '0');
        await ordered(seal(a, resultId), seal(a, resultId), (result, holder) => {
          succeeded(result); assert.deepEqual(JSON.parse(result.stdout), JSON.parse(holder.stdout.split('\n')[0]));
        }, {label: 'duplicate seal and lost receipt acknowledgment recovery'});
        assert.equal(rows('private.platform_brand_archived_receipts', `result_id=${lit(resultId)}`), '1');
        assert.equal(rows('private.platform_brand_object_proofs', `asset_id=${lit(f.id)}`), '1');
        assert.equal(unchanged(f), before, 'source tombstone, conservative clock, scan state, jobs and expiry claims unchanged');
      }
      for (const holdFirst of [true, false]) {
        const f = staged('result'), holdId = randomUUID(), before = unchanged(f);
        const hold = `insert into public.legal_holds(id,target_type,target_id,reason,status) values(${lit(holdId)},'platform_brand_asset',${lit(f.id)},'Synthetic archived verification ordering','active')`;
        await ordered(holdFirst ? hold : seal(f.attempt, f.result), holdFirst ? seal(f.attempt, f.result) : hold,
          result => holdFirst ? denied(result, /archived_brand_attempt_unavailable/) : succeeded(result), {label: holdFirst ? 'hold first prevents seal' : 'seal first preserves subsequent hold'});
        assert.equal(rows('private.platform_brand_archived_receipts', `result_id=${lit(f.result)}`), holdFirst ? '0' : '1');
        assert.equal(parsed(read(f.attempt)).status, 'unavailable');
        refuse(record(f.attempt), /archived_brand_attempt_unavailable/);
        assert.equal(unchanged(f), before);
      }
      // A preexisting permanent claim is fixture evidence, not an issued provider
      // operation. It prevents all further read/result/seal authority.
      {
        const f = staged('result');
        query(`select private.platform_brand_retention_lock();insert into private.platform_brand_expiry_claims(asset_id) values(${lit(f.id)})`);
        assert.equal(parsed(read(f.attempt)).status, 'unavailable');
        refuse(record(f.attempt), /archived_brand_attempt_unavailable/); refuse(seal(f.attempt, f.result), /archived_brand_attempt_unavailable/);
        assert.equal(rows('private.platform_brand_archived_receipts', `result_id=${lit(f.result)}`), '0');
      }
      {
        const f = fixture(), before = unchanged(f);
        refuse(request({...f, binding: {...f.binding, storageVersion: 'stale-version'}}), /archived_brand_exact_unheld_incarnation_required/);
        refuse(`update storage.objects set version='replacement' where id=${lit(f.objectId)}`, /brand_storage_attached_incarnation_fenced/);
        refuse(`update public.platform_brand_assets set deleted_at=null where id=${lit(f.id)}`, /brand_retention_tombstone_permanent/);
        refuse(`update public.platform_brand_assets set owner_user_id='other-owner' where id=${lit(f.id)}`, /brand_retention_asset_identity_immutable/);
        refuse(`update private.platform_brand_object_incarnations set removed_at=removed_at+interval '1 day',retain_until=retain_until+interval '1 day' where asset_id=${lit(f.id)}`, /brand_retention_identity_permanent/);
        assert.equal(unchanged(f), before, 'real identity/version/tombstone/clock guards refuse mutation');
        const normal = fixture({normalJob: true});
        assert.equal(rows('public.media_scan_jobs', `target_table='platform_brand_assets' and target_id=${lit(normal.id)}`), '1');
        refuse(request(normal), /archived_brand_exact_unheld_incarnation_required/);
        const x = staged('request'), y = staged('request');
        refuse(claim([x.request, x.request]), /archived_brand_exact_bounded_requests_required/);
        refuse(claim([x.request, y.request, randomUUID()]), /archived_brand_exact_bounded_requests_required/);
        assert.equal(parsed(claim([x.request, y.request])).attempts.length, 2, 'at most two explicit request IDs, not a discovery queue');
      }
      for (const target of ['source', 'storage']) {
        const f = staged('result');
        const lock = target === 'source' ? `select id from public.platform_brand_assets where id=${lit(f.id)} for update` : `select id from storage.objects where id=${lit(f.objectId)} for update`;
        for (const operation of [read(f.attempt), record(f.attempt), seal(f.attempt, f.result)]) {
          await rowContention(lock, operation, result => {
            if (operation === read(f.attempt)) { succeeded(result); assert.equal(JSON.parse(result.stdout).status, 'unavailable'); }
            else denied(result, /55P03/);
          });
        }
        const writer = target === 'source' ? `update public.platform_brand_assets set original_file_name='queued-writer.png' where id=${lit(f.id)}`
          : `update storage.objects set last_accessed_at=clock_timestamp() where id=${lit(f.objectId)}`;
        await ordered('select private.platform_brand_retention_lock()', writer, (result, holder) => {
          succeeded(result); assert.match(holder.stdout, /ROW_NOWAIT_DENIED/); assert.match(holder.stdout, /"status": "unavailable"/);
        }, {label: `${target} row/advisory inversion NOWAIT refusal`, advisoryWait: true,
          afterQueue: `${read(f.attempt)};${expectNowait(`perform public.record_platform_brand_archived_verification_result(${attemptArgs(f.attempt)},${json(clean)})`)};
            ${expectNowait(`perform public.seal_platform_brand_archived_verification(${attemptArgs(f.attempt)},${lit(f.result)})`)}`});
        assert.equal(rows('private.platform_brand_archived_receipts', `result_id=${lit(f.result)}`), '0');
        assert.equal(parsed(seal(f.attempt, f.result)).proofRecorded, true, 'identical evidence succeeds after row contention releases');
      }
      // Stale synthetic requests/attempts are seeded directly. Source, Storage,
      // reference, secondary and immutable ledger guards remain installed.
      for (const field of ['binding', 'storageVersion', 'expectedSizeBytes', 'sourceDeletedAt', 'removedAt', 'retainUntil', 'removalClock']) {
        const f = fixture(), snapshot = parsed(`select private.platform_brand_archived_snapshot(${lit(f.id)})`);
        if (field === 'binding') snapshot.binding.assetId = randomUUID();
        else if (field === 'storageVersion') snapshot.binding.storageVersion = 'stale-version';
        else if (field === 'expectedSizeBytes') snapshot.expectedSizeBytes = 24;
        else snapshot[field] = field === 'removalClock' ? 'server_observed_removal' : '2000-01-01T00:00:00.000000Z';
        const requestId = randomUUID(), attemptId = randomUUID(), token = randomUUID();
        query(`insert into private.platform_brand_archived_requests(id,asset_id,archive_binding) values(${lit(requestId)},${lit(f.id)},${json(snapshot)});
          insert into private.platform_brand_archived_attempts(id,request_id,attempt_number,worker_id,claim_token,archive_binding,claimed_at,expires_at)
          select ${lit(attemptId)},${lit(requestId)},1,${lit(worker)},${lit(token)},${json(snapshot)},t,t+interval '20 minutes' from (select clock_timestamp() t) x;`);
        const a = {attemptId, claimToken: token, workerId: worker};
        assert.equal(parsed(read(a)).status, 'unavailable', field);
        refuse(record(a), /archived_brand_attempt_unavailable/); refuse(seal(a, randomUUID()), /archived_brand_attempt_unavailable/);
        expireAttempt(a); assert.deepEqual(parsed(claim([requestId])).attempts, [], field);
      }
      {
        const f = staged('request'); let a;
        for (let n = 1; n <= 3; n++) {
          a = parsed(claim([f.request])).attempts[0]; assert.ok(a, `crash recovery attempt ${n}`);
          expireAttempt(a); assert.equal(parsed(read(a)).status, 'unavailable'); refuse(record(a), /archived_brand_attempt_unavailable/);
        }
        assert.deepEqual(parsed(claim([f.request])).attempts, []); assert.equal(query(request(f)), f.request);
        assert.equal(rows('private.platform_brand_archived_attempts', `request_id=${lit(f.request)}`), '3', 'immutable lifetime attempt cap');
        const g = staged('result'); expireAttempt(g.attempt);
        refuse(seal(g.attempt, g.result), /archived_brand_attempt_unavailable/);
        const recovered = parsed(claim([g.request])).attempts[0]; assert.ok(recovered); assert.notEqual(recovered.attemptId, g.attempt.attemptId);
        const result = parsed(record(recovered)); assert.equal(parsed(seal(recovered, result.resultId)).proofRecorded, true);
      }
      for (const status of ['scan_failed', 'malware_detected']) {
        const f = staged('request'), before = unchanged(f);
        const failure = status === 'scan_failed' ? {...clean, status, fullReadback: false, sha256: null, sizeBytes: null, exitCode: 2, errorCode: 'synthetic_read_failure'}
          : {...clean, status, exitCode: 1, findingName: 'Synthetic.EICAR'};
        for (let n = 1; n <= (status === 'scan_failed' ? 3 : 1); n++) {
          const a = parsed(claim([f.request])).attempts[0]; assert.ok(a);
          const result = parsed(record(a, failure));
          refuse(seal(a, result.resultId), /archived_brand_exact_clean_result_required/);
          refuse(record(a), /archived_brand_result_immutable_conflict/);
          assert.equal(rows('private.platform_brand_archived_receipts', `result_id=${lit(result.resultId)}`), '0');
        }
        assert.deepEqual(parsed(claim([f.request])).attempts, [], 'failure budget is finite and infection cannot automatically retry toward clean');
        assert.equal(unchanged(f), before, 'failure evidence never restores source, changes clocks, or grants deletion authority');
      }
      // Real ordinary scanner predecessor behavior and validator OIDs survive
      // warmed replacement. Only the two documented adapters are substituted
      // and restored inside the clone, never a reference/secondary guard.
      verifyOrdinaryScanner();
      {
        const f = staged('sealed', {due: true}), before = unchanged(f);
        const match = asset => `select private.platform_brand_claimed_scan_evidence_matches(${lit(asset)},${lit(f.receipt)},${json(f.binding)},repeat('a',64),23)`;
        assert.equal(query(match(f.id)), 'f', 'no claimed adapter without preexisting permanent exact claim');
        refuse(`select public.enqueue_media_scan_job('platform_brand_assets','logo',${lit(f.id)},'archived_native_fixture','supabase','platform-brand-assets',${lit(f.key)},'image/png',23,30,'{}')`, /brand_retained_reference_forbidden/);
        assert.equal(unchanged(f), before, 'ordinary removed-key enqueue remains refused');
        // SQL-only fixture gate: no provider origin, contract, transport result,
        // version-delete qualification or provider request is manufactured.
        query(`update private.platform_brand_retention_settings set expiry_enabled=true,writer_drain_evidence_sha256=repeat('e',64),reference_review_evidence_sha256=repeat('f',64)`);
        const permanent = parsed(`select public.claim_platform_brand_retention_expiry(${lit(f.id)})`); assert.equal(permanent.status, 'claimed');
        assert.equal(parsed(read(f.attempt)).status, 'unavailable');
        refuse(record(f.attempt), /archived_brand_attempt_unavailable/);
        refuse(seal(f.attempt, f.result), /archived_brand_attempt_unavailable/);
        assert.equal(query(match(f.id)), 'f', 'claimed adapter is absent-metadata only');
        // Native Storage's explicit SQL fixture flag is NOT a provider deletion.
        // The exact-version Brand row guard remains enabled and authorizes only
        // this already-claimed, due, unheld incarnation's metadata removal.
        query(`begin;set local storage.allow_delete_query='true';delete from storage.objects where id=${lit(f.objectId)};commit;`);
        assert.equal(query(match(f.id)), 't'); assert.equal(query(match(randomUUID())), 'f');
        assert.equal(query(`select private.platform_brand_scan_byte_receipt_matches(${lit(f.receipt)},${json(f.binding)},repeat('a',64),23)`), 'f', 'absence cannot authorize an initial proof');
        assert.equal(rows('private.platform_brand_expiry_transport_results', `asset_id=${lit(f.id)}`), '0', 'SQL metadata absence is not provider proof');
        assert.equal(query(`select observed_absent_at is null from private.platform_brand_expiry_claims where asset_id=${lit(f.id)}`), 't');
        query('update private.platform_brand_retention_settings set expiry_enabled=false');
      }
    }
    assert.equal(query(guardFingerprint), guardsBefore, 'ordinary scanner, reference and generic secondary/rendition/transcode definitions and OIDs unchanged');
    assert.equal(query(catalogFingerprint), catalogBefore, 'all fixture trigger states and clone function definitions restored');
    assert.equal(query('select not expiry_enabled and not batch_enabled and not version_delete_verified and provider_origin is null and provider_contract_sha256 is null from private.platform_brand_retention_settings'), 't');
    assert.equal(query('select not capture_enabled and not text_expiry_enabled and not media_expiry_enabled and not media_staging_enabled from private.deleted_content_retention_settings'), 't');
    dropClone();
  }
  console.log(`Archived Brand native PostgreSQL ${negativeControl ? 'negative control' : 'positive proof'}: ${checks} controls; ${observedQueues} observed pg_blocking_pids queues. SQL metadata/lock proof only, not ClamAV execution, cryptographic attestation, provider deletion or production qualification.`);
} finally {
  try {
  try { dropClone(); }
  finally {
    if (sourceRows !== undefined) assert.deepEqual(rowFingerprint('postgres'), sourceRows, 'complete source table row fingerprints unchanged');
    if (sourceCatalog !== undefined) assert.equal(query(catalogFingerprint, 'postgres'), sourceCatalog, 'complete source catalog fingerprints unchanged');
  }
  } finally { cloneGuardRestore.assertSourceUnchanged(); }
}
function parsedSourceVersions() {
  return JSON.parse(query("select coalesce(json_agg(version order by version),'[]') from supabase_migrations.schema_migrations;", 'postgres'));
}
function verifyOrdinaryScanner() {
  // Keep the source live until its ordinary receipt is complete; historical
  // archived no-job fixtures above cannot manufacture normal scanner authority.
  const id = randomUUID(), key = `archived_native_fixture/ordinary/${id}.png`;
  query(`insert into storage.objects(id,bucket_id,name,version,metadata) values(gen_random_uuid(),'platform-brand-assets',${lit(key)},'ordinary-v1','{"size":23}');
    insert into public.platform_brand_assets(id,owner_user_id,asset_type,storage_object_key,storage_path,mime_type,file_size_bytes)
    values(${lit(id)},'archived_native_fixture','logo',${lit(key)},${lit(key)},'image/png',23);`);
  const job = query(`select id from public.media_scan_jobs where target_table='platform_brand_assets' and target_id=${lit(id)}`);
  assert.match(job, /^[0-9a-f-]{36}$/);
  query(`update public.media_scan_jobs set priority=-2147483648 where id=${lit(job)};select public.claim_media_scan_jobs(1,${lit(worker)});`);
  assert.equal(query(`select status from public.media_scan_jobs where id=${lit(job)}`), 'scanning');
  const attempt = query(`select attempt_count from public.media_scan_jobs where id=${lit(job)}`);
  const observation = query(`select public.begin_media_scan_byte_observation(${lit(job)},${lit(worker)},${attempt})`);
  assert.equal(parsed(`select public.complete_media_scan_job(${lit(job)},'clean','clamav','ClamAV native fixture','synthetic-signatures',null,null,1)`).targetPropagationComplete, true);
  const receipt = query(`select public.record_media_scan_byte_receipt(${lit(observation)},${lit(job)},${lit(worker)},repeat('a',64),23)`);
  const binding = parsed(`select public.read_platform_brand_retention_binding(${lit(id)})`);
  const definitions = ['platform_brand_scan_byte_receipt_matches(uuid,jsonb,text,bigint)', 'platform_brand_claimed_scan_evidence_matches(uuid,uuid,jsonb,text,bigint)'].map(signature => {
    const name = signature.split('(')[0], predecessor = signature.replace(name, `${name}_before_archived`);
    return {signature, name, oid: query(`select ${lit(`private.${signature}`)}::regprocedure::oid`),
      wrapper: query(`select pg_get_functiondef(${lit(`private.${signature}`)}::regprocedure)`),
      original: query(`select pg_get_functiondef(${lit(`private.${predecessor}`)}::regprocedure)`).replace(`private.${name}_before_archived(`, `private.${name}(`)};
  });
  const valid = `select private.platform_brand_scan_byte_receipt_matches(${lit(receipt)},${json(binding)},repeat('a',64),23)`;
  try {
    for (const d of definitions) query(d.original);
    assert.equal(query(valid), 't', 'warmed original scanner validator');
    assert.equal(query(`select private.platform_brand_claimed_scan_evidence_matches(${lit(id)},${lit(receipt)},${json(binding)},repeat('a',64),23)`), 'f');
  } finally { for (const d of definitions) query(d.wrapper); }
  for (const d of definitions) assert.equal(query(`select ${lit(`private.${d.signature}`)}::regprocedure::oid`), d.oid, 'original validator OID preserved');
  assert.equal(query(valid), 't', 'normal receipt behavior unchanged after archived wrapper installation');
  query(`update public.media_scan_jobs set attempt_count=attempt_count+1 where id=${lit(job)}`);
  assert.equal(query(valid), 'f', 'ordinary stale attempt remains invalid'); checks++;
}
