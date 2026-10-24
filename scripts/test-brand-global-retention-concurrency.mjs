#!/usr/bin/env node
// Native PostgreSQL only. Two fresh disposable LOCAL clones exercise unarmed
// activation and armed re-enable without resetting the permanent fence. The
// actual complete migration stack, triggers and RPCs remain installed. No
// provider request, deployment qualification, or physical-absence claim occurs.
import assert from 'node:assert/strict';
import {spawn, spawnSync} from 'node:child_process';
import {randomUUID} from 'node:crypto';
import {readFileSync, readdirSync} from 'node:fs';
import {setTimeout as delay} from 'node:timers/promises';

if (process.argv.includes('--help')) {
  console.log('After local Supabase reset: prove Brand/global activation lock order in disposable local clones. No remote URL, provider call or caller credentials accepted. Native PostgreSQL is required; this is not a PGlite concurrency test.');
  process.exit(0);
}
assert.equal(process.argv.length, 2, 'no database URL or other arguments accepted');
const project = readFileSync('supabase/config.toml', 'utf8').match(/^project_id\s*=\s*"([A-Za-z0-9_.-]{1,200})"/m)?.[1];
assert.ok(project);
const container = process.env.SUPABASE_DB_CONTAINER || `supabase_db_${project}`;
assert.match(container, /^supabase_db_[A-Za-z0-9_.-]{1,200}$/);
const lit = value => `'${String(value).replaceAll("'", "''")}'`;
const redact = value => String(value).replaceAll(/[A-Za-z0-9_-]{40,}/g, '<redacted>')
  .replaceAll(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi, '<synthetic-id>');
const serviceClaims = `set request.jwt.claims='{"role":"service_role"}';set request.jwt.claim.role='service_role';`;
const docker = (args, input, encoding = 'utf8') => spawnSync('docker', args, {
  input, encoding, maxBuffer: 256 * 1024 * 1024, timeout: 120000,
});
const ok = (result, label) => {
  assert.equal(result.status, 0, `${label}: ${redact(result.error?.message || result.stderr)}`);
  return result.stdout;
};
let database, cloned = false, before, checks = 0, observedQueues = 0;
const args = (db = database) => ['exec', '-i', container, 'psql', '-X', '-q', '-A', '-t', '-v', 'ON_ERROR_STOP=1', '-U', 'postgres', '-d', db];
const query = (sql, db = database) => ok(docker(args(db), `${db === 'postgres' ? 'set default_transaction_read_only=on;' : serviceClaims}set time zone 'UTC';set statement_timeout='15s';${sql}`), 'local query').trim();
const admin = (command, input, encoding = 'utf8') => docker(['exec', ...(input === undefined ? [] : ['-i']), container,
  'sh', '-lc', 'PGPASSWORD="$POSTGRES_PASSWORD" exec "$@"', 'brand-global-admin', ...command], input, encoding);

// Only aggregate hashes leave the local source process, never source row data.
const fingerprintTables = ['auth.users', 'auth.sessions', 'public.user_profiles', 'public.platform_role_memberships',
  'public.wave1_legal_acceptances', 'public.videos', 'public.social_attachments', 'public.video_renditions',
  'public.media_renditions', 'public.media_transcode_jobs', 'public.media_scan_jobs', 'public.legal_holds',
  'public.platform_brand_assets', 'public.platform_brand_profiles', 'public.platform_brand_publications', 'storage.objects',
  'private.platform_brand_object_incarnations', 'private.platform_brand_object_proofs', 'private.platform_brand_expiry_claims',
  'private.platform_brand_expiry_transport_results', 'private.platform_brand_retention_settings',
  'private.platform_brand_retention_worker_health', 'private.platform_brand_retention_work_dispatch',
  'private.media_scan_byte_observations', 'private.media_scan_byte_receipts', 'private.deleted_content_brand_delegations',
  'private.deleted_content_records', 'private.deleted_content_retention_settings', 'private.deleted_content_retention_events',
  'private.deleted_media_reference_fence', 'private.deleted_content_rollout_qualification', 'private.deleted_content_worker_health'];
