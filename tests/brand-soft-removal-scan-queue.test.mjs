import test from 'node:test';
import assert from 'node:assert/strict';
import {PGlite} from '@electric-sql/pglite';
import {installBrandSoftRemovalFixture,scannerDefinition} from './helpers/brand-soft-removal-fixture.mjs';

test('actual brand removal preserves queue state and exact running completion cannot resurrect publication',async()=>{
 const db=new PGlite();const q=async(sql,args=[]) => (await db.query(sql,args)).rows[0];
 try {
  await installBrandSoftRemovalFixture(db);
  const guarded=(await q("select pg_get_functiondef('public.enqueue_platform_brand_asset_scan()'::regprocedure) definition")).definition;
  assert.match(guarded,/if\s+new\.?"?deleted_at"?\s+is\s+not\s+null\s+then\s+return\s+new/i,'load actual migration guard, never a synthetic implementation');
  const fixture=async()=>{
   const id=(await q('select gen_random_uuid() id')).id,key=`platform_rachi_official/logo/${id}.png`;
   await db.query("insert into storage.objects(bucket_id,name,version) values('platform-brand-assets',$1,'v1')",[key]);
   await db.query("insert into platform_brand_assets(id,owner_user_id,asset_type,asset_state,storage_object_key,storage_path,mime_type) values($1,'platform_rachi_official','logo','published',$2,$2,'image/png')",[id,key]);
   const job=(await q("select id from media_scan_jobs where target_table='platform_brand_assets' and target_id=$1",[id])).id;
   return {id,key,job};
  };
  const state=f=>q('select to_jsonb(j) value from media_scan_jobs j where id=$1',[f.job]);
  for(const running of [false,true]) {
   const f=await fixture();
   // Distinct existing queue fields catch destructive upsert resets, not merely status changes.
   await db.query("update media_scan_jobs set priority=$2,metadata=metadata||'{\"preserve\":\"fixture\"}',error_message='existing diagnostic' where id=$1",[f.job,running?-2147483648:-100]);
   if(running)await q("select * from claim_media_scan_jobs(1,'removal-fixture-worker')");
   const before=await state(f);assert.equal(before.value.status,running?'scanning':'pending_scan');
   await db.query('update platform_brand_assets set deleted_at=clock_timestamp() where id=$1',[f.id]);
   assert.deepEqual(await state(f),before,'soft removal must preserve entire queued job byte-for-byte');
   const tombstone=await q('select deleted_at,asset_state from platform_brand_assets where id=$1',[f.id]);
   assert.ok(tombstone.deleted_at);assert.equal(tombstone.asset_state,'archived');
   await assert.rejects(db.query('update platform_brand_assets set deleted_at=null where id=$1',[f.id]),/tombstone_permanent/);
   const complete=()=>q("select complete_media_scan_job($1,'clean','clamav','ClamAV fixture','daily/fixture',null,null,1) r",[f.job]);
   if(running)assert.equal((await complete()).r.targetPropagationComplete,true);
   else await assert.rejects(complete(),/brand_retained_reference_forbidden/);
   const after=await q('select deleted_at,asset_state from platform_brand_assets where id=$1',[f.id]);
   assert.deepEqual(after,tombstone,'actual completion cannot resurrect or republish removed asset');
   if(running)assert.equal((await state(f)).value.status,'clean');
   else assert.deepEqual(await state(f),before,'non-running completion remains denied');
   assert.equal((await q('select count(*)::int n from media_scan_jobs where target_id=$1',[f.id])).n,1);
   if(!running) {
    await q("select * from claim_media_scan_jobs(1,'existing-post-removal-eligibility')");
    assert.equal((await state(f)).value.status,'scanning','existing claim eligibility is not changed by the retention fix');
    assert.equal((await complete()).r.targetPropagationComplete,true);
    assert.deepEqual(await q('select deleted_at,asset_state from platform_brand_assets where id=$1',[f.id]),tombstone);
   }
  }
  const fallback=await fixture();
  await db.query('update media_scan_jobs set priority=-2147483648 where id=$1',[fallback.job]);
  await q("select * from claim_media_scan_jobs(1,'fallback-worker')");
  await db.query('update platform_brand_assets set deleted_at=clock_timestamp() where id=$1',[fallback.id]);
  await db.exec(`create function public.fixture_fail_scan_target() returns trigger language plpgsql as $$begin
    if new.deleted_at is not null and new.scan_status='clean' then raise exception 'fixture_target_failure';end if;return new;end$$;
    create trigger zzzz_fixture_target_failure before update on platform_brand_assets for each row execute function public.fixture_fail_scan_target();`);
  const fallbackBefore=await q('select deleted_at,asset_state from platform_brand_assets where id=$1',[fallback.id]);
  const fallbackResult=(await q("select complete_media_scan_job($1,'clean','clamav','ClamAV fixture','daily/fixture',null,null,1) r",[fallback.job])).r;
  assert.equal(fallbackResult.targetPropagationComplete,false);
  const fallbackJob=(await state(fallback)).value;assert.equal(fallbackJob.status,'clean');assert.equal(fallbackJob.claimed_by,null);assert.equal(fallbackJob.claimed_at,null);
  assert.deepEqual(await q('select deleted_at,asset_state from platform_brand_assets where id=$1',[fallback.id]),fallbackBefore);
  await db.exec('drop trigger zzzz_fixture_target_failure on platform_brand_assets;drop function public.fixture_fail_scan_target()');
  const mutation=await fixture();await db.query('update media_scan_jobs set priority=-2147483648 where id=$1',[mutation.job]);
  await q("select * from claim_media_scan_jobs(1,'mutation-worker')");
  await db.query('update platform_brand_assets set deleted_at=clock_timestamp() where id=$1',[mutation.id]);
  const mutationBefore=await state(mutation);
  const completionFields="status='clean',completed_at=statement_timestamp(),updated_at=statement_timestamp(),metadata=metadata||jsonb_build_object('durationMs',1,'completedAt',statement_timestamp())";
  await db.exec('begin');await db.query(`update media_scan_jobs set ${completionFields} where id=$1`,[mutation.job]);
  assert.equal((await state(mutation)).value.status,'clean','otherwise valid completion mutation control must be admitted');await db.exec('rollback');
  for(const patch of ["attempt_count=attempt_count+1","claimed_by='different-worker'","claimed_at=claimed_at-interval '1 second'",
   "owner_user_id='different-owner'","target_column='avatar'","target_id=gen_random_uuid()::text",
   "storage_bucket='different-bucket'","storage_provider='s3'","id=gen_random_uuid()","created_at=created_at+interval '1 second'",
   "status='pending_scan'","metadata=metadata||'{\"unapproved\":true}'"]) {
   const assignments=patch.startsWith('status=')?completionFields.replace("status='clean'",patch):
    patch.startsWith('metadata=')?completionFields+"||'{\"unapproved\":true}'::jsonb":completionFields+','+patch;
   await assert.rejects(db.query(`update media_scan_jobs set ${assignments} where id=$1`,[mutation.job]),/brand_retained_reference_forbidden/,patch);
   assert.deepEqual(await state(mutation),mutationBefore);
  }
  for(const metadataPatch of ["jsonb_build_object('durationMs','not-a-number')",
   "jsonb_build_object('completedAt','2000-01-01T00:00:00Z')",
   "jsonb_build_object('targetPropagationComplete',true)",
   "jsonb_build_object('targetPropagationFailure','unapproved-reason')",
   "jsonb_build_object('targetPropagationFailedAt','2000-01-01T00:00:00Z')"]) {
   await assert.rejects(db.query(`update media_scan_jobs set ${completionFields}||${metadataPatch} where id=$1`,[mutation.job]),/brand_retained_reference_forbidden/);
   assert.deepEqual(await state(mutation),mutationBefore);
  }
  // Synthetic privileged corruption lives only in this disposable fixture and
  // is rolled back; actual guards stay installed during completion evaluation.
  for(const corrupt of [
   "update media_scan_jobs set claimed_at=clock_timestamp()-interval '21 minutes' where id=$1",
   "update storage.objects set version='replaced-generation' where name=$1",
  ]) {
   await db.exec('begin');
   if(corrupt.includes('storage.objects')) {
    await db.exec('alter table storage.objects disable trigger aaa_platform_brand_storage_incarnation');
    await db.query(corrupt,[mutation.key]);
    await db.exec('alter table storage.objects enable trigger aaa_platform_brand_storage_incarnation');
   } else await db.query(corrupt,[mutation.job]);
   await assert.rejects(q("select complete_media_scan_job($1,'clean','clamav','fixture','daily/fixture',null,null,1)",[mutation.job]),/brand_retained_reference_forbidden/);
   await db.exec('rollback');
  }
  // Expiry-claimed objects may never acquire a late completion allowance.
  await db.query('insert into private.platform_brand_expiry_claims(asset_id) values($1)',[mutation.id]);
  await assert.rejects(q("select complete_media_scan_job($1,'clean','clamav','fixture','daily/fixture',null,null,1)",[mutation.job]),/brand_retained_reference_forbidden/);
  // Implementation mutants, not merely hostile inputs: remove ONE actual
  // predicate in a disposable transaction, prove the original denies and the
  // mutant admits the same actual completion, then roll everything back.
  const authority=(await q("select pg_get_functiondef('private.guard_platform_brand_retention_references()'::regprocedure) definition")).definition;
  for(const [label,needle,corrupt] of [
   ['job target identity',"and to_jsonb(old)->>'target_id'=r.asset_id::text",f=>db.query('update media_scan_jobs set target_id=gen_random_uuid()::text where id=$1',[f.job])],
   ['job owner identity',"and to_jsonb(old)->>'owner_user_id'=r.owner_id",f=>db.query("update media_scan_jobs set owner_user_id='wrong-owner' where id=$1",[f.job])],
   ['job provider identity',"and to_jsonb(old)->>'storage_provider'=r.provider",f=>db.query("update media_scan_jobs set storage_provider='s3' where id=$1",[f.job])],
   ['job bucket identity',"and to_jsonb(old)->>'storage_bucket'=r.bucket",f=>db.query("update media_scan_jobs set storage_bucket='wrong-bucket' where id=$1",[f.job])],
   ['job source age',"and (to_jsonb(old)->>'created_at')::timestamptz>=r.source_created_at",f=>db.query("update media_scan_jobs set created_at=created_at-interval '1 day' where id=$1",[f.job])],
   ['job removal age',"and (to_jsonb(old)->>'created_at')::timestamptz<=r.removed_at",f=>db.query("update media_scan_jobs set created_at=created_at+interval '1 day' where id=$1",[f.job])],
   ['job asset type',"and a.asset_type=to_jsonb(old)->>'target_column'",f=>db.query("update media_scan_jobs set target_column='avatar' where id=$1",[f.job])],
   ['expired lease',"and (to_jsonb(old)->>'claimed_at')::timestamptz+interval '20 minutes'>clock_timestamp()",f=>db.query("update media_scan_jobs set claimed_at=clock_timestamp()-interval '21 minutes' where id=$1",[f.job])],
   ['future lease',"and (to_jsonb(old)->>'claimed_at')::timestamptz<=clock_timestamp()",f=>db.query("update media_scan_jobs set claimed_at=clock_timestamp()+interval '1 minute' where id=$1",[f.job])],
   ['worker identity',"and nullif(btrim(to_jsonb(old)->>'claimed_by'),'') is not null",f=>db.query("update media_scan_jobs set claimed_by='' where id=$1",[f.job])],
   ['expiry claim',"and not exists(select 1 from private.platform_brand_expiry_claims c where c.asset_id=r.asset_id)",f=>db.query('insert into private.platform_brand_expiry_claims(asset_id) values($1)',[f.id])],
   ['object generation',"and to_jsonb(o)->>'version'=r.storage_version",async f=>{
    await db.exec('alter table storage.objects disable trigger aaa_platform_brand_storage_incarnation');
    await db.query("update storage.objects set version='mutant-generation' where name=$1",[f.key]);
    await db.exec('alter table storage.objects enable trigger aaa_platform_brand_storage_incarnation');
   }],
   ['source incarnation','and a.created_at=r.source_created_at',async f=>{
    await db.exec('alter table platform_brand_assets disable trigger aaa_platform_brand_retention');
    await db.query("update platform_brand_assets set created_at=created_at-interval '1 day' where id=$1",[f.id]);
    await db.exec('alter table platform_brand_assets enable trigger aaa_platform_brand_retention');
   }],
   ['source owner','and a.owner_user_id=r.owner_id',async f=>{
    await db.exec('alter table platform_brand_assets disable trigger aaa_platform_brand_retention');
    await db.query("update platform_brand_assets set owner_user_id='wrong-source-owner' where id=$1",[f.id]);
    await db.exec('alter table platform_brand_assets enable trigger aaa_platform_brand_retention');
   }],
  ]) {
   const f=await fixture();await db.query('update media_scan_jobs set priority=-2147483648 where id=$1',[f.job]);
   await q("select * from claim_media_scan_jobs(1,'implementation-mutant-worker')");
   await db.query('update platform_brand_assets set deleted_at=clock_timestamp() where id=$1',[f.id]);
   assert.equal(authority.split(needle).length,2,`${label}: exactly one reviewed predicate`);
   await db.exec('begin');
   // Prepare hostile legacy job identity without treating the unrelated generic
   // locator fence as the predicate under test; restore it before evaluation.
   if(label.startsWith('job '))await db.exec('alter table media_scan_jobs disable trigger zzz_platform_brand_retention_reference');
   await corrupt(f);
   if(label.startsWith('job '))await db.exec('alter table media_scan_jobs enable trigger zzz_platform_brand_retention_reference');
   await db.exec('savepoint original_guard');
   const complete=()=>q("select complete_media_scan_job($1,'clean','clamav','fixture','daily/fixture',null,null,1) r",[f.job]);
   await assert.rejects(complete(),/brand_retained_reference_forbidden/,`${label}: original rejects`);
   await db.exec('rollback to savepoint original_guard');
   await db.exec(authority.replace(needle,''));
   assert.equal((await complete()).r.targetPropagationComplete,true,`${label}: removing predicate must expose forbidden completion`);
   assert.equal((await state(f)).value.status,'clean');
   await db.exec('rollback');
   assert.equal((await q("select pg_get_functiondef('private.guard_platform_brand_retention_references()'::regprocedure) definition")).definition,authority);
  }
  // Same nondeleted source update and same transaction timestamp, against old
  // and guarded actual definitions, must produce identical complete job rows.
  const live=await fixture();
  await db.exec('begin;savepoint comparison');
  await db.exec(scannerDefinition('enqueue_platform_brand_asset_scan'));
  await db.query("update platform_brand_assets set original_file_name='nondeleted.png' where id=$1",[live.id]);
  const oldState=await state(live);
  await db.exec('rollback to savepoint comparison');
  await db.exec(guarded);
  await db.query("update platform_brand_assets set original_file_name='nondeleted.png' where id=$1",[live.id]);
  assert.deepEqual(await state(live),oldState,'nondeleted update behavior exactly preserved');
  await db.exec('rollback');
  // Actual INSERT behavior is also identical, excluding only the randomly
  // generated job primary key. Both attempts share transaction time and source.
  const insertedId=(await q('select gen_random_uuid() id')).id;
  const insertedKey=`platform_rachi_official/logo/${insertedId}.png`;
  await db.query("insert into storage.objects(bucket_id,name,version) values('platform-brand-assets',$1,'v1')",[insertedKey]);
  const insert=()=>db.query("insert into platform_brand_assets(id,owner_user_id,asset_type,storage_object_key,storage_path,mime_type) values($1,'platform_rachi_official','logo',$2,$2,'image/png')",[insertedId,insertedKey]);
  const insertedJob=()=>q("select to_jsonb(j)-'id' value from media_scan_jobs j where target_id=$1",[insertedId]);
  await db.exec('begin;savepoint insertion');await db.exec(scannerDefinition('enqueue_platform_brand_asset_scan'));
  await insert();const oldInsert=await insertedJob();await db.exec('rollback to savepoint insertion');
  await db.exec(guarded);await insert();assert.deepEqual(await insertedJob(),oldInsert,'nondeleted insert behavior unchanged');await db.exec('rollback');
  // Negative control loads the real old trigger. Its attempted destructive
  // upsert is rejected by the existing retained-reference fence, blocking removal.
  const negative=await fixture();
  await db.query('update media_scan_jobs set priority=-2147483648 where id=$1',[negative.job]);
  await q("select * from claim_media_scan_jobs(1,'negative-control-worker')");
  await db.exec(scannerDefinition('enqueue_platform_brand_asset_scan'));
  const claimed=await state(negative);assert.equal(claimed.value.status,'scanning');
  await assert.rejects(db.query('update platform_brand_assets set deleted_at=clock_timestamp() where id=$1',[negative.id]),/brand_retained_reference_forbidden/);
  assert.deepEqual(await state(negative),claimed);
  assert.equal((await q('select deleted_at from platform_brand_assets where id=$1',[negative.id])).deleted_at,null);
 } finally {await db.close();}
});
