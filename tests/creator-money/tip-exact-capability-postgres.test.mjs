import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {randomUUID} from 'node:crypto';
import {createDatabase} from '../helpers/database-runtime-authority-fixture.mjs';

test('older cheaper external selection survives exact iOS/Android admission, quote and dispatch; invalid routes never fall back',{timeout:240000},async()=>{
 const {db}=await createDatabase({applyRepair:true,repairInMigrationOrder:true,includeHeldStudio:true,implicitApiGrants:false});
 const one=async(sql,args=[])=>Object.values((await db.query(sql,args)).rows[0])[0];
 try {
  for(const name of ['event-reservation-authority','creator-external-payment-capabilities','creator-external-payment-authority']) await db.exec(fs.readFileSync(`tests/fixtures/${name}.sql`,'utf8'));
  const actors=(await db.query('select * from event_reservation_fixture.actors')).rows;
  const buyer=actors.find(a=>a.kind==='buyer1'),other=actors.find(a=>a.kind==='buyer2'),creator=actors.find(a=>a.kind==='creator');
  for(const platform of ['ios','android']) {
   await db.exec('begin');
   const as=async(role='authenticated',who=buyer)=>{await db.exec('reset role');await db.query("select set_config('request.jwt.claims',$1,false),set_config('request.headers',$2,false)",[JSON.stringify({sub:who.user_id,session_id:who.session_id,role}),JSON.stringify({'x-chillywood-platform':platform})]);await db.exec(`set role ${role}`);};
   const old=randomUUID(),newer=randomUUID(),foreign=randomUUID(),expired=randomUUID(),revoked=randomUUID(),action=randomUUID();
   const clone=async(id,changes={})=>db.query(`insert into private.creator_external_payment_capabilities select (jsonb_populate_record(null::private.creator_external_payment_capabilities,to_jsonb(c)||$1::jsonb)).* from private.creator_external_payment_capabilities c where id='ef000000-0000-4000-8000-000000000001'`,[JSON.stringify({id,platform,storefront:platform==='ios'?'apple_app_store':'google_play',route_kind:platform==='ios'?'external_browser_checkout':'android_external_content_link',created_at:new Date(Date.now()-30000).toISOString(),...changes})]);
   await clone(old);await clone(newer,{created_at:new Date(Date.now()+1000).toISOString()});
   await clone(foreign,{creator_id:other.user_id});
   await clone(expired,{verified_at:new Date(Date.now()-120000).toISOString(),expires_at:new Date(Date.now()-60000).toISOString()});
   await clone(revoked,{revoked_at:new Date().toISOString()});
   if(platform==='android') {
    const program=await one(`insert into private.google_play_external_program_config(package_name,environment,enrollment_evidence,license_test_qualification_evidence,tax_configuration_evidence,reporter_configuration_evidence,native_build_qualification_evidence,verified_at,expires_at,enabled) values('com.chillywood.mobile','test','synthetic','synthetic','synthetic','synthetic','synthetic',now(),now()+interval '1 hour',true) returning id`);
    await db.query('insert into private.google_play_external_capability_program_bindings(capability_id,program_id) select id,$1 from private.creator_external_payment_capabilities where id=any($2::uuid[])',[program,[old,newer,foreign,expired,revoked]]);
   }
   await db.query(`insert into private.creator_external_payment_eligibility(capability_id,buyer_id,session_id,eligibility_evidence,verified_at,expires_at) select id,$1,$2,'synthetic trusted eligibility',now()-interval '1 minute',now()+interval '10 minutes' from private.creator_external_payment_capabilities where id=any($3::uuid[])`,[buyer.user_id,buyer.session_id,[old,newer]]);
   const admit=cap=>platform==='ios'?one("select public.admit_ios_external_session('creator_tip',$1,299,$2,'USA',1,$3)",[creator.user_id,action,cap]):one("select public.admit_google_play_external_session('creator_tip',$1,299,$2,$3,1,$4)",[creator.user_id,action,'synthetic-'+randomUUID(),cap]);
   await as();if(platform==='android'){await admit(old);await admit(newer);}
   const snapshot=await one('select public.get_creator_tip_route_costs($1,299,$2)',[creator.user_id,platform]);
   assert.ok(snapshot.routes.some(r=>r.purchaseBindingId===old),platform+' older admitted candidate');assert.ok(snapshot.routes.some(r=>r.purchaseBindingId===newer));
   await as('service_role');
   for(const r of snapshot.routes)await one('select public.record_creator_tip_route_fee_evidence($1)',[{buyer_id:buyer.user_id,session_id:buyer.session_id,creator_id:creator.user_id,amount_minor:299,currency:'usd',platform,environment:'test',provider:r.provider,purchase_binding_id:r.purchaseBindingId,provider_account_id:r.provider==='stripe_connect'?'acct_fixture':'synthetic-store',qualification_evidence:'synthetic only',fee_evidence:'synthetic only',processor_minor:r.purchaseBindingId===old?10:r.purchaseBindingId===newer?40:80,store_minor:0,platform_minor:0,other_minor:0,buyer_total_minor:299,tax_minor:0,tax_treatment:'not_taxed',fee_base_minor:299,all_unavoidable_fees_included:true,verified_at:new Date().toISOString(),expires_at:new Date(Date.now()+240000).toISOString()}]);
   await as();const selected=await one('select public.select_creator_tip_payment_route($1,$2,299,$3)',[action,creator.user_id,platform]);assert.equal(selected.purchaseBindingId,old);
   assert.equal((await admit(old)).capabilityId,old);
   const exact=()=>one('select public.get_creator_tip_amount_quote($1,299,$2)',[creator.user_id,old]);
   assert.equal((await exact()).capabilityId,old);
   assert.equal((await one('select public.get_creator_tip_amount_quote($1,49,$2)',[creator.user_id,old])).available,false,'exact amount bounds remain enforced');
   assert.equal((await admit(null)).capabilityId,newer,'manual admission remains newest');
   assert.equal((await one('select public.get_creator_tip_amount_quote($1,299)',[creator.user_id])).capabilityId,newer,'manual quote remains newest');
   for(const cap of [foreign,expired,revoked,randomUUID()]) {
    await db.exec('savepoint invalid');await assert.rejects(()=>admit(cap),/unavailable/);await db.exec('rollback to invalid');
    assert.equal((await one('select public.get_creator_tip_amount_quote($1,299,$2)',[creator.user_id,cap])).available,false);
   }
   await as('authenticated',other);assert.equal((await exact()).available,false,'buyer eligibility cannot cross accounts');await as();
   await as('authenticated',{...buyer,session_id:randomUUID()});assert.equal((await exact()).available,false,'stale session cannot quote');await as();
   for(const signature of ['public.get_creator_tip_amount_quote(uuid,integer,uuid)',`public.admit_${platform==='ios'?'ios':'google_play'}_external_session(text,uuid,integer,uuid,text,integer,uuid)`]) {
    for(const role of ['anon','service_role'])assert.equal(await one('select has_function_privilege($1,$2,\'execute\')',[role,signature]),false);
   }
   const tip=randomUUID(),quote={tipId:tip,creatorId:creator.user_id,amountCents:299,currency:'usd',privateNote:null,providerAccountId:'acct_fixture',capabilityId:old,body:{client_reference_id:tip,'metadata[chillywood_tip_id]':tip,'metadata[fan_user_id]':buyer.user_id,'metadata[creator_user_id]':creator.user_id,'line_items[0][price_data][currency]':'usd','line_items[0][price_data][unit_amount]':299,'payment_intent_data[transfer_data][destination]':'acct_fixture','payment_method_types[0]':'card',mode:'payment',expires_at:Math.floor(Date.now()/1000)+3600}};
   let token;
   if(platform==='android') {
    token='synthetic-dispatch-'+randomUUID();
    await one("select public.admit_google_play_external_session('creator_tip',$1,299,$2,$3,1,$4)",[creator.user_id,action,token,old]);
    await db.exec('savepoint reused');await assert.rejects(()=>one("select public.admit_google_play_external_session('creator_tip',$1,299,$2,$3,1,$4)",[creator.user_id,action,token,newer]),/token_reused/);await db.exec('rollback to reused');
   }
   await as('service_role');await one('select public.reserve_creator_tip_checkout_attempt($1,$2,$3,$4)',[buyer.user_id,buyer.session_id,action,quote]);
   if(platform==='android')await one("select public.bind_google_play_external_checkout($1,$2,'creator_tip',$3,$4,1)",[buyer.user_id,buyer.session_id,tip,token]);
   assert.equal((await one('select public.read_creator_tip_checkout_dispatch_authority($1,$2,$3)',[buyer.user_id,buyer.session_id,action])).allowed,true);
   await db.exec('reset role');await db.exec('rollback');
  }
 }finally{await db.close();}
});