const fingerprint = `select jsonb_build_object(${fingerprintTables.map(table => `${lit(table)},(select md5(coalesce(string_agg(md5(to_jsonb(x)::text),'' order by md5(to_jsonb(x)::text)),'')) from ${table} x)`).join(',')})::text;`;
const secondaryFingerprint = `select jsonb_build_object(
  'function',md5(pg_get_functiondef('private.guard_deleted_content_secondary_coverage()'::regprocedure)),
  'triggers',(select md5(string_agg(pg_get_triggerdef(t.oid)||':'||t.tgenabled::text,',' order by t.tgrelid,t.tgname))
    from pg_trigger t where not t.tgisinternal and t.tgrelid=any(array[
      'public.video_renditions'::regclass,'public.media_renditions'::regclass,'public.media_transcode_jobs'::regclass])))::text;`;
const fenceUpdate = 'select armed from private.deleted_media_reference_fence where singleton for update';
const activate = 'update private.deleted_content_retention_settings set activation_ready=true,capture_enabled=true';
const disable = 'update private.deleted_content_retention_settings set capture_enabled=false,media_staging_enabled=false,text_expiry_enabled=false,media_expiry_enabled=false';
const readinessSQL = "select 'READINESS:'||public.deleted_content_expiry_readiness()::text";
// Catch only the exact expected real activation refusal, not deadlocks, timeouts,
// another SQLSTATE 55000 error, or an unexpectedly successful transition.
const blockedActivation = `do $expected$ begin
  begin ${activate}; raise exception 'unexpected_activation_success';
  exception when sqlstate '55000' then
    if sqlerrm not like 'retention_activation_blocked:%' then raise; end if;
  end;
end $expected$;select 'ACTIVATION_BLOCKED'`;
const expectRowNowait = sql => `do $row_nowait$ begin
  begin ${sql}; raise exception 'unexpected_row_lock_acquisition';
  exception when sqlstate '55P03' then null;
  end;
end $row_nowait$;select 'ROW_NOWAIT_DENIED'`;
const parseReadiness = result => {
  const line = result.stdout.split('\n').find(value => value.startsWith('READINESS:'));
  assert.ok(line, 'real readiness result must be present');
  return JSON.parse(line.slice('READINESS:'.length));
};
const succeeded = result => assert.equal(result.code, 0, redact(result.stderr));
const denied = (result, pattern) => {
  assert.notEqual(result.code, 0, 'conflicting transaction must fail closed');
  assert.doesNotMatch(result.stderr, /deadlock detected|statement timeout|lock timeout/i);
  assert.match(result.stderr, pattern);
};

