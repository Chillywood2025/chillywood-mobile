#!/usr/bin/env node
// Disposable PostgreSQL source-contract fixture, not provider-byte, full-schema
// or concurrent-session evidence. Scanner metadata below is synthetic test data.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';

const db = new PGlite();
let checks = 0;
let failed = false;
const q = async (sql, params = []) => (await db.query(sql, params)).rows[0];
const check = (value, label) => { assert.ok(value, label); checks += 1; };
const deny = async (fn, pattern) => { await assert.rejects(fn, pattern); checks += 1; };
const owner = '10000000-0000-4000-8000-000000000001';
const row = '20000000-0000-4000-8000-000000000001';
const attachment = '20000000-0000-4000-8000-000000000002';
const receipt = '30000000-0000-4000-8000-000000000001';
const attachmentReceipt = '30000000-0000-4000-8000-000000000002';
const parent = '40000000-0000-4000-8000-000000000001';
const digest = 'a'.repeat(64);
const target = (id, table, source) => `originals/supabase-migration/${id}/${table}/${source}`;
const proof = { protocol: 'supabase-original-copy-v1', sourceSha256: digest, targetSha256: digest,
  sourceSizeBytes: 1024, targetSizeBytes: 1024, createOnly: true, independentReadback: true };
const migration = 'supabase/migrations/20261021022807_supabase_original_copy_receipts.sql';
const snapshot = async (table, id) => (await q(`select to_jsonb(x) s from ${table} x where id=$1`, [id])).s;
const record = (table, id, rid, source, overrides = {}) => q(
  'select public.record_supabase_original_copy_receipt($1,$2,$3,$4,$5,$6,$7,$8) r',
  [rid, table, id, source, overrides.target ?? target(rid, table, id), overrides.digest ?? digest,
    overrides.size ?? 1024, overrides.proof ?? proof]);
const preflight = async (id = receipt) => (await q('select public.preflight_supabase_original_copy_cutover($1) r', [id])).r;
const transaction = async (fn) => { await db.exec('begin'); try { await fn(); } finally { await db.exec('rollback'); } };

