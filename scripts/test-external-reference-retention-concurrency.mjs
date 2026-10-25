#!/usr/bin/env node
import {createBrandGuardCloneRestorer} from './lib/brand-guard-clone-restore.mjs';
// Real independent PostgreSQL backends. Only a generated disposable LOCAL
// database changes; neither remote URLs nor caller-supplied credentials are used.
import assert from 'node:assert/strict';
import {spawn, spawnSync} from 'node:child_process';
import {randomUUID} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {setTimeout as delay} from 'node:timers/promises';

if (process.argv.includes('--help')) {
  console.log('Run after local Supabase reset. Uses a disposable clone of local supabase_db_* only. No remote URL, provider request or credentials accepted.');
  process.exit(0);
}
assert.equal(process.argv.length, 2);
const project = readFileSync('supabase/config.toml', 'utf8').match(/^project_id\s*=\s*"([A-Za-z0-9_.-]{1,200})"/m)?.[1];
assert.ok(project);
const container = process.env.SUPABASE_DB_CONTAINER || `supabase_db_${project}`;
assert.match(container, /^supabase_db_[A-Za-z0-9_.-]{1,200}$/);
const cloneGuardRestore = createBrandGuardCloneRestorer({container});
const database = `external_retention_${process.pid}_${randomUUID().replaceAll('-', '').slice(0, 12)}`;
const lit = value => `'${String(value).replaceAll("'", "''")}'`;
const redact = value => String(value).replaceAll(/[A-Za-z0-9_-]{40,}/g, '<redacted>')
  .replaceAll(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi, '<synthetic-id>');
const docker = (args, input, encoding = 'utf8') => spawnSync('docker', args, {input, encoding, maxBuffer: 256 * 1024 * 1024, timeout: 120000});
const ok = (result, label) => {
  assert.equal(result.status, 0, `${label}: ${redact(result.error?.message || result.stderr)}`);
  return result.stdout;
};
const args = (db = database) => ['exec', '-i', container, 'psql', '-X', '-q', '-A', '-t', '-v', 'ON_ERROR_STOP=1', '-U', 'postgres', '-d', db];
const query = (sql, db = database) => ok(docker(args(db), `${db === 'postgres' ? 'set default_transaction_read_only=on;' : ''}set time zone 'UTC';set statement_timeout='15s';${sql}`), 'local query').trim();
const admin = (command, input, encoding = 'utf8') => docker(['exec', ...(input === undefined ? [] : ['-i']), container, 'sh', '-lc', 'PGPASSWORD="$POSTGRES_PASSWORD" exec "$@"', 'retention-admin', ...command], input, encoding);
// Compare complete row hashes, not only counts. Source rows never leave the
// local Docker process: psql returns one aggregate fingerprint per relation.
const fingerprintTables = ['auth.users', 'auth.sessions', 'public.videos', 'public.media_scan_jobs',
  'public.media_upload_reservations', 'public.media_transcode_jobs', 'public.media_renditions', 'public.video_renditions',
  'public.legal_holds', 'private.deleted_content_records', 'private.deleted_content_expiry_claims',
  'private.deleted_content_retention_settings', 'private.deleted_content_retention_events',
  'private.deleted_media_reference_fence', 'private.deleted_content_rollout_qualification',
  'private.deleted_content_external_reference_evidence', 'private.deleted_content_external_reference_captures',
  'private.deleted_content_external_reference_invalidations',
  'private.media_object_storage_migration_audit'];
const fingerprint = `select jsonb_build_object(${fingerprintTables.map(table => `${lit(table)},(select md5(coalesce(string_agg(md5(to_jsonb(x)::text),'' order by md5(to_jsonb(x)::text)),'')) from ${table} x)`).join(',')})::text;`;
let cloned = false, before, checks = 0, observedQueues = 0;

