import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {randomUUID} from 'node:crypto';
import {createDatabase} from '../helpers/database-runtime-authority-fixture.mjs';

const migration='20261031173602_google_external_program_capability_binding.sql';
test('Google program qualification cannot flow between packages or unbound capabilities', {timeout:240000}, async()=>{
 const {db}=await createDatabase({includeHeldStudio:true,applyRepair:true,repairInMigrationOrder:true,excludeMigrations:[migration]});
 const one=async(sql,args=[])=>Object.values((await db.query(sql,args)).rows[0])[0];
 try {
  const cap=await one(`insert into private.creator_external_payment_capabilities(feature,creator_id,provider_account_id,platform,storefront,storefront_country,route_kind,currency,environment,payment_method,min_amount_minor,max_amount_minor,provider_bounds_evidence,route_approval_evidence,verified_at,expires_at,enabled)
   values('creator_tip','${randomUUID()}','acct_fixture','android','google_play','US','android_external_content_link','usd','test','card',50,9999,'synthetic','synthetic',now(),now()+interval '1 hour',true) returning id`);
  const program=async(pkg)=>one(`insert into private.google_play_external_program_config(package_name,environment,enrollment_evidence,license_test_qualification_evidence,tax_configuration_evidence,reporter_configuration_evidence,native_build_qualification_evidence,verified_at,expires_at,enabled)
   values($1,'test','synthetic','synthetic','synthetic','synthetic','synthetic',now(),now()+interval '1 hour',true) returning id`,[pkg]);
  const wrong=await program('com.unrelated.app');
  assert.equal(await one('select private.google_play_external_program_ready($1)',[cap]),true,'negative control reproduces unrelated-package admission before repair');
  await db.exec(fs.readFileSync('supabase/migrations/'+migration,'utf8'));
  assert.equal(await one('select private.google_play_external_program_ready($1)',[cap]),false,'no implicit migration backfill');
  await db.query('insert into private.google_play_external_capability_program_bindings values($1,$2,now())',[cap,wrong]);
  assert.equal(await one('select private.google_play_external_program_ready($1)',[cap]),false,'even explicit wrong-package binding is denied');
  const right=await program('com.chillywood.mobile');
  assert.equal(await one('select private.google_play_external_program_ready($1)',[cap]),false,'another globally qualified program cannot rescue a wrong binding');
  const cap2=await one(`insert into private.creator_external_payment_capabilities select (jsonb_populate_record(null::private.creator_external_payment_capabilities,to_jsonb(c)||jsonb_build_object('id',$1::uuid))).* from private.creator_external_payment_capabilities c where id=$2 returning id`,[randomUUID(),cap]);
  await db.query('insert into private.google_play_external_capability_program_bindings values($1,$2,now())',[cap2,right]);
  assert.equal(await one('select private.google_play_external_program_ready($1)',[cap2]),true);
  assert.equal(await one('select private.google_play_external_bound_program_ready($1,$2)',[cap2,wrong]),false);
  await assert.rejects(()=>db.query('update private.google_play_external_capability_program_bindings set program_id=$1 where capability_id=$2',[right,cap]),/immutable/);
  for(const role of ['anon','authenticated','service_role']) {
   assert.equal(await one("select has_table_privilege($1,'private.google_play_external_capability_program_bindings','INSERT')",[role]),false);
   assert.equal(await one("select has_function_privilege($1,'private.google_play_external_bound_program_ready(uuid,uuid)','EXECUTE')",[role]),false);
  }
  await db.query('update private.google_play_external_program_config set revoked_at=clock_timestamp() where id=$1',[right]);
  assert.equal(await one('select private.google_play_external_program_ready($1)',[cap2]),false,'revoked exact proof cannot fall back');
  assert.equal(await one('select count(*)::integer from private.google_play_external_capability_program_bindings'),2,'history remains');
 } finally {await db.close();}
});