function session(name, sql, finish = false) {
  const child = spawn('docker', args(), {stdio: ['pipe', 'pipe', 'pipe']});
  let stdout = '', stderr = '';
  child.stdout.setEncoding('utf8'); child.stderr.setEncoding('utf8');
  child.stdout.on('data', value => { stdout += value; });
  child.stderr.on('data', value => { stderr += value; });
  child.stdin.on('error', () => {});
  const done = new Promise(resolve => {
    child.on('error', error => resolve({code: -1, stdout, stderr: error.message}));
    child.on('close', code => resolve({code, stdout, stderr}));
  });
  child.stdin.write(`${serviceClaims}set application_name=${lit(name)};begin isolation level read committed;
    set local time zone 'UTC';set local statement_timeout='35s';set local idle_in_transaction_session_timeout='45s';${sql};\n`);
  if (finish) child.stdin.end('commit;\n\\q\n');
  return {child, done, output: () => stdout, status: () => ({code: child.exitCode, stdout, stderr})};
}
async function until(predicate, label, sessions = []) {
  const deadline = Date.now() + 20000;
  while (Date.now() < deadline) {
    if (predicate()) return;
    for (const value of sessions) {
      const result = value.status();
      if (result.code !== null) throw Error(`${label}: backend exited (${result.code}): ${redact(result.stderr).slice(-2000)}`);
    }
    await delay(25);
  }
  throw Error(`timeout: ${label}`);
}
async function terminate(name, value) {
  if (!value || value.child.exitCode !== null) return;
  query(`select pg_terminate_backend(pid) from pg_stat_activity
    where datname=current_database() and application_name=${lit(name)} and pid<>pg_backend_pid();`);
  value.child.kill('SIGTERM');
  await Promise.race([value.done, delay(1000)]);
}
async function ordered(first, second, verify, {label, afterQueue = '', fenceFirst = false, advisoryWait = false, tableWait = false, rollback = false} = {}) {
  const holderName = `brand-global-holder-${process.pid}-${checks}`, waiterName = `brand-global-waiter-${process.pid}-${checks}`;
  let holder, waiter;
  try {
    holder = session(holderName, `${first};select 'HOLDER_READY'`);
    await until(() => holder.output().includes('HOLDER_READY'), `${label}: holder ready`, [holder]);
    waiter = session(waiterName, second, true);
    await until(() => query(`select count(*) from pg_stat_activity w join pg_stat_activity h
      on h.datname=w.datname and h.application_name=${lit(holderName)}
      where w.datname=current_database() and w.application_name=${lit(waiterName)}
        and w.wait_event_type='Lock' and h.pid=any(pg_blocking_pids(w.pid));`) === '1',
    `${label}: observed independent backend lock queue`, [holder, waiter]);
    if (fenceFirst) {
      assert.equal(query(`select count(*) from pg_locks l join pg_stat_activity a on a.pid=l.pid
        where a.datname=current_database() and a.application_name=${lit(waiterName)}
          and l.locktype='advisory' and l.classid=176214 and l.objid=30 and l.objsubid=2 and l.granted;`), '0',
      `${label}: Brand waiter must not own advisory 30 before obtaining the fence SHARE lock`);
    }
    if (advisoryWait) {
      assert.equal(query(`select count(*) from pg_locks l join pg_stat_activity a on a.pid=l.pid
        where a.datname=current_database() and a.application_name=${lit(waiterName)}
          and l.locktype='advisory' and l.classid=176214 and l.objid=30 and l.objsubid=2 and not l.granted;`), '1',
      `${label}: the row writer must actually queue on Brand advisory 30`);
    }
    if (tableWait) {
      assert.equal(query(`select count(*) from pg_locks l join pg_stat_activity a on a.pid=l.pid
        where a.datname=current_database() and a.application_name=${lit(waiterName)}
          and l.locktype='relation' and l.relation='public.platform_brand_assets'::regclass
          and l.mode='AccessExclusiveLock' and not l.granted;`), '1',
      `${label}: the migration drain must wait on the actual source relation`);
    }
    holder.child.stdin.end(`${afterQueue};${rollback ? 'rollback' : 'commit'};\n\\q\n`);
    const [a, b] = await Promise.all([holder.done, waiter.done]);
    succeeded(a);
    verify(b, a);
    checks++; observedQueues++;
  } finally {
    await terminate(waiterName, waiter);
    await terminate(holderName, holder);
  }
}
async function whileLocked(first, verify, label) {
  const name = `brand-global-nowait-${process.pid}-${checks}`;
  let holder;
  try {
    holder = session(name, `${first};select 'HOLDER_READY'`);
    await until(() => holder.output().includes('HOLDER_READY'), label, [holder]);
    verify();
    holder.child.stdin.end('rollback;\n\\q\n');
    succeeded(await holder.done); checks++;
  } finally { await terminate(name, holder); }
}
function dropClone() {
  if (!cloned) return;
  ok(docker(['exec', container, 'dropdb', '-U', 'postgres', '--if-exists', '--force', database]), 'drop generated clone');
  cloned = false;
}
function restoreClone(dump, phase) {
  database = `brand_global_${phase}_${process.pid}_${randomUUID().replaceAll('-', '').slice(0, 12)}`;
  assert.match(database, /^brand_global_(activation|reenable)_[0-9]+_[a-f0-9]{12}$/);
  ok(docker(['exec', container, 'createdb', '-U', 'postgres', '-T', 'template0', database]), 'create generated clone');
  cloned = true;
  ok(docker(args(), 'create schema vault;create extension supabase_vault with schema vault;'), 'initialize clone');
  ok(admin(['psql', '-X', '-q', '-v', 'ON_ERROR_STOP=1', '-U', 'supabase_admin', '-d', database], dump, null), 'restore complete local migration stack');
}

