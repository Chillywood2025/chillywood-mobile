import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {randomUUID} from 'node:crypto';
import {createDatabase} from '../helpers/database-runtime-authority-fixture.mjs';

for(const implicitApiGrants of [false,true]) test(`iOS exact storefront observation admission retains qualification and session guards (${implicitApiGrants})`,{timeout:240000},async()=>{
  const {db}=await createDatabase({includeHeldStudio:true,applyRepair:true,repairInMigrationOrder:true,implicitApiGrants});
  const one=async(sql,args=[])=>Object.values((await db.query(sql,args)).rows[0])[0];
  try {
    for(const name of ['event-reservation-authority','creator-external-payment-capabilities','creator-external-payment-authority'])
      await db.exec(fs.readFileSync(`tests/fixtures/${name}.sql`,'utf8'));
    const actors=(await db.query('select * from event_reservation_fixture.actors')).rows;
    const buyer=actors.find(a=>a.kind==='buyer1'),creator=actors.find(a=>a.kind==='creator');
    await db.query("select set_config('request.jwt.claims',$1,false)",[JSON.stringify({role:'authenticated',sub:buyer.user_id,session_id:buyer.session_id})]);
    const source=randomUUID();
    const admit=(country='USA',amount=237)=>one("select public.admit_ios_external_session('creator_tip',$1,$2,$3,$4,1)",[creator.user_id,amount,source,country]);
    await assert.rejects(()=>admit(),/qualified_route_unavailable/,'SDK alone does not configure provider');
    const cap=randomUUID();
    await db.query(`insert into private.creator_external_payment_capabilities
      select (jsonb_populate_record(null::private.creator_external_payment_capabilities,to_jsonb(c)||$1::jsonb)).*
      from private.creator_external_payment_capabilities c limit 1`,[JSON.stringify({id:cap,storefront:'apple_app_store'})]);
    await assert.rejects(()=>admit('CAN'),/storefront_observation_required/);
    await assert.rejects(()=>admit('US'),/storefront_observation_required/,'native API requires ISOalpha3');
    await assert.rejects(()=>admit('USA',49),/qualified_route_unavailable/);
    const result=await admit();assert.equal(result.capabilityId,cap);
    assert.equal(result.verification,'native_storefront_observation_unverified');
    assert.equal(result.accessGranted,false);assert.equal(result.financialAuthority,false);
    assert.equal((await one("select private.resolve_creator_external_payment_capability($1,$2,'creator_tip',$3,237,'usd','test',$4)",[buyer.user_id,buyer.session_id,creator.user_id,cap])).platform,'ios');
    await assert.rejects(()=>one("select private.resolve_creator_external_payment_capability($1,$2,'creator_tip',$3,238,'usd','test',$4)",[buyer.user_id,buyer.session_id,creator.user_id,cap]),/capability_unavailable/);
    const catalogs=(await db.query("select relrowsecurity,relforcerowsecurity from pg_class where oid='private.ios_external_storefront_observations'::regclass")).rows[0];
    assert.deepEqual(catalogs,{relrowsecurity:true,relforcerowsecurity:true});
    assert.equal(await one("select has_table_privilege('authenticated','private.ios_external_storefront_observations','select')"),false);
    assert.equal(await one("select has_function_privilege('anon','public.admit_ios_external_session(text,uuid,integer,uuid,text,integer)','execute')"),false);
    assert.equal(await one("select has_function_privilege('service_role','public.admit_ios_external_session(text,uuid,integer,uuid,text,integer)','execute')"),false);
    await assert.rejects(()=>one("select public.admit_ios_external_session('event_auction',$1,237,$2,'USA',1)",[creator.user_id,randomUUID()]),/source_invalid/);
    await assert.rejects(()=>one("select public.admit_ios_external_session('creator_tip',$1,237,$2,'USA',1)",[buyer.user_id,source]),/storefront_observation_required/);
    await assert.rejects(()=>db.query("update private.ios_external_storefront_observations set amount_minor=238"),/observation_immutable/);
    await assert.rejects(()=>db.query("delete from private.ios_external_storefront_observations"),/observation_immutable/);
    await db.query("select set_config('request.jwt.claims',$1,false)",[JSON.stringify({role:'authenticated',sub:buyer.user_id,session_id:randomUUID()})]);
    await assert.rejects(()=>admit(),/buyer_authority_required/);
    await db.query("select set_config('request.jwt.claims',$1,false)",[JSON.stringify({role:'authenticated',sub:buyer.user_id,session_id:buyer.session_id})]);
    for(let n=1;n<10;n++) await admit();
    await assert.rejects(()=>admit(),/observation_rate_limited/);
    // A different authenticated buyer/session cannot reuse the first buyer's
    // immutable native observation, even with the same globally qualified route.
    const other=actors.find(a=>a.kind==='buyer2');
    await db.query("select set_config('request.jwt.claims',$1,false)",[JSON.stringify({role:'authenticated',sub:other.user_id,session_id:other.session_id})]);
    await assert.rejects(()=>one("select private.resolve_creator_external_payment_capability($1,$2,'creator_tip',$3,237,'usd','test',$4)",[other.user_id,other.session_id,creator.user_id,cap]),/capability_unavailable/);
    await db.query('update private.creator_external_payment_capabilities set revoked_at=clock_timestamp() where id=$1',[cap]);
    await assert.rejects(()=>admit(),/qualified_route_unavailable/);
  } finally {await db.close();}
});

