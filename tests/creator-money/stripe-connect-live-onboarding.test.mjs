import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {load,connect,payoutsFor,clientFor} from './stripe-connect-observed-fixture.mjs';
import {createDatabase} from '../helpers/database-runtime-authority-fixture.mjs';
const cashout=load('supabase/functions/_shared/creator-cashout-execution.ts');
const onboarding=load('supabase/functions/_shared/stripe-connect-live-onboarding.ts',{'./stripe-connect.ts':connect,'./creator-cashout-execution.ts':cashout});
test('app accepts live setup-only responses, sends explicit consent only when reviewed, and still rejects money actions',async()=>{
 let response={mode:'live',liveMoneyAction:false,status:'live_setup_confirmation_required'},body;
 const payouts=payoutsFor({functions:{invoke:async(_name,options)=>{body=options.body;return {data:response,error:null};}}});
 await payouts.createOrReuseCreatorPayoutProviderAccount('synthetic');assert.equal(body.live_setup_disclosure,undefined);
 response={...response,status:'account_created'};
 await payouts.createOrReuseCreatorPayoutProviderAccount('synthetic',true);assert.equal(body.live_setup_disclosure,'distinct-live-account-v1');
 for(const extra of [{liveMoneyAction:true},{transferCreated:true},{payoutCreated:true},{checkoutCreated:true},{mode:'unknown'}]){
  const previous=response;response={...response,...extra};await assert.rejects(()=>payouts.createOrReuseCreatorPayoutProviderAccount('synthetic'));response=previous;
 }
});
test('actual account and hosted-link endpoints use server mode and reject cross-creator/client-account requests',async()=>{
 for(const endpoint of ['stripe-connect-account','stripe-connect-onboarding-link']){
  const user={id:randomUUID(),sessionGeneration:randomUUID(),email:null};let handler,liveCalls=0,testCalls=0,routeStatus='available',routeMode='live',confirmCalls=0;
  const live=async()=>{liveCalls++;return {status:endpoint==='stripe-connect-account'?'account_created':'link_created',mode:'live',liveMoneyAction:false};};
  load(`supabase/functions/${endpoint}/index.ts`,{
   'jsr:@supabase/functions-js/edge-runtime.d.ts':{},
   '../_shared/stripe-connect.ts':{...connect,authenticateRequest:async()=>({user}),
    createAuthClient:()=>({supabaseAnonKey:'synthetic',supabaseUrl:'https://synthetic.test'}),
    createAdminClient:()=>({configured:true,client:{}}),safeWriteAuditLog:async()=>null,
    resolveRedirectUrls:()=>({value:{returnUrl:'chillywoodmobile://ignored',refreshUrl:'chillywoodmobile://ignored'}}),
    readStripeTestSecret:()=>{testCalls++;throw Error('live request cannot use test key');}},
   '../_shared/stripe-connect-live-onboarding.ts':{selectConnectOnboardingRoute:async()=>({mode:routeMode,status:routeStatus}),
    confirmDistinctLiveConnectSetup:async(_client,actualUser,disclosure)=>{assert.equal(actualUser,user);assert.equal(disclosure,'distinct-live-account-v1');confirmCalls++;return {mode:'live',status:'available'};},
    createOrRecoverLiveConnectAccount:live,createLiveConnectHostedLink:live},
  },{Deno:{serve:fn=>handler=fn,env:{get:()=> 'rk_live_synthetic'}}});
  const request=body=>handler(new Request('https://synthetic.test/function',{method:'POST',body:JSON.stringify(body)}));
  assert.equal((await request({creatorUserId:randomUUID()})).status,403);assert.equal(liveCalls,0);
  assert.equal((await request({providerAccountId:'acct_attacker'})).status,400);assert.equal(liveCalls,0);
  const response=await request({creatorUserId:user.id,environment:'test',mode:'test',returnUrl:'https://attacker.invalid'});
  assert.equal(response.status,200);assert.equal((await response.json()).mode,'live');assert.equal(liveCalls,1);assert.equal(testCalls,0);
  if(endpoint==='stripe-connect-account'){
   routeStatus='live_setup_confirmation_required';
   assert.equal((await (await request({creatorUserId:user.id})).json()).status,routeStatus);assert.equal(liveCalls,1);assert.equal(confirmCalls,0);
   await request({creatorUserId:user.id,live_setup_disclosure:'distinct-live-account-v1'});assert.equal(liveCalls,2);assert.equal(confirmCalls,1);
  }
  routeMode='test';routeStatus='creator_onboarding_eligibility_required';
  assert.equal((await (await request({creatorUserId:user.id})).json()).status,routeStatus);
  assert.equal(testCalls,0,'ineligible test fallback must not read a provider key or write');
  routeStatus='not_configured';
  assert.equal((await (await request({creatorUserId:user.id})).json()).status,'not_configured');
  assert.equal(testCalls,0,'ordinary creator cannot fall through to test provider setup');
 }
});
test('live onboarding is dormant, exact-session gated, idempotent and recovers uncertain creation without another POST',{timeout:240000},async()=>{
 const {db}=await createDatabase({applyRepair:true,repairInMigrationOrder:true,includeHeldStudio:true,implicitApiGrants:false});
 const one=async(sql,args=[])=>Object.values((await db.query(sql,args)).rows[0])[0];
 const call=async(name,args)=>{await db.exec(`reset role;select set_config('request.jwt.claims','{"role":"service_role"}',false);set role service_role`);
  try{return {data:await one(`select public.${name}(${Object.keys(args).map((k,i)=>`${k}=>$${i+1}`).join(',')})`,Object.values(args))};}
  catch(error){return {error};}finally{await db.exec('reset role');}};
 const client={rpc:call};
 const users=Array.from({length:7},()=>({id:randomUUID(),sessionGeneration:randomUUID(),email:null}));
 const route=user=>onboarding.selectConnectOnboardingRoute(client,user);
 let account,posts=0,linkPosts=0,loseResponse=false,list=[],listCalls=0,expireSession=false,hostedUrl='https://connect.stripe.com/setup/s/synthetic';
 const transport=async(url,options)=>{
  assert.equal(options.redirect,'error');assert.match(options.headers.Authorization,/rk_live_synthetic/);
  const path=new URL(url).pathname;
  if(path==='/v1/account')return Response.json({object:'account',id:'acct_platformSynthetic',country:'US'});
  if(path==='/v1/accounts'&&options.method==='POST'){
   posts++;const body=options.body;assert.equal(body.get('settings[payouts][schedule][interval]'),'manual');
   assert.equal(body.get('controller[fees][payer]'),'application');assert.equal(body.get('controller[losses][payments]'),'application');
   assert.equal([...body.keys()].some(k=>/tos_acceptance|individual|company|external_account/.test(k)),false);
   assert.match(options.headers['Idempotency-Key'],/^cw-connect-live-create-/);
   account={object:'account',id:`acct_created${posts}`,country:'US',default_currency:'usd',type:'none',
    controller:{type:'application',is_controller:true,fees:{payer:'application'},losses:{payments:'application'},requirement_collection:'stripe',stripe_dashboard:{type:'express'}},
    settings:{payouts:{schedule:{interval:'manual'}}},metadata:Object.fromEntries([...body].filter(([k])=>k.startsWith('metadata[')).map(([k,v])=>[k.slice(9,-1),v]))};
   if(loseResponse)throw Error('lost POST response');return Response.json(account);
  }
  if(path==='/v1/accounts'&&options.method==='GET'){listCalls++;return Response.json(list.shift()??{object:'list',data:[account],has_more:false});}
  if(path.startsWith('/v1/accounts/'))return Response.json(account);
  if(path==='/v1/account_links'){
   linkPosts++;assert.equal(options.body.get('return_url'),'https://app.example.test/channel-studio?payout_setup=return');
   if(expireSession)await db.query("update auth.sessions set not_after=clock_timestamp()-interval '1 second' where id=$1",[users[0].sessionGeneration]);
   return Response.json({object:'account_link',url:hostedUrl,expires_at:Math.floor(Date.now()/1000)+300});
  }
  throw Error(`Unexpected provider request ${options.method} ${path}`);
 };
 try{
  await db.exec("insert into public.wave1_legal_document_versions(document_key,version,market,capability,effective_at) values('payout_terms','onboarding-fixture','UNITED_STATES','payout',now()-interval '1 day') on conflict do nothing");
  for(const user of users){
   await db.query('insert into auth.users(id,email_confirmed_at,is_sso_user,is_anonymous) values($1,now(),false,false)',[user.id]);
   await db.query('insert into auth.sessions(id,user_id) values($1,$2)',[user.sessionGeneration,user.id]);
   await db.query(`insert into public.wave1_legal_acceptances(user_id,subject_hash,document_key,document_version,market,role_key,capability,session_generation,authority_source)
    select $1::uuid,public.wave1_sha256($1::text),document_key,version,market,'member',capability,$2,'service_reconciliation'
    from public.wave1_legal_document_versions where active and market='UNITED_STATES'`,[user.id,user.sessionGeneration]);
   await db.query(`insert into public.wave1_creator_eligibility(creator_user_id,state,account_status,age_18_plus,legal_accepted,creator_role,moderation_state,market,rollout_eligible,platform_capability,provider_eligible,kyc_complete,tax_complete,sanctions_clear,payout_eligible,authority_source,last_operation_key)
    values($1,'PENDING_VERIFICATION','ACTIVE',true,true,true,'CLEAR','UNITED_STATES',true,true,false,false,false,false,false,'synthetic_fixture','onboarding')`,[user.id]);
  }
  assert.equal((await route(users[0])).reason,'live_setup_required','ordinary creator never defaults to a test account');
  await db.query("insert into public.beta_access_memberships(user_id,access_status) values($1,'active')",[users[1].id]);
  assert.equal((await route(users[0])).status,'not_configured','another exact subject tester membership grants nothing');
  await db.query("insert into public.beta_access_memberships(user_id,access_status) values($1,'active')",[users[0].id]);
  assert.deepEqual(await route(users[0]),{mode:'test'},'qualified exact-subject tester retains sandbox setup');
  assert.equal((await route({...users[0],sessionGeneration:users[1].sessionGeneration})).status,'creator_onboarding_eligibility_required','legacy test setup also requires exact current authority');
  await db.query('update public.wave1_creator_eligibility set age_18_plus=false where creator_user_id=$1',[users[0].id]);
  assert.equal((await route(users[0])).status,'creator_onboarding_eligibility_required','test account writes are not an adult/creator bypass');
  await db.query('update public.wave1_creator_eligibility set age_18_plus=true where creator_user_id=$1',[users[0].id]);
  await db.query('update public.wave1_creator_eligibility set creator_role=false where creator_user_id=$1',[users[0].id]);
  assert.equal((await route(users[0])).status,'creator_onboarding_eligibility_required');
  await db.query('update public.wave1_creator_eligibility set creator_role=true where creator_user_id=$1',[users[0].id]);
  await db.query('delete from public.wave1_creator_eligibility where creator_user_id=$1',[users[6].id]);
  assert.equal((await route(users[6])).status,'creator_onboarding_eligibility_required','unknown adult/creator authority fails closed');
  await db.exec(`insert into private.creator_connect_onboarding_policy(environment,platform_account_id,configuration_key,country,currency,return_url,refresh_url,controller_pricing_evidence_hash,hosted_onboarding_evidence_hash,verified_at,expires_at)
   values('live','acct_platformSynthetic','stripe_connect_live_express_recipient_controller_v1','US','usd','https://app.example.test/channel-studio?payout_setup=return','https://app.example.test/channel-studio?payout_setup=refresh',repeat('a',64),repeat('b',64),clock_timestamp(),clock_timestamp()+interval '1 day')`);
  assert.equal((await route(users[0])).status,'not_configured');assert.equal(posts,0);
  await db.exec('update private.creator_connect_onboarding_policy set enabled=true');
  assert.equal((await route(users[0])).status,'available','onboarding does not circularly require completed provider KYC/tax');
  for(const [field,value] of [['age_18_plus',false],['legal_accepted',false],['creator_role',false],['rollout_eligible',false]]){
   await db.query(`update public.wave1_creator_eligibility set ${field}=$2 where creator_user_id=$1`,[users[0].id,value]);
   assert.equal((await route(users[0])).status,'creator_onboarding_eligibility_required');
   await db.query(`update public.wave1_creator_eligibility set ${field}=true where creator_user_id=$1`,[users[0].id]);
  }
  assert.equal((await route({...users[0],sessionGeneration:users[1].sessionGeneration})).status,'creator_onboarding_eligibility_required');
  await assert.rejects(()=>onboarding.createOrRecoverLiveConnectAccount(client,users[0],'sk_test_synthetic',transport));assert.equal(posts,0);
  const created=await onboarding.createOrRecoverLiveConnectAccount(client,users[0],'rk_live_synthetic',transport);
  assert.equal(created.status,'account_created');assert.equal(posts,1);
  assert.equal((await onboarding.createOrRecoverLiveConnectAccount(client,users[0],'rk_live_synthetic',transport)).status,'account_reused');assert.equal(posts,1);
  assert.deepEqual(await one('select jsonb_build_array(provider_ready,kyc_ready,eligible_for_payouts) from public.creator_payout_eligibility_records where creator_user_id=$1',[users[0].id]),[false,false,false]);
  const link=await onboarding.createLiveConnectHostedLink(client,users[0],'rk_live_synthetic',transport);assert.equal(link.status,'link_created');assert.equal(link.onboardingUrlStored,false);
  assert.equal(await one("select count(*)::int from private.creator_connect_hosted_link_requests where to_jsonb(creator_connect_hosted_link_requests)::text like '%connect.stripe.com%'"),0);
  hostedUrl='https://attacker.invalid/setup/secret';await assert.rejects(()=>onboarding.createLiveConnectHostedLink(client,users[0],'rk_live_synthetic',transport),/hosted_link_invalid/);hostedUrl='https://connect.stripe.com/setup/s/synthetic';
  expireSession=true;await assert.rejects(()=>onboarding.createLiveConnectHostedLink(client,users[0],'rk_live_synthetic',transport),/authority_changed/);expireSession=false;
  // A response lost after actual creation consumes the durable dispatch; later
  // calls only enumerate/read and bind the exact metadata-matched account.
  loseResponse=true;assert.equal((await onboarding.createOrRecoverLiveConnectAccount(client,users[1],'rk_live_synthetic',transport)).status,'creation_pending');assert.equal(posts,2);
  loseResponse=false;assert.equal((await onboarding.createOrRecoverLiveConnectAccount(client,users[1],'rk_live_synthetic',transport)).status,'account_created');assert.equal(posts,2);assert.equal(listCalls,1);
  // Missing result on complete enumeration is unresolved, never a fresh POST.
  loseResponse=true;await onboarding.createOrRecoverLiveConnectAccount(client,users[2],'rk_live_synthetic',transport);loseResponse=false;
  list=[{object:'list',data:[],has_more:false}];assert.equal((await onboarding.createOrRecoverLiveConnectAccount(client,users[2],'rk_live_synthetic',transport)).status,'creation_pending');assert.equal(posts,3);
  // Conflicting recovered accounts quarantine rather than choosing one.
  list=[{object:'list',data:[account,{...account,id:'acct_duplicate'}],has_more:false}];
  assert.equal((await onboarding.createOrRecoverLiveConnectAccount(client,users[2],'rk_live_synthetic',transport)).status,'account_migration_review_required');
  assert.equal(await one('select state from private.creator_connect_account_creation where creator_id=$1',[users[2].id]),'review_required');assert.equal(posts,3);
  await db.query("insert into public.creator_payout_accounts(creator_user_id,provider,provider_environment,provider_account_id) values($1,'stripe_connect','test','acct_existingTest')",[users[3].id]);
  assert.equal((await route(users[3])).status,'live_setup_confirmation_required');
  assert.equal((await onboarding.createOrRecoverLiveConnectAccount(client,users[3],'rk_live_synthetic',transport)).status,'live_setup_confirmation_required');assert.equal(posts,3);
  const consentArgs={p_creator:users[3].id,p_session:users[3].sessionGeneration,p_disclosure:'distinct-live-account-v1'};
  assert.ok((await call('confirm_creator_connect_live_setup',{...consentArgs,p_disclosure:'unreviewed'})).error);
  assert.equal((await call('confirm_creator_connect_live_setup',{...consentArgs,p_session:users[4].sessionGeneration})).data.status,'creator_onboarding_eligibility_required');
  assert.equal((await call('confirm_creator_connect_live_setup',consentArgs)).data.status,'available');
  await db.exec("update private.creator_connect_onboarding_policy set hosted_onboarding_evidence_hash=repeat('c',64)");
  assert.equal((await route(users[3])).status,'live_setup_confirmation_required','policy edits invalidate prior setup consent');
  assert.equal((await call('confirm_creator_connect_live_setup',consentArgs)).data.status,'available');
  assert.equal(await one('select count(*)::int from private.creator_connect_live_setup_consents where creator_id=$1',[users[3].id]),2,'both immutable review receipts remain');
  await assert.rejects(()=>db.query('delete from private.creator_connect_live_setup_consents where creator_id=$1',[users[3].id]),/connect_binding_history_immutable/);
  const originalTest=await one("select id from public.creator_payout_accounts where creator_user_id=$1 and provider_environment='test'",[users[3].id]);
  await db.query("update public.creator_payout_eligibility_records set tax_ready=true,hold_period_cleared=true,minimum_payout_met=true,admin_review_status='approved_later',fraud_hold_active=true,metadata=metadata||'{\"test_tax_proof\":true}'::jsonb where creator_user_id=$1",[users[3].id]);
  assert.equal((await onboarding.createOrRecoverLiveConnectAccount(client,users[3],'rk_live_synthetic',transport)).status,'account_created');assert.equal(posts,4);
  const liveId=await one("select id from public.creator_payout_accounts where creator_user_id=$1 and provider_environment='live'",[users[3].id]);
  assert.notEqual(liveId,originalTest);
  assert.deepEqual(await one("select jsonb_build_array(tax_ready,hold_period_cleared,minimum_payout_met,admin_review_status,metadata?'test_tax_proof') from public.creator_payout_eligibility_records where creator_user_id=$1",[users[3].id]),[false,false,false,'not_started',false]);
  assert.equal(await one('select fraud_hold_active from public.creator_payout_eligibility_records where creator_user_id=$1',[users[3].id]),true,'negative creator hold survives the account switch');
  assert.equal((await connect.readCreatorPayoutAccount(clientFor(db),users[3].id)).id,liveId);
  assert.equal((await connect.readCreatorPayoutAccountByProviderId(clientFor(db),'acct_existingTest')).id,originalTest);
  assert.deepEqual(await one("select jsonb_build_array(id,provider_account_id) from public.creator_payout_accounts where creator_user_id=$1 and provider_environment='test'",[users[3].id]),[originalTest,'acct_existingTest']);
  assert.equal(await one('select count(*)::int from private.creator_connect_mode_bindings where creator_id=$1',[users[3].id]),2);
  await assert.rejects(()=>db.query("update private.creator_connect_mode_bindings set provider_account_id='acct_other' where creator_id=$1",[users[3].id]),/connect_binding_history_immutable/);
  // Delayed old-mode callbacks can refresh their own row, never current live readiness.
  await db.query("update public.creator_payout_accounts set details_submitted=true,payouts_enabled=true,last_provider_sync_at=clock_timestamp() where id=$1",[originalTest]);
  assert.equal(await one('select payout_account_id from public.creator_payout_eligibility_records where creator_user_id=$1',[users[3].id]),liveId);
  assert.deepEqual(await one('select jsonb_build_array(provider_ready,kyc_ready,eligible_for_payouts) from public.creator_payout_eligibility_records where creator_user_id=$1',[users[3].id]),[false,false,false]);
  await assert.rejects(()=>db.query("update public.creator_payout_accounts set provider_account_id='acct_replacedTest' where id=$1",[originalTest]),/connect_account_binding_immutable/);
  assert.equal((await onboarding.createLiveConnectHostedLink(client,users[3],'rk_live_synthetic',transport)).status,'link_created');
  loseResponse=true;await onboarding.createOrRecoverLiveConnectAccount(client,users[4],'rk_live_synthetic',transport);loseResponse=false;
  list=Array.from({length:5},(_,i)=>({object:'list',data:[{id:`acct_history${i}`,metadata:{}}],has_more:true}));
  const previousReads=listCalls;
  assert.equal((await onboarding.createOrRecoverLiveConnectAccount(client,users[4],'rk_live_synthetic',transport)).status,'creation_pending');
  assert.equal(listCalls-previousReads,5);assert.equal(posts,5);
  assert.equal(await one('select recovery_cursor from private.creator_connect_account_creation where creator_id=$1',[users[4].id]),'acct_history4');
  assert.equal((await onboarding.createOrRecoverLiveConnectAccount(client,users[4],'rk_live_synthetic',transport)).status,'account_created');assert.equal(posts,5);
  // SQL dispatch is single-owner; this is serial PGlite CAS evidence, not a
  // substitute for hosted PostgreSQL concurrent-session verification.
  const reserve=await call('reserve_creator_connect_account_creation',{p_creator:users[5].id,p_session:users[5].sessionGeneration});
  const claimArgs={p_creator:users[5].id,p_session:users[5].sessionGeneration,p_attempt:reserve.data.attemptId};
  assert.equal((await call('claim_creator_connect_account_creation',claimArgs)).data.claimed,true);
  assert.equal((await call('claim_creator_connect_account_creation',claimArgs)).data.claimed,false);
  await db.query('update public.wave1_legal_acceptances set invalidated_at=clock_timestamp() where user_id=$1',[users[6].id]);
  assert.equal((await route(users[6])).status,'creator_onboarding_eligibility_required');
  await db.exec("update private.creator_connect_onboarding_policy set verified_at=clock_timestamp()-interval '2 days',expires_at=clock_timestamp()-interval '1 day'");
  assert.equal((await route(users[5])).status,'not_configured');
  assert.equal(await one('select count(*)::int from private.creator_cashout_provider_qualifications'),0);
  assert.equal(await one("select state from public.platform_money_kill_switches where key='live_money_enabled'"),'off');
  for(const role of ['anon','authenticated']){await db.exec(`set role ${role}`);await assert.rejects(()=>one('select public.reserve_creator_connect_account_creation($1,$2)',[users[4].id,users[4].sessionGeneration]),/permission denied/);await assert.rejects(()=>one('select public.confirm_creator_connect_live_setup($1,$2,$3)',[users[3].id,users[3].sessionGeneration,'distinct-live-account-v1']),/permission denied/);await db.exec('reset role');}
 }finally{await db.close();}
});
