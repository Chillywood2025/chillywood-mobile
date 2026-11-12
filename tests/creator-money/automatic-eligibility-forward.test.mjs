import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {randomUUID} from 'node:crypto';
import {createDatabase} from '../helpers/database-runtime-authority-fixture.mjs';
import {seedQualifiedCommerceCreator,seedCommerceBuyer,withCommerceActor,assertBuyerHasNoPremium} from '../helpers/automatic-commerce-fixture.mjs';
import {buildForwardSQL,sourcePayloads,sources,migrationName,commonGateSignatures} from '../../scripts/automatic-eligibility-forward.mjs';

const sql=()=>fs.readFileSync(`supabase/migrations/${migrationName}`,'utf8');
const topology=()=>JSON.parse(fs.readFileSync('tests/fixtures/automatic-eligibility-forward-topology.json','utf8'));
test('forward artifact is exact source-bound generation, with no historical receipt synthesis',()=>{
 assert.equal(sql(),buildForwardSQL(topology()));
 assert.equal(sourcePayloads().length,13);
 assert.doesNotMatch(sql(),/insert\s+into\s+supabase_migrations/iu);
});

for(const ancestry of ['missing','canonical'])test(`forward convergence preserves real ${ancestry} history and normal buyer checkout`,{timeout:600000},async()=>{
 const {db}=await createDatabase({implicitApiGrants:false,excludeMigrations:[migrationName,...ancestry==='missing'?sources.map(([file])=>file):[]]});
 const scalar=async(query,args=[])=>(await db.query(query,args)).rows[0].value;
 const switches=()=>scalar('select jsonb_agg(to_jsonb(s) order by key) value from public.platform_money_kill_switches s');
 const wrapper=()=>db.query(`select p.oid,p.proowner,p.proacl from pg_proc p where p.oid in
  ('public.begin_creator_money_checkout(uuid,uuid)'::regprocedure,
   'public.begin_creator_money_checkout_before_native(uuid,uuid)'::regprocedure,
   'public.creator_video_paid_precharge_authority_internal(uuid,text,text,text,integer,text,text)'::regprocedure,
   'public.creator_video_paid_precharge_before_production_admission(uuid,text,text,text,integer,text,text)'::regprocedure)
   or p.oid in(select to_regprocedure(value) from jsonb_array_elements_text($1::jsonb)) order by p.oid`,[JSON.stringify(commonGateSignatures)]);
 try{
  const beforeSwitches=await switches(),beforeWrappers=(await wrapper()).rows;
  await assert.rejects(db.exec(sql().replace(/\ncommit;\n$/u,'\nselect 1/0;\ncommit;\n')),/division by zero/u);
  await db.exec('rollback');
  assert.deepEqual((await wrapper()).rows,beforeWrappers,'late failure rolls back wrapper alterations');
  if(ancestry==='missing')assert.equal(await scalar("select to_regclass('private.creator_provider_observation_control')::text value"),null,'late failure rolls back all added objects');
  await db.exec('begin');
  const currentRoot=await scalar("select pg_get_functiondef('public.prepare_native_production_paid_video(uuid,text,text,text,integer)'::regprocedure) value");
  assert.ok(currentRoot.includes('begin\n'));
  await db.exec(currentRoot.replace('begin\n','begin\n -- Adversarial local-only predecessor change.\n'));
  await assert.rejects(db.exec(sql()),/automatic_forward_(predecessor_changed|canonical_changed)/u);
  await db.exec('rollback');
  if(ancestry==='canonical'){
   await db.exec('begin;alter table public.creator_payout_accounts disable trigger aaa_ordinary_commerce_writer_gate;');
   await assert.rejects(db.exec(sql()),/automatic_forward_trigger_changed/u);
   await db.exec('rollback');
   assert.equal(await scalar("select tgenabled value from pg_trigger where tgrelid='public.creator_payout_accounts'::regclass and tgname='aaa_ordinary_commerce_writer_gate'"),'O');
  }
  if(ancestry==='missing'){
   // Exact original first migration is a real partial-ancestry counterexample.
   await db.exec('begin');await db.exec(sourcePayloads()[0].sql);
   await assert.rejects(db.exec(sql()),/automatic_forward_(partial_ancestry|predecessor_changed)/u);
   await db.exec('rollback');
   assert.equal(await scalar("select to_regprocedure('private.ordinary_commerce_premium_current(uuid,text)')::text value"),null);
  }
  await db.exec(sql());
  assert.deepEqual(await switches(),beforeSwitches);
  assert.deepEqual((await wrapper()).rows,beforeWrappers,'current and retained OIDs, owners and permissions preserved');
  assert.equal(await scalar('select count(*)::int value from private.creator_provider_observation_jobs'),0);
  assert.deepEqual(await scalar('select to_jsonb(c) value from private.creator_provider_observation_control c'),{id:true,enabled:false,last_claimed_at:null});
  assert.equal(await scalar(`select position('native_production_unlaunched_retirements' in prosrc)>0 value from pg_proc
   where oid='public.creator_video_paid_precharge_before_production_admission(uuid,text,text,text,integer,text,text)'::regprocedure`),true,'newer recovery exclusion survives older admission patch');
  await db.exec("set request.jwt.claims='{\"role\":\"service_role\"}';set request.jwt.claim.role='service_role'");
  assert.deepEqual(await scalar('select public.claim_creator_provider_observations() value'),[],'default-off worker has no provider work');
  assert.equal(await scalar("select has_function_privilege('authenticated','public.claim_creator_provider_observations()','EXECUTE') value"),false);
  assert.equal(await scalar("select has_function_privilege('service_role','public.claim_creator_provider_observations()','EXECUTE') value"),true);
  const creator=await seedQualifiedCommerceCreator(db),buyer=await seedCommerceBuyer(db);
  await db.exec(`update public.platform_money_kill_switches set state='sandbox_only' where key in
   ('revenuecat_app_store_enabled','revenuecat_google_play_enabled','provider_webhooks_enabled','creator_monetization_enabled','digital_sales_enabled','tips_enabled')`);
  const rpc=(actor,query,args=[])=>withCommerceActor(db,actor,async()=>{
   await db.query("select set_config('request.headers',$1,true)",[JSON.stringify({'x-chillywood-platform':'ios'})]);
   return scalar(query,args);
  });
  const offer=await rpc(creator,"select public.set_creator_channel_subscription_offer('Forward ordinary monthly','Monthly','sandbox') value");
  const intent=await rpc(buyer,'select public.create_creator_channel_subscription_purchase_intent($1) value',[offer.id]);
  const checkout=await rpc(buyer,'select public.begin_creator_money_checkout($1,$2) value',[intent.id,randomUUID()]);
  assert.equal(checkout.startAuthorized,true,'actual current production wrapper retains ordinary sandbox path');
  await assertBuyerHasNoPremium(db,buyer);
  await assert.rejects(rpc(buyer,"select public.prepare_native_production_paid_video($1,'revenuecat_app_store','unknown','unknown',99) value",[randomUUID()]));
  assert.equal(await scalar('select checkout_enabled or access_enabled value from private.native_production_checkout_controls'),false);
 }finally{await db.close();}
});