function session(name, sql, finish = false, isolation = 'read committed') {
  const child = spawn('docker', args(), {stdio: ['pipe', 'pipe', 'pipe']});
  let stdout = '', stderr = '';
  child.stdout.setEncoding('utf8'); child.stderr.setEncoding('utf8');
  child.stdout.on('data', value => { stdout += value; });
  child.stderr.on('data', value => { stderr += value; });
  const done = new Promise(resolve => {
    child.on('error', error => resolve({code: -1, stderr: error.message, stdout}));
    child.on('close', code => resolve({code, stderr, stdout}));
  });
  child.stdin.on('error', () => {});
  // The separator is mandatory even when callers omit the final semicolon.
  child.stdin.write(`set application_name=${lit(name)};begin isolation level ${isolation};set local time zone 'UTC';set local statement_timeout='35s';set local idle_in_transaction_session_timeout='45s';${sql};\n`);
  if (finish) child.stdin.end('commit;\n\\q\n');
  return {child, done, output: () => stdout, status: () => ({code: child.exitCode, stdout, stderr})};
}
async function until(fn, label, sessions = []) {
  const deadline = Date.now() + 20000;
  while (Date.now() < deadline) {
    if (fn()) return;
    for (const s of sessions) {
      const result = s.status();
      if (result.code !== null) throw Error(`${label}: backend exited (${result.code}) before the required state: ${redact(result.stderr).slice(-2000)}`);
    }
    await delay(25);
  }
  throw Error(`timeout ${label}`);
}
async function terminate(name, s) {
  if (!s || s.child.exitCode !== null) return;
  query(`select pg_terminate_backend(pid) from pg_stat_activity where datname=current_database() and application_name=${lit(name)} and pid<>pg_backend_pid();`);
  s.child.kill('SIGTERM');
  await Promise.race([s.done, delay(1000)]);
}
async function ordered(first, second, verify, {rollback = false, afterQueue = '', label = 'external retention'} = {}) {
  const holderName = `external-holder-${checks}-${process.pid}`, waiterName = `external-waiter-${checks}-${process.pid}`;
  let holder, waiter;
  try {
    holder = session(holderName, `${first};select 'HOLDER_READY'`);
    await until(() => holder.output().includes('HOLDER_READY'), `${label}: holder ready`, [holder]);
    waiter = session(waiterName, second, true);
    await until(() => query(`select count(*) from pg_stat_activity w join pg_stat_activity h on h.application_name=${lit(holderName)}
      where w.datname=current_database() and w.application_name=${lit(waiterName)} and w.wait_event_type='Lock' and h.pid=any(pg_blocking_pids(w.pid));`) === '1', `${label}: observed independent backend lock queue`, [holder, waiter]);
    holder.child.stdin.end(`${afterQueue};${rollback ? 'rollback' : 'commit'};\n\\q\n`);
    const [a, b] = await Promise.all([holder.done, waiter.done]);
    assert.equal(a.code, 0, `${label}: ${redact(a.stderr)}`);
    verify(b);
    checks++; observedQueues++;
  } finally {
    await terminate(holderName, holder);
    await terminate(waiterName, waiter);
  }
}
const succeeded = result => assert.equal(result.code, 0, redact(result.stderr));
const denied = (result, pattern = /external_reference|retention_.*coverage|retention_activation_blocked|deleted_content_.*(proof|binding|incarnation)/i) => {
  assert.notEqual(result.code, 0, 'the conflicting transaction must fail closed');
  assert.match(result.stderr, pattern);
};
const resultJSON = result => {
  succeeded(result);
  return JSON.parse(result.stdout.trim().split('\n').at(-1));
};

