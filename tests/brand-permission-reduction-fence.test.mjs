import test from 'node:test';
import assert from 'node:assert/strict';
import {PGlite} from '@electric-sql/pglite';
import {installBrandSoftRemovalFixture,readMigration} from './helpers/brand-soft-removal-fixture.mjs';

test('Brand fence permits only exact empty-locator authority reduction without its global latch',async()=>{
 const db=new PGlite();const q=async(sql,args=[]) =>(await db.query(sql,args)).rows[0];
 try {
  await installBrandSoftRemovalFixture(db);
  const source=readMigration('202605200002_owner_superuser_scoped_staff_legal_evidence.sql');
  const start=source.indexOf('create table if not exists public."platform_staff_permission_grants" (');assert.ok(start>=0);
  await db.exec(source.slice(start,source.indexOf(';',start)+1));
  // Same real migrated generic trigger, installed after this fixture table.
  await db.exec(`create trigger zzz_platform_brand_retention_reference before insert or update on public.platform_staff_permission_grants for each row execute function private.guard_platform_brand_retention_references();
   create table public.permission_shape_counterexample(like public.platform_staff_permission_grants including all);
   create trigger zzz_platform_brand_retention_reference before insert or update on public.permission_shape_counterexample for each row execute function private.guard_platform_brand_retention_references();`);
  assert.equal((await q("select count(*)::int n from pg_trigger where tgrelid='public.platform_staff_permission_grants'::regclass and tgfoid='private.guard_platform_brand_retention_references()'::regprocedure and tgenabled='O'")).n,1);
  const seed=async({table='platform_staff_permission_grants',status='active',expiry=null,metadata={}}={})=>(await q(`insert into public.${table}(target_user_id,target_email,permission_key,status,expires_at,metadata) values('fixture-owner','fixture@example.test','manage_moderators',$1,$2,$3) returning id`,[status,expiry,metadata])).id;
  const rows={unlimited:await seed(),finite:await seed({expiry:'2090-01-01'}),revoked:await seed({status:'revoked'}),metadata:await seed({metadata:{unknown:true}}),other:await seed({table:'permission_shape_counterexample'})};
  const run=async(sql,args=[],allow=false,isolation='repeatable read')=>{
   await db.exec(`begin isolation level ${isolation}`);
   try {if(allow)await db.query(sql,args);else await assert.rejects(db.query(sql,args),e=>e.code==='25000'&&e.message==='brand_retention_read_committed_required');}
   finally {await db.exec('rollback');}
  };
  for(const isolation of ['repeatable read','serializable']) {
   for(const [id,patch] of [[rows.unlimited,"expires_at='2080-01-01'"],[rows.finite,"expires_at='2080-01-01'"],[rows.finite,"expires_at=expires_at"],[rows.unlimited,"status='revoked',updated_at=clock_timestamp()"],[rows.revoked,"status=status"]])await run(`update platform_staff_permission_grants set ${patch} where id=$1`,[id],true,isolation);
   for(const [id,patch] of [[rows.finite,"expires_at='2100-01-01'"],[rows.finite,'expires_at=null'],[rows.unlimited,"expires_at='infinity'"],[rows.unlimited,"expires_at='-infinity'"],[rows.revoked,"status='active'"],[rows.unlimited,"reason='identity-adjacent edit',status='revoked'"],[rows.unlimited,"target_user_id='other-owner',status='revoked'"],[rows.unlimited,"permission_key='support_inbox',status='revoked'"],[rows.unlimited,"metadata='{\"unknown\":true}',status='revoked'"],[rows.metadata,"metadata='{}',status='revoked'"],[rows.metadata,"status='revoked'"]])await run(`update platform_staff_permission_grants set ${patch} where id=$1`,[id],false,isolation);
   await run("insert into platform_staff_permission_grants(target_email,permission_key) values('new@example.test','manage_moderators')",[],false,isolation);
   await run("update permission_shape_counterexample set status='revoked' where id=$1",[rows.other],false,isolation);
  }
  await db.exec('alter table platform_staff_permission_grants add column future_media_url text');
  await run("update platform_staff_permission_grants set status='revoked' where id=$1",[rows.unlimited]);
  await db.exec('alter table platform_staff_permission_grants drop column future_media_url');
  await db.exec("insert into storage.objects(bucket_id,name,version) values('platform-brand-assets','fixture-owner/logo/retired.png','v1')");
  const asset=(await q("insert into platform_brand_assets(owner_user_id,asset_type,storage_object_key,storage_path,mime_type) values('fixture-owner','logo','fixture-owner/logo/retired.png','fixture-owner/logo/retired.png','image/png') returning id")).id;
  await db.query('update platform_brand_assets set deleted_at=clock_timestamp() where id=$1',[asset]);
  await assert.rejects(db.query("update platform_staff_permission_grants set status='revoked',metadata='{\"unknown\":\"fixture-owner/logo/retired.png\"}' where id=$1",[rows.unlimited]),/brand_retained_reference_forbidden/);
  // Removing any of the independent authority/locator/identity boundaries
  // must make its otherwise identical negative operation wrongly succeed.
  const original=(await q("select pg_get_functiondef('private.guard_platform_brand_retention_references()'::regprocedure) body")).body;
  const mutants=[
   ["tg_relid=to_regclass('public.platform_staff_permission_grants')","true","update permission_shape_counterexample set status='revoked' where id=$1",rows.other],
   ["doc='{\"metadata\":{}}'::jsonb and old_doc='{\"metadata\":{}}'::jsonb","true","update platform_staff_permission_grants set status='revoked' where id=$1",rows.metadata],
   ["(to_jsonb(new)-array['status','expires_at','updated_at'])=(to_jsonb(old)-array['status','expires_at','updated_at'])","true","update platform_staff_permission_grants set target_user_id='other-owner',status='revoked' where id=$1",rows.unlimited],
   ["((to_jsonb(new)->>'status') is not distinct from (to_jsonb(old)->>'status')\n     or (to_jsonb(old)->>'status'='active' and to_jsonb(new)->>'status'='revoked'))","true","update platform_staff_permission_grants set status='active' where id=$1",rows.revoked],
   ["((to_jsonb(new)->>'expires_at') is not distinct from (to_jsonb(old)->>'expires_at')\n     or (to_jsonb(new)->>'expires_at' is not null\n       and pg_catalog.isfinite((to_jsonb(new)->>'expires_at')::timestamptz)\n       and (to_jsonb(old)->>'expires_at' is null\n         or (to_jsonb(new)->>'expires_at')::timestamptz<=(to_jsonb(old)->>'expires_at')::timestamptz)))","true","update platform_staff_permission_grants set expires_at='2100-01-01' where id=$1",rows.finite],
   ["pg_catalog.isfinite((to_jsonb(new)->>'expires_at')::timestamptz)","true","update platform_staff_permission_grants set expires_at='infinity' where id=$1",rows.unlimited]
  ];
  for(const [needle,replacement,sql,id] of mutants){
   assert.equal(original.split(needle).length,2,'one exact mutation target');
   await run(sql,[id]);
   await db.exec(original.replace(needle,replacement));
   try {await run(sql,[id],true);}finally{await db.exec(original);}
  }
  assert.equal((await q("select pg_get_functiondef('private.guard_platform_brand_retention_references()'::regprocedure) body")).body,original);
 } finally {await db.close();}
});
