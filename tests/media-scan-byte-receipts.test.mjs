import test from 'node:test';
import assert from 'node:assert/strict';
import {PGlite} from '@electric-sql/pglite';
import {installByteReceiptFixture,createByteReceipt} from './helpers/media-scan-byte-receipt-fixture.mjs';

test('actual SQL receipt boundary binds real claim/completion, immutable bytes and current incarnation',async()=>{
 const db=new PGlite();
 const q=async(sql,args=[]) => (await db.query(sql,args)).rows[0];
 try {
  await db.exec(`create schema private; create schema storage; create schema auth;
   create role anon; create role authenticated; create role service_role;
   create function auth.jwt() returns jsonb language sql as $$select jsonb_build_object('role',current_setting('test.role',true))$$;
   create function auth.role() returns text language sql as $$select current_setting('test.role',true)$$;
   select set_config('test.role','service_role',false);
   create table storage.objects(id uuid default gen_random_uuid(),bucket_id text,name text,version text);
   create table platform_brand_assets(id uuid primary key default gen_random_uuid(),owner_user_id text,asset_type text,
    created_at timestamptz default now(),deleted_at timestamptz,storage_provider text default 'supabase',
    storage_bucket text default 'platform-brand-assets',storage_object_key text,storage_path text,
    moderation_status text,moderation_reason text,moderated_at timestamptz,updated_at timestamptz);`);
  await installByteReceiptFixture(db);
  const asset=async()=>{
   const id=(await q('select gen_random_uuid() id')).id,key=`platform_rachi_official/logo/${id}.png`;
   await db.query("insert into platform_brand_assets(id,owner_user_id,asset_type,storage_object_key,storage_path) values($1,'platform_rachi_official','logo',$2,$2)",[id,key]);
   await db.query("insert into storage.objects(bucket_id,name,version) values('platform-brand-assets',$1,'generation-one')",[key]);
   return {id,key};
  };
  const a=await asset(), f=await createByteReceipt(db,{assetId:a.id});
  assert.equal(f.completion.targetPropagationComplete,true);
  const binding=(await q('select binding from private.media_scan_byte_observations where id=$1',[f.observation])).binding;
  const matches=(receipt=f.receipt,b=binding,hash='a'.repeat(64),size=23)=>q('select private.platform_brand_scan_byte_receipt_matches($1,$2,$3,$4) ok',[receipt,b,hash,size]);
  const record=(patch={})=>q('select public.record_media_scan_byte_receipt($1,$2,$3,$4,$5) id',[
   patch.observation??f.observation,patch.job??f.job,patch.worker??'test-scanner',patch.hash??'a'.repeat(64),patch.size??23]);
  assert.equal((await matches()).ok,true);
  const originalObject=(await q('select id from storage.objects where name=$1',[a.key])).id;
  await db.query('update storage.objects set id=gen_random_uuid() where name=$1',[a.key]);
  assert.equal((await matches()).ok,false);await assert.rejects(record(),/result_stale/);
  await db.query('update storage.objects set id=$1 where name=$2',[originalObject,a.key]);
  const originalSource=(await q("select to_char(created_at at time zone 'UTC','YYYY-MM-DD\"T\"HH24:MI:SS.US\"Z\"') t from platform_brand_assets where id=$1",[a.id])).t;
  await db.query("update platform_brand_assets set created_at=created_at+interval '1 day' where id=$1",[a.id]);
  assert.equal((await matches()).ok,false);await assert.rejects(record(),/result_stale/);
  await db.query('update platform_brand_assets set created_at=$1 where id=$2',[originalSource,a.id]);
  assert.equal((await matches()).ok,true);
  for(const args of [[f.receipt,binding,'b'.repeat(64),23],[f.receipt,binding,'a'.repeat(64),24],
    [f.receipt,{...binding,ownerId:'other'}],[f.receipt,{...binding,storageVersion:'other'}],
    [f.receipt,{...binding,sourceCreatedAt:'2000-01-01T00:00:00.000000Z'}]]) assert.equal((await matches(...args)).ok,false);
  assert.equal((await record()).id,f.receipt);
  for(const timezone of ['America/Los_Angeles','Asia/Kolkata','UTC']) {
   await db.query("select set_config('timezone',$1,false)",[timezone]);
   assert.equal((await matches()).ok,true);
   assert.equal((await record()).id,f.receipt);
  }
  await assert.rejects(record({hash:'b'.repeat(64)}),/receipt_conflict/);
  await assert.rejects(record({hash:'not-a-digest'}),/digest_invalid/);
  await assert.rejects(record({worker:'other'}),/observation_mismatch/);
  await assert.rejects(record({job:(await q('select gen_random_uuid() id')).id}),/observation_mismatch/);
  for(const sql of ['delete from private.media_scan_byte_receipts','update private.media_scan_byte_receipts set size_bytes=42',
    'truncate private.media_scan_byte_receipts','delete from private.media_scan_byte_observations']) await assert.rejects(db.exec(sql),/immutable/);
  for(const [mutation,restore] of [
   ["update media_scan_jobs set status='scan_failed'","update media_scan_jobs set status='clean'"],
   ["update media_scan_jobs set claimed_by='stale'","update media_scan_jobs set claimed_by='test-scanner'"],
   ["update media_scan_jobs set signature_version='other'","update media_scan_jobs set signature_version='daily/123'"],
   ["update media_scan_jobs set attempt_count=2","update media_scan_jobs set attempt_count=1"],
   ["update storage.objects set version='replacement'","update storage.objects set version='generation-one'"],
   ["update platform_brand_assets set scan_status='scan_failed'","update platform_brand_assets set scan_status='clean'"]]) {
    await db.exec(mutation);assert.equal((await matches()).ok,false);await assert.rejects(record(),/result_stale|receipt_conflict/);await db.exec(restore);
  }
  assert.equal((await matches()).ok,true);
  for(const role of ['anon','authenticated']) {
   assert.equal((await q("select has_function_privilege($1,'public.record_media_scan_byte_receipt(uuid,uuid,text,text,bigint)','EXECUTE') ok",[role])).ok,false);
   await db.query("select set_config('test.role',$1,false)",[role]);await assert.rejects(record(),/service_role_required/);
  }
  await db.exec("select set_config('test.role','service_role',false)");
  for(const role of ['anon','authenticated','service_role']) {
   assert.equal((await q("select has_table_privilege($1,'private.media_scan_byte_receipts','INSERT,UPDATE,DELETE,TRUNCATE') ok",[role])).ok,false);
   assert.equal((await q("select has_function_privilege($1,'private.platform_brand_scan_byte_receipt_matches(uuid,jsonb,text,bigint)','EXECUTE') ok",[role])).ok,false);
  }
  const b=await asset();const g=await createByteReceipt(db,{assetId:b.id});
  assert.equal((await matches(g.receipt)).ok,false);
  await assert.rejects(q('select public.begin_media_scan_byte_observation($1,$2,1)',[g.job,'test-scanner']),/claim_stale/);
  // A failure and a stale lease never mint a receipt, even with a valid digest.
  await db.query("update media_scan_jobs set status='scanning',claimed_at=clock_timestamp(),attempt_count=2 where id=$1",[g.job]);
  await assert.rejects(q('select public.begin_media_scan_byte_observation($1,$2,1)',[g.job,'test-scanner']),/claim_stale/);
  await assert.rejects(q('select public.begin_media_scan_byte_observation($1,$2,2)',[g.job,'other']),/claim_stale/);
  const observation=(await q('select public.begin_media_scan_byte_observation($1,$2,2) id',[g.job,'test-scanner'])).id;
  await db.query("update media_scan_jobs set claimed_at=clock_timestamp()-interval '21 minutes' where id=$1",[g.job]);
  await assert.rejects(q('select public.begin_media_scan_byte_observation($1,$2,2)',[g.job,'test-scanner']),/claim_stale/);
  await q("select public.complete_media_scan_job($1,'scan_failed','clamav','ClamAV 1.4','daily/123',null,'failed',1)",[g.job]);
  await assert.rejects(record({observation,job:g.job}),/result_stale/);
  // Actual wall-clock expiry between a valid observation and completion.
  const expiredAsset=await asset();
  const expiredJob=(await q(`insert into media_scan_jobs(target_table,target_column,target_id,owner_user_id,storage_provider,storage_bucket,storage_object_key)
   select 'platform_brand_assets',asset_type,id::text,owner_user_id,storage_provider,storage_bucket,storage_object_key
   from platform_brand_assets where id=$1 returning id`,[expiredAsset.id])).id;
  await q("select * from public.claim_media_scan_jobs(25,'expiry-worker')");
  await db.query("update media_scan_jobs set claimed_at=clock_timestamp()-interval '19 minutes 59 seconds' where id=$1",[expiredJob]);
  const expiredObservation=(await q("select public.begin_media_scan_byte_observation($1,'expiry-worker',1) id",[expiredJob])).id;
  await new Promise(resolve=>setTimeout(resolve,1200));
  const expiredCompletion=(await q("select public.complete_media_scan_job($1,'clean','clamav','ClamAV 1.4','daily/123',null,null,1) r",[expiredJob])).r;
  assert.equal(expiredCompletion.targetPropagationComplete,true);
  await assert.rejects(record({observation:expiredObservation,job:expiredJob,worker:'expiry-worker'}),/result_stale/);
  assert.equal((await q('select count(*)::int n from private.media_scan_byte_receipts where observation_id=$1',[expiredObservation])).n,0);
 } finally {await db.close();}
});
