import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createDatabase} from '../helpers/database-runtime-authority-fixture.mjs';
import {seedCurrentEventCommerceCreator} from '../helpers/current-event-commerce-fixture.mjs';

export async function runNativeTipCutoffProof({databaseFactory=null,beforeCutoff=null,diagnostic=()=>{}}={}) {
  const {db}=await createDatabase({applyRepair:true,repairInMigrationOrder:true,includeHeldStudio:true,implicitApiGrants:false,databaseFactory,excludeMigrations:['20261112091500_native_only_tip_admission.sql']});let checks=0;
  const one=async(sql,args=[])=>Object.values((await db.query(sql,args)).rows[0])[0];
  const eq=(a,b,label)=>{assert.deepEqual(a,b,label);checks++;};
  const deny=async(fn,rx)=>{await assert.rejects(fn,rx);checks++;};
  try {
    await db.exec(fs.readFileSync('tests/fixtures/event-reservation-authority.sql','utf8'));
    await db.exec(fs.readFileSync('tests/fixtures/creator-external-payment-capabilities.sql','utf8'));
    await db.exec(fs.readFileSync('tests/fixtures/creator-external-payment-authority.sql','utf8'));
    await seedCurrentEventCommerceCreator(db);
    const actors=(await db.query('select * from event_reservation_fixture.actors')).rows;
    const buyer=actors.find(x=>x.kind==='buyer1'),other=actors.find(x=>x.kind==='buyer2'),host=actors.find(x=>x.kind==='creator');
    await db.exec("select set_config('request.jwt.claims','{\"role\":\"service_role\"}',false)");
    const request='ea000000-0000-4000-8000-000000000001',tip='ea000000-0000-4000-8000-000000000002';
    const quote={tipId:tip,creatorId:host.user_id,amountCents:300,currency:'usd',privateNote:null,providerAccountId:'acct_fixture',capabilityId:'ef000000-0000-4000-8000-000000000001',body:{
      client_reference_id:tip,'metadata[chillywood_tip_id]':tip,'metadata[fan_user_id]':buyer.user_id,
      'metadata[creator_user_id]':host.user_id,'line_items[0][price_data][currency]':'usd','line_items[0][price_data][unit_amount]':300,
      'payment_intent_data[transfer_data][destination]':'acct_fixture','payment_method_types[0]':'card',mode:'payment',success_url:'chillywoodmobile://tip-status?original',expires_at:Math.floor(Date.now()/1000)+3600}};
    const reserve=(id=request,q=quote,actor=buyer)=>one('select public.reserve_creator_tip_checkout_attempt($1,$2,$3,$4)',[actor.user_id,actor.session_id,id,q]);
    const first=await reserve();eq(first.tipId,tip);eq(first.retryAllowed,true);
    const cutoffSQL=fs.readFileSync('supabase/migrations/20261112091500_native_only_tip_admission.sql','utf8');
    if(beforeCutoff) await beforeCutoff({db,cutoffSQL,buyer,other,host,quote,request});
    else await db.exec(cutoffSQL);
    eq((await reserve()).tipId,tip,'exact historical attempt remains readable');
    eq(await one('select public.read_creator_tip_checkout_dispatch_authority($1,$2,$3)',[buyer.user_id,buyer.session_id,request]),
      {allowed:false,reason:'native_tip_checkout_required'},'unknown session has no POST authority');
    const nextTip='ea000000-0000-4000-8000-000000000006';
    await deny(()=>reserve('ea000000-0000-4000-8000-000000000003',{...quote,tipId:nextTip,body:{...quote.body,
      client_reference_id:nextTip,'metadata[chillywood_tip_id]':nextTip,'metadata[fan_user_id]':other.user_id}},other),/native_tip_checkout_required/);
    eq(await one('select count(*)::integer from public.creator_tip_transactions where id=$1',[nextTip]),0,'failed attempt insert rolls back its transaction row');
    eq(await one('select count(*)::integer from private.creator_tip_checkout_attempts where tip_id=$1',[nextTip]),0);
    const receipt=()=>one("select public.record_creator_tip_checkout_session($1,$2,$3,'cs_test_fixture','pi_fixture')",[buyer.user_id,buyer.session_id,request]);
    eq((await receipt()).status,'checkout_started','verified known-session fact remains recordable');
    eq((await reserve()).providerSessionId,'cs_test_fixture');
    eq((await one('select public.read_creator_tip_checkout_dispatch_authority($1,$2,$3)',[buyer.user_id,buyer.session_id,request])).allowed,false,'known session may be read but no payment link authority');
    const webhookAttempt='ea000000-0000-4000-8000-000000000005';
    await one("select public.reserve_stripe_tip_webhook_event('evt_retry_paid','payment_intent.succeeded',repeat('a',64),$1)",[webhookAttempt]);
    const paid=await one("select public.process_stripe_tip_webhook_lifecycle('evt_retry_paid',$1,$2,$3,'{\"metadata\":{}}','{}')",
      [webhookAttempt,tip,{event_livemode:false,object_livemode:false,object_type:'payment_intent',
        object_status:'succeeded',amount_received_cents:300,
        object_id:'pi_fixture',payment_intent_id:'pi_fixture',amount_cents:300,currency:'usd',
        metadata_tip_id:tip,metadata_sender_id:buyer.user_id,metadata_creator_id:host.user_id}]);
    eq(paid.status,'paid','real payment projector accepts the exact checkout transaction');
    eq((await receipt()).status,'paid','late Edge reply cannot downgrade webhook terminal state');
    await one("select public.reserve_stripe_tip_webhook_event('evt_retry_refund','charge.refunded',repeat('b',64),$1)",[webhookAttempt]);
    await one("select public.process_stripe_tip_webhook_lifecycle('evt_retry_refund',$1,$2,$3,'{\"metadata\":{}}','{}')",
      [webhookAttempt,tip,{event_livemode:false,object_livemode:false,object_type:'charge',
        object_id:'ch_fixture',payment_intent_id:'pi_fixture',amount_cents:300,amount_refunded_cents:30,refunded:false,currency:'usd',
        metadata_tip_id:tip,metadata_sender_id:buyer.user_id,metadata_creator_id:host.user_id}]);
    eq(await one('select creator_net_cents from public.creator_tip_transactions where id=$1',[tip]),270,'actual verified partial refund still adjusts creator net');
    eq(await one("select has_function_privilege('authenticated','public.read_creator_tip_checkout_dispatch_authority(uuid,uuid,uuid)','execute')"),false);
    eq(await one("select has_function_privilege('service_role','public.read_creator_tip_checkout_dispatch_authority_pre_native_only(uuid,uuid,uuid)','execute')"),false);
    eq(await one("select relforcerowsecurity from pg_class where oid='private.creator_tip_checkout_attempts'::regclass"),true);
    // Native shared-action admission retains its own exact session guard.
    const nativeAction='ea000000-0000-4000-8000-000000000009';
    const nativeRef='ea000000-0000-4000-8000-000000000010';
    const claim=(session=other.session_id)=>one('select private.claim_creator_tip_action($1,$2,$3,$4,300,\'usd\',\'revenuecat_app_store\',$5)',
      [other.user_id,nativeAction,session,host.user_id,nativeRef]);
    await claim();await claim();
    eq(await one('select provider from private.creator_tip_action_claims where action_id=$1',[nativeAction]),'revenuecat_app_store');
    await deny(()=>claim(buyer.session_id),/tip_action_(session_authority_required|route_conflict)/);
    for(const [platform,provider] of [['ios','app_store'],['android','google_play']]){
      await db.query(`insert into private.creator_tip_route_selections(buyer_id,action_id,session_id,creator_id,amount_minor,platform,route_id,provider,purchase_binding_id)
        values($1,gen_random_uuid(),$2,$3,300,$4,'fixture-native-route',$5,gen_random_uuid())`,[other.user_id,other.session_id,host.user_id,platform,provider]);
    }
    eq(await one('select count(*)::integer from private.creator_tip_route_selections'),2,'native route rows are not intercepted by Stripe-only trigger');
    await deny(()=>db.query(`insert into private.creator_tip_route_selections(buyer_id,action_id,session_id,creator_id,amount_minor,platform,route_id,provider,purchase_binding_id)
      values($1,gen_random_uuid(),$2,$3,300,'web','fixture-external-route','stripe_connect',gen_random_uuid())`,[other.user_id,other.session_id,host.user_id]),/native_tip_checkout_required/);
    diagnostic(`${checks} real SQL assertions passed`);
  } finally {await db.close();}
}