try {
  if (process.env.DOCKER_HOST) assert.match(process.env.DOCKER_HOST, /^(unix|npipe):\/\//);
  assert.match(ok(docker(['context', 'inspect', '--format', '{{.Endpoints.docker.Host}}']), 'local Docker required').trim(), /^(unix|npipe):\/\//);
  assert.ok(ok(docker(['ps', '--filter', 'label=com.supabase.cli.project', '--format', '{{.Names}}']), 'local CLI discovery').split('\n').includes(container));
  before = query(fingerprint, 'postgres');
  ok(docker(['exec', container, 'createdb', '-U', 'postgres', '-T', 'template0', database]), 'create generated clone');
  cloned = true;
  ok(docker(args(), 'create schema vault;create extension supabase_vault with schema vault;'), 'initialize clone');
  const dump = admin(['pg_dump', '-U', 'supabase_admin', '--exclude-extension=pg_cron', '--exclude-extension=supabase_vault', '--exclude-extension=pg_graphql', '--exclude-schema=cron', '--exclude-schema=realtime', '--exclude-schema=_realtime', '--exclude-schema=vault', '--exclude-schema=graphql', '--exclude-schema=graphql_public', 'postgres'], undefined, null);
  ok(dump, 'read-only dump');
  ok(admin(['psql', '-X', '-q', '-v', 'ON_ERROR_STOP=1', '-U', 'supabase_admin', '-d', database], cloneGuardRestore.prepare(dump.stdout, database), null), 'restore clone');
  assert.equal(query('select not capture_enabled from private.deleted_content_retention_settings'), 't');
  assert.equal(query('select not armed from private.deleted_media_reference_fence'), 't');
  assert.equal(query('select count(*) from private.deleted_content_external_reference_evidence'), '0');
  assert.equal(query('select count(*) from private.deleted_content_external_reference_captures'), '0');
  query(readFileSync('tests/fixtures/deleted-content-local-qualification.sql', 'utf8'));

  const owner = randomUUID(), sessionId = randomUUID();
  query(`insert into auth.users(id,email,email_confirmed_at,is_sso_user,is_anonymous)
    values(${lit(owner)},${lit(`external-retention-${owner}@example.test`)},now(),false,false);
    insert into auth.sessions(id,user_id,not_after) values(${lit(sessionId)},${lit(owner)},now()+interval '1 day');
    insert into public.wave1_legal_acceptances(user_id,subject_hash,document_key,document_version,market,role_key,capability,session_generation,authority_source)
    select ${lit(owner)}::uuid,public.wave1_sha256(${lit(owner)}),d.document_key,d.version,d.market,
      coalesce(nullif(lower(trim(p.channel_role)),''),'member'),d.capability,${lit(sessionId)},'service_reconciliation'
    from public.wave1_legal_document_versions d left join public.user_profiles p on p.user_id=${lit(owner)}
    where d.active and d.market='UNITED_STATES' and d.capability='account';`);
  const auth = `select set_config('request.jwt.claims',${lit(JSON.stringify({sub: owner, role: 'authenticated', session_id: sessionId}))},true);set local role authenticated;`;
  const disabled = `update private.deleted_content_retention_settings set capture_enabled=false,media_staging_enabled=false,media_expiry_enabled=false,text_expiry_enabled=false;`;
  const enabled = `update private.deleted_content_retention_settings set activation_ready=true,capture_enabled=true,media_staging_enabled=true,text_expiry_enabled=true;`;
  const covered = target => query(`select private.deleted_content_source_coverage('creator_video',to_jsonb(v)) from public.videos v where id=${lit(target)}`);
  const readiness = () => JSON.parse(query('select public.deleted_content_expiry_readiness()::text'));
  function fixture() {
    const target = randomUUID();
    // Model a historical external row that predates today's upload admission.
    // Only the preexisting client INSERT guard is paused during setup, inside
    // this clone transaction. Every retention, reference and scanner hook stays
    // enabled, and the original guard is restored before any test transaction.
    query(`begin;alter table public.videos disable trigger zz_guard_creator_video_client_authority;
      insert into public.videos(id,owner_id,title,description,visibility,moderation_status,storage_provider,storage_bucket,
      storage_object_key,storage_path,thumb_storage_path,playback_url,thumb_url,mime_type,file_size_bytes)
      values(${lit(target)},${lit(owner)},'Synthetic external reference','Synthetic retained history','draft','clean','supabase','creator-videos',
        null,null,null,${lit(`https://fixture.example.invalid/${target}.mp4`)},${lit(`https://fixture.example.invalid/${target}.jpg`)},'video/mp4',0);
      alter table public.videos enable trigger zz_guard_creator_video_client_authority;commit;`);
    assert.equal(query(`select tgenabled from pg_trigger where tgrelid='public.videos'::regclass and tgname='zz_guard_creator_video_client_authority'`), 'O');
    assert.equal(query(`select count(*) from public.media_scan_jobs where target_table='videos' and target_id=${lit(target)}`), '0',
      'no owned key means no synthetic scan is marked clean or removed to pass readiness');
    const binding = JSON.parse(query(`select private.read_deleted_content_external_reference_source(${lit(target)})::text`));
    const evidence = {binding, subtype: 'external_fixture', reviewBasis: 'row_specific_creation_record',
      sourceEvidenceSha256: 'a'.repeat(64), locatorEvidenceSha256: 'b'.repeat(64), reviewedBy: 'disposable native PostgreSQL fixture'};
    const enroll = `select private.record_deleted_content_external_reference(${lit(target)},${lit(JSON.stringify(binding))}::jsonb,${lit(JSON.stringify(evidence))}::jsonb)`;
    const remove = `delete from public.videos where id=${lit(target)}`;
    const capture = `${auth}select public.delete_retained_content('creator_video',${lit(target)},'supabase','creator-videos',null,${lit(binding.createdAt)}::timestamptz)::text`;
    return {target, binding, evidence, enroll, remove, capture,
      change: `update public.videos set created_at=created_at+interval '1 second' where id=${lit(target)}`,
      clean: () => query(`${disabled}${remove};delete from public.media_scan_jobs where target_table='videos' and target_id=${lit(target)};`)};
  }
  function reservation(f) {
    const id = randomUUID();
    return {id, insert: `insert into public.media_upload_reservations(id,owner_user_id,surface_type,storage_provider,storage_bucket,storage_object_key,
      expected_mime_type,expected_size_bytes,status,expires_at,attached_record_id)
      values(${lit(id)},${lit(owner)},'creator_video','cloudflare_r2','chillywood-media-origin',${lit(`${owner}/${f.target}/source.mp4`)},
        'video/mp4',1024,'reserved',now()+interval '1 hour',${lit(f.target)})`,
      remove: `delete from public.media_upload_reservations where id=${lit(id)}`};
  }
  function audit(f, sourceAlias = false) {
    const batch = randomUUID();
    return {insert: `insert into private.media_object_storage_migration_audit(migration_id,batch_id,table_name,row_id,source_type,source_id,
      new_storage_provider,new_storage_bucket,new_storage_object_key,status)
      values('disposable-external',${lit(batch)},${lit(sourceAlias ? 'media_scan_jobs' : 'videos')},${lit(sourceAlias ? randomUUID() : f.target)},'creator_video',${lit(f.target)},
        'cloudflare_r2','chillywood-media-origin',${lit(`originals/external-conflict-${f.target}.mp4`)},'updated')`,
      remove: `delete from private.media_object_storage_migration_audit where batch_id=${lit(batch)}`};
  }
  const auditAlias = f => audit(f, true);
  function job(f) {
    const id = randomUUID();
    return {id, insert: `insert into public.media_transcode_jobs(id,source_type,source_id,creator_id,input_provider,input_bucket,input_path,
      output_provider,output_bucket,output_prefix,status,proof_mode)
      values(${lit(id)},'creator_video',${lit(f.target)},${lit(owner)},'cloudflare_r2','chillywood-media-origin','synthetic/input.mp4',
        'cloudflare_r2','synthetic-playback',${lit(`synthetic/${id}/`)},'queued',true)`,
      remove: `delete from public.media_transcode_jobs where id=${lit(id)}`};
  }

  // Source locks force an actual wait in both orders. Dormant evidence may
  // become invalid, but it must never classify a changed source as reviewed.
  for (const rollback of [false, true]) {
    const f = fixture();
    await ordered(f.change, f.enroll, r => rollback ? succeeded(r) : denied(r), {rollback, label: 'incarnation before evidence'});
    if (rollback) assert.equal(covered(f.target), 'reviewed_external_reference');
    f.clean();
  }
  {
    const f = fixture();
    await ordered(f.enroll, f.change, r => {
      succeeded(r);
      assert.notEqual(covered(f.target), 'reviewed_external_reference');
    }, {label: 'dormant evidence before incarnation change'});
    f.clean();
  }
  {
    const f = fixture();
    await ordered(f.remove, f.enroll, r => denied(r), {label: 'source removal before evidence'});
    f.clean();
  }
  {
    const f = fixture(); query(`${f.enroll};${f.remove};`);
    // Same UUID and caller-replayed created_at are not proof of the same source
    // incarnation. This assertion is sequential; a setup ALTER TABLE lock is
    // deliberately not counted as product concurrency evidence.
    const recreate = docker(args(), `begin;alter table public.videos disable trigger zz_guard_creator_video_client_authority;
      insert into public.videos(id,owner_id,created_at,title,visibility,moderation_status,storage_provider,storage_bucket,
        storage_object_key,storage_path,thumb_storage_path,playback_url,thumb_url,mime_type,file_size_bytes)
      values(${lit(f.target)},${lit(owner)},${lit(f.binding.createdAt)},'Synthetic identical reincarnation','draft','clean','supabase','creator-videos',
        null,null,null,${lit(`https://fixture.example.invalid/${f.target}.mp4`)},${lit(`https://fixture.example.invalid/${f.target}.jpg`)},'video/mp4',0);
      alter table public.videos enable trigger zz_guard_creator_video_client_authority;commit;`);
    ok(recreate, 'dormant historical reincarnation fixture');
    assert.notEqual(covered(f.target), 'reviewed_external_reference', 'identical identity recreation must not inherit dormant review evidence');
    const reenroll = docker(args(), `${f.enroll};`);
    assert.notEqual(reenroll.status, 0); assert.match(String(reenroll.stderr), /external_reference/);
    assert.equal(query(`select count(*) from public.videos where id=${lit(f.target)}`), '1');
    assert.equal(query(`select tgenabled from pg_trigger where tgrelid='public.videos'::regclass and tgname='zz_guard_creator_video_client_authority'`), 'O');
    f.clean(); checks++;
  }
  for (const rollback of [false, true]) {
    const f = fixture();
    await ordered(f.enroll, f.enroll, r => {
      succeeded(r);
      assert.equal(query(`select count(*) from private.deleted_content_external_reference_evidence where target_id=${lit(f.target)}`), '1');
    }, {rollback, label: 'exact enrollment retry'});
    f.clean();
  }

  // Target-attached ownership records are not secondary lifecycle work. Their
  // own fence must serialize even before the global reference latch is armed.
  for (const writer of [reservation, audit, auditAlias]) {
    for (const writerFirst of [true, false]) {
      const f = fixture(), conflict = writer(f);
      await ordered(writerFirst ? conflict.insert : f.enroll, writerFirst ? f.enroll : conflict.insert, r => {
        if (writerFirst) denied(r); else succeeded(r);
        assert.notEqual(covered(f.target), 'reviewed_external_reference');
      }, {label: `${writer.name} versus dormant enrollment`});
      query(conflict.remove); f.clean();
    }
    // A disabled-period writer may win before activation/capture. The waiter
    // must observe that ownership after the activation latch wait, not proceed
    // using a pre-wait readiness snapshot.
    const f = fixture(), conflict = writer(f); query(f.enroll);
    await ordered(conflict.insert, `${enabled}${f.capture}`, r => {
      denied(r, /retention_activation_blocked/);
      assert.equal(query(`select count(*) from public.videos where id=${lit(f.target)}`), '1');
      assert.equal(query(`select count(*) from private.deleted_content_records where target_id=${lit(f.target)}`), '0');
    }, {label: `${writer.name} before activation and capture`});
    query(conflict.remove); f.clean();
  }

  // Existing secondary hooks are untouched. They may invalidate dormant
  // evidence, but the activation latch must drain them before readiness passes.
  for (const producerFirst of [true, false]) {
    const f = fixture(), producer = job(f); query(f.enroll);
    await ordered(producerFirst ? producer.insert : enabled, producerFirst ? enabled : producer.insert, r => {
      denied(r, producerFirst ? /retention_activation_blocked/ : /retention_secondary_media_coverage_required/);
      if (producerFirst) {
        assert.equal(covered(f.target), 'secondary_media_uncovered');
        assert.ok(readiness().blockers.includes('secondary_media_cleanup_not_covered'));
      } else assert.equal(covered(f.target), 'reviewed_external_reference');
    }, {label: 'producer versus activation'});
    query(`${disabled}${producer.remove};`); f.clean();
  }
  {
    const f = fixture(), producer = job(f); query(`${f.enroll};${enabled}${disabled}${producer.insert};`);
    assert.equal(covered(f.target), 'secondary_media_uncovered');
    const result = docker(args(), `begin;${enabled}commit;`);
    assert.notEqual(result.status, 0); assert.match(String(result.stderr), /retention_activation_blocked/);
    assert.equal(query('select capture_enabled from private.deleted_content_retention_settings'), 'f');
    query(producer.remove); f.clean(); checks++;
  }

  // While active, ownership cannot race an explicit hard deletion or create
  // authority after its source is gone. The source owner's actual session is
  // used; the capturing endpoint is not replaced with a fixture function.
  for (const writer of [reservation, audit, auditAlias]) {
    const f = fixture(), conflict = writer(f); query(`${f.enroll};${enabled}`);
    await ordered(f.capture, conflict.insert, r => denied(r), {label: `capture before ${writer.name}`});
    assert.equal(query(`select count(*) from public.videos where id=${lit(f.target)}`), '0');
    assert.equal(query(`select count(*) from private.deleted_content_records where target_id=${lit(f.target)} and media_disposition='reviewed_external_reference'`), '1');
    assert.equal(query(`select count(*) from private.deleted_content_media_stages where target_id=${lit(f.target)}`), '0');
    assert.equal(query(`select count(*) from private.deleted_media_key_retirements where target_id=${lit(f.target)}`), '0');
    const retry = JSON.parse(query(`begin;${f.capture};commit;`).split('\n').at(-1));
    assert.equal(retry.status, 'already_deleted');
    f.clean();
  }

  {
    const f = fixture(); query(`${f.enroll};${enabled}`);
    const staleCapture = f.capture.replace(`${lit(f.binding.createdAt)}::timestamptz`, `(${lit(f.binding.createdAt)}::timestamptz-interval '1 second')`);
    assert.notEqual(staleCapture, f.capture);
    const stale = docker(args(), `begin;${staleCapture};commit;`);
    assert.notEqual(stale.status, 0); assert.match(String(stale.stderr), /deleted_content_source_binding_changed/);
    await ordered(`update public.videos set title='Synthetic latest text under source lock' where id=${lit(f.target)}`, f.capture, r => {
      assert.equal(resultJSON(r).status, 'deleted');
      assert.equal(query(`select content->>'title' from private.deleted_content_records where target_id=${lit(f.target)}`), 'Synthetic latest text under source lock');
    }, {label: 'exact-incarnation capture after metadata update'});
    f.clean();
  }

  {
    const f = fixture(); query(`${f.enroll};${enabled}`);
    await ordered(`update public.videos set title='Synthetic session race' where id=${lit(f.target)}`, f.capture, r => {
      denied(r, /deleted_content_current_session_required/);
      assert.equal(query(`select count(*) from public.videos where id=${lit(f.target)}`), '1');
      assert.equal(query(`select count(*) from private.deleted_content_records where target_id=${lit(f.target)}`), '0');
    }, {afterQueue: `update auth.sessions set not_after=clock_timestamp()-interval '1 second' where id=${lit(sessionId)}`,
      label: 'session revoked while source capture waits'});
    query(`update auth.sessions set not_after=clock_timestamp()+interval '1 day' where id=${lit(sessionId)}`);
    f.clean();
  }

  // INSERT an explicitly aged synthetic archive and its matching proof. Never
  // alter an immutable row, disable retention guards, change a clock or shorten
  // a real capture deadline. The actual endpoint was exercised above.
  {
    const f = fixture(), deletion = randomUUID();
    query(`${f.enroll};
      insert into private.deleted_content_records(id,target_type,target_id,author,owner_protected,content,
        source_created_at,deletion_kind,deleted_at,expires_at,media_disposition,external_evidence_id)
      select ${lit(deletion)},'creator_video',e.target_id::text,e.author::text,false,
        '{"title":"Synthetic aged external archive","description":"Synthetic history"}'::jsonb,
        e.source_created_at::timestamptz,'hard',now()-interval '721 hours',now()-interval '1 hour','reviewed_external_reference',e.id
      from private.deleted_content_external_reference_evidence e where e.target_id=${lit(f.target)};
      insert into private.deleted_content_external_reference_captures(deletion_id,evidence_id,target_id,author,source_created_at,
        source_binding,archive_sha256,deleted_at,expires_at)
      select r.id,e.id,e.target_id,e.author,r.source_created_at,e.source_binding,
        private.deleted_content_external_sha256(to_jsonb(r)),r.deleted_at,r.expires_at
      from private.deleted_content_records r join private.deleted_content_external_reference_evidence e on e.id=r.external_evidence_id
      where r.id=${lit(deletion)};
      insert into private.deleted_content_retention_events(operation,target_type,target_id,deletion_id,actor)
      values('capture','creator_video',${lit(f.target)},${lit(deletion)},'synthetic-aged-fixture');${f.remove};${enabled}`);
    assert.equal(query(`select private.deleted_content_external_archive_supported(${lit(deletion)})`), 't');
    const hold = `insert into public.legal_holds(target_type,target_id,reason,status)
      values('creator_video',${lit(f.target)},'Synthetic external hold ordering','active')`;
    const expire = `select public.expire_deleted_content_text(${lit(deletion)})::text`;
    await ordered(hold, expire, r => {
      assert.equal(resultJSON(r).status, 'held');
      assert.equal(query(`select count(*) from private.deleted_content_records where id=${lit(deletion)}`), '1');
    }, {label: 'hold before external expiry claim'});
    query(`update public.legal_holds set status='released' where target_type='creator_video' and target_id=${lit(f.target)}`);
    await ordered(expire, hold, r => denied(r, /deletion_already_claimed/), {label: 'external expiry claim before hold'});
    assert.equal(query(`select count(*) from private.deleted_content_records where id=${lit(deletion)}`), '0');
    assert.equal(query(`select count(*) from private.deleted_content_expiry_claims where deletion_id=${lit(deletion)} and completed_at is not null`), '1');
    assert.equal(query(`select count(*) from private.deleted_content_media_stages where target_id=${lit(f.target)}`), '0');
    assert.equal(query(`select count(*) from private.deleted_media_key_retirements where target_id=${lit(f.target)}`), '0');
    assert.equal(query(`select count(*) from private.deleted_content_media_expiry_claims where target_id=${lit(f.target)}`), '0');
    assert.equal(JSON.parse(query(`begin;${f.capture};commit;`).split('\n').at(-1)).status, 'already_deleted');
    assert.equal(JSON.parse(query(expire)).status, 'already_absent');
    f.clean();
  }
  console.log(`External-reference retention native PostgreSQL: ${checks} protocol scenarios passed, including ${observedQueues} observed independent backend lock queues; no provider operations.`);
} finally {
  try {
  if (cloned) ok(docker(['exec', container, 'dropdb', '-U', 'postgres', '--if-exists', '--force', database]), 'drop generated clone');
  if (before !== undefined) assert.equal(query(fingerprint, 'postgres'), before, 'local source unchanged');
  } finally { cloneGuardRestore.assertSourceUnchanged(); }
}