try {
  if (process.env.DOCKER_HOST) assert.match(process.env.DOCKER_HOST, /^(unix|npipe):\/\//, 'remote Docker forbidden');
  assert.match(ok(docker(['context', 'inspect', '--format', '{{.Endpoints.docker.Host}}']), 'local Docker required').trim(), /^(unix|npipe):\/\//);
  assert.ok(ok(docker(['ps', '--filter', 'label=com.supabase.cli.project', '--format', '{{.Names}}']), 'local CLI discovery').split('\n').includes(container));
  const expectedVersions = readdirSync('supabase/migrations').filter(name => /^\d+_.+\.sql$/.test(name)).map(name => name.split('_')[0]).sort();
  assert.deepEqual(JSON.parse(query("select coalesce(json_agg(version order by version),'[]') from supabase_migrations.schema_migrations;", 'postgres')),
    expectedVersions, 'source must be the complete reset checkout migration stack');
  before = query(fingerprint, 'postgres');
  const sourceSecondaryBefore = query(secondaryFingerprint, 'postgres');
  const dump = admin(['pg_dump', '-U', 'supabase_admin', '--exclude-extension=pg_cron', '--exclude-extension=supabase_vault',
    '--exclude-extension=pg_graphql', '--exclude-schema=cron', '--exclude-schema=realtime', '--exclude-schema=_realtime',
    '--exclude-schema=vault', '--exclude-schema=graphql', '--exclude-schema=graphql_public', 'postgres'], undefined, null);
  ok(dump, 'read-only source dump');

  for (const phase of ['activation', 'reenable']) {
    restoreClone(dump.stdout, phase);
    const secondaryBefore = query(secondaryFingerprint);
    assert.equal(query('select not capture_enabled and not activation_ready and not media_expiry_enabled and not text_expiry_enabled and not media_staging_enabled from private.deleted_content_retention_settings'), 't');
    assert.equal(query('select not armed from private.deleted_media_reference_fence'), 't');
    assert.equal(query('select not expiry_enabled and not batch_enabled and not version_delete_verified from private.platform_brand_retention_settings'), 't');
    // Only the existing explicit LOCAL fixture supplies global SQL gate inputs.
    // Brand version-delete, drain and provider qualification remain unset.
    query(readFileSync('tests/fixtures/deleted-content-local-qualification.sql', 'utf8'));
    query(`create table public.brand_global_native_consumer(id uuid primary key default gen_random_uuid(),media_url text);
      create trigger zzz_deleted_media_reference_guard before insert or update on public.brand_global_native_consumer
        for each row execute function private.guard_deleted_media_references();
      create trigger zzz_platform_brand_retention_reference before insert or update on public.brand_global_native_consumer
        for each row execute function private.guard_platform_brand_retention_references();`);

    const owner = randomUUID(), sessionId = randomUUID();
    query(`insert into auth.users(id,email_confirmed_at,is_sso_user,is_anonymous) values(${lit(owner)},now(),false,false);
      insert into auth.sessions(id,user_id,not_after) values(${lit(sessionId)},${lit(owner)},now()+interval '1 day');
      insert into public.wave1_legal_acceptances(user_id,subject_hash,document_key,document_version,market,role_key,capability,session_generation,authority_source)
        select ${lit(owner)}::uuid,public.wave1_sha256(${lit(owner)}),d.document_key,d.version,d.market,
          coalesce(nullif(lower(trim(p.channel_role)),''),'member'),d.capability,${lit(sessionId)},'service_reconciliation'
        from public.wave1_legal_document_versions d left join public.user_profiles p on p.user_id=${lit(owner)}
        where d.active and d.market='UNITED_STATES' and d.capability='account';
      insert into public.platform_role_memberships(user_id,role,status,expires_at)
        values(${lit(owner)},'operator','active',clock_timestamp()+interval '1 day');`);
    const auth = `set local request.jwt.claims=${lit(JSON.stringify({role: 'authenticated', sub: owner, session_id: sessionId}))};
      set local request.jwt.claim.role='authenticated';set local role authenticated;`;
    const remove = f => `${auth}select public.remove_platform_brand_asset(${lit(f.id)});reset role;${serviceClaims}`;
    const proof = f => `select public.record_platform_brand_retention_proof(${lit(f.id)},${lit(JSON.stringify(f.binding))}::jsonb,${lit(JSON.stringify(f.proof))}::jsonb)`;
    const receipt = f => `select public.record_media_scan_byte_receipt(${lit(f.observation)},${lit(f.job)},'brand-global-native',repeat('a',64),23)`;
    const observe = f => `select public.begin_media_scan_byte_observation(${lit(f.job)},'brand-global-native',${f.attempt})`;
    const matches = f => `select private.platform_brand_scan_byte_receipt_matches(${lit(f.proof.scanReceiptId)},${lit(JSON.stringify(f.binding))}::jsonb,repeat('a',64),23)`;
    const coverage = f => query(`select private.deleted_content_brand_source_coverage(to_jsonb(a)) from public.platform_brand_assets a where id=${lit(f.id)}`);
    function upload() {
      const id = randomUUID(), key = `${owner}/logo/${id}.png`;
      const storageSQL = `insert into storage.objects(id,bucket_id,name,version,metadata)
        values(gen_random_uuid(),'platform-brand-assets',${lit(key)},${lit(randomUUID())},'{"size":23}')`;
      const assetSQL = `insert into public.platform_brand_assets(id,owner_user_id,asset_type,asset_state,storage_object_key,storage_path,mime_type,file_size_bytes)
        values(${lit(id)},${lit(owner)},'logo','draft',${lit(key)},${lit(key)},'image/png',23)`;
      return {id, key, storageSQL, assetSQL, sql: `${storageSQL};${assetSQL}`};
    }
    function finishScan(f, stage = 'proved') {
      f.job = query(`select id from public.media_scan_jobs where target_table='platform_brand_assets' and target_id=${lit(f.id)} order by created_at desc limit 1`);
      assert.match(f.job, /^[0-9a-f-]{36}$/);
      query(`update public.media_scan_jobs set priority=-2147483648 where id=${lit(f.job)};
        select id from public.claim_media_scan_jobs(1,'brand-global-native');`);
      assert.equal(query(`select status from public.media_scan_jobs where id=${lit(f.job)}`), 'scanning');
      f.attempt = Number(query(`select attempt_count from public.media_scan_jobs where id=${lit(f.job)}`));
      if (stage === 'scanning') return f;
      f.observation = query(observe(f));
      const completed = JSON.parse(query(`select public.complete_media_scan_job(${lit(f.job)},'clean','clamav','ClamAV fixture','daily/fixture',null,null,1)`));
      assert.equal(completed.targetPropagationComplete, true, 'real scanner must propagate clean status');
      f.binding = JSON.parse(query(`select public.read_platform_brand_retention_binding(${lit(f.id)})`));
      if (stage === 'completed') return f;
      f.proof = {originSha256: 'a'.repeat(64), originSizeBytes: 23, scanReceiptId: query(receipt(f))};
      if (stage === 'proved') query(proof(f));
      return f;
    }
    function fixture(stage = 'proved') {
      const f = upload(); query(f.sql);
      if (stage !== 'pending') finishScan(f, stage);
      return f;
    }
    function verifyRemoval(f, delegated) {
      assert.equal(query(`select a.deleted_at=r.removed_at and a.asset_state='archived'
        and r.retain_until-r.removed_at=interval '720 hours'
        from public.platform_brand_assets a join private.platform_brand_object_incarnations r on r.asset_id=a.id where a.id=${lit(f.id)}`), 't');
      assert.equal(query(`select count(*) from private.deleted_content_brand_delegations where asset_id=${lit(f.id)}`), delegated ? '1' : '0');
      if (delegated) assert.equal(query(`select count(*) from private.deleted_content_brand_delegations b
        join private.deleted_content_records d on d.id=b.deletion_id
        join private.platform_brand_object_incarnations r on r.asset_id=b.asset_id
        where b.asset_id=${lit(f.id)} and d.content is null and d.media_disposition='delegated_brand_original'
          and (d.deleted_at,d.expires_at,b.removed_at,b.retain_until)=(r.removed_at,r.retain_until,r.removed_at,r.retain_until)`), '1');
    }
    function operation(kind) {
      if (kind === 'upload') {
        const f = upload();
        return {sql: f.sql, verify: () => assert.equal(query(`select scan_status from public.platform_brand_assets where id=${lit(f.id)}`), 'pending_scan')};
      }
      if (kind === 'remove') {
        const f = fixture();
        return {sql: remove(f), verify: () => verifyRemoval(f, false)};
      }
      if (kind === 'proof') {
        const f = fixture('receipt');
        return {sql: proof(f), verify: () => assert.equal(coverage(f), 'brand_verified_original')};
      }
      if (kind === 'hold') {
        const f = fixture(), id = randomUUID();
        return {sql: `insert into public.legal_holds(id,target_type,target_id,reason,status)
          values(${lit(id)},'user',${lit(owner)},'Disposable Brand global ordering','active')`,
        verify: () => assert.equal(query(`select status from public.legal_holds where id=${lit(id)}`), 'active'),
        cleanup: () => query(`delete from public.legal_holds where id=${lit(id)}`), f};
      }
      if (kind === 'reference') {
        const f = fixture(), id = randomUUID();
        return {sql: `insert into public.brand_global_native_consumer(id,media_url) values(${lit(id)},${lit(`https://example.invalid/${f.key}`)})`,
          verify: () => assert.equal(query(`select count(*) from public.brand_global_native_consumer where id=${lit(id)}`), '1')};
      }
      if (kind === 'observation') {
        const f = fixture('scanning');
        return {sql: observe(f), verify: () => assert.equal(query(`select count(*) from private.media_scan_byte_observations where job_id=${lit(f.job)}`), '1')};
      }
      if (kind === 'receipt') {
        const f = fixture('completed');
        return {sql: receipt(f), verify: () => assert.equal(query(`select count(*) from private.media_scan_byte_receipts where observation_id=${lit(f.observation)}`), '1')};
      }
      if (kind === 'validator') {
        const f = fixture();
        return {sql: matches(f), verify: () => assert.equal(query(matches(f)), 't')};
      }
      assert.equal(kind, 'invalidate-proof');
      const f = fixture();
      return {sql: `update public.media_scan_jobs set attempt_count=attempt_count+1 where id=${lit(f.job)}`,
        inspectWhileQueued: `select 'TARGET_COVERAGE:'||private.deleted_content_brand_source_coverage(to_jsonb(a))
          from public.platform_brand_assets a where id=${lit(f.id)}`,
        verify: () => assert.equal(coverage(f), 'brand_scan_proof_no_longer_current')};
    }

    if (phase === 'reenable') {
      const baseline = JSON.parse(query('select public.deleted_content_expiry_readiness()'));
      assert.equal(baseline.ready, true, `empty local inventory must qualify without Brand provider evidence: ${JSON.stringify(baseline.blockers)}`);
      const f = upload();
      await ordered(activate, f.sql, succeeded, {label: 'initial activation before pending Brand upload', fenceFirst: true});
      assert.equal(query('select capture_enabled from private.deleted_content_retention_settings'), 't');
      assert.equal(query(`select scan_status from public.platform_brand_assets where id=${lit(f.id)}`), 'pending_scan');
      assert.equal(query(`select count(*) from private.platform_brand_object_proofs where asset_id=${lit(f.id)}`), '0',
        'admission cannot require completed proof before the AFTER INSERT scanner enqueue');
      assert.equal(query(`select private.deleted_content_brand_source_coverage(to_jsonb(a),false) from public.platform_brand_assets a where id=${lit(f.id)}`), 'brand_exact_incarnation');
      assert.equal(coverage(f), 'brand_scan_proof_required');
      finishScan(f);
      assert.equal(coverage(f), 'brand_verified_original');
      query(`begin;${remove(f)};commit;`);
      verifyRemoval(f, true);
      assert.equal(JSON.parse(query(`select public.expire_deleted_content_text(deletion_id) from private.deleted_content_brand_delegations where asset_id=${lit(f.id)}`)).status,
        'delegated_brand_lifecycle');
      query(disable);
      assert.equal(query('select armed from private.deleted_media_reference_fence'), 't', 'disabled capture never disarms the fence');
    } else fixture('pending');

    // All nine entry paths run in BOTH orders before initial activation and
    // after the permanent latch has armed then capture has been disabled.
    // Refusal is expected while Brand transport/worker evidence remains absent.
    for (const kind of ['upload', 'remove', 'proof', 'hold', 'reference', 'observation', 'receipt', 'validator', 'invalidate-proof']) {
      {
        const op = operation(kind);
        await ordered(op.sql, activate, result => denied(result, /retention_activation_blocked/), {label: `${phase}: ${kind} before activation`});
        op.verify(); op.cleanup?.();
      }
      {
        const op = operation(kind);
        await ordered(fenceUpdate, op.sql, (result, holder) => {
          succeeded(result);
          const ready = parseReadiness(holder);
          assert.equal(ready.ready, false);
          assert.ok(ready.blockers.includes('platform_brand_transport_not_qualified'));
          assert.match(holder.stdout, /ACTIVATION_BLOCKED/);
          if (kind === 'invalidate-proof') {
            assert.ok(ready.platformBrandMissingCurrentScanProofCount > 0);
            assert.match(holder.stdout, /TARGET_COVERAGE:brand_scan_proof_no_longer_current/,
              'FOR SHARE NOWAIT must reject the exact scan row already locked by the queued invalidator, not merely report an unrelated blocker');
          }
        }, {label: `${phase}: activation before ${kind}`, fenceFirst: true,
          afterQueue: `${readinessSQL};${op.inspectWhileQueued || ''};${blockedActivation}`});
        op.verify(); op.cleanup?.();
      }
      assert.equal(query('select capture_enabled from private.deleted_content_retention_settings'), 'f');
      assert.equal(query('select armed from private.deleted_media_reference_fence'), phase === 'activation' ? 'f' : 't');
    }

    // Real immutable proof enrollment and subsequent scan-attempt invalidation
    // race in both directions. Stale or contended receipts never confer proof.
    {
      const f = fixture('receipt');
      await ordered(proof(f), `update public.media_scan_jobs set attempt_count=attempt_count+1 where id=${lit(f.job)}`, succeeded,
        {label: `${phase}: proof enrollment before invalidation`});
      assert.equal(query(matches(f)), 'f');
    }
    {
      const f = fixture('receipt');
      await ordered(`update public.media_scan_jobs set attempt_count=attempt_count+1 where id=${lit(f.job)}`, proof(f),
        result => denied(result, /brand_proof_fresh_bound_scan_required/), {label: `${phase}: invalidation before proof enrollment`});
      assert.equal(query(`select count(*) from private.platform_brand_object_proofs where asset_id=${lit(f.id)}`), '0');
    }
    {
      const f = fixture('receipt');
      await whileLocked(`select id from public.media_scan_jobs where id=${lit(f.job)} for update`, () => {
        assert.equal(query(matches(f)), 'f', 'contended scanner row fails closed without waiting for its holder');
        const result = docker(args(), `${serviceClaims}set statement_timeout='2s';${proof(f)};`);
        denied({code: result.status, stderr: String(result.stderr)}, /brand_proof_fresh_bound_scan_required/);
      }, `${phase}: proof NOWAIT contention`);
      query(proof(f));
      assert.equal(query(matches(f)), 't', 'the same real receipt succeeds after contention releases');
    }

    // SELECT ... FOR UPDATE inside the real owner-removal RPC and registration
    // trigger must fail immediately with 55P03. A 2-second statement timeout
    // is only a test watchdog, never an accepted substitute for NOWAIT.
    {
      const f = fixture();
      await whileLocked(`select id from public.platform_brand_assets where id=${lit(f.id)} for update`, () => {
        const result = docker(args(), `\\set VERBOSITY verbose\n${serviceClaims}begin;set local statement_timeout='2s';${remove(f)};commit;`);
        denied({code: result.status, stderr: String(result.stderr)}, /55P03/);
        assert.equal(query(`select deleted_at is null from public.platform_brand_assets where id=${lit(f.id)}`), 't');
      }, `${phase}: owner removal source-row NOWAIT`);
      query(`begin;${remove(f)};commit;`);
      verifyRemoval(f, false);
    }
    {
      const f = upload(); query(f.storageSQL);
      await whileLocked(`select id from storage.objects where bucket_id='platform-brand-assets' and name=${lit(f.key)} for update`, () => {
        const result = docker(args(), `\\set VERBOSITY verbose\n${serviceClaims}begin;set local statement_timeout='2s';${f.assetSQL};commit;`);
        denied({code: result.status, stderr: String(result.stderr)}, /55P03/);
        assert.equal(query(`select count(*) from public.platform_brand_assets where id=${lit(f.id)}`), '0');
        assert.equal(query(`select count(*) from private.platform_brand_object_incarnations where asset_id=${lit(f.id)}`), '0');
      }, `${phase}: registration Storage-row NOWAIT`);
      query(f.assetSQL);
      assert.equal(query(`select scan_status from public.platform_brand_assets where id=${lit(f.id)}`), 'pending_scan');
    }

    // Exercise the real inverse cycle, not just a passive row lock: the writer
    // already owns its row and is visibly queued on advisory 30, while the
    // first backend owns advisory 30 and calls the unchanged-authority RPC or
    // trigger. Only 55P03 is caught; a deadlock/timeout/unexpected success fails.
    {
      const f = fixture();
      const filename = `queued-native-${randomUUID()}.png`;
      await ordered('select private.platform_brand_retention_lock()',
        `update public.platform_brand_assets set original_file_name=${lit(filename)} where id=${lit(f.id)}`,
        (result, holder) => { succeeded(result); assert.match(holder.stdout, /ROW_NOWAIT_DENIED/); },
        {label: `${phase}: removal versus advisory-queued source writer`, advisoryWait: true,
          afterQueue: `${auth}${expectRowNowait(`perform public.remove_platform_brand_asset(${lit(f.id)})`)};reset role;${serviceClaims}`});
      assert.equal(query(`select deleted_at is null and original_file_name=${lit(filename)} from public.platform_brand_assets where id=${lit(f.id)}`), 't');
      assert.equal(query(`select removed_at is null from private.platform_brand_object_incarnations where asset_id=${lit(f.id)}`), 't');
      query(`begin;${remove(f)};commit;`);
      verifyRemoval(f, false);
    }
    {
      const f = upload(); query(f.storageSQL);
      await ordered('select private.platform_brand_retention_lock()',
        `update storage.objects set last_accessed_at=clock_timestamp() where bucket_id='platform-brand-assets' and name=${lit(f.key)}`,
        (result, holder) => { succeeded(result); assert.match(holder.stdout, /ROW_NOWAIT_DENIED/); },
        {label: `${phase}: registration versus advisory-queued Storage writer`, advisoryWait: true,
          afterQueue: expectRowNowait(f.assetSQL)});
      assert.equal(query(`select count(*) from public.platform_brand_assets where id=${lit(f.id)}`), '0');
      assert.equal(query(`select count(*) from private.platform_brand_object_incarnations where asset_id=${lit(f.id)}`), '0');
      assert.equal(query(`select last_accessed_at is not null from storage.objects where bucket_id='platform-brand-assets' and name=${lit(f.key)}`), 't');
      query(f.assetSQL);
      assert.equal(query(`select scan_status from public.platform_brand_assets where id=${lit(f.id)}`), 'pending_scan');
    }

    // Replay the migration's actual lock primitive, not its already-installed
    // DDL. An in-flight real removal must commit before a backfill can obtain
    // ACCESS EXCLUSIVE, and the next statement sees its original clock. This
    // also excludes new ROW SHARE entrants before later trigger DDL needs AEX.
    {
      const f = fixture();
      await ordered(remove(f), `lock table public.platform_brand_assets in access exclusive mode;
        select 'DRAIN_REMOVAL_VISIBLE:'||(a.deleted_at=r.removed_at and r.removed_at is not null
          and r.retain_until-r.removed_at=interval '720 hours')::text
        from public.platform_brand_assets a join private.platform_brand_object_incarnations r on r.asset_id=a.id where a.id=${lit(f.id)}`,
      result => { succeeded(result); assert.match(result.stdout, /DRAIN_REMOVAL_VISIBLE:true/); },
      {label: `${phase}: source removal before migration table drain`, tableWait: true});
      verifyRemoval(f, false);
    }

    assert.equal(query(secondaryFingerprint), secondaryBefore, 'shared secondary function and rendition/transcode hooks stay unchanged');
    assert.equal(query('select not expiry_enabled and not batch_enabled and not version_delete_verified and provider_origin is null and provider_contract_sha256 is null from private.platform_brand_retention_settings'), 't',
      'native lock proof does not manufacture provider transport qualification or enable Brand expiry');
    assert.equal(query('select count(*) from private.platform_brand_expiry_claims'), '0');
    assert.deepEqual(JSON.parse(query('select public.list_platform_brand_retention_expiry_work()')).assetIds, []);
    dropClone();
  }
  assert.equal(query(secondaryFingerprint, 'postgres'), sourceSecondaryBefore, 'source secondary definitions unchanged');
  console.log(`Brand/global retention native PostgreSQL: ${checks} controls, ${observedQueues} observed pg_blocking_pids queues; fence SHARE before advisory 30, initial pending upload, re-enable, scanner invalidation, row/advisory NOWAIT cycle rejection and migration table drain. Local SQL proof only; provider transport and production qualification remain unproved.`);
} finally {
  try { dropClone(); }
  finally { if (before !== undefined) assert.equal(query(fingerprint, 'postgres'), before, 'complete source row fingerprints unchanged'); }
}
