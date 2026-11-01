import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID,createHmac} from 'node:crypto';
import {createDatabase} from '../helpers/database-runtime-authority-fixture.mjs';
import {load,connect,account,clientFor,payoutsFor} from './stripe-connect-observed-fixture.mjs';
const cashout=load('supabase/functions/_shared/creator-cashout-execution.ts');
const {observeLiveConnectAccount}=load('supabase/functions/_shared/stripe-connect-live-observation.ts',{
 './stripe-connect.ts':connect,'./creator-cashout-execution.ts':cashout,
});
const context={rowId:randomUUID(),creatorId:randomUUID(),accountId:'acct_liveSynthetic',platformAccountId:'acct_platformSynthetic',environment:'live',previousObservedAt:null};
const v1=()=>account({id:context.accountId,livemode:undefined,country:'US',default_currency:'usd',
 requirements:{currently_due:[],past_due:[],eventually_due:[],pending_verification:[],disabled_reason:null},settings:{payouts:{schedule:{interval:'manual'}}}});
const v2=()=>({id:context.accountId,livemode:true,dashboard:'express',defaults:{responsibilities:{fees_collector:'application',losses_collector:'application'}},configuration:{recipient:{capabilities:{stripe_balance:{stripe_transfers:{status:'active'}}}}}});
const provider=(one=v1(),two=v2(),later=two)=>{
 let reads=0; const requests=[];
 const fetch=async(url,options)=>{
  requests.push({url,options});assert.equal(options.method,'GET');assert.equal(options.redirect,'error');
  return Response.json([ {id:context.platformAccountId},two,one,later ][reads++]);
 };return {fetch,requests};
};
test('live observer requires authenticated mode/account agreement and only bounded GETs',async()=>{
 const p=provider();const facts=await observeLiveConnectAccount(context,'rk_live_synthetic',p.fetch);
 assert.equal(p.requests.length,4);assert.equal(facts.configurationStatus,'match');assert.equal(facts.proof.modeVerified,true);
 for(const bad of [{...context,environment:'test'},{...context,accountId:context.platformAccountId}])
  await assert.rejects(()=>observeLiveConnectAccount(bad,'rk_live_synthetic',p.fetch));
 await assert.rejects(()=>observeLiveConnectAccount(context,'sk_test_synthetic',p.fetch));
 for(const bad of [{...v2(),livemode:false},{...v2(),livemode:undefined},{...v2(),id:'acct_other'}])
  await assert.rejects(()=>observeLiveConnectAccount(context,'rk_live_synthetic',provider(v1(),bad).fetch));
 await assert.rejects(()=>observeLiveConnectAccount(context,'rk_live_synthetic',provider({...v1(),livemode:false}).fetch));
 await assert.rejects(()=>observeLiveConnectAccount(context,'rk_live_synthetic',provider(v1(),v2(),{...v2(),dashboard:'none'}).fetch));
 const pending=await observeLiveConnectAccount(context,'rk_live_synthetic',provider({...v1(),requirements:{currently_due:[],past_due:[]}}).fetch);
 assert.equal(pending.proof.requirementsComplete,false);assert.deepEqual(pending.proof.pendingVerification,['unverified']);
 const wrong=v2();wrong.defaults.responsibilities.fees_collector='stripe';
 assert.equal((await observeLiveConnectAccount(context,'rk_live_synthetic',provider(v1(),wrong).fetch)).configurationStatus,'mismatch');
});
test('actual live signed ingress rejects test mode and wrong binding; retries failed observation without financial writes',async()=>{
 let handler,reads=0,records=0,failRead=false;
 const client={from:()=>{const q={select:()=>q,eq:()=>q,maybeSingle:async()=>({data:{creator_user_id:context.creatorId}})};return q;},
  rpc:async(name)=>name==='get_creator_connect_live_observation_context'?{data:context}:{data:{recorded:++records>0}}};
 load('supabase/functions/stripe-connect-live-observation-webhook/index.ts',{
  'jsr:@supabase/functions-js/edge-runtime.d.ts':{},
  '../_shared/stripe-connect.ts':{...connect,createAdminClient:()=>({configured:true,client})},
  '../_shared/creator-cashout-execution.ts':cashout,
  '../_shared/stripe-connect-live-observation.ts':{observeLiveConnectAccount:async(c,key)=>{reads++;if(failRead)throw Error('provider unavailable');return observeLiveConnectAccount(c,key,provider().fetch);}},
 },{Deno:{serve:fn=>handler=fn,env:{get:name=>name==='STRIPE_CASHOUT_LIVE_KEY'?'rk_live_synthetic':'whsec_synthetic'}}});
 const event={id:'evt_synthetic',type:'account.updated',account:context.accountId,livemode:true,data:{object:{id:context.accountId}}};
 const request=async(e,valid=true)=>{const raw=JSON.stringify(e),timestamp=Math.floor(Date.now()/1000);
  const signature=createHmac('sha256','whsec_synthetic').update(`${timestamp}.${raw}`).digest('hex');
  return handler(new Request('https://synthetic.test/function',{method:'POST',body:raw,headers:{'stripe-signature':`t=${timestamp},v1=${valid?signature:'invalid'}`}}));};
 assert.equal((await request(event,false)).status,400);assert.equal(reads,0);
 assert.equal((await request({...event,livemode:false})).status,400);assert.equal(reads,0);
 assert.equal((await request({...event,account:'acct_wrong'})).status,400);assert.equal(reads,0);
 failRead=true;assert.equal((await request(event)).status,503);assert.equal(records,0);
 failRead=false;const response=await request(event);assert.equal(response.status,200);assert.equal(records,1);
 const body=await response.json();assert.equal(body.providerWrite,false);assert.equal(body.payoutExecution,false);
});
test('actual creator live refresh rechecks the current session after GETs before recording',async()=>{
 for(const revoked of [false,true]){
  let handler,authReads=0,records=0;
  const client={rpc:async(name)=>name==='get_creator_connect_live_observation_context'?{data:context}:{data:{recorded:++records>0}}};
  load('supabase/functions/stripe-connect-account-sync/index.ts',{
   'jsr:@supabase/functions-js/edge-runtime.d.ts':{},
   '../_shared/stripe-connect.ts':{...connect,
    createAuthClient:()=>({supabaseAnonKey:'synthetic',supabaseUrl:'https://synthetic.test'}),
    authenticateRequest:async()=>++authReads===2&&revoked?{error:Response.json({error:'session_revoked'},{status:401})}:{user:{id:context.creatorId,email:null}},
    createAdminClient:()=>({configured:true,client}),safeWriteAuditLog:async()=>null,
    readCreatorPayoutAccount:async()=>({provider_environment:'live',provider_account_id:context.accountId}),
   },
   '../_shared/stripe-connect-live-observation.ts':{observeLiveConnectAccount:async(c,key)=>observeLiveConnectAccount(c,key,provider().fetch)},
  },{Deno:{serve:fn=>handler=fn,env:{get:()=> 'rk_live_synthetic'}}});
  const response=await handler(new Request('https://synthetic.test/function',{method:'POST',body:JSON.stringify({creatorUserId:context.creatorId})}));
  assert.equal(authReads,2);assert.equal(response.status,revoked?401:200);assert.equal(records,revoked?0:1);
  if(!revoked){const result=await response.json();assert.equal(result.mode,'live');assert.equal(result.providerWrite,false);assert.equal(result.accountSynced,true);}
 }
});
test('actual SQL live observation CAS preserves holds and never grants financial qualification', {timeout:240000},async()=>{
 const {db}=await createDatabase({applyRepair:true,repairInMigrationOrder:true,includeHeldStudio:true,implicitApiGrants:false});
 const one=async(sql,args=[])=>Object.values((await db.query(sql,args)).rows[0])[0];
 const root=()=>db.exec('reset role');
 const service=()=>db.exec(`reset role;select set_config('request.jwt.claims','{"role":"service_role"}',false);set role service_role`);
 try{
  await db.query(`insert into auth.users(id,is_sso_user,is_anonymous,email_confirmed_at) values($1,false,false,now())`,[context.creatorId]);
  await db.query(`insert into public.creator_payout_accounts(id,creator_user_id,provider,provider_environment,provider_account_id) values($1,$2,'stripe_connect','live',$3)`,[context.rowId,context.creatorId,context.accountId]);
  for(const role of ['anon','authenticated']){
   await db.exec(`set role ${role}`);await assert.rejects(()=>one('select public.get_creator_connect_live_observation_context($1)',[context.creatorId]),/permission denied/);await root();
  }
  await service();await assert.rejects(()=>one('select public.get_creator_connect_live_observation_context($1)',[context.creatorId]),/not_configured/);await root();
  await db.query(`insert into private.creator_connect_live_observation_policy(platform_account_id,enabled) values($1,true)`,[context.platformAccountId]);await service();
  const read=()=>one('select public.get_creator_connect_live_observation_context($1)',[context.creatorId]);
  const record=(c,f)=>one('select public.record_creator_connect_live_observation($1,$2)',[c,f]);
  let c=await read();let facts=await observeLiveConnectAccount(c,'rk_live_synthetic',provider().fetch);
  assert.equal((await record(c,facts)).recorded,true);assert.equal((await record(c,facts)).stale,true);
  await root();
  let summary=await payoutsFor(clientFor(db)).readCreatorPayoutDashboardSummary({creatorUserId:context.creatorId});
  assert.equal(summary.providerReady,true);assert.equal(summary.eligibleForPayouts,false);assert.equal(summary.providerConfigurationStatus,'match');
  await db.query(`update public.creator_payout_eligibility_records set fraud_hold_active=true,eligibility_status='on_hold' where creator_user_id=$1`,[context.creatorId]);
  await service();c=await read();facts=await observeLiveConnectAccount(c,'rk_live_synthetic',provider().fetch);await record(c,facts);await root();
  summary=await payoutsFor(clientFor(db)).readCreatorPayoutDashboardSummary({creatorUserId:context.creatorId});assert.equal(summary.providerReady,false);assert.equal(summary.fraudHoldActive,true);
  await db.query(`update public.creator_payout_eligibility_records set fraud_hold_active=false,eligibility_status='under_review' where creator_user_id=$1`,[context.creatorId]);
  await service();c=await read();
  await assert.rejects(()=>record(c,{...facts,accountId:'acct_other'}),/binding_invalid/);
  await assert.rejects(()=>record(c,{...facts,proof:{...facts.proof,environment:'test'}}),/binding_invalid/);
  await assert.rejects(()=>record(c,{...facts,proof:{...facts.proof,modeVerified:false}}),/binding_invalid/);
  await assert.rejects(()=>record(c,{...facts,readStartedAt:'2020-01-01T00:00:00Z'}),/binding_invalid/);
  await assert.rejects(()=>record({...c,platformAccountId:'acct_other'},facts),/binding_invalid/);
  facts=await observeLiveConnectAccount(c,'rk_live_synthetic',provider({...v1(),requirements:{...v1().requirements,pending_verification:['business_model']}}).fetch);
  await record(c,facts);await root();summary=await payoutsFor(clientFor(db)).readCreatorPayoutDashboardSummary({creatorUserId:context.creatorId});
  assert.equal(summary.providerReady,false);assert.equal(summary.kycReady,false);
  await service();c=await read();facts=await observeLiveConnectAccount(c,'rk_live_synthetic',provider({...v1(),settings:{payouts:{schedule:{interval:'daily'}}}}).fetch);
  await record(c,facts);await root();summary=await payoutsFor(clientFor(db)).readCreatorPayoutDashboardSummary({creatorUserId:context.creatorId});
  assert.equal(summary.providerReady,false,'automatic payout schedule is not qualified manual setup');
  await service();await assert.rejects(()=>db.exec('update private.creator_connect_live_observation_policy set enabled=true'),/permission denied/);await root();
  const resolver=await one("select pg_get_functiondef('private.resolve_creator_external_payment_capability(uuid,uuid,text,uuid,integer,text,text,uuid)'::regprocedure)");
  assert.match(resolver,/recipient.provider_configuration_observed_at>clock_timestamp\(\)-interval '15 minutes'/);
  assert.equal(await one('select count(*)::int from private.creator_cashout_provider_qualifications'),0);
  assert.equal(await one('select count(*)::int from private.creator_external_payment_capabilities'),0);
 }finally{await db.close();}
});