try {
  await db.exec(`set timezone='UTC';create role anon;create role authenticated;create role service_role;create schema private;
    create table public.videos(id uuid primary key,owner_id uuid,created_at timestamp without time zone,
      deleted_at timestamptz,title text,storage_provider text,storage_bucket text,storage_object_key text,
      storage_path text,thumb_storage_path text,thumb_url text,playback_url text,scan_status text,scan_provider text,
      scan_result text,scanned_at timestamptz,scan_error text,quarantined_at timestamptz);
    create table public.social_attachments(id uuid primary key,owner_user_id text,created_at timestamptz,
      surface_type text,surface_id uuid,deleted_at timestamptz,storage_provider text,storage_bucket text,
      storage_object_key text,storage_path text,scan_status text,scan_provider text,scan_result text,
      scanned_at timestamptz,scan_error text,quarantined_at timestamptz);
    create table public.legal_holds(target_type text,target_id text,status text);
    create table public.video_renditions(video_id uuid,storage_path text);
    create table public.media_renditions(video_id uuid,source_type text,source_id text,storage_path text);
    create table public.media_transcode_jobs(source_type text,source_id text);
    create table public.media_scan_jobs(id uuid default gen_random_uuid(),target_table text,target_id text,
      target_column text,storage_provider text,storage_bucket text,storage_object_key text,status text,completed_at timestamptz);
    create table public.media_upload_reservations(storage_object_key text);
    create table public.json_consumers(id uuid default gen_random_uuid(),metadata jsonb);
    create table private.deleted_media_key_retirements(object_key text);
    create table private.deleted_media_legacy_provenance(object_key text);
    create table private.deleted_media_legacy_delivery_revocations(object_key text);
    create table private.media_object_storage_migration_audit(new_storage_object_key text,status text);
  `);
  const retention = readFileSync('supabase/migrations/20261020141458_deleted_content_retention.sql', 'utf8');
  await db.exec(retention.slice(retention.indexOf('create function private.deleted_content_hold_matches('),
    retention.indexOf('create function private.deleted_content_legal_hold_guard()')));
  const refs = readFileSync('supabase/migrations/20261020141554_deleted_media_reference_retirement.sql', 'utf8');
  await db.exec(refs.slice(refs.indexOf('create function private.deleted_media_locator_columns('),
    refs.indexOf('create function private.deleted_media_reference_identity(')));
  // Same catalog coverage function and harmless trigger identity, rather than
  // a stub that returns true regardless of a newly introduced consumer table.
  await db.exec(`create function private.guard_deleted_media_references() returns trigger language plpgsql as $$begin return new;end$$;`);
  await db.exec(refs.slice(refs.indexOf('create function private.deleted_media_reference_coverage_ready('),
    refs.indexOf('create function private.claim_deleted_media_retirement(')));
  await db.exec(`do $$declare t record;begin
    for t in select c.oid,c.relname from pg_class c join pg_namespace n on n.oid=c.relnamespace
      where n.nspname='public' and c.relkind in ('r','p') and cardinality(private.deleted_media_locator_columns(c.oid))>0 loop
      execute format('create trigger copy_fixture_reference_guard before insert or update on public.%I for each row execute function private.guard_deleted_media_references()',t.relname);
    end loop;end$$;`);
  await db.exec(readFileSync(migration, 'utf8'));
  await db.query(`insert into videos(id,owner_id,created_at,title,storage_provider,storage_bucket,storage_object_key,
    storage_path,scan_status,scan_provider,scan_result,scanned_at) values($1,$2,'2026-01-01','untouched title',
    'supabase','creator-videos','legacy/source.mp4','legacy/source.mp4','clean','clamav','clean','2026-01-02Z')`, [row, owner]);
  await db.query(`insert into social_attachments(id,owner_user_id,created_at,surface_type,surface_id,storage_provider,
    storage_bucket,storage_path,scan_status,scan_provider,scan_result,scanned_at) values($1,$2,'2026-01-01Z',
    'profile_post',$3,'supabase_storage','social-attachments','legacy/attachment.png','clean','clamav','clean','2026-01-02Z')`,
  [attachment, owner, parent]);
  await db.query(`insert into media_scan_jobs(target_table,target_id,target_column,storage_provider,storage_bucket,storage_object_key,status,completed_at)
    values('videos',$1,'source','supabase','creator-videos','legacy/source.mp4','clean','2026-01-02Z'),
    ('social_attachments',$2,'attachment','supabase','social-attachments','legacy/attachment.png','clean','2026-01-02Z')`, [row, attachment]);
  const original = await snapshot('videos', row);
  const locked = (await q("select private.read_supabase_original_copy_source('videos',$1) s", [row])).s;
  assert.deepEqual(locked, original);
  const originalAttachment = await snapshot('social_attachments', attachment);
  check((await preflight()).reason === 'copy_receipt_required', 'receipt required');
  await deny(() => record('platform_brand_assets', row, receipt, original), /unsupported_table/);
  await deny(() => record('videos', row, receipt, { ...original, title: 'changed' }), /source_changed/);
  await deny(() => record('videos', row, receipt, original, { target: 'legacy/existing.mp4' }), /fresh_target_required/);
  for (const bad of [{ ...proof, createOnly: false }, { ...proof, independentReadback: false },
    { ...proof, targetSha256: 'b'.repeat(64) }, { ...proof, targetSizeBytes: 12 }, { ...proof, scanResult: 'clean' }]) {
    await deny(() => record('videos', row, receipt, original, { proof: bad }), /readback_assertions_required/);
  }
  await deny(() => record('videos', row, receipt, original, { size: -1 }), /readback_assertions_required/);
  await deny(() => record('videos', row, receipt, original, { digest: 'A'.repeat(64) }), /readback_assertions_required/);
  for (const table of ['deleted_media_key_retirements', 'deleted_media_legacy_provenance', 'deleted_media_legacy_delivery_revocations']) {
    await transaction(async () => {
      await db.query(`insert into private.${table} values($1)`, [target(receipt, 'videos', row)]);
      await deny(() => record('videos', row, receipt, original), /target_history_conflict/);
    });
  }
  await transaction(async () => {
    await db.query('insert into media_upload_reservations values($1)', [target(receipt, 'videos', row)]);
    await deny(() => record('videos', row, receipt, original), /target_history_conflict/);
  });
  await transaction(async () => {
    await db.query(`insert into private.media_object_storage_migration_audit values($1,'rolled_back')`, [target(receipt, 'videos', row)]);
    await deny(() => record('videos', row, receipt, original), /target_history_conflict/);
  });
  await transaction(async () => {
    await db.query('insert into json_consumers(metadata) values($1)', [{ target: target(receipt, 'videos', row) }]);
    await deny(() => record('videos', row, receipt, original), /target_reference_conflict/);
  });
  await transaction(async () => {
    await db.query('update videos set storage_object_key=$1,storage_path=$1', [target(receipt, 'videos', row)]);
    await deny(() => snapshot('videos', row).then(s => record('videos', row, receipt, s)), /fresh_target_required/);
  });
  for (const change of ["storage_path='other/path.mp4'", "storage_object_key='https://example.invalid/source.mp4'",
    "storage_provider='s3'", "storage_bucket='other-bucket'", "storage_object_key='legacy/../source.mp4'",
    "storage_object_key='legacy/quote\".mp4'", "created_at=null", "owner_id=null"]) {
    await transaction(async () => {
      await db.exec(`update videos set ${change}`);
      await deny(() => snapshot('videos', row).then(s => record('videos', row, receipt, s)), /locator_required|identity_required/);
    });
  }
  await transaction(async () => {
    check((await record('videos', row, receipt, original)).r.recorded, 'receipt can commit transactionally');
  });
  check((await q('select count(*)::int n from private.supabase_original_copy_receipts')).n === 0, 'rollback removes uncommitted receipt');
  check((await record('videos', row, receipt, original)).r.cutoverAllowed === false, 'receipt is not cutover authority');
  check((await record('videos', row, receipt, original)).r.alreadyRecorded, 'exact retry idempotent');
  const storedReceipt = await q('select to_jsonb(r) r from private.supabase_original_copy_receipts r where id=$1', [receipt]);
  check(!JSON.stringify(storedReceipt.r).includes('untouched title') && !Object.hasOwn(storedReceipt.r, 'source_snapshot')
    && /^[a-f0-9]{64}$/.test(storedReceipt.r.source_snapshot_sha256), 'permanent provenance stores full-row digest, not permanent source text');
  await deny(() => record('videos', row, receipt, original, { digest: 'b'.repeat(64), proof: { ...proof, sourceSha256: 'b'.repeat(64), targetSha256: 'b'.repeat(64) } }), /receipt_conflict/);
  const good = await preflight();
  check(good.reason === 'fresh_scan_required_after_locator_cutover' && good.sourceMatches && !good.cutoverAllowed
    && good.cutoverImplemented === false && good.oldObjectDeletionAllowed === false, 'otherwise clear comparison still cannot cut over or delete');
  check(JSON.stringify(await snapshot('videos', row)) === JSON.stringify(original), 'all source fields unchanged');
  check((await q('select count(*)::int n from media_upload_reservations')).n === 0, 'no fake reservation');
  check((await q('select count(*)::int n from private.media_object_storage_migration_audit')).n === 0, 'no audit marked updated before cutover');
  check((await q('select count(*)::int n from private.deleted_media_legacy_provenance')).n === 0, 'no automatic enrollment');
  check((await q('select count(*)::int n from media_scan_jobs')).n === 2, 'no fake scan created');
  await transaction(async () => {
    await db.exec("update videos set scan_status='manual_review'");
    const uncleanReceipt = '30000000-0000-4000-8000-000000000099';
    await record('videos', row, uncleanReceipt, await snapshot('videos', row));
    check((await preflight(uncleanReceipt)).reason === 'source_scan_unresolved', 'byte-copy evidence does not confer a clean scan result');
    check((await snapshot('videos', row)).scan_status === 'manual_review', 'receipt leaves unresolved source scanner state untouched');
  });

  for (const [sql, reason] of [
    ["insert into legal_holds values('user','" + owner + "','active')", 'legal_hold'],
    ["insert into legal_holds values('unknown_scope','unrelated','active')", 'legal_hold'],
    ["insert into video_renditions values('" + row + "','secondary.mp4')", 'secondary_media_or_alias_uncovered'],
    ["insert into media_renditions values(null,'creator_video','" + row + "','secondary.mp4')", 'secondary_media_or_alias_uncovered'],
    ["insert into media_transcode_jobs values('creator_video','" + row + "')", 'secondary_media_or_alias_uncovered'],
    ["update media_scan_jobs set status='manual_review' where target_table='videos'", 'source_scan_unresolved'],
    ["update media_scan_jobs set completed_at=null where target_table='videos'", 'source_scan_unresolved'],
    ["insert into private.deleted_media_key_retirements values('legacy/source.mp4')", 'object_history_conflict'],
    ["insert into json_consumers(metadata) values('{\"url\":\"https://example.invalid/legacy%2Fsource.mp4\"}')", 'alias_or_live_reference'],
    ["create table public.unreviewed_consumer(media_url text)", 'reference_coverage_incomplete']
  ]) {
    await transaction(async () => { await db.exec(sql); check((await preflight()).reason === reason, reason); });
  }
  await transaction(async () => {
    await db.query('insert into json_consumers(metadata) values($1)', [{ target: target(receipt, 'videos', row) }]);
    check((await preflight()).reason === 'alias_or_live_reference', 'fresh target may not already have consumer aliases');
  });
  await transaction(async () => {
    await db.exec("insert into media_scan_jobs(storage_object_key,status) values('legacy/source.mp4','clean')");
    check((await preflight()).reason === 'alias_or_live_reference', 'null identity does not exclude unrelated historical scan reference');
  });
  await transaction(async () => {
    await db.exec("update videos set title='changed after receipt'");
    check((await preflight()).reason === 'source_changed', 'nonlocator source changes invalidate full CAS');
    await deny(() => record('videos', row, receipt, original), /source_changed/);
  });
  await transaction(async () => {
    await db.exec('delete from videos');
    check((await q('select count(*)::int n from private.supabase_original_copy_receipts')).n === 1, 'deleted source cannot erase copy evidence');
    await deny(() => preflight(), /live_source_required/);
  });
  await db.exec('begin isolation level repeatable read');
  await deny(() => preflight(), /requires_read_committed/);
  await db.exec('rollback');
  await transaction(async () => {
    await db.exec("alter table videos add column hard_deleted_at timestamptz default now()");
    await deny(() => preflight(), /live_source_required/);
  });
  for (const command of ['update private.supabase_original_copy_receipts set size_bytes=size_bytes',
    'delete from private.supabase_original_copy_receipts', 'truncate private.supabase_original_copy_receipts']) {
    await deny(() => db.exec(command), /receipt_permanent/);
  }
  check((await record('social_attachments', attachment, attachmentReceipt, originalAttachment)).r.recorded, 'social original has distinct provenance');
  check((await preflight(attachmentReceipt)).reason === 'fresh_scan_required_after_locator_cutover', 'social copy remains preflight only');
  await transaction(async () => {
    await db.query("insert into legal_holds values('profile_post',$1,'active')", [parent]);
    check((await preflight(attachmentReceipt)).reason === 'legal_hold', 'parent hold blocks social comparison');
  });
  const social = await q('select owner_id::text,source_created_at,parent_type,parent_id::text,old_provider,old_bucket,old_object_key from private.supabase_original_copy_receipts where id=$1', [attachmentReceipt]);
  check(social.owner_id === owner && social.parent_id === parent && social.parent_type === 'profile_post'
    && social.old_provider === 'supabase_storage' && social.old_bucket === 'social-attachments'
    && social.old_object_key === 'legacy/attachment.png', 'exact old owner parent and locator remain tracked');
  for (const role of ['anon', 'authenticated', 'service_role']) {
    check(!(await q("select has_table_privilege($1,'private.supabase_original_copy_receipts','SELECT,INSERT,UPDATE,DELETE,TRUNCATE') v", [role])).v, `${role} has no private table authority`);
    for (const fn of ['public.record_supabase_original_copy_receipt(uuid,text,uuid,jsonb,text,text,bigint,jsonb)', 'public.preflight_supabase_original_copy_cutover(uuid)']) {
      check((await q('select has_function_privilege($1,$2,\'execute\') v', [role, fn])).v === (role === 'service_role'), `${fn} service only`);
    }
    check(!(await q("select has_function_privilege($1,'private.read_supabase_original_copy_source(text,uuid)','execute') v", [role])).v, `${role} cannot call private source reader`);
  }
  check((await q("select relrowsecurity and relforcerowsecurity v from pg_class where oid='private.supabase_original_copy_receipts'::regclass")).v, 'FORCE RLS enabled');

  // Execute the existing scanner trigger body unchanged to establish the exact
  // blocker. This fixture update rolls back; no scanner implementation changes.
  const scanner = readFileSync('supabase/migrations/20260530191115_media_malware_scanning_pipeline.sql', 'utf8');
  await db.exec(scanner.slice(scanner.indexOf('create or replace function public."queue_video_scan"()'),
    scanner.indexOf('create or replace function public."enqueue_video_scan"()')));
  await transaction(async () => {
    await db.query('update videos set storage_object_key=$1,storage_path=$1 where id=$2', [target(receipt, 'videos', row), row]);
    const changed = await snapshot('videos', row);
    check(changed.scan_status === 'pending_scan' && changed.scan_result === null && changed.scanned_at === null,
      'real key-change trigger requires a fresh scan rather than clean-state preservation');
  });
  check(JSON.stringify(await snapshot('videos', row)) === JSON.stringify(original), 'scanner demonstration rolled back exactly');
  console.log(`PASS ${checks} Supabase original copy receipt PostgreSQL checks (disposable fixture; no cutover/provider/concurrency claim).`);
} catch (error) {
  console.error(error.message, { code: error.code, position: error.position, detail: error.detail });
  failed = true;
} finally { await db.close(); }
if (failed) process.exitCode = 1;