test('iOS final-thirty-minute admission resumes bound checkout but cannot create a short new checkout',{timeout:240000},async()=>{
  const realDateNow=Date.now;
  const {db}=await createDatabase({includeHeldStudio:true,applyRepair:true,repairInMigrationOrder:true,implicitApiGrants:false});
  const one=async(sql,args=[])=>Object.values((await db.query(sql,args)).rows[0])[0];
  try {
    for(const name of ['event-reservation-authority','creator-external-payment-capabilities','creator-external-payment-authority'])
      await db.exec(fs.readFileSync(`tests/fixtures/${name}.sql`,'utf8'));
    const actors=(await db.query('select * from event_reservation_fixture.actors')).rows;
    const buyer=actors.find(a=>a.kind==='buyer1'),other=actors.find(a=>a.kind==='buyer2'),creator=actors.find(a=>a.kind==='creator');
    const cap=randomUUID(),request=randomUUID(),tip=randomUUID();
    await db.query(`insert into private.creator_external_payment_capabilities
      select (jsonb_populate_record(null::private.creator_external_payment_capabilities,to_jsonb(c)||jsonb_build_object(
        'id',$1::text,'storefront','apple_app_store','expires_at',clock_timestamp()+interval '45 minutes'))).*
      from private.creator_external_payment_capabilities c limit 1`,[cap]);
    const asBuyer=async(actor)=>db.query("select set_config('request.jwt.claims',$1,false)",[JSON.stringify({role:'authenticated',sub:actor.user_id,session_id:actor.session_id})]);
    const service=async()=>db.query("select set_config('request.jwt.claims','{\"role\":\"service_role\"}',false)");
    const admit=()=>one("select public.admit_ios_external_session('creator_tip',$1,237,$2,'USA',1)",[creator.user_id,request]);
    await asBuyer(buyer);assert.equal((await admit()).capabilityId,cap);
    const quote=(actor,id)=>({tipId:id,creatorId:creator.user_id,amountCents:237,currency:'usd',providerAccountId:'acct_fixture',capabilityId:cap,body:{
      client_reference_id:id,'metadata[chillywood_tip_id]':id,'metadata[fan_user_id]':actor.user_id,
      'metadata[creator_user_id]':creator.user_id,'line_items[0][price_data][currency]':'usd',
      'line_items[0][price_data][unit_amount]':237,'payment_intent_data[transfer_data][destination]':'acct_fixture',
      'payment_method_types[0]':'card',mode:'payment',expires_at:Math.floor(Date.now()/1000)+2400}});
    const original=quote(buyer,tip);
    await service();
    await one('select public.reserve_creator_tip_checkout_attempt($1,$2,$3,$4)',[buyer.user_id,buyer.session_id,request,original]);
    await one("select public.record_creator_tip_checkout_session($1,$2,$3,'cs_test_IosResume','pi_IosResume')",[buyer.user_id,buyer.session_id,request]);
    const before=await one('select extract(epoch from clock_timestamp())');
    Date.now=()=>realDateNow()+20*60*1000;
    assert.ok(Number(await one('select extract(epoch from clock_timestamp())'))-Number(before)>=1199,'only disposable PGlite clock advances');
    await asBuyer(buyer);
    const refreshed=await admit();assert.equal(refreshed.capabilityId,cap);
    assert.ok(Date.parse(refreshed.expiresAt)<=Date.now()+121000);
    await service();
    const resumed=await one('select public.reserve_creator_tip_checkout_attempt($1,$2,$3,$4)',[buyer.user_id,buyer.session_id,request,original]);
    assert.equal(resumed.providerSessionId,'cs_test_IosResume');assert.equal(resumed.retryAllowed,true);
    assert.deepEqual(resumed.body,original.body,'same provider body and session are retained');
    assert.equal((await one('select public.read_creator_tip_checkout_dispatch_authority($1,$2,$3)',[buyer.user_id,buyer.session_id,request])).allowed,true);
    await asBuyer(other);await admit();await service();
    await assert.rejects(()=>one('select public.reserve_creator_tip_checkout_attempt($1,$2,$3,$4)',[other.user_id,other.session_id,randomUUID(),quote(other,randomUUID())]),/tip_checkout_quote_invalid/,'new checkout still cannot fit provider minimum before route expiry');
    await db.query('update private.creator_external_payment_capabilities set revoked_at=clock_timestamp() where id=$1',[cap]);
    assert.equal((await one('select public.read_creator_tip_checkout_dispatch_authority($1,$2,$3)',[buyer.user_id,buyer.session_id,request])).allowed,false,'revocation still blocks the existing URL');
  } finally {Date.now=realDateNow;await db.close();}
});
