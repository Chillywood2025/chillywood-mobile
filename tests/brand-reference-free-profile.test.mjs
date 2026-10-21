import test from 'node:test';
import assert from 'node:assert/strict';
import {PGlite} from '@electric-sql/pglite';
import {installBrandSoftRemovalFixture} from './helpers/brand-soft-removal-fixture.mjs';

test('only exact reference-free Brand profile shapes avoid the global claim latch',async()=>{
 const db=new PGlite(),q=async(sql,args=[]) =>(await db.query(sql,args)).rows[0];
 const slots=['hero_image_asset_id','hero_video_asset_id','hero_poster_asset_id','background_image_asset_id','avatar_asset_id','logo_asset_id','watermark_asset_id'];
 try {
  await installBrandSoftRemovalFixture(db);
  const assets=[];
  for(let i=0;i<2;i++) {
   await db.query("insert into storage.objects(bucket_id,name,version) values('platform-brand-assets',$1,'v1')",['profile-fixture/'+i+'.png']);
   assets.push((await q("insert into platform_brand_assets(owner_user_id,asset_type,storage_object_key,storage_path,mime_type) values('profile-fixture','hero_image',$1,$1,'image/png') returning id",['profile-fixture/'+i+'.png'])).id);
  }
  await db.exec(`create table public.profile_shape_counterexample(like public.platform_brand_profiles including all);
   create trigger aaa_profile_counterexample before insert or update on public.profile_shape_counterexample for each row execute function private.guard_platform_brand_retention_profile();`);
  const run=async(sql,args=[],allow=false,isolation='repeatable read')=>{
   await db.exec(`begin isolation level ${isolation}`);
   try{if(allow)await db.query(sql,args);else await assert.rejects(db.query(sql,args),e=>e.code==='25000'&&e.message==='brand_retention_read_committed_required');}
   finally{await db.exec('rollback');}
  };
  for(const table of ['platform_brand_profiles','platform_brand_publications']) {
   assert.equal((await q(`select count(*)::int n from pg_trigger where tgrelid='public.${table}'::regclass and tgfoid='private.guard_platform_brand_retention_profile()'::regprocedure and tgenabled='O'`)).n,1);
   await db.query(`insert into ${table}(owner_user_id) values('empty')`);
   for(const isolation of ['repeatable read','serializable']) {
    await run(`insert into ${table}(owner_user_id) values('new-empty')`,[],true,isolation);
    await run(`update ${table} set accent_color='#123456' where owner_user_id='empty'`,[],true,isolation);
    for(const slot of slots) {
     await run(`insert into ${table}(owner_user_id,${slot}) values('with-reference',$1)`,[assets[0]],false,isolation);
     await run(`update ${table} set ${slot}=$1 where owner_user_id='empty'`,[assets[0]],false,isolation);
     await db.query(`insert into ${table}(owner_user_id,${slot}) values($1,$2)`,['profile-fixture',assets[0]]);
     for(const value of [null,assets[0],assets[1]])await run(`update ${table} set ${slot}=$1 where owner_user_id=$2`,[value,'profile-fixture'],false,isolation);
     await db.query(`delete from ${table} where owner_user_id=$1`,['profile-fixture']);
    }
   }
   for(const column of ['metadata jsonb default \'{}\'::jsonb','future_asset_id uuid','future_media_url text']) {
    await db.exec(`alter table ${table} add column ${column}`);
    await run(`update ${table} set accent_color='#234567' where owner_user_id='empty'`);
    await run(`insert into ${table}(owner_user_id) values('future-shape')`);
    await db.exec(`alter table ${table} drop column ${column.split(' ')[0]}`);
   }
  }
  await run("insert into profile_shape_counterexample(owner_user_id) values('other-table')");
  // Synthetic durable claim only in disposable DB; this proves reference
  // fencing, not eligibility, provider deletion or physical absence.
  await db.query('insert into private.platform_brand_expiry_claims(asset_id) values($1)',[assets[1]]);
  await assert.rejects(db.query("update platform_brand_profiles set hero_image_asset_id=$1 where owner_user_id='empty'",[assets[1]]),/brand_claimed_profile_reference_forbidden/);
  const original=(await q("select pg_get_functiondef('private.guard_platform_brand_retention_profile()'::regprocedure) body")).body;
  const newRefs="array_remove(array["+slots.map(s=>'new.'+s).join(',')+"],null::uuid)='{}'::uuid[]";
  const oldRefs=newRefs.replaceAll('new.','old.');
  await db.exec('alter table platform_brand_profiles add column future_asset_id uuid');
  const mutants=[
   ["tg_relid in (to_regclass('public.platform_brand_profiles'),to_regclass('public.platform_brand_publications'))","true","insert into profile_shape_counterexample(owner_user_id) values('other-table')",[]],
   [newRefs,'true',"insert into platform_brand_publications(owner_user_id,hero_image_asset_id) values('new-reference',$1)",[assets[0]]],
   [oldRefs,'true',"update platform_brand_publications set hero_image_asset_id=null where owner_user_id='old-reference'",[]],
   ["to_jsonb(new) ?& known_columns and (to_jsonb(new)-known_columns)='{}'::jsonb","true","insert into platform_brand_profiles(owner_user_id) values('future-shape')",[]]
  ];
  await db.query("insert into platform_brand_publications(owner_user_id,hero_image_asset_id) values('old-reference',$1)",[assets[0]]);
  for(const [needle,replacement,sql,args] of mutants) {
   assert.equal(original.split(needle).length,2);await run(sql,args);
   await db.exec(original.replace(needle,replacement));
   try{await run(sql,args,true);}finally{await db.exec(original);}
  }
  assert.equal((await q("select pg_get_functiondef('private.guard_platform_brand_retention_profile()'::regprocedure) body")).body,original);
  await db.exec('alter table platform_brand_profiles drop column future_asset_id');
  await assert.rejects(db.query("update platform_brand_profiles set hero_image_asset_id=$1 where owner_user_id='empty'",[assets[1]]),/brand_claimed_profile_reference_forbidden/);
 }finally{await db.close();}
});
